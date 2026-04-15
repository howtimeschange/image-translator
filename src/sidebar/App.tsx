// ── sidebar/App.tsx ───────────────────────────────────────────────────────────
import { useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { SettingsPanel } from '../components/SettingsPanel'
import { TranslateControls } from '../components/TranslateControls'
import { JobCard } from '../components/JobCard'
import { ImageGrid } from '../components/ImageGrid'
import type { TranslationJob } from '../services/types'

type Tab = 'single' | 'batch' | 'history' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'single',   label: '单图' },
  { id: 'batch',    label: '批量' },
  { id: 'history',  label: '结果' },
  { id: 'settings', label: '设置' },
]

export function App() {
  const {
    settings, loadSettings,
    activeTab, setActiveTab,
    singleImage, setSingleImage,
    pageImages, setPageImages,
    jobs, addJob, updateJob, clearJobs,
    targetLanguage, selectedModel,
    sourceLanguage,
  } = useAppStore()

  const [isScanningImages, setIsScanningImages] = useState(false)
  const [isTranslatingSingle, setIsTranslatingSingle] = useState(false)
  const [singleResult, setSingleResult] = useState<string | null>(null)
  const [singleError, setSingleError] = useState<string | null>(null)

  // ── Init ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadSettings()

    const handler = (message: { type: string; url?: string; base64?: string | null }) => {
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
    }
    chrome.runtime.onMessage.addListener(handler)

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

  // ── Scan ─────────────────────────────────────────────────────────────────────

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
    } catch { /* ignore */ }
    setIsScanningImages(false)
  }, [])

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
  }, [singleImage, settings, targetLanguage, sourceLanguage, selectedModel])

  // ── Batch translate ───────────────────────────────────────────────────────────

  const translateBatch = useCallback(async () => {
    const selected = pageImages.filter((img) => img.selected)
    if (!selected.length) return
    if (!settings.banana2ApiKey && !settings.bananaProApiKey) {
      alert('请先在设置中配置 Nano Banana API Key')
      return
    }
    setActiveTab('history')

    for (const img of selected) {
      const jobId = `job-${Date.now()}-${img.id.slice(0, 8)}`
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

      chrome.runtime.sendMessage({
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
      }).then((resp: any) => {
        if (resp?.error) updateJob(jobId, { status: 'error', error: resp.error })
        else updateJob(jobId, {
          status: 'done',
          resultDataUrl: resp?.resultDataUrl,
          ocrTexts: resp?.ocrTexts ?? [],
          keepCount: resp?.keepCount ?? 0,
          translateCount: resp?.translateCount ?? 0,
        })
      }).catch((e: any) => {
        updateJob(jobId, { status: 'error', error: e?.message ?? '翻译失败' })
      })
    }
  }, [pageImages, settings, targetLanguage, sourceLanguage, selectedModel])

  // ── Tab switch ────────────────────────────────────────────────────────────────

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    if (tab === 'batch' && pageImages.length === 0) scanImages()
  }

  const noApiKey = !settings.banana2ApiKey && !settings.bananaProApiKey
  const runningCount = jobs.filter(j => j.status === 'translating').length

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0c0c0e', overflow: 'hidden' }}>

      {/* ── Header ── */}
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

      {/* ── No API Key warning ── */}
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

      {/* ── Tabs ── */}
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

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

        {/* ── Single ── */}
        {activeTab === 'single' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {singleImage ? (
              <>
                {/* Preview */}
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

                {/* Error */}
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
              /* Empty state */
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

        {/* ── Batch ── */}
        {activeTab === 'batch' && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="label-xs">页面图片</div>
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
                重新扫描
              </button>
            </div>

            {isScanningImages ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[1,2,3,4].map(i => <div key={i} className="shimmer" style={{ height: 90 }} />)}
              </div>
            ) : (
              <ImageGrid images={pageImages} />
            )}

            {pageImages.filter(i => i.selected).length > 0 && (
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
                  翻译 {pageImages.filter(i => i.selected).length} 张 · 完成后查看「结果」
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── History ── */}
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

        {/* ── Settings ── */}
        {activeTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}
