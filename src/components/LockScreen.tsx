import { useState } from 'react'
import { useOS } from '../context/OSContext'

export default function LockScreen() {
  const { time, setLocked, fontColor, currentFont } = useOS()
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  const now = new Date()
  const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 ${weekDays[now.getDay()]}`

  const handleUnlock = () => {
    setIsUnlocking(true)
    setTimeout(() => {
      setLocked(false)
      setIsUnlocking(false)
    }, 300)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY)
    setTouchStartX(e.touches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null || touchStartX === null) return
    const y = e.touches[0].clientY
    const x = e.touches[0].clientX
    const dy = touchStart - y
    const dx = Math.abs(touchStartX - x)
    // 仅当主要是上滑时触发
    if (dy > 60 && dx < 40) {
      setTouchStart(null)
      setTouchStartX(null)
      handleUnlock()
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart !== null) {
      const diff = touchStart - e.changedTouches[0].clientY
      if (diff > 60) handleUnlock()
    }
    setTouchStart(null)
    setTouchStartX(null)
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden transition-all duration-300 ${
        isUnlocking ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
      }`}
      onClick={handleUnlock}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'none' }}
    >
      <div className="relative z-10 flex h-full flex-col items-center pt-20 sm:pt-28 px-6">
        {/* 超大镂空时间 */}
        <div className="text-center select-none relative">
          <div 
            style={{
              fontSize: 'clamp(58px, 16vw, 78px)',
              fontWeight: 900,
              fontFamily: currentFont.fontFamily,
              color: 'transparent',
              WebkitTextStroke: `2.5px ${fontColor.value}`,
              lineHeight: 0.9,
              letterSpacing: '2px',
              opacity: 0.85,
            }}
          >
            {time}
          </div>
        </div>

        {/* 日期 */}
        <div 
          className="mt-3 sm:mt-4 text-center select-none"
          style={{
            fontFamily: currentFont.fontFamily,
            fontSize: 'clamp(16px, 4vw, 20px)',
            color: fontColor.value,
            letterSpacing: '3px',
            opacity: 0.7,
          }}
        >
          {dateStr}
        </div>

        {/* 底部解锁提示 */}
        <div className="absolute bottom-20 sm:bottom-24 left-0 right-0 flex flex-col items-center gap-2">
          <div className="flex flex-col items-center gap-1.5 animate-bounce-gentle">
            <svg 
              className="w-5 h-5" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke={fontColor.value}
              strokeWidth={2}
              style={{ opacity: 0.5 }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
            <span 
              style={{ 
                fontFamily: currentFont.fontFamily,
                fontSize: '14px',
                color: fontColor.value,
                letterSpacing: '2px',
                opacity: 0.5,
              }}
            >
              上滑解锁
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
