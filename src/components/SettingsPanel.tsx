// ── SettingsPanel.tsx ─────────────────────────────────────────────────────────
import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { MODELS } from '../services/types'

interface KeyFieldProps {
  label: string
  sublabel: string
  hint: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}

function KeyField({ label, sublabel, hint, value, onChange, required }: KeyFieldProps) {
  const [show, setShow] = useState(false)
  const hasKey = value.trim().length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
          {required && <span style={{ fontSize: 10, color: 'var(--amber-500)', marginLeft: 4 }}>必填</span>}
        </div>
        <span style={{
          fontSize: 10,
          fontFamily: 'var(--font-display)',
          letterSpacing: '0.04em',
          padding: '1px 7px',
          borderRadius: 12,
          background: hasKey ? 'var(--green-dim)' : 'var(--bg-overlay)',
          color: hasKey ? 'var(--green-500)' : 'var(--text-disabled)',
          border: hasKey ? '1px solid oklch(0.72 0.17 145 / 0.2)' : '1px solid var(--border-subtle)',
        }}>
          {hasKey ? '已配置' : '未配置'}
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.03em' }}>{sublabel}</div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{hint}</p>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-..."
          style={{
            width: '100%',
            background: 'var(--bg-overlay)',
            border: hasKey ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)',
            padding: '7px 36px 7px 10px',
            fontSize: 12,
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.04em',
            color: 'var(--text-primary)',
            outline: 'none',
            transition: 'border-color 0.15s ease',
          }}
        />
        <button
          onClick={() => setShow(!show)}
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'var(--text-muted)',
          }}
        >
          {show ? '●' : '○'}
        </button>
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const { settings, setSettings, saveSettings } = useAppStore()
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    await saveSettings()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* API Keys section */}
      <div className="surface" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            API Keys
          </div>
          <a
            href="https://1xm.ai"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, color: 'var(--amber-400)', textDecoration: 'none' }}
          >
            获取 Key →
          </a>
        </div>
        <div style={{ height: 1, background: 'var(--border-subtle)' }} />

        <KeyField
          label="Vision 识图"
          sublabel="gemini-3-flash-preview"
          hint="分析原图文字排版，提升翻译精度（可选，空则跳过分析步骤）"
          value={settings.visionApiKey}
          onChange={(v) => setSettings({ visionApiKey: v })}
        />

        <div style={{ height: 1, background: 'var(--border-subtle)', opacity: 0.5 }} />

        <KeyField
          label="Nano Banana 2"
          sublabel="gemini-3.1-flash-image-preview"
          hint="快速图片翻译，日常使用推荐"
          value={settings.banana2ApiKey}
          onChange={(v) => setSettings({ banana2ApiKey: v })}
          required
        />

        <div style={{ height: 1, background: 'var(--border-subtle)', opacity: 0.5 }} />

        <KeyField
          label="Nano Banana Pro"
          sublabel="gemini-3-pro-image-preview"
          hint="高质量翻译（选用 Pro 模型时填写）"
          value={settings.bananaProApiKey}
          onChange={(v) => setSettings({ bananaProApiKey: v })}
        />
      </div>

      {/* Default model */}
      <div className="surface" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          默认模型
        </div>
        {MODELS.map((m) => (
          <label
            key={m.id}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', cursor: 'pointer' }}
          >
            <div
              style={{
                marginTop: 2,
                width: 14, height: 14,
                borderRadius: '50%',
                border: settings.defaultModel === m.id ? '4px solid var(--amber-500)' : '2px solid var(--border-default)',
                flexShrink: 0,
                transition: 'all 0.15s ease',
                background: settings.defaultModel === m.id ? 'var(--bg-base)' : 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => setSettings({ defaultModel: m.id })}
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: settings.defaultModel === m.id ? 'var(--amber-400)' : 'var(--text-primary)' }}>
                {m.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', letterSpacing: '0.03em', marginTop: 1 }}>
                {m.description} · {m.modelName}
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        style={{
          padding: '10px',
          borderRadius: 'var(--r-md)',
          border: saved ? '1px solid oklch(0.72 0.17 145 / 0.4)' : '1px solid var(--amber-600)',
          background: saved ? 'var(--green-dim)' : 'oklch(0.78 0.16 75 / 0.15)',
          color: saved ? 'var(--green-500)' : 'var(--amber-400)',
          fontSize: 13,
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          letterSpacing: '0.05em',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        {saved ? '✓ 已保存' : '保存设置'}
      </button>

      <div style={{ fontSize: 10, color: 'var(--text-disabled)', lineHeight: 1.6, fontFamily: 'var(--font-display)', letterSpacing: '0.03em' }}>
        所有 Key 仅存储在本地 chrome.storage.local，不会上传任何服务器
      </div>
    </div>
  )
}
