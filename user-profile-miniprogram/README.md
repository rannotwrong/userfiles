# 用户日记 · 微信小程序版

这是 `用户日记 / User Atlas` 的微信小程序版本骨架，目标是用微信登录替代邮箱验证码登录，并为后续版本迭代和运营上线留出清晰边界。

## 目录

```text
user-profile-miniprogram/
├── miniprogram/             # 微信小程序前端
│   ├── app.js
│   ├── app.json
│   ├── app.wxss
│   ├── project.config.json
│   ├── pages/
│   │   ├── login/
│   │   └── home/
│   └── utils/
│       ├── api.js           # 统一请求封装
│       ├── auth.js          # 微信登录态管理
│       └── config.js        # 环境与版本配置
├── server/                  # 后端接口示例
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js         # Express 入口
│       ├── wechat.js        # code 换 openid
│       ├── session.js       # 30 天 session token
│       └── supabase.js      # Supabase 服务端客户端
├── supabase/
│   └── wechat-auth-migration.sql
└── docs/
    ├── versioning-and-ops.md
    └── implementation-notes.md
```

## 当前实现

- 小程序端调用 `wx.login()` 获取微信临时 `code`。
- 小程序端向后端 `POST /api/auth/wechat-login` 换取 30 天登录态。
- 登录态保存在小程序本地缓存，用户不主动退出时可自动续期使用。
- 后端示例使用微信 `jscode2session` 换取 `openid`，并在 Supabase 中查找或创建微信用户映射。
- 小程序后续接口统一带 `Authorization: Bearer <session_token>`。

## 为什么不直接在小程序里连 Supabase

小程序端不能放微信 `appSecret`、Supabase `service_role key`、豆包 API Key。登录、权限校验、OCR 等能力都应由服务端统一代理，避免密钥泄露和用户伪造 `owner_id`。

## 本地开发

1. 用微信开发者工具打开 `miniprogram/`。
2. 复制 `server/.env.example` 为 `server/.env` 并填入配置。
3. 启动后端：

```bash
cd server
npm install
npm run dev
```

4. 在 `miniprogram/utils/config.js` 中把 `apiBaseUrl` 改成你的后端地址。

## 后续接入顺序

1. 在 Supabase 执行 `supabase/wechat-auth-migration.sql`。
2. 部署 `server/` 到云函数、Vercel 或其他后端服务。
3. 在微信公众平台配置合法请求域名。
4. 用微信开发者工具联调登录。
5. 再逐步迁移用户档案、直播记录、趋势数据接口。
