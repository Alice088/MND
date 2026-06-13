import { useRef, useEffect, useState, useCallback } from 'react'

interface CanvasProps {
  isDark: boolean
  resetCount: number
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 5

const GRID_LEVELS = [
  { step: 1,    minZoom: 32 },
  { step: 2,    minZoom: 16 },
  { step: 5,    minZoom: 8 },
  { step: 10,   minZoom: 4 },
  { step: 20,   minZoom: 2 },
  { step: 50,   minZoom: 1 },
  { step: 100,  minZoom: 0.5 },
  { step: 200,  minZoom: 0.25 },
  { step: 500,  minZoom: 0.12 },
  { step: 1000, minZoom: 0.06 },
  { step: 2000, minZoom: 0.03 },
  { step: 5000, minZoom: 0.015 },
  { step: 10000, minZoom: 0.008 },
  { step: 20000, minZoom: 0.004 },
  { step: 50000, minZoom: 0.002 },
  { step: 100000, minZoom: 0.001 },
]

function getGridIdx(zoom: number) {
  for (let i = GRID_LEVELS.length - 1; i >= 0; i--) {
    if (zoom <= GRID_LEVELS[i].minZoom) return i
  }
  return 0
}

export default function Canvas({ isDark, resetCount }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vpRef = useRef({ x: 0, y: 0, zoom: 1 })
  const panning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [zoomText, setZoomText] = useState('')
  const [labelOpacity, setLabelOpacity] = useState(0)

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

    // Adaptive fractal-like grid
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
    if (idx < GRID_LEVELS.length - 1) {
      drawGrid(ctx, vp, w, h, isDark, next.step, blend)
    }

    // Origin crosshair
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
    ctx.lineWidth = 1
    const ox = -vp.x * vp.zoom
    const oy = -vp.y * vp.zoom
    ctx.beginPath()
    ctx.moveTo(ox - 8, oy)
    ctx.lineTo(ox + 8, oy)
    ctx.moveTo(ox, oy - 8)
    ctx.lineTo(ox, oy + 8)
    ctx.stroke()
  }, [isDark])

  function drawGrid(
    ctx: CanvasRenderingContext2D,
    vp: { x: number; y: number; zoom: number },
    w: number, h: number,
    isDark: boolean,
    step: number,
    alphaMul: number,
  ) {
    if (alphaMul <= 0) return
    const gs = step * vp.zoom
    if (gs < 2) return

    const alpha = 0.06 * alphaMul
    if (alpha < 0.002) return

    ctx.strokeStyle = isDark
      ? `rgba(255,255,255,${alpha})`
      : `rgba(0,0,0,${alpha})`
    ctx.lineWidth = 1
    ctx.beginPath()

    const ox = ((-vp.x * vp.zoom) % gs + gs) % gs
    const oy = ((-vp.y * vp.zoom) % gs + gs) % gs

    for (let x = ox; x <= w; x += gs) {
      ctx.moveTo(Math.round(x) + 0.5, 0)
      ctx.lineTo(Math.round(x) + 0.5, h)
    }
    for (let y = oy; y <= h; y += gs) {
      ctx.moveTo(0, Math.round(y) + 0.5)
      ctx.lineTo(w, Math.round(y) + 0.5)
    }
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

  // Theme change
  useEffect(() => { draw() }, [draw])

  // Reset viewport — center on origin
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { width: w, height: h } = canvas.getBoundingClientRect()
    vpRef.current.x = -w / 2
    vpRef.current.y = -h / 2
    vpRef.current.zoom = 1
    draw()
  }, [resetCount, draw])

  // === Zoom label animation ===
  const fadeTimer = useRef(0)
  const fadeAnim = useRef(0)

  const showZoomLabel = useCallback((text: string) => {
    cancelAnimationFrame(fadeAnim.current)
    clearTimeout(fadeTimer.current)

    setZoomText(text)
    setLabelOpacity(0.15)

    fadeTimer.current = window.setTimeout(() => {
      let opacity = 0.15
      const step = () => {
        opacity -= 0.003
        if (opacity <= 0) {
          setLabelOpacity(0)
          return
        }
        setLabelOpacity(opacity)
        fadeAnim.current = requestAnimationFrame(step)
      }
      fadeAnim.current = requestAnimationFrame(step)
    }, 1000)
  }, [])

  useEffect(() => () => {
    clearTimeout(fadeTimer.current)
    cancelAnimationFrame(fadeAnim.current)
  }, [])

  // === Events ===

  // Zoom towards center
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
      const wx = cx / vp.zoom - vp.x
      const wy = cy / vp.zoom - vp.y
      vp.x = cx / newZoom - wx
      vp.y = cy / newZoom - wy
      vp.zoom = newZoom

      showZoomLabel(`${Math.round(newZoom * 100)}%`)
      draw()
    }
  }, [draw, showZoomLabel])

  // Left-click pan — canvas follows mouse
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      panning.current = true
      setIsPanning(true)
      panStart.current = {
        x: e.clientX, y: e.clientY,
        vx: vpRef.current.x, vy: vpRef.current.y,
      }
    }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!panning.current) return
    const vp = vpRef.current
    const dx = (e.clientX - panStart.current.x) / vp.zoom
    const dy = (e.clientY - panStart.current.y) / vp.zoom
    vp.x = panStart.current.vx - dx
    vp.y = panStart.current.vy - dy
    draw()
  }, [draw])

  const onMouseUp = useCallback(() => {
    panning.current = false
    setIsPanning(false)
  }, [])

  // Touch pan
  const touchRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0]
      touchRef.current = {
        x: t.clientX, y: t.clientY,
        vx: vpRef.current.x, vy: vpRef.current.y,
      }
    }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current || e.touches.length !== 1) return
    const t = e.touches[0]
    const vp = vpRef.current
    const dx = (t.clientX - touchRef.current.x) / vp.zoom
    const dy = (t.clientY - touchRef.current.y) / vp.zoom
    vp.x = touchRef.current.vx - dx
    vp.y = touchRef.current.vy - dy
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
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />
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
