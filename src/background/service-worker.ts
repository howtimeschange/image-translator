// ── service-worker.ts ─────────────────────────────────────────────────────────
// Background Service Worker
// - 右键菜单处理
// - 点击图标打开侧边栏
// - 代理 API 调用（避免 CORS）
// - 消息路由
//
// ⚠️  MV3 关键限制：chrome.sidePanel.open() 必须在用户手势的同步调用栈内执行
//     不能在任何 await 之后调用，否则 Chrome 会拒绝（not from a user gesture）
//     正确顺序：① 先 open()  ②  再 await 获取数据  ③ 再通知 sidebar

import { translateImage, fetchImageBase64 } from '../services/translator'
import type { Language, ModelId } from '../services/types'

// ── 1. 点击扩展图标 → 打开侧边栏 ─────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  // MUST be synchronous — no await before this
  if (chrome.sidePanel && tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})
  }
})

// ── 2. 安装时注册右键菜单 ────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-image',
    title: '🌐 翻译此图片 (Image Translator)',
    contexts: ['image'],
  })

  // 允许在所有页面显示侧边栏（不自动打开，需手动触发）
  if (chrome.sidePanel) {
    chrome.sidePanel.setOptions({ enabled: true }).catch(() => {})
  }
})

// ── 3. 右键菜单点击 ──────────────────────────────────────────────────────────
//
// 关键：先同步调用 sidePanel.open()，再做任何异步操作

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'translate-image' || !info.srcUrl || !tab?.id) return

  const imageUrl = info.srcUrl
  const tabId = tab.id
  const windowId = tab.windowId!

  // ① SYNC: open sidebar immediately (must be before any await)
  if (chrome.sidePanel) {
    chrome.sidePanel.open({ windowId }).catch(() => {})
  }

  // ② Store a "loading" placeholder so sidebar knows something is coming
  chrome.storage.local.set({
    pendingImage: { url: imageUrl, base64: null, timestamp: Date.now(), loading: true },
  })

  // Notify sidebar immediately with URL (no base64 yet)
  chrome.runtime.sendMessage({
    type: 'OPEN_SIDEBAR_WITH_IMAGE',
    url: imageUrl,
    base64: null,
  }).catch(() => {})

  // ③ ASYNC: fetch base64 in background, then update
  ;(async () => {
    let base64: string | null = null
    try {
      const resp = await chrome.tabs.sendMessage(tabId, {
        type: 'FETCH_IMAGE_BASE64',
        url: imageUrl,
      })
      base64 = resp?.base64 ?? null
    } catch {
      try { base64 = await fetchImageBase64(imageUrl) } catch { /* ignore */ }
    }

    // Update storage with base64
    await chrome.storage.local.set({
      pendingImage: { url: imageUrl, base64, timestamp: Date.now(), loading: false },
    })

    // Notify sidebar that base64 is ready
    chrome.runtime.sendMessage({
      type: 'IMAGE_BASE64_READY',
      url: imageUrl,
      base64,
    }).catch(() => {})
  })()
})

// ── 4. Message Router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TRANSLATE_IMAGE') {
    handleTranslate(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: String(err) }))
    return true
  }
  if (message.type === 'FETCH_IMAGE_BASE64_BG') {
    fetchImageBase64(message.url as string)
      .then((base64) => sendResponse({ base64 }))
      .catch((err) => sendResponse({ error: String(err) }))
    return true
  }

  if (message.type === 'SCAN_PAGE_IMAGES') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]?.id) { sendResponse({ images: [] }); return }
      try {
        const resp = await chrome.tabs.sendMessage(tabs[0].id, { type: 'SCAN_PAGE_IMAGES' })
        sendResponse(resp)
      } catch {
        sendResponse({ images: [] })
      }
    })
    return true
  }
})

// ── 5. Translation Handler ────────────────────────────────────────────────────

async function handleTranslate(message: {
  imageUrl: string
  imageBase64: string | null
  sourceLanguage: Language
  targetLanguage: Language
  model: ModelId
  visionApiKey: string
  banana2ApiKey: string
  bananaProApiKey: string
  preserveBrand: boolean
  jobId: string
}) {
  const {
    imageUrl, imageBase64,
    sourceLanguage, targetLanguage, model,
    visionApiKey, banana2ApiKey, bananaProApiKey,
    preserveBrand, jobId,
  } = message

  let base64 = imageBase64
  if (!base64) {
    try { base64 = await fetchImageBase64(imageUrl) }
    catch (e) { throw new Error(`无法获取图片数据: ${e}`) }
  }
  if (!base64) throw new Error('图片数据为空')

  const result = await translateImage(
    base64, sourceLanguage, targetLanguage, model,
    { visionApiKey, banana2ApiKey, bananaProApiKey },
    preserveBrand,
  )
  return { jobId, ...result }
}

// ── 6. Keep service worker alive (MV3 workaround) ────────────────────────────

chrome.alarms.create('keepalive', { periodInMinutes: 0.4 })
chrome.alarms.onAlarm.addListener(() => { /* noop keepalive */ })
