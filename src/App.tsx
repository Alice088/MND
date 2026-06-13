import { useState, useCallback } from 'react'
import type { Space, CanvasObject, NoteObject, FileObject, LinkObject, ShapeObject } from './types'
import { createId, shortId } from './types'
import Canvas from './Canvas'
import ContextMenu from './ContextMenu'
import './App.css'

interface NavEntry {
  spaceId: string
  viewport: { x: number; y: number; zoom: number }
}

function createSpace(id: string, parentId: string | null): Space {
  return {
    id,
    name: shortId(id),
    parentId,
    viewport: { x: 0, y: 0, zoom: 1 },
    objects: [],
  }
}

const ROOT_ID = createId()
const root = createSpace(ROOT_ID, null)
root.viewport = { x: -960, y: -540, zoom: 1 }

const DEMO_ID = createId()
const demo = createSpace(DEMO_ID, ROOT_ID)
demo.viewport = { x: -960, y: -540, zoom: 1 }

root.objects.push({
  id: createId(),
  type: 'space',
  name: shortId(DEMO_ID),
  x: -200,
  y: -100,
  width: 400,
  height: 300,
  targetSpaceId: DEMO_ID,
})

export default function App() {
  const [isDark, setIsDark] = useState(false)
  const [currentId, setCurrentId] = useState(ROOT_ID)
  const [spaces, setSpaces] = useState<Record<string, Space>>({
    [ROOT_ID]: root,
    [DEMO_ID]: demo,
  })
  const [navStack, setNavStack] = useState<NavEntry[]>([])
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    worldX: number
    worldY: number
  } | null>(null)

  // Flash transition state
  const [flashVisible, setFlashVisible] = useState(false)

  const currentSpace = spaces[currentId]
  const isRoot = currentId === ROOT_ID

  // Helper: flash transition with space switch
  const flashTransition = useCallback((doSwitch: () => void) => {
    setFlashVisible(true)
    // After CSS transition (0→1 over 150ms), switch space mid-flash
    setTimeout(() => {
      doSwitch()
      // Next frame: start fade-out
      requestAnimationFrame(() => {
        setFlashVisible(false)
      })
    }, 180)
  }, [])

  // Enter space
  const handleEnterSpace = useCallback((
    targetId: string,
    _obj: CanvasObject,
    currentVp: { x: number; y: number; zoom: number },
  ) => {
    flashTransition(() => {
      setNavStack(prev => [...prev, { spaceId: currentId, viewport: currentVp }])
      setCurrentId(targetId)
    })
  }, [currentId, flashTransition])

  // Exit space (via back button or double-click on empty)
  const handleLeaveSpace = useCallback(() => {
    if (navStack.length === 0) return
    const prev = navStack[navStack.length - 1]
    flashTransition(() => {
      setCurrentId(prev.spaceId)
      setNavStack(stack => stack.slice(0, -1))
    })
  }, [navStack, flashTransition])

  // Reset to root
  const handleResetView = useCallback(() => {
    flashTransition(() => {
      setNavStack([])
      setCurrentId(ROOT_ID)
    })
  }, [flashTransition])

  // Update object position (after drag)
  const handleUpdateObject = useCallback((objectId: string, x: number, y: number) => {
    setSpaces(prev => ({
      ...prev,
      [currentId]: {
        ...prev[currentId],
        objects: prev[currentId].objects.map(o =>
          o.id === objectId ? { ...o, x, y } : o
        ),
      },
    }))
  }, [currentId])

  // Create object (from context menu)
  const handleCreateObject = useCallback((
    type: 'space' | 'note' | 'file' | 'link' | 'shape',
    worldX: number, worldY: number,
    extra?: Record<string, unknown>,
  ) => {
    setSpaces(prev => {
      const space = prev[currentId]
      const defSize = (() => {
        switch (type) {
          case 'space': return { w: 400, h: 300 }
          case 'note': return { w: 200, h: 160 }
          case 'file': return { w: 220, h: 180 }
          case 'link': return { w: 200, h: 120 }
          case 'shape': return { w: 160, h: 160 }
        }
      })()

      const id = createId()
      let obj: CanvasObject

      switch (type) {
        case 'space': {
          const spaceId = createId()
          obj = {
            id, type: 'space', name: shortId(spaceId),
            x: worldX - defSize.w / 2, y: worldY - defSize.h / 2,
            width: defSize.w, height: defSize.h,
            targetSpaceId: spaceId,
          } as CanvasObject
          const newSpace: Space = createSpace(spaceId, currentId)
          return {
            ...prev,
            [spaceId]: newSpace,
            [currentId]: { ...space, objects: [...space.objects, obj] },
          }
        }
        case 'note':
          obj = {
            id, type: 'note', name: '', content: '',
            x: worldX - defSize.w / 2, y: worldY - defSize.h / 2,
            width: defSize.w, height: defSize.h,
          } as NoteObject
          break
        case 'file':
          obj = {
            id, type: 'file', name: '',
            x: worldX - defSize.w / 2, y: worldY - defSize.h / 2,
            width: defSize.w, height: defSize.h,
          } as FileObject
          break
        case 'link':
          obj = {
            id, type: 'link', name: '', url: '',
            x: worldX - defSize.w / 2, y: worldY - defSize.h / 2,
            width: defSize.w, height: defSize.h,
          } as LinkObject
          break
        case 'shape':
          obj = {
            id, type: 'shape', name: '',
            x: worldX - defSize.w / 2, y: worldY - defSize.h / 2,
            width: defSize.w, height: defSize.h,
            kind: (extra?.kind as string) || 'rectangle',
          } as ShapeObject
          break
      }

      return {
        ...prev,
        [currentId]: { ...space, objects: [...space.objects, obj] },
      }
    })
  }, [currentId])

  const handleContextMenu = useCallback((worldX: number, worldY: number, screenX: number, screenY: number) => {
    setContextMenu({ x: screenX, y: screenY, worldX, worldY })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  return (
    <div className={`mnd ${isDark ? 'mnd--dark' : 'mnd--light'}`}>
      <Canvas
        key={currentId}
        isDark={isDark}
        spaceId={currentId}
        objects={currentSpace.objects}
        onEnterSpace={handleEnterSpace}
        onGoBack={handleLeaveSpace}
        onUpdateObject={handleUpdateObject}
        onContextMenu={handleContextMenu}
      />

      {/* Flash overlay for space transitions */}
      <div
        className="flash-overlay"
        style={{
          background: isDark ? '#000000' : '#ffffff',
          opacity: flashVisible ? 1 : 0,
          pointerEvents: flashVisible ? 'auto' : 'none',
        }}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          worldX={contextMenu.worldX}
          worldY={contextMenu.worldY}
          onCreateObject={handleCreateObject}
          onClose={closeContextMenu}
          isDark={isDark}
        />
      )}

      <div className="controls" onContextMenu={(e) => e.stopPropagation()}>
        {!isRoot && (
          <button className="control-btn" onClick={handleLeaveSpace} title="Back">
            ←
          </button>
        )}
        <button className="control-btn" onClick={handleResetView} title="Home">
          ⌂
        </button>
        <button
          className="control-btn"
          onClick={() => setIsDark(d => !d)}
          title={isDark ? 'White' : 'Black'}
        >
          {isDark ? '☀' : '☾'}
        </button>
      </div>
    </div>
  )
}
