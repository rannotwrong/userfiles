const config = require("./config");
const api = require("./api");

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (result.code) {
          resolve(result.code);
          return;
        }
        reject(new Error("微信登录失败，未获取到临时 code"));
      },
      fail(error) {
        reject(new Error(error.errMsg || "微信登录失败"));
      }
    });
  });
}

function getStoredSession() {
  return wx.getStorageSync(config.sessionStorageKey) || null;
}

function isSessionValid(session) {
  if (!session || !session.token || !session.expiresAt) return false;
  return Number(session.expiresAt) > Date.now();
}

function shouldRefreshSession(session) {
  if (!isSessionValid(session)) return true;
  return Number(session.expiresAt) - Date.now() <= config.sessionRefreshAheadMs;
}

function saveSession(session) {
  wx.setStorageSync(config.sessionStorageKey, session);
}

function clearSession() {
  wx.removeStorageSync(config.sessionStorageKey);
}

async function loginWithWechat({ force = false } = {}) {
  const existing = getStoredSession();
  if (!force && isSessionValid(existing) && !shouldRefreshSession(existing)) {
    return existing;
  }

  const code = await wxLogin();
  const response = await api.request({
    url: "/api/auth/wechat-login",
    method: "POST",
    needAuth: false,
    data: {
      code,
      appVersion: config.appVersion,
      releaseChannel: config.releaseChannel
    }
  });

  const session = {
    token: response.token,
    expiresAt: response.expiresAt,
    user: response.user
  };

  saveSession(session);
  return session;
}

module.exports = {
  wxLogin,
  getStoredSession,
  isSessionValid,
  shouldRefreshSession,
  saveSession,
  clearSession,
  loginWithWechat
};
