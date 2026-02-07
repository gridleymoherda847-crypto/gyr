import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// ========= Vite 分包加载失败兜底 =========
// 典型场景：用户手机缓存了旧的 index.html（引用旧 hash chunk），而站点已更新到新版本，导致动态 import 404。
// 处理策略：检测到 chunk 加载失败时，自动刷新一次（带 cache-busting），避免用户卡在白屏。
const LP_CHUNK_RELOAD_KEY = '__lp_chunk_reload_once__'
function reloadOnceForChunkError() {
  try {
    if (sessionStorage.getItem(LP_CHUNK_RELOAD_KEY) === '1') return
    sessionStorage.setItem(LP_CHUNK_RELOAD_KEY, '1')
  } catch {
    // ignore
  }

  // 若存在 Service Worker（PWA 场景），先尝试注销，减少旧缓存命中概率
  try {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => {
          try { void r.unregister() } catch { /* ignore */ }
        })
      })
    }
  } catch {
    // ignore
  }

  const url = new URL(window.location.href)
  url.searchParams.set('__lp_reload', String(Date.now()))
  window.location.replace(url.toString())
}

// Vite 预加载失败事件（官方推荐）
window.addEventListener('vite:preloadError', (e: any) => {
  try { e?.preventDefault?.() } catch { /* ignore */ }
  reloadOnceForChunkError()
})

// 某些机型/浏览器不会触发 vite:preloadError，而是走 unhandledrejection
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason: any = event?.reason
  const msg = String(reason?.message || reason || '')
  if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed')) {
    reloadOnceForChunkError()
  }
})

// 检测 iOS PWA 模式（添加到主屏幕全屏）
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
// iOS 独有的 standalone 属性，只有 iOS Safari PWA 才有
const isIOSStandalone = (window.navigator as any).standalone === true

// iOS PWA 模式自动应用安全区域适配（只针对 iOS）
if (isIOS && isIOSStandalone) {
  document.documentElement.classList.add('ios-pwa')
  
  // 监听 popstate，确保客户端路由正常工作（React Router 会自动处理）
  window.addEventListener('popstate', () => {
    // React Router 会自动处理，这里只是确保事件能正常触发
  }, { passive: true })
  
  // 强化 meta 标签：确保 iOS 识别为全屏 App
  const existingMeta = document.querySelector('meta[name="apple-mobile-web-app-capable"]')
  if (!existingMeta) {
    const meta = document.createElement('meta')
    meta.name = 'apple-mobile-web-app-capable'
    meta.content = 'yes'
    document.head.appendChild(meta)
  }
  
  // 确保 manifest 被引用
  const existingManifest = document.querySelector('link[rel="manifest"]')
  if (!existingManifest) {
    const link = document.createElement('link')
    link.rel = 'manifest'
    link.href = '/manifest.webmanifest'
    document.head.appendChild(link)
  }
}

// iOS 设备：自动启用安全区域适配（无需用户手动开关）
if (isIOS) {
  document.documentElement.classList.add('ios-safe-area')
}

// iOS 视口高度修复：用 innerHeight 兜底（解决部分机型 PWA 底部露黑）
if (isIOS) {
  const setAppHeight = () => {
    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`)
  }
  setAppHeight()
  window.addEventListener('resize', setAppHeight)
  window.addEventListener('orientationchange', () => window.setTimeout(setAppHeight, 80))
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) window.setTimeout(setAppHeight, 80)
  })

  // iOS：禁用双指缩放/页面手势（避免"像电脑模式一样能拖动/缩放导致点击错位"）
  const preventGesture = (e: Event) => {
    // Safari 的 gesture 事件是可 cancel 的
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ev: any = e as any
    if (typeof ev?.preventDefault === 'function') ev.preventDefault()
  }
  document.addEventListener('gesturestart', preventGesture as any, { passive: false } as any)
  document.addEventListener('gesturechange', preventGesture as any, { passive: false } as any)
  document.addEventListener('gestureend', preventGesture as any, { passive: false } as any)
}

// ========= 自动版本检测 + 强制刷新 =========
// 每次从后台切回 / 每 5 分钟检查一次 index.html 是否已更新
// 如果检测到新版本，清除 Service Worker / CacheStorage 并自动刷新
;(function autoVersionCheck() {
  const CHECK_INTERVAL = 5 * 60 * 1000 // 5 分钟
  let lastCheck = Date.now()

  async function checkForUpdate() {
    try {
      const now = Date.now()
      if (now - lastCheck < 30_000) return // 30秒内不重复检查
      lastCheck = now
      const res = await fetch('/?__vc=' + now, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!res.ok) return
      const html = await res.text()
      // Vite 构建的 JS 入口文件名带 hash，检测是否和当前加载的不同
      const currentScripts = Array.from(document.querySelectorAll('script[src]'))
        .map(s => (s as HTMLScriptElement).src)
        .filter(s => s.includes('/assets/'))
      if (currentScripts.length === 0) return // 开发模式，跳过

      const hasNewVersion = currentScripts.some(src => {
        const fileName = src.split('/').pop() || ''
        return !html.includes(fileName)
      })

      if (hasNewVersion) {
        console.log('[版本检测] 检测到新版本，准备刷新...')
        // 注销 Service Worker
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          for (const r of regs) {
            try { await r.unregister() } catch { /* */ }
          }
        }
        // 清除浏览器 Cache Storage
        if ('caches' in window) {
          const keys = await caches.keys()
          for (const key of keys) {
            try { await caches.delete(key) } catch { /* */ }
          }
        }
        window.location.reload()
      }
    } catch {
      // 网络失败静默忽略
    }
  }

  // 页面可见性变化时检测（从后台切回时）
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkForUpdate()
  })

  // 定时检测
  setInterval(checkForUpdate, CHECK_INTERVAL)

  // 首次延迟检测（给应用启动留时间）
  setTimeout(checkForUpdate, 10_000)
})()

// 尝试申请"持久化存储"（尽量避免浏览器回收 IndexedDB 导致数据丢失）
// 说明：不同浏览器支持程度不同；失败时静默忽略。
try {
  const navAny = navigator as any
  if (navAny?.storage?.persist) {
    void navAny.storage.persist()
  }
} catch {
  // ignore
}

// 应用用户保存的屏幕边距设置
const savedPaddingTop = localStorage.getItem('mina_screen_padding_top')
const savedPaddingBottom = localStorage.getItem('mina_screen_padding_bottom')
const savedPaddingLeft = localStorage.getItem('mina_screen_padding_left')
const savedPaddingRight = localStorage.getItem('mina_screen_padding_right')

if (savedPaddingTop) {
  document.documentElement.style.setProperty('--screen-padding-top', `${savedPaddingTop}px`)
}
if (savedPaddingBottom) {
  document.documentElement.style.setProperty('--screen-padding-bottom', `${savedPaddingBottom}px`)
}
if (savedPaddingLeft) {
  document.documentElement.style.setProperty('--screen-padding-left', `${savedPaddingLeft}px`)
}
if (savedPaddingRight) {
  document.documentElement.style.setProperty('--screen-padding-right', `${savedPaddingRight}px`)
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root container not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
