// ── ImageLightbox.tsx ─────────────────────────────────────────────────────────
// 全屏图片预览 + 下载

import { useEffect, useCallback } from 'react'

interface Props {
  src: string
  label?: string
  downloadName?: string
  onClose: () => void
}

export function ImageLightbox({ src, label, downloadName, onClose }: Props) {
  const handleDownload = useCallback(() => {
    const a = document.createElement('a')
    a.href = src
    a.download = downloadName ?? 'translated.png'
    a.click()
  }, [src, downloadName])

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 16,
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.12s ease',
      }}
    >
      {/* 顶部工具栏 */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em' }}>
          {label ?? '预览'}
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={handleDownload}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.8)',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          >
            ↓ 下载
          </button>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.55)',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* 图片 */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        <img
          src={src}
          alt={label ?? '预览'}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          }}
        />
      </div>

      {/* 点击背景关闭提示 */}
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.06em', flexShrink: 0 }}>
        点击背景或按 ESC 关闭
      </div>
    </div>
  )
}
