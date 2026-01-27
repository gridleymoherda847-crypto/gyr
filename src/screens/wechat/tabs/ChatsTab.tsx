import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeChat } from '../../../context/WeChatContext'
import { useOS } from '../../../context/OSContext'

type Props = {
  onBack: () => void
}

export default function ChatsTab({ onBack }: Props) {
  const navigate = useNavigate()
  const { fontColor } = useOS()
  const { characters, groups, getLastMessage, togglePinned, hideFromChat, clearMessages, createGroup, getGroupMessages } = useWeChat()
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [swipedId, setSwipedId] = useState<string | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showGroupCreate, setShowGroupCreate] = useState(false)
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([])
  
  // 触摸状态
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const isSwiping = useRef(false)
  const lastSwipeAtRef = useRef(0)
  const navLockRef = useRef(0)

  // 过滤掉隐藏的聊天，按置顶和最后消息时间排序
  const sortedCharacters = useMemo(() => {
    const visibleCharacters = characters.filter(c => !c.isHiddenFromChat)
    return [...visibleCharacters].sort((a, b) => {
      // 置顶的排前面
      if (a.isPinned && !b.isPinned) return -1
      if (!a.isPinned && b.isPinned) return 1
      // 然后按最后消息时间
      const lastA = getLastMessage(a.id)
      const lastB = getLastMessage(b.id)
      return (lastB?.timestamp || b.createdAt) - (lastA?.timestamp || a.createdAt)
    })
  }, [characters, getLastMessage])
  
  // 群聊列表，按最后消息时间排序
  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) => {
      return (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt)
    })
  }, [groups])

  // 搜索过滤
  const filteredCharacters = searchQuery
    ? sortedCharacters.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : sortedCharacters
  
  const filteredGroups = searchQuery
    ? sortedGroups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : sortedGroups
  
  // 合并私聊和群聊列表
  type ChatItem = { type: 'private'; data: typeof sortedCharacters[0] } | { type: 'group'; data: typeof sortedGroups[0] }
  const allChats = useMemo<ChatItem[]>(() => {
    const items: ChatItem[] = [
      ...filteredCharacters.map(c => ({ type: 'private' as const, data: c })),
      ...filteredGroups.map(g => ({ type: 'group' as const, data: g })),
    ]
    // 按最后消息时间排序（私聊置顶优先）
    return items.sort((a, b) => {
      if (a.type === 'private' && a.data.isPinned && !(b.type === 'private' && b.data.isPinned)) return -1
      if (b.type === 'private' && b.data.isPinned && !(a.type === 'private' && a.data.isPinned)) return 1
      const timeA = a.type === 'private' ? (getLastMessage(a.data.id)?.timestamp || a.data.createdAt) : (a.data.lastMessageAt || a.data.createdAt)
      const timeB = b.type === 'private' ? (getLastMessage(b.data.id)?.timestamp || b.data.createdAt) : (b.data.lastMessageAt || b.data.createdAt)
      return timeB - timeA
    })
  }, [filteredCharacters, filteredGroups, getLastMessage])

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    
    if (isToday) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }

  const formatPreview = (msg: any) => {
    if (!msg) return '暂无消息'
    if (msg.type === 'system') return '系统'
    if (msg.type === 'sticker') return '表情包'
    if (msg.type === 'image') return '图片'
    if (msg.type === 'transfer') return '转账'
    if (msg.type === 'music') return '音乐'
    if (msg.type === 'diary') return '日记'
    if (msg.type === 'tweet_share') return '推文'
    if (msg.type === 'x_profile_share') return '推特主页'
    if (msg.type === 'couple') return '情侣空间'
    if (msg.type === 'doudizhu_share') return '🃏 斗地主战绩'
    return msg.content || '暂无消息'
  }

  const handleSwipe = (id: string) => {
    setSwipedId(swipedId === id ? null : id)
  }

  const handlePin = (id: string) => {
    togglePinned(id)
    setSwipedId(null)
  }

  const handleDelete = (id: string) => {
    // 只删除聊天记录和从消息列表隐藏，不删除角色
    clearMessages(id)
    hideFromChat(id)
    setSwipedId(null)
  }

  return (
    <div className="flex flex-col h-full">
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
        
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSearch(!showSearch)}
            className="w-7 h-7 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-[#000]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-7 h-7 flex items-center justify-center"
            >
              <svg className="w-5 h-5 text-[#000]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            {/* 添加菜单 */}
            {showAddMenu && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-100 overflow-hidden z-50">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false)
                    navigate('/apps/wechat/create-character')
                  }}
                  className="w-full px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100 flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  创建角色
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddMenu(false)
                    setShowGroupCreate(true)
                    setSelectedGroupMembers([])
                  }}
                  className="w-full px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 active:bg-gray-100 flex items-center gap-2 border-t border-gray-100"
                >
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  发起群聊
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 搜索框 */}
      {showSearch && (
        <div className="px-3 pb-1 bg-transparent">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索联系人..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pl-9 rounded-lg text-sm bg-white border-none outline-none"
              style={{ color: '#000' }}
              autoFocus
            />
            <svg 
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" 
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8"/>
              <path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
        </div>
      )}

      {/* 聊天列表 */}
      <div className="flex-1 overflow-y-auto bg-transparent">
        {allChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
            {searchQuery ? (
              <span>未找到联系人</span>
            ) : (
              <>
                <span>暂无消息</span>
                <span className="text-xs mt-1">点击右上角 + 创建角色开始聊天</span>
              </>
            )}
          </div>
        ) : (
          allChats.map(item => {
            // 群聊项
            if (item.type === 'group') {
              const group = item.data
              const groupMembers = group.memberIds.map(id => characters.find(c => c.id === id)).filter(Boolean)
              const lastGroupMsg = getGroupMessages(group.id).slice(-1)[0]
              
              return (
                <div 
                  key={`group_${group.id}`} 
                  onClick={() => {
                    const now = Date.now()
                    if (now - navLockRef.current < 450) return
                    navLockRef.current = now
                    navigate(`/apps/wechat/group/${group.id}`)
                  }}
                  className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 active:bg-gray-50 cursor-pointer"
                >
                  {/* 群头像 */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                    {group.avatar ? (
                      <img src={group.avatar} alt={group.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  
                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-[#000] truncate">{group.name}</span>
                        <span className="text-xs text-gray-400">({groupMembers.length})</span>
                      </div>
                      {lastGroupMsg && (
                        <span className="text-xs text-gray-400">{formatTime(lastGroupMsg.timestamp)}</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 truncate mt-0.5">
                      {lastGroupMsg ? (
                        lastGroupMsg.isUser ? `我: ${lastGroupMsg.content?.slice(0, 20)}` : `${characters.find(c => c.id === lastGroupMsg.groupSenderId)?.name || '群友'}: ${lastGroupMsg.content?.slice(0, 15)}`
                      ) : '暂无消息'}
                    </div>
                  </div>
                </div>
              )
            }
            
            // 私聊项
            const character = item.data
            const lastMsg = getLastMessage(character.id)
            const isSwiped = swipedId === character.id
            
            return (
              <div key={character.id} className="relative overflow-hidden">
                {/* 滑动操作按钮 */}
                <div 
                  className={`absolute right-0 top-0 bottom-0 flex transition-transform duration-200 ${
                    isSwiped ? 'translate-x-0' : 'translate-x-full'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handlePin(character.id)}
                    className="w-16 h-full flex items-center justify-center text-white text-xs"
                    style={{ background: character.isPinned ? '#999' : '#C7C7CC' }}
                  >
                    {character.isPinned ? '取消置顶' : '置顶'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(character.id)}
                    className="w-16 h-full flex items-center justify-center bg-red-500 text-white text-xs"
                  >
                    删除
                  </button>
                </div>
                
                {/* 聊天项 */}
                <div
                  onTouchStart={(e) => {
                    const t = e.touches[0]
                    touchStartRef.current = { x: t.clientX, y: t.clientY }
                    isSwiping.current = false
                  }}
                  onTouchMove={(e) => {
                    const start = touchStartRef.current
                    if (!start) return
                    const t = e.touches[0]
                    const dx = t.clientX - start.x
                    const dy = t.clientY - start.y
                    // 只处理明显的水平滑动
                    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 2) {
                      isSwiping.current = true
                      lastSwipeAtRef.current = Date.now()
                      // 阻止后续 click 误触发导航
                      e.preventDefault()
                      if (dx < -40) {
                        setSwipedId(character.id)
                      } else if (dx > 40) {
                        setSwipedId(null)
                      }
                    }
                  }}
                  onTouchEnd={() => {
                    touchStartRef.current = null
                    // 不在这里立刻把 isSwiping 变回 false，避免 click 延迟触发导致误进聊天
                  }}
                  onTouchCancel={() => {
                    touchStartRef.current = null
                  }}
                  onClick={() => {
                    // 如果正在滑动，不触发点击
                    if (isSwiping.current) return
                    if (Date.now() - lastSwipeAtRef.current < 450) return
                    const now = Date.now()
                    if (now - navLockRef.current < 450) return
                    navLockRef.current = now
                    if (isSwiped) {
                      setSwipedId(null)
                    } else {
                      navigate(`/apps/wechat/chat/${character.id}`)
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    handleSwipe(character.id)
                  }}
                  // 性能优化：聊天列表长时减少离屏渲染/重排
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 84px' }}
                  className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 active:bg-gray-50 cursor-pointer transition-transform duration-200 ${
                    isSwiped ? '-translate-x-32' : 'translate-x-0'
                  } ${character.isPinned ? 'bg-gray-50/50' : ''}`}
                >
                  {/* 头像（外层不裁切，角标不会被吞） */}
                  <div className="relative w-12 h-12 flex-shrink-0 overflow-visible">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200">
                      {character.avatar ? (
                        <img src={character.avatar} alt={character.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl bg-gradient-to-br from-green-400 to-green-600 text-white">
                          {character.name[0]}
                        </div>
                      )}
                    </div>
                    {character.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center px-1 z-20 shadow">
                        {character.unreadCount > 99 ? '99+' : character.unreadCount}
                      </div>
                    )}
                    {/* 特别关心标记（避免覆盖未读红点） */}
                    {character.isSpecialCare && (
                      <div className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center z-20 shadow">
                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  
                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-[#000] truncate">{character.name}</span>
                        {character.isPinned && (
                          <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z"/>
                          </svg>
                        )}
                      </div>
                      {lastMsg && (
                        <span className="text-xs text-gray-400">{formatTime(lastMsg.timestamp)}</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 truncate mt-0.5">
                      {character.isTyping ? '对方正在输入中...' : formatPreview(lastMsg)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
      
      {/* 提示 */}
      <div className="px-3 py-1 text-center text-[10px] text-gray-400 bg-transparent">
        左滑消息可置顶或删除（电脑可右键）
      </div>
      
      {/* 点击外部关闭添加菜单 */}
      {showAddMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowAddMenu(false)}
        />
      )}
      
      {/* 创建群聊弹窗 */}
      {showGroupCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[320px] bg-white rounded-2xl shadow-xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setShowGroupCreate(false)
                  setSelectedGroupMembers([])
                }}
                className="text-gray-500 text-sm"
              >
                取消
              </button>
              <span className="font-semibold text-gray-800">发起群聊</span>
              <button
                type="button"
                disabled={selectedGroupMembers.length < 2}
                onClick={() => {
                  if (selectedGroupMembers.length >= 2) {
                    const newGroup = createGroup(selectedGroupMembers)
                    setShowGroupCreate(false)
                    setSelectedGroupMembers([])
                    navigate(`/apps/wechat/group/${newGroup.id}`)
                  }
                }}
                className={`text-sm font-medium ${selectedGroupMembers.length >= 2 ? 'text-green-500' : 'text-gray-300'}`}
              >
                完成({selectedGroupMembers.length})
              </button>
            </div>
            
            <div className="p-3 border-b border-gray-100 bg-yellow-50">
              <div className="text-xs text-yellow-700 flex items-start gap-1">
                <span>💡</span>
                <span>群聊记录和私聊记录记忆不互通，可手动转发聊天记录进行记忆互通</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {characters.filter(c => !c.isHiddenFromChat).length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">暂无联系人</div>
              ) : (
                <div className="space-y-1">
                  {characters.filter(c => !c.isHiddenFromChat).map(c => {
                    const isSelected = selectedGroupMembers.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedGroupMembers(prev => prev.filter(id => id !== c.id))
                          } else {
                            setSelectedGroupMembers(prev => [...prev, c.id])
                          }
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                          isSelected ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-green-500 bg-green-500' : 'border-gray-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                          {c.avatar ? (
                            <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-sm">
                              {c.name[0]}
                            </div>
                          )}
                        </div>
                        <span className="text-sm font-medium text-gray-800 truncate">{c.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
