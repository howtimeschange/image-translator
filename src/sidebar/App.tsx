// ── sidebar/App.tsx ───────────────────────────────────────────────────────────
import { useEffect, useCallback, useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { SettingsPanel } from '../components/SettingsPanel'
import { TranslateControls } from '../components/TranslateControls'
import { JobCard } from '../components/JobCard'
import { ImageGrid } from '../components/ImageGrid'
import type { TranslationJob } from '../services/types'

type Tab = 'single' | 'batch' | 'history' | 'settings'

const TAB_CONFIG: { id: Tab; label: string; shortLabel: string }[] = [
  { id: 'single',   label: '单图',   shortLabel: '01' },
  { id: 'batch',    label: '批量',   shortLabel: '02' },
  { id: 'history',  label: '结果',   shortLabel: '03' },
  { id: 'settings', label: '设置',   shortLabel: '04' },
]

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
  }, [singleImage, settings, targetLanguage, selectedModel])

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
        if (resp?.error) updateJob(jobId, { status: 'error', error: resp.error })
        else updateJob(jobId, { status: 'done', resultDataUrl: resp?.resultDataUrl })
      }).catch((e: any) => {
        updateJob(jobId, { status: 'error', error: e?.message ?? '翻译失败' })
      })
    }
  }, [pageImages, settings, targetLanguage, selectedModel])

  // ── Tab handler ───────────────────────────────────────────────────────────────

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    if (tab === 'batch' && pageImages.length === 0) scanImages()
  }

  const noApiKey = !settings.banana2ApiKey && !settings.bananaProApiKey

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Logo mark */}
          <div style={{
            width: 28, height: 28,
            borderRadius: 7,
            background: 'oklch(0.78 0.16 75 / 0.15)',
            border: '1px solid var(--border-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14,
            flexShrink: 0,
          }}>
            ⟲
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
              IMG<span style={{ color: 'var(--amber-400)' }}>TRANSLATE</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.1em' }}>
              NANO BANANA
            </div>
          </div>
        </div>

        {/* Jobs running badge */}
        {jobs.filter(j => j.status === 'translating').length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 8px',
            borderRadius: 12,
            background: 'oklch(0.78 0.16 75 / 0.12)',
            border: '1px solid var(--border-accent)',
            fontSize: 10,
            fontFamily: 'var(--font-display)',
            color: 'var(--amber-400)',
            letterSpacing: '0.04em',
          }}>
            <span className="spinner" style={{ width: 8, height: 8 }} />
            {jobs.filter(j => j.status === 'translating').length} 进行中
          </div>
        )}
      </div>

      {/* ── No API Key warning ── */}
      {noApiKey && activeTab !== 'settings' && (
        <div style={{
          margin: 'var(--space-3) var(--space-4) 0',
          padding: 'var(--space-2) var(--space-3)',
          background: 'oklch(0.78 0.16 75 / 0.08)',
          border: '1px solid var(--border-accent)',
          borderRadius: 'var(--r-sm)',
          fontSize: 11,
          color: 'var(--amber-400)',
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.03em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>未配置 API Key</span>
          <button
            onClick={() => setActiveTab('settings')}
            style={{ color: 'var(--amber-300)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-display)', textDecoration: 'underline' }}
          >
            前往设置
          </button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        {TAB_CONFIG.map((tab) => {
          const active = activeTab === tab.id
          const pending = tab.id === 'history' && jobs.length > 0
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={{
                flex: 1,
                padding: 'var(--space-2) 0',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                borderBottom: active ? '2px solid var(--amber-500)' : '2px solid transparent',
                marginBottom: -1,
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 9,
                letterSpacing: '0.12em',
                color: active ? 'var(--amber-500)' : 'var(--text-disabled)',
              }}>
                {tab.shortLabel}
              </div>
              <div style={{
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                {tab.label}
                {pending && tab.id === 'history' && (
                  <span style={{
                    width: 14, height: 14,
                    borderRadius: '50%',
                    background: 'var(--amber-500)',
                    color: 'var(--bg-base)',
                    fontSize: 9,
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {jobs.length}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

        {/* ── Single image mode ── */}
        {activeTab === 'single' && (
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {singleImage ? (
              <>
                {/* Image preview */}
                <div className="surface fade-up" style={{ padding: 'var(--space-3)' }}>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
                    待翻译图片
                  </div>
                  <img
                    src={singleImage.url}
                    alt=""
                    style={{
                      width: '100%',
                      maxHeight: 200,
                      objectFit: 'contain',
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--bg-overlay)',
                      display: 'block',
                    }}
                  />
                  <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-disabled)', fontFamily: 'var(--font-display)', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {singleImage.url}
                  </div>
                </div>

                <TranslateControls
                  onTranslate={translateSingle}
                  isTranslating={isTranslatingSingle}
                  disabled={noApiKey}
                />

                {/* Result */}
                {singleResult && (
                  <div className="surface fade-up" style={{ padding: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-display)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green-500)' }}>
                        翻译完成
                      </div>
                      <a
                        href={singleResult}
                        download="translated.png"
                        style={{ fontSize: 11, color: 'var(--amber-400)', textDecoration: 'none', fontFamily: 'var(--font-display)' }}
                      >
                        ↓ 下载
                      </a>
                    </div>
                    <img
                      src={singleResult}
                      alt="翻译结果"
                      style={{
                        width: '100%',
                        maxHeight: 200,
                        objectFit: 'contain',
                        borderRadius: 'var(--r-sm)',
                        background: 'var(--bg-overlay)',
                        display: 'block',
                      }}
                    />
                  </div>
                )}

                {/* Error */}
                {singleError && (
                  <div style={{
                    background: 'var(--red-dim)',
                    border: '1px solid oklch(0.65 0.22 27 / 0.25)',
                    borderRadius: 'var(--r-sm)',
                    padding: 'var(--space-3)',
                    fontSize: 12,
                    color: 'var(--red-500)',
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
                justifyContent: 'center', padding: 'var(--space-12) var(--space-4)',
                gap: 'var(--space-4)', textAlign: 'center',
              }}>
                <div style={{
                  width: 56, height: 56,
                  borderRadius: 'var(--r-lg)',
                  background: 'var(--bg-raised)',
                  border: '1px dashed var(--border-default)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                }}>
                  ⟲
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-primary)', marginBottom: 6 }}>
                    右键点击网页图片
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    选择「翻译此图片」触发<br />或切到批量模式扫描全页
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Batch mode ── */}
        {activeTab === 'batch' && (
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                页面图片
              </div>
              <button
                onClick={scanImages}
                disabled={isScanningImages}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, color: 'var(--amber-400)',
                  background: 'none', border: 'none', cursor: isScanningImages ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-display)', letterSpacing: '0.04em',
                }}
              >
                {isScanningImages ? <span className="spinner" style={{ width: 10, height: 10 }} /> : '↺'}
                重新扫描
              </button>
            </div>

            {isScanningImages ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                {[1,2,3,4].map(i => <div key={i} className="shimmer" style={{ height: 100 }} />)}
              </div>
            ) : (
              <ImageGrid images={pageImages} />
            )}

            {pageImages.filter(i => i.selected).length > 0 && (
              <div className="surface" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', position: 'sticky', bottom: 0 }}>
                <TranslateControls
                  onTranslate={translateBatch}
                  isTranslating={false}
                  disabled={noApiKey}
                />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}>
                  翻译 {pageImages.filter(i => i.selected).length} 张图片 → 「结果」标签查看
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── History / Results ── */}
        {activeTab === 'history' && (
          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {jobs.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={clearJobs}
                  style={{ fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', letterSpacing: '0.04em' }}
                >
                  清空全部
                </button>
              </div>
            )}
            {jobs.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: 'var(--space-12) var(--space-4)',
                gap: 'var(--space-3)', textAlign: 'center',
              }}>
                <div style={{ fontSize: 28, color: 'var(--text-disabled)' }}>◫</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                  暂无翻译记录
                </div>
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
