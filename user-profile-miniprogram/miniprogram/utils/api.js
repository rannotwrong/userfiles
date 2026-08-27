const config = require("./config");

function request({ url, method = "GET", data, needAuth = true }) {
  const headers = {
    "content-type": "application/json",
    "x-client-version": config.appVersion,
    "x-release-channel": config.releaseChannel
  };

  if (needAuth) {
    const session = wx.getStorageSync(config.sessionStorageKey);
    if (session && session.token) {
      headers.Authorization = `Bearer ${session.token}`;
    }
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}${url}`,
      method,
      data,
      header: headers,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        if (res.statusCode === 401) {
          wx.removeStorageSync(config.sessionStorageKey);
        }

        reject(new Error(res.data?.message || `请求失败：${res.statusCode}`));
      },
      fail(error) {
        reject(new Error(error.errMsg || "网络连接失败"));
      }
    });
  });
}

module.exports = {
  request
};
