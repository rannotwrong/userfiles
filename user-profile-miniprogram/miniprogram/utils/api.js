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

  function handleResponse(res, resolve, reject) {
    let responseData = res.data;
    if (typeof responseData === "string") {
      try {
        responseData = JSON.parse(responseData);
      } catch (_error) {
        responseData = { message: responseData };
      }
    }
    if (res.statusCode >= 200 && res.statusCode < 300) {
      resolve(responseData);
      return;
    }

    if (res.statusCode === 401) {
      wx.removeStorageSync(config.sessionStorageKey);
    }

    const requestId = responseData?.requestId ? `（编号 ${responseData.requestId}）` : "";
    reject(new Error(`${responseData?.message || `请求失败：${res.statusCode}`}${requestId}`));
  }

  return new Promise((resolve, reject) => {
    if (config.transport === "cloud") {
      if (!config.cloudEnv || config.cloudEnv.startsWith("REPLACE_")) {
        reject(new Error("体验版尚未配置微信云托管环境 ID"));
        return;
      }
      wx.cloud.callContainer({
        config: { env: config.cloudEnv },
        path: url,
        method,
        data,
        header: {
          ...headers,
          "X-WX-SERVICE": config.cloudService
        },
        success(res) {
          handleResponse(res, resolve, reject);
        },
        fail(error) {
          reject(new Error(error.errMsg || "云服务连接失败"));
        }
      });
      return;
    }

    wx.request({
      url: `${config.apiBaseUrl}${url}`,
      method,
      data,
      header: headers,
      timeout: 30000,
      success(res) {
        handleResponse(res, resolve, reject);
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
