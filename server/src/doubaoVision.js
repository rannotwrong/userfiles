import { mergeLiveSummary } from "./liveRecordParser.js";

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";
const DEFAULT_MODEL = "doubao-seed-1-8-251228";

function normalizeBase64Image(imageBase64, mimeType = "image/png") {
  const value = String(imageBase64 || "").trim();
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;
  return `data:${mimeType || "image/png"};base64,${value}`;
}

function extractTextFromResponse(payload = {}) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .map((content) => content.text || content.output_text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseJsonText(text) {
  const source = String(text || "").trim();
  if (!source) return {};
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || source.match(/\{[\s\S]*\}/)?.[0] || source;
  try {
    return JSON.parse(candidate);
  } catch {
    return {};
  }
}

function normalizeRecognitionPayload(json = {}, rawText = "") {
  const mergedSummary = mergeLiveSummary({
    date: json.date,
    revenue: json.revenue,
    giftUsers: json.giftUsers,
    thousandTicketUsers: json.thousandTicketUsers,
    newGiftUsers: json.newGiftUsers,
    score: json.score
  }, rawText);
  const summary = {
    ...mergedSummary,
    thousandTicketUsers: Math.max(0, Math.trunc(Number(json.thousandTicketUsers ?? mergedSummary.thousandTicketUsers) || 0)),
    totalHeat: Math.max(0, Number(json.totalHeat) || 0)
  };
  const audience = (Array.isArray(json.audience) ? json.audience : [])
    .map((item = {}) => ({
      rank: Math.max(0, Math.trunc(Number(item.rank) || 0)),
      audienceId: String(item.audienceId || item.userId || item.id || "").trim(),
      nickname: String(item.nickname || item.name || "").trim(),
      contributionHeat: Math.max(0, Number(item.contributionHeat ?? item.heat ?? item.contribution) || 0),
      isFirstGift: Boolean(item.isFirstGift ?? item.firstGift ?? item.first_gift)
    }))
    .filter((item) => item.audienceId || item.nickname);
  const text = [
    summary.date ? `日期：${summary.date}` : "",
    summary.thousandTicketUsers ? `千票人数：${summary.thousandTicketUsers}` : "",
    ...audience.map((item) => `第${item.rank || "?"}名：${item.nickname || item.audienceId}（ID：${item.audienceId || "未识别"}，贡献热度：${item.contributionHeat}${item.isFirstGift ? "，首次送礼" : ""}）`)
  ].filter(Boolean).join("\n");

  return {
    text,
    summary,
    audience,
    confidence: Number.isFinite(Number(json.confidence)) ? Number(json.confidence) : 0.8,
    rawModelText: rawText
  };
}

export async function recognizeLiveImageWithDoubao({ imageBase64, mimeType, text = "" } = {}) {
  const apiKey = process.env.ARK_API_KEY || process.env.DOUBAO_API_KEY;
  const model = process.env.DOUBAO_VISION_MODEL || DEFAULT_MODEL;
  const imageUrl = normalizeBase64Image(imageBase64, mimeType);

  if (!apiKey) {
    throw new Error("服务端未配置 ARK_API_KEY，无法调用豆包图片识别。");
  }
  if (!imageUrl) {
    throw new Error("缺少图片内容。");
  }

  const prompt = [
    "你是直播截图数据识别助手。只返回严格 JSON，不要输出 Markdown。",
    "先识别截图上方/总览/统计区域，再识别榜单明细。总览区域出现的 date、revenue、giftUsers、thousandTicketUsers、totalHeat 必须优先采用，不要用用户明细推算值覆盖总览数字。",
    "JSON 字段固定为：",
    "{\"date\":\"YYYY-MM-DD\",\"revenue\":0,\"giftUsers\":0,\"thousandTicketUsers\":0,\"totalHeat\":0,\"audience\":[{\"rank\":1,\"audienceId\":\"\",\"nickname\":\"\",\"contributionHeat\":0,\"isFirstGift\":false}],\"confidence\":0.0}",
    "revenue 只读取明确标注“总收入/本场收入/直播收入/收入”的数值，不得用热度换算。giftUsers、thousandTicketUsers 优先读取总览字段；若总览没有，才用可见榜单辅助估算。thousandTicketUsers 表示贡献热度大于等于 1000 的去重用户数。",
    "audience 列出截图中可辨认的排行榜用户，仅作为辅助：rank 为名次；audienceId 保留原始字符；nickname 为昵称；contributionHeat 为该用户贡献热度；isFirstGift 仅在明确出现首次送礼等标记时为 true。",
    "不要输出聊天内容、观看人数、评分、画像、标签或其它无关信息。看不清就用 0、空字符串或 false，不要编造。",
    text ? `用户补充描述：${text}` : ""
  ].filter(Boolean).join("\n");

  const response = await fetch(ARK_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: imageUrl
            },
            {
              type: "input_text",
              text: prompt
            }
          ]
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error?.message || payload.message || "豆包图片识别失败。";
    if (/has not activated the model/i.test(message)) {
      throw new Error(`当前火山方舟账号尚未开通模型 ${model}，请在方舟控制台开通该模型，或把 DOUBAO_VISION_MODEL 改成已开通的视觉模型 ID。`);
    }
    if (/does not exist|do not have access/i.test(message)) {
      throw new Error(`当前模型 ID ${model} 不存在或无权访问。请在火山方舟控制台复制“接入点 ID / Endpoint ID”，不要只填写模型展示名称。`);
    }
    if (/api key format is incorrect/i.test(message)) {
      throw new Error("Render 环境变量 ARK_API_KEY 不是有效的火山方舟 API Key 格式。请在火山方舟 API Key 管理页复制完整 Key，并更新 Render 的 ARK_API_KEY。");
    }
    throw new Error(message);
  }

  const rawText = extractTextFromResponse(payload);
  const json = parseJsonText(rawText);
  return normalizeRecognitionPayload(json, rawText);
}
