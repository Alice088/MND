import { useState } from 'react'
import Canvas from './Canvas'
import './App.css'

function App() {
  const [isDark, setIsDark] = useState(false)

  return (
    <div className={`mnd ${isDark ? 'mnd--dark' : 'mnd--light'}`}>
      <Canvas isDark={isDark} />
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
