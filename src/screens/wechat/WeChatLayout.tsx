import { type PropsWithChildren, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'

type Props = PropsWithChildren<{
  className?: string
}>

// 微信统一背景布局 - 贯穿所有微信界面，背景图100%显示
export default function WeChatLayout({ children, className = '' }: Props) {
  const navigate = useNavigate()
  const { listenTogether, stopListenTogether, getCharacter, getCurrentPersona } = useWeChat()
  const [showListenPanel, setShowListenPanel] = useState(false)
  
  const listeningCharacter = listenTogether ? getCharacter(listenTogether.characterId) : null
  const currentPersona = getCurrentPersona()
  
  return (
    <div 
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{
        backgroundImage: 'url(/icons/wechat-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* 一起听歌全局浮窗 - 只要在一起听就显示 */}
      {listenTogether && listeningCharacter && (
        <div 
          className="absolute top-1 left-3 right-3 z-40 px-3 py-2 rounded-full bg-gradient-to-r from-pink-500/90 to-purple-500/90 backdrop-blur flex items-center gap-2 cursor-pointer active:opacity-80 shadow-lg"
          onClick={() => setShowListenPanel(true)}
        >
          <div 
            className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0"
            style={{ animation: 'spin 4s linear infinite' }}
          >
            <div className="w-full h-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white/80" />
            </div>
          </div>
          <span className="flex-1 text-white text-xs truncate">
            🎵 和{listeningCharacter.name}一起听《{listenTogether.songTitle}》
          </span>
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); stopListenTogether() }}
            className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center"
          >
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      {/* 一起听歌展开面板 */}
      {showListenPanel && listenTogether && listeningCharacter && (
        <div className="absolute inset-0 z-50 bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f0f23] flex flex-col">
          {/* 顶部关闭按钮 */}
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <button 
              type="button"
              onClick={() => setShowListenPanel(false)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="text-white font-medium text-sm">一起听</div>
            <div className="w-8" />
          </div>
          
          {/* 双方头像 */}
          <div className="flex items-center justify-center gap-8 mt-8 mb-6">
            {/* 我的头像 */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-pink-400 shadow-lg">
                {currentPersona?.avatar ? (
                  <img src={currentPersona.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-pink-400 to-purple-400 flex items-center justify-center text-white text-xl">
                    我
                  </div>
                )}
              </div>
              <span className="text-white/80 text-xs">{currentPersona?.name || '我'}</span>
            </div>
            
            {/* 连接动画 */}
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-pink-400 animate-pulse" />
              <div className="w-8 h-0.5 bg-gradient-to-r from-pink-400 to-purple-400" />
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: '0.5s' }} />
            </div>
            
            {/* 对方头像 */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-purple-400 shadow-lg">
                {listeningCharacter.avatar ? (
                  <img src={listeningCharacter.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-xl">
                    {listeningCharacter.name.slice(0, 1)}
                  </div>
                )}
              </div>
              <span className="text-white/80 text-xs">{listeningCharacter.name}</span>
            </div>
          </div>
          
          {/* 旋转唱片 */}
          <div className="flex-1 flex items-center justify-center">
            <div className="relative">
              {/* 唱片光晕 */}
              <div 
                className="absolute -inset-8 rounded-full opacity-30"
                style={{ 
                  background: 'radial-gradient(circle, rgba(236,72,153,0.4) 0%, transparent 70%)',
                  animation: 'pulse 2s ease-in-out infinite'
                }}
              />
              
              {/* 旋转唱片 */}
              <div 
                className="w-48 h-48 rounded-full overflow-hidden shadow-2xl relative"
                style={{ 
                  animation: 'spin 8s linear infinite',
                  boxShadow: '0 0 60px rgba(236, 72, 153, 0.4)'
                }}
              >
                {/* 唱片背景 */}
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500 via-purple-500 to-pink-600" />
                
                {/* 唱片纹路 */}
                <div className="absolute inset-4 rounded-full border border-white/20" />
                <div className="absolute inset-8 rounded-full border border-white/15" />
                <div className="absolute inset-12 rounded-full border border-white/10" />
                <div className="absolute inset-16 rounded-full border border-white/10" />
                
                {/* 唱片中心 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-[#1a1a2e] border-4 border-white/30 flex items-center justify-center">
                    <span className="text-2xl">🎵</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* 歌曲信息 */}
          <div className="text-center px-8 mb-4">
            <div className="text-white font-bold text-lg mb-1">{listenTogether.songTitle}</div>
            <div className="text-white/50 text-sm">正在一起聆听...</div>
          </div>
          
          {/* 底部按钮 */}
          <div className="px-8 pb-8 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => {
                setShowListenPanel(false)
                navigate(`/apps/wechat/chat/${listenTogether.characterId}`)
              }}
              className="px-6 py-3 rounded-full bg-pink-500/80 text-white text-sm font-medium active:scale-95 transition-transform"
            >
              去聊天
            </button>
            <button
              type="button"
              onClick={() => { stopListenTogether(); setShowListenPanel(false) }}
              className="px-6 py-3 rounded-full bg-white/10 text-white text-sm font-medium active:scale-95 transition-transform"
            >
              结束一起听
            </button>
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
