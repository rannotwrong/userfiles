(function () {
  const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
  const uid = () => globalThis.crypto?.randomUUID?.() || `u_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  window.NotebookMock = {
    tags: ["高额支持", "稳定陪伴", "氛围带动", "点歌偏好", "情绪支持", "预算敏感", "新进观望", "潜水守候", "目的用户"],
    users: [
      {
        id: uid(),
        nickname: "小满",
        level: "年度陪伴会员",
        tier: "S",
        tags: ["高额支持", "稳定陪伴", "氛围带动"],
        occupation: "自由职业",
        interests: "点歌、聊天、夜间陪播",
        recentEvent: "最近几乎每场都来，愿意接话暖场。",
        topics: "点歌、日常情绪、直播间冷场接话",
        amount: 12800,
        totalLiveCount: 8,
        appearedCount: 7,
        supportedCount: 5,
        latestSingleSpendAmount: 2800,
        highSingleSpendCount: 3,
        singleSpendOver200Count: 5,
        isWillingToReply: true,
        isNoPurpose: true,
        hasOfflineMealRequest: false,
        isOnlyRankAndChat: false,
        maintenance: "稳定回应和适度私信关心，记住偏好和近况。",
        createdAt: daysAgo(8),
        lastInteraction: daysAgo(3),
        interactions: [
          { time: daysAgo(3), note: "送礼 2800 元，帮忙接话暖场。", appeared: true, supported: true, spendAmount: 2800, isWillingToReply: true },
          { time: daysAgo(5), note: "点歌并陪播到下播。", appeared: true, supported: true, spendAmount: 1800, isWillingToReply: true },
          { time: daysAgo(8), note: "送礼 3200 元，直播间主动带话题。", appeared: true, supported: true, spendAmount: 3200, isWillingToReply: true }
        ]
      },
      {
        id: uid(),
        nickname: "阿予",
        level: "进阶用户",
        tier: "B",
        tags: ["稳定陪伴", "氛围带动"],
        occupation: "学生",
        interests: "聊天、游戏、流行歌",
        recentEvent: "最近一周常来，会主动聊天。",
        topics: "游戏、点歌、日常作息",
        amount: 5600,
        totalLiveCount: 10,
        appearedCount: 5,
        supportedCount: 3,
        latestSingleSpendAmount: 600,
        highSingleSpendCount: 1,
        singleSpendOver200Count: 3,
        isWillingToReply: true,
        isNoPurpose: true,
        hasOfflineMealRequest: false,
        isOnlyRankAndChat: false,
        maintenance: "直播中多点名回应，缺席几天后轻量问候。",
        createdAt: daysAgo(18),
        lastInteraction: daysAgo(12),
        interactions: [
          { time: daysAgo(12), note: "送礼 600 元，主动聊天接话。", appeared: true, supported: true, spendAmount: 600, isWillingToReply: true }
        ]
      },
      {
        id: uid(),
        nickname: "木槿",
        level: "体验用户",
        tier: "C",
        tags: ["新进观望", "潜水守候"],
        occupation: "未知",
        interests: "占榜、闲聊",
        recentEvent: "偶尔出现，主要占榜和聊天。",
        topics: "日常闲聊、占榜",
        amount: 99,
        totalLiveCount: 12,
        appearedCount: 4,
        supportedCount: 0,
        latestSingleSpendAmount: 0,
        highSingleSpendCount: 0,
        singleSpendOver200Count: 0,
        isWillingToReply: false,
        isNoPurpose: true,
        hasOfflineMealRequest: false,
        isOnlyRankAndChat: true,
        maintenance: "直播中正常回应，观察后续是否形成真实支持。",
        createdAt: daysAgo(45),
        lastInteraction: daysAgo(38),
        interactions: [
          { time: daysAgo(38), note: "占榜和聊天，无消费记录。", appeared: true, supported: false, spendAmount: 0, isOnlyRankAndChat: true }
        ]
      }
    ],
    liveTrends: {
      daily: {
        date: "今日",
        revenue: 12860,
        paidUsers: 42,
        firstPaidUsers: 18,
        sRevenueRate: 0.46,
        potentialUsers: 27
      },
      weekly: {
        revenue: 76420,
        potentialUsers: 136,
        trend: [
          { label: "周一", revenue: 8600 },
          { label: "周二", revenue: 11200 },
          { label: "周三", revenue: 9800 },
          { label: "周四", revenue: 13600 },
          { label: "周五", revenue: 12680 },
          { label: "周六", revenue: 15120 },
          { label: "周日", revenue: 5420 }
        ]
      },
      monthly: {
        revenue: 318900,
        potentialUsers: 528,
        trend: [
          { label: "第1周", revenue: 58200 },
          { label: "第2周", revenue: 76420 },
          { label: "第3周", revenue: 84600 },
          { label: "第4周", revenue: 99680 }
        ]
      }
    }
  };
})();
