const auth = require("../../utils/auth");
const config = require("../../utils/config");
const audienceApi = require("../../utils/audienceApi");
const liveRecordApi = require("../../utils/liveRecordApi");

const tierOptions = ["全部", "S", "A", "B", "C"];
const editableTierOptions = ["S", "A", "B", "C"];

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isTodayDate(value) {
  return String(value || "").slice(0, 10) === today();
}

function emptyProfileDraft() {
  return {
    id: "",
    nickname: "",
    tier: "C",
    birthday: "",
    manualTags: "",
    amount: "",
    highestSingleSpendAmount: "",
    isWillingToReply: false,
    isNoPurpose: true,
    hasOfflineMealRequest: false,
    isOnlyRankAndChat: false,
    notes: ""
  };
}

function emptyCaptureDraft() {
  return {
    date: today(),
    totalRevenue: "",
    giftUserCount: "",
    newGiftUserCount: "",
    topGift: "",
    score: "",
    sourceText: "",
    ocrText: "",
    recognitionPayload: {}
  };
}

function splitTags(value) {
  return String(value || "")
    .split(/[、,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function chooseImageFile() {
  return new Promise((resolve, reject) => {
    if (!wx.chooseMedia && wx.chooseImage) {
      wx.chooseImage({
        count: 1,
        sourceType: ["album", "camera"],
        success(result) {
          resolve({
            tempFiles: [{
              tempFilePath: result.tempFilePaths[0]
            }]
          });
        },
        fail: reject
      });
      return;
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: resolve,
      fail: reject
    });
  });
}

Page({
  data: {
    appVersion: config.appVersion,
    releaseChannel: config.releaseChannel,
    user: null,
    isLoading: true,
    isSavingProfile: false,
    isSavingRecord: false,
    isRecognizing: false,
    tierOptions,
    editableTierOptions,
    activeTier: "全部",
    activeTierIndex: 0,
    profileTierIndex: 3,
    keyword: "",
    users: [],
    liveRecords: [],
    stats: {
      total: 0,
      sCount: 0,
      aCount: 0,
      todayRecords: 0
    },
    captureDraft: emptyCaptureDraft(),
    selectedImageName: "",
    isProfileModalOpen: false,
    profileModalTitle: "新增用户档案",
    profileDraft: emptyProfileDraft()
  },

  async onLoad() {
    try {
      const session = await auth.loginWithWechat();
      getApp().globalData.user = session.user;
      this.setData({ user: session.user });
      await Promise.all([
        this.loadAudienceUsers(),
        this.loadLiveRecords()
      ]);
    } catch (error) {
      auth.clearSession();
      wx.redirectTo({ url: "/pages/login/login" });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  async onPullDownRefresh() {
    await Promise.all([
      this.loadAudienceUsers(),
      this.loadLiveRecords()
    ]);
    wx.stopPullDownRefresh();
  },

  handleLogout() {
    auth.clearSession();
    getApp().globalData.user = null;
    wx.redirectTo({ url: "/pages/login/login" });
  },

  getFilteredParams() {
    return {
      tier: this.data.activeTier === "全部" ? "" : this.data.activeTier,
      keyword: this.data.keyword
    };
  },

  computeStats(users, liveRecords = this.data.liveRecords) {
    return {
      total: users.length,
      sCount: users.filter((user) => user.tier === "S").length,
      aCount: users.filter((user) => user.tier === "A").length,
      todayRecords: liveRecords.filter((record) => isTodayDate(record.date)).length
    };
  },

  async loadAudienceUsers() {
    this.setData({ isLoading: true });
    try {
      const result = await audienceApi.listAudienceUsers(this.getFilteredParams());
      const users = result.users || [];
      this.setData({
        users,
        stats: this.computeStats(users)
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "读取用户档案失败",
        icon: "none"
      });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  async loadLiveRecords() {
    try {
      const result = await liveRecordApi.listLiveRecords();
      const liveRecords = result.records || [];
      this.setData({
        liveRecords,
        stats: this.computeStats(this.data.users, liveRecords)
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "读取直播记录失败",
        icon: "none"
      });
    }
  },

  handleSearchInput(event) {
    this.setData({ keyword: event.detail.value });
  },

  async handleSearchConfirm() {
    await this.loadAudienceUsers();
  },

  async handleTierChange(event) {
    const activeTierIndex = Number(event.detail.value || 0);
    this.setData({
      activeTierIndex,
      activeTier: tierOptions[activeTierIndex]
    });
    await this.loadAudienceUsers();
  },

  openCreateProfile() {
    this.setData({
      isProfileModalOpen: true,
      profileModalTitle: "新增用户档案",
      profileTierIndex: 3,
      profileDraft: emptyProfileDraft()
    });
  },

  openEditProfile(event) {
    const id = event.currentTarget.dataset.id;
    const user = this.data.users.find((item) => item.id === id);
    if (!user) return;
    const profileTierIndex = Math.max(0, editableTierOptions.indexOf(user.tier || "C"));
    this.setData({
      isProfileModalOpen: true,
      profileModalTitle: "编辑用户档案",
      profileTierIndex,
      profileDraft: {
        id: user.id,
        nickname: user.nickname || "",
        tier: user.tier || "C",
        birthday: user.birthday || "",
        manualTags: (user.manualTags || []).join("、"),
        amount: user.amount || "",
        highestSingleSpendAmount: user.highestSingleSpendAmount || "",
        isWillingToReply: Boolean(user.isWillingToReply),
        isNoPurpose: user.isNoPurpose !== false,
        hasOfflineMealRequest: Boolean(user.hasOfflineMealRequest),
        isOnlyRankAndChat: Boolean(user.isOnlyRankAndChat),
        notes: user.notes || ""
      }
    });
  },

  closeProfileModal() {
    this.setData({ isProfileModalOpen: false });
  },

  handleProfileInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [`profileDraft.${field}`]: event.detail.value
    });
  },

  handleProfileBoolean(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [`profileDraft.${field}`]: Boolean(event.detail.value)
    });
  },

  handleProfileTierChange(event) {
    const profileTierIndex = Number(event.detail.value || 0);
    this.setData({
      profileTierIndex,
      "profileDraft.tier": editableTierOptions[profileTierIndex]
    });
  },

  handleProfileBirthdayChange(event) {
    this.setData({
      "profileDraft.birthday": event.detail.value
    });
  },

  async submitProfile() {
    const draft = this.data.profileDraft;
    if (!draft.nickname.trim()) {
      wx.showToast({ title: "请填写昵称", icon: "none" });
      return;
    }

    const payload = {
      nickname: draft.nickname.trim(),
      tier: draft.tier,
      birthday: draft.birthday,
      manualTags: splitTags(draft.manualTags),
      amount: Number(draft.amount || 0),
      highestSingleSpendAmount: Number(draft.highestSingleSpendAmount || 0),
      isWillingToReply: draft.isWillingToReply,
      isNoPurpose: draft.isNoPurpose,
      hasOfflineMealRequest: draft.hasOfflineMealRequest,
      isOnlyRankAndChat: draft.isOnlyRankAndChat,
      notes: draft.notes
    };

    this.setData({ isSavingProfile: true });
    try {
      if (draft.id) {
        await audienceApi.updateAudienceUser(draft.id, payload);
      } else {
        await audienceApi.createAudienceUser(payload);
      }
      wx.showToast({ title: "已保存", icon: "success" });
      this.setData({ isProfileModalOpen: false });
      await this.loadAudienceUsers();
    } catch (error) {
      wx.showToast({
        title: error.message || "保存失败",
        icon: "none"
      });
    } finally {
      this.setData({ isSavingProfile: false });
    }
  },

  handleCaptureInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      [`captureDraft.${field}`]: event.detail.value
    });
  },

  handleCaptureDateChange(event) {
    this.setData({
      "captureDraft.date": event.detail.value
    });
  },

  async chooseLiveImage() {
    try {
      const result = await chooseImageFile();
      const file = result.tempFiles && result.tempFiles[0];
      if (!file) return;

      const fileName = file.tempFilePath.split("/").pop() || "已选择图片";
      this.setData({
        selectedImageName: fileName,
        isRecognizing: true
      });

      const recognition = await liveRecordApi.recognizeImageFile(
        file.tempFilePath,
        this.data.captureDraft.sourceText
      );
      this.applyRecognitionResult(recognition);
      wx.showToast({ title: "识别完成", icon: "success" });
    } catch (error) {
      wx.showToast({
        title: error.message || "图片识别失败",
        icon: "none"
      });
    } finally {
      this.setData({ isRecognizing: false });
    }
  },

  async recognizeFromText() {
    if (!this.data.captureDraft.sourceText.trim()) {
      wx.showToast({ title: "请先输入文字描述", icon: "none" });
      return;
    }
    this.setData({ isRecognizing: true });
    try {
      const recognition = await liveRecordApi.recognizeLiveRecord({
        text: this.data.captureDraft.sourceText
      });
      this.applyRecognitionResult(recognition);
      wx.showToast({ title: "已提取信息", icon: "success" });
    } catch (error) {
      wx.showToast({
        title: error.message || "提取失败",
        icon: "none"
      });
    } finally {
      this.setData({ isRecognizing: false });
    }
  },

  applyRecognitionResult(recognition = {}) {
    const fields = recognition.fields || {};
    this.setData({
      captureDraft: {
        ...this.data.captureDraft,
        date: fields.date || this.data.captureDraft.date,
        totalRevenue: fields.totalRevenue || this.data.captureDraft.totalRevenue,
        giftUserCount: fields.giftUserCount || this.data.captureDraft.giftUserCount,
        newGiftUserCount: fields.newGiftUserCount || this.data.captureDraft.newGiftUserCount,
        topGift: fields.topGift || this.data.captureDraft.topGift,
        score: fields.score || this.data.captureDraft.score,
        ocrText: recognition.ocrText || this.data.captureDraft.ocrText,
        recognitionPayload: {
          provider: recognition.provider || "unknown",
          confidence: recognition.confidence || 0,
          ...(recognition.recognitionPayload || {})
        }
      }
    });
  },

  async saveLiveRecord() {
    const draft = this.data.captureDraft;
    this.setData({ isSavingRecord: true });
    try {
      await liveRecordApi.saveLiveRecord({
        date: draft.date,
        totalRevenue: Number(draft.totalRevenue || 0),
        giftUserCount: Number(draft.giftUserCount || 0),
        newGiftUserCount: Number(draft.newGiftUserCount || 0),
        topGift: draft.topGift,
        score: Number(draft.score || 0),
        sourceText: draft.sourceText,
        ocrText: draft.ocrText,
        recognitionPayload: {
          selectedImageName: this.data.selectedImageName,
          ...(draft.recognitionPayload || {})
        }
      });
      wx.showToast({ title: "直播记录已保存", icon: "success" });
      this.setData({
        captureDraft: emptyCaptureDraft(),
        selectedImageName: ""
      });
      await this.loadLiveRecords();
    } catch (error) {
      wx.showToast({
        title: error.message || "保存直播记录失败",
        icon: "none"
      });
    } finally {
      this.setData({ isSavingRecord: false });
    }
  }
});
