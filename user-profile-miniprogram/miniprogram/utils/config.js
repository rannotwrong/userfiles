const accountInfo = typeof wx !== "undefined" && wx.getAccountInfoSync
  ? wx.getAccountInfoSync()
  : null;
const envVersion = accountInfo?.miniProgram?.envVersion || "develop";

const environments = {
  develop: {
    transport: "request",
    apiBaseUrl: "http://localhost:3000"
  },
  trial: {
    transport: "cloud",
    cloudEnv: "REPLACE_WITH_CLOUD_ENV_ID",
    cloudService: "user-atlas-api"
  },
  release: {
    transport: "cloud",
    cloudEnv: "REPLACE_WITH_CLOUD_ENV_ID",
    cloudService: "user-atlas-api"
  }
};

module.exports = {
  appName: "用户日记",
  appVersion: "mp-1.0.0",
  releaseChannel: envVersion === "release" ? "prod" : envVersion === "trial" ? "trial" : "dev",
  envVersion,
  ...environments[envVersion],
  sessionStorageKey: "user_atlas_wechat_session",
  agreementStorageKey: "user_atlas_agreement_version",
  agreementVersion: "2026-09-01",
  sessionRefreshAheadMs: 24 * 60 * 60 * 1000,
  imageMaxBytes: 4 * 1024 * 1024
};
