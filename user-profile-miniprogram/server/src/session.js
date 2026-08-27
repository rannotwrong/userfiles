import jwt from "jsonwebtoken";

const ttlDays = Number(process.env.SESSION_TTL_DAYS || 30);
const ttlSeconds = ttlDays * 24 * 60 * 60;

function getSecret() {
  const secret = process.env.SESSION_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_JWT_SECRET 至少需要 32 位");
  }
  return secret;
}

export function createSessionToken(user) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const token = jwt.sign(
    {
      sub: user.id,
      openid: user.wechat_openid,
      unionid: user.wechat_unionid || null,
      iat: nowSeconds
    },
    getSecret(),
    { expiresIn: ttlSeconds }
  );

  return {
    token,
    expiresAt
  };
}

export function verifySessionToken(token) {
  return jwt.verify(token, getSecret());
}
