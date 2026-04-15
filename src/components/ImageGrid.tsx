// ── ImageGrid.tsx ──────────────────────────────────────────────────────────────
// 批量模式下显示页面图片的选择网格
import type { PageImage } from '../services/types'
import { useAppStore } from '../stores/appStore'

interface Props {
  images: PageImage[]
}

export function ImageGrid({ images }: Props) {
  const { toggleImageSelection, selectAll, deselectAll } = useAppStore()
  const selectedCount = images.filter((i) => i.selected).length

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-sm space-y-2">
        <div className="text-3xl">🖼️</div>
        <div>未找到可翻译的图片</div>
        <div className="text-xs text-slate-600">当前页面没有足够大的图片（需要 ≥ 48×48）</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Select All / None */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          {selectedCount} / {images.length} 张已选择
        </span>
        <div className="flex gap-2 text-xs">
          <button onClick={selectAll} className="text-violet-400 hover:text-violet-300">
            全选
          </button>
          <span className="text-slate-600">|</span>
          <button onClick={deselectAll} className="text-slate-400 hover:text-slate-300">
            取消
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1">
        {images.map((img) => (
          <button
            key={img.id}
            onClick={() => toggleImageSelection(img.id)}
            className={`relative rounded-lg overflow-hidden border-2 transition-all text-left ${
              img.selected
                ? 'border-violet-500 shadow-md shadow-violet-900/40'
                : 'border-transparent hover:border-slate-600'
            }`}
          >
            {/* Checkbox */}
            <div className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded flex items-center justify-center text-xs font-bold transition-all ${
              img.selected ? 'bg-violet-600 text-white' : 'bg-black/50 text-transparent'
            }`}>
              ✓
            </div>

            {/* Image */}
            <img
              src={img.src}
              alt={img.alt}
              className="w-full h-28 object-cover bg-slate-800"
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />

            {/* Size badge */}
            <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-slate-300 text-[10px] px-1.5 py-0.5 rounded">
              {img.width}×{img.height}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
