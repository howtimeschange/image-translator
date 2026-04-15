// ── TranslateControls.tsx ─────────────────────────────────────────────────────
// 语言选择 + 模型选择 + 翻译按钮
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
    <div className="space-y-3">
      {/* Language */}
      <div>
        <label className="text-xs text-slate-400 mb-1.5 block">目标语言</label>
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setTargetLanguage(lang.code)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                targetLanguage === lang.code
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* Model */}
      <div>
        <label className="text-xs text-slate-400 mb-1.5 block">翻译模型</label>
        <div className="flex gap-2">
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedModel(m.id)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all border ${
                selectedModel === m.id
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {/* Translate Button */}
      <button
        onClick={onTranslate}
        disabled={disabled || isTranslating}
        className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
          disabled || isTranslating
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-900/30'
        }`}
      >
        {isTranslating ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            翻译中...
          </span>
        ) : (
          '🌐 开始翻译'
        )}
      </button>
    </div>
  )
}
