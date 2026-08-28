# Web 端豆包图片识别配置说明

Web 端页面部署在 GitHub Pages，属于静态页面，不能直接保存或调用豆包 API Key。图片识别需要通过仓库里的 `server/` 目录部署一个 Node.js OCR 代理服务。

## 已完成

- Web 前端已支持读取 `supabase-config.js` 中的 `aiProxyUrl` 和 `aiProxyToken`。
- Web 前端上传直播截图后，会调用 `POST /api/live-records/recognize-image`。
- 服务端代理已接入火山方舟 / 豆包视觉模型。
- 如果没有配置代理地址，前端会保留手动补充字段的兜底逻辑，不影响现有页面使用。

## 需要你准备

- 火山方舟 / 豆包 API Key。
- 一个可以部署 Node.js 服务的平台，例如 Vercel、Railway、Render、火山云函数、腾讯云函数或自己的服务器。
- 如果启用访问口令，需要自己生成一串 `OCR_PROXY_TOKEN`，例如 32 位以上随机字符串。

## 服务端环境变量

在部署平台的环境变量面板中填写，不要写进前端文件：

```env
ARK_API_KEY=你的火山方舟或豆包 API Key
DOUBAO_VISION_MODEL=doubao-seed-2-1-pro-260628
OCR_PROXY_TOKEN=你自己设置的一串访问口令
ALLOWED_ORIGINS=https://rannotwrong.github.io
```

如果你的模型 ID 和默认值不同，把 `DOUBAO_VISION_MODEL` 改成火山方舟控制台里实际开通的视觉模型 ID。

## 本地测试

在 `server/` 目录创建 `.env`：

```bash
cd server
cp .env.example .env
```

填写 `.env` 后启动：

```bash
npm install
npm run dev
```

启动成功后，本地代理地址是：

```text
http://localhost:3001
```

然后在根目录 `supabase-config.js` 里临时配置：

```js
aiProxyUrl: "http://localhost:3001",
aiProxyToken: "你在 OCR_PROXY_TOKEN 里设置的口令"
```

本地测试完成后，再把 `aiProxyUrl` 改成正式部署后的 HTTPS 地址。

## 正式上线

部署 `server/` 目录后，拿到后端 HTTPS 地址，例如：

```text
https://user-profile-ocr.example.com
```

然后修改根目录 `supabase-config.js`：

```js
aiProxyUrl: "https://user-profile-ocr.example.com",
aiProxyToken: "你在 OCR_PROXY_TOKEN 里设置的口令"
```

提交并推送到 GitHub Pages 后，Web 端直播截图上传就会走豆包识别。

## 验证方式

先访问后端健康检查：

```text
https://你的后端域名/api/health
```

看到类似下面的结果，说明服务已启动：

```json
{
  "ok": true,
  "service": "user-profile-notebook-ocr-proxy"
}
```

再打开 GitHub Pages 页面，上传一张直播截图。如果 `aiProxyUrl`、`aiProxyToken` 和服务端环境变量都正确，页面会自动填充日期、总收入、送礼人数、新用户送礼人数、最高价值礼物和评分。

## 常见问题

- 如果提示图片识别服务暂不可用：检查 `aiProxyUrl` 是否是 HTTPS 正式地址，且后端是否已启动。
- 如果提示鉴权失败：检查前端 `aiProxyToken` 是否和服务端 `OCR_PROXY_TOKEN` 完全一致。
- 如果豆包返回失败：检查 `ARK_API_KEY` 是否有效，以及 `DOUBAO_VISION_MODEL` 是否是已开通的视觉模型。
- 如果浏览器控制台出现跨域错误：检查服务端 `ALLOWED_ORIGINS` 是否包含 `https://rannotwrong.github.io`。
