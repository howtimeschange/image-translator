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
  sourceLanguage: Language
  targetLanguage: Language
  model: ModelId
  status: 'pending' | 'translating' | 'done' | 'error'
  resultDataUrl?: string
  error?: string
  createdAt: number
  preserveBrand?: boolean
  /** OCR 阶段结果：[保留] xxx / [翻译] xxx → yyy */
  ocrTexts?: string[]
  keepCount?: number       // 保留的品牌元素数量
  translateCount?: number  // 翻译的文字数量
}

export interface PageImage {
  id: string
  src: string
  alt: string
  width: number
  height: number
  base64?: string
  selected: boolean
  /** 来源：页面扫描 or 手动 Pin */
  source?: 'scan' | 'pin'
  /** Pin 时所在页面的 URL */
  originUrl?: string
  /** Pin 时间戳 */
  pinnedAt?: number
}

export interface Settings {
  // 1xm.ai 不同模型对应不同 API Key
  visionApiKey: string      // gemini-3-flash-preview（识图分析）
  banana2ApiKey: string     // gemini-3.1-flash-image-preview（Nano Banana 2 生图）
  bananaProApiKey: string   // gemini-3-pro-image-preview（Nano Banana Pro 生图）
  defaultSourceLanguage: Language   // 默认源语言（'auto' 表示自动检测）
  defaultLanguage: Language
  defaultModel: ModelId
  /**
   * 保留品牌元素开关（默认 true）
   * 开启时：Logo、品牌名、商标、SKU、产品型号等保持原文，只翻译功能性文案
   * 关闭时：尝试翻译所有文字（激进模式）
   */
  preserveBrand: boolean
}

// Chrome message types
export interface ChromeMessage {
  type:
    | 'IMAGE_RIGHT_CLICKED'      // content → background: 右键单图
    | 'SCAN_PAGE_IMAGES'         // sidebar → content: 扫描页面图片（旧：同步快扫）
    | 'DEEP_SCAN_PAGE_IMAGES'    // sidebar → content: 深度扫图（懒加载+滚动+平台适配）
    | 'PAGE_IMAGES_RESULT'       // content → sidebar: 返回图片列表
    | 'FETCH_IMAGE_BASE64'       // background/sidebar → content: 获取图片 base64
    | 'FETCH_IMAGE_BASE64_RESULT'// content → background/sidebar
    | 'TRANSLATE_IMAGE'          // sidebar → background: 翻译请求
    | 'TRANSLATE_RESULT'         // background → sidebar: 翻译结果
    | 'OPEN_SIDEBAR_WITH_IMAGE'  // background → sidebar: 右键触发打开侧边栏
    | 'PIN_IMAGE'                // content → background → sidebar: 用户在页面 pin 了一张图
    | 'UNPIN_IMAGE'              // sidebar → content: 从 pin 队列中移除
    | 'PIN_OVERLAY_INIT'         // sidebar → content: 启用 / 禁用 pin 浮层
    | 'SYNC_PINNED_SRCS'         // sidebar → content: 同步已 pin 的 src 集合（用于角标）
    | 'PING'
  [key: string]: unknown
}
