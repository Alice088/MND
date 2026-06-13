import { useRef, useEffect, useState, useCallback } from 'react'
import type { CanvasObject as CanvasObjectType, SpaceObjectDef, NoteObject, FileObject, LinkObject, ShapeObject } from './types'
import { shortId } from './types'

interface Props {
  isDark: boolean
  spaceId: string
  objects: CanvasObjectType[]
  onEnterSpace: (targetId: string, obj: CanvasObjectType, currentVp: { x: number; y: number; zoom: number }) => void
  onGoBack: () => void
  onUpdateObject: (objectId: string, x: number, y: number) => void
  onResizeObject?: (objectId: string, x: number, y: number, width: number, height: number) => void
  onContextMenu?: (worldX: number, worldY: number, screenX: number, screenY: number) => void
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 5
const HIT_RADIUS = 6 // screen px for edge detection
const MIN_OBJ_SIZE = 60 // world px minimum

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

// ─── Edge detection ───
interface Edges { left: boolean; right: boolean; top: boolean; bottom: boolean }

function detectEdges(smx: number, smy: number, obj: CanvasObjectType, vp: { x: number; y: number; zoom: number }): Edges | null {
  const sx = (obj.x - vp.x) * vp.zoom
  const sy = (obj.y - vp.y) * vp.zoom
  const sw = obj.width * vp.zoom
  const sh = obj.height * vp.zoom
  const left = Math.abs(smx - sx) <= HIT_RADIUS && smy >= sy && smy <= sy + sh
  const right = Math.abs(smx - (sx + sw)) <= HIT_RADIUS && smy >= sy && smy <= sy + sh
  const top = Math.abs(smy - sy) <= HIT_RADIUS && smx >= sx && smx <= sx + sw
  const bottom = Math.abs(smy - (sy + sh)) <= HIT_RADIUS && smx >= sx && smx <= sx + sw
  if (left || right || top || bottom) return { left, right, top, bottom }
  return null
}

function cursorForEdges(e: Edges): string {
  if (e.left && e.top) return 'nwse-resize'
  if (e.left && e.bottom) return 'nesw-resize'
  if (e.right && e.top) return 'nesw-resize'
  if (e.right && e.bottom) return 'nwse-resize'
  if (e.left || e.right) return 'ew-resize'
  if (e.top || e.bottom) return 'ns-resize'
  return 'grab'
}

export default function Canvas({
  isDark, spaceId, objects, onEnterSpace, onGoBack, onUpdateObject, onResizeObject, onContextMenu: onCtx,
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

  // Resize state
  const resizeRef = useRef<{
    objId: string
    edges: Edges
    startSmx: number
    startSmy: number
    origX: number
    origY: number
    origW: number
    origH: number
  } | null>(null)
  const resizePreviewRef = useRef<{ id: string; x: number; y: number; w: number; h: number } | null>(null)

  // Hover (for handles + cursor)
  const [hoverCursor, setHoverCursor] = useState<string | null>(null)
  const hoverEdgesRef = useRef<{ objId: string; edges: Edges } | null>(null)

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

  // ─── Draw ───
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

    // Draw objects
    for (const obj of objects) {
      let ox = obj.x, oy = obj.y
      let ow = obj.width, oh = obj.height

      const drag = dragPosRef.current
      if (drag && drag.id === obj.id) { ox = drag.x; oy = drag.y }
      const rez = resizePreviewRef.current
      if (rez && rez.id === obj.id) { ox = rez.x; oy = rez.y; ow = rez.w; oh = rez.h }

      const sx = (ox - vp.x) * vp.zoom
      const sy = (oy - vp.y) * vp.zoom
      const sw = ow * vp.zoom
      const sh = oh * vp.zoom
      if (sx + sw < 0 || sx > w || sy + sh < 0 || sy > h) continue

      const label = obj.name || shortId(obj.id)

      switch (obj.type) {
        case 'space':
          drawSpaceObject(ctx, sx, sy, sw, sh, vp.zoom, dark, (obj as SpaceObjectDef).targetSpaceId, label)
          break
        case 'note':
          drawNoteObject(ctx, sx, sy, sw, sh, vp.zoom, dark, (obj as NoteObject).content, label)
          break
        case 'file':
          drawFileObject(ctx, sx, sy, sw, sh, vp.zoom, dark, (obj as FileObject).mime_type, label)
          break
        case 'link':
          drawLinkObject(ctx, sx, sy, sw, sh, vp.zoom, dark, (obj as LinkObject).url, label)
          break
        case 'shape': {
          const kind = (obj as ShapeObject).kind
          drawShapeObject(ctx, sx, sy, sw, sh, vp.zoom, dark, kind, label)
          break
        }
      }

      // Draw resize handles on hovered or actively resizing object
      const hovered = hoverEdgesRef.current
      if (hovered && hovered.objId === obj.id) {
        drawResizeHandles(ctx, sx, sy, sw, sh, vp.zoom, dark)
      }
      if (rez && rez.id === obj.id) {
        drawResizeHandles(ctx, sx, sy, sw, sh, vp.zoom, dark)
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

  // ─── Resize handles ───
  function drawResizeHandles(
    ctx: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number,
    _zoom: number, dark: boolean,
  ) {
    const hs = 5 // handle half-size in screen px
    const fill = dark ? '#ffffff' : '#000000'
    const stroke = dark ? '#000000' : '#ffffff'
    const points = [
      [sx, sy], [sx + sw / 2, sy], [sx + sw, sy],
      [sx, sy + sh / 2], [sx + sw, sy + sh / 2],
      [sx, sy + sh], [sx + sw / 2, sy + sh], [sx + sw, sy + sh],
    ]
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1
    for (const [px, py] of points) {
      ctx.fillRect(px - hs, py - hs, hs * 2, hs * 2)
      ctx.strokeRect(px - hs, py - hs, hs * 2, hs * 2)
    }
  }

  // ─── Object drawing helpers ───

  function drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, Math.max(0, r))
    } else {
      ctx.rect(x, y, w, h)
    }
  }

  function drawSpaceObject(
    ctx: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number,
    zoom: number, dark: boolean, _targetId: string, label: string,
  ) {
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'
    ctx.lineWidth = 1.5
    drawRect(ctx, sx, sy, sw, sh, 3 * zoom)
    ctx.fill()
    ctx.stroke()

    // Centered name with fixed font size + word-wrap
    if (sw > 40 && sh > 30 && label) {
      const baseSize = 14 // world px, stable across zoom
      const fontSize = baseSize * zoom
      const padX = 12 * zoom
      const maxW = sw - padX * 2
      const lineH = fontSize * 1.3

      if (maxW > 10) {
        ctx.font = `${fontSize}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)'

        const words = label.split(/\s+/)
        let lines: string[] = []
        let cur = ''
        for (const w of words) {
          const test = cur ? cur + ' ' + w : w
          if (ctx.measureText(test).width > maxW && cur) {
            lines.push(cur)
            cur = w
          } else {
            cur = test
          }
        }
        if (cur) lines.push(cur)

        const totalH = lines.length * lineH
        const startY = sy + sh / 2 - totalH / 2 + lineH / 2
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], sx + sw / 2, startY + i * lineH)
        }
      }
    }
  }

  function drawNoteObject(
    ctx: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number,
    zoom: number, dark: boolean, _content: string, label: string,
  ) {
    const fill = dark ? 'rgba(255,255,220,0.08)' : 'rgba(255,255,200,0.25)'
    ctx.fillStyle = fill
    ctx.strokeStyle = dark ? 'rgba(255,255,220,0.3)' : 'rgba(180,180,120,0.5)'
    ctx.lineWidth = 1.5
    drawRect(ctx, sx, sy, sw, sh, 2 * zoom)
    ctx.fill()
    ctx.stroke()

    if (sw > 50 && sh > 40) {
      ctx.strokeStyle = dark ? 'rgba(255,255,220,0.15)' : 'rgba(120,120,80,0.25)'
      ctx.lineWidth = 1
      const pad = 8 * zoom
      const lineH = Math.max(6, 10 * zoom)
      for (let i = 0; i < 3; i++) {
        const ly = sy + pad + (i + 1) * lineH
        if (ly > sy + sh - pad) break
        ctx.beginPath()
        ctx.moveTo(sx + pad, ly)
        ctx.lineTo(sx + sw - pad - (i === 0 ? 20 * zoom : 0), ly)
        ctx.stroke()
      }
    }

    if (sw > 30 && sh > 20) {
      ctx.fillStyle = dark ? 'rgba(255,255,220,0.5)' : 'rgba(80,80,50,0.7)'
      ctx.font = `${Math.max(9, 11 * zoom)}px system-ui, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(label, sx + 6 * zoom, sy + 6 * zoom)
    }
  }

  function drawFileObject(
    ctx: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number,
    zoom: number, dark: boolean, _mime: string | undefined, label: string,
  ) {
    const fill = dark ? 'rgba(200,220,255,0.06)' : 'rgba(200,220,255,0.2)'
    ctx.fillStyle = fill
    ctx.strokeStyle = dark ? 'rgba(200,220,255,0.3)' : 'rgba(100,130,180,0.5)'
    ctx.lineWidth = 1.5
    drawRect(ctx, sx, sy, sw, sh, 2 * zoom)
    ctx.fill()
    ctx.stroke()

    if (sw > 30 && sh > 30) {
      const fold = Math.min(20 * zoom, sw * 0.25, sh * 0.25)
      ctx.strokeStyle = dark ? 'rgba(200,220,255,0.2)' : 'rgba(100,130,180,0.3)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sx + sw - fold, sy)
      ctx.lineTo(sx + sw - fold, sy + fold)
      ctx.lineTo(sx + sw, sy + fold)
      ctx.stroke()
    }

    if (sw > 30 && sh > 20) {
      ctx.fillStyle = dark ? 'rgba(200,220,255,0.5)' : 'rgba(60,80,120,0.7)'
      ctx.font = `${Math.max(9, 11 * zoom)}px system-ui, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(label, sx + 6 * zoom, sy + 6 * zoom)
    }
  }

  function drawLinkObject(
    ctx: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number,
    zoom: number, dark: boolean, _url: string, label: string,
  ) {
    const fill = dark ? 'rgba(180,200,255,0.05)' : 'rgba(180,200,255,0.15)'
    ctx.fillStyle = fill
    ctx.strokeStyle = dark ? 'rgba(180,200,255,0.3)' : 'rgba(80,120,200,0.5)'
    ctx.lineWidth = 1.5
    drawRect(ctx, sx, sy, sw, sh, 4 * zoom)
    ctx.fill()
    ctx.stroke()

    if (sw > 40 && sh > 30) {
      ctx.strokeStyle = dark ? 'rgba(180,200,255,0.2)' : 'rgba(80,120,200,0.35)'
      ctx.lineWidth = 1
      const pad = 8 * zoom
      ctx.beginPath()
      ctx.moveTo(sx + pad, sy + sh - pad)
      ctx.lineTo(sx + sw - pad, sy + sh - pad)
      ctx.stroke()

      ctx.fillStyle = dark ? 'rgba(180,200,255,0.5)' : 'rgba(60,80,160,0.7)'
      ctx.font = `${Math.max(9, 11 * zoom)}px system-ui, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(label, sx + 6 * zoom, sy + 6 * zoom)
    }
  }

  function drawShapeObject(
    ctx: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number,
    zoom: number, dark: boolean, kind: string, label: string,
  ) {
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'
    ctx.lineWidth = 1.5

    if (kind === 'circle') {
      const cx2 = sx + sw / 2, cy2 = sy + sh / 2
      const rx = sw / 2, ry = sh / 2
      ctx.beginPath()
      ctx.ellipse(cx2, cy2, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    } else {
      drawRect(ctx, sx, sy, sw, sh, 0)
      ctx.fill()
      ctx.stroke()
    }

    if (sw > 30 && sh > 20) {
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
      ctx.font = `${Math.max(9, 11 * zoom)}px system-ui, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(label, sx + 6 * zoom, sy + 6 * zoom)
    }
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

  // === Wheel zoom ===
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const vp = vpRef.current
    const delta = -e.deltaY * 0.001
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * (1 + delta)))
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cxx = rect.width / 2, cyy = rect.height / 2
    const wx = cxx / vp.zoom + vp.x
    const wy = cyy / vp.zoom + vp.y
    vp.x = wx - cxx / newZoom
    vp.y = wy - cyy / newZoom
    vp.zoom = newZoom
    draw()
    showZoomLabel(`${Math.round(newZoom * 100)}%`)
  }, [draw, showZoomLabel])

  // ─── Compute resize values from mouse delta ───
  function computeResize(
    edges: Edges, origX: number, origY: number, origW: number, origH: number,
    dx: number, dy: number,
  ): { x: number; y: number; w: number; h: number } {
    let nx = origX, ny = origY, nw = origW, nh = origH
    if (edges.left) { nx = origX + dx; nw = origW - dx }
    if (edges.right) { nw = origW + dx }
    if (edges.top) { ny = origY + dy; nh = origH - dy }
    if (edges.bottom) { nh = origH + dy }

    // Enforce min size
    if (nw < MIN_OBJ_SIZE) {
      if (edges.left) nx = origX + origW - MIN_OBJ_SIZE
      nw = MIN_OBJ_SIZE
    }
    if (nh < MIN_OBJ_SIZE) {
      if (edges.top) ny = origY + origH - MIN_OBJ_SIZE
      nh = MIN_OBJ_SIZE
    }
    return { x: nx, y: ny, w: nw, h: nh }
  }

  // === Mouse ===
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const smx = e.clientX - rect.left
    const smy = e.clientY - rect.top
    const vp = vpRef.current
    const wx = smx / vp.zoom + vp.x
    const wy = smy / vp.zoom + vp.y

    // Check edge hit → resize
    for (const obj of objects) {
      const edges = detectEdges(smx, smy, obj, vp)
      if (edges) {
        resizeRef.current = {
          objId: obj.id,
          edges,
          startSmx: smx,
          startSmy: smy,
          origX: obj.x,
          origY: obj.y,
          origW: obj.width,
          origH: obj.height,
        }
        return
      }
    }

    // Check inside object → drag
    for (const obj of objects) {
      if (wx >= obj.x && wx <= obj.x + obj.width &&
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

    // Not on object → pan
    panning.current = true
    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY, vx: vp.x, vy: vp.y }
  }, [objects])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const smx = e.clientX - rect.left
    const smy = e.clientY - rect.top
    const vp = vpRef.current

    // Resizing
    if (resizeRef.current) {
      const r = resizeRef.current
      const dx = (smx - r.startSmx) / vp.zoom
      const dy = (smy - r.startSmy) / vp.zoom
      const res = computeResize(r.edges, r.origX, r.origY, r.origW, r.origH, dx, dy)
      resizePreviewRef.current = { id: r.objId, x: res.x, y: res.y, w: res.w, h: res.h }
      draw()
      return
    }

    // Dragging
    if (dragRef.current) {
      const mx = smx / vp.zoom
      const my = smy / vp.zoom
      const newX = mx + vp.x - dragRef.current.offsetX
      const newY = my + vp.y - dragRef.current.offsetY
      dragPosRef.current = { id: dragRef.current.objId, x: newX, y: newY }
      draw()
      return
    }

    // Panning
    if (panning.current) {
      vp.x = panStart.current.vx - (e.clientX - panStart.current.x) / vp.zoom
      vp.y = panStart.current.vy - (e.clientY - panStart.current.y) / vp.zoom
      draw()
      return
    }

    // Hover: detect edges for cursor + handles
    let found: { objId: string; edges: Edges } | null = null
    for (const obj of objects) {
      const edges = detectEdges(smx, smy, obj, vp)
      if (edges) { found = { objId: obj.id, edges }; break }
    }
    hoverEdgesRef.current = found
    if (found) {
      setHoverCursor(cursorForEdges(found.edges))
    } else {
      setHoverCursor(null)
    }
    draw()
  }, [draw, objects])

  const onMouseUp = useCallback(() => {
    // Commit resize
    if (resizeRef.current) {
      const prev = resizePreviewRef.current
      if (prev && onResizeObject) {
        onResizeObject(prev.id, prev.x, prev.y, prev.w, prev.h)
      }
      resizeRef.current = null
      resizePreviewRef.current = null
      draw()
      return
    }

    // Commit drag
    if (dragRef.current) {
      const pos = dragPosRef.current
      if (pos) {
        onUpdateObject(pos.id, pos.x, pos.y)
      }
      dragRef.current = null
      dragPosRef.current = null
      draw()
      return
    }

    panning.current = false
    setIsPanning(false)
  }, [onUpdateObject, onResizeObject, draw])

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

    for (const obj of objects) {
      if (obj.type === 'space' &&
          wx >= obj.x && wx <= obj.x + obj.width &&
          wy >= obj.y && wy <= obj.y + obj.height) {
        onEnterSpace((obj as any).targetSpaceId, obj, { x: vp.x, y: vp.y, zoom: vp.zoom })
        return
      }
    }
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

  // Determine cursor
  let cursorStyle = 'grab'
  if (isPanning) cursorStyle = 'grabbing'
  else if (hoverCursor) cursorStyle = hoverCursor

  const labelColor = isDark ? '#ffffff' : '#000000'

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: cursorStyle,
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
