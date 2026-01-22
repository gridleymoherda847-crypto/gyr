import { useEffect, useState } from 'react'
import { useOS } from '../context/OSContext'

export default function MusicWidget() {
  const { fontColor, musicPlaying, currentSong, musicProgress, toggleMusic } = useOS()
  const [rotation, setRotation] = useState(0)

  // 唱片旋转动画
  useEffect(() => {
    if (!musicPlaying) return
    const interval = setInterval(() => {
      setRotation((prev) => (prev + 2) % 360)
    }, 50)
    return () => clearInterval(interval)
  }, [musicPlaying])

  return (
    <div 
      className="rounded-[22px] sm:rounded-[26px] overflow-hidden p-4 mb-2"
      style={{ 
        width: '160px',
        background: `${fontColor.value}08`,
        backdropFilter: 'blur(10px)',
        border: `1px solid ${fontColor.value}15`,
      }}
    >
      {/* 歌曲名/待机文字 - 放在顶部 */}
      <div 
        className="text-center text-[11px] sm:text-[12px] truncate mb-2"
        style={{ color: fontColor.value, opacity: 0.8 }}
      >
        {currentSong ? `♪ ${currentSong.title}` : '点击播放~'}
      </div>

      {/* 进度条 - 放在文字下面 */}
      <div 
        className="h-1.5 rounded-full overflow-hidden mb-3"
        style={{ background: `${fontColor.value}15` }}
      >
        <div 
          className="h-full rounded-full transition-all duration-300"
          style={{ 
            width: `${musicPlaying ? musicProgress : 0}%`,
            background: 'linear-gradient(90deg, #f9a8d4, #c4b5fd)',
          }}
        />
      </div>

      {/* 唱片区域 - 放在底部 */}
      <div className="flex justify-center relative">
        <div 
          className="relative w-28 h-28 rounded-full overflow-hidden shadow-lg cursor-pointer"
          onClick={toggleMusic}
        >
          {/* 唱片底图 - 旋转 */}
          <div
            className="w-full h-full"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: musicPlaying ? 'none' : 'transform 0.3s ease',
            }}
          >
            <img 
              src="/icons/disc.png" 
              alt="disc" 
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          
          {/* 中心圆点 */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-6 h-6 rounded-full bg-white/80 shadow" />
          </div>
          
          {/* 播放按钮 - 不播放时显示 */}
          {!musicPlaying && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-pink-400 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
