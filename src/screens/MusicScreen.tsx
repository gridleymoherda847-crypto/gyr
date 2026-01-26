import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS, type Song } from '../context/OSContext'
import PageContainer from '../components/PageContainer'

export default function MusicScreen() {
  const navigate = useNavigate()
  const { 
    musicPlaying, currentSong, musicProgress, musicPlaylist, 
    playSong, toggleMusic, nextSong, prevSong, seekMusic, toggleFavorite, isFavorite,
    addSong, removeSong
  } = useOS()
  const [activeTab, setActiveTab] = useState<'recommend' | 'playlist' | 'favorites'>('recommend')
  const [searchQuery, setSearchQuery] = useState('')
  const [showPlayer, setShowPlayer] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 导入音乐状态
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importSongName, setImportSongName] = useState('')
  const [importSongArtist, setImportSongArtist] = useState('本地音乐')
  const [importSongData, setImportSongData] = useState<{ base64: string; duration: number } | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)

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

  // 文件转 base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    if (!file.type.startsWith('audio/')) {
      return
    }

    // 检查文件大小（限制 15MB）
    if (file.size > 15 * 1024 * 1024) {
      alert('音频文件太大，最大支持 15MB')
      e.target.value = ''
      return
    }

    setImportLoading(true)
    
    try {
      const fileName = file.name.replace(/\.[^/.]+$/, '') // 去掉扩展名
      const base64 = await fileToBase64(file)
      
      // 创建音频元素获取时长
      const audio = new Audio(base64)
      await new Promise<void>((resolve) => {
        audio.addEventListener('loadedmetadata', () => resolve())
        audio.addEventListener('error', () => resolve())
      })
      
      const duration = Math.floor(audio.duration) || 180
      
      setImportSongName(fileName)
      setImportSongArtist('本地音乐')
      setImportSongData({ base64, duration })
      setShowImportDialog(true)
    } catch (err) {
      alert('导入失败，请重试')
    } finally {
      setImportLoading(false)
      e.target.value = ''
    }
  }

  const confirmImport = () => {
    if (!importSongData) return
    
    addSong({
      id: `song-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: importSongName.trim() || '未命名',
      artist: importSongArtist.trim() || '本地音乐',
      cover: '/icons/music-cover.png',
      url: importSongData.base64,
      duration: importSongData.duration,
    })
    
    setShowImportDialog(false)
    setImportSongData(null)
    setImportSuccess(true)
    setTimeout(() => setImportSuccess(false), 2000)
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f0f23] animate-fade-in">
        {/* 顶部导航栏 - QQ音乐风格 */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <button 
            type="button" 
            onClick={() => navigate('/', { replace: true })}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="flex-1 mx-3">
            <div className="relative">
              <input
                type="text"
                placeholder="搜索歌曲、歌手"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-9 rounded-full text-sm bg-white/10 text-white placeholder-white/50 outline-none"
              />
              <svg 
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" 
                fill="none" 
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
          </div>
          
          <button
            type="button"
            onClick={handleImportMusic}
            className="w-8 h-8 rounded-full bg-[#31c27c] flex items-center justify-center"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
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

        {/* Tab 切换 - QQ音乐风格 */}
        <div className="px-4 flex items-center gap-6 border-b border-white/10 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('recommend')}
            className={`text-sm font-medium pb-2 border-b-2 transition-all ${
              activeTab === 'recommend' 
                ? 'text-[#31c27c] border-[#31c27c]' 
                : 'text-white/60 border-transparent'
            }`}
          >
            推荐
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('playlist')}
            className={`text-sm font-medium pb-2 border-b-2 transition-all ${
              activeTab === 'playlist' 
                ? 'text-[#31c27c] border-[#31c27c]' 
                : 'text-white/60 border-transparent'
            }`}
          >
            歌单
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('favorites')}
            className={`text-sm font-medium pb-2 border-b-2 transition-all ${
              activeTab === 'favorites' 
                ? 'text-[#31c27c] border-[#31c27c]' 
                : 'text-white/60 border-transparent'
            }`}
          >
            我喜欢
          </button>
        </div>

        {/* 主内容区 */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {activeTab === 'recommend' && (
            <>
              {/* 推荐歌单卡片 */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white font-medium">每日推荐</span>
                  <span className="text-white/50 text-xs">更多 &gt;</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {musicPlaylist.slice(0, 3).map((song, idx) => (
                    <div 
                      key={song.id}
                      onClick={() => playSong(song)}
                      className="cursor-pointer"
                    >
                      <div className="aspect-square rounded-lg overflow-hidden mb-1 relative">
                        <img src={song.cover} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-1 right-1 text-white text-[10px] bg-black/40 px-1 rounded">
                          {idx === 0 ? '🔥热门' : idx === 1 ? '💖精选' : '✨新歌'}
                        </div>
                      </div>
                      <p className="text-white text-xs truncate">{song.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 歌曲列表 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-medium">
                {activeTab === 'favorites' ? '我喜欢的音乐' : '全部歌曲'}
              </span>
              <span className="text-white/50 text-xs">{displayedSongs.length}首</span>
            </div>
            
            {displayedSongs.length === 0 ? (
              <div className="text-center py-10 text-white/40 text-sm">
                {searchQuery 
                  ? '没有找到匹配的歌曲~' 
                  : activeTab === 'favorites' 
                    ? '还没有喜欢的歌曲' 
                    : '点击右上角 + 导入音乐'}
              </div>
            ) : (
              <div className="space-y-1">
                {displayedSongs.map((song, index) => (
                  <SongItem 
                    key={song.id} 
                    song={song}
                    index={index + 1}
                    isPlaying={currentSong?.id === song.id && musicPlaying}
                    isCurrent={currentSong?.id === song.id}
                    onPlay={() => playSong(song)}
                    onToggleFavorite={() => toggleFavorite(song.id)}
                    onDelete={() => removeSong(song.id)}
                    isFavorite={isFavorite(song.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 底部迷你播放器 - QQ音乐风格 */}
        {currentSong && (
          <div 
            className="mx-3 mb-2 rounded-2xl overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #2d2d44 0%, #1a1a2e 100%)' }}
          >
            <div className="flex items-center p-2 gap-3">
              {/* 旋转唱片封面 */}
              <div 
                className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0 cursor-pointer"
                onClick={() => setShowPlayer(true)}
                style={{ animation: musicPlaying ? 'spin 8s linear infinite' : 'none' }}
              >
                <img src={currentSong.cover} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-[#1a1a2e]" />
                </div>
              </div>
              
              {/* 歌曲信息 */}
              <div className="flex-1 min-w-0" onClick={() => setShowPlayer(true)}>
                <div className="text-white text-sm font-medium truncate">{currentSong.title}</div>
                <div className="text-white/50 text-xs truncate">{currentSong.artist}</div>
              </div>
              
              {/* 控制按钮 */}
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={toggleMusic}
                  className="w-10 h-10 rounded-full bg-[#31c27c] flex items-center justify-center"
                >
                  {musicPlaying ? (
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>
                <button 
                  type="button"
                  onClick={nextSong}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                  </svg>
                </button>
              </div>
            </div>
            
            {/* 进度条 */}
            <div 
              className="h-0.5 bg-white/10 cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const percent = ((e.clientX - rect.left) / rect.width) * 100
                seekMusic(percent)
              }}
            >
              <div 
                className="h-full bg-[#31c27c] transition-all"
                style={{ width: `${musicProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* 全屏播放器 */}
        {showPlayer && currentSong && (
          <div className="absolute inset-0 z-50 bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f0f23] flex flex-col">
            {/* 顶部 */}
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <button 
                type="button"
                onClick={() => setShowPlayer(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="text-center">
                <div className="text-white font-medium text-sm">{currentSong.title}</div>
                <div className="text-white/50 text-xs">{currentSong.artist}</div>
              </div>
              <button 
                type="button"
                onClick={() => toggleFavorite(currentSong.id)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
              >
                <span className="text-lg">{isFavorite(currentSong.id) ? '💖' : '🤍'}</span>
              </button>
            </div>

            {/* 唱片 */}
            <div className="flex-1 flex items-center justify-center px-8">
              <div className="relative">
                {/* 唱片底座 */}
                <div className="absolute -inset-4 rounded-full bg-gradient-to-br from-white/5 to-transparent" />
                
                {/* 旋转唱片 */}
                <div 
                  className="w-56 h-56 rounded-full overflow-hidden shadow-2xl relative"
                  style={{ 
                    animation: musicPlaying ? 'spin 20s linear infinite' : 'none',
                    boxShadow: '0 0 60px rgba(49, 194, 124, 0.3)'
                  }}
                >
                  <img src={currentSong.cover} alt="" className="w-full h-full object-cover" />
                  {/* 唱片中心孔 */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-[#1a1a2e] border-4 border-white/20" />
                  </div>
                  {/* 唱片纹路 */}
                  <div className="absolute inset-8 rounded-full border border-white/10" />
                  <div className="absolute inset-12 rounded-full border border-white/5" />
                </div>
              </div>
            </div>

            {/* 进度条 */}
            <div className="px-8 mb-4">
              <div 
                className="h-1 rounded-full bg-white/20 cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const percent = ((e.clientX - rect.left) / rect.width) * 100
                  seekMusic(percent)
                }}
              >
                <div 
                  className="h-full rounded-full bg-[#31c27c] relative transition-all"
                  style={{ width: `${musicProgress}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow" />
                </div>
              </div>
              <div className="flex justify-between mt-2 text-xs text-white/50">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(currentSong.duration)}</span>
              </div>
            </div>

            {/* 控制按钮 */}
            <div className="px-8 pb-8 flex items-center justify-center gap-8">
              <button 
                type="button"
                onClick={prevSong}
                className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center transition-transform active:scale-90"
              >
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
                </svg>
              </button>
              
              <button 
                type="button"
                onClick={toggleMusic}
                className="w-16 h-16 rounded-full bg-[#31c27c] flex items-center justify-center shadow-lg transition-transform active:scale-90"
                style={{ boxShadow: '0 0 30px rgba(49, 194, 124, 0.5)' }}
              >
                {musicPlaying ? (
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                )}
              </button>
              
              <button 
                type="button"
                onClick={nextSong}
                className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center transition-transform active:scale-90"
              >
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      
      {/* 导入音乐对话框 */}
      {showImportDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-6 bg-black/50">
          <div className="w-full max-w-[300px] rounded-2xl bg-white p-4 shadow-xl">
            <div className="text-center mb-4">
              <div className="text-lg font-semibold text-gray-800">导入音乐</div>
              <div className="text-xs text-gray-500 mt-1">可修改歌曲名称和歌手</div>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">歌曲名称</label>
                <input
                  type="text"
                  value={importSongName}
                  onChange={(e) => setImportSongName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-800 text-sm outline-none"
                  placeholder="输入歌曲名称"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">歌手/艺术家</label>
                <input
                  type="text"
                  value={importSongArtist}
                  onChange={(e) => setImportSongArtist(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-800 text-sm outline-none"
                  placeholder="输入歌手名称"
                />
              </div>
            </div>
            
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowImportDialog(false)
                  setImportSongData(null)
                }}
                className="flex-1 py-2 rounded-full border border-gray-300 text-gray-600 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmImport}
                className="flex-1 py-2 rounded-full bg-[#31c27c] text-white text-sm font-medium"
              >
                确认导入
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 导入加载中 */}
      {importLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl px-6 py-4 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#31c27c] border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-700">正在导入...</span>
          </div>
        </div>
      )}
      
      {/* 导入成功提示 */}
      {importSuccess && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-[#31c27c] text-white px-6 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-bounce">
          <span className="text-xl">✓</span>
          <span className="font-medium">导入成功！</span>
        </div>
      )}
    </PageContainer>
  )
}

function SongItem({ 
  song, 
  index,
  isPlaying, 
  isCurrent,
  onPlay, 
  onToggleFavorite,
  onDelete,
  isFavorite 
}: { 
  song: Song
  index: number
  isPlaying: boolean
  isCurrent: boolean
  onPlay: () => void
  onToggleFavorite: () => void
  onDelete: () => void
  isFavorite: boolean
}) {
  return (
    <div 
      className={`flex items-center gap-3 p-2 rounded-xl transition-all ${
        isCurrent ? 'bg-[#31c27c]/20' : 'hover:bg-white/5'
      }`}
    >
      {/* 序号/播放动画 */}
      <div className="w-6 text-center flex-shrink-0">
        {isPlaying ? (
          <div className="flex justify-center gap-0.5">
            <span className="w-0.5 h-3 bg-[#31c27c] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-0.5 h-3 bg-[#31c27c] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-0.5 h-3 bg-[#31c27c] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <span className={`text-xs ${isCurrent ? 'text-[#31c27c]' : 'text-white/40'}`}>{index}</span>
        )}
      </div>
      
      {/* 封面 */}
      <div 
        className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer"
        onClick={onPlay}
      >
        <img src={song.cover} alt="" className="w-full h-full object-cover" />
      </div>
      
      {/* 信息 */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onPlay}>
        <div className={`text-sm truncate ${isCurrent ? 'text-[#31c27c]' : 'text-white'}`}>
          {song.title}
        </div>
        <div className="text-xs text-white/40 truncate">{song.artist}</div>
      </div>
      
      {/* 操作按钮 */}
      <div className="flex items-center gap-1">
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
          className="w-7 h-7 flex items-center justify-center"
        >
          <span className="text-sm">{isFavorite ? '💖' : '🤍'}</span>
        </button>
        <button 
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="w-7 h-7 flex items-center justify-center text-white/30 hover:text-red-400"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}
