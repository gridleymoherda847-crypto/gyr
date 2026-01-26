import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'

const PRESET_WALLPAPERS = [
  { id: 'cream', gradient: 'linear-gradient(180deg, #fdf6f0 0%, #f5ebe0 30%, #fae8db 60%, #f8e1d4 100%)' },
  { id: 'pink', gradient: 'linear-gradient(180deg, #ffeef8 0%, #ffe4f3 50%, #ffd6ec 100%)' },
  { id: 'purple', gradient: 'linear-gradient(180deg, #f3e8ff 0%, #e9d5ff 50%, #ddd6fe 100%)' },
  { id: 'blue', gradient: 'linear-gradient(180deg, #e0f2fe 0%, #bae6fd 50%, #7dd3fc 100%)' },
  { id: 'mint', gradient: 'linear-gradient(180deg, #ecfdf5 0%, #d1fae5 50%, #a7f3d0 100%)' },
  { id: 'dark', gradient: 'linear-gradient(180deg, #1f1f1f 0%, #2d2d2d 50%, #1a1a1a 100%)' },
]

// 将文件转换为 base64（这样刷新后不会丢失）
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function WallpaperScreen() {
  const navigate = useNavigate()
  const { wallpaper, lockWallpaper, setWallpaper, setLockWallpaper, fontColor } = useOS()
  const [activeTab, setActiveTab] = useState<'home' | 'lock'>('home')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)

  const currentWallpaper = activeTab === 'home' ? wallpaper : lockWallpaper
  const setCurrentWallpaper = activeTab === 'home' ? setWallpaper : setLockWallpaper

  const handleFileSelect = () => fileInputRef.current?.click()
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // 检查文件大小（限制 5MB，壁纸不需要太大）
    if (file.size > 5 * 1024 * 1024) {
      alert('图片太大，最大支持 5MB')
      e.target.value = ''
      return
    }
    
    setLoading(true)
    try {
      // 转换为 base64 格式，这样可以持久化保存
      const base64 = await fileToBase64(file)
      setCurrentWallpaper(base64)
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      alert('图片加载失败，请重试')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }
  
  const handlePresetSelect = (gradient: string) => { setCurrentWallpaper(gradient); setSaved(true); setTimeout(() => setSaved(false), 1500) }

  // 判断是否为图片（包括 base64、http URL、blob URL、本地路径）
  const isImageUrl = currentWallpaper.startsWith('data:') || currentWallpaper.startsWith('http') || currentWallpaper.startsWith('blob') || currentWallpaper.startsWith('/')

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="壁纸设置" onBack={() => navigate('/apps/settings')} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-4 sm:space-y-5">
          {/* 切换标签 */}
          <div className="flex gap-2 p-1 bg-white/50 rounded-2xl border border-white/30">
            <button onClick={() => setActiveTab('home')} className={`flex-1 py-2 sm:py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all ${activeTab === 'home' ? 'bg-white/70' : 'opacity-60 hover:opacity-80'}`} style={{ color: fontColor.value }}>🏠 桌面壁纸</button>
            <button onClick={() => setActiveTab('lock')} className={`flex-1 py-2 sm:py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all ${activeTab === 'lock' ? 'bg-white/70' : 'opacity-60 hover:opacity-80'}`} style={{ color: fontColor.value }}>🔒 锁屏壁纸</button>
          </div>

          {/* 预览 */}
          <div className="flex justify-center">
            <div className="w-28 sm:w-36 aspect-[9/19] rounded-[20px] sm:rounded-[28px] border-[3px] sm:border-4 border-gray-800 shadow-lg overflow-hidden" style={{ background: isImageUrl ? undefined : currentWallpaper, backgroundImage: isImageUrl ? `url(${currentWallpaper})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }}>
              <div className="w-full h-full flex items-center justify-center"><span className="text-xs sm:text-sm bg-black/30 px-2 sm:px-3 py-1 rounded-full text-white">{activeTab === 'home' ? '桌面' : '锁屏'}</span></div>
            </div>
          </div>

          {/* 上传按钮 */}
          <button 
            onClick={handleFileSelect} 
            disabled={loading}
            className="w-full py-3 sm:py-3.5 rounded-2xl bg-white/50 hover:bg-white/60 border border-white/30 border-dashed font-medium transition-colors press-effect flex items-center justify-center gap-2 text-sm sm:text-base disabled:opacity-50" 
            style={{ color: fontColor.value }}
          >
            {loading ? (
              <>
                <span className="animate-spin">⏳</span> 正在加载...
              </>
            ) : (
              <>
                <span>📤</span> 上传自定义图片
              </>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          {/* 预设壁纸 */}
          <div className="space-y-2 sm:space-y-3">
            <div className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>预设壁纸</div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {PRESET_WALLPAPERS.map((preset) => <button key={preset.id} onClick={() => handlePresetSelect(preset.gradient)} className="aspect-[9/16] rounded-xl sm:rounded-2xl overflow-hidden border-2 border-transparent hover:border-white/40 transition-colors press-effect" style={{ background: preset.gradient }} />)}
            </div>
          </div>

          {saved && <div className="text-center text-xs sm:text-sm text-green-500 animate-fade-in">✓ 壁纸已应用</div>}
        </div>
      </div>
    </PageContainer>
  )
}
