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

// ── IndexedDB for large blobs (resultDataUrl) ─────────────────────────────────
// chrome.storage.local 总量 10MB，base64 图片几百 KB，很快就满
// 元数据存 storage.local，图片 dataURL 存 IndexedDB（无大小限制）

const IDB_NAME = 'image-translator'
const IDB_STORE = 'job-results'
const IDB_VERSION = 1

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet(key: string): Promise<string | undefined> {
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve(req.result as string | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbGetMany(keys: string[]): Promise<Record<string, string>> {
  if (!keys.length) return {}
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const store = tx.objectStore(IDB_STORE)
    const result: Record<string, string> = {}
    let pending = keys.length
    for (const k of keys) {
      const req = store.get(k)
      req.onsuccess = () => {
        if (req.result) result[k] = req.result as string
        if (--pending === 0) resolve(result)
      }
      req.onerror = () => { if (--pending === 0) resolve(result) }
    }
    tx.onerror = () => reject(tx.error)
  })
}

async function idbDeleteMany(keys: string[]): Promise<void> {
  if (!keys.length) return
  const db = await openIdb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    for (const k of keys) tx.objectStore(IDB_STORE).delete(k)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// ── storage key helpers ───────────────────────────────────────────────────────

const JOBS_META_KEY = 'jobs_meta'       // string[] — ordered job id list
const MAX_JOBS = 50                     // 最多保留 50 条，超出自动删除最旧的
const jobDataKey = (id: string) => `job_${id}`
const jobImgKey = (id: string) => `result_${id}`

/** 从 storage + IDB 加载全部 jobs */
async function loadJobsFromStorage(): Promise<TranslationJob[]> {
  const meta = await chrome.storage.local.get([JOBS_META_KEY])
  const ids: string[] = Array.isArray(meta[JOBS_META_KEY]) ? meta[JOBS_META_KEY] : []
  if (!ids.length) return []

  // 批量读 meta
  const metaKeys = ids.map(jobDataKey)
  const metaData = await chrome.storage.local.get(metaKeys)

  // 批量读图片（IDB）
  const imgKeys = ids.map(jobImgKey)
  const imgData = await idbGetMany(imgKeys).catch(() => ({} as Record<string, string>))

  return ids
    .map((id) => {
      const job = metaData[jobDataKey(id)] as TranslationJob | undefined
      if (!job) return undefined
      const img = imgData[jobImgKey(id)]
      return img ? { ...job, resultDataUrl: img } : job
    })
    .filter((j): j is TranslationJob => !!j)
}

/** 持久化单条 job（仅元数据到 storage，图片到 IDB） */
async function persistJob(job: TranslationJob): Promise<void> {
  // 元数据不含 resultDataUrl（省空间）
  const { resultDataUrl, ...meta } = job

  const storageMeta = await chrome.storage.local.get([JOBS_META_KEY])
  const ids: string[] = Array.isArray(storageMeta[JOBS_META_KEY]) ? storageMeta[JOBS_META_KEY] : []
  let nextIds = [job.id, ...ids.filter((id) => id !== job.id)]

  // 超出上限时删除最旧的
  const toEvict = nextIds.slice(MAX_JOBS)
  if (toEvict.length) {
    nextIds = nextIds.slice(0, MAX_JOBS)
    await chrome.storage.local.remove(toEvict.map(jobDataKey))
    await idbDeleteMany(toEvict.map(jobImgKey)).catch(() => {})
  }

  await chrome.storage.local.set({
    [JOBS_META_KEY]: nextIds,
    [jobDataKey(job.id)]: meta,
  })

  if (resultDataUrl) {
    await idbSet(jobImgKey(job.id), resultDataUrl).catch(() => {})
  }
}

/** 更新单条 job：元数据到 storage.local，resultDataUrl 到 IDB */
async function updateJobInStorage(id: string, patch: Partial<TranslationJob>): Promise<void> {
  const { resultDataUrl, ...metaPatch } = patch

  // 更新元数据
  if (Object.keys(metaPatch).length) {
    const key = jobDataKey(id)
    const data = await chrome.storage.local.get([key])
    const existing = data[key] as TranslationJob | undefined
    if (existing) {
      await chrome.storage.local.set({ [key]: { ...existing, ...metaPatch } })
    }
  }

  // 更新图片
  if (resultDataUrl) {
    await idbSet(jobImgKey(id), resultDataUrl).catch(() => {})
  }
}

/** 清空所有 jobs */
async function clearJobsInStorage(): Promise<void> {
  const meta = await chrome.storage.local.get([JOBS_META_KEY])
  const ids: string[] = Array.isArray(meta[JOBS_META_KEY]) ? meta[JOBS_META_KEY] : []
  await chrome.storage.local.remove([JOBS_META_KEY, ...ids.map(jobDataKey)])
  await idbDeleteMany(ids.map(jobImgKey)).catch(() => {})
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
    // 加载持久化的 jobs（含 IDB 图片）
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
