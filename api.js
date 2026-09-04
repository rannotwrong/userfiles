(function () {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const config = window.UserAtlasSupabaseConfig || {};
  const proxyBaseUrl = String(config.aiProxyUrl || "").replace(/\/$/, "");
  const proxyToken = String(config.aiProxyToken || "");
  let lastWarmUpAt = 0;

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("图片读取失败"));
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("图片读取失败"));
      };
      image.src = url;
    });
  }

  async function compressImageForRecognition(file, options = {}) {
    const maxSide = options.maxSide || 1080;
    const quality = options.quality || 0.66;
    const cropTopRatio = options.cropTopRatio || 1;
    const image = await loadImageFromFile(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = Math.max(1, Math.round((image.naturalHeight || image.height) * cropTopRatio));
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg") || "live-ranking.jpg", {
      type: "image/jpeg",
      lastModified: file.lastModified || Date.now()
    });
  }

  async function encodeImages(files, options = {}, onProgress = () => {}) {
    const images = [...(files || [])].filter((file) => file?.type?.startsWith("image/")).slice(0, 2);
    if (!images.length) throw new Error("请选择图片文件");
    const optimizedFiles = [];
    for (let index = 0; index < images.length; index += 1) {
      optimizedFiles.push(await compressImageForRecognition(images[index], options));
      onProgress(6 + Math.round(((index + 1) / images.length) * 24));
    }
    const encodedImages = [];
    for (let index = 0; index < optimizedFiles.length; index += 1) {
      const dataUrl = await fileToDataUrl(optimizedFiles[index]);
      encodedImages.push(splitDataUrl(dataUrl));
      onProgress(30 + Math.round(((index + 1) / optimizedFiles.length) * 20));
    }
    return { encodedImages, optimizedFiles };
  }

  function splitDataUrl(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
    return {
      mimeType: match?.[1] || "image/png",
      imageBase64: match?.[2] || ""
    };
  }

  function warmUpProxy() {
    if (!proxyBaseUrl) return;
    const now = Date.now();
    if (now - lastWarmUpAt < 120000) return;
    lastWarmUpAt = now;
    fetch(`${proxyBaseUrl}/api/health`, { cache: "no-store" }).catch(() => {});
  }

  async function requestProxy(path, payload) {
    if (!proxyBaseUrl) return null;
    const headers = {
      "Content-Type": "application/json"
    };
    if (proxyToken) headers["x-ocr-proxy-token"] = proxyToken;
    const response = await fetch(`${proxyBaseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.code !== 0) {
      throw new Error(result.message || "图片识别服务暂不可用");
    }
    return result;
  }

  function parseText(text) {
    const cleaned = String(text || "").replace(/\r/g, "").trim();
    const lines = cleaned.split(/\n|；|;/).map((item) => item.trim()).filter(Boolean);
    const moneyMatches = [...cleaned.matchAll(/(?:消费|打赏|送礼|守护|金额|支付)[^\d]{0,8}(\d+(?:\.\d{1,2})?)/g)];
    const totalAmountMatch = cleaned.match(/(?:总消费|累计消费|总金额|累计金额)[^\d]{0,8}(\d+(?:\.\d{1,2})?)/);
    const singleAmountMatch = cleaned.match(/(?:单次消费|单笔消费|本次消费|本场消费|本次打赏|单次打赏)[^\d]{0,8}(\d+(?:\.\d{1,2})?)/);
    const supportRateMatch = cleaned.match(/(?:支持率)[^\d]{0,8}(\d+(?:\.\d{1,2})?)\s*%?/);
    const totalLiveMatch = cleaned.match(/(?:总直播次数|直播场次|总场次)[^\d]{0,8}(\d+)/);
    const appearedMatch = cleaned.match(/(?:出现次数|来过|出现过)[^\d]{0,8}(\d+)/);
    const supportedMatch = cleaned.match(/(?:本月支持次数|月支持次数|支持次数|支持过)[^\d]{0,8}(\d+)/);
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
    const liveSummary = parseLiveSummary(cleaned);

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
      maintenance: "根据本次直播记录择期回访。",
      liveSummary
    };
  }

  function parseLiveSummary(text) {
    const cleaned = String(text || "");
    const dateMatch = cleaned.match(/(?:日期|时间|直播日期)\s*[:：]?\s*(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2})/);
    const revenueMatch = cleaned.match(/(?:总收入|本场收入|直播收入|收入)\s*[:：]?\s*[¥￥]?\s*([0-9,，]+(?:\.\d{1,2})?)/);
    const giftUsersMatch = cleaned.match(/(?:送礼人数|支持人数|送礼用户)\s*[:：]?\s*(\d+)/);
    const thousandTicketUsersMatch = cleaned.match(/(?:千票人数|千票用户)\s*[:：]?\s*(\d+)/);
    const overThousandUsersMatch = cleaned.match(/(?:榜单\s*>\s*1000\s*人数)\s*[:：]?\s*(\d+)/);
    const newThousandUsersMatch = cleaned.match(/(?:新千票人数|新千票用户)\s*[:：]?\s*(\d+)/);
    const topContributionHeatMatch = cleaned.match(/(?:榜一贡献|榜一热度|第一名贡献|第一名热度)\s*[:：]?\s*(\d+)/);
    const sRevenueRateMatch = cleaned.match(/(?:S级用户支持率|S率)\s*[:：]?\s*(\d+(?:\.\d{1,2})?)\s*%?/i);
    const newGiftUsersMatch = cleaned.match(/(?:新用户送礼人数|新送礼用户|新用户支持人数)\s*[:：]?\s*(\d+)/);
    const scoreMatch = cleaned.match(/(?:评分|直播评分|场次评分)\s*[:：]?\s*(\d+(?:\.\d{1,2})?)/);
    const normalizeDate = (value) => {
      if (!value) return "";
      const parts = value.replace(/[年月/.]/g, "-").replace(/日/g, "").split("-").map((item) => item.padStart(2, "0"));
      return parts.length >= 3 ? `${parts[0]}-${parts[1]}-${parts[2]}` : "";
    };
    return {
      date: normalizeDate(dateMatch?.[1]),
      revenue: Number(String(revenueMatch?.[1] || 0).replace(/[,，]/g, "")),
      giftUsers: Number(giftUsersMatch?.[1] || 0),
      thousandTicketUsers: Number(thousandTicketUsersMatch?.[1] || overThousandUsersMatch?.[1] || 0),
      newThousandUsers: Number(newThousandUsersMatch?.[1] || 0),
      topContributionHeat: Number(topContributionHeatMatch?.[1] || 0),
      newGiftUsers: Number(newGiftUsersMatch?.[1] || 0),
      sRevenueRate: Math.max(0, Math.min(1, Number(sRevenueRateMatch?.[1] || 0) / 100)),
      score: Number(scoreMatch?.[1] || 0)
    };
  }

  window.NotebookAPI = {
    warmUpProxy,

    async recognizeLiveImagesFast(files, onProgress) {
      onProgress?.(6);
      const { encodedImages, optimizedFiles } = await encodeImages(
        files,
        { maxSide: 900, quality: 0.55, cropTopRatio: 0.68 },
        (value) => onProgress?.(value)
      );
      if (proxyBaseUrl) {
        const result = await requestProxy("/api/live-records/recognize-fast", {
          images: encodedImages,
          text: ""
        });
        onProgress?.(100);
        return [result];
      }
      return Promise.all(optimizedFiles.map((file) => this.recognizeLiveImage(file, onProgress)));
    },

    async recognizeLiveImages(files, onProgress) {
      onProgress?.(6);
      const { encodedImages, optimizedFiles } = await encodeImages(files, {}, (value) => onProgress?.(value));
      if (proxyBaseUrl) {
        const result = await requestProxy("/api/live-records/recognize-images", {
          images: encodedImages,
          text: ""
        });
        onProgress?.(100);
        return [result];
      }
      return Promise.all(optimizedFiles.map((file) => this.recognizeLiveImage(file, onProgress)));
    },

    async recognizeLiveImage(file, onProgress) {
      if (!file || !file.type.startsWith("image/")) {
        throw new Error("请选择图片文件");
      }
      onProgress?.(8);
      const optimizedFile = await compressImageForRecognition(file);
      onProgress?.(18);
      const dataUrl = await fileToDataUrl(optimizedFile);
      const { mimeType, imageBase64 } = splitDataUrl(dataUrl);
      onProgress?.(32);
      if (proxyBaseUrl) {
        const result = await requestProxy("/api/live-records/recognize-image", {
          imageBase64,
          mimeType,
          text: ""
        });
        onProgress?.(100);
        return result;
      }
      for (const progress of [42, 68, 100]) {
        await delay(120);
        onProgress?.(progress);
      }
      const today = new Date().toISOString().slice(0, 10);
      const summary = {
        date: today,
        revenue: 0,
        giftUsers: 0,
        thousandTicketUsers: 0,
        newGiftUsers: 0,
        sRevenueRate: 0,
        score: 0
      };
      return {
        code: 0,
        data: {
          text: `日期：${summary.date}\n图片已上传。当前未配置豆包 OCR 代理，请手动补充字段。`,
          summary,
          confidence: 0
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
