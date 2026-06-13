import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MND Error]', error)
    console.error('[MND Error Info]', info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a1a',
          color: '#ccc',
          fontFamily: 'monospace',
          fontSize: 13,
          padding: 32,
          boxSizing: 'border-box',
        }}>
          <div style={{ maxWidth: 500 }}>
            <div style={{ fontSize: 18, marginBottom: 8, color: '#f66' }}>💥 MND Error</div>
            <div style={{ marginBottom: 16, lineHeight: 1.5, wordBreak: 'break-word' }}>
              {this.state.error.message}
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('mnd:workspace')
                window.location.reload()
              }}
              style={{
                padding: '8px 16px',
                background: '#333',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Clear data & reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
