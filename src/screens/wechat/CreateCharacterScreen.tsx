import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'
import WeChatLayout from './WeChatLayout'
import WeChatDialog from './components/WeChatDialog'

export default function CreateCharacterScreen() {
  const navigate = useNavigate()
  const { fontColor } = useOS()
  const { addCharacter } = useWeChat()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [tipOpen, setTipOpen] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    avatar: '',
    gender: 'female' as 'male' | 'female' | 'other',
    prompt: '',
    birthday: '',
    callMeName: '',
    relationship: '',
  })

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 使用 FileReader 转换为 base64，这样刷新后不会丢失
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target?.result as string
        setFormData(prev => ({ ...prev, avatar: base64 }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      setTipOpen(true)
      return
    }

    addCharacter({
      ...formData,
      coupleSpaceEnabled: false,
      chatBackground: '',
      unreadCount: 0,
    })

    navigate('/apps/wechat')
  }

  const handleBack = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    navigate(-1)
  }

  return (
    <WeChatLayout>
      <div className="flex flex-col h-full -mt-1">
        {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-3 bg-transparent mt-1">
          <button 
            type="button" 
            onClick={handleBack}
            onTouchEnd={handleBack}
            className="flex items-center gap-0.5 relative z-10"
            style={{ color: fontColor.value }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[13px] font-medium">返回</span>
          </button>
          <span className="font-semibold text-[#000]">创建角色</span>
          <button type="button" onClick={handleSubmit} className="text-[#07C160] font-medium text-sm">
            完成
          </button>
        </div>

        {/* 表单 */}
        <div className="flex-1 overflow-y-auto">
          {/* 头像 */}
        <div className="bg-transparent mt-2">
            <div 
              className="flex items-center justify-between px-4 py-4 cursor-pointer"
              onClick={() => avatarInputRef.current?.click()}
            >
              <span className="text-[#000]">头像</span>
              <div className="flex items-center gap-2">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-200">
                  {formData.avatar ? (
                    <img src={formData.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl">+</div>
                  )}
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
          </div>

          {/* 基本信息 */}
        <div className="bg-transparent mt-2">
            <div className="flex items-center px-4 py-3 border-b border-gray-100">
              <span className="text-[#000] w-20">名字</span>
              <input
                type="text"
                placeholder="请输入角色名字"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="flex-1 text-right outline-none text-[#000] bg-transparent"
              />
            </div>

            <div className="flex items-center px-4 py-3 border-b border-gray-100">
              <span className="text-[#000] w-20">性别</span>
              <div className="flex-1 flex justify-end gap-3">
                {(['male', 'female', 'other'] as const).map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, gender: g }))}
                    className={`px-3 py-1 rounded-full text-sm ${formData.gender === g ? 'bg-[#07C160] text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {g === 'male' ? '男' : g === 'female' ? '女' : '其他'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center px-4 py-3">
              <span className="text-[#000] w-20">生日</span>
              <input
                type="date"
                value={formData.birthday}
                onChange={(e) => setFormData(prev => ({ ...prev, birthday: e.target.value }))}
                className="flex-1 text-right outline-none text-[#000] bg-transparent"
              />
            </div>
          </div>

          {/* 关系设定 */}
        <div className="bg-transparent mt-2">
            <div className="flex items-center px-4 py-3 border-b border-gray-100">
              <span className="text-[#000] w-24">TA叫我</span>
              <input
                type="text"
                placeholder="例如：亲爱的、宝贝"
                value={formData.callMeName}
                onChange={(e) => setFormData(prev => ({ ...prev, callMeName: e.target.value }))}
                className="flex-1 text-right outline-none text-[#000] bg-transparent"
              />
            </div>

            <div className="flex items-center px-4 py-3">
              <span className="text-[#000] w-24">和我的关系</span>
              <input
                type="text"
                placeholder="例如：恋人、好友、家人"
                value={formData.relationship}
                onChange={(e) => setFormData(prev => ({ ...prev, relationship: e.target.value }))}
                className="flex-1 text-right outline-none text-[#000] bg-transparent"
              />
            </div>
          </div>

          {/* 人设 */}
        <div className="bg-transparent mt-2">
            <div className="px-4 py-3">
              <div className="text-[#000] mb-2">人设提示词</div>
              <textarea
                placeholder="描述这个角色的性格、说话方式、背景故事等..."
                value={formData.prompt}
                onChange={(e) => setFormData(prev => ({ ...prev, prompt: e.target.value }))}
                className="w-full h-28 p-3 bg-gray-50 rounded-lg outline-none resize-none text-[#000] text-sm"
              />
            </div>
          </div>

          <div className="p-4 text-center text-xs text-gray-400">
            创建后可在聊天设置中修改
          </div>
        </div>
      </div>

      <WeChatDialog
        open={tipOpen}
        title="还差一步"
        message="请输入角色名字再保存～"
        confirmText="知道啦"
        onConfirm={() => setTipOpen(false)}
        onCancel={() => setTipOpen(false)}
      />
    </WeChatLayout>
  )
}
