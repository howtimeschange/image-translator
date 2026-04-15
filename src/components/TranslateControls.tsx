// ── TranslateControls.tsx ─────────────────────────────────────────────────────
import { useAppStore } from '../stores/appStore'
import { TARGET_LANGUAGES, SOURCE_LANGUAGES, MODELS } from '../services/types'

interface Props {
  onTranslate: () => void
  isTranslating: boolean
  disabled?: boolean
}

/** 语言按钮组件（复用于源/目标） */
function LangButton({
  code, label, zhNote, active, onClick
}: { code: string; label: string; zhNote?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 9px',
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
        display: 'flex',
        alignItems: 'baseline',
        gap: 3,
      }}
    >
      <span>{label}</span>
      {zhNote && (
        <span style={{ fontSize: 9, opacity: active ? 0.75 : 0.55 }}>{zhNote}</span>
      )}
    </button>
  )
}

/** 区块标签 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontFamily: 'var(--font-display)', letterSpacing: '0.09em',
      color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-2)',
    }}>
      {children}
    </div>
  )
}

export function TranslateControls({ onTranslate, isTranslating, disabled }: Props) {
  const {
    targetLanguage, setTargetLanguage,
    sourceLanguage, setSourceLanguage,
    selectedModel, setSelectedModel,
  } = useAppStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

      {/* ── 源语言 ── */}
      <div>
        <SectionLabel>原图语言</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {SOURCE_LANGUAGES.map((lang) => (
            <LangButton
              key={lang.code}
              code={lang.code}
              label={lang.code === 'auto' ? '自动检测' : lang.label}
              zhNote={lang.code === 'auto' ? undefined : lang.zhNote}
              active={sourceLanguage === lang.code}
              onClick={() => setSourceLanguage(lang.code)}
            />
          ))}
        </div>
      </div>

      {/* Arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        <span style={{ fontSize: 14, color: 'var(--amber-500)', lineHeight: 1 }}>↓</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>

      {/* ── 目标语言 ── */}
      <div>
        <SectionLabel>翻译为</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {TARGET_LANGUAGES.map((lang) => (
            <LangButton
              key={lang.code}
              code={lang.code}
              label={lang.label}
              zhNote={lang.zhNote}
              active={targetLanguage === lang.code}
              onClick={() => setTargetLanguage(lang.code)}
            />
          ))}
        </div>
      </div>

      {/* ── 模型选择 ── */}
      <div>
        <SectionLabel>翻译模型</SectionLabel>
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

      {/* ── 翻译按钮 ── */}
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
            识图 + 翻译中…
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
