import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 应用用户保存的屏幕边距设置
const savedPaddingTop = localStorage.getItem('mina_screen_padding_top')
const savedPaddingBottom = localStorage.getItem('mina_screen_padding_bottom')
if (savedPaddingTop) {
  document.documentElement.style.setProperty('--screen-padding-top', `${savedPaddingTop}px`)
}
if (savedPaddingBottom) {
  document.documentElement.style.setProperty('--screen-padding-bottom', `${savedPaddingBottom}px`)
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
