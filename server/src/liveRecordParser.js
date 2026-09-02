function toNumber(value) {
  const number = Number(String(value ?? "").replace(/[¥￥,，]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function toInteger(value) {
  return Math.max(0, Math.trunc(toNumber(value)));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (!value) return todayKey();
  const text = String(value).replace(/[年月/.]/g, "-").replace(/日/g, "");
  const match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return todayKey();
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
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
    /日期[:：\s]*([0-9]{4}[./\-年][0-9]{1,2}[./\-月][0-9]{1,2})/,
    /直播日期[:：\s]*([0-9]{4}[./\-年][0-9]{1,2}[./\-月][0-9]{1,2})/,
    /([0-9]{4}[./\-年][0-9]{1,2}[./\-月][0-9]{1,2})/
  ]);
  const revenueText = firstMatch(source, [
    /总收入[:：\s¥￥]*([0-9,，.]+)/,
    /本场收入[:：\s¥￥]*([0-9,，.]+)/,
    /直播收入[:：\s¥￥]*([0-9,，.]+)/,
    /收入[:：\s¥￥]*([0-9,，.]+)/,
    /视频号[\s\S]{0,24}热度[:：\s]*([0-9,，.]+)/
  ]);

  return {
    date: normalizeDate(dateText),
    revenue: toNumber(revenueText),
    giftUsers: toInteger(firstMatch(source, [
      /送礼人数[:：\s]*([0-9]+)/,
      /支持人数[:：\s]*([0-9]+)/,
      /送礼用户[:：\s]*([0-9]+)/
    ])),
    thousandTicketUsers: toInteger(firstMatch(source, [
      /千票人数[:：\s]*([0-9]+)/,
      /千票用户[:：\s]*([0-9]+)/
    ])),
    newGiftUsers: toInteger(firstMatch(source, [
      /新用户送礼人数[:：\s]*([0-9]+)/,
      /新增送礼人数[:：\s]*([0-9]+)/,
      /新用户支持人数[:：\s]*([0-9]+)/
    ])),
    topGift: firstMatch(source, [
      /最高价值礼物[:：\s]*([^，,\n；;]+?)(?=\s*(日期|总收入|本场收入|直播收入|收入|送礼人数|支持人数|新用户送礼人数|新增送礼人数|评分|直播评分|$))/,
      /最高礼物[:：\s]*([^，,\n；;]+?)(?=\s*(日期|总收入|本场收入|直播收入|收入|送礼人数|支持人数|新用户送礼人数|新增送礼人数|评分|直播评分|$))/
    ]),
    score: Math.min(100, toInteger(firstMatch(source, [
      /评分[:：\s]*([0-9]+)/,
      /直播评分[:：\s]*([0-9]+)/,
      /场次评分[:：\s]*([0-9]+)/
    ])))
  };
}

export function mergeLiveSummary(primary = {}, fallbackText = "") {
  const fallback = parseLiveRecordText(fallbackText);
  return {
    date: normalizeDate(primary.date || fallback.date),
    revenue: toNumber(primary.revenue ?? fallback.revenue),
    giftUsers: toInteger(primary.giftUsers ?? fallback.giftUsers),
    thousandTicketUsers: toInteger(primary.thousandTicketUsers ?? fallback.thousandTicketUsers),
    newGiftUsers: toInteger(primary.newGiftUsers ?? fallback.newGiftUsers),
    topGift: String(primary.topGift || fallback.topGift || "").trim(),
    score: Math.min(100, toInteger(primary.score ?? fallback.score))
  };
}
