import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeChat } from '../../../context/WeChatContext'
import { useOS } from '../../../context/OSContext'

type Props = {
  onBack: () => void
}

export default function ContactsTab({ onBack }: Props) {
  const navigate = useNavigate()
  const { fontColor } = useOS()
  const { characters, toggleSpecialCare, showInChat } = useWeChat()
  const [longPressId, setLongPressId] = useState<string | null>(null)

  // 特别关心的排前面
  const sortedCharacters = [...characters].sort((a, b) => {
    if (a.isSpecialCare && !b.isSpecialCare) return -1
    if (!a.isSpecialCare && b.isSpecialCare) return 1
    return a.name.localeCompare(b.name)
  })

  // 按首字母分组
  const specialCareCharacters = sortedCharacters.filter(c => c.isSpecialCare)
  const normalCharacters = sortedCharacters.filter(c => !c.isSpecialCare)
  
  const groupedCharacters = normalCharacters.reduce((acc, char) => {
    const firstChar = char.name[0].toUpperCase()
    if (!acc[firstChar]) acc[firstChar] = []
    acc[firstChar].push(char)
    return acc
  }, {} as Record<string, typeof characters>)

  const sortedGroups = Object.entries(groupedCharacters).sort((a, b) => a[0].localeCompare(b[0]))

  const handleLongPress = (id: string) => {
    setLongPressId(longPressId === id ? null : id)
  }

  const handleToggleSpecialCare = (id: string) => {
    toggleSpecialCare(id)
    setLongPressId(null)
  }

  const handleStartChat = (id: string) => {
    showInChat(id)
    navigate(`/apps/wechat/chat/${id}`)
  }

  const ContactItem = ({ character }: { character: typeof characters[0] }) => (
    <div className="relative">
      {/* 长按菜单 */}
      {longPressId === character.id && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden">
          <button
            type="button"
            onClick={() => handleToggleSpecialCare(character.id)}
            className="px-4 py-2 text-sm text-[#000] hover:bg-gray-50 whitespace-nowrap"
          >
            {character.isSpecialCare ? '取消特别关心' : '设为特别关心'}
          </button>
        </div>
      )}
      
      <div
        onClick={() => handleStartChat(character.id)}
        onContextMenu={(e) => {
          e.preventDefault()
          handleLongPress(character.id)
        }}
        onTouchStart={() => {
          // 手机上用“长按”打开菜单
          const id = character.id
          // @ts-expect-error attach timeout id
          window.__lpWechat = window.__lpWechat || {}
          // @ts-expect-error attach timeout id
          window.__lpWechat[id] = setTimeout(() => handleLongPress(id), 420)
        }}
        onTouchEnd={() => {
          const id = character.id
          // @ts-expect-error attach timeout id
          const t = window.__lpWechat?.[id]
          if (t) clearTimeout(t)
        }}
        className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 active:bg-gray-50 cursor-pointer"
      >
        {/* 头像 */}
        <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
          {character.avatar ? (
            <img src={character.avatar} alt={character.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl bg-gradient-to-br from-green-400 to-green-600 text-white">
              {character.name[0]}
            </div>
          )}
          {/* 特别关心标记 */}
          {character.isSpecialCare && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
          )}
        </div>
        
        {/* 名字 */}
        <span className="font-medium text-[#000]">{character.name}</span>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full" onClick={() => setLongPressId(null)}>
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-transparent mt-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onBack()
          }}
          className="flex items-center gap-0.5 transition-opacity hover:opacity-70 relative z-10"
          style={{ color: fontColor.value }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-[13px] font-medium">返回</span>
        </button>
        
        <button
          type="button"
          onClick={() => navigate('/apps/wechat/create-character')}
          className="w-7 h-7 flex items-center justify-center"
        >
          <svg className="w-5 h-5 text-[#000]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </button>
      </div>

      {/* 联系人列表 */}
      <div className="flex-1 overflow-y-auto bg-transparent">
        {characters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
            <span>暂无联系人</span>
            <span className="text-xs mt-1">点击右上角添加好友</span>
          </div>
        ) : (
          <>
            {/* 特别关心 */}
            {specialCareCharacters.length > 0 && (
              <div>
                <div className="px-4 py-1 bg-transparent text-xs text-red-500 sticky top-0 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                  特别关心
                </div>
                {specialCareCharacters.map(character => (
                  <ContactItem key={character.id} character={character} />
                ))}
              </div>
            )}
            
            {/* 普通联系人 */}
            {sortedGroups.map(([letter, chars]) => (
              <div key={letter}>
                <div className="px-4 py-1 bg-transparent text-xs text-gray-500 sticky top-0">
                  {letter}
                </div>
                {chars.map(character => (
                  <ContactItem key={character.id} character={character} />
                ))}
              </div>
            ))}
          </>
        )}
      </div>
      
      {/* 提示 */}
      <div className="px-3 py-1 text-center text-[10px] text-gray-400 bg-transparent">
        长按联系人可设为特别关心（电脑可右键）
      </div>
    </div>
  )
}
