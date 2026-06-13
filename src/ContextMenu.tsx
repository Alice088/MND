import { useCallback, useEffect, useRef, useState } from 'react'

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
const LV0_FIRST = 30   // level 0: menu top → first item Y
const LVN_FIRST = 4    // level N: menu top → first item Y
const GAP = 8

interface MenuNode {
  label: string
  children?: MenuNode[]
  action?: () => void
}

export default function ContextMenu({ x, y, worldX, worldY, onCreateObject, onClose, isDark }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const leaveTimerRef = useRef<number | null>(null)

  const [openStack, setOpenStack] = useState<number[]>([])
  const [hovered, setHovered] = useState<number[]>([])
  const [exiting, setExiting] = useState(false)
  const [revealed, setRevealed] = useState<Set<number>>(new Set([0]))
  const prevLenRef = useRef(1)

  // ─── Fade-out close ───
  const fadeOutRef = useRef(false)
  const fadeClose = useCallback(() => {
    if (fadeOutRef.current) return
    fadeOutRef.current = true
    setExiting(true)
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    setTimeout(onClose, 400)
  }, [onClose])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) fadeClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [fadeClose])

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    }
  }, [])

  const bg = isDark ? '#1e1e1e' : '#ffffff'
  const fg = isDark ? '#ccc' : '#333'
  const border = isDark ? '#333' : '#ddd'
  const hoverBg = isDark ? '#333' : '#f0f0f0'
  const secColor = isDark ? '#888' : '#999'

  const tree: MenuNode[] = [
    {
      label: 'Create',
      children: [
        { label: 'Space', action: () => { onCreateObject('space', worldX, worldY); fadeClose() } },
        { label: 'Note', action: () => { onCreateObject('note', worldX, worldY); fadeClose() } },
        { label: 'File', action: () => { onCreateObject('file', worldX, worldY); fadeClose() } },
        { label: 'Link', action: () => { onCreateObject('link', worldX, worldY); fadeClose() } },
        {
          label: 'Shape',
          children: [
            { label: 'Rectangle', action: () => { onCreateObject('shape', worldX, worldY, { kind: 'rectangle' }); fadeClose() } },
            { label: 'Circle', action: () => { onCreateObject('shape', worldX, worldY, { kind: 'circle' }); fadeClose() } },
          ],
        },
      ],
    },
  ]

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

  // ─── Vertical position: all levels move as one block ───
  function levelHeight(d: number, its: MenuNode[]): number {
    return GAP + (d === 0 ? HEADER_H : 0) + its.length * ITEM_H + GAP
  }

  // 1. Ideal tops — each level's first item at cursor Y
  const idealTops: number[] = []
  idealTops[0] = y - LV0_FIRST
  for (let d = 1; d < totalLevels; d++) {
    idealTops[d] = y - LVN_FIRST
  }

  // 2. Find lowest bottom among all levels
  let lowestBottom = -Infinity
  for (const { depth: d, items: its } of levels) {
    const b = idealTops[d] + levelHeight(d, its)
    if (b > lowestBottom) lowestBottom = b
  }

  // 3. Shift everything up if overflowing bottom
  let shift = 0
  if (lowestBottom > window.innerHeight - GAP) {
    shift = window.innerHeight - GAP - lowestBottom
  }

  // 4. Apply shift, then clamp level 0 top to GAP
  const tops = idealTops.map(t => t + shift)
  if (tops[0] < GAP) {
    const extra = GAP - tops[0]
    for (let i = 0; i < tops.length; i++) tops[i] += extra
  }

  // ─── Horizontal: cascade right → shift left if overflow ───
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
  const handleEnter = (_depth: number, _index: number) => {
    // cancel leave timer — user back in menu
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    setHovered(prev => {
      const next = prev.slice(0, _depth)
      next.push(_index)
      return next
    })
  }

  // ─── Click: opens submenu if has children ───
  const handleClick = (node: MenuNode, depth: number, index: number) => {
    if (node.children) {
      setOpenStack(prev => {
        const next = prev.slice(0, depth)
        next.push(index)
        return next
      })
      setHovered(prev => {
        const next = prev.slice(0, depth)
        next.push(index)
        return next
      })
    } else if (node.action) {
      node.action()
    }
  }

  // ─── Auto-close: 1s after mouse leaves menu ───
  const handleMouseLeave = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = window.setTimeout(fadeClose, 1000)
  }

  // ─── Double right-click: go up a level or close ───
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (openStack.length > 0) {
      const parentStack = openStack.slice(0, -1)
      setOpenStack(parentStack)
      setHovered(parentStack.length > 0 ? [...parentStack] : [])
      setRevealed(new Set([0]))
      prevLenRef.current = 1
    } else {
      fadeClose()
    }
  }

  const ease = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
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
        const isHidden = (depth > 0 && !revealed.has(depth)) || exiting

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
