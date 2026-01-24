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
      {/* 一起听歌全局浮窗 - 只要在一起听就显示（清新绿色配色） */}
      {listenTogether && listeningCharacter && (
        <div 
          className="absolute top-1 left-3 right-3 z-40 px-3 py-2 rounded-full bg-gradient-to-r from-emerald-400/90 to-teal-400/90 backdrop-blur flex items-center gap-2 cursor-pointer active:opacity-80 shadow-lg"
          onClick={() => setShowListenPanel(true)}
        >
          <div 
            className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0"
            style={{ animation: 'spin 4s linear infinite' }}
          >
            <div className="w-full h-full bg-gradient-to-br from-emerald-300 to-teal-400 flex items-center justify-center">
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
      
      {/* 一起听歌展开面板 - 清新浅绿色风格 */}
      {showListenPanel && listenTogether && listeningCharacter && (
        <div 
          className="absolute inset-0 z-50 flex flex-col"
          style={{
            backgroundImage: 'url(/icons/listen-together-bg.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* 半透明遮罩增加层次感 */}
          <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px]" />
          
          {/* 内容层 */}
          <div className="relative z-10 flex flex-col h-full">
            {/* 顶部关闭按钮 */}
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <button 
                type="button"
                onClick={() => setShowListenPanel(false)}
                className="w-8 h-8 rounded-full bg-emerald-500/30 backdrop-blur flex items-center justify-center"
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
                <div className="w-20 h-20 rounded-full overflow-hidden border-3 border-emerald-400 shadow-lg" style={{ borderWidth: '3px' }}>
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
              
              {/* 连接动画 - 清新绿色 */}
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <div className="w-6 h-0.5 bg-gradient-to-r from-emerald-400 to-teal-400" />
                <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" style={{ animationDelay: '0.5s' }} />
              </div>
              
              {/* 对方头像 */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-20 h-20 rounded-full overflow-hidden border-3 border-teal-400 shadow-lg" style={{ borderWidth: '3px' }}>
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
            
            {/* 旋转唱片 - 清新绿色风格 */}
            <div className="flex-1 flex items-center justify-center">
              <div className="relative">
                {/* 唱片光晕 - 绿色 */}
                <div 
                  className="absolute -inset-8 rounded-full opacity-40"
                  style={{ 
                    background: 'radial-gradient(circle, rgba(52,211,153,0.5) 0%, transparent 70%)',
                    animation: 'pulse 2s ease-in-out infinite'
                  }}
                />
                
                {/* 旋转唱片 */}
                <div 
                  className="w-44 h-44 rounded-full overflow-hidden shadow-2xl relative"
                  style={{ 
                    animation: 'spin 8s linear infinite',
                    boxShadow: '0 0 50px rgba(52, 211, 153, 0.4)'
                  }}
                >
                  {/* 唱片背景 - 清新绿色渐变 */}
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-teal-400 to-emerald-500" />
                  
                  {/* 唱片纹路 */}
                  <div className="absolute inset-4 rounded-full border border-white/30" />
                  <div className="absolute inset-8 rounded-full border border-white/25" />
                  <div className="absolute inset-12 rounded-full border border-white/20" />
                  <div className="absolute inset-14 rounded-full border border-white/15" />
                  
                  {/* 唱片中心 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/90 border-4 border-emerald-200 flex items-center justify-center shadow-inner">
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
            
            {/* 底部按钮 - 清新绿色风格 */}
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
                onClick={() => { stopListenTogether(); setShowListenPanel(false) }}
                className="px-6 py-3 rounded-full bg-white/70 text-emerald-700 text-sm font-medium active:scale-95 transition-transform shadow-lg backdrop-blur"
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
