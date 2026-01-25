import { type PropsWithChildren, useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'

type Props = PropsWithChildren<{
  className?: string
}>

// 微信统一背景布局 - 贯穿所有微信界面，背景图100%显示
export default function WeChatLayout({ children, className = '' }: Props) {
  const navigate = useNavigate()
  const { pauseMusic, audioRef } = useOS()
  const { listenTogether, stopListenTogether, getCharacter, getCurrentPersona } = useWeChat()
  const [showListenPanel, setShowListenPanel] = useState(false)

  // 一起听歌：强制当前音频循环播放（更贴近“同一首歌一直放”）
  useEffect(() => {
    if (!audioRef.current) return
    audioRef.current.loop = !!listenTogether
    // 退出一起听后恢复为不循环
    return () => {
      if (audioRef.current) audioRef.current.loop = false
    }
  }, [listenTogether, audioRef])
  
  // 使用 useMemo 避免每次渲染都重新查询
  const listeningCharacter = useMemo(() => 
    listenTogether ? getCharacter(listenTogether.characterId) : null,
    [listenTogether, getCharacter]
  )
  const currentPersona = useMemo(() => getCurrentPersona(), [getCurrentPersona])
  
  // 停止一起听歌（同时停止音乐播放）
  const handleStopListening = useCallback(() => {
    stopListenTogether()
    pauseMusic()
  }, [stopListenTogether, pauseMusic])
  
  return (
    <div 
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{
        backgroundImage: 'url(/icons/wechat-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* 一起听歌全局浮窗 - 只要在一起听就显示（清新绿色配色，移除blur提升性能） */}
      {listenTogether && listeningCharacter && (
        <div 
          className="absolute top-1 left-3 right-3 z-40 px-3 py-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center gap-2 cursor-pointer active:opacity-80 shadow-lg"
          onClick={() => setShowListenPanel(true)}
        >
          <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-emerald-300 to-teal-400 flex items-center justify-center">
            <span className="text-xs">🎵</span>
          </div>
          <span className="flex-1 text-white text-xs truncate">
            和{listeningCharacter.name}一起听《{listenTogether.songTitle}》
          </span>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); handleStopListening() }}
            className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center"
          >
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      {/* 一起听歌展开面板 - 清新浅绿色风格（优化性能：移除blur和复杂动画） */}
      {showListenPanel && listenTogether && listeningCharacter && (
        <div 
          className="absolute inset-0 z-50 flex flex-col"
          style={{
            backgroundImage: 'url(/icons/listen-together-bg.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* 半透明遮罩（移除blur提升性能） */}
          <div className="absolute inset-0 bg-white/30" />
          
          {/* 内容层 */}
          <div className="relative z-10 flex flex-col h-full">
            {/* 顶部关闭按钮 */}
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <button 
                type="button"
                onClick={() => setShowListenPanel(false)}
                className="w-8 h-8 rounded-full bg-emerald-500/40 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="text-emerald-700 font-medium text-sm">一起听</div>
              <div className="w-8" />
            </div>
            
            {/* 双方头像 - 放大版 */}
            <div className="flex items-center justify-center gap-6 mt-6 mb-4">
              {/* 我的头像 */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-20 h-20 rounded-full overflow-hidden border-emerald-400 shadow-lg" style={{ borderWidth: '3px', borderStyle: 'solid' }}>
                  {currentPersona?.avatar ? (
                    <img src={currentPersona.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-300 to-teal-400 flex items-center justify-center text-white text-2xl">
                      我
                    </div>
                  )}
                </div>
                <span className="text-emerald-700/80 text-xs font-medium">{currentPersona?.name || '我'}</span>
              </div>
              
              {/* 连接线 - 静态（移除动画提升性能） */}
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <div className="w-6 h-0.5 bg-gradient-to-r from-emerald-400 to-teal-400" />
                <div className="w-2 h-2 rounded-full bg-teal-400" />
              </div>
              
              {/* 对方头像 */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-20 h-20 rounded-full overflow-hidden border-teal-400 shadow-lg" style={{ borderWidth: '3px', borderStyle: 'solid' }}>
                  {listeningCharacter.avatar ? (
                    <img src={listeningCharacter.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-teal-300 to-emerald-400 flex items-center justify-center text-white text-2xl">
                      {listeningCharacter.name.slice(0, 1)}
                    </div>
                  )}
                </div>
                <span className="text-emerald-700/80 text-xs font-medium">{listeningCharacter.name}</span>
              </div>
            </div>
            
            {/* 旋转唱片 - 清新绿色风格（简化动画） */}
            <div className="flex-1 flex items-center justify-center">
              <div className="relative">
                {/* 旋转唱片（使用CSS动画，GPU加速） */}
                <div 
                  className="w-44 h-44 rounded-full overflow-hidden shadow-xl relative will-change-transform"
                  style={{ 
                    animation: 'spin 12s linear infinite',
                  }}
                >
                  {/* 唱片背景 - 清新绿色渐变 */}
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-teal-400 to-emerald-500" />
                  
                  {/* 唱片纹路（简化） */}
                  <div className="absolute inset-6 rounded-full border border-white/20" />
                  <div className="absolute inset-12 rounded-full border border-white/15" />
                  
                  {/* 唱片中心 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white border-4 border-emerald-200 flex items-center justify-center">
                      <span className="text-xl">🌿</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 歌曲信息 */}
            <div className="text-center px-8 mb-4">
              <div className="text-emerald-800 font-bold text-lg mb-1">{listenTogether.songTitle}</div>
              <div className="text-emerald-600/70 text-sm">正在一起聆听...</div>
            </div>
            
            {/* 底部按钮 - 清新绿色风格（移除blur） */}
            <div className="px-8 pb-8 flex justify-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setShowListenPanel(false)
                  navigate(`/apps/wechat/chat/${listenTogether.characterId}`)
                }}
                className="px-6 py-3 rounded-full bg-emerald-500 text-white text-sm font-medium active:scale-95 transition-transform shadow-lg"
              >
                去聊天
              </button>
              <button
                type="button"
                onClick={() => { handleStopListening(); setShowListenPanel(false) }}
                className="px-6 py-3 rounded-full bg-white/80 text-emerald-700 text-sm font-medium active:scale-95 transition-transform shadow-lg"
              >
                结束一起听
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 内容 - 一起听歌时需要留出顶部空间 */}
      <div className={`relative z-10 h-full w-full ${listenTogether ? 'pt-10' : ''}`}>
        {children}
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
