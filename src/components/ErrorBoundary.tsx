import type { ReactNode } from 'react'
import { Component } from 'react'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  message: string
  stack?: string
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    const e = error instanceof Error ? error : new Error(String(error))
    return { hasError: true, message: e.message, stack: e.stack }
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('LittlePhone crashed:', error)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-[520px] rounded-2xl bg-white/90 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur">
          <div className="text-[15px] font-semibold text-[#111]">页面崩溃了（已捕获错误）</div>
          <div className="mt-2 text-[13px] text-[#333]">
            {this.state.message || 'Unknown error'}
          </div>
          {this.state.stack && (
            <pre className="mt-3 max-h-[260px] overflow-auto rounded-xl bg-black/5 p-3 text-[11px] text-[#333]">
              {this.state.stack}
            </pre>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-full border border-black/10 bg-white px-4 py-2 text-[13px] font-medium text-[#333]"
              onClick={() => (window.location.href = '/')}
            >
              回到主页
            </button>
            <button
              type="button"
              className="flex-1 rounded-full bg-[#07C160] px-4 py-2 text-[13px] font-semibold text-white"
              onClick={() => window.location.reload()}
            >
              刷新重启
            </button>
          </div>
        </div>
      </div>
    )
  }
}

