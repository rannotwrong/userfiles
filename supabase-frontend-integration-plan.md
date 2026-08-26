# Supabase 接入改造方案

当前档案台使用 `localStorage` 保存数据。接入 Supabase 后，用户档案、直播记录、互动明细和自动打标结果会保存到云端数据库，同一账号在不同设备登录后可以看到同一份数据。

## 改造目标

- 使用 Supabase Auth 增加账号登录。
- 使用 Supabase PostgreSQL 保存用户档案和直播数据。
- 保留现有 GitHub Pages 静态部署方式。
- 保留当前前端自动打标逻辑，先在浏览器端计算，再写入数据库。
- 登录后只使用 Supabase 云端数据，不提供本机数据迁移入口。

## 数据表对应关系

| 当前前端数据 | Supabase 表 | 说明 |
|---|---|---|
| 用户档案数组 | `audience_users` | 保存昵称、分层、标签、消费指标、维护信息 |
| 直播记录 | `live_sessions` | 保存每场直播收入、付费用户数、识别文本 |
| 互动记录 | `user_live_interactions` | 保存每个用户每场直播的出现、支持、消费、接话等行为 |
| 标签字典 | `tag_definitions` | 保存娱乐直播标签定义 |
| 用户标签 | `user_tags` | 区分自动标签和手动标签 |
| 打标日志 | `user_tagging_logs` | 保存自动打标结果和计算快照 |
| 登录账号 | `profiles` | 保存当前运营者的账号资料 |

## 前端文件改造

实际新增 2 个文件：

```text
supabase-config.js
cloudStore.js
```

保留现有文件：

```text
index.html
styles.css
app.js
api.js
mock.js
```

`supabase-config.js` 保存 Supabase 项目 URL 和 `anon public key`，`cloudStore.js` 负责云端读写。登录状态、按钮事件和页面刷新逻辑已集成在 `app.js`。

## 环境配置

GitHub Pages 是静态托管，不能安全保存服务端密钥。前端只能使用 Supabase 的 `anon public key`，数据库安全依靠 RLS 策略保证。

建议在 `supabase-config.js` 中配置：

```js
const SUPABASE_URL = "https://你的项目编号.supabase.co";
const SUPABASE_ANON_KEY = "你的 anon public key";
```

不要把 `service_role key` 放到前端代码中。

## 登录流程

页面启动时先检查登录状态：

```js
const { data } = await supabase.auth.getSession();
```

如果未登录，展示登录区域；如果已登录，进入档案台并加载云端数据。

当前已支持邮箱验证码和邮件链接两种方式。发送邮件时，回跳地址固定为线上 GitHub Pages 页面，避免本地预览发送邮件后跳回 `localhost`：

```js
await supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: "https://rannotwrong.github.io/userfiles/"
  }
});
```

如果邮件里包含验证码，可以直接在页面输入验证码完成登录：

```js
await supabase.auth.verifyOtp({
  email,
  token,
  type: "email"
});
```

也已接入 Google OAuth 登录按钮：

```js
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: "https://rannotwrong.github.io/userfiles/"
  }
});
```

Google 登录需要先在 Supabase Dashboard 的 `Authentication -> Providers -> Google` 中启用，并在 Google Cloud 配置 OAuth Client 和 Supabase 提供的回调地址。未开启 Provider 时，前端按钮会跳转失败或返回 Supabase 的 Provider 配置错误。

登录成功后调用：

```js
await supabase.rpc("create_default_tags_for_current_user");
```

这样可以为当前账号初始化娱乐直播标签。

## 数据读取

页面初始化时读取当前账号下的用户档案：

```js
const { data, error } = await supabase
  .from("audience_users")
  .select("*")
  .order("updated_at", { ascending: false });

if (error) throw error;
```

由于 SQL 中已配置 RLS，前端不需要手动拼接 `owner_id` 过滤条件。Supabase 会只返回当前登录账号自己的数据。

## 新增用户

当前新增用户表单提交后，先调用已有自动打标函数，再写入 `audience_users`。

```js
const { data: sessionData } = await supabase.auth.getSession();
const ownerId = sessionData.session.user.id;

const taggedUser = runAutoTagging(formUser);

const { data, error } = await supabase
  .from("audience_users")
  .insert({
    owner_id: ownerId,
    nickname: taggedUser.nickname,
    level_name: taggedUser.levelName,
    tier: taggedUser.tier,
    manual_tags: taggedUser.manualTags || [],
    auto_tags: taggedUser.autoTags || [],
    tags: taggedUser.tags || [],
    occupation: taggedUser.occupation,
    interests: taggedUser.interests,
    recent_event: taggedUser.recentEvent,
    talked_topics: taggedUser.talkedTopics,
    maintenance_method: taggedUser.maintenanceMethod,
    total_live_count: taggedUser.totalLiveCount,
    appeared_count: taggedUser.appearedCount,
    supported_count: taggedUser.supportedCount,
    support_rate: taggedUser.supportRate,
    total_spend_amount: taggedUser.totalSpendAmount,
    latest_single_spend_amount: taggedUser.latestSingleSpendAmount,
    high_single_spend_count: taggedUser.highSingleSpendCount,
    single_spend_over_200_count: taggedUser.singleSpendOver200Count,
    is_willing_to_reply: taggedUser.isWillingToReply,
    is_no_purpose: taggedUser.isNoPurpose,
    has_offline_meal_request: taggedUser.hasOfflineMealRequest,
    is_only_rank_and_chat: taggedUser.isOnlyRankAndChat,
    matched_rules: taggedUser.matchedRules || [],
    tagging_snapshot: taggedUser.taggingSnapshot || {},
    last_interaction_at: taggedUser.lastInteractionAt
  })
  .select()
  .single();

if (error) throw error;
```

## 编辑用户

编辑用户时仍然先重新计算打标，再更新同一条记录：

```js
const taggedUser = runAutoTagging(formUser);

const { error } = await supabase
  .from("audience_users")
  .update({
    nickname: taggedUser.nickname,
    level_name: taggedUser.levelName,
    tier: taggedUser.tier,
    manual_tags: taggedUser.manualTags || [],
    auto_tags: taggedUser.autoTags || [],
    tags: taggedUser.tags || [],
    occupation: taggedUser.occupation,
    interests: taggedUser.interests,
    recent_event: taggedUser.recentEvent,
    talked_topics: taggedUser.talkedTopics,
    maintenance_method: taggedUser.maintenanceMethod,
    total_live_count: taggedUser.totalLiveCount,
    appeared_count: taggedUser.appearedCount,
    supported_count: taggedUser.supportedCount,
    support_rate: taggedUser.supportRate,
    total_spend_amount: taggedUser.totalSpendAmount,
    latest_single_spend_amount: taggedUser.latestSingleSpendAmount,
    high_single_spend_count: taggedUser.highSingleSpendCount,
    single_spend_over_200_count: taggedUser.singleSpendOver200Count,
    is_willing_to_reply: taggedUser.isWillingToReply,
    is_no_purpose: taggedUser.isNoPurpose,
    has_offline_meal_request: taggedUser.hasOfflineMealRequest,
    is_only_rank_and_chat: taggedUser.isOnlyRankAndChat,
    matched_rules: taggedUser.matchedRules || [],
    tagging_snapshot: taggedUser.taggingSnapshot || {}
  })
  .eq("id", taggedUser.id);

if (error) throw error;
```

## 记录互动

点击“记录一次互动”时，需要同时写入互动明细，并更新用户汇总指标。

```js
await supabase.from("user_live_interactions").insert({
  owner_id: ownerId,
  audience_user_id: user.id,
  live_session_id: currentLiveSessionId || null,
  interacted_at: new Date().toISOString(),
  appeared: true,
  supported: interaction.spendAmount > 0,
  spend_amount: interaction.spendAmount,
  is_first_paid: interaction.isFirstPaid,
  is_willing_to_reply: interaction.isWillingToReply,
  has_offline_meal_request: interaction.hasOfflineMealRequest,
  is_only_rank_and_chat: interaction.isOnlyRankAndChat,
  topics: interaction.topics,
  remark: interaction.remark,
  raw_text: interaction.rawText
});
```

写入后重新读取该用户互动记录，计算新的支持率、总消费、单笔消费次数，再更新 `audience_users` 和 `user_tagging_logs`。

## 自动打标写入

当前自动打标函数需要返回这些字段：

```js
{
  tier,
  autoTags,
  tags,
  matchedRules,
  taggingSnapshot
}
```

每次自动打标后写入日志：

```js
await supabase.from("user_tagging_logs").insert({
  owner_id: ownerId,
  audience_user_id: user.id,
  old_tier: oldTier,
  new_tier: result.tier,
  matched_rules: result.matchedRules,
  calculated_snapshot: result.taggingSnapshot,
  operator_type: "system"
});
```

如果启用 `user_tags` 表，可以在更新用户后同步覆盖 `source = 'auto'` 的标签关系：

```js
await supabase
  .from("user_tags")
  .delete()
  .eq("audience_user_id", user.id)
  .eq("source", "auto");
```

随后查出 `tag_definitions` 中对应标签 ID，再批量插入新的自动标签。

## 直播趋势

趋势页可以直接读取 SQL 视图：

```js
const { data: daily } = await supabase
  .from("live_daily_metrics")
  .select("*")
  .order("live_date", { ascending: false })
  .limit(30);

const { data: weekly } = await supabase
  .from("live_weekly_metrics")
  .select("*")
  .order("week_start_date", { ascending: true })
  .limit(12);

const { data: monthly } = await supabase
  .from("live_monthly_metrics")
  .select("*")
  .order("month_start_date", { ascending: true })
  .limit(12);
```

这些视图已经按 `owner_id` 汇总。读取时仍建议检查当前登录状态，避免未登录时展示空数据造成误解。

## 失败处理

网络失败时不要覆盖本地页面数据。建议展示提示：

```text
云端保存失败，当前修改已暂存在本机。恢复网络后可再次同步。
```

新增一个本地队列：

```text
userAtlasPendingWrites
```

当 Supabase 写入失败时，把操作暂存到队列。下次页面启动或用户点击“同步”时再重试。

## 改造顺序

1. 在 Supabase 执行 `supabase/schema.sql`。
2. 修改 `supabase-config.js`，填入项目 URL 和 anon key。
3. 增加登录 UI。
4. 把 `api.js` 的读写从 `localStorage` 替换为 Supabase 查询。
5. 接入新增、编辑、删除用户。
6. 接入“记录一次互动”。
7. 接入直播记录和趋势页。
8. 发布到 GitHub Pages。

## MVP 范围

第一版可以先接：

- 登录
- `audience_users`
- `live_sessions`
- `user_live_interactions`

暂时不接：

- `user_tags`
- `user_tagging_logs`

因为当前前端已经把自动标签和命中规则保存在 `audience_users` 中。等你需要追溯“为什么某个用户从 A 变成 S”时，再启用标签关系表和打标日志表。
