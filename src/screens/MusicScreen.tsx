import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS, type Song } from '../context/OSContext'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'

export default function MusicScreen() {
  const navigate = useNavigate()
  const { 
    fontColor, musicPlaying, currentSong, musicProgress, musicPlaylist, 
    playSong, toggleMusic, nextSong, prevSong, seekMusic, toggleFavorite, isFavorite,
    addSong, removeSong
  } = useOS()
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 搜索过滤
  const filteredSongs = musicPlaylist.filter(song => {
    const query = searchQuery.toLowerCase()
    return song.title.toLowerCase().includes(query) || 
           song.artist.toLowerCase().includes(query)
  })

  const displayedSongs = activeTab === 'favorites' 
    ? filteredSongs.filter(s => isFavorite(s.id))
    : filteredSongs

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const currentTime = currentSong ? (musicProgress / 100) * currentSong.duration : 0

  // 导入音乐
  const handleImportMusic = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      if (file.type.startsWith('audio/')) {
        const url = URL.createObjectURL(file)
        const fileName = file.name.replace(/\.[^/.]+$/, '') // 去掉扩展名
        
        // 创建音频元素获取时长
        const audio = new Audio(url)
        audio.addEventListener('loadedmetadata', () => {
          addSong({
            id: `song-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title: fileName,
            artist: '本地音乐',
            cover: '/icons/music-cover.png',
            url: url,
            duration: Math.floor(audio.duration) || 180,
          })
        })
      }
    })
    
    // 清空input，允许重复导入同一文件
    e.target.value = ''
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="音乐" onBack={() => navigate('/', { replace: true })} />
        
        {/* 当前播放 */}
        {currentSong && (
          <div 
            className="mt-4 rounded-3xl p-4 mb-4"
            style={{ 
              background: 'linear-gradient(135deg, rgba(255,182,193,0.4) 0%, rgba(186,154,220,0.4) 100%)',
              border: '1px solid rgba(255,255,255,0.3)'
            }}
          >
            <div className="flex items-center gap-4">
              {/* 旋转唱片 */}
              <div 
                className="relative w-20 h-20 rounded-full overflow-hidden shadow-lg flex-shrink-0"
                style={{
                  animation: musicPlaying ? 'spin 4s linear infinite' : 'none',
                }}
              >
                <img src={currentSong.cover} alt={currentSong.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-white/80" />
                </div>
              </div>
              
              {/* 歌曲信息 */}
              <div className="flex-1 min-w-0">
                <div 
                  className="text-lg font-bold truncate"
                  style={{ color: fontColor.value }}
                >
                  {currentSong.title}
                </div>
                <div 
                  className="text-sm truncate mt-0.5"
                  style={{ color: fontColor.value, opacity: 0.7 }}
                >
                  {currentSong.artist}
                </div>
                
                {/* 进度条 */}
                <div className="mt-3">
                  <div 
                    className="h-1.5 rounded-full overflow-hidden cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.3)' }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const percent = ((e.clientX - rect.left) / rect.width) * 100
                      seekMusic(percent)
                    }}
                  >
                    <div 
                      className="h-full rounded-full transition-all duration-150"
                      style={{ 
                        width: `${musicProgress}%`,
                        background: 'linear-gradient(90deg, #f9a8d4, #c4b5fd)',
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px]" style={{ color: fontColor.value, opacity: 0.6 }}>
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(currentSong.duration)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 控制按钮 */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <button 
                type="button"
                onClick={prevSong}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{ background: 'rgba(255,255,255,0.25)' }}
              >
                <svg className="w-5 h-5" fill={fontColor.value} viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>
              
              <button 
                type="button"
                onClick={toggleMusic}
                className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-90"
                style={{ background: 'linear-gradient(135deg, #f9a8d4, #c4b5fd)' }}
              >
                {musicPlaying ? (
                  <svg className="w-7 h-7" fill="white" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg className="w-7 h-7 ml-1" fill="white" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>
              
              <button 
                type="button"
                onClick={nextSong}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-90"
                style={{ background: 'rgba(255,255,255,0.25)' }}
              >
                <svg className="w-5 h-5" fill={fontColor.value} viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* 搜索框 */}
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="搜索歌曲或歌手..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 pl-10 rounded-2xl text-sm outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: fontColor.value,
            }}
          />
          <svg 
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" 
            fill="none" 
            stroke={fontColor.value}
            strokeWidth={2}
            viewBox="0 0 24 24"
            style={{ opacity: 0.5 }}
          >
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.3)' }}
            >
              <span style={{ color: fontColor.value, fontSize: '12px' }}>✕</span>
            </button>
          )}
        </div>

        {/* Tab 切换 + 导入按钮 */}
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
            style={{
              background: activeTab === 'all' ? 'linear-gradient(135deg, #f9a8d4, #c4b5fd)' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'all' ? 'white' : fontColor.value,
            }}
          >
            全部 ✨
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
            style={{
              background: activeTab === 'favorites' ? 'linear-gradient(135deg, #f9a8d4, #c4b5fd)' : 'rgba(255,255,255,0.2)',
              color: activeTab === 'favorites' ? 'white' : fontColor.value,
            }}
          >
            收藏 💖
          </button>
          
          {/* 导入按钮 */}
          <button
            type="button"
            onClick={handleImportMusic}
            className="ml-auto px-3 py-1.5 rounded-full text-sm font-medium transition-all active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: fontColor.value,
            }}
          >
            + 导入
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* 歌曲列表 */}
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-2">
          {displayedSongs.length === 0 ? (
            <div 
              className="text-center py-10 text-sm"
              style={{ color: fontColor.value, opacity: 0.5 }}
            >
              {searchQuery 
                ? '没有找到匹配的歌曲~' 
                : activeTab === 'favorites' 
                  ? '还没有收藏的歌曲哦~' 
                  : '暂无歌曲，点击"导入"添加音乐吧~'}
            </div>
          ) : (
            displayedSongs.map((song) => (
              <SongItem 
                key={song.id} 
                song={song} 
                isPlaying={currentSong?.id === song.id && musicPlaying}
                isCurrent={currentSong?.id === song.id}
                onPlay={() => playSong(song)}
                onToggleFavorite={() => toggleFavorite(song.id)}
                onDelete={() => removeSong(song.id)}
                isFavorite={isFavorite(song.id)}
              />
            ))
          )}
        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </PageContainer>
  )
}

function SongItem({ 
  song, 
  isPlaying, 
  isCurrent,
  onPlay, 
  onToggleFavorite,
  onDelete,
  isFavorite 
}: { 
  song: Song
  isPlaying: boolean
  isCurrent: boolean
  onPlay: () => void
  onToggleFavorite: () => void
  onDelete: () => void
  isFavorite: boolean
}) {
  const { fontColor } = useOS()
  
  return (
    <div 
      className="flex items-center gap-3 p-3 rounded-2xl transition-all"
      style={{ 
        background: isCurrent ? 'rgba(249,168,212,0.2)' : 'rgba(255,255,255,0.15)',
        border: isCurrent ? '1px solid rgba(249,168,212,0.4)' : '1px solid transparent',
      }}
    >
      {/* 封面 */}
      <div 
        className="relative w-12 h-12 rounded-xl overflow-hidden shadow flex-shrink-0 cursor-pointer"
        onClick={onPlay}
      >
        <img src={song.cover} alt={song.title} className="w-full h-full object-cover" />
        {isPlaying && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="flex gap-0.5">
              <span className="w-1 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
      </div>
      
      {/* 信息 */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onPlay}>
        <div 
          className="font-medium truncate text-sm"
          style={{ color: fontColor.value }}
        >
          {song.title}
        </div>
        <div 
          className="text-xs truncate mt-0.5"
          style={{ color: fontColor.value, opacity: 0.6 }}
        >
          {song.artist}
        </div>
      </div>
      
      {/* 收藏按钮 */}
      <button 
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavorite()
        }}
        className="w-8 h-8 flex items-center justify-center transition-transform active:scale-90"
      >
        <span className="text-xl">{isFavorite ? '💖' : '🤍'}</span>
      </button>
      
      {/* 删除按钮 */}
      <button 
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90"
        style={{ background: 'rgba(255,100,100,0.2)' }}
      >
        <span className="text-sm">🗑️</span>
      </button>
    </div>
  )
}
