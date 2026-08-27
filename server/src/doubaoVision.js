import { mergeLiveSummary } from "./liveRecordParser.js";

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";
const DEFAULT_MODEL = "doubao-seed-2-1-pro-260628";

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
  const text = [
    summary.date ? `日期：${summary.date}` : "",
    summary.revenue ? `本场总收入：${summary.revenue}` : "",
    summary.giftUsers ? `送礼人数：${summary.giftUsers}` : "",
    summary.newGiftUsers ? `新用户送礼人数：${summary.newGiftUsers}` : "",
    summary.topGift ? `最高价值礼物：${summary.topGift}` : "",
    summary.score ? `评分：${summary.score}` : "",
    json.userText || rawText || ""
  ].filter(Boolean).join("\n");

  return {
    text,
    summary,
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
    "你是直播运营数据录入助手。请识别图片中的直播数据、聊天截图或后台截图，并只返回严格 JSON，不要输出 Markdown。",
    "JSON 字段固定为：",
    "{\"date\":\"YYYY-MM-DD\",\"revenue\":0,\"giftUsers\":0,\"newGiftUsers\":0,\"topGift\":\"\",\"score\":0,\"userText\":\"\",\"confidence\":0.0}",
    "字段说明：date 为直播日期；revenue 为本场总收入数字；giftUsers 为送礼/支持人数；newGiftUsers 为新用户送礼人数；topGift 为最高价值礼物名称；score 为 0-100 分；userText 用自然语言总结可用于生成用户档案的信息。",
    "如果图片中没有某项信息，用 0 或空字符串，不要编造。",
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
    throw new Error(payload.error?.message || payload.message || "豆包图片识别失败。");
  }

  const rawText = extractTextFromResponse(payload);
  const json = parseJsonText(rawText);
  return normalizeRecognitionPayload(json, rawText);
}
