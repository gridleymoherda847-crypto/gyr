import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import AppIcon from '../components/AppIcon'
import { useOS, MINIMAL_ICONS } from '../context/OSContext'
import { GRID_APPS, DOCK_APPS } from '../data/apps'

// 四个主要 App 的配置（用于自定义布局）
const MAIN_APPS = [
  { id: 'wechat', name: 'Chat', route: '/apps/wechat', icon: '/icons/wechat.png' },
  { id: 'gameCenter', name: '游戏大厅', route: '/apps/game-center', icon: '/icons/doudizhu.png' },
  { id: 'diaryVault', name: '日记', route: '/apps/diary-vault', icon: '/icons/diary.svg' },
  { id: 'x', name: 'X', route: '/apps/x', icon: '/icons/x.svg' },
]

// 游戏大厅里的小游戏列表
const GAME_LIST = [
  { id: 'doudizhu', name: '斗地主', route: '/apps/doudizhu', icon: '🃏', desc: '经典纸牌游戏' },
  { id: 'liaoliaoYisheng', name: '寥寥一生', route: '/apps/liaoliao-yisheng', icon: '📜', desc: '开始修仙人生' },
  { id: 'scratchCard', name: '刮刮乐', route: '/apps/scratch-card', icon: '🎫', desc: '试试手气' },
  { id: 'minesweeper', name: '扫雷', route: '/apps/minesweeper', icon: '💣', desc: '经典益智' },
  { id: 'gacha', name: '扭蛋机', route: '/apps/gacha', icon: '🎰', desc: '即将上线', disabled: true },
]

// 跳动的爱心组件 - 黑色填充，无边框
function BouncingHearts() {
  return (
    <div className="flex items-center justify-center gap-2 h-full">
      {[0, 1, 2, 3].map(i => (
        <svg 
          key={i}
          className="w-3 h-3 animate-bounce" 
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1s' }}
          fill="#333" 
          viewBox="0 0 24 24"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      ))}
    </div>
  )
}

export default function HomeScreen() {
  const { 
    time, fontColor, currentFont, 
    musicPlaying, currentSong, musicProgress, toggleMusic, nextSong, prevSong,
    anniversaries, memo, iconTheme, customAppIcons, decorImage,
    homeAvatar, setHomeAvatar, signature, setSignature, waterCount, addWater,
    weather, locationSettings
  } = useOS()
  
  const [rotation, setRotation] = useState(0)
  const [showSignatureEdit, setShowSignatureEdit] = useState(false)
  const [tempSignature, setTempSignature] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [showGameCenter, setShowGameCenter] = useState(false) // 游戏大厅悬浮窗
  
  // 免责声明状态
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    return localStorage.getItem('mina_disclaimer_agreed') !== 'true'
  })
  
  // 首次打开提醒弹窗状态
  const [showWelcomeTip, setShowWelcomeTip] = useState(() => {
    return localStorage.getItem('mina_welcome_tip_dismissed') !== 'true'
  })
  const [dontShowAgain, setDontShowAgain] = useState(false)
  
  // 同意免责声明
  const handleAgreeDisclaimer = () => {
    localStorage.setItem('mina_disclaimer_agreed', 'true')
    setShowDisclaimer(false)
  }
  
  // 关闭首次提醒弹窗
  const handleCloseWelcomeTip = () => {
    if (dontShowAgain) {
      localStorage.setItem('mina_welcome_tip_dismissed', 'true')
    }
    setShowWelcomeTip(false)
  }
  
  const now = new Date()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`
  const weekDay = weekDays[now.getDay()]

  // 唱片旋转动画
  useEffect(() => {
    if (!musicPlaying) return
    const interval = setInterval(() => {
      setRotation((prev) => (prev + 2) % 360)
    }, 50)
    return () => clearInterval(interval)
  }, [musicPlaying])

  // 计算纪念日天数
  const calcDays = (dateStr: string, type: 'countdown' | 'countup') => {
    const target = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    target.setHours(0, 0, 0, 0)
    
    if (type === 'countup') {
      const diff = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
      return diff >= 0 ? diff : 0
    } else {
      let targetThisYear = new Date(today.getFullYear(), target.getMonth(), target.getDate())
      if (targetThisYear < today) {
        targetThisYear = new Date(today.getFullYear() + 1, target.getMonth(), target.getDate())
      }
      return Math.ceil((targetThisYear.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    }
  }

  // 获取图标
  const getAppIcon = (appId: string, defaultIcon: string) => {
    if (customAppIcons[appId]) return customAppIcons[appId]
    if (iconTheme === 'minimal' && MINIMAL_ICONS[appId]) return MINIMAL_ICONS[appId]
    return defaultIcon
  }

  // 头像上传
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setHomeAvatar(reader.result as string)
    }
    reader.readAsDataURL(file)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  // ========== 默认布局（原来的传统布局）==========
  if (iconTheme === 'custom') {
    return (
      <div className="relative flex h-full flex-col px-5 pt-4 pb-2 animate-fade-in">
        {/* 时间小部件 */}
        <div className="mb-4 rounded-3xl bg-white/30 backdrop-blur-md border border-white/40 px-5 py-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <div 
                className="text-[40px] font-bold leading-none"
                style={{ color: fontColor.value, fontFamily: currentFont.fontFamily }}
              >
                {time}
              </div>
              <div className="text-[11px] opacity-70 mt-1 leading-tight" style={{ color: fontColor.value }}>
                <Link to="/apps/settings/location" className="hover:opacity-80 transition-opacity">
                  {dateStr} {weekDay} · 📍 {weather.city || locationSettings.manualCity}
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* 音乐播放器迷你版 */}
              <Link to="/apps/music" className="flex items-center gap-3">
                <div 
                  className="relative w-14 h-14 rounded-full overflow-hidden shadow-lg border-2 border-white/50"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transition: musicPlaying ? 'none' : 'transform 0.3s ease',
                  }}
                >
                  {currentSong?.cover ? (
                    <img src={currentSong.cover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-pink-200 to-pink-300 flex items-center justify-center">
                      <span className="text-lg">🎵</span>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-white shadow" />
                  </div>
                </div>
              </Link>
            </div>
          </div>
          
          {/* 音乐控制条 */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div
                className="text-xs truncate mb-1 max-w-[180px] sm:max-w-[240px]"
                style={{ color: fontColor.value }}
                title={currentSong ? `${currentSong.title} - ${currentSong.artist}` : '暂无播放'}
              >
                {currentSong ? `${currentSong.title} - ${currentSong.artist}` : '暂无播放'}
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: `${fontColor.value}20` }}>
                <div 
                  className="h-full rounded-full transition-all"
                  style={{ width: `${musicProgress}%`, background: fontColor.value }}
                />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button 
                type="button"
                onClick={prevSong}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/30"
              >
                <span className="text-sm">⏮</span>
              </button>
              <button 
                type="button"
                onClick={toggleMusic}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/50 shadow"
              >
                <span className="text-lg">{musicPlaying ? '⏸' : '▶️'}</span>
              </button>
              <button 
                type="button"
                onClick={nextSong}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/30"
              >
                <span className="text-sm">⏭</span>
              </button>
            </div>
          </div>
        </div>

        {/* App 网格 */}
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <div className="grid grid-cols-4 gap-4 px-2">
            {GRID_APPS.map((app, index) => (
              app.id === 'gameCenter' ? (
                // 游戏大厅：点击打开悬浮窗
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setShowGameCenter(true)}
                  className="press-effect animate-scale-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <AppIcon 
                    appId={app.id}
                    label={app.name} 
                    icon={app.icon} 
                    gradient={app.gradient}
                  />
                </button>
              ) : (
                <Link
                  key={app.id}
                  to={app.route}
                  className="press-effect animate-scale-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <AppIcon 
                    appId={app.id}
                    label={app.name} 
                    icon={app.icon} 
                    gradient={app.gradient}
                  />
                </Link>
              )
            ))}
          </div>
        </div>

        {/* 底部 Dock 栏 */}
        <div className="mt-3 pb-1">
          <div className="mx-2 rounded-[20px] bg-white/20 backdrop-blur-xl border border-white/25 px-4 py-2 shadow-lg">
            <div className="flex items-center justify-around">
              {DOCK_APPS.map((app, index) => (
                <Link
                  key={app.id}
                  to={app.route}
                  className="press-effect animate-scale-in"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <AppIcon 
                    appId={app.id}
                    label={app.name} 
                    icon={app.icon} 
                    gradient={app.gradient}
                    size="dock"
                  />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* 游戏大厅悬浮窗 */}
        {showGameCenter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
            {/* 背景遮罩 */}
            <div 
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowGameCenter(false)}
            />
            {/* 悬浮窗内容 */}
            <div className="relative w-full max-w-[320px] bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
              {/* 头部 */}
              <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🎮</span>
                    <span className="text-white font-bold text-lg">游戏大厅</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGameCenter(false)}
                    className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <p className="text-white/80 text-xs mt-1">和好友一起玩游戏吧~</p>
              </div>
              
              {/* 游戏列表 */}
              <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                {GAME_LIST.map((game) => (
                  <Link
                    key={game.id}
                    to={game.disabled ? '#' : game.route}
                    onClick={(e) => {
                      if (game.disabled) {
                        e.preventDefault()
                      } else {
                        setShowGameCenter(false)
                      }
                    }}
                    className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${
                      game.disabled 
                        ? 'bg-gray-100 opacity-60 cursor-not-allowed' 
                        : 'bg-gradient-to-r from-gray-50 to-gray-100 active:scale-[0.98] hover:shadow-md'
                    }`}
                  >
                    {/* 游戏图标 */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${
                      game.disabled ? 'bg-gray-200' : 'bg-gradient-to-br from-purple-100 to-pink-100'
                    }`}>
                      {game.icon}
                    </div>
                    {/* 游戏信息 */}
                    <div className="flex-1">
                      <div className="font-bold text-gray-800">{game.name}</div>
                      <div className={`text-xs mt-0.5 ${game.disabled ? 'text-gray-400' : 'text-gray-500'}`}>
                        {game.desc}
                      </div>
                    </div>
                    {/* 箭头 */}
                    {!game.disabled && (
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                    {game.disabled && (
                      <span className="text-xs text-gray-400 bg-gray-200 px-2 py-1 rounded-full">敬请期待</span>
                    )}
                  </Link>
                ))}
              </div>
              
              {/* 底部提示 */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                <p className="text-center text-xs text-gray-400">更多游戏，敬请期待~</p>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ========== 自定义布局（新的四宫格布局）==========
  return (
    <div className="relative flex h-full flex-col px-4 pt-14 pb-1 animate-fade-in">
      {/* 顶部区域：头像独立 + 时间悬浮窗 */}
      <div className="flex items-center gap-3 mb-8">
        {/* 头像 - 独立 */}
        <button 
          type="button"
          onClick={() => avatarInputRef.current?.click()}
          className="flex-shrink-0"
        >
          <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/50 border-2 border-white/60 shadow-lg flex items-center justify-center">
            {homeAvatar ? (
              <img src={homeAvatar} alt="装饰" className="w-full h-full object-cover" />
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="#bbb" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
              </svg>
            )}
          </div>
        </button>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarUpload}
        />
        
        {/* 时间悬浮窗 - 独立 */}
        <div className="flex-1 rounded-2xl bg-white/40 backdrop-blur-md border border-white/50 shadow-lg px-4 py-3">
          <div className="flex items-center justify-between">
            {/* 签名和日期 */}
            <div className="flex-1 min-w-0">
              <button 
                type="button"
                onClick={() => { setTempSignature(signature); setShowSignatureEdit(true) }}
                className="text-[13px] font-medium truncate block w-full text-left hover:opacity-70 transition-opacity"
                style={{ color: fontColor.value, fontFamily: currentFont.fontFamily }}
              >
                {signature || '点击编辑签名'}
              </button>
              <div 
                className="text-[11px] opacity-70 leading-tight"
                style={{ color: fontColor.value }}
              >
                <Link to="/apps/settings/location" className="hover:opacity-80 transition-opacity">
                  {dateStr} · {weekDay} · 📍 {weather.city || locationSettings.manualCity}
                </Link>
              </div>
            </div>
            
            {/* 时间 */}
            <div 
              className="text-[40px] font-bold ml-2 leading-none"
              style={{ 
                color: fontColor.value, 
                fontFamily: currentFont.fontFamily,
                textShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              {time}
            </div>
          </div>
          {/* 位置已合并到日期行里，避免占布局 */}
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
        {/* 上半部分：音乐+钱包 和 四个App */}
        <div className="grid grid-cols-2 gap-2">
          {/* 左侧：钱包 + 音乐 + 爱心 */}
          <div className="flex flex-col gap-1.5">
            {/* 钱包 */}
            <Link 
              to="/apps/wechat/wallet"
              className="h-9 bg-white/30 backdrop-blur-sm rounded-xl px-3 border border-white/40 shadow-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="#333" strokeWidth="1.5" viewBox="0 0 24 24">
                <rect x="2" y="6" width="20" height="14" rx="2"/>
                <path d="M16 12h.01M2 10h20"/>
              </svg>
              <span className="text-xs font-medium" style={{ color: fontColor.value }}>我的钱包</span>
            </Link>
            
            {/* 音乐播放器 */}
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-1.5 border border-white/30 shadow-sm flex flex-col">
              <Link to="/apps/music" className="flex items-center justify-center">
                <div 
                  className="relative w-[60px] h-[60px] rounded-full overflow-hidden shadow-lg"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transition: musicPlaying ? 'none' : 'transform 0.3s ease',
                  }}
                >
                  {decorImage ? (
                    <img src={decorImage} alt="唱片封面" className="w-full h-full object-cover" />
                  ) : (
                    <svg viewBox="0 0 100 100" className="w-full h-full">
                      <circle cx="50" cy="50" r="48" fill="white" stroke="#333" strokeWidth="1.5"/>
                      <circle cx="50" cy="50" r="38" fill="none" stroke="#333" strokeWidth="0.5" strokeDasharray="3 3"/>
                      <circle cx="50" cy="50" r="28" fill="none" stroke="#333" strokeWidth="0.5" strokeDasharray="3 3"/>
                      <circle cx="50" cy="50" r="18" fill="none" stroke="#333" strokeWidth="1"/>
                      <circle cx="50" cy="50" r="8" fill="#333"/>
                      <circle cx="50" cy="50" r="3" fill="white"/>
                    </svg>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-2 h-2 rounded-full bg-white shadow border border-gray-200" />
                  </div>
                </div>
              </Link>
              
              <div className="text-[9px] text-center truncate px-1 mt-1" style={{ color: fontColor.value }}>
                {currentSong ? currentSong.title : '点击播放'}
              </div>
              
              <div className="h-0.5 rounded-full mt-0.5 mx-1 overflow-hidden" style={{ background: `${fontColor.value}15` }}>
                <div 
                  className="h-full rounded-full"
                  style={{ width: `${musicProgress}%`, background: 'linear-gradient(90deg, #666, #333)' }}
                />
              </div>
              
              <div className="flex items-center justify-center gap-1.5 mt-0.5">
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); prevSong() }}
                  className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/30 active:scale-90 transition-all"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="#333" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M19 20L9 12l10-8v16zM5 19V5"/>
                  </svg>
                </button>
                
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); toggleMusic() }}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-white/60 shadow hover:bg-white/80 active:scale-90 transition-all"
                >
                  {musicPlaying ? (
                    <svg className="w-2.5 h-2.5" fill="none" stroke="#333" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
                    </svg>
                  ) : (
                    <svg className="w-2.5 h-2.5 ml-0.5" fill="#333" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>
                
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); nextSong() }}
                  className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/30 active:scale-90 transition-all"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="#333" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M5 4l10 8-10 8V4zM19 5v14"/>
                  </svg>
                </button>
              </div>
            </div>
            
            {/* 爱心装饰 */}
            <div className="h-7 bg-white/20 backdrop-blur-sm rounded-xl border border-white/30">
              <BouncingHearts />
            </div>
          </div>

          {/* 右侧：4个App + 喝水 */}
          <div className="flex flex-col gap-1.5">
            {/* 4个App */}
            <div className="flex-1 bg-white/40 backdrop-blur-sm rounded-xl p-1.5 border border-white/50 shadow-sm">
              <div className="grid grid-cols-2 gap-1 h-full">
                {MAIN_APPS.map(app => (
                  app.id === 'gameCenter' ? (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => setShowGameCenter(true)}
                      className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-white/60 p-1 active:scale-95 transition-transform"
                    >
                      <img 
                        src={getAppIcon(app.id, app.icon)} 
                        alt={app.name} 
                        className="w-6 h-6 object-contain"
                      />
                      <span className="text-[8px] text-gray-600 truncate">{app.name}</span>
                    </button>
                  ) : (
                    <Link
                      key={app.id}
                      to={app.route}
                      className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-white/60 p-1 active:scale-95 transition-transform"
                    >
                      <img 
                        src={getAppIcon(app.id, app.icon)} 
                        alt={app.name} 
                        className="w-6 h-6 object-contain"
                      />
                      <span className="text-[8px] text-gray-600 truncate">{app.name}</span>
                    </Link>
                  )
                ))}
              </div>
            </div>
            
            {/* 喝水计数 */}
            <div className="h-9 bg-white/30 backdrop-blur-sm rounded-xl px-3 border border-white/40 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="#333" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M12 2C12 2 5 9 5 14a7 7 0 0014 0c0-5-7-12-7-12z"/>
                </svg>
                <span className="text-xs" style={{ color: fontColor.value }}>今日喝水</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold" style={{ color: fontColor.value }}>{waterCount}</span>
                <span className="text-[10px] opacity-60" style={{ color: fontColor.value }}>次</span>
                <button
                  type="button"
                  onClick={addWater}
                  className="w-5 h-5 rounded-full bg-white/60 flex items-center justify-center ml-1 hover:bg-white/80 active:scale-90 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="#333" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M12 4v16m8-8H4"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 下半部分：纪念日 和 待办事项 - 固定高度 */}
        <div className="h-48 grid grid-cols-2 gap-2 flex-shrink-0">
          {/* 纪念日 */}
          <Link 
            to="/apps/anniversary"
            className="h-48 bg-white/20 backdrop-blur-sm rounded-xl p-2 border border-white/30 shadow-sm flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium" style={{ color: fontColor.value }}>纪念日</span>
              <svg className="w-3 h-3" fill="none" stroke="#666" strokeWidth="1.5" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
            </div>
            <div className="flex-1 overflow-y-auto hide-scrollbar space-y-1">
              {anniversaries.length === 0 ? (
                <div className="text-[9px] text-center opacity-50 py-2" style={{ color: fontColor.value }}>
                  点击添加
                </div>
              ) : (
                anniversaries.slice(0, 3).map(ann => (
                  <div key={ann.id} className="flex items-center gap-1 bg-white/30 rounded-lg px-1.5 py-0.5">
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] truncate" style={{ color: fontColor.value }}>{ann.name}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-gray-800">{calcDays(ann.date, ann.type)}</span>
                      <span className="text-[8px] text-gray-400 ml-0.5">
                        {ann.type === 'countup' ? '天' : '天后'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Link>

          {/* 待办事项 */}
          <Link 
            to="/apps/memo"
            className="h-48 bg-white/20 backdrop-blur-sm rounded-xl p-2 border border-white/30 shadow-sm flex flex-col overflow-hidden"
          >
            {/* 装饰图片区域 - 占1/2高度 */}
            {memo.image && (
              <div className="h-1/2 mb-1 rounded-lg overflow-hidden flex-shrink-0">
                <img 
                  src={memo.image} 
                  alt="装饰图片" 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium" style={{ color: fontColor.value }}>待办事项</span>
              <svg className="w-3 h-3" fill="none" stroke="#666" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
            </div>
            <div className="flex-1 overflow-y-auto hide-scrollbar space-y-0.5">
              {(!memo.todos || memo.todos.length === 0) ? (
                <div className="text-[9px] text-center opacity-50 py-2" style={{ color: fontColor.value }}>
                  点击添加
                </div>
              ) : (
                memo.todos.slice(0, 3).map(todo => (
                  <div key={todo.id} className="flex items-center gap-1 bg-white/30 rounded-lg px-1.5 py-0.5">
                    <div className={`w-2.5 h-2.5 rounded border flex-shrink-0 flex items-center justify-center ${todo.done ? 'bg-gray-700 border-gray-700' : 'border-gray-400'}`}>
                      {todo.done && (
                        <svg className="w-1.5 h-1.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7"/>
                        </svg>
                      )}
                    </div>
                    <span className={`text-[9px] truncate flex-1 ${todo.done ? 'line-through opacity-50' : ''}`} style={{ color: fontColor.value }}>
                      {todo.text}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Link>
        </div>
      </div>

      {/* 底部 Dock 栏 */}
      <div className="mt-2 pb-1">
        <div className="mx-1 rounded-[18px] bg-white/15 backdrop-blur-xl border border-white/20 px-3 py-1 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-around">
            {DOCK_APPS.map((app, index) => (
              <Link
                key={app.id}
                to={app.route}
                className="press-effect animate-scale-in"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <AppIcon 
                  appId={app.id}
                  label={app.name} 
                  icon={app.icon} 
                  gradient={app.gradient}
                  size="dock"
                />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 签名编辑弹窗 */}
      {showSignatureEdit && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/35"
            onClick={() => setShowSignatureEdit(false)}
            role="presentation"
          />
          <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/90 backdrop-blur-xl p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
            <div className="text-center mb-3">
              <div className="text-[15px] font-semibold text-[#111]">编辑签名</div>
            </div>
            <input
              type="text"
              value={tempSignature}
              onChange={(e) => setTempSignature(e.target.value)}
              placeholder="输入你的签名..."
              maxLength={30}
              className="w-full rounded-xl border border-gray-200 bg-white/80 px-4 py-3 text-sm text-gray-800 outline-none focus:border-gray-400"
              autoFocus
            />
            <div className="text-right text-[10px] text-gray-400 mt-1">{tempSignature.length}/30</div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setShowSignatureEdit(false)}
                className="flex-1 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setSignature(tempSignature)
                  setShowSignatureEdit(false)
                }}
                className="flex-1 rounded-full bg-gray-800 px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 免责声明弹窗 */}
      {showDisclaimer && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-[340px] max-h-[85vh] bg-white rounded-2xl overflow-hidden shadow-xl flex flex-col">
            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-center py-4">
                <div className="text-3xl mb-2">⚠️</div>
                <h1 className="text-xl font-bold text-gray-800">使用须知</h1>
                <p className="text-sm text-gray-500 mt-1">请仔细阅读以下内容</p>
              </div>
              
              <div className="space-y-4 text-sm text-gray-600">
                <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                  <div className="font-bold text-red-700 mb-1">🔞 内容声明</div>
                  <p>本应用可能涉及成人内容，仅限 18 岁以上用户使用。</p>
                </div>
                
                <div className="p-3 bg-orange-50 rounded-xl border border-orange-100">
                  <div className="font-bold text-orange-700 mb-1">🤖 AI 声明</div>
                  <p>所有角色均为 AI 虚拟角色，其回复由 AI 模型生成，不代表任何真实人物的观点或立场。</p>
                </div>
                
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <div className="font-bold text-blue-700 mb-1">💾 数据声明</div>
                  <p>所有数据存储在浏览器本地，清除浏览器数据会导致数据丢失。请定期使用「设置 → 导出数据」功能进行备份。</p>
                </div>
                
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-100">
                  <div className="font-bold text-purple-700 mb-1">🔑 API 声明</div>
                  <p>本应用需要用户自行配置 AI API。开发者不提供 API 服务，不对 API 服务的可用性、安全性负责。</p>
                </div>
                
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="font-bold text-gray-700 mb-1">⚖️ 免责声明</div>
                  <p>开发者不对因使用本应用而产生的任何损失承担责任，包括数据丢失、API 费用、因违规使用导致的法律责任等。</p>
                </div>
                
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <button
                onClick={handleAgreeDisclaimer}
                className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-xl active:scale-[0.98]"
              >
                我已阅读并同意
              </button>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                点击即表示你已年满 18 岁并同意以上条款
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* 首次打开提醒弹窗 */}
      {showWelcomeTip && !showDisclaimer && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-[340px] bg-white rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5">
              <div className="text-center mb-4">
                <div className="text-4xl mb-2">📱</div>
                <h2 className="text-lg font-bold text-gray-800">欢迎使用小手机</h2>
              </div>
              
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 rounded-xl">
                  <p className="text-[13px] text-blue-800 font-medium">📖 使用手册</p>
                  <p className="text-[12px] text-blue-600 mt-1">
                    遇到问题请查阅主页的「使用手册」，里面有「智能搜索」功能，可以快速找到答案
                  </p>
                </div>
                
                <div className="p-3 bg-orange-50 rounded-xl">
                  <p className="text-[13px] text-orange-800 font-medium">🔑 关于API</p>
                  <p className="text-[12px] text-orange-600 mt-1">
                    API相关问题请自行解决，可在某鱼、某书搜索购买，作者不提供解答服务
                  </p>
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => setDontShowAgain(!dontShowAgain)}
                className="mt-4 flex items-center gap-2 w-full py-2 active:bg-gray-50 rounded-lg"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  dontShowAgain 
                    ? 'bg-green-500 border-green-500' 
                    : 'border-gray-300 bg-white'
                }`}>
                  {dontShowAgain && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-[12px] text-gray-500">不再显示此提醒</span>
              </button>
              
              <button
                onClick={handleCloseWelcomeTip}
                className="mt-4 w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl text-[14px] active:scale-[0.98]"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 游戏大厅悬浮窗 */}
      {showGameCenter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          {/* 背景遮罩 */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowGameCenter(false)}
          />
          {/* 悬浮窗内容 */}
          <div className="relative w-full max-w-[320px] bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
            {/* 头部 */}
            <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🎮</span>
                  <span className="text-white font-bold text-lg">游戏大厅</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGameCenter(false)}
                  className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-white/80 text-xs mt-1">和好友一起玩游戏吧~</p>
            </div>
            
            {/* 游戏列表 */}
            <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
              {GAME_LIST.map((game) => (
                <Link
                  key={game.id}
                  to={game.disabled ? '#' : game.route}
                  onClick={(e) => {
                    if (game.disabled) {
                      e.preventDefault()
                    } else {
                      setShowGameCenter(false)
                    }
                  }}
                  className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${
                    game.disabled 
                      ? 'bg-gray-100 opacity-60 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-gray-50 to-gray-100 active:scale-[0.98] hover:shadow-md'
                  }`}
                >
                  {/* 游戏图标 */}
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${
                    game.disabled ? 'bg-gray-200' : 'bg-gradient-to-br from-purple-100 to-pink-100'
                  }`}>
                    {game.icon}
                  </div>
                  {/* 游戏信息 */}
                  <div className="flex-1">
                    <div className="font-bold text-gray-800">{game.name}</div>
                    <div className={`text-xs mt-0.5 ${game.disabled ? 'text-gray-400' : 'text-gray-500'}`}>
                      {game.desc}
                    </div>
                  </div>
                  {/* 箭头 */}
                  {!game.disabled && (
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                  {game.disabled && (
                    <span className="text-xs text-gray-400 bg-gray-200 px-2 py-1 rounded-full">敬请期待</span>
                  )}
                </Link>
              ))}
            </div>
            
            {/* 底部提示 */}
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">更多游戏正在开发中...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
