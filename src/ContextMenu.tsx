import { useEffect, useRef } from 'react'

interface Props {
  x: number
  y: number
  worldX: number
  worldY: number
  onCreateSpace: (wx: number, wy: number) => void
  onClose: () => void
  isDark: boolean
}

export default function ContextMenu({ x, y, worldX, worldY, onCreateSpace, onClose, isDark }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const bg = isDark ? '#1e1e1e' : '#ffffff'
  const fg = isDark ? '#ccc' : '#333'
  const border = isDark ? '#333' : '#ddd'
  const hoverBg = isDark ? '#333' : '#f0f0f0'

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 2000,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 6,
        padding: '4px 0',
        minWidth: 160,
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        fontSize: 13,
        color: fg,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          padding: '6px 14px',
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        onClick={() => {
          onCreateSpace(worldX, worldY)
          onClose()
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = hoverBg}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        New Space
      </div>
    </div>
  )
}
