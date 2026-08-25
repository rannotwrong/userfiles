# 用户增长档案台 · User Atlas

面向个位数直播间娱乐主播的本地用户档案和自动打标工具。

## 功能

- 用户档案列表、筛选、搜索
- 新增和编辑用户档案
- 记录单次互动并自动更新最近互动时间
- 自动打标：根据支持率、消费金额、接话、目的性等规则计算 S/A/B/C 分层
- 直播记录文字和图片识别模拟录入
- 直播数据趋势：日、周、月收入和潜力用户趋势
- 浏览器本地存储，无需后端即可使用

## 本地预览

```bash
python3 -m http.server 8765
```

打开：

```text
http://localhost:8765/index.html
```

## GitHub Pages 部署

部署步骤：

1. 在 GitHub 新建一个空仓库。
2. 将本目录代码推送到仓库的 `main` 分支。
3. 打开 GitHub 仓库的 `Settings -> Pages`。
4. 在 `Build and deployment` 中选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/ (root)`。
6. 保存后等待 GitHub Pages 发布完成。
7. GitHub 会生成公开访问链接。

## 入口文件

```text
index.html
```
