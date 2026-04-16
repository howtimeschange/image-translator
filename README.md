# Image Translator — Nano Banana

> **网页图片 AI 翻译 Chrome 插件**
> 基于 Nano Banana（Gemini 图像生成）模型，保持原图排版 / 主体 / 风格不变，只把文字翻译成目标语言。

---

## 功能概览

### 三种使用方式

| 方式 | 操作 | 适合场景 |
|------|------|---------|
| **右键单图** | 右键任意图片 → 翻译此图片 | 单张快速翻译 |
| **批量扫描** | 侧边栏 → 批量 → 识别整页图片 | 商品详情页批量翻译 |
| **📌 Pin 精选** | 鼠标悬停图片 → 点 Pin 按钮 | 手动挑选主图加入队列 |

### 核心特性

- **两阶段翻译**：先 OCR 识别文字及排版，再用 Nano Banana 重绘（保留布局 / 颜色 / 字体风格）
- **品牌保护**：Logo、品牌名、型号、SKU 默认保持原文，仅翻译描述性文案
- **商品图智能识别**：内置天猫 / 京东 / 1688 / 拼多多 / Shopee 平台规则，优先抓主图 / 商详图，过滤评论图 / 头像 / 广告图
- **识别整页图片**：6 个滚动检查点触发懒加载，读取 `data-src` / `srcset` / `background-image` 等多种来源
- **429 自动重试**：遇到配额超限自动等待并重试
- **翻译结果持久化**：历史记录存储在本地，侧边栏关闭再打开不丢失
- **点击放大预览**：翻译结果支持全屏预览 + 一键下载
- **翻译在侧边栏执行**：不依赖 Service Worker，不受 MV3 挂起限制，长图批量稳定

### 支持模型

| 模型 | 底层 | 特点 |
|------|------|------|
| Nano Banana 2 | `gemini-3.1-flash-image-preview` | 速度快，性价比高 |
| Nano Banana Pro | `gemini-3-pro-image-preview` | 画质精细，适合复杂图 |

### 支持 12 种目标语言

中文 / English / 日本語 / 한국어 / Français / Deutsch / Español / Português / Русский / العربية / ไทย / Tiếng Việt

---

## 安装

### 方式一：加载 dist 目录（推荐开发者）

```bash
git clone https://github.com/howtimeschange/image-translator.git
cd image-translator
npm install
npm run build
```

1. 打开 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」→ 选 `dist/` 目录

### 方式二：加载 extension.zip

```bash
npm run zip   # 生成 extension.zip
```

将 `extension.zip` 解压后，同样在 `chrome://extensions/` 加载解压目录。

> **已打开的页面需刷新一次**，或扩展会自动注入 content script（无需手动操作）。

---

## 配置 API Key

1. 点击扩展图标打开侧边栏
2. 切换到「⚙ 设置」Tab
3. 填写 [1xm.ai Relay](https://1xm.ai) 的三个 Key（格式：`sk-...`）：
   - **Vision Key** → 用于 OCR 识字（gemini-3-flash-preview）
   - **Banana 2 Key** → 用于 Nano Banana 2 生图
   - **Pro Key** → 用于 Nano Banana Pro 生图（可选）
4. 保存

> API Key 仅保存在本地 `chrome.storage.local`，不上传任何服务器。

---

## 使用指南

### 单图翻译

1. 在网页上右键任意图片
2. 选择「🌐 翻译此图片 (Image Translator)」
3. 侧边栏自动打开，选择目标语言和模型
4. 点「翻译」，等待 10–30 秒
5. 点击结果图可放大预览 / 下载

### 批量翻译（扫描模式）

1. 打开目标页面（商品详情页等）
2. 点击扩展图标打开侧边栏 → 切「批量」Tab
3. 点「↺ 识别整页图片」—— 扩展会滚动页面触发懒加载，自动识别商品图
4. 在网格里勾选要翻译的图片（全选 / 取消按钮在右上角）
5. 选择语言和模型，点「批量翻译」
6. 进度在「结果」Tab 实时更新

### 📌 Pin 精选（手动挑图）

1. 切到「批量」Tab（会自动开启 Pin 浮层）
2. 在网页上把鼠标移到任意图片上，出现「📌 Pin」按钮
3. 点击 Pin，图片进入批量队列（页面上出现 📌 角标，避免重复 Pin）
4. 侧边栏自动切到批量 Tab，已 Pin 图片显示在顶部区域（金色边框）
5. Pin 队列中每张图右下角有 ❌ 删除按钮，可单独移除
6. 点「批量翻译」即可

---

## 项目结构

```
image-translator/
├── public/
│   ├── manifest.json            # MV3 配置
│   └── icons/
├── src/
│   ├── background/
│   │   └── service-worker.ts    # 路由 / 注入 / Pin 队列管理
│   ├── content/
│   │   └── content-script.ts    # 深度扫描 / Pin 浮层 / 已 Pin 角标
│   ├── sidebar/
│   │   ├── App.tsx              # 主界面（翻译逻辑在此执行）
│   │   ├── main.tsx
│   │   └── index.html
│   ├── components/
│   │   ├── TranslateControls.tsx
│   │   ├── ImageGrid.tsx        # 分组展示（Pin 组 / 扫描组）
│   │   ├── JobCard.tsx          # 结果卡片（可点击放大）
│   │   ├── ImageLightbox.tsx    # 全屏预览 + 下载
│   │   └── SettingsPanel.tsx
│   ├── services/
│   │   ├── types.ts
│   │   └── translator.ts        # 两阶段翻译核心
│   └── stores/
│       └── appStore.ts
├── vite.config.ts
└── package.json
```

---

## 技术架构

**Tech Stack：** React 18 + TypeScript + Vite + Zustand + Chrome MV3

### 翻译流程

```
网页图片 URL / base64
        │
        ▼ Step 1 — OCR（gemini-3-flash-preview）
  文字列表 + 位置 + 品牌判断 JSON
        │
        ▼ Step 2 — 重绘（Nano Banana 2 / Pro）
  翻译后图片 dataURL
        │
        ▼ 侧边栏展示 + 可下载（结果持久化到本地）
```

### 关键设计决策

| 问题 | 方案 |
|------|------|
| MV3 Service Worker 会被挂起，翻译中断 | 翻译逻辑移到侧边栏页面直接执行 |
| 已打开 Tab 没有 content script | `scripting.executeScript` 主动注入，`PING` 检测避免重复 |
| 侧边栏 `currentWindow` 找错 Tab | `chrome.windows.getLastFocused()` + `sidebarBoundTabId` 双重保障 |
| 京东 / 天猫主图被遮罩层覆盖，Pin 失效 | `document.elementsFromPoint()` 穿透遮罩找真实 img |
| 批量翻译 429 配额超限 | 顺序执行 + 解析 retry-after + 自动等待重试 |
| 懒加载图片扫描不到 | 6 个滚动检查点 + 多种 data-* 属性读取 |
| 重复点击扫描导致卡死 | `scanInProgress` flag 防重入，try/finally 还原滚动位置 |
| 关闭侧边栏翻译历史丢失 | jobs 按 key 分拆存入 `chrome.storage.local`，启动时读回 |

---

## 开发

```bash
npm install
npm run dev    # 调试 sidebar UI
npm run build  # 构建到 dist/
npm run zip    # 构建 + 打包 extension.zip
```

---

## 更新记录

### v1.1.0（2026-04-16）
- ✨ 识别整页图片：多滚动检查点 + 懒加载触发 + 多属性读取
- ✨ 📌 Pin 精选：手动挑图加入批量队列，页面打角标防重复
- ✨ 商品图智能识别：内置 5 平台规则（天猫/京东/1688/拼多多/Shopee），过滤噪音图
- ✨ 全屏放大预览 + 下载（单图 + 批量结果）
- ✨ 翻译结果持久化：历史记录本地保存，重开侧边栏不丢失
- 🐛 修复：翻译中断（翻译逻辑移出 Service Worker，侧边栏页面直接执行）
- 🐛 修复：扫描到错误页面（lastFocusedWindow + sidebarBoundTabId）
- 🐛 修复：已打开页面 content script 未注入
- 🐛 修复：Pin 在遮罩层覆盖区域失效
- 🐛 修复：重复点击扫描导致页面卡死

### v1.0.0（2026-04）
- 🎉 初始版本：单图右键翻译 + 批量扫描 + 品牌保护
