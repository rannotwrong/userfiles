# 版本维度与运营说明

## 版本划分

建议当前产品同时保留三个版本维度：

| 版本 | 入口 | 用途 |
|---|---|---|
| 网页版 | GitHub Pages | 当前稳定可用版本，继续服务已有数据和配置 |
| 小程序版 | 微信小程序 | 面向手机端日常录入，优先解决登录、拍照、截图上传体验 |
| 后端服务 | Serverless / 云函数 | 统一处理微信登录、Supabase 数据读写、豆包 OCR、权限校验 |

## 版本号规则

建议使用：

```text
web-0.x.x
mp-0.x.x
api-0.x.x
```

当前小程序骨架版本：

```text
mp-0.1.0
```

版本含义：

- `0.1.x`：登录、数据接口、OCR 等基础能力。
- `0.2.x`：用户档案列表、新增、编辑。
- `0.3.x`：直播记录 OCR 和直播趋势。
- `1.0.0`：具备正式上线能力。

## 发布渠道

建议在 `miniprogram/utils/config.js` 中维护：

```js
releaseChannel: "dev"
```

可选值：

| 渠道 | 用途 |
|---|---|
| `dev` | 本地开发和微信开发者工具联调 |
| `trial` | 体验版，给少量用户试用 |
| `prod` | 正式版 |

后端会接收 `x-client-version` 和 `x-release-channel`，可以用于排查问题和运营统计。

## 运营埋点建议

建议后续新增 `operation_events` 表，记录：

- 登录成功 / 失败
- OCR 识别成功 / 失败
- 新增用户档案
- 修改用户分层
- 新增直播记录
- 访问直播趋势

最小字段：

```text
id
owner_id
event_name
event_payload
client_version
release_channel
created_at
```

## 登录策略

小程序端默认将 `session_token` 保存到本地缓存。

有效期建议：

```text
30 天
```

用户主动退出时清除缓存；否则下次打开小程序时自动检查 token，有效则直接进入首页，接近过期时自动用 `wx.login()` 换新登录态。

## 上线检查

1. 微信公众平台配置小程序 AppID 和 AppSecret。
2. 后端服务配置环境变量。
3. 微信公众平台配置合法请求域名。
4. Supabase 执行 `wechat-auth-migration.sql`。
5. 小程序体验版联调微信登录。
6. 检查用户数据是否按微信身份隔离。
7. 接入错误日志和基础运营事件。
