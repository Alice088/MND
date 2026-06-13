import { useRef, useEffect, useState, useCallback } from 'react'
import type { CanvasObject as CanvasObjectType } from './types'
import { shortId } from './types'

interface Props {
  isDark: boolean
  spaceId: string
  objects: CanvasObjectType[]
  onEnterSpace: (targetId: string, obj: CanvasObjectType, currentVp: { x: number; y: number; zoom: number }) => void
  onGoBack: () => void
  onUpdateObject: (objectId: string, x: number, y: number) => void
  onContextMenu?: (worldX: number, worldY: number, screenX: number, screenY: number) => void
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 5

const GRID_LEVELS = [
  { step: 1, minZoom: 32 }, { step: 2, minZoom: 16 },
  { step: 5, minZoom: 8 }, { step: 10, minZoom: 4 },
  { step: 20, minZoom: 2 }, { step: 50, minZoom: 1 },
  { step: 100, minZoom: 0.5 }, { step: 200, minZoom: 0.25 },
  { step: 500, minZoom: 0.12 }, { step: 1000, minZoom: 0.06 },
  { step: 2000, minZoom: 0.03 }, { step: 5000, minZoom: 0.015 },
  { step: 10000, minZoom: 0.008 }, { step: 20000, minZoom: 0.004 },
  { step: 50000, minZoom: 0.002 }, { step: 100000, minZoom: 0.001 },
]

function getGridIdx(z: number) {
  for (let i = GRID_LEVELS.length - 1; i >= 0; i--) if (z <= GRID_LEVELS[i].minZoom) return i
  return 0
}

export default function Canvas({
  isDark, spaceId, objects, onEnterSpace, onGoBack, onUpdateObject, onContextMenu: onCtx,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vpRef = useRef({ x: 0, y: 0, zoom: 1 })
  const panning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 })
  const [isPanning, setIsPanning] = useState(false)

  // Drag state
  const dragRef = useRef<{
    objId: string
    offsetX: number
    offsetY: number
    origX: number
    origY: number
  } | null>(null)
  const dragPosRef = useRef<{ id: string; x: number; y: number } | null>(null)

  // Zoom label
  const [zoomText, setZoomText] = useState('')
  const [labelOpacity, setLabelOpacity] = useState(0)
  const [uuidOpacity, setUuidOpacity] = useState(0)
  const fadeTimer = useRef(0)
  const fadeAnim = useRef(0)

  const showZoomLabel = useCallback((text: string) => {
    cancelAnimationFrame(fadeAnim.current)
    clearTimeout(fadeTimer.current)
    setZoomText(text)
    setLabelOpacity(0.5)
    fadeTimer.current = window.setTimeout(() => {
      let op = 0.5
      const step = () => {
        op -= 0.006
        if (op <= 0) { setLabelOpacity(0); return }
        setLabelOpacity(op)
        fadeAnim.current = requestAnimationFrame(step)
      }
      fadeAnim.current = requestAnimationFrame(step)
    }, 1000)
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const w = rect.width, h = rect.height
    if (canvas.width !== Math.round(w * devicePixelRatio) ||
        canvas.height !== Math.round(h * devicePixelRatio)) {
      canvas.width = Math.round(w * devicePixelRatio)
      canvas.height = Math.round(h * devicePixelRatio)
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }

    const vp = vpRef.current
    const dark = isDark

    // Background
    ctx.fillStyle = dark ? '#000000' : '#ffffff'
    ctx.fillRect(0, 0, w, h)

    // Grid
    const gIdx = getGridIdx(vp.zoom)
    const l1 = GRID_LEVELS[gIdx]
    const l2 = GRID_LEVELS[Math.min(gIdx + 1, GRID_LEVELS.length - 1)]
    const zRange = l1.minZoom - (l2?.minZoom ?? 0)
    const zPos = zRange > 0 ? (vp.zoom - l2.minZoom) / zRange : 1
    const blendA = Math.max(0, Math.min(1, zPos))
    const blendB = 1 - blendA
    drawGrid(ctx, vp, w, h, dark, l1.step, blendA)
    drawGrid(ctx, vp, w, h, dark, l2.step, blendB)

    // Crosshair
    const cx = -vp.x * vp.zoom, cy = -vp.y * vp.zoom
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, cy); ctx.lineTo(w, cy)
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h)
    ctx.stroke()

    // Draw space objects
    for (const obj of objects) {
      if (obj.type !== 'space') continue
      let ox = obj.x, oy = obj.y
      const drag = dragPosRef.current
      if (drag && drag.id === obj.id) { ox = drag.x; oy = drag.y }
      const sx = (ox - vp.x) * vp.zoom
      const sy = (oy - vp.y) * vp.zoom
      const sw = obj.width * vp.zoom
      const sh = obj.height * vp.zoom
      if (sx + sw < 0 || sx > w || sy + sh < 0 || sy > h) continue

      // Rect
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(sx, sy, sw, sh, 3 * vp.zoom)
      } else {
        ctx.rect(sx, sy, sw, sh)
      }
      ctx.fill()
      ctx.stroke()

      // Name label
      if (sw > 40 && sh > 20) {
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
        ctx.font = `${Math.max(10, 12 * vp.zoom)}px system-ui, sans-serif`
        ctx.textBaseline = 'top'
        ctx.fillText(shortId(obj.targetSpaceId!), sx + 8 * vp.zoom, sy + 8 * vp.zoom)
      }
    }
  }, [isDark, objects])

  function drawGrid(ctx: CanvasRenderingContext2D, vp: any, w: number, h: number, dark: boolean, step: number, alphaMul: number) {
    if (alphaMul <= 0) return
    const gs = step * vp.zoom
    if (gs < 2) return
    const alpha = 0.06 * alphaMul
    if (alpha < 0.002) return
    ctx.strokeStyle = dark ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`
    ctx.lineWidth = 1
    ctx.beginPath()
    const ox = ((-vp.x * vp.zoom) % gs + gs) % gs
    const oy = ((-vp.y * vp.zoom) % gs + gs) % gs
    for (let x = ox; x <= w; x += gs) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h) }
    for (let y = oy; y <= h; y += gs) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5) }
    ctx.stroke()
  }

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return
    const obs = new ResizeObserver(() => draw())
    obs.observe(parent)
    draw()
    return () => obs.disconnect()
  }, [draw])

  useEffect(() => { draw() }, [draw])

  // Initialize viewport on mount and show UUID briefly
  const initDone = useRef(false)
  useEffect(() => {
    if (initDone.current) return
    initDone.current = true
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width > 0) {
      vpRef.current.x = -rect.width / 2
      vpRef.current.y = -rect.height / 2
      vpRef.current.zoom = 1
      draw()
    }
    // Show UUID on mount, fade after 2s
    setUuidOpacity(0.5)
    const t = setTimeout(() => {
      let op = 0.5
      const step = () => {
        op -= 0.005
        if (op <= 0) { setUuidOpacity(0); return }
        setUuidOpacity(op)
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }, 2000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // === Wheel zoom (center-based) ===
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const vp = vpRef.current
    const delta = -e.deltaY * 0.001
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * (1 + delta)))
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = rect.width / 2, cy = rect.height / 2
    const wx = cx / vp.zoom + vp.x
    const wy = cy / vp.zoom + vp.y
    vp.x = wx - cx / newZoom
    vp.y = wy - cy / newZoom
    vp.zoom = newZoom
    draw()
    showZoomLabel(`${Math.round(newZoom * 100)}%`)
  }, [draw, showZoomLabel])

  // === Mouse pan (left-click) + object drag ===
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const vp = vpRef.current
    const wx = mx / vp.zoom + vp.x
    const wy = my / vp.zoom + vp.y

    // Check click on space object → start drag
    for (const obj of objects) {
      if (obj.type === 'space' &&
          wx >= obj.x && wx <= obj.x + obj.width &&
          wy >= obj.y && wy <= obj.y + obj.height) {
        dragRef.current = {
          objId: obj.id,
          offsetX: wx - obj.x,
          offsetY: wy - obj.y,
          origX: obj.x,
          origY: obj.y,
        }
        return
      }
    }

    // Not on object → start panning
    panning.current = true
    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, vx: vp.x, vy: vp.y }
  }, [objects])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    // Dragging object
    if (dragRef.current) {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const vp = vpRef.current
      const mx = (e.clientX - rect.left) / vp.zoom
      const my = (e.clientY - rect.top) / vp.zoom
      const newX = mx + vp.x - dragRef.current.offsetX
      const newY = my + vp.y - dragRef.current.offsetY
      dragPosRef.current = { id: dragRef.current.objId, x: newX, y: newY }
      draw()
      return
    }
    // Panning
    if (!panning.current) return
    const vp = vpRef.current
    vp.x = panStart.current.vx - (e.clientX - panStart.current.x) / vp.zoom
    vp.y = panStart.current.vy - (e.clientY - panStart.current.y) / vp.zoom
    draw()
  }, [draw])

  const onMouseUp = useCallback(() => {
    if (dragRef.current) {
      const pos = dragPosRef.current
      if (pos) {
        onUpdateObject(pos.id, pos.x, pos.y)
      }
      dragRef.current = null
      dragPosRef.current = null
      return
    }
    panning.current = false
    setIsPanning(false)
  }, [onUpdateObject])

  // === Double-click → enter space or go back ===
  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const vp = vpRef.current
    const wx = mx / vp.zoom + vp.x
    const wy = my / vp.zoom + vp.y

    // Check on space object → enter
    for (const obj of objects) {
      if (obj.type === 'space' &&
          wx >= obj.x && wx <= obj.x + obj.width &&
          wy >= obj.y && wy <= obj.y + obj.height) {
        onEnterSpace(obj.targetSpaceId, obj, { x: vp.x, y: vp.y, zoom: vp.zoom })
        return
      }
    }
    // Empty space → go back
    onGoBack()
  }, [objects, onEnterSpace, onGoBack])

  // === Touch events ===
  const touchRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0]
      touchRef.current = { x: t.clientX, y: t.clientY, vx: vpRef.current.x, vy: vpRef.current.y }
    }
  }, [])
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current || e.touches.length !== 1) return
    const t = e.touches[0]
    const vp = vpRef.current
    vp.x = touchRef.current.vx - (t.clientX - touchRef.current.x) / vp.zoom
    vp.y = touchRef.current.vy - (t.clientY - touchRef.current.y) / vp.zoom
    draw()
  }, [draw])
  const onTouchEnd = useCallback(() => { touchRef.current = null }, [])

  const labelColor = isDark ? '#ffffff' : '#000000'

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: isPanning ? 'grabbing' : 'grab',
        }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          if (!onCtx) return
          e.preventDefault()
          const rect = canvasRef.current?.getBoundingClientRect()
          if (!rect) return
          const mx = e.clientX - rect.left
          const my = e.clientY - rect.top
          const vp = vpRef.current
          const wx = mx / vp.zoom + vp.x
          const wy = my / vp.zoom + vp.y
          onCtx(wx, wy, e.clientX, e.clientY)
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />
      {/* UUID top-left */}
      <div
        style={{
          position: 'fixed',
          top: 14,
          left: 14,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 10,
          letterSpacing: '0.5px',
          color: labelColor,
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 1000,
          fontVariantNumeric: 'tabular-nums',
          opacity: uuidOpacity,
        }}
      >
        {shortId(spaceId)}
      </div>
      {/* Zoom label bottom-left */}
      <div
        style={{
          position: 'fixed',
          bottom: 14,
          left: 14,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 10,
          letterSpacing: '0.5px',
          color: labelColor,
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 1000,
          fontVariantNumeric: 'tabular-nums',
          opacity: labelOpacity,
        }}
      >
        {zoomText}
      </div>
    </>
  )
}
