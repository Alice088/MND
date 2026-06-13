import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { CanvasObject } from './types'
import { shortId } from './types'

interface SearchHit {
  spaceName: string
  spaceId: string
  object: CanvasObject
  score: number
}

interface Props {
  isDark: boolean
  allObjects: { spaceName: string; spaceId: string; object: CanvasObject }[]
  onNavigate: (spaceId: string, objectId: string) => void
  onClose: () => void
  isOpen: boolean
}

const TYPE_ICON: Record<string, string> = {
  space: '⊞',
  note: '📝',
  file: '📄',
  link: '🔗',
  shape: '◇',
}

export default function SearchOverlay({ isDark, allObjects, onNavigate, onClose, isOpen }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
      setQuery('')
      setSelectedIdx(0)
    }
  }, [isOpen])

  // Search
  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase().trim()
    const hits: SearchHit[] = []

    for (const entry of allObjects) {
      const obj = entry.object
      let score = 0

      // Match name
      const nameLower = obj.name.toLowerCase()
      if (nameLower === q) score = 100
      else if (nameLower.startsWith(q)) score = 80
      else if (nameLower.includes(q)) score = 50

      // Match content (notes/files)
      const content = (obj as any).content || ''
      const contentLower = content.toLowerCase()
      if (contentLower.includes(q)) {
        score += 20
      }

      // Match URL (links)
      const url = (obj as any).url || ''
      if (url.toLowerCase().includes(q)) {
        score += 15
      }

      // Match space name
      const spaceLower = entry.spaceName.toLowerCase()
      if (spaceLower.includes(q) && score === 0) {
        score = 10
      }

      if (score > 0) {
        hits.push({ ...entry, score })
      }
    }

    // Sort by score descending, then alphabetically
    hits.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.object.name.localeCompare(b.object.name)
    })

    return hits.slice(0, 50) // max 50 results
  }, [query, allObjects])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(prev => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIdx]) {
      e.preventDefault()
      const hit = results[selectedIdx]
      onNavigate(hit.spaceId, hit.object.id)
      onClose()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [results, selectedIdx, onNavigate, onClose])

  // Scroll selected into view
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[selectedIdx] as HTMLElement | undefined
      if (item) {
        item.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIdx])

  // Click result
  const handleClick = useCallback((hit: SearchHit) => {
    onNavigate(hit.spaceId, hit.object.id)
    onClose()
  }, [onNavigate, onClose])

  const bg = isDark ? '#1a1a1a' : '#ffffff'
  const fg = isDark ? '#ddd' : '#333'
  const border = isDark ? '#333' : '#ddd'
  const hoverBg = isDark ? '#2a2a2a' : '#f0f0f0'
  const dimFg = isDark ? '#666' : '#999'

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex',
        justifyContent: 'center',
        paddingTop: '12vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: 520,
          maxWidth: '90vw',
          maxHeight: '70vh',
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 12,
          boxShadow: '0 12px 48px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Input */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}` }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search spaces, notes, files..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0) }}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: fg,
              fontSize: 16,
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {query.trim() && results.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: dimFg, fontSize: 13 }}>
              No results for "{query}"
            </div>
          )}

          {!query.trim() && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: dimFg, fontSize: 13 }}>
              Type to search...
            </div>
          )}

          {results.map((hit, i) => (
            <div
              key={`${hit.object.id}`}
              onClick={() => handleClick(hit)}
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                background: i === selectedIdx ? hoverBg : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              {/* Icon */}
              <span style={{ fontSize: 16, flexShrink: 0, opacity: 0.6 }}>
                {TYPE_ICON[hit.object.type] || '?'}
              </span>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: fg, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {hit.object.name || 'unnamed'}
                </div>
                <div style={{ color: dimFg, fontSize: 11, marginTop: 1 }}>
                  <span>{hit.spaceName}</span>
                  <span style={{ margin: '0 6px', opacity: 0.4 }}>/</span>
                  <span>{shortId(hit.object.id)}</span>
                </div>
              </div>

              {/* Type badge */}
              <span style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: isDark ? '#333' : '#eee',
                color: dimFg,
                flexShrink: 0,
              }}>
                {hit.object.type}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '6px 16px',
          borderTop: `1px solid ${border}`,
          display: 'flex',
          gap: 14,
          fontSize: 11,
          color: dimFg,
        }}>
          <span><kbd style={kbdStyle}>↑↓</kbd> Navigate</span>
          <span><kbd style={kbdStyle}>↵</kbd> Open</span>
          <span><kbd style={kbdStyle}>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  background: '#333',
  color: '#ccc',
  padding: '1px 5px',
  borderRadius: 3,
  fontSize: 10,
  fontFamily: 'inherit',
}
