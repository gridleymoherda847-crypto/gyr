import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 检测 iOS PWA 模式（添加到主屏幕全屏）
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
// iOS 独有的 standalone 属性，只有 iOS Safari PWA 才有
const isIOSStandalone = (window.navigator as any).standalone === true

// iOS PWA 模式自动应用安全区域适配（只针对 iOS）
if (isIOS && isIOSStandalone) {
  document.documentElement.classList.add('ios-pwa')
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
