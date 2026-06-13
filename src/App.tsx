import { useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import './App.css'

function App() {
  const [isDark, setIsDark] = useState(false)

  return (
    <div className="mnd">
      <Excalidraw
        theme={isDark ? 'dark' : 'light'}
        viewModeEnabled
        zenModeEnabled
        gridModeEnabled
      />
      <button
        className="theme-toggle"
        onClick={() => setIsDark(d => !d)}
        title={isDark ? 'White theme' : 'Black theme'}
      >
        {isDark ? '☀' : '☾'}
      </button>
    </div>
  )
}

export default App
