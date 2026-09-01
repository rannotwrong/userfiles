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
  const summary = mergeLiveSummary({
    date: json.date,
    revenue: json.revenue,
    giftUsers: json.giftUsers,
    newGiftUsers: json.newGiftUsers,
    topGift: json.topGift,
    score: json.score
  }, rawText);
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
    "你是直播榜单识别助手。请识别图片中的送礼观众排行榜，并只返回严格 JSON，不要输出 Markdown。",
    "JSON 字段固定为：",
    "{\"date\":\"YYYY-MM-DD\",\"audience\":[{\"rank\":1,\"audienceId\":\"\",\"nickname\":\"\",\"contributionHeat\":0,\"isFirstGift\":false}],\"confidence\":0.0}",
    "字段说明：date 为直播日期；audience 只列截图中排行榜的观众；rank 为榜单名次；audienceId 为截图显示的用户 ID，保留原始字符；nickname 为昵称；contributionHeat 为该观众的贡献热度；isFirstGift 仅在截图明确出现“首次送礼、首送、新用户送礼”等标记时为 true。",
    "只识别排名前三的观众。不要输出聊天内容、观看人数、总热度、评分、画像、标签或其它无关信息。",
    "贡献热度必须对应到具体观众，不要把直播间总热度或人气填给某个观众。",
    "如果某项看不清，用 0、空字符串或 false，不要编造。若没有排行榜，audience 返回空数组。",
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
