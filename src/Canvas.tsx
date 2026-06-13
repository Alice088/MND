import { useRef, useEffect, useState, useCallback } from 'react'
import type { CanvasObject as CanvasObjectType } from './types'
import { shortId } from './types'

interface Props {
  isDark: boolean
  spaceId: string
  objects: CanvasObjectType[]
  onEnterSpace: (targetId: string, obj: CanvasObjectType, currentVp: { x: number; y: number; zoom: number }) => void
  enterAnim: { obj: CanvasObjectType } | null
  onEnterComplete: (targetId: string) => void
  exitAnim: { toViewport: { x: number; y: number; zoom: number } } | null
  onExitComplete: () => void
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

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export default function Canvas({
  isDark, spaceId, objects, onEnterSpace,
  enterAnim, onEnterComplete, exitAnim, onExitComplete, onContextMenu: onCtx,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vpRef = useRef({ x: 0, y: 0, zoom: 1 })
  const panning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const animRef = useRef(0)

  // Zoom label
  const [zoomText, setZoomText] = useState('')
  const [labelOpacity, setLabelOpacity] = useState(0)
  const fadeTimer = useRef(0)
  const fadeAnim = useRef(0)

  const showZoomLabel = useCallback((text: string) => {
    cancelAnimationFrame(fadeAnim.current)
    clearTimeout(fadeTimer.current)
    setZoomText(text)
    setLabelOpacity(0.15)
    fadeTimer.current = window.setTimeout(() => {
      let op = 0.15
      const step = () => {
        op -= 0.003
        if (op <= 0) { setLabelOpacity(0); return }
        setLabelOpacity(op)
        fadeAnim.current = requestAnimationFrame(step)
      }
      fadeAnim.current = requestAnimationFrame(step)
    }, 1000)
  }, [])

  useEffect(() => () => { cancelAnimationFrame(fadeAnim.current); clearTimeout(fadeTimer.current) }, [])

  // === Drawing ===

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width: w, height: h } = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const vp = vpRef.current

    ctx.fillStyle = isDark ? '#121212' : '#ffffff'
    ctx.fillRect(0, 0, w, h)

    // Grid
    const idx = getGridIdx(vp.zoom)
    const cur = GRID_LEVELS[idx]
    let blend = 0
    let next = cur
    if (idx < GRID_LEVELS.length - 1) {
      next = GRID_LEVELS[idx + 1]
      const lo = next.minZoom
      const hi = cur.minZoom
      if (hi !== lo) blend = 1 - (vp.zoom - lo) / (hi - lo)
    }
    drawGrid(ctx, vp, w, h, isDark, cur.step, 1 - blend)
    if (idx < GRID_LEVELS.length - 1) drawGrid(ctx, vp, w, h, isDark, next.step, blend)

    // Origin crosshair
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
    ctx.lineWidth = 1
    const ox = -vp.x * vp.zoom
    const oy = -vp.y * vp.zoom
    ctx.beginPath()
    ctx.moveTo(ox - 8, oy); ctx.lineTo(ox + 8, oy)
    ctx.moveTo(ox, oy - 8); ctx.lineTo(ox, oy + 8)
    ctx.stroke()

    // Objects
    for (const obj of objects) drawObject(ctx, vp, obj, isDark)
  }, [isDark, objects])

  function drawObject(ctx: CanvasRenderingContext2D, vp: typeof vpRef.current, obj: CanvasObjectType, dark: boolean) {
    const sx = (obj.x - vp.x) * vp.zoom
    const sy = (obj.y - vp.y) * vp.zoom
    const sw = obj.width * vp.zoom
    const sh = obj.height * vp.zoom

    const dpr = window.devicePixelRatio || 1
    const cw = ctx.canvas.width / dpr
    const ch = ctx.canvas.height / dpr
    if (sx + sw < -10 || sx > cw + 10 || sy + sh < -10 || sy > ch + 10) return

    const border = dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
    const fill = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'
    const textCol = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'

    ctx.strokeStyle = border
    ctx.lineWidth = 1
    ctx.fillStyle = fill
    const r = 6 * vp.zoom
    ctx.beginPath()
    ctx.roundRect(sx, sy, sw, sh, r)
    ctx.fill()
    ctx.stroke()

    const fs = Math.max(9, 12 * vp.zoom)
    ctx.font = `${fs}px system-ui, -apple-system, sans-serif`
    ctx.fillStyle = textCol
    ctx.textBaseline = 'top'
    ctx.fillText(shortId(obj.targetSpaceId), sx + 8 * vp.zoom, sy + 8 * vp.zoom)
  }

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

  // Initialize viewport on mount (center on origin)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // === Enter animation: zoom into object with smooth 3D-like transition ===
  useEffect(() => {
    if (!enterAnim || !canvasRef.current) return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const cw = rect.width, ch = rect.height

    const obj = enterAnim.obj
    const from = { x: vpRef.current.x, y: vpRef.current.y, zoom: vpRef.current.zoom }

    // Target: center on object, zoom so object fills ~80% of viewport
    const targetZoom = Math.min(cw / obj.width, ch / obj.height) * 0.8
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom))

    // Object center in world coords
    const objCx = obj.x + obj.width / 2
    const objCy = obj.y + obj.height / 2

    const to = {
      x: objCx - cw / (2 * clampedZoom),
      y: objCy - ch / (2 * clampedZoom),
      zoom: clampedZoom,
    }

    const duration = 400
    const start = performance.now()

    cancelAnimationFrame(animRef.current)
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const e = easeInOutCubic(t)
      vpRef.current.x = lerp(from.x, to.x, e)
      vpRef.current.y = lerp(from.y, to.y, e)
      vpRef.current.zoom = lerp(from.zoom, to.zoom, e)
      draw()
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick)
      } else {
        // Reset viewport for new space (centered on origin)
        const cvs = canvasRef.current
        if (cvs) {
          const r = cvs.getBoundingClientRect()
          vpRef.current.x = -r.width / 2
          vpRef.current.y = -r.height / 2
          vpRef.current.zoom = 1
          draw()
        }
        onEnterComplete(obj.targetSpaceId)
      }
    }
    animRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(animRef.current)
  }, [enterAnim, draw, onEnterComplete])

  // === Exit animation: zoom out to parent viewport ===
  useEffect(() => {
    if (!exitAnim || !canvasRef.current) return
    const from = { x: vpRef.current.x, y: vpRef.current.y, zoom: vpRef.current.zoom }
    const to = exitAnim.toViewport

    const duration = 350
    const start = performance.now()

    cancelAnimationFrame(animRef.current)
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const e = easeInOutCubic(t)
      vpRef.current.x = lerp(from.x, to.x, e)
      vpRef.current.y = lerp(from.y, to.y, e)
      vpRef.current.zoom = lerp(from.zoom, to.zoom, e)
      draw()
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick)
      } else {
        onExitComplete()
      }
    }
    animRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(animRef.current)
  }, [exitAnim, draw, onExitComplete])

  // === Events ===

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    const vp = vpRef.current
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * factor))
    if (newZoom !== vp.zoom) {
      const wx = cx / vp.zoom + vp.x
      const wy = cy / vp.zoom + vp.y
      vp.x = wx - cx / newZoom
      vp.y = wy - cy / newZoom
      vp.zoom = newZoom
      showZoomLabel(`${Math.round(newZoom * 100)}%`)
      draw()
    }
  }, [draw, showZoomLabel])

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

    // Check click on space objects
    for (const obj of objects) {
      if (obj.type === 'space' &&
          wx >= obj.x && wx <= obj.x + obj.width &&
          wy >= obj.y && wy <= obj.y + obj.height) {
        onEnterSpace(obj.targetSpaceId, obj, { x: vp.x, y: vp.y, zoom: vp.zoom })
        return
      }
    }

    panning.current = true
    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, vx: vp.x, vy: vp.y }
  }, [objects, onEnterSpace])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!panning.current) return
    const vp = vpRef.current
    vp.x = panStart.current.vx - (e.clientX - panStart.current.x) / vp.zoom
    vp.y = panStart.current.vy - (e.clientY - panStart.current.y) / vp.zoom
    draw()
  }, [draw])

  const onMouseUp = useCallback(() => { panning.current = false; setIsPanning(false) }, [])

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
          opacity: 0.15,
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
