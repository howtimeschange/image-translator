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

// ── 0. 侧边栏 tabId 追踪 ─────────────────────────────────────────────────────
// 侧边栏打开时绑定的 tab，用于深度扫描和消息发送

let sidebarBoundTabId: number | null = null

// ── 1. 点击扩展图标 → 打开侧边栏 ─────────────────────────────────────────────

chrome.action.onClicked.addListener((tab) => {
  if (chrome.sidePanel && tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})
    if (tab.id) sidebarBoundTabId = tab.id
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
    sidebarBoundTabId = tabId
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
      await ensureContentScript(tabId)
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  // 侧边栏注册自己绑定的 tabId（侧边栏初始化时发送）
  if (message.type === 'REGISTER_SIDEBAR_TAB') {
    if (message.tabId) sidebarBoundTabId = message.tabId as number
    sendResponse({ ok: true })
    return false
  }

  // 获取绑定的 tabId
  if (message.type === 'GET_ACTIVE_TAB_ID') {
    getActivePageTabId()
      .then((tabId) => sendResponse({ tabId }))
      .catch(() => sendResponse({ tabId: null }))
    return true
  }

  if (message.type === 'SCAN_PAGE_IMAGES' || message.type === 'DEEP_SCAN_PAGE_IMAGES') {
    const requestedTabId = message.tabId as number | undefined
    const doScan = async (id: number) => {
      try {
        await ensureContentScript(id)
        const resp = await chrome.tabs.sendMessage(id, { type: 'DEEP_SCAN_PAGE_IMAGES' })
        sendResponse(resp)
      } catch (e) {
        sendResponse({ images: [], error: String(e) })
      }
    }
    if (requestedTabId) {
      doScan(requestedTabId)
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
    ensureContentScript(targetTabId).then(() => {
      chrome.tabs.sendMessage(targetTabId, payload)
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }))
    }).catch(() => sendResponse({ ok: false }))
    return true
  }

  if (message.type === 'PIN_IMAGE') {
    // sender.tab.id 是 content script 所在 tab，记录下来
    if (sender.tab?.id) sidebarBoundTabId = sender.tab.id
    addPinnedImage(message.image as PageImage)
      .then(async (images) => {
        // 广播给侧边栏
        chrome.runtime.sendMessage({ type: 'PIN_IMAGE', image: message.image, images }).catch(() => {})
        // 同时写入 storage 让侧边栏下次打开时也能读到
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

// ── 7. 确保 content script 已注入 ────────────────────────────────────────────
// MV3 限制：扩展更新后已打开的 tab 不会自动重新注入 content script

const injectedTabs = new Set<number>()

async function ensureContentScript(tabId: number): Promise<void> {
  if (injectedTabs.has(tabId)) return

  // 先 ping，有响应说明已注入
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' })
    injectedTabs.add(tabId)
    return
  } catch {
    // 未注入，继续
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content-script.js'],
    })
    injectedTabs.add(tabId)
    await new Promise((r) => setTimeout(r, 150))
  } catch (e) {
    console.warn('[image-translator] cannot inject content script:', e)
  }
}

// ── 8. 获取真实页面 tabId ─────────────────────────────────────────────────────
// 优先使用 sidebarBoundTabId，fallback 到 active tab 查询

async function getActivePageTabId(): Promise<number | null> {
  // 优先用侧边栏绑定的 tabId
  if (sidebarBoundTabId) {
    try {
      const tab = await chrome.tabs.get(sidebarBoundTabId)
      if (tab && tab.url && /^https?:/.test(tab.url)) return sidebarBoundTabId
    } catch {
      sidebarBoundTabId = null
    }
  }

  // fallback：遍历所有窗口的 active tab，找 http/https 页面
  const activeTabs = await chrome.tabs.query({ active: true })
  for (const tab of activeTabs) {
    if (tab.id && tab.url && /^https?:/.test(tab.url)) return tab.id
  }

  // 最后兜底：highlighted tab
  const highlighted = await chrome.tabs.query({ highlighted: true })
  for (const tab of highlighted) {
    if (tab.id && tab.url && /^https?:/.test(tab.url)) return tab.id
  }
  return null
}

// ── 9. Keep service worker alive (MV3 workaround) ────────────────────────────

chrome.alarms.create('keepalive', { periodInMinutes: 0.4 })
chrome.alarms.onAlarm.addListener(() => { /* noop keepalive */ })

// tab 导航/刷新时清掉注入缓存，同时重置绑定 tabId（以便重新注入）
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    injectedTabs.delete(tabId)
    // 如果刷新的是绑定 tab，清掉缓存（下次操作会重新注入）
    if (tabId === sidebarBoundTabId) injectedTabs.delete(tabId)
  }
})
chrome.tabs.onRemoved.addListener((tabId) => {
  injectedTabs.delete(tabId)
  if (tabId === sidebarBoundTabId) sidebarBoundTabId = null
})
