// ── SettingsPanel.tsx ─────────────────────────────────────────────────────────
import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { MODELS } from '../services/types'

interface KeyFieldProps {
  label: string
  hint: string
  model: string
  value: string
  onChange: (v: string) => void
}

function KeyField({ label, hint, model, value, onChange }: KeyFieldProps) {
  const [show, setShow] = useState(false)
  const hasKey = value.trim().length > 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-white">{label}</span>
          <span className="ml-2 text-[10px] text-slate-500 font-mono">{model}</span>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${hasKey ? 'bg-emerald-900/60 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
          {hasKey ? '已配置' : '未配置'}
        </span>
      </div>
      <p className="text-xs text-slate-500">{hint}</p>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-..."
          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors"
        />
        <button
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-base"
        >
          {show ? '🙈' : '👁️'}
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
    <div className="p-4 space-y-5">
      {/* API Keys */}
      <div className="glass p-4 space-y-5">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔑</span>
          <div>
            <h3 className="font-semibold text-white">API Keys</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              1xm.ai 平台不同模型对应不同 Key。
              <a href="https://1xm.ai" target="_blank" rel="noreferrer"
                className="text-violet-400 ml-1 hover:underline">获取 Key →</a>
            </p>
          </div>
        </div>

        <div className="h-px bg-slate-700" />

        <KeyField
          label="Vision 识图"
          hint="用于 Step 1 分析原图文字内容和排版，非必填（空则跳过分析直接翻译）"
          model="gemini-3-flash-preview"
          value={settings.visionApiKey}
          onChange={(v) => setSettings({ visionApiKey: v })}
        />

        <div className="h-px bg-slate-700/50" />

        <KeyField
          label="Nano Banana 2"
          hint="用于快速图片翻译生成"
          model="gemini-3.1-flash-image-preview"
          value={settings.banana2ApiKey}
          onChange={(v) => setSettings({ banana2ApiKey: v })}
        />

        <div className="h-px bg-slate-700/50" />

        <KeyField
          label="Nano Banana Pro"
          hint="用于高质量图片翻译生成（选填，仅在选择 Pro 模型时需要）"
          model="gemini-3-pro-image-preview"
          value={settings.bananaProApiKey}
          onChange={(v) => setSettings({ bananaProApiKey: v })}
        />
      </div>

      {/* Default Model */}
      <div className="glass p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <h3 className="font-semibold text-white">默认生图模型</h3>
        </div>
        <div className="space-y-2">
          {MODELS.map((m) => (
            <label key={m.id} className="flex items-start gap-3 cursor-pointer group">
              <input
                type="radio"
                name="defaultModel"
                value={m.id}
                checked={settings.defaultModel === m.id}
                onChange={() => setSettings({ defaultModel: m.id })}
                className="mt-1 accent-violet-500"
              />
              <div>
                <div className="text-sm font-medium text-white group-hover:text-violet-300 transition-colors">
                  {m.name}
                </div>
                <div className="text-xs text-slate-400">{m.description} · <span className="font-mono">{m.modelName}</span></div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all bg-violet-600 hover:bg-violet-500 text-white"
      >
        {saved ? '✅ 已保存' : '保存设置'}
      </button>

      {/* About */}
      <div className="glass p-4 text-xs text-slate-400 space-y-1">
        <div className="font-medium text-slate-300">说明</div>
        <div>· Vision Key 为可选项，填写后翻译质量更高（先识图再翻译）</div>
        <div>· 所有 Key 仅存储在本地，不会上传任何服务器</div>
      </div>
    </div>
  )
}
