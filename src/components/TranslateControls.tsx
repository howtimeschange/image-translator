// ── TranslateControls.tsx ─────────────────────────────────────────────────────
import { useAppStore } from '../stores/appStore'
import { TARGET_LANGUAGES, SOURCE_LANGUAGES, MODELS } from '../services/types'

interface Props {
  onTranslate: () => void
  isTranslating: boolean
  disabled?: boolean
}

// 把 SOURCE_LANGUAGES 按组整理，方便 optgroup
const SRC_GROUPS = [
  { label: '自动', codes: ['auto'] },
  { label: '亚洲', codes: ['zh', 'zh-TW', 'ja', 'ko'] },
  { label: '欧洲', codes: ['en', 'fr', 'de', 'es', 'pt', 'ru'] },
  { label: '中东', codes: ['ar'] },
  { label: '东南亚', codes: ['th', 'vi', 'id', 'ms', 'tl', 'my', 'km', 'lo'] },
]

const TGT_GROUPS = [
  { label: '亚洲', codes: ['zh', 'zh-TW', 'ja', 'ko'] },
  { label: '欧洲', codes: ['en', 'fr', 'de', 'es', 'pt', 'ru'] },
  { label: '中东', codes: ['ar'] },
  { label: '东南亚', codes: ['th', 'vi', 'id', 'ms', 'tl', 'my', 'km', 'lo'] },
]

const byCode = Object.fromEntries(
  [...SOURCE_LANGUAGES].map(l => [l.code, l])
)

function LangSelect({
  value,
  onChange,
  groups,
}: {
  value: string
  onChange: (v: string) => void
  groups: { label: string; codes: string[] }[]
}) {
  return (
    <select
      className="lang-select"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {groups.map(group => (
        <optgroup key={group.label} label={group.label}>
          {group.codes.map(code => {
            const lang = byCode[code]
            if (!lang) return null
            const display = code === 'auto'
              ? '自动检测'
              : `${lang.label}${lang.zhNote ? `（${lang.zhNote}）` : ''}`
            return <option key={code} value={code}>{display}</option>
          })}
        </optgroup>
      ))}
    </select>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="label-xs" style={{ marginBottom: 6 }}>{children}</div>
  )
}

export function TranslateControls({ onTranslate, isTranslating, disabled }: Props) {
  const {
    targetLanguage, setTargetLanguage,
    sourceLanguage, setSourceLanguage,
    selectedModel, setSelectedModel,
  } = useAppStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── 语言选择：左右布局 ── */}
      <div>
        <SectionLabel>翻译方向</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* 源语言 */}
          <LangSelect
            value={sourceLanguage}
            onChange={v => setSourceLanguage(v as any)}
            groups={SRC_GROUPS}
          />

          {/* 箭头 */}
          <span style={{
            fontSize: 14,
            color: 'rgba(255,255,255,0.2)',
            flexShrink: 0,
            lineHeight: 1,
            userSelect: 'none',
          }}>→</span>

          {/* 目标语言 */}
          <LangSelect
            value={targetLanguage}
            onChange={v => setTargetLanguage(v as any)}
            groups={TGT_GROUPS}
          />
        </div>
      </div>

      {/* ── 模型选择 ── */}
      <div>
        <SectionLabel>翻译模型</SectionLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          {MODELS.map(m => {
            const active = selectedModel === m.id
            return (
              <button
                key={m.id}
                onClick={() => setSelectedModel(m.id)}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: 7,
                  border: active
                    ? '1px solid rgba(255,255,255,0.2)'
                    : '1px solid rgba(255,255,255,0.07)',
                  background: active
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(255,255,255,0.025)',
                  color: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)',
                  fontSize: 11,
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.01em' }}>{m.name}</div>
                <div style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.2)', marginTop: 2 }}>
                  {m.description}
                </div>
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
          gap: 7,
          padding: '9px 16px',
          borderRadius: 8,
          border: disabled || isTranslating
            ? '1px solid rgba(255,255,255,0.07)'
            : '1px solid rgba(255,255,255,0.14)',
          background: disabled || isTranslating
            ? 'rgba(255,255,255,0.03)'
            : 'rgba(255,255,255,0.08)',
          color: disabled || isTranslating ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.03em',
          cursor: disabled || isTranslating ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => {
          if (!disabled && !isTranslating) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.11)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
          }
        }}
        onMouseLeave={e => {
          if (!disabled && !isTranslating) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'
          }
        }}
      >
        {isTranslating ? (
          <>
            <span className="spinner" />
            识图 + 翻译中…
          </>
        ) : (
          <>
            <span style={{ opacity: 0.6 }}>⟲</span>
            开始翻译
          </>
        )}
      </button>
    </div>
  )
}
