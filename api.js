(function () {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function parseText(text) {
    const cleaned = String(text || "").replace(/\r/g, "").trim();
    const lines = cleaned.split(/\n|；|;/).map((item) => item.trim()).filter(Boolean);
    const moneyMatches = [...cleaned.matchAll(/(?:消费|打赏|送礼|守护|金额|支付)[^\d]{0,8}(\d+(?:\.\d{1,2})?)/g)];
    const totalAmountMatch = cleaned.match(/(?:总消费|累计消费|总金额|累计金额)[^\d]{0,8}(\d+(?:\.\d{1,2})?)/);
    const singleAmountMatch = cleaned.match(/(?:单次消费|单笔消费|本次消费|本场消费|本次打赏|单次打赏)[^\d]{0,8}(\d+(?:\.\d{1,2})?)/);
    const supportRateMatch = cleaned.match(/(?:支持率)[^\d]{0,8}(\d+(?:\.\d{1,2})?)\s*%?/);
    const totalLiveMatch = cleaned.match(/(?:总直播次数|直播场次|总场次)[^\d]{0,8}(\d+)/);
    const appearedMatch = cleaned.match(/(?:出现次数|来过|出现过)[^\d]{0,8}(\d+)/);
    const supportedMatch = cleaned.match(/(?:支持次数|支持过)[^\d]{0,8}(\d+)/);
    const highSingleMatch = cleaned.match(/(?:单笔大于1000|单笔>1000|大额次数)[^\d]{0,8}(\d+)/);
    const occupationMatch = cleaned.match(/(?:职业|是一名|是个|从事)\s*[:：]?\s*([^，,。\n；;]{2,12})/);
    const nameLabel = cleaned.match(/(?:昵称|用户|名字)\s*[:：]\s*([^，,。\n；;]{1,20})/);
    const firstSegment = lines[0]?.split(/[，,。]/)[0].trim() || "";
    const nickname = nameLabel?.[1] || (/^[\u4e00-\u9fa5A-Za-z0-9_-]{1,12}$/.test(firstSegment) ? firstSegment : "");
    const interestsMatch = cleaned.match(/(?:喜欢|兴趣|爱好)\s*[:：]?\s*([^。\n；;]{2,30})/);
    const tagRules = [
      ["高额支持", /高额|大哥|大额|守护|送礼多/],
      ["稳定陪伴", /常来|陪播|稳定|老粉|常驻/],
      ["氛围带动", /接话|暖场|抛梗|带话题|聊天积极/],
      ["点歌偏好", /点歌|唱歌|音乐|歌单/],
      ["情绪支持", /安慰|鼓励|陪伴|心疼/],
      ["预算敏感", /没钱|预算|下次再支持|小礼物/],
      ["新进观望", /新关注|刚关注|第一次|新进/],
      ["潜水守候", /潜水|不说话|安静看|默默陪/],
      ["目的用户", /线下|吃饭|见面|私下|越界/]
    ];
    const tags = tagRules.filter(([, rule]) => rule.test(cleaned)).map(([tag]) => tag).slice(0, 3);
    const latestMoneyMatch = moneyMatches[moneyMatches.length - 1];
    const singleAmount = Number(singleAmountMatch?.[1] || latestMoneyMatch?.[1] || 0);
    const totalAmount = Number(totalAmountMatch?.[1] || moneyMatches.reduce((sum, match) => sum + Number(match[1]), 0) || singleAmount);
    const supportRate = supportRateMatch ? Number(supportRateMatch[1]) / 100 : 0;
    const totalLiveCount = Number(totalLiveMatch?.[1] || (supportRate ? 100 : 0));
    const supportedCount = Number(supportedMatch?.[1] || (supportRate && totalLiveCount ? Math.round(totalLiveCount * supportRate) : (singleAmount > 0 ? 1 : 0)));
    const appearedCount = Number(appearedMatch?.[1] || Math.max(1, supportedCount));
    const hasOfflineMealRequest = /线下|吃饭|见面|私下|越界/.test(cleaned);
    const isWillingToReply = /愿意接话|接话|暖场|抛梗|聊天积极|主动聊天/.test(cleaned);
    const isOnlyRankAndChat = /只占榜|占榜和聊天|只聊天|不消费/.test(cleaned);

    return {
      nickname: nickname || "待确认用户",
      level: /会员/.test(cleaned) ? (cleaned.match(/[\u4e00-\u9fa5A-Za-z]{0,8}会员/)?.[0] || "会员") : "直播记录",
      manualTags: [],
      tags: tags.length ? tags : ["新进观望"],
      occupation: occupationMatch?.[1] || "",
      interests: interestsMatch?.[1] || "",
      recentEvent: cleaned.slice(0, 180),
      topics: "由直播记录自动导入",
      amount: totalAmount,
      totalLiveCount,
      appearedCount,
      supportedCount,
      latestSingleSpendAmount: singleAmount,
      highSingleSpendCount: Number(highSingleMatch?.[1] || (singleAmount > 1000 ? 1 : 0)),
      singleSpendOver200Count: singleAmount > 200 ? 1 : 0,
      isWillingToReply,
      isNoPurpose: !hasOfflineMealRequest,
      hasOfflineMealRequest,
      isOnlyRankAndChat,
      maintenance: "根据本次直播记录择期回访。"
    };
  }

  window.NotebookAPI = {
    /**
     * TODO: 替换为 POST /api/live-records/recognize
     * 请求：multipart/form-data { image }
     * 响应：{ code: 0, data: { text, confidence } }
     * 当前仅根据文件名返回可编辑的演示识别结果，不上传文件。
     */
    async recognizeLiveImage(file, onProgress) {
      if (!file || !file.type.startsWith("image/")) {
        throw new Error("请选择图片文件");
      }
      for (const progress of [12, 28, 49, 72, 91, 100]) {
        await delay(160);
        onProgress?.(progress);
      }
      const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 12);
      return {
        code: 0,
        data: {
          text: `昵称：${baseName || "直播用户"}\n支持率：35%\n总消费金额：5600\n单次消费：600\n出现次数：4\n愿意接话，直播间聊天积极`,
          confidence: 0.91
        }
      };
    },

    /**
     * TODO: 替换为 POST /api/live-records/parse
     * 请求：{ text }
     * 响应：{ code: 0, data: UserDraft }
     */
    async parseLiveText(text) {
      await delay(420);
      if (!String(text || "").trim()) {
        return { code: 400, message: "没有可解析的文字" };
      }
      return { code: 0, data: parseText(text) };
    }
  };
})();
