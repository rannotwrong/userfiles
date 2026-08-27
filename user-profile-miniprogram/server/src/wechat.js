export async function exchangeWechatCode(code) {
  if (!code) throw new Error("缺少微信登录 code");

  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("缺少 WECHAT_APP_ID 或 WECHAT_APP_SECRET");
  }

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  const response = await fetch(url);
  const data = await response.json();

  if (data.errcode) {
    throw new Error(`微信登录失败：${data.errmsg || data.errcode}`);
  }

  if (!data.openid) {
    throw new Error("微信登录失败：未返回 openid");
  }

  return {
    openid: data.openid,
    unionid: data.unionid || null,
    sessionKey: data.session_key
  };
}
