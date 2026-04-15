// ── JobCard.tsx ───────────────────────────────────────────────────────────────
// 显示单个翻译任务结果
import type { TranslationJob } from '../services/types'
import { LANGUAGE_NAMES } from '../services/types'

interface Props {
  job: TranslationJob
}

export function JobCard({ job }: Props) {
  const handleDownload = () => {
    if (!job.resultDataUrl) return
    const a = document.createElement('a')
    a.href = job.resultDataUrl
    a.download = `translated-${job.targetLanguage}-${job.id.slice(0, 8)}.png`
    a.click()
  }

  const langName = LANGUAGE_NAMES[job.targetLanguage] ?? job.targetLanguage

  return (
    <div className="glass p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className={`w-2 h-2 rounded-full ${
            job.status === 'done' ? 'bg-emerald-400' :
            job.status === 'error' ? 'bg-red-400' :
            'bg-amber-400 animate-pulse'
          }`} />
          <span>{langName}</span>
          <span>·</span>
          <span>{job.model === 'nano-banana-pro' ? '⚡ Pro' : '🍌 Banana 2'}</span>
        </div>
        {job.status === 'done' && (
          <button
            onClick={handleDownload}
            className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
          >
            ↓ 下载
          </button>
        )}
      </div>

      {/* Image comparison */}
      {job.status === 'done' && job.resultDataUrl ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="text-xs text-slate-500 text-center">原图</div>
              <img
                src={job.imageUrl}
                alt="原图"
                className="w-full rounded-lg object-contain max-h-40 bg-slate-900"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-emerald-400 text-center">翻译后</div>
              <img
                src={job.resultDataUrl}
                alt="翻译后"
                className="w-full rounded-lg object-contain max-h-40 bg-slate-900"
              />
            </div>
          </div>
          {/* Full result preview */}
          <div className="text-xs text-slate-400 text-center">点击右键可保存翻译后图片</div>
        </div>
      ) : job.status === 'translating' ? (
        <div className="space-y-2">
          <div className="shimmer h-32 rounded-lg" />
          <div className="text-xs text-amber-400 text-center animate-pulse">正在翻译，请稍候...</div>
        </div>
      ) : job.status === 'error' ? (
        <div className="bg-red-950/50 border border-red-800 rounded-lg p-3 text-xs text-red-300">
          ❌ {job.error ?? '翻译失败，请重试'}
        </div>
      ) : (
        <div className="shimmer h-20 rounded-lg" />
      )}
    </div>
  )
}
