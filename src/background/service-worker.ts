// ── service-worker.ts ─────────────────────────────────────────────────────────
// Background Service Worker
// - 右键菜单处理
// - 点击图标打开侧边栏
// - 代理 API 调用（避免 CORS）
// - 消息路由
// - 管理 Pin 队列（storage.local.pinnedImages）
//
// ⚠️  MV3 关键限制：chrome.sidePanel.open() 必须在用户手势的同步调用栈内执行
//     不能在任何 await 之后调用，否则 Chrome 会拒绝（not from a user gesture）
//     正确顺序：① 先 open()  ②  再 await 获取数据  ③ 再通知 sidebar

import { translateImage, fetchImageBase64 } from '../services/translator'
import type { Language, ModelId, PageImage } from '../services/types'

// ── 1. 点击扩展图标 → 打开侧边栏 ─────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
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

  if (chrome.sidePanel) {
    chrome.sidePanel.setOptions({ enabled: true }).catch(() => {})
  }
})

// ── 3. 右键菜单点击 ──────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'translate-image' || !info.srcUrl || !tab?.id) return

  const imageUrl = info.srcUrl
  const tabId = tab.id
  const windowId = tab.windowId!

  if (chrome.sidePanel) {
    chrome.sidePanel.open({ windowId }).catch(() => {})
  }

  chrome.storage.local.set({
    pendingImage: { url: imageUrl, base64: null, timestamp: Date.now(), loading: true },
  })

  chrome.runtime.sendMessage({
    type: 'OPEN_SIDEBAR_WITH_IMAGE',
    url: imageUrl,
    base64: null,
  }).catch(() => {})

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

    await chrome.storage.local.set({
      pendingImage: { url: imageUrl, base64, timestamp: Date.now(), loading: false },
    })

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

  // 获取真实页面 tabId（过滤扩展页面、找最近活跃的普通页面 tab）
  if (message.type === 'GET_ACTIVE_TAB_ID') {
    getActivePageTabId()
      .then((tabId) => sendResponse({ tabId }))
      .catch(() => sendResponse({ tabId: null }))
    return true
  }

  if (message.type === 'SCAN_PAGE_IMAGES' || message.type === 'DEEP_SCAN_PAGE_IMAGES') {
    const tabId = message.tabId as number | undefined
    const doScan = async (id: number) => {
      try {
        const resp = await chrome.tabs.sendMessage(id, { type: 'DEEP_SCAN_PAGE_IMAGES' })
        sendResponse(resp)
      } catch {
        sendResponse({ images: [] })
      }
    }
    if (tabId) {
      doScan(tabId)
    } else {
      getActivePageTabId()
        .then((id) => id ? doScan(id) : sendResponse({ images: [] }))
        .catch(() => sendResponse({ images: [] }))
    }
    return true
  }

  // 转发消息到指定 tab（PIN_OVERLAY_INIT / SYNC_PINNED_SRCS）
  if (message.type === 'RELAY_TO_TAB') {
    const { tabId: targetTabId, payload } = message as { tabId: number; payload: object }
    chrome.tabs.sendMessage(targetTabId, payload)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }

  if (message.type === 'PIN_IMAGE') {
    addPinnedImage(message.image as PageImage)
      .then(async (images) => {
        chrome.runtime.sendMessage({ type: 'PIN_IMAGE', image: message.image, images }).catch(() => {})
        sendResponse({ ok: true, images })
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true
  }

  if (message.type === 'GET_PINNED_IMAGES') {
    getPinnedImages()
      .then((images) => sendResponse({ images }))
      .catch(() => sendResponse({ images: [] }))
    return true
  }

  if (message.type === 'CLEAR_PINNED_IMAGES') {
    chrome.storage.local.set({ pinnedImages: [] })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
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

// ── 6. Pin Queue Helpers ─────────────────────────────────────────────────────

async function getPinnedImages(): Promise<PageImage[]> {
  const data = await chrome.storage.local.get(['pinnedImages'])
  return Array.isArray(data.pinnedImages) ? data.pinnedImages : []
}

async function addPinnedImage(image: PageImage): Promise<PageImage[]> {
  const existing = await getPinnedImages()
  const next = [image, ...existing.filter((item) => item.src !== image.src)]
  await chrome.storage.local.set({ pinnedImages: next })
  return next
}

// ── 7. 获取真实页面 tabId ─────────────────────────────────────────────────────
// 侧边栏的 currentWindow 可能指向扩展自身，必须主动过滤出普通 http/https 页面

async function getActivePageTabId(): Promise<number | null> {
  // 优先：当前所有窗口中 active=true 的普通页面
  const activeTabs = await chrome.tabs.query({ active: true })
  for (const tab of activeTabs) {
    if (tab.id && tab.url && /^https?:/.test(tab.url)) return tab.id
  }
  // 兜底：最近高亮的普通页面（用于 macOS 侧边栏把焦点拿走的情况）
  const allTabs = await chrome.tabs.query({ highlighted: true })
  for (const tab of allTabs) {
    if (tab.id && tab.url && /^https?:/.test(tab.url)) return tab.id
  }
  return null
}

// ── 7. Keep service worker alive (MV3 workaround) ────────────────────────────

chrome.alarms.create('keepalive', { periodInMinutes: 0.4 })
chrome.alarms.onAlarm.addListener(() => { /* noop keepalive */ })

