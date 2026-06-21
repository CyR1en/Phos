import { Component } from 'preact'
import type { ComponentChildren } from 'preact'

interface Props {
  children: ComponentChildren
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div class="min-h-screen bg-canvas flex items-center justify-center p-4">
          <div class="max-w-md w-full bg-surface border border-border rounded-sm shadow-md p-6 text-center space-y-4">
            <h2 class="text-lg font-semibold text-ink">Something went wrong</h2>
            <p class="text-sm text-muted">
              {this.state.error?.message || 'An unexpected error occurred in the application.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              class="inline-flex items-center justify-center font-body font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer text-sm h-9.5 px-4 rounded-sm bg-primary text-primary-text hover:bg-primary-hover shadow-xs active:scale-[0.98]"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
