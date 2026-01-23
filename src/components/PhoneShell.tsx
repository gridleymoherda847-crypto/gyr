import { type PropsWithChildren, useEffect, useRef } from 'react'
import { useOS } from '../context/OSContext'
import BottomHomeBar from './BottomHomeBar'

export default function PhoneShell({ children }: PropsWithChildren) {
  const { wallpaper, currentFont, fontColor, isLocked, lockWallpaper, notifications, markNotificationRead } = useOS()
  
  const currentWallpaper = isLocked ? lockWallpaper : wallpaper
  const timerRef = useRef<Record<string, number>>({})

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
      <div
        className="md:hidden fixed inset-0 select-none overflow-hidden"
        style={{
          fontFamily: currentFont.fontFamily,
          // 整机字体略微变大（锁屏不动）
          fontSize: isLocked ? undefined : '17px',
          color: fontColor.value,
          backgroundImage: `url(${currentWallpaper})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#fef7f0',
        }}
      >
        {/* 已移除“摄像头/灵动岛”模拟层：使用真机系统状态栏 */}

        {isLocked ? (
          <div className="relative z-10 h-full w-full">{children}</div>
        ) : (
          <div className="relative z-10 flex h-full flex-col">
            {/* 已移除模拟状态栏：使用手机系统自带状态栏，提升代入感 */}
            <div className="flex-1 overflow-hidden">{children}</div>
            <BottomHomeBar />
          </div>
        )}

        {/* 顶部通知浮窗 */}
        {!isLocked && unreadNotifications.length > 0 && (
          <div className="absolute top-12 left-3 right-3 z-40 space-y-2 pointer-events-none">
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

      {/* 桌面端：手机壳样式 */}
      <div className="hidden md:flex relative select-none items-center justify-center min-h-screen p-4">
        <div className="pointer-events-none absolute -inset-4 rounded-[50px] bg-gradient-to-br from-pink-300/15 via-purple-300/10 to-cyan-300/15 blur-2xl" />
        
        <div
          className="relative rounded-[50px] bg-[#1a1a1a] p-[3px] shadow-[0_25px_60px_rgba(0,0,0,0.4)]"
          style={{ 
            fontFamily: currentFont.fontFamily,
            // 整机字体略微变大（锁屏不动）
            fontSize: isLocked ? undefined : '17px',
            color: fontColor.value,
            width: '390px',
            height: '844px',
          }}
        >
          <div className="absolute inset-0 rounded-[50px] bg-gradient-to-b from-gray-500 via-gray-700 to-gray-800 opacity-40" />
          
          <div 
            className="relative w-full h-full rounded-[47px] overflow-hidden"
            style={{
              backgroundImage: `url(${currentWallpaper})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundColor: '#fef7f0',
            }}
          >
            {/* 已移除“摄像头/灵动岛”模拟层 */}

            {isLocked ? (
              <div className="relative z-10 h-full w-full">{children}</div>
            ) : (
              <div className="relative z-10 flex h-full flex-col">
                {/* 已移除模拟状态栏：使用手机系统自带状态栏，提升代入感 */}
                <div className="flex-1 overflow-hidden">{children}</div>
                <BottomHomeBar />
              </div>
            )}

            {/* 顶部通知浮窗 */}
            {!isLocked && unreadNotifications.length > 0 && (
              <div className="absolute top-14 left-4 right-4 z-40 space-y-2 pointer-events-none">
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
