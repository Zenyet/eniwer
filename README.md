# Eniwer

AI 驱动的浏览器工具箱扩展 — 翻译、标注、摘要、与网页对话等。

支持 Chrome 及其他 Chromium 浏览器（Edge、Brave、Arc 等）。

## 开发

```bash
npm install
npm run dev       # 开发模式（watch）
npm run build     # 构建
npm run package   # 构建并打包 zip
```

构建产物在 `dist/` 目录，浏览器中加载该目录即可调试。

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
- 快捷键呼出面板（`Alt+Space`）

## License

MIT
