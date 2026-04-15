// ── types.ts ─────────────────────────────────────────────────────────────────
// 共享类型定义

export type Language =
  | 'zh' | 'zh-TW' | 'en' | 'ja' | 'ko'
  | 'fr' | 'de' | 'es' | 'pt' | 'ru' | 'ar'
  // 东南亚
  | 'th' | 'vi' | 'id' | 'ms' | 'tl' | 'my' | 'km' | 'lo'

export type ModelId = 'nano-banana-2' | 'nano-banana-pro'

export interface ModelConfig {
  id: ModelId
  name: string
  modelName: string
  description: string
}

export const MODELS: ModelConfig[] = [
  {
    id: 'nano-banana-2',
    name: 'Nano Banana 2',
    modelName: 'gemini-3.1-flash-image-preview',
    description: '速度快，性价比高',
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    modelName: 'gemini-3-pro-image-preview',
    description: '画质更精细，适合复杂图片',
  },
]

export const LANGUAGES: { code: Language; label: string; nativeName: string }[] = [
  { code: 'zh', label: '中文', nativeName: '简体中文' },
  { code: 'zh-TW', label: '繁中', nativeName: '繁體中文' },
  { code: 'en', label: 'English', nativeName: 'English' },
  { code: 'ja', label: '日本語', nativeName: '日本語' },
  { code: 'ko', label: '한국어', nativeName: '한국어' },
  { code: 'fr', label: 'Français', nativeName: 'Français' },
  { code: 'de', label: 'Deutsch', nativeName: 'Deutsch' },
  { code: 'es', label: 'Español', nativeName: 'Español' },
  { code: 'pt', label: 'Português', nativeName: 'Português' },
  { code: 'ru', label: 'Русский', nativeName: 'Русский' },
  { code: 'ar', label: 'العربية', nativeName: 'العربية' },
  // 东南亚
  { code: 'th', label: 'ไทย', nativeName: 'ภาษาไทย' },
  { code: 'vi', label: 'Tiếng Việt', nativeName: 'Tiếng Việt' },
  { code: 'id', label: 'Indonesia', nativeName: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Melayu', nativeName: 'Bahasa Melayu' },
  { code: 'tl', label: 'Filipino', nativeName: 'Filipino (Tagalog)' },
  { code: 'my', label: 'မြန်မာ', nativeName: 'မြန်မာဘာသာ' },
  { code: 'km', label: 'ខ្មែរ', nativeName: 'ភាសាខ្មែរ' },
  { code: 'lo', label: 'ລາວ', nativeName: 'ພາສາລາວ' },
]

export const LANGUAGE_NAMES: Record<Language, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.nativeName])
) as Record<Language, string>

export interface TranslationJob {
  id: string
  imageUrl: string
  imageBase64: string | null
  targetLanguage: Language
  model: ModelId
  status: 'pending' | 'translating' | 'done' | 'error'
  resultDataUrl?: string
  error?: string
  createdAt: number
}

export interface PageImage {
  id: string
  src: string
  alt: string
  width: number
  height: number
  base64?: string
  selected: boolean
}

export interface Settings {
  apiKey: string          // 1xm.ai relay API key
  defaultLanguage: Language
  defaultModel: ModelId
}

// Chrome message types
export interface ChromeMessage {
  type:
    | 'IMAGE_RIGHT_CLICKED'      // content → background: 右键单图
    | 'SCAN_PAGE_IMAGES'         // sidebar → content: 扫描页面图片
    | 'PAGE_IMAGES_RESULT'       // content → sidebar: 返回图片列表
    | 'FETCH_IMAGE_BASE64'       // background/sidebar → content: 获取图片 base64
    | 'FETCH_IMAGE_BASE64_RESULT'// content → background/sidebar
    | 'TRANSLATE_IMAGE'          // sidebar → background: 翻译请求
    | 'TRANSLATE_RESULT'         // background → sidebar: 翻译结果
    | 'OPEN_SIDEBAR_WITH_IMAGE'  // background → sidebar: 右键触发打开侧边栏
    | 'PING'
  [key: string]: unknown
}
