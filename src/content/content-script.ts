// ── content-script.ts ────────────────────────────────────────────────────────
// Content Script：注入到目标页面
// - 扫描页面所有图片
// - 响应获取图片 base64 请求

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SCAN_PAGE_IMAGES') {
    const images = scanPageImages()
    sendResponse({ images })
    return false
  }

  if (message.type === 'FETCH_IMAGE_BASE64') {
    fetchBase64(message.url as string)
      .then((base64) => sendResponse({ base64 }))
      .catch(() => sendResponse({ base64: null }))
    return true
  }
})

// ── 扫描页面图片 ─────────────────────────────────────────────────────────────

interface PageImageInfo {
  id: string
  src: string
  alt: string
  width: number
  height: number
}

function scanPageImages(): PageImageInfo[] {
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
  const results: PageImageInfo[] = []

  for (const img of imgs) {
    const src = img.currentSrc || img.src
    if (!src || src.startsWith('data:') && src.length < 200) continue // skip tiny inline SVG icons
    if (!isValidImageUrl(src)) continue

    const rect = img.getBoundingClientRect()
    const naturalW = img.naturalWidth || rect.width
    const naturalH = img.naturalHeight || rect.height

    // Filter out tiny icons (< 48x48)
    if (naturalW < 48 && naturalH < 48) continue
    // Filter out 1x1 tracking pixels
    if (naturalW <= 2 || naturalH <= 2) continue

    results.push({
      id: `img-${results.length}-${Date.now()}`,
      src,
      alt: img.alt || img.title || '',
      width: Math.round(naturalW),
      height: Math.round(naturalH),
    })
  }

  // Also scan CSS background images (simple heuristic)
  const allEls = Array.from(document.querySelectorAll<HTMLElement>('[style*="background-image"]'))
  for (const el of allEls) {
    const match = el.style.backgroundImage?.match(/url\(["']?([^"')]+)["']?\)/)
    if (match?.[1]) {
      const src = match[1]
      if (!isValidImageUrl(src)) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 48 || rect.height < 48) continue
      results.push({
        id: `bg-${results.length}-${Date.now()}`,
        src,
        alt: el.getAttribute('aria-label') || el.title || '',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      })
    }
  }

  return results
}

function isValidImageUrl(url: string): boolean {
  if (!url) return false
  if (url.startsWith('chrome-extension://')) return false
  if (url.startsWith('moz-extension://')) return false
  return true
}

// ── Fetch base64 ──────────────────────────────────────────────────────────────

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
