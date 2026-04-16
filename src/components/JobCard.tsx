// ── JobCard.tsx ───────────────────────────────────────────────────────────────
import { useState } from 'react'
import type { TranslationJob } from '../services/types'
import { LANGUAGE_NAMES } from '../services/types'
import { ImageLightbox } from './ImageLightbox'

interface Props {
  job: TranslationJob
  onRetry?: (jobId: string) => void
}

export function JobCard({ job, onRetry }: Props) {
  const [lightbox, setLightbox] = useState<{ src: string; label: string; name?: string } | null>(null)
  const [retrying, setRetrying] = useState(false)

  const handleDownload = () => {
    if (!job.resultDataUrl) return
    const a = document.createElement('a')
    a.href = job.resultDataUrl
    a.download = `translated-${job.targetLanguage}-${job.id.slice(0, 8)}.png`
    a.click()
  }

  const handleRetry = async () => {
    if (!onRetry || retrying) return
    setRetrying(true)
    await onRetry(job.id)
    setRetrying(false)
  }

  const targetName = LANGUAGE_NAMES[job.targetLanguage] ?? job.targetLanguage
  const sourceName = job.sourceLanguage === 'auto'
    ? '自动'
    : (LANGUAGE_NAMES[job.sourceLanguage] ?? job.sourceLanguage)

  return (
    <>
      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          label={lightbox.label}
          downloadName={lightbox.name}
          onClose={() => setLightbox(null)}
        />
      )}

      <div className="fade-up" style={{
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '12px 0',
      }}>
        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`status-dot ${job.status}`} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              {sourceName}
              <span style={{ margin: '0 4px', opacity: 0.4 }}>→</span>
              {targetName}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.14)', fontSize: 10 }}>·</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
              {job.model === 'nano-banana-pro' ? 'Pro' : 'Banana 2'}
            </span>
            {job.ocrTexts && job.ocrTexts.length > 0 && (
              <>
                <span style={{ color: 'rgba(255,255,255,0.14)', fontSize: 10 }}>·</span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
                  {job.preserveBrand && job.keepCount ? `保留 ${job.keepCount}` : ''}
                  {job.preserveBrand && job.keepCount && job.translateCount ? ' / ' : ''}
                  {job.translateCount ? `翻译 ${job.translateCount}` : `${job.ocrTexts.length} 处`}
                </span>
              </>
            )}
          </div>
          {job.status === 'done' && (
            <button
              onClick={handleDownload}
              style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.35)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                letterSpacing: '0.04em',
                padding: '2px 6px',
                borderRadius: 4,
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
            >
              ↓ 下载
            </button>
          )}
        </div>

        {/* Content */}
        {job.status === 'done' && job.resultDataUrl ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { src: job.imageUrl, label: '原图', name: undefined },
              { src: job.resultDataUrl, label: '翻译后', name: `translated-${job.targetLanguage}-${job.id.slice(0, 8)}.png` },
            ].map(({ src, label, name }) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
                <div
                  onClick={() => setLightbox({ src, label, name })}
                  style={{ position: 'relative', cursor: 'zoom-in' }}
                >
                  <img
                    src={src}
                    alt={label}
                    style={{
                      width: '100%',
                      height: 110,
                      objectFit: 'cover',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.04)',
                      display: 'block',
                      border: '1px solid rgba(255,255,255,0.06)',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                  />
                  <div style={{
                    position: 'absolute', inset: 0,
                    borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0,
                    background: 'rgba(0,0,0,0.4)',
                    fontSize: 18,
                    transition: 'opacity 0.15s',
                  }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                  >
                    🔍
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : job.status === 'translating' ? (
          <div>
            <div className="shimmer" style={{ height: 100 }} />
            <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="spinner" style={{ width: 10, height: 10 }} />
              识图 + 翻译中…
            </div>
          </div>
        ) : job.status === 'error' ? (
          <div style={{
            background: 'rgba(248,113,113,0.06)',
            border: '1px solid rgba(248,113,113,0.15)',
            borderRadius: 6,
            padding: '8px 10px',
          }}>
            <div style={{ fontSize: 11, color: 'rgba(248,113,113,0.8)', lineHeight: 1.5, marginBottom: onRetry ? 8 : 0 }}>
              {job.error ?? '翻译失败，请重试'}
            </div>
            {onRetry && (
              <button
                onClick={handleRetry}
                disabled={retrying}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  color: retrying ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 5,
                  padding: '4px 10px',
                  cursor: retrying ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!retrying) e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
              >
                {retrying
                  ? <><span className="spinner" style={{ width: 9, height: 9 }} /> 重试中…</>
                  : '↻ 重试'}
              </button>
            )}
          </div>
        ) : (
          <div className="shimmer" style={{ height: 70 }} />
        )}
      </div>
    </>
  )
}

