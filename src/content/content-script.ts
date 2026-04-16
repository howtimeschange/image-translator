// ── content-script.ts ────────────────────────────────────────────────────────
// Content Script：注入到目标页面
// - 深度扫描页面图片（支持懒加载 / data-src / srcset / background-image）
// - 商品图智能识别：产品主图 / 商详图高权重，噪音图过滤
// - hover Pin 浮层：在有效图片上显示 📌 按钮
// - 已 Pin 图片打角标，避免重复 Pin

import type { ChromeMessage } from '../services/types'

// ── 平台规则 ─────────────────────────────────────────────────────────────────

interface PlatformRule {
  hostname: RegExp
  /** 商品主图/商详图 selector，高权重 */
  productSelectors: string[]
  /** 噪音 selector，直接跳过 */
  noiseSelectors: string[]
  /** src 模式：包含这些关键字认为是商品图 */
  productUrlPatterns: RegExp[]
  /** src 模式：包含这些关键字认为是噪音 */
  noiseUrlPatterns: RegExp[]
}

const PLATFORM_RULES: PlatformRule[] = [
  // ── 天猫 / 淘宝 ────────────────────────────────────────────────────────────
  {
    hostname: /tmall\.com|taobao\.com/,
    productSelectors: [
      '#mainPicImageEl',
      '[id="mainPicImageEl"]',
      '[class*="mainPic"] img',
      '[class*="thumbnailPic"]',
      '[class*="thumbnailItem"] img',
      '.descV8-singleImage-image',
      '[class*="descV8"] img',
      '[class*="detail"] img',
      '[class*="desc"] img',
    ],
    noiseSelectors: [
      '[class*="liveIcon"]',
      '[class*="creditLevel"]',
      '[class*="vip88"]',
      '[class*="logo"]',
      '[class*="toolbar"]',
      '[class*="im-icon"]',
      '[class*="shopInfo"] img',
      '[class*="recommend"] img',
      '[class*="comment"] img',
      '[class*="review"] img',
    ],
    productUrlPatterns: [
      /alicdn\.com/,
      /gw\.alicdn\.com/,
      /bao\.uploaded/,
    ],
    noiseUrlPatterns: [
      /favicon/i,
      /placeholder/i,
      /\/s\.gif/,
    ],
  },
  // ── 京东 ────────────────────────────────────────────────────────────────────
  {
    hostname: /jd\.com|360buy\.com/,
    productSelectors: [
      '#spec-img',
      '#preview img',
      '#spec-list img',
      '.spec-items img',
      '.itemInfo-wrap img',
      '[id^="spec-"] img',
      '[class*="product-img"] img',
      '[class*="mainimg"] img',
      '[class*="detail"] img',
      '[class*="desc"] img',
      '.ssd-module img',
    ],
    noiseSelectors: [
      '[class*="adv"] img',
      '[class*="comment-user"] img',
      '[class*="shopInfo"] img',
      '[class*="logo"] img',
      '[class*="bagImage"]',
      '[class*="bagLogo"]',
      '[id*="bag"]',
      '.top-logo',
    ],
    productUrlPatterns: [
      /360buyimg\.com\/img\//,
      /360buyimg\.com\/popshop\//,
      /360buyimg\.com\/n\d+\//,
      /imagetools\//,
    ],
    noiseUrlPatterns: [
      /shaidan/,
      /commentalgo/,
      /favicon/i,
      /placeholder/i,
    ],
  },
  // ── 1688 ────────────────────────────────────────────────────────────────────
  {
    hostname: /1688\.com/,
    productSelectors: [
      '[class*="main-img"] img',
      '[class*="offer-image"] img',
      '[class*="gallery"] img',
      '[class*="desc"] img',
      '[class*="detail"] img',
    ],
    noiseSelectors: [
      '[class*="shop-logo"]',
      '[class*="user-avatar"]',
      '[class*="ad-"] img',
    ],
    productUrlPatterns: [/img\.alicdn\.com/, /gw\.alicdn\.com/],
    noiseUrlPatterns: [/placeholder/i, /favicon/i],
  },
  // ── 拼多多 ──────────────────────────────────────────────────────────────────
  {
    hostname: /pinduoduo\.com|yangkeduo\.com/,
    productSelectors: [
      '[class*="main-img"] img',
      '[class*="goods-image"] img',
      '[class*="product"] img',
      '[class*="detail"] img',
    ],
    noiseSelectors: [
      '[class*="avatar"] img',
      '[class*="brand-logo"] img',
    ],
    productUrlPatterns: [/kwimgs\.com/, /\bdynfundown\b/],
    noiseUrlPatterns: [/favicon/i, /placeholder/i],
  },
  // ── Shopee ──────────────────────────────────────────────────────────────────
  {
    hostname: /shopee\./,
    productSelectors: [
      '[class*="shopee-image"] img',
      '[class*="product-image"] img',
      '[class*="main-image"] img',
      '[class*="item-card"] img',
      '[class*="section-image"] img',
    ],
    noiseSelectors: [
      '[class*="logo"] img',
      '[class*="avatar"] img',
      '[class*="rating"] img',
      'header img',
      'footer img',
    ],
    productUrlPatterns: [/cf\.shopee\./, /shopeecd\./],
    noiseUrlPatterns: [/favicon/i, /placeholder/i],
  },
]

function getActiveRule(): PlatformRule | null {
  const host = location.hostname
  return PLATFORM_RULES.find((r) => r.hostname.test(host)) ?? null
}

// ── 商品图分数计算 ─────────────────────────────────────────────────────────────

function computeProductScore(el: HTMLElement, src: string, rule: PlatformRule | null): number {
  let score = 0
  const cls = typeof el.className === 'string' ? el.className : ''
  const id = el.id || ''
  const combinedMeta = cls + ' ' + id

  const rect = el.getBoundingClientRect()
  const w = Math.max(rect.width, inferElementNaturalWidth(el))
  const h = Math.max(rect.height, inferElementNaturalHeight(el))

  // 尺寸分（面积 / 1000）
  score += Math.round(w * h * 0.001)

  // 视口内
  if (rect.top < window.innerHeight && rect.bottom > 0) score += 200
  if (w >= 300 || h >= 300) score += 500

  // 全局商品图关键词（跨平台通用）
  if (/mainpic|main-pic|mainimg|main_img/i.test(combinedMeta)) score += 3000
  if (/spec-img|spec_img|preview/i.test(combinedMeta)) score += 2000
  if (/descv8|singleimage|detail|product-img/i.test(combinedMeta)) score += 1500
  if (/gallery|thumbnail/i.test(combinedMeta)) score += 1000

  // 全局噪音过滤
  if (/avatar|icon|logo|badge|rating|score/i.test(combinedMeta)) score -= 3000
  if (w < 60 && h < 60) score -= 5000
  if (w <= 2 || h <= 2) return -99999
  if (/placeholder|loading|spinner/i.test(src)) return -99999

  // 评论区图片（不需要翻译）
  if (/comment|review|rating|shaidan/i.test(combinedMeta + src)) score -= 4000

  if (rule) {
    // 命中产品 URL 模式加分
    if (rule.productUrlPatterns.some((p) => p.test(src))) score += 2000

    // 命中产品 selector 大加分
    for (const sel of rule.productSelectors) {
      try { if (el.matches(sel) || el.closest(sel)) { score += 5000; break } } catch {}
    }

    // 命中噪音 selector 直接清零
    for (const sel of rule.noiseSelectors) {
      try { if (el.matches(sel) || el.closest(sel)) return -99999 } catch {}
    }

    // 噪音 URL 直接清零
    if (rule.noiseUrlPatterns.some((p) => p.test(src))) return -99999
  }

  return score
}

// ── 类型定义 ──────────────────────────────────────────────────────────────────

interface PageImageInfo {
  id: string
  src: string
  alt: string
  width: number
  height: number
  productScore?: number
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

/** 已 pin 过的图片 src 集合，用于角标和去重提示 */
let pinnedSrcSet = new Set<string>()

// ── 消息监听 ─────────────────────────────────────────────────────────────────

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

  // 侧边栏同步已 pin 的 src 集合，刷新页面角标
  if (message.type === 'SYNC_PINNED_SRCS') {
    const srcs: string[] = Array.isArray(message.srcs) ? (message.srcs as string[]) : []
    pinnedSrcSet = new Set(srcs)
    refreshPinBadges()
    sendResponse({ ok: true })
    return false
  }

  return false
})

// ── Deep Scan ────────────────────────────────────────────────────────────────

async function deepScanPageImages(): Promise<PageImageInfo[]> {
  const rule = getActiveRule()
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

  collectDocumentCandidates(bestBySrc, rule)

  for (const y of checkpoints) {
    window.scrollTo({ left: originalX, top: y, behavior: 'auto' })
    await sleep(200)
    collectDocumentCandidates(bestBySrc, rule)
  }

  window.scrollTo({ left: originalX, top: originalY, behavior: 'auto' })
  await sleep(80)
  collectDocumentCandidates(bestBySrc, rule)

  return Array.from(bestBySrc.values())
    .filter((c) => c.score > -99999)
    .sort((a, b) => b.score - a.score)
    .map((item, i) => ({
      id: `scan-${Date.now()}-${i}`,
      src: item.src,
      alt: item.alt,
      width: item.width,
      height: item.height,
      productScore: item.score,
    }))
}

function collectDocumentCandidates(bestBySrc: Map<string, CandidateSource>, rule: PlatformRule | null) {
  const imgEls = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
  for (const img of imgEls) {
    addElementCandidate(bestBySrc, img, true, 0, rule)
  }

  const platformSelectors = rule
    ? rule.productSelectors
    : [
        '#mainPicImageEl', '[class*="mainPic"]', '[class*="thumbnail"] img',
        '[class*="desc"] img', '[class*="detail"] img', '.descV8-singleImage-image',
        '#spec-img', '#preview', '#spec-list', '.spec-items',
        '[id*="spec"]', '[class*="preview"]', '[class*="gallery"]',
        '[class*="detail"]', '[class*="ssd"]',
      ]

  for (const selector of platformSelectors) {
    const els = Array.from(document.querySelectorAll<HTMLElement>(selector))
    for (const el of els) addElementCandidate(bestBySrc, el, false, 5000, rule)
  }

  // 全局 background-image 扫描
  const allEls = Array.from(document.querySelectorAll<HTMLElement>('body *'))
  for (const el of allEls) {
    if (el.tagName === 'IMG') continue
    addElementCandidate(bestBySrc, el, false, 0, rule)
  }
}

function addElementCandidate(
  bestBySrc: Map<string, CandidateSource>,
  el: HTMLElement,
  allowSmallImageElement = false,
  bonusScore = 0,
  rule: PlatformRule | null = null,
) {
  const rect = el.getBoundingClientRect()
  const width = Math.max(Math.round(rect.width), inferElementNaturalWidth(el))
  const height = Math.max(Math.round(rect.height), inferElementNaturalHeight(el))

  const minSize = allowSmallImageElement ? 48 : 80
  if (width < minSize && height < minSize) return
  if (width <= 2 || height <= 2) return

  const alt = extractAltText(el)
  const sources = extractCandidateUrls(el)
  if (!sources.length) return

  for (const rawSrc of sources) {
    const src = normalizeUrl(rawSrc)
    if (!src || !isValidImageUrl(src)) continue

    const score = computeProductScore(el, src, rule) + bonusScore
    if (score <= -99999) continue

    const prev = bestBySrc.get(src)
    if (!prev || score > prev.score) {
      bestBySrc.set(src, { src, alt, width, height, score })
    }
  }
}

// ── URL 提取 ─────────────────────────────────────────────────────────────────

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

  const bgUrls = parseBackgroundImage(getComputedStyle(el).backgroundImage)
  for (const url of bgUrls) pushIfPresent(urls, url)

  return dedupeStrings(urls)
}

function extractAltText(el: HTMLElement): string {
  if (el instanceof HTMLImageElement) return el.alt || el.title || el.getAttribute('aria-label') || ''
  return el.getAttribute('aria-label') || el.title || ''
}

function inferElementNaturalWidth(el: HTMLElement): number {
  return el instanceof HTMLImageElement ? el.naturalWidth || 0 : 0
}

function inferElementNaturalHeight(el: HTMLElement): number {
  return el instanceof HTMLImageElement ? el.naturalHeight || 0 : 0
}

function parseSrcSet(srcset: string | null): string | null {
  if (!srcset) return null
  const parts = srcset.split(',').map((item) => item.trim().split(/\s+/)[0]).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : null
}

function parseBackgroundImage(bg: string | null): string[] {
  if (!bg || bg === 'none') return []
  return Array.from(bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)).map((m) => m[1]).filter(Boolean)
}

function normalizeUrl(url: string | null): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) return trimmed.length >= 200 ? trimmed : null
  if (trimmed.startsWith('//')) return `${location.protocol}${trimmed}`
  try { return new URL(trimmed, location.href).href } catch { return null }
}

function isValidImageUrl(url: string): boolean {
  if (!url) return false
  if (url.startsWith('chrome-extension://') || url.startsWith('moz-extension://')) return false
  if (url.startsWith('blob:') || url.startsWith('data:')) return true
  return /^https?:/i.test(url)
}

function pushIfPresent(arr: string[], value: string | null | undefined) {
  if (value?.trim()) arr.push(value.trim())
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

// ── Pin 角标（已 Pin 的图片在页面上打标） ─────────────────────────────────────

function refreshPinBadges() {
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
  for (const img of imgs) {
    const src = normalizeUrl(
      img.getAttribute('data-src') ||
      img.getAttribute('data-lazy-src') ||
      img.getAttribute('data-origin') ||
      img.currentSrc ||
      img.src
    )
    if (!src) continue
    injectPinBadge(img, pinnedSrcSet.has(src))
  }
}

function injectPinBadge(img: HTMLImageElement, show: boolean) {
  const parent = img.parentElement
  if (!parent) return

  const parentPos = getComputedStyle(parent).position
  if (parentPos === 'static') parent.style.position = 'relative'

  let badge = parent.querySelector<HTMLElement>('.it-pin-badge')

  if (!show) { badge?.remove(); return }
  if (badge) return // 已有角标

  badge = document.createElement('div')
  badge.className = 'it-pin-badge'
  badge.textContent = '📌'
  Object.assign(badge.style, {
    position: 'absolute',
    top: '4px',
    right: '4px',
    zIndex: '2147483640',
    background: 'rgba(251,191,36,0.88)',
    borderRadius: '4px',
    fontSize: '10px',
    padding: '1px 4px',
    lineHeight: '16px',
    pointerEvents: 'none',
    userSelect: 'none',
  } as Partial<CSSStyleDeclaration>)
  parent.appendChild(badge)
}

// ── Pin Overlay ──────────────────────────────────────────────────────────────

function setPinOverlayEnabled(enabled: boolean) {
  pinOverlayEnabled = enabled
  ensurePinListeners()
  if (!enabled) hidePinButton(true)
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

  // 用 elementsFromPoint 穿透遮罩层（pointer-events 遮盖的情况）
  const hover = findHoverCandidateAtPoint(event.clientX, event.clientY) 
    ?? findHoverCandidate(target)
  if (!hover) { scheduleHidePinButton(); return }

  currentHover = hover
  showPinButton(hover)
}

// 用坐标穿透遮罩找 img（解决京东/天猫主图区有遮罩层的问题）
function findHoverCandidateAtPoint(x: number, y: number): HoverState | null {
  const els = document.elementsFromPoint(x, y)
  for (const el of els) {
    if (el === pinButton) continue
    if (el instanceof HTMLImageElement) {
      const image = buildImageInfoFromElement(el)
      if (image) return { el, image }
    }
  }
  // 再找最近的含图片的容器
  for (const el of els) {
    if (el === pinButton || !(el instanceof HTMLElement)) continue
    const img = el.querySelector<HTMLImageElement>('img')
    if (img) {
      const image = buildImageInfoFromElement(img)
      if (image) return { el: img, image }
    }
  }
  return null
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
    depth++
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

  return { id: `pin-${Date.now()}`, src, alt: extractAltText(el), width, height }
}

function showPinButton(hover: HoverState) {
  const button = ensurePinButton()
  if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null }

  const rect = hover.el.getBoundingClientRect()
  const top = Math.max(8, rect.top + 8)
  const left = Math.min(window.innerWidth - 100, Math.max(8, rect.right - 96))

  const isPinned = pinnedSrcSet.has(hover.image.src)
  button.textContent = isPinned ? '✓ 已 Pin' : '📌 Pin'
  button.style.opacity = isPinned ? '0.6' : '1'
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
    background: 'rgba(12,12,14,0.9)',
    color: 'rgba(255,255,255,0.9)',
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '28px',
    cursor: 'pointer',
    boxShadow: '0 6px 18px rgba(0,0,0,0.32)',
    backdropFilter: 'blur(10px)',
    transition: 'opacity 0.15s',
  } as Partial<CSSStyleDeclaration>)

  button.addEventListener('mouseenter', () => {
    if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null }
  })
  button.addEventListener('mouseleave', () => { scheduleHidePinButton() })

  button.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!currentHover) return

    const isPinned = pinnedSrcSet.has(currentHover.image.src)
    if (isPinned) {
      button.textContent = '✓ 已在队列中'
      window.setTimeout(() => { if (button === pinButton) button.textContent = '✓ 已 Pin' }, 900)
      return
    }

    const image: PageImageInfo = { ...currentHover.image, id: `pin-${Date.now()}` }

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

      pinnedSrcSet.add(image.src)
      if (currentHover?.el instanceof HTMLImageElement) {
        injectPinBadge(currentHover.el, true)
      }

      button.textContent = '✓ 已 Pin'
      button.style.opacity = '0.6'
      window.setTimeout(() => {
        if (button === pinButton) {
          button.textContent = '📌 Pin'
          button.style.opacity = '1'
        }
      }, 900)
    } catch {
      button.textContent = '✕ 失败'
      window.setTimeout(() => { if (button === pinButton) button.textContent = '📌 Pin' }, 900)
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
