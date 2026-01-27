import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 应用用户保存的屏幕边距设置
const savedPaddingTop = localStorage.getItem('mina_screen_padding_top')
const savedPaddingBottom = localStorage.getItem('mina_screen_padding_bottom')
const savedPaddingLeft = localStorage.getItem('mina_screen_padding_left')
const savedPaddingRight = localStorage.getItem('mina_screen_padding_right')
const savedIosSafeArea = localStorage.getItem('mina_ios_safe_area')

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
// iOS 安全区域适配
if (savedIosSafeArea === 'true') {
  document.documentElement.classList.add('ios-safe-area')
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
