// ── appStore.ts ───────────────────────────────────────────────────────────────
import { create } from 'zustand'
import type { Language, ModelId, TranslationJob, PageImage, Settings } from '../services/types'

const DEFAULT_SETTINGS: Settings = {
  visionApiKey: '',
  banana2ApiKey: '',
  bananaProApiKey: '',
  defaultSourceLanguage: 'auto',
  defaultLanguage: 'zh',
  defaultModel: 'nano-banana-2',
  preserveBrand: true,
}

// ── storage key helpers ───────────────────────────────────────────────────────

const JOBS_META_KEY = 'jobs_meta'       // string[] — ordered job id list
const jobDataKey = (id: string) => `job_${id}` // per-job storage key

/** 从 storage 加载全部 jobs（按 jobs_meta 顺序）*/
async function loadJobsFromStorage(): Promise<TranslationJob[]> {
  const meta = await chrome.storage.local.get([JOBS_META_KEY])
  const ids: string[] = Array.isArray(meta[JOBS_META_KEY]) ? meta[JOBS_META_KEY] : []
  if (!ids.length) return []
  const keys = ids.map(jobDataKey)
  const data = await chrome.storage.local.get(keys)
  return ids
    .map((id) => data[jobDataKey(id)] as TranslationJob | undefined)
    .filter((j): j is TranslationJob => !!j)
}

/** 持久化单条 job（追加到 meta 列表头部） */
async function persistJob(job: TranslationJob): Promise<void> {
  const meta = await chrome.storage.local.get([JOBS_META_KEY])
  const ids: string[] = Array.isArray(meta[JOBS_META_KEY]) ? meta[JOBS_META_KEY] : []
  const nextIds = [job.id, ...ids.filter((id) => id !== job.id)]
  await chrome.storage.local.set({
    [JOBS_META_KEY]: nextIds,
    [jobDataKey(job.id)]: job,
  })
}

/** 更新单条 job */
async function updateJobInStorage(id: string, patch: Partial<TranslationJob>): Promise<void> {
  const key = jobDataKey(id)
  const data = await chrome.storage.local.get([key])
  const existing = data[key] as TranslationJob | undefined
  if (!existing) return
  await chrome.storage.local.set({ [key]: { ...existing, ...patch } })
}

/** 清空所有 jobs */
async function clearJobsInStorage(): Promise<void> {
  const meta = await chrome.storage.local.get([JOBS_META_KEY])
  const ids: string[] = Array.isArray(meta[JOBS_META_KEY]) ? meta[JOBS_META_KEY] : []
  const keysToRemove = [JOBS_META_KEY, ...ids.map(jobDataKey)]
  await chrome.storage.local.remove(keysToRemove)
}

// ── AppState ──────────────────────────────────────────────────────────────────

interface AppState {
  // Settings
  settings: Settings
  setSettings: (s: Partial<Settings>) => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>

  // UI state
  activeTab: 'single' | 'batch' | 'history' | 'settings'
  setActiveTab: (t: AppState['activeTab']) => void

  // Single image mode (right-click triggered)
  singleImage: { url: string; base64: string | null } | null
  setSingleImage: (img: { url: string; base64: string | null } | null) => void

  // Batch mode
  pageImages: PageImage[]
  setPageImages: (imgs: PageImage[]) => void
  pinnedImages: PageImage[]
  setPinnedImages: (imgs: PageImage[]) => void
  addPinnedImage: (img: PageImage) => void
  removePinnedImage: (id: string) => void
  clearPinnedImages: () => void
  toggleImageSelection: (id: string) => void
  selectAll: () => void
  deselectAll: () => void

  // Translation jobs
  jobs: TranslationJob[]
  addJob: (job: TranslationJob) => void
  updateJob: (id: string, patch: Partial<TranslationJob>) => void
  clearJobs: () => void

  // Current selection for translate
  targetLanguage: Language
  setTargetLanguage: (l: Language) => void
  sourceLanguage: Language
  setSourceLanguage: (l: Language) => void
  selectedModel: ModelId
  setSelectedModel: (m: ModelId) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  settings: DEFAULT_SETTINGS,

  setSettings: (s) =>
    set((state) => ({ settings: { ...state.settings, ...s } })),

  loadSettings: async () => {
    const data = await chrome.storage.local.get(['settings', 'pinnedImages'])
    if (data.settings) {
      set({ settings: { ...DEFAULT_SETTINGS, ...data.settings } })
      set({
        targetLanguage: data.settings.defaultLanguage ?? 'zh',
        sourceLanguage: data.settings.defaultSourceLanguage ?? 'auto',
        selectedModel: data.settings.defaultModel ?? 'nano-banana-2',
      })
    }
    if (Array.isArray(data.pinnedImages)) {
      set({ pinnedImages: data.pinnedImages })
    }
    // 加载持久化的 jobs
    try {
      const jobs = await loadJobsFromStorage()
      if (jobs.length) set({ jobs })
    } catch {}
  },

  saveSettings: async () => {
    await chrome.storage.local.set({ settings: get().settings })
  },

  activeTab: 'single',
  setActiveTab: (t) => set({ activeTab: t }),

  singleImage: null,
  setSingleImage: (img) => set({ singleImage: img }),

  pageImages: [],
  setPageImages: (imgs) => set({ pageImages: imgs }),

  pinnedImages: [],
  setPinnedImages: (imgs) => set({ pinnedImages: imgs }),
  addPinnedImage: (img) =>
    set((state) => ({
      pinnedImages: [img, ...state.pinnedImages.filter((item) => item.src !== img.src)],
    })),
  removePinnedImage: (id) =>
    set((state) => ({
      pinnedImages: state.pinnedImages.filter((item) => item.id !== id),
    })),
  clearPinnedImages: () => set({ pinnedImages: [] }),

  toggleImageSelection: (id) =>
    set((state) => ({
      pageImages: state.pageImages.map((img) =>
        img.id === id ? { ...img, selected: !img.selected } : img
      ),
      pinnedImages: state.pinnedImages.map((img) =>
        img.id === id ? { ...img, selected: !img.selected } : img
      ),
    })),

  selectAll: () =>
    set((state) => ({
      pageImages: state.pageImages.map((img) => ({ ...img, selected: true })),
      pinnedImages: state.pinnedImages.map((img) => ({ ...img, selected: true })),
    })),

  deselectAll: () =>
    set((state) => ({
      pageImages: state.pageImages.map((img) => ({ ...img, selected: false })),
      pinnedImages: state.pinnedImages.map((img) => ({ ...img, selected: false })),
    })),

  jobs: [],
  addJob: (job) => {
    set((state) => ({ jobs: [job, ...state.jobs] }))
    persistJob(job).catch(() => {})
  },
  updateJob: (id, patch) => {
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    }))
    updateJobInStorage(id, patch).catch(() => {})
  },
  clearJobs: () => {
    set({ jobs: [] })
    clearJobsInStorage().catch(() => {})
  },

  targetLanguage: 'zh',
  setTargetLanguage: (l) => set({ targetLanguage: l }),

  sourceLanguage: 'auto' as Language,
  setSourceLanguage: (l) => set({ sourceLanguage: l }),

  selectedModel: 'nano-banana-2',
  setSelectedModel: (m) => set({ selectedModel: m }),
}))
