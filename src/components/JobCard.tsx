// ── JobCard.tsx ───────────────────────────────────────────────────────────────
import type { TranslationJob } from '../services/types'
import { LANGUAGE_NAMES } from '../services/types'

interface Props { job: TranslationJob }

export function JobCard({ job }: Props) {
  const handleDownload = () => {
    if (!job.resultDataUrl) return
    const a = document.createElement('a')
    a.href = job.resultDataUrl
    a.download = `translated-${job.targetLanguage}-${job.id.slice(0, 8)}.png`
    a.click()
  }

  const targetName = LANGUAGE_NAMES[job.targetLanguage] ?? job.targetLanguage
  const sourceName = job.sourceLanguage === 'auto'
    ? '自动'
    : (LANGUAGE_NAMES[job.sourceLanguage] ?? job.sourceLanguage)

  return (
    <div className="fade-up surface" style={{ padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <span className={`status-dot ${job.status}`} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>
            {sourceName} <span style={{ color: 'var(--amber-500)' }}>→</span> {targetName}
          </span>
          <span style={{ color: 'var(--border-default)', fontSize: 10 }}>·</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {job.model === 'nano-banana-pro' ? 'Pro' : 'Banana 2'}
          </span>
          {job.ocrTexts && job.ocrTexts.length > 0 && (
            <>
              <span style={{ color: 'var(--border-default)', fontSize: 10 }}>·</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                识别 {job.ocrTexts.length} 处文字
              </span>
            </>
          )}
        </div>
        {job.status === 'done' && (
          <button
            onClick={handleDownload}
            style={{
              fontSize: 11,
              color: 'var(--amber-400)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            ↓ 下载
          </button>
        )}
      </div>

      {/* Content */}
      {job.status === 'done' && job.resultDataUrl ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
          {[
            { src: job.imageUrl, label: '原图', labelColor: 'var(--text-muted)' },
            { src: job.resultDataUrl, label: '翻译后', labelColor: 'var(--amber-400)' },
          ].map(({ src, label, labelColor }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: labelColor, marginBottom: 4, fontFamily: 'var(--font-display)', letterSpacing: '0.06em' }}>{label}</div>
              <img
                src={src}
                alt={label}
                style={{
                  width: '100%',
                  height: 120,
                  objectFit: 'cover',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--bg-overlay)',
                  display: 'block',
                }}
              />
            </div>
          ))}
        </div>
      ) : job.status === 'translating' ? (
        <div>
          <div className="shimmer" style={{ height: 120 }} />
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--amber-400)', fontFamily: 'var(--font-display)', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="spinner" style={{ width: 10, height: 10 }} />
            识图 + 翻译中…
          </div>
        </div>
      ) : job.status === 'error' ? (
        <div style={{
          background: 'var(--red-dim)',
          border: '1px solid oklch(0.65 0.22 27 / 0.25)',
          borderRadius: 'var(--r-sm)',
          padding: 'var(--space-2) var(--space-3)',
          fontSize: 11,
          color: 'var(--red-500)',
        }}>
          {job.error ?? '翻译失败，请重试'}
        </div>
      ) : (
        <div className="shimmer" style={{ height: 80 }} />
      )}
    </div>
  )
}

