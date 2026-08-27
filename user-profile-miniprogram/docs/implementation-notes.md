# 微信登录实现说明

## 登录链路

```text
小程序 wx.login()
  -> 获取临时 code
  -> POST /api/auth/wechat-login
  -> 后端请求微信 jscode2session
  -> 获取 openid / unionid
  -> Supabase 查询或创建 wechat_users
  -> 后端签发 30 天 session_token
  -> 小程序本地保存 session_token
```

## 为什么使用后端代理

小程序端不能保存以下密钥：

- 微信 `AppSecret`
- Supabase `service_role key`
- 豆包 OCR API Key

所以登录、数据读写、图片 OCR 都应该统一经过后端服务。

## 与当前网页版的兼容

当前网页版使用 Supabase Auth 的 `auth.users.id` 作为 `owner_id`。

小程序版有三种接入方式：

| 方式 | 说明 | 推荐度 |
|---|---|---|
| 后端创建 Supabase Auth 用户映射 | 微信登录后，由后端创建或查找对应 Supabase 用户，继续复用现有 `owner_id` | 高 |
| 业务表新增 `wechat_owner_id` | 保留网页版字段，小程序版新增微信用户字段 | 中 |
| 小程序独立业务表 | 与网页版完全隔离，后续再迁移 | 中 |

为了不影响当前已上线网页版，建议先使用“后端创建 Supabase Auth 用户映射”或“新增 `wechat_owner_id`”。

## 当前代码边界

本次已完成：

- 小程序端微信登录入口。
- 本地 30 天登录态保存。
- 登录态过期或主动退出后重新登录。
- 后端微信登录接口骨架。
- Supabase 微信用户映射表。
- 用户档案列表接口：`GET /api/audience-users`。
- 用户档案新增接口：`POST /api/audience-users`。
- 用户档案编辑接口：`PATCH /api/audience-users/:id`。
- 直播记录列表接口：`GET /api/live-records`。
- 直播记录保存接口：`POST /api/live-records`。
- 直播记录 OCR 接口：`POST /api/live-records/ocr`，支持文字解析和豆包图片识别。
- 小程序端用户档案和直播记录 API 封装。
- 小程序首页页面层：
  - 用户档案列表。
  - 昵称搜索。
  - S/A/B/C 分层筛选。
  - 新增/编辑用户档案弹层。
  - 直播截图上传入口。
  - 直播文字提取入口。
  - 直播记录保存表单。

尚未完成：

- 趋势统计接口。
- 与当前网页版数据的完全打通。
- 更细的用户详情页、历史直播记录页。

## 下一步建议

优先补四组接口：

```text
GET /api/audience-users
POST /api/audience-users
PATCH /api/audience-users/:id
POST /api/live-records/ocr
```

以上接口和首页页面层已经补齐，`POST /api/live-records/ocr` 已接入豆包图片识别。下一步建议继续补“用户详情页”和“历史直播记录页”。

其中 `POST /api/live-records/ocr` 的行为是：仅传文字时走本地解析；传入 `imageBase64` 时由服务端读取 `ARK_API_KEY` 或 `DOUBAO_API_KEY` 调用豆包视觉模型，返回 `ocrText`、结构化 `fields`、`provider`、`confidence` 和 `recognitionPayload`。小程序端保存直播记录时会把识别 payload 一并写入 `wechat_live_records.recognition_payload`，形成“图片解读 → 数据上传 → 数据更新”的闭环。
