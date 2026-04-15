// ── ImageGrid.tsx ─────────────────────────────────────────────────────────────
import type { PageImage } from '../services/types'
import { useAppStore } from '../stores/appStore'

interface Props { images: PageImage[] }

export function ImageGrid({ images }: Props) {
  const { toggleImageSelection, selectAll, deselectAll } = useAppStore()
  const selectedCount = images.filter((i) => i.selected).length

  if (images.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 16px', color: 'rgba(255,255,255,0.2)' }}>
        <div style={{ fontSize: 24, marginBottom: 10, opacity: 0.4 }}>◻</div>
        <div style={{ fontSize: 12 }}>未发现可翻译图片</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', marginTop: 4 }}>需要宽高均 ≥ 48px 的图片</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>
          {selectedCount}/{images.length} 已选
        </span>
        <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
          <button
            onClick={selectAll}
            style={{ color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.75)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
          >
            全选
          </button>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>|</span>
          <button
            onClick={deselectAll}
            style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
          >
            取消
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 6,
        maxHeight: 360,
        overflowY: 'auto',
      }}>
        {images.map((img) => (
          <button
            key={img.id}
            onClick={() => toggleImageSelection(img.id)}
            style={{
              position: 'relative',
              borderRadius: 6,
              overflow: 'hidden',
              border: img.selected
                ? '1px solid rgba(255,255,255,0.4)'
                : '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.03)',
              cursor: 'pointer',
              padding: 0,
              transition: 'border-color 0.15s',
            }}
          >
            {/* Checkbox */}
            <div style={{
              position: 'absolute', top: 5, left: 5, zIndex: 1,
              width: 16, height: 16,
              borderRadius: 3,
              background: img.selected ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.5)',
              border: img.selected ? 'none' : '1px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: '#0c0c0e',
              fontWeight: 700,
              transition: 'all 0.15s',
            }}>
              {img.selected ? '✓' : ''}
            </div>

            <img
              src={img.src}
              alt={img.alt}
              style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }}
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />

            {/* Size badge */}
            <div style={{
              position: 'absolute', bottom: 4, right: 4,
              background: 'rgba(0,0,0,0.6)',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 9,
              padding: '1px 4px',
              borderRadius: 3,
            }}>
              {img.width}×{img.height}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
