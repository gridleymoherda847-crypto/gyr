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
  const { characters, getLastMessage, togglePinned, hideFromChat, clearMessages } = useWeChat()
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [swipedId, setSwipedId] = useState<string | null>(null)
  
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

  // 搜索过滤
  const filteredCharacters = searchQuery
    ? sortedCharacters.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : sortedCharacters

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
          <button
            type="button"
            onClick={() => navigate('/apps/wechat/create-character')}
            className="w-7 h-7 flex items-center justify-center"
          >
            <svg className="w-5 h-5 text-[#000]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
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
        {filteredCharacters.length === 0 ? (
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
          filteredCharacters.map(character => {
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
    </div>
  )
}
