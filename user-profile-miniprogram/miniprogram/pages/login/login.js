const auth = require("../../utils/auth");

Page({
  data: {
    isLoggingIn: false
  },

  async onLoad() {
    const session = auth.getStoredSession();
    if (auth.isSessionValid(session)) {
      wx.redirectTo({ url: "/pages/home/home" });
    }
  },

  async handleWechatLogin() {
    if (this.data.isLoggingIn) return;

    this.setData({ isLoggingIn: true });
    try {
      const session = await auth.loginWithWechat({ force: true });
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
  }
});
