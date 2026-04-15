// ── SettingsPanel.tsx ─────────────────────────────────────────────────────────
import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { MODELS } from '../services/types'

export function SettingsPanel() {
  const { settings, setSettings, saveSettings } = useAppStore()
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)

  const handleSave = async () => {
    await saveSettings()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-4 space-y-6">
      {/* API Key */}
      <div className="glass p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔑</span>
          <h3 className="font-semibold text-white">1xm.ai Relay API Key</h3>
        </div>
        <p className="text-xs text-slate-400">
          用于调用 Nano Banana 图像生成服务。
          <a href="https://1xm.ai" target="_blank" rel="noreferrer"
            className="text-violet-400 ml-1 hover:underline">获取 API Key →</a>
        </p>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={settings.apiKey}
            onChange={(e) => setSettings({ apiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            {showKey ? '🙈' : '👁️'}
          </button>
        </div>
      </div>

      {/* Default Model */}
      <div className="glass p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h3 className="font-semibold text-white">默认模型</h3>
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
                <div className="text-xs text-slate-400">{m.description} · {m.modelName}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all
          bg-violet-600 hover:bg-violet-500 text-white"
      >
        {saved ? '✅ 已保存' : '保存设置'}
      </button>

      {/* About */}
      <div className="glass p-4 space-y-2 text-xs text-slate-400">
        <div className="font-medium text-slate-300">关于 Image Translator</div>
        <div>支持 Nano Banana 2 (gemini-3.1-flash-image-preview) 和 Nano Banana Pro (gemini-3-pro-image-preview)</div>
        <div>API Key 仅存储在本地，不会上传到任何服务器</div>
      </div>
    </div>
  )
}
