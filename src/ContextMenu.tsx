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
const ITEM_H = 32
const HEADER_H = 22
const LV0_FIRST = 30  // level 0: top → first item (4pad + 22header + 4gap)
const LVN_FIRST = 4   // level N: top → first item (4pad, no header)
const GAP = 8

interface MenuNode {
  label: string
  children?: MenuNode[]
  action?: () => void
}

export default function ContextMenu({ x, y, worldX, worldY, onCreateObject, onClose, isDark }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const leaveTimerRef = useRef<number | null>(null)

  // openStack controls which submenus are VISIBLE (set by click)
  const [openStack, setOpenStack] = useState<number[]>([])
  // hovered tracks which item is highlighted per depth (mouse enter/leave)
  const [hovered, setHovered] = useState<number[]>([])

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

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    }
  }, [])

  const bg = isDark ? '#1e1e1e' : '#ffffff'
  const fg = isDark ? '#ccc' : '#333'
  const border = isDark ? '#333' : '#ddd'
  const hoverBg = isDark ? '#333' : '#f0f0f0'
  const secColor = isDark ? '#888' : '#999'

  // ─── Resolve tree levels from openStack ───
  function getLevel(depth: number): { items: MenuNode[]; sel: number | null } | null {
    let items: MenuNode[] = tree
    for (let i = 0; i < depth; i++) {
      const idx = openStack[i]
      if (idx == null || idx < 0 || idx >= items.length) return null
      const node = items[idx]
      if (!node.children) return null
      items = node.children
    }
    // For highlight: use hovered[depth] if set, else openStack[depth]
    const selIdx = depth < hovered.length ? hovered[depth] : (depth < openStack.length ? openStack[depth] : null)
    return { items, sel: selIdx }
  }

  function countLevels(): number {
    let items: MenuNode[] = tree
    for (let i = 0; ; i++) {
      const idx = openStack[i]
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

  // ─── Position ───
  function levelHeight(d: number, items: MenuNode[]): number {
    return GAP + (d === 0 ? HEADER_H : 0) + items.length * ITEM_H + GAP
  }

  // Each level positions its first item at cursor Y
  // level 0: top = y - LV0_FIRST (first item at y)
  // level 1+: top = y - LVN_FIRST (first item at y)
  let tops: number[] = [y - LV0_FIRST]
  for (let d = 1; d < totalLevels; d++) {
    tops[d] = y - LVN_FIRST
  }

  // Viewport clamping: find tallest level, adjust all tops
  let maxH = 0
  for (let i = 0; i < levels.length; i++) {
    const h = levelHeight(levels[i].depth, levels[i].items)
    if (h > maxH) maxH = h
  }

  // Clamp level 0 top
  let menuTop0 = tops[0]
  if (menuTop0 + maxH > window.innerHeight - GAP) {
    menuTop0 = y - maxH + GAP
  }
  if (menuTop0 < GAP) menuTop0 = GAP

  // Level 0 top + offset → first item Y position
  const firstItemY = menuTop0 + LV0_FIRST

  // Level N tops: align first item with level 0's first item
  for (let d = 1; d < totalLevels; d++) {
    tops[d] = firstItemY - LVN_FIRST
    // Clamp individually
    const h = levelHeight(d, levels[d]?.items ?? [])
    if (tops[d] + h > window.innerHeight - GAP) {
      tops[d] = window.innerHeight - GAP - h
    }
    if (tops[d] < GAP) tops[d] = GAP
  }

  // Horizontal: cascade may overflow right edge
  let offsetX = 0
  if (x + MENU_W > window.innerWidth - GAP) {
    offsetX = window.innerWidth - GAP - x - MENU_W
  }

  // ─── Reveal animation ───
  useEffect(() => {
    if (levels.length > prevLenRef.current) {
      const newLevel = levels.length - 1
      requestAnimationFrame(() => {
        setRevealed(prev => new Set([...prev, newLevel]))
      })
    } else if (levels.length < prevLenRef.current) {
      setRevealed(new Set([0]))
    }
    prevLenRef.current = levels.length
  }, [levels.length])

  // ─── Mouse enter: highlight only (immediate) ───
  const handleEnter = (depth: number, index: number) => {
    // Cancel leave timer — user is back in the menu
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }

    setHovered(prev => {
      const next = prev.slice(0, depth)
      next.push(index)
      return next
    })
  }

  // ─── Click: opens submenu if has children, else runs action ───
  const handleClick = (node: MenuNode, depth: number, index: number) => {
    if (node.children) {
      setOpenStack(prev => {
        const next = prev.slice(0, depth)
        next.push(index)
        return next
      })
      // Also align hover to clicked item
      setHovered(prev => {
        const next = prev.slice(0, depth)
        next.push(index)
        return next
      })
    } else if (node.action) {
      node.action()
    }
  }

  // ─── Auto-close: cursor leaves menu → 1s timer ───
  const handleMouseLeave = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = window.setTimeout(() => {
      onClose()
    }, 1000)
  }

  // ─── Double right-click: go up one level or close ───
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (openStack.length > 0) {
      // Go up one level — position parent's first item at cursor
      const parentStack = openStack.slice(0, -1)
      setOpenStack(parentStack)
      setHovered(parentStack.length > 0 ? [...parentStack] : [])
      setRevealed(new Set([0]))
      prevLenRef.current = 1
    } else {
      // Already at root → close
      onClose()
    }
  }

  const ease = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
  const dur = 0.3

  return (
    <div
      ref={rootRef}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {levels.map(({ depth, items, sel }) => {
        const left = offsetX + x + MENU_W * (depth - (totalLevels - 1))
        const top = tops[depth] ?? 0
        const isHidden = depth > 0 && !revealed.has(depth)

        return (
          <div
            key={depth}
            style={{
              position: 'fixed',
              left,
              top,
              zIndex: 2000 - depth,
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: '4px 0',
              minWidth: MENU_W,
              boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
              fontSize: 13,
              color: fg,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              userSelect: 'none',
              opacity: isHidden ? 0 : 1,
              transition: `left ${dur}s ${ease}, opacity ${dur}s ${ease}`,
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
                    transition: `background ${dur * 0.5}s ease`,
                  }}
                  onMouseEnter={() => handleEnter(depth, i)}
                  onClick={() => handleClick(node, depth, i)}
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
