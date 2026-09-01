import "dotenv/config";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
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
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("当前来源不在允许列表中"));
  }
}));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "8mb" }));
app.use((req, res, next) => {
  req.requestId = req.get("x-request-id") || randomUUID();
  res.set("x-request-id", req.requestId);
  res.set("x-content-type-options", "nosniff");
  res.set("referrer-policy", "no-referrer");
  res.set("cache-control", "no-store");
  next();
});

function createRateLimiter({ windowMs, max, message }) {
  const attempts = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of attempts.entries()) {
      if (value.resetAt <= now) attempts.delete(key);
    }
  }, windowMs);
  cleanup.unref();

  return (req, res, next) => {
    const actor = req.currentUser?.id || req.get("x-wx-openid") || req.ip;
    const key = `${actor}:${req.path}`;
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    current.count += 1;
    if (current.count > max) {
      res.status(429).json({ message, requestId: req.requestId });
      return;
    }
    next();
  };
}

const loginRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT || 30),
  message: "登录请求过于频繁，请稍后再试"
});
const ocrRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.OCR_RATE_LIMIT || 20),
  message: "图片识别请求过于频繁，请稍后再试"
});

function sendServerError(req, res, error, fallbackMessage) {
  console.error(`[${req.requestId}]`, error);
  res.status(500).json({
    message: fallbackMessage,
    requestId: req.requestId
  });
}

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

app.post("/api/auth/wechat-login", loginRateLimit, async (req, res) => {
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
    res.status(400).json({
      message: error.message || "微信登录失败",
      requestId: req.requestId
    });
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
      .order("updated_at", { ascending: false })
      .limit(500);

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
    sendServerError(req, res, error, "读取用户档案失败");
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
    sendServerError(req, res, error, "新增用户档案失败");
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
    sendServerError(req, res, error, "更新用户档案失败");
  }
});

app.delete("/api/audience-users/:id", requireSession, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("wechat_audience_users")
      .delete()
      .eq("id", req.params.id)
      .eq("owner_id", req.currentUser.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ message: "用户档案不存在" });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    sendServerError(req, res, error, "删除用户档案失败");
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
      .order("created_at", { ascending: false })
      .limit(100);

    if (startDate) query = query.gte("live_date", startDate);
    if (endDate) query = query.lte("live_date", endDate);

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      records: (data || []).map(fromDbLiveRecord)
    });
  } catch (error) {
    sendServerError(req, res, error, "读取直播记录失败");
  }
});

app.post("/api/live-records/ocr", requireSession, ocrRateLimit, async (req, res) => {
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
    sendServerError(req, res, error, "识别直播记录失败");
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
    sendServerError(req, res, error, "保存直播记录失败");
  }
});

app.delete("/api/live-records/:id", requireSession, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("wechat_live_records")
      .delete()
      .eq("id", req.params.id)
      .eq("owner_id", req.currentUser.id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ message: "直播记录不存在" });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    sendServerError(req, res, error, "删除直播记录失败");
  }
});

app.delete("/api/account", requireSession, async (req, res) => {
  try {
    if (req.body?.confirmation !== "DELETE") {
      res.status(400).json({ message: "请确认删除账号" });
      return;
    }

    const { error } = await supabase
      .from("wechat_users")
      .delete()
      .eq("id", req.currentUser.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (error) {
    sendServerError(req, res, error, "删除账号失败");
  }
});

app.use((error, req, res, _next) => {
  if (error?.type === "entity.too.large") {
    res.status(413).json({
      message: "上传内容过大，请压缩图片后重试",
      requestId: req.requestId
    });
    return;
  }
  if (error?.message === "当前来源不在允许列表中") {
    res.status(403).json({ message: error.message, requestId: req.requestId });
    return;
  }
  sendServerError(req, res, error, "服务暂时不可用");
});

app.listen(port, () => {
  console.log(`User Atlas miniprogram server listening on ${port}`);
});
