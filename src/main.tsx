import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// ========= Vite 分包加载失败兜底（改为“手动更新”） =========
// 典型场景：用户手机缓存了旧的 index.html（引用旧 hash chunk），而站点已更新到新版本，导致动态 import 404。
// 用户要求：不要自动刷新；仅提示用户去“设置 -> 系统 -> 检测更新”或手动点按钮更新。
let lpUpdateOverlayShown = false
function showManualUpdateOverlay() {
  if (lpUpdateOverlayShown) return
  lpUpdateOverlayShown = true
  try {
    const existing = document.getElementById('lp-manual-update-overlay')
    if (existing) return
    const root = document.createElement('div')
    root.id = 'lp-manual-update-overlay'
    root.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px;'
    root.innerHTML = `
      <div style="width:100%;max-width:520px;border-radius:18px;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">
        <div style="text-align:center;">
          <div style="font-size:34px;margin-bottom:8px;">🚀</div>
          <div style="font-size:16px;font-weight:700;color:#111;">检测到站点已更新</div>
          <div style="margin-top:8px;font-size:13px;color:#666;line-height:1.5;">
            你的浏览器缓存了旧资源，导致加载失败。<br/>
            推荐去 <b>设置 → 系统 → 检测更新</b> 手动更新版本。
          </div>
        </div>
        <div style="margin-top:14px;display:flex;gap:10px;">
          <button id="lp-update-close" style="flex:1;border-radius:999px;border:1px solid rgba(0,0,0,.1);background:rgba(255,255,255,.7);padding:10px 12px;font-size:13px;font-weight:600;color:#333;cursor:pointer;">我知道了</button>
          <button id="lp-update-now" style="flex:1;border-radius:999px;border:0;background:#07C160;padding:10px 12px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;">立即更新</button>
        </div>
      </div>
    `
    document.body.appendChild(root)
    const closeBtn = root.querySelector('#lp-update-close') as HTMLButtonElement | null
    const nowBtn = root.querySelector('#lp-update-now') as HTMLButtonElement | null
    closeBtn?.addEventListener('click', () => {
      try { root.remove() } catch { /* ignore */ }
    })
    nowBtn?.addEventListener('click', async () => {
      try {
        const apply = (window as any).__LP_APPLY_UPDATE__ as undefined | (() => Promise<void>)
        if (apply) {
          await apply()
          return
        }
      } catch {
        // ignore
      }
      window.location.reload()
    })
  } catch {
    // ignore
  }
}

// Vite 预加载失败事件（官方推荐）
window.addEventListener('vite:preloadError', (e: any) => {
  try { e?.preventDefault?.() } catch { /* ignore */ }
  showManualUpdateOverlay()
})

// 某些机型/浏览器不会触发 vite:preloadError，而是走 unhandledrejection
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason: any = event?.reason
  const msg = String(reason?.message || reason || '')
  if (msg.includes('Failed to fetch dynamically imported module') || msg.includes('Importing a module script failed')) {
    showManualUpdateOverlay()
  }
})

declare global {
  interface Window {
    __LP_CHECK_UPDATE__?: () => Promise<boolean>
    __LP_APPLY_UPDATE__?: () => Promise<void>
  }
}

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
  // 先给一个安全的默认底色，避免在壁纸/React 挂载前出现“白边”
  try {
    if (!document.documentElement.style.getPropertyValue('--safe-area-bg')) {
      document.documentElement.style.setProperty('--safe-area-bg', '#000')
    }
  } catch {
    // ignore
  }
}

// 视口高度修复（全新方案：直接设置 body.style.height = visualViewport.height）
// 不再用 CSS 变量 --app-height，不做复杂计算。
// 键盘弹起时 visualViewport.height 缩小，body 跟着缩，flex 布局自动把输入栏顶到键盘上沿。
{
  const vv = window.visualViewport
  const nonTextTypes = new Set(['button', 'checkbox', 'radio', 'range', 'file', 'color', 'submit', 'reset', 'image'])

  const checkTextInputFocused = () => {
    const el = document.activeElement as HTMLElement | null
    if (!el) return false
    if (el.tagName === 'TEXTAREA') return true
    if (el.tagName === 'INPUT') return !nonTextTypes.has(((el as HTMLInputElement).type || 'text').toLowerCase())
    return !!el.isContentEditable
  }

  const update = () => {
    try {
      const h = vv ? Math.round(vv.height + vv.offsetTop) : window.innerHeight
      // 核心：直接设置 body 高度为可视区域高度，其他交给 CSS Flex
      document.body.style.height = `${h}px`

      // 键盘检测：高度差 OR 输入框聚焦。用于清除 safe-area padding。
      const textFocused = checkTextInputFocused()
      const kbOpen = (window.innerHeight - h > 80) || textFocused
      document.documentElement.style.setProperty(
        '--runtime-safe-bottom',
        kbOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)',
      )
      if (kbOpen) {
        document.documentElement.style.setProperty('--runtime-screen-padding-bottom', '0px')
      } else {
        document.documentElement.style.removeProperty('--runtime-screen-padding-bottom')
      }
    } catch {
      // ignore
    }
  }

  // 初始化
  update()

  // visualViewport resize 是唯一需要监听的事件
  try {
    vv?.addEventListener?.('resize', update, { passive: true } as any)
  } catch { /* ignore */ }

  // 兆底：window resize + focus 事件
  window.addEventListener('resize', update, { passive: true } as any)
  document.addEventListener('focusin', () => {
    update()
    window.setTimeout(update, 100)
    window.setTimeout(update, 300)
  }, true)
  document.addEventListener('focusout', () => {
    window.setTimeout(update, 80)
    window.setTimeout(update, 300)
  }, true)

  // iOS：禁用双指缩放/页面手势
  if (isIOS) {
    const preventGesture = (e: Event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ev: any = e as any
      if (typeof ev?.preventDefault === 'function') ev.preventDefault()
    }
    document.addEventListener('gesturestart', preventGesture as any, { passive: false } as any)
    document.addEventListener('gesturechange', preventGesture as any, { passive: false } as any)
    document.addEventListener('gestureend', preventGesture as any, { passive: false } as any)
  }
}
// ========= 手动版本检测（设置页按钮触发） =========
// 按用户要求：不再自动弹更新提示，不再自动刷新；仅在“设置 -> 检测更新”手动执行。
window.__LP_CHECK_UPDATE__ = async () => {
  const now = Date.now()
  const res = await fetch('/?__vc=' + now, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  })
  if (!res.ok) return false
  const html = await res.text()
  const currentScripts = Array.from(document.querySelectorAll('script[src]'))
    .map(s => (s as HTMLScriptElement).src)
    .filter(s => s.includes('/assets/'))
  if (currentScripts.length === 0) return false // 开发模式或脚本未就绪，视为无需更新
  return currentScripts.some(src => {
    const fileName = src.split('/').pop() || ''
    return fileName ? !html.includes(fileName) : false
  })
}
window.__LP_APPLY_UPDATE__ = async () => {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      for (const r of regs) { try { await r.unregister() } catch { /* ignore */ } }
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      for (const key of keys) { try { await caches.delete(key) } catch { /* ignore */ } }
    }
  } catch {
    // ignore
  }
  window.location.reload()
}

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
