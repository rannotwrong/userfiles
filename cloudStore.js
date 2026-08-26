(function () {
  const LEGACY_STORAGE_KEY = "user_profile_notebook_v2";
  const MIGRATION_BACKUP_KEY = "user_profile_notebook_v2_migrated_backup";

  const config = window.UserAtlasSupabaseConfig || {};
  const isConfigured = Boolean(
    config.url &&
    config.anonKey &&
    !config.url.includes("YOUR_PROJECT_REF") &&
    !config.anonKey.includes("YOUR_SUPABASE")
  );

  const client = isConfigured && window.supabase
    ? window.supabase.createClient(config.url, config.anonKey)
    : null;

  function toNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function toDbUser(user, ownerId) {
    return {
      owner_id: ownerId,
      nickname: user.nickname,
      level_name: user.level || "",
      tier: user.tier || "C",
      manual_tags: toArray(user.manualTags),
      auto_tags: toArray(user.autoTags),
      tags: toArray(user.tags),
      occupation: user.occupation || "",
      interests: user.interests || "",
      recent_event: user.recentEvent || "",
      talked_topics: user.topics || "",
      maintenance_method: user.maintenance || "",
      total_live_count: toNumber(user.totalLiveCount),
      appeared_count: toNumber(user.appearedCount),
      supported_count: toNumber(user.supportedCount),
      support_rate: toNumber(user.supportRate),
      total_spend_amount: toNumber(user.amount),
      latest_single_spend_amount: toNumber(user.latestSingleSpendAmount),
      high_single_spend_count: toNumber(user.highSingleSpendCount),
      single_spend_over_200_count: toNumber(user.singleSpendOver200Count),
      is_willing_to_reply: Boolean(user.isWillingToReply),
      is_no_purpose: user.isNoPurpose !== false,
      has_offline_meal_request: Boolean(user.hasOfflineMealRequest),
      is_only_rank_and_chat: Boolean(user.isOnlyRankAndChat),
      matched_rules: toArray(user.matchedRules),
      tagging_snapshot: user.taggingSnapshot || {},
      last_interaction_at: user.lastInteraction || null,
      created_at: user.createdAt || new Date().toISOString()
    };
  }

  function fromDbUser(row, interactions = []) {
    return {
      id: row.id,
      nickname: row.nickname,
      level: row.level_name || "",
      tier: row.tier || "C",
      manualTags: toArray(row.manual_tags),
      autoTags: toArray(row.auto_tags),
      tags: toArray(row.tags),
      occupation: row.occupation || "",
      interests: row.interests || "",
      recentEvent: row.recent_event || "",
      topics: row.talked_topics || "",
      maintenance: row.maintenance_method || "",
      amount: toNumber(row.total_spend_amount),
      totalLiveCount: toNumber(row.total_live_count),
      appearedCount: toNumber(row.appeared_count),
      supportedCount: toNumber(row.supported_count),
      supportRate: toNumber(row.support_rate),
      latestSingleSpendAmount: toNumber(row.latest_single_spend_amount),
      highSingleSpendCount: toNumber(row.high_single_spend_count),
      singleSpendOver200Count: toNumber(row.single_spend_over_200_count),
      isWillingToReply: Boolean(row.is_willing_to_reply),
      isNoPurpose: row.is_no_purpose !== false,
      hasOfflineMealRequest: Boolean(row.has_offline_meal_request),
      isOnlyRankAndChat: Boolean(row.is_only_rank_and_chat),
      matchedRules: toArray(row.matched_rules),
      taggingSnapshot: row.tagging_snapshot || {},
      createdAt: row.created_at,
      lastInteraction: row.last_interaction_at,
      interactions
    };
  }

  function toDbInteraction(interaction, userId, ownerId) {
    return {
      owner_id: ownerId,
      audience_user_id: userId,
      live_session_id: interaction.liveSessionId || null,
      interacted_at: interaction.time || new Date().toISOString(),
      appeared: interaction.appeared !== false,
      supported: Boolean(interaction.supported || toNumber(interaction.spendAmount) > 0),
      spend_amount: toNumber(interaction.spendAmount),
      is_first_paid: Boolean(interaction.isFirstPaid),
      is_willing_to_reply: Boolean(interaction.isWillingToReply),
      has_offline_meal_request: Boolean(interaction.hasOfflineMealRequest),
      is_only_rank_and_chat: Boolean(interaction.isOnlyRankAndChat),
      topics: interaction.topics || "",
      remark: interaction.remark || interaction.note || "",
      raw_text: interaction.rawText || ""
    };
  }

  function fromDbInteraction(row) {
    return {
      id: row.id,
      time: row.interacted_at,
      note: row.remark || row.topics || "完成一次互动",
      appeared: row.appeared,
      supported: row.supported,
      spendAmount: toNumber(row.spend_amount),
      isFirstPaid: row.is_first_paid,
      isWillingToReply: row.is_willing_to_reply,
      hasOfflineMealRequest: row.has_offline_meal_request,
      isOnlyRankAndChat: row.is_only_rank_and_chat,
      topics: row.topics || "",
      remark: row.remark || "",
      rawText: row.raw_text || ""
    };
  }

  function getLegacyUsers() {
    try {
      const saved = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  async function requireSession() {
    if (!client) throw new Error("Supabase 尚未配置，请先填写 supabase-config.js。");
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error("请先登录后再操作云端数据。");
    return data.session;
  }

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function signInWithEmail(email) {
    if (!client) throw new Error("Supabase 尚未配置，请先填写 supabase-config.js。");
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getRedirectUrl()
      }
    });
    if (error) throw error;
  }

  async function verifyEmailOtp(email, token) {
    if (!client) throw new Error("Supabase 尚未配置，请先填写 supabase-config.js。");
    const { data, error } = await client.auth.verifyOtp({
      email,
      token,
      type: "email"
    });
    if (error) throw error;
    return data.session;
  }

  async function signInWithGoogle() {
    if (!client) throw new Error("Supabase 尚未配置，请先填写 supabase-config.js。");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getRedirectUrl()
      }
    });
    if (error) throw error;
  }

  function getRedirectUrl() {
    const productionUrl = "https://rannotwrong.github.io/userfiles/";
    if (/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)) {
      return productionUrl;
    }
    return window.location.origin + window.location.pathname;
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function initCurrentUser() {
    const session = await requireSession();
    await client.from("profiles").upsert({
      id: session.user.id,
      display_name: session.user.email || "运营者"
    });
    await client.rpc("create_default_tags_for_current_user");
    return session.user;
  }

  async function listUsers() {
    const session = await requireSession();
    const { data: users, error } = await client
      .from("audience_users")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const ids = users.map((user) => user.id);
    let interactions = [];
    if (ids.length) {
      const result = await client
        .from("user_live_interactions")
        .select("*")
        .in("audience_user_id", ids)
        .order("interacted_at", { ascending: false });
      if (result.error) throw result.error;
      interactions = result.data || [];
    }

    const grouped = interactions.reduce((map, item) => {
      const list = map.get(item.audience_user_id) || [];
      list.push(fromDbInteraction(item));
      map.set(item.audience_user_id, list);
      return map;
    }, new Map());

    return users.map((user) => fromDbUser(user, grouped.get(user.id) || []));
  }

  async function saveUser(user, oldTier = null) {
    const session = await requireSession();
    const payload = toDbUser(user, session.user.id);
    let saved;
    const isNewUser = !user.id;

    if (!isNewUser) {
      const { data, error } = await client
        .from("audience_users")
        .update(payload)
        .eq("id", user.id)
        .select()
        .single();
      if (error) throw error;
      saved = data;
    } else {
      const { data, error } = await client
        .from("audience_users")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      saved = data;
    }

    if (isNewUser && toArray(user.interactions).length) {
      const interactionRows = toArray(user.interactions).map((interaction) => (
        toDbInteraction(interaction, saved.id, session.user.id)
      ));
      const { error } = await client.from("user_live_interactions").insert(interactionRows);
      if (error) throw error;
    }

    await writeTaggingLog(saved.id, oldTier, user);
    return fromDbUser(saved, user.interactions || []);
  }

  async function deleteUser(userId) {
    await requireSession();
    const { error } = await client.from("audience_users").delete().eq("id", userId);
    if (error) throw error;
  }

  async function addInteraction(user, interaction, updatedUser) {
    const session = await requireSession();
    const { data, error } = await client
      .from("user_live_interactions")
      .insert(toDbInteraction(interaction, user.id, session.user.id))
      .select()
      .single();
    if (error) throw error;

    const savedUser = await saveUser(updatedUser, user.tier);
    return {
      user: savedUser,
      interaction: fromDbInteraction(data)
    };
  }

  async function writeTaggingLog(userId, oldTier, user) {
    const session = await requireSession();
    const { error } = await client.from("user_tagging_logs").insert({
      owner_id: session.user.id,
      audience_user_id: userId,
      old_tier: oldTier || user.tier || null,
      new_tier: user.tier || null,
      matched_rules: toArray(user.matchedRules),
      calculated_snapshot: user.taggingSnapshot || {},
      operator_type: "system"
    });
    if (error) console.warn("打标日志写入失败。", error);
  }

  async function listTrends() {
    await requireSession();
    const [daily, weekly, monthly] = await Promise.all([
      client.from("live_daily_metrics").select("*").order("live_date", { ascending: false }).limit(30),
      client.from("live_weekly_metrics").select("*").order("week_start_date", { ascending: true }).limit(12),
      client.from("live_monthly_metrics").select("*").order("month_start_date", { ascending: true }).limit(12)
    ]);
    if (daily.error) throw daily.error;
    if (weekly.error) throw weekly.error;
    if (monthly.error) throw monthly.error;
    return {
      daily: daily.data || [],
      weekly: weekly.data || [],
      monthly: monthly.data || []
    };
  }

  async function migrateLegacyUsers(normalizeUser) {
    const session = await requireSession();
    const legacyUsers = getLegacyUsers().map(normalizeUser);
    if (!legacyUsers.length) return 0;

    const created = [];
    for (const user of legacyUsers) {
      const saved = await saveUser({ ...user, id: "" }, user.tier);
      created.push(saved);
      const interactions = toArray(user.interactions);
      for (const interaction of interactions) {
        await client
          .from("user_live_interactions")
          .insert(toDbInteraction(interaction, saved.id, session.user.id));
      }
    }
    localStorage.setItem(MIGRATION_BACKUP_KEY, JSON.stringify(legacyUsers));
    return created.length;
  }

  window.UserAtlasCloudStore = {
    isConfigured,
    client,
    getLegacyUsers,
    getSession,
    signInWithEmail,
    verifyEmailOtp,
    signInWithGoogle,
    signOut,
    initCurrentUser,
    listUsers,
    saveUser,
    deleteUser,
    addInteraction,
    listTrends,
    migrateLegacyUsers
  };
})();
