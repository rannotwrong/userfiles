import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");

const checks = [
  {
    file: "miniprogram/project.config.json",
    pattern: /"appid"\s*:\s*"touristappid"/,
    message: "project.config.json 仍是 touristappid，请替换为正式小程序 AppID"
  },
  {
    file: "miniprogram/utils/config.js",
    pattern: /REPLACE_WITH_CLOUD_ENV_ID/,
    message: "config.js 仍缺少微信云托管环境 ID"
  }
];

const failures = [];
for (const check of checks) {
  const content = await readFile(path.join(projectRoot, check.file), "utf8");
  if (check.pattern.test(content)) failures.push(check.message);
}

if (failures.length) {
  console.error("发布自检未通过：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("发布自检通过：AppID 和云托管环境均已配置。");
}
