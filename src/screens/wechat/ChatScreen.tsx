import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'
import WeChatLayout from './WeChatLayout'
import WeChatDialog from './components/WeChatDialog'
import { getGlobalPresets, getLorebookEntriesForCharacter } from '../PresetScreen'
import { xEnsureUser, xLoad, xNewPost, xSave, xAddFollow, xRemoveFollow, xIsFollowing } from '../../storage/x'

export default function ChatScreen() {
  const navigate = useNavigate()
  const { fontColor, musicPlaylist, llmConfig, callLLM, playSong, ttsConfig } = useOS()
  const { characterId } = useParams<{ characterId: string }>()
  const { 
    getCharacter, getMessagesByCharacter, getMessagesPage, addMessage, updateMessage, deleteMessage, deleteMessagesByIds,
    getStickersByCharacter,clearMessages,
    addTransfer, getPeriodRecords, addPeriodRecord,
    updatePeriodRecord, getCurrentPeriod, listenTogether, startListenTogether,
    setCurrentChatId, toggleBlocked, setCharacterTyping, updateCharacter,
    walletBalance, updateWalletBalance, addWalletBill,
    getUserPersona, getCurrentPersona,
    addFavoriteDiary, isDiaryFavorited,
    characters, getTransfersByCharacter, groups
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const forceScrollRef = useRef(false)
  // 分页渲染窗口：只渲染最近 N 条，上拉再加载更早的
  const PAGE_SIZE = 15
  const [startIndex, setStartIndex] = useState(0)
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
    '正在联系二舅，他是个黑客...',
    '二舅正在尝试破解对方手机密码...',
    '哎呦！差点被发现！再等会儿...',
    '悄咪咪的，打枪的不要！',
    '这么难的技术，慢点正常啦~',
    '二舅说密码有点复杂，稍等...',
    '正在绕过防火墙...',
    '快了快了，马上就好...',
    '二舅喝口水，别催了...',
    '正在下载聊天记录...',
    '数据传输中，保持耐心...',
    '二舅说这手机防护挺强的...',
    '差一点点就破解了...',
    '别动别动，让二舅专心点...',
    '正在悄悄窃取对方隐私...',
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
  
  // 发送用户表情包
  const sendUserSticker = (sticker: typeof stickers[0]) => {
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
    for (const s of stickers) {
      if (s.category) categories.add(s.category)
    }
    return Array.from(categories).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [stickers])
  
  // 获取当前标签页的表情包
  const currentTabStickers = useMemo(() => {
    if (stickerTab === 'recent') {
      // 返回最近使用的表情包
      return recentStickers
        .map(id => stickers.find(s => s.id === id))
        .filter((s): s is typeof stickers[0] => !!s)
    }
    // 返回指定分类的表情包
    return stickers.filter(s => s.category === stickerTab)
  }, [stickerTab, stickers, recentStickers])
  
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

  // 上拉加载更多：保持滚动位置不跳
  useEffect(() => {
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
    }
  }, [character?.voiceId, ttsConfig])
  
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
        const splitToReplies = (raw: string) => {
          const text = (raw || '').trim()
          if (!text) return []
          
          // 线下模式：不分割，直接返回完整的一条
          if (character.offlineMode) {
            return [text]
          }
          
          // 线上模式：按换行和标点分割
          const byLine = text.split('\n').map(s => s.trim()).filter(Boolean)
      const keepCmd = (s: string) =>
        /\|\|\|/.test(s) ||
        /\[转账:/.test(s) ||
        /[【\[]\s*转账\s*[:：]/.test(s) ||
        /\[推文[:：]/.test(s) ||
        /[【\[]\s*推文\s*[:：]/.test(s) ||
        /\[推特主页[:：\]]/.test(s) ||
        /[【\[]\s*(推特主页|X主页)\s*[:：\]]/.test(s)
          const out: string[] = []
          for (const line of byLine) {
            if (keepCmd(line)) { out.push(line); continue }
            // 如果只有一行或一行太长，再按句号/问号/感叹号拆
            const parts = line.match(/[^。！？!?]+[。！？!?]?/g) || [line]
            for (const p of parts) {
              const t = (p || '').trim()
              if (!t) continue
              out.push(t)
            }
          }
          // 去掉过短碎片，并合并很短的
          const merged: string[] = []
          for (const s of out) {
            if (merged.length === 0) { merged.push(s); continue }
            const last = merged[merged.length - 1]
            if (!keepCmd(s) && !keepCmd(last) && (last.length < 10 || s.length < 8)) {
              merged[merged.length - 1] = `${last}${s}`
            } else {
              merged.push(s)
            }
          }
          return merged.filter(Boolean).slice(0, 15)
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
            if (m.type === 'image') {
              if (m.isUser && m.content && m.content.startsWith('data:image')) {
                // 多模态格式：图片+文本（OpenAI vision API格式）
                // 确保data URL格式正确：data:image/xxx;base64,xxx
                content = [
                  { type: 'text', text: '[用户发送了一张图片，请描述你看到的内容并自然回应]' },
                  { type: 'image_url', image_url: { url: m.content } }
                ]
                used += 100 // 图片占用估算
              } else {
                // 旧格式图片（blob URL等）或非用户图片，用文本描述
                content = '[对方发送了一张图片]'
                used += 15
              }
            }
            else if (m.type === 'sticker') {
              content = '<STICKER />'
              used += 10
            }
            else if (m.type === 'transfer') {
              const amt = (m.transferAmount ?? 0).toFixed(2)
              const note = (m.transferNote || '转账').replace(/\s+/g, ' ').slice(0, 30)
              const st = m.transferStatus || 'pending'
              const stText = st === 'received' ? '已领取' : st === 'refunded' ? '已退还' : '待处理'
              content = `[发送了转账：¥${amt}，备注"${note}"，${stText}]`
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
        
        // 计算时间差（增强“活人感”）
        const nowTs = character.timeSyncEnabled !== false
          ? Date.now()
          : (character.manualTime ? new Date(character.manualTime).getTime() : Date.now())
        const nonSystem = workingMessages.filter(m => m.type !== 'system')
        const lastMsg = nonSystem.length > 0 ? nonSystem[nonSystem.length - 1] : null
        const prevMsg = nonSystem.length > 1 ? nonSystem[nonSystem.length - 2] : null
        const lastUserInHistory = [...nonSystem].reverse().find(m => m.isUser) || null
        // 关键：如果用户隔了很久才回，lastMsg 是“用户新发的这条”，gap 应该看它和 prevMsg 的间隔
        const gapMs = lastMsg
          ? (lastMsg.isUser && prevMsg ? Math.max(0, lastMsg.timestamp - prevMsg.timestamp) : Math.max(0, nowTs - lastMsg.timestamp))
          : 0
        const silenceSinceUserMs = lastUserInHistory ? Math.max(0, nowTs - lastUserInHistory.timestamp) : 0
                // 重要：用户“没发新消息，只是点箭头”时也要算作无新发言（否则会把昨天那条当成“新消息”，错过“消失很久”的追问）
        const hasNewUserMessage = !!(lastMsg && lastMsg.isUser) && !opts?.forceNudge
        

        // 最近消息时间线：让模型“看得见每条的时间”，避免把“领钱/转账”时间搞反
        const fmtTs = (ts: number) => new Date(ts).toLocaleString('zh-CN', { hour12: false })
        const summarizeMsg = (m: any) => {
          if (m.type === 'transfer') {
            const amt = typeof m.transferAmount === 'number' ? `¥${m.transferAmount.toFixed(2)}` : '¥0.00'
            const st = m.transferStatus || 'pending'
            const note = (m.transferNote || '转账').replace(/\s+/g, ' ').slice(0, 18)
            return `转账 ${amt}（${st}｜${note}）`
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
        const recentTimeline = nonSystem.slice(-12).map(m => `- ${fmtTs(m.timestamp)} ${m.isUser ? '我' : 'TA'}：${summarizeMsg(m)}`).join('\n')

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
          '严禁出现任何辱女/性羞辱/骂女性的词汇（包括但不限于：婊、婊子、贱人、母狗、骚、破鞋、鸡、绿茶婊、女拳等）。' +
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

        let systemPrompt = `${globalPresets ? globalPresets + '\n\n' : ''}${lorebookEntries ? lorebookEntries + '\n\n' : ''}【角色信息】
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

【当前时间（精确到秒）】
${character.timeSyncEnabled ? new Date().toLocaleString('zh-CN', { hour12: false }) : (character.manualTime ? new Date(character.manualTime).toLocaleString('zh-CN', { hour12: false }) : new Date().toLocaleString('zh-CN', { hour12: false }))}

【季节与天气感知】
${(() => {
  const month = new Date().getMonth() + 1
  const season = month >= 3 && month <= 5 ? '春天' : month >= 6 && month <= 8 ? '夏天' : month >= 9 && month <= 11 ? '秋天' : '冬天'
  const seasonDesc = month >= 3 && month <= 5 ? '春暖花开，万物复苏' : month >= 6 && month <= 8 ? '炎炎夏日，注意防暑' : month >= 9 && month <= 11 ? '秋高气爽，落叶纷飞' : '寒冬腊月，注意保暖'
  const weatherHint = month === 12 || month === 1 || month === 2 ? '天冷了要多穿衣服、喝热水' : month >= 6 && month <= 8 ? '天热了要注意防晒、多喝水' : '换季了要注意身体'
  return `- 当前季节：${season}（${seasonDesc}）
- 季节关怀：${weatherHint}
- 你可以在聊天中自然提到天气/季节相关的话题，比如"今天好冷啊"、"最近天气不错"等
- 在日记里也可以写关于天气、季节、时节的感受`
})()}

【最近消息时间线（必须参考，尤其是转账/已领取的时间，不能搞反）】
${recentTimeline || '（无）'}

【时间感（用自然语言，严禁报数字）】
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
  - 不要总是问"你去哪了"，要像真人一样自然

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
- 用自然、口语化的语气回复，像真人微信聊天
- 你可以很短：只发“？”、“。”、“嗯”、“行”、“…”都可以；也可以很长，随情绪
- 不要强行每条都很完整/很礼貌，允许有自己的心情与小情绪
- 根据对话情绪和内容，回复消息（${(character as any).language !== 'zh' ? '非中文语言时建议 1-5 条，避免太多' : '1-15 条都可以'}），每条消息用换行分隔（数量可少可多，随心情）
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
- 【主页】只有当你真的想分享你的推特主页时，才能使用 [推特主页] 或 [X主页]（单独一行）。
- 【位置】只有当你真的想分享位置时，才能使用 [位置:地点名称:详细地址:城市] 格式（单独一行）。
- 【一起听歌】如果用户主动提出想一起听歌，你可以发送音乐邀请卡片，格式：[音乐:歌名:歌手]（单独一行），曲库：${musicPlaylist.slice(0, 10).map(s => s.title).join('、')}${musicPlaylist.length > 10 ? '...' : ''}；不要在无关对话主动提歌名。听歌邀请只通过“音乐卡片”流程处理（用户发卡片→点箭头→你决定→弹确认→进入一起听界面）。`

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

        // 线下模式关闭时，禁止动作描述；开启时，允许描写神态动作
        if (!character.offlineMode) {
          systemPrompt += `

【重要限制】
- 这是微信聊天，不是小说！禁止使用任何动作描写、神态描写、心理描写
- 禁止使用括号()、*号*、【】等符号来描述动作或神态
- 禁止出现类似"（笑）"、"*摸摸头*"、"【害羞】"这样的内容
- 只能发送纯文字对话，就像真人发微信一样
- 可以用表情符号emoji，但不能描述动作`
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
1. 所有叙述性文字（动作、神态、环境、心理暗示）必须用【中文】书写！
2. 只有角色说的话才用【${languageName(characterLanguage)}】，并且必须：
   - 用中文引号""包裹
   - 在外语后面立即加括号写【中文翻译】
3. 格式：中文叙述 + "外语对话（中文翻译）" + 中文叙述

【正确输出示例】
轻轻走到你身边，嘴角带着温柔的笑意。"Hey honey, I just stepped into a diner to grab some eggs and coffee.（亲爱的，我刚去餐厅买了些鸡蛋和咖啡。）"说着把袋子放在桌上，关切地看着你。"Did you sleep well?（你睡得好吗？）"

【错误输出示例 - 绝对禁止】
❌ 嗨（挥手）→ 错！"挥手"是动作，必须用中文完整句子描写
❌ Hey honey. I just stepped into a diner... → 错！外语必须加括号翻译
❌ 纯外语输出 → 错！叙述部分必须是中文

【引号使用规则】
- 需要加引号：角色说的话（对话）
- 不需要加引号：动作描写、神态描写、环境描写、心理暗示

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

`
          
          systemPrompt = offlineModePrefix + systemPrompt + `

【线下模式要求】
- 每次只输出一段完整的叙事，不要分成多条消息
- 包含：神态描写 + 动作描写 + 语言描写（如果有）
- 保持你的人设性格，用第三人称叙事方式展现
- 仔细阅读上面的对话历史，确保回复与上下文相关

##############################################
#  【线下模式 - 绝对禁止事项】              #
#  以下内容绝对禁止！违反即为错误输出！     #
##############################################

❌ 禁止发送表情包！绝对不能发表情包！
❌ 禁止发送贴纸！绝对不能发贴纸！
❌ 禁止发送转账！绝对不能发转账！
❌ 禁止发送红包！
❌ 禁止发送音乐分享！
❌ 禁止发送斗地主邀请！
❌ 禁止使用 [转账:xx:xx] 格式！
❌ 禁止使用 [音乐:xx] 格式！
❌ 禁止使用 [表情包] 或任何特殊格式！

✅ 只能输出：纯叙事文字（动作描写 + 神态描写 + 对话描写）
✅ 线下模式 = 小说叙事模式，不是微信聊天模式
✅ 除了纯文字叙事，什么都不要发！

##############################################

【字数要求】${minLen}~${maxLen} 字
${isLongForm ? `由于字数要求较多：更细腻地描写神态、表情、动作细节；适当推进剧情；增加环境氛围描写。` : `保持精炼但不失细节。`}`
        }

        const translationMode = characterLanguage !== 'zh' && chatTranslationEnabled
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
            llmMessages.push({ role: 'user', content: '用户没有新发言，请你根据时间差主动发一条关心/追问/吐槽的微信消息。' })
          }
        }
        
        // 时间感知强制触发条件：用户很久没回（>=2小时）必须先提到并追问
        const shouldForceNudge = !hasNewUserMessage && silenceSinceUserMs >= 2 * 60 * 60 * 1000
        const shouldForceAcknowledge = (hasNewUserMessage && gapMs >= 2 * 60 * 60 * 1000) || shouldForceNudge

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

        // 根据线下模式字数范围调整 maxTokens
        const offlineMaxLen = character.offlineMaxLength || 300
        const dynamicMaxTokens = character.offlineMode ? Math.max(420, Math.ceil(offlineMaxLen * 1.5)) : 420

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
              { maxTokens: 420, timeoutMs: 600000 }
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
              { maxTokens: 420, timeoutMs: 600000 }
            )
          }
        }
        
        // 分割回复为多条消息（最多15条；即便模型只回一大段也能拆成多条）
        const replies = splitToReplies(response)

        // 表情包策略（活人感必须项）：
        // - 不再做“关键词替换文本”
        // - 只要角色配置了表情包，就尽量在一组回复里夹带 1~N 条表情包消息
        // 只使用“本角色已配置”的表情包（公共库不自动使用，必须在消息设置里手动添加给该角色）
        const stickerPool = stickers.filter(s => s.characterId === character.id)
        const stickerCandidates: number[] = []
        const pickRandomSticker = () => stickerPool[Math.floor(Math.random() * stickerPool.length)]
        
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
        
        // 随机决定在哪条回复后处理转账（如果有的话）
        const transferProcessIndex = pendingUserTransfers.length > 0 
          ? Math.floor(Math.random() * Math.max(1, replies.length)) 
          : -1
        
        // 随机决定在哪条回复后处理音乐邀请
        const musicProcessIndex = pendingUserMusicInvites.length > 0 
          ? Math.floor(Math.random() * Math.max(1, replies.length)) 
          : -1
        
        // 随机决定在哪条回复后处理斗地主邀请
        const doudizhuProcessIndex = pendingDoudizhuInvites.length > 0 
          ? Math.floor(Math.random() * Math.max(1, replies.length)) 
          : -1
        
        // 依次发送回复（首条更快；每条<=5秒）
        let totalDelay = 0
        const parseTransferCommand = (text: string) => {
          // 支持 [] / 【】 / 中英文冒号 / 多段备注
          const m = text.match(/[【\[]\s*转账\s*[:：]\s*(\d+(?:\.\d+)?)\s*[:：]\s*([^】\]]+)\s*[】\]]/)
          if (!m) return null
          const amount = parseFloat(m[1])
          const rawNote = (m[2] || '').trim()
          if (!Number.isFinite(amount) || amount <= 0) return null
          const status =
            /已领取|已收款|received/.test(rawNote) ? 'received' :
            /已退还|已退款|refunded/.test(rawNote) ? 'refunded' :
            'pending'
          const note = rawNote.replace(/[:：]\s*(received|refunded)\s*$/i, '').trim()
          return { amount, note, status: status as 'pending' | 'received' | 'refunded' }
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
            stickerCandidates.push(i)
          }
        }
        const desiredStickerCount =
          stickerPool.length > 0
            ? Math.min(
                Math.max(1, Math.ceil(replies.length / 4)), // 1条起步，回复越多越可能多插
                3,
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
          
          const transferCmd = parseTransferCommand(trimmedContent) || (() => {
            const m = trimmedContent.match(/\[转账:(\d+(?:\.\d+)?):(.+?)\]/)
            if (!m) return null
            return { amount: parseFloat(m[1]), note: (m[2] || '').trim(), status: 'pending' as const }
          })()
          const musicCmd = suppressAiMusicInvite ? null : parseMusicCommand(trimmedContent)
          const tweetCmd = parseTweetCommand(trimmedContent)
          const xProfileCmd = parseXProfileCommand(trimmedContent)
          const locationCmd = parseLocationCommand(trimmedContent)
          
          safeTimeoutEx(() => {
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
                
                const voiceMsg = addMessage({
                  characterId: character.id,
                  content: '[语音消息]',
                  isUser: false,
                  type: 'voice',
                  voiceText: isChinese ? textContent : textContent, // 先显示原文
                  voiceOriginalText: textContent, // 原文（用于TTS朗读）
                  voiceDuration: voiceDuration,
                  voiceUrl: '', // 先为空，异步填充
                  messageLanguage: characterLanguage,
                })
                
                // 异步生成语音URL（用原文生成语音）
                ;(async () => {
                  const url = await generateVoiceUrl(textContent)
                  if (url) {
                    updateMessage(voiceMsg.id, { voiceUrl: url })
                  }
                })()
                
                // 如果是外文，异步翻译并更新显示文字（无论是否开启翻译模式，语音转文字都带中文翻译）
                if (!isChinese) {
                  ;(async () => {
                    try {
                      const transResult = await callLLM([
                        { role: 'system', content: '你是一个翻译器。把用户给你的内容翻译成简体中文。只输出翻译结果，不要解释，不要加引号。' },
                        { role: 'user', content: textContent }
                      ], undefined, { maxTokens: 200, timeoutMs: 30000 })
                      const zhText = transResult.trim()
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
                const msg = addMessage({
                  characterId: character.id,
                  content: textContent,
                  isUser: false,
                  type: 'text',
                  messageLanguage: characterLanguage,
                  chatTranslationEnabledAtSend: translationMode,
                  translationStatus: translationMode ? 'pending' : undefined,
                  isOffline: character.offlineMode, // 标记是否是线下模式消息
                })
                
                // 翻译策略（仅文本消息需要）
                if (translationMode) {
                  if (dual) {
                    safeTimeoutEx(() => {
                      updateMessage(msg.id, { translatedZh: dual.zh, translationStatus: 'done' })
                    }, 420 + Math.random() * 520, { background: true })
                  } else {
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
              }
              
              // 夹带表情包（不按情绪匹配：随机挑本角色已配置的）
              if (stickerPool.length > 0 && chosenStickerIdx.has(index)) {
                const sticker = pickRandomSticker()
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
              
              // 随机拍一拍：根据上下文内容有概率触发（约10%概率）
              // 触发条件：回复内容包含友好/亲密/撒娇等关键词，或者随机触发
              // AI随机拍一拍（需要开启拍一拍功能）
              if (character?.patEnabled ?? true) {
                const friendlyKeywords = /好|嗯|啊|呀|呢|啦|哦|嘿嘿|哈哈|嘻嘻|么么|爱你|想你|抱抱|摸摸|亲亲|撒娇|可爱|温柔|贴心/
                const shouldPat = Math.random() < 0.1 || (friendlyKeywords.test(response || ''))
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
              const willAccept = Math.random() > 0.3
              const amount = transfer.transferAmount || 0
              
              safeTimeoutEx(() => {
                
                // 标记原转账为已处理
                updateMessage(transfer.id, { transferStatus: 'processed' })
                
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
                        `\n` +
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
                        `  "chatReply": "你接下来发给对方的一条微信回复（自然口吻，别写系统提示）"\n` +
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
    if (!inputText.trim()) return

    // 用户主动发送：强制滚到底部
    forceScrollRef.current = true
    nearBottomRef.current = true

    // 检查是否是转账格式：[转账:金额:备注] 或 【转账：金额：备注】
    const transferMatch = inputText.trim().match(/[【\[]\s*转账\s*[:：]\s*(\d+(?:\.\d+)?)\s*[:：]\s*([^】\]]*)\s*[】\]]/)
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
        setPendingCount(prev => prev + 1)
        return
      }
    }

    // 检查是否是位置格式：[位置:名称:地址:城市]
    const locationMatch = inputText.trim().match(/[【\[]\s*位置\s*[:：]\s*([^:：\]】]+)\s*(?:[:：]\s*([^:：\]】]*))?\s*(?:[:：]\s*([^\]】]*))?\s*[】\]]/)
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
        setPendingCount(prev => prev + 1)
        return
      }
    }

    // 检查是否是音乐格式：[音乐:歌名:歌手]
    const musicMatch = inputText.trim().match(/[【\[]\s*音乐\s*[:：]\s*([^\]】]+)\s*[】\]]/)
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
      content: inputText,
      isUser: true,
      type: 'text',
      replyTo: replyTo,
      isOffline: character.offlineMode, // 标记是否是线下模式消息
    })
    // 立即同步 ref，避免用户立刻点箭头时还拿到旧 messages
    messagesRef.current = [...messagesRef.current, newMsg]

    setInputText('')
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
      // 获取其他角色（排除自己和当前用户）
      const otherCharacters = characters.filter(c => c.id !== character.id).slice(0, 6)
      
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
  "recentPhotos": ["照片1的文字描述", "照片2的描述"]
}

${otherCharacters.length > 0 ? `可参考的已有角色：
${otherCharacters.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}` : ''}

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
        
        const byLine = text.split('\n').map(s => s.trim()).filter(Boolean)
        const keepCmd = (s: string) =>
          /\|\|\|/.test(s) ||
          /\[(转账|音乐|推文|推特主页|X主页):/.test(s) ||
          /[【\[]\s*(转账|音乐|推文|推特主页|X主页)\s*[:：]/.test(s)
        const out: string[] = []
        for (const line of byLine) {
          if (keepCmd(line)) { out.push(line); continue }
          const parts = line.match(/[^。！？!?]+[。！？!?]?/g) || [line]
          for (const p of parts) {
            const t = (p || '').trim()
            if (!t) continue
            out.push(t)
          }
        }
        return out.filter(Boolean).slice(0, 15)
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
1. 根据情境和你的性格，回复1-15条消息
2. 每条消息用换行分隔
3. 要有情感，不要机械化
4. 可以表达惊喜、感动、开心等情绪
5. 可以追问、撒娇、表达关心等
6. 【语言强规则】无论对方用什么语言输入，你都必须只用「${languageName((character as any).language || 'zh')}」回复；禁止夹杂中文（除非是专有名词/人名/歌名必须保留原文）。`

      // 如果可能发转账，添加提示
      if (options?.includeTransfer) {
        systemPrompt += `\n6. 如果你想给对方转账表达心意，在消息最后单独一行写：[转账:金额:备注]，例如：[转账:52.00:爱你]`
      }
      
      // 听歌邀请逻辑已改为“卡片→确认进入一起听界面”，这里禁止让模型主动发“音乐指令/歌名”
      
      // 线下模式关闭时，禁止动作描述；开启时，允许描写神态动作
      if (!character.offlineMode) {
        systemPrompt += `

【重要限制】
- 这是微信聊天，不是小说！禁止使用任何动作描写、神态描写、心理描写
- 禁止使用括号()、*号*、【】等符号来描述动作或神态
- 禁止出现类似"（笑）"、"*摸摸头*"、"【害羞】"这样的内容
- 只能发送纯文字对话，就像真人发微信一样
- 可以用表情符号emoji，但不能描述动作`
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
1. 所有叙述性文字（动作、神态、环境、心理暗示）必须用【中文】书写！
2. 只有角色说的话才用【${languageName(characterLanguage)}】，并且必须：
   - 用中文引号""包裹
   - 在外语后面立即加括号写【中文翻译】
3. 格式：中文叙述 + "外语对话（中文翻译）" + 中文叙述

【正确输出示例】
轻轻走到你身边，嘴角带着温柔的笑意。"Hey honey, I just stepped into a diner to grab some eggs and coffee.（亲爱的，我刚去餐厅买了些鸡蛋和咖啡。）"说着把袋子放在桌上，关切地看着你。"Did you sleep well?（你睡得好吗？）"

【错误输出示例 - 绝对禁止】
❌ 嗨（挥手）→ 错！"挥手"是动作，必须用中文完整句子描写
❌ Hey honey. I just stepped into a diner... → 错！外语必须加括号翻译
❌ 纯外语输出 → 错！叙述部分必须是中文

【引号使用规则】
- 需要加引号：角色说的话（对话）
- 不需要加引号：动作描写、神态描写、环境描写、心理暗示

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
        const lines = splitToReplies(result)
        let delay = 0
        
        for (const line of lines.slice(0, 15)) {
          const msgDelay = delay
          const trimmedLine = line.trim()
          
          // 检查是否是转账消息（必须整行只有转账格式，防止AI在聊天中随便提到格式时误触发）
          const transferMatch = trimmedLine.match(/^\[转账:(\d+(?:\.\d+)?):(.+?)\]$/)
          const transferAltMatch = trimmedLine.match(/^[【\[]\s*转账\s*[:：]\s*(\d+(?:\.\d+)?)\s*[:：]\s*([^】\]]+)\s*[】\]]$/)
          if (transferMatch || transferAltMatch) {
            const m = transferMatch || transferAltMatch!
            const amount = parseFloat(m[1])
            const note = (m[2] || '').trim()
            safeTimeoutEx(() => {
              addMessage({
                characterId: character.id,
                content: `转账 ¥${amount.toFixed(2)}`,
                isUser: false,
                type: 'transfer',
                transferAmount: amount,
                transferNote: note || '转账',
                transferStatus: /已领取|已收款|received/i.test(note) ? 'received' : /已退还|已退款|refunded/i.test(note) ? 'refunded' : 'pending',
              })
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
    // 立刻插入一条系统提示，避免“没扣钱”的错觉（并便于排查）
    const sysMsg = addMessage({
      characterId: character.id,
      content: `钱包已扣除 ¥${amount.toFixed(2)}（当前余额约 ¥${Math.max(0, walletBalance - amount).toFixed(2)}）`,
      isUser: true,
      type: 'system',
    })
    messagesRef.current = [...messagesRef.current, sysMsg]
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

  // 处理收到的转账（用户收款或退还对方发来的转账）
  const handleTransferAction = (action: 'receive' | 'refund') => {
    if (!transferActionMsg) return
    
    const amount = transferActionMsg.transferAmount || 0
    const note = transferActionMsg.transferNote || '转账'
    
    // 关键修复：
    // - 必须把原始“对方发给我的转账”标记为已处理，否则它会一直保持 pending、一直可点
    // - 用户第二天再点一次就会产生一个“新的已收款消息（timestamp=现在）”，导致时间感误判成“你刚刚才领”
    updateMessage(transferActionMsg.id, { transferStatus: action === 'receive' ? 'received' : 'refunded' })

    // 不修改原转账消息的展示外观（美化框A仍然是转账卡片），但状态要变
    // 用户生成一条新的转账消息显示收款/退款状态（美化框B）
    const receiptMsg = addMessage({
      characterId: character.id,
      content: action === 'receive' ? `已收款 ¥${amount.toFixed(2)}` : `已退还 ¥${amount.toFixed(2)}`,
      isUser: true,
      type: 'transfer',
      transferAmount: amount,
      // 避免“已领取/已退还”与卡片底部状态重复显示
      transferNote: note,
      transferStatus: action === 'receive' ? 'received' : 'refunded',
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
        : `用户退还了你给TA的${amount}元转账（备注：${note}），你可以表达不解/失落`
    )
  }

  // 发送音乐分享
  const handleShareMusic = (song: { title: string; artist: string; id?: string }) => {
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

    // 需要 API 才能“按人设/关系/上下文”做决定
    if (!llmConfig.apiBaseUrl || !llmConfig.apiKey || !llmConfig.selectedModel) {
      setInfoDialog({
        open: true,
        title: '需要先配置 API',
        message: '要让对方按性格/关系/聊天上下文来决定是否同意，需要先在「设置 → API 配置」里填好 Base URL、Key 和模型。',
      })
      return
    }

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

      const globalPresets = getGlobalPresets()
      const selectedPersonaName = selectedPersona?.name || '我'
      const systemPrompt =
        `${globalPresets ? globalPresets + '\n\n' : ''}` +
        `【任务：处理情侣空间申请】\n` +
        `你是微信里的角色：${character.name}\n` +
        `你的人设：${(character.prompt || '').trim() || '（无）'}\n` +
        `你和用户的关系（relationship）：${character.relationship || '（无）'}\n` +
        `你叫用户：${character.callMeName || '（未设置）'}\n` +
        `用户（对方）名字：${selectedPersonaName}\n` +
        `现在用户向你发起“开通情侣空间”的申请。\n` +
        `\n` +
        `【决策规则】\n` +
        `- 你可以同意或拒绝，必须符合你的性格、人设、你们的关系、以及最近聊天氛围。\n` +
        `- 如果你偏谨慎/高冷/关系疏远/刚吵架：更可能拒绝或先吊着。\n` +
        `- 如果你偏黏人/恋爱脑/关系亲密/气氛甜：更可能同意。\n` +
        `- 严禁出现任何辱女/性羞辱/骂女性词汇。\n` +
        `\n` +
        `【只输出 JSON】\n` +
        `{\n` +
        `  "decision": "accept|reject",\n` +
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

      const decisionRaw = String(parsed.decision || '').trim().toLowerCase()
      const decision: 'accept' | 'reject' = decisionRaw === 'accept' ? 'accept' : 'reject'
      const cardHint = String(parsed.cardHint || '').trim().slice(0, 80)
      const chatReply = String(parsed.chatReply || '').trim().slice(0, 180)

      // 更新申请卡片状态
      updateMessage(reqMsg.id, {
        coupleStatus: decision === 'accept' ? 'accepted' : 'rejected',
      })

      // 回传结果卡片
      addMessage({
        characterId: character.id,
        content: decision === 'accept' ? '情侣空间已开通' : '情侣空间已拒绝',
        isUser: false,
        type: 'couple',
        coupleAction: 'response',
        coupleStatus: decision === 'accept' ? 'accepted' : 'rejected',
        coupleTitle: decision === 'accept' ? '情侣空间开通成功' : '情侣空间申请结果',
        coupleHint:
          cardHint ||
          (decision === 'accept'
            ? '我同意啦～以后这里就是我们的小窝。'
            : '我暂时不想开通…别闹。'),
      })

      if (decision === 'accept') {
        // 开通并记录“在一起”起始时间
        // 记录到角色上，情侣空间页用它显示“在一起xx天”
        updateCharacter(character.id, { coupleSpaceEnabled: true, coupleStartedAt: Date.now() })
      }

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
      if (p < 70) return '正在窃取对方的日记信息…'
      if (p < 85) return '哎呀差点被发现了，继续窃取中…'
      return '写作中…'
    }
    const playful = [
      '嘘…别出声，翻页声有点大…',
      '咳…我只是路过（继续窃取中）',
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
      
      const personaText = selectedPersona
        ? `【和你聊天的那个人】\n- 名字：${selectedPersona.name}\n- 描述：${selectedPersona.description || '（无）'}\n`
        : '【和你聊天的那个人】（未知）\n'

      const system = `${globalPresets ? globalPresets + '\n\n' : ''}` +
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
      const isPending = status === 'pending'
      // 对方发给我的待处理转账可以点击
      const canClick = !msg.isUser && isPending
      
      return (
        <div 
          className={`min-w-[160px] rounded-lg overflow-hidden ${canClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
          style={{ background: isRefunded ? '#f5f5f5' : '#FA9D3B' }}
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
          <div className={`px-3 py-1.5 text-[10px] ${isRefunded ? 'bg-gray-100 text-gray-400' : 'bg-[#E08A2E] text-white/70'}`}>
            {isReceived ? '已领取' : isRefunded ? '已退还' : canClick ? '点击收款' : '微信转账'}
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
      const hasUrl = !!msg.voiceUrl
      // 语音条宽度根据时长变化（最小140px，最大280px）- 加宽了
      const barWidth = Math.min(280, Math.max(140, 100 + duration * 6))
      
      return (
        <div className="min-w-[140px] max-w-[300px]">
          {/* 语音条 - 加宽加高 */}
          <button
            type="button"
            onClick={() => {
              if (hasUrl && msg.voiceUrl) {
                playVoiceMessage(msg.id, msg.voiceUrl)
              }
            }}
            disabled={!hasUrl}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all active:scale-[0.98] ${
              msg.isUser 
                ? 'bg-green-500 text-white' 
                : 'bg-white text-gray-800 shadow-sm border border-gray-100'
            } ${!hasUrl ? 'opacity-60' : ''}`}
            style={{ width: barWidth }}
          >
            {/* 播放/加载图标 - 播放按钮改为白色圆形 */}
            {!hasUrl ? (
              <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin flex-shrink-0" />
            ) : isPlaying ? (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.isUser ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                <div className="flex items-center gap-0.5">
                  <div className={`w-1 h-3 rounded-full ${msg.isUser ? 'bg-white' : 'bg-gray-600'} animate-pulse`} />
                  <div className={`w-1 h-4 rounded-full ${msg.isUser ? 'bg-white' : 'bg-gray-600'} animate-pulse`} style={{ animationDelay: '0.1s' }} />
                  <div className={`w-1 h-3 rounded-full ${msg.isUser ? 'bg-white' : 'bg-gray-600'} animate-pulse`} style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            ) : (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.isUser ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                <svg className={`w-4 h-4 ${msg.isUser ? 'text-white' : 'text-gray-600'}`} fill="currentColor" viewBox="0 0 24 24">
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
                    msg.isUser ? 'bg-white/70' : 'bg-gray-300'
                  } ${isPlaying ? 'animate-pulse' : ''}`}
                  style={{ 
                    height: `${10 + Math.random() * 12}px`,
                    animationDelay: `${i * 0.08}s`
                  }}
                />
              ))}
            </div>
            
            {/* 时长 */}
            <span className={`text-sm font-medium flex-shrink-0 ${msg.isUser ? 'text-white/90' : 'text-gray-500'}`}>
              {duration}"
            </span>
          </button>
          
          {/* 语音转文字（展开） */}
          {msg.voiceText && (
            <div className={`mt-2 px-3 py-2 rounded-xl text-sm ${
              msg.isUser ? 'bg-green-600/20 text-green-100' : 'bg-gray-50 text-gray-600 border border-gray-100'
            }`}>
              <div className={`text-xs mb-1 ${msg.isUser ? 'text-green-200' : 'text-gray-400'}`}>转文字</div>
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
        <div className="min-w-[180px] max-w-[240px] rounded-xl overflow-hidden bg-white border border-gray-200 shadow-sm">
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

    return <span>{msg.content}</span>
  }

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
            <div className="px-3 py-1.5 rounded-lg bg-white/90 shadow-sm text-xs text-gray-500">
              {msg.content}
            </div>
          </div>
        )
      }

      // 判断是否是拉黑后对方新发的消息（只有拉黑后发的才显示感叹号）
      const isBlockedMessage =
        !msg.isUser && character.isBlocked && character.blockedAt && msg.timestamp > character.blockedAt

      // 线下模式消息的特殊渲染（不显示头像和气泡，使用叙事风格）
      if (msg.isOffline && msg.type === 'text') {
        // 获取自定义颜色设置
        const offlineUserColor = character.offlineUserColor || '#2563eb'
        const offlineCharColor = character.offlineCharColor || '#7c3aed'
        const offlineDialogColor = character.offlineDialogColor || '#111827'
        
        // 处理引号内的文字：使用自定义对话颜色
        const renderOfflineContent = (content: string) => {
          // 匹配中文引号内的内容
          const parts = content.split(/(".*?")/g)
          return parts.map((part, i) => {
            if (part.startsWith('"') && part.endsWith('"')) {
              // 引号内的对话：使用对话颜色
              return (
                <span key={i} className="font-medium" style={{ color: offlineDialogColor }}>
                  {part}
                </span>
              )
            }
            // 普通叙述文字：使用叙述颜色
            return <span key={i}>{part}</span>
          })
        }
        
        return (
          <div
            key={msg.id}
            className="mb-2 px-4 group"
            style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 60px' }}
          >
            {/* 叙事内容 - 使用自定义颜色 */}
            <div 
              className={`text-[15px] leading-relaxed whitespace-pre-wrap ${msg.isUser ? 'text-right italic' : 'text-left'}`}
              style={{ color: msg.isUser ? offlineUserColor : offlineCharColor }}
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
          // 性能优化：聊天长列表在移动端非常吃力；content-visibility 可显著减少重绘/布局开销
          style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 140px' }}
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
                
                {/* 消息操作按钮（非系统消息且非编辑模式） */}
                {(msg.type === 'text' || msg.type === 'voice' || msg.type === 'image' || msg.type === 'sticker' || msg.type === 'transfer' || msg.type === 'doudizhu_share' || msg.type === 'doudizhu_invite') && !editMode && (
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
    editMode,
    selectedMsgIds,
    forwardMode,
    forwardSelectedIds,
    selectedPersona?.avatar,
    selectedPersona?.name,
    bubbleStyles,
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
                <span className="font-semibold text-[#000]">{character.name}</span>
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
          style={{ contain: 'content', willChange: 'transform', WebkitOverflowScrolling: 'touch' }}
          onScroll={() => {
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
          
          {/* 重新生成按钮（只在最后一条消息是AI回复时显示，用户发消息后不显示） */}
          {!showTyping && messages.length > 0 && !messages[messages.length - 1].isUser && messages[messages.length - 1].type !== 'system' && (
            <div className="flex justify-center mb-3">
              <button
                type="button"
                onClick={handleRegenerate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 shadow-sm text-xs text-gray-500 hover:bg-white active:scale-95 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                重新生成
              </button>
            </div>
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
            {/* 加号按钮 - 线下模式时也可用，但功能受限 */}
            <button
              type="button"
              onClick={() => {
                setShowPlusMenu(!showPlusMenu)
                setShowStickerPanel(false)
                setActivePanel(null)
              }}
              className="w-7 h-7 rounded-full border-2 border-gray-400 flex items-center justify-center transition-transform flex-shrink-0 active:scale-90"
            >
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            
            {/* 表情包按钮 */}
            <button
              type="button"
              onClick={() => {
                setShowStickerPanel(!showStickerPanel)
                setShowPlusMenu(false)
                setActivePanel(null)
              }}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90 flex-shrink-0 ${showStickerPanel ? 'bg-pink-100' : ''}`}
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
              </svg>
            </button>
            
            <input
              type="text"
              placeholder="输入消息..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              className="flex-1 min-w-0 px-3 py-1.5 rounded-full bg-white/90 md:bg-white/80 md:backdrop-blur outline-none text-gray-800 text-sm"
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
            
            <button
              type="button"
              onClick={handleSend}
              disabled={!inputText.trim()}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex-shrink-0 ${
                inputText.trim() 
                  ? 'bg-gradient-to-r from-pink-400 to-pink-500 text-white shadow-sm' 
                  : 'bg-gray-200 text-gray-400'
              }`}
            >
              发送
            </button>
          </div>
          
          {/* 功能面板 */}
          {showPlusMenu && (
            <div className="mt-3 pb-2">
              {!activePanel ? (
                <div className="grid grid-cols-4 gap-4">
                  {/* === 第一行：实用功能 === */}
                  {/* 相册 - 线下模式禁用 */}
                  <button 
                    type="button" 
                    onClick={() => {
                      if (character.offlineMode) {
                        setInfoDialog({ open: true, title: '线下模式', message: '线下模式暂不支持此功能' })
                        return
                      }
                      imageInputRef.current?.click()
                    }} 
                    className="flex flex-col items-center gap-1"
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${character.offlineMode ? 'bg-gray-100 opacity-40' : 'bg-white/60'}`}>
                      <svg className={`w-6 h-6 ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                    </div>
                    <span className={`text-xs ${character.offlineMode ? 'text-gray-400' : 'text-gray-600'}`}>相册</span>
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
                <div className="p-2 max-h-48 overflow-y-auto">
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
                  onClick={() => handleTransferAction('refund')}
                  className="flex-1 py-2.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium"
                >
                  退还
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
                    if (editingContent.trim()) {
                      updateMessage(editingMessageId, { content: editingContent.trim() })
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
                  <div className="text-xs text-gray-400 mt-2">正在窃取对方手机数据...</div>
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
