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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{label}</span>
          {required && <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>必填</span>}
        </div>
        <span style={{
          fontSize: 9,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          padding: '1px 6px',
          borderRadius: 10,
          background: hasKey ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)',
          color: hasKey ? 'rgba(74,222,128,0.7)' : 'rgba(255,255,255,0.2)',
          border: hasKey ? '1px solid rgba(74,222,128,0.15)' : '1px solid rgba(255,255,255,0.06)',
        }}>
          {hasKey ? '已配置' : '未配置'}
        </span>
      </div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.03em', fontFamily: '"SF Mono", monospace' }}>{sublabel}</div>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', lineHeight: 1.5, margin: 0 }}>{hint}</p>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-..."
          className="settings-input"
          style={{ paddingRight: 32 }}
        />
        <button
          onClick={() => setShow(!show)}
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, color: 'rgba(255,255,255,0.25)',
            lineHeight: 1, padding: 0,
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
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── 品牌保护总开关（最重要，放最上面）── */}
      <div style={{
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setSettings({ preserveBrand: !settings.preserveBrand })}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            background: settings.preserveBrand ? 'rgba(255,255,255,0.04)' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: 3 }}>
              保留品牌与商标文本
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
              Logo、品牌名、SKU、产品型号保持原文，<br />只翻译功能说明与促销文案
            </div>
          </div>
          {/* Toggle switch */}
          <div style={{
            width: 36, height: 20,
            borderRadius: 10,
            background: settings.preserveBrand ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.15)',
            position: 'relative',
            flexShrink: 0,
            marginLeft: 12,
            transition: 'background 0.2s',
          }}>
            <div style={{
              position: 'absolute',
              top: 2, left: settings.preserveBrand ? 18 : 2,
              width: 14, height: 14,
              borderRadius: '50%',
              background: settings.preserveBrand ? '#0c0c0e' : 'rgba(255,255,255,0.35)',
              transition: 'left 0.2s',
            }} />
          </div>
        </button>

        {/* 保留规则说明 */}
        {settings.preserveBrand && (
          <div style={{
            padding: '8px 14px 10px',
            background: 'rgba(255,255,255,0.02)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div className="label-xs" style={{ marginBottom: 6 }}>默认保留的元素</div>
            {[
              ['Logo & 品牌名', 'Nike、Apple、Samsung 等品牌 wordmark'],
              ['产品名 & 型号', 'iPhone 15 Pro、Air Max 270、SKU 编号'],
              ['商标 & 认证', '® ™ 及 CE/FDA/ISO 标志'],
              ['社交 & 链接', '@handle、#tag、URL、域名'],
            ].map(([label, desc]) => (
              <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 80, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', lineHeight: 1.4 }}>{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="label-xs">API Keys</div>
          <a href="https://1xm.ai" target="_blank" rel="noreferrer"
            style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            获取 Key →
          </a>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <KeyField
            label="Vision"
            sublabel="gemini-3-flash-preview"
            hint="分析图中所有文字排版，提升翻译精度（可选，空则跳过）"
            value={settings.visionApiKey}
            onChange={v => setSettings({ visionApiKey: v })}
          />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
          <KeyField
            label="Nano Banana 2"
            sublabel="gemini-3.1-flash-image-preview"
            hint="快速图片翻译，日常首选"
            value={settings.banana2ApiKey}
            onChange={v => setSettings({ banana2ApiKey: v })}
            required
          />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
          <KeyField
            label="Nano Banana Pro"
            sublabel="gemini-3-pro-image-preview"
            hint="高质量翻译，选用 Pro 模型时填写"
            value={settings.bananaProApiKey}
            onChange={v => setSettings({ bananaProApiKey: v })}
          />
        </div>
      </div>

      {/* Default model */}
      <div>
        <div className="label-xs" style={{ marginBottom: 8 }}>默认模型</div>
        {MODELS.map(m => (
          <label
            key={m.id}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 8 }}
          >
            <div
              onClick={() => setSettings({ defaultModel: m.id })}
              style={{
                marginTop: 2, flexShrink: 0,
                width: 13, height: 13, borderRadius: '50%',
                border: settings.defaultModel === m.id
                  ? '4px solid rgba(255,255,255,0.7)'
                  : '1px solid rgba(255,255,255,0.2)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            />
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: settings.defaultModel === m.id ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)' }}>
                {m.name}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: '"SF Mono", monospace', marginTop: 1 }}>
                {m.modelName}
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        style={{
          padding: '9px',
          borderRadius: 8,
          border: saved ? '1px solid rgba(74,222,128,0.2)' : '1px solid rgba(255,255,255,0.12)',
          background: saved ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.06)',
          color: saved ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.65)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s',
          letterSpacing: '0.02em',
        }}
      >
        {saved ? '✓ 已保存' : '保存设置'}
      </button>

      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', lineHeight: 1.6, margin: 0 }}>
        所有 Key 仅存储在本地 chrome.storage.local，不会上传任何服务器
      </p>
    </div>
  )
}
