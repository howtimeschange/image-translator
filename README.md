# Image Translator - Nano Banana Chrome Extension

> 基于 Nano Banana (Gemini 图像生成) 的网页图片 AI 翻译插件
> 保持原图布局、主体和字体风格，仅替换文字语言

---

## 功能

**两种触发方式：**

1. **单图模式（右键触发）** — 在目标图片上右键 → 「翻译此图片」→ 侧边栏显示，选语言后生成
2. **批量模式** — 打开侧边栏，自动扫描页面所有图片，勾选需要翻译的，批量生成

**支持的模型：**

| 模型 | Gemini 底层 | 说明 |
|------|------------|------|
| Nano Banana 2 | `gemini-3.1-flash-image-preview` | 速度快，性价比高 |
| Nano Banana Pro | `gemini-3-pro-image-preview` | 画质精细，适合复杂图片 |

**支持 12 种目标语言：** 中文、English、日本語、한국어、Français、Deutsch、Español、Português、Русский、العربية、ไทย、Tiếng Việt

**一致性保障：**
- 两阶段生成：先识别原图文字内容和排版，再做图像翻译
- Prompt 强调保持布局、主体、构图和字体风格不变
- 仅替换文字内容

---

## 安装

### 开发者模式安装（本地构建）

```bash
cd image-translator
npm install
npm run build
```

1. 打开 Chrome `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `dist/` 目录

### 使用打包的 zip

```bash
npm run zip
# 生成 extension.zip，可直接拖拽到 chrome://extensions/ 加载
```

---

## 配置 API Key

1. 打开插件侧边栏 → 「设置」Tab
2. 填入 [1xm.ai Relay API Key](https://1xm.ai)（格式：`sk-...`）
3. 点击保存

> API Key 仅存储在本地 `chrome.storage.local`，不会上传任何服务器

---

## 项目结构

```
image-translator/
├── public/
│   ├── manifest.json       # MV3 配置
│   └── icons/              # 插件图标
├── src/
│   ├── background/
│   │   └── service-worker.ts   # 右键菜单 + API 代理
│   ├── content/
│   │   └── content-script.ts   # 页面图片扫描 + base64 获取
│   ├── sidebar/
│   │   ├── App.tsx             # 主界面（单图/批量/结果/设置）
│   │   ├── main.tsx
│   │   └── index.html
│   ├── components/
│   │   ├── TranslateControls.tsx  # 语言/模型选择 + 翻译按钮
│   │   ├── ImageGrid.tsx          # 批量图片选择网格
│   │   ├── JobCard.tsx            # 翻译任务结果卡片
│   │   └── SettingsPanel.tsx      # 设置面板
│   ├── services/
│   │   ├── types.ts               # 共享类型和常量
│   │   └── translator.ts          # 核心翻译逻辑（两阶段）
│   └── stores/
│       └── appStore.ts            # Zustand 全局状态
├── vite.config.ts
├── package.json
└── tsconfig.json
```

---

## 技术方案

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Vite + Zustand + Chrome MV3

**翻译流程（两阶段）：**

```
原图 base64
    │
    ▼ Step 1: 识图（gemini-3-flash-preview）
  文字内容 + 排版信息 JSON
    │
    ▼ Step 2: 翻译生图（Nano Banana）
  翻译后图片 dataURL
```

**API 调用：** 全部通过 Background Service Worker 发起（避免 CORS），使用 1xm.ai Relay 的 OpenAI 兼容接口

---

## 开发

```bash
npm install
npm run dev   # Vite dev server（用于调试 sidebar UI）
npm run build # 构建到 dist/
npm run zip   # 构建 + 打包 extension.zip
```
