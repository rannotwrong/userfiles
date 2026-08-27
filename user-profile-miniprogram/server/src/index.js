import "dotenv/config";
import express from "express";
import cors from "cors";
import { exchangeWechatCode } from "./wechat.js";
import { createSessionToken, verifySessionToken } from "./session.js";
import { supabase } from "./supabase.js";
import {
  fromDbAudienceUser,
  toDbAudienceUser,
  toDbAudienceUserPatch,
  validateAudienceUser
} from "./audienceUsers.js";
import {
  fromDbLiveRecord,
  parseLiveRecordText,
  toDbLiveRecord,
  validateLiveRecord
} from "./liveRecords.js";
import { recognizeLiveRecordImageWithDoubao } from "./doubaoVision.js";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "14mb" }));

function publicUser(row) {
  return {
    id: row.id,
    displayName: row.display_name || "微信用户",
    avatarUrl: row.avatar_url || "",
    wechatLinked: Boolean(row.wechat_openid)
  };
}

async function findOrCreateWechatUser({ openid, unionid, appVersion, releaseChannel }) {
  const { data: existing, error: findError } = await supabase
    .from("wechat_users")
    .select("*")
    .eq("wechat_openid", openid)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) {
    await supabase
      .from("wechat_users")
      .update({
        wechat_unionid: unionid || existing.wechat_unionid,
        last_login_at: new Date().toISOString(),
        last_app_version: appVersion || existing.last_app_version,
        last_release_channel: releaseChannel || existing.last_release_channel
      })
      .eq("id", existing.id);
    return existing;
  }

  const { data: created, error: createError } = await supabase
    .from("wechat_users")
    .insert({
      wechat_openid: openid,
      wechat_unionid: unionid,
      display_name: "微信用户",
      last_app_version: appVersion || "unknown",
      last_release_channel: releaseChannel || "unknown",
      last_login_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (createError) throw createError;
  return created;
}

async function requireSession(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
      res.status(401).json({ message: "未登录" });
      return;
    }

    const payload = verifySessionToken(token);
    const { data: user, error } = await supabase
      .from("wechat_users")
      .select("*")
      .eq("id", payload.sub)
      .maybeSingle();

    if (error) throw error;
    if (!user) {
      res.status(401).json({ message: "登录态已失效" });
      return;
    }

    req.currentUser = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "登录态已过期，请重新登录" });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "user-profile-miniprogram-server" });
});

app.post("/api/auth/wechat-login", async (req, res) => {
  try {
    const { code, appVersion, releaseChannel } = req.body || {};
    const wechatSession = await exchangeWechatCode(code);
    const user = await findOrCreateWechatUser({
      openid: wechatSession.openid,
      unionid: wechatSession.unionid,
      appVersion,
      releaseChannel
    });
    const session = createSessionToken(user);

    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      user: publicUser(user)
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "微信登录失败" });
  }
});

app.get("/api/me", requireSession, (req, res) => {
  res.json({
    user: publicUser(req.currentUser)
  });
});

app.get("/api/audience-users", requireSession, async (req, res) => {
  try {
    const { tier = "", keyword = "" } = req.query || {};
    let query = supabase
      .from("wechat_audience_users")
      .select("*")
      .eq("owner_id", req.currentUser.id)
      .order("updated_at", { ascending: false });

    if (tier && ["S", "A", "B", "C"].includes(tier)) {
      query = query.eq("tier", tier);
    }
    if (keyword) {
      query = query.ilike("nickname", `%${keyword}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      users: (data || []).map(fromDbAudienceUser)
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "读取用户档案失败" });
  }
});

app.post("/api/audience-users", requireSession, async (req, res) => {
  try {
    const validationMessage = validateAudienceUser(req.body);
    if (validationMessage) {
      res.status(400).json({ message: validationMessage });
      return;
    }

    const payload = toDbAudienceUser(req.body, req.currentUser.id);
    const { data, error } = await supabase
      .from("wechat_audience_users")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    res.status(201).json({
      user: fromDbAudienceUser(data)
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "新增用户档案失败" });
  }
});

app.patch("/api/audience-users/:id", requireSession, async (req, res) => {
  try {
    const validationMessage = Object.prototype.hasOwnProperty.call(req.body, "nickname")
      ? validateAudienceUser({ nickname: req.body.nickname, tier: req.body.tier })
      : validateAudienceUser({ nickname: "占位昵称", tier: req.body.tier });
    if (validationMessage) {
      res.status(400).json({ message: validationMessage });
      return;
    }

    const { data: existing, error: existingError } = await supabase
      .from("wechat_audience_users")
      .select("*")
      .eq("id", req.params.id)
      .eq("owner_id", req.currentUser.id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) {
      res.status(404).json({ message: "用户档案不存在" });
      return;
    }

    const patch = toDbAudienceUserPatch(req.body);
    if ("manual_tags" in patch || "auto_tags" in patch) {
      const manualTags = patch.manual_tags || existing.manual_tags || [];
      const autoTags = patch.auto_tags || existing.auto_tags || [];
      patch.tags = [...new Set([...manualTags, ...autoTags])];
    }

    const { data, error } = await supabase
      .from("wechat_audience_users")
      .update(patch)
      .eq("id", req.params.id)
      .eq("owner_id", req.currentUser.id)
      .select("*")
      .single();

    if (error) throw error;

    res.json({
      user: fromDbAudienceUser(data)
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "更新用户档案失败" });
  }
});

app.get("/api/live-records", requireSession, async (req, res) => {
  try {
    const { startDate = "", endDate = "" } = req.query || {};
    let query = supabase
      .from("wechat_live_records")
      .select("*")
      .eq("owner_id", req.currentUser.id)
      .order("live_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (startDate) query = query.gte("live_date", startDate);
    if (endDate) query = query.lte("live_date", endDate);

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      records: (data || []).map(fromDbLiveRecord)
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "读取直播记录失败" });
  }
});

app.post("/api/live-records/ocr", requireSession, async (req, res) => {
  try {
    const { text = "", imageBase64 = "", mimeType = "image/png" } = req.body || {};

    if (imageBase64) {
      const recognition = await recognizeLiveRecordImageWithDoubao({
        imageBase64,
        mimeType,
        text
      });
      res.json({
        ...recognition,
        message: "已通过豆包识别图片并提取直播记录。"
      });
      return;
    }

    const parsed = parseLiveRecordText(text);

    res.json({
      ocrText: text,
      fields: parsed,
      provider: "text-parser",
      recognitionPayload: {
        provider: "text-parser"
      },
      message: "已根据文字描述提取关键信息。"
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "识别直播记录失败" });
  }
});

app.post("/api/live-records", requireSession, async (req, res) => {
  try {
    const validationMessage = validateLiveRecord(req.body);
    if (validationMessage) {
      res.status(400).json({ message: validationMessage });
      return;
    }

    if (req.body.audienceUserId) {
      const { data: user, error: userError } = await supabase
        .from("wechat_audience_users")
        .select("id")
        .eq("id", req.body.audienceUserId)
        .eq("owner_id", req.currentUser.id)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) {
        res.status(404).json({ message: "关联用户档案不存在" });
        return;
      }
    }

    const payload = toDbLiveRecord(req.body, req.currentUser.id);
    const { data, error } = await supabase
      .from("wechat_live_records")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;

    res.status(201).json({
      record: fromDbLiveRecord(data)
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "保存直播记录失败" });
  }
});

app.listen(port, () => {
  console.log(`User Atlas miniprogram server listening on ${port}`);
});
