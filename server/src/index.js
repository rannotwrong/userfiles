import "dotenv/config";
import express from "express";
import cors from "cors";
import { recognizeLiveImageWithDoubao, recognizeLiveImagesWithDoubao } from "./doubaoVision.js";
import { parseLiveRecordText } from "./liveRecordParser.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("当前来源不允许访问 OCR 代理。"));
  }
}));
app.use(express.json({ limit: "14mb" }));

function requireProxyToken(req, res, next) {
  const token = process.env.OCR_PROXY_TOKEN || "";
  if (!token) {
    next();
    return;
  }
  if (req.headers["x-ocr-proxy-token"] !== token) {
    res.status(401).json({ code: 401, message: "OCR 代理鉴权失败" });
    return;
  }
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "user-profile-notebook-ocr-proxy"
  });
});

app.post("/api/live-records/recognize-image", requireProxyToken, async (req, res) => {
  try {
    const { imageBase64 = "", mimeType = "image/png", text = "" } = req.body || {};
    const data = await recognizeLiveImageWithDoubao({ imageBase64, mimeType, text });
    res.json({
      code: 0,
      data,
      provider: "doubao"
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error.message || "图片识别失败"
    });
  }
});

app.post("/api/live-records/recognize-images", requireProxyToken, async (req, res) => {
  try {
    const { images = [], text = "" } = req.body || {};
    const data = await recognizeLiveImagesWithDoubao({ images, text });
    res.json({
      code: 0,
      data,
      provider: "doubao"
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: error.message || "图片识别失败"
    });
  }
});

app.post("/api/live-records/parse-text", requireProxyToken, (req, res) => {
  const { text = "" } = req.body || {};
  res.json({
    code: 0,
    data: {
      summary: parseLiveRecordText(text)
    },
    provider: "local-parser"
  });
});

app.listen(port, () => {
  console.log(`User Profile Notebook OCR proxy listening on ${port}`);
});
