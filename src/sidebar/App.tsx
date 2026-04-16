// ── sidebar/App.tsx ───────────────────────────────────────────────────────────
import { useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { SettingsPanel } from '../components/SettingsPanel'
import { TranslateControls } from '../components/TranslateControls'
import { JobCard } from '../components/JobCard'
import { ImageGrid } from '../components/ImageGrid'
import type { PageImage, TranslationJob } from '../services/types'

type Tab = 'single' | 'batch' | 'history' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'single',   label: '单图' },
  { id: 'batch',    label: '批量' },
  { id: 'history',  label: '结果' },
  { id: 'settings', label: '设置' },
]

function mergeImages(pinnedImages: PageImage[], scannedImages: PageImage[]): PageImage[] {
  const pinned = pinnedImages.map((img, i) => ({
    ...img,
    id: img.id || `pin-${i}-${img.src}`,
    source: 'pin' as const,
    selected: img.selected ?? true,
  }))

  const pinnedSrcSet = new Set(pinned.map((img) => img.src))
  const scanned = scannedImages
    .filter((img) => !pinnedSrcSet.has(img.src))
    .map((img, i) => ({
      ...img,
      id: img.id || `scan-${i}-${img.src}`,
      source: 'scan' as const,
      selected: img.selected ?? false,
    }))

  return [...pinned, ...scanned]
}

export function App() {
  const {
    settings, loadSettings,
    activeTab, setActiveTab,
    singleImage, setSingleImage,
    pageImages, setPageImages,
    pinnedImages, setPinnedImages, addPinnedImage, removePinnedImage, clearPinnedImages,
    jobs, addJob, updateJob, clearJobs,
    targetLanguage, selectedModel,
    sourceLanguage,
  } = useAppStore()

  const [isScanningImages, setIsScanningImages] = useState(false)
  const [isTranslatingSingle, setIsTranslatingSingle] = useState(false)
  const [singleResult, setSingleResult] = useState<string | null>(null)
  const [singleError, setSingleError] = useState<string | null>(null)
  // 真实页面 tabId，通过 service-worker 查询避免侧边栏 currentWindow 问题
  const [activeTabId, setActiveTabId] = useState<number | null>(null)

  // ── 获取真实页面 tabId ────────────────────────────────────────────────────────
  const refreshActiveTabId = useCallback(async () => {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_ID' })
      if (resp?.tabId) {
        setActiveTabId(resp.tabId)
        // 同时告诉 service-worker 侧边栏现在绑定哪个 tab
        chrome.runtime.sendMessage({ type: 'REGISTER_SIDEBAR_TAB', tabId: resp.tabId }).catch(() => {})
      }
    } catch {}
  }, [])

  // 发消息到页面（通过 service-worker 中转，不依赖 currentWindow）
  const sendToPage = useCallback(async (payload: object, tabId?: number) => {
    const id = tabId ?? activeTabId
    if (!id) return
    try {
      await chrome.runtime.sendMessage({ type: 'RELAY_TO_TAB', tabId: id, payload })
    } catch {}
  }, [activeTabId])

  // ── Init ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSettings()
    refreshActiveTabId() // 侧边栏初始化时查真实 tabId

    const handler = (message: { type: string; url?: string; base64?: string | null; image?: PageImage; images?: PageImage[] }) => {
      if (message.type === 'OPEN_SIDEBAR_WITH_IMAGE' && message.url) {
        setSingleImage({ url: message.url, base64: message.base64 ?? null })
        setSingleResult(null)
        setSingleError(null)
        setActiveTab('single')
      }
      if (message.type === 'IMAGE_BASE64_READY' && message.url) {
        useAppStore.setState((state) => {
          if (state.singleImage?.url === message.url) {
            return { singleImage: { url: message.url, base64: message.base64 ?? null } }
          }
          return {}
        })
      }
      if (message.type === 'PIN_IMAGE' && message.image) {
        // 直接从 storage 读最新的 pinnedImages，避免广播时序问题
        chrome.storage.local.get(['pinnedImages']).then((data) => {
          const latest: PageImage[] = Array.isArray(data.pinnedImages) ? data.pinnedImages : []
          setPinnedImages(latest.map((img, i) => ({
            ...img,
            id: img.id || `pin-${i}-${img.src}`,
            source: 'pin' as const,
            selected: img.selected ?? true,
          })))
          // 同时更新 pageImages，把新 pin 的图合入
          useAppStore.setState((state) => {
            const merged = mergeImages(
              latest.map((img, i) => ({ ...img, id: img.id || `pin-${i}-${img.src}`, source: 'pin' as const, selected: img.selected ?? true })),
              state.pageImages.filter((img) => img.source !== 'pin')
            )
            return { pageImages: merged }
          })
        })
        setActiveTab('batch')
      }
    }
    chrome.runtime.onMessage.addListener(handler)

    chrome.storage.local.get(['pendingImage', 'pinnedImages']).then((data) => {
      if (Array.isArray(data.pinnedImages)) {
        setPinnedImages(data.pinnedImages)
      }
      if (data.pendingImage?.url) {
        const { url, base64 } = data.pendingImage
        setSingleImage({ url, base64: base64 ?? null })
        setActiveTab('single')
        chrome.storage.local.remove(['pendingImage'])
      }
    })

    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [addPinnedImage, loadSettings, refreshActiveTabId, setActiveTab, setPinnedImages, setSingleImage])

  useEffect(() => {
    // 每次切 tab 时刷新真实页面 tabId
    refreshActiveTabId()
  }, [activeTab, refreshActiveTabId])

  useEffect(() => {
    if (!activeTabId) return
    const enable = activeTab === 'batch'
    sendToPage({ type: 'PIN_OVERLAY_INIT', enabled: enable }, activeTabId)
    const srcs = useAppStore.getState().pinnedImages.map((img) => img.src)
    sendToPage({ type: 'SYNC_PINNED_SRCS', srcs }, activeTabId)
  }, [activeTab, activeTabId, sendToPage])

  // ── Scan ─────────────────────────────────────────────────────────────────────

  const scanImages = useCallback(async () => {
    setIsScanningImages(true)
    // 每次扫描前先刷新 tabId
    let tabId = activeTabId
    if (!tabId) {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_ID' })
        tabId = resp?.tabId ?? null
        if (tabId) setActiveTabId(tabId)
      } catch {}
    }
    try {
      const [scanResp, pinResp] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'DEEP_SCAN_PAGE_IMAGES', tabId }),
        chrome.runtime.sendMessage({ type: 'GET_PINNED_IMAGES' }),
      ])

      const scannedImages = (scanResp?.images ?? []).map((img: any, i: number) => ({
        ...img,
        id: `${img.src}-${i}`,
        selected: false,
        source: 'scan' as const,
      }))

      const pinned = (pinResp?.images ?? []).map((img: any, i: number) => ({
        ...img,
        id: img.id || `pin-${i}-${img.src}`,
        selected: img.selected ?? true,
        source: 'pin' as const,
      }))

      setPinnedImages(pinned)
      setPageImages(mergeImages(pinned, scannedImages))
    } catch {
      setPageImages(mergeImages(pinnedImages, []))
    }
    setIsScanningImages(false)
  }, [activeTabId, pinnedImages, setPageImages, setPinnedImages])

  // ── Single translate ──────────────────────────────────────────────────────────

  const translateSingle = useCallback(async () => {
    if (!singleImage) return
    if (!settings.banana2ApiKey && !settings.bananaProApiKey) {
      setSingleError('请先在「设置」中配置 Nano Banana API Key')
      return
    }
    setIsTranslatingSingle(true)
    setSingleResult(null)
    setSingleError(null)

    const jobId = `single-${Date.now()}`
    const job: TranslationJob = {
      id: jobId,
      imageUrl: singleImage.url,
      imageBase64: singleImage.base64,
      sourceLanguage,
      targetLanguage,
      model: selectedModel,
      status: 'translating',
      preserveBrand: settings.preserveBrand,
      createdAt: Date.now(),
    }
    addJob(job)

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'TRANSLATE_IMAGE',
        imageUrl: singleImage.url,
        imageBase64: singleImage.base64,
        sourceLanguage,
        targetLanguage,
        model: selectedModel,
        visionApiKey: settings.visionApiKey,
        banana2ApiKey: settings.banana2ApiKey,
        bananaProApiKey: settings.bananaProApiKey,
        preserveBrand: settings.preserveBrand,
        jobId,
      })
      if (resp?.error) throw new Error(resp.error)
      const resultDataUrl = resp?.resultDataUrl
      const ocrTexts = resp?.ocrTexts ?? []
      const keepCount = resp?.keepCount ?? 0
      const translateCount = resp?.translateCount ?? 0
      setSingleResult(resultDataUrl)
      updateJob(jobId, { status: 'done', resultDataUrl, ocrTexts, keepCount, translateCount })
    } catch (e: any) {
      const errMsg = e?.message ?? '翻译失败，请重试'
      setSingleError(errMsg)
      updateJob(jobId, { status: 'error', error: errMsg })
    }
    setIsTranslatingSingle(false)
  }, [singleImage, settings, targetLanguage, sourceLanguage, selectedModel, addJob, updateJob])

  // ── Batch translate ───────────────────────────────────────────────────────────

  const translateBatch = useCallback(async () => {
    const selected = pageImages.filter((img) => img.selected)
    if (!selected.length) return
    if (!settings.banana2ApiKey && !settings.bananaProApiKey) {
      alert('请先在设置中配置 Nano Banana API Key')
      return
    }
    setActiveTab('history')

    const batchBase = Date.now()
    const jobIds: string[] = selected.map((img, i) => `job-${batchBase}-${i}-${img.id.slice(0, 6)}`)

    for (let i = 0; i < selected.length; i++) {
      const img = selected[i]
      const jobId = jobIds[i]

      const job: TranslationJob = {
        id: jobId,
        imageUrl: img.src,
        imageBase64: img.base64 ?? null,
        sourceLanguage,
        targetLanguage,
        model: selectedModel,
        status: 'translating',
        preserveBrand: settings.preserveBrand,
        createdAt: Date.now(),
      }
      addJob(job)
    }

    for (let i = 0; i < selected.length; i++) {
      const img = selected[i]
      const jobId = jobIds[i]

      try {
        const resp: any = await chrome.runtime.sendMessage({
          type: 'TRANSLATE_IMAGE',
          imageUrl: img.src,
          imageBase64: img.base64 ?? null,
          sourceLanguage,
          targetLanguage,
          model: selectedModel,
          visionApiKey: settings.visionApiKey,
          banana2ApiKey: settings.banana2ApiKey,
          bananaProApiKey: settings.bananaProApiKey,
          preserveBrand: settings.preserveBrand,
          jobId,
        })

        if (resp?.error) {
          const retryMatch = resp.error?.match(/retry in (\d+(?:\.\d+)?)s/i)
          if (retryMatch) {
            const waitMs = Math.ceil(parseFloat(retryMatch[1]) * 1000) + 500
            updateJob(jobId, {
              status: 'error',
              error: `配额超限，${Math.ceil(waitMs / 1000)}s 后自动重试…`,
            })
            await new Promise(res => setTimeout(res, waitMs))
            updateJob(jobId, { status: 'translating', error: undefined })
            try {
              const resp2: any = await chrome.runtime.sendMessage({
                type: 'TRANSLATE_IMAGE',
                imageUrl: img.src,
                imageBase64: img.base64 ?? null,
                sourceLanguage,
                targetLanguage,
                model: selectedModel,
                visionApiKey: settings.visionApiKey,
                banana2ApiKey: settings.banana2ApiKey,
                bananaProApiKey: settings.bananaProApiKey,
                preserveBrand: settings.preserveBrand,
                jobId,
              })
              if (resp2?.error) {
                updateJob(jobId, { status: 'error', error: resp2.error })
              } else {
                updateJob(jobId, {
                  status: 'done',
                  resultDataUrl: resp2?.resultDataUrl,
                  ocrTexts: resp2?.ocrTexts ?? [],
                  keepCount: resp2?.keepCount ?? 0,
                  translateCount: resp2?.translateCount ?? 0,
                })
              }
            } catch (e2: any) {
              updateJob(jobId, { status: 'error', error: e2?.message ?? '重试失败' })
            }
          } else {
            updateJob(jobId, { status: 'error', error: resp.error })
          }
        } else {
          updateJob(jobId, {
            status: 'done',
            resultDataUrl: resp?.resultDataUrl,
            ocrTexts: resp?.ocrTexts ?? [],
            keepCount: resp?.keepCount ?? 0,
            translateCount: resp?.translateCount ?? 0,
          })
        }
      } catch (e: any) {
        updateJob(jobId, { status: 'error', error: e?.message ?? '翻译失败' })
      }

      if (i < selected.length - 1) {
        await new Promise(res => setTimeout(res, 200))
      }
    }
  }, [pageImages, settings, targetLanguage, sourceLanguage, selectedModel, addJob, updateJob, setActiveTab])

  // ── Tab switch ────────────────────────────────────────────────────────────────

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    if (tab === 'batch' && pageImages.length === 0) scanImages()
  }

  const noApiKey = !settings.banana2ApiKey && !settings.bananaProApiKey
  const runningCount = jobs.filter(j => j.status === 'translating').length
  const selectedCount = pageImages.filter(i => i.selected).length

  const clearPins = async () => {
    await chrome.runtime.sendMessage({ type: 'CLEAR_PINNED_IMAGES' }).catch(() => {})
    clearPinnedImages()
    sendToPage({ type: 'SYNC_PINNED_SRCS', srcs: [] })
    setPageImages(pageImages.filter((img) => img.source !== 'pin'))
  }

  const handleRemovePin = async (id: string) => {
    const img = pinnedImages.find((item) => item.id === id)
    const nextPinned = pinnedImages.filter((item) => item.id !== id)
    await chrome.storage.local.set({ pinnedImages: nextPinned }).catch(() => {})
    removePinnedImage(id)
    setPageImages(pageImages.filter((item) => item.id !== id))
    if (img) {
      sendToPage({ type: 'SYNC_PINNED_SRCS', srcs: nextPinned.map((p) => p.src) })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0c0c0e', overflow: 'hidden' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)',
        }}>
          ImageTranslator
        </span>

        {runningCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, color: 'rgba(255,255,255,0.35)',
          }}>
            <span className="spinner" style={{ width: 8, height: 8 }} />
            {runningCount} 进行中
          </div>
        )}
      </header>

      {noApiKey && activeTab !== 'settings' && (
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(255,255,255,0.02)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>未配置 API Key</span>
          <button
            onClick={() => setActiveTab('settings')}
            style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            前往设置
          </button>
        </div>
      )}

      <nav style={{
        display: 'flex',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id
          const badgeCount = tab.id === 'history' ? jobs.length : 0
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                flex: 1,
                padding: '9px 0',
                background: 'none',
                border: 'none',
                borderBottom: active ? '1px solid rgba(255,255,255,0.5)' : '1px solid transparent',
                marginBottom: -1,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: active ? 600 : 400,
                color: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
            >
              {tab.label}
              {badgeCount > 0 && (
                <span style={{
                  minWidth: 14, height: 14,
                  borderRadius: 7,
                  background: 'rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px',
                }}>
                  {badgeCount}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {activeTab === 'single' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {singleImage ? (
              <>
                <div style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.07)',
                  background: '#000',
                  flexShrink: 0,
                }}>
                  <img
                    src={singleImage.url}
                    alt=""
                    style={{ width: '100%', maxHeight: 180, objectFit: 'contain', display: 'block' }}
                  />
                </div>

                <TranslateControls
                  onTranslate={translateSingle}
                  isTranslating={isTranslatingSingle}
                  disabled={noApiKey}
                />
                {singleResult && (
                  <div className="fade-up">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: 'rgba(74,222,128,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>翻译完成</div>
                      <a
                        href={singleResult}
                        download="translated.png"
                        style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
                      >
                        ↓ 下载
                      </a>
                    </div>
                    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', background: '#000' }}>
                      <img src={singleResult} alt="翻译结果" style={{ width: '100%', maxHeight: 180, objectFit: 'contain', display: 'block' }} />
                    </div>
                  </div>
                )}

                {singleError && (
                  <div style={{
                    background: 'rgba(248,113,113,0.06)',
                    border: '1px solid rgba(248,113,113,0.15)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    fontSize: 11,
                    color: 'rgba(248,113,113,0.8)',
                    lineHeight: 1.5,
                  }}>
                    {singleError}
                  </div>
                )}
              </>
            ) : (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '60px 16px',
                gap: 12, textAlign: 'center',
              }}>
                <div style={{
                  width: 44, height: 44,
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, opacity: 0.25,
                }}>
                  ⟲
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                    右键点击网页图片
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
                    选择「翻译此图片」<br />或切到批量模式扫描全页
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'batch' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Pin 队列说明条 */}
            {pinnedImages.length === 0 && pageImages.length === 0 && (
              <div style={{
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10,
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.02)',
                fontSize: 11, color: 'rgba(255,255,255,0.22)', lineHeight: 1.6,
              }}>
                把鼠标移到网页图片上，出现 <strong style={{ color: 'rgba(255,255,255,0.55)' }}>📌 Pin</strong> 后点击加入队列，
                或点「深度扫描」自动抓取页面商品图。
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="label-xs">
                {pinnedImages.length > 0
                  ? `批量图片（${pinnedImages.length} 已 Pin · ${pageImages.filter(i => i.source !== 'pin').length} 已扫描）`
                  : '批量图片'}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {pinnedImages.length > 0 && (
                  <button
                    onClick={clearPins}
                    style={{ fontSize: 11, color: 'rgba(248,113,113,0.6)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'rgba(248,113,113,0.9)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(248,113,113,0.6)')}
                  >
                    清空 Pin
                  </button>
                )}
                <button
                  onClick={scanImages}
                  disabled={isScanningImages}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: 'rgba(255,255,255,0.35)',
                    background: 'none', border: 'none', cursor: isScanningImages ? 'not-allowed' : 'pointer',
                  }}
                  onMouseEnter={e => { if (!isScanningImages) e.currentTarget.style.color = 'rgba(255,255,255,0.65)' }}
                  onMouseLeave={e => { if (!isScanningImages) e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
                >
                  {isScanningImages ? <span className="spinner" style={{ width: 9, height: 9 }} /> : '↺'}
                  深度扫描
                </button>
              </div>
            </div>

            {isScanningImages ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[1,2,3,4].map(i => <div key={i} className="shimmer" style={{ height: 90 }} />)}
              </div>
            ) : (
              <ImageGrid images={pageImages} onRemovePin={handleRemovePin} />
            )}

            {selectedCount > 0 && (
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                paddingTop: 12,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <TranslateControls
                  onTranslate={translateBatch}
                  isTranslating={false}
                  disabled={noApiKey}
                />
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', margin: 0 }}>
                  翻译 {selectedCount} 张 · 完成后查看「结果」
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{ padding: '0 16px' }}>
            {jobs.length > 0 && (
              <div style={{ padding: '10px 0', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <button
                  onClick={clearJobs}
                  style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
                >
                  清空全部
                </button>
              </div>
            )}
            {jobs.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: '60px 16px',
                gap: 10, textAlign: 'center',
              }}>
                <span style={{ fontSize: 24, opacity: 0.15 }}>◫</span>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>暂无翻译记录</div>
              </div>
            ) : (
              jobs.map(job => <JobCard key={job.id} job={job} />)
            )}
          </div>
        )}

        {activeTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
