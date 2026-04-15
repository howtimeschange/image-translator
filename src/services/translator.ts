// ── translator.ts ─────────────────────────────────────────────────────────────
// 核心翻译服务：调用 1xm.ai Relay 的 Nano Banana 模型
//
// ⚠️  1xm.ai 平台说明：不同模型对应不同的 API Key
//   visionApiKey    → gemini-3-flash-preview（识图 / OCR 分析）
//   banana2ApiKey   → gemini-3.1-flash-image-preview（Nano Banana 2 生图）
//   bananaProApiKey → gemini-3-pro-image-preview（Nano Banana Pro 生图）
//
// 翻译流程（两阶段）：
//   Step 1: visionApiKey  → 识别原图文字内容 + 排版信息
//   Step 2: banana2/pro   → image-to-image 翻译，保持布局/主体/字体风格

import type { Language, ModelId } from './types'
import { MODELS, LANGUAGE_NAMES } from './types'

const RELAY_BASE_URL = 'https://api.1xm.ai/v1'

// 识图模型
const VISION_MODEL = 'gemini-3-flash-preview'

// ── 构造翻译 Prompt ───────────────────────────────────────────────────────────

function buildTranslationPrompt(targetLanguage: Language, textAnalysis: string): string {
  const langName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage
  const analysisHint = textAnalysis
    ? `\n\nHere is the text analysis of the original image to help you translate accurately:\n${textAnalysis}`
    : ''

  return `You are a professional image localization specialist. Your task is to translate the text in this image to ${langName} while:

1. PRESERVING the exact layout, composition, and structure of the original image
2. KEEPING all visual elements, backgrounds, illustrations, and non-text content completely identical
3. MATCHING the original font style, size, weight, and visual treatment (color, shadow, glow, outline, etc.)
4. TRANSLATING only the text content to ${langName}, keeping the same meaning and tone
5. MAINTAINING consistency — if the same text appears multiple times, translate it consistently
6. DO NOT add watermarks, logos, or any extra elements not in the original
7. For right-to-left languages (Arabic, Hebrew), mirror the text direction appropriately

The translated image must look like a professionally localized version of the original.${analysisHint}

Translate all visible text to ${langName} and regenerate the image with identical layout.`
}

// ── Step 1: 识图分析（可选，提升精度）──────────────────────────────────────

async function analyzeImageText(
  base64: string,
  targetLanguage: Language,
  visionApiKey: string,
): Promise<string> {
  if (!visionApiKey) return ''

  const langName = LANGUAGE_NAMES[targetLanguage]
  const prompt = `Analyze this image. List all visible text elements with their position and visual style. Then provide translations to ${langName}. Output compact JSON only: {"texts":[{"original":"...","translation":"...","position":"top/center/bottom/left/right","style":"large/small/bold/italic/decorative"}]}`

  const mimeType = detectMime(base64)
  try {
    const res = await fetch(`${RELAY_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${visionApiKey}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
              { type: 'text', text: prompt },
            ],
          },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  } catch {
    return ''
  }
}

// ── Step 2: 图像翻译生成 ──────────────────────────────────────────────────────

export async function translateImage(
  base64: string,
  targetLanguage: Language,
  modelId: ModelId,
  apiKeys: {
    visionApiKey: string
    banana2ApiKey: string
    bananaProApiKey: string
  },
  onProgress?: (msg: string) => void,
): Promise<string> {
  const modelConfig = MODELS.find((m) => m.id === modelId)
  if (!modelConfig) throw new Error(`Unknown model: ${modelId}`)

  // 根据模型选择对应的 API Key
  const genApiKey = modelId === 'nano-banana-pro'
    ? apiKeys.bananaProApiKey
    : apiKeys.banana2ApiKey

  if (!genApiKey) {
    throw new Error(`请在设置中配置 ${modelConfig.name} 的 API Key`)
  }

  const mimeType = detectMime(base64)

  // Step 1: 识图分析（非必须，失败也继续）
  onProgress?.('正在分析图片文字内容...')
  const textAnalysis = await analyzeImageText(base64, targetLanguage, apiKeys.visionApiKey)

  // Step 2: 调用 Nano Banana 做 image-to-image 翻译
  onProgress?.(`正在用 ${modelConfig.name} 翻译图片...`)

  const prompt = buildTranslationPrompt(targetLanguage, textAnalysis)

  const res = await fetch(`${RELAY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${genApiKey}`,
    },
    body: JSON.stringify({
      model: modelConfig.modelName,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as any)?.error?.message ?? JSON.stringify(err)
    throw new Error(`翻译失败 (${res.status}): ${msg}`)
  }

  const data = await res.json()
  return extractImageFromResponse(data)
}

// ── 从响应中提取图片 dataURL ──────────────────────────────────────────────────

function extractImageFromResponse(data: any): string {
  const content = data.choices?.[0]?.message?.content

  // OpenAI-compatible content array format
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'image_url' && part.image_url?.url) {
        return part.image_url.url
      }
      if (part.type === 'inline_data' && part.inline_data?.data) {
        return `data:${part.inline_data.mime_type ?? 'image/png'};base64,${part.inline_data.data}`
      }
    }
  }

  // String content with embedded data URL
  if (typeof content === 'string') {
    const match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
    if (match) return match[0]
    throw new Error('模型仅返回了文字，未生成图片。请检查模型是否支持图片输出，或重试。')
  }

  // Gemini native format fallback
  const parts = data.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    if (part.inlineData?.data) {
      return `data:${part.inlineData.mimeType ?? 'image/png'};base64,${part.inlineData.data}`
    }
  }

  throw new Error('未能从响应中提取图片数据，请重试')
}

// ── helpers ───────────────────────────────────────────────────────────────────

export function detectMime(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg'
  if (base64.startsWith('iVBOR')) return 'image/png'
  if (base64.startsWith('R0lGO')) return 'image/gif'
  if (base64.startsWith('UklGR')) return 'image/webp'
  return 'image/jpeg'
}

export async function fetchImageBase64(url: string): Promise<string> {
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`无法获取图片: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}
