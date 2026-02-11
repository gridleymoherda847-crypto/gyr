import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'
import { compressImageFileToDataUrl } from '../../utils/image'

export default function ProfileScreen() {
  const navigate = useNavigate()
  const { userProfile, setUserProfile, fontColor } = useOS()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [nickname, setNickname] = useState(userProfile.nickname)
  const [persona, setPersona] = useState(userProfile.persona)
  const [avatar, setAvatar] = useState(userProfile.avatar)
  const [saved, setSaved] = useState(false)

  const handleAvatarClick = () => fileInputRef.current?.click()
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      // 关键：不要保存 blob: URL（跨刷新/跨浏览器会失效，表现为头像“裂开/损坏”）
      const base64 = await compressImageFileToDataUrl(file, { maxSide: 512, quality: 0.86 })
      setAvatar(base64)
    } catch {
      const reader = new FileReader()
      reader.onload = () => setAvatar(String(reader.result || ''))
      reader.readAsDataURL(file)
    } finally {
      // 允许重复选择同一张
      try { e.currentTarget.value = '' } catch {}
    }
  }

  const handleSave = () => {
    setUserProfile({ avatar, nickname, persona })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="我的人设" onBack={() => navigate('/apps/settings')} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-5 sm:space-y-6">
          {/* 头像 */}
          <div className="flex flex-col items-center">
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/50 overflow-hidden cursor-pointer group border border-white/30" onClick={handleAvatarClick}>
              {avatar ? <img src={avatar} alt="头像" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl sm:text-4xl">👤</div>}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs sm:text-sm">更换</span>
              </div>
            </div>
            {/* iOS Safari: display:none 的 file input 可能导致无法触发选择文件 */}
            <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
            <button onClick={handleAvatarClick} className="mt-2 sm:mt-3 text-xs sm:text-sm opacity-60 hover:opacity-80" style={{ color: fontColor.value }}>点击更换头像</button>
          </div>

          {/* 昵称 */}
          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>昵称</label>
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="输入你的昵称" className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-sm sm:text-base" style={{ color: fontColor.value }} />
          </div>

          {/* 人设描述 */}
          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>人设描述</label>
            <textarea value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="描述你的人物设定..." rows={5} className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 resize-none text-sm sm:text-base" style={{ color: fontColor.value }} />
          </div>

          {/* 保存按钮 */}
          <button onClick={handleSave} className={`w-full py-3 sm:py-3.5 rounded-2xl font-semibold text-white transition-all press-effect ${saved ? 'bg-green-500' : 'bg-gradient-to-r from-pink-500 to-purple-500 shadow-[0_6px_20px_rgba(236,72,153,0.3)]'}`}>
            {saved ? '✓ 已保存' : '保存设置'}
          </button>
        </div>
      </div>
    </PageContainer>
  )
}
