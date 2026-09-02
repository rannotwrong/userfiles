(function () {
  const STORAGE_KEY = "user_profile_notebook_v2";
  const LIVE_SESSION_KEY = "user_profile_live_sessions_v1";
  const TREND_PLAN_KEY = "user_profile_trend_plan_v1";
  const cloudStore = window.UserAtlasCloudStore;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => globalThis.crypto?.randomUUID?.() || `u_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const ZODIAC_TAGS = ["白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"];
  const AUTO_TAGS = ["高额支持", "稳定陪伴", "氛围带动", "点歌偏好", "情绪支持", "预算敏感", "新进观望", "潜水守候", "目的用户", ...ZODIAC_TAGS];
  const HEAT_PER_CNY = 10;
  const MIN_PROFILE_PROMPT_HEAT = 1000;
  const MAX_LIVE_IMAGES = 2;
  const toNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const toBoolean = (value, fallback = false) => typeof value === "boolean" ? value : fallback;

  const state = {
    users: [],
    trends: null,
    liveSessions: [],
    activeView: "profiles",
    activeTier: "全部",
    search: "",
    selectedImages: [],
    imagePreviewUrls: [],
    recognizedAudience: [],
    profilePromptAudience: [],
    recognitionDate: "",
    hasParsedLiveCapture: false,
    detailUserId: null,
    userFormDraft: null,
    userFormCompletion: null,
    cloudEnabled: Boolean(cloudStore?.isConfigured),
    currentUser: null,
    isLoading: true,
    trendFilters: {
      dailyDate: toDateKey(new Date()),
      weeklyPeriod: toWeekInputValue(new Date()),
      monthlyPeriod: toMonthKey(new Date()),
      monthPlanPeriod: toMonthKey(new Date())
    }
  };

  function loadLocalUsers() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved)) return saved.map(normalizeUser);
    } catch (error) {
      console.warn("本地档案读取失败，将使用示例数据。", error);
    }
    const users = typeof structuredClone === "function"
      ? structuredClone(window.NotebookMock.users)
      : JSON.parse(JSON.stringify(window.NotebookMock.users));
    return users.map(normalizeUser);
  }

  function dedupe(items) {
    return [...new Set(items.filter(Boolean))];
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function toDateKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function toMonthKey(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function startOfISOWeek(value = new Date()) {
    const date = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return new Date();
    const day = date.getDay() || 7;
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - day + 1);
    return date;
  }

  function toWeekInputValue(value = new Date()) {
    const date = startOfISOWeek(value);
    const thursday = addDays(date, 3);
    const firstThursday = new Date(thursday.getFullYear(), 0, 4);
    const firstWeekStart = startOfISOWeek(firstThursday);
    const week = Math.floor((thursday - firstWeekStart) / 604800000) + 1;
    return `${thursday.getFullYear()}-W${pad2(week)}`;
  }

  function weekInputToStartDate(value) {
    const match = String(value || "").match(/^(\d{4})-W(\d{2})$/);
    if (!match) return startOfISOWeek(new Date());
    const year = Number(match[1]);
    const week = Number(match[2]);
    const firstWeekStart = startOfISOWeek(new Date(year, 0, 4));
    return addDays(firstWeekStart, (week - 1) * 7);
  }

  function formatChineseDate(value, includeYear = true) {
    const dateKey = toDateKey(value);
    if (!dateKey) return "";
    const [year, month, day] = dateKey.split("-");
    return includeYear ? `${year}/${month}/${day}` : `${month}/${day}`;
  }

  function formatChineseMonth(monthKey) {
    const [year, month] = String(monthKey || "").split("-").map(Number);
    return year && month ? `${year}年${month}月` : "";
  }

  function formatWeekRange(weekValue) {
    const start = weekInputToStartDate(weekValue);
    const end = addDays(start, 6);
    return `${formatChineseDate(start, false)}-${formatChineseDate(end, false)}`;
  }

  function updateCaptureDateDisplay() {
    $("#captureDateDisplay").textContent = formatChineseDate(`${$("#captureDate").value}T00:00:00`) || "请选择日期";
  }

  function splitTags(value = "") {
    return dedupe(String(value)
      .split(/[、,，\s]+/)
      .map((tag) => tag.trim())
      .filter(Boolean));
  }

  function getZodiacSign(birthday) {
    if (!birthday) return "";
    const match = String(birthday).match(/(?:\d{4}-)?(\d{1,2})-(\d{1,2})/);
    if (!match) return "";
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (!month || !day) return "";
    const ranges = [
      ["摩羯座", 1, 20], ["水瓶座", 2, 19], ["双鱼座", 3, 21], ["白羊座", 4, 20],
      ["金牛座", 5, 21], ["双子座", 6, 22], ["巨蟹座", 7, 23], ["狮子座", 8, 23],
      ["处女座", 9, 23], ["天秤座", 10, 24], ["天蝎座", 11, 23], ["射手座", 12, 22],
      ["摩羯座", 13, 1]
    ];
    return ranges.find(([, endMonth, endDay]) => month < endMonth || (month === endMonth && day < endDay))?.[0] || "";
  }

  function getUserMetrics(user) {
    const interactions = Array.isArray(user.interactions) ? user.interactions : [];
    const appearedFromLogs = interactions.filter((item) => item.appeared !== false).length;
    const supportedInteractions = interactions.filter((item) => item.supported || toNumber(item.spendAmount) > 0);
    const supportedFromLogs = supportedInteractions.length;
    const currentMonth = toMonthKey(new Date());
    const supportedThisMonthFromLogs = supportedInteractions
      .filter((item) => toMonthKey(item.time || item.date || "") === currentMonth)
      .length;
    const spendAmounts = interactions.map((item) => toNumber(item.spendAmount));
    const totalSpendFromLogs = spendAmounts.reduce((sum, value) => sum + value, 0);
    const latestSpendFromLogs = spendAmounts.find((value) => value > 0) || 0;
    const maxSpendFromLogs = spendAmounts.length ? Math.max(...spendAmounts) : 0;
    const highSingleFromLogs = spendAmounts.filter((value) => value > 1000).length;
    const singleOver200FromLogs = spendAmounts.filter((value) => value > 200).length;
    const appearedCount = Math.max(toNumber(user.appearedCount), appearedFromLogs);
    const supportedCount = interactions.length ? supportedThisMonthFromLogs : toNumber(user.supportedCount);
    const totalLiveCount = Math.max(toNumber(user.totalLiveCount), appearedCount, supportedCount);
    const totalSpendAmount = Math.max(toNumber(user.amount), totalSpendFromLogs);
    const latestSingleSpendAmount = Math.max(toNumber(user.latestSingleSpendAmount), latestSpendFromLogs);
    const maxSingleSpendAmount = Math.max(toNumber(user.maxSingleSpendAmount), latestSingleSpendAmount, maxSpendFromLogs);
    const highSingleSpendCount = Math.max(toNumber(user.highSingleSpendCount), highSingleFromLogs);
    const singleSpendOver200Count = Math.max(toNumber(user.singleSpendOver200Count), singleOver200FromLogs, maxSingleSpendAmount > 200 ? 1 : 0);
    const hasOfflineMealRequest = toBoolean(user.hasOfflineMealRequest) || interactions.some((item) => item.hasOfflineMealRequest);
    const isWillingToReply = toBoolean(user.isWillingToReply) || interactions.some((item) => item.isWillingToReply);
    const isOnlyRankAndChat = interactions.length > 0
      ? interactions.every((item) => item.isOnlyRankAndChat && !(item.supported || toNumber(item.spendAmount) > 0))
      : toBoolean(user.isOnlyRankAndChat);

    return {
      totalLiveCount,
      appearedCount,
      supportedCount,
      supportRate: totalLiveCount > 0 ? supportedCount / totalLiveCount : 0,
      totalSpendAmount,
      latestSingleSpendAmount,
      maxSingleSpendAmount,
      highSingleSpendCount,
      singleSpendOver200Count,
      isWillingToReply,
      isNoPurpose: !hasOfflineMealRequest && toBoolean(user.isNoPurpose, true),
      hasOfflineMealRequest,
      isOnlyRankAndChat
    };
  }

  function classifyTier(metrics) {
    if (metrics.supportRate > 0.5 && metrics.totalSpendAmount > 10000 && metrics.isWillingToReply) {
      return { tier: "S", rule: "S级：支持率 > 50%，总消费金额 > 10000，且愿意接话" };
    }
    const isA = (
      metrics.totalSpendAmount > 5000 ||
      (metrics.supportRate > 0.3 && metrics.maxSingleSpendAmount > 500) ||
      metrics.highSingleSpendCount >= 3
    ) && metrics.isNoPurpose;
    if (isA) return { tier: "A", rule: "A级：满足金额/支持条件之一，且无目的" };
    if (metrics.supportRate < 0.3 && metrics.singleSpendOver200Count >= 1 && metrics.appearedCount >= 3) {
      return { tier: "B", rule: "B级：支持率 < 30%，单笔消费 > 200，且出现过 3 次及以上" };
    }
    if (metrics.isOnlyRankAndChat) return { tier: "C", rule: "C级：每次只占榜和聊天" };
    return { tier: "C", rule: "默认C级：暂未满足 S/A/B，继续观察" };
  }

  function inferAutoTags(user, metrics) {
    const interactions = Array.isArray(user.interactions) ? user.interactions : [];
    const tags = [];
    if (interactions.some((item) => toNumber(item.spendAmount) > 1000 && item.hasOfflineMealRequest) || (metrics.latestSingleSpendAmount > 1000 && metrics.hasOfflineMealRequest)) {
      tags.push("目的用户");
    }
    if (metrics.totalSpendAmount > 5000 || metrics.highSingleSpendCount >= 1) tags.push("高额支持");
    if (metrics.appearedCount >= 3) tags.push("稳定陪伴");
    if (metrics.isWillingToReply) tags.push("氛围带动");
    if (interactions.some((item) => /点歌|歌|音乐/.test(`${item.topics || ""}${item.note || ""}`)) || /点歌|歌|音乐/.test(user.topics || "")) tags.push("点歌偏好");
    if (interactions.some((item) => /安慰|鼓励/.test(`${item.remark || ""}${item.note || ""}`)) || /安慰|鼓励/.test(`${user.recentEvent || ""}${user.topics || ""}`)) tags.push("情绪支持");
    if (interactions.some((item) => /没钱|预算|下次再支持|只能小礼物/.test(`${item.remark || ""}${item.note || ""}`)) || /没钱|预算|下次再支持|只能小礼物/.test(`${user.recentEvent || ""}${user.topics || ""}`)) tags.push("预算敏感");
    if (metrics.appearedCount <= 2) tags.push("新进观望");
    if (metrics.appearedCount >= 3 && !metrics.isWillingToReply && metrics.totalSpendAmount <= 1000) tags.push("潜水守候");
    const zodiacSign = getZodiacSign(user.birthday);
    if (zodiacSign) tags.push(zodiacSign);
    return dedupe(tags);
  }

  function getInteractionDates(user, includeFirst = true) {
    return [
      ...(includeFirst ? [user.firstInteraction] : []),
      user.lastInteraction,
      ...(Array.isArray(user.interactions) ? user.interactions.map((item) => item.time || item.date) : [])
    ]
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()));
  }

  function getFirstInteractionDate(user, savedSnapshot = {}) {
    if (user.firstInteraction || savedSnapshot.firstInteraction) {
      return dateOnlyISOString(user.firstInteraction || savedSnapshot.firstInteraction);
    }
    const dates = getInteractionDates(user);
    if (!dates.length) return "";
    return dateOnlyISOString(new Date(Math.min(...dates.map((date) => date.getTime()))));
  }

  function getLatestInteractionDate(user) {
    if (user.lastInteraction) return dateOnlyISOString(user.lastInteraction);
    const dates = getInteractionDates(user, false);
    if (!dates.length) return "";
    return dateOnlyISOString(new Date(Math.max(...dates.map((date) => date.getTime()))));
  }

  function normalizeUser(user, options = {}) {
    const savedSnapshot = user.taggingSnapshot && typeof user.taggingSnapshot === "object" ? user.taggingSnapshot : {};
    const { recalculateTier = false, tierSource = user.tierSource || savedSnapshot.tierSource } = options;
    const birthday = Object.prototype.hasOwnProperty.call(user, "birthday") ? user.birthday : (savedSnapshot.birthday || "");
    const audienceId = String(user.audienceId || savedSnapshot.audienceId || "").trim();
    const manualTags = Array.isArray(user.manualTags)
      ? user.manualTags
      : (Array.isArray(user.tags) ? user.tags.filter((tag) => !AUTO_TAGS.includes(tag)) : []);
    const metrics = getUserMetrics(user);
    const classification = classifyTier(metrics);
    const autoTags = inferAutoTags({ ...user, birthday }, metrics);
    const finalTier = recalculateTier
      ? classification.tier
      : (user.tier || classification.tier);
    const finalTierSource = recalculateTier ? "system" : (tierSource || user.tierSource || savedSnapshot.tierSource || "manual");
    const matchedRules = recalculateTier
      ? [classification.rule]
      : [
        `人工设定：${finalTier}级`,
        `系统参考：${classification.rule}`
      ];
    const firstInteraction = getFirstInteractionDate(user, savedSnapshot);
    const lastInteraction = getLatestInteractionDate(user);
    return {
      ...user,
      tier: finalTier,
      tierSource: finalTierSource,
      systemTier: classification.tier,
      birthday,
      audienceId,
      manualTags,
      autoTags,
      tags: dedupe([...autoTags, ...manualTags]),
      amount: metrics.totalSpendAmount,
      totalLiveCount: metrics.totalLiveCount,
      appearedCount: metrics.appearedCount,
      supportedCount: metrics.supportedCount,
      supportRate: metrics.supportRate,
      latestSingleSpendAmount: metrics.latestSingleSpendAmount,
      maxSingleSpendAmount: metrics.maxSingleSpendAmount,
      highSingleSpendCount: metrics.highSingleSpendCount,
      singleSpendOver200Count: metrics.singleSpendOver200Count,
      isWillingToReply: metrics.isWillingToReply,
      isNoPurpose: metrics.isNoPurpose,
      hasOfflineMealRequest: metrics.hasOfflineMealRequest,
      isOnlyRankAndChat: metrics.isOnlyRankAndChat,
      firstInteraction,
      lastInteraction,
      createdVia: user.createdVia || savedSnapshot.createdVia || "manual",
      matchedRules,
      taggingSnapshot: {
        ...metrics,
        tierSource: finalTierSource,
        systemTier: classification.tier,
        effectiveTier: finalTier,
        birthday,
        audienceId,
        firstInteraction,
        createdVia: user.createdVia || savedSnapshot.createdVia || "manual",
        maxSingleSpendAmount: metrics.maxSingleSpendAmount
      }
    };
  }

  async function persistUser(user, oldTier = null, operatorType = user.tierSource || "manual") {
    if (state.cloudEnabled && state.currentUser) {
      return await cloudStore.saveUser(user, oldTier, operatorType);
    }
    saveLocalUsers();
    return user;
  }

  function saveLocalUsers() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.users));
    } catch (error) {
      showToast("本地保存失败，请检查浏览器存储权限");
      console.warn("本地档案保存失败。", error);
    }
  }

  function loadLocalLiveSessions() {
    try {
      const saved = JSON.parse(localStorage.getItem(LIVE_SESSION_KEY));
      if (Array.isArray(saved)) return saved;
    } catch (error) {
      console.warn("本地直播记录读取失败。", error);
    }
    return [];
  }

  function saveLocalLiveSessions() {
    try {
      localStorage.setItem(LIVE_SESSION_KEY, JSON.stringify(state.liveSessions || []));
    } catch (error) {
      console.warn("本地直播记录保存失败。", error);
    }
  }

  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function formatDate(value) {
    if (!value) return "尚未记录";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "尚未记录";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  function toDateInput(value) {
    return toDateKey(value);
  }

  function dateOnlyISOString(value) {
    if (!value) return "";
    const dateKey = toDateKey(value);
    return dateKey ? `${dateKey}T00:00:00.000Z` : "";
  }

  function isStale(user) {
    if (!user.lastInteraction) return true;
    return Date.now() - new Date(user.lastInteraction).getTime() > 30 * 86400000;
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function renderAuthPanel() {
    const panel = $("#authPanel");
    const emailInput = $("#authEmail");
    const otpInput = $("#authOtp");
    const sendButton = $("#sendLoginBtn");
    const verifyButton = $("#verifyOtpBtn");
    const googleButton = $("#googleLoginBtn");
    const signOutButton = $("#signOutBtn");
    const status = $("#authStatus");

    panel.classList.toggle("is-connected", Boolean(state.currentUser));
    panel.classList.toggle("is-warning", !state.cloudEnabled);

    if (!state.cloudEnabled) {
      status.textContent = "";
      emailInput.hidden = true;
      otpInput.hidden = true;
      sendButton.hidden = true;
      verifyButton.hidden = true;
      googleButton.hidden = true;
      signOutButton.hidden = true;
      return;
    }

    if (state.currentUser) {
      status.textContent = "";
      emailInput.hidden = true;
      otpInput.hidden = true;
      sendButton.hidden = true;
      verifyButton.hidden = true;
      googleButton.hidden = true;
      signOutButton.hidden = false;
      return;
    }

    status.textContent = "";
    emailInput.hidden = false;
    sendButton.hidden = false;
    otpInput.hidden = false;
    verifyButton.hidden = false;
    googleButton.hidden = false;
    signOutButton.hidden = true;
  }

  async function loadCloudData() {
    if (!state.cloudEnabled) {
      state.users = loadLocalUsers();
      state.liveSessions = loadLocalLiveSessions();
      state.trends = buildTrendsFromLiveSessions(state.liveSessions);
      syncTrendFiltersToLatestRecord();
      state.isLoading = false;
      renderAuthPanel();
      renderUsers();
      renderTrends();
      return;
    }

    try {
      const session = await cloudStore.getSession();
      if (!session) {
        state.currentUser = null;
        state.users = [];
        state.liveSessions = [];
        state.trends = emptyTrends();
        state.isLoading = false;
        renderAuthPanel();
        renderUsers();
        renderTrends();
        return;
      }

      state.currentUser = await cloudStore.initCurrentUser();
      state.users = (await cloudStore.listUsers()).map(normalizeUser);
      await loadCloudTrends();
      syncTrendFiltersToLatestRecord();
      state.isLoading = false;
      renderAuthPanel();
      renderUsers();
      renderTrends();
    } catch (error) {
      console.warn("云端数据加载失败。", error);
      state.users = loadLocalUsers();
      state.liveSessions = loadLocalLiveSessions();
      state.trends = buildTrendsFromLiveSessions(state.liveSessions);
      syncTrendFiltersToLatestRecord();
      state.isLoading = false;
      renderAuthPanel();
      renderUsers();
      renderTrends();
      showToast(error.message || "云端数据加载失败，已切换为本机演示数据");
    }
  }

  async function loadCloudTrends() {
    if (!state.cloudEnabled || !state.currentUser) {
      state.liveSessions = loadLocalLiveSessions();
      state.trends = buildTrendsFromLiveSessions(state.liveSessions);
      return;
    }
    try {
      const trends = await cloudStore.listTrends();
      const descriptionsByDate = (trends.sessions || []).reduce((map, item) => {
        const description = String(item.raw_record_text || "").trim();
        const isLegacyRankingText = /贡献热度[:：]?\s*\d+|ID[:：]|第\d+名/.test(description);
        if (!description || isLegacyRankingText) return map;
        const descriptions = map.get(item.live_date) || [];
        if (!descriptions.includes(description)) descriptions.push(description);
        map.set(item.live_date, descriptions);
        return map;
      }, new Map());
      const dailyHistory = trends.daily.map((item) => ({
        date: item.live_date,
        revenue: Number(item.daily_revenue || 0),
        paidUsers: Number(item.paid_user_count || 0),
        firstPaidUsers: Number(item.first_paid_user_count || 0),
        thousandTicketUsers: Number(item.new_potential_user_count || 0),
        sRevenueRate: Number(item.s_user_revenue_rate || 0),
        potentialUsers: Number(item.new_potential_user_count || 0),
        description: (descriptionsByDate.get(item.live_date) || []).join("\n")
      }));
      const dailyLatest = dailyHistory[0];
      const weekly = trends.weekly.map((item) => ({
        weekStart: item.week_start_date,
        week: item.week_start_date ? toWeekInputValue(`${item.week_start_date}T00:00:00`) : "",
        label: item.week_start_date?.slice(5) || "本周",
        revenue: Number(item.weekly_revenue || 0),
        potentialUsers: Number(item.new_potential_user_count || 0)
      }));
      const monthly = trends.monthly.map((item) => ({
        month: item.month_start_date?.slice(0, 7) || "",
        label: item.month_start_date?.slice(0, 7) || "本月",
        revenue: Number(item.monthly_revenue || 0),
        potentialUsers: Number(item.new_potential_user_count || 0)
      }));

      state.trends = {
        daily: dailyLatest || emptyDailyTrend(toDateKey(new Date())),
        weekly: weekly.length ? {
          revenue: weekly.reduce((sum, item) => sum + item.revenue, 0),
          potentialUsers: weekly.reduce((sum, item) => sum + item.potentialUsers, 0),
          trend: weekly
        } : { revenue: 0, potentialUsers: 0, trend: [] },
        monthly: monthly.length ? {
          revenue: monthly.reduce((sum, item) => sum + item.revenue, 0),
          potentialUsers: monthly.reduce((sum, item) => sum + item.potentialUsers, 0),
          trend: monthly
        } : { revenue: 0, potentialUsers: 0, trend: [] },
        dailyHistory,
        weeklyHistory: weekly,
        monthlyHistory: monthly
      };
    } catch (error) {
      console.warn("直播趋势加载失败。", error);
      state.trends = emptyTrends();
    }
  }

  function updateStats() {
    const now = new Date();
    $("#statTotal").textContent = state.users.length;
    $("#statS").textContent = state.users.filter((user) => user.tier === "S").length;
    $("#statA").textContent = state.users.filter((user) => user.tier === "A").length;
    $("#statNew").textContent = state.users.filter((user) => {
      const firstInteraction = new Date(user.firstInteraction);
      return !Number.isNaN(firstInteraction.getTime()) &&
        firstInteraction.getMonth() === now.getMonth() &&
        firstInteraction.getFullYear() === now.getFullYear();
    }).length;
  }

  function emptyStateHTML() {
    return `
      <div class="empty">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 8v4l2 2"/>
          <circle cx="12" cy="12" r="9"/>
        </svg>
        <p>这一页还没有记录</p>
        <small>换个筛选条件，或新增一位用户吧。</small>
      </div>`;
  }

  function renderUsers() {
    const keyword = state.search.trim().toLowerCase();
    const filtered = state.users
      .filter((user) => state.activeTier === "全部" || user.tier === state.activeTier)
      .filter((user) => user.nickname.toLowerCase().includes(keyword))
      .sort((a, b) => new Date(b.lastInteraction || 0) - new Date(a.lastInteraction || 0));

    $("#resultCount").textContent = `${filtered.length} 位`;
    $("#userGrid").innerHTML = filtered.length
      ? filtered.map((user) => `
        <button class="user-card" type="button" data-user-id="${escapeHTML(user.id)}" aria-label="查看 ${escapeHTML(user.nickname)} 的完整档案">
          <span class="card-top">
            <span class="identity">
              <span class="avatar">${escapeHTML(user.nickname.slice(0, 1))}</span>
              <span>
                <strong class="name">${escapeHTML(user.nickname)}</strong>
                <span class="level">${user.birthday ? escapeHTML(getZodiacSign(user.birthday) || "生日已记录") : `生日未知 · 最近互动 ${formatDate(user.lastInteraction)}`}</span>
              </span>
            </span>
            <span class="tier tier-${user.tier}" title="${user.tier} 级用户">${user.tier}</span>
          </span>
          <span class="tags">
            ${(user.tags || []).slice(0, 3).map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`).join("")}
          </span>
          <span class="card-meta">
            <span>
              <span class="meta-label">最近互动</span>
              <span class="meta-value ${isStale(user) ? "stale" : ""}">${formatDate(user.lastInteraction)}</span>
            </span>
            <span>
              <span class="meta-label">本月支持 / 累计消费</span>
              <span class="meta-value">${user.supportedCount || 0} 次 · ¥ ${Number(user.amount || 0).toLocaleString("zh-CN")}</span>
            </span>
          </span>
        </button>
      `).join("")
      : emptyStateHTML();

    $$("[data-user-id]").forEach((card) => {
      card.addEventListener("click", () => openDetail(card.dataset.userId));
    });
    updateStats();
  }

  function formatCurrency(value) {
    return `¥${Number(value || 0).toLocaleString("zh-CN")}`;
  }

  function formatPercent(value) {
    return `${Math.round(Number(value || 0) * 100)}%`;
  }

  function metricCard(label, value) {
    return `
      <article class="metric-card">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(value)}</strong>
      </article>`;
  }

  function renderLineChart(data, chartId) {
    if (!data.length) {
      return `
        <div class="empty trend-empty">
          <p>暂无直播记录</p>
          <small>上传或录入直播记录后，这里会自动生成趋势图。</small>
        </div>`;
    }
    const safeData = data;
    const values = safeData.map((item) => item.revenue);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const width = 640;
    const height = 220;
    const padding = { top: 28, right: 24, bottom: 38, left: 24 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const range = Math.max(max - min, 1);
    const points = safeData.map((item, index) => {
      const x = padding.left + (chartWidth / Math.max(safeData.length - 1, 1)) * index;
      const y = padding.top + chartHeight - ((item.revenue - min) / range) * chartHeight;
      return { ...item, x, y };
    });
    const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    const areaPath = `${path} L ${points[points.length - 1].x.toFixed(1)} ${height - padding.bottom} L ${points[0].x.toFixed(1)} ${height - padding.bottom} Z`;
    const gradientId = `${chartId}Gradient`;

    return `
      <svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="收入趋势图">
        <defs>
          <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#12b8c8" stop-opacity=".22"></stop>
            <stop offset="100%" stop-color="#12b8c8" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <path class="chart-grid" d="M ${padding.left} ${padding.top} H ${width - padding.right} M ${padding.left} ${padding.top + chartHeight / 2} H ${width - padding.right} M ${padding.left} ${height - padding.bottom} H ${width - padding.right}"></path>
        <path class="chart-area" fill="url(#${gradientId})" d="${areaPath}"></path>
        <path class="chart-line" d="${path}"></path>
        ${points.map((point) => `
          <circle class="chart-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4"></circle>
          <text class="chart-label" x="${point.x.toFixed(1)}" y="${height - 14}" text-anchor="middle">${escapeHTML(point.label)}</text>
        `).join("")}
        <text class="chart-value" x="${points[points.length - 1].x.toFixed(1)}" y="${Math.max(14, points[points.length - 1].y - 10).toFixed(1)}" text-anchor="end">${formatCurrency(points[points.length - 1].revenue)}</text>
      </svg>`;
  }

  function getTrendPlanStore() {
    try {
      return JSON.parse(localStorage.getItem(TREND_PLAN_KEY)) || {};
    } catch (error) {
      console.warn("趋势目标读取失败。", error);
      return {};
    }
  }

  function getMonthPlan(monthKey, monthlyRevenue = 0) {
    const saved = getTrendPlanStore()[monthKey] || {};
    return {
      liveCount: toNumber(saved.liveCount),
      targetRevenue: toNumber(saved.targetRevenue),
      forecastRevenue: toNumber(saved.forecastRevenue),
      actualRevenue: toNumber(monthlyRevenue)
    };
  }

  function saveMonthPlan() {
    const monthKey = state.trendFilters.monthPlanPeriod || toMonthKey(new Date());
    const store = getTrendPlanStore();
    store[monthKey] = {
      liveCount: toNumber($("#monthLiveCount").value),
      targetRevenue: toNumber($("#monthTargetRevenue").value),
      forecastRevenue: toNumber($("#monthForecastRevenue").value)
    };
    localStorage.setItem(TREND_PLAN_KEY, JSON.stringify(store));
    renderMonthPlanStatus(getMonthPlan(monthKey, getMonthlyTrend(state.trends || emptyTrends(), monthKey).revenue), monthKey);
  }

  function renderMonthPlan(monthKey, monthlyRevenue) {
    const plan = getMonthPlan(monthKey, monthlyRevenue);
    $("#monthPlanPeriod").value = monthKey;
    $("#monthPlanTitle").textContent = `${formatChineseMonth(monthKey)}目标`;
    $("#monthLiveCount").value = plan.liveCount;
    $("#monthTargetRevenue").value = plan.targetRevenue;
    $("#monthForecastRevenue").value = plan.forecastRevenue;
    $("#monthActualRevenue").value = plan.actualRevenue;
    renderMonthPlanStatus(plan, monthKey);
  }

  function renderMonthPlanStatus(plan = {}, monthKey = toMonthKey(new Date())) {
    const status = $("#monthPlanStatus");
    const targetRevenue = toNumber(plan.targetRevenue);
    const actualRevenue = toNumber(plan.actualRevenue);
    const currentMonth = toMonthKey(new Date());
    let text = "进行中";
    let value = "active";
    if (targetRevenue > 0 && actualRevenue >= targetRevenue) {
      text = "已达成";
      value = "complete";
    } else if (monthKey < currentMonth) {
      text = "未达成";
      value = "missed";
    }
    status.textContent = text;
    status.dataset.status = value;
  }

  function emptyDailyTrend(dateKey) {
    return {
      date: dateKey,
      revenue: 0,
      paidUsers: 0,
      firstPaidUsers: 0,
      thousandTicketUsers: 0,
      sRevenueRate: 0,
      potentialUsers: 0,
      description: ""
    };
  }

  function emptyTrends(dateKey = toDateKey(new Date())) {
    return {
      daily: emptyDailyTrend(dateKey),
      weekly: { revenue: 0, potentialUsers: 0, trend: [] },
      monthly: { revenue: 0, potentialUsers: 0, trend: [] },
      dailyHistory: [],
      weeklyHistory: [],
      monthlyHistory: []
    };
  }

  function normalizeLiveSessionRecord(input = {}) {
    const date = input.date || input.liveDate || input.live_date || toDateKey(new Date());
    const revenue = toNumber(input.revenue ?? input.totalRevenue ?? input.total_revenue);
    const paidUsers = toNumber(input.paidUsers ?? input.giftUsers ?? input.paid_user_count);
    const firstPaidUsers = toNumber(input.firstPaidUsers ?? input.newGiftUsers ?? input.first_paid_user_count);
    const potentialUsers = toNumber(input.potentialUsers ?? input.newPotentialUsers ?? input.new_potential_user_count ?? firstPaidUsers);
    const thousandTicketUsers = toNumber(input.thousandTicketUsers ?? input.thousand_ticket_user_count);
    const sRevenue = toNumber(input.sRevenue ?? input.s_user_revenue);
    return {
      id: input.id || uid(),
      date,
      revenue,
      paidUsers,
      firstPaidUsers,
      potentialUsers,
      thousandTicketUsers,
      sRevenue,
      score: toNumber(input.score),
      rawText: input.rawText || input.raw_record_text || "",
      description: input.description || input.rawText || input.raw_record_text || "",
      createdAt: input.createdAt || input.created_at || new Date().toISOString()
    };
  }

  function buildTrendsFromLiveSessions(sessions = []) {
    const normalized = sessions
      .map(normalizeLiveSessionRecord)
      .filter((item) => item.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.createdAt) - new Date(a.createdAt));
    const latestDate = normalized[0]?.date || toDateKey(new Date());
    const dailyMap = new Map();

    normalized.forEach((session) => {
      const current = dailyMap.get(session.date) || {
        date: session.date,
        revenue: 0,
        paidUsers: 0,
        firstPaidUsers: 0,
        thousandTicketUsers: 0,
        sRevenue: 0,
        potentialUsers: 0,
        descriptions: []
      };
      current.revenue += session.revenue;
      current.paidUsers += session.paidUsers;
      current.firstPaidUsers += session.firstPaidUsers;
      current.thousandTicketUsers += session.thousandTicketUsers || session.potentialUsers;
      current.sRevenue += session.sRevenue;
      current.potentialUsers += session.potentialUsers;
      if (session.description && !current.descriptions.includes(session.description)) {
        current.descriptions.push(session.description);
      }
      dailyMap.set(session.date, current);
    });

    const dailyHistory = [...dailyMap.values()]
      .map((item) => ({
        ...item,
        sRevenueRate: item.revenue > 0 ? item.sRevenue / item.revenue : 0,
        description: item.descriptions.join("\n")
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    const weeklyMap = new Map();
    dailyHistory.forEach((item) => {
      const weekStart = toDateKey(startOfISOWeek(`${item.date}T00:00:00`));
      const week = toWeekInputValue(`${item.date}T00:00:00`);
      const current = weeklyMap.get(week) || {
        week,
        weekStart,
        label: weekStart.slice(5),
        revenue: 0,
        potentialUsers: 0
      };
      current.revenue += item.revenue;
      current.potentialUsers += item.potentialUsers;
      weeklyMap.set(week, current);
    });

    const weeklyHistory = [...weeklyMap.values()].sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
    const monthlyMap = new Map();
    dailyHistory.forEach((item) => {
      const month = item.date.slice(0, 7);
      const current = monthlyMap.get(month) || {
        month,
        label: month,
        revenue: 0,
        potentialUsers: 0
      };
      current.revenue += item.revenue;
      current.potentialUsers += item.potentialUsers;
      monthlyMap.set(month, current);
    });
    const monthlyHistory = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month));

    return {
      daily: dailyHistory[0] || emptyDailyTrend(latestDate),
      weekly: weeklyHistory.length ? {
        revenue: weeklyHistory.reduce((sum, item) => sum + item.revenue, 0),
        potentialUsers: weeklyHistory.reduce((sum, item) => sum + item.potentialUsers, 0),
        trend: weeklyHistory
      } : { revenue: 0, potentialUsers: 0, trend: [] },
      monthly: monthlyHistory.length ? {
        revenue: monthlyHistory.reduce((sum, item) => sum + item.revenue, 0),
        potentialUsers: monthlyHistory.reduce((sum, item) => sum + item.potentialUsers, 0),
        trend: monthlyHistory
      } : { revenue: 0, potentialUsers: 0, trend: [] },
      dailyHistory,
      weeklyHistory,
      monthlyHistory
    };
  }

  function syncTrendFiltersToLatestRecord() {
    const latestDate = state.trends?.dailyHistory?.[0]?.date;
    if (!latestDate) return;
    state.trendFilters.dailyDate = latestDate;
    state.trendFilters.weeklyPeriod = toWeekInputValue(`${latestDate}T00:00:00`);
    state.trendFilters.monthlyPeriod = latestDate.slice(0, 7);
  }

  function getDailyTrend(trends, dateKey) {
    const history = Array.isArray(trends.dailyHistory) ? trends.dailyHistory : [];
    if (history.length) return history.find((item) => item.date === dateKey) || emptyDailyTrend(dateKey);
    return trends.daily || emptyDailyTrend(dateKey);
  }

  function getWeeklyTrend(trends, weekValue) {
    const dailyHistory = Array.isArray(trends.dailyHistory) ? trends.dailyHistory : [];
    const start = weekInputToStartDate(weekValue);
    const days = Array.from({ length: 7 }, (_, index) => {
      const dateKey = toDateKey(addDays(start, index));
      const item = dailyHistory.find((entry) => entry.date === dateKey);
      return {
        label: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][index],
        revenue: toNumber(item?.revenue),
        potentialUsers: toNumber(item?.potentialUsers)
      };
    });
    const weeklyHistory = Array.isArray(trends.weeklyHistory) ? trends.weeklyHistory : [];
    const matchedWeek = weeklyHistory.find((item) => item.week === weekValue);
    if (dailyHistory.length) {
      return {
        revenue: days.reduce((sum, item) => sum + item.revenue, 0),
        potentialUsers: days.reduce((sum, item) => sum + item.potentialUsers, 0),
        trend: days
      };
    }
    return matchedWeek || trends.weekly || { revenue: 0, potentialUsers: 0, trend: [] };
  }

  function getMonthlyTrend(trends, monthKey) {
    const weeklyHistory = Array.isArray(trends.weeklyHistory) ? trends.weeklyHistory : [];
    const monthlyHistory = Array.isArray(trends.monthlyHistory) ? trends.monthlyHistory : [];
    const monthWeeks = weeklyHistory.filter((item) => item.weekStart?.startsWith(monthKey));
    const matchedMonth = monthlyHistory.find((item) => item.month === monthKey);
    if (monthWeeks.length) {
      return {
        revenue: monthWeeks.reduce((sum, item) => sum + item.revenue, 0),
        potentialUsers: monthWeeks.reduce((sum, item) => sum + item.potentialUsers, 0),
        trend: monthWeeks.map((item, index) => ({
          label: `第${index + 1}周`,
          revenue: item.revenue
        }))
      };
    }
    return matchedMonth
      ? { revenue: matchedMonth.revenue, potentialUsers: matchedMonth.potentialUsers, trend: [matchedMonth] }
      : (trends.monthly || { revenue: 0, potentialUsers: 0, trend: [] });
  }

  function countProfilesCreatedInRange(start, end) {
    const startTime = start.getTime();
    const endTime = end.getTime();
    return state.users.filter((user) => {
      const createdAt = new Date(user.createdAt || "");
      const time = createdAt.getTime();
      return Number.isFinite(time) && time >= startTime && time < endTime;
    }).length;
  }

  function countWeeklyNewProfiles(weekValue) {
    const start = weekInputToStartDate(weekValue);
    return countProfilesCreatedInRange(start, addDays(start, 7));
  }

  function countMonthlyNewProfiles(monthKey) {
    const [year, month] = String(monthKey || "").split("-").map(Number);
    if (!year || !month) return 0;
    return countProfilesCreatedInRange(
      new Date(year, month - 1, 1),
      new Date(year, month, 1)
    );
  }

  function closeDailyEditor() {
    $("#dailyEditForm").hidden = true;
    $("#dailyMetrics").hidden = false;
    $("#editDailyBtn").hidden = false;
    $("#deleteDailyBtn").hidden = false;
  }

  function openDailyEditor() {
    const dateKey = state.trendFilters.dailyDate || toDateKey(new Date());
    const daily = getDailyTrend(state.trends || emptyTrends(), dateKey);
    $("#editDailyRevenue").value = toNumber(daily.revenue);
    $("#editDailyPaidUsers").value = toNumber(daily.paidUsers);
    $("#editDailyThousandUsers").value = toNumber(daily.thousandTicketUsers);
    $("#editDailySRate").value = Math.round(toNumber(daily.sRevenueRate) * 1000) / 10;
    $("#editDailyDescription").value = daily.description || "";
    $("#dailyMetrics").hidden = true;
    $("#editDailyBtn").hidden = true;
    $("#deleteDailyBtn").hidden = true;
    $("#dailyEditForm").hidden = false;
  }

  function readDailyEditor() {
    return {
      revenue: Math.max(0, toNumber($("#editDailyRevenue").value)),
      paidUsers: Math.max(0, Math.trunc(toNumber($("#editDailyPaidUsers").value))),
      thousandTicketUsers: Math.max(0, Math.trunc(toNumber($("#editDailyThousandUsers").value))),
      sRevenueRate: Math.max(0, Math.min(1, toNumber($("#editDailySRate").value) / 100)),
      description: $("#editDailyDescription").value.trim()
    };
  }

  async function saveDailyEditor(event) {
    event.preventDefault();
    if (state.cloudEnabled && !state.currentUser) {
      showToast("请先登录云端账号");
      return;
    }
    const dateKey = state.trendFilters.dailyDate || toDateKey(new Date());
    const daily = readDailyEditor();
    const submitButton = $("#dailyEditForm button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "保存中…";
    try {
      if (state.cloudEnabled && state.currentUser) {
        await cloudStore.updateDailyLiveData(dateKey, daily);
        await loadCloudTrends();
      } else {
        const sameDate = (state.liveSessions || []).filter((item) => item.date === dateKey);
        const replacement = normalizeLiveSessionRecord({
          id: sameDate[0]?.id || uid(),
          date: dateKey,
          revenue: daily.revenue,
          paidUsers: daily.paidUsers,
          firstPaidUsers: sameDate.reduce((sum, item) => sum + toNumber(item.firstPaidUsers), 0),
          thousandTicketUsers: daily.thousandTicketUsers,
          potentialUsers: daily.thousandTicketUsers,
          sRevenue: Math.round(daily.revenue * daily.sRevenueRate * 100) / 100,
          createdAt: sameDate[0]?.createdAt || new Date().toISOString(),
          rawText: daily.description,
          description: daily.description
        });
        state.liveSessions = [
          replacement,
          ...(state.liveSessions || []).filter((item) => item.date !== dateKey)
        ];
        saveLocalLiveSessions();
        state.trends = buildTrendsFromLiveSessions(state.liveSessions);
      }
      closeDailyEditor();
      renderTrends();
      showToast("该日数据已更新，周和月趋势已同步");
    } catch (error) {
      console.warn("日维度数据更新失败。", error);
      showToast(error.message || "日维度数据更新失败");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "保存修改";
    }
  }

  async function deleteDailyData() {
    if (state.cloudEnabled && !state.currentUser) {
      showToast("请先登录云端账号");
      return;
    }
    const dateKey = state.trendFilters.dailyDate || toDateKey(new Date());
    if (!window.confirm(`确定删除 ${dateKey} 的全部直播数据吗？删除后周、月趋势也会同步变化。`)) return;
    const button = $("#deleteDailyBtn");
    button.disabled = true;
    button.textContent = "删除中…";
    try {
      if (state.cloudEnabled && state.currentUser) {
        await cloudStore.deleteDailyLiveData(dateKey);
        await loadCloudTrends();
      } else {
        state.liveSessions = (state.liveSessions || []).filter((item) => item.date !== dateKey);
        saveLocalLiveSessions();
        state.trends = buildTrendsFromLiveSessions(state.liveSessions);
      }
      closeDailyEditor();
      renderTrends();
      showToast("该日数据已删除，周和月趋势已同步");
    } catch (error) {
      console.warn("日维度数据删除失败。", error);
      showToast(error.message || "日维度数据删除失败");
    } finally {
      button.disabled = false;
      button.textContent = "删除";
    }
  }

  function renderTrends() {
    const trends = state.trends || emptyTrends();
    const dailyDate = state.trendFilters.dailyDate || toDateKey(new Date());
    const weeklyPeriod = state.trendFilters.weeklyPeriod || toWeekInputValue(new Date());
    const monthlyPeriod = state.trendFilters.monthlyPeriod || toMonthKey(new Date());
    const daily = getDailyTrend(trends, dailyDate);
    const weekly = getWeeklyTrend(trends, weeklyPeriod);
    const monthly = getMonthlyTrend(trends, monthlyPeriod);
    const weeklyNewProfiles = countWeeklyNewProfiles(weeklyPeriod);
    const monthlyNewProfiles = countMonthlyNewProfiles(monthlyPeriod);

    $("#dailyDate").value = dailyDate;
    $("#weeklyPeriod").value = weeklyPeriod;
    $("#monthlyPeriod").value = monthlyPeriod;
    $("#dailyPeriodLabel").textContent = formatChineseDate(`${dailyDate}T00:00:00`);
    $("#weeklyPeriodLabel").textContent = formatWeekRange(weeklyPeriod);
    $("#dailyTrendTitle").textContent = `${formatChineseDate(`${dailyDate}T00:00:00`)}数据`;
    $("#weeklyTrendTitle").textContent = `${formatWeekRange(weeklyPeriod)}周数据`;
    $("#monthlyTrendTitle").textContent = `${formatChineseMonth(monthlyPeriod)}数据`;
    const planMonth = state.trendFilters.monthPlanPeriod || toMonthKey(new Date());
    const planMonthRevenue = getMonthlyTrend(trends, planMonth).revenue;
    renderMonthPlan(planMonth, planMonthRevenue);

    $("#dailyMetrics").innerHTML = [
      metricCard("日收入", formatCurrency(daily.revenue)),
      metricCard("支持用户数", `${daily.paidUsers} 人`),
      metricCard("千票人数", `${daily.thousandTicketUsers || 0} 人`),
      metricCard("S级用户支持率", formatPercent(daily.sRevenueRate)),
      metricCard("直播描述", daily.description || "暂无描述")
    ].join("");
    $("#weeklyMetrics").innerHTML = [
      metricCard("周收入", formatCurrency(weekly.revenue)),
      metricCard("新增用户档案", `${weeklyNewProfiles} 人`)
    ].join("");
    $("#monthlyMetrics").innerHTML = [
      metricCard("月收入", formatCurrency(monthly.revenue)),
      metricCard("新增用户档案", `${monthlyNewProfiles} 人`)
    ].join("");
    $("#weeklyChart").innerHTML = renderLineChart(weekly.trend || [], "weeklyRevenue");
    $("#monthlyChart").innerHTML = renderLineChart(monthly.trend || [], "monthlyRevenue");
  }

  function switchView(viewName) {
    state.activeView = viewName;
    $$("[data-view]").forEach((view) => {
      view.hidden = view.dataset.view !== viewName;
    });
    $$("[data-view-target]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.viewTarget === viewName));
    });
  }

  function buildTagOptions(selected = []) {
    const defaultTags = window.NotebookMock.tags;
    $("#tagOptions").innerHTML = defaultTags.map((tag) => `
      <label class="check-chip">
        <input type="checkbox" name="tags" value="${escapeHTML(tag)}" ${selected.includes(tag) ? "checked" : ""}>
        <span>${escapeHTML(tag)}</span>
      </label>
    `).join("");

    $$('input[name="tags"]').forEach((input) => {
      input.addEventListener("change", () => {
        const checked = $$('input[name="tags"]:checked');
        if (checked.length > 3) {
          input.checked = false;
          $("#tagsError").textContent = "最多选择 3 个核心标签";
        } else {
          $("#tagsError").textContent = "";
        }
      });
    });

    const customTagsInput = $("#customTags");
    if (customTagsInput) {
      customTagsInput.value = selected.filter((tag) => !defaultTags.includes(tag)).join("、");
    }
  }

  function openUserForm(user = null, options = {}) {
    if (state.cloudEnabled && !state.currentUser) {
      showToast("请先登录云端账号");
      $("#authEmail").focus();
      options.onComplete?.(null);
      return;
    }
    state.userFormDraft = options.draft || null;
    state.userFormCompletion = typeof options.onComplete === "function" ? options.onComplete : null;
    $("#userForm").reset();
    $("#nicknameError").textContent = "";
    $("#tagsError").textContent = "";
    const formUser = options.draft || user || {};
    $("#userId").value = user?.id || "";
    $("#userDialogTitle").textContent = options.title || (user ? "编辑用户档案" : "新增用户");
    $("#nickname").value = formUser.nickname || "";
    $("#tier").value = formUser.tier || "C";
    $("#birthday").value = formUser.birthday || "";
    $("#occupation").value = formUser.occupation || "";
    $("#interests").value = formUser.interests || "";
    $("#recentEvent").value = formUser.recentEvent || "";
    $("#topics").value = formUser.topics || "";
    $("#amount").value = formUser.amount || 0;
    $("#supportedCount").value = formUser.supportedCount || 0;
    $("#latestSingleSpendAmount").value = formUser.latestSingleSpendAmount || 0;
    $("#highSingleSpendCount").value = formUser.highSingleSpendCount || 0;
    $("#maxSingleSpendAmount").value = formUser.maxSingleSpendAmount || 0;
    $("#firstInteraction").value = toDateInput(formUser.firstInteraction || "");
    $("#lastInteraction").value = toDateInput(formUser.lastInteraction || "");
    $("#isWillingToReply").checked = Boolean(formUser.isWillingToReply);
    $("#isNoPurpose").checked = formUser.isNoPurpose !== false;
    $("#hasOfflineMealRequest").checked = Boolean(formUser.hasOfflineMealRequest);
    $("#isOnlyRankAndChat").checked = Boolean(formUser.isOnlyRankAndChat);
    $("#maintenance").value = formUser.maintenance || "";
    buildTagOptions(formUser.manualTags || []);
    $("#userDialog").showModal();
    requestAnimationFrame(() => $("#nickname").focus());
  }

  function openDetail(id) {
    const user = state.users.find((item) => item.id === id);
    if (!user) return;
    state.detailUserId = id;
    const rows = [
      ["职业", user.occupation || "未记录"],
      ["兴趣", user.interests || "未记录"],
      ["生日", user.birthday ? `${user.birthday}（${getZodiacSign(user.birthday) || "未识别星座"}）` : "未知"],
      ["首次互动时间", formatDate(user.firstInteraction)],
      ["最近互动时间", formatDate(user.lastInteraction)],
      ["近期事件", user.recentEvent || "未记录"],
      ["聊过的话题", user.topics || "未记录"],
      ["消费情况", `累计 ¥ ${Number(user.amount || 0).toLocaleString("zh-CN")}`],
      ["分层来源", user.tierSource === "system" ? "系统根据直播互动自动判定" : "人工设定"],
      ["本月支持次数", `${user.supportedCount || 0} 次`],
      ["支持率", `${formatPercent(user.supportRate || 0)}（本月支持 ${user.supportedCount || 0} / 直播 ${user.totalLiveCount || 0}）`],
      ["单次消费", `最近 ¥ ${Number(user.latestSingleSpendAmount || 0).toLocaleString("zh-CN")}；最高 ¥ ${Number(user.maxSingleSpendAmount || 0).toLocaleString("zh-CN")}；单笔 >1000 次数 ${user.highSingleSpendCount || 0}`],
      ["行为字段", [
        user.isWillingToReply ? "愿意接话" : "未记录接话",
        user.isNoPurpose ? "无目的" : "有目的/需谨慎",
        user.hasOfflineMealRequest ? "提出线下/吃饭请求" : "无线下请求",
        user.isOnlyRankAndChat ? "只占榜和聊天" : "非只占榜聊天"
      ].join(" · ")],
      ["命中规则", (user.matchedRules || []).join("；") || "未命中规则"],
      ["维护方式", user.maintenance || "未记录"]
    ];
    const interactions = [...(user.interactions || [])].sort((a, b) => new Date(b.time) - new Date(a.time));

    $("#detailBody").innerHTML = `
      <div class="profile-hero">
        <span class="avatar">${escapeHTML(user.nickname.slice(0, 1))}</span>
        <div>
          <h3>${escapeHTML(user.nickname)} <span class="tier tier-${user.tier}">${user.tier}</span></h3>
          <span class="level">最近互动 ${formatDate(user.lastInteraction)}</span>
        </div>
      </div>
      <div class="tags">${(user.tags || []).map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`).join("")}</div>
      <div class="detail-grid">
        ${rows.map(([key, value]) => `
          <div class="detail-row">
            <span class="detail-key">${key}</span>
            <span class="detail-value">${escapeHTML(value)}</span>
          </div>
        `).join("")}
      </div>
      <section class="timeline">
        <h3>互动记录</h3>
        ${interactions.length
          ? interactions.map((item) => `
            <div class="timeline-item">
              <time>${formatDate(item.time)}</time>
              <p>${escapeHTML(item.note || "完成一次互动")}</p>
            </div>
          `).join("")
          : '<p class="hint">还没有互动记录。</p>'}
      </section>
      <div class="detail-actions">
        <button class="primary-btn" type="button" id="recordInteraction">记录一次互动</button>
        <button class="secondary-btn" type="button" id="editUser">编辑档案</button>
        <button class="danger-btn" type="button" id="deleteUser">删除</button>
      </div>`;

    $("#detailDialog").showModal();
    $("#recordInteraction").addEventListener("click", () => openInteraction(id));
    $("#editUser").addEventListener("click", () => {
      $("#detailDialog").close();
      openUserForm(user);
    });
    $("#deleteUser").addEventListener("click", () => deleteUser(user));
  }

  function openInteraction(id) {
    const user = state.users.find((item) => item.id === id);
    $("#detailDialog").close();
    $("#interactionUserId").value = id;
    $("#interactionNote").value = "";
    $("#interactionSpend").value = 0;
    $("#interactionTotalLive").value = (user?.totalLiveCount || 0) + 1;
    $("#interactionSupported").checked = false;
    $("#interactionWilling").checked = false;
    $("#interactionOffline").checked = false;
    $("#interactionRankChat").checked = false;
    $("#interactionDialog").showModal();
    requestAnimationFrame(() => $("#interactionNote").focus());
  }

  async function deleteUser(user) {
    if (!window.confirm(`确定删除“${user.nickname}”的档案吗？此操作不可撤销。`)) return;
    try {
      if (state.cloudEnabled && state.currentUser) {
        await cloudStore.deleteUser(user.id);
      }
      state.users = state.users.filter((item) => item.id !== user.id);
      if (!state.cloudEnabled) saveLocalUsers();
      $("#detailDialog").close();
      renderUsers();
      showToast("档案已删除");
    } catch (error) {
      console.warn("删除档案失败。", error);
      showToast(error.message || "删除失败，请稍后重试");
    }
  }

  function resetImport() {
    $("#liveText").value = "";
    $("#captureDate").value = toDateKey(new Date());
    updateCaptureDateDisplay();
    $("#captureRevenue").value = 0;
    $("#captureGiftUsers").value = 0;
    $("#captureThousandTicketUsers").value = 0;
    $("#captureSRate").value = 0;
    $("#imageInput").value = "";
    $("#recognizeProgress").hidden = true;
    $("#progressBar").style.width = "0";
    clearImagePreviews();
    state.recognizedAudience = [];
    state.profilePromptAudience = [];
    state.recognitionDate = "";
    state.hasParsedLiveCapture = false;
    $("#recordBtn").disabled = true;
  }

  function clearImagePreviews() {
    state.imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    state.imagePreviewUrls = [];
    state.selectedImages = [];
    renderImagePreviews();
  }

  function renderImagePreviews() {
    const prompt = $("#uploadPrompt");
    const grid = $("#imagePreviewGrid");
    const dropzone = $("#dropzone");
    if (!prompt || !grid || !dropzone) return;
    const hasImages = state.selectedImages.length > 0;
    prompt.hidden = hasImages;
    grid.hidden = !hasImages;
    dropzone.classList.toggle("has-preview", hasImages);
    if (!hasImages) {
      grid.innerHTML = "";
      return;
    }
    grid.innerHTML = state.selectedImages.map((file, index) => `
      <div class="upload-preview-card">
        <img src="${state.imagePreviewUrls[index]}" alt="${escapeHTML(file.name || `直播截图 ${index + 1}`)}">
        <div class="upload-preview-meta">
          <strong>${escapeHTML(file.name || `直播截图 ${index + 1}`)}</strong>
          <small>已上传</small>
        </div>
      </div>
    `).join("");
  }

  function setImportStatus(message) {
    const hint = $("#importHint");
    if (hint) hint.textContent = message;
  }

  function collectCaptureSummary() {
    return {
      date: $("#captureDate").value || toDateKey(new Date()),
      revenue: toNumber($("#captureRevenue").value),
      giftUsers: toNumber($("#captureGiftUsers").value),
      thousandTicketUsers: toNumber($("#captureThousandTicketUsers").value),
      sRevenueRate: Math.max(0, Math.min(1, toNumber($("#captureSRate").value) / 100)),
      newGiftUsers: 0,
      score: 0
    };
  }

  function fillCaptureSummary(summary = {}, { onlyEmpty = false } = {}) {
    const fields = [
      ["captureDate", summary.date],
      ["captureRevenue", summary.revenue],
      ["captureGiftUsers", summary.giftUsers],
      ["captureThousandTicketUsers", summary.thousandTicketUsers],
      ["captureSRate", summary.sRevenueRate === undefined ? undefined : toNumber(summary.sRevenueRate) * 100]
    ];
    fields.forEach(([id, value]) => {
      if (value === undefined || value === null || value === "") return;
      const input = $(`#${id}`);
      if (!input) return;
      if (onlyEmpty && input.value && Number(input.value) !== 0) return;
      input.value = value;
    });
  }

  function captureSummaryToText(summary = collectCaptureSummary()) {
    const hasLiveData = summary.revenue || summary.giftUsers || summary.thousandTicketUsers || summary.sRevenueRate;
    if (!hasLiveData) return "";
    return [
      summary.date ? `日期：${summary.date}` : "",
      summary.revenue ? `本场总收入：${summary.revenue}` : "",
      summary.giftUsers ? `送礼人数：${summary.giftUsers}` : "",
      summary.thousandTicketUsers ? `榜单>1000人数：${summary.thousandTicketUsers}` : "",
      summary.sRevenueRate ? `S级用户支持率：${Math.round(summary.sRevenueRate * 1000) / 10}%` : ""
    ].filter(Boolean).join("\n");
  }

  function findUserByNickname(nickname) {
    const key = String(nickname || "").trim().toLowerCase();
    if (!key || key === "待确认用户") return null;
    return state.users.find((user) => String(user.nickname || "").trim().toLowerCase() === key) || null;
  }

  function audienceIdPrefix(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "").slice(0, 3);
  }

  function findUserByAudience(audience = {}) {
    const prefix = audienceIdPrefix(audience.audienceId || audience.nickname);
    if (!prefix) return null;
    return state.users.find((user) => {
      const storedId = user.audienceId || user.taggingSnapshot?.audienceId || user.nickname;
      return audienceIdPrefix(storedId) === prefix;
    }) || null;
  }

  function findSUserByAudience(audience = {}) {
    const nickname = String(audience.nickname || "").trim().toLowerCase();
    const exactNameMatch = nickname
      ? state.users.find((user) => user.tier === "S" && String(user.nickname || "").trim().toLowerCase() === nickname)
      : null;
    if (exactNameMatch) return exactNameMatch;
    const matched = findUserByAudience(audience);
    return matched?.tier === "S" ? matched : null;
  }

  function mergeRecognizedAudience(results = []) {
    const merged = new Map();
    results.flatMap((result) => result?.data?.audience || []).forEach((item = {}) => {
      const audienceId = String(item.audienceId || "").trim();
      const nickname = String(item.nickname || "").trim();
      const key = String(audienceId || nickname).toLowerCase().replace(/\s+/g, "");
      if (!key) return;
      const rank = Math.max(0, Math.trunc(toNumber(item.rank)));
      const contributionHeat = Math.max(0, toNumber(item.contributionHeat));
      const previous = merged.get(key);
      merged.set(key, {
        rank: previous?.rank && rank ? Math.min(previous.rank, rank) : (previous?.rank || rank),
        audienceId: audienceId || previous?.audienceId || "",
        nickname: nickname || previous?.nickname || "",
        contributionHeat: Math.max(previous?.contributionHeat || 0, contributionHeat),
        isFirstGift: Boolean(previous?.isFirstGift || item.isFirstGift)
      });
    });
    return [...merged.values()]
      .sort((a, b) => a.rank && b.rank ? a.rank - b.rank : b.contributionHeat - a.contributionHeat);
  }

  function buildAudienceUserUpdate(audience, existing, date) {
    const interactionDate = dateOnlyISOString(date || new Date());
    const spendAmount = Math.round((toNumber(audience.contributionHeat) / HEAT_PER_CNY) * 100) / 100;
    const interaction = {
      time: interactionDate,
      note: `直播榜单：贡献热度 ${audience.contributionHeat}，折合 ¥${spendAmount}`,
      appeared: true,
      supported: true,
      spendAmount,
      isFirstPaid: Boolean(audience.isFirstGift),
      isWillingToReply: false,
      hasOfflineMealRequest: false,
      isOnlyRankAndChat: false,
      topics: "直播榜单送礼",
      remark: `榜单第 ${audience.rank || "?"} 名`,
      rawText: `ID：${audience.audienceId || ""}；贡献热度：${audience.contributionHeat}`
    };
    const previousInteractions = Array.isArray(existing?.interactions) ? existing.interactions : [];
    const user = normalizeUser({
      ...(existing || {}),
      id: existing?.id || (state.cloudEnabled && state.currentUser ? "" : uid()),
      nickname: existing?.nickname || audience.nickname || audience.audienceId || "待确认用户",
      audienceId: existing?.audienceId || audience.audienceId || "",
      tier: existing?.tier || "C",
      tierSource: "system",
      manualTags: existing?.manualTags || [],
      occupation: existing?.occupation || "",
      interests: existing?.interests || "",
      recentEvent: `本场贡献热度 ${audience.contributionHeat}`,
      topics: existing?.topics || "由直播榜单自动更新",
      maintenance: existing?.maintenance || "",
      createdAt: existing?.createdAt || new Date().toISOString(),
      createdVia: existing ? (existing.createdVia || "manual") : "live_ranking",
      firstInteraction: existing?.firstInteraction || interactionDate,
      lastInteraction: interactionDate,
      amount: toNumber(existing?.amount) + spendAmount,
      totalLiveCount: toNumber(existing?.totalLiveCount) + 1,
      appearedCount: toNumber(existing?.appearedCount) + 1,
      supportedCount: toNumber(existing?.supportedCount) + 1,
      latestSingleSpendAmount: spendAmount,
      maxSingleSpendAmount: Math.max(toNumber(existing?.maxSingleSpendAmount), spendAmount),
      highSingleSpendCount: toNumber(existing?.highSingleSpendCount) + (spendAmount > 1000 ? 1 : 0),
      singleSpendOver200Count: toNumber(existing?.singleSpendOver200Count) + (spendAmount > 200 ? 1 : 0),
      isWillingToReply: Boolean(existing?.isWillingToReply),
      isNoPurpose: existing?.isNoPurpose !== false,
      hasOfflineMealRequest: Boolean(existing?.hasOfflineMealRequest),
      isOnlyRankAndChat: false,
      interactions: [interaction, ...previousInteractions]
    }, { recalculateTier: true, tierSource: "system" });
    return { user, interaction, spendAmount };
  }

  function audienceKey(audience = {}) {
    return String(audience.audienceId || audience.nickname || "").toLowerCase().replace(/\s+/g, "");
  }

  function shouldPromptAudienceProfile(audience = {}) {
    return (!audience.rank || audience.rank <= 3) && toNumber(audience.contributionHeat) >= MIN_PROFILE_PROMPT_HEAT;
  }

  function requestAudienceProfileDecision(audience) {
    return new Promise((resolve) => {
      const dialog = $("#audiencePromptDialog");
      const skipButton = $("#audiencePromptSkip");
      const saveButton = $("#audiencePromptSave");
      const name = audience.nickname || audience.audienceId || "未识别用户";
      let settled = false;
      $("#audiencePromptAvatar").textContent = name.slice(0, 1);
      $("#audiencePromptName").textContent = name;
      $("#audiencePromptMeta").textContent = `榜单第 ${audience.rank || "?"} 名 · 热度 ${toNumber(audience.contributionHeat).toLocaleString("zh-CN")} · ID：${audience.audienceId || "未识别"}`;

      const cleanup = () => {
        skipButton.removeEventListener("click", onSkip);
        saveButton.removeEventListener("click", onSave);
        dialog.removeEventListener("close", onClose);
      };
      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (dialog.open) dialog.close();
        resolve(value);
      };
      const onSkip = () => finish(false);
      const onSave = () => finish(true);
      const onClose = () => finish(false);

      skipButton.addEventListener("click", onSkip);
      saveButton.addEventListener("click", onSave);
      dialog.addEventListener("close", onClose);
      dialog.showModal();
    });
  }

  function openAudienceProfileForm(draft) {
    return new Promise((resolve) => {
      openUserForm(null, {
        draft,
        title: "确认新增用户档案",
        onComplete: resolve
      });
    });
  }

  async function processRecognizedAudience() {
    const candidates = state.recognizedAudience;
    const promptKeys = new Set((state.profilePromptAudience || []).map(audienceKey));
    if (!candidates.length) {
      setImportStatus("未识别到观众明细，将只记录本场直播数据。");
    }

    const processed = [];
    let newUserCount = 0;
    for (const audience of candidates) {
      const existing = findUserByAudience(audience);
      const { user: draft, interaction, spendAmount } = buildAudienceUserUpdate(
        audience,
        existing,
        state.recognitionDate || $("#captureDate").value
      );
      if (!existing) {
        if (!promptKeys.has(audienceKey(audience))) continue;
        const shouldAdd = await requestAudienceProfileDecision(audience);
        if (!shouldAdd) continue;
        const savedFromForm = await openAudienceProfileForm(draft);
        if (!savedFromForm) continue;
        processed.push({ audience, user: savedFromForm, spendAmount });
        newUserCount += 1;
        continue;
      }
      let saved;
      if (state.cloudEnabled && state.currentUser && existing) {
        const result = await cloudStore.addInteraction(existing, interaction, draft);
        saved = normalizeUser(result.user, { recalculateTier: true, tierSource: "system" });
      } else {
        saved = normalizeUser(
          await persistUser(draft, existing?.tier || null, "system"),
          { recalculateTier: true, tierSource: "system" }
        );
      }
      state.users = existing
        ? state.users.map((item) => item.id === existing.id ? saved : item)
        : [saved, ...state.users];
      if (!existing) newUserCount += 1;
      processed.push({ audience, user: saved, spendAmount });
    }

    const summary = {
      date: state.recognitionDate || $("#captureDate").value || toDateKey(new Date()),
      revenue: toNumber($("#captureRevenue").value),
      giftUsers: toNumber($("#captureGiftUsers").value),
      thousandTicketUsers: toNumber($("#captureThousandTicketUsers").value),
      newGiftUsers: candidates.filter((audience) => audience.isFirstGift && toNumber(audience.contributionHeat) >= MIN_PROFILE_PROMPT_HEAT).length,
      sRevenueRate: Math.max(0, Math.min(1, toNumber($("#captureSRate").value) / 100)),
      score: 0
    };
    const description = $("#liveText").value.trim();
    await persistLiveSession(summary, processed[0]?.user, description, "");
    if (!state.cloudEnabled) saveLocalUsers();
    renderUsers();
    setImportStatus(`已记录本场直播数据，并更新 ${processed.length} 位用户档案，其中新增 ${newUserCount} 个。`);
    showToast(processed.length ? `直播榜单已更新 ${processed.length} 位用户` : "本场直播数据已记录");
    resetImport();
    return true;
  }

  function buildLiveRecordUserUpdate(parsedUser, summary, rawText) {
    const existing = findUserByNickname(parsedUser.nickname);
    const interactionDate = dateOnlyISOString(summary.date || new Date());
    const spendAmount = toNumber(parsedUser.latestSingleSpendAmount || parsedUser.amount);
    const supported = Boolean(parsedUser.supportedCount || parsedUser.amount || spendAmount);
    const interaction = {
      time: interactionDate,
      note: `直播记录：${rawText.slice(0, 120)}`,
      appeared: true,
      supported,
      spendAmount,
      isWillingToReply: Boolean(parsedUser.isWillingToReply),
      hasOfflineMealRequest: Boolean(parsedUser.hasOfflineMealRequest),
      isOnlyRankAndChat: Boolean(parsedUser.isOnlyRankAndChat),
      topics: parsedUser.topics || "由直播记录自动导入",
      remark: parsedUser.recentEvent || rawText.slice(0, 180),
      rawText
    };
    const previousInteractions = Array.isArray(existing?.interactions) ? existing.interactions : [];

    /*
      直播记录回写用户档案规则：
      1. 累计消费金额：原累计消费金额 + 本次直播记录识别到的单次/本场消费金额。
      2. 本月支持次数：由本月互动记录中 supported=true 或 spendAmount>0 的次数自动计算。
      3. 最近单次消费：更新为本次直播记录识别到的消费金额。
      4. 单笔 >1000 次数：原次数 + 本次消费金额是否 >1000。
      5. 单笔最高消费：取原最高单笔与本次消费金额的最大值。
      6. 首次互动时间：已有则保留，没有则使用本次直播记录日期。
      7. 最近互动时间：更新为本次直播记录日期。
      8. 分层：直播记录属于系统更新，会重新计算系统分层。
    */
    return normalizeUser({
      ...(existing || {}),
      id: existing?.id || (state.cloudEnabled && state.currentUser ? "" : uid()),
      ...(!existing ? parsedUser : {}),
      nickname: existing?.nickname || parsedUser.nickname,
      tierSource: "system",
      createdAt: existing?.createdAt || new Date().toISOString(),
      createdVia: existing ? (existing.createdVia || "manual") : "live_record",
      firstInteraction: existing?.firstInteraction || interactionDate,
      lastInteraction: interactionDate,
      recentEvent: parsedUser.recentEvent || existing?.recentEvent || "",
      topics: parsedUser.topics || existing?.topics || "",
      maintenance: parsedUser.maintenance || existing?.maintenance || "",
      amount: toNumber(existing?.amount) + spendAmount,
      totalLiveCount: toNumber(existing?.totalLiveCount) + 1,
      appearedCount: toNumber(existing?.appearedCount) + 1,
      supportedCount: toNumber(existing?.supportedCount) + (supported ? 1 : 0),
      latestSingleSpendAmount: spendAmount,
      maxSingleSpendAmount: Math.max(toNumber(existing?.maxSingleSpendAmount), spendAmount),
      highSingleSpendCount: toNumber(existing?.highSingleSpendCount) + (spendAmount > 1000 ? 1 : 0),
      singleSpendOver200Count: toNumber(existing?.singleSpendOver200Count) + (spendAmount > 200 ? 1 : 0),
      isWillingToReply: Boolean(existing?.isWillingToReply || parsedUser.isWillingToReply),
      isNoPurpose: Boolean(existing?.isNoPurpose !== false && parsedUser.isNoPurpose !== false),
      hasOfflineMealRequest: Boolean(existing?.hasOfflineMealRequest || parsedUser.hasOfflineMealRequest),
      isOnlyRankAndChat: Boolean(parsedUser.isOnlyRankAndChat && !supported),
      interactions: [
        interaction,
        ...previousInteractions
      ]
    }, { recalculateTier: true, tierSource: "system" });
  }

  async function persistLiveSession(summary, user, rawText, ocrText = "") {
    const session = normalizeLiveSessionRecord({
      date: summary.date,
      revenue: summary.revenue,
      paidUsers: summary.giftUsers,
      thousandTicketUsers: summary.thousandTicketUsers,
      firstPaidUsers: summary.newGiftUsers,
      potentialUsers: summary.thousandTicketUsers,
      sRevenue: Math.round(toNumber(summary.revenue) * toNumber(summary.sRevenueRate) * 100) / 100,
      score: summary.score,
      rawText,
      description: rawText,
      ocrText
    });

    if (state.cloudEnabled && state.currentUser) {
      await cloudStore.saveLiveSession(session);
      await loadCloudTrends();
    } else {
      state.liveSessions = [session, ...(state.liveSessions || [])];
      saveLocalLiveSessions();
      state.trends = buildTrendsFromLiveSessions(state.liveSessions);
    }
    syncTrendFiltersToLatestRecord();
    renderTrends();
  }

  async function setSelectedImages(files) {
    const images = [...(files || [])].filter((file) => file?.type?.startsWith("image/"));
    if (!images.length) {
      showToast("请选择图片文件");
      return;
    }
    clearImagePreviews();
    state.selectedImages = images.slice(0, MAX_LIVE_IMAGES);
    state.imagePreviewUrls = state.selectedImages.map((file) => URL.createObjectURL(file));
    state.recognizedAudience = [];
    state.profilePromptAudience = [];
    state.recognitionDate = "";
    state.hasParsedLiveCapture = false;
    $("#recordBtn").disabled = true;
    window.NotebookAPI.warmUpProxy?.();
    $("#captureRevenue").value = 0;
    $("#captureGiftUsers").value = 0;
    $("#captureThousandTicketUsers").value = 0;
    if (images.length > MAX_LIVE_IMAGES) showToast("最多识别两张图片，已自动取前两张");
    renderImagePreviews();
    setImportStatus(`已选择 ${state.selectedImages.length} 张图片，请点击“解析”。备注可自行填写，不会被识图结果覆盖。`);
    showToast(`已选择 ${state.selectedImages.length} 张图片`);
  }

  async function recognizeImages() {
    if (!state.selectedImages.length) {
      showToast("请先选择一至两张图片");
      return;
    }
    const button = $("#parseBtn");
    const progress = $("#recognizeProgress");
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "识别中…";
    progress.hidden = false;
    $("#progressBar").style.width = "4%";
    setImportStatus(`正在识别 ${state.selectedImages.length} 张图片中的全部观众…`);

    try {
      const results = window.NotebookAPI.recognizeLiveImages
        ? await window.NotebookAPI.recognizeLiveImages(state.selectedImages, (value) => {
          $("#progressBar").style.width = `${value}%`;
        })
        : await Promise.all(state.selectedImages.map((file, index) => (
          window.NotebookAPI.recognizeLiveImage(file, (value) => {
            const total = (index * 100 + value) / state.selectedImages.length;
            $("#progressBar").style.width = `${total}%`;
          })
        )));
      const allRecognizedAudience = mergeRecognizedAudience(results);
      state.recognizedAudience = allRecognizedAudience;
      state.profilePromptAudience = allRecognizedAudience
        .filter(shouldPromptAudienceProfile)
        .slice(0, 3);
      state.recognitionDate = results.map((result) => result?.data?.summary?.date).find(Boolean) || toDateKey(new Date());
      const recognizedRevenue = results
        .map((result) => toNumber(result?.data?.summary?.revenue))
        .find((value) => value > 0) || 0;
      const recognizedGiftUsers = results
        .map((result) => toNumber(result?.data?.summary?.giftUsers))
        .find((value) => value > 0) || 0;
      const reportedThousandTicketUsers = results
        .map((result) => toNumber(result?.data?.summary?.thousandTicketUsers))
        .filter((value) => value > 0);
      const recognizedThousandTicketUsers = new Set(
        allRecognizedAudience
          .filter((item) => toNumber(item.contributionHeat) >= MIN_PROFILE_PROMPT_HEAT)
          .map((item) => String(item.audienceId || item.nickname).toLowerCase().replace(/\s+/g, ""))
          .filter(Boolean)
      ).size;
      const thousandTicketUsers = reportedThousandTicketUsers[0] || recognizedThousandTicketUsers;
      const rankedSupporters = allRecognizedAudience.filter((item) => toNumber(item.contributionHeat) > 0);
      const sSupporters = rankedSupporters.filter((item) => findSUserByAudience(item));
      const reportedTotalHeat = Math.max(0, ...results.map((result) => toNumber(result?.data?.summary?.totalHeat)));
      const totalHeat = reportedTotalHeat || rankedSupporters.reduce((sum, item) => sum + toNumber(item.contributionHeat), 0);
      const sUserHeat = sSupporters.reduce((sum, item) => sum + toNumber(item.contributionHeat), 0);
      const sRevenueRate = totalHeat > 0 ? sUserHeat / totalHeat : 0;
      $("#captureDate").value = state.recognitionDate;
      updateCaptureDateDisplay();
      $("#captureRevenue").value = recognizedRevenue.toFixed(2);
      $("#captureGiftUsers").value = recognizedGiftUsers || rankedSupporters.length;
      $("#captureThousandTicketUsers").value = thousandTicketUsers;
      $("#captureSRate").value = (sRevenueRate * 100).toFixed(1);
      state.hasParsedLiveCapture = true;
      $("#recordBtn").disabled = false;
      setImportStatus(`解析完成：已按截图总览写入上方字段，并识别 ${allRecognizedAudience.length} 位观众；前三名且热度 ≥1000 的 ${state.profilePromptAudience.length} 位会在记录时询问是否加入档案。`);
      showToast(`已识别 ${allRecognizedAudience.length} 位观众`);
    } catch (error) {
      state.hasParsedLiveCapture = false;
      $("#recordBtn").disabled = true;
      const message = error.message || "图片识别失败，请改用文字录入。";
      setImportStatus(message);
      showToast(message.slice(0, 28));
    } finally {
      button.disabled = false;
      button.textContent = originalText;
      setTimeout(() => {
        progress.hidden = true;
        $("#progressBar").style.width = "0";
      }, 500);
    }
  }

  async function parseCapture() {
    if (state.selectedImages.length) {
      await recognizeImages();
      return;
    }
    const text = $("#liveText").value.trim();
    if (!text) {
      showToast("请先选择图片或填写文字");
      return;
    }
    const button = $("#parseBtn");
    button.disabled = true;
    button.textContent = "解析中…";
    try {
      const result = await window.NotebookAPI.parseLiveText(text);
      if (result.code !== 0) throw new Error(result.message);
      fillCaptureSummary(result.data.liveSummary || {});
      state.hasParsedLiveCapture = true;
      $("#recordBtn").disabled = false;
      setImportStatus("解析完成，请确认数据后点击“记录”。");
    } catch (error) {
      state.hasParsedLiveCapture = false;
      $("#recordBtn").disabled = true;
      setImportStatus(error.message || "解析失败，请检查内容后重试。");
      showToast("直播记录解析失败");
    } finally {
      button.disabled = false;
      button.textContent = "解析";
    }
  }

  async function parseAndSave() {
    if (state.cloudEnabled && !state.currentUser) {
      showToast("请先登录云端账号");
      $("#authEmail").focus();
      return;
    }
    if (state.selectedImages.length && state.hasParsedLiveCapture) {
      const button = $("#recordBtn");
      button.disabled = true;
      button.textContent = "匹配档案中…";
      try {
        await processRecognizedAudience();
      } catch (error) {
        console.warn("直播榜单处理失败。", error);
        setImportStatus(error.message || "榜单处理失败，请稍后重试。");
        showToast("直播榜单处理失败");
      } finally {
        button.disabled = !state.hasParsedLiveCapture;
        button.textContent = "记录";
      }
      return;
    }
    const descriptionText = $("#liveText").value.trim();
    const text = [descriptionText, captureSummaryToText()].filter(Boolean).join("\n");
    if (!text) {
      showToast("请先填写文字、识别图片或补充直播数据");
      $("#liveText").focus();
      return;
    }
    const button = $("#recordBtn");
    button.disabled = true;
    button.textContent = "记录中…";
    setImportStatus("正在保存直播数据并更新用户档案…");

    try {
      const result = await window.NotebookAPI.parseLiveText(text);
      if (result.code !== 0) throw new Error(result.message);
      fillCaptureSummary(result.data.liveSummary || {}, { onlyEmpty: true });
      const liveSummary = collectCaptureSummary();
      const existing = findUserByNickname(result.data.nickname);
      const draft = buildLiveRecordUserUpdate(result.data, liveSummary, text);
      const saved = await persistUser(draft, existing?.tier || null, "system");
      const normalizedSaved = normalizeUser(saved, { recalculateTier: true, tierSource: "system" });
      state.users = existing
        ? state.users.map((item) => item.id === existing.id ? normalizedSaved : item)
        : [normalizedSaved, ...state.users];
      await persistLiveSession(liveSummary, normalizedSaved, descriptionText, result.data.text || "");
      if (!state.cloudEnabled) saveLocalUsers();
      resetImport();
      state.activeTier = "全部";
      $$(".filter-btn").forEach((item) => {
        item.setAttribute("aria-pressed", String(item.dataset.tier === "全部"));
      });
      renderUsers();
      setImportStatus(existing ? "已根据直播记录更新用户档案。" : "已自动生成档案，可打开用户详情继续完善。");
      showToast(`${existing ? "已更新" : "已记录"}用户“${draft.nickname}”，当前为 ${draft.tier} 级`);
    } catch (error) {
      setImportStatus(error.message || "解析失败，请检查文字后重试。");
      showToast("直播记录解析失败");
    } finally {
      button.disabled = !state.hasParsedLiveCapture;
      button.textContent = "记录";
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const email = $("#authEmail").value.trim();
    if (!email) {
      showToast("请先填写邮箱");
      $("#authEmail").focus();
      return;
    }
    const button = $("#sendLoginBtn");
    button.disabled = true;
    button.textContent = "发送中…";
    try {
      await cloudStore.signInWithEmail(email);
      showToast("验证码邮件已发送");
    } catch (error) {
      console.warn("发送登录链接失败。", error);
      showToast(error.message || "登录链接发送失败");
    } finally {
      button.disabled = false;
      button.textContent = "发送验证码";
    }
  }

  async function handleVerifyOtp() {
    const email = $("#authEmail").value.trim();
    const token = $("#authOtp").value.trim().replace(/\s/g, "");
    if (!email) {
      showToast("请先填写邮箱");
      $("#authEmail").focus();
      return;
    }
    if (!token) {
      showToast("请填写邮箱验证码");
      $("#authOtp").focus();
      return;
    }
    const button = $("#verifyOtpBtn");
    button.disabled = true;
    button.textContent = "验证中…";
    try {
      await cloudStore.verifyEmailOtp(email, token);
      await loadCloudData();
      showToast("登录成功");
    } catch (error) {
      console.warn("邮箱验证码登录失败。", error);
      showToast(error.message || "验证码无效或已过期");
    } finally {
      button.disabled = false;
      button.textContent = "验证码登录";
    }
  }

  async function handleGoogleLogin() {
    const button = $("#googleLoginBtn");
    button.disabled = true;
    button.textContent = "跳转中…";
    try {
      await cloudStore.signInWithGoogle();
    } catch (error) {
      console.warn("Google 登录失败。", error);
      showToast(error.message || "Google 登录失败，请检查 Supabase 配置");
      button.disabled = false;
      button.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.51Z"></path>
          <path d="M12 22c2.7 0 4.96-.9 6.62-2.43l-3.24-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.58A10 10 0 0 0 12 22Z"></path>
          <path d="M6.41 13.91A6 6 0 0 1 6.1 12c0-.66.11-1.31.31-1.91V7.51H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.49l3.35-2.58Z"></path>
          <path d="M12 5.97c1.47 0 2.78.5 3.82 1.5l2.87-2.87C16.95 2.98 14.7 2 12 2a10 10 0 0 0-8.94 5.51l3.35 2.58C7.2 7.73 9.4 5.97 12 5.97Z"></path>
        </svg>
        使用 Google 登录`;
    }
  }

  async function handleSignOut() {
    try {
      await cloudStore.signOut();
      state.currentUser = null;
      state.users = [];
      renderAuthPanel();
      renderUsers();
      showToast("已退出登录");
    } catch (error) {
      console.warn("退出登录失败。", error);
      showToast(error.message || "退出失败，请稍后重试");
    }
  }

  function bindEvents() {
    $("#authForm").addEventListener("submit", handleLogin);
    $("#verifyOtpBtn").addEventListener("click", handleVerifyOtp);
    $("#googleLoginBtn").addEventListener("click", handleGoogleLogin);
    $("#signOutBtn").addEventListener("click", handleSignOut);
    $("#addUserBtn").addEventListener("click", () => openUserForm());
    $("#search").addEventListener("input", (event) => {
      state.search = event.target.value;
      renderUsers();
    });
    $$(".filter-btn").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeTier = button.dataset.tier;
        $$(".filter-btn").forEach((item) => {
          item.setAttribute("aria-pressed", String(item === button));
        });
        renderUsers();
      });
    });
    $$("[data-view-target]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.viewTarget));
    });
    $("#dailyDate").addEventListener("change", (event) => {
      state.trendFilters.dailyDate = event.target.value || toDateKey(new Date());
      if ($("#dailyEditForm").hidden) {
        renderTrends();
      } else {
        $("#dailyPeriodLabel").textContent = formatChineseDate(`${state.trendFilters.dailyDate}T00:00:00`);
        $("#dailyTrendTitle").textContent = `${formatChineseDate(`${state.trendFilters.dailyDate}T00:00:00`)}数据`;
        showToast(`当前编辑内容将保存到 ${formatChineseDate(`${state.trendFilters.dailyDate}T00:00:00`)}`);
      }
    });
    $("#editDailyBtn").addEventListener("click", openDailyEditor);
    $("#deleteDailyBtn").addEventListener("click", deleteDailyData);
    $("#cancelDailyEditBtn").addEventListener("click", closeDailyEditor);
    $("#dailyEditForm").addEventListener("submit", saveDailyEditor);
    $("#weeklyPeriod").addEventListener("change", (event) => {
      state.trendFilters.weeklyPeriod = event.target.value || toWeekInputValue(new Date());
      renderTrends();
    });
    $("#monthlyPeriod").addEventListener("change", (event) => {
      state.trendFilters.monthlyPeriod = event.target.value || toMonthKey(new Date());
      renderTrends();
    });
    $("#monthPlanPeriod").addEventListener("change", (event) => {
      state.trendFilters.monthPlanPeriod = event.target.value || toMonthKey(new Date());
      const monthly = getMonthlyTrend(state.trends || emptyTrends(), state.trendFilters.monthPlanPeriod);
      renderMonthPlan(state.trendFilters.monthPlanPeriod, monthly.revenue);
    });
    ["monthLiveCount", "monthTargetRevenue", "monthForecastRevenue", "monthActualRevenue"].forEach((id) => {
      $(`#${id}`).addEventListener("input", saveMonthPlan);
    });

    $("#userForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const nickname = $("#nickname").value.trim();
      if (!nickname) {
        $("#nicknameError").textContent = "请填写昵称";
        $("#nickname").focus();
        return;
      }
      const id = $("#userId").value;
      const existing = state.users.find((user) => user.id === id);
      const draftSource = state.userFormDraft || {};
      const manualTags = dedupe([
        ...$$('input[name="tags"]:checked').map((input) => input.value),
        ...splitTags($("#customTags").value)
      ]);
      const manualTier = $("#tier").value || existing?.tier || "C";
      const submitButton = $("#userForm .primary-btn[type='submit']");
      submitButton.disabled = true;
      submitButton.textContent = "保存中…";

      const user = normalizeUser({
        id: id || (state.cloudEnabled && state.currentUser ? "" : uid()),
        nickname,
        audienceId: existing?.audienceId || draftSource.audienceId || "",
        level: existing?.level || draftSource.level || "",
        tier: manualTier,
        tierSource: "manual",
        birthday: $("#birthday").value,
        manualTags,
        occupation: $("#occupation").value.trim(),
        interests: $("#interests").value.trim(),
        recentEvent: $("#recentEvent").value.trim(),
        topics: $("#topics").value.trim(),
        amount: Number($("#amount").value || 0),
        totalLiveCount: Number(existing?.totalLiveCount ?? draftSource.totalLiveCount ?? 0),
        appearedCount: Number(existing?.appearedCount ?? draftSource.appearedCount ?? 0),
        supportedCount: Number($("#supportedCount").value || 0),
        latestSingleSpendAmount: Number($("#latestSingleSpendAmount").value || 0),
        maxSingleSpendAmount: Number($("#maxSingleSpendAmount").value || 0),
        highSingleSpendCount: Number($("#highSingleSpendCount").value || 0),
        isWillingToReply: $("#isWillingToReply").checked,
        isNoPurpose: $("#isNoPurpose").checked && !$("#hasOfflineMealRequest").checked,
        hasOfflineMealRequest: $("#hasOfflineMealRequest").checked,
        isOnlyRankAndChat: $("#isOnlyRankAndChat").checked,
        maintenance: $("#maintenance").value.trim(),
        createdAt: existing?.createdAt || draftSource.createdAt || new Date().toISOString(),
        firstInteraction: dateOnlyISOString($("#firstInteraction").value) || existing?.firstInteraction || "",
        lastInteraction: dateOnlyISOString($("#lastInteraction").value) || existing?.lastInteraction || "",
        createdVia: existing?.createdVia || draftSource.createdVia || "manual",
        interactions: existing?.interactions || draftSource.interactions || []
      });
      try {
        const saved = await persistUser(user, existing?.tier || null, "manual");
        const normalized = normalizeUser(saved);
        state.users = existing
          ? state.users.map((item) => item.id === id ? normalized : item)
          : [normalized, ...state.users];
        if (!state.cloudEnabled) saveLocalUsers();
        const completion = state.userFormCompletion;
        state.userFormCompletion = null;
        state.userFormDraft = null;
        if (completion) completion(normalized);
        $("#userDialog").close();
        renderUsers();
        showToast(`${existing ? "档案已更新" : "新用户已收进记录本"}，当前为 ${normalized.tier} 级`);
      } catch (error) {
        console.warn("保存档案失败。", error);
        showToast(error.message || "保存失败，请稍后重试");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "保存档案";
      }
    });

    $("#interactionForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const user = state.users.find((item) => item.id === $("#interactionUserId").value);
      if (!user) return;
      const now = dateOnlyISOString(new Date());
      const spendAmount = Number($("#interactionSpend").value || 0);
      const supported = $("#interactionSupported").checked || spendAmount > 0;
      const interaction = {
        time: now,
        note: $("#interactionNote").value.trim() || "完成一次互动",
        appeared: true,
        supported,
        spendAmount,
        isWillingToReply: $("#interactionWilling").checked,
        hasOfflineMealRequest: $("#interactionOffline").checked,
        isOnlyRankAndChat: $("#interactionRankChat").checked,
        topics: $("#interactionNote").value.trim(),
        remark: $("#interactionNote").value.trim()
      };
      const updated = normalizeUser({
        ...user,
        tierSource: "system",
        firstInteraction: user.firstInteraction || now,
        lastInteraction: now,
        amount: Number(user.amount || 0) + spendAmount,
        totalLiveCount: Math.max(Number($("#interactionTotalLive").value || 0), Number(user.totalLiveCount || 0)),
        appearedCount: Number(user.appearedCount || 0) + 1,
        supportedCount: Number(user.supportedCount || 0) + (supported ? 1 : 0),
        latestSingleSpendAmount: spendAmount,
        maxSingleSpendAmount: Math.max(Number(user.maxSingleSpendAmount || 0), spendAmount),
        highSingleSpendCount: Number(user.highSingleSpendCount || 0) + (spendAmount > 1000 ? 1 : 0),
        singleSpendOver200Count: Number(user.singleSpendOver200Count || 0) + (spendAmount > 200 ? 1 : 0),
        isWillingToReply: Boolean(user.isWillingToReply || $("#interactionWilling").checked),
        isNoPurpose: Boolean(user.isNoPurpose !== false && !$("#interactionOffline").checked),
        hasOfflineMealRequest: Boolean(user.hasOfflineMealRequest || $("#interactionOffline").checked),
        isOnlyRankAndChat: Boolean($("#interactionRankChat").checked && !supported),
        interactions: [
          interaction,
          ...(user.interactions || [])
        ]
      }, { recalculateTier: true, tierSource: "system" });
      const submitButton = $("#interactionForm .primary-btn[type='submit']");
      submitButton.disabled = true;
      submitButton.textContent = "保存中…";
      try {
        let savedUser = updated;
        if (state.cloudEnabled && state.currentUser) {
          const result = await cloudStore.addInteraction(user, interaction, updated);
          savedUser = normalizeUser(result.user, { recalculateTier: true, tierSource: "system" });
        } else {
          saveLocalUsers();
        }
        state.users = state.users.map((item) => item.id === user.id ? savedUser : item);
        if (!state.cloudEnabled) saveLocalUsers();
        $("#interactionDialog").close();
        renderUsers();
        showToast(`互动已记录，自动更新为 ${savedUser.tier} 级`);
      } catch (error) {
        console.warn("互动记录保存失败。", error);
        showToast(error.message || "互动保存失败，请稍后重试");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "记下这次互动";
      }
    });

    $$("[data-close]").forEach((button) => {
      button.addEventListener("click", () => document.getElementById(button.dataset.close).close());
    });
    $$("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
    $("#userDialog").addEventListener("close", () => {
      if (state.userFormCompletion) {
        const completion = state.userFormCompletion;
        state.userFormCompletion = null;
        completion(null);
      }
      state.userFormDraft = null;
    });

    $("#imageInput").addEventListener("change", (event) => setSelectedImages(event.target.files));
    $("#captureDate").addEventListener("change", updateCaptureDateDisplay);
    const dropzone = $("#dropzone");
    ["dragenter", "dragover"].forEach((type) => {
      dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        dropzone.classList.add("dragging");
      });
    });
    ["dragleave", "drop"].forEach((type) => {
      dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        dropzone.classList.remove("dragging");
      });
    });
    dropzone.addEventListener("drop", (event) => setSelectedImages(event.dataTransfer.files));
    $("#parseBtn").addEventListener("click", parseCapture);
    $("#recordBtn").addEventListener("click", parseAndSave);
  }

  async function init() {
    buildTagOptions();
    $("#captureDate").value = toDateKey(new Date());
    updateCaptureDateDisplay();
    bindEvents();
    renderAuthPanel();
    switchView(state.activeView);
    await loadCloudData();

    if (state.cloudEnabled && cloudStore.client) {
      cloudStore.client.auth.onAuthStateChange(async (_event, session) => {
        state.currentUser = session?.user || null;
        await loadCloudData();
      });
    }
  }

  init();
})();
