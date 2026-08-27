const TIERS = new Set(["S", "A", "B", "C"]);

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toInteger(value) {
  return Math.max(0, Math.trunc(toNumber(value)));
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    return value
      .split(/[、,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeTier(value) {
  return TIERS.has(value) ? value : "C";
}

function mergeTags(manualTags, autoTags) {
  return [...new Set([...toArray(manualTags), ...toArray(autoTags)])];
}

export function toDbAudienceUser(input = {}, ownerId) {
  const manualTags = toArray(input.manualTags);
  const autoTags = toArray(input.autoTags);
  return {
    owner_id: ownerId,
    nickname: String(input.nickname || "").trim(),
    tier: normalizeTier(input.tier),
    level_name: input.level || input.levelName || "",
    birthday: normalizeDate(input.birthday),
    manual_tags: manualTags,
    auto_tags: autoTags,
    tags: mergeTags(manualTags, autoTags),
    occupation: input.occupation || "",
    interests: input.interests || "",
    recent_event: input.recentEvent || "",
    talked_topics: input.topics || input.talkedTopics || "",
    maintenance_method: input.maintenance || input.maintenanceMethod || "",
    total_spend_amount: toNumber(input.amount || input.totalSpendAmount),
    latest_single_spend_amount: toNumber(input.latestSingleSpendAmount),
    highest_single_spend_amount: toNumber(input.highestSingleSpendAmount),
    high_single_spend_count: toInteger(input.highSingleSpendCount),
    single_spend_over_200_count: toInteger(input.singleSpendOver200Count),
    total_live_count: toInteger(input.totalLiveCount),
    appeared_count: toInteger(input.appearedCount),
    supported_count: toInteger(input.supportedCount),
    support_rate: toNumber(input.supportRate),
    is_willing_to_reply: toBoolean(input.isWillingToReply),
    is_no_purpose: toBoolean(input.isNoPurpose, true),
    has_offline_meal_request: toBoolean(input.hasOfflineMealRequest),
    is_only_rank_and_chat: toBoolean(input.isOnlyRankAndChat),
    matched_rules: toArray(input.matchedRules),
    tagging_snapshot: input.taggingSnapshot || {},
    notes: input.notes || "",
    last_interaction_at: input.lastInteraction || null
  };
}

export function toDbAudienceUserPatch(input = {}) {
  const full = toDbAudienceUser(input, "00000000-0000-0000-0000-000000000000");
  const fieldMap = {
    nickname: "nickname",
    tier: "tier",
    level: "level_name",
    levelName: "level_name",
    birthday: "birthday",
    manualTags: "manual_tags",
    autoTags: "auto_tags",
    occupation: "occupation",
    interests: "interests",
    recentEvent: "recent_event",
    topics: "talked_topics",
    talkedTopics: "talked_topics",
    maintenance: "maintenance_method",
    maintenanceMethod: "maintenance_method",
    amount: "total_spend_amount",
    totalSpendAmount: "total_spend_amount",
    latestSingleSpendAmount: "latest_single_spend_amount",
    highestSingleSpendAmount: "highest_single_spend_amount",
    highSingleSpendCount: "high_single_spend_count",
    singleSpendOver200Count: "single_spend_over_200_count",
    totalLiveCount: "total_live_count",
    appearedCount: "appeared_count",
    supportedCount: "supported_count",
    supportRate: "support_rate",
    isWillingToReply: "is_willing_to_reply",
    isNoPurpose: "is_no_purpose",
    hasOfflineMealRequest: "has_offline_meal_request",
    isOnlyRankAndChat: "is_only_rank_and_chat",
    matchedRules: "matched_rules",
    taggingSnapshot: "tagging_snapshot",
    notes: "notes",
    lastInteraction: "last_interaction_at"
  };
  const patch = {};
  for (const [inputKey, dbKey] of Object.entries(fieldMap)) {
    if (Object.prototype.hasOwnProperty.call(input, inputKey)) {
      patch[dbKey] = full[dbKey];
    }
  }
  return patch;
}

export function fromDbAudienceUser(row) {
  return {
    id: row.id,
    nickname: row.nickname,
    tier: row.tier || "C",
    level: row.level_name || "",
    birthday: row.birthday || "",
    manualTags: row.manual_tags || [],
    autoTags: row.auto_tags || [],
    tags: row.tags || [],
    occupation: row.occupation || "",
    interests: row.interests || "",
    recentEvent: row.recent_event || "",
    topics: row.talked_topics || "",
    maintenance: row.maintenance_method || "",
    amount: toNumber(row.total_spend_amount),
    latestSingleSpendAmount: toNumber(row.latest_single_spend_amount),
    highestSingleSpendAmount: toNumber(row.highest_single_spend_amount),
    highSingleSpendCount: toInteger(row.high_single_spend_count),
    singleSpendOver200Count: toInteger(row.single_spend_over_200_count),
    totalLiveCount: toInteger(row.total_live_count),
    appearedCount: toInteger(row.appeared_count),
    supportedCount: toInteger(row.supported_count),
    supportRate: toNumber(row.support_rate),
    isWillingToReply: Boolean(row.is_willing_to_reply),
    isNoPurpose: row.is_no_purpose !== false,
    hasOfflineMealRequest: Boolean(row.has_offline_meal_request),
    isOnlyRankAndChat: Boolean(row.is_only_rank_and_chat),
    matchedRules: row.matched_rules || [],
    taggingSnapshot: row.tagging_snapshot || {},
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastInteraction: row.last_interaction_at
  };
}

export function validateAudienceUser(input = {}) {
  if (!String(input.nickname || "").trim()) {
    return "昵称不能为空";
  }
  if (input.tier && !TIERS.has(input.tier)) {
    return "用户分层只能是 S、A、B、C";
  }
  return "";
}
