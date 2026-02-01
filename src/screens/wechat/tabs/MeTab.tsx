import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeChat } from '../../../context/WeChatContext'
import { useOS } from '../../../context/OSContext'
import WeChatDialog from '../components/WeChatDialog'
import { compressImageFileToDataUrl } from '../../../utils/image'

type Props = {
  onBack: () => void
}

export default function MeTab({ onBack }: Props) {
  const navigate = useNavigate()
  const { fontColor } = useOS()
  const { 
    userSettings, updateUserSettings,
    userPersonas, addUserPersona, updateUserPersona, deleteUserPersona, getUserPersona,
    walletBalance, getTotalFundValue
  } = useWeChat()
  
  // 更换背景相关
  const bgInputRef = useRef<HTMLInputElement>(null)
  const [bgUploading, setBgUploading] = useState(false)

  // 安全的返回处理
  const handleBack = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onBack()
  }, [onBack])
  
  const [showPersonaManager, setShowPersonaManager] = useState(false)
  const [showAddPersona, setShowAddPersona] = useState(false)
  const [newPersona, setNewPersona] = useState({ name: '', avatar: '', description: '' })
  const personaAvatarRef = useRef<HTMLInputElement>(null)
  const [tipOpen, setTipOpen] = useState(false)
  const [deletePersonaId, setDeletePersonaId] = useState<string | null>(null)
  // 编辑人设状态
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null)
  const [editPersona, setEditPersona] = useState({ name: '', avatar: '', description: '' })
  const editPersonaAvatarRef = useRef<HTMLInputElement>(null)

  const currentPersona = userSettings.currentPersonaId 
    ? getUserPersona(userSettings.currentPersonaId) 
    : null

  const handlePersonaAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 使用 FileReader 转换为 base64，这样刷新后不会丢失
      const reader = new FileReader()
      reader.onload = (event) => {
        const base64 = event.target?.result as string
        setNewPersona(prev => ({ ...prev, avatar: base64 }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAddPersona = () => {
    if (!newPersona.name.trim()) {
      setTipOpen(true)
      return
    }
    const persona = addUserPersona(newPersona)
    // 如果是第一个人设，自动设为当前
    if (userPersonas.length === 0) {
      updateUserSettings({ currentPersonaId: persona.id })
    }
    setNewPersona({ name: '', avatar: '', description: '' })
    setShowAddPersona(false)
  }
  
  // 更换微信背景
  const handleBgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBgUploading(true)
    try {
      const compressed = await compressImageFileToDataUrl(file, { maxSide: 1200, quality: 0.85 })
      updateUserSettings({ wechatBackground: compressed })
    } catch (err) {
      console.error('背景压缩失败:', err)
      // 降级：直接使用原图
      const reader = new FileReader()
      reader.onload = (event) => {
        updateUserSettings({ wechatBackground: event.target?.result as string })
      }
      reader.readAsDataURL(file)
    } finally {
      setBgUploading(false)
      if (bgInputRef.current) bgInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center px-3 py-2.5 bg-transparent mt-1">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-0.5 transition-opacity hover:opacity-70 relative z-10"
          style={{ color: fontColor.value }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-[13px] font-medium">返回</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 当前人设卡片 */}
        <div 
          className="mx-3 mt-1 bg-transparent rounded-xl overflow-hidden cursor-pointer"
          onClick={() => setShowPersonaManager(true)}
        >
          <div className="flex items-center gap-4 p-4">
            {/* 头像 */}
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0">
              {currentPersona?.avatar ? (
                <img src={currentPersona.avatar} alt="头像" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-2xl text-white">
                  {(currentPersona?.name || '我')[0]}
                </div>
              )}
            </div>
            
            {/* 信息 */}
            <div className="flex-1">
              <div className="font-semibold text-lg text-[#000]">
                {currentPersona?.name || '未设置人设'}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                点击管理我的人设
              </div>
            </div>
            
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {/* 人设数量提示 */}
        <div className="mx-3 mt-2 text-xs text-gray-400 px-1">
          已创建 {userPersonas.length} 个人设
        </div>
        <div className="mx-3 mt-1 text-[11px] text-gray-400 px-1">
          提示：如果某个聊天的“聊天设置-我的人设”未选择，将默认使用这里当前使用的人设。
        </div>

        {/* 功能入口 */}
        <div className="mx-3 mt-4 space-y-2">
          {/* 钱包 */}
          <div 
            className="flex items-center gap-3 p-3 bg-white/60 rounded-xl cursor-pointer"
            onClick={() => {
              try { localStorage.setItem('wechat_active_tab', 'me') } catch {}
              navigate('/apps/wechat/wallet')
            }}
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-yellow-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-medium text-[#000]">钱包</div>
              <div className="text-xs text-gray-500">余额：¥{walletBalance.toFixed(2)}</div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>

          {/* 基金 */}
          <div 
            className="flex items-center gap-3 p-3 bg-white/60 rounded-xl cursor-pointer"
            onClick={() => {
              try { localStorage.setItem('wechat_active_tab', 'me') } catch {}
              navigate('/apps/wechat/fund')
            }}
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-400 to-pink-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-medium text-[#000]">基金</div>
              <div className="text-xs text-gray-500">市值：¥{getTotalFundValue().toFixed(2)}</div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
          
          {/* 更换微信背景 */}
          <div 
            className="flex items-center gap-3 p-3 bg-white/60 rounded-xl cursor-pointer"
            onClick={() => bgInputRef.current?.click()}
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="font-medium text-[#000]">微信背景</div>
              <div className="text-xs text-gray-500">
                {bgUploading ? '上传中...' : (userSettings.wechatBackground ? '已设置自定义背景' : '点击更换整体背景图')}
              </div>
            </div>
            {userSettings.wechatBackground && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  updateUserSettings({ wechatBackground: '' })
                }}
                className="text-xs text-red-500 px-2 py-1"
              >
                恢复默认
              </button>
            )}
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBgChange}
          />
        </div>

        {/* 底部提示 */}
        <div className="mt-auto p-4 text-center text-xs text-gray-400">
          LittlePhone WeChat v1.0
        </div>
      </div>

      {/* 人设管理弹窗 */}
      {showPersonaManager && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <button type="button" onClick={() => setShowPersonaManager(false)} className="text-[#000]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="font-semibold text-[#000]">我的人设</span>
            <button 
              type="button" 
              onClick={() => setShowAddPersona(true)}
              className="text-[#07C160] font-medium text-sm"
            >
              添加
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {userPersonas.length === 0 ? (
              <div className="text-center text-gray-400 py-16">
                <div className="text-lg mb-2">还没有人设</div>
                <div className="text-sm">点击右上角"添加"创建你的第一个人设</div>
              </div>
            ) : (
              <div className="space-y-3">
                {userPersonas.map(persona => (
                  <div 
                    key={persona.id}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer min-w-0 ${
                      userSettings.currentPersonaId === persona.id 
                        ? 'bg-[#07C160]/10 border border-[#07C160]' 
                        : 'bg-gray-50'
                    }`}
                    onClick={() => updateUserSettings({ currentPersonaId: persona.id })}
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200">
                      {persona.avatar ? (
                        <img src={persona.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white">
                          {persona.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="font-medium text-[#000] truncate">{persona.name}</div>
                        {userSettings.currentPersonaId === persona.id && (
                          <span className="text-[#07C160] text-xs flex-shrink-0">使用中</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditPersona({
                            name: persona.name,
                            avatar: persona.avatar || '',
                            description: persona.description || '',
                          })
                          setEditingPersonaId(persona.id)
                        }}
                        className="text-blue-500 text-xs"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeletePersonaId(persona.id)
                        }}
                        className="text-red-500 text-xs"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 添加人设弹窗 */}
      {showAddPersona && (
        <div className="absolute inset-0 bg-white z-[60] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <button type="button" onClick={() => setShowAddPersona(false)} className="text-gray-500">
              取消
            </button>
            <span className="font-semibold text-[#000]">添加人设</span>
            <button 
              type="button" 
              onClick={handleAddPersona}
              className="text-[#07C160] font-medium text-sm"
            >
              保存
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {/* 头像 */}
            <div 
              className="w-20 h-20 mx-auto rounded-xl overflow-hidden bg-gray-200 cursor-pointer"
              onClick={() => personaAvatarRef.current?.click()}
            >
              {newPersona.avatar ? (
                <img src={newPersona.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl">+</div>
              )}
            </div>
            <input
              ref={personaAvatarRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePersonaAvatarChange}
            />
            <div className="text-center text-xs text-gray-400 mt-2">点击上传头像</div>

            {/* 名称 */}
            <div className="mt-6">
              <label className="text-sm text-gray-600">人设名称</label>
              <input
                type="text"
                placeholder="例如：温柔小姐姐"
                value={newPersona.name}
                onChange={(e) => setNewPersona(prev => ({ ...prev, name: e.target.value }))}
                className="w-full mt-1 px-4 py-3 rounded-xl bg-gray-50 outline-none text-[#000]"
              />
            </div>

            {/* 描述 */}
            <div className="mt-4">
              <label className="text-sm text-gray-600">人设描述</label>
              <textarea
                placeholder="描述一下这个人设的性格特点..."
                value={newPersona.description}
                onChange={(e) => setNewPersona(prev => ({ ...prev, description: e.target.value }))}
                className="w-full mt-1 px-4 py-3 rounded-xl bg-gray-50 outline-none text-[#000] h-32 resize-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* 编辑人设弹窗 */}
      {editingPersonaId && (
        <div className="absolute inset-0 bg-white z-[60] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <button type="button" onClick={() => setEditingPersonaId(null)} className="text-gray-500">
              取消
            </button>
            <span className="font-semibold text-[#000]">编辑人设</span>
            <button 
              type="button" 
              onClick={() => {
                if (!editPersona.name.trim()) {
                  setTipOpen(true)
                  return
                }
                updateUserPersona(editingPersonaId, editPersona)
                setEditingPersonaId(null)
              }}
              className="text-[#07C160] font-medium text-sm"
            >
              保存
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {/* 头像 */}
            <div 
              className="w-20 h-20 mx-auto rounded-xl overflow-hidden bg-gray-200 cursor-pointer"
              onClick={() => editPersonaAvatarRef.current?.click()}
            >
              {editPersona.avatar ? (
                <img src={editPersona.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl">+</div>
              )}
            </div>
            <input
              ref={editPersonaAvatarRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  const reader = new FileReader()
                  reader.onload = (event) => {
                    setEditPersona(prev => ({ ...prev, avatar: event.target?.result as string }))
                  }
                  reader.readAsDataURL(file)
                }
              }}
            />
            <div className="text-center text-xs text-gray-400 mt-2">点击更换头像</div>

            {/* 名称 */}
            <div className="mt-6">
              <label className="text-sm text-gray-600">人设名称</label>
              <input
                type="text"
                placeholder="例如：温柔小姐姐"
                value={editPersona.name}
                onChange={(e) => setEditPersona(prev => ({ ...prev, name: e.target.value }))}
                className="w-full mt-1 px-4 py-3 rounded-xl bg-gray-50 outline-none text-[#000]"
              />
            </div>

            {/* 描述 */}
            <div className="mt-4">
              <label className="text-sm text-gray-600">人设描述</label>
              <textarea
                placeholder="描述一下这个人设的性格特点..."
                value={editPersona.description}
                onChange={(e) => setEditPersona(prev => ({ ...prev, description: e.target.value }))}
                className="w-full mt-1 px-4 py-3 rounded-xl bg-gray-50 outline-none text-[#000] h-32 resize-none"
              />
            </div>
          </div>
        </div>
      )}

      <WeChatDialog
        open={tipOpen}
        title="还差一步"
        message="请输入人设名称再保存～"
        confirmText="知道啦"
        onConfirm={() => setTipOpen(false)}
        onCancel={() => setTipOpen(false)}
      />

      <WeChatDialog
        open={!!deletePersonaId}
        title="删除这个人设？"
        message="删除后无法恢复哦～"
        confirmText="删除"
        cancelText="取消"
        danger
        onCancel={() => setDeletePersonaId(null)}
        onConfirm={() => {
          if (deletePersonaId) deleteUserPersona(deletePersonaId)
          setDeletePersonaId(null)
        }}
      />
    </div>
  )
}
