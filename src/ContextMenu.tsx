import { useEffect, useRef, useState } from 'react'

type ObjectType = 'space' | 'note' | 'file' | 'link' | 'shape'

interface Props {
  x: number
  y: number
  worldX: number
  worldY: number
  onCreateObject: (type: ObjectType, x: number, y: number, extra?: Record<string, unknown>) => void
  onClose: () => void
  isDark: boolean
}

export type { ObjectType }

const MENU_W = 170
const ITEM_H = 28

interface MenuNode {
  label: string
  children?: MenuNode[]
  action?: () => void
}

export default function ContextMenu({ x, y, worldX, worldY, onCreateObject, onClose, isDark }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const [stack, setStack] = useState<number[]>([])

  // Track which levels have been revealed (for opacity fade-in on mount)
  const [revealed, setRevealed] = useState<Set<number>>(new Set([0]))
  const prevLenRef = useRef(1)

  const tree: MenuNode[] = [
    {
      label: 'Create',
      children: [
        { label: 'Space', action: () => { onCreateObject('space', worldX, worldY); onClose() } },
        { label: 'Note', action: () => { onCreateObject('note', worldX, worldY); onClose() } },
        { label: 'File', action: () => { onCreateObject('file', worldX, worldY); onClose() } },
        { label: 'Link', action: () => { onCreateObject('link', worldX, worldY); onClose() } },
        {
          label: 'Shape',
          children: [
            { label: 'Rectangle', action: () => { onCreateObject('shape', worldX, worldY, { kind: 'rectangle' }); onClose() } },
            { label: 'Circle', action: () => { onCreateObject('shape', worldX, worldY, { kind: 'circle' }); onClose() } },
          ],
        },
      ],
    },
  ]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const bg = isDark ? '#1e1e1e' : '#ffffff'
  const fg = isDark ? '#ccc' : '#333'
  const border = isDark ? '#333' : '#ddd'
  const hoverBg = isDark ? '#333' : '#f0f0f0'
  const secColor = isDark ? '#888' : '#999'

  function getLevel(depth: number): { items: MenuNode[]; sel: number | null } | null {
    let items: MenuNode[] = tree
    for (let i = 0; i < depth; i++) {
      const idx = stack[i]
      if (idx == null || idx < 0 || idx >= items.length) return null
      const node = items[idx]
      if (!node.children) return null
      items = node.children
    }
    return { items, sel: depth < stack.length ? stack[depth] : null }
  }

  function countLevels(): number {
    let items: MenuNode[] = tree
    for (let i = 0; ; i++) {
      const idx = stack[i]
      if (idx == null || idx < 0 || idx >= items.length) return i + 1
      const node = items[idx]
      if (!node.children) return i + 1
      items = node.children
    }
  }

  const totalLevels = countLevels()
  const levels: { depth: number; items: MenuNode[]; sel: number | null }[] = []
  for (let d = 0; d < totalLevels; d++) {
    const info = getLevel(d)
    if (info) levels.push({ depth: d, ...info })
  }

  // Reveal new levels on next frame so CSS opacity transition runs
  useEffect(() => {
    if (levels.length > prevLenRef.current) {
      const newLevel = levels.length - 1
      requestAnimationFrame(() => {
        setRevealed(prev => new Set([...prev, newLevel]))
      })
    } else if (levels.length < prevLenRef.current) {
      // Collapsed → reset revealed for unshown levels
      setRevealed(new Set([0]))
    }
    prevLenRef.current = levels.length
  }, [levels.length])

  // Mouse enter: delay opening submenus
  const handleEnter = (depth: number, index: number) => {
    if (timerRef.current) clearTimeout(timerRef.current)

    const newStack = stack.slice(0, depth)
    newStack.push(index)

    const isDeeper = newStack.length > stack.length
    if (isDeeper && newStack.length > 1) {
      // Opening a deeper submenu → delay to prevent accidental opens
      timerRef.current = window.setTimeout(() => {
        setStack(newStack)
      }, 200)
    } else {
      setStack(newStack)
    }
  }

  return (
    <div ref={rootRef}>
      {levels.map(({ depth, items, sel }) => {
        // Each level shifts left so deepest is at x, parents to the left
        const left = x + MENU_W * (depth - (totalLevels - 1))
        const isHidden = depth > 0 && !revealed.has(depth)

        return (
          <div
            key={depth}
            style={{
              position: 'fixed',
              left,
              top: y,
              zIndex: 2000 - depth,
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: '4px 0',
              minWidth: MENU_W,
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              fontSize: 13,
              color: fg,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              userSelect: 'none',
              opacity: isHidden ? 0 : 1,
              pointerEvents: isHidden ? 'none' : 'auto',
              transition: `left 0.12s ease-out, opacity 0.12s ease-out`,
            }}
          >
            {depth === 0 && (
              <div style={{
                padding: '2px 14px 4px',
                fontSize: 10,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: secColor,
                cursor: 'default',
              }}>
                Sections
              </div>
            )}
            {items.map((node, i) => {
              const hasChildren = !!node.children
              const isSelected = sel === i
              const pad = depth > 0 ? '4px 14px 4px 24px' : '6px 14px'
              return (
                <div
                  key={node.label}
                  style={{
                    padding: pad,
                    cursor: 'pointer',
                    color: fg,
                    background: isSelected ? hoverBg : 'transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                    height: ITEM_H - 8,
                    lineHeight: `${ITEM_H - 8}px`,
                  }}
                  onMouseEnter={() => handleEnter(depth, i)}
                  onClick={() => { if (node.action) node.action() }}
                >
                  <span>{node.label}</span>
                  {hasChildren && <span style={{ opacity: 0.4, fontSize: 10, marginLeft: 12 }}>▶</span>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
