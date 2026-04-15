// ── translator.ts ─────────────────────────────────────────────────────────────
// 核心翻译服务：调用 1xm.ai Relay 的 Nano Banana 模型
//
// ⚠️  1xm.ai 平台说明：不同模型对应不同的 API Key
//   visionApiKey    → gemini-3-flash-preview（识图 / OCR 分析）
//   banana2ApiKey   → gemini-3.1-flash-image-preview（Nano Banana 2 生图）
//   bananaProApiKey → gemini-3-pro-image-preview（Nano Banana Pro 生图）
//
// 翻译流程（两阶段）：
//   Step 1: visionApiKey  → 精细 OCR，识别图中所有文字（含小字/角标/注脚）
//   Step 2: banana2/pro   → image-to-image 翻译，附带 OCR 结果指导模型不遗漏任何文字

import type { Language, ModelId } from './types'
import { MODELS, LANGUAGE_NAMES } from './types'

const RELAY_BASE_URL = 'https://api.1xm.ai/v1'

// 识图模型
const VISION_MODEL = 'gemini-3-flash-preview'

// ── 接口定义 ──────────────────────────────────────────────────────────────────

export interface OcrResult {
  texts: Array<{
    original: string
    translation: string
    position: string   // top/center/bottom/topLeft/topRight/bottomLeft/bottomRight
    size: 'large' | 'medium' | 'small' | 'tiny'   // 强调 tiny
    style: string      // bold/italic/decorative/normal
  }>
  sourceLang: string   // 检测到的原始语言
  textCount: number
}

// ── Step 1: 精细 OCR 分析 ─────────────────────────────────────────────────────
// 关键改进：
//  1. 明确要求识别 ALL 文字，含角标、注释、小字、法律声明等
//  2. 返回结构化 JSON 包含原文+译文，供 Step 2 参考
//  3. 包含 size 字段以便后续 prompt 强调小字

async function analyzeImageText(
  base64: string,
  sourceLanguage: Language,
  targetLanguage: Language,
  visionApiKey: string,
): Promise<OcrResult | null> {
  if (!visionApiKey) return null

  const targetLangName = LANGUAGE_NAMES[targetLanguage]
  const sourceLangHint = sourceLanguage === 'auto'
    ? 'Detect the source language automatically.'
    : `The source language is ${LANGUAGE_NAMES[sourceLanguage] ?? sourceLanguage}.`

  const prompt = `You are a meticulous OCR and translation specialist.

TASK: Extract EVERY piece of text visible in this image, including:
- Headlines and titles (large text)
- Body copy and descriptions (medium text)
- Labels, tags, badges, buttons (small text)
- Footnotes, disclaimers, legal text, watermarks (tiny text)
- Numbers, prices, dates, percentages
- ANY text that is partially obscured but still readable

${sourceLangHint}
Translate each text element to ${targetLangName}.

OUTPUT FORMAT: Return ONLY valid JSON (no markdown, no explanation):
{
  "sourceLang": "detected language name in English",
  "textCount": <total number of text elements found>,
  "texts": [
    {
      "original": "exact original text",
      "translation": "translated text in ${targetLangName}",
      "position": "topLeft|topCenter|topRight|centerLeft|center|centerRight|bottomLeft|bottomCenter|bottomRight",
      "size": "large|medium|small|tiny",
      "style": "bold|italic|normal|decorative|outline"
    }
  ]
}

IMPORTANT: Do NOT omit any text, especially small/tiny text. Every single word must be listed.`

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
        temperature: 0.1,   // 低温，确保识别准确
        max_tokens: 4096,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? ''
    // 提取 JSON，容忍模型在前后加 markdown fence
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as OcrResult
  } catch {
    return null
  }
}

// ── 构造翻译 Prompt（强化版）────────────────────────────────────────────────
// 关键改进：
//  1. 把 OCR 结果格式化成"翻译对照表"，让模型有明确的文字映射
//  2. 显式强调必须翻译 small/tiny 文字
//  3. 对每个文字元素给出 position 提示，防止模型跳过边缘文字

function buildTranslationPrompt(
  targetLanguage: Language,
  sourceLanguage: Language,
  ocr: OcrResult | null,
): string {
  const targetLangName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage
  const sourceLangHint = ocr?.sourceLang
    ? `The original image text is in ${ocr.sourceLang}.`
    : sourceLanguage !== 'auto'
      ? `The original image text is in ${LANGUAGE_NAMES[sourceLanguage] ?? sourceLanguage}.`
      : 'Detect the source language from the image.'

  // 构建翻译对照表
  let translationTable = ''
  if (ocr && ocr.texts.length > 0) {
    const lines = ocr.texts.map((t, i) => {
      const sizeNote = (t.size === 'small' || t.size === 'tiny') ? ' [SMALL TEXT - MUST TRANSLATE]' : ''
      return `  ${i + 1}. [${t.position}]${sizeNote} "${t.original}" → "${t.translation}"`
    })
    translationTable = `\n\n## COMPLETE TEXT TRANSLATION REFERENCE (${ocr.textCount} text elements found)\nUse this mapping to translate EVERY text element. Do NOT skip any:\n\n${lines.join('\n')}`
  }

  return `You are a professional image localization specialist. Recreate this image with ALL text translated to ${targetLangName}.

## SOURCE LANGUAGE
${sourceLangHint}

## ABSOLUTE REQUIREMENTS
1. Translate EVERY visible text element — headlines, body copy, labels, small print, footnotes, watermarks, numbers with units, legal disclaimers
2. CRITICAL: Do NOT miss small or tiny text (corner labels, star ratings text, price footnotes, "as low as", percentage labels, etc.)
3. PRESERVE exact layout, composition, backgrounds, and all visual elements
4. MATCH original font style, size, weight, color, shadow, and visual effects for each text element
5. For right-to-left languages (Arabic, Hebrew), mirror text direction
6. Do NOT add watermarks or extra elements${translationTable}

## OUTPUT
Regenerate the complete image with ALL text translated to ${targetLangName}, maintaining identical visual quality and layout.`
}

// ── Step 2: 图像翻译生成 ──────────────────────────────────────────────────────

export async function translateImage(
  base64: string,
  sourceLanguage: Language,
  targetLanguage: Language,
  modelId: ModelId,
  apiKeys: {
    visionApiKey: string
    banana2ApiKey: string
    bananaProApiKey: string
  },
  onProgress?: (msg: string) => void,
): Promise<{ resultDataUrl: string; ocrTexts: string[] }> {
  const modelConfig = MODELS.find((m) => m.id === modelId)
  if (!modelConfig) throw new Error(`Unknown model: ${modelId}`)

  const genApiKey = modelId === 'nano-banana-pro'
    ? apiKeys.bananaProApiKey
    : apiKeys.banana2ApiKey

  if (!genApiKey) {
    throw new Error(`请在设置中配置 ${modelConfig.name} 的 API Key`)
  }

  const mimeType = detectMime(base64)

  // Step 1: 精细 OCR（失败不阻塞翻译）
  onProgress?.('正在识别图片中的所有文字...')
  const ocr = await analyzeImageText(base64, sourceLanguage, targetLanguage, apiKeys.visionApiKey)

  const ocrTexts = ocr?.texts.map(t => `${t.original} → ${t.translation}`) ?? []
  if (ocr) {
    onProgress?.(`识别到 ${ocr.textCount} 处文字，正在翻译...`)
  } else {
    onProgress?.(`正在用 ${modelConfig.name} 翻译图片...`)
  }

  // Step 2: 生图翻译
  const prompt = buildTranslationPrompt(targetLanguage, sourceLanguage, ocr)

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
      temperature: 0.2,   // 低温，减少创意发散，提升翻译准确性
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as any)?.error?.message ?? JSON.stringify(err)
    throw new Error(`翻译失败 (${res.status}): ${msg}`)
  }

  const data = await res.json()
  const resultDataUrl = extractImageFromResponse(data)
  return { resultDataUrl, ocrTexts }
}

// ── 从响应中提取图片 dataURL ──────────────────────────────────────────────────

function extractImageFromResponse(data: any): string {
  const content = data.choices?.[0]?.message?.content

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

  if (typeof content === 'string') {
    const match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
    if (match) return match[0]
    throw new Error('模型仅返回了文字，未生成图片。请检查模型是否支持图片输出，或重试。')
  }

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
