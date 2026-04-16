// ── ImageGrid.tsx ─────────────────────────────────────────────────────────────
import type { PageImage } from '../services/types'
import { useAppStore } from '../stores/appStore'

interface Props {
  images: PageImage[]
  onRemovePin?: (id: string) => void
}

// ── 来源标签 ──────────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source?: string }) {
  if (source === 'pin') {
    return (
      <div style={{
        position: 'absolute', top: 5, right: 5, zIndex: 2,
        background: 'rgba(251,191,36,0.88)',
        color: '#000',
        fontSize: 8,
        fontWeight: 700,
        padding: '1px 5px',
        borderRadius: 4,
        letterSpacing: '0.04em',
      }}>
        PIN
      </div>
    )
  }
  return null
}

// ── 单个图片卡片 ──────────────────────────────────────────────────────────────
function ImageCard({
  img,
  onToggle,
  onRemove,
}: {
  img: PageImage
  onToggle: () => void
  onRemove?: () => void
}) {
  const isPin = img.source === 'pin'

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 6,
        overflow: 'hidden',
        border: img.selected
          ? isPin
            ? '1.5px solid rgba(251,191,36,0.7)'
            : '1px solid rgba(255,255,255,0.4)'
          : '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.03)',
        transition: 'border-color 0.15s',
      }}
    >
      {/* 点击选中区域 */}
      <button
        onClick={onToggle}
        style={{
          display: 'block',
          width: '100%',
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
        }}
      >
        {/* Checkbox */}
        <div style={{
          position: 'absolute', top: 5, left: 5, zIndex: 3,
          width: 16, height: 16,
          borderRadius: 3,
          background: img.selected
            ? isPin ? 'rgba(251,191,36,0.95)' : 'rgba(255,255,255,0.9)'
            : 'rgba(0,0,0,0.5)',
          border: img.selected ? 'none' : '1px solid rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: '#0c0c0e',
          fontWeight: 700,
          transition: 'all 0.15s',
        }}>
          {img.selected ? '✓' : ''}
        </div>

        <SourceBadge source={img.source} />

        <img
          src={img.src}
          alt={img.alt}
          style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }}
          loading="lazy"
          onError={(e) => {
            const t = e.target as HTMLImageElement
            t.style.background = 'rgba(255,255,255,0.05)'
            t.style.height = '90px'
            t.style.display = 'block'
            t.src = ''
          }}
        />

        {/* 尺寸标签 */}
        <div style={{
          position: 'absolute', bottom: 4, left: 4,
          background: 'rgba(0,0,0,0.6)',
          color: 'rgba(255,255,255,0.35)',
          fontSize: 8,
          padding: '1px 4px',
          borderRadius: 3,
        }}>
          {img.width}×{img.height}
        </div>
      </button>

      {/* 删除按钮（仅 pin 项展示） */}
      {isPin && onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          title="从队列删除"
          style={{
            position: 'absolute', bottom: 4, right: 4, zIndex: 3,
            width: 18, height: 18,
            borderRadius: 9,
            background: 'rgba(220,38,38,0.75)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: '#fff',
            lineHeight: 1,
            padding: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,1)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.75)')}
        >
          ✕
        </button>
      )}
    </div>
  )
}

// ── ImageGrid ─────────────────────────────────────────────────────────────────
export function ImageGrid({ images, onRemovePin }: Props) {
  const { toggleImageSelection, selectAll, deselectAll } = useAppStore()
  const selectedCount = images.filter((i) => i.selected).length

  const pinned = images.filter((i) => i.source === 'pin')
  const scanned = images.filter((i) => i.source !== 'pin')

  if (images.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 16px', color: 'rgba(255,255,255,0.2)' }}>
        <div style={{ fontSize: 24, marginBottom: 10, opacity: 0.4 }}>◻</div>
        <div style={{ fontSize: 12 }}>未发现可翻译图片</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', marginTop: 4 }}>
          可点「深度扫描」，或在网页上 📌 Pin 指定图片
        </div>
      </div>
    )
  }

  const renderGrid = (items: PageImage[], emptyText?: string) => {
    if (items.length === 0 && emptyText) {
      return (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', padding: '6px 0 2px' }}>
          {emptyText}
        </div>
      )
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {items.map((img) => (
          <ImageCard
            key={img.id}
            img={img}
            onToggle={() => toggleImageSelection(img.id)}
            onRemove={img.source === 'pin' && onRemovePin ? () => onRemovePin(img.id) : undefined}
          />
        ))}
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
        <div style={{ display: 'flex', gap: 10 }}>
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

      {/* Pin 分组 */}
      {pinned.length > 0 && (
        <div>
          <div style={{
            fontSize: 9, color: 'rgba(251,191,36,0.5)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: 5,
          }}>
            📌 已 Pin ({pinned.length})
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {renderGrid(pinned)}
          </div>
        </div>
      )}

      {/* 扫描分组 */}
      {scanned.length > 0 && (
        <div>
          {pinned.length > 0 && (
            <div style={{
              fontSize: 9, color: 'rgba(255,255,255,0.3)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              margin: '6px 0 5px',
            }}>
              页面扫描 ({scanned.length})
            </div>
          )}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {renderGrid(scanned)}
          </div>
        </div>
      )}

      {scanned.length === 0 && pinned.length === 0 && renderGrid([], '无图片')}
    </div>
  )
}
