// ── ImageGrid.tsx ─────────────────────────────────────────────────────────────
import type { PageImage } from '../services/types'
import { useAppStore } from '../stores/appStore'

interface Props { images: PageImage[] }

export function ImageGrid({ images }: Props) {
  const { toggleImageSelection, selectAll, deselectAll } = useAppStore()
  const selectedCount = images.filter((i) => i.selected).length

  if (images.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-12) var(--space-6)', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 'var(--space-3)' }}>◻</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '0.06em' }}>未发现可翻译图片</div>
        <div style={{ fontSize: 11, color: 'var(--text-disabled)', marginTop: 6 }}>需要宽高均 ≥ 48px 的图片</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          {selectedCount}/{images.length} 已选
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 11 }}>
          <button onClick={selectAll} style={{ color: 'var(--amber-400)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)' }}>全选</button>
          <span style={{ color: 'var(--border-default)' }}>|</span>
          <button onClick={deselectAll} style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)' }}>取消</button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', maxHeight: 380, overflowY: 'auto', paddingRight: 2 }}>
        {images.map((img) => (
          <button
            key={img.id}
            onClick={() => toggleImageSelection(img.id)}
            style={{
              position: 'relative',
              borderRadius: 'var(--r-sm)',
              overflow: 'hidden',
              border: img.selected ? '2px solid var(--amber-500)' : '2px solid transparent',
              background: 'var(--bg-overlay)',
              cursor: 'pointer',
              padding: 0,
              transition: 'border-color 0.15s ease',
            }}
          >
            {/* Checkbox */}
            <div style={{
              position: 'absolute', top: 6, left: 6, zIndex: 1,
              width: 18, height: 18,
              borderRadius: 4,
              background: img.selected ? 'var(--amber-500)' : 'oklch(0 0 0 / 0.55)',
              border: img.selected ? 'none' : '1px solid oklch(1 0 0 / 0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: 'oklch(0.13 0.008 75)',
              fontWeight: 700,
              transition: 'all 0.15s ease',
            }}>
              {img.selected ? '✓' : ''}
            </div>

            <img
              src={img.src}
              alt={img.alt}
              style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }}
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />

            {/* Size badge */}
            <div style={{
              position: 'absolute', bottom: 4, right: 4,
              background: 'oklch(0 0 0 / 0.6)',
              color: 'var(--text-secondary)',
              fontSize: 9,
              fontFamily: 'var(--font-display)',
              padding: '1px 5px',
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
