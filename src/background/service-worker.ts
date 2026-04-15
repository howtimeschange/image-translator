// ── service-worker.ts ─────────────────────────────────────────────────────────
// Background Service Worker
// - 右键菜单处理
// - 代理 API 调用（避免 CORS）
// - 消息路由

import { translateImage, fetchImageBase64 } from '../services/translator'
import type { Language, ModelId } from '../services/types'

// ── Context Menu ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-image',
    title: '🌐 翻译此图片 (Image Translator)',
    contexts: ['image'],
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'translate-image' || !info.srcUrl || !tab?.id) return

  const imageUrl = info.srcUrl

  // Try to get base64 from content script
  let imageBase64: string | null = null
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, {
      type: 'FETCH_IMAGE_BASE64',
      url: imageUrl,
    })
    imageBase64 = resp?.base64 ?? null
  } catch {
    // content script may not be ready, fallback to background fetch
    try {
      imageBase64 = await fetchImageBase64(imageUrl)
    } catch { /* ignore */ }
  }

  // Store the pending image
  await chrome.storage.local.set({
    pendingImage: {
      url: imageUrl,
      base64: imageBase64,
      timestamp: Date.now(),
    },
  })

  // Open sidebar
  if (chrome.sidePanel) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId! })
    } catch { /* already open */ }
  }

  // Notify sidebar
  chrome.runtime.sendMessage({
    type: 'OPEN_SIDEBAR_WITH_IMAGE',
    url: imageUrl,
    base64: imageBase64,
  }).catch(() => {})
})

// ── Message Router ─────────────────────────────────────────────────────────────

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
    // Forward to content script of active tab
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

// ── Translation Handler ───────────────────────────────────────────────────────

async function handleTranslate(message: {
  imageUrl: string
  imageBase64: string | null
  targetLanguage: Language
  model: ModelId
  apiKey: string
  jobId: string
}) {
  const { imageUrl, imageBase64, targetLanguage, model, apiKey, jobId } = message

  let base64 = imageBase64
  if (!base64) {
    try {
      base64 = await fetchImageBase64(imageUrl)
    } catch (e) {
      throw new Error(`无法获取图片数据: ${e}`)
    }
  }

  if (!base64) throw new Error('图片数据为空')

  const resultDataUrl = await translateImage(base64, targetLanguage, model, apiKey)
  return { jobId, resultDataUrl }
}

// Keep service worker alive via chrome.storage polling (MV3 workaround)
chrome.alarms.create('keepalive', { periodInMinutes: 0.4 })
chrome.alarms.onAlarm.addListener(() => { /* noop */ })
