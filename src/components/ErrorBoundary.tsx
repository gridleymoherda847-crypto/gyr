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

// 检测是否是动态导入失败（通常是部署更新后旧文件不存在）
const isDynamicImportError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('dynamically imported module') ||
    msg.includes('importing a module script failed')
  )
}

// 自动刷新的key，防止无限刷新
const AUTO_REFRESH_KEY = 'littlephone_auto_refresh_time'

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    const e = error instanceof Error ? error : new Error(String(error))
    return { hasError: true, message: e.message, stack: e.stack }
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('LittlePhone crashed:', error)
    
    // 如果是动态导入失败，自动刷新页面（但防止无限刷新）
    if (isDynamicImportError(error)) {
      const lastRefresh = localStorage.getItem(AUTO_REFRESH_KEY)
      const now = Date.now()
      // 如果距离上次自动刷新超过30秒，才自动刷新
      if (!lastRefresh || now - parseInt(lastRefresh) > 30000) {
        localStorage.setItem(AUTO_REFRESH_KEY, String(now))
        // 延迟一点刷新，让用户能看到提示
        setTimeout(() => window.location.reload(), 500)
      }
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    // 检测是否是版本更新导致的错误
    const isUpdateError = isDynamicImportError({ message: this.state.message } as Error)

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-[520px] rounded-2xl bg-white/90 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur">
          {isUpdateError ? (
            <>
              <div className="text-center">
                <div className="text-4xl mb-3">🚀</div>
                <div className="text-[16px] font-semibold text-[#111]">程序员递交了最新版本</div>
                <div className="mt-2 text-[13px] text-gray-500">
                  请点击下方按钮刷新页面，即可更新到最新版本
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  className="w-full rounded-full bg-[#07C160] px-4 py-3 text-[14px] font-semibold text-white"
                  onClick={() => window.location.reload()}
                >
                  刷新更新
                </button>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    )
  }
}

