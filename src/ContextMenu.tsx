import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { computeTops, computeBaseX, computeLefts, MENU_W } from './menuPosition'
import type { ClickPos } from './menuPosition'

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

interface StackEntry {
  index: number
  click: ClickPos // cursor position when this level was opened
}

// ─── Styles ───

const ease = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'

const styles = {
  level: (t: number, l: number, bg: string, border: string, op: number) => ({
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
    opacity: op,
    animation: op < 1 ? 'none' : `menuAppear 0.2s ${ease}`,
  }),
  item: (hover: boolean, fg: string, hoverBg: string) => ({
    padding: '4px 14px',
    cursor: 'pointer' as const,
    color: fg,
    background: hover ? hoverBg : 'transparent',
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    whiteSpace: 'nowrap' as const,
    height: 24,
    lineHeight: '24px',
    transition: `background 0.12s ease`,
  }),
}

export default function ContextMenu({ x, y, worldX, worldY, onCreateObject, onClose, isDark }: Props) {
  const leaveTimerRef = useRef<number | null>(null)
  const exitAnimRef = useRef(0)
  const [openStack, setOpenStack] = useState<StackEntry[]>([])
  const [hovered, setHovered] = useState<{ depth: number; index: number } | null>(null)
  const [exitOpacity, setExitOpacity] = useState(1)
  const [visibleDepths, setVisibleDepths] = useState<Set<number>>(new Set([0]))

  // ─── Colors ───
  const colors = useMemo(() => ({
    bg: isDark ? '#1e1e1e' : '#ffffff',
    fg: isDark ? '#ccc' : '#333',
    border: isDark ? '#333' : '#ddd',
    hoverBg: isDark ? '#333' : '#f0f0f0',
    secColor: isDark ? '#888' : '#999',
  }), [isDark])

  // ─── Fade out (rAF, same technique as zoom label) ───
  const fadeClose = useCallback(() => {
    if (exitAnimRef.current) return // already fading
    setHovered(null)
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    let op = 1
    const step = () => {
      op -= 0.03
      if (op <= 0) { setExitOpacity(0); onClose(); return }
      setExitOpacity(op)
      exitAnimRef.current = requestAnimationFrame(step)
    }
    exitAnimRef.current = requestAnimationFrame(step)
  }, [onClose])

  const tree = useMemo<MenuNode[]>(() => [
    {
      label: 'Create',
      children: [
        { label: 'Space', action: () => {
          const name = window.prompt('Space name:') || ''
          onCreateObject('space', worldX, worldY, { name })
          fadeClose()
        } },
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
  const { totalLevels, levels, levelInfos, clickYs, clickXs } = useMemo(() => {
    function getLevel(d: number): { items: MenuNode[] } | null {
      let items: MenuNode[] = tree
      for (let i = 0; i < d; i++) {
        const entry = openStack[i]
        if (!entry) return null
        const idx = entry.index
        if (idx < 0 || idx >= items.length) return null
        const n = items[idx]
        if (!n.children) return null
        items = n.children
      }
      return { items }
    }

    let cnt = openStack.length + 1 // level 0 + one per openStack entry

    const raw: { depth: number; items: MenuNode[] }[] = []
    for (let d = 0; d < cnt; d++) {
      const info = getLevel(d)
      if (info) raw.push({ depth: d, items: info.items })
    }

    return {
      totalLevels: cnt,
      levels: raw,
      levelInfos: raw.map(l => ({ depth: l.depth, itemCount: l.items.length })),
      clickYs: openStack.map(e => e.click.y),
      clickXs: openStack.map(e => e.click.x),
    }
  }, [tree, openStack])

  // ─── Position ───
  const visibleLevels = useMemo(() => levels.filter(l => visibleDepths.has(l.depth)), [levels, visibleDepths])

  const tops = useMemo(() => computeTops(y, window.innerHeight, levelInfos, [y, ...clickYs]), [y, levelInfos, clickYs])
  const baseX = useMemo(() => computeBaseX(x, window.innerWidth, totalLevels, [x, ...clickXs]), [x, totalLevels, clickXs])
  const lefts = useMemo(() => computeLefts(baseX, totalLevels), [baseX, totalLevels])

  // ─── Reveal new level after a tiny delay (for animation) ───
  useEffect(() => {
    const last = levels.length - 1
    if (last >= 0 && !visibleDepths.has(last)) {
      const id = requestAnimationFrame(() => {
        setVisibleDepths(prev => new Set([...prev, last]))
      })
      return () => cancelAnimationFrame(id)
    }
  }, [levels.length, visibleDepths])

  // ─── Per-level mouse enter/leave for auto-close ───
  const handleLevelEnter = useCallback(() => {
    if (leaveTimerRef.current) { clearTimeout(leaveTimerRef.current); leaveTimerRef.current = null }
  }, [])

  const handleLevelLeave = useCallback(() => {
    leaveTimerRef.current = window.setTimeout(fadeClose, 1000)
  }, [fadeClose])

  // ─── Enter: set hovered to THIS item only ───
  const handleEnter = useCallback((depth: number, index: number) => {
    handleLevelEnter()
    setHovered({ depth, index })
  }, [handleLevelEnter])

  const handleItemLeave = useCallback(() => {
    setHovered(null)
  }, [])

  // ─── Click: open submenu or execute action ───
  const handleClick = useCallback((node: MenuNode, depth: number, index: number, e: React.MouseEvent) => {
    if (node.children) {
      const click = { x: e.clientX, y: e.clientY }
      const newStack = openStack.slice(0, depth)
      newStack.push({ index, click })
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
  useEffect(() => () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    cancelAnimationFrame(exitAnimRef.current)
  }, [])

  // Close on outside click
  // Menu levels stop propagation via onMouseDown, so any mousedown reaching
  // document means it's outside the menu.
  useEffect(() => {
    const handler = () => fadeClose()
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [fadeClose])

  // ─── Render ───
  const isHovered = (d: number, i: number) => hovered !== null && hovered.depth === d && hovered.index === i

  return (
    <>
      {visibleLevels.map(({ depth, items }) => {
        const idx = levels.findIndex(l => l.depth === depth)
        if (idx < 0) return null
        const top = tops[idx]
        const left = lefts[idx]

        return (
          <div
            key={depth}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseEnter={handleLevelEnter}
            onMouseLeave={handleLevelLeave}
            onContextMenu={handleContextMenu}
            style={styles.level(top, left, colors.bg, colors.border, exitOpacity)}
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
                style={styles.item(isHovered(depth, i), colors.fg, colors.hoverBg)}
                onMouseEnter={() => handleEnter(depth, i)}
                onMouseLeave={handleItemLeave}
                onClick={(e) => handleClick(node, depth, i, e)}
              >
                <span>{node.label}</span>
                {node.children && <span style={{ opacity: 0.4, fontSize: 10, marginLeft: 12 }}>▶</span>}
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
