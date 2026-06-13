import { useState, useCallback, useEffect } from 'react'
import Canvas from './Canvas'
import ContextMenu from './ContextMenu'
import SearchOverlay from './SearchOverlay'
import { useStore } from './store'
import './App.css'

// Global error logging
if (typeof window !== 'undefined') {
  const errDiv = document.createElement('pre')
  errDiv.id = 'mnd-error'
  errDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:rgba(200,0,0,0.9);color:#fff;padding:8px 12px;font:12px monospace;white-space:pre-wrap;display:none'
  document.body.appendChild(errDiv)
  window.addEventListener('error', (e) => {
    errDiv.style.display = 'block'
    errDiv.textContent = '🛑 ' + e.message
    console.error('[MND Error]', e.error || e.message)
  })
  window.addEventListener('unhandledrejection', (e) => {
    errDiv.style.display = 'block'
    errDiv.textContent = '🛑 Promise: ' + (e.reason?.message || String(e.reason))
    console.error('[MND Promise]', e.reason)
  })
}

export default function App() {
  const store = useStore()

  const [isDark, setIsDark] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    worldX: number
    worldY: number
  } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  // Flash transition state
  const [flashVisible, setFlashVisible] = useState(false)

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K → search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
        return
      }
      // Delete/Backspace → delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && !searchOpen) {
        // Canvas handles selection via its own state. We'll emit a custom event.
        // Instead, let Canvas handle it internally.
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen])

  // Helper: flash transition with space switch
  const flashTransition = useCallback((doSwitch: () => void) => {
    setFlashVisible(true)
    setTimeout(() => {
      doSwitch()
      requestAnimationFrame(() => {
        setFlashVisible(false)
      })
    }, 180)
  }, [])

  const handleEnterSpace = useCallback((
    targetId: string,
    _obj: any,
    currentVp: { x: number; y: number; zoom: number },
  ) => {
    flashTransition(() => {
      store.enterSpace(targetId, currentVp)
    })
  }, [store, flashTransition])

  const handleLeaveSpace = useCallback(() => {
    flashTransition(() => {
      store.leaveSpace()
    })
  }, [store, flashTransition])

  const handleResetView = useCallback(() => {
    flashTransition(() => {
      store.resetToRoot()
    })
  }, [store, flashTransition])

  const handleContextMenu = useCallback((worldX: number, worldY: number, screenX: number, screenY: number) => {
    setContextMenu({ x: screenX, y: screenY, worldX, worldY })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // Navigate from search → jump to the space containing the object
  const handleSearchNavigate = useCallback((spaceId: string, _objectId: string) => {
    flashTransition(() => {
      store.jumpToSpace(spaceId)
    })
  }, [store, flashTransition])

  // Workspace switcher
  const [showWorkspaces, setShowWorkspaces] = useState(false)

  // Guard: if current space not found (e.g. deleted or corrupted), show fallback
  if (!store.currentSpace) {
    return (
      <div className={`mnd ${isDark ? 'mnd--dark' : 'mnd--light'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: isDark ? '#ccc' : '#666', fontFamily: 'system-ui, sans-serif', fontSize: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>⊞</div>
          <div>Space not found. <button onClick={() => { store.jumpToSpace((window as any).__MND_ROOT_ID) }} style={{ background: 'none', border: 'none', color: '#6af', cursor: 'pointer', fontSize: 14, textDecoration: 'underline' }}>Go to root</button></div>
        </div>
      </div>
    )
  }

  return (
    <div className={`mnd ${isDark ? 'mnd--dark' : 'mnd--light'}`}>
      <Canvas
        key={store.currentId}
        isDark={isDark}
        spaceId={store.currentId}
        path={store.path}
        objects={store.currentSpace.objects}
        onEnterSpace={handleEnterSpace}
        onGoBack={handleLeaveSpace}
        onUpdateObject={store.updateObject}
        onResizeObject={store.resizeObject}
        onRenameObject={store.renameObject}
        onBodyEdit={store.bodyEdit}
        onFontSizeChange={store.fontSizeChange}
        onDeleteObject={store.deleteObject}
        onContextMenu={handleContextMenu}
        pendingEditId={store.pendingEditId}
        onPendingEditClear={store.clearPendingEdit}
        pendingBodyEditId={store.pendingBodyEditId}
        onPendingBodyEditClear={store.clearPendingBodyEdit}
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
          onCreateObject={store.createObject}
          onClose={closeContextMenu}
          isDark={isDark}
        />
      )}

      <SearchOverlay
        isDark={isDark}
        allObjects={store.allObjects}
        onNavigate={handleSearchNavigate}
        onClose={() => setSearchOpen(false)}
        isOpen={searchOpen}
      />

      {/* Controls */}
      <div className="controls" onContextMenu={(e) => e.stopPropagation()}>
        {!store.isRoot && (
          <button className="control-btn" onClick={handleLeaveSpace} title="Back (Esc)">
            ←
          </button>
        )}
        <button className="control-btn" onClick={handleResetView} title="Home">
          ⌂
        </button>
        <button
          className="control-btn"
          onClick={() => setIsDark(d => !d)}
          title={isDark ? 'Light' : 'Dark'}
        >
          {isDark ? '☀' : '☾'}
        </button>
        <button
          className="control-btn"
          onClick={() => setSearchOpen(true)}
          title="Search (Cmd/Ctrl+K)"
          style={{ fontSize: 14, fontWeight: 600 }}
        >
          🔍
        </button>
        {/* Workspace switcher */}
        <button
          className="control-btn"
          onClick={() => setShowWorkspaces(prev => !prev)}
          title="Workspaces"
          style={{ fontSize: 14 }}
        >
          ⊞
        </button>
      </div>

      {/* Workspace menu */}
      {showWorkspaces && (
        <div
          className="workspace-menu"
          onMouseDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
        >
          <div className="workspace-menu__header">
            Workspaces
          </div>
          {store.workspaces.map((ws) => (
            <div
              key={ws.id}
              className={`workspace-menu__item ${ws.id === store.activeWorkspace ? 'workspace-menu__item--active' : ''}`}
              onClick={() => {
                if (ws.id !== store.activeWorkspace) {
                  flashTransition(() => {
                    store.switchWorkspace(ws.id)
                  })
                }
                setShowWorkspaces(false)
              }}
            >
              <span>{ws.name}</span>
              {ws.id === store.activeWorkspace && (
                <span style={{ fontSize: 12, opacity: 0.5 }}>✓</span>
              )}
            </div>
          ))}
          <div
            className="workspace-menu__item workspace-menu__item--new"
            onClick={() => {
              const name = prompt('Workspace name:')
              if (name?.trim()) {
                flashTransition(() => {
                  store.createWorkspace(name.trim())
                })
              }
              setShowWorkspaces(false)
            }}
          >
            + New Workspace
          </div>
        </div>
      )}

      <div
        style={{
          position: 'fixed',
          bottom: 20,
          left: 20,
          zIndex: 1000,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 10,
          opacity: 0.3,
          color: isDark ? '#fff' : '#000',
          pointerEvents: 'none',
        }}
      >
        Ctrl+K search
      </div>
    </div>
  )
}
