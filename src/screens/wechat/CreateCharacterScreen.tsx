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
  const [langPickerOpen, setLangPickerOpen] = useState(false)
  const prevLangRef = useRef<'zh' | 'en' | 'ru' | 'fr' | 'ja' | 'ko' | 'de'>('zh')
  const [langDialog, setLangDialog] = useState<{ open: boolean; lang: 'zh' | 'en' | 'ru' | 'fr' | 'ja' | 'ko' | 'de' }>({
    open: false,
    lang: 'zh',
  })

  const [formData, setFormData] = useState({
    name: '',
    avatar: '',
    gender: 'female' as 'male' | 'female' | 'other',
    prompt: '',
    birthday: '',
    callMeName: '',
    relationship: '',
    country: '',
    language: 'zh' as 'zh' | 'en' | 'ru' | 'fr' | 'ja' | 'ko' | 'de',
    chatTranslationEnabled: false,
  })

  const languageLabel = (id: 'zh' | 'en' | 'ru' | 'fr' | 'ja' | 'ko' | 'de') => {
    if (id === 'zh') return '中文'
    if (id === 'en') return '英语'
    if (id === 'ru') return '俄语'
    if (id === 'fr') return '法语'
    if (id === 'ja') return '日语'
    if (id === 'ko') return '韩语'
    if (id === 'de') return '德语'
    return id
  }

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

            <div className="flex items-center px-4 py-3 border-b border-gray-100">
              <span className="text-[#000] w-20">语言</span>
              <button
                type="button"
                className="flex-1 text-right text-[#000] bg-transparent"
                onClick={() => setLangPickerOpen(true)}
              >
                {languageLabel(formData.language)}
              </button>
              <svg className="w-5 h-5 text-gray-400 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>

            <div className="flex items-center px-4 py-3 border-b border-gray-100">
              <span className="text-[#000] w-20">国家/地区</span>
              <input
                type="text"
                placeholder="例如：日本 / 中国 / 法国"
                value={formData.country}
                onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                className="flex-1 text-right outline-none text-[#000] bg-transparent"
              />
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
            语言决定 TA 的聊天语言；若不是中文，聊天气泡会自动显示“翻译”中文。
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

      <WeChatDialog
        open={langDialog.open}
        title="语言提示"
        message={
          '你选择了中文以外的语言：\n' +
          '- 该角色的聊天/日记/朋友圈/情侣空间都会用此语言输出\n' +
          '- 只有“聊天对话框”可内置翻译；其他界面请用浏览器翻译\n' +
          '\n' +
          '要不要开启“聊天对话框自动翻译”？（推荐）'
        }
        hideDefaultActions
        footer={
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="w-full rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #34d399 0%, #07C160 100%)' }}
              onClick={() => {
                prevLangRef.current = langDialog.lang
                setFormData(p => ({ ...p, language: langDialog.lang, chatTranslationEnabled: true }))
                setLangDialog({ open: false, lang: 'zh' })
              }}
            >
              需要（推荐）
            </button>
            <button
              type="button"
              className="w-full rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
              onClick={() => {
                prevLangRef.current = langDialog.lang
                setFormData(p => ({ ...p, language: langDialog.lang, chatTranslationEnabled: false }))
                setLangDialog({ open: false, lang: 'zh' })
              }}
            >
              不需要
            </button>
            <button
              type="button"
              className="w-full rounded-full border border-black/10 bg-white/40 px-4 py-2 text-[13px] font-medium text-[#666] active:scale-[0.98]"
              onClick={() => {
                // 取消：恢复为原语言
                const prev = prevLangRef.current || 'zh'
                setFormData(p => ({ ...p, language: prev, chatTranslationEnabled: false }))
                setLangDialog({ open: false, lang: 'zh' })
              }}
            >
              取消
            </button>
          </div>
        }
        onCancel={() => {
          // 点遮罩也视作取消
          const prev = prevLangRef.current || 'zh'
          setFormData(p => ({ ...p, language: prev, chatTranslationEnabled: false }))
          setLangDialog({ open: false, lang: 'zh' })
        }}
      />

      <WeChatDialog
        open={langPickerOpen}
        title="选择语言"
        message="选择后，角色会强制使用该语言输出。"
        hideDefaultActions
        footer={
          <button
            type="button"
            className="w-full rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
            onClick={() => setLangPickerOpen(false)}
          >
            取消
          </button>
        }
        onCancel={() => setLangPickerOpen(false)}
      >
        <div className="flex flex-col gap-2">
          {(['zh', 'en', 'ru', 'fr', 'ja', 'ko', 'de'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              className={`w-full rounded-xl px-3 py-2 text-[13px] text-left border active:scale-[0.99] ${
                formData.language === lang ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white/60 border-black/10 text-[#111]'
              }`}
              onClick={() => {
                setLangPickerOpen(false)
                if (lang === 'zh') {
                  prevLangRef.current = 'zh'
                  setFormData(p => ({ ...p, language: 'zh', chatTranslationEnabled: false }))
                  return
                }
                // 非中文：先切语言，再弹“翻译提示弹窗”
                prevLangRef.current = formData.language || 'zh'
                setFormData(p => ({ ...p, language: lang }))
                setLangDialog({ open: true, lang })
              }}
            >
              {languageLabel(lang)}
            </button>
          ))}
        </div>
      </WeChatDialog>
    </WeChatLayout>
  )
}
