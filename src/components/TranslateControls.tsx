// ── TranslateControls.tsx ─────────────────────────────────────────────────────
import { useAppStore } from '../stores/appStore'
import { LANGUAGES, MODELS } from '../services/types'

interface Props {
  onTranslate: () => void
  isTranslating: boolean
  disabled?: boolean
}

export function TranslateControls({ onTranslate, isTranslating, disabled }: Props) {
  const { targetLanguage, setTargetLanguage, selectedModel, setSelectedModel } = useAppStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Target Language */}
      <div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
          目标语言
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {LANGUAGES.map((lang) => {
            const active = targetLanguage === lang.code
            return (
              <button
                key={lang.code}
                onClick={() => setTargetLanguage(lang.code)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 'var(--r-sm)',
                  border: active ? '1px solid var(--amber-600)' : '1px solid var(--border-subtle)',
                  background: active ? 'oklch(0.78 0.16 75 / 0.15)' : 'transparent',
                  color: active ? 'var(--amber-400)' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontFamily: 'var(--font-body)',
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  lineHeight: 1.8,
                  whiteSpace: 'nowrap',
                }}
              >
                {lang.label}
                {lang.zhNote && (
                  <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 3 }}>
                    {lang.zhNote}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Model */}
      <div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-display)', letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
          翻译模型
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
          {MODELS.map((m) => {
            const active = selectedModel === m.id
            return (
              <button
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--r-sm)',
                  border: active ? '1px solid var(--amber-600)' : '1px solid var(--border-subtle)',
                  background: active ? 'oklch(0.78 0.16 75 / 0.12)' : 'var(--bg-raised)',
                  color: active ? 'var(--amber-400)' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 11 }}>{m.name}</div>
                <div style={{ fontSize: 10, color: active ? 'oklch(0.84 0.18 75 / 0.7)' : 'var(--text-muted)', marginTop: 1 }}>{m.description}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Translate Button */}
      <button
        onClick={onTranslate}
        disabled={disabled || isTranslating}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px var(--space-4)',
          borderRadius: 'var(--r-md)',
          border: disabled || isTranslating ? '1px solid var(--border-subtle)' : '1px solid var(--amber-600)',
          background: disabled || isTranslating
            ? 'var(--bg-raised)'
            : 'oklch(0.78 0.16 75 / 0.18)',
          color: disabled || isTranslating ? 'var(--text-disabled)' : 'var(--amber-400)',
          fontSize: 13,
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          letterSpacing: '0.04em',
          cursor: disabled || isTranslating ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        {isTranslating ? (
          <>
            <span className="spinner" />
            翻译中…
          </>
        ) : (
          <>
            <span style={{ fontSize: 14 }}>⟲</span>
            开始翻译
          </>
        )}
      </button>
    </div>
  )
}
