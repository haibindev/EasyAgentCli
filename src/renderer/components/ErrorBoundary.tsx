import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error)
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 8,
          color: '#f85149',
          fontSize: 13,
          padding: 16
        }}>
          <span>组件出错</span>
          <span style={{ color: '#6e7681', fontSize: 11 }}>
            {this.state.error?.message}
          </span>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 8,
              padding: '4px 12px',
              background: '#161b22',
              color: '#c9d1d9',
              border: '1px solid #30363d',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
