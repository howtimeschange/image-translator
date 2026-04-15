// ── types.ts ─────────────────────────────────────────────────────────────────
// 共享类型定义

export type Language =
  | 'auto'  // 自动检测（仅用于 sourceLanguage）
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

export const LANGUAGES: { code: Language; label: string; nativeName: string; zhNote?: string }[] = [
  { code: 'auto',  label: '自动',       nativeName: '自动检测',            zhNote: '检测' },
  { code: 'zh',    label: '中文',       nativeName: '简体中文',             zhNote: '简体' },
  { code: 'zh-TW', label: '繁中',       nativeName: '繁體中文',             zhNote: '繁体' },
  { code: 'en',    label: 'English',   nativeName: 'English',             zhNote: '英语' },
  { code: 'ja',    label: '日本語',     nativeName: '日本語',               zhNote: '日语' },
  { code: 'ko',    label: '한국어',     nativeName: '한국어',               zhNote: '韩语' },
  { code: 'fr',    label: 'Français',  nativeName: 'Français',            zhNote: '法语' },
  { code: 'de',    label: 'Deutsch',   nativeName: 'Deutsch',             zhNote: '德语' },
  { code: 'es',    label: 'Español',   nativeName: 'Español',             zhNote: '西班牙' },
  { code: 'pt',    label: 'Português', nativeName: 'Português',           zhNote: '葡萄牙' },
  { code: 'ru',    label: 'Русский',   nativeName: 'Русский',             zhNote: '俄语' },
  { code: 'ar',    label: 'العربية',   nativeName: 'العربية',             zhNote: '阿拉伯' },
  // 东南亚
  { code: 'th',    label: 'ไทย',       nativeName: 'ภาษาไทย',            zhNote: '泰语' },
  { code: 'vi',    label: 'Việt',      nativeName: 'Tiếng Việt',         zhNote: '越南' },
  { code: 'id',    label: 'Indonesia', nativeName: 'Bahasa Indonesia',    zhNote: '印尼' },
  { code: 'ms',    label: 'Melayu',    nativeName: 'Bahasa Melayu',       zhNote: '马来' },
  { code: 'tl',    label: 'Filipino',  nativeName: 'Filipino (Tagalog)',  zhNote: '菲律宾' },
  { code: 'my',    label: 'မြန်မာ',    nativeName: 'မြန်မာဘာသာ',         zhNote: '缅甸' },
  { code: 'km',    label: 'ខ្មែរ',      nativeName: 'ភាសាខ្មែរ',          zhNote: '柬埔寨' },
  { code: 'lo',    label: 'ລາວ',       nativeName: 'ພາສາລາວ',            zhNote: '老挝' },
]

// Source language options: includes 'auto', excludes nothing
export const SOURCE_LANGUAGES = LANGUAGES

// Target language options: excludes 'auto'
export const TARGET_LANGUAGES = LANGUAGES.filter(l => l.code !== 'auto')

export const LANGUAGE_NAMES: Record<Language, string> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l.nativeName])
) as Record<Language, string>

export interface TranslationJob {
  id: string
  imageUrl: string
  imageBase64: string | null
  sourceLanguage: Language   // 'auto' 或具体语言
  targetLanguage: Language
  model: ModelId
  status: 'pending' | 'translating' | 'done' | 'error'
  resultDataUrl?: string
  error?: string
  createdAt: number
  /** 识图阶段抽取到的文字列表（用于调试显示） */
  ocrTexts?: string[]
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
  // 1xm.ai 不同模型对应不同 API Key
  visionApiKey: string      // gemini-3-flash-preview（识图分析）
  banana2ApiKey: string     // gemini-3.1-flash-image-preview（Nano Banana 2 生图）
  bananaProApiKey: string   // gemini-3-pro-image-preview（Nano Banana Pro 生图）
  defaultSourceLanguage: Language   // 默认源语言（'auto' 表示自动检测）
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
