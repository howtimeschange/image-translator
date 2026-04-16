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
  addJob: (job) => set((state) => ({ jobs: [job, ...state.jobs] })),
  updateJob: (id, patch) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    })),
  clearJobs: () => set({ jobs: [] }),

  targetLanguage: 'zh',
  setTargetLanguage: (l) => set({ targetLanguage: l }),

  sourceLanguage: 'auto' as Language,
  setSourceLanguage: (l) => set({ sourceLanguage: l }),

  selectedModel: 'nano-banana-2',
  setSelectedModel: (m) => set({ selectedModel: m }),
}))

