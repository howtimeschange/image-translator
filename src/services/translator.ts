// ── translator.ts ─────────────────────────────────────────────────────────────
// 核心翻译服务：调用 1xm.ai Relay 的 Nano Banana 模型
//
// ⚠️  1xm.ai 平台说明：不同模型对应不同的 API Key
//   visionApiKey    → gemini-3-flash-preview（识图 / OCR 分析）
//   banana2ApiKey   → gemini-3.1-flash-image-preview（Nano Banana 2 生图）
//   bananaProApiKey → gemini-3-pro-image-preview（Nano Banana Pro 生图）
//
// 翻译策略（preserveBrand=true 默认）：
//   • Logo、品牌名、商标、SKU/型号、产品名称 → 保留原文，绝不翻译
//   • 功能说明、促销文案、描述性文字 → 翻译为目标语言
//
// 翻译流程（两阶段）：
//   Step 1: visionApiKey → 精细 OCR，区分"保留项"和"翻译项"
//   Step 2: banana2/pro  → image-to-image，保留 layout/主体/logo/产品/背景不变

import type { Language, ModelId } from './types'
import { MODELS, LANGUAGE_NAMES } from './types'

const RELAY_BASE_URL = 'https://api.1xm.ai/v1'
const VISION_MODEL = 'gemini-3-flash-preview'

// ── OCR 结果接口 ──────────────────────────────────────────────────────────────

export interface OcrResult {
  texts: Array<{
    original: string
    translation: string | null   // null = 保留原文
    keep: boolean                 // true = 品牌/logo/sku，不翻译
    keepReason?: string           // 'brand' | 'logo' | 'sku' | 'trademark' | 'product_name'
    position: string
    size: 'large' | 'medium' | 'small' | 'tiny'
    style: string
  }>
  sourceLang: string
  textCount: number
  keepCount: number      // 保留原文的数量
  translateCount: number // 翻译的数量
}

// ── Step 1：精细 OCR，区分保留 vs 翻译 ────────────────────────────────────────

async function analyzeImageText(
  base64: string,
  sourceLanguage: Language,
  targetLanguage: Language,
  visionApiKey: string,
  preserveBrand: boolean,
): Promise<OcrResult | null> {
  if (!visionApiKey) return null

  const targetLangName = LANGUAGE_NAMES[targetLanguage]
  const sourceLangHint = sourceLanguage === 'auto'
    ? 'Detect the source language automatically.'
    : `The source language is ${LANGUAGE_NAMES[sourceLanguage] ?? sourceLanguage}.`

  const preserveSection = preserveBrand ? `
## BRAND PRESERVATION RULES (CRITICAL)
These text elements MUST be kept in their original form (set "keep": true, "translation": null):
- Brand logos and wordmarks (Nike, Apple, Samsung, any brand name rendered as logo)
- Product names and model numbers (iPhone 15 Pro, Air Max 270, Galaxy S24)
- SKU codes, serial numbers, catalog numbers
- Trademark symbols and registered brand text
- Chemical/ingredient names, patent numbers
- Social media handles (@brand, #hashtag)
- Domain names and URLs
- Certification marks (CE, FDA, ISO, etc.)

ONLY translate: marketing copy, feature descriptions, promotional slogans, instructional text, UI labels, price notes, footnotes, and general descriptive text.

When in doubt about whether something is a brand element → KEEP it (keep=true).` : `
## TRANSLATION MODE: AGGRESSIVE
Translate ALL visible text to ${targetLangName}, including brand names and product names.
Only keep: chemical formulas, mathematical symbols, URLs.`

  const prompt = `You are a meticulous OCR specialist for e-commerce product images.

TASK: Extract EVERY piece of text visible in this image.
${sourceLangHint}
Target translation language: ${targetLangName}
${preserveSection}

## TEXT SIZE CATEGORIES
- large: headlines, main product name
- medium: subheadings, features
- small: labels, footnotes, legal text
- tiny: micro-text, disclaimers, weight/size labels

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown fences):
{
  "sourceLang": "detected language",
  "textCount": <total>,
  "keepCount": <number kept as original>,
  "translateCount": <number to be translated>,
  "texts": [
    {
      "original": "exact text",
      "translation": "translated text in ${targetLangName}" or null if keep=true,
      "keep": true or false,
      "keepReason": "brand|logo|sku|trademark|product_name|url|certification" (only if keep=true),
      "position": "topLeft|topCenter|topRight|centerLeft|center|centerRight|bottomLeft|bottomCenter|bottomRight",
      "size": "large|medium|small|tiny",
      "style": "bold|italic|normal|decorative|outline"
    }
  ]
}

CRITICAL: Do NOT omit ANY text. Small/tiny text must all be listed. Every word counts.`

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
        temperature: 0.1,
        max_tokens: 4096,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as OcrResult
  } catch {
    return null
  }
}

// ── Step 2：构造生图 prompt ────────────────────────────────────────────────────

function buildTranslationPrompt(
  targetLanguage: Language,
  sourceLanguage: Language,
  ocr: OcrResult | null,
  preserveBrand: boolean,
): string {
  const targetLangName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage
  const sourceLangHint = ocr?.sourceLang
    ? `The original image text is in ${ocr.sourceLang}.`
    : sourceLanguage !== 'auto'
      ? `The original image text is in ${LANGUAGE_NAMES[sourceLanguage] ?? sourceLanguage}.`
      : 'Detect the source language from the image.'

  // 构建精确的翻译对照表
  let keepList = ''
  let translateList = ''

  if (ocr && ocr.texts.length > 0) {
    const keepItems = ocr.texts.filter(t => t.keep)
    const translateItems = ocr.texts.filter(t => !t.keep)

    if (keepItems.length > 0) {
      keepList = `\n\n## ❌ DO NOT TRANSLATE — Keep exactly as-is (${keepItems.length} items)\n` +
        keepItems.map((t, i) =>
          `  ${i + 1}. [${t.position}] "${t.original}"${t.keepReason ? ` (${t.keepReason})` : ''}`
        ).join('\n')
    }

    if (translateItems.length > 0) {
      translateList = `\n\n## ✅ TRANSLATE these (${translateItems.length} items)\n` +
        translateItems.map((t, i) => {
          const sizeNote = (t.size === 'small' || t.size === 'tiny') ? ' [SMALL — must not be skipped]' : ''
          return `  ${i + 1}. [${t.position}]${sizeNote} "${t.original}" → "${t.translation}"`
        }).join('\n')
    }
  }

  const preserveSection = preserveBrand ? `
## BRAND & LAYOUT PROTECTION (MANDATORY)
- NEVER alter: logos, brand wordmarks, product names, SKU codes, trademark text, certification marks
- These must appear pixel-perfect identical to the original
- The product itself, packaging shape, model number must remain unchanged` : ''

  return `You are a professional e-commerce image localization specialist.

## TASK
Recreate this image with selected text translated to ${targetLangName}.

## SOURCE LANGUAGE
${sourceLangHint}
${preserveSection}

## ABSOLUTE REQUIREMENTS
1. PRESERVE: overall layout, composition, background, product visuals, packaging, illustrations
2. PRESERVE: image dimensions, proportions, color grading
3. MATCH: original font style, weight, size, color, shadow for each translated text element
4. TRANSLATE: only the items listed in the TRANSLATE section below
5. KEEP VERBATIM: all items in the DO NOT TRANSLATE section
6. Do NOT add watermarks, borders, or any elements not in the original
7. Small/tiny text in the translate list MUST be translated — do not skip them
8. For right-to-left languages (Arabic, Hebrew), mirror the text direction${keepList}${translateList}

${!ocr ? `Translate all descriptive/marketing text to ${targetLangName}.${preserveBrand ? ' Preserve all logos, brand names, product model numbers, and SKU codes exactly.' : ''}` : ''}

Regenerate the complete image with these precise text changes only.`
}

// ── Main export ───────────────────────────────────────────────────────────────

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
  preserveBrand: boolean,
  onProgress?: (msg: string) => void,
): Promise<{ resultDataUrl: string; ocrTexts: string[]; keepCount: number; translateCount: number }> {
  const modelConfig = MODELS.find((m) => m.id === modelId)
  if (!modelConfig) throw new Error(`Unknown model: ${modelId}`)

  const genApiKey = modelId === 'nano-banana-pro'
    ? apiKeys.bananaProApiKey
    : apiKeys.banana2ApiKey

  if (!genApiKey) {
    throw new Error(`请在设置中配置 ${modelConfig.name} 的 API Key`)
  }

  const mimeType = detectMime(base64)

  // Step 1: OCR
  onProgress?.('正在识别图片文字...')
  const ocr = await analyzeImageText(base64, sourceLanguage, targetLanguage, apiKeys.visionApiKey, preserveBrand)

  const ocrTexts = ocr?.texts.map(t =>
    t.keep
      ? `[保留] ${t.original}`
      : `[翻译] ${t.original} → ${t.translation}`
  ) ?? []

  if (ocr) {
    onProgress?.(
      preserveBrand
        ? `识别到 ${ocr.textCount} 处文字，保留 ${ocr.keepCount} 处品牌元素，翻译 ${ocr.translateCount} 处...`
        : `识别到 ${ocr.textCount} 处文字，正在全量翻译...`
    )
  } else {
    onProgress?.(`正在用 ${modelConfig.name} 翻译图片...`)
  }

  // Step 2: 生图
  const prompt = buildTranslationPrompt(targetLanguage, sourceLanguage, ocr, preserveBrand)

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
      temperature: 0.2,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as any)?.error?.message ?? JSON.stringify(err)
    throw new Error(`翻译失败 (${res.status}): ${msg}`)
  }

  const data = await res.json()
  const resultDataUrl = extractImageFromResponse(data)

  return {
    resultDataUrl,
    ocrTexts,
    keepCount: ocr?.keepCount ?? 0,
    translateCount: ocr?.translateCount ?? 0,
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function extractImageFromResponse(data: any): string {
  const content = data.choices?.[0]?.message?.content

  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'image_url' && part.image_url?.url) return part.image_url.url
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
