import { useState } from 'react'
import Canvas from './Canvas'
import './App.css'

function App() {
  const [isDark, setIsDark] = useState(false)
  const [resetCount, setResetCount] = useState(0)

  return (
    <div className={`mnd ${isDark ? 'mnd--dark' : 'mnd--light'}`}>
      <Canvas isDark={isDark} resetCount={resetCount} />
      <div className="controls">
        <button
          className="control-btn"
          onClick={() => setResetCount(c => c + 1)}
          title="Reset view"
        >
          ⌂
        </button>
        <button
          className="control-btn"
          onClick={() => setIsDark(d => !d)}
          title={isDark ? 'White theme' : 'Black theme'}
        >
          {isDark ? '☀' : '☾'}
        </button>
      </div>
    </div>
  )
}

export default App
