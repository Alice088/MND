import { useState, useCallback } from 'react'
import type { Space, CanvasObject } from './types'
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
    _targetId: string,
    obj: CanvasObject,
    currentVp: { x: number; y: number; zoom: number },
  ) => {
    const targetId = obj.targetSpaceId
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

  // Create child space
  const createChildSpace = useCallback((worldX: number, worldY: number) => {
    const id = createId()
    const obj: CanvasObject = {
      id: createId(),
      type: 'space',
      name: shortId(id),
      x: worldX - 200,
      y: worldY - 150,
      width: 400,
      height: 300,
      targetSpaceId: id,
    }
    setSpaces(prev => ({
      ...prev,
      [id]: createSpace(id, currentId),
      [currentId]: {
        ...prev[currentId],
        objects: [...prev[currentId].objects, obj],
      },
    }))
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
          onCreateSpace={createChildSpace}
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
