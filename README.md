# Eniwer

Eniwer（灵感来自 JetBrains 的双击 Shift）是一款优雅的 AI 浏览器工具面板。

通过简洁统一的命令面板界面，你可以快速调用翻译、标注、摘要、网页对话、YouTube 字幕翻译与朗读等能力，让阅读、学习与信息处理更高效。

支持 Chrome 及其他 Chromium 浏览器（Edge、Brave、Arc 等）。

## 开发

```bash
npm install
npm run dev       # 开发模式（watch）
npm run build     # 构建
npm run package   # 构建并打包 zip
```

构建产物在 `dist/` 目录，浏览器中加载该目录即可调试。

## Edge TTS Proxy

`edge-tts-proxy/` 是独立的代理服务，原先按 Vercel Serverless API 组织；现在也支持直接以 Node 服务运行，因此可以用 Docker 部署。

```bash
cd edge-tts-proxy
npm install
npm run dev
```

默认监听 `3000` 端口：

- `POST /api/tts`
- `GET /api/voices`
- `GET /health`

Docker 部署：

```bash
cd edge-tts-proxy
docker build -t edge-tts-proxy .
docker run --rm -p 3000:3000 edge-tts-proxy
```

Docker Compose：

```bash
cd edge-tts-proxy
docker compose up -d --build
```

## 项目结构

```
src/
├── background/    # Service Worker（认证、同步、Drive 导出）
├── content/       # 内容脚本（Command Palette UI）
├── popup/         # 扩展弹窗页
├── styles/        # 样式
├── utils/         # 工具函数
└── types.ts       # 类型定义
```

## 功能

- 划词翻译 / 全文翻译
- 网页标注与批注
- AI 摘要与对话
- Google Drive 云同步与备份
- 快捷键呼出面板（`双击 shift`）

## License

MIT
