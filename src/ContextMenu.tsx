import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeTops, computeBaseX, computeLefts, MENU_W, ITEM_H } from './menuPosition'

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

interface MenuNode {
  label: string
  children?: MenuNode[]
  action?: () => void
}

// ─── Styles ───

const ease = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'

const styles = {
  level: (t: number, l: number, bg: string, border: string, hidden: boolean) => ({
    position: 'fixed' as const,
    top: t,
    left: l,
    zIndex: 2000,
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 8,
    padding: '4px 0',
    minWidth: MENU_W,
    boxSizing: 'border-box' as const,
    boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
    fontSize: 13,
    color: '#fff',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    userSelect: 'none' as const,
    opacity: hidden ? 0 : 1,
    animation: hidden ? 'none' : `menuAppear 0.2s ${ease}`,
    transition: `opacity 0.2s ${ease}`,
  }),
  item: (hover: boolean, fg: string, hoverBg: string, depth: number) => ({
    padding: depth > 0 ? '4px 14px 4px 24px' : '6px 14px',
    cursor: 'pointer' as const,
    color: fg,
    background: hover ? hoverBg : 'transparent',
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    whiteSpace: 'nowrap' as const,
    height: ITEM_H - 8,
    lineHeight: `${ITEM_H - 8}px`,
    transition: `background 0.12s ease`,
  }),
}

export default function ContextMenu({ x, y, worldX, worldY, onCreateObject, onClose, isDark }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const leaveTimerRef = useRef<number | null>(null)
  const exitingRef = useRef(false)
  const [openStack, setOpenStack] = useState<number[]>([])
  const [hovered, setHovered] = useState<{ depth: number; index: number } | null>(null)
  const [exiting, setExiting] = useState(false)
  const [visibleDepths, setVisibleDepths] = useState<Set<number>>(new Set([0]))

  // ─── Colors ───
  const colors = useMemo(() => ({
    bg: isDark ? '#1e1e1e' : '#ffffff',
    fg: isDark ? '#ccc' : '#333',
    border: isDark ? '#333' : '#ddd',
    hoverBg: isDark ? '#333' : '#f0f0f0',
    secColor: isDark ? '#888' : '#999',
  }), [isDark])

  // ─── Menu tree ───
  const fadeClose = useCallback(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    setExiting(true)
    setHovered(null)
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    setTimeout(onClose, 400)
  }, [onClose])

  const tree = useMemo<MenuNode[]>(() => [
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
  ], [onCreateObject, worldX, worldY, fadeClose])

  // ─── Resolve levels from openStack ───
  const { totalLevels, levels, levelInfos } = useMemo(() => {
    function getLevel(d: number): { items: MenuNode[] } | null {
      let items: MenuNode[] = tree
      for (let i = 0; i < d; i++) {
        const idx = openStack[i]
        if (idx == null || idx < 0 || idx >= items.length) return null
        const n = items[idx]
        if (!n.children) return null
        items = n.children
      }
      return { items }
    }

    let cnt = 0
    {
      let items: MenuNode[] = tree
      for (let i = 0; ; i++) {
        const idx = openStack[i]
        if (idx == null || idx < 0 || idx >= items.length) { cnt = i + 1; break }
        const n = items[idx]
        if (!n.children) { cnt = i + 1; break }
        items = n.children
      }
    }

    const raw: { depth: number; items: MenuNode[] }[] = []
    for (let d = 0; d < cnt; d++) {
      const info = getLevel(d)
      if (info) raw.push({ depth: d, items: info.items })
    }

    return {
      totalLevels: cnt,
      levels: raw,
      levelInfos: raw.map(l => ({ depth: l.depth, itemCount: l.items.length })),
    }
  }, [tree, openStack])

  // ─── Position: computed from ALL levels (even invisible) to prevent jumping ───
  const visibleLevels = useMemo(() => levels.filter(l => visibleDepths.has(l.depth)), [levels, visibleDepths])

  const tops = useMemo(() => computeTops(y, window.innerHeight, levelInfos, openStack), [y, levelInfos, openStack])
  const baseX = useMemo(() => computeBaseX(x, window.innerWidth, totalLevels), [x, totalLevels])
  const lefts = useMemo(() => computeLefts(baseX, totalLevels), [baseX, totalLevels])

  // ─── Reveal new level after a tiny delay (for animation) ───
  useEffect(() => {
    const last = levels.length - 1
    if (last >= 0 && !visibleDepths.has(last)) {
      // Add to visible set after mount so CSS animation triggers
      const id = requestAnimationFrame(() => {
        setVisibleDepths(prev => new Set([...prev, last]))
      })
      return () => cancelAnimationFrame(id)
    }
  }, [levels.length, visibleDepths])

  // ─── Enter: set hovered to THIS item only ───
  const handleEnter = useCallback((depth: number, index: number) => {
    if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null }
    setHovered({ depth, index })
  }, [])

  const handleItemLeave = useCallback(() => {
    setHovered(null)
  }, [])

  // ─── Click: open submenu or execute action ───
  const handleClick = useCallback((node: MenuNode, depth: number, index: number) => {
    if (node.children) {
      const newStack = openStack.slice(0, depth)
      newStack.push(index)
      setOpenStack(newStack)
      setHovered({ depth, index })
      // Reset visible depths: all existing + the new one will appear via useEffect
      setVisibleDepths(prev => {
        const next = new Set<number>()
        for (let d = 0; d <= depth; d++) {
          if (prev.has(d)) next.add(d)
        }
        return next
      })
    } else if (node.action) {
      setHovered(null)
      node.action()
    }
  }, [openStack])

  // ─── Mouse leave menu area ───
  const handleMouseLeave = useCallback(() => {
    setHovered(null)
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = window.setTimeout(fadeClose, 1000)
  }, [fadeClose])

  // ─── Right-click: go up or close ───
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (openStack.length > 0) {
      const parent = openStack.slice(0, -1)
      setOpenStack(parent)
      setHovered(null)
      setVisibleDepths(new Set([0]))
    } else {
      fadeClose()
    }
  }, [openStack, fadeClose])

  // ─── Cleanup ───
  useEffect(() => () => { if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current) }, [])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) fadeClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [fadeClose])

  // ─── Render ───
  const isHovered = (d: number, i: number) => hovered !== null && hovered.depth === d && hovered.index === i

  return (
    <div
      ref={rootRef}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      style={{ position: 'fixed', inset: 0, zIndex: 1999 }}
    >
      {visibleLevels.map(({ depth, items }) => {
        const idx = levels.findIndex(l => l.depth === depth)
        if (idx < 0) return null
        const top = tops[idx]
        const left = lefts[idx]
        const hidden = exiting

        return (
          <div
            key={depth}
            style={styles.level(top, left, colors.bg, colors.border, hidden)}
          >
            {depth === 0 && (
              <div style={{
                padding: '2px 14px 4px',
                fontSize: 10,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: colors.secColor,
                cursor: 'default',
              }}>
                Sections
              </div>
            )}
            {items.map((node, i) => (
              <div
                key={node.label}
                style={styles.item(isHovered(depth, i), colors.fg, colors.hoverBg, depth)}
                onMouseEnter={() => handleEnter(depth, i)}
                onMouseLeave={handleItemLeave}
                onClick={() => handleClick(node, depth, i)}
              >
                <span>{node.label}</span>
                {node.children && <span style={{ opacity: 0.4, fontSize: 10, marginLeft: 12 }}>▶</span>}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
