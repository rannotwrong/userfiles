function toNumber(value) {
  const number = Number(String(value ?? "").replace(/[¥￥,，]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function toInteger(value) {
  return Math.max(0, Math.trunc(toNumber(value)));
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function firstMatch(text, patterns, fallback = "") {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] !== undefined) return String(match[1]).trim();
  }
  return fallback;
}

export function parseLiveRecordText(text = "") {
  const source = String(text || "");
  const dateText = firstMatch(source, [
    /日期[:：\s]*([0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2})/,
    /([0-9]{4}[./-][0-9]{1,2}[./-][0-9]{1,2})/
  ]);
  const normalizedDate = dateText ? dateText.replace(/[.]/g, "-") : "";
  const totalRevenueText = firstMatch(source, [
    /总收入[:：\s¥￥]*([0-9,，.]+)/,
    /本场收入[:：\s¥￥]*([0-9,，.]+)/,
    /收入[:：\s¥￥]*([0-9,，.]+)/,
    /视频号[\s\S]{0,24}热度[:：\s]*([0-9,，.]+)/
  ]);

  return {
    date: normalizeDate(normalizedDate),
    totalRevenue: toNumber(totalRevenueText),
    giftUserCount: toInteger(firstMatch(source, [
      /送礼人数[:：\s]*([0-9]+)/,
      /支持人数[:：\s]*([0-9]+)/
    ])),
    newGiftUserCount: toInteger(firstMatch(source, [
      /新用户送礼人数[:：\s]*([0-9]+)/,
      /新增送礼人数[:：\s]*([0-9]+)/
    ])),
    topGift: firstMatch(source, [
      /最高价值礼物[:：\s]*([^，,\n]+?)(?=\s*(日期|总收入|本场收入|收入|送礼人数|支持人数|新用户送礼人数|新增送礼人数|评分|直播评分|$))/,
      /最高礼物[:：\s]*([^，,\n]+?)(?=\s*(日期|总收入|本场收入|收入|送礼人数|支持人数|新用户送礼人数|新增送礼人数|评分|直播评分|$))/
    ]),
    score: Math.min(100, toInteger(firstMatch(source, [
      /评分[:：\s]*([0-9]+)/,
      /直播评分[:：\s]*([0-9]+)/
    ])))
  };
}

export function toDbLiveRecord(input = {}, ownerId) {
  return {
    owner_id: ownerId,
    audience_user_id: input.audienceUserId || null,
    live_date: normalizeDate(input.date || input.liveDate),
    total_revenue: toNumber(input.totalRevenue),
    gift_user_count: toInteger(input.giftUserCount),
    new_gift_user_count: toInteger(input.newGiftUserCount),
    top_gift: input.topGift || "",
    score: Math.min(100, toInteger(input.score)),
    source_text: input.sourceText || input.text || "",
    ocr_text: input.ocrText || "",
    recognition_payload: input.recognitionPayload || {}
  };
}

export function fromDbLiveRecord(row) {
  return {
    id: row.id,
    audienceUserId: row.audience_user_id || "",
    date: row.live_date,
    totalRevenue: toNumber(row.total_revenue),
    giftUserCount: toInteger(row.gift_user_count),
    newGiftUserCount: toInteger(row.new_gift_user_count),
    topGift: row.top_gift || "",
    score: toInteger(row.score),
    sourceText: row.source_text || "",
    ocrText: row.ocr_text || "",
    recognitionPayload: row.recognition_payload || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function validateLiveRecord(input = {}) {
  const score = Number(input.score);
  if (input.score !== undefined && (!Number.isFinite(score) || score < 0 || score > 100)) {
    return "评分需要在 0 到 100 之间";
  }
  if (Number(input.totalRevenue || 0) < 0) {
    return "总收入不能小于 0";
  }
  if (Number(input.giftUserCount || 0) < 0) {
    return "送礼人数不能小于 0";
  }
  if (Number(input.newGiftUserCount || 0) < 0) {
    return "新用户送礼人数不能小于 0";
  }
  if (String(input.sourceText || "").length > 10000) {
    return "文字描述不能超过 10000 个字符";
  }
  return "";
}
