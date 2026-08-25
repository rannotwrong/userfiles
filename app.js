(function () {
  const STORAGE_KEY = "user_profile_notebook_v2";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => globalThis.crypto?.randomUUID?.() || `u_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  const AUTO_TAGS = ["高额支持", "稳定陪伴", "氛围带动", "点歌偏好", "情绪支持", "预算敏感", "新进观望", "潜水守候", "目的用户"];
  const toNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const toBoolean = (value, fallback = false) => typeof value === "boolean" ? value : fallback;

  const state = {
    users: loadUsers(),
    activeView: "profiles",
    activeTier: "全部",
    search: "",
    selectedImage: null,
    previewUrl: "",
    detailUserId: null
  };

  function loadUsers() {
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

  function getUserMetrics(user) {
    const interactions = Array.isArray(user.interactions) ? user.interactions : [];
    const appearedFromLogs = interactions.filter((item) => item.appeared !== false).length;
    const supportedFromLogs = interactions.filter((item) => item.supported || toNumber(item.spendAmount) > 0).length;
    const spendAmounts = interactions.map((item) => toNumber(item.spendAmount));
    const totalSpendFromLogs = spendAmounts.reduce((sum, value) => sum + value, 0);
    const latestSpendFromLogs = spendAmounts.find((value) => value > 0) || 0;
    const highSingleFromLogs = spendAmounts.filter((value) => value > 1000).length;
    const singleOver200FromLogs = spendAmounts.filter((value) => value > 200).length;
    const appearedCount = Math.max(toNumber(user.appearedCount), appearedFromLogs);
    const supportedCount = Math.max(toNumber(user.supportedCount), supportedFromLogs);
    const totalLiveCount = Math.max(toNumber(user.totalLiveCount), appearedCount, supportedCount);
    const totalSpendAmount = Math.max(toNumber(user.amount), totalSpendFromLogs);
    const latestSingleSpendAmount = Math.max(toNumber(user.latestSingleSpendAmount), latestSpendFromLogs);
    const highSingleSpendCount = Math.max(toNumber(user.highSingleSpendCount), highSingleFromLogs);
    const singleSpendOver200Count = Math.max(toNumber(user.singleSpendOver200Count), singleOver200FromLogs, latestSingleSpendAmount > 200 ? 1 : 0);
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
      (metrics.supportRate > 0.3 && metrics.latestSingleSpendAmount > 500) ||
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
    return dedupe(tags);
  }

  function normalizeUser(user) {
    const manualTags = Array.isArray(user.manualTags)
      ? user.manualTags
      : (Array.isArray(user.tags) ? user.tags.filter((tag) => !AUTO_TAGS.includes(tag)) : []);
    const metrics = getUserMetrics(user);
    const classification = classifyTier(metrics);
    const autoTags = inferAutoTags(user, metrics);
    return {
      ...user,
      tier: classification.tier,
      manualTags,
      autoTags,
      tags: dedupe([...autoTags, ...manualTags]),
      amount: metrics.totalSpendAmount,
      totalLiveCount: metrics.totalLiveCount,
      appearedCount: metrics.appearedCount,
      supportedCount: metrics.supportedCount,
      supportRate: metrics.supportRate,
      latestSingleSpendAmount: metrics.latestSingleSpendAmount,
      highSingleSpendCount: metrics.highSingleSpendCount,
      singleSpendOver200Count: metrics.singleSpendOver200Count,
      isWillingToReply: metrics.isWillingToReply,
      isNoPurpose: metrics.isNoPurpose,
      hasOfflineMealRequest: metrics.hasOfflineMealRequest,
      isOnlyRankAndChat: metrics.isOnlyRankAndChat,
      matchedRules: [classification.rule],
      taggingSnapshot: metrics
    };
  }

  function saveUsers() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.users));
    } catch (error) {
      showToast("本地保存失败，请检查浏览器存储权限");
      console.warn("本地档案保存失败。", error);
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

  function formatDate(value, withTime = false) {
    if (!value) return "尚未记录";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "尚未记录";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
    }).format(date);
  }

  function toLocalInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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

  function updateStats() {
    const now = new Date();
    $("#statTotal").textContent = state.users.length;
    $("#statA").textContent = state.users.filter((user) => user.tier === "S").length;
    $("#statNew").textContent = state.users.filter((user) => {
      const created = new Date(user.createdAt);
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
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
                <span class="level">${escapeHTML(user.level || "普通用户")}</span>
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
              <span class="meta-label">支持率 / 消费</span>
              <span class="meta-value">${formatPercent(user.supportRate || 0)} · ¥ ${Number(user.amount || 0).toLocaleString("zh-CN")}</span>
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

  function metricCard(label, value, hint = "") {
    return `
      <article class="metric-card">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(value)}</strong>
        ${hint ? `<small>${escapeHTML(hint)}</small>` : ""}
      </article>`;
  }

  function renderLineChart(data, chartId) {
    const values = data.map((item) => item.revenue);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const width = 640;
    const height = 220;
    const padding = { top: 28, right: 24, bottom: 38, left: 24 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const range = Math.max(max - min, 1);
    const points = data.map((item, index) => {
      const x = padding.left + (chartWidth / Math.max(data.length - 1, 1)) * index;
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

  function renderTrends() {
    const trends = window.NotebookMock.liveTrends;
    $("#dailyPeriod").textContent = trends.daily.date;
    $("#dailyMetrics").innerHTML = [
      metricCard("日收入", formatCurrency(trends.daily.revenue), "今日直播成交"),
      metricCard("付费用户数", `${trends.daily.paidUsers} 人`, "完成支付的用户"),
      metricCard("首次付费用户", `${trends.daily.firstPaidUsers} 人`, "首次完成支付"),
      metricCard("S级用户付费率", formatPercent(trends.daily.sRevenueRate), "S级用户收入 / 总收入"),
      metricCard("新增潜力用户数", `${trends.daily.potentialUsers} 人`, "新增 A/B 潜力池")
    ].join("");
    $("#weeklyMetrics").innerHTML = [
      metricCard("周收入", formatCurrency(trends.weekly.revenue), "本周累计"),
      metricCard("新增潜力用户数", `${trends.weekly.potentialUsers} 人`, "本周新增")
    ].join("");
    $("#monthlyMetrics").innerHTML = [
      metricCard("月收入", formatCurrency(trends.monthly.revenue), "本月累计"),
      metricCard("新增潜力用户数", `${trends.monthly.potentialUsers} 人`, "本月新增")
    ].join("");
    $("#weeklyChart").innerHTML = renderLineChart(trends.weekly.trend, "weeklyRevenue");
    $("#monthlyChart").innerHTML = renderLineChart(trends.monthly.trend, "monthlyRevenue");
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
    $("#tagOptions").innerHTML = window.NotebookMock.tags.map((tag) => `
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
  }

  function openUserForm(user = null) {
    $("#userForm").reset();
    $("#nicknameError").textContent = "";
    $("#tagsError").textContent = "";
    $("#userId").value = user?.id || "";
    $("#userDialogTitle").textContent = user ? "编辑用户档案" : "新增用户";
    $("#nickname").value = user?.nickname || "";
    $("#level").value = user?.level || "";
    $("#tier").value = user?.tier || "C";
    $("#occupation").value = user?.occupation || "";
    $("#interests").value = user?.interests || "";
    $("#recentEvent").value = user?.recentEvent || "";
    $("#topics").value = user?.topics || "";
    $("#amount").value = user?.amount || 0;
    $("#totalLiveCount").value = user?.totalLiveCount || 0;
    $("#appearedCount").value = user?.appearedCount || 0;
    $("#supportedCount").value = user?.supportedCount || 0;
    $("#latestSingleSpendAmount").value = user?.latestSingleSpendAmount || 0;
    $("#highSingleSpendCount").value = user?.highSingleSpendCount || 0;
    $("#lastInteraction").value = toLocalInput(user?.lastInteraction || new Date().toISOString());
    $("#isWillingToReply").checked = Boolean(user?.isWillingToReply);
    $("#isNoPurpose").checked = user?.isNoPurpose !== false;
    $("#hasOfflineMealRequest").checked = Boolean(user?.hasOfflineMealRequest);
    $("#isOnlyRankAndChat").checked = Boolean(user?.isOnlyRankAndChat);
    $("#maintenance").value = user?.maintenance || "";
    buildTagOptions(user?.manualTags || []);
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
      ["近期事件", user.recentEvent || "未记录"],
      ["聊过的话题", user.topics || "未记录"],
      ["消费情况", `累计 ¥ ${Number(user.amount || 0).toLocaleString("zh-CN")}`],
      ["支持率", `${formatPercent(user.supportRate || 0)}（支持 ${user.supportedCount || 0} / 直播 ${user.totalLiveCount || 0}）`],
      ["单次消费", `最近 ¥ ${Number(user.latestSingleSpendAmount || 0).toLocaleString("zh-CN")}；单笔 >1000 次数 ${user.highSingleSpendCount || 0}`],
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
          <span class="level">${escapeHTML(user.level || "普通用户")} · 最近互动 ${formatDate(user.lastInteraction)}</span>
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
              <time>${formatDate(item.time, true)}</time>
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

  function deleteUser(user) {
    if (!window.confirm(`确定删除“${user.nickname}”的档案吗？此操作不可撤销。`)) return;
    state.users = state.users.filter((item) => item.id !== user.id);
    saveUsers();
    $("#detailDialog").close();
    renderUsers();
    showToast("档案已删除");
  }

  function resetImport() {
    $("#liveText").value = "";
    $("#imageInput").value = "";
    $("#previewWrap").hidden = true;
    $("#recognizeProgress").hidden = true;
    $("#progressBar").style.width = "0";
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = "";
    state.selectedImage = null;
  }

  function setSelectedImage(file) {
    if (!file || !file.type.startsWith("image/")) {
      showToast("请选择图片文件");
      return;
    }
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.selectedImage = file;
    state.previewUrl = URL.createObjectURL(file);
    $("#imagePreview").src = state.previewUrl;
    $("#imageName").textContent = file.name;
    $("#previewWrap").hidden = false;
    $("#importHint").textContent = "图片只在当前页面本地预览，不会上传。";
  }

  async function recognizeImage() {
    if (!state.selectedImage) {
      showToast("请先选择一张图片");
      return;
    }
    const button = $("#recognizeBtn");
    const progress = $("#recognizeProgress");
    button.disabled = true;
    button.textContent = "识别中…";
    progress.hidden = false;
    $("#progressBar").style.width = "4%";
    $("#importHint").textContent = "正在模拟识别图片文字…";

    try {
      const result = await window.NotebookAPI.recognizeLiveImage(state.selectedImage, (value) => {
        $("#progressBar").style.width = `${value}%`;
      });
      const current = $("#liveText").value.trim();
      $("#liveText").value = [current, result.data.text].filter(Boolean).join("\n");
      $("#importHint").textContent = `识别完成，模拟置信度 ${Math.round(result.data.confidence * 100)}%。请检查文字后记录。`;
      showToast("图片文字已识别");
    } catch (error) {
      $("#importHint").textContent = error.message || "图片识别失败，请改用文字录入。";
      showToast("图片识别失败");
    } finally {
      button.disabled = false;
      button.textContent = "识别图片";
      setTimeout(() => {
        progress.hidden = true;
        $("#progressBar").style.width = "0";
      }, 500);
    }
  }

  async function parseAndSave() {
    const text = $("#liveText").value.trim();
    if (!text) {
      showToast("请先填写文字或识别图片");
      $("#liveText").focus();
      return;
    }
    const button = $("#parseBtn");
    button.disabled = true;
    button.textContent = "解析中…";
    $("#importHint").textContent = "正在提取昵称、分层、标签与消费信息…";

    try {
      const result = await window.NotebookAPI.parseLiveText(text);
      if (result.code !== 0) throw new Error(result.message);
      const now = new Date().toISOString();
      const draft = normalizeUser({
        id: uid(),
        ...result.data,
        createdAt: now,
        lastInteraction: now,
        interactions: [{
          time: now,
          note: `直播记录：${text.slice(0, 120)}`,
          appeared: true,
          supported: Boolean(result.data.supportedCount || result.data.amount),
          spendAmount: Number(result.data.latestSingleSpendAmount || result.data.amount || 0),
          isWillingToReply: Boolean(result.data.isWillingToReply),
          hasOfflineMealRequest: Boolean(result.data.hasOfflineMealRequest),
          isOnlyRankAndChat: Boolean(result.data.isOnlyRankAndChat)
        }]
      });
      state.users.unshift(draft);
      saveUsers();
      resetImport();
      state.activeTier = "全部";
      $$(".filter-btn").forEach((item) => {
        item.setAttribute("aria-pressed", String(item.dataset.tier === "全部"));
      });
      renderUsers();
      $("#importHint").textContent = "已自动归档，可打开用户详情继续完善。";
      showToast(`已记录用户“${draft.nickname}”，自动判为 ${draft.tier} 级`);
    } catch (error) {
      $("#importHint").textContent = error.message || "解析失败，请检查文字后重试。";
      showToast("直播记录解析失败");
    } finally {
      button.disabled = false;
      button.textContent = "解析并记录";
    }
  }

  function bindEvents() {
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

    $("#userForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const nickname = $("#nickname").value.trim();
      if (!nickname) {
        $("#nicknameError").textContent = "请填写昵称";
        $("#nickname").focus();
        return;
      }
      const id = $("#userId").value;
      const existing = state.users.find((user) => user.id === id);
      const manualTags = $$('input[name="tags"]:checked').map((input) => input.value);
      const user = normalizeUser({
        id: id || uid(),
        nickname,
        level: $("#level").value.trim(),
        manualTags,
        occupation: $("#occupation").value.trim(),
        interests: $("#interests").value.trim(),
        recentEvent: $("#recentEvent").value.trim(),
        topics: $("#topics").value.trim(),
        amount: Number($("#amount").value || 0),
        totalLiveCount: Number($("#totalLiveCount").value || 0),
        appearedCount: Number($("#appearedCount").value || 0),
        supportedCount: Number($("#supportedCount").value || 0),
        latestSingleSpendAmount: Number($("#latestSingleSpendAmount").value || 0),
        highSingleSpendCount: Number($("#highSingleSpendCount").value || 0),
        isWillingToReply: $("#isWillingToReply").checked,
        isNoPurpose: $("#isNoPurpose").checked && !$("#hasOfflineMealRequest").checked,
        hasOfflineMealRequest: $("#hasOfflineMealRequest").checked,
        isOnlyRankAndChat: $("#isOnlyRankAndChat").checked,
        maintenance: $("#maintenance").value.trim(),
        createdAt: existing?.createdAt || new Date().toISOString(),
        lastInteraction: $("#lastInteraction").value ? new Date($("#lastInteraction").value).toISOString() : "",
        interactions: existing?.interactions || []
      });
      state.users = existing
        ? state.users.map((item) => item.id === id ? user : item)
        : [user, ...state.users];
      saveUsers();
      $("#userDialog").close();
      renderUsers();
      showToast(`${existing ? "档案已更新" : "新用户已收进记录本"}，自动判为 ${user.tier} 级`);
    });

    $("#interactionForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const user = state.users.find((item) => item.id === $("#interactionUserId").value);
      if (!user) return;
      const now = new Date().toISOString();
      const spendAmount = Number($("#interactionSpend").value || 0);
      const supported = $("#interactionSupported").checked || spendAmount > 0;
      const updated = normalizeUser({
        ...user,
        lastInteraction: now,
        amount: Number(user.amount || 0) + spendAmount,
        totalLiveCount: Math.max(Number($("#interactionTotalLive").value || 0), Number(user.totalLiveCount || 0)),
        appearedCount: Number(user.appearedCount || 0) + 1,
        supportedCount: Number(user.supportedCount || 0) + (supported ? 1 : 0),
        latestSingleSpendAmount: spendAmount,
        highSingleSpendCount: Number(user.highSingleSpendCount || 0) + (spendAmount > 1000 ? 1 : 0),
        singleSpendOver200Count: Number(user.singleSpendOver200Count || 0) + (spendAmount > 200 ? 1 : 0),
        isWillingToReply: Boolean(user.isWillingToReply || $("#interactionWilling").checked),
        isNoPurpose: Boolean(user.isNoPurpose !== false && !$("#interactionOffline").checked),
        hasOfflineMealRequest: Boolean(user.hasOfflineMealRequest || $("#interactionOffline").checked),
        isOnlyRankAndChat: Boolean($("#interactionRankChat").checked && !supported),
        interactions: [
        {
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
        },
        ...(user.interactions || [])
        ]
      });
      state.users = state.users.map((item) => item.id === user.id ? updated : item);
      saveUsers();
      $("#interactionDialog").close();
      renderUsers();
      showToast(`互动已记录，自动更新为 ${updated.tier} 级`);
    });

    $$("[data-close]").forEach((button) => {
      button.addEventListener("click", () => document.getElementById(button.dataset.close).close());
    });
    $$("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    });

    $("#imageInput").addEventListener("change", (event) => setSelectedImage(event.target.files[0]));
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
    dropzone.addEventListener("drop", (event) => setSelectedImage(event.dataTransfer.files[0]));
    $("#recognizeBtn").addEventListener("click", recognizeImage);
    $("#parseBtn").addEventListener("click", parseAndSave);
  }

  function init() {
    saveUsers();
    $("#dateStamp").textContent = new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    }).format(new Date());
    buildTagOptions();
    bindEvents();
    renderUsers();
    renderTrends();
    switchView(state.activeView);
  }

  init();
})();
