import { type PropsWithChildren, useEffect, useRef, useState } from 'react'
import { useOS } from '../context/OSContext'
import VirtualStatusBar from './VirtualStatusBar'

export default function PhoneShell({ children }: PropsWithChildren) {
  const { wallpaper, currentFont, fontColor, notifications, markNotificationRead } = useOS()
  const isImageUrl =
    wallpaper.startsWith('data:') ||
    wallpaper.startsWith('http') ||
    wallpaper.startsWith('blob') ||
    wallpaper.startsWith('/')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hideStatusBar, setHideStatusBar] = useState(() => {
    return localStorage.getItem('mina_hide_status_bar') === 'true'
  })
  
  // 同步壁纸到安全区域背景（iOS 开关开启时可延伸）
  useEffect(() => {
    const isImageUrl = wallpaper.startsWith('data:') || wallpaper.startsWith('http') || wallpaper.startsWith('blob') || wallpaper.startsWith('/')
    const safeAreaBg = isImageUrl ? `url("${wallpaper}")` : wallpaper
    document.documentElement.style.setProperty('--safe-area-bg', safeAreaBg)
  }, [wallpaper])

  // 监听 localStorage 变化以响应设置更改
  useEffect(() => {
    const checkHideStatusBar = () => {
      setHideStatusBar(localStorage.getItem('mina_hide_status_bar') === 'true')
    }
    window.addEventListener('storage', checkHideStatusBar)
    return () => window.removeEventListener('storage', checkHideStatusBar)
  }, [])
  
  const timerRef = useRef<Record<string, number>>({})

  // 监听全屏状态
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // 全屏模式下阻止边缘滑动手势退出
  useEffect(() => {
    if (!isFullscreen) return

    const preventEdgeSwipe = (e: TouchEvent) => {
      if (!e.cancelable) return
      const touch = e.touches[0]
      if (!touch) return
      const target = e.target as HTMLElement | null
      if (target && target.closest('button, a, input, textarea, select, [role="button"]')) return
      // 如果触摸点在屏幕边缘（左右各30px），阻止默认行为
      if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) {
        e.preventDefault()
      }
    }

    document.addEventListener('touchstart', preventEdgeSwipe, { passive: false })
    return () => document.removeEventListener('touchstart', preventEdgeSwipe)
  }, [isFullscreen])

  useEffect(() => {
    const unread = notifications.filter(n => !n.read)
    unread.forEach((n) => {
      if (timerRef.current[n.id]) return
      timerRef.current[n.id] = window.setTimeout(() => {
        markNotificationRead(n.id)
        delete timerRef.current[n.id]
      }, 3000)
    })
  }, [notifications, markNotificationRead])

  const unreadNotifications = notifications.filter(n => !n.read).slice(0, 3)

  return (
    <>
      {/* 移动端：全屏沉浸式 */}
      {/* 外层：背景容器，填满整个屏幕（包括安全区域外），让壁纸/背景色延伸到边缘 */}
      <div
        className="md:hidden fixed inset-0 select-none overflow-hidden"
        style={{
          fontFamily: currentFont.fontFamily,
          fontSize: '17px',
          color: fontColor.value,
          background: isImageUrl ? undefined : wallpaper,
          backgroundImage: isImageUrl ? `url("${wallpaper}")` : undefined,
          backgroundSize: isImageUrl ? 'cover' : undefined,
          backgroundPosition: isImageUrl ? 'center' : undefined,
          backgroundColor: '#fef7f0',
        }}
      >
        {/* 内层：内容容器，用 padding 避开安全区域 */}
        <div 
          className="relative z-10 flex h-full flex-col"
          style={{
            // iOS 安全区域 + 用户自定义边距
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + var(--screen-padding-top, 0px))',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--screen-padding-bottom, 0px))',
            paddingLeft: 'calc(env(safe-area-inset-left, 0px) + var(--screen-padding-left, 0px))',
            paddingRight: 'calc(env(safe-area-inset-right, 0px) + var(--screen-padding-right, 0px))',
          }}
        >
          {/* 虚拟状态栏（可隐藏） */}
          {!hideStatusBar && <VirtualStatusBar />}
          <div className="flex-1 overflow-hidden">{children}</div>
          
          {/* 顶部通知浮窗 - 放在内层容器里，自动跟随安全区域 */}
          {unreadNotifications.length > 0 && (
            <div className="absolute top-2 left-3 right-3 z-40 space-y-2 pointer-events-none">
              {unreadNotifications.map((n) => (
                <div key={n.id} className="flex items-center gap-2 rounded-2xl bg-white/80 backdrop-blur px-3 py-2 shadow-sm">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
                    {n.avatar ? (
                      <img src={n.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-gray-600">{n.app.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-gray-800">{n.title}</div>
                    <div className="text-xs text-gray-500 truncate">{n.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 桌面端：手机壳样式 */}
      <div className="hidden md:flex relative select-none items-center justify-center min-h-screen p-4">
        <div className="pointer-events-none absolute -inset-4 rounded-[50px] bg-gradient-to-br from-pink-300/15 via-purple-300/10 to-cyan-300/15 blur-2xl" />
        
        <div
          className="relative rounded-[50px] bg-[#1a1a1a] p-[3px] shadow-[0_25px_60px_rgba(0,0,0,0.4)]"
          style={{ 
            fontFamily: currentFont.fontFamily,
            fontSize: '17px',
            color: fontColor.value,
            width: '390px',
            height: '844px',
          }}
        >
          <div className="absolute inset-0 rounded-[50px] bg-gradient-to-b from-gray-500 via-gray-700 to-gray-800 opacity-40" />
          
          <div 
            className="relative w-full h-full rounded-[47px] overflow-hidden"
            style={{
              background: isImageUrl ? undefined : wallpaper,
              backgroundImage: isImageUrl ? `url("${wallpaper}")` : undefined,
              backgroundSize: isImageUrl ? 'cover' : undefined,
              backgroundPosition: isImageUrl ? 'center' : undefined,
              backgroundColor: '#fef7f0',
            }}
          >
            <div className="relative z-10 flex h-full flex-col">
              {/* 虚拟状态栏（可隐藏） */}
              {!hideStatusBar && <VirtualStatusBar />}
              <div className="flex-1 overflow-hidden">{children}</div>
            </div>

            {/* 顶部通知浮窗 */}
            {unreadNotifications.length > 0 && (
              <div className="absolute top-12 left-4 right-4 z-40 space-y-2 pointer-events-none">
                {unreadNotifications.map((n) => (
                  <div key={n.id} className="flex items-center gap-2 rounded-2xl bg-white/80 backdrop-blur px-3 py-2 shadow-sm">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center flex-shrink-0">
                      {n.avatar ? (
                        <img src={n.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-gray-600">{n.app.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-gray-800">{n.title}</div>
                      <div className="text-xs text-gray-500 truncate">{n.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="pointer-events-none absolute inset-0 rounded-[47px] shadow-[inset_0_0_15px_rgba(0,0,0,0.08)]" />
          </div>
        </div>
      </div>
    </>
  )
}
