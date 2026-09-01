const auth = require("./utils/auth");
const config = require("./utils/config");

App({
  globalData: {
    appVersion: config.appVersion,
    releaseChannel: config.releaseChannel,
    user: null
  },

  async onLaunch() {
    if (config.transport === "cloud") {
      if (!wx.cloud) {
        console.error("当前微信基础库不支持云能力");
      } else if (config.cloudEnv && !config.cloudEnv.startsWith("REPLACE_")) {
        wx.cloud.init({
          env: config.cloudEnv,
          traceUser: true
        });
      }
    }

    const session = auth.getStoredSession();
    if (session && auth.isSessionValid(session)) {
      this.globalData.user = session.user;
      return;
    }

    auth.clearSession();
  }
});
