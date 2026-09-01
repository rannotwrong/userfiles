const auth = require("../../utils/auth");
const config = require("../../utils/config");

Page({
  data: {
    isLoggingIn: false,
    hasAcceptedTerms: false
  },

  async onLoad() {
    this.setData({
      hasAcceptedTerms: wx.getStorageSync(config.agreementStorageKey) === config.agreementVersion
    });
    const session = auth.getStoredSession();
    if (auth.isSessionValid(session)) {
      wx.redirectTo({ url: "/pages/home/home" });
    }
  },

  async handleWechatLogin() {
    if (this.data.isLoggingIn) return;
    if (!this.data.hasAcceptedTerms) {
      wx.showToast({ title: "请先阅读并同意相关协议", icon: "none" });
      return;
    }

    this.setData({ isLoggingIn: true });
    try {
      const session = await auth.loginWithWechat({ force: true });
      wx.setStorageSync(config.agreementStorageKey, config.agreementVersion);
      getApp().globalData.user = session.user;
      wx.redirectTo({ url: "/pages/home/home" });
    } catch (error) {
      wx.showToast({
        title: error.message || "登录失败",
        icon: "none"
      });
    } finally {
      this.setData({ isLoggingIn: false });
    }
  },

  handleAgreementChange(event) {
    this.setData({ hasAcceptedTerms: event.detail.value.includes("accepted") });
  },

  openUserAgreement() {
    wx.navigateTo({ url: "/pages/legal/legal?type=agreement" });
  },

  openPrivacyContract() {
    if (!wx.openPrivacyContract) {
      wx.showToast({ title: "请升级微信后查看隐私保护指引", icon: "none" });
      return;
    }
    wx.openPrivacyContract({
      fail(error) {
        wx.showToast({ title: error.errMsg || "隐私保护指引暂不可用", icon: "none" });
      }
    });
  }
});
