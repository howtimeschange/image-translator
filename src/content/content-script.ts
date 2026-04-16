// ── content-script.ts ────────────────────────────────────────────────────────
// Content Script：注入到目标页面
// - 深度扫描页面图片（支持懒加载 / data-src / srcset / background-image）
// - 响应获取图片 base64 请求
// - 在 batch 模式下启用 hover Pin 浮层，可将图片加入待处理队列

import type { ChromeMessage } from '../services/types'

interface PageImageInfo {
  id: string
  src: string
  alt: string
  width: number
  height: number
}

interface CandidateSource {
  src: string
  width: number
  height: number
  alt: string
  score: number
}

interface HoverState {
  el: HTMLElement
  image: PageImageInfo
}

let pinOverlayEnabled = false
let pinButton: HTMLButtonElement | null = null
let currentHover: HoverState | null = null
let listenersBound = false
let hideTimer: number | null = null

chrome.runtime.onMessage.addListener((message: ChromeMessage, _sender, sendResponse) => {
  if (message.type === 'SCAN_PAGE_IMAGES' || message.type === 'DEEP_SCAN_PAGE_IMAGES') {
    deepScanPageImages()
      .then((images) => sendResponse({ images }))
      .catch(() => sendResponse({ images: [] }))
    return true
  }

  if (message.type === 'FETCH_IMAGE_BASE64') {
    fetchBase64(String(message.url || ''))
      .then((base64) => sendResponse({ base64 }))
      .catch(() => sendResponse({ base64: null }))
    return true
  }

  if (message.type === 'PIN_OVERLAY_INIT') {
    setPinOverlayEnabled(Boolean(message.enabled))
    sendResponse({ ok: true })
    return false
  }

  return false
})

// ── Deep Scan ────────────────────────────────────────────────────────────────

async function deepScanPageImages(): Promise<PageImageInfo[]> {
  const originalX = window.scrollX
  const originalY = window.scrollY
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)

  const checkpoints = uniqueNumbers([
    originalY,
    0,
    Math.round(maxScroll * 0.2),
    Math.round(maxScroll * 0.4),
    Math.round(maxScroll * 0.6),
    Math.round(maxScroll * 0.8),
    maxScroll,
  ]).filter((n) => n >= 0)

  const bestBySrc = new Map<string, CandidateSource>()

  // 先在当前位置扫一轮，避免用户正在看的区域被漏掉
  collectDocumentCandidates(bestBySrc)

  for (const y of checkpoints) {
    window.scrollTo({ left: originalX, top: y, behavior: 'auto' })
    await sleep(180)
    collectDocumentCandidates(bestBySrc)
  }

  // 回到原位置，避免打断用户浏览
  window.scrollTo({ left: originalX, top: originalY, behavior: 'auto' })
  await sleep(60)
  collectDocumentCandidates(bestBySrc)

  return Array.from(bestBySrc.values())
    .sort((a, b) => b.score - a.score)
    .map((item, i) => ({
      id: `scan-${Date.now()}-${i}`,
      src: item.src,
      alt: item.alt,
      width: item.width,
      height: item.height,
    }))
}

function collectDocumentCandidates(bestBySrc: Map<string, CandidateSource>) {
  const imgEls = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
  for (const img of imgEls) {
    addElementCandidate(bestBySrc, img, true)
  }

  // 平台适配：把一些电商详情区和主图区的容器也纳入候选
  const platformSelectors = [
    // Tmall / Taobao
    '#mainPicImageEl',
    '[class*="mainPic"]',
    '[class*="thumbnail"] img',
    '[class*="desc"] img',
    '[class*="detail"] img',
    '.descV8-singleImage-image',

    // JD
    '#spec-img',
    '#preview',
    '#spec-list',
    '.spec-items',
    '[id*="spec"]',
    '[class*="preview"]',
    '[class*="gallery"]',
    '[class*="detail"]',
    '[class*="ssd"]',
  ]

  for (const selector of platformSelectors) {
    const els = Array.from(document.querySelectorAll<HTMLElement>(selector))
    for (const el of els) addElementCandidate(bestBySrc, el, false, 160)
  }

  // 全局容器扫描：不再只看 inline style，而是读 computed style.backgroundImage
  const allEls = Array.from(document.querySelectorAll<HTMLElement>('body *'))
  for (const el of allEls) {
    if (el.tagName === 'IMG') continue
    addElementCandidate(bestBySrc, el, false)
  }
}

function addElementCandidate(
  bestBySrc: Map<string, CandidateSource>,
  el: HTMLElement,
  allowSmallImageElement = false,
  bonusScore = 0,
) {
  const rect = el.getBoundingClientRect()
  const width = Math.max(Math.round(rect.width), inferElementNaturalWidth(el))
  const height = Math.max(Math.round(rect.height), inferElementNaturalHeight(el))

  // 默认跳过明显太小的元素；img 元素稍微放宽一些
  const minSize = allowSmallImageElement ? 48 : 80
  if (width < minSize && height < minSize) return
  if (width <= 2 || height <= 2) return

  const alt = extractAltText(el)
  const sources = extractCandidateUrls(el)
  if (!sources.length) return

  for (const rawSrc of sources) {
    const src = normalizeUrl(rawSrc)
    if (!src || !isValidImageUrl(src)) continue

    const score = (width * height) + visibilityBonus(rect) + sourceBonus(el, src) + bonusScore
    const prev = bestBySrc.get(src)
    if (!prev || score > prev.score) {
      bestBySrc.set(src, {
        src,
        alt,
        width,
        height,
        score,
      })
    }
  }
}

function extractCandidateUrls(el: HTMLElement): string[] {
  const urls: string[] = []

  if (el instanceof HTMLImageElement) {
    pushIfPresent(urls, el.getAttribute('data-src'))
    pushIfPresent(urls, el.getAttribute('data-lazy-src'))
    pushIfPresent(urls, el.getAttribute('data-src-lazy'))
    pushIfPresent(urls, el.getAttribute('data-lazy-img'))
    pushIfPresent(urls, el.getAttribute('data-origin'))
    pushIfPresent(urls, el.getAttribute('data-actualsrc'))
    pushIfPresent(urls, el.getAttribute('data-url'))
    pushIfPresent(urls, parseSrcSet(el.getAttribute('srcset')))
    pushIfPresent(urls, el.currentSrc)
    pushIfPresent(urls, el.src)
  } else {
    pushIfPresent(urls, el.getAttribute('data-src'))
    pushIfPresent(urls, el.getAttribute('data-lazy-src'))
    pushIfPresent(urls, el.getAttribute('data-src-lazy'))
    pushIfPresent(urls, el.getAttribute('data-lazy-img'))
    pushIfPresent(urls, el.getAttribute('data-origin'))
    pushIfPresent(urls, el.getAttribute('data-actualsrc'))
    pushIfPresent(urls, el.getAttribute('data-url'))
  }

  const bg = getComputedStyle(el).backgroundImage
  const bgUrls = parseBackgroundImage(bg)
  for (const url of bgUrls) pushIfPresent(urls, url)

  return dedupeStrings(urls)
}

function extractAltText(el: HTMLElement): string {
  if (el instanceof HTMLImageElement) {
    return el.alt || el.title || el.getAttribute('aria-label') || ''
  }
  return el.getAttribute('aria-label') || el.title || ''
}

function inferElementNaturalWidth(el: HTMLElement): number {
  if (el instanceof HTMLImageElement) return el.naturalWidth || 0
  return 0
}

function inferElementNaturalHeight(el: HTMLElement): number {
  if (el instanceof HTMLImageElement) return el.naturalHeight || 0
  return 0
}

function visibilityBonus(rect: DOMRect): number {
  let bonus = 0
  if (rect.width >= 120 || rect.height >= 120) bonus += 4000
  if (rect.top < window.innerHeight && rect.bottom > 0) bonus += 2500
  return bonus
}

function sourceBonus(el: HTMLElement, src: string): number {
  let bonus = 0
  const cls = typeof el.className === 'string' ? el.className : ''

  if (cls.includes('mainPic') || el.id === 'mainPicImageEl' || el.id === 'spec-img') bonus += 25000
  if (cls.includes('descV8-singleImage') || cls.includes('detail')) bonus += 12000
  if (src.includes('alicdn.com') || src.includes('360buyimg.com') || src.includes('jd.com')) bonus += 3000
  if (src.includes('.gif')) bonus += 800
  return bonus
}

function parseSrcSet(srcset: string | null): string | null {
  if (!srcset) return null
  const parts = srcset
    .split(',')
    .map((item) => item.trim().split(/\s+/)[0])
    .filter(Boolean)
  return parts.length ? parts[parts.length - 1] : null
}

function parseBackgroundImage(bg: string | null): string[] {
  if (!bg || bg === 'none') return []
  const matches = Array.from(bg.matchAll(/url\(["']?([^"')]+)["']?\)/g))
  return matches.map((m) => m[1]).filter(Boolean)
}

function normalizeUrl(url: string | null): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) return trimmed.length >= 200 ? trimmed : null
  if (trimmed.startsWith('//')) return `${location.protocol}${trimmed}`
  try {
    return new URL(trimmed, location.href).href
  } catch {
    return null
  }
}

function isValidImageUrl(url: string): boolean {
  if (!url) return false
  if (url.startsWith('chrome-extension://')) return false
  if (url.startsWith('moz-extension://')) return false
  if (url.startsWith('blob:')) return true
  if (url.startsWith('data:')) return true
  return /^https?:/i.test(url)
}

function pushIfPresent(arr: string[], value: string | null | undefined) {
  if (value && value.trim()) arr.push(value.trim())
}

function dedupeStrings(items: string[]): string[] {
  return Array.from(new Set(items))
}

function uniqueNumbers(items: number[]): number[] {
  return Array.from(new Set(items))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

// ── Pin Overlay ──────────────────────────────────────────────────────────────

function setPinOverlayEnabled(enabled: boolean) {
  pinOverlayEnabled = enabled
  ensurePinListeners()

  if (!enabled) {
    hidePinButton(true)
    return
  }
}

function ensurePinListeners() {
  if (listenersBound) return
  listenersBound = true

  document.addEventListener('mousemove', handleMouseMove, true)
  window.addEventListener('scroll', repositionPinButton, true)
  window.addEventListener('resize', repositionPinButton, true)
}

function handleMouseMove(event: MouseEvent) {
  if (!pinOverlayEnabled) return

  const target = event.target instanceof Element ? event.target : null
  if (!target) return
  if (pinButton && (target === pinButton || pinButton.contains(target))) return

  const hover = findHoverCandidate(target)
  if (!hover) {
    scheduleHidePinButton()
    return
  }

  currentHover = hover
  showPinButton(hover)
}

function findHoverCandidate(target: Element): HoverState | null {
  const img = target.closest('img')
  if (img instanceof HTMLElement) {
    const image = buildImageInfoFromElement(img)
    if (image) return { el: img, image }
  }

  let cur: HTMLElement | null = target instanceof HTMLElement ? target : target.parentElement
  let depth = 0
  while (cur && depth < 6) {
    const image = buildImageInfoFromElement(cur)
    if (image) return { el: cur, image }
    cur = cur.parentElement
    depth += 1
  }

  return null
}

function buildImageInfoFromElement(el: HTMLElement): PageImageInfo | null {
  const rect = el.getBoundingClientRect()
  const width = Math.max(Math.round(rect.width), inferElementNaturalWidth(el))
  const height = Math.max(Math.round(rect.height), inferElementNaturalHeight(el))
  if (width < 80 && height < 80) return null
  if (width <= 2 || height <= 2) return null

  const src = extractCandidateUrls(el)
    .map((item) => normalizeUrl(item))
    .find((item): item is string => Boolean(item && isValidImageUrl(item)))

  if (!src) return null

  return {
    id: `pin-${Date.now()}`,
    src,
    alt: extractAltText(el),
    width,
    height,
  }
}

function showPinButton(hover: HoverState) {
  const button = ensurePinButton()
  if (hideTimer) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }

  const rect = hover.el.getBoundingClientRect()
  const top = Math.max(8, rect.top + 8)
  const left = Math.min(window.innerWidth - 84, Math.max(8, rect.right - 78))

  button.style.display = 'flex'
  button.style.top = `${top}px`
  button.style.left = `${left}px`
}

function repositionPinButton() {
  if (!pinOverlayEnabled || !currentHover || !pinButton || pinButton.style.display === 'none') return
  showPinButton(currentHover)
}

function scheduleHidePinButton() {
  if (hideTimer) window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => hidePinButton(false), 120)
}

function hidePinButton(resetHover: boolean) {
  if (pinButton) pinButton.style.display = 'none'
  if (resetHover) currentHover = null
}

function ensurePinButton(): HTMLButtonElement {
  if (pinButton) return pinButton

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '📌 Pin'
  button.id = 'image-translator-pin-button'
  Object.assign(button.style, {
    position: 'fixed',
    zIndex: '2147483647',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    height: '28px',
    minWidth: '70px',
    padding: '0 10px',
    borderRadius: '14px',
    border: '1px solid rgba(255,255,255,0.22)',
    background: 'rgba(12,12,14,0.88)',
    color: 'rgba(255,255,255,0.9)',
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '28px',
    cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
    backdropFilter: 'blur(10px)',
  } as Partial<CSSStyleDeclaration>)

  button.addEventListener('mouseenter', () => {
    if (hideTimer) {
      window.clearTimeout(hideTimer)
      hideTimer = null
    }
  })

  button.addEventListener('mouseleave', () => {
    scheduleHidePinButton()
  })

  button.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!currentHover) return

    const image: PageImageInfo = {
      ...currentHover.image,
      id: `pin-${Date.now()}`,
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'PIN_IMAGE',
        image: {
          ...image,
          source: 'pin',
          selected: true,
          originUrl: location.href,
          pinnedAt: Date.now(),
        },
      })
      button.textContent = '✓ 已 Pin'
      window.setTimeout(() => {
        if (button === pinButton) button.textContent = '📌 Pin'
      }, 900)
    } catch {
      button.textContent = '✕ 失败'
      window.setTimeout(() => {
        if (button === pinButton) button.textContent = '📌 Pin'
      }, 900)
    }
  })

  document.documentElement.appendChild(button)
  pinButton = button
  return button
}

// ── Fetch base64 ─────────────────────────────────────────────────────────────

async function fetchBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin)
  } catch {
    return null
  }
}

export {}
