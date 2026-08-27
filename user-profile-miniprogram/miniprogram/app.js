const auth = require("./utils/auth");
const config = require("./utils/config");

App({
  globalData: {
    appVersion: config.appVersion,
    releaseChannel: config.releaseChannel,
    user: null
  },

  async onLaunch() {
    const session = auth.getStoredSession();
    if (session && auth.isSessionValid(session)) {
      this.globalData.user = session.user;
      return;
    }

    auth.clearSession();
  }
});
