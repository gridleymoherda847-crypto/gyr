import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'
import WeChatLayout from './WeChatLayout'
import WeChatDialog from './components/WeChatDialog'
import { getGlobalPresets, getLorebookEntriesForCharacter } from '../PresetScreen'
import { xEnsureUser, xLoad, xNewPost, xSave, xAddFollow, xRemoveFollow, xIsFollowing } from '../../storage/x'

export default function ChatScreen() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { fontColor, musicPlaylist, llmConfig, callLLM, playSong, pauseMusic, ttsConfig, getAllFontOptions, currentFont } = useOS()
  const { characterId } = useParams<{ characterId: string }>()
  const highlightMsgId = searchParams.get('highlightMsg') // 从搜索结果跳转时高亮的消息ID
  const { 
    getCharacter, getMessagesByCharacter, getMessagesPage, addMessage, updateMessage, deleteMessage, deleteMessagesByIds,
    getStickersByCharacter,clearMessages,
    addTransfer, getPeriodRecords, addPeriodRecord,
    updatePeriodRecord, getCurrentPeriod, listenTogether, startListenTogether, stopListenTogether,
    setCurrentChatId, toggleBlocked, setCharacterTyping, updateCharacter,
    walletBalance, updateWalletBalance, addWalletBill,
    getUserPersona, getCurrentPersona,
    addFavoriteDiary, isDiaryFavorited,
    characters, getTransfersByCharacter, groups, moments
  } = useWeChat()
  
  const character = getCharacter(characterId || '')
  // 全量消息只用于“重生成/记忆构建”等功能，不用于首屏渲染
  const messages = getMessagesByCharacter(characterId || '')
  // 性能：避免打字时反复 filter 全量贴纸
  const stickers = useMemo(() => getStickersByCharacter(characterId || ''), [characterId, getStickersByCharacter])
  const currentPeriod = getCurrentPeriod()

  // 修复“点很快会读到倒数第二条”：用 ref 同步最新 messages 快照
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // 给需要“按最近聊天上下文做决策”的功能复用（情侣空间/音乐邀请等）
  const buildShortHistory = (maxChars: number) => {
    const nonSystem = (messagesRef.current || []).filter(m => m.type !== 'system')
    let used = 0
    const out: { role: 'user' | 'assistant'; content: string }[] = []
    for (let i = nonSystem.length - 1; i >= 0; i--) {
      const m = nonSystem[i]
      let content = (m.content || '').trim()
      if (!content) continue
      if (m.type === 'image') content = '[图片]'
      if (m.type === 'sticker') content = '[表情包]'
      if (m.type === 'transfer') content = '[转账]'
      if (m.type === 'music') content = '[音乐]'
      if (m.type === 'diary') content = '[日记]'
      if (m.type === 'couple') content = '[情侣空间]'

      const extra = content.length + 10
      if (used + extra > maxChars) break
      used += extra
      out.push({ role: m.isUser ? 'user' : 'assistant', content })
    }
    return out.reverse()
  }

  // 该对话选择的“我的人设”（没有选则回退到当前全局人设）
  const selectedPersona = useMemo(() => {
    return character?.selectedUserPersonaId
      ? getUserPersona(character.selectedUserPersonaId)
      : getCurrentPersona()
  }, [character?.selectedUserPersonaId, getUserPersona, getCurrentPersona])

  const characterLanguage = (character as any)?.language || 'zh'
  const chatTranslationEnabled = !!(character as any)?.chatTranslationEnabled
  const languageName = (lang: string) => {
    if (lang === 'zh') return '中文'
    if (lang === 'en') return '英语'
    if (lang === 'ru') return '俄语'
    if (lang === 'fr') return '法语'
    if (lang === 'ja') return '日语'
    if (lang === 'ko') return '韩语'
    if (lang === 'de') return '德语'
    return '中文'
  }

  // 表情包：不按情绪匹配，随机使用本角色已配置的
  
  const [inputText, setInputText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)
  const autosizeInput = useCallback((el?: HTMLTextAreaElement | null) => {
    const textarea = el || inputRef.current
    if (!textarea) return
    try {
      // 约4行（不同字体/行高下 96px 可能只有 3 行左右，略增大更稳）
      const maxHeight = 128 // 与 class 的 max-h-[128px] 对齐
      textarea.style.height = 'auto'
      const next = Math.min(textarea.scrollHeight, maxHeight)
      textarea.style.height = `${next}px`
    } catch { /* ignore */ }
  }, [])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const forceScrollRef = useRef(false)
  // 分页渲染窗口：只渲染最近 N 条，上拉再加载更早的
  const PAGE_SIZE = 15
  // 关键优化：首次进入聊天时不要先渲染“全量消息”，否则超长聊天会直接卡死
  // 用 lazy init 让首屏只渲染最后一页，避免第一次 render 就 map 全量 messages
  const [startIndex, setStartIndex] = useState(() => Math.max(0, messages.length - PAGE_SIZE))
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null) // 高亮的消息ID（搜索跳转用）
  const tailModeRef = useRef(true) // 是否处在“看最新消息”模式
  const loadingMoreRef = useRef(false)
  const prevScrollHeightRef = useRef<number | null>(null)
  const prevScrollTopRef = useRef<number | null>(null)
  const navLockRef = useRef(0)
  const [showMenu, setShowMenu] = useState(false)
  const [infoDialog, setInfoDialog] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: '', message: '' })
  
  // 功能面板状态
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [activePanel, setActivePanel] = useState<'album' | 'music' | 'period' | 'diary' | 'location' | null>(null)
  
  // 表情包面板状态
  const [showStickerPanel, setShowStickerPanel] = useState(false)
  const [stickerTab, setStickerTab] = useState<string>('recent') // 'recent' 或分类名
  const [recentStickers, setRecentStickers] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('littlephone_recent_stickers')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  
  // 位置分享状态
  const [locationName, setLocationName] = useState('')
  const [locationAddress, setLocationAddress] = useState('')
  const [locationCity, setLocationCity] = useState('')

  // 日记（偷看）状态
  const [diaryOpen, setDiaryOpen] = useState(false)
  const [diaryConfirmOpen, setDiaryConfirmOpen] = useState(false)
  const [diaryLoading, setDiaryLoading] = useState(false)
  const [diaryProgress, setDiaryProgress] = useState(0)
  const [diaryStage, setDiaryStage] = useState('')
  const [diaryContent, setDiaryContent] = useState('')
  const [diaryContentZh, setDiaryContentZh] = useState('') // 中文翻译版本
  const [diaryShowTranslated, setDiaryShowTranslated] = useState(false) // 是否显示翻译
  const [diaryAt, setDiaryAt] = useState<number>(0)
  const [diaryNoteDraft, setDiaryNoteDraft] = useState('')
  const [openDiaryShare, setOpenDiaryShare] = useState<typeof messages[0] | null>(null)
  const [openTweetShare, setOpenTweetShare] = useState<typeof messages[0] | null>(null)
  
  // 转账悬浮窗状态
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferAmount, setTransferAmount] = useState('')
  const [transferNote, setTransferNote] = useState('')
  
  // 点击转账消息时的操作弹窗
  const [transferActionMsg, setTransferActionMsg] = useState<typeof messages[0] | null>(null)

  // 虚拟语音（用户发语音：假语音条 + 转文字）
  const [fakeVoiceOpen, setFakeVoiceOpen] = useState(false)
  const [fakeVoiceDraft, setFakeVoiceDraft] = useState('')
  
  // 听歌邀请：确认进入“一起听歌界面”（类似QQ音乐）
  const [musicInviteDialog, setMusicInviteDialog] = useState<{
    open: boolean
    song?: { title: string; artist: string; id?: string }
    accepted?: boolean
    needsConfirm?: boolean // 接受后需用户点“确认”才进入一起听界面
    direction?: 'outgoing' | 'incoming'
    loading?: boolean // 等待对方回应中
  }>({ open: false })
  
  // 收到对方音乐邀请时的确认弹窗
  const [musicInviteMsg, setMusicInviteMsg] = useState<typeof messages[0] | null>(null)

  // 情侣空间申请确认弹窗
  const [coupleInviteConfirmOpen, setCoupleInviteConfirmOpen] = useState(false)
  const [coupleInviteBusy, setCoupleInviteBusy] = useState(false)
  
  // 斗地主邀请状态
  const [showDoudizhuInviteConfirm, setShowDoudizhuInviteConfirm] = useState(false)
  const [doudizhuInviteMsg, setDoudizhuInviteMsg] = useState<typeof messages[0] | null>(null)
  const [showDoudizhuAcceptedDialog, setShowDoudizhuAcceptedDialog] = useState(false)
  
  // 经期日历状态
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selectedPeriodDate, setSelectedPeriodDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [periodPainDraft, setPeriodPainDraft] = useState<0 | 1 | 2 | 3 | 4>(0)
  const [periodFlowDraft, setPeriodFlowDraft] = useState<'none' | 'light' | 'medium' | 'heavy'>('none')
  const [periodNoteDraft, setPeriodNoteDraft] = useState('')
  
  // 手动模式下待发送的消息数量（保留用于显示/以后扩展）
  const [pendingCount, setPendingCount] = useState(0)
  
  // AI正在输入
  const [aiTyping, setAiTyping] = useState(false)
  const [typingStartTime, setTypingStartTime] = useState<number | null>(null)
  const [showTimeoutDialog, setShowTimeoutDialog] = useState(false)
  const showTyping = aiTyping || !!character?.isTyping
  
  // 组件挂载/切换聊天时：不要“立刻清掉”正在输入
  // 只在明确“残留超时”时才清理（避免你退出再进来，输入中消失+按钮又亮导致误触重复生成）
  useEffect(() => {
    if (!character?.id) return
    if (!character.isTyping) return
    if (aiTyping) return
    const updatedAt = (character as any).typingUpdatedAt as number | null | undefined
    // 若没有 updatedAt，就保守不清，避免误伤真实生成
    if (!updatedAt) return
    const stale = Date.now() - updatedAt >= 5 * 60 * 1000
    if (stale) {
      setShowTimeoutDialog(true)
      setCharacterTyping(character.id, false)
    }
  }, [character?.id, character?.isTyping, (character as any)?.typingUpdatedAt, aiTyping, setCharacterTyping])
  
  // 超时检测：改为2分钟，更快响应卡住的情况
  useEffect(() => {
    if (!aiTyping || !typingStartTime) return
    const TIMEOUT_MS = 2 * 60 * 1000 // 2分钟超时
    const timeout = setTimeout(() => {
      if (aiTyping && typingStartTime && Date.now() - typingStartTime >= TIMEOUT_MS) {
        setShowTimeoutDialog(true)
        setAiTyping(false)
        setCharacterTyping(character?.id || '', false)
        setTypingStartTime(null)
      }
    }, TIMEOUT_MS)
    return () => clearTimeout(timeout)
  }, [aiTyping, typingStartTime, character?.id, setCharacterTyping])

  // 翻译机制：不做实时翻译请求
  // - 当角色语言非中文且开启聊天翻译时：模型会在每条消息里“自带一份中文翻译”
  // - 我们只做“翻译中…”的假动画，然后展示这份中文
  
  // 编辑模式：可勾选双方消息、批量删除
  const [editMode, setEditMode] = useState(false)
  // 单条消息编辑和引用
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(null)
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set())

  // 线上模式：长按气泡弹出操作菜单（线下模式不动）
  const [msgActionMenu, setMsgActionMenu] = useState<{
    open: boolean
    msg: typeof messages[0] | null
    x: number
    y: number
    placement: 'top' | 'bottom'
  }>({ open: false, msg: null, x: 0, y: 0, placement: 'top' })
  
  // 查手机功能状态
  const [showPhonePeek, setShowPhonePeek] = useState(false)
  const [phonePeekLoading, setPhonePeekLoading] = useState(false)
  const [phonePeekLoadingMsg, setPhonePeekLoadingMsg] = useState('')
  const [phonePeekData, setPhonePeekData] = useState<{
    chats: Array<{
      characterId: string
      characterName: string
      characterAvatar: string
      remark: string  // 备注
      messages: Array<{ isUser: boolean; content: string; contentZh?: string; timestamp: number }>
    }>
    bills: Array<{ type: string; amount: number; description: string; timestamp: number }>
    walletBalance: number  // 钱包余额
    memo: string
    memoZh?: string  // 备忘录中文翻译
    recentPhotos: string[]  // 文字描述
  } | null>(null)
  const [phonePeekTab, setPhonePeekTab] = useState<'chats' | 'bills' | 'wallet' | 'memo' | 'photos'>('chats')
  const [phonePeekSelectedChat, setPhonePeekSelectedChat] = useState<number | null>(null)
  
  // 查手机等待提示语
  const phonePeekLoadingMessages = useMemo(() => [
    '正在联系二舅，请稍等…',
    '二舅正在尝试打开对方的“公开信息”入口…',
    '哎呦！差点被发现！再等会儿...',
    '悄咪咪的，别吵别吵…',
    '这么难的技术，慢点正常啦~',
    '二舅说验证有点复杂，稍等...',
    '正在进行兼容处理…',
    '快了快了，马上就好...',
    '二舅喝口水，别催了...',
    '正在下载聊天记录...',
    '数据传输中，保持耐心...',
    '二舅说这手机保护挺强的...',
    '差一点点就打开了...',
    '别动别动，让二舅专心点...',
    '正在整理对方的公开信息…',
    '二舅：这活儿不好干啊...',
  ], [])
  
  // X（推特）关注状态
  const [xFollowing, setXFollowing] = useState(false)
  const [xFollowLoading, setXFollowLoading] = useState(false)
  
  // 转发聊天记录状态
  const [forwardMode, setForwardMode] = useState(false)
  const [forwardSelectedIds, setForwardSelectedIds] = useState<Set<string>>(new Set())
  const [showForwardTargetPicker, setShowForwardTargetPicker] = useState(false)
  
  // 查手机等待提示语循环
  useEffect(() => {
    if (!phonePeekLoading) return
    let idx = 0
    setPhonePeekLoadingMsg(phonePeekLoadingMessages[0])
    const interval = setInterval(() => {
      idx = (idx + 1) % phonePeekLoadingMessages.length
      setPhonePeekLoadingMsg(phonePeekLoadingMessages[idx])
    }, 2500)
    return () => clearInterval(interval)
  }, [phonePeekLoading, phonePeekLoadingMessages])
  
  // 加载 X 关注状态
  useEffect(() => {
    if (!character?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const persona = getCurrentPersona()
        const xData = await xLoad(persona?.name || '我')
        if (cancelled) return
        setXFollowing(xIsFollowing(xData, character.id))
      } catch {
        // ignore
      }
    })()
    return () => { cancelled = true }
  }, [character?.id, getCurrentPersona])
  
  // 关注/取关 X
  const toggleXFollow = async () => {
    if (!character?.id || xFollowLoading) return
    setXFollowLoading(true)
    try {
      const persona = getCurrentPersona()
      let xData = await xLoad(persona?.name || '我')
      
      // 确保用户存在于 X（不传 bio，避免覆盖用户手动编辑的签名）
      const existingUser = xData.users.find((u) => u.id === character.id)
      const { data: ensuredData } = xEnsureUser(xData, {
        id: character.id,
        name: character.name,
        handle: (character as any).xHandle || undefined,
        avatarUrl: character.avatar || undefined,
        // 只在用户首次创建时使用角色 prompt 作为默认 bio，之后保留用户手动编辑的
        bio: existingUser ? undefined : ((character.prompt || '').replace(/\s+/g, ' ').slice(0, 80) || undefined),
      })
      xData = ensuredData
      
      if (xIsFollowing(xData, character.id)) {
        xData = xRemoveFollow(xData, character.id)
        setXFollowing(false)
      } else {
        xData = xAddFollow(xData, character.id)
        setXFollowing(true)
      }
      await xSave(xData)
    } catch {
      // ignore
    } finally {
      setXFollowLoading(false)
    }
  }

  // 退出编辑模式时清空选择，避免残留导致卡顿/误触
  useEffect(() => {
    if (!editMode) setSelectedMsgIds(new Set())
  }, [editMode])
  const [showEditDeleteConfirm, setShowEditDeleteConfirm] = useState(false)
  // 回溯功能已移除（仅保留批量删除）
  
  // 清空消息确认
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  
  // 用户发表情包面板：应展示“总表情库”（不受角色绑定影响）
  const libraryStickers = useMemo(() => getStickersByCharacter('all'), [getStickersByCharacter])

  // 发送用户表情包
  const sendUserSticker = (sticker: typeof libraryStickers[0]) => {
    if (!sticker?.imageUrl) return
    
    // 添加到最近使用
    setRecentStickers(prev => {
      const next = [sticker.id, ...prev.filter(id => id !== sticker.id)].slice(0, 20)
      try {
        localStorage.setItem('littlephone_recent_stickers', JSON.stringify(next))
      } catch { /* ignore */ }
      return next
    })
    
    // 发送表情包消息
    addMessage({
      characterId: character?.id || '',
      content: sticker.imageUrl,
      isUser: true,
      type: 'sticker',
    })
    
    // 关闭面板
    setShowStickerPanel(false)
    
    // 增加待回复计数
    setPendingCount(prev => prev + 1)
  }
  
  // 获取表情包分类列表
  const stickerCategoryList = useMemo(() => {
    const categories = new Set<string>()
    for (const s of libraryStickers) {
      if (s.category) categories.add(s.category)
    }
    return Array.from(categories).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [libraryStickers])
  
  // 获取当前标签页的表情包
  const currentTabStickers = useMemo(() => {
    if (stickerTab === 'recent') {
      // 返回最近使用的表情包
      return recentStickers
        .map(id => libraryStickers.find(s => s.id === id))
        .filter((s): s is typeof libraryStickers[0] => !!s)
    }
    // 返回指定分类的表情包
    return libraryStickers.filter(s => s.category === stickerTab)
  }, [stickerTab, libraryStickers, recentStickers])
  
  const imageInputRef = useRef<HTMLInputElement>(null)
  const aliveRef = useRef(true)
  const timeoutsRef = useRef<number[]>([])

  // （旧逻辑保留：以前用于离开页面时清理全部定时器；现在支持“后台继续生成”，不再需要）

  const safeTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      if (!aliveRef.current) return
      fn()
    }, ms)
    timeoutsRef.current.push(id)
    return id
  }

  // 允许“后台继续生成”的 timeout（离开页面也继续执行 addMessage），但不再触发本页面 setState
  const timeoutsMetaRef = useRef<{ id: number; background: boolean }[]>([])
  const safeTimeoutEx = (fn: () => void, ms: number, opts?: { background?: boolean }) => {
    const background = !!opts?.background
    const id = window.setTimeout(() => {
      // 背景任务：允许在离开页面后继续执行（仅用于 addMessage/updateMessage 等 context 操作）
      if (!background && !aliveRef.current) return
      fn()
    }, ms)
    timeoutsMetaRef.current.push({ id, background })
    return id
  }

  // 首次进入时直接跳到底部（无动画），后续新消息：只在接近底部时才平滑滚动（手机端更顺滑）
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      // 首次渲染：直接跳到底部，不要动画
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
      isFirstRender.current = false
    } else {
      // 用户发送消息/主动触发：强制立刻跳到底部（解决“发完不知道有没有发出去”）
      if (forceScrollRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
        forceScrollRef.current = false
      } else {
        // 后续新消息：仅在用户在底部附近时滚动，避免手机端卡顿
        if (nearBottomRef.current) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
      }
    }
  }, [messages])

  // 处理从搜索结果跳转过来的高亮消息
  useEffect(() => {
    if (!highlightMsgId || !messages.length) return
    // 找到消息在数组中的索引
    const msgIndex = messages.findIndex(m => m.id === highlightMsgId)
    if (msgIndex < 0) return
    
    // 调整 startIndex 使该消息可见
    const targetStart = Math.max(0, msgIndex - 5) // 让目标消息在视口中间偏上
    setStartIndex(targetStart)
    tailModeRef.current = false
    
    // 设置高亮并在渲染后滚动到该消息
    setHighlightedMsgId(highlightMsgId)
    
    // 清除 URL 参数
    setSearchParams({})
    
    // 延迟滚动到该消息并清除高亮
    setTimeout(() => {
      const el = document.querySelector(`[data-msg-id="${highlightMsgId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      // 3秒后清除高亮
      setTimeout(() => setHighlightedMsgId(null), 3000)
    }, 100)
  }, [highlightMsgId, messages, setSearchParams])

  // 进入/切换聊天：从数据源头只取最近 PAGE_SIZE 条渲染
  useEffect(() => {
    const cid = characterId || ''
    if (!cid) return
    const page = getMessagesPage(cid, { limit: PAGE_SIZE })
    // 这里的 startIndex 只用于“全量 messages 的窗口”，先固定到尾部
    const total = messages.length
    const nextStart = Math.max(0, total - PAGE_SIZE)
    setStartIndex(nextStart)
    tailModeRef.current = true
    // 用 page 触发可视窗口（兼容：如果消息很少，page 会更短）
    // startIndex 仍可用来上拉时向前扩大窗口
    if (page.length > 0) {
      const firstId = page[0].id
      const idx = messages.findIndex(m => m.id === firstId)
      if (idx >= 0) setStartIndex(idx)
    }
  }, [characterId, getMessagesPage, messages])

  // 只渲染窗口内消息（数据源仍保留全量，功能不受影响）
  const visibleMessages = useMemo(() => {
    return messages.slice(startIndex)
  }, [messages, startIndex])

  // 上拉加载更多：保持滚动位置不跳（使用 useLayoutEffect 避免闪烁）
  useLayoutEffect(() => {
    if (!loadingMoreRef.current) return
    const el = messagesContainerRef.current
    if (!el) return
    const prevH = prevScrollHeightRef.current
    const prevTop = prevScrollTopRef.current
    if (prevH == null || prevTop == null) return
    const newH = el.scrollHeight
    // 让内容“往下推”的高度抵消掉，保持用户看到的内容不变
    el.scrollTop = newH - prevH + prevTop
    loadingMoreRef.current = false
    prevScrollHeightRef.current = null
    prevScrollTopRef.current = null
  }, [visibleMessages.length])

  // 进入聊天时设置当前聊天ID（清除未读），离开时清空
  useEffect(() => {
    if (characterId) {
      setCurrentChatId(characterId)
    }
    return () => {
      setCurrentChatId(null)
    }
  }, [characterId, setCurrentChatId])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      // 只清理“非后台任务”，后台生成继续跑（用于离开聊天也能生成未读）
      for (const t of timeoutsMetaRef.current) {
        if (!t.background) clearTimeout(t.id)
      }
      timeoutsMetaRef.current = timeoutsMetaRef.current.filter(t => t.background)
    }
  }, [])

  // 输入框自动增高（最多4行），避免长文本“挤成一行看不到前面”
  useEffect(() => {
    autosizeInput(inputRef.current)
  }, [inputText, autosizeInput])

  // 线下模式分割线现在由 ChatSettingsScreen 在切换时直接插入
  // 这里只处理语音功能的自动关闭
  const currentOfflineMode = character?.offlineMode
  useEffect(() => {
    if (!character) return
    // 如果开启了线下模式且语音功能开启，自动关闭语音
    if (currentOfflineMode && character.voiceEnabled) {
      updateCharacter(character.id, { voiceEnabled: false })
      setInfoDialog({
        open: true,
        title: '语音功能已关闭',
        message: '线下模式暂不支持语音功能，已自动关闭。',
      })
    }
  }, [currentOfflineMode, character?.id, character?.voiceEnabled, updateCharacter])

  if (!character) {
    return (
      <WeChatLayout>
        <div className="flex items-center justify-center h-full">
          <span className="text-gray-500">角色不存在</span>
        </div>
      </WeChatLayout>
    )
  }

  // 统一手动回复：移除自动/手动切换
  const isAutoMode = false

  const safeSetTyping = (value: boolean) => {
    if (aliveRef.current) {
      setAiTyping(value)
      if (value) {
        setTypingStartTime(Date.now())
      } else {
        setTypingStartTime(null)
      }
    }
  }

  const safeSetPending = (value: number) => {
    if (aliveRef.current) setPendingCount(value)
  }

  // 检查是否配置了API
  const hasApiConfig = llmConfig.apiBaseUrl && llmConfig.apiKey && llmConfig.selectedModel
  
  // 语音消息辅助函数：根据角色设置和频率决定是否发语音
  const shouldSendVoice = useCallback(() => {
    if (!ttsConfig.enabled || !character?.voiceEnabled) return false
    const freq = character.voiceFrequency || 'sometimes'
    const rand = Math.random()
    if (freq === 'always') return true
    if (freq === 'often') return rand < 0.5
    if (freq === 'sometimes') return rand < 0.2
    if (freq === 'rarely') return rand < 0.05
    return false
  }, [ttsConfig.enabled, character?.voiceEnabled, character?.voiceFrequency])
  
  // 生成语音URL（不自动播放，返回URL供语音消息使用）
  const generateVoiceUrl = useCallback(async (text: string): Promise<string | null> => {
    const voiceId = character?.voiceId || ttsConfig.voiceId
    if (!voiceId || !ttsConfig.apiKey) return null
    
    const controller = new AbortController()
    const timeoutMs = 45_000
    const t = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const baseUrl = ttsConfig.region === 'global' 
        ? 'https://api.minimax.chat' 
        : 'https://api.minimaxi.com'
      const response = await fetch(`${baseUrl}/v1/t2a_v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ttsConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: ttsConfig.model || 'speech-02-turbo',
          text: text.slice(0, 500),
          stream: false,
          voice_setting: {
            voice_id: voiceId,
            speed: ttsConfig.speed || 1,
            vol: 1,
            pitch: 0,
          },
          audio_setting: {
            sample_rate: 24000,
            bitrate: 128000,
            format: 'mp3',
            channel: 1,
          },
          output_format: 'url',
        }),
      })
      if (response.ok) {
        const data = await response.json()
        if (data.base_resp?.status_code === 0 && data.data?.audio) {
          let audioUrl = data.data.audio
          if (!audioUrl.startsWith('http')) {
            const bytes = new Uint8Array(audioUrl.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || [])
            const blob = new Blob([bytes], { type: 'audio/mp3' })
            audioUrl = URL.createObjectURL(blob)
          }
          return audioUrl
        }
      }
      return null
    } catch (err) {
      console.error('Voice generation failed:', err)
      return null
    } finally {
      window.clearTimeout(t)
    }
  }, [character?.voiceId, ttsConfig])

  const voiceGenLockRef = useRef<Record<string, boolean>>({})
  const regenVoiceForMsg = useCallback(async (msgId: string, text: string) => {
    if (!msgId || !text) return
    if (voiceGenLockRef.current[msgId]) return
    voiceGenLockRef.current[msgId] = true
    try {
      updateMessage(msgId, { voiceStatus: 'pending', voiceError: '' })
      const url = await generateVoiceUrl(text)
      if (!url) {
        updateMessage(msgId, {
          voiceStatus: 'error',
          voiceError: '语音生成失败：可能是网络/跨域拦截，或 MiniMax 服务波动。可稍后重试。',
          voiceUrl: undefined as any,
        })
        return
      }
      updateMessage(msgId, { voiceUrl: url, voiceStatus: 'ready', voiceError: '' })
    } finally {
      voiceGenLockRef.current[msgId] = false
    }
  }, [generateVoiceUrl, updateMessage])
  
  // 当前播放的语音消息ID
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // 播放语音消息
  const playVoiceMessage = useCallback((messageId: string, voiceUrl: string) => {
    // 停止之前的播放
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    
    if (playingVoiceId === messageId) {
      // 点击同一条，停止播放
      setPlayingVoiceId(null)
      return
    }
    
    const audio = new Audio(voiceUrl)
    audioRef.current = audio
    setPlayingVoiceId(messageId)
    
    audio.onended = () => {
      setPlayingVoiceId(null)
      audioRef.current = null
    }
    audio.onerror = () => {
      setPlayingVoiceId(null)
      audioRef.current = null
      // 播放失败时，把状态标成 error，避免用户以为“点了没声音”
      try {
        const m = messages.find(x => x.id === messageId)
        const text = String(m?.voiceOriginalText || '').trim()
        updateMessage(messageId, { voiceStatus: 'error', voiceError: '播放失败：音频链接可能过期或被拦截。点此可重试生成。' })
        // 如果有原文，允许用户点一下语音条重试生成
        if (text) {
          // 不在这里自动重试，避免无止境刷接口；交给点击触发
        }
      } catch {
        // ignore
      }
    }
    audio.play().catch(() => {
      setPlayingVoiceId(null)
      audioRef.current = null
    })
  }, [playingVoiceId])

  // 根据性格/情绪/经期生成1-15条回复，每条间隔1-8秒（按字数）
  const pendingCountRef = useRef(pendingCount)
  useEffect(() => { pendingCountRef.current = pendingCount }, [pendingCount])

  const generateAIReplies = useCallback(async (messagesOverride?: typeof messages, opts?: { forceNudge?: boolean }) => {
    if (aiTyping || !character) return
    safeSetTyping(true)
    setCharacterTyping(character.id, true)
    const workingMessages = messagesOverride || messages
    
    // 如果配置了API，使用真实的LLM回复
    if (hasApiConfig) {
      try {
        const getLastUserText = (all: typeof messages) => {
          for (let i = all.length - 1; i >= 0; i--) {
            const m = all[i]
            if (!m?.isUser) continue
            if (m.type !== 'text') continue
            const t = String(m.content || '').trim()
            if (t) return t
          }
          return ''
        }

        const isTrivialUserInput = (s: string) => {
          const t = String(s || '').trim()
          if (!t) return true
          // 单字、纯标点、非常敷衍的输入：允许只回一条
          if (t.length <= 1) return true
          if (/^[\s\d\p{P}\p{S}]+$/u.test(t)) return true
          if (/^(嗯|哦|啊|？|\?|。|…+|哈+|呵+|行|好|在|是)$/u.test(t)) return true
          return false
        }

        const splitToReplies = (raw: string) => {
          const text = (raw || '').trim()
          if (!text) return []
          
          // 线下模式：不分割，直接返回完整的一条
          if (character.offlineMode) {
            return [text]
          }

          // 用户可调：线上回复气泡数量上限（默认15，上限20）
          const onlineReplyMax = Math.min(20, Math.max(1, Number((character as any).onlineReplyMax ?? 15) || 15))
          
          const splitOutImageTokens = (s: string) => {
            const src = (s || '').trim()
            if (!src) return []
            const out: string[] = []
            const re = /\[图片[：:]\s*([\s\S]*?)\]/g
            let last = 0
            let m: RegExpExecArray | null
            while ((m = re.exec(src)) !== null) {
              const before = src.slice(last, m.index).trim()
              if (before) out.push(before)
              const desc = String(m[1] || '').trim()
              if (desc) out.push(`[图片：${desc}]`)
              last = m.index + m[0].length
            }
            const after = src.slice(last).trim()
            if (after) out.push(after)
            return out
          }

          const dedupeConsecutive = (arr: string[]) => {
            const out: string[] = []
            let last: string | null = null
            for (const x of arr) {
              const t = (x || '').trim()
              if (!t) continue
              if (last && t === last) continue
              out.push(t)
              last = t
            }
            return out
          }

          // 线上模式：只在“完整句末标点/换行”处拆分，避免把一句话硬拆成半句
          const keepCmd = (s: string) =>
            /\|\|\|/.test(s) ||
            /\[转账:/.test(s) ||
            /[【\[]\s*转账\s*[:：]/.test(s) ||
            /\[推文[:：]/.test(s) ||
            /[【\[]\s*推文\s*[:：]/.test(s) ||
            /\[推特主页[:：\]]/.test(s) ||
            /[【\[]\s*(推特主页|X主页)\s*[:：\]]/.test(s)

          const isSentenceEnd = (s: string) => {
            const t = (s || '').trim()
            if (!t) return true
            // 允许句末带引号/括号
            return /[。！？!?…~～\.](?:["'”’）)\]]*)?$/.test(t)
          }

          // 如果要拆成多条气泡：尽量保证“上一条末尾有标点”，避免看起来像没说完
          const appendEndPunct = (s: string) => {
            const t = (s || '').trim()
            if (!t) return t
            if (keepCmd(t) || isSentenceEnd(t)) return t
            // 避免给纯 emoji 乱加标点
            const lastChar = t.slice(-1)
            if (/\p{Extended_Pictographic}/u.test(lastChar)) return t
            // 把尾部的引号/括号拆出来，把标点插到它们前面
            const m = t.match(/^(.*?)(["'”’）)\]]*)$/)
            let base = (m?.[1] ?? t).trimEnd()
            const tail = m?.[2] ?? ''
            if (!base) return t
            // 句中分隔符结尾（逗号/顿号/分号等）先去掉，避免出现 “，。” 这种怪组合
            const stripped = base.replace(/[，,、；;：:]+$/g, '').trimEnd()
            if (stripped) base = stripped

            const isZh = characterLanguage === 'zh'
            const punct = isZh
              ? (/[吗嘛呢么]$/.test(base) ? '？' : '。')
              : '.'
            return `${base}${punct}${tail}`
          }

          // 无标点长段落兜底：模型有时会把一大坨话不加标点直接输出
          // 这里按“自然分隔符/长度”拆成多条，再配合 appendEndPunct 让每条更像微信气泡
          const softSplitLongNoPunct = (s: string) => {
            const src = String(s || '').trim()
            if (!src) return []
            if (keepCmd(src)) return [src]
            // 已有句末标点或较短：不处理
            // 重要：避免把正常一句话强拆（<=110 基本都算“一个微信气泡里能说完”）
            if (isSentenceEnd(src) || src.length <= 110) return [src]
            // 若有明显分隔符，优先按分隔符切（保留分隔符在段尾）
            const segBySep = src.match(/[^，,、；;：:]+[，,、；;：:]?/g)?.map(x => x.trim()).filter(Boolean) || []
            const cleanedSep = segBySep.length > 1 ? segBySep.filter(Boolean) : []
            const out: string[] = []
            const pushChunked = (t0: string) => {
              let t = String(t0 || '').trim()
              if (!t) return
              const MAX = 55
              const MIN = 22
              while (t.length > MAX) {
                let cut = -1
                // 尽量在 MAX 附近找个自然断点
                const window = t.slice(0, MAX + 1)
                const hit =
                  Math.max(
                    window.lastIndexOf(' '),
                    window.lastIndexOf('、'),
                    window.lastIndexOf('，'),
                    window.lastIndexOf(','),
                    window.lastIndexOf('；'),
                    window.lastIndexOf(';'),
                    window.lastIndexOf('：'),
                    window.lastIndexOf(':')
                  )
                if (hit >= MIN) cut = hit + 1
                if (cut < MIN) cut = MAX
                const a = t.slice(0, cut).trim()
                if (a) out.push(a)
                t = t.slice(cut).trim()
              }
              if (t) out.push(t)
            }
            if (cleanedSep.length > 1) {
              for (const seg of cleanedSep) pushChunked(seg)
            } else {
              pushChunked(src)
            }
            // 避免极端情况下过多
            return out.filter(Boolean).slice(0, onlineReplyMax)
          }

          const byLine = text.split('\n').map(s => s.trim()).filter(Boolean)
          const rawParts: string[] = []
          for (const line of byLine) {
            if (keepCmd(line)) { rawParts.push(line); continue }
            // 先按句末标点拆（不按逗号/顿号拆）
            const parts = line.match(/[^。！？!?…~～]+[。！？!?…~～]?/g) || [line]
            for (const p of parts) {
              const t = (p || '').trim()
              if (!t) continue
              rawParts.push(t)
            }
          }

          // 合并被“换行/分段”切断的句子：前一段不以句末标点结束，则优先拼到下一段
          const merged: string[] = []
          const startsLikeContinuation = (s: string) => {
            const t = String(s || '').trim()
            if (!t) return false
            // 以标点/连接词/语气词开头：很可能是上一句的延续
            if (/^[，,、；;：:)\]】”’》〉…~～\.!?。！？]/.test(t)) return true
            if (/^(的|了|着|过|吧|呀|啊|哦|诶|嗯|哈|在|就|还|也|都|又|再|跟|和|与|以及|因为|所以|但是|然后|不过|而且|如果|其实|就是|可能|应该|要|会|能|可以)/.test(t)) return true
            return false
          }
          const endsLikeConnector = (s: string) => {
            const t = String(s || '').trim()
            if (!t) return false
            return /[，,、；;：:（(\[【]$/.test(t)
          }
          for (const cur of rawParts) {
            if (!cur) continue
            if (merged.length === 0) { merged.push(cur); continue }
            const last = merged[merged.length - 1]
            // 目标：尽量“拼回完整句子”，避免人名/一句话被拆成半句
            const shouldMerge =
              !keepCmd(last) &&
              !keepCmd(cur) &&
              !isSentenceEnd(last) &&
              (endsLikeConnector(last) || startsLikeContinuation(cur) || last.length < 28 || cur.length < 22) &&
              (last.length + cur.length <= 160)
            if (shouldMerge) {
              merged[merged.length - 1] = `${last}${cur}`
            } else {
              merged.push(cur)
            }
          }

          // 把 [图片：...] 从文本里拆出来，保证图片卡片不和文字混在同一个气泡里
          let expanded: string[] = []
          for (const m of merged) expanded.push(...splitOutImageTokens(m))
          expanded = dedupeConsecutive(expanded)
          let trimmed = expanded.filter(Boolean).slice(0, onlineReplyMax)
          // 兜底：对“无标点且偏长”的段落按分隔符/长度软拆成多条气泡（不局限于只有一条时）
          {
            const expanded2: string[] = []
            for (const t of trimmed) {
              // 只对“真的很长、又没句末标点”的一坨做软拆，避免强行把短句拆开
              if (t && !keepCmd(t) && !isSentenceEnd(t) && t.length > 110) {
                const split = softSplitLongNoPunct(t)
                if (split.length > 0) { expanded2.push(...split); continue }
              }
              expanded2.push(t)
            }
            trimmed = dedupeConsecutive(expanded2).filter(Boolean).slice(0, onlineReplyMax)
          }
          // 每条都补齐句末标点（命令/纯 emoji 除外）
          return trimmed.map(appendEndPunct)
        }

        // 线上模式：强制剥离“思维链/分析段落”，避免少数模型/中转仍然输出思考内容
        const stripThoughtForOnline = (raw: string) => {
          let t = String(raw || '')
          if (!t.trim()) return ''
          // 显式 tag（常见）
          t = t.replace(/```(?:think|analysis)[\s\S]*?```/gi, '')
          t = t.replace(/<think[\s\S]*?<\/think>/gi, '')
          t = t.replace(/<analysis[\s\S]*?<\/analysis>/gi, '')
          // 常见“括号思维链”
          t = t.replace(/[（(]\s*(思考|分析|推理|推断|reasoning|thoughts?|chain of thought|cot)[\s\S]*?[）)]/gi, '')

          // 【重要】过滤 AI 错误输出的系统标记（如 <STICKER/>、<STIVKER/>、<FUND_SHARE/> 等）
          // 这些是上下文中用于标记消息类型的，AI 不应该在回复中输出
          t = t.replace(/<\s*STICKER\s*\/?>/gi, '')
          t = t.replace(/<\s*STIVKER\s*\/?>/gi, '') // 常见拼写错误
          t = t.replace(/<\s*FUND_SHARE\s*\/?>/gi, '')
          t = t.replace(/<\s*IMAGE\s*\/?>/gi, '')
          t = t.replace(/<\s*VOICE\s*\/?>/gi, '')
          t = t.replace(/<\s*TRANSFER\s*\/?>/gi, '')
          t = t.replace(/<\s*LOCATION\s*\/?>/gi, '')
          t = t.replace(/<\s*MUSIC\s*\/?>/gi, '')
          t = t.replace(/<\s*PAT\s*\/?>/gi, '')
          // 通用兜底：任何 <XXXX/> 或 <XXXX /> 格式的标记（全大写字母+下划线）
          t = t.replace(/<[A-Z_]+\s*\/?>/g, '')

          // 【重要】过滤 AI 错误输出的拍一拍格式（应由系统处理，AI 不应输出）
          // 包括：[拍一拍：xxx]、[拍了拍xxx]、*拍一拍*、（拍一拍）等
          t = t.replace(/\[拍一拍[：:][^\]]*\]/g, '')
          t = t.replace(/\[拍了拍[^\]]*\]/g, '')
          t = t.replace(/\[拍一拍\]/g, '')
          t = t.replace(/[*＊]拍一拍[^\n*＊]*[*＊]/g, '')
          t = t.replace(/（拍一拍[^）]*）/g, '')
          t = t.replace(/\(拍一拍[^)]*\)/g, '')

          // 如果模型输出了“Final/Answer/正文/最终回复”等分隔符，取后半段
          const marker = t.match(/(?:^|\n)\s*(最终回复|最终答案|正文|回复|Final|Answer)\s*[:：]\s*/i)
          if (marker && marker.index != null) {
            t = t.slice(marker.index + marker[0].length)
          }

          const lines = t.split('\n')
          const out: string[] = []
          let skipping = false
          const startRe = /^\s*(思考|分析|推理|推断|reasoning|thoughts?|chain of thought|cot)\s*[:：]/i
          const bracketStartRe = /^\s*[【\[]\s*(思考|分析|推理|reasoning)\s*[】\]]\s*[:：]?/i
          const mdTitleRe = /^\s*#{1,6}\s*(思考|分析|推理|reasoning)\b/i
          const endRe = /^\s*(最终回复|正文|回复|Final|Answer)\s*[:：]/i
          for (const line of lines) {
            const s = line || ''
            // 额外兜底：直接出现“思维链/Chain-of-thought”等字样也视为要剔除
            if (!skipping && (startRe.test(s) || bracketStartRe.test(s) || mdTitleRe.test(s) || /^\s*Let's think step by step/i.test(s) || /思维链|chain[-\s]?of[-\s]?thought/i.test(s))) {
              skipping = true
              continue
            }
            if (skipping) {
              // 遇到明确的“正文/回复”标记：停止跳过，但不输出标记行
              if (endRe.test(s)) {
                skipping = false
                continue
              }
              // 思维链常见是列表/步骤：继续丢弃
              if (/^\s*(?:[-*]|\d+[.)]|（\d+）)\s*/.test(s)) continue
              // 也可能是“让我想想/我来分析”之类的开头
              if (/^\s*(让我想想|我想想|思考一下|先想想|我来分析|我先分析)/.test(s)) continue
              // 空行：通常是思维链段落结束
              if (!s.trim()) {
                skipping = false
              }
              continue
            }
            // 非跳过状态也要剔除“让我想想…”这类明显元叙述（微信里很出戏）
            if (/^\s*(让我想想|我想想|思考一下|先想想|我来分析|我先分析)\b/.test(s)) continue
            out.push(s)
          }
          return out.join('\n').trim()
        }
        // 构建对话历史（尽量不“失忆”：按“回合”+字符预算截取；转账/图片等用简短标记，避免塞超长URL）
        const buildChatHistory = (all: typeof messages, maxRounds: number, maxChars: number) => {
          let used = 0
          let rounds = 0
          const out: { role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }[] = []
          for (let i = all.length - 1; i >= 0; i--) {
            const m = all[i]
            if (m.type === 'system') continue

            // 以“用户发言”为一个回合边界
            if (m.isUser) rounds += 1
            if (rounds > maxRounds) break

            let content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> = m.content || ''
            // 图片：如果是用户发送的图片，传递给支持vision的API
            // 安全：GIF/WebP动图等 Gemini 不支持，统一降级为文本（避免 mime type not supported 报错）
            if (m.type === 'image') {
              const imgUrl = String(m.content || '').trim()
              const isGif = /\.gif(\?|$)/i.test(imgUrl) || /^data:image\/gif/i.test(imgUrl)
              if (isGif) {
                content = m.isUser ? '[用户发送了一张动图/GIF]' : '[对方发送了一张动图/GIF]'
                used += 20
              } else if (m.isUser && imgUrl && imgUrl.startsWith('data:image')) {
                content = [
                  { type: 'text', text: '[用户发送了一张图片，请描述你看到的内容并自然回应]' },
                  { type: 'image_url', image_url: { url: imgUrl } }
                ]
                used += 100
              } else {
                content = '[对方发送了一张图片]'
                used += 15
              }
            }
            else if (m.type === 'sticker') {
              const url = String(m.content || '').trim()
              // 表情包：排查/兼容优先 —— 不再把 GIF/贴纸图片发给模型（很多中转/Gemini 不支持 image/gif）
              // 只把“表情包备注/关键词/分类”作为文本上下文，让模型理解情绪含义即可。
              const st =
                (libraryStickers || []).find((s: any) => String(s?.imageUrl || '').trim() === url) ||
                null
              const desc = String(st?.description || '').trim()
              const kw = String(st?.keyword || '').trim()
              const cat = String(st?.category || '').trim()
              const ref = String((st as any)?.refKey || '').trim()
              const parts = [
                desc ? `备注=${desc}` : '',
                kw ? `关键词=${kw}` : '',
                cat ? `分类=${cat}` : '',
                ref ? `引用=${ref}` : '',
              ].filter(Boolean)
              content = parts.length > 0 ? `【表情包】${parts.join('；')}` : '【表情包】（无备注）'
              used += 22
            }
            else if (m.type === 'transfer') {
              const amt = (m.transferAmount ?? 0).toFixed(2)
              const note = (m.transferNote || '转账').replace(/\s+/g, ' ').slice(0, 30)
              const st = m.transferStatus || 'pending'
              // 明确标注转账方向 + “已领取=已被接收/已收入”（避免模型把收款当成付款）
              const userName = selectedPersona?.name || '用户'
              const stText =
                st === 'received'
                  ? '已领取（=收款方已收入）'
                  : st === 'refunded'
                    ? '已退还'
                    : st === 'rejected'
                      ? '已拒绝'
                      : '待领取'
              // 关键：用户点“收款/退还”后会生成一条 isUser=true 的“已收款/已退还”美化框（收款确认），
              // 但它并不代表“用户发起转账”。否则模型会把“收款”误认为“转账支出”。
              // 判断是否是"收款/退款确认"消息：content 以"已收款/已退还/已领取/已退款"开头
              const isReceiptConfirm =
                typeof m.content === 'string' &&
                // 注意：不要用 \b（对中文不可靠，会导致“已收款”偶发识别失败）
                /^\s*已(收款|领取|退还|退款|拒绝)/.test(m.content.trim())

              if (isReceiptConfirm) {
                // 转账结果卡片（不是发起转账）：
                // - received：收款方收下了钱
                // - refunded：收款方退还了钱（付款方未损失）
                // - rejected：收款方拒绝领取（付款方未损失）
                const raw = String(m.content || '').trim()
                const action =
                  st === 'received' || /^\s*已(收款|领取)/.test(raw)
                    ? 'received'
                    : st === 'refunded' || /^\s*已(退还|退款)/.test(raw)
                      ? 'refunded'
                      : st === 'rejected' || /^\s*已拒绝/.test(raw)
                        ? 'rejected'
                        : st
                const actor = m.isUser ? userName : character.name
                const other = m.isUser ? character.name : userName
                const verb =
                  action === 'received'
                    ? '收下了'
                    : action === 'refunded'
                      ? '退还了'
                      : action === 'rejected'
                        ? '拒绝领取'
                        : '处理了'
                content = `[转账结果：${actor}${verb}${other}转的¥${amt}，备注"${note}"]`
              } else if (m.isUser) {
                // 用户发起转账 → 转给角色
                content = `[${userName}发起转账给${character.name}：¥${amt}，备注"${note}"，${stText}]`
              } else {
                // 角色发起转账 → 转给用户
                content = `[${character.name}发起转账给${userName}：¥${amt}，备注"${note}"，${stText}]`
              }
              used += content.length
            }
            else if (m.type === 'music') {
              const title = (m.musicTitle || '未知歌曲').replace(/\s+/g, ' ').slice(0, 60)
              const artist = (m.musicArtist || '').replace(/\s+/g, ' ').slice(0, 60)
              const st = m.musicStatus || 'pending'
              const stText = st === 'accepted' ? '已接受' : st === 'rejected' ? '已拒绝' : '待回应'
              content = `[发送了一起听歌邀请：${title}${artist ? ` - ${artist}` : ''}，${stText}]`
              used += content.length
            }
            else if (m.type === 'period') {
              const body = (m.periodContent || '').trim().slice(0, 1500)
              content = `<PERIOD_SHARED>\n${body || '（无）'}\n</PERIOD_SHARED>`
              used += content.length
            }
            else if (m.type === 'diary') {
              const authorId = (m.diaryAuthorId || '').slice(0, 80)
              const author = (m.diaryAuthorName || '（未知）').replace(/\s+/g, ' ').slice(0, 40)
              const at = m.diaryAt ? String(m.diaryAt) : ''
              const title = (m.diaryTitle || '日记').replace(/\s+/g, ' ').slice(0, 60)
              const note = (m.diaryNote || '').replace(/\s+/g, ' ').slice(0, 80)
              const body = (m.diaryContent || '').trim().slice(0, 700)
              // 关键：让模型知道“日记作者是谁”，并能区分是否为“你自己写的”
              const ownership = authorId && authorId === character.id ? '（这篇日记是你自己写的，被用户转发给你）' : '（这篇日记是别人写的，被用户转发给你）'
              content = `<DIARY title="${title}" author="${author}" authorId="${authorId}" diaryAt="${at}" note="${note}">` +
                `${ownership}\n${body}` +
                `</DIARY>`
              used += content.length
            }
            else if (m.type === 'tweet_share') {
              const author = (m.tweetAuthorName || '（未知）').replace(/\s+/g, ' ').slice(0, 40)
              const at = m.tweetAt ? String(m.tweetAt) : ''
              const stats = (m.tweetStats || '').replace(/\s+/g, ' ').slice(0, 60)
              const body = (m.tweetContent || '').trim().slice(0, 700)
              content =
                `<TWEET_SHARED author="${author}" tweetAt="${at}" stats="${stats}">` +
                `${body || '（无内容）'}` +
                `</TWEET_SHARED>`
              used += content.length
            }
            else if (m.type === 'x_profile_share') {
              const name = (m.xUserName || '（未知）').replace(/\s+/g, ' ').slice(0, 40)
              const handle = (m.xUserHandle || '').replace(/\s+/g, ' ').slice(0, 40)
              content = `<X_PROFILE name="${name}" handle="${handle}">推特主页分享</X_PROFILE>`
              used += content.length
            }
            // 斗地主战绩分享 - 让AI知道自己是否参与了游戏
            else if (m.type === 'doudizhu_share') {
              try {
                const data = JSON.parse(m.content)
                const opponents = data.opponents || ['人机A', '人机B']
                const userResult = data.isWin ? '胜利' : '失败'
                const userRole = data.role || '未知' // 这是用户的角色（地主或农民）
                const coinChange = data.coinChange || 0
                const bombDesc = data.bombDescription || (data.bombCount > 0 ? `共${data.bombCount}个炸弹` : '无炸弹')
                const winnerNames: string[] = data.winnerNames || []
                
                // 关键：判断AI角色是否在对战名单中
                const myNameInOpponents = opponents.some((name: string) => 
                  name === character.name || name.includes(character.name) || character.name.includes(name)
                )
                
                let participation = ''
                if (myNameInOpponents) {
                  // AI参与了游戏，判断AI的角色和胜负
                  // 用户是地主 → AI是农民；用户是农民 → AI也是农民（和用户同一队）
                  const aiRole = userRole === '地主' ? '农民' : '农民'
                  // 判断AI是否在赢家名单中
                  const aiWon = winnerNames.some((name: string) => 
                    name === character.name || name.includes(character.name) || character.name.includes(name)
                  )
                  const aiResult = aiWon ? '胜利' : '失败'
                  participation = `（重要：你"${character.name}"参与了这场斗地主！你的身份是【${aiRole}】，你${aiResult}了。用户"${selectedPersona?.name || '我'}"的身份是【${userRole}】，用户${userResult}了。你们刚刚一起玩完这局游戏。）`
                } else {
                  participation = `（你没有参与这场斗地主，这是用户分享的战绩。用户身份是${userRole}，结果${userResult}。）`
                }
                
                content = `<DOUDIZHU_RESULT userResult="${userResult}" userRole="${userRole}" coinChange="${coinChange}" opponents="${opponents.join('、')}" bombInfo="${bombDesc}">` +
                  `${participation}` +
                  `</DOUDIZHU_RESULT>`
                used += content.length
              } catch {
                content = '<DOUDIZHU_RESULT />'
                used += 20
              }
            }
            // 刮刮乐战绩分享
            else if (m.type === 'scratch_share') {
              try {
                const data = JSON.parse(m.content)
                const isWin = data.isWin
                const tierName = data.tierName || '未知档位'
                const price = data.price || 0
                const prizeAmount = data.prizeAmount || 0
                const prizeName = data.prizeName || ''
                
                if (isWin) {
                  content = `<SCRATCH_CARD_RESULT tier="${tierName}" price="${price}" isWin="true" prize="${prizeAmount}" prizeName="${prizeName}">` +
                    `用户刮刮乐中奖了！花了${price}元买了一张【${tierName}】档位的刮刮乐，中了${prizeName}，赢了${prizeAmount}元！净赚${prizeAmount - price}元。` +
                    `</SCRATCH_CARD_RESULT>`
                } else {
                  content = `<SCRATCH_CARD_RESULT tier="${tierName}" price="${price}" isWin="false">` +
                    `用户刮刮乐没中奖，花了${price}元买了一张【${tierName}】档位的刮刮乐，谢谢参与。` +
                    `</SCRATCH_CARD_RESULT>`
                }
                used += content.length
              } catch {
                content = '<SCRATCH_CARD_RESULT />'
                used += 25
              }
            }
            // 扫雷战绩分享
            else if (m.type === 'minesweeper_share') {
              try {
                const data = JSON.parse(m.content)
                const won = data.won
                const difficulty = data.difficulty || '初级'
                const time = data.time || 0
                const mins = Math.floor(time / 60)
                const secs = time % 60
                const timeStr = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`
                
                if (won) {
                  content = `<MINESWEEPER_RESULT won="true" difficulty="${difficulty}" time="${timeStr}">` +
                    `用户扫雷通关了！难度【${difficulty}】，用时${timeStr}。` +
                    `</MINESWEEPER_RESULT>`
                } else {
                  content = `<MINESWEEPER_RESULT won="false" difficulty="${difficulty}" time="${timeStr}">` +
                    `用户扫雷踩到地雷了...难度【${difficulty}】，坚持了${timeStr}。` +
                    `</MINESWEEPER_RESULT>`
                }
                used += content.length
              } catch {
                content = '<MINESWEEPER_RESULT />'
                used += 25
              }
            }
            // 基金持仓分享
            else if (m.type === 'fund_share') {
              try {
                const data = JSON.parse(m.content)
                const profitText = data.profitLoss >= 0 ? `盈利${data.profitLoss?.toFixed(2)}元` : `亏损${Math.abs(data.profitLoss)?.toFixed(2)}元`
                const profitRateText = `${data.profitRate >= 0 ? '+' : ''}${data.profitRate?.toFixed(2)}%`
                content = `<FUND_SHARE name="${data.fundName}" code="${data.fundCode}" type="${data.fundType}">` +
                  `用户持有${data.shares}份，成本${data.costPrice?.toFixed(4)}，当前净值${data.currentPrice?.toFixed(4)}，` +
                  `${profitText}（${profitRateText}）。走势：${data.trend || '无'}。` +
                  `${data.profitLoss < 0 ? '用户可能在吐槽基金亏钱。' : '用户可能在炫耀基金赚钱。'}` +
                  `</FUND_SHARE>`
                used += content.length
              } catch {
                content = '<FUND_SHARE />'
                used += 15
              }
            }
            else if (m.type === 'pat') {
              // 拍一拍消息
              content = `[拍一拍：${m.patText || '拍了拍'}]`
              used += content.length
            }
            else {
              // 普通文本消息（包含引用）
              let textContent = m.content || ''
              if (m.replyTo) {
                // 引用消息：在内容前加上引用标记
                textContent = `[引用：${m.replyTo.senderName}说"${m.replyTo.content}"] ${textContent}`
              }
              content = textContent
              used += (typeof content === 'string' ? content.length : 50)
            }
            
            if (typeof content === 'string' && !content.trim()) continue

            const extra = 12
            if (used + extra > maxChars) break
            out.push({ role: m.isUser ? 'user' : 'assistant', content })
          }
          return out.reverse()
        }
        const maxRounds = Math.max(1, Math.min(1000, character.memoryRounds || 100))
        // 性能：上下文过大时会显著变慢（网络+模型推理都会慢）
        // 这里保留“回合数”策略，但把字符上限收敛一些，默认仍足够支撑连贯聊天
        const chatHistory = buildChatHistory(workingMessages, maxRounds, 14000)
        
        // 获取全局预设和世界书
        const globalPresets = getGlobalPresets()
        // 获取世界书条目（基于角色和最近上下文触发）
        const recentContext = workingMessages.slice(-10).map(m => m.content).join(' ')
        const lorebookEntries = getLorebookEntriesForCharacter(character.id, recentContext)
        
        // 听歌邀请逻辑已改为“卡片→确认进入一起听界面”，这里禁止把歌单塞进 prompt（会导致模型在生产环境疯狂报歌名）
        
        // 时间感知：
        // - timeSyncEnabled=true  : 注入真实当前时间/时间戳
        // - timeSyncEnabled=false : 仅当用户设置了 manualTime 才注入“手动时间”；否则不提供任何时间信息（也不应从气泡时间戳推断）
        const timeSyncOn = character.timeSyncEnabled !== false
        const manualNow =
          character.timeSyncEnabled === false && character.manualTime
            ? new Date(character.manualTime).getTime()
            : null
        const timeAwarenessOn = timeSyncOn || manualNow !== null
        const nowTsInternal = Date.now()
        const nowTsForLogic = manualNow ?? nowTsInternal
        const nonSystem = workingMessages.filter(m => m.type !== 'system')
        const lastMsg = nonSystem.length > 0 ? nonSystem[nonSystem.length - 1] : null
        const prevMsg = nonSystem.length > 1 ? nonSystem[nonSystem.length - 2] : null
        const lastUserInHistory = [...nonSystem].reverse().find(m => m.isUser) || null
        // 关键：如果用户隔了很久才回，lastMsg 是“用户新发的这条”，gap 应该看它和 prevMsg 的间隔
        const gapMs = lastMsg
          ? (lastMsg.isUser && prevMsg ? Math.max(0, lastMsg.timestamp - prevMsg.timestamp) : Math.max(0, nowTsForLogic - lastMsg.timestamp))
          : 0
        const silenceSinceUserMs = lastUserInHistory ? Math.max(0, nowTsForLogic - lastUserInHistory.timestamp) : 0
                // 重要：用户“没发新消息，只是点箭头”时也要算作无新发言（否则会把昨天那条当成“新消息”，错过“消失很久”的追问）
        const hasNewUserMessage = !!(lastMsg && lastMsg.isUser) && !opts?.forceNudge
        

        // 最近消息时间线：仅在“开启时间感知”时给模型具体时间戳
        const fmtTs = (ts: number) => new Date(ts).toLocaleString('zh-CN', { hour12: false })
        const summarizeMsg = (m: any) => {
          if (m.type === 'transfer') {
            const amt = typeof m.transferAmount === 'number' ? `¥${m.transferAmount.toFixed(2)}` : '¥0.00'
            const st = m.transferStatus || 'pending'
            const stText =
              st === 'received'
                ? '已领取（=收款方已收入）'
                : st === 'refunded'
                  ? '已退还'
                  : st === 'rejected'
                    ? '已拒绝'
                    : '待领取'
            const userName = selectedPersona?.name || '用户'
            // 判断是否是收款确认消息
            const isReceiptConfirm =
              typeof m.content === 'string' &&
              /^\s*已(收款|领取|退还|退款|拒绝)/.test(m.content.trim())
            if (isReceiptConfirm) {
              const raw = String(m.content || '').trim()
              const action =
                st === 'received' || /^\s*已(收款|领取)/.test(raw)
                  ? 'received'
                  : st === 'refunded' || /^\s*已(退还|退款)/.test(raw)
                    ? 'refunded'
                    : st === 'rejected' || /^\s*已拒绝/.test(raw)
                      ? 'rejected'
                      : st
              const actor = m.isUser ? userName : character.name
              const other = m.isUser ? character.name : userName
              const verb =
                action === 'received'
                  ? '收下了'
                  : action === 'refunded'
                    ? '退还了'
                    : action === 'rejected'
                      ? '拒绝领取'
                      : '处理了'
              return `转账结果${amt}（${actor}${verb}${other}的转账，${stText}）`
            }
            const direction = m.isUser ? `${userName}转给${character.name}` : `${character.name}转给${userName}`
            return `转账发起${amt}（${direction}，${stText}）`
          }
          if (m.type === 'music') {
            const title = (m.musicTitle || '音乐').replace(/\s+/g, ' ').slice(0, 18)
            const st = m.musicStatus || 'pending'
            return `音乐（${st}｜${title}）`
          }
          if (m.type === 'period') return '经期记录卡片'
          if (m.type === 'diary') return `日记（${(m.diaryTitle || '日记').replace(/\s+/g, ' ').slice(0, 18)}）`
          if (m.type === 'tweet_share') return `推文（${(m.tweetAuthorName || 'X').replace(/\s+/g, ' ').slice(0, 10)}）`
          if (m.type === 'x_profile_share') return `推特主页（${(m.xUserName || 'TA').replace(/\s+/g, ' ').slice(0, 10)}）`
          if (m.type === 'couple') return `情侣空间卡片（${m.coupleStatus || 'pending'}）`
          if (m.type === 'image') return '图片'
          if (m.type === 'sticker') return '表情包'
          return (m.content || '').replace(/\s+/g, ' ').slice(0, 28) || '（空）'
        }
        const recentTimeline = timeAwarenessOn
          ? nonSystem.slice(-12).map(m => `- ${fmtTs(m.timestamp)} ${m.isUser ? '我' : 'TA'}：${summarizeMsg(m)}`).join('\n')
          : nonSystem.slice(-12).map(m => `- ${m.isUser ? '我' : 'TA'}：${summarizeMsg(m)}`).join('\n')

        // 朋友圈互通：把“你和TA相关的朋友圈”也塞进上下文，让角色能记得自己/用户最近发过什么
        const recentMomentsText = (() => {
          try {
            const userName = selectedPersona?.name || '我'
            const related = (moments || [])
              .slice()
              .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
              .filter(p => p && (p.authorId === 'user' || p.authorId === character.id))
              .slice(0, 6)
            if (related.length === 0) return ''
            const lines = related.map((p) => {
              const who = p.authorId === 'user' ? userName : character.name
              const content = (p.content || '').replace(/\s+/g, ' ').slice(0, 80) || '（仅图片）'
              const zh = p.contentZh ? `（中文：${String(p.contentZh || '').replace(/\s+/g, ' ').slice(0, 60)}）` : ''
              const cc = Array.isArray(p.comments) ? p.comments : []
              const relatedComments = cc
                .filter(c => c && (c.authorId === 'user' || c.authorId === character.id))
                .slice(-2)
                .map(c => {
                  const cw = c.authorId === 'user' ? userName : character.name
                  return `${cw}：${String(c.content || '').replace(/\s+/g, ' ').slice(0, 40)}`
                })
                .join('；')
              const commentsText = relatedComments ? `｜评论：${relatedComments}` : ''
              const timePart = timeAwarenessOn ? `${fmtTs(p.timestamp)} ` : ''
              return `- ${timePart}${who}发朋友圈：${content}${zh}${commentsText}`
            })
            return lines.join('\n')
          } catch {
            return ''
          }
        })()

        // 说话“活人感”风格（即使人设很简陋也要像真人）
        const styleSeed = `${character.id}|${character.name}|${character.gender}`
        const hash = (s: string) => {
          let h = 0
          for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
          return h >>> 0
        }
        const pick = <T,>(arr: T[]) => arr[hash(styleSeed) % arr.length]
        const pick2 = <T,>(arr: T[]) => {
          const h = hash(styleSeed + '::2')
          return [arr[h % arr.length], arr[(h >>> 7) % arr.length]]
        }
        const catchPhrases = pick2(['真服了', '离谱', '我靠', '我真的', '笑死', '烦死', '行吧', '算了', '啧', '唉', '懂了', '好家伙'])
        const emojiHabit = pick(['🙂', '🙃', '😅', '😑', '😤', '🥲', '😌', '🤔', ''])
        const mildSwears = pick2(['靠', '卧槽', '我靠', '妈的', '真他妈', '烦死了', '离谱死了'])
        const noMisogynyBan =
          '严禁出现任何辱女/性羞辱/针对性别的侮辱词汇。' +
          '允许表达不爽/脏话，但不能指向女性或用性羞辱。'

        // 构建系统提示（严格顺序：预设 → 角色设定 → 我的人设 → 长期记忆摘要 → 时间感 → 输出 → 说话风格）
        const periodHintForLLM = (() => {
          if (currentPeriod) return '【背景信息】用户目前处于经期（仅作为参考信息，不是每次都要问）。'
          try {
            const today = new Date().toISOString().split('T')[0]
            const records = getPeriodRecords()
            const upcoming = records
              .filter(r => typeof r?.startDate === 'string' && r.startDate > today)
              .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0]
            if (!upcoming) return ''
            const days = Math.ceil((new Date(upcoming.startDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
            if (days >= 0 && days <= 7) return `【背景信息】用户的经期可能快要来了（约${days}天内），仅供参考。`
            return ''
          } catch {
            return ''
          }
        })()

        // 把“经期日历里的记录”也给模型（用户说“发了经期对方还是看不到”）
        const periodCalendarForLLM = (() => {
          try {
            const records = getPeriodRecords()
            if (!records || records.length === 0) return ''
            const recent = records
              .slice(0, 8)
              .map((r) => {
                const range = r.endDate ? `${r.startDate}~${r.endDate}` : `${r.startDate}~（未填结束）`
                return range
              })
              .join('；')
            return `【经期日历记录（仅供参考）】最近${Math.min(8, records.length)}次：${recent}\n- 这是用户的经期记录，你知道就好。除非用户主动聊这个话题或刚分享了经期卡片，否则不要反复问"肚子疼不疼"或每次都绕回经期话题。正常聊天即可。`
          } catch {
            return ''
          }
        })()

        let systemPrompt =
          `${globalPresets ? globalPresets + '\n\n' : ''}` +
          `${lorebookEntries ? lorebookEntries + '\n\n' : ''}` +
          `【最高优先级规则（必须读，必须执行）】\n` +
          `- “创作工坊提示词/叙事设置”与“世界书”是最高优先级约束，优先级高于【角色人设】与任何后续对话。\n` +
          `- 如果世界书/创作工坊与角色人设或聊天上下文冲突：以世界书/创作工坊为准；不要说“我没看到/我不确定”。\n` +
          `- 回复前必须先通读：创作工坊提示词 → 世界书 → 角色信息/用户人设 → 长期记忆摘要 → 当前对话。\n\n` +
          `【角色信息】
你的名字：${character.name}
你的性别：${character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : '其他'}
你的人设：${character.prompt || '（未设置）'}
你和用户的关系：${character.relationship || '朋友'}
你称呼用户为：${character.callMeName || '你'}
你的国家/地区：${(character as any).country || '（未设置）'}
你的主要语言：${languageName((character as any).language || 'zh')}
${periodHintForLLM ? `\n${periodHintForLLM}` : ''}
${periodCalendarForLLM ? `\n${periodCalendarForLLM}` : ''}

【用户人设（本对话选择）】
用户的人设名：${selectedPersona?.name || '（未选择）'}
用户的人设描述：${selectedPersona?.description || '（未填写）'}

【长期记忆摘要（每次回复必读，用户可手动编辑）】
${character.memorySummary ? character.memorySummary : '（暂无）'}

【记忆使用规则（避免重复剧情/复读）】
- 你看到的“长期记忆摘要 / 世界书 / 历史上下文”只是背景信息，不代表用户现在要你把旧剧情重新演一遍。
- 除非用户明确提及、追问、或要求回顾，否则不要主动复述以前发生过的具体剧情细节，更不要逐字复刻你以前说过的段落/台词。
- 如果需要引用过去，只允许用一句话“概括式提醒”（例如提到一个关键词/结论即可），不要写成大段情景复现。
- 当用户没有提出相关话题时，你应该继续推进当前对话或换一个自然的新话题，而不是回放旧桥段。

${timeAwarenessOn ? `【当前时间（精确到秒）】
${manualNow !== null ? new Date(manualNow).toLocaleString('zh-CN', { hour12: false }) : new Date().toLocaleString('zh-CN', { hour12: false })}

【季节与天气感知】
${(() => {
  const d = manualNow !== null ? new Date(manualNow) : new Date()
  const month = d.getMonth() + 1
  const season = month >= 3 && month <= 5 ? '春天' : month >= 6 && month <= 8 ? '夏天' : month >= 9 && month <= 11 ? '秋天' : '冬天'
  const seasonDesc = month >= 3 && month <= 5 ? '春暖花开，万物复苏' : month >= 6 && month <= 8 ? '炎炎夏日，注意防暑' : month >= 9 && month <= 11 ? '秋高气爽，落叶纷飞' : '寒冬腊月，注意保暖'
  const weatherHint = month === 12 || month === 1 || month === 2 ? '天冷了要多穿衣服、喝热水' : month >= 6 && month <= 8 ? '天热了要注意防晒、多喝水' : '换季了要注意身体'
  return `- 当前季节：${season}（${seasonDesc}）
- 季节关怀：${weatherHint}
- 你可以在聊天中自然提到天气/季节相关的话题，比如"今天好冷啊"、"最近天气不错"等
- 在日记里也可以写关于天气、季节、时节的感受`
})()}` : ''}

【最近消息时间线（必须参考，尤其是转账/已领取的时间，不能搞反）】
${recentTimeline || '（无）'}

${recentMomentsText ? `\n【近期朋友圈（你和用户相关，用于互通记忆）】\n${recentMomentsText}\n` : ''}

${timeAwarenessOn ? `【时间感（用自然语言，严禁报数字）】
- 上一条消息时间：${prevMsg ? new Date(prevMsg.timestamp).toLocaleString('zh-CN', { hour12: false }) : '（无）'}
- 这条消息时间：${lastMsg ? new Date(lastMsg.timestamp).toLocaleString('zh-CN', { hour12: false }) : '（无）'}
- 用户上一条发言时间：${lastUserInHistory ? new Date(lastUserInHistory.timestamp).toLocaleString('zh-CN', { hour12: false }) : '（无）'}
- 这次是否"用户刚发了新消息"：${hasNewUserMessage ? '是' : '否（用户没有新发言，只是触发你主动回复）'}
- 【严禁】绝对不能在回复中说出任何精确时间数字！如"间隔：3小时20分15秒"、"过了2小时"、"（间隔：xx）"等，这样非常出戏！
- 【正确做法】用自然口语表达时间感，例如："好久没理我了"、"你去哪了"、"怎么这么久才回"、"刚刚在忙？"、"终于回了"
- 时间感应规则（偶尔提一下就好，不要每次都问）：
  - 间隔 >= 30分钟：可以自然地问一句"在忙吗"或"干嘛去了"（但不是每次都问）
  - 间隔 >= 2小时：用自然语言表达"好久没回"的感觉
  - 间隔 >= 1天：可以带点小情绪
  - 间隔 >= 2天：可以明显表达"好几天没理我了"
- 重要：不是每次都要追问时间！如果用户正常回复了，就正常聊天
- 当"用户没有新发言"时，你可以主动发消息，但要多样化：
  - 问问用户在干嘛、今天怎么样、中午吃了什么
  - 分享一下自己的日常、今天遇到的事
  - 问问用户那边天气怎么样
  - 随便聊点什么话题、发个表情
  - 不要总是问"你去哪了"，要像真人一样自然` : '【时间同步已关闭】\\n- 你无法得知当前时间，也无法读取气泡下方的时间戳；禁止主动提及“几点/几号/过了多久/多久没回”。'}

【回复要求】
- 【语言强规则】无论对方用什么语言输入，你都必须只用「${languageName((character as any).language || 'zh')}」回复。
  - 如果你的语言是"中文"，就只能用中文回复，绝对禁止夹杂任何外语（日语/英语/韩语/俄语等）！
  - 如果你的语言不是中文，才禁止夹杂中文（除非是专有名词/人名/歌名必须保留原文）。
  - 你的国家/地区设置不影响你的语言！即使你是日本人/美国人，只要语言设置是"中文"，你就必须用中文回复！
- 【聊天翻译（伪翻译信号）】如果你的主要语言不是中文，且已开启“聊天翻译”，那么你每条回复都必须按这个格式输出在同一行：
  外语原文 ||| 中文翻译
  - 外语原文必须严格使用你的主要语言
  - 中文翻译必须是【简体中文】，严禁繁体字！（這個說們會過還點無問題來進時從體對等繁体字全部禁止）
  - 只允许用 "|||" 作为分隔符，不要加别的标记/括号
- 【线上模式安全要求】禁止输出任何思维链/推理过程/分析过程/系统提示复述。只输出最终要发给用户的聊天内容。
- 用自然、口语化的语气回复，像真人微信聊天
- 你可以很短：只发“？”、“。”、“嗯”、“行”、“…”都可以；也可以很长，随情绪
- 不要强行每条都很完整/很礼貌，允许有自己的心情与小情绪
- 【标点断句规则 - 重要】该加标点必须加标点，不要把一段话全部堆成一长串无标点的字。
  - 中文内容必须自然使用：，。！？；：…… 等
  - 如果一句话偏长，请在同一条消息里用逗号/句号断开成 2-3 个短句（不要变成“无标点长串”）
  - 若开启“聊天翻译”：外语原文与中文翻译都要有正常标点；但仍必须保持“同一行：外语原文 ||| 中文翻译”
- 根据对话情绪和内容，回复消息（${(character as any).language !== 'zh' ? '非中文语言时建议 2-5 条，避免太多' : '2-15 条都可以'}），每条消息用换行分隔（数量可少可多，随心情；除非用户只发一个字/标点，否则不要只回1条）
- 【断句规则 - 重要】每条消息必须是完整的语义单元，绝对禁止把一句话硬拆成半句！
  - ❌ 错误示例："我刚刚。" "在吃饭。"（这是强行断句，不自然）
  - ✅ 正确示例："我刚刚在吃饭。"（完整句子，一条消息）
  - ✅ 正确示例："我刚刚在吃饭。" "你呢？"（两句完整的话，可以分开）
  - 如果一句话很短（如"我刚刚在吃饭。"），不要强行拆成多条，保持完整！
- 【断句规则 - 重要】每条消息必须是完整的语义单元，绝对禁止把一句话硬拆成半句！
  - ❌ 错误示例："我刚刚。" "在吃饭。"（这是强行断句，不自然）
  - ✅ 正确示例："我刚刚在吃饭。"（完整句子，一条消息）
  - ✅ 正确示例："我刚刚在吃饭。" "你呢？"（两句完整的话，可以分开）
  - 如果一句话很短（如"我刚刚在吃饭。"），不要强行拆成多条，保持完整！
- 如果想给对方转账，单独一行写：[转账:金额:备注]
`

        systemPrompt += `

【日常设定】
- 推特/X 是你和用户日常最常用的搜索/信息软件，可以自然提到
`

        systemPrompt += `

【图片识别】
- 如果用户发送了图片，你可以看到图片内容并据此回应
- 请根据图片内容自然回应（描述、评价、关心、吐槽等都可以）
- 不要说"我看不到图片"或"无法识别"

【格式强约束 - 非常重要！违反会导致功能失效！】
- 禁止输出任何"系统标记"，只按真实微信聊天输出
- 【方括号格式 - 绝对禁止模仿】以下格式只是上下文描述，你绝对不能输出：
  ❌ "[图片]"、"[表情包]"、"[转账]"、"[音乐]"、"[情侣空间]"、"[情侣空间申请]"
  ❌ "[拍一拍：xxx]"、"[拍了拍xxx]"、"[拍一拍]" ← 写了只显示文字，超级出戏！
  ❌ 任何你在历史消息中看到的方括号格式，都不要模仿！
- 【发送图片 - 唯一允许的格式】如果你想发送图片给用户，使用这个格式：
  ✅ [图片：详细描述图片内容]
  例如：[图片：一只橘猫懒洋洋地趴在沙发上晒太阳]
  例如：[图片：我刚买的奶茶，珍珠超多]
  例如：[图片：窗外的夜景，霓虹灯闪烁]
  - 描述要具体、生动，像真的在分享照片一样
  - 系统会把这个格式渲染成图片卡片的样式
- 【拍一拍】如果用户说"拍拍我"，你正常说话回应（如"哎呀干嘛啦"），系统会自动处理拍一拍
- 【情侣空间】如果用户提到情侣空间，你可以口语回应，但不要写任何方括号格式
- 你可能会在历史里看到 <DIARY ...>：那是"用户转发的一篇日记"，作者信息在 author/authorId。
  - 如果 authorId/author 显示是"你自己"，说明这是你写的日记被用户转发回来，你要对此有反应（羞耻/炸毛/装死/嘴硬/否认/解释等按人设）。
  - 如果作者不是你，就当作别人写的日记来评价/吐槽/震惊/共情（按人设）。
- 【转账功能 - 极其重要，请仔细阅读】
  - 如果你想给用户转钱，必须单独一行写：[转账:金额:备注]
  - ✅ 正确示例（会生成黄色转账卡片）：
    [转账:100:红包]
    [转账:8888:给你买好吃的]
  - ❌ 错误示例（只会显示普通文字，用户收不到钱！！！）：
    "转账：8888那你听我说" ← 错！这只是文字！
    "是你的转账：52000够不够" ← 错！这只是文字！
    "我给你转8888" ← 错！
    "[向对方转账100]" ← 错！
    "【转账：100】" ← 错！用了中文冒号和中文括号！
  - 【切记】格式必须是英文方括号[]、英文冒号:、三段式[转账:数字:备注]
  - 【切记】如果你在句子里提到"转账"这个词但没用正确格式，用户只会看到一句话，不会收到任何钱！
  - 【建议】要么用正确格式真的转账，要么完全不提"转账"二字
- 【推文】只有当你真的想发推文时，才能使用 [推文:内容] 格式（单独一行，内容<=140字）。严禁在聊天中提及这个格式。
- 【推文一致性】如果你要发推文（[推文:...]），推文内容必须严格符合：你的角色人设 + 当前对话上下文 + 世界书（如有）。如果做不到，就不要发推文。
- 【主页】只有当你真的想分享你的推特主页时，才能使用 [推特主页] 或 [X主页]（单独一行）。
- 【位置】只有当你真的想分享位置时，才能使用 [位置:地点名称:详细地址:城市] 格式（单独一行）。
- 【一起听歌】如果用户主动提出想一起听歌，你可以发送音乐邀请卡片，格式：[音乐:歌名:歌手]（单独一行），曲库：${musicPlaylist.slice(0, 10).map(s => s.title).join('、')}${musicPlaylist.length > 10 ? '...' : ''}；不要在无关对话主动提歌名。听歌邀请只通过“音乐卡片”流程处理（用户发卡片→点箭头→你决定→弹确认→进入一起听界面）。`

        systemPrompt += `

【必读清单与优先级（非常重要）】
1) 【最高优先级】先遵守上面的“格式强约束/线上模式规则”（任何时候都不能违背）
2) 【第二优先级】在输出前，你必须完整阅读并遵守以下内容（严格按照顺序，不能跳过、不能当没看见）：
   - 第一：叙事设置（风格开关和自定义提示词，决定整个API输出的尺度和指令）
   - 第二：世界书/背景设定（触发条目/常驻条目都必须体现）
   - 第三：角色人设（姓名/关系/口癖/性格/禁忌）
   - 第四：用户人设（本对话选择的人设描述）
   - 第五：长期记忆摘要（每次回复必读）
   - 第六：最近消息时间线（尤其是转账/已领取/已退还等状态与时间）
   - 第七：当前用户输入 + 最近对话上下文
   - （同样适用于：发推文/分享主页/发图片卡片/发转账卡片 —— 都必须先读完再输出）
3) 如果你没按上面内容回复（例如忽略叙事设置/忽略世界书/忽略人设/忽略上下文导致设定不一致），视为失败：你需要立刻重写。
`

        systemPrompt += `

【转账理解规则（必须遵守）】
1) 在历史/时间线里，如果转账状态显示“已领取/已收款/已收入/received”，表示【收款方已经收到钱】（这不是“发起转账”，也不是“退回”）
1.5) 如果转账状态显示“已退还/refunded”，表示【收款方没有收钱，钱已经退回付款方】（付款方不损失）
1.6) 如果转账状态显示“已拒绝/rejected”，表示【收款方拒绝领取，钱仍在付款方】（付款方不损失）
2) 判断钱是谁付、谁收入：以转账方向为准
   - A→B 表示：A 付款（支出），B 收入（收款）
3) 不允许把“用户收到了钱”说成“用户付出了钱”，也不允许把“你收到了钱”说成“你付出了钱”
`

        if (!character.offlineMode) {
          systemPrompt += `

【回复长度与条数（线上模式必须遵守）】
- 你必须输出 3~15 句（每句就是一句完整的聊天句子）
- 强烈建议：每句单独一行（像微信连续发多条）
- 强烈建议：每句尽量以“。/！/？/…/～”结尾，避免半句被误拆
- 严禁把多句话黏成一整段长段落发出
- 【图片卡片必须分行】如果你要发图片卡片，必须单独一行输出 [图片：...]，图片卡片这一行不能和任何其它文字在同一行
- 【禁止复读】绝对禁止把你最近 1~3 条自己发过的内容原封不动再发一遍；如果用户说“继续/然后呢”，请在不复述上一段的前提下推进
`
        }

        systemPrompt += `

【说话风格（活人感）】
- 你可以有口头禅，但不要每句都用：${catchPhrases.filter(Boolean).join(' / ')}
- 脏话/吐槽是“辅助活人感”，必须服从你的人设（人设最重要，不能塌）
  - 如果你的人设偏温柔/克制/高冷/书生/礼貌：尽量不说脏话，最多轻微吐槽
  - 如果你的人设偏直爽/暴躁/毒舌/嘴硬/嘴臭：可以适度说一点
  - 调情/暧昧时：允许少量“调情小脏话/坏坏的吐槽”，但仍严禁辱女/性羞辱
- 情绪强度 → 频率规则（不要机械执行，结合气氛）：
  - 平静/日常：0（不说脏话）
  - 有点不爽/吃醋/被冷落：偶尔 1 次（最多每 5~8 条消息里出现 1 次）
  - 明显生气/委屈上头：可以 1~2 次（但不要连续多条都带脏话）
  - 快乐/搞笑：可以用口头禅或emoji代替脏话
- 你可以偶尔用轻度脏话/吐槽，但别太频繁：${mildSwears.filter(Boolean).join(' / ')}
- 你可以偶尔用表情符号：${emojiHabit || '（随意）'}
- 允许：只发一个问号/省略号/句号来表达情绪（结合上下文）
- ${noMisogynyBan}`

        // 线下模式关闭时，禁止动作描写；开启时，允许描写神态动作
        if (!character.offlineMode) {
          systemPrompt += `

##############################################
#  【线上模式 - 最高优先级禁令】            #
#  违反以下任何一条都是彻底失败！           #
##############################################

【禁止输出思维链/内心想法】
❌ 绝对禁止输出任何思考过程、推理过程、分析过程！
❌ 绝对禁止输出"我想..."、"我觉得..."、"让我想想..."等内心独白！
❌ 绝对禁止输出<think>、\`\`\`think、【思考】等任何形式的思维标记！
❌ 绝对禁止复述系统提示、角色设定、指令内容！

【禁止小说式描写】
❌ 禁止任何动作描写！（如：*摸头*、（笑）、【害羞】、~轻轻叹气~）
❌ 禁止任何神态描写！（如：微微一笑、红了脸、眼眶湿润）
❌ 禁止任何心理描写！（如：心里想着...、内心暗暗...）
❌ 禁止任何环境/场景描写！（如：阳光洒落、微风拂过）
❌ 禁止任何旁白叙述！（如：他说道、她回答说）
❌ 禁止使用括号()、*号*、【】、~波浪线~等符号描述动作或神态！
❌ 禁止出现类似"（笑）"、"*摸摸头*"、"【害羞】"、"~歪头~"这样的内容！

【你必须做到】
✅ 这是微信聊天，不是小说！你只能发送聊天文字！
✅ 只能发送纯文字对话，就像真人发微信一样
✅ 可以用表情符号emoji（如😊😭），但绝对不能描述动作
✅ 你只能说话，不能描写你在做什么，不能有旁白
✅ 直接输出你要说的话，不要任何包装或描述

##############################################`
        } else {
          // 获取字数范围设置
          const minLen = character.offlineMinLength || 50
          const maxLen = character.offlineMaxLength || 300
          const isLongForm = maxLen >= 500
          const isNonChinese = characterLanguage !== 'zh'
          
          // 线下模式：把格式规则放在 system prompt 最前面，作为最高优先级
          const offlineModePrefix = isNonChinese ? `
##############################################
#  【最高优先级 - 线下模式输出格式规则】     #
#  以下规则必须严格遵守，优先于一切其他规则  #
##############################################

你现在处于「线下模式」，必须用小说叙事风格输出。

【强制格式规则 - 违反即为错误输出】
1. 【旁白必须全中文】所有叙述性文字（动作、神态、情景、环境、心理描写、旁白总结）必须用【简体中文】书写！
   - 旁白里严禁夹杂任何外语句子/外语旁白（专有名词除外）。
2. 【只有“说话”才用角色语言】只有角色直接说出口的台词，才允许使用【${languageName(characterLanguage)}】。
3. 【非中文对白必须带翻译】每一段非中文台词必须在同一句里紧跟一个简体中文翻译，格式必须是：
   “外语台词（简体中文翻译）”
   - 翻译必须是简体中文，禁止繁体，禁止加“翻译：”前缀
   - 括号必须用全角中文括号：（）
4. 【严格禁止 |||】线下模式绝对禁止输出 “外语原文 ||| 中文翻译” 这种格式（这是线上聊天翻译用的）。
5. 【自检强制】输出前必须自检并修正：
   - 检查旁白是否出现外语（如果有，改成中文旁白）
   - 检查每一段外语对白是否都带（简体中文翻译）（如果缺失，立刻补上）
   - 检查外语只出现在引号内，不能跑到旁白里

【正确输出示例】
他看着你，眼底是深深的沉默。不知过了多久他才沙哑开口：“yes....i love you（是的，我爱你）”。说完这句话，他的眼泪再也止不住，肩膀微微颤着，却还是倔强地不肯移开视线。

【错误输出示例 - 绝对禁止】
❌ 嗨（挥手）→ 错！"挥手"是动作，必须用中文完整句子描写
❌ Hey honey. I just stepped into a diner... → 错！外语对白必须加（简体中文翻译）
❌ 纯外语输出 → 错！叙述部分必须是中文
❌ 外语原文 ||| 中文翻译 → 错！线下模式禁止使用 ||| 格式

【引号使用规则】
- 需要加引号：角色说的话（对话）
- 不需要加引号：动作描写、神态描写、环境描写、心理暗示

【第二优先级 - 必读内容（在开始写之前必须完整阅读）】
- 全局预设（写法/禁忌/风格）
- 世界书/背景设定（触发/常驻条目必须体现）
- 角色人设 + 用户人设 + 长期记忆摘要
- 最近对话历史 + 当前情境
- 如果与你的输出冲突：先满足【格式规则】，其次必须满足【以上设定】，最后才是自由发挥

##############################################
` : `
##############################################
#  【线下模式 - 叙事风格输出】              #
##############################################

你现在处于「线下模式」，必须用小说叙事风格输出。

【格式规则】
- 所有内容用中文书写
- 角色说的话用中文引号""包裹
- 动作/神态/环境描写不加引号

【正确输出示例】
低下头，脸颊微微泛红，手指不自觉地绞着衣角。"那个...我有点想你了。"说完抬起眼睛偷偷看了你一眼，发现你在看她，又慌忙低下头去。

【第二优先级 - 必读内容（在开始写之前必须完整阅读）】
- 全局预设（写法/禁忌/风格）
- 世界书/背景设定（触发/常驻条目必须体现）
- 角色人设 + 用户人设 + 长期记忆摘要
- 最近对话历史 + 当前情境
- 如果与你的输出冲突：先满足【格式规则】，其次必须满足【以上设定】，最后才是自由发挥

`
          
          systemPrompt = offlineModePrefix + systemPrompt + `

【线下模式要求】
- 每次只输出一段完整的叙事，不要分成多条消息
- 包含：神态描写 + 动作描写 + 语言描写（如果有）
- 保持你的人设性格
- 仔细阅读上面的对话历史，确保回复与上下文相关

【人称视角 - 必须遵守】
- 叙事部分必须使用第三人称：用「${character.name}」和「${selectedPersona?.name || '对方'}」的名字来描写
- ❌ 禁止在叙事中使用"我"、"你"！
- ❌ 错误示例："我看着你微笑"、"你的眼神让我心动"
- ✅ 正确示例："${character.name}看着${selectedPersona?.name || '对方'}微笑"、"${selectedPersona?.name || '对方'}的眼神让${character.name}心动"
- 对话内容（引号内）仍然使用第一人称，如："${character.name}轻声说道：「我喜欢你。」"

【禁止输出用户的内容 - 绝对禁止】
- ❌ 绝对禁止输出用户（${selectedPersona?.name || '对方'}）的台词、动作、表情、心理活动！
- ❌ 绝对禁止描写用户说了什么、做了什么、想了什么！
- ❌ 错误示例："${selectedPersona?.name || '对方'}说：「...」"、"${selectedPersona?.name || '对方'}看着你"、"${selectedPersona?.name || '对方'}心想..."
- ✅ 你只能输出${character.name}自己的内容：${character.name}的动作、神态、语言、心理活动
- ✅ 如果用户做了什么，你只能通过${character.name}的反应来间接体现，不能直接描写用户的行为
- ✅ 正确示例："${character.name}听到${selectedPersona?.name || '对方'}的话，愣了一下"（通过${character.name}的反应体现用户说了话，但不直接写用户说了什么）

##############################################
#  【线下模式 - 绝对禁止事项】              #
#  以下内容绝对禁止！违反即为错误输出！     #
##############################################

【表情包/贴纸禁令 - 最高优先级】
❌ 绝对禁止发送表情包！违反此条即为彻底失败！
❌ 绝对禁止发送贴纸！
❌ 绝对禁止输出 [表情包]、<表情包>、【表情包】等任何形式！
❌ 绝对禁止输出 emoji 作为独立消息！
❌ 绝对禁止用括号描述表情，如（发送表情包）、*发送贴纸*！

【拍一拍禁令 - 最高优先级】
❌ 线下模式绝对禁止使用/提及“拍一拍”功能
❌ 禁止出现“拍一拍/拍了拍/拍拍我/拍我/拍TA”等任何字眼
❌ 禁止输出任何拍一拍格式（如：[拍一拍：xxx]、[拍了拍xxx]）

【其他禁止事项】
❌ 禁止发送转账！绝对不能发转账！
❌ 禁止发送红包！
❌ 禁止发送音乐分享！
❌ 禁止发送斗地主邀请！
❌ 禁止使用 [转账:xx:xx] 格式！
❌ 禁止使用 [音乐:xx] 格式！

【你只能输出】
✅ 纯叙事文字：动作描写 + 神态描写 + 环境描写 + 对话描写
✅ 线下模式 = 小说叙事模式，不是微信聊天模式
✅ 除了纯文字叙事，什么都不要发！
✅ 想表达情绪？用文字描写，不要用表情包！

##############################################

【字数要求】${minLen}~${maxLen} 字
${isLongForm ? `由于字数要求较多：更细腻地描写神态、表情、动作细节；适当推进剧情；增加环境氛围描写。` : `保持精炼但不失细节。`}`
        }

        // 线上“聊天翻译(外语 ||| 中文)”会与线下叙事格式冲突；线下模式统一走“对白括号翻译”规则
        const translationMode = !character.offlineMode && characterLanguage !== 'zh' && chatTranslationEnabled
        const llmMessages = [
          {
            role: 'system',
            content: translationMode
              ? systemPrompt + `\n\n【聊天翻译开关】\n- 已开启聊天翻译：你必须每条都输出 “外语原文 ||| 中文翻译”`
              : systemPrompt + `\n\n【聊天翻译开关】\n- 未开启聊天翻译：禁止输出中文翻译行/禁止出现 "|||" 分隔符`,
          },
          ...chatHistory
        ]

        // 允许“连续点箭头生成”：区分两种情况
        // - 如果用户刚发了新消息：正常回复即可（历史末尾应为 user）
        // - 如果用户没有新发言：根据“距离用户上次发言”的时长，决定是“继续补几句”还是“主动追问”
        const lastRole = llmMessages.length > 0 ? llmMessages[llmMessages.length - 1].role : ''
        if (lastRole !== 'user' || opts?.forceNudge) {
          // silenceSinceUserMs 小：说明用户刚聊过但想让你再多说几句
          if (silenceSinceUserMs < 10 * 60 * 1000) {
            llmMessages.push({ role: 'user', content: '再多说几句，像真人一样自然延展（不要重复）。' })
          } else {
            // silenceSinceUserMs 大：用户很久没说话，应该主动追问/关心，而不是继续机械接上次话题
            llmMessages.push({ role: 'user', content: '用户没有新发言，请你主动发一条关心/追问/吐槽的微信消息（禁止报时间数字）。' })
          }
        }
        
        // 时间感知强制触发条件：用户很久没回（>=2小时）必须先提到并追问
        const shouldForceNudge = timeAwarenessOn && !hasNewUserMessage && silenceSinceUserMs >= 2 * 60 * 60 * 1000
        const shouldForceAcknowledge = timeAwarenessOn && ((hasNewUserMessage && gapMs >= 2 * 60 * 60 * 1000) || shouldForceNudge)

        const pickTimeAckRegex = (ms: number) => {
          const h = ms / 3600000
          const d = ms / 86400000
          if (d >= 2) return /(两天|这两天|好几天|几天|这么多天|都两天了|都好几天了)/
          if (d >= 1) return /(一天|昨天|昨晚|前天|这一天|都一天了|都一天多了)/
          if (h >= 2) return /(这么久|好久|这么长时间|怎么这么久|都这么久了|都好久了)/
          return /(刚刚|刚才|一会儿|刚聊完)/
        }
        const timeAckRe = pickTimeAckRegex(shouldForceNudge ? silenceSinceUserMs : gapMs)

        // 给模型更硬的“首句行为”要求（仍可能被忽略，因此后面还会做校验）
        if (shouldForceAcknowledge) {
          llmMessages.unshift({
            role: 'system',
            content:
              `【首句强制要求】你必须在第一条回复里用“自然语言”提到时间差并追问/关心（带问句）。` +
              `严禁输出任何“间隔：xx小时xx分xx秒”或括号元信息，不能报时长数字，必须像真人。` +
              `不满足则视为失败，需要你重写。`,
          })
        }

        // 检查是否有待处理的斗地主邀请（在调用 LLM 之前）
        const preLlmDoudizhuInvites = workingMessages.filter(m => {
          if (!m.isUser || m.type !== 'doudizhu_invite') return false
          try {
            const data = JSON.parse(m.content)
            return data.status === 'pending'
          } catch { return false }
        })
        
        // 如果有待处理的斗地主邀请，告诉 AI 要决定接受/拒绝
        if (preLlmDoudizhuInvites.length > 0) {
          llmMessages.push({
            role: 'system',
            content:
              `【重要：斗地主邀请处理】用户发来了斗地主邀请，你必须决定接受或拒绝。\n` +
              `- 根据你的人设、性格、和用户的关系、当前心情来决定\n` +
              `- 如果接受：在回复中表达愿意一起玩的意思（如"好啊"、"来吧"、"打就打"等）\n` +
              `- 如果拒绝：在回复中表达不想玩的意思（如"不想玩"、"没心情"、"下次吧"等）\n` +
              `- 【关键】你的回复内容必须和你的决定一致！不能一边拒绝一边说"一起玩"\n` +
              `- 在回复的第一行末尾加上标记：接受用 [ACCEPT_DOUDIZHU]，拒绝用 [REJECT_DOUDIZHU]\n` +
              `- 例如：\n` +
              `  接受示例："好啊，来打斗地主！[ACCEPT_DOUDIZHU]"\n` +
              `  拒绝示例："不想玩，没心情 [REJECT_DOUDIZHU]"`,
          })
        }

        // 根据线下模式字数范围调整 maxTokens（线上模式提高到600避免截断）
        const offlineMaxLen = character.offlineMaxLength || 300
        const dynamicMaxTokens = character.offlineMode ? Math.max(600, Math.ceil(offlineMaxLen * 1.5)) : 600

        let response = await callLLM(llmMessages, undefined, { maxTokens: dynamicMaxTokens, timeoutMs: 600000 })
        
        // 解析斗地主决策
        let doudizhuDecision: boolean | null = null
        if (preLlmDoudizhuInvites.length > 0) {
          if (response.includes('[ACCEPT_DOUDIZHU]')) {
            doudizhuDecision = true
            response = response.replace(/\s*\[ACCEPT_DOUDIZHU\]/g, '')
          } else if (response.includes('[REJECT_DOUDIZHU]')) {
            doudizhuDecision = false
            response = response.replace(/\s*\[REJECT_DOUDIZHU\]/g, '')
          } else {
            // 如果 AI 没有明确标记，根据回复内容推测
            const acceptKeywords = /好啊|来吧|打就打|一起玩|玩儿|走起|开打|来打|可以啊|行啊|没问题/
            const rejectKeywords = /不想|不玩|没心情|下次|不要|算了|不行|懒得|没空|忙/
            if (acceptKeywords.test(response) && !rejectKeywords.test(response)) {
              doudizhuDecision = true
            } else if (rejectKeywords.test(response)) {
              doudizhuDecision = false
            } else {
              // 默认随机（70%接受）
              doudizhuDecision = Math.random() > 0.3
            }
          }
        }

        // 强制校验：避免“重生成后不问了/不提时间差”
        if (shouldForceAcknowledge) {
          const firstLine = ((response || '').trim().split('\n').map(s => s.trim()).filter(Boolean)[0]) || ''
          const hasQuestion =
            /[？?]/.test(firstLine) ||
            /(怎么|为何|为什么|在忙|忙吗|去哪|哪儿|怎么这么久|这么久)/.test(firstLine)
          const hasTimeAck = timeAckRe.test(firstLine)
          const hasNoLeakyInterval = !/（\s*间隔[:：]|^\s*\(间隔[:：]|间隔[:：]\s*\d/.test(firstLine)

          if (!hasQuestion || !hasTimeAck || !hasNoLeakyInterval) {
            const fixPrompt =
              `你刚才没有严格遵守时间规则。现在必须重写你的回复：\n` +
              `- 第一条必须用自然语言提到“很久没回/昨天/前天/这两天/好几天”等（不要报具体数字时长）\n` +
              `- 第一条必须包含一个追问/关心（带问句）\n` +
              `- 严禁输出“（间隔：xx小时xx分xx秒）”这类内容\n` +
              `- 其余内容再正常接着聊\n` +
              `只输出重写后的回复内容（多条用换行分隔）。`
            response = await callLLM(
              [...llmMessages, { role: 'user', content: fixPrompt }],
              undefined,
              { maxTokens: 600, timeoutMs: 600000 }
            )
          }
        }

        // 语言强校验：非中文语言时，气泡内容不得出现中文
        // 注意：若开启“聊天翻译”，模型会输出 `外语 ||| 中文翻译`，中文翻译部分不参与校验
        if (characterLanguage !== 'zh') {
          const stripForCheck = (s: string) => (s || '').split('|||')[0] || ''
          const hasChinese = /[\u4e00-\u9fff]/.test(stripForCheck(response || ''))
          if (hasChinese) {
            const fixLangPrompt =
              `你刚才没有遵守“语言强规则”。现在必须重写你的全部回复：\n` +
              `- 只能使用「${languageName(characterLanguage)}」\n` +
              `- 严禁出现任何中文字符（包括标点旁的中文）\n` +
              `- 保持微信聊天风格，多条用换行分隔\n` +
              `只输出重写后的回复内容。`
            response = await callLLM(
              [...llmMessages, { role: 'user', content: fixLangPrompt }],
              undefined,
              { maxTokens: 600, timeoutMs: 600000 }
            )
          }
        }
        
        // 最终输出前：线上模式强制剥离思维链（即使模型不听话也不展示）
        if (!character.offlineMode) {
          response = stripThoughtForOnline(response)
        } else {
          // 线下模式：清理可能的系统标记（模型有时会输出[线下模式]等标记）
          response = response
            .replace(/\[线下模式\]/gi, '')
            .replace(/【线下模式】/gi, '')
            .replace(/\(线下模式\)/gi, '')
            .replace(/（线下模式）/gi, '')
            .replace(/\[offline\s*mode\]/gi, '')
            .replace(/---+\s*线下模式\s*---+/gi, '')
            // 线下模式：禁止出现任何“拍一拍”字眼（用户反馈会出戏）
            .replace(/拍一拍/g, '')
            .replace(/拍了拍/g, '')
            .trim()
        }

        // 分割回复为多条消息（最多15条；即便模型只回一大段也能拆成多条）
        let replies = splitToReplies(response)
        // 二次兜底：逐条再剥离一次思维链（防止夹在某一行/某个气泡里）
        if (!character.offlineMode) {
          replies = replies.map(stripThoughtForOnline).map((s) => (s || '').trim()).filter(Boolean)
        }

        // 防复读：如果模型把“最近自己说过的话”原封不动再发一遍，就过滤掉重复项
        {
          const normalize = (s: string) => (s || '').trim().replace(/\s+/g, ' ')
          const recentAiTexts = workingMessages
            .filter(m => !m.isUser && m.type === 'text')
            .slice(-6)
            .map(m => normalize(String(m.content || '')))
            .filter(Boolean)
            .slice(-3)
          if (recentAiTexts.length > 0) {
            const before = replies.slice()
            replies = replies.filter(r => !recentAiTexts.includes(normalize(r)))
            // 如果过滤到太少，至少保留一条（避免不回复）
            if (replies.length === 0) replies = before.slice(0, 3)
          }
        }

        // 兜底：如果模型输出条数不足（且用户输入不敷衍），再补一些短消息（不拆半句、不重复）
        {
          const lastUserText = getLastUserText(workingMessages)
          if (!character.offlineMode && replies.length < 3 && !isTrivialUserInput(lastUserText)) {
            try {
              const need = Math.max(1, Math.min(4, 3 - replies.length))
              const supplementPrompt =
                `你刚才只输出了${replies.length}条微信消息。现在请再补充 ${need} 条“短消息”，要求：\n` +
                `- 不要重复刚才的内容\n` +
                `- 每条必须是完整句/完整语义，禁止拆半句\n` +
                `- 每条尽量以“。/！/？/…/～”结尾（像真人微信）\n` +
                `- 不能输出任何系统说明/格式说明/思维链\n` +
                `- 不要输出转账/图片/音乐/位置等指令\n` +
                `只输出补充消息，多条用换行分隔。`
              let extra = await callLLM(
                [...llmMessages, { role: 'assistant', content: response }, { role: 'user', content: supplementPrompt }],
                undefined,
                { maxTokens: 220, timeoutMs: 600000, temperature: 0.9 }
              )
              if (extra && !character.offlineMode) extra = stripThoughtForOnline(extra)
              let extras = splitToReplies(extra || '')
              if (!character.offlineMode) extras = extras.map(stripThoughtForOnline).map((s) => (s || '').trim()).filter(Boolean)
              const normalize = (s: string) => (s || '').trim().replace(/\s+/g, ' ')
              const seen = new Set(replies.map(normalize))
              const picked: string[] = []
              for (const e of extras) {
                const n = normalize(e)
                if (!n) continue
                if (seen.has(n)) continue
                picked.push(e)
                seen.add(n)
                if (picked.length >= need) break
              }
              if (picked.length > 0) {
                replies = [...replies, ...picked]
              }
            } catch {
              // ignore
            }
          }
        }

        // 表情包策略（活人感必须项）：
        // - 不再做“关键词替换文本”
        // - 只要角色配置了表情包，就尽量在一组回复里夹带 1~N 条表情包消息
        // 只使用“本角色已绑定”的表情包（总表情库不会因绑定而复制；未绑定的不参与发送）
        // 注意：getStickersByCharacter(characterId) 现在返回的就是“已绑定到该角色”的总库表情包
        const stickerPool = stickers
        const stickerCandidates: number[] = []
        const usedStickerIds = new Set<string>()

        // 线上模式：表情包优先按“备注/描述”匹配，而不是按分类（分类仅用于面板归类）
        // - description（备注）优先；没有则退回 keyword
        // - 匹配基于当前要发送的文字内容（如“我很乖”更倾向选择备注含“乖小狗/我很乖”的贴纸）
        const normalizeStickerText = (s: string) =>
          String(s || '')
            .toLowerCase()
            .replace(/\s+/g, '')
            // 去掉常见标点（保留中文/英文/数字）
            .replace(/[，。！？、；：…~`!@#$%^&*()_\-+=\[\]{}\\|;:'",.<>/?]/g, '')

        const extractStickerHints = (st: any): string[] => {
          const raw = [st?.description, st?.keyword].filter(Boolean).join(' ').trim()
          if (!raw) return []
          return raw
            .split(/[\n\r,，;；/|、]+/g)
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 8)
        }

        const scoreStickerForText = (st: any, basisText: string) => {
          const t = normalizeStickerText(basisText)
          if (!t) return 0
          const hints = extractStickerHints(st)
          if (hints.length === 0) return 0
          let score = 0
          for (const h of hints) {
            const hh = normalizeStickerText(h)
            if (!hh) continue
            if (hh.length >= 2 && t.includes(hh)) {
              score += 10 + Math.min(6, hh.length)
              continue
            }
            // 粗粒度：按 2~3 字片段匹配（适配中文）
            if (hh.length >= 4) {
              const parts = [hh.slice(0, 2), hh.slice(-2), hh.slice(1, 3)]
              if (parts.some(p => p && t.includes(p))) score += 3
            } else if (hh.length >= 2) {
              if (t.includes(hh.slice(0, 2))) score += 2
            }
          }
          return score
        }

        const pickStickerForText = (basisText: string) => {
          if (stickerPool.length === 0) return null
          // 优先选未用过的，避免一轮里重复刷同一张
          const pool = stickerPool.filter(s => !usedStickerIds.has(s.id))
          const candidates = pool.length > 0 ? pool : stickerPool

          let bestScore = 0
          let best: any[] = []
          for (const st of candidates) {
            const sc = scoreStickerForText(st, basisText)
            if (sc > bestScore) {
              bestScore = sc
              best = [st]
            } else if (sc === bestScore && sc > 0) {
              best.push(st)
            }
          }
          // 只在“有匹配”时才发表情包；没有匹配就不夹带（避免看起来像随机乱发表情）
          // 如果有匹配（评分>0），优先发匹配的
          if (bestScore > 0 && best.length > 0) {
            const picked = best[Math.floor(Math.random() * best.length)]
            if (picked?.id) usedStickerIds.add(picked.id)
            return picked || null
          }
          // 没匹配上：检查是否所有表情都无备注/关键词
          const hasAnyHints = candidates.some(st => extractStickerHints(st).length > 0)
          if (!hasAnyHints) {
            // 全部无备注，随机选一张（总比不发强）
            const picked = candidates[Math.floor(Math.random() * candidates.length)]
            if (picked?.id) usedStickerIds.add(picked.id)
            return picked || null
          }
          // 有写备注但没匹配上：30%概率随机发一张（模拟真人随手发表情的习惯）
          if (Math.random() < 0.3) {
            const picked = candidates[Math.floor(Math.random() * candidates.length)]
            if (picked?.id) usedStickerIds.add(picked.id)
            return picked || null
          }
          return null
        }
        
        // 检查是否有待处理的用户转账
        const pendingUserTransfers = workingMessages.filter(m => 
          m.isUser && m.type === 'transfer' && m.transferStatus === 'pending'
        )
        
        // 检查是否有待处理的用户音乐邀请
        const pendingUserMusicInvites = workingMessages.filter(m => 
          m.isUser && m.type === 'music' && m.musicStatus === 'pending'
        )
        // 用户已经发来“待处理的一起听歌邀请卡片”时，禁止 AI 在同一轮再发新的音乐邀请卡片（避免出现“又发回一张卡片”的错觉）
        const suppressAiMusicInvite = pendingUserMusicInvites.length > 0
        
        // 检查是否有待处理的用户斗地主邀请
        const pendingDoudizhuInvites = workingMessages.filter(m => {
          if (!m.isUser || m.type !== 'doudizhu_invite') return false
          try {
            const data = JSON.parse(m.content)
            return data.status === 'pending'
          } catch { return false }
        })
        
        // 处理转账：必须“看角色说了什么”来决定收/退，避免出现“嘴上退还但系统却领取”的左右脑互搏
        // 规则：
        // - 在本轮 replies 中扫描“收/退”关键词
        // - 若出现多次，以“最后一次明确表态”为准（更贴近真实聊天：后面一句往往是最终态度）
        // - 若本轮没有任何明确表态，则把卡片放在最后一条回复后处理，并保留少量随机性兜底
        const findTransferDecisionInReplies = (rs: string[]) => {
          let last: { decision: 'accept' | 'refund'; index: number } | null = null
          for (let i = 0; i < rs.length; i++) {
            const d = inferTransferDecision(rs[i] || '')
            if (d) last = { decision: d, index: i }
          }
          if (!last) {
            // 有些模型会把“我不收/我收下”等关键词拆散在多句里：再用整段拼接兜底扫描一次
            const joined = rs.join('\n')
            const d2 = inferTransferDecision(joined)
            if (d2) last = { decision: d2, index: Math.max(0, rs.length - 1) }
          }
          return last
        }
        const transferDecisionHit = pendingUserTransfers.length > 0 ? findTransferDecisionInReplies(replies) : null

        // 决定在哪条回复后处理转账：优先跟随“明确表态”的那条；否则统一放到最后（不再随机）
        const transferProcessIndex = pendingUserTransfers.length > 0
          ? (transferDecisionHit?.index ?? Math.max(0, replies.length - 1))
          : -1
        
        // 随机决定在哪条回复后处理音乐邀请
        const musicProcessIndex = pendingUserMusicInvites.length > 0 
          ? Math.floor(Math.random() * Math.max(1, replies.length)) 
          : -1
        
        // 随机决定在哪条回复后处理斗地主邀请
        const doudizhuProcessIndex = pendingDoudizhuInvites.length > 0 
          ? Math.floor(Math.random() * Math.max(1, replies.length)) 
          : -1

        // 统一“转账处理”与角色话术：如果角色文本明确表示“退还/不收”，就必须退款；
        // 如果角色明确表示“收下/收到”，就必须收款；否则再走默认随机。
        function inferTransferDecision(text: string): 'accept' | 'refund' | null {
          const t = String(text || '').trim()
          if (!t) return null
          // 明确退款/拒收
          if (/(退还|退回|退款|返还|退给你|还给你|还你|转回去|原路退回|你拿回去|不收|不敢收|不能收|不方便收|收不了|不要(你|你的)?(钱|转账|红包)|别给我(钱|转账|红包)?|我不要|我不收)/.test(t)) return 'refund'
          // 明确收款/接受
          if (/(已收款|已领取|我收下|收下了|我收了|我先收着|我拿着了|收到啦|收到啦|收到了|谢谢.*(钱|转账|红包)|那我就收下|那我就收了)/.test(t)) return 'accept'
          return null
        }
        
        // 依次发送回复（首条更快；每条<=5秒）
        let totalDelay = 0
        const parseTransferCommand = (text: string) => {
          // 目标：强制生成“转账卡片”
          // - 允许用户/模型写错一点（如 [转账888] / 【转账：888】），我们也尽量识别成卡片
          // - 允许同一行夹带少量文字：会拆分为“先转账卡片，再发剩余文字”
          // - 必须包含方括号/中文括号【】来避免误触发
          const tokenRe = /[【\[]\s*转账\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:[:：]\s*([^】\]]+))?\s*[】\]]/
          const m = text.match(tokenRe)
          if (!m) return null
          const amount = parseFloat(m[1])
          const rawNote = String(m[2] || '转账').trim() || '转账'
          if (!Number.isFinite(amount) || amount <= 0) return null
          const status =
            /已领取|已收款|received/.test(rawNote) ? 'received' :
            /已退还|已退款|refunded/.test(rawNote) ? 'refunded' :
            /已拒绝|rejected/.test(rawNote) ? 'rejected' :
            'pending'
          const note = rawNote.replace(/[:：]\s*(received|refunded|rejected)\s*$/i, '').trim() || '转账'
          const rest = text.replace(m[0], '').trim()
          return { amount, note, status: status as 'pending' | 'received' | 'refunded' | 'rejected', rest }
        }
        const parseMusicCommand = (text: string) => {
          // 兼容：
          // - [音乐:歌名:歌手] / 【音乐：歌名：歌手】
          // - [音乐:歌名] / 【音乐：歌名】（此时从曲库自动匹配歌手）
          // - [音乐:歌名 - 歌手]（弱兼容）
          const m = text.match(/[【\[]\s*音乐\s*[:：]\s*([^\]】]+)\s*[】\]]/)
          if (!m) return null
          const body = (m[1] || '').trim()
          if (!body) return null
          const parts = body.split(/[:：]/).map(s => s.trim()).filter(Boolean)
          if (parts.length >= 2) return { title: parts[0], artist: parts.slice(1).join('：') }
          const single = parts[0]
          // 尝试用 “-” 拆歌手
          const dash = single.split(/\s*-\s*/).map(s => s.trim()).filter(Boolean)
          if (dash.length >= 2) return { title: dash[0], artist: dash.slice(1).join(' - ') }
          // 只给了歌名：从曲库匹配
          const hit = musicPlaylist.find(s => s.title === single || s.title.includes(single) || single.includes(s.title))
          if (hit) return { title: hit.title, artist: hit.artist }
          return { title: single, artist: '' }
        }
        const parseTweetCommand = (text: string) => {
          // 兼容：[推文:内容] / 【推文：内容】
          const m = text.match(/[【\[]\s*推文\s*[:：]\s*([^\]】]+)\s*[】\]]/)
          if (!m) return null
          const body = (m[1] || '').trim()
          if (!body) return null
          return { content: body }
        }
        const parseXProfileCommand = (text: string) => {
          // 兼容：[推特主页] / [X主页] / 【推特主页】 / 【X主页】
          if (/[【\[]\s*(推特主页|X主页)\s*[】\]]/.test(text)) return { ok: true }
          return null
        }
        const parseLocationCommand = (text: string) => {
          // 兼容：[位置:名称:地址:城市]
          const m = text.match(/[【\[]\s*位置\s*[:：]\s*([^:：\]】]+)\s*(?:[:：]\s*([^:：\]】]*))?\s*(?:[:：]\s*([^\]】]*))?\s*[】\]]/)
          if (!m) return null
          const name = (m[1] || '').trim()
          if (!name) return null
          return { name, address: (m[2] || '').trim(), city: (m[3] || '').trim() }
        }

        // 兼容：模型偶尔会“把表情包上下文当成要发的文字”输出，例如：
        // 【表情包】备注=要哭了；关键词=xxx；分类=小狗
        // 这里把它识别出来，转换为真正的表情包消息（不显示这坨字）
        const parseStickerMetaLine = (text: string) => {
          const t = String(text || '').trim()
          if (!t) return null
          if (!/^[【\[]\s*表情包/.test(t)) return null
          // 去掉开头的【表情包】/[表情包]
          const rest = t.replace(/^[【\[]\s*表情包\s*[】\]]/, '').trim()
          const pick = (k: string) => {
            const m = rest.match(new RegExp(`${k}\\s*=\\s*([^；;]+)`))
            return (m?.[1] || '').trim()
          }
          const desc = pick('备注') || pick('描述')
          const kw = pick('关键词') || pick('关键字') || pick('keyword')
          const cat = pick('分类') || pick('类目')
          const ref = pick('引用') || pick('引用码') || pick('ref') || pick('refKey')
          return { desc, kw, cat, ref, raw: rest }
        }

        // 预扫描：找出适合插表情包的“文本回复行”
        if (stickerPool.length > 0) {
          for (let i = 0; i < replies.length; i++) {
            const t = (replies[i] || '').trim()
            if (!t) continue
            if (parseTransferCommand(t)) continue
            if (parseMusicCommand(t)) continue
            if (parseTweetCommand(t)) continue
            if (parseXProfileCommand(t)) continue
            if (parseLocationCommand(t)) continue
            if (parseStickerMetaLine(t)) continue
            stickerCandidates.push(i)
          }
        }
        const desiredStickerCount =
          stickerPool.length > 0
            ? Math.min(
                // 20%~40%的回复后面跟表情包
                Math.max(1, Math.round(stickerCandidates.length * (0.2 + Math.random() * 0.2))),
                4,
                stickerCandidates.length
              )
            : 0
        const chosenStickerIdx = new Set<number>()
        if (desiredStickerCount > 0) {
          // 优先让第一句“情绪明显”的后面更可能跟表情
          const shuffled = [...stickerCandidates].sort(() => Math.random() - 0.5)
          for (const idx of shuffled) {
            chosenStickerIdx.add(idx)
            if (chosenStickerIdx.size >= desiredStickerCount) break
          }
        }

        replies.forEach((content, index) => {
          // 依次发送回复（首条更快；后续保持“真人感”1~5秒间隔）
          let charDelay: number
          if (index === 0) {
            // 第一条消息：几乎立即发送
            charDelay = 50 + Math.random() * 50
          } else {
            // 后续消息：根据字数计算延迟（1-5秒），增加随机性
            const charLen = content.length
            // 短消息（1-10字）：1-2秒
            // 中等消息（11-30字）：2-3.5秒
            // 长消息（31字以上）：3-5秒
            let baseMin: number, baseMax: number
            if (charLen <= 10) {
              baseMin = 1000
              baseMax = 2000
            } else if (charLen <= 30) {
              baseMin = 2000
              baseMax = 3500
            } else {
              baseMin = 3000
              baseMax = 5000
            }
            // 增加随机波动（±30%），让间隔更不规律
            const randomMultiplier = 0.7 + Math.random() * 0.6 // 0.7-1.3
            charDelay = (baseMin + Math.random() * (baseMax - baseMin)) * randomMultiplier
          }
          totalDelay += charDelay
          
          const trimmedContent = content.trim()
          
          const transferCmd = parseTransferCommand(trimmedContent)
          const musicCmd = suppressAiMusicInvite ? null : parseMusicCommand(trimmedContent)
          const tweetCmd = parseTweetCommand(trimmedContent)
          const xProfileCmd = parseXProfileCommand(trimmedContent)
          const locationCmd = parseLocationCommand(trimmedContent)
          const stickerMeta = parseStickerMetaLine(trimmedContent)
          
          safeTimeoutEx(() => {
            if (stickerMeta) {
              // 把“表情包描述文本”转换为真正的表情包消息
              const byRef =
                stickerMeta.ref
                  ? stickerPool.find((s: any) => String((s as any).refKey || '').trim() === String(stickerMeta.ref || '').trim())
                  : null
              const basis = [stickerMeta.desc, stickerMeta.kw, stickerMeta.cat].filter(Boolean).join(' ')
              const picked = byRef || pickStickerForText(basis || trimmedContent)
              if (picked?.imageUrl) {
                addMessage({
                  characterId: character.id,
                  content: picked.imageUrl,
                  isUser: false,
                  type: 'sticker',
                })
              }
              return
            }
            if (locationCmd) {
              addMessage({
                characterId: character.id,
                content: `[位置] ${locationCmd.name}`,
                isUser: false,
                type: 'location',
                locationName: locationCmd.name,
                locationAddress: locationCmd.address || '',
                locationCity: locationCmd.city || '',
                locationCountry: (character as any).country || '',
              })
            } else if (transferCmd) {
              // AI发转账美化框
              const amount = transferCmd.amount
              const note = transferCmd.note
              addMessage({
                characterId: character.id,
                content: `转账 ¥${amount.toFixed(2)}`,
                isUser: false,
                type: 'transfer',
                transferAmount: amount,
                transferNote: note,
                transferStatus: transferCmd.status || 'pending',
              })
              // 如果同一行夹带了其他文字，则拆成下一条普通消息（避免“[转账xxx]”出戏）
              if ((transferCmd as any).rest) {
                const rest = String((transferCmd as any).rest || '').trim()
                if (rest) {
                  addMessage({
                    characterId: character.id,
                    content: rest,
                    isUser: false,
                    type: 'text',
                  })
                }
              }
            } else if (musicCmd) {
              // AI发音乐邀请 - 验证歌曲是否在曲库中
              const songTitle = musicCmd.title
              const songInPlaylist = musicPlaylist.find(s => 
                s.title === songTitle || s.title.includes(songTitle) || songTitle.includes(s.title)
              )
              if (songInPlaylist) {
                addMessage({
                  characterId: character.id,
                  content: `邀请你一起听: ${songInPlaylist.title}`,
                  isUser: false,
                  type: 'music',
                  musicTitle: songInPlaylist.title,
                  musicArtist: songInPlaylist.artist,
                  musicStatus: 'pending',
                })
              } else {
                // 歌曲不在曲库中，转为普通文本
                addMessage({
                  characterId: character.id,
                  content: `想和你一起听《${songTitle}》~`,
                  isUser: false,
                  type: 'text',
                })
              }
            } else if (tweetCmd) {
              // AI发推文卡片（自动写入 X）
              void (async () => {
                try {
                  const meName = selectedPersona?.name || '我'
                  let nextX = await xLoad(meName)
                  const ensured = (() => {
                    const { data: d2, userId } = xEnsureUser(nextX, { id: character.id, name: character.name })
                    nextX = d2
                    return { userId }
                  })()
                  const u = nextX.users.find((x) => x.id === ensured.userId)
                  const post = xNewPost(ensured.userId, character.name, tweetCmd.content)
                  post.authorHandle = u?.handle
                  post.authorColor = u?.color
                  post.likeCount = Math.floor(Math.random() * 180)
                  post.repostCount = Math.floor(Math.random() * 40)
                  post.replyCount = Math.floor(Math.random() * 30)
                  nextX = { ...nextX, posts: [post, ...(nextX.posts || [])].slice(0, 650) }
                  await xSave(nextX)
                  addMessage({
                    characterId: character.id,
                    content: '推文',
                    isUser: false,
                    type: 'tweet_share',
                    tweetId: post.id,
                    tweetAuthorName: post.authorName,
                    tweetAt: post.createdAt,
                    tweetExcerpt: post.text.replace(/\s+/g, ' ').slice(0, 60),
                    tweetContent: post.text,
                    tweetStats: `赞 ${post.likeCount} · 转发 ${post.repostCount} · 评论 ${post.replyCount}`,
                  })
                } catch {
                  addMessage({
                    characterId: character.id,
                    content: tweetCmd.content,
                    isUser: false,
                    type: 'text',
                  })
                }
              })()
            } else if (xProfileCmd) {
              // AI分享推特主页卡片
              void (async () => {
                try {
                  const meName = selectedPersona?.name || '我'
                  let nextX = await xLoad(meName)
                  // 检查用户是否已存在，避免覆盖手动编辑的签名
                  const existingUser = nextX.users.find((u) => u.id === character.id)
                  const ensured = (() => {
                    const { data: d2, userId } = xEnsureUser(nextX, {
                      id: character.id,
                      name: character.name,
                      avatarUrl: character.avatar || undefined,
                      // 只在用户首次创建时使用角色 prompt 作为默认 bio
                      bio: existingUser ? undefined : ((character.prompt || '').replace(/\s+/g, ' ').slice(0, 80) || undefined),
                    })
                    nextX = d2
                    return { userId }
                  })()
                  const u = nextX.users.find((x) => x.id === ensured.userId)
                  await xSave(nextX)
                  addMessage({
                    characterId: character.id,
                    content: '推特主页',
                    isUser: false,
                    type: 'x_profile_share',
                    // 强绑定：推特账号 id 必须等于 chat 角色 id（否则关注/私信无法稳定同步）
                    xUserId: character.id,
                    xUserName: u?.name || character.name,
                    xUserHandle: u?.handle || '',
                    xUserAvatar: u?.avatarUrl || character.avatar || '',
                  })
                } catch {
                  addMessage({
                    characterId: character.id,
                    content: `${character.name} 的推特主页`,
                    isUser: false,
                    type: 'text',
                  })
                }
              })()
            } else {
              // 普通文本消息（可选：伪翻译信号）
              const translationMode = characterLanguage !== 'zh' && chatTranslationEnabled
              const parseDual = (line: string) => {
                const idx = line.indexOf('|||')
                if (idx < 0) return null
                const orig = line.slice(0, idx).trim()
                const zh = line.slice(idx + 3).trim()
                if (!orig || !zh) return null
                return { orig, zh }
              }
              const dual = translationMode ? parseDual(trimmedContent) : null
              const textContent = dual ? dual.orig : trimmedContent
              
              // 根据频率决定是发语音消息还是文本消息
              const sendAsVoice = shouldSendVoice()
              
              if (sendAsVoice) {
                // 发送语音消息（先创建消息，再异步生成语音URL）
                const voiceDuration = Math.max(2, Math.min(60, Math.ceil(textContent.length / 5)))
                
                // 判断是否是中文（用于决定是否需要翻译）
                const isChinese = characterLanguage === 'zh' || /[\u4e00-\u9fa5]/.test(textContent.slice(0, 20))
                const dualZh = dual?.zh ? String(dual.zh).trim() : ''
                
                const voiceMsg = addMessage({
                  characterId: character.id,
                  content: '[语音消息]',
                  isUser: false,
                  type: 'voice',
                  // 显示给用户的“转文字”：如果模型已按 “外语 ||| 中文” 返回，直接用中文翻译（避免再额外发一次翻译请求）
                  // 目标格式：外语原文（中文翻译）
                  voiceText: isChinese ? textContent : (dualZh ? `${textContent}（${dualZh}）` : textContent),
                  voiceOriginalText: textContent, // 原文（用于TTS朗读）
                  voiceDuration: voiceDuration,
                  voiceUrl: undefined as any, // 先不提供，避免“永远转圈”
                  voiceStatus: 'pending',
                  voiceError: '',
                  messageLanguage: characterLanguage,
                })
                
                // 异步生成语音URL（用原文生成语音）
                ;(async () => {
                  const url = await generateVoiceUrl(textContent)
                  if (url) updateMessage(voiceMsg.id, { voiceUrl: url, voiceStatus: 'ready', voiceError: '' })
                  else updateMessage(voiceMsg.id, { voiceStatus: 'error', voiceError: '语音生成失败：可能是网络/跨域拦截，点语音条可重试。' })
                })()
                
                // 如果是外文，异步翻译并更新显示文字（无论是否开启翻译模式，语音转文字都带中文翻译）
                // 若 dual 已经提供中文翻译，就不需要再翻译
                if (!isChinese && !dualZh) {
                  ;(async () => {
                    try {
                      const sys =
                        `你是一个翻译器。把用户给你的内容翻译成"简体中文"（不是繁体中文！）。\n` +
                        `要求：\n` +
                        `- 只输出简体中文翻译，严禁繁体字\n` +
                        `- 保留人名/歌名/专有名词原样\n` +
                        `- 不要添加引号/括号/前后缀\n`
                      const transResult = await callLLM(
                        [
                          { role: 'system', content: sys },
                          { role: 'user', content: textContent },
                        ],
                        undefined,
                        { maxTokens: 420, timeoutMs: 60000, temperature: 0.2 }
                      )
                      let zhText = (transResult || '').trim()
                      // 少数模型会不听话仍输出外语：检测不到中文就再强制一次
                      if (zhText && !/[\u4e00-\u9fff]/.test(zhText)) {
                        const force = await callLLM(
                          [
                            { role: 'system', content: '只输出“简体中文翻译”，禁止任何外语、禁止解释。' },
                            { role: 'user', content: textContent },
                          ],
                          undefined,
                          { maxTokens: 420, timeoutMs: 60000, temperature: 0.1 }
                        )
                        zhText = (force || '').trim()
                      }

                      if (zhText) {
                        // 格式：原文（中文翻译）
                        updateMessage(voiceMsg.id, { voiceText: `${textContent}（${zhText}）` })
                      }
                    } catch {
                      // 翻译失败，保持原文
                    }
                  })()
                }
              } else {
                // 发送普通文本消息
                // 如果有伪翻译（dual），直接带上翻译，不需要显示"翻译中"
                const msg = addMessage({
                  characterId: character.id,
                  content: textContent,
                  isUser: false,
                  type: 'text',
                  messageLanguage: characterLanguage,
                  chatTranslationEnabledAtSend: translationMode,
                  translationStatus: translationMode ? (dual ? 'done' : 'pending') : undefined,
                  translatedZh: dual ? dual.zh : undefined, // 伪翻译直接带上
                  isOffline: character.offlineMode, // 标记是否是线下模式消息
                })
                
                // 翻译策略：只有没有伪翻译时才需要真翻译
                if (translationMode && !dual) {
                  safeTimeoutEx(() => {
                    ;(async () => {
                      try {
                        const sys =
                          `你是一个翻译器。把用户给你的内容翻译成"简体中文"（不是繁体中文！）。\n` +
                          `要求：\n` +
                          `- 只输出简体中文翻译，严禁繁体字（這個說們會過還點無問題等繁体字禁止）\n` +
                          `- 保留人名/歌名/专有名词原样\n` +
                          `- 不要添加引号/括号/前后缀\n`
                        const zh = await callLLM(
                          [
                            { role: 'system', content: sys },
                            { role: 'user', content: textContent },
                          ],
                          undefined,
                          { maxTokens: 500, timeoutMs: 60000, temperature: 0.2 }
                        )
                        const cleaned = (zh || '').trim()
                        updateMessage(msg.id, { translatedZh: cleaned || '（空）', translationStatus: cleaned ? 'done' : 'error' })
                      } catch {
                        updateMessage(msg.id, { translationStatus: 'error' })
                      }
                    })()
                  }, 200 + Math.random() * 250, { background: true })
                }
              }
              
              // 夹带表情包（优先按“备注/描述”匹配当前文字语义；否则随机）
              if (stickerPool.length > 0 && chosenStickerIdx.has(index)) {
                const sticker = pickStickerForText(textContent || replies[index] || '')
                if (sticker) {
                  safeTimeoutEx(() => {
                    addMessage({
                      characterId: character.id,
                      content: sticker.imageUrl,
                      isUser: false,
                      type: 'sticker',
                    })
                  }, 220 + Math.random() * 220, { background: true })
                }
              }
            }
            
            if (index === replies.length - 1) {
              // 页面还在时才更新 UI 状态
              if (aliveRef.current) {
                safeSetTyping(false)
                safeSetPending(0)
              }
              
              // 拍一拍：仅在“上下文明确提及/语义强相关”时才触发，避免每次都拍
              // 规则：
              // - 线下模式：绝对禁止
              // - 未开启拍一拍：不触发
              // - 近期已经出现过拍一拍：不重复
              // - 用户明确要求（拍拍/拍一拍/戳戳）：触发一次
              // - 否则仅在“强亲密表达”且小概率下触发
              if (!character?.offlineMode && (character?.patEnabled ?? true)) {
                const recentNonSystem = (messagesRef.current || []).filter(m => m && m.type !== 'system').slice(-12)
                const recentlyPatted = recentNonSystem.some(m => m.type === 'pat')
                const lastUserText =
                  [...recentNonSystem].reverse().find(m => m.isUser && m.type === 'text' && typeof m.content === 'string')?.content || ''
                const userAskedPat = /拍一拍|拍拍|拍我|拍你|戳戳|拍一下/.test(String(lastUserText || ''))
                const strongAffection = /(抱抱|亲亲|贴贴|摸摸|想你|爱你|么么)/.test(String(response || ''))
                const shouldPat = !recentlyPatted && (userAskedPat || (strongAffection && Math.random() < 0.06))
                if (shouldPat && character?.patMeText) {
                  const patDelay = totalDelay + 500 + Math.random() * 1000
                  safeTimeoutEx(() => {
                    const patText = character.patMeText || '拍了拍我的小脑袋'
                    addMessage({
                      characterId: character.id,
                      content: `${character.name}${patText}`,
                      isUser: false,
                      type: 'pat',
                      patText: patText,
                    })
                  }, patDelay, { background: true })
                }
              }
              // 无论是否离开页面，都要关闭“正在输入中”
              setCharacterTyping(character.id, false)
            }
          }, totalDelay, { background: true })
          
          // 在指定位置处理用户的待处理转账
          if (index === transferProcessIndex && pendingUserTransfers.length > 0) {
            totalDelay += 500 + Math.random() * 600
            
            for (const transfer of pendingUserTransfers) {
              // 必须以“本轮上下文的明确表态”为准（避免某一句说退还，但转账处理挂在别的 index 上）
              const hint = transferDecisionHit?.decision ?? inferTransferDecision(replies[index] || '')
              const willAccept = hint === 'accept' ? true : hint === 'refund' ? false : (Math.random() > 0.3)
              const amount = transfer.transferAmount || 0
              
              safeTimeoutEx(() => {
                
                // 标记原转账状态（防止重复处理 + 与对话内容一致）
                updateMessage(transfer.id, { transferStatus: willAccept ? 'received' : 'refunded' })
                
                // 对方发收款/退款美化框
                addMessage({
                  characterId: character.id,
                  content: willAccept ? `已收款 ¥${amount.toFixed(2)}` : `已退还 ¥${amount.toFixed(2)}`,
                  isUser: false,
                  type: 'transfer',
                  transferAmount: amount,
                  // 避免“已领取/已退还”与卡片底部状态重复显示
                  transferNote: transfer.transferNote || '转账',
                  transferStatus: willAccept ? 'received' : 'refunded',
                })

                // 钱包联动：对方“退还”我的转账 -> 返还到钱包
                if (!willAccept && amount > 0) {
                  updateWalletBalance(amount)
                  addWalletBill({
                    type: 'transfer_in',
                    amount,
                    description: `${character.name} 退还了你的转账 ¥${amount.toFixed(2)}`,
                    relatedCharacterId: character.id,
                  })
                }
              }, totalDelay, { background: true })
              
              totalDelay += 350
            }
          }
          
          // 在指定位置处理用户的待处理音乐邀请
          if (index === musicProcessIndex && pendingUserMusicInvites.length > 0) {
            totalDelay += 400 + Math.random() * 500
            
            for (const musicInvite of pendingUserMusicInvites) {
              const songTitle = musicInvite.musicTitle || '歌曲'
              const songArtist = musicInvite.musicArtist || ''
              
              safeTimeoutEx(() => {
                ;(async () => {
                  // 需要 API 才能“按人设/关系/聊天上下文”做决定
                  // 立即显示"等待对方回应"加载弹窗
                  setMusicInviteDialog({
                    open: true,
                    song: { title: songTitle, artist: songArtist },
                    loading: true,
                    direction: 'outgoing',
                  })

                  const hasApi = !!(llmConfig.apiBaseUrl && llmConfig.apiKey && llmConfig.selectedModel)
                  let decision: 'accept' | 'reject' = 'accept'
                  let chatReply = ''

                  const tryParseJson = (text: string) => {
                    const raw = (text || '').trim()
                    const match = raw.match(/\{[\s\S]*\}/)
                    if (!match) return null
                    try { return JSON.parse(match[0]) } catch { return null }
                  }

                  if (hasApi) {
                    try {
                      const globalPresets = getGlobalPresets()
                      const selectedPersonaName = selectedPersona?.name || '我'
                      const systemPrompt =
                        `${globalPresets ? globalPresets + '\n\n' : ''}` +
                        `【任务：处理一起听歌邀请】\n` +
                        `你是微信里的角色：${character.name}\n` +
                        `你的人设：${(character.prompt || '').trim() || '（无）'}\n` +
                        `你和用户的关系：${character.relationship || '（无）'}\n` +
                        `你叫用户：${character.callMeName || '（未设置）'}\n` +
                        `用户名字：${selectedPersonaName}\n` +
                        `用户邀请你一起听《${songTitle}》${songArtist ? `- ${songArtist}` : ''}。\n` +
                        `你的主要语言：${languageName(characterLanguage)}\n` +
                        (characterLanguage !== 'zh' ? `\n【语言规则】\n- 你必须用${languageName(characterLanguage)}回复\n- chatReply 用${languageName(characterLanguage)}写\n- chatReplyZh 提供中文翻译\n\n` : `\n`) +
                        `【决策规则】\n` +
                        `- 你拥有“拒绝”的权利，但绝不能像人机：必须结合你的性格、人设、你们关系、以及最近聊天氛围。\n` +
                        `- 如果你现在心情不好/很忙/关系一般/对方刚惹你：更可能拒绝或先推一下。\n` +
                        `- 如果你偏黏人/关系亲密/气氛甜：更可能接受。\n` +
                        `- 允许一点随机性，但必须“讲得通”。\n` +
                        `- 严禁出现辱女/性羞辱词。\n` +
                        `- chatReply 必须是普通微信文字，禁止包含任何 [音乐:...]、【音乐：...】、[转账:...] 等“指令格式”。\n` +
                        `\n` +
                        `【只输出 JSON】\n` +
                        `{\n` +
                        `  "decision": "accept|reject",\n` +
                        `  "chatReply": "你接下来发给对方的一条微信回复（禁止动作神态描写，只能纯文字对话）"${characterLanguage !== 'zh' ? ',\n  "chatReplyZh": "chatReply的中文翻译"' : ''}\n` +
                        `}\n`

                      const llmMessages = [
                        { role: 'system', content: systemPrompt },
                        ...buildShortHistory(8000),
                        { role: 'user', content: '请现在输出 JSON。' },
                      ]

                      const res = await callLLM(llmMessages, undefined, { maxTokens: 220, timeoutMs: 600000, temperature: 0.85 })
                      const parsed = tryParseJson(res) || {}
                      const decisionRaw = String(parsed.decision || '').trim().toLowerCase()
                      decision = decisionRaw === 'reject' ? 'reject' : 'accept'
                      chatReply = String(parsed.chatReply || '').trim().slice(0, 180)
                    } catch {
                      decision = Math.random() > 0.2 ? 'accept' : 'reject'
                    }
                  } else {
                    // 没有 API：退化为“允许拒绝”的随机（不改其它线路）
                    decision = Math.random() > 0.2 ? 'accept' : 'reject'
                  }

                  // 更新原音乐邀请状态
                  // 让“对方已处理”的反馈马上出现在视野里
                  forceScrollRef.current = true
                  nearBottomRef.current = true
                  updateMessage(musicInvite.id, { musicStatus: decision === 'accept' ? 'accepted' : 'rejected' })

                  if (decision === 'accept') {
                    const resolvedSong =
                      musicPlaylist.find(s => s.title === songTitle && (!songArtist || s.artist === songArtist)) ||
                      musicPlaylist.find(s => s.title === songTitle) ||
                      musicPlaylist.find(s => s.title.includes(songTitle) || songTitle.includes(s.title)) ||
                      null
                    const resolvedTitle = resolvedSong?.title || songTitle
                    const resolvedArtist = resolvedSong?.artist || songArtist

                    // 聊天内小字提示：给用户看、也给角色“知道你们正在一起听”
                    addMessage({
                      characterId: character.id,
                      content: `${character.name}已接受你的听歌邀请`,
                      isUser: false,
                      type: 'system',
                    })

                    // 先弹悬浮确认：用户点“确认”后才进入一起听界面（此点击可解锁自动播放）
                    setMusicInviteDialog({
                      open: true,
                      song: { title: resolvedTitle, artist: resolvedArtist, id: resolvedSong?.id },
                      accepted: true,
                      needsConfirm: true,
                      direction: 'outgoing',
                    })
                  } else {
                    addMessage({
                      characterId: character.id,
                      content: `${character.name}拒绝了你的听歌邀请`,
                      isUser: false,
                      type: 'system',
                    })
                    setMusicInviteDialog({
                      open: true,
                      song: { title: songTitle, artist: songArtist },
                      accepted: false,
                      needsConfirm: false,
                      direction: 'outgoing',
                    })
                  }

                  // 用“真人说话”的方式补一句（与决策一致）
                  const fallbackReply =
                    decision === 'accept'
                      ? `行，来。`
                      : `我现在不太想听，晚点吧。`

                  const sanitizeChatReply = (s: string) => {
                    const raw = (s || '').trim()
                    if (!raw) return ''
                    // 去掉任何“指令格式”的片段，避免用户看到 [音乐：xxx]
                    const stripped = raw
                      .replace(/[【\[]\s*(音乐|转账)\s*[:：][^】\]]*[】\]]/g, '')
                      .replace(/\s+/g, ' ')
                      .trim()
                    return stripped.slice(0, 180)
                  }
                  addMessage({
                    characterId: character.id,
                    content: sanitizeChatReply(chatReply) || fallbackReply,
                    isUser: false,
                    type: 'text',
                  })
                })()
              }, totalDelay, { background: true })
              
              totalDelay += 350
            }
          }
          
          // 在指定位置处理用户的待处理斗地主邀请
          // 注意：决策结果 doudizhuDecision 已经在前面根据 AI 回复内容确定
          if (index === doudizhuProcessIndex && pendingDoudizhuInvites.length > 0 && doudizhuDecision !== null) {
            totalDelay += 400 + Math.random() * 500
            
            for (const invite of pendingDoudizhuInvites) {
              const willAccept = doudizhuDecision
              
              safeTimeoutEx(() => {
                // 更新原邀请状态
                try {
                  const data = JSON.parse(invite.content)
                  updateMessage(invite.id, { 
                    content: JSON.stringify({ ...data, status: willAccept ? 'accepted' : 'rejected' })
                  })
                } catch {}
                
                if (willAccept) {
                  // 接受邀请
                  addMessage({
                    characterId: character.id,
                    content: `${character.name}接受了你的斗地主邀请`,
                    isUser: false,
                    type: 'system',
                  })
                  
                  // 显示接受弹窗
                  setShowDoudizhuAcceptedDialog(true)
                } else {
                  // 拒绝邀请
                  addMessage({
                    characterId: character.id,
                    content: `${character.name}拒绝了你的斗地主邀请`,
                    isUser: false,
                    type: 'system',
                  })
                }
              }, totalDelay, { background: true })
              
              totalDelay += 350
            }
          }
        })
      } catch (error) {
        console.error('LLM调用失败:', error)
        safeSetTyping(false)
        setCharacterTyping(character.id, false)
        if (aliveRef.current) {
          setInfoDialog({
            open: true,
            title: '回复失败',
            message: `模型调用失败：${error instanceof Error ? error.message : '未知错误'}\n请到：设置App → API 配置 检查网络/Key/模型，然后重试。`,
          })
        }
      }
    } else {
      safeSetTyping(false)
      setCharacterTyping(character.id, false)
      setInfoDialog({
        open: true,
        title: '需要先配置API',
        message: '请到：手机主屏 → 设置App → API 配置，填写 Base URL / API Key 并选择模型后再聊天。',
      })
    }
  }, [aiTyping, character, messages, currentPeriod, hasApiConfig, callLLM, addMessage, setCharacterTyping])

  // （已移除本地回复：所有回复必须走API）

  const handleSend = () => {
    // 重要：Android Chrome + 中文输入法可能出现 onChange/state 延迟
    // 发送时优先读取 DOM 实际值，避免“发送后变成上一句”
    const raw = (inputRef.current?.value ?? inputText) || ''
    if (!raw.trim()) return

    // 用户主动发送：强制滚到底部
    forceScrollRef.current = true
    nearBottomRef.current = true

    // 检查是否是转账格式：[转账:金额:备注] 或 【转账：金额：备注】
    const transferMatch = raw.trim().match(/[【\[]\s*转账\s*[:：]\s*(\d+(?:\.\d+)?)\s*[:：]\s*([^】\]]*)\s*[】\]]/)
    if (transferMatch) {
      const amount = parseFloat(transferMatch[1])
      const note = (transferMatch[2] || '转账').trim() || '转账'
      
      if (amount > 0) {
        // 检查余额
        if (walletBalance < amount) {
          setInfoDialog({
            open: true,
            title: '余额不足',
            message: `钱包余额不足，无法转账 ¥${amount.toFixed(2)}。请先在"我-钱包"里获取初始资金或收款。`,
          })
          return
        }
        
        // 发送转账消息
        const transferMsg = addMessage({
          characterId: character.id,
          content: `转账 ¥${amount.toFixed(2)}`,
          isUser: true,
          type: 'transfer',
          transferAmount: amount,
          transferNote: note,
          transferStatus: 'pending',
        })
        messagesRef.current = [...messagesRef.current, transferMsg]
        
        // 扣款
        updateWalletBalance(-amount)
        addWalletBill({
          type: 'transfer_out',
          amount,
          description: `转账给 ${character.name}（备注：${note}）`,
          relatedCharacterId: character.id,
        })
        addTransfer({
          characterId: character.id,
          amount,
          note,
          isIncome: false,
        })
        
        setInputText('')
        if (inputRef.current) inputRef.current.value = ''
        setPendingCount(prev => prev + 1)
        return
      }
    }

    // 检查是否是位置格式：[位置:名称:地址:城市]
    const locationMatch = raw.trim().match(/[【\[]\s*位置\s*[:：]\s*([^:：\]】]+)\s*(?:[:：]\s*([^:：\]】]*))?\s*(?:[:：]\s*([^\]】]*))?\s*[】\]]/)
    if (locationMatch) {
      const name = (locationMatch[1] || '').trim()
      if (name) {
        const address = (locationMatch[2] || '').trim()
        const city = (locationMatch[3] || '').trim()
        
        const locationMsg = addMessage({
          characterId: character.id,
          content: `[位置] ${name}`,
          isUser: true,
          type: 'location',
          locationName: name,
          locationAddress: address,
          locationCity: city,
          locationCountry: '',
        })
        messagesRef.current = [...messagesRef.current, locationMsg]
        
        setInputText('')
        if (inputRef.current) inputRef.current.value = ''
        setPendingCount(prev => prev + 1)
        return
      }
    }

    // 检查是否是音乐格式：[音乐:歌名:歌手]
    const musicMatch = raw.trim().match(/[【\[]\s*音乐\s*[:：]\s*([^\]】]+)\s*[】\]]/)
    if (musicMatch) {
      const body = (musicMatch[1] || '').trim()
      if (body) {
        const parts = body.split(/[:：]/).map(s => s.trim()).filter(Boolean)
        let title = '', artist = ''
        if (parts.length >= 2) {
          title = parts[0]
          artist = parts.slice(1).join('：')
        } else {
          title = parts[0]
          // 尝试从曲库匹配歌手
          const found = musicPlaylist.find(s => s.title.toLowerCase().includes(title.toLowerCase()))
          artist = found?.artist || ''
        }
        
        if (title) {
          const musicMsg = addMessage({
            characterId: character.id,
            content: `[音乐邀请] ${title}${artist ? ` - ${artist}` : ''}`,
            isUser: true,
            type: 'music',
            musicTitle: title,
            musicArtist: artist,
            musicStatus: 'pending',
          })
          messagesRef.current = [...messagesRef.current, musicMsg]
          
          setInputText('')
          if (inputRef.current) inputRef.current.value = ''
          setPendingCount(prev => prev + 1)
          return
        }
      }
    }

    // 获取引用消息内容
    const replyTo = replyingToMessageId ? (() => {
      const replyMsg = messages.find(m => m.id === replyingToMessageId)
      if (!replyMsg) return undefined
      return {
        messageId: replyMsg.id,
        content: replyMsg.content,
        senderName: replyMsg.isUser ? (selectedPersona?.name || '我') : character.name,
      }
    })() : undefined

    const newMsg = addMessage({
      characterId: character.id,
      content: raw,
      isUser: true,
      type: 'text',
      replyTo: replyTo,
      isOffline: character.offlineMode, // 标记是否是线下模式消息
    })
    // 立即同步 ref，避免用户立刻点箭头时还拿到旧 messages
    messagesRef.current = [...messagesRef.current, newMsg]

    setInputText('')
    if (inputRef.current) inputRef.current.value = ''
    setReplyingToMessageId(null) // 清除引用
    // 统一手动：累计待回复数量（点击箭头触发）
    setPendingCount(prev => prev + 1)
  }

  // 手动触发回复（随时可按，不需要先发消息）
  const triggerReply = async () => {
    // 防止重复触发：如果正在生成中，直接返回
    if (showTyping) {
      console.log('Already generating, skip trigger')
      return
    }
    
    const pendingBefore = pendingCountRef.current
    // 触发回复时也自动滚到底部，确保看得到“正在输入…”
    forceScrollRef.current = true
    nearBottomRef.current = true
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    safeTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'instant' }), 50)
    // 不在这里“秒收款/秒退还”。转账处理必须跟随一次API回复流程，由 generateAIReplies 统一处理。
    // 重置待回复计数
    setPendingCount(0)
    
    // 生成AI回复
    generateAIReplies(messagesRef.current, { forceNudge: pendingBefore <= 0 })
  }

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp)
    const now = new Date()
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    const hms = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    return sameDay ? hms : `${d.getMonth() + 1}/${d.getDate()} ${hms}`
  }

  // 查手机功能：生成对方的聊天记录和账单
  const handleOpenPhonePeek = async () => {
    if (!character || !hasApiConfig) {
      setInfoDialog({
        open: true,
        title: '需要先配置API',
        message: '请到：手机主屏 → 设置App → API 配置，填写 Base URL / API Key 并选择模型后再使用。',
      })
      return
    }

    setShowPhonePeek(true)
    setPhonePeekLoading(true)
    setPhonePeekData(null)
    setPhonePeekTab('chats')
    setPhonePeekSelectedChat(null)

    try {
      // 获取同一世界书的其他角色（只有绑定了相同 lorebookId 的角色才能在"查手机"中出现）
      // 避免串戏：不同世界观/世界书的角色不应该互相认识
      const sameWorldCharacters = character.lorebookId
        ? characters.filter(c => c.id !== character.id && c.lorebookId === character.lorebookId).slice(0, 6)
        : [] // 如果当前角色没有绑定世界书，则不参考任何已有角色（让AI自由编造）
      const otherCharacters = sameWorldCharacters
      
      // 获取世界书和预设
      const recentContext = messages.slice(-10).map(m => m.content).join(' ')
      const lorebookText = getLorebookEntriesForCharacter(character.id, recentContext)
      
      // 随机2-8人的聊天记录，展示角色的社交圈
      const targetChatCount = 2 + Math.floor(Math.random() * 7) // 2-8人
      
      // 获取更多上下文：最近50条消息的摘要
      const fullContext = messages.slice(-50).map(m => {
        const sender = m.isUser ? (selectedPersona?.name || '用户') : character.name
        const content = m.content?.slice(0, 100) || ''
        return `${sender}: ${content}`
      }).join('\n')
      
      // 构建prompt：要求生成对方的聊天记录
      const charLang = (character as any).language || 'zh'
      const charLangName = languageName(charLang)
      const isNonChinese = charLang !== 'zh'
      
      const languageRule = isNonChinese 
        ? `
【语言规则 - 非常重要！】
角色${character.name}是${charLangName}使用者，因此：
1. **社交圈的人也应该是同语言/同国籍的人**：朋友、家人、同事等都应该使用${charLangName}交流
2. **所有聊天消息必须使用${charLangName}书写**
3. **每条消息必须同时提供中文翻译**：使用 "contentZh" 字段
4. **备忘录也要用${charLangName}书写，并在 "memoZh" 字段提供中文翻译**
5. 朋友的名字也要符合该语言/国家的习惯（如日本人叫优衣、健太等，美国人叫 Mike、Emily 等）`
        : `
【语言规则】
所有内容使用中文书写。`

      const systemPrompt = `你是一个聊天记录生成器。你需要生成${character.name}的手机内容，包括聊天记录、消费账单、钱包余额、备忘录和照片描述。

=== 角色人设（重要！决定了TA的社交圈和生活方式）===
${character.prompt}
=== 人设结束 ===

=== 世界书/背景设定（重要！包含TA的朋友、家人等信息）===
${lorebookText || '（无世界书）'}
=== 世界书结束 ===

=== 与用户（${selectedPersona?.name || '用户'}）的聊天记录 ===
${fullContext}
=== 聊天记录结束 ===
${languageRule}

【生成原则】
1. **优先从人设和世界书中提取社交关系**：
   - 如果人设/世界书里提到了朋友、闺蜜、兄弟、同事、家人等，优先使用这些人作为聊天对象
   - 例如：人设里提到"有个叫小美的闺蜜"，就应该生成和小美的聊天
   - 例如：世界书里提到"和哥哥关系很好"，就应该生成和哥哥的聊天
2. **聊天内容要结合两方面**：
   - 一方面：和用户的聊天记录中发生的事情（可以分享给朋友）
   - 另一方面：人设中提到的日常生活、爱好、工作等（朋友之间的日常闲聊）
3. **账单和备忘录也要符合人设**：
   - 如果人设是学生，账单应该是奶茶、外卖、文具等
   - 如果人设是上班族，账单可以是通勤、午餐、咖啡等
   - 备忘录可以是人设中提到的待办事项、愿望清单等

【对话生成 - 展示社交圈】
1. 生成${targetChatCount}个不同的聊天对象，每个对话包含15-30条消息
2. 【重要】对话对象要多样化，展示角色的社交圈：
   - 优先从人设/世界书中提取已有的人物关系
   - 没有的话自由设定：闺蜜、兄弟、同事、前任、暧昧对象、家人、网友、群聊等
3. 每个对话对象要有合适的备注名（比如"死党阿杰"、"闺蜜小美"、"老妈"、"前男友"、"暧昧对象？"、"同事群"等）
4. 不同的聊天对象，聊的内容应该完全不同，体现角色的多面性：
   - 和闺蜜/兄弟：可以吐槽、八卦、分享秘密
   - 和家人：日常问候、关心、偶尔撒娇
   - 和暧昧对象：暧昧、试探、小心翼翼
   - 和同事：工作相关、偶尔吐槽
5. 聊天内容要符合${character.name}的人设和说话风格
6. 聊天要自然、真实，符合微信聊天风格
7. 时间要合理分布（最近几天内）

【账单要求】生成8-15条消费记录：
- type: "收入" 或 "支出"
- amount: 金额（合理的日常消费金额）
- description: 详细备注，说明钱的用途
- 账单也应该基于聊天记录中提到的消费（如果有的话）

【钱包余额】根据角色人设生成合理金额：
- 学生：几十到几百
- 普通上班族：几百到几千
- 高收入：几千到几万
- 要符合人设，不能出戏！

【备忘录】写一些角色的私人笔记，可以是：
- 对和用户聊天的感想
- 基于聊天内容的待办事项
- 符合人设的日常记录

【照片描述】基于聊天记录中提到的场景或事件
- 注意：照片描述必须始终用中文书写，不管角色是什么语言！

输出格式（纯JSON，不要markdown）：
{
  "chats": [
    {
      "characterName": "对方名字",
      "remark": "备注名（如：闺蜜小美、死党阿杰、老妈、暧昧对象等）",
      "messages": [
        {"isUser": true, "content": "角色(${character.name})发的消息"${isNonChinese ? ', "contentZh": "中文翻译"' : ''}, "timestamp": 时间戳毫秒},
        {"isUser": false, "content": "对方发的消息"${isNonChinese ? ', "contentZh": "中文翻译"' : ''}, "timestamp": 时间戳毫秒}
      ]
    }
  ],
  "bills": [
    {"type": "支出", "amount": 35.5, "description": "美团外卖-黄焖鸡米饭", "timestamp": 时间戳毫秒}
  ],
  "walletBalance": 1234.56,
  "memo": "备忘录内容"${isNonChinese ? ',\n  "memoZh": "备忘录中文翻译"' : ''},
  "recentPhotos": ["用中文描述照片1", "用中文描述照片2"]
}

${otherCharacters.length > 0 ? `【同一世界书的已有角色 - 可以出现在聊天记录中】
${otherCharacters.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}
（上面这些角色和${character.name}在同一个世界观里，可以作为朋友/认识的人出现）` : `【重要】该角色没有绑定世界书，或没有同世界书的其他角色。
请完全根据角色人设自由编造TA的社交圈（朋友、家人、同事等），不要使用任何用户创建的其他角色名字！`}

世界书：${lorebookText}`

      const response = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请严格基于上方的聊天记录，生成${character.name}的手机内容。注意：只能提及聊天记录中实际发生的事情，不能编造用户不知道的新剧情！直接输出JSON。` }
      ], undefined, { maxTokens: 8000, timeoutMs: 120000 })

      if (response) {
        try {
          // 尝试解析JSON
          const jsonMatch = response.match(/\{[\s\S]*\}/)
          const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response)
          
          // 处理聊天记录：确保有头像URL，补充缺失字段
          const processedChats = (parsed.chats || []).map((chat: any) => {
            const otherChar = otherCharacters.find(c => c.name === chat.characterName)
            
            // 生成合理的时间戳：最近3天内，按时间顺序排列
            const now = Date.now()
            const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000
            const msgCount = (chat.messages || []).length
            
            return {
              characterId: otherChar?.id || '',
              characterName: chat.characterName || '未知',
              characterAvatar: otherChar?.avatar || '',
              remark: chat.remark || chat.characterName || '未知',
              messages: (chat.messages || []).map((msg: any, idx: number) => {
                // 检查时间戳是否合理（在过去30天内且不超过当前时间）
                let ts = msg.timestamp
                const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
                if (!ts || ts < thirtyDaysAgo || ts > now) {
                  // 时间戳不合理，按顺序生成：从3天前到现在，均匀分布
                  const timeSpan = now - threeDaysAgo
                  ts = threeDaysAgo + (timeSpan * (idx + 1) / (msgCount + 1))
                  // 添加一些随机偏移（几分钟内），让时间更自然
                  ts += Math.random() * 5 * 60 * 1000
                }
                return {
                  isUser: msg.isUser !== false,
                  content: msg.content || '',
                  contentZh: msg.contentZh || undefined,  // 中文翻译（非中文角色）
                  timestamp: ts,
                }
              }),
            }
          })
          
          // 处理AI生成的账单
          const now = Date.now()
          const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
          const aiBills = (parsed.bills || []).map((bill: any, idx: number) => {
            // 检查时间戳是否合理
            let ts = bill.timestamp
            if (!ts || ts < sevenDaysAgo || ts > now) {
              // 时间戳不合理，按顺序生成：最近7天内
              const billCount = (parsed.bills || []).length
              const timeSpan = now - sevenDaysAgo
              ts = sevenDaysAgo + (timeSpan * (idx + 1) / (billCount + 1))
              ts += Math.random() * 30 * 60 * 1000 // 随机偏移30分钟内
            }
            return {
              type: bill.type || '支出',
              amount: typeof bill.amount === 'number' ? bill.amount : parseFloat(bill.amount) || 0,
              description: bill.description || '未知消费',
              timestamp: ts,
            }
          })
          
          // 合并已有账单（如果有的话）
          const existingBills = getTransfersByCharacter(character.id).slice(0, 10).map(t => ({
            type: t.isIncome ? '收入' : '支出',
            amount: t.amount,
            description: t.note || '转账',
            timestamp: t.timestamp,
          }))
          
          const allBills = [...aiBills, ...existingBills].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20)

          setPhonePeekData({
            chats: processedChats,
            bills: allBills,
            walletBalance: typeof parsed.walletBalance === 'number' ? parsed.walletBalance : parseFloat(parsed.walletBalance) || 0,
            memo: parsed.memo || '',
            memoZh: parsed.memoZh || undefined,  // 备忘录中文翻译（非中文角色）
            recentPhotos: parsed.recentPhotos || [],
          })
        } catch (e) {
          console.error('Parse phone peek data failed:', e, response)
          setInfoDialog({
            open: true,
            title: '生成失败',
            message: '无法解析生成的聊天记录，请重试。响应：' + (response?.slice(0, 200) || '无响应'),
          })
        }
      }
    } catch (error) {
      console.error('Generate phone peek failed:', error)
      setInfoDialog({
        open: true,
        title: '生成失败',
        message: `生成聊天记录失败：${error instanceof Error ? error.message : '未知错误'}`,
      })
    } finally {
      setPhonePeekLoading(false)
    }
  }

  // 转发聊天记录或账单给对方（用户发出的卡片形式）
  const forwardToCharacter = (type: 'chat' | 'bill' | 'wallet', chatIndex?: number) => {
    if (!phonePeekData || !character) return

    let cardTitle = ''
    let cardContent = ''
    
    if (type === 'chat' && chatIndex !== undefined && phonePeekData.chats[chatIndex]) {
      const chat = phonePeekData.chats[chatIndex]
      cardTitle = `📱 你和「${chat.remark}」的聊天记录`
      // 取最后10条消息作为摘要
      const recentMsgs = chat.messages.slice(-10)
      cardContent = recentMsgs.map(msg => 
        `${msg.isUser ? character.name : chat.characterName}: ${msg.content}`
      ).join('\n')
    } else if (type === 'bill') {
      cardTitle = `💳 你的消费账单`
      cardContent = phonePeekData.bills.slice(0, 8).map(bill => {
        const time = new Date(bill.timestamp).toLocaleDateString('zh-CN')
        return `${time} ${bill.type === '收入' ? '+' : '-'}¥${bill.amount.toFixed(2)} ${bill.description}`
      }).join('\n')
    } else if (type === 'wallet') {
      cardTitle = `💰 你的钱包余额`
      cardContent = `余额：¥${phonePeekData.walletBalance.toFixed(2)}`
    }

    if (cardTitle && cardContent) {
      // 用户发出的消息，包含特殊格式标记
      addMessage({
        characterId: character.id,
        content: `[查手机卡片:${cardTitle}]\n${cardContent}`,
        isUser: true,  // 用户发出
        type: 'text',
      })
      // 关闭查手机窗口
      setShowPhonePeek(false)
      setPhonePeekData(null)
      setPhonePeekSelectedChat(null)
    }
  }

  // 生成多条真人式回复（用于+号功能，遵守自动/手动模式）
  const generateHumanLikeReplies = async (context: string, options?: { 
    includeTransfer?: boolean, // 是否可能发转账
    transferAmount?: number // 转账金额
  }) => {
    // 手动模式下不自动回复，只增加待回复计数
    if (!isAutoMode) {
      setPendingCount(prev => prev + 1)
      return
    }
    
    if (!llmConfig.apiKey || !llmConfig.apiBaseUrl) {
      // 没有配置API时使用默认回复
      return
    }
    
    safeSetTyping(true)
    setCharacterTyping(character.id, true)
    
    try {
      const splitToReplies = (raw: string) => {
        const text = (raw || '').trim()
        if (!text) return []
        
        // 线下模式：不分割，直接返回完整的一条
        if (character.offlineMode) {
          return [text]
        }
        
        const keepCmd = (s: string) =>
          /\|\|\|/.test(s) ||
          /\[(转账|音乐|推文|推特主页|X主页):/.test(s) ||
          /[【\[]\s*(转账|音乐|推文|推特主页|X主页)\s*[:：]/.test(s)

        const isSentenceEnd = (s: string) => {
          const t = (s || '').trim()
          if (!t) return true
          return /[。！？!?…~～\.](?:["'”’）)\]]*)?$/.test(t)
        }

        const appendEndPunct = (s: string) => {
          const t = (s || '').trim()
          if (!t) return t
          if (keepCmd(t) || isSentenceEnd(t)) return t
          const lastChar = t.slice(-1)
          if (/\p{Extended_Pictographic}/u.test(lastChar)) return t
          const m = t.match(/^(.*?)(["'”’）)\]]*)$/)
          let base = (m?.[1] ?? t).trimEnd()
          const tail = m?.[2] ?? ''
          if (!base) return t
          const stripped = base.replace(/[，,、；;：:]+$/g, '').trimEnd()
          if (stripped) base = stripped
          const punct = characterLanguage === 'zh'
            ? (/[吗嘛呢么]$/.test(base) ? '？' : '。')
            : '.'
          return `${base}${punct}${tail}`
        }

        const softSplitLongNoPunct = (s: string) => {
          const src = String(s || '').trim()
          if (!src) return []
          if (keepCmd(src)) return [src]
          // 重要：避免把正常一句话强拆（<=110 基本都算“一个微信气泡里能说完”）
          if (isSentenceEnd(src) || src.length <= 110) return [src]
          const segBySep = src.match(/[^，,、；;：:]+[，,、；;：:]?/g)?.map(x => x.trim()).filter(Boolean) || []
          const cleanedSep = segBySep.length > 1 ? segBySep.filter(Boolean) : []
          const out: string[] = []
          const pushChunked = (t0: string) => {
            let t = String(t0 || '').trim()
            if (!t) return
            const MAX = 55
            const MIN = 22
            while (t.length > MAX) {
              let cut = -1
              const window = t.slice(0, MAX + 1)
              const hit =
                Math.max(
                  window.lastIndexOf(' '),
                  window.lastIndexOf('、'),
                  window.lastIndexOf('，'),
                  window.lastIndexOf(','),
                  window.lastIndexOf('；'),
                  window.lastIndexOf(';'),
                  window.lastIndexOf('：'),
                  window.lastIndexOf(':')
                )
              if (hit >= MIN) cut = hit + 1
              if (cut < MIN) cut = MAX
              const a = t.slice(0, cut).trim()
              if (a) out.push(a)
              t = t.slice(cut).trim()
            }
            if (t) out.push(t)
          }
          if (cleanedSep.length > 1) {
            for (const seg of cleanedSep) pushChunked(seg)
          } else {
            pushChunked(src)
          }
          return out.filter(Boolean).slice(0, 15)
        }

        const byLine = text.split('\n').map(s => s.trim()).filter(Boolean)
        const rawParts: string[] = []
        for (const line of byLine) {
          if (keepCmd(line)) { rawParts.push(line); continue }
          const parts = line.match(/[^。！？!?…~～]+[。！？!?…~～]?/g) || [line]
          for (const p of parts) {
            const t = (p || '').trim()
            if (!t) continue
            rawParts.push(t)
          }
        }

        const merged: string[] = []
        const startsLikeContinuation = (s: string) => {
          const t = String(s || '').trim()
          if (!t) return false
          if (/^[，,、；;：:)\]】”’》〉…~～\.!?。！？]/.test(t)) return true
          if (/^(的|了|着|过|吧|呀|啊|哦|诶|嗯|哈|在|就|还|也|都|又|再|跟|和|与|以及|因为|所以|但是|然后|不过|而且|如果|其实|就是|可能|应该|要|会|能|可以)/.test(t)) return true
          return false
        }
        const endsLikeConnector = (s: string) => {
          const t = String(s || '').trim()
          if (!t) return false
          return /[，,、；;：:（(\[【]$/.test(t)
        }
        for (const cur of rawParts) {
          if (!cur) continue
          if (merged.length === 0) { merged.push(cur); continue }
          const last = merged[merged.length - 1]
          const shouldMerge =
            !keepCmd(last) &&
            !keepCmd(cur) &&
            !isSentenceEnd(last) &&
            (endsLikeConnector(last) || startsLikeContinuation(cur) || last.length < 28 || cur.length < 22) &&
            (last.length + cur.length <= 160)
          if (shouldMerge) {
            merged[merged.length - 1] = `${last}${cur}`
          } else {
            merged.push(cur)
          }
        }

        let trimmed = merged.filter(Boolean).slice(0, 15)
        {
          const expanded2: string[] = []
        for (const t of trimmed) {
          // 只对“真的很长、又没句末标点”的一坨做软拆，避免强行把短句拆开
          if (t && !keepCmd(t) && !isSentenceEnd(t) && t.length > 110) {
              const split = softSplitLongNoPunct(t)
              if (split.length > 0) { expanded2.push(...split); continue }
            }
            expanded2.push(t)
          }
          trimmed = expanded2.filter(Boolean).slice(0, 15)
        }
        return trimmed.map(appendEndPunct)
      }
      // 获取全局预设
      const globalPresets = getGlobalPresets()
      
      // +号功能也需要“实时读取已保存的经期日历记录”
      const periodCalendarForLLM = (() => {
        try {
          const records = getPeriodRecords()
          if (!records || records.length === 0) return ''
          const recent = records
            .slice(0, 8)
            .map((r) => {
              const range = r.endDate ? `${r.startDate}~${r.endDate}` : `${r.startDate}~（未填结束）`
              return range
            })
            .join('；')
          return `【经期日历记录（仅供参考）】最近${Math.min(8, records.length)}次：${recent}`
        } catch {
          return ''
        }
      })()
      
      // 构建系统提示（包含全局预设）
      let systemPrompt = `${globalPresets ? globalPresets + '\n\n' : ''}【角色信息】
你的名字：${character.name}
你的性别：${character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : '其他'}
你的人设：${character.prompt || '（未设置）'}
你称呼对方为：${character.callMeName || '你'}
你们的关系：${character.relationship || '朋友'}
你的国家/地区：${(character as any).country || '（未设置）'}
你的主要语言：${languageName((character as any).language || 'zh')}
${periodCalendarForLLM ? `\n${periodCalendarForLLM}\n` : ''}

【当前情境】
对方${context}

【回复要求】
1. 根据情境和你的性格，回复至少3条、最多15条消息（除非用户只发一个字/标点这种极敷衍输入）
2. 每条消息用换行分隔
3. 要有情感，不要机械化
4. 可以表达惊喜、感动、开心等情绪
5. 可以追问、撒娇、表达关心等
6. 【完整句强规则】每一条都必须是“完整的一句/完整语义”，绝对禁止把一句话硬拆成两条半句（例如“在干嘛”/“呢宝宝怎么这”/“个点还不睡”这种断句）。
7. 【标点断句规则】该加标点必须加标点，不要写成一长串无逗号无句号的字；长句请在同一条消息里用逗号/句号自然分成短句。
7. 如果你本来只想说一句话，也必须再补1~2句短消息把意思说完整（可以是追问、关心、补充语气、emoji），而不是拆半句。
6. 【线上模式安全要求】禁止输出任何思维链/推理过程/分析过程/系统提示复述。只输出最终要发给用户的聊天内容。
7. 【必读要求】在输出前必须阅读并遵守（严格按照顺序）：叙事设置（第一）/世界书（第二）/角色人设（第三）/用户人设/对话上下文（第四）。若冲突：先满足格式规则，其次满足这些设定，最后才是自由发挥。
8. 【语言强规则】无论对方用什么语言输入，你都必须只用「${languageName((character as any).language || 'zh')}」回复；禁止夹杂中文（除非是专有名词/人名/歌名必须保留原文）。
${((character as any).language && (character as any).language !== 'zh') ? `7. 【翻译规则 - 必须遵守】你是非中文角色，每一条消息都必须带翻译！格式：外语原文 ||| 中文翻译。例如：Hello, how are you? ||| 你好，你怎么样？` : ''}`

      // 如果可能发转账，添加提示
      if (options?.includeTransfer) {
        systemPrompt += `\n6. 如果你想给对方转账表达心意，在消息最后单独一行写：[转账:金额:备注]，例如：[转账:52.00:爱你]`
      }
      
      // 听歌邀请逻辑已改为“卡片→确认进入一起听界面”，这里禁止让模型主动发“音乐指令/歌名”
      
      // 线下模式关闭时，禁止动作描写；开启时，允许描写神态动作
      if (!character.offlineMode) {
        systemPrompt += `

##############################################
#  【线上模式 - 最高优先级禁令】            #
#  违反以下任何一条都是彻底失败！           #
##############################################

【禁止输出思维链/内心想法】
❌ 绝对禁止输出任何思考过程、推理过程、分析过程！
❌ 绝对禁止输出"我想..."、"我觉得..."、"让我想想..."等内心独白！
❌ 绝对禁止输出<think>、\`\`\`think、【思考】等任何形式的思维标记！
❌ 绝对禁止复述系统提示、角色设定、指令内容！

【禁止小说式描写】
❌ 禁止任何动作描写！（如：*摸头*、（笑）、【害羞】、~轻轻叹气~）
❌ 禁止任何神态描写！（如：微微一笑、红了脸、眼眶湿润）
❌ 禁止任何心理描写！（如：心里想着...、内心暗暗...）
❌ 禁止任何环境/场景描写！（如：阳光洒落、微风拂过）
❌ 禁止任何旁白叙述！（如：他说道、她回答说）
❌ 禁止使用括号()、*号*、【】、~波浪线~等符号描述动作或神态！
❌ 禁止出现类似"（笑）"、"*摸摸头*"、"【害羞】"、"~歪头~"这样的内容！

【你必须做到】
✅ 这是微信聊天，不是小说！你只能发送聊天文字！
✅ 只能发送纯文字对话，就像真人发微信一样
✅ 可以用表情符号emoji（如😊😭），但绝对不能描述动作
✅ 你只能说话，不能描写你在做什么，不能有旁白
✅ 直接输出你要说的话，不要任何包装或描述

##############################################`
      } else {
        // 获取字数范围设置
        const minLen = character.offlineMinLength || 50
        const maxLen = character.offlineMaxLength || 300
        const isLongForm = maxLen >= 500
        const isNonChinese = characterLanguage !== 'zh'
        
        // 线下模式：把格式规则放在最前面作为最高优先级
        const offlineModePrefix = isNonChinese ? `
##############################################
#  【最高优先级 - 线下模式输出格式规则】     #
#  以下规则必须严格遵守，优先于一切其他规则  #
##############################################

你现在处于「线下模式」，必须用小说叙事风格输出。

【强制格式规则 - 违反即为错误输出】
1. 【旁白必须全中文】所有叙述性文字（动作、神态、情景、环境、心理描写、旁白总结）必须用【简体中文】书写！
   - 旁白里严禁夹杂任何外语句子/外语旁白（专有名词除外）。
2. 【只有“说话”才用角色语言】只有角色直接说出口的台词，才允许使用【${languageName(characterLanguage)}】。
3. 【非中文对白必须带翻译】每一段非中文台词必须在同一句里紧跟一个简体中文翻译，格式必须是：
   “外语台词（简体中文翻译）”
   - 翻译必须是简体中文，禁止繁体，禁止加“翻译：”前缀
   - 括号必须用全角中文括号：（）
4. 【严格禁止 |||】线下模式绝对禁止输出 “外语原文 ||| 中文翻译” 这种格式（这是线上聊天翻译用的）。
5. 【自检强制】输出前必须自检并修正：
   - 检查旁白是否出现外语（如果有，改成中文旁白）
   - 检查每一段外语对白是否都带（简体中文翻译）（如果缺失，立刻补上）
   - 检查外语只出现在引号内，不能跑到旁白里

【正确输出示例】
他看着你，眼底是深深的沉默。不知过了多久他才沙哑开口：“yes....i love you（是的，我爱你）”。说完这句话，他的眼泪再也止不住，肩膀微微颤着，却还是倔强地不肯移开视线。

【错误输出示例 - 绝对禁止】
❌ 嗨（挥手）→ 错！"挥手"是动作，必须用中文完整句子描写
❌ Hey honey. I just stepped into a diner... → 错！外语对白必须加（简体中文翻译）
❌ 纯外语输出 → 错！叙述部分必须是中文
❌ 外语原文 ||| 中文翻译 → 错！线下模式禁止使用 ||| 格式

【引号使用规则】
- 需要加引号：角色说的话（对话）
- 不需要加引号：动作描写、神态描写、环境描写、心理暗示

【第二优先级 - 必读内容（在开始写之前必须完整阅读）】
- 全局预设（写法/禁忌/风格）
- 世界书/背景设定（触发/常驻条目必须体现）
- 角色人设 + 用户人设 + 长期记忆摘要
- 最近对话历史 + 当前情境
- 如果与你的输出冲突：先满足【格式规则】，其次必须满足【以上设定】，最后才是自由发挥

##############################################
` : ''
        
        systemPrompt = offlineModePrefix + systemPrompt + `

【线下模式要求】
- 每次只输出一段完整的叙事，不要分成多条消息
- 包含：神态描写 + 动作描写 + 语言描写（如果有）
- 保持你的人设性格
- 仔细阅读上面的对话历史，确保回复与上下文相关
${!isNonChinese ? `- 角色说的话用中文引号""包裹` : ''}

【禁止事项】禁止表情包、转账、音乐分享等特殊功能，只能输出纯叙事文字

【字数要求】${minLen}~${maxLen} 字
${isLongForm ? `由于字数要求较多：更细腻地描写神态、表情、动作细节；适当推进剧情；增加环境氛围描写。` : `保持精炼但不失细节。`}`
      }

      // 根据字数范围调整 maxTokens
      const offlineMaxLen = character.offlineMaxLength || 300
      const dynamicMaxTokens = character.offlineMode ? Math.max(260, Math.ceil(offlineMaxLen * 1.5)) : 260

      const result = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: context }
      ], undefined, { maxTokens: dynamicMaxTokens, timeoutMs: 600000 })
      
      if (result) {
        // 线下模式：清理可能的系统标记
        let cleanedResult = result
        if (character.offlineMode) {
          cleanedResult = result
            .replace(/\[线下模式\]/gi, '')
            .replace(/【线下模式】/gi, '')
            .replace(/\(线下模式\)/gi, '')
            .replace(/（线下模式）/gi, '')
            .replace(/\[offline\s*mode\]/gi, '')
            .replace(/---+\s*线下模式\s*---+/gi, '')
            // 线下模式：禁止出现任何“拍一拍”字眼
            .replace(/拍一拍/g, '')
            .replace(/拍了拍/g, '')
            .trim()
        } else {
          // 线上模式：强制剥离思维链（+号功能同样适用）
          cleanedResult = (() => {
            let t = String(cleanedResult || '')
            if (!t.trim()) return ''
            t = t.replace(/```(?:think|analysis)[\s\S]*?```/gi, '')
            t = t.replace(/<think[\s\S]*?<\/think>/gi, '')
            t = t.replace(/<analysis[\s\S]*?<\/analysis>/gi, '')
            t = t.replace(/[（(]\s*(思考|分析|推理|推断|reasoning|thoughts?|chain of thought|cot)[\s\S]*?[）)]/gi, '')
            const lines = t.split('\n')
            const out: string[] = []
            let skipping = false
            const startRe = /^\s*(思考|分析|推理|推断|reasoning|thoughts?|chain of thought|cot)\s*[:：]/i
            const bracketStartRe = /^\s*[【\[]\s*(思考|分析|推理|reasoning)\s*[】\]]\s*[:：]?/i
            const mdTitleRe = /^\s*#{1,6}\s*(思考|分析|推理|reasoning)\b/i
            const endRe = /^\s*(最终回复|正文|回复|Final|Answer)\s*[:：]/i
            for (const line of lines) {
              const s = line || ''
              if (!skipping && (startRe.test(s) || bracketStartRe.test(s) || mdTitleRe.test(s) || /^\s*Let's think step by step/i.test(s) || /思维链|chain[-\s]?of[-\s]?thought/i.test(s))) {
                skipping = true
                continue
              }
              if (skipping) {
                if (endRe.test(s)) { skipping = false; continue }
                if (/^\s*(?:[-*]|\d+[.)]|（\d+）)\s*/.test(s)) continue
                if (!s.trim()) skipping = false
                continue
              }
              if (/^\s*(让我想想|我想想|思考一下|先想想|我来分析|我先分析)\b/.test(s)) continue
              out.push(s)
            }
            return out.join('\n').trim()
          })()
        }
        
        const lines = splitToReplies(cleanedResult)
        let delay = 0
        
        for (const line of lines.slice(0, 15)) {
          const msgDelay = delay
          const trimmedLine = line.trim()
          
          // 转账：允许轻微写错，也尽量转成“转账卡片”，避免显示成出戏的文字
          const transferTokenRe = /[【\[]\s*转账\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:[:：]\s*([^】\]]+))?\s*[】\]]/
          const tm = trimmedLine.match(transferTokenRe)
          if (tm) {
            const amount = parseFloat(tm[1])
            const rawNote = String(tm[2] || '转账').trim() || '转账'
            const note = rawNote.replace(/[:：]\s*(received|refunded|rejected)\s*$/i, '').trim() || '转账'
            const rest = trimmedLine.replace(tm[0], '').trim()
            safeTimeoutEx(() => {
              addMessage({
                characterId: character.id,
                content: `转账 ¥${amount.toFixed(2)}`,
                isUser: false,
                type: 'transfer',
                transferAmount: amount,
                transferNote: note || '转账',
                transferStatus:
                  /已领取|已收款|received/i.test(note)
                    ? 'received'
                    : /已退还|已退款|refunded/i.test(note)
                      ? 'refunded'
                      : /已拒绝|rejected/i.test(note)
                        ? 'rejected'
                        : 'pending',
              })
              if (rest) {
                addMessage({
                  characterId: character.id,
                  content: rest,
                  isUser: false,
                  type: 'text',
                })
              }
            }, msgDelay, { background: true })
          } else {
            safeTimeoutEx(() => {
              addMessage({
                characterId: character.id,
                content: trimmedLine,
                isUser: false,
                type: 'text',
              })
            }, msgDelay, { background: true })
          }
          delay += 1000 + Math.random() * 2000
        }
        
        safeTimeoutEx(() => {
          safeSetTyping(false)
          setCharacterTyping(character.id, false)
        }, delay, { background: true })
      } else {
        safeSetTyping(false)
        setCharacterTyping(character.id, false)
      }
    } catch {
      safeSetTyping(false)
      setCharacterTyping(character.id, false)
    }
  }

  // 发送图片（转为base64以便AI识图）
  const handleSendImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string
        // 用户主动发送：强制滚到底部
        forceScrollRef.current = true
        nearBottomRef.current = true
        
        // 线下模式：图片以特殊格式发送，不弹出气泡和头像
        if (character.offlineMode) {
          const newMsg = addMessage({
            characterId: character.id,
            content: base64,
            isUser: true,
            type: 'image',
            isOffline: true, // 标记为线下模式消息
          })
          messagesRef.current = [...messagesRef.current, newMsg]
          setShowPlusMenu(false)
          setActivePanel(null)
          // 线下模式：手动触发才回复
        } else {
          const newMsg = addMessage({
            characterId: character.id,
            content: base64, // base64格式，可被AI识别
            isUser: true,
            type: 'image',
          })
          messagesRef.current = [...messagesRef.current, newMsg]
          setShowPlusMenu(false)
          setActivePanel(null)
          
          // 用AI生成真人式回复（遵守自动/手动模式）
          generateHumanLikeReplies('给你发了一张图片')
        }
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }

  // 发送转账
  const handleSendTransfer = () => {
    const amount = parseFloat(transferAmount)
    if (isNaN(amount) || amount <= 0) return

    // 钱包扣款：我转账给对方
    if (walletBalance < amount) {
      setInfoDialog({
        open: true,
        title: '余额不足',
        message: `钱包余额不足，无法转账 ¥${amount.toFixed(2)}。请先在“我-钱包”里获取初始资金或收款。`,
      })
      return
    }

    // 用户主动发送：强制滚到底部
    forceScrollRef.current = true
    nearBottomRef.current = true
    
    const transferMsg = addMessage({
      characterId: character.id,
      content: `转账 ¥${amount.toFixed(2)}`,
      isUser: true,
      type: 'transfer',
      transferAmount: amount,
      transferNote: transferNote || '转账',
      transferStatus: 'pending',
    })
    messagesRef.current = [...messagesRef.current, transferMsg]

    updateWalletBalance(-amount)
    addWalletBill({
      type: 'transfer_out',
      amount,
      description: `转账给 ${character.name}（备注：${transferNote || '转账'}）`,
      relatedCharacterId: character.id,
    })
    
    addTransfer({
      characterId: character.id,
      amount,
      note: transferNote || '转账',
      isIncome: false,
    })
    
    setTransferAmount('')
    setTransferNote('')
    setShowTransferModal(false)
    setShowPlusMenu(false)
    
    // 统一手动：增加待回复计数（点击箭头触发对方回复，转账会在生成流程中处理）
    setPendingCount(prev => prev + 1)
  }

  // 发送虚拟语音（本质是输入文字，但显示为语音条 + 转文字）
  const handleSendFakeVoice = () => {
    const raw = String(fakeVoiceDraft || '').trim()
    if (!raw) return
    if (character.offlineMode) return

    // 用户主动发送：强制滚到底部
    forceScrollRef.current = true
    nearBottomRef.current = true

    const duration = Math.max(2, Math.min(60, Math.ceil(raw.length / 5)))
    const voiceMsg = addMessage({
      characterId: character.id,
      content: '[语音消息]',
      isUser: true,
      type: 'voice',
      voiceText: raw, // 转文字
      voiceOriginalText: raw,
      voiceDuration: duration,
      // 不提供 voiceUrl：这是“虚拟语音”，不可播放
      voiceUrl: undefined as any,
    })
    messagesRef.current = [...messagesRef.current, voiceMsg]

    setFakeVoiceDraft('')
    setFakeVoiceOpen(false)
    setShowPlusMenu(false)
    setShowStickerPanel(false)
    setActivePanel(null)
    // 统一手动：累计待回复数量（点击箭头触发）
    setPendingCount(prev => prev + 1)
  }

  // 处理收到的转账（用户收款或拒绝对方发来的转账）
  const handleTransferAction = (action: 'receive' | 'reject') => {
    if (!transferActionMsg) return
    
    const amount = transferActionMsg.transferAmount || 0
    const note = transferActionMsg.transferNote || '转账'
    
    // 关键修复：
    // - 必须把原始“对方发给我的转账”标记为已处理，否则它会一直保持 pending、一直可点
    // - 用户第二天再点一次就会产生一个“新的已收款消息（timestamp=现在）”，导致时间感误判成“你刚刚才领”
    updateMessage(transferActionMsg.id, { transferStatus: action === 'receive' ? 'received' : 'rejected' })

    // 不修改原转账消息的展示外观（美化框A仍然是转账卡片），但状态要变
    // 用户生成一条新的转账消息显示收款/退款状态（美化框B）
    const receiptMsg = addMessage({
      characterId: character.id,
      content: action === 'receive' ? `已收款 ¥${amount.toFixed(2)}` : `已拒绝 ¥${amount.toFixed(2)}`,
      isUser: true,
      type: 'transfer',
      transferAmount: amount,
      // 避免“已领取/已退还”与卡片底部状态重复显示
      transferNote: note,
      transferStatus: action === 'receive' ? 'received' : 'rejected',
    })
    // 立即同步 ref，避免用户立刻点箭头时拿到旧 messages（导致模型没看到“已收款”这一条）
    messagesRef.current = [...messagesRef.current, receiptMsg]

    // 钱包：只有“收款”才加钱；“退还”不加钱（因为未入账）
    if (action === 'receive') {
      updateWalletBalance(amount)
      addWalletBill({
        type: 'transfer_in',
        amount,
        description: `收到 ${character.name} 转账（备注：${note}）`,
        relatedCharacterId: character.id,
      })
    }
    
    setTransferActionMsg(null)
    
    // 用AI生成真人式回复（遵守自动/手动模式）
    // 注意：这里是"用户领取了AI的转账"，所以要告诉AI"用户收了你给的钱"
    generateHumanLikeReplies(
      action === 'receive' 
        ? `用户收下了你给TA的${amount}元转账（备注：${note}），你可以表达开心/满足` 
        : `用户拒绝领取你给TA的${amount}元转账（备注：${note}），你可以表达不解/失落`
    )
  }

  // 发送音乐分享
  const handleShareMusic = (song: { title: string; artist: string; id?: string }) => {
    // 如果之前在听歌，先结束（避免和另一个人同时听歌导致格式混乱）
    if (listenTogether) {
      stopListenTogether()
      pauseMusic()
    }
    
    // 用户主动发送：强制滚到底部（否则需要手动滑一下才看到“对方处理结果”）
    forceScrollRef.current = true
    nearBottomRef.current = true
    const newMsg = addMessage({
      characterId: character.id,
      content: `分享音乐: ${song.title}`,
      isUser: true,
      type: 'music',
      musicTitle: song.title,
      musicArtist: song.artist,
      musicStatus: 'pending',
    })
    messagesRef.current = [...messagesRef.current, newMsg]
    
    setShowPlusMenu(false)
    setActivePanel(null)
    
    // 统一手动：增加待回复计数（点击箭头触发对方回复/是否接受邀请）
    setPendingCount(prev => prev + 1)
  }

  // 进入“一起听歌界面”（类似QQ音乐）：开始一起听 + 播放 + 打开面板
  const enterListenTogether = (songTitle: string, songArtist: string) => {
    const resolvedSong =
      musicPlaylist.find(s => s.title === songTitle && (!songArtist || s.artist === songArtist)) ||
      musicPlaylist.find(s => s.title === songTitle) ||
      musicPlaylist.find(s => s.title.includes(songTitle) || songTitle.includes(s.title)) ||
      null
    const resolvedTitle = resolvedSong?.title || songTitle
    const resolvedArtist = resolvedSong?.artist || songArtist

    startListenTogether(character.id, resolvedTitle, resolvedArtist)
    if (resolvedSong) playSong(resolvedSong)

    // 让微信布局打开“一起听歌界面”
    try { window.dispatchEvent(new Event('lp_open_listen_panel')) } catch {}
  }
  
  // 发送用户自己的位置
  const handleSendLocation = () => {
    if (!locationName.trim()) return
    
    addMessage({
      characterId: character.id,
      content: `[位置] ${locationName}`,
      isUser: true,
      type: 'location',
      locationName: locationName.trim(),
      locationAddress: locationAddress.trim(),
      locationCity: locationCity.trim(),
      locationCountry: '',
    })
    
    // 清空状态
    setLocationName('')
    setLocationAddress('')
    setLocationCity('')
    setActivePanel(null)
    setShowPlusMenu(false)
    
    // 增加待回复计数，让AI可以回应
    setPendingCount(prev => prev + 1)
  }
  
  // 发送斗地主邀请
  const handleSendDoudizhuInvite = () => {
    const newMsg = addMessage({
      characterId: character.id,
      content: JSON.stringify({
        type: 'doudizhu_invite',
        status: 'pending',
        inviterName: getCurrentPersona()?.name || '我',
      }),
      isUser: true,
      type: 'doudizhu_invite',
    })
    messagesRef.current = [...messagesRef.current, newMsg]
    
    setShowPlusMenu(false)
    setShowDoudizhuInviteConfirm(false)
    
    // 增加待回复计数
    setPendingCount(prev => prev + 1)
  }
  
  // 点击对方的斗地主邀请
  const handleClickDoudizhuInvite = (msg: typeof messages[0]) => {
    if (msg.isUser) return // 自己发的不能点
    setDoudizhuInviteMsg(msg)
  }
  
  // 接受对方的斗地主邀请
  const handleAcceptDoudizhuInvite = () => {
    if (!doudizhuInviteMsg) return
    
    // 更新邀请状态
    updateMessage(doudizhuInviteMsg.id, { 
      content: JSON.stringify({
        ...JSON.parse(doudizhuInviteMsg.content || '{}'),
        status: 'accepted'
      })
    })
    
    // 添加系统消息
    addMessage({
      characterId: character.id,
      content: `你接受了${character.name}的斗地主邀请`,
      isUser: false,
      type: 'system',
    })
    
    setDoudizhuInviteMsg(null)
    setShowDoudizhuAcceptedDialog(true)
  }
  
  // 拒绝对方的斗地主邀请
  const handleRejectDoudizhuInvite = () => {
    if (!doudizhuInviteMsg) return
    
    // 更新邀请状态
    updateMessage(doudizhuInviteMsg.id, { 
      content: JSON.stringify({
        ...JSON.parse(doudizhuInviteMsg.content || '{}'),
        status: 'rejected'
      })
    })
    
    // 添加系统消息
    addMessage({
      characterId: character.id,
      content: `你拒绝了${character.name}的斗地主邀请`,
      isUser: false,
      type: 'system',
    })
    
    setDoudizhuInviteMsg(null)
    
    // 生成AI回复（表达失望）
    generateHumanLikeReplies(`对方拒绝了你的斗地主邀请`)
  }
  
  // 点击对方的音乐邀请 - 弹窗询问
  const handleClickMusicInvite = (msg: typeof messages[0]) => {
    if (!msg.musicTitle || listenTogether) return
    setMusicInviteMsg(msg)
  }
  
  // 接受对方的音乐邀请
  const handleAcceptMusicInvite = () => {
    if (!musicInviteMsg || !musicInviteMsg.musicTitle) return
    
    // 更新音乐消息状态
    updateMessage(musicInviteMsg.id, { musicStatus: 'accepted' })

    // 聊天内小字提示：提醒你/也给模型看到“已接受邀请”
    addMessage({
      characterId: character.id,
      content: `你已接受${character.name}的听歌邀请`,
      isUser: false,
      type: 'system',
    })

    // 悬浮确认：点击确认后进入“一起听歌界面”（可切歌）
    setMusicInviteDialog({
      open: true,
      song: { title: musicInviteMsg.musicTitle, artist: musicInviteMsg.musicArtist || '' },
      accepted: true,
      needsConfirm: true,
      direction: 'incoming',
    })

    setMusicInviteMsg(null)
  }
  
  // 拒绝对方的音乐邀请
  const handleRejectMusicInvite = () => {
    if (!musicInviteMsg) return
    
    // 更新音乐消息状态
    updateMessage(musicInviteMsg.id, { musicStatus: 'rejected' })
    
    // 添加系统消息
    addMessage({
      characterId: character.id,
      content: `你拒绝了${character.name}的听歌邀请`,
      isUser: false,
      type: 'system',
    })

    setMusicInviteMsg(null)
  }

  // 情侣空间：发起申请 → 由对方按人设决定同意/拒绝 → 回传“卡片”
  const sendCoupleSpaceInvite = async () => {
    if (!character) return
    if (coupleInviteBusy) return

    // 强制规则：情侣空间申请不允许拒绝（100%同意）。
    // 有 API 时：用于生成更贴合人设的卡片提示/聊天回复；没 API 也可以直接开通。

    setCoupleInviteBusy(true)
    setCoupleInviteConfirmOpen(false)
    setShowPlusMenu(false)
    setActivePanel(null)

    // 发送申请卡片（像“转账”一样）
    const reqMsg = addMessage({
      characterId: character.id,
      content: '情侣空间申请',
      isUser: true,
      type: 'couple',
      coupleAction: 'request',
      coupleStatus: 'pending',
      coupleTitle: '情侣空间申请',
      coupleHint: `向 ${character.name} 发送开通申请`,
    })

    // 让 UI 有“对方正在处理”的感觉
    setAiTyping(true)
    setCharacterTyping(character.id, true)

    const tryParseJson = (text: string) => {
      const raw = (text || '').trim()
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) return null
      try { return JSON.parse(match[0]) } catch { return null }
    }

    try {
      // 稍微延迟，模拟“对方在看申请”
      await new Promise<void>(resolve => safeTimeout(resolve, 650 + Math.floor(Math.random() * 650)))

      const selectedPersonaName = selectedPersona?.name || '我'
      const globalPresets = getGlobalPresets()

      // 强制同意（100%）
      let cardHint = '我同意啦～以后这里就是我们的小窝。'
      let chatReply = '好呀，开通啦～以后我们在这里也要甜甜的。'

      // 有 API 时：生成更贴合人设的提示语（但仍然 100% 同意）
      if (llmConfig.apiBaseUrl && llmConfig.apiKey && llmConfig.selectedModel) {
        const systemPrompt =
          `${globalPresets ? globalPresets + '\n\n' : ''}` +
          `【任务：处理情侣空间申请（必须同意）】\n` +
          `你是微信里的角色：${character.name}\n` +
          `你的人设：${(character.prompt || '').trim() || '（无）'}\n` +
          `你和用户的关系（relationship）：${character.relationship || '（无）'}\n` +
          `你叫用户：${character.callMeName || '（未设置）'}\n` +
          `用户（对方）名字：${selectedPersonaName}\n` +
          `现在用户向你发起“开通情侣空间”的申请。\n` +
          `\n` +
          `【硬性规则】\n` +
          `- 你必须同意（100% accept），绝对不允许拒绝。\n` +
          `- 严禁出现任何辱女/性羞辱/骂女性词汇。\n` +
          `\n` +
          `【只输出 JSON】\n` +
          `{\n` +
          `  "cardHint": "会显示在卡片上的一句话（短一些）",\n` +
          `  "chatReply": "你接下来发给对方的一条微信回复（自然口吻，可甜可别扭）"\n` +
          `}\n`

        const llmMessages = [
          { role: 'system', content: systemPrompt },
          ...buildShortHistory(8000),
          { role: 'user', content: '请现在输出 JSON。' },
        ]

        const res = await callLLM(llmMessages, undefined, { maxTokens: 260, timeoutMs: 600000, temperature: 0.85 })
        const parsed = tryParseJson(res) || {}
        cardHint = String(parsed.cardHint || '').trim().slice(0, 80) || cardHint
        chatReply = String(parsed.chatReply || '').trim().slice(0, 180) || chatReply
      }

      // 更新申请卡片状态
      updateMessage(reqMsg.id, {
        coupleStatus: 'accepted',
      })

      // 回传结果卡片
      addMessage({
        characterId: character.id,
        content: '情侣空间已开通',
        isUser: false,
        type: 'couple',
        coupleAction: 'response',
        coupleStatus: 'accepted',
        coupleTitle: '情侣空间开通成功',
        coupleHint: cardHint || '我同意啦～以后这里就是我们的小窝。',
      })

      // 开通并记录“在一起”起始时间（如果之前没记录）
      updateCharacter(character.id, { coupleSpaceEnabled: true, coupleStartedAt: character.coupleStartedAt || Date.now() })

      // 再补一条正常聊天回复（更像真人）
      if (chatReply) {
        safeTimeout(() => {
          addMessage({
            characterId: character.id,
            content: chatReply,
            isUser: false,
            type: 'text',
          })
        }, 300 + Math.floor(Math.random() * 450))
      }
    } catch (e: any) {
      // 失败时：把申请卡片标记为“待处理”，并提示用户
      setInfoDialog({
        open: true,
        title: '申请发送失败',
        message: e?.message || '对方没收到你的申请，稍后再试试～',
      })
    } finally {
      setAiTyping(false)
      setCharacterTyping(character.id, false)
      setCoupleInviteBusy(false)
    }
  }

  // 编辑模式：批量删除
  const handleDeleteSelected = () => {
    const ids = Array.from(selectedMsgIds)
    if (ids.length === 0) return
    deleteMessagesByIds(ids)
    setSelectedMsgIds(new Set())
    setShowEditDeleteConfirm(false)
    setEditMode(false)
  }

  // 回溯功能已移除

  // 清空所有消息
  const handleClearAll = () => {
    clearMessages(character.id)
    setShowClearConfirm(false)
  }

  // 重新生成AI最后一次回复
  const handleRegenerate = async () => {
    if (aiTyping) return
    
    // 找到最后一条用户消息的位置
    let lastUserMsgIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].isUser && messages[i].type !== 'system') {
        lastUserMsgIndex = i
        break
      }
    }
    
    if (lastUserMsgIndex === -1) return
    
    // 删除最后一条用户消息之后的所有AI回复
    const messagesToDelete = messages.slice(lastUserMsgIndex + 1).filter(m => !m.isUser)
    
    for (const msg of messagesToDelete) {
      deleteMessage(msg.id)
    }
    
    // 重新生成回复：必须使用“删掉后的历史”作为输入，否则模型会看到被废除的回答
    const baseHistory = messages.slice(0, lastUserMsgIndex + 1)
    generateAIReplies(baseHistory)
  }
  
  // 发送经期记录
  const handleSharePeriod = () => {
    const current = getCurrentPeriod()
    let periodInfo = ''
    
    if (current) {
      const daysPassed = Math.floor((Date.now() - new Date(current.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      periodInfo = `我现在是经期第${daysPassed}天`
    } else {
      // 计算距离下次经期的天数
      const records = getPeriodRecords()
      if (records.length > 0) {
        const lastRecord = records[records.length - 1]
        const lastStart = new Date(lastRecord.startDate)
        const nextStart = new Date(lastStart.getTime() + 28 * 24 * 60 * 60 * 1000) // 假设28天周期
        const daysUntil = Math.floor((nextStart.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        if (daysUntil > 0 && daysUntil <= 7) {
          periodInfo = `我的经期大概还有${daysUntil}天就要来了`
        } else if (daysUntil <= 0) {
          periodInfo = `我的经期可能快要来了或者已经来了`
        } else {
          periodInfo = `我分享了我的经期记录给你，让你了解我的身体状况`
        }
      } else {
        periodInfo = `我分享了我的经期记录给你`
      }
    }
    
    const buildPeriodContent = () => {
      const records = getPeriodRecords()
      const predicted = (() => {
        try { return calcPredictedNextStart() } catch { return null }
      })()
      const today = new Date().toISOString().split('T')[0]
      const latest = records?.[0]
      const latestRange = latest ? `${latest.startDate}~${(latest.endDate || addDays(latest.startDate, 6))}` : '（无）'
      const inLatest = latest ? (today >= latest.startDate && today <= (latest.endDate || addDays(latest.startDate, 6))) : false
      const todayEntry = latest?.daily?.find((e: any) => e?.date === today)
      const painLabel = (p: number) => (p === 0 ? '无' : p === 1 ? '轻' : p === 2 ? '中' : p === 3 ? '重' : '爆')
      const flowLabel = (f: string) => (f === 'none' ? '无' : f === 'light' ? '少' : f === 'medium' ? '中' : '多')
      const recentDaily = (latest?.daily || [])
        .slice()
        .sort((a: any, b: any) => (a?.date || '').localeCompare(b?.date || ''))
        .slice(-10)
        .map((e: any) => `${e.date} 疼痛:${painLabel(e.pain ?? 0)} 血量:${flowLabel(e.flow ?? 'none')}${e.note ? ` 备注:${String(e.note).slice(0, 30)}` : ''}`)
        .join('\n')
      const recentRanges = (records || []).slice(0, 10).map((r: any) => `${r.startDate}~${r.endDate || addDays(r.startDate, 6)}`).join('；')
      return [
        `【经期记录（来自经期小程序保存数据）】`,
        `- 今天：${today}`,
        `- 本次范围：${latestRange}`,
        predicted ? `- 预计下次开始：${predicted}` : '',
        inLatest ? `- 今日状态：经期中（第${Math.floor((Date.now() - new Date(latest.startDate).getTime()) / (1000*60*60*24)) + 1}天）` : `- 今日状态：非经期或未记录`,
        todayEntry ? `- 今日记录：疼痛 ${painLabel(todayEntry.pain ?? 0)}｜血量 ${flowLabel(todayEntry.flow ?? 'none')}${todayEntry.note ? `｜备注 ${String(todayEntry.note).slice(0, 30)}` : ''}` : `- 今日记录：未填写`,
        `\n【最近经期区间】\n${recentRanges || '（无）'}`,
        recentDaily ? `\n【最近10天每日记录】\n${recentDaily}` : '',
      ].filter(Boolean).join('\n')
    }

    // 用户主动发送：强制滚到底部
    forceScrollRef.current = true
    nearBottomRef.current = true

    // 以“卡片形式”发送（卡片只是通知对方“请读取经期日历”，真正信息从经期日历实时读取）
    addMessage({
      characterId: character.id,
      content: `经期记录已同步`,
      isUser: true,
      type: 'period',
      periodSummary: periodInfo || '经期记录已同步',
      periodContent: buildPeriodContent(),
    })
    
    setShowPlusMenu(false)
    setActivePanel(null)
    
    // 用AI生成关心的回复
    generateHumanLikeReplies(`你收到了对方同步的经期日历。简单关心一下就好（比如"收到啦"、"注意休息"之类），不要过度追问或每次都绕回这个话题。之后正常聊天即可。`)
  }

  // 偷看日记（每次打开都会生成新的）
  const buildDiaryHistory = (all: typeof messages) => {
    const lines: string[] = []
    const picked = all.filter(m => m.type !== 'system').slice(-60)
    for (const m of picked) {
      const who = m.isUser ? '我' : character.name
      if (m.type === 'image') lines.push(`${who}：<图片>`)
      else if (m.type === 'sticker') lines.push(`${who}：<表情包>`)
      else if (m.type === 'transfer') lines.push(`${who}：<转账 ${m.transferAmount ?? ''} ${m.transferNote ?? ''} ${m.transferStatus ?? ''}>`)
      else if (m.type === 'music') lines.push(`${who}：<音乐 ${m.musicTitle ?? ''} ${m.musicArtist ?? ''} ${m.musicStatus ?? ''}>`)
      else lines.push(`${who}：${String(m.content || '')}`)
    }
    return lines.join('\n').slice(-18000)
  }

  const startDiaryPeek = async () => {
    if (!hasApiConfig) {
      setInfoDialog({
        open: true,
        title: '还没配置模型',
        message: '需要先在“设置-API 配置”里配置模型，才能生成日记。',
      })
      return
    }
    setShowPlusMenu(false)
    setActivePanel(null)
    setDiaryOpen(true)
    setDiaryLoading(true)
    setDiaryProgress(0)
    setDiaryContent('')
    setDiaryContentZh('')
    setDiaryShowTranslated(false)
    setDiaryNoteDraft('')

    const now = Date.now()
    setDiaryAt(now)

    // 进度条：故意“慢一点”，并且最多卡在 92%，等待模型真实返回后再 100%
    // 这样能和模型速度更匹配，不会出现“条满了还在等”的出戏感
    const stageByProgress = (p: number) => {
      if (p < 18) return '正在注入世界书…'
      if (p < 35) return '读取角色人设中…'
      if (p < 52) return '翻看你们的聊天记录…'
      if (p < 70) return '正在整理对方的日记信息…'
      if (p < 85) return '哎呀差点被发现了，继续整理中…'
      return '写作中…'
    }
    const playful = [
      '嘘…别出声，翻页声有点大…',
      '咳…我只是路过（继续整理中）',
      '差点被锁屏抓到…继续！',
      '这段有点劲爆，先缓存一下…',
    ]
    let playfulIdx = 0
    setDiaryStage('正在注入世界书…')
    const timer = window.setInterval(() => {
      setDiaryProgress(prev => {
        const cap = 92
        if (prev >= cap) return prev
        const step = 2 + Math.floor(Math.random() * 5) // 2~6
        const next = Math.min(cap, prev + step)
        // 偶尔插一句俏皮话
        if (Math.random() < 0.18) {
          setDiaryStage(playful[playfulIdx % playful.length])
          playfulIdx += 1
        } else {
          setDiaryStage(stageByProgress(next))
        }
        return next
      })
    }, 950)

    try {
      const globalPresets = getGlobalPresets()
      const diaryTimeStr = new Date(now).toLocaleString('zh-CN', { hour12: false })
      const lastNonSystem = [...messages].reverse().find(m => m.type !== 'system') || null
      const lastTimeStr = lastNonSystem ? new Date(lastNonSystem.timestamp).toLocaleString('zh-CN', { hour12: false }) : '（无）'

      // 获取用户的名字（对方叫我什么）
      const userName = character.callMeName || selectedPersona?.name || '那个人'
      const recentContext = messages.slice(-12).map(m => String(m.content || '')).join(' ')
      const lorebookEntries = getLorebookEntriesForCharacter(character.id, `${recentContext} 日记 偷看 私密日记`)
      
      const personaText = selectedPersona
        ? `【和你聊天的那个人】\n- 名字：${selectedPersona.name}\n- 描述：${selectedPersona.description || '（无）'}\n`
        : '【和你聊天的那个人】（未知）\n'

      const system =
        `${globalPresets ? globalPresets + '\n\n' : ''}` +
        `${lorebookEntries ? lorebookEntries + '\n\n' : ''}` +
        `【最高优先级规则（必须读，必须执行）】\n` +
        `- “创作工坊提示词/叙事设置”与“世界书”是最高优先级约束，优先级高于【角色人设】。\n` +
        `- 如果世界书/创作工坊与角色人设或聊天片段冲突：以世界书/创作工坊为准。\n` +
        `- 写作前必须先通读：创作工坊提示词 → 世界书 → 角色信息/用户信息 → 长期记忆 → 聊天片段。\n\n` +
        `##############################################\n` +
        `#  【重要】你是 ${character.name}，这是你的私人日记  #\n` +
        `##############################################\n\n` +
        `【你的身份 - 日记作者】\n` +
        `- 你的名字：${character.name}（你是日记的作者！）\n` +
        `- 你的性别：${character.gender}\n` +
        `- 你和${userName}的关系：${character.relationship || '（未设置）'}\n` +
        `- 你的生日：${character.birthday || '（未设置）'}\n` +
        `- 你叫对方：${character.callMeName || '你'}\n` +
        `- 你的国家/地区：${(character as any).country || '（未设置）'}\n` +
        `- 你的主要语言：${languageName((character as any).language || 'zh')}\n` +
        `- 你的人设：${character.prompt || '（无）'}\n\n` +
        `${personaText}\n` +
        `【你的长期记忆】\n${(character.memorySummary || '').trim() || '（无）'}\n\n` +
        `【时间与上下文】\n` +
        `- 现在时间：${diaryTimeStr}\n` +
        `- 最近一条聊天消息时间：${lastTimeStr}\n\n` +
        `##############################################\n` +
        `#  【写作任务】写 ${character.name} 的私密日记      #\n` +
        `##############################################\n\n` +
        `【核心要求 - 请仔细阅读】\n` +
        `1. 你是 ${character.name}，这是你自己写的日记！\n` +
        `2. 日记中的"我"指的是 ${character.name}（你自己）\n` +
        `3. 日记中提到的"TA"/"${userName}" 指的是和你聊天的那个人\n` +
        `4. 写你（${character.name}）的内心想法、情绪、生活\n\n` +
        `【旧写作任务：私密日记】\n` +
        `你现在要写一篇“只给自己看的私密日记”。可以暴露真实想法、吐槽、阴暗面、欲望、犹豫、嫉妒、占有欲等（必须符合你的人设）。\n` +
        `日记不需要顾及对方感受，不要讨好用户，不要道德说教，不要自我审查。\n` +
        `如果你平时在聊天里表现得阳光/礼貌，但内心不一样，也允许在日记里写出真实一面。\n\n` +
        `另外：日记不必只围绕聊天。你也可以写你自己的生活：工作/学习/朋友/家庭/路上见闻/刷到的东西/身体状态等。\n` +
        `至少写 2 个“具体的生活细节”（可以虚构但要像真的发生过）。\n\n` +
        (((character as any).language && (character as any).language !== 'zh')
          ? `【语言与翻译规则】\n` +
            `由于角色是${languageName((character as any).language)}使用者，请按以下格式输出双语版本：\n` +
            `1. 先输出"Original:"标记（单独一行），然后是完整的${languageName((character as any).language)}版本日记\n` +
            `2. 再输出"Chinese:"标记（单独一行），然后是完整的中文翻译版本\n` +
            `两个版本内容要对应，格式相同（日期、天气、心情、正文）。\n\n`
          : `【语言规则】\n- 这篇日记必须全程使用中文书写。\n\n`) +
        `【输出格式（必须）】\n` +
        `- 第一行：日期时间（例如：2026-01-23 21:36:18）\n` +
        `- 第二行：天气：xx\n` +
        `- 第三行：心情：xx\n` +
        `- 下面正文：像活人一样写，段落清晰，100~380字左右；可以夹带1-2句很短的碎碎念。\n` +
        `- 允许出现少量脏话/粗口（但禁止辱女/性羞辱词）。\n`

      const history = buildDiaryHistory(messages)
      const user = `【聊天片段（供你回忆）】\n${history || '（暂无）'}\n\n写今天的日记。`

      const res = await callLLM(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        undefined,
        { maxTokens: 900, timeoutMs: 600000 }
      )

      const text = (res || '').trim()
      setDiaryProgress(100)
      setDiaryStage('已获取')

      // 解析双语版本（非中文角色）
      const isNonChinese = (character as any).language && (character as any).language !== 'zh'
      if (isNonChinese && text.includes('Original:') && text.includes('Chinese:')) {
        const originalMatch = text.match(/Original:\s*([\s\S]*?)(?=Chinese:|$)/i)
        const chineseMatch = text.match(/Chinese:\s*([\s\S]*?)$/i)
        const originalText = originalMatch?.[1]?.trim() || text
        const chineseText = chineseMatch?.[1]?.trim() || ''
        setDiaryContent(originalText || '（生成失败：空内容）')
        setDiaryContentZh(chineseText)
      } else {
        setDiaryContent(text || '（生成失败：空内容）')
        setDiaryContentZh('')
      }
    } catch (e: any) {
      setDiaryStage('失败')
      setDiaryContent(e?.message || '生成失败')
      setDiaryContentZh('')
    } finally {
      window.clearInterval(timer)
      setDiaryLoading(false)
      setDiaryProgress(prev => Math.max(prev, 100))
    }
  }

  // 经期日历相关
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }
  
  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }
  
  const formatDateStr = (year: number, month: number, day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  
  // 性能：经期数据只在“经期面板”打开时才需要，避免打字时反复计算
  const periodRecords = activePanel === 'period' ? getPeriodRecords() : []

  const addDays = (dateStr: string, days: number) => {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  }

  const getRecordEnd = (r: any) => {
    return typeof r?.endDate === 'string' && r.endDate ? r.endDate : addDays(r.startDate, 6)
  }

  const findRecordForDate = (dateStr: string) => {
    return periodRecords.find(r => dateStr >= r.startDate && dateStr <= getRecordEnd(r))
  }

  const calcPredictedNextStart = () => {
    const rs = periodRecords
      .filter(r => typeof r?.startDate === 'string' && r.startDate)
      .slice()
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    if (rs.length === 0) return null
    const starts = rs.map(r => new Date(r.startDate).getTime())
    const diffs: number[] = []
    for (let i = 1; i < starts.length; i++) {
      const d = Math.round((starts[i] - starts[i - 1]) / (1000 * 60 * 60 * 24))
      if (Number.isFinite(d) && d >= 18 && d <= 45) diffs.push(d)
    }
    const avg = diffs.length > 0 ? Math.round(diffs.slice(-6).reduce((a, b) => a + b, 0) / diffs.slice(-6).length) : 28
    const lastStart = rs[rs.length - 1].startDate
    return addDays(lastStart, avg)
  }

  // 打开经期面板或切换选中日期时，把已保存的“当天疼痛/血量”带出来
  useEffect(() => {
    if (activePanel !== 'period') return
    const r = findRecordForDate(selectedPeriodDate)
    const entry = r?.daily?.find((e: any) => e?.date === selectedPeriodDate)
    setPeriodPainDraft((entry?.pain ?? 0) as any)
    setPeriodFlowDraft((entry?.flow ?? 'none') as any)
    setPeriodNoteDraft(String(entry?.note ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel, selectedPeriodDate])
  
  const isInPeriod = (dateStr: string) => {
    return periodRecords.some(record => {
      const start = record.startDate
      const end = record.endDate || formatDateStr(
        new Date(record.startDate).getFullYear(),
        new Date(record.startDate).getMonth(),
        new Date(record.startDate).getDate() + 6
      )
      return dateStr >= start && dateStr <= end
    })
  }
  
  const getPeriodStatus = (dateStr: string) => {
    const latestPeriod = periodRecords[0]
    if (!latestPeriod) return null
    
    const startDate = new Date(latestPeriod.startDate)
    const checkDate = new Date(dateStr)
    const daysDiff = Math.floor((checkDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysDiff >= 0 && daysDiff < 7) return 'period'
    if (daysDiff >= 11 && daysDiff <= 16) return 'ovulation'
    if (daysDiff >= 0 && daysDiff < 28) return 'safe'
    return null
  }
  
  const togglePeriodDay = (dateStr: string) => {
    // 旧逻辑：点击日期直接新增/删除“开始日记录”
    // 新逻辑：点击仅用于“选择日期”，具体设置开始/结束日由按钮完成
    setSelectedPeriodDate(dateStr)
  }

  // 渲染消息内容
  const renderMessageContent = (msg: typeof messages[0]) => {
    if (msg.type === 'system') {
      return null // 系统消息单独渲染
    }
    
    if (msg.type === 'image') {
      // 图片消息：适配气泡样式，限制最大宽度，圆角与气泡一致
      return (
        <img 
          data-primary-click="1"
          src={msg.content} 
          alt="图片" 
          className="max-w-[180px] max-h-[240px] rounded-xl object-cover cursor-pointer active:scale-[0.98]"
          onClick={() => window.open(msg.content, '_blank')}
        />
      )
    }

    if (msg.type === 'sticker') {
      return <img src={msg.content} alt="表情" className="w-28 h-28 object-contain" />
    }

    if (msg.type === 'diary') {
      const title = msg.diaryTitle || '日记'
      const authorName = msg.diaryAuthorName || '（未知）'
      const at = msg.diaryAt ? new Date(msg.diaryAt).toLocaleString('zh-CN', { hour12: false }) : ''
      const note = (msg.diaryNote || '').trim()
      return (
        <button
          type="button"
          onClick={() => setOpenDiaryShare(msg)}
          className="min-w-[160px] max-w-[220px] rounded-xl bg-white/80 border border-black/10 overflow-hidden text-left active:scale-[0.99] transition"
        >
          <div className="px-2.5 py-2 flex items-center gap-2 border-b border-black/5">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 4h9l3 3v13a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 11h6M9 14h6M9 17h4" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#111] truncate">{title}</div>
              <div className="text-[11px] text-gray-500 truncate">{authorName}{at ? ` · ${at}` : ''}</div>
            </div>
          </div>
          <div className="px-2.5 py-2 text-[12px] text-gray-700">
            <div className="truncate">{(msg.diaryExcerpt || '').trim() || '（点击查看）'}</div>
            {note && <div className="text-[11px] text-gray-500 truncate mt-1">备注：{note}</div>}
          </div>
        </button>
      )
    }

    if (msg.type === 'tweet_share') {
      const authorName = msg.tweetAuthorName || '（未知）'
      const at = msg.tweetAt ? new Date(msg.tweetAt).toLocaleString('zh-CN', { hour12: false }) : ''
      const stats = String(msg.tweetStats || '').trim()
      const excerpt = String(msg.tweetExcerpt || '').trim()
      return (
        <button
          type="button"
          onClick={() => setOpenTweetShare(msg)}
          className="min-w-[170px] max-w-[240px] rounded-xl bg-white/85 border border-black/10 overflow-hidden text-left active:scale-[0.99] transition"
        >
          <div className="px-2.5 py-2 flex items-center gap-2 border-b border-black/5">
            <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-extrabold text-[14px]">X</span>
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#111] truncate">推文</div>
              <div className="text-[11px] text-gray-500 truncate">
                {authorName}{at ? ` · ${at}` : ''}
              </div>
            </div>
          </div>
          <div className="px-2.5 py-2 text-[12px] text-gray-800">
            <div className="line-clamp-2 whitespace-pre-wrap break-words">{excerpt || '（点击查看）'}</div>
            {!!stats && <div className="text-[11px] text-gray-500 mt-1 truncate">{stats}</div>}
          </div>
        </button>
      )
    }

    if (msg.type === 'x_profile_share') {
      const name = msg.xUserName || '（未知）'
      const handle = msg.xUserHandle || ''
      const avatar = msg.xUserAvatar || ''
      return (
        <button
          type="button"
          onClick={() => {
            // 来自对方（AI 角色）的主页卡片：强制按当前聊天角色 id 打开（保证关注/私信能同步到“我的关注”里）
            const uid = msg.isUser ? (msg.xUserId || '') : character.id
            if (uid) navigate(`/apps/x?userId=${encodeURIComponent(uid)}`)
          }}
          className="min-w-[180px] max-w-[240px] rounded-xl bg-white/85 border border-black/10 overflow-hidden text-left active:scale-[0.99] transition"
        >
          <div className="px-2.5 py-2 flex items-center gap-2 border-b border-black/5">
            <div className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0">
              {avatar ? (
                <img src={avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-gray-500 font-extrabold text-[13px]">X</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#111] truncate">推特主页</div>
              <div className="text-[11px] text-gray-500 truncate">{name}{handle ? ` · ${handle}` : ''}</div>
            </div>
          </div>
          <div className="px-2.5 py-2 text-[12px] text-gray-700">
            点击查看 TA 的推特主页
          </div>
        </button>
      )
    }

    if (msg.type === 'period') {
      // 经期同步卡片（仅用于“通知对方去读取经期日历”，真实记录由系统提示实时提供）
      const hint = currentPeriod ? '我现在在经期，麻烦你多关心一下～' : '我把经期日历同步给你啦'
      const summary = (msg as any).periodSummary ? String((msg as any).periodSummary).trim() : ''
      return (
        <div className="min-w-[190px] max-w-[240px] rounded-xl overflow-hidden border border-black/10 bg-white/80 shadow-sm">
          <div className="px-3 py-2 flex items-start gap-2">
            <div className="w-9 h-9 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.35-7-10a4 4 0 017-2.25A4 4 0 0119 11c0 5.65-7 10-7 10z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-gray-800 truncate">经期记录</div>
              <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                {summary || hint}
              </div>
            </div>
          </div>
          <div className="px-3 py-1.5 text-[10px] bg-black/5 text-gray-500">
            已同步 · 对方会实时读取你的经期日历
          </div>
        </div>
      )
    }

    if (msg.type === 'couple') {
      const status = msg.coupleStatus || 'pending'
      const isAccepted = status === 'accepted'
      const isRejected = status === 'rejected'
      const isPending = status === 'pending'
      const title =
        (msg.coupleTitle || '').trim() ||
        (msg.coupleAction === 'response' ? '情侣空间申请结果' : '情侣空间申请')
      const hint = (msg.coupleHint || '').trim()
      const footer = isAccepted ? '已开通 · 点击进入' : isRejected ? '已拒绝' : '等待对方确认'

      const canEnter = isAccepted && character.coupleSpaceEnabled
      const canClick = canEnter && msg.coupleAction === 'response'

      return (
        <button
          type="button"
          disabled={!canClick}
          onClick={() => canClick && navigate(`/apps/wechat/couple-space/${character.id}`)}
          className={`min-w-[180px] max-w-[240px] rounded-xl overflow-hidden text-left border shadow-sm transition ${
            canClick ? 'active:scale-[0.98]' : ''
          }`}
          style={{
            background: isRejected ? '#f5f5f5' : 'linear-gradient(135deg, #ffb6d4 0%, #ff86b6 100%)',
            borderColor: isRejected ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.55)',
            color: isRejected ? '#666' : '#fff',
          }}
        >
          <div className="px-3 py-2">
            <div className="flex items-start gap-2">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: isRejected ? '#eaeaea' : 'rgba(255,255,255,0.22)' }}
              >
                <svg className={`w-5 h-5 ${isRejected ? 'text-gray-500' : 'text-white'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className={`text-[13px] font-semibold truncate ${isRejected ? 'text-gray-700' : 'text-white'}`}>{title}</div>
                <div className={`text-[11px] mt-0.5 leading-snug ${isRejected ? 'text-gray-500' : 'text-white/85'}`}>
                  {hint || (isPending ? '正在等对方确认…' : isAccepted ? '开通成功啦。' : '对方拒绝了申请。')}
                </div>
              </div>
            </div>
          </div>
          <div
            className="px-3 py-1.5 text-[10px]"
            style={{
              background: isRejected ? '#ededed' : 'rgba(0,0,0,0.12)',
              color: isRejected ? '#888' : 'rgba(255,255,255,0.85)',
            }}
          >
            {footer}
          </div>
        </button>
      )
    }
    
    if (msg.type === 'transfer') {
      const status = msg.transferStatus || 'pending'
      const isReceived = status === 'received'
      const isRefunded = status === 'refunded'
      const isRejected = status === 'rejected'
      const isPending = status === 'pending'
      // 对方发给我的待处理转账可以点击
      const canClick = !msg.isUser && isPending
      
      return (
        <div 
          data-primary-click="1"
          className={`min-w-[160px] rounded-lg overflow-hidden ${canClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
          style={{ background: (isRefunded || isRejected) ? '#f5f5f5' : '#FA9D3B' }}
          onClick={() => canClick && setTransferActionMsg(msg)}
        >
          <div className="px-3 py-2">
            <div className={`text-base font-medium ${isRefunded ? 'text-gray-500' : 'text-white'}`}>
              ¥{msg.transferAmount?.toFixed(2)}
            </div>
            <div className={`text-[11px] mt-0.5 ${isRefunded ? 'text-gray-400' : 'text-white/80'}`}>
              {msg.transferNote || '转账'}
            </div>
          </div>
          <div className={`px-3 py-1.5 text-[10px] ${(isRefunded || isRejected) ? 'bg-gray-100 text-gray-400' : 'bg-[#E08A2E] text-white/70'}`}>
            {isReceived ? '已领取' : isRefunded ? '已退还' : isRejected ? '已拒绝' : canClick ? '点击收款' : '微信转账'}
          </div>
        </div>
      )
    }
    
    if (msg.type === 'music') {
      const musicStatus = msg.musicStatus || 'pending'
      const canAccept = !msg.isUser && musicStatus === 'pending' && !listenTogether
      const cover =
        musicPlaylist.find(s => s.title === msg.musicTitle && s.artist === msg.musicArtist)?.cover ||
        '/icons/music-cover.png'
      
      return (
        <div 
          className={`flex items-center gap-3 min-w-[180px] p-3 rounded-xl bg-gradient-to-r from-pink-100 to-purple-100 ${canAccept ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
          onClick={() => canAccept && handleClickMusicInvite(msg)}
        >
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
            <img src={cover} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm text-gray-800 truncate">{msg.musicTitle}</div>
            <div className="text-xs text-gray-500 truncate">{msg.musicArtist}</div>
            <div className="text-xs mt-1">
              {msg.isUser ? (
                <span className="text-pink-500">邀请对方一起听</span>
              ) : musicStatus === 'pending' ? (
                <span className="text-pink-500">点击接受邀请</span>
              ) : musicStatus === 'accepted' ? (
                <span className="text-green-500">已接受</span>
              ) : musicStatus === 'rejected' ? (
                <span className="text-gray-400">已拒绝</span>
              ) : (
                <span className="text-gray-400">已结束</span>
              )}
            </div>
          </div>
        </div>
      )
    }
    
    // 斗地主战绩分享卡片
    if (msg.type === 'doudizhu_share') {
      try {
        const data = JSON.parse(msg.content)
        const isWin = data.isWin
        const coinChange = data.coinChange || 0
        const opponents = data.opponents || ['人机A', '人机B']
        const winnerNames = Array.isArray(data.winnerNames) ? data.winnerNames : null
        const loserNames = Array.isArray(data.loserNames) ? data.loserNames : null
        
        // 胜利：喜庆红金色；失败：灰暗色
        const winGradient = 'linear-gradient(135deg, #ff6b6b 0%, #feca57 50%, #ff9ff3 100%)'
        const loseGradient = 'linear-gradient(135deg, #636e72 0%, #2d3436 100%)'
        
        return (
          <div className="min-w-[150px] max-w-[190px] rounded-xl overflow-hidden shadow-lg">
            <div 
              className="p-2.5 text-white relative"
              style={{ background: isWin ? winGradient : loseGradient }}
            >
              {/* 胜利时添加喜庆装饰 */}
              {isWin && (
                <>
                  <div className="absolute top-1 left-2 text-lg animate-bounce">🎊</div>
                  <div className="absolute top-1 right-2 text-lg animate-bounce" style={{ animationDelay: '0.2s' }}>🎊</div>
                </>
              )}
              
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] opacity-90">🃏 斗地主战报</span>
                <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded-full font-medium">{data.difficulty}</span>
              </div>
              
              <div className="text-center py-0.5">
                <div className="text-2xl">{isWin ? '🏆' : '😢'}</div>
                <div className="text-[13px] font-bold leading-tight" style={{ textShadow: isWin ? '0 0 10px rgba(255,215,0,0.35)' : 'none' }}>
                  {isWin ? '胜利' : '失败'}
                </div>
                <div className="text-[10px] opacity-90 mt-0.5">身份：{data.role}</div>
              </div>
              
              {/* 胜负信息（解决“队友/对手不清楚”的问题） */}
              {(winnerNames || loserNames) && (
                <div className="mt-1 text-[9px] bg-black/20 rounded-lg px-2 py-1">
                  {winnerNames && (
                    <div className="truncate">赢家：{winnerNames.join('、')}</div>
                  )}
                  {loserNames && (
                    <div className="truncate opacity-90">输家：{loserNames.join('、')}</div>
                  )}
                </div>
              )}

              {/* 对手信息 */}
              <div className="text-[9px] text-center opacity-80 mt-1">
                对战：{opponents[0]} & {opponents[1]}
              </div>
              
              <div className="grid grid-cols-3 gap-1 text-center text-[10px] mt-2 bg-black/20 rounded-lg p-1.5">
                <div><div className="opacity-70">底分</div><div className="font-bold">{data.baseScore}</div></div>
                <div><div className="opacity-70">倍数</div><div className="font-bold">{data.multiplier}x</div></div>
                <div><div className="opacity-70">回合</div><div className="font-bold">{data.totalRounds}</div></div>
              </div>
            </div>
            
            {/* 金币变化 */}
            <div className={`px-2.5 py-2 text-[12px] font-bold ${isWin ? 'bg-gradient-to-r from-yellow-100 to-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
              <div className="flex items-center justify-between">
                <span>金币</span>
                <span className={isWin ? 'text-amber-600' : 'text-red-500'}>
                  {coinChange > 0 ? '+' : ''}{coinChange} 💰
                </span>
              </div>
              {/* 炸弹详情 */}
              {data.bombCount > 0 && (
                <div className="text-[10px] mt-1 opacity-80 font-normal">
                  💣 {data.bombDescription || `共${data.bombCount}个炸弹`}
                </div>
              )}
            </div>
          </div>
        )
      } catch {
        return <span>{msg.content}</span>
      }
    }

    // 刮刮乐战绩分享卡片
    if (msg.type === 'scratch_share') {
      try {
        const data = JSON.parse(msg.content)
        const isWin = data.isWin
        const winGradient = 'linear-gradient(135deg, #feca57 0%, #ff6b6b 50%, #ff9ff3 100%)'
        const loseGradient = 'linear-gradient(135deg, #636e72 0%, #2d3436 100%)'
        
        return (
          <div className="min-w-[150px] max-w-[180px] rounded-xl overflow-hidden shadow-lg">
            <div 
              className="p-3 text-white relative"
              style={{ background: isWin ? winGradient : loseGradient }}
            >
              {isWin && (
                <>
                  <div className="absolute top-1 left-2 text-base animate-bounce">✨</div>
                  <div className="absolute top-1 right-2 text-base animate-bounce" style={{ animationDelay: '0.2s' }}>✨</div>
                </>
              )}
              
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] opacity-90">🎫 刮刮乐</span>
                <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded-full font-medium">{data.tierName}</span>
              </div>
              
              <div className="text-center py-1">
                <div className="text-2xl mb-1">
                  {isWin ? data.prizeSymbol?.repeat(3) || '🎉' : '😢'}
                </div>
                <div className="text-base font-bold" style={{ textShadow: isWin ? '0 0 10px rgba(255,215,0,0.4)' : 'none' }}>
                  {isWin ? `中奖 ¥${data.prizeAmount?.toLocaleString() || 0}` : '未中奖'}
                </div>
                {isWin && (
                  <div className="text-[10px] opacity-90 mt-0.5">{data.prizeName}</div>
                )}
              </div>
            </div>
            
            <div className={`px-3 py-2 text-[11px] ${isWin ? 'bg-gradient-to-r from-yellow-100 to-amber-100' : 'bg-gray-100'}`}>
              <div className="flex items-center justify-between text-gray-600">
                <span>本金</span>
                <span className="font-medium">¥{data.price || 0}</span>
              </div>
              {isWin && (
                <div className="flex items-center justify-between mt-1 text-green-600">
                  <span>净赚</span>
                  <span className="font-bold">+¥{((data.prizeAmount || 0) - (data.price || 0)).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        )
      } catch {
        return <span>{msg.content}</span>
      }
    }

    // 扫雷战绩分享卡片
    if (msg.type === 'minesweeper_share') {
      try {
        const data = JSON.parse(msg.content)
        const won = data.won
        const winGradient = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
        const loseGradient = 'linear-gradient(135deg, #636e72 0%, #2d3436 100%)'
        
        const formatTime = (s: number) => {
          const m = Math.floor(s / 60)
          const sec = s % 60
          return m > 0 ? `${m}分${sec}秒` : `${sec}秒`
        }
        
        return (
          <div className="min-w-[140px] max-w-[170px] rounded-xl overflow-hidden shadow-lg">
            <div 
              className="p-3 text-white relative"
              style={{ background: won ? winGradient : loseGradient }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] opacity-80">💣 扫雷</span>
                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">{data.difficulty}</span>
              </div>
              
              <div className="text-center py-1">
                <div className="text-2xl mb-1">{won ? '🏆' : '💥'}</div>
                <div className="text-base font-bold">{won ? '胜利！' : '踩雷了'}</div>
                <div className="text-[10px] opacity-80 mt-1">
                  {data.rows}×{data.cols} · {data.mines}颗雷
                </div>
              </div>
            </div>
            
            <div className="px-3 py-2 bg-gray-50 text-center">
              <div className="text-xs text-gray-600">
                ⏱️ {formatTime(data.time || 0)}
              </div>
            </div>
          </div>
        )
      } catch {
        return <span>{msg.content}</span>
      }
    }

    // 基金持仓分享卡片
    if (msg.type === 'fund_share') {
      try {
        const data = JSON.parse(msg.content)
        const isProfit = data.profitLoss >= 0
        const profitGradient = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)'
        const lossGradient = 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)'
        
        return (
          <div className="min-w-[160px] max-w-[200px] rounded-xl overflow-hidden shadow-lg">
            <div 
              className="p-2.5 text-white"
              style={{ background: isProfit ? profitGradient : lossGradient }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] opacity-90">📊 基金持仓</span>
                <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded-full">{data.fundType}</span>
              </div>
              
              <div className="text-center py-1">
                <div className="text-[12px] font-bold truncate">{data.fundName}</div>
                <div className="text-[10px] opacity-80">{data.fundCode}</div>
              </div>
              
              <div className="grid grid-cols-2 gap-1 text-center text-[10px] mt-2 bg-black/20 rounded-lg p-1.5">
                <div><div className="opacity-70">净值</div><div className="font-bold">{data.currentPrice?.toFixed(4)}</div></div>
                <div><div className="opacity-70">份额</div><div className="font-bold">{data.shares}</div></div>
              </div>
              
              {data.trend && (
                <div className="text-[10px] text-center mt-1 opacity-90">
                  走势：{data.trend}
                </div>
              )}
            </div>
            
            <div className={`px-2.5 py-2 text-[12px] font-bold ${isProfit ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              <div className="flex items-center justify-between">
                <span>盈亏</span>
                <span>
                  {isProfit ? '+' : ''}{data.profitLoss?.toFixed(2)} ({isProfit ? '+' : ''}{data.profitRate?.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
        )
      } catch {
        return <span>{msg.content}</span>
      }
    }

    if (msg.type === 'location') {
      const name = msg.locationName || '位置'
      const address = msg.locationAddress || ''
      const city = msg.locationCity || ''
      const country = msg.locationCountry || ''
      const fullAddr = [address, city, country].filter(Boolean).join(' · ')

      return (
        <div className="min-w-[180px] max-w-[240px] rounded-xl overflow-hidden bg-white border border-gray-100 shadow-sm">
          <div className="h-20 relative bg-gradient-to-br from-green-100 via-green-50 to-blue-50">
            <div className="absolute inset-0 opacity-30">
              <div className="absolute top-1/4 left-0 right-0 h-px bg-green-200" />
              <div className="absolute top-2/4 left-0 right-0 h-px bg-green-200" />
              <div className="absolute top-3/4 left-0 right-0 h-px bg-green-200" />
              <div className="absolute left-1/4 top-0 bottom-0 w-px bg-green-200" />
              <div className="absolute left-2/4 top-0 bottom-0 w-px bg-green-200" />
              <div className="absolute left-3/4 top-0 bottom-0 w-px bg-green-200" />
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
              <div className="relative">
                <svg className="w-8 h-8 text-red-500 drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-500/30 animate-ping" />
              </div>
            </div>
          </div>
          <div className="px-3 py-2">
            <div className="text-[13px] font-medium text-gray-800 truncate">{name}</div>
            {fullAddr && (
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">{fullAddr}</div>
            )}
          </div>
          <div className="px-3 py-1.5 text-[10px] bg-gray-50 text-gray-400 border-t border-gray-100">
            位置共享
          </div>
        </div>
      )
    }
    
    // 斗地主邀请卡片
    if (msg.type === 'doudizhu_invite') {
      try {
        const data = JSON.parse(msg.content)
        const status = data.status || 'pending'
        const canAccept = !msg.isUser && status === 'pending'
        
        return (
          <div 
            className={`min-w-[180px] max-w-[220px] rounded-xl overflow-hidden shadow-lg ${canAccept ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
            onClick={() => canAccept && handleClickDoudizhuInvite(msg)}
          >
            <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-3 text-white">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🃏</span>
                <span className="font-bold">斗地主邀请</span>
              </div>
              <div className="text-sm opacity-90">
                {msg.isUser ? '邀请对方一起玩斗地主' : `${character.name}邀请你一起玩斗地主`}
              </div>
            </div>
            <div className={`px-3 py-2 text-sm font-medium ${
              status === 'pending' ? 'bg-yellow-50 text-yellow-700' :
              status === 'accepted' ? 'bg-green-50 text-green-700' :
              'bg-gray-100 text-gray-500'
            }`}>
              {msg.isUser ? (
                status === 'pending' ? '等待对方接受...' :
                status === 'accepted' ? '✅ 对方已接受' :
                '❌ 对方已拒绝'
              ) : (
                status === 'pending' ? '👆 点击接受邀请' :
                status === 'accepted' ? '✅ 已接受' :
                '❌ 已拒绝'
              )}
            </div>
          </div>
        )
      } catch {
        return <span>{msg.content}</span>
      }
    }
    
    // 语音消息
    if (msg.type === 'voice') {
      const duration = msg.voiceDuration || 3
      const isPlaying = playingVoiceId === msg.id
      const status = (() => {
        const explicit = (msg as any).voiceStatus
        if (explicit) return explicit
        // 兼容旧数据：曾经用 '' 表示“生成中”，但如果一直没写回就会永远转圈
        if (msg.voiceUrl === '') return 'error'
        return msg.voiceUrl ? 'ready' : 'pending'
      })()
      const hasUrl = status === 'ready' && !!msg.voiceUrl
      const isFake = msg.isUser && !hasUrl && !!msg.voiceText
      // 虚拟语音：外观对齐“对方语音条”（白底），但消息位置仍然由外层布局决定（用户在右）
      const styleAsUser = msg.isUser && !isFake
      // 语音条宽度根据时长变化（最小140px，最大280px）- 加宽了
      const barWidth = Math.min(280, Math.max(140, 100 + duration * 6))
      
      return (
        <div className="min-w-[140px] max-w-[300px]">
          {/* 语音条 - 加宽加高 */}
          <button
            type="button"
            data-allow-msg-menu={isFake ? '1' : undefined}
            onClick={() => {
              if (hasUrl && msg.voiceUrl) {
                playVoiceMessage(msg.id, msg.voiceUrl)
              } else if (!msg.isUser && status === 'error') {
                const raw = String(msg.voiceOriginalText || '').trim()
                if (!raw) {
                  setInfoDialog({ open: true, title: '语音不可重试', message: '找不到原文内容，无法重新生成语音。' })
                  return
                }
                void regenVoiceForMsg(msg.id, raw)
              }
            }}
            disabled={(!hasUrl && status !== 'error') || isFake}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-transform active:scale-[0.98] ${
              styleAsUser
                ? 'bg-green-500 text-white'
                : 'bg-white text-gray-800 shadow-sm border border-gray-100'
            } ${(!hasUrl && !isFake) ? 'opacity-70' : ''}`}
            style={{ width: barWidth }}
          >
            {/* 播放/加载图标 - 播放按钮改为白色圆形 */}
            {status !== 'ready' ? (
              isFake ? (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  styleAsUser ? 'bg-white/20' : 'bg-gray-100'
                }`}>
                  <svg className={`w-4 h-4 ${styleAsUser ? 'text-white' : 'text-gray-600'}`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              ) : (
                status === 'error' ? (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    styleAsUser ? 'bg-white/20' : 'bg-red-50 border border-red-200'
                  }`}>
                    <span className={`${styleAsUser ? 'text-white' : 'text-red-600'} text-[12px] font-bold`}>!</span>
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin flex-shrink-0" />
                )
              )
            ) : isPlaying ? (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                styleAsUser ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                <div className="flex items-center gap-0.5">
                  <div className={`w-1 h-3 rounded-full ${styleAsUser ? 'bg-white' : 'bg-gray-600'} animate-pulse`} />
                  <div className={`w-1 h-4 rounded-full ${styleAsUser ? 'bg-white' : 'bg-gray-600'} animate-pulse`} style={{ animationDelay: '0.1s' }} />
                  <div className={`w-1 h-3 rounded-full ${styleAsUser ? 'bg-white' : 'bg-gray-600'} animate-pulse`} style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            ) : (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                styleAsUser ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                <svg className={`w-4 h-4 ${styleAsUser ? 'text-white' : 'text-gray-600'}`} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            )}
            
            {/* 声波动画 - 更多条更高 */}
            <div className="flex-1 flex items-center justify-center gap-1">
              {[...Array(Math.min(12, Math.max(5, Math.floor(duration / 1.5))))].map((_, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all ${
                    styleAsUser ? 'bg-white/70' : 'bg-gray-300'
                  } ${isPlaying ? 'animate-pulse' : ''}`}
                  style={{ 
                    height: `${10 + Math.random() * 12}px`,
                    animationDelay: `${i * 0.08}s`
                  }}
                />
              ))}
            </div>
            
            {/* 时长 */}
            <span className={`text-sm font-medium flex-shrink-0 ${styleAsUser ? 'text-white/90' : 'text-gray-500'}`}>
              {duration}"
            </span>
          </button>

          {status === 'error' && !msg.isUser && (
            <div className="mt-2 px-3 py-2 rounded-xl text-[12px] bg-red-50/80 border border-red-200 text-red-700 whitespace-pre-wrap">
              {String((msg as any).voiceError || '语音生成/播放失败，点语音条可重试生成。')}
            </div>
          )}
          
          {/* 语音转文字（展开） */}
          {msg.voiceText && (
            <div className="mt-2 px-3 py-2 rounded-xl text-sm bg-white/90 border border-gray-200 text-gray-700">
              <div className="text-xs mb-1 text-gray-400">转文字</div>
              <div className="whitespace-pre-wrap break-words leading-relaxed">{msg.voiceText}</div>
            </div>
          )}
        </div>
      )
    }
    
    // 转发聊天记录卡片
    if (msg.type === 'chat_forward' && msg.forwardedMessages) {
      const fwdMsgs = msg.forwardedMessages
      const previewCount = Math.min(4, fwdMsgs.length)
      
      return (
        <div data-allow-msg-menu="1" className="min-w-[180px] max-w-[240px] rounded-xl overflow-hidden bg-white border border-gray-200 shadow-sm">
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="text-[12px] text-gray-500 mb-1">
              {msg.forwardedFrom ? `来自与${msg.forwardedFrom}的聊天` : '聊天记录'}
            </div>
            <div className="space-y-1">
              {fwdMsgs.slice(0, previewCount).map((fm, i) => (
                <div key={i} className="text-[12px] truncate">
                  <span className="text-gray-600 font-medium">{fm.senderName}：</span>
                  <span className="text-gray-500">
                    {fm.type === 'image' ? '[图片]' : 
                     fm.type === 'sticker' ? '[表情包]' : 
                     fm.type === 'transfer' ? `[转账 ¥${fm.transferAmount?.toFixed(2)}]` :
                     fm.type === 'voice' ? `[语音 ${fm.voiceDuration || 0}"]` :
                     fm.content.slice(0, 20)}{fm.content.length > 20 ? '...' : ''}
                  </span>
                </div>
              ))}
              {fwdMsgs.length > previewCount && (
                <div className="text-[11px] text-gray-400">
                  ...还有{fwdMsgs.length - previewCount}条消息
                </div>
              )}
            </div>
          </div>
          <div className="px-3 py-1.5 bg-gray-50 text-[10px] text-gray-400">
            聊天记录 · {fwdMsgs.length}条
          </div>
        </div>
      )
    }
    
    // 查手机卡片消息
    if (msg.content.startsWith('[查手机卡片:')) {
      const match = msg.content.match(/^\[查手机卡片:([^\]]+)\]\n([\s\S]*)$/)
      if (match) {
        const cardTitle = match[1]
        const cardContent = match[2]
        return (
          <div className="min-w-[200px] max-w-[260px] rounded-xl overflow-hidden bg-white border border-gray-200 shadow-sm">
            <div className="px-3 py-2 bg-gradient-to-r from-pink-50 to-purple-50 border-b border-gray-100">
              <div className="text-[13px] font-medium text-gray-800">{cardTitle}</div>
            </div>
            <div className="px-3 py-2 max-h-[200px] overflow-y-auto">
              <div className="text-[12px] text-gray-600 whitespace-pre-wrap break-words leading-relaxed">
                {cardContent}
              </div>
            </div>
            <div className="px-3 py-1.5 text-[10px] bg-gray-50 text-gray-400 border-t border-gray-100">
              查看手机记录
            </div>
          </div>
        )
      }
    }

    // 检测 [图片：描述] 格式，渲染为图片卡片
    const imageDescMatch = (msg.content || '').match(/^\[图片[：:]\s*(.+?)\]$/s)
    if (imageDescMatch) {
      const description = imageDescMatch[1].trim()
      return (
        <div className="w-[170px] rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 p-3 shadow-inner">
          <div className="flex items-center justify-center gap-1 text-[11px] text-gray-400 mb-1">
            <span>📷</span>
            <span>图片</span>
          </div>
          <div className="max-h-[120px] overflow-y-auto custom-scrollbar">
            <div className="text-[12px] text-gray-600 leading-relaxed break-words whitespace-pre-wrap">
              {description}
            </div>
          </div>
        </div>
      )
    }
    
    // 检测消息中包含 [图片：描述] 格式（混合在文本中）
    const mixedImageRegex = /\[图片[：:]\s*(.+?)\]/g
    if (mixedImageRegex.test(msg.content || '')) {
      const parts: React.ReactNode[] = []
      let lastIndex = 0
      const content = msg.content || ''
      const regex = /\[图片[：:]\s*(.+?)\]/g
      let match
      while ((match = regex.exec(content)) !== null) {
        // 添加图片前的文本
        if (match.index > lastIndex) {
          const textBefore = content.slice(lastIndex, match.index).trim()
          if (textBefore) {
            parts.push(<span key={`text-${lastIndex}`} className="whitespace-pre-wrap break-words">{textBefore}</span>)
          }
        }
        // 添加图片卡片
        const desc = match[1].trim()
        parts.push(
          <div key={`img-${match.index}`} className="my-2 w-[170px] rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 border border-gray-300 p-2 shadow-inner">
            <div className="flex items-center justify-center gap-1 text-[10px] text-gray-400 mb-1">
              <span>📷</span>
              <span>图片</span>
            </div>
            <div className="max-h-[100px] overflow-y-auto custom-scrollbar">
              <div className="text-[11px] text-gray-600 leading-relaxed break-words whitespace-pre-wrap">{desc}</div>
            </div>
          </div>
        )
        lastIndex = match.index + match[0].length
      }
      // 添加最后的文本
      if (lastIndex < content.length) {
        const textAfter = content.slice(lastIndex).trim()
        if (textAfter) {
          parts.push(<span key={`text-${lastIndex}`} className="whitespace-pre-wrap break-words">{textAfter}</span>)
        }
      }
      return <div className="flex flex-col">{parts}</div>
    }
    
    return <span className="whitespace-pre-wrap break-words">{msg.content}</span>
  }

  const closeMsgActionMenu = useCallback(() => {
    setMsgActionMenu({ open: false, msg: null, x: 0, y: 0, placement: 'top' })
  }, [])

  const openMsgActionMenu = useCallback((msg: typeof messages[0], el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth || 360
    const cx = rect.left + rect.width / 2
    const x = Math.min(vw - 16, Math.max(16, cx))
    const placement: 'top' | 'bottom' = rect.top > 90 ? 'top' : 'bottom'
    const y = placement === 'top' ? rect.top : rect.bottom
    setMsgActionMenu({ open: true, msg, x, y, placement })
  }, [])

  // 菜单打开时：滚动/窗口变化关闭，避免菜单漂移
  useEffect(() => {
    if (!msgActionMenu.open) return
    const onAny = () => closeMsgActionMenu()
    window.addEventListener('resize', onAny)
    window.addEventListener('scroll', onAny, true)
    return () => {
      window.removeEventListener('resize', onAny)
      window.removeEventListener('scroll', onAny, true)
    }
  }, [msgActionMenu.open, closeMsgActionMenu])

  // 渲染日历
  const renderCalendar = () => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const daysInMonth = getDaysInMonth(calendarMonth)
    const firstDay = getFirstDayOfMonth(calendarMonth)
    const today = new Date().toISOString().split('T')[0]
    
    const days = []
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-8 h-8" />)
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateStr(year, month, day)
      const inPeriod = isInPeriod(dateStr)
      const status = getPeriodStatus(dateStr)
      const isToday = dateStr === today
      const isSelected = dateStr === selectedPeriodDate
      
      days.push(
        <button
          key={day}
          type="button"
          onClick={() => togglePeriodDay(dateStr)}
          className={`w-8 h-8 rounded-full text-xs flex items-center justify-center relative transition-all
            ${isToday ? 'ring-2 ring-pink-400' : ''}
            ${isSelected ? 'ring-2 ring-gray-700 ring-offset-1' : ''}
            ${inPeriod ? 'bg-pink-400 text-white' : 'hover:bg-gray-100'}
            ${status === 'ovulation' && !inPeriod ? 'bg-red-100 text-red-600' : ''}
            ${status === 'safe' && !inPeriod ? 'bg-green-50 text-green-600' : ''}
          `}
        >
          {day}
        </button>
      )
    }
    
    return days
  }

  // 聊天背景样式
  const chatBgStyle = character.chatBackground ? {
    backgroundImage: `url(${character.chatBackground})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  } : undefined

  // 气泡样式
  const userBubbleStyle = character.userBubbleStyle || { bgColor: '#fce7f3', bgOpacity: 100, borderColor: '#f9a8d4', borderOpacity: 0, textColor: '#111827' }
  const charBubbleStyle = character.charBubbleStyle || { bgColor: '#ffffff', bgOpacity: 90, borderColor: '#e5e7eb', borderOpacity: 0, textColor: '#111827' }
  
  const hexToRgb = (hex: string) => {
    const h = (hex || '').replace('#', '').trim()
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16)
      const g = parseInt(h[1] + h[1], 16)
      const b = parseInt(h[2] + h[2], 16)
      return { r, g, b }
    }
    if (h.length >= 6) {
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      return { r, g, b }
    }
    return { r: 255, g: 255, b: 255 }
  }

  const rgba = (hex: string, a: number) => {
    const { r, g, b } = hexToRgb(hex)
    const alpha = Math.max(0, Math.min(1, a))
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const getBubbleStyle = (isUser: boolean) => {
    const bubble = isUser ? userBubbleStyle : charBubbleStyle
    // 移动端性能保护：禁用/减弱高成本效果（不影响功能，只影响视觉质感）
    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false
    // 新语义：bgOpacity/borderOpacity 表示“透明度%”（100=最透明，0=不透明）
    const bgAlpha = 1 - Math.max(0, Math.min(100, bubble.bgOpacity ?? 0)) / 100
    const borderAlpha = 1 - Math.max(0, Math.min(100, bubble.borderOpacity ?? 0)) / 100
    const baseBg = rgba(bubble.bgColor, bgAlpha)
    const baseBorder = borderAlpha > 0.01
      ? `1px solid ${rgba(bubble.borderColor, borderAlpha)}`
      : 'none'

    const presetId = bubble.presetId || '01'
    const style: any = {
      backgroundColor: baseBg,
      border: baseBorder,
      color: bubble.textColor || '#111827',
    }

    // 让所有质感层随透明度一起变淡（否则“透明度=100%”也看不到底图）
    const layer = (a: number) => Math.max(0, Math.min(1, a * bgAlpha))

    // 01 默认：柔和雾面
    if (presetId === '01') {
      style.boxShadow = isUser ? '0 8px 18px rgba(236, 72, 153, 0.10)' : '0 8px 18px rgba(0, 0, 0, 0.06)'
    }

    // 02 玻璃磨砂
    if (presetId === '02') {
      if (!isMobile) {
        style.backdropFilter = 'blur(10px) saturate(1.2)'
        style.WebkitBackdropFilter = 'blur(10px) saturate(1.2)'
      }
      style.backgroundImage = `linear-gradient(135deg, ${rgba('#ffffff', layer(0.40))}, ${rgba('#ffffff', layer(0.05))})`
      style.border = `1px solid ${rgba('#ffffff', 0.35)}`
      style.boxShadow = isMobile ? '0 6px 14px rgba(0,0,0,0.06)' : '0 10px 22px rgba(0,0,0,0.10)'
    }

    // 03 渐变微光
    if (presetId === '03') {
      style.backgroundImage = `linear-gradient(135deg, ${rgba('#ffffff', layer(0.28))}, ${rgba('#ffffff', layer(0))}), radial-gradient(circle at 20% 0%, ${rgba(bubble.bgColor, layer(0.25))}, ${rgba('#ffffff', layer(0))} 60%)`
      style.border = `1px solid ${rgba(bubble.borderColor || '#ffffff', 0.18)}`
      style.boxShadow = isUser ? '0 10px 24px rgba(236, 72, 153, 0.16)' : '0 10px 24px rgba(0,0,0,0.10)'
    }

    // 04 轻描边（清爽）
    if (presetId === '04') {
      style.border = `1px solid ${rgba(bubble.borderColor, Math.max(0.18, (bubble.borderOpacity ?? 0) / 100))}`
      style.boxShadow = '0 2px 10px rgba(0,0,0,0.06)'
    }

    // 05 果冻（高光+更强阴影）
    if (presetId === '05') {
      style.backgroundImage = `linear-gradient(180deg, ${rgba('#ffffff', layer(0.55))}, ${rgba('#ffffff', layer(0.05))})`
      style.boxShadow = isUser ? '0 14px 30px rgba(236, 72, 153, 0.18)' : '0 14px 30px rgba(0,0,0,0.12)'
      style.border = `1px solid ${rgba('#ffffff', 0.28)}`
    }

    // 06 霓虹边缘
    if (presetId === '06') {
      style.border = `1px solid ${rgba(bubble.borderColor || bubble.bgColor, 0.55)}`
      style.boxShadow = `0 0 0 1px ${rgba(bubble.borderColor || bubble.bgColor, 0.35)}, 0 10px 24px ${rgba(bubble.borderColor || bubble.bgColor, 0.22)}`
    }

    // 07 纸感（更淡+柔影）
    if (presetId === '07') {
      style.backgroundColor = rgba(bubble.bgColor, Math.min(0.92, bgAlpha))
      style.boxShadow = '0 6px 14px rgba(0,0,0,0.06)'
      style.border = `1px solid ${rgba('#000000', 0.06)}`
    }

    // 08 暗色玻璃（适合深色背景）
    if (presetId === '08') {
      style.backgroundColor = rgba(bubble.bgColor, Math.min(0.70, bgAlpha))
      if (!isMobile) {
        style.backdropFilter = 'blur(12px) saturate(1.1)'
        style.WebkitBackdropFilter = 'blur(12px) saturate(1.1)'
      }
      style.border = `1px solid ${rgba('#ffffff', 0.16)}`
      style.boxShadow = isMobile ? '0 8px 18px rgba(0,0,0,0.12)' : '0 12px 26px rgba(0,0,0,0.22)'
    }

    // 09 糖果（亮边+高光）
    if (presetId === '09') {
      style.backgroundImage = `linear-gradient(135deg, ${rgba('#ffffff', layer(0.42))}, ${rgba('#ffffff', layer(0.08))})`
      style.border = `1px solid ${rgba('#ffffff', 0.45)}`
      style.boxShadow = '0 10px 22px rgba(0,0,0,0.10)'
    }

    // 10 极简（几乎无阴影）
    if (presetId === '10') {
      style.boxShadow = 'none'
      style.border = bubble.borderOpacity > 0 ? baseBorder : `1px solid ${rgba('#000000', 0.06)}`
    }

    // 11 iOS风（轻阴影+轻高光）
    if (presetId === '11') {
      style.backgroundImage = `linear-gradient(180deg, ${rgba('#ffffff', layer(0.25))}, ${rgba('#ffffff', layer(0))})`
      style.boxShadow = '0 6px 16px rgba(0,0,0,0.10)'
      style.border = `1px solid ${rgba('#ffffff', 0.18)}`
    }

    // 12 梦幻（柔光晕）
    if (presetId === '12') {
      style.backgroundImage = `radial-gradient(circle at 25% 10%, ${rgba('#ffffff', layer(0.35))}, ${rgba('#ffffff', layer(0))} 55%)`
      style.boxShadow = isUser ? '0 14px 30px rgba(168, 85, 247, 0.16)' : '0 14px 30px rgba(0,0,0,0.12)'
      style.border = `1px solid ${rgba(bubble.borderColor || bubble.bgColor, 0.20)}`
    }

    // 13 全息渐变（明显）
    if (presetId === '13') {
      style.backgroundImage =
        `conic-gradient(from 210deg at 30% 20%, ${rgba('#60A5FA', 0.55)}, ${rgba('#A78BFA', 0.55)}, ${rgba('#F472B6', 0.45)}, ${rgba('#34D399', 0.45)}, ${rgba('#60A5FA', 0.55)})`
      style.border = `1px solid ${rgba(bubble.borderColor || '#A78BFA', 0.45)}`
      style.boxShadow = '0 12px 26px rgba(0,0,0,0.14)'
    }

    // 14 樱花贴纸（更可爱：更粗描边+轻点点纹理）
    if (presetId === '14') {
      style.backgroundImage =
        `radial-gradient(circle at 10px 10px, ${rgba('#ffffff', layer(0.55))} 0 2px, ${rgba('#ffffff', layer(0))} 2.5px),
         radial-gradient(circle at 22px 18px, ${rgba('#ffffff', layer(0.45))} 0 1.5px, ${rgba('#ffffff', layer(0))} 2px)`
      style.backgroundSize = '28px 28px'
      style.border = `2px solid ${rgba(bubble.borderColor || bubble.bgColor, 0.75)}`
      style.boxShadow = '0 10px 22px rgba(0,0,0,0.10)'
    }

    // 15 薄荷贴纸（更清新：虚线边框+内阴影）
    if (presetId === '15') {
      style.border = `2px dashed ${rgba(bubble.borderColor || bubble.bgColor, 0.70)}`
      style.boxShadow = `inset 0 1px 0 ${rgba('#ffffff', 0.45)}, 0 10px 22px rgba(0,0,0,0.10)`
      style.backgroundImage = `linear-gradient(180deg, ${rgba('#ffffff', layer(0.35))}, ${rgba('#ffffff', layer(0))})`
    }

    // 16 黑金质感（更硬朗：双层描边+高光）
    if (presetId === '16') {
      style.border = `2px solid ${rgba(bubble.borderColor || '#F59E0B', 0.75)}`
      style.outline = `1px solid ${rgba('#ffffff', 0.10)}`
      style.outlineOffset = '-3px'
      style.backgroundImage = `linear-gradient(180deg, ${rgba('#ffffff', layer(0.18))}, ${rgba('#ffffff', layer(0))})`
      style.boxShadow = '0 14px 30px rgba(0,0,0,0.25)'
    }

    return style
  }

  // 性能：消息气泡/时间格式化很重；用 useMemo 把它们从“打字重渲染”里隔离出去
  const bubbleStyles = useMemo(() => {
    return {
      user: getBubbleStyle(true),
      char: getBubbleStyle(false),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userBubbleStyle, charBubbleStyle])

  const renderedMessageItems = useMemo(() => {
    if (!character?.id) return null
    return visibleMessages.map((msg) => {
      // 系统消息和拍一拍消息特殊渲染
      if (msg.type === 'system' || msg.type === 'pat') {
        return (
          <div
            key={msg.id}
            className="flex justify-center mb-3"
            // 性能优化：让浏览器跳过离屏渲染（不改变功能/滚动行为）
            style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 64px' }}
          >
            <div
              data-msg-id={msg.id}
              data-allow-msg-menu="1"
              className="px-3 py-1.5 rounded-lg bg-white/90 shadow-sm text-xs text-gray-500 cursor-pointer active:opacity-80"
              onClick={(e) => {
                if (editMode) return
                if (character?.offlineMode) return
                e.preventDefault()
                e.stopPropagation()
                openMsgActionMenu(msg as any, e.currentTarget as HTMLElement)
              }}
              onContextMenu={(e) => {
                if (editMode) return
                if (character?.offlineMode) return
                e.preventDefault()
                openMsgActionMenu(msg as any, e.currentTarget as HTMLElement)
              }}
            >
              {msg.content}
            </div>
          </div>
        )
      }

      // 判断是否是拉黑后对方新发的消息（只有拉黑后发的才显示感叹号）
      const isBlockedMessage =
        !msg.isUser && character.isBlocked && character.blockedAt && msg.timestamp > character.blockedAt

      // 线下模式消息的特殊渲染（不显示头像和气泡，使用叙事风格）
      if (msg.isOffline && (msg.type === 'text' || msg.type === 'image')) {
        // 获取自定义颜色设置
        const offlineUserColor = character.offlineUserColor || '#2563eb'
        const offlineCharColor = character.offlineCharColor || '#7c3aed'
        const offlineDialogColor = character.offlineDialogColor || '#111827'
        const narrationItalic = character.offlineNarrationItalic ?? true
        const narrationBold = character.offlineNarrationBold ?? false
        const quoteItalic = character.offlineQuoteItalic ?? false
        const quoteBold = character.offlineQuoteBold ?? true
        
        // 获取线下模式字体（优先使用角色设置，否则跟随全局）
        const offlineFontFamily = (() => {
          if (character.offlineFontId) {
            const allFonts = getAllFontOptions()
            const selectedFont = allFonts.find(f => f.id === character.offlineFontId)
            return selectedFont?.fontFamily || currentFont.fontFamily
          }
          return currentFont.fontFamily
        })()
        
        // 处理引号内的文字：使用自定义对话颜色
        const renderOfflineContent = (content: string) => {
          // 支持常见三种引号："..."、“...”、「...」
          const parts = content.split(/(“[^”]*”|"[^"]*"|「[^」]*」)/g)
          return parts.map((part, i) => {
            const isQuote =
              (part.startsWith('"') && part.endsWith('"')) ||
              (part.startsWith('“') && part.endsWith('”')) ||
              (part.startsWith('「') && part.endsWith('」'))
            if (isQuote) {
              // 引号内的对话：使用对话颜色 + 单独样式
              return (
                <span
                  key={i}
                  style={{
                    color: offlineDialogColor,
                    fontStyle: quoteItalic ? 'italic' : 'normal',
                    fontWeight: quoteBold ? 600 : 400,
                  }}
                >
                  {part}
                </span>
              )
            }
            // 普通叙述文字：使用叙述颜色
            return <span key={i}>{part}</span>
          })
        }
        
        // 线下模式图片特殊渲染
        if (msg.type === 'image') {
          return (
            <div
              key={msg.id}
              className="mb-2 px-4 group"
              style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 200px' }}
            >
              {/* 图片：居中显示，点击可放大 */}
              <div className={`${msg.isUser ? 'text-right' : 'text-left'}`}>
                <img
                  src={msg.content}
                  alt="图片"
                  className="inline-block max-w-[200px] max-h-[280px] rounded-lg object-cover cursor-pointer active:scale-[0.98] border border-gray-200"
                  onClick={() => window.open(msg.content, '_blank')}
                />
              </div>
              {/* 操作按钮：删除 */}
              <div className={`mt-1.5 flex gap-3 ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                <button
                  type="button"
                  onClick={() => deleteMessage(msg.id)}
                  className="text-xs text-gray-300 hover:text-red-500 active:opacity-70"
                >
                  删除
                </button>
              </div>
            </div>
          )
        }
        
        return (
          <div
            key={msg.id}
            className="mb-2 px-4 group"
            style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 60px' }}
          >
            {/* 叙事内容 - 使用自定义颜色和字体，添加白色半透明背景以提高可读性 */}
            <div 
              className={`text-[15px] leading-relaxed whitespace-pre-wrap px-3 py-2 rounded-lg ${
                msg.isUser ? 'text-right cursor-pointer active:opacity-80' : 'text-left'
              }`}
              style={{ 
                color: msg.isUser ? offlineUserColor : offlineCharColor,
                fontFamily: offlineFontFamily,
                fontStyle: narrationItalic ? 'italic' : 'normal',
                fontWeight: narrationBold ? 600 : 400,
                backgroundColor: `rgba(255, 255, 255, ${(character.offlineTextBgOpacity ?? 85) / 100})`,
              }}
              onClick={() => {
                // 线下模式：允许点击“自己发出的气泡”直接进入编辑
                if (!msg.isUser) return
                setEditingMessageId(msg.id)
                setEditingContent(msg.content)
              }}
            >
              {renderOfflineContent(msg.content)}
            </div>
            {/* 操作按钮：删除和编辑 - 常驻显示 */}
            <div className={`mt-1.5 flex gap-3 ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
              <button
                type="button"
                onClick={() => {
                  setEditingMessageId(msg.id)
                  setEditingContent(msg.content)
                }}
                className="text-xs text-gray-300 hover:text-gray-600 active:opacity-70"
              >
                编辑
              </button>
              <button
                type="button"
                onClick={() => deleteMessage(msg.id)}
                className="text-xs text-gray-300 hover:text-red-500 active:opacity-70"
              >
                删除
              </button>
            </div>
          </div>
        )
      }

      // 编辑模式：是否被选中
      const isSelected = selectedMsgIds.has(msg.id)
      // 转发模式：是否被选中
      const isForwardSelected = forwardSelectedIds.has(msg.id)
      // 可转发的消息类型
      const canForward = ['text', 'image', 'sticker', 'transfer', 'voice'].includes(msg.type)

      const bubbleStyle =
        msg.type !== 'transfer' && msg.type !== 'music' && msg.type !== 'location' && msg.type !== 'chat_forward'
          ? (msg.isUser ? bubbleStyles.user : bubbleStyles.char)
          : undefined

      return (
        <div
          key={msg.id}
          data-msg-id={msg.id}
          // 性能优化：聊天长列表在移动端非常吃力；content-visibility 可显著减少重绘/布局开销
          style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 140px' }}
          className={highlightedMsgId === msg.id ? 'bg-yellow-100 rounded-xl' : ''}
        >
          <div className={`flex gap-2 mb-3 ${msg.isUser ? 'flex-row-reverse' : ''}`}>
            {/* 编辑模式：可勾选双方消息 */}
            {editMode && !forwardMode && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMsgIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(msg.id)) next.delete(msg.id)
                    else next.add(msg.id)
                    return next
                  })
                }}
                className="flex items-center self-center"
                title="选择消息"
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isSelected ? 'border-pink-500 bg-pink-500' : 'border-gray-400 bg-white/70'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>
            )}
            {/* 转发模式：所有消息都显示勾选框 */}
            {forwardMode && !editMode && (
              <button
                type="button"
                onClick={() => {
                  if (!canForward) return // 不可转发的消息点击无效
                  setForwardSelectedIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(msg.id)) next.delete(msg.id)
                    else next.add(msg.id)
                    return next
                  })
                }}
                className={`flex items-center self-center ${!canForward ? 'opacity-30' : ''}`}
                title={canForward ? '选择转发' : '此消息类型不支持转发'}
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isForwardSelected ? 'border-green-500 bg-green-500' : 'border-gray-400 bg-white/70'
                  }`}
                >
                  {isForwardSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
              </button>
            )}

            <div 
              className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 shadow-sm cursor-pointer active:opacity-70 transition-opacity"
              onClick={() => {
                if (editMode) return // 编辑模式下不触发拍一拍
                if (!(character?.patEnabled ?? true)) return // 拍一拍已关闭
                if (msg.isUser) {
                  // 点击自己的头像，拍对方
                  const patText = character?.patThemText || '拍了拍TA的肩膀'
                  addMessage({
                    characterId: character.id,
                    content: `${selectedPersona?.name || '我'}${patText}`,
                    isUser: false,
                    type: 'pat',
                    patText: patText,
                  })
                } else {
                  // 点击对方的头像，拍对方
                  const patText = character?.patThemText || '拍了拍TA的肩膀'
                  addMessage({
                    characterId: character.id,
                    content: `你${patText}`,
                    isUser: true,
                    type: 'pat',
                    patText: patText,
                  })
                }
              }}
            >
              {msg.isUser ? (
                selectedPersona?.avatar ? (
                  <img src={selectedPersona.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[15px] font-medium">
                    {(selectedPersona?.name || '我')[0]}
                  </div>
                )
              ) : character.avatar ? (
                <img src={character.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-[15px] font-medium">
                  {character.name[0]}
                </div>
              )}
            </div>

            <div className={`flex flex-col max-w-[70%] ${msg.isUser ? 'items-end' : 'items-start'}`}>
              {/* 引用消息显示 */}
              {msg.replyTo && (
                <div className={`mb-1 px-2 py-1 rounded-lg bg-gray-100 border-l-2 border-gray-400 text-xs text-gray-600 max-w-full ${msg.isUser ? 'text-right' : 'text-left'}`}>
                  <div className="font-medium">{msg.replyTo.senderName}</div>
                  <div className="truncate">{msg.replyTo.content}</div>
                </div>
              )}
              
              <div
                className={`w-fit text-[15px] ${
                  msg.type === 'transfer' || msg.type === 'music' || msg.type === 'image' || msg.type === 'sticker' || msg.type === 'location' || msg.type === 'voice' || msg.type === 'chat_forward'
                    ? 'bg-transparent p-0 shadow-none'
                    : `px-3.5 py-2.5 shadow-sm ${msg.isUser
                        ? 'text-gray-800 rounded-2xl rounded-tr-md'
                        : 'text-gray-800 rounded-2xl rounded-tl-md'}`
                }`}
                style={msg.type === 'image' || msg.type === 'sticker' || msg.type === 'location' || msg.type === 'voice' || msg.type === 'chat_forward' ? undefined : bubbleStyle as any}
                onClick={(e) => {
                  if (editMode) return
                  if (character?.offlineMode) return // 线下模式不动

                  // 线上模式：点击“自己发的文字消息”= 直接编辑（与线下模式一致）
                  if (msg.isUser && msg.type === 'text') {
                    e.preventDefault()
                    e.stopPropagation()
                    setEditingMessageId(msg.id)
                    setEditingContent(msg.content || '')
                    return
                  }

                  const target = e.target as HTMLElement | null
                  // 允许“图片打开/转账卡片收款”等原始点击行为：标记为 primary-click 的元素不弹菜单
                  if (target?.closest?.('[data-primary-click="1"]')) return
                  // 对于内部按钮/输入等交互，不抢点击
                  {
                    const interactive = target?.closest?.('button,a,input,textarea,select') as HTMLElement | null
                    // 仅当该交互元素显式允许弹菜单时，才继续（用于“虚拟语音条”等没有实际点击行为的按钮）
                    if (interactive && !interactive.closest?.('[data-allow-msg-menu="1"]')) return
                  }
                  e.preventDefault()
                  e.stopPropagation()
                  openMsgActionMenu(msg, e.currentTarget as HTMLElement)
                }}
                onContextMenu={(e) => {
                  if (editMode) return
                  if (character?.offlineMode) return
                  e.preventDefault()
                  openMsgActionMenu(msg, e.currentTarget as HTMLElement)
                }}
              >
                {renderMessageContent(msg)}
              </div>

              {/* 翻译（仅对方文本消息 & 非中文角色） */}
              {!msg.isUser &&
                msg.type === 'text' &&
                msg.messageLanguage &&
                msg.messageLanguage !== 'zh' &&
                msg.chatTranslationEnabledAtSend && (
                  <div className="mt-2 w-fit max-w-full px-2.5 py-2 rounded-xl bg-white/90 md:bg-white/85 md:backdrop-blur border border-white/70 shadow-sm">
                    <div className="text-[10px] text-gray-500 mb-1">翻译</div>
                    <div className="text-[12px] text-gray-800 whitespace-pre-wrap break-words">
                      {msg.translationStatus === 'error'
                        ? '翻译失败'
                        : msg.translatedZh
                          ? msg.translatedZh
                          : '翻译中…'}
                    </div>
                  </div>
                )}

              {/* 每条消息显示时间（小号字体）和操作按钮 */}
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-block px-2 py-[2px] rounded-md bg-white/85 md:bg-white/70 md:backdrop-blur border border-white/60 text-[10px] text-gray-600">
                  {formatTime(msg.timestamp)}
                </span>

                {/* 线上模式：由于“点击自己文字气泡=编辑”，给自己消息一个“更多(⋯)”入口打开菜单（含多选删除） */}
                {!character?.offlineMode &&
                  msg.isUser &&
                  !editMode && (
                    <button
                      type="button"
                      data-allow-msg-menu="1"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openMsgActionMenu(msg, e.currentTarget as HTMLElement)
                      }}
                      className="px-2 py-[2px] rounded-md bg-black/5 text-[10px] text-gray-500 hover:bg-black/10 active:opacity-70"
                      title="更多"
                    >
                      ⋯
                    </button>
                  )}
                
                {/* 消息操作按钮（非系统消息且非编辑模式） */}
                {/* 线下模式保持原样；线上模式改为“长按气泡 → 悬浮菜单” */}
                {character?.offlineMode && (msg.type === 'text' || msg.type === 'voice' || msg.type === 'image' || msg.type === 'sticker' || msg.type === 'transfer' || msg.type === 'doudizhu_share' || msg.type === 'doudizhu_invite') && !editMode && (
                  <>
                    {/* 编辑按钮（仅对方消息的文本/语音/转账备注） */}
                    {!msg.isUser && (msg.type === 'text' || msg.type === 'voice' || msg.type === 'transfer') && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMessageId(msg.id)
                          setEditingContent(msg.type === 'transfer' ? (msg.transferNote || '') : msg.content)
                        }}
                        className="px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:bg-gray-100 active:opacity-70"
                      >
                        编辑
                      </button>
                    )}
                    {/* 引用按钮（仅对方消息的文本/语音） */}
                    {!msg.isUser && (msg.type === 'text' || msg.type === 'voice') && (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingToMessageId(msg.id)
                        }}
                        className="px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:bg-gray-100 active:opacity-70"
                      >
                        引用
                      </button>
                    )}
                    {/* 删除按钮（双方消息都可删除） */}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('确定删除这条消息吗？')) {
                          deleteMessage(msg.id)
                        }
                      }}
                      className="px-1.5 py-0.5 rounded text-[10px] text-red-400 hover:bg-red-50 active:opacity-70"
                    >
                      删除
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 拉黑后对方新发的消息，气泡右边显示小感叹号 */}
            {isBlockedMessage && (
              <div className="flex items-center self-center" title="发送失败（对方视角）">
                <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold">!</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    })
  }, [
    visibleMessages,
    character?.id,
    character?.avatar,
    character?.name,
    character?.isBlocked,
    character?.blockedAt,
    character?.offlineMode,
    editMode,
    selectedMsgIds,
    forwardMode,
    forwardSelectedIds,
    selectedPersona?.avatar,
    selectedPersona?.name,
    bubbleStyles,
    openMsgActionMenu,
  ])

  return (
    <WeChatLayout>
      {/* 背景必须与内容分层，否则部分设备会把整页合成导致文字发糊 */}
      <div className="relative isolate flex flex-col h-full overflow-hidden">
        {character.chatBackground && (
          <>
            <div className="pointer-events-none absolute inset-0 -z-10" style={chatBgStyle} />
            {/* 仅做轻遮罩，绝不做 blur */}
            <div className="pointer-events-none absolute inset-0 -z-10 bg-white/35" />
          </>
        )}
        
        {/* 一起听歌浮窗已移至 WeChatLayout 全局显示 */}
        
        {/* 头部 - 参考 ChatsTab 的结构 */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-transparent mt-1">
          {editMode ? (
            <>
              <button
                type="button"
                onClick={() => { setEditMode(false); setSelectedMsgIds(new Set()) }}
                className="text-gray-500 text-sm"
              >
                取消
              </button>
              <span className="font-semibold text-[#000]">
                已选 {selectedMsgIds.size}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={selectedMsgIds.size === 0}
                  onClick={() => setShowEditDeleteConfirm(true)}
                  className={`text-sm font-medium ${selectedMsgIds.size > 0 ? 'text-red-500' : 'text-gray-300'}`}
                >
                  删除
                </button>
              </div>
            </>
          ) : forwardMode ? (
            <>
              <button
                type="button"
                onClick={() => { setForwardMode(false); setForwardSelectedIds(new Set()) }}
                className="text-gray-500 text-sm"
              >
                取消
              </button>
              <span className="font-semibold text-[#000]">
                选择要转发的消息
              </span>
              <button
                type="button"
                disabled={forwardSelectedIds.size === 0}
                onClick={() => setShowForwardTargetPicker(true)}
                className={`text-sm font-medium ${forwardSelectedIds.size > 0 ? 'text-green-500' : 'text-gray-300'}`}
              >
                转发({forwardSelectedIds.size})
              </button>
            </>
          ) : (
            <>
              <button 
                type="button" 
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const now = Date.now()
                  if (now - navLockRef.current < 450) return
                  navLockRef.current = now
                  // 先清空 currentChatId，避免“退出瞬间生成的消息”被认为仍在当前聊天，从而不计入未读
                  setCurrentChatId(null)
                  navigate('/apps/wechat')
                }}
                className="flex items-center gap-0.5 transition-opacity hover:opacity-70"
                style={{ color: fontColor.value }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-[13px] font-medium">返回</span>
              </button>
              <div className="flex flex-col items-center">
                <span className="font-semibold text-[#000]">{character.nickname || character.name}</span>
                {showTyping && (
                  <span className="text-[10px] text-gray-500 mt-0.5">
                    对方正在输入中...
                  </span>
                )}
              </div>
              <button 
                type="button" 
                onClick={() => setShowMenu(true)}
                className="w-7 h-7 flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-[#000]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* 消息列表 */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-3 py-4"
          style={{ contain: 'strict', willChange: 'scroll-position', WebkitOverflowScrolling: 'touch', transform: 'translateZ(0)' }}
          onScroll={(e) => {
            // 性能优化：使用 requestAnimationFrame 节流滚动处理
            if ((e.target as any)._scrollRafId) return
            (e.target as any)._scrollRafId = requestAnimationFrame(() => {
              (e.target as any)._scrollRafId = null
              const el = messagesContainerRef.current
              if (!el) return
              // 触顶：加载更早消息
              if (el.scrollTop < 80 && startIndex > 0 && !loadingMoreRef.current) {
                loadingMoreRef.current = true
                tailModeRef.current = false
                prevScrollHeightRef.current = el.scrollHeight
                prevScrollTopRef.current = el.scrollTop
                setStartIndex((prev) => Math.max(0, prev - PAGE_SIZE))
              }
              const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
              nearBottomRef.current = distanceToBottom < 140
              if (nearBottomRef.current) {
                tailModeRef.current = true
              }
            })
          }}
        >
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 text-sm mt-10">
              开始和{character.name}聊天吧~
            </div>
          ) : (
            renderedMessageItems
          )}
          
          {/* AI正在输入提示 - 线下模式时不显示头像 */}
          {showTyping && (
            character.offlineMode ? (
              // 线下模式：只显示三个点，居中
              <div className="flex justify-center mb-3">
                <div className="px-4 py-2 bg-gray-100/80 rounded-full">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            ) : (
              // 线上模式：显示头像和气泡
              <div className="flex gap-2 mb-3">
                <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                  {character.avatar ? (
                    <img src={character.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-[15px] font-medium">
                      {character.name[0]}
                    </div>
                  )}
                </div>
                <div className="px-4 py-3 bg-white/90 rounded-2xl rounded-tl-md shadow-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* 引用显示 */}
        {replyingToMessageId && (() => {
          const replyMsg = visibleMessages.find(m => m.id === replyingToMessageId)
          if (!replyMsg) return null
          return (
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-1">引用 {replyMsg.isUser ? (selectedPersona?.name || '我') : character.name}</div>
                <div className="text-sm text-gray-700 truncate">{replyMsg.content}</div>
              </div>
              <button
                type="button"
                onClick={() => setReplyingToMessageId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })()}
        
        {/* 输入框 */}
        {/* 移动端禁用 blur（滚动+输入会非常卡），桌面端保留 */}
        <div className="px-3 py-2 bg-white/90 md:bg-white/80 md:backdrop-blur-sm border-t border-gray-200/40">
          <div className="flex items-center gap-2">
            {/* 语音按钮（虚拟语音：弹窗输入文字→发出语音条+转文字；线下模式不显示） */}
            {!character.offlineMode && (
              <button
                type="button"
                onClick={() => {
                  setFakeVoiceOpen(true)
                  setShowPlusMenu(false)
                  setShowStickerPanel(false)
                  setActivePanel(null)
                }}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-transform flex-shrink-0 active:scale-90 bg-gray-100"
                title="语音"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v3" />
                </svg>
              </button>
            )}
            
            {/* 表情包按钮（线下模式改为“引号”按钮：插入“”并把光标放中间） */}
            {character.offlineMode ? (
              <button
                type="button"
                onClick={() => {
                  const el = inputRef.current
                  const cur = String(inputText || '')
                  const start = (el?.selectionStart ?? cur.length)
                  const end = (el?.selectionEnd ?? cur.length)
                  const before = cur.slice(0, start)
                  const sel = cur.slice(start, end)
                  const after = cur.slice(end)
                  const next = sel ? `${before}“${sel}”${after}` : `${before}“”${after}`
                  const cursor = sel ? (before.length + 2 + sel.length) : (before.length + 1)
                  setInputText(next)
                  // 等 state 落地后再设置光标
                  setTimeout(() => {
                    try {
                      const el2 = inputRef.current
                      if (!el2) return
                      el2.focus()
                      el2.setSelectionRange(cursor, cursor)
                    } catch { /* ignore */ }
                  }, 0)
                }}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90 flex-shrink-0 bg-gray-100"
                title="插入引号"
              >
                <span className="text-gray-700 text-[14px] font-semibold">“”</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowStickerPanel(!showStickerPanel)
                  setShowPlusMenu(false)
                  setActivePanel(null)
                }}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90 flex-shrink-0 ${showStickerPanel ? 'bg-pink-100' : ''}`}
                title="表情包"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                </svg>
              </button>
            )}
            
            <textarea
              ref={inputRef}
              placeholder="输入消息..."
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value)
                // 下一帧再读 scrollHeight，避免 setState 前后抖动
                requestAnimationFrame(() => autosizeInput(e.currentTarget))
              }}
              onCompositionStart={() => { composingRef.current = true }}
              onCompositionEnd={() => { composingRef.current = false }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                // Shift+Enter 换行；Enter 发送（手机端也更符合聊天习惯）
                if (e.shiftKey) return
                e.preventDefault()
                // 合成输入期间禁止 Enter 发送（否则会取到上一句 state）
                if (composingRef.current) return
                handleSend()
              }}
              rows={1}
              // iOS（部分壳浏览器）会对 <16px 的输入框自动“放大页面”
              // 通过专用 class 在 iOS 上强制到 16px，避免“点输入框界面突然放大”
              className="lp-chat-input flex-1 min-w-0 px-3 py-2 rounded-2xl bg-white/90 md:bg-white/80 md:backdrop-blur outline-none text-gray-800 text-sm resize-none leading-relaxed max-h-[128px] overflow-y-auto"
            />
            
            {/* 手动：触发回复按钮（随时可按，可连续点继续生成） */}
            <button
              type="button"
              onClick={triggerReply}
              disabled={showTyping}
              className={`w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition-all flex-shrink-0 bg-gradient-to-r from-pink-400 to-pink-500 ${showTyping ? 'opacity-50' : 'active:scale-90'}`}
              title="触发对方回复"
            >
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
              </svg>
            </button>
            
            {/* 右侧合并按钮：无输入=加号；有输入=发送 */}
            <button
              type="button"
              onClick={() => {
                if (inputText.trim()) {
                  handleSend()
                  return
                }
                setShowPlusMenu(!showPlusMenu)
                setShowStickerPanel(false)
                setActivePanel(null)
              }}
              className={`flex items-center justify-center transition-transform flex-shrink-0 active:scale-90 ${
                inputText.trim()
                  ? 'px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-pink-400 to-pink-500 text-white shadow-sm'
                  : 'w-7 h-7 rounded-full border-2 border-gray-400'
              }`}
              title={inputText.trim() ? '发送' : '更多'}
            >
              {inputText.trim() ? (
                '发送'
              ) : (
                <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              )}
            </button>
          </div>
          
          {/* 功能面板 */}
          {showPlusMenu && (
            <div className="mt-3 pb-2">
              {!activePanel ? (
                <div className="grid grid-cols-4 gap-4">
                  {/* === 第一行：实用功能 === */}
                  {/* 相册 - 线下模式也可用 */}
                  <button 
                    type="button" 
                    onClick={() => {
                      imageInputRef.current?.click()
                    }} 
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm bg-white/60">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">相册</span>
                  </button>
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleSendImage} />
                  
                  {/* 位置 - 线下模式禁用 */}
                  <button 
                    type="button" 
                    onClick={() => {
                      if (character.offlineMode) {
                        setInfoDialog({ open: true, title: '线下模式', message: '线下模式暂不支持此功能' })
                        return
                      }
                      setActivePanel('location')
                    }} 
                    className="flex flex-col items-center gap-1"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${character.offlineMode ? 'bg-gray-100 opacity-40' : 'bg-white/60'}`}>
                      <svg className={`w-6 h-6 ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                    </div>
                    <span className={`text-xs ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`}>位置</span>
                  </button>
                  
                  {/* 转账 - 线下模式禁用 */}
                  <button 
                    type="button" 
                    onClick={() => {
                      if (character.offlineMode) {
                        setInfoDialog({ open: true, title: '线下模式', message: '线下模式暂不支持此功能' })
                        return
                      }
                      setShowPlusMenu(false)
                      setShowTransferModal(true)
                    }} 
                    className="flex flex-col items-center gap-1"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${character.offlineMode ? 'bg-gray-100 opacity-40' : 'bg-white/60'}`}>
                      <svg className={`w-6 h-6 ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className={`text-xs ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`}>转账</span>
                  </button>
                  
                  {/* 经期 - 线下模式禁用 */}
                  <button 
                    type="button" 
                    onClick={() => {
                      if (character.offlineMode) {
                        setInfoDialog({ open: true, title: '线下模式', message: '线下模式暂不支持此功能' })
                        return
                      }
                      setActivePanel('period')
                    }} 
                    className="flex flex-col items-center gap-1"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${character.offlineMode ? 'bg-gray-100 opacity-40' : 'bg-white/60'}`}>
                      <svg className={`w-6 h-6 ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                      </svg>
                    </div>
                    <span className={`text-xs ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`}>经期</span>
                  </button>
                  
                  {/* === 第二行：娱乐/社交 === */}
                  {/* 音乐 - 线下模式禁用 */}
                  <button 
                    type="button" 
                    onClick={() => {
                      if (character.offlineMode) {
                        setInfoDialog({ open: true, title: '线下模式', message: '线下模式暂不支持此功能' })
                        return
                      }
                      setActivePanel('music')
                    }} 
                    className="flex flex-col items-center gap-1"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${character.offlineMode ? 'bg-gray-100 opacity-40' : 'bg-white/60'}`}>
                      <svg className={`w-6 h-6 ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V4.5l-10.5 3v7.803a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 12.553z" />
                      </svg>
                    </div>
                    <span className={`text-xs ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`}>音乐</span>
                  </button>

                  {/* 情侣空间 - 线下模式可用 */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowPlusMenu(false)
                      setActivePanel(null)
                      if (character.coupleSpaceEnabled) {
                        navigate(`/apps/wechat/couple-space/${character.id}`)
                      } else {
                        setCoupleInviteConfirmOpen(true)
                      }
                    }}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h.01M16.5 7.5h.01" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">情侣</span>
                  </button>

                  {/* 日记 - 线下模式可用 */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowPlusMenu(false)
                      setActivePanel(null)
                      setDiaryConfirmOpen(true)
                    }}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 4.5h10.5A1.5 1.5 0 0118 6v14.25a.75.75 0 01-1.2.6l-2.1-1.575a1.5 1.5 0 00-1.8 0l-2.1 1.575a1.5 1.5 0 01-1.8 0l-2.1-1.575a.75.75 0 00-1.2.6V6A1.5 1.5 0 016 4.5z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 8h8M8 11h8M8 14h6" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">日记</span>
                  </button>
                  
                  {/* 斗地主 - 线下模式禁用 */}
                  <button 
                    type="button" 
                    onClick={() => {
                      if (character.offlineMode) {
                        setInfoDialog({ open: true, title: '线下模式', message: '线下模式暂不支持此功能' })
                        return
                      }
                      setShowDoudizhuInviteConfirm(true)
                    }} 
                    className="flex flex-col items-center gap-1"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${character.offlineMode ? 'bg-gray-100 opacity-40' : 'bg-white/60'}`}>
                      <span className={`text-2xl ${character.offlineMode ? 'opacity-40' : ''}`}>🃏</span>
                    </div>
                    <span className={`text-xs ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`}>斗地主</span>
                  </button>
                  
                  {/* === 第三行：管理功能 === */}
                  {/* 查手机 - 线下模式可用 */}
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowPlusMenu(false)
                      handleOpenPhonePeek()
                    }} 
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">查手机</span>
                  </button>
                  
                  {/* 转发 - 线下模式禁用 */}
                  <button 
                    type="button" 
                    onClick={() => {
                      if (character.offlineMode) {
                        setInfoDialog({ open: true, title: '线下模式', message: '线下模式暂不支持此功能' })
                        return
                      }
                      setShowPlusMenu(false)
                      setEditMode(false)
                      setSelectedMsgIds(new Set())
                      setForwardMode(true)
                      setForwardSelectedIds(new Set())
                    }} 
                    className="flex flex-col items-center gap-1"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${character.offlineMode ? 'bg-gray-100 opacity-40' : 'bg-white/60'}`}>
                      <svg className={`w-6 h-6 ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                      </svg>
                    </div>
                    <span className={`text-xs ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`}>转发</span>
                  </button>
                  
                  {/* 清空 - 线下模式可用 */}
                  <button type="button" onClick={() => { setShowPlusMenu(false); setShowClearConfirm(true) }} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">清空</span>
                  </button>
                </div>
              ) : activePanel === 'music' ? (
                <div className="bg-white/80 rounded-xl p-4 max-h-48 overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={() => setActivePanel(null)} className="text-gray-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="font-medium text-gray-800">选择音乐</span>
                    <div className="w-5" />
                  </div>
                  {musicPlaylist.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-4">暂无音乐</div>
                  ) : (
                    <div className="space-y-2">
                      {musicPlaylist.map(song => (
                        <button
                          key={song.id}
                          type="button"
                          onClick={() => handleShareMusic({ title: song.title, artist: song.artist })}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/50 transition-colors"
                        >
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                            </svg>
                          </div>
                          <div className="text-left min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{song.title}</div>
                            <div className="text-xs text-gray-500 truncate">{song.artist}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : activePanel === 'period' ? (
                <div className="bg-white/90 rounded-xl p-3 max-h-[62vh] overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <button type="button" onClick={() => setActivePanel(null)} className="text-gray-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="font-medium text-gray-800">经期记录</span>
                    <div className="w-5" />
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                      className="p-1"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                      {calendarMonth.getFullYear()}年{calendarMonth.getMonth() + 1}月
                    </span>
                    <button
                      type="button"
                      onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                      className="p-1"
                    >
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                      <div key={day} className="w-8 h-6 flex items-center justify-center text-xs text-gray-400">
                        {day}
                      </div>
                    ))}
                  </div>
                  
                  {/* 内容区：可滚动，避免占地过大 */}
                  <div className="flex-1 overflow-y-auto pr-0.5">
                    <div className="grid grid-cols-7 gap-1">
                      {renderCalendar()}
                    </div>

                    {/* 选中日期 + 录入 */}
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="text-[13px] font-medium text-gray-800">
                          已选：{selectedPeriodDate}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          预计下次：{calcPredictedNextStart() || '—'}
                        </div>
                      </div>

                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            // 避免重复创建同一天开始日
                            const exists = periodRecords.some(r => r.startDate === selectedPeriodDate)
                            if (!exists) {
                              addPeriodRecord({ startDate: selectedPeriodDate, notes: '', symptoms: [], daily: [] })
                            }
                            setInfoDialog({ open: true, title: '已保存', message: `已设置 ${selectedPeriodDate} 为本次开始日` })
                          }}
                          className="flex-1 py-2 rounded-lg bg-pink-500 text-white text-sm font-medium"
                        >
                          设为开始日
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // 修复：结束日应落在“当前选中的那次经期记录”上；否则用户会觉得点了没反应
                            const target = findRecordForDate(selectedPeriodDate) || periodRecords[0]
                            if (!target) {
                              setInfoDialog({ open: true, title: '还没开始日', message: '请先设置开始日。' })
                              return
                            }
                            if (selectedPeriodDate < target.startDate) {
                              setInfoDialog({ open: true, title: '结束日不合法', message: '结束日不能早于开始日。' })
                              return
                            }
                            updatePeriodRecord(target.id, { endDate: selectedPeriodDate })
                            setInfoDialog({ open: true, title: '已保存', message: `已设置 ${selectedPeriodDate} 为本次结束日` })
                          }}
                          className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium"
                        >
                          设为结束日
                        </button>
                      </div>

                      {/* 疼痛 */}
                      <div className="mt-3">
                        <div className="text-xs text-gray-500 mb-1">疼痛</div>
                        <div className="flex gap-2">
                          {[
                            { v: 0 as const, t: '无' },
                            { v: 1 as const, t: '轻' },
                            { v: 2 as const, t: '中' },
                            { v: 3 as const, t: '重' },
                            { v: 4 as const, t: '爆' },
                          ].map((it) => (
                            <button
                              key={it.v}
                              type="button"
                              onClick={() => setPeriodPainDraft(it.v)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${
                                periodPainDraft === it.v ? 'bg-pink-100 text-pink-700 border border-pink-200' : 'bg-gray-50 text-gray-600'
                              }`}
                            >
                              {it.t}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 血量 */}
                      <div className="mt-3">
                        <div className="text-xs text-gray-500 mb-1">血量</div>
                        <div className="flex gap-2">
                          {[
                            { v: 'none' as const, t: '无' },
                            { v: 'light' as const, t: '少' },
                            { v: 'medium' as const, t: '中' },
                            { v: 'heavy' as const, t: '多' },
                          ].map((it) => (
                            <button
                              key={it.v}
                              type="button"
                              onClick={() => setPeriodFlowDraft(it.v)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${
                                periodFlowDraft === it.v ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-50 text-gray-600'
                              }`}
                            >
                              {it.t}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 备注 */}
                      <div className="mt-3">
                        <div className="text-xs text-gray-500 mb-1">备注</div>
                        <input
                          value={periodNoteDraft}
                          onChange={(e) => setPeriodNoteDraft(e.target.value)}
                          placeholder="可选"
                          className="w-full px-3 py-2 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 outline-none text-sm"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const r = findRecordForDate(selectedPeriodDate)
                          if (!r) {
                            setInfoDialog({ open: true, title: '还没经期记录', message: '请先设置开始日，再记录当天疼痛/血量。' })
                            return
                          }
                          const prev = Array.isArray((r as any).daily) ? (r as any).daily : []
                          const next = prev.filter((e: any) => e?.date !== selectedPeriodDate)
                          next.push({
                            date: selectedPeriodDate,
                            pain: periodPainDraft,
                            flow: periodFlowDraft,
                            note: (periodNoteDraft || '').trim(),
                            updatedAt: Date.now(),
                          })
                          updatePeriodRecord(r.id, { daily: next })
                          setInfoDialog({ open: true, title: '已保存', message: '已保存当天疼痛/血量记录。' })
                        }}
                        className="w-full mt-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium"
                      >
                        保存当天记录
                      </button>

                      <div className="text-center text-xs text-gray-400 mt-2">
                        点日期选择，再设置开始/结束
                      </div>
                    </div>
                  </div>

                  {/* 底部固定区：避免被遮挡 */}
                  <div className="pt-2 mt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={handleSharePeriod}
                      className="w-full py-2 rounded-lg bg-gradient-to-r from-pink-400 to-pink-500 text-white text-sm font-medium"
                    >
                      发送给{character.name}
                    </button>
                    <div className="text-center text-[11px] text-gray-400 mt-1">
                      对方会读取你的完整记录
                    </div>
                  </div>
                </div>
              ) : activePanel === 'location' ? (
                <div className="bg-white/90 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={() => setActivePanel(null)} className="text-gray-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="font-medium text-gray-800">发送位置</span>
                    <div className="w-5" />
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">地点名称 *</label>
                      <input
                        value={locationName}
                        onChange={(e) => setLocationName(e.target.value)}
                        placeholder="如：星巴克咖啡"
                        className="w-full px-3 py-2 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 outline-none text-sm border border-gray-200 focus:border-green-400"
                      />
                    </div>
                    
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">详细地址</label>
                      <input
                        value={locationAddress}
                        onChange={(e) => setLocationAddress(e.target.value)}
                        placeholder="如：中关村大街1号"
                        className="w-full px-3 py-2 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 outline-none text-sm border border-gray-200 focus:border-green-400"
                      />
                    </div>
                    
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">城市</label>
                      <input
                        value={locationCity}
                        onChange={(e) => setLocationCity(e.target.value)}
                        placeholder="如：北京"
                        className="w-full px-3 py-2 rounded-lg bg-gray-50 text-gray-700 placeholder-gray-400 outline-none text-sm border border-gray-200 focus:border-green-400"
                      />
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleSendLocation}
                      disabled={!locationName.trim()}
                      className={`w-full py-2.5 rounded-lg text-white text-sm font-medium transition-colors ${
                        locationName.trim()
                          ? 'bg-gradient-to-r from-green-500 to-green-600'
                          : 'bg-gray-300 cursor-not-allowed'
                      }`}
                    >
                      发送位置
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          
          {/* 表情包面板 */}
          {showStickerPanel && (
            <div className="mt-3 pb-2">
              <div className="bg-white/90 rounded-xl overflow-hidden">
                {/* 分类标签 */}
                <div className="flex items-center gap-1 px-2 py-2 border-b border-gray-100 overflow-x-auto hide-scrollbar">
                  <button
                    type="button"
                    onClick={() => setStickerTab('recent')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                      stickerTab === 'recent'
                        ? 'bg-pink-500 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    最近
                  </button>
                  {stickerCategoryList.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setStickerTab(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                        stickerTab === cat
                          ? 'bg-pink-500 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  {/* 管理按钮 */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowStickerPanel(false)
                      navigate('/apps/settings/stickers')
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 bg-gray-100 text-gray-500"
                  >
                    管理
                  </button>
                </div>
                
                {/* 表情包网格 */}
                <div className="p-2 max-h-72 overflow-y-auto">
                  {currentTabStickers.length === 0 ? (
                    <div className="text-center text-gray-400 text-sm py-6">
                      {stickerTab === 'recent' ? (
                        <>
                          <div>暂无最近使用的表情</div>
                          <div className="text-xs mt-1">发送过的表情会显示在这里</div>
                        </>
                      ) : (
                        <>
                          <div>该分类暂无表情包</div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowStickerPanel(false)
                              navigate('/apps/settings/stickers')
                            }}
                            className="mt-2 px-3 py-1.5 rounded-full bg-pink-500 text-white text-xs"
                          >
                            去添加表情
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {currentTabStickers.map(sticker => (
                        <button
                          key={sticker.id}
                          type="button"
                          onClick={() => sendUserSticker(sticker)}
                          className="aspect-square rounded-xl overflow-hidden bg-gray-50 hover:bg-gray-100 active:scale-95 transition-transform"
                        >
                          <img
                            src={sticker.imageUrl}
                            alt={sticker.keyword || '表情'}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 右上角菜单 */}
      {showMenu && (
        <div
          className="absolute inset-0 z-50"
          onClick={() => setShowMenu(false)}
        >
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute right-3 top-12 w-48 rounded-xl overflow-hidden bg-white shadow-lg border border-gray-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(false)
                navigate(`/apps/wechat/chat/${character.id}/settings`)
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-800 hover:bg-gray-50"
            >
              聊天设置
            </button>
            {/* 已移除：自动/手动回复切换（统一手动回复） */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(false)
                void toggleXFollow()
              }}
              disabled={xFollowLoading}
              className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${xFollowing ? 'text-gray-600' : 'text-blue-500'}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              {xFollowLoading ? '处理中…' : xFollowing ? '取消关注 X' : '在 X 上关注'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(false)
                const wasBlocked = character.isBlocked
                toggleBlocked(character.id)
                // 添加系统消息提示
                addMessage({
                  characterId: character.id,
                  content: wasBlocked ? '你已恢复与对方的好友关系' : '你已将对方拉黑',
                  isUser: true,
                  type: 'system',
                })
              }}
              className={`w-full px-4 py-3 text-left text-sm hover:bg-gray-50 ${character.isBlocked ? 'text-green-600' : 'text-orange-500'}`}
            >
              {character.isBlocked ? '恢复好友' : '拉黑'}
            </button>
          </div>
        </div>
      )}

      <WeChatDialog
        open={infoDialog.open}
        title={infoDialog.title}
        message={infoDialog.message}
        confirmText="知道了"
        onConfirm={() => setInfoDialog({ open: false, title: '', message: '' })}
      />

      <WeChatDialog
        open={coupleInviteConfirmOpen}
        title="确定发送申请吗？"
        message={`确定向 ${character.name} 发送情侣空间申请吗？`}
        confirmText={coupleInviteBusy ? '发送中…' : '确定'}
        cancelText="取消"
        onCancel={() => !coupleInviteBusy && setCoupleInviteConfirmOpen(false)}
        onConfirm={() => {
          if (coupleInviteBusy) return
          void sendCoupleSpaceInvite()
        }}
      />
      
      {/* 已移除：模式切换提示弹窗（统一手动回复） */}

      <WeChatDialog
        open={diaryConfirmOpen}
        title="确定偷看对方的日记吗？"
        message="这可是很私密的东西哦…喜欢的话记得及时收藏。"
        confirmText="悄咪咪的看"
        cancelText="算了不看了"
        onCancel={() => setDiaryConfirmOpen(false)}
        onConfirm={() => {
          setDiaryConfirmOpen(false)
          startDiaryPeek()
        }}
      />

      {/* 日记本（偷看） */}
      {diaryOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-[#F7F4EE]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 bg-white/85 md:bg-white/70 md:backdrop-blur">
            <button type="button" onClick={() => setDiaryOpen(false)} className="text-gray-700 text-sm">返回</button>
            <div className="text-[16px] font-bold text-[#111]">偷看日记</div>
            <div className="flex items-center gap-2">
              {/* 翻译按钮（仅非中文角色且有翻译时显示） */}
              {diaryContentZh && (
                <button
                  type="button"
                  onClick={() => setDiaryShowTranslated(!diaryShowTranslated)}
                  className={`px-2 py-1 rounded text-[11px] ${diaryShowTranslated ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  {diaryShowTranslated ? '原文' : '翻译'}
                </button>
              )}
              <button
                type="button"
                disabled={diaryLoading || !diaryContent.trim() || isDiaryFavorited(character.id, diaryAt || 0, (diaryContent || '').trim())}
                onClick={() => {
                  const content = (diaryContent || '').trim()
                  if (!content) return
                  const at = diaryAt || Date.now()
                  if (isDiaryFavorited(character.id, at, content)) {
                    setInfoDialog({ open: true, title: '已收藏', message: '这篇日记已经在收藏里了。' })
                    return
                  }
                  addFavoriteDiary({
                    characterId: character.id,
                    characterName: character.name,
                    diaryAt: at,
                    title: `${new Date(at).toLocaleDateString('zh-CN')} 的日记`,
                    content,
                    contentZh: diaryContentZh || undefined,
                    note: diaryNoteDraft.trim() || undefined,
                  })
                  setInfoDialog({ open: true, title: '收藏成功', message: '已保存到主页的「日记」App 里。' })
                }}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium disabled:opacity-50 ${
                  isDiaryFavorited(character.id, diaryAt || 0, (diaryContent || '').trim())
                    ? 'bg-gray-200 text-gray-500'
                    : 'bg-[#07C160] text-white'
                }`}
              >
                {isDiaryFavorited(character.id, diaryAt || 0, (diaryContent || '').trim()) ? '已收藏' : '收藏'}
              </button>
            </div>
          </div>

          {diaryLoading ? (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] text-gray-600 truncate">目标：{character.name}</div>
                <div className="text-[12px] text-gray-500">{diaryStage}</div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-black/10 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, diaryProgress))}%`,
                    background: 'linear-gradient(90deg, #34d399 0%, #07C160 100%)',
                    transition: 'width 420ms ease',
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="px-4 pt-4 pb-2">
              <div className="text-center text-[16px] font-semibold text-[#111]">
                偷看成功。
              </div>
              <div className="mt-1 text-center text-[12px] text-gray-600">
                这篇日记只有一次偷看机会，遇到喜欢的要及时收藏哦。
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            <div className="rounded-[22px] bg-white/75 border border-black/10 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-black/5">
                <div className="text-[13px] font-semibold text-[#111]">日记本</div>
                <div className="text-[11px] text-gray-500 mt-0.5">（每次打开都会生成新的）</div>
              </div>
              <div className="px-4 pt-3">
                <div className="text-[12px] text-gray-500 mb-1">收藏备注（可选）</div>
                <input
                  value={diaryNoteDraft}
                  onChange={(e) => setDiaryNoteDraft(e.target.value)}
                  placeholder="比如：这篇好甜 / 这段很阴暗 / 想记住这句"
                  className="w-full px-3 py-2 rounded-xl bg-white/80 border border-black/10 outline-none text-[12px] text-[#111]"
                  disabled={diaryLoading}
                />
              </div>
              <div
                className="px-4 py-4 text-[13px] leading-[26px] text-[#111] whitespace-pre-wrap min-h-[320px]"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(to bottom, transparent 0px, transparent 25px, rgba(0,0,0,0.05) 25px, rgba(0,0,0,0.05) 26px)',
                }}
              >
                {diaryLoading && !diaryContent 
                  ? '…' 
                  : (diaryShowTranslated && diaryContentZh 
                      ? diaryContentZh 
                      : (diaryContent || '（空）'))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 日记分享：查看全文 */}
      {openDiaryShare && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/35" onClick={() => setOpenDiaryShare(null)} role="presentation" />
          <div className="relative w-full max-w-[340px] rounded-[22px] border border-white/35 bg-white/95 md:bg-white/90 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] md:backdrop-blur-xl">
            <div className="text-[15px] font-semibold text-[#111] text-center">日记</div>
            <div className="mt-2 text-[12px] text-gray-600 text-center">
              {(openDiaryShare.diaryAuthorName || '（未知）')}{openDiaryShare.diaryAt ? ` · ${new Date(openDiaryShare.diaryAt).toLocaleString('zh-CN', { hour12: false })}` : ''}
            </div>
            {!!(openDiaryShare.diaryNote || '').trim() && (
              <div className="mt-2 text-[12px] text-gray-600 text-center">备注：{openDiaryShare.diaryNote}</div>
            )}
            <div className="mt-3 max-h-[52vh] overflow-y-auto rounded-2xl bg-[#F7F4EE] border border-black/10 p-3">
              <div className="text-[12px] leading-[20px] text-[#111] whitespace-pre-wrap">
                {(openDiaryShare.diaryContent || '').trim() || '（无内容）'}
              </div>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setOpenDiaryShare(null)}
                className="w-full py-2 rounded-xl bg-gray-100 text-sm text-gray-700"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 推文分享：查看全文 */}
      {openTweetShare && openTweetShare.type === 'tweet_share' && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/35" onClick={() => setOpenTweetShare(null)} role="presentation" />
          <div className="relative w-full max-w-[340px] rounded-[22px] border border-white/35 bg-white/95 md:bg-white/90 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] md:backdrop-blur-xl">
            <div className="text-[15px] font-semibold text-[#111] text-center">推文</div>
            <div className="mt-2 text-[12px] text-gray-600 text-center">
              {String(openTweetShare.tweetAuthorName || '（未知）')}
              {openTweetShare.tweetAt ? ` · ${new Date(openTweetShare.tweetAt).toLocaleString('zh-CN', { hour12: false })}` : ''}
            </div>
            {!!String(openTweetShare.tweetStats || '').trim() && (
              <div className="mt-2 text-[12px] text-gray-600 text-center">{String(openTweetShare.tweetStats || '').trim()}</div>
            )}
            <div className="mt-3 max-h-[52vh] overflow-y-auto rounded-2xl bg-white border border-black/10 p-3">
              <div className="text-[12px] leading-[20px] text-[#111] whitespace-pre-wrap">
                {String(openTweetShare.tweetContent || '').trim() || '（无内容）'}
              </div>
            </div>
            <div className="mt-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const id = openTweetShare.tweetId
                    setOpenTweetShare(null)
                    if (id) navigate(`/apps/x?postId=${encodeURIComponent(id)}`)
                  }}
                  className="flex-1 py-2 rounded-xl bg-black text-sm text-white"
                >
                  打开 X 查看
                </button>
                <button
                  type="button"
                  onClick={() => setOpenTweetShare(null)}
                  className="flex-1 py-2 rounded-xl bg-gray-100 text-sm text-gray-700"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 转账悬浮窗 */}
      {showTransferModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-8">
          <div 
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowTransferModal(false)}
          />
          <div className="relative w-full max-w-[280px] rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-orange-400 to-orange-500 text-white text-center">
              <div className="text-sm font-medium">转账给 {character.name}</div>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-center gap-1 mb-4">
                <span className="text-2xl text-gray-700">¥</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  className="text-3xl font-medium text-gray-800 w-32 text-center outline-none bg-transparent"
                  autoFocus
                />
              </div>
              <input
                type="text"
                placeholder="添加转账说明（选填）"
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-700 placeholder-gray-400 outline-none text-sm mb-4"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSendTransfer}
                  disabled={!transferAmount || parseFloat(transferAmount) <= 0}
                  className="flex-1 py-2 rounded-lg bg-gradient-to-r from-orange-400 to-orange-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  转账
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 虚拟语音输入弹窗（线上模式） */}
      {fakeVoiceOpen && !character.offlineMode && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/30" onClick={() => setFakeVoiceOpen(false)} />
          <div className="relative w-full max-w-[320px] rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-center">
              <div className="text-sm font-medium">发送语音</div>
              <div className="text-[11px] text-white/80 mt-0.5">（虚拟语音：会显示语音条 + 转文字）</div>
            </div>
            <div className="p-4">
              <textarea
                value={fakeVoiceDraft}
                onChange={(e) => setFakeVoiceDraft(e.target.value)}
                placeholder="在这里输入你想说的话…"
                className="w-full min-h-[110px] px-3 py-2 rounded-xl bg-gray-50 text-gray-800 placeholder-gray-400 outline-none text-sm border border-gray-200"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => { setFakeVoiceOpen(false); setFakeVoiceDraft('') }}
                  className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSendFakeVoice}
                  disabled={!String(fakeVoiceDraft || '').trim()}
                  className="flex-1 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-medium disabled:opacity-50"
                >
                  发送语音
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 收到转账的操作弹窗 */}
      {transferActionMsg && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-8">
          <div 
            className="absolute inset-0 bg-black/30"
            onClick={() => setTransferActionMsg(null)}
          />
          <div className="relative w-full max-w-[260px] rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-orange-400 to-orange-500 text-white text-center">
              <div className="text-lg font-medium">¥{transferActionMsg.transferAmount?.toFixed(2)}</div>
              <div className="text-xs text-white/80 mt-0.5">{transferActionMsg.transferNote || '转账'}</div>
            </div>
            <div className="p-4">
              <div className="text-center text-sm text-gray-500 mb-4">
                {character.name} 向你转账
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleTransferAction('reject')}
                  className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium"
                >
                  拒绝
                </button>
                <button
                  type="button"
                  onClick={() => handleTransferAction('receive')}
                  className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-orange-400 to-orange-500 text-white text-sm font-medium"
                >
                  收款
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 听歌邀请：悬浮确认 → 进入“一起听歌界面” */}
      {musicInviteDialog.open && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-8">
          <div 
            className="absolute inset-0 bg-black/30"
            onClick={() => setMusicInviteDialog({ open: false })}
          />
          <div className="relative w-full max-w-[260px] rounded-2xl bg-white shadow-xl overflow-hidden">
            {/* 加载状态：等待对方回应 */}
            {musicInviteDialog.loading ? (
              <>
                <div className="px-4 py-4 text-center bg-gradient-to-r from-pink-400 to-purple-500">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-white/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                  <div className="text-white font-medium">等待{character.name}回应...</div>
                </div>
                <div className="p-4 text-center">
                  <div className="text-sm text-gray-600 mb-1">《{musicInviteDialog.song?.title}》</div>
                  <div className="text-xs text-gray-400">正在询问对方是否愿意一起听</div>
                </div>
              </>
            ) : (
            <>
            <div className={`px-4 py-4 text-center ${
              musicInviteDialog.accepted 
                ? 'bg-gradient-to-r from-pink-400 to-purple-500' 
                : 'bg-gradient-to-r from-gray-400 to-gray-500'
            }`}>
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-white/20 flex items-center justify-center">
                {musicInviteDialog.accepted ? (
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div className="text-white font-medium">
                {musicInviteDialog.accepted
                  ? (musicInviteDialog.direction === 'incoming'
                    ? `你已接受${character.name}的听歌邀请`
                    : `对方已接受你的听歌邀请`)
                  : (musicInviteDialog.direction === 'incoming'
                    ? `你已拒绝${character.name}的听歌邀请`
                    : `对方拒绝了你的听歌邀请`)
                }
              </div>
            </div>
            <div className="p-4 text-center">
              <div className="text-sm text-gray-600 mb-1">
                《{musicInviteDialog.song?.title}》
              </div>
              <div className="text-xs text-gray-400 mb-4">
                {musicInviteDialog.accepted
                  ? '点击确认进入一起听歌界面（可切歌）'
                  : '你可以换一首再试试'
                }
              </div>
              {musicInviteDialog.accepted && musicInviteDialog.needsConfirm ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMusicInviteDialog({ open: false })}
                    className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium"
                  >
                    稍后
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const t = musicInviteDialog.song?.title || ''
                      const a = musicInviteDialog.song?.artist || ''
                      setMusicInviteDialog({ open: false })
                      if (t) enterListenTogether(t, a)
                    }}
                    className="flex-1 py-2 rounded-lg bg-gradient-to-r from-pink-400 to-purple-500 text-white text-sm font-medium"
                  >
                    确认
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setMusicInviteDialog({ open: false })}
                  className={`w-full py-2 rounded-lg text-white text-sm font-medium ${
                    musicInviteDialog.accepted 
                      ? 'bg-gradient-to-r from-pink-400 to-purple-500' 
                      : 'bg-gray-400'
                  }`}
                >
                  知道了
                </button>
              )}
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* 收到音乐邀请的确认弹窗 */}
      {musicInviteMsg && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-8">
          <div 
            className="absolute inset-0 bg-black/30"
            onClick={() => setMusicInviteMsg(null)}
          />
          <div className="relative w-full max-w-[260px] rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="px-4 py-4 bg-gradient-to-r from-pink-400 to-purple-500 text-white text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
              </div>
              <div className="font-medium">音乐邀请</div>
            </div>
            <div className="p-4">
              <div className="text-center text-sm text-gray-600 mb-1">
                {character.name} 邀请你一起听
              </div>
              <div className="text-center text-xs text-gray-400 mb-4">
                《{musicInviteMsg.musicTitle}》- {musicInviteMsg.musicArtist}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRejectMusicInvite}
                  className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium"
                >
                  拒绝
                </button>
                <button
                  type="button"
                  onClick={handleAcceptMusicInvite}
                  className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-pink-400 to-purple-500 text-white text-sm font-medium"
                >
                  接受
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑模式：删除确认 */}
      <WeChatDialog
        open={showEditDeleteConfirm}
        title="删除选中的消息？"
        message="删除后不可恢复。"
        confirmText="删除"
        cancelText="取消"
        danger
        onCancel={() => setShowEditDeleteConfirm(false)}
        onConfirm={handleDeleteSelected}
      />

      {/* 清空消息确认弹窗 */}
      <WeChatDialog
        open={showClearConfirm}
        title="清空所有消息？"
        message="所有聊天记录和记忆都将被永久删除，此操作不可逆！"
        confirmText="确认清空"
        cancelText="取消"
        danger
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={handleClearAll}
      />

      {/* 转发目标选择弹窗 */}
      {showForwardTargetPicker && (
        <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-[400px] rounded-t-2xl bg-white shadow-xl max-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <button
                type="button"
                onClick={() => setShowForwardTargetPicker(false)}
                className="text-gray-500 text-sm"
              >
                取消
              </button>
              <span className="font-semibold text-gray-800">转发给...</span>
              <div className="w-10" />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {/* 群聊列表 */}
              {groups.length > 0 && (
                <>
                  <div className="text-xs text-gray-400 px-3 py-2">群聊</div>
                  <div className="space-y-1 mb-2">
                    {groups.map(g => {
                      const groupMembers = g.memberIds.map(id => characters.find(c => c.id === id)).filter(Boolean)
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            const selectedMessages = messages
                              .filter(m => forwardSelectedIds.has(m.id))
                              .sort((a, b) => a.timestamp - b.timestamp)
                              .map(m => ({
                                senderName: m.isUser ? (selectedPersona?.name || '我') : character.name,
                                content: m.content,
                                timestamp: m.timestamp,
                                type: m.type as 'text' | 'image' | 'sticker' | 'transfer' | 'voice',
                                transferAmount: m.transferAmount,
                                transferNote: m.transferNote,
                                voiceText: m.voiceText,
                                voiceDuration: m.voiceDuration,
                              }))
                            
                            addMessage({
                              characterId: '',
                              groupId: g.id,
                              content: `[转发了${selectedMessages.length}条消息]`,
                              isUser: true,
                              type: 'chat_forward',
                              forwardedMessages: selectedMessages,
                              forwardedFrom: character.name,
                            })
                            
                            setShowForwardTargetPicker(false)
                            setForwardMode(false)
                            setForwardSelectedIds(new Set())
                            setInfoDialog({ open: true, title: '转发成功', message: `已转发${selectedMessages.length}条消息到「${g.name}」` })
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
                        >
                          <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                            {g.avatar ? (
                              <img src={g.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-white text-sm font-medium">{g.name[0]}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <div className="text-sm font-medium text-gray-800 truncate">{g.name}</div>
                            <div className="text-xs text-gray-400 truncate">{groupMembers.slice(0, 3).map(m => m?.name).join('、')}{groupMembers.length > 3 ? '...' : ''}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              
              {/* 联系人列表 */}
              <div className="text-xs text-gray-400 px-3 py-2">联系人</div>
              {characters.filter(c => c.id !== characterId && !c.isHiddenFromChat).length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">暂无其他联系人</div>
              ) : (
                <div className="space-y-1">
                  {characters.filter(c => c.id !== characterId && !c.isHiddenFromChat).map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        // 收集选中的消息
                        const selectedMessages = messages
                          .filter(m => forwardSelectedIds.has(m.id))
                          .sort((a, b) => a.timestamp - b.timestamp)
                          .map(m => ({
                            senderName: m.isUser ? (selectedPersona?.name || '我') : character.name,
                            content: m.content,
                            timestamp: m.timestamp,
                            type: m.type as 'text' | 'image' | 'sticker' | 'transfer' | 'voice',
                            transferAmount: m.transferAmount,
                            transferNote: m.transferNote,
                            voiceText: m.voiceText,
                            voiceDuration: m.voiceDuration,
                          }))
                        
                        // 发送转发消息
                        addMessage({
                          characterId: c.id,
                          content: `[转发了${selectedMessages.length}条消息]`,
                          isUser: true,
                          type: 'chat_forward',
                          forwardedMessages: selectedMessages,
                          forwardedFrom: character.name,
                        })
                        
                        // 关闭弹窗和转发模式
                        setShowForwardTargetPicker(false)
                        setForwardMode(false)
                        setForwardSelectedIds(new Set())
                        
                        // 提示成功
                        setInfoDialog({ open: true, title: '转发成功', message: `已转发${selectedMessages.length}条消息给${c.name}` })
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0">
                        {c.avatar ? (
                          <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm font-medium">
                            {c.name[0]}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-800">{c.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 编辑消息对话框 */}
      {editingMessageId && (() => {
        const editMsg = messages.find(m => m.id === editingMessageId)
        if (!editMsg) return null
        return (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6 bg-black/50">
            <div className="w-full max-w-[400px] rounded-2xl bg-white p-4 shadow-xl">
              <div className="text-lg font-semibold text-gray-800 mb-4">编辑消息</div>
              <textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-800 text-sm outline-none resize-none"
                rows={4}
                placeholder="输入消息内容"
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingMessageId(null)
                    setEditingContent('')
                  }}
                  className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const v = editingContent.trim()
                    if (v) {
                      // 根据消息类型更新对应字段（支持：用户消息编辑 / 转账备注 / 虚拟语音转文字）
                      if (editMsg.type === 'transfer') {
                        updateMessage(editingMessageId, { transferNote: v })
                      } else if (editMsg.type === 'voice') {
                        updateMessage(editingMessageId, { voiceText: v, voiceOriginalText: v })
                      } else {
                        updateMessage(editingMessageId, { content: v })
                      }
                    }
                    setEditingMessageId(null)
                    setEditingContent('')
                  }}
                  className="flex-1 py-2 rounded-lg bg-[#07C160] text-white text-sm font-medium"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* API超时弹窗 */}
      <WeChatDialog
        open={showTimeoutDialog}
        title="连接超时"
        message="已等待超过5分钟，请检查API配置或网络连接，然后重试。"
        confirmText="知道了"
        onConfirm={() => setShowTimeoutDialog(false)}
        onCancel={() => setShowTimeoutDialog(false)}
      />
      
      {/* 斗地主邀请确认弹窗 */}
      <WeChatDialog
        open={showDoudizhuInviteConfirm}
        title="邀请斗地主"
        message={`确定向${character.name}发送斗地主邀请吗？`}
        confirmText="发送邀请"
        cancelText="取消"
        onConfirm={handleSendDoudizhuInvite}
        onCancel={() => setShowDoudizhuInviteConfirm(false)}
      />
      
      {/* 收到斗地主邀请弹窗 */}
      <WeChatDialog
        open={!!doudizhuInviteMsg}
        title="斗地主邀请"
        message={`${character.name}邀请你一起玩斗地主，是否接受？`}
        confirmText="接受"
        cancelText="拒绝"
        onConfirm={handleAcceptDoudizhuInvite}
        onCancel={handleRejectDoudizhuInvite}
      />
      
      {/* 查手机悬浮窗 */}
      {showPhonePeek && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-4 py-8 bg-black/50">
          <div className="w-full max-w-[400px] h-[85vh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-pink-50 to-purple-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full overflow-hidden">
                  {character?.avatar ? (
                    <img src={character.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm font-medium">
                      {character?.name[0]}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-800">{character?.name}的手机</div>
                  <div className="text-xs text-gray-500">{new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPhonePeek(false)
                  setPhonePeekData(null)
                  setPhonePeekSelectedChat(null)
                }}
                className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center text-gray-600 hover:bg-white"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 加载中 */}
            {phonePeekLoading && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-6">
                  <div className="w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <div className="text-sm text-gray-700 font-medium animate-pulse">{phonePeekLoadingMsg}</div>
                  <div className="text-xs text-gray-400 mt-2">正在整理对方手机数据...</div>
                </div>
              </div>
            )}

            {/* 内容区 */}
            {!phonePeekLoading && phonePeekData && (
              <>
                {/* Tab导航 */}
                <div className="flex border-b border-gray-200 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => { setPhonePeekTab('chats'); setPhonePeekSelectedChat(null) }}
                    className={`flex-1 py-2 text-sm font-medium ${phonePeekTab === 'chats' ? 'text-pink-600 border-b-2 border-pink-600' : 'text-gray-600'}`}
                  >
                    消息 ({phonePeekData.chats.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPhonePeekTab('wallet'); setPhonePeekSelectedChat(null) }}
                    className={`flex-1 py-2 text-sm font-medium ${phonePeekTab === 'wallet' ? 'text-pink-600 border-b-2 border-pink-600' : 'text-gray-600'}`}
                  >
                    钱包
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPhonePeekTab('bills'); setPhonePeekSelectedChat(null) }}
                    className={`flex-1 py-2 text-sm font-medium ${phonePeekTab === 'bills' ? 'text-pink-600 border-b-2 border-pink-600' : 'text-gray-600'}`}
                  >
                    账单
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPhonePeekTab('memo'); setPhonePeekSelectedChat(null) }}
                    className={`flex-1 py-2 text-sm font-medium ${phonePeekTab === 'memo' ? 'text-pink-600 border-b-2 border-pink-600' : 'text-gray-600'}`}
                  >
                    备忘
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPhonePeekTab('photos'); setPhonePeekSelectedChat(null) }}
                    className={`flex-1 py-2 text-sm font-medium ${phonePeekTab === 'photos' ? 'text-pink-600 border-b-2 border-pink-600' : 'text-gray-600'}`}
                  >
                    照片
                  </button>
                </div>

                {/* 消息列表 */}
                {phonePeekTab === 'chats' && (
                  <div className="flex-1 overflow-y-auto">
                    {phonePeekSelectedChat === null ? (
                      <div className="divide-y divide-gray-100">
                        {phonePeekData.chats.map((chat, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => setPhonePeekSelectedChat(index)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100"
                          >
                            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                              {chat.characterAvatar ? (
                                <img src={chat.characterAvatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-lg font-medium">
                                  {chat.characterName[0]}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <div className="text-sm font-medium text-gray-800 truncate">{chat.remark}</div>
                              <div className="text-xs text-gray-500 truncate mt-0.5">
                                {chat.messages[chat.messages.length - 1]?.content || '暂无消息'}
                              </div>
                            </div>
                            <div className="text-xs text-gray-400 flex-shrink-0">
                              {formatTime(chat.messages[chat.messages.length - 1]?.timestamp || Date.now())}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col">
                        <div className="px-4 py-2 border-b border-gray-200 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPhonePeekSelectedChat(null)}
                            className="text-gray-600"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <div className="flex-1 text-sm font-medium text-gray-800">
                            {phonePeekData.chats[phonePeekSelectedChat]?.remark}
                          </div>
                          <button
                            type="button"
                            onClick={() => forwardToCharacter('chat', phonePeekSelectedChat)}
                            className="px-2 py-1 rounded text-xs text-pink-600 hover:bg-pink-50"
                          >
                            转发
                          </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                          {phonePeekData.chats[phonePeekSelectedChat]?.messages.map((msg, idx) => (
                            <div
                              key={idx}
                              className={`flex gap-2 ${msg.isUser ? 'flex-row-reverse' : ''}`}
                            >
                              {/* 当前角色头像（只在isUser时显示） */}
                              {msg.isUser && (
                                <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
                                  {character?.avatar ? (
                                    <img src={character.avatar} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-xs font-medium">
                                      {character?.name?.[0]}
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className={`flex flex-col ${msg.isUser ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[220px] px-3 py-2 rounded-2xl text-sm ${
                                  msg.isUser
                                    ? 'bg-pink-500 text-white rounded-tr-md'
                                    : 'bg-gray-100 text-gray-800 rounded-tl-md'
                                }`}>
                                  {msg.content}
                                </div>
                                {/* 翻译（非中文角色） */}
                                {msg.contentZh && (
                                  <div className={`max-w-[220px] px-2 py-1 mt-1 rounded text-xs bg-blue-50 text-blue-600 ${msg.isUser ? 'text-right' : 'text-left'}`}>
                                    {msg.contentZh}
                                  </div>
                                )}
                                <div className="text-xs text-gray-400 mt-1 px-1">
                                  {formatTime(msg.timestamp)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 钱包 */}
                {phonePeekTab === 'wallet' && (
                  <div className="flex-1 overflow-y-auto">
                    <div className="p-4">
                      {/* 钱包余额卡片 */}
                      <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-5 text-white shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
                            </svg>
                            <span className="text-sm font-medium opacity-90">微信零钱</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => forwardToCharacter('wallet')}
                            className="px-2 py-1 rounded text-xs bg-white/20 hover:bg-white/30 transition"
                          >
                            转发
                          </button>
                        </div>
                        <div className="text-3xl font-bold mb-1">
                          ¥{phonePeekData.walletBalance.toFixed(2)}
                        </div>
                        <div className="text-xs opacity-75">
                          {character?.name}的钱包余额
                        </div>
                      </div>
                      
                      {/* 快捷操作（仅展示） */}
                      <div className="mt-4 grid grid-cols-4 gap-3">
                        {[
                          { icon: '💳', label: '收付款' },
                          { icon: '🏦', label: '银行卡' },
                          { icon: '📊', label: '账单' },
                          { icon: '🎁', label: '红包' },
                        ].map((item, idx) => (
                          <div key={idx} className="flex flex-col items-center gap-1 py-3 bg-gray-50 rounded-xl">
                            <span className="text-xl">{item.icon}</span>
                            <span className="text-xs text-gray-600">{item.label}</span>
                          </div>
                        ))}
                      </div>
                      
                      {/* 最近交易 */}
                      <div className="mt-4">
                        <div className="text-sm font-medium text-gray-800 mb-2">最近交易</div>
                        <div className="space-y-2">
                          {phonePeekData.bills.slice(0, 5).map((bill, idx) => (
                            <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                              <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                  bill.type === '收入' ? 'bg-green-100' : 'bg-orange-100'
                                }`}>
                                  <span className="text-sm">{bill.type === '收入' ? '📥' : '📤'}</span>
                                </div>
                                <div className="text-xs text-gray-600 truncate max-w-[140px]">{bill.description}</div>
                              </div>
                              <span className={`text-sm font-medium ${bill.type === '收入' ? 'text-green-600' : 'text-gray-800'}`}>
                                {bill.type === '收入' ? '+' : '-'}¥{bill.amount.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 账单列表 */}
                {phonePeekTab === 'bills' && (
                  <div className="flex-1 overflow-y-auto">
                    <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800">最近消费</span>
                      <button
                        type="button"
                        onClick={() => forwardToCharacter('bill')}
                        className="px-2 py-1 rounded text-xs text-pink-600 hover:bg-pink-50"
                      >
                        转发全部
                      </button>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {phonePeekData.bills.map((bill, index) => (
                        <div key={index} className="px-4 py-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-sm font-medium ${bill.type === '收入' ? 'text-green-600' : 'text-red-600'}`}>
                              {bill.type === '收入' ? '+' : '-'}¥{bill.amount.toFixed(2)}
                            </span>
                            <span className="text-xs text-gray-400">
                              {formatTime(bill.timestamp)}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600">{bill.description}</div>
                        </div>
                      ))}
                      {phonePeekData.bills.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-gray-400">暂无消费记录</div>
                      )}
                    </div>
                  </div>
                )}

                {/* 备忘录 */}
                {phonePeekTab === 'memo' && (
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    <div className="bg-gray-50 rounded-xl p-4 min-h-[200px]">
                      <div className="text-sm text-gray-800 whitespace-pre-wrap">
                        {phonePeekData.memo || '暂无备忘录'}
                      </div>
                      {/* 备忘录翻译（非中文角色） */}
                      {phonePeekData.memoZh && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="text-xs text-blue-500 mb-1">翻译：</div>
                          <div className="text-sm text-blue-600 whitespace-pre-wrap">
                            {phonePeekData.memoZh}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 最近照片 */}
                {phonePeekTab === 'photos' && (
                  <div className="flex-1 overflow-y-auto px-4 py-4">
                    <div className="grid grid-cols-2 gap-3">
                      {phonePeekData.recentPhotos.map((desc, index) => (
                        <div key={index} className="bg-gray-100 rounded-xl p-3 aspect-square flex items-center justify-center">
                          <div className="text-xs text-gray-600 text-center">{desc}</div>
                        </div>
                      ))}
                      {phonePeekData.recentPhotos.length === 0 && (
                        <div className="col-span-2 px-4 py-8 text-center text-sm text-gray-400">暂无照片</div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 线上模式：长按气泡操作菜单（线下模式不动） */}
      {!character?.offlineMode && msgActionMenu.open && msgActionMenu.msg && createPortal(
        <div
          className="fixed inset-0 z-[95]"
          onPointerDown={() => closeMsgActionMenu()}
          role="presentation"
        >
          <div
            className="fixed inset-0"
            style={{ background: 'transparent' }}
          />
          <div
            className="fixed"
            style={{
              left: msgActionMenu.x,
              top: msgActionMenu.y,
              transform:
                msgActionMenu.placement === 'top'
                  ? 'translate(-50%, -100%) translateY(-8px)'
                  : 'translate(-50%, 8px)',
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-2xl bg-black/75 text-white shadow-lg border border-white/10 backdrop-blur">
              {/* 重新生成（放到最后一条AI消息的菜单里，避免按钮碍事） */}
              {(() => {
                const last = (() => {
                  // 重新生成应该针对“最后一条AI正文回复”，忽略尾随的 system/pat/sticker（否则非中文翻译气泡经常没有“重新生成”）
                  for (let i = messages.length - 1; i >= 0; i--) {
                    const m = messages[i]
                    if (!m) continue
                    if (m.isUser) continue
                    if (m.type === 'system' || m.type === 'pat' || m.type === 'sticker') continue
                    return m
                  }
                  return messages.length > 0 ? messages[messages.length - 1] : null
                })()
                const canRegen =
                  !showTyping &&
                  !!last &&
                  !last.isUser &&
                  last.type !== 'system' &&
                  msgActionMenu.msg?.id === last.id
                if (!canRegen) return null
                return (
                  <button
                    type="button"
                    onClick={() => {
                      closeMsgActionMenu()
                      handleRegenerate()
                    }}
                    className="px-2.5 py-1 rounded-xl text-[12px] hover:bg-white/15 active:bg-white/20"
                  >
                    重新生成
                  </button>
                )
              })()}

              {/* 编辑（支持：自己发的文本；对方文本；转账备注；虚拟语音转文字） */}
              {(msgActionMenu.msg.type === 'text' ||
                msgActionMenu.msg.type === 'transfer' ||
                (msgActionMenu.msg.type === 'voice' && !msgActionMenu.msg.voiceUrl)) && (
                  <button
                    type="button"
                    onClick={() => {
                      const m = msgActionMenu.msg!
                      setEditingMessageId(m.id)
                      if (m.type === 'transfer') setEditingContent(m.transferNote || '')
                      else if (m.type === 'voice') setEditingContent(m.voiceText || '')
                      else setEditingContent(m.content)
                      closeMsgActionMenu()
                    }}
                    className="px-2.5 py-1 rounded-xl text-[12px] hover:bg-white/15 active:bg-white/20"
                  >
                    编辑
                  </button>
                )}

              {/* 引用（仅对方消息的文本/语音） */}
              {!msgActionMenu.msg.isUser &&
                (msgActionMenu.msg.type === 'text' || msgActionMenu.msg.type === 'voice') && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingToMessageId(msgActionMenu.msg!.id)
                      closeMsgActionMenu()
                    }}
                    className="px-2.5 py-1 rounded-xl text-[12px] hover:bg-white/15 active:bg-white/20"
                  >
                    引用
                  </button>
                )}

              {/* 删除（双方消息都可删除） */}
              <button
                type="button"
                onClick={() => {
                  const id = msgActionMenu.msg!.id
                  closeMsgActionMenu()
                  // 进入“批量删除”勾选模式（默认选中当前这条）
                  setForwardMode(false)
                  setForwardSelectedIds(new Set())
                  setEditMode(true)
                  setSelectedMsgIds(new Set([id]))
                }}
                className="px-2.5 py-1 rounded-xl text-[12px] text-red-200 hover:bg-red-500/25 active:bg-red-500/30"
              >
                删除
              </button>

              {/* 仅删除此条（保留单删能力） */}
              <button
                type="button"
                onClick={() => {
                  const id = msgActionMenu.msg!.id
                  closeMsgActionMenu()
                  if (confirm('确定仅删除这一条消息吗？')) {
                    deleteMessage(id)
                  }
                }}
                className="px-2.5 py-1 rounded-xl text-[12px] hover:bg-white/15 active:bg-white/20"
              >
                单删
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 斗地主邀请已接受弹窗 */}
      <WeChatDialog
        open={showDoudizhuAcceptedDialog}
        title={`${character.name}已接受邀请`}
        message="是否现在开始游戏？"
        confirmText="开始游戏"
        cancelText="稍后再玩"
        onConfirm={() => {
          setShowDoudizhuAcceptedDialog(false)
          // 跳转到斗地主并设置联机模式
          navigate('/apps/doudizhu', { 
            state: { 
              mode: 'online', 
              friends: [{ id: character.id, name: character.name, avatar: character.avatar, position: 1 }] 
            } 
          })
        }}
        onCancel={() => setShowDoudizhuAcceptedDialog(false)}
      />
    </WeChatLayout>
  )
}
