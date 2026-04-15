// ── sidebar/App.tsx ───────────────────────────────────────────────────────────
import { useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { SettingsPanel } from '../components/SettingsPanel'
import { TranslateControls } from '../components/TranslateControls'
import { JobCard } from '../components/JobCard'
import { ImageGrid } from '../components/ImageGrid'
import type { TranslationJob } from '../services/types'

type Tab = 'single' | 'batch' | 'history' | 'settings'

export function App() {
  const {
    settings, loadSettings,
    activeTab, setActiveTab,
    singleImage, setSingleImage,
    pageImages, setPageImages,
    jobs, addJob, updateJob, clearJobs,
    targetLanguage, selectedModel,
  } = useAppStore()

  const [isScanningImages, setIsScanningImages] = useState(false)
  const [isTranslatingSingle, setIsTranslatingSingle] = useState(false)
  const [singleResult, setSingleResult] = useState<string | null>(null)
  const [singleError, setSingleError] = useState<string | null>(null)
  const [progressMsg, setProgressMsg] = useState('')

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSettings()

    // Listen for messages from background
    const handler = (message: { type: string; url?: string; base64?: string | null }) => {
      if (message.type === 'OPEN_SIDEBAR_WITH_IMAGE' && message.url) {
        // Sidebar just opened — show image preview immediately (base64 may still be loading)
        setSingleImage({ url: message.url, base64: message.base64 ?? null })
        setSingleResult(null)
        setSingleError(null)
        setActiveTab('single')
      }
      if (message.type === 'IMAGE_BASE64_READY' && message.url) {
        // base64 fetched asynchronously — update current image's base64 if URL matches
        useAppStore.setState((state) => {
          if (state.singleImage?.url === message.url) {
            return { singleImage: { url: message.url, base64: message.base64 ?? null } }
          }
          return {}
        })
      }
    }
    chrome.runtime.onMessage.addListener(handler)

    // Check for pending image (sidebar opened after background stored it)
    chrome.storage.local.get(['pendingImage']).then((data) => {
      if (data.pendingImage?.url) {
        const { url, base64 } = data.pendingImage
        setSingleImage({ url, base64: base64 ?? null })
        setActiveTab('single')
        chrome.storage.local.remove(['pendingImage'])
      }
    })

    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  // ── Scan page images (batch mode) ─────────────────────────────────���─────────

  const scanImages = useCallback(async () => {
    setIsScanningImages(true)
    setPageImages([])
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'SCAN_PAGE_IMAGES' })
      const imgs = (resp?.images ?? []).map((img: any, i: number) => ({
        ...img,
        id: `${img.src}-${i}`,
        selected: false,
      }))
      setPageImages(imgs)
    } catch (e) {
      console.error('Scan failed:', e)
    }
    setIsScanningImages(false)
  }, [])

  // ── Single image translate ───────────────────────────────────────────────────

  const translateSingle = useCallback(async () => {
    if (!singleImage) return
    if (!settings.banana2ApiKey && !settings.bananaProApiKey) {
      setSingleError('请先在设置中配置 Nano Banana 的 API Key')
      return
    }
    setIsTranslatingSingle(true)
    setSingleResult(null)
    setSingleError(null)
    setProgressMsg('正在准备翻译...')

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'TRANSLATE_IMAGE',
        imageUrl: singleImage.url,
        imageBase64: singleImage.base64,
        targetLanguage,
        model: selectedModel,
        visionApiKey: settings.visionApiKey,
        banana2ApiKey: settings.banana2ApiKey,
        bananaProApiKey: settings.bananaProApiKey,
        jobId: `single-${Date.now()}`,
      })
      if (resp?.error) throw new Error(resp.error)
      setSingleResult(resp?.resultDataUrl)
    } catch (e: any) {
      setSingleError(e?.message ?? '翻译失败，请重试')
    }
    setIsTranslatingSingle(false)
    setProgressMsg('')
  }, [singleImage, settings, targetLanguage, selectedModel])

  // ── Batch translate ──────────────────────────────────────────────────────────

  const translateBatch = useCallback(async () => {
    const selected = pageImages.filter((img) => img.selected)
    if (!selected.length) return
    if (!settings.banana2ApiKey && !settings.bananaProApiKey) {
      alert('请先在设置中配置 Nano Banana 的 API Key')
      return
    }

    setActiveTab('history')

    for (const img of selected) {
      const jobId = `job-${Date.now()}-${img.id.slice(0, 8)}`
      const job: TranslationJob = {
        id: jobId,
        imageUrl: img.src,
        imageBase64: img.base64 ?? null,
        targetLanguage,
        model: selectedModel,
        status: 'translating',
        createdAt: Date.now(),
      }
      addJob(job)

      chrome.runtime.sendMessage({
        type: 'TRANSLATE_IMAGE',
        imageUrl: img.src,
        imageBase64: img.base64 ?? null,
        targetLanguage,
        model: selectedModel,
        visionApiKey: settings.visionApiKey,
        banana2ApiKey: settings.banana2ApiKey,
        bananaProApiKey: settings.bananaProApiKey,
        jobId,
      }).then((resp: any) => {
        if (resp?.error) {
          updateJob(jobId, { status: 'error', error: resp.error })
        } else {
          updateJob(jobId, { status: 'done', resultDataUrl: resp?.resultDataUrl })
        }
      }).catch((e: any) => {
        updateJob(jobId, { status: 'error', error: e?.message ?? '翻译失败' })
      })
    }
  }, [pageImages, settings, targetLanguage, selectedModel])

  // ── Tab switch side-effects ──────────────────────────────────────────────────

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    if (tab === 'batch' && pageImages.length === 0) {
      scanImages()
    }
  }

  const noApiKey = !settings.banana2ApiKey && !settings.bananaProApiKey

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-[#0f1117] text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌐</span>
          <div>
            <div className="font-bold text-sm text-white">Image Translator</div>
            <div className="text-[10px] text-slate-500">Powered by Nano Banana</div>
          </div>
        </div>
        <button
          onClick={() => handleTabChange('settings')}
          className="text-slate-400 hover:text-white transition-colors"
          title="设置"
        >
          ⚙️
        </button>
      </div>

      {/* API Key Warning */}
      {noApiKey && activeTab !== 'settings' && (
        <div className="mx-4 mt-3 px-3 py-2 bg-amber-950/60 border border-amber-700 rounded-lg text-xs text-amber-300 flex items-center gap-2">
          <span>⚠️</span>
          <span>
            未配置 API Key，
            <button onClick={() => setActiveTab('settings')} className="underline ml-1">
              点击前往设置
            </button>
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 text-xs">
        {([
          { id: 'single', label: '单图模式', icon: '🖱️' },
          { id: 'batch', label: '批量模式', icon: '📋' },
          { id: 'history', label: `结果 (${jobs.length})`, icon: '📁' },
          { id: 'settings', label: '设置', icon: '⚙️' },
        ] as { id: Tab; label: string; icon: string }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 transition-all ${
              activeTab === tab.id
                ? 'text-violet-400 border-b-2 border-violet-500 -mb-px'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Single Image Mode ── */}
        {activeTab === 'single' && (
          <div className="p-4 space-y-4">
            {singleImage ? (
              <>
                <div className="glass p-3">
                  <div className="text-xs text-slate-400 mb-2">待翻译图片</div>
                  <img
                    src={singleImage.url}
                    alt="待翻译"
                    className="w-full rounded-lg object-contain max-h-52 bg-slate-900"
                  />
                  <div className="mt-2 text-[10px] text-slate-500 truncate">{singleImage.url}</div>
                </div>

                <TranslateControls
                  onTranslate={translateSingle}
                  isTranslating={isTranslatingSingle}
                  disabled={noApiKey}
                />

                {progressMsg && (
                  <div className="text-xs text-violet-400 animate-pulse text-center">{progressMsg}</div>
                )}

                {singleResult && (
                  <div className="glass p-3 space-y-2">
                    <div className="text-xs text-emerald-400 font-medium">✅ 翻译完成</div>
                    <img
                      src={singleResult}
                      alt="翻译结果"
                      className="w-full rounded-lg object-contain max-h-52 bg-slate-900"
                    />
                    <a
                      href={singleResult}
                      download="translated.png"
                      className="block text-center text-xs text-violet-400 hover:text-violet-300 py-1.5 border border-violet-600/30 rounded-lg hover:bg-violet-600/10 transition-all"
                    >
                      ↓ 下载翻译后图片
                    </a>
                  </div>
                )}

                {singleError && (
                  <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-xs text-red-300">
                    ❌ {singleError}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 space-y-4 text-center">
                <div className="text-5xl">🖱️</div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-white">右键点击网页图片</div>
                  <div className="text-xs text-slate-400">选择「翻译此图片」触发单图翻译</div>
                </div>
                <div className="text-xs text-slate-600">或切换到批量模式扫描页面全部图片</div>
              </div>
            )}
          </div>
        )}

        {/* ── Batch Mode ── */}
        {activeTab === 'batch' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">页面图片</div>
              <button
                onClick={scanImages}
                disabled={isScanningImages}
                className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
              >
                {isScanningImages ? (
                  <span className="inline-block w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin" />
                ) : '🔄'} 重新扫描
              </button>
            </div>

            {isScanningImages ? (
              <div className="grid grid-cols-2 gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="shimmer h-28 rounded-lg" />
                ))}
              </div>
            ) : (
              <ImageGrid images={pageImages} />
            )}

            {pageImages.filter((i) => i.selected).length > 0 && (
              <div className="glass p-4 space-y-4 sticky bottom-0">
                <TranslateControls
                  onTranslate={translateBatch}
                  isTranslating={false}
                  disabled={noApiKey}
                />
                <div className="text-xs text-slate-500 text-center">
                  将翻译 {pageImages.filter((i) => i.selected).length} 张图片，结果在「结果」标签查看
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── History / Results ── */}
        {activeTab === 'history' && (
          <div className="p-4 space-y-3">
            {jobs.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={clearJobs}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                >
                  清空全部
                </button>
              </div>
            )}
            {jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500 space-y-3">
                <div className="text-4xl">📭</div>
                <div className="text-sm">暂无翻译记录</div>
                <div className="text-xs text-slate-600">翻译完成的图片会显示在这里</div>
              </div>
            ) : (
              jobs.map((job) => <JobCard key={job.id} job={job} />)
            )}
          </div>
        )}

        {/* ── Settings ── */}
        {activeTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
