import { parseLiveRecordText } from "./liveRecords.js";

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";
const DEFAULT_MODEL = "Doubao-Seed-1.6-vision";

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

function toRecognitionText(json = {}, rawText = "", userText = "") {
  return [
    json.date ? `日期：${json.date}` : "",
    json.totalRevenue ? `本场收入：${json.totalRevenue}` : "",
    json.giftUserCount ? `送礼人数：${json.giftUserCount}` : "",
    json.newGiftUserCount ? `新用户送礼人数：${json.newGiftUserCount}` : "",
    json.topGift ? `最高价值礼物：${json.topGift}` : "",
    json.score ? `评分：${json.score}` : "",
    json.ocrText || rawText || "",
    userText || ""
  ].filter(Boolean).join("\n");
}

function normalizeRecognition(json = {}, rawText = "", userText = "") {
  const ocrText = toRecognitionText(json, rawText, userText);
  const parsed = parseLiveRecordText(ocrText || userText);

  return {
    ocrText,
    fields: {
      ...parsed,
      date: json.date || parsed.date,
      totalRevenue: Number(json.totalRevenue ?? parsed.totalRevenue ?? 0),
      giftUserCount: Number(json.giftUserCount ?? parsed.giftUserCount ?? 0),
      newGiftUserCount: Number(json.newGiftUserCount ?? parsed.newGiftUserCount ?? 0),
      topGift: json.topGift || parsed.topGift || "",
      score: Math.min(100, Number(json.score ?? parsed.score ?? 0))
    },
    provider: "doubao",
    confidence: Number.isFinite(Number(json.confidence)) ? Number(json.confidence) : 0.8,
    recognitionPayload: {
      provider: "doubao",
      rawModelText: rawText,
      parsedJson: json
    }
  };
}

export async function recognizeLiveRecordImageWithDoubao({ imageBase64, mimeType, text = "" } = {}) {
  const apiKey = process.env.ARK_API_KEY || process.env.DOUBAO_API_KEY;
  const model = process.env.DOUBAO_VISION_MODEL || DEFAULT_MODEL;
  const imageUrl = normalizeBase64Image(imageBase64, mimeType);

  if (!apiKey) {
    throw new Error("服务端未配置 ARK_API_KEY 或 DOUBAO_API_KEY，无法调用豆包图片识别。");
  }
  if (!imageUrl) {
    throw new Error("缺少图片内容。");
  }

  const prompt = [
    "你是直播运营数据录入助手。请识别图片中的直播数据、聊天截图或后台截图，并只返回严格 JSON，不要输出 Markdown。",
    "JSON 字段固定为：",
    "{\"date\":\"YYYY-MM-DD\",\"totalRevenue\":0,\"giftUserCount\":0,\"newGiftUserCount\":0,\"topGift\":\"\",\"score\":0,\"ocrText\":\"\",\"confidence\":0.0}",
    "字段说明：date 为直播日期；totalRevenue 为本场总收入数字；giftUserCount 为送礼/支持人数；newGiftUserCount 为新用户送礼人数；topGift 为最高价值礼物名称；score 为 0-100 分；ocrText 为可追溯的识别文字摘要。",
    "识别规则：收入必须来自截图中明确的收入、流水、礼物价值或音浪等字段，不能用人气、观看人数推算；普通平台的热度只能作为 score 的辅助依据。",
    "视频号特殊规则：如果截图明确来自视频号，并且没有音浪字段，则把视频号热度按音浪处理，可进入 totalRevenue 字段；不要把其他平台热度套用为音浪。",
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
  return normalizeRecognition(json, rawText, text);
}
