// ── translator.ts ─────────────────────────────────────────────────────────────
// 核心翻译服务：调用 1xm.ai Relay 的 Nano Banana 模型
// 支持 nano-banana-2（gemini-3.1-flash-image-preview）
//     nano-banana-pro（gemini-3-pro-image-preview）
//
// 思路：
//   1. 先用视觉模型（gemini-3-flash-preview）识别原图中的文字内容、布局、字体风格
//   2. 用图像生成模型（nano-banana）进行 image-to-image 翻译，保持布局/主体/字体风格不变

import type { Language, ModelId } from './types'
import { MODELS, LANGUAGE_NAMES } from './types'

const RELAY_BASE_URL = 'https://api.1xm.ai/v1'

// 识图模型（用于分析原图的文字内容和排版）
const VISION_MODEL = 'gemini-3-flash-preview'

// ── 构造翻译 prompt ───────────────────────────────────────────────────────────

function buildTranslationPrompt(targetLanguage: Language): string {
  const langName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage
  return `You are a professional image localization specialist. Your task is to translate the text in this image to ${langName} while:

1. PRESERVING the exact layout, composition, and structure of the original image
2. KEEPING all visual elements, backgrounds, illustrations, and non-text content identical
3. MATCHING the original font style, size, weight, and visual treatment (color, shadow, glow, etc.)
4. TRANSLATING only the text content to ${langName}, keeping the same meaning and tone
5. MAINTAINING consistency — if the same text appears multiple times, translate it consistently
6. DO NOT add watermarks, logos, or any extra elements not in the original

The translated image must look like a professionally localized version of the original — a native speaker of ${langName} should feel this image was originally created in their language.

Translate all visible text to ${langName} and regenerate the image.`
}

// ── 分析原图文字（可选，提升翻译质量）──────────────────────────────────────

async function analyzeImageText(
  base64: string,
  targetLanguage: Language,
  apiKey: string
): Promise<string> {
  const langName = LANGUAGE_NAMES[targetLanguage]
  const prompt = `Analyze this image and list all visible text content. For each text element, note its approximate position and visual style (font weight, size, color). Then provide the translations in ${langName}. Output as a concise JSON: {"texts": [{"original": "...", "translation": "...", "position": "top/center/bottom/left/right", "style": "large/small/bold/italic/etc"}]}`

  const mimeType = detectMime(base64)
  const res = await fetch(`${RELAY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
}

// ── 主翻译函数 ────────────────────────────────────────────────────────────────

export async function translateImage(
  base64: string,
  targetLanguage: Language,
  modelId: ModelId,
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const modelConfig = MODELS.find((m) => m.id === modelId)
  if (!modelConfig) throw new Error(`Unknown model: ${modelId}`)

  const mimeType = detectMime(base64)

  // Step 1: Analyze text in image for better translation context
  onProgress?.('正在分析图片文字内容...')
  let textAnalysis = ''
  try {
    textAnalysis = await analyzeImageText(base64, targetLanguage, apiKey)
  } catch {
    // non-fatal, proceed without text analysis
  }

  // Step 2: Build the full translation prompt
  const basePrompt = buildTranslationPrompt(targetLanguage)
  const fullPrompt = textAnalysis
    ? `${basePrompt}\n\nHere is a text analysis of the original image to help you translate accurately:\n${textAnalysis}`
    : basePrompt

  // Step 3: Call Nano Banana (image-to-image generation)
  onProgress?.(`正在用 ${modelConfig.name} 翻译图片...`)

  const res = await fetch(`${RELAY_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
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
            { type: 'text', text: fullPrompt },
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

  // Extract image from response (OpenAI-compatible format from 1xm.ai relay)
  // The relay returns image data in content parts
  const content = data.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    // Sometimes the model returns a text description instead of an image
    throw new Error('模型返回文字而非图片，请重试或换用另一个模型')
  }

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

  // Fallback: try Gemini native format
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
