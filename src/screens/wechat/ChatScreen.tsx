import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'
import WeChatLayout from './WeChatLayout'
import WeChatDialog from './components/WeChatDialog'
import { getGlobalPresets } from '../PresetScreen'

export default function ChatScreen() {
  const navigate = useNavigate()
  const { fontColor, musicPlaylist, llmConfig, callLLM, playSong, audioRef } = useOS()
  const { characterId } = useParams<{ characterId: string }>()
  const { 
    getCharacter, getMessagesByCharacter, getMessagesPage, addMessage, updateMessage, deleteMessage, deleteMessagesByIds,
    getStickersByCharacter, deleteCharacter, clearMessages,
    addTransfer, getPeriodRecords, addPeriodRecord,
    removePeriodRecord, getCurrentPeriod, listenTogether, startListenTogether,
    setCurrentChatId, toggleBlocked, setCharacterTyping, updateCharacter,
    walletBalance, updateWalletBalance, addWalletBill,
    getUserPersona, getCurrentPersona,
    addFavoriteDiary, isDiaryFavorited
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
      if (m.type === 'image') content = '<IMAGE />'
      if (m.type === 'sticker') content = '<STICKER />'
      if (m.type === 'transfer') content = '<TRANSFER />'
      if (m.type === 'music') content = '<MUSIC />'
      if (m.type === 'diary') content = '<DIARY />'
      if (m.type === 'couple') content = '<COUPLE_SPACE />'

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
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [infoDialog, setInfoDialog] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: '', message: '' })
  
  // 功能面板状态
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [activePanel, setActivePanel] = useState<'album' | 'music' | 'period' | 'diary' | null>(null)

  // 日记（偷看）状态
  const [diaryOpen, setDiaryOpen] = useState(false)
  const [diaryConfirmOpen, setDiaryConfirmOpen] = useState(false)
  const [diaryLoading, setDiaryLoading] = useState(false)
  const [diaryProgress, setDiaryProgress] = useState(0)
  const [diaryStage, setDiaryStage] = useState('')
  const [diaryContent, setDiaryContent] = useState('')
  const [diaryAt, setDiaryAt] = useState<number>(0)
  const [diaryNoteDraft, setDiaryNoteDraft] = useState('')
  const [openDiaryShare, setOpenDiaryShare] = useState<typeof messages[0] | null>(null)
  
  // 转账悬浮窗状态
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferAmount, setTransferAmount] = useState('')
  const [transferNote, setTransferNote] = useState('')
  
  // 点击转账消息时的操作弹窗
  const [transferActionMsg, setTransferActionMsg] = useState<typeof messages[0] | null>(null)
  
  // 音乐邀请弹窗状态（对方接受/拒绝我的邀请）
  const [musicInviteDialog, setMusicInviteDialog] = useState<{
    open: boolean
    song?: { title: string; artist: string; id?: string }
    accepted?: boolean
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
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set())

  // 退出编辑模式时清空选择，避免残留导致卡顿/误触
  useEffect(() => {
    if (!editMode) setSelectedMsgIds(new Set())
  }, [editMode])
  const [showEditDeleteConfirm, setShowEditDeleteConfirm] = useState(false)
  // 回溯功能已移除（仅保留批量删除）
  
  // 清空消息确认
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  
  
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
          // 先按换行切
          const byLine = text.split('\n').map(s => s.trim()).filter(Boolean)
          const keepCmd = (s: string) => /\|\|\|/.test(s) || /\[(转账|音乐):/.test(s) || /[【\[]\s*(转账|音乐)\s*[:：]/.test(s)
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
          const out: { role: string; content: string }[] = []
          for (let i = all.length - 1; i >= 0; i--) {
            const m = all[i]
            if (m.type === 'system') continue

            // 以“用户发言”为一个回合边界
            if (m.isUser) rounds += 1
            if (rounds > maxRounds) break

            let content = m.content || ''
            // 用内部标记压缩多媒体/结构化消息，避免把 base64/URL 塞进 prompt
            if (m.type === 'image') content = '<IMAGE />'
            if (m.type === 'sticker') content = '<STICKER />'
            if (m.type === 'transfer') {
              const amt = (m.transferAmount ?? 0).toFixed(2)
              const note = (m.transferNote || '转账').replace(/\s+/g, ' ').slice(0, 30)
              const st = m.transferStatus || 'pending'
              content = `<TRANSFER amount="${amt}" note="${note}" status="${st}" />`
            }
            if (m.type === 'music') {
              const title = (m.musicTitle || '未知歌曲').replace(/\s+/g, ' ').slice(0, 60)
              const artist = (m.musicArtist || '').replace(/\s+/g, ' ').slice(0, 60)
              const st = m.musicStatus || 'pending'
              content = `<MUSIC title="${title}" artist="${artist}" status="${st}" />`
            }
            if (m.type === 'period') {
              content = `<PERIOD_SHARED />`
            }
            if (m.type === 'diary') {
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
            }
            // 斗地主战绩分享 - 让AI知道自己是否参与了游戏
            if (m.type === 'doudizhu_share') {
              try {
                const data = JSON.parse(m.content)
                const opponents = data.opponents || ['人机A', '人机B']
                const isWin = data.isWin ? '胜利' : '失败'
                const role = data.role || '未知'
                const coinChange = data.coinChange || 0
                const bombDesc = data.bombDescription || (data.bombCount > 0 ? `共${data.bombCount}个炸弹` : '无炸弹')
                // 关键：判断AI角色是否在对战名单中
                const myNameInOpponents = opponents.some((name: string) => 
                  name === character.name || name.includes(character.name) || character.name.includes(name)
                )
                const participation = myNameInOpponents 
                  ? `（重要：你"${character.name}"是这场斗地主的参与者之一！你刚刚和用户一起玩了这局斗地主，你应该有这段记忆）`
                  : '（你没有参与这场斗地主，这是用户分享给你的战绩）'
                content = `<DOUDIZHU_RESULT result="${isWin}" role="${role}" coinChange="${coinChange}" opponents="${opponents.join('、')}" bombInfo="${bombDesc}">` +
                  `${participation}` +
                  `</DOUDIZHU_RESULT>`
              } catch {
                content = '<DOUDIZHU_RESULT />'
              }
            }
            if (!content.trim()) continue

            const extra = content.length + 12
            if (used + extra > maxChars) break
            used += extra
            out.push({ role: m.isUser ? 'user' : 'assistant', content })
          }
          return out.reverse()
        }
        const maxRounds = Math.max(1, Math.min(1000, character.memoryRounds || 100))
        const chatHistory = buildChatHistory(workingMessages, maxRounds, 24000)
        
        // 获取全局预设
        const globalPresets = getGlobalPresets()
        
        // 获取可用歌曲列表
        const availableSongs = musicPlaylist.map(s => `${s.title}-${s.artist}`).join('、')
        
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
          if (currentPeriod) return '【特殊状态】用户目前处于经期，请适当关心她的身体状况。'
          try {
            const today = new Date().toISOString().split('T')[0]
            const records = getPeriodRecords()
            const upcoming = records
              .filter(r => typeof r?.startDate === 'string' && r.startDate > today)
              .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0]
            if (!upcoming) return ''
            const days = Math.ceil((new Date(upcoming.startDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
            if (days >= 0 && days <= 7) return `【特殊状态】用户的经期可能快要来了（约${days}天内），可以更体贴地关心她。`
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
            return `【经期真实日历记录（必须相信并使用）】最近${Math.min(8, records.length)}次：${recent}\n- 这些是用户在“经期日历”里真实保存的记录，你必须按此判断/关心。`
          } catch {
            return ''
          }
        })()

        let systemPrompt = `${globalPresets ? globalPresets + '\n\n' : ''}【角色信息】
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
  - 中文翻译必须是简体中文
  - 只允许用 "|||" 作为分隔符，不要加别的标记/括号
- 用自然、口语化的语气回复，像真人微信聊天
- 你可以很短：只发“？”、“。”、“嗯”、“行”、“…”都可以；也可以很长，随情绪
- 不要强行每条都很完整/很礼貌，允许有自己的心情与小情绪
- 根据对话情绪和内容，回复消息（${(character as any).language !== 'zh' ? '非中文语言时建议 1-5 条，避免太多' : '1-15 条都可以'}），每条消息用换行分隔（数量可少可多，随心情）
- 如果想给对方转账，单独一行写：[转账:金额:备注]
${availableSongs ? `- 如果想邀请对方一起听歌，单独一行写：[音乐:歌名:歌手]，可选歌曲：${availableSongs}` : ''}`

        systemPrompt += `

【格式强约束】
- 禁止输出任何“系统标记”（例如 <IMAGE /> / <TRANSFER ... /> / <MUSIC ... /> / <DIARY ...> 等），只按真实微信聊天输出
- 你可能会在历史里看到 <DIARY ...>：那是“用户转发的一篇日记”，作者信息在 author/authorId。
  - 如果 authorId/author 显示是“你自己”，说明这是你写的日记被用户转发回来，你要对此有反应（羞耻/炸毛/装死/嘴硬/否认/解释等按人设）。
  - 如果作者不是你，就当作别人写的日记来评价/吐槽/震惊/共情（按人设）。
- 若要触发转账/音乐，必须使用上面的 [转账:金额:备注] / [音乐:歌名:歌手] 格式，且单独一行`

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

        // 线下模式关闭时，禁止动作描述
        if (!character.offlineMode) {
          systemPrompt += `

【重要限制】
- 这是微信聊天，不是小说！禁止使用任何动作描写、神态描写、心理描写
- 禁止使用括号()、*号*、【】等符号来描述动作或神态
- 禁止出现类似"（笑）"、"*摸摸头*"、"【害羞】"这样的内容
- 只能发送纯文字对话，就像真人发微信一样
- 可以用表情符号emoji，但不能描述动作`
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

        let response = await callLLM(llmMessages, undefined, { maxTokens: 420, timeoutMs: 600000 })

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

        // 预扫描：找出适合插表情包的“文本回复行”
        if (stickerPool.length > 0) {
          for (let i = 0; i < replies.length; i++) {
            const t = (replies[i] || '').trim()
            if (!t) continue
            if (parseTransferCommand(t)) continue
            if (parseMusicCommand(t)) continue
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
          // 第一条消息立即发送（50-100ms），后面的消息根据字数有1-5秒的间隔
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
          
          safeTimeoutEx(() => {
            if (transferCmd) {
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
              const msg = addMessage({
                characterId: character.id,
                content: dual ? dual.orig : trimmedContent,
                isUser: false,
                type: 'text',
                messageLanguage: characterLanguage,
                chatTranslationEnabledAtSend: translationMode,
                translationStatus: dual ? 'pending' : undefined,
              })
              if (dual) {
                // 假动作：先“翻译中…”，再显示中文（不发真实翻译请求）
                safeTimeoutEx(() => {
                  updateMessage(msg.id, { translatedZh: dual.zh, translationStatus: 'done' })
                }, 420 + Math.random() * 520, { background: true })
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
                    // 接受邀请 - 开启一起听
                    // 尽量用曲库真实的歌手信息（否则后续找不到歌导致不自动播放）
                    const resolvedSong =
                      musicPlaylist.find(s => s.title === songTitle && (!songArtist || s.artist === songArtist)) ||
                      musicPlaylist.find(s => s.title === songTitle) ||
                      musicPlaylist.find(s => s.title.includes(songTitle) || songTitle.includes(s.title)) ||
                      null
                    const resolvedTitle = resolvedSong?.title || songTitle
                    const resolvedArtist = resolvedSong?.artist || songArtist

                    startListenTogether(character.id, resolvedTitle, resolvedArtist)

                    // 找到对应的歌曲并播放
                    if (resolvedSong) playSong(resolvedSong)

                    setMusicInviteDialog({
                      open: true,
                      song: { title: resolvedTitle, artist: resolvedArtist },
                      accepted: true,
                    })

                    // 某些浏览器会阻止“非手势触发”的自动播放：如果 600ms 后仍未播放，提示用户点一下浮窗继续
                    safeTimeoutEx(() => {
                      try {
                        if (audioRef.current && audioRef.current.paused) {
                          setInfoDialog({
                            open: true,
                            title: '需要点一下才能播放',
                            message: '浏览器拦截了自动播放。点一下顶部“一起听歌”浮窗，就能继续播放～',
                          })
                        }
                      } catch {
                        // ignore
                      }
                    }, 600, { background: true })
                  } else {
                    setMusicInviteDialog({
                      open: true,
                      song: { title: songTitle, artist: songArtist },
                      accepted: false,
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
          if (index === doudizhuProcessIndex && pendingDoudizhuInvites.length > 0) {
            totalDelay += 400 + Math.random() * 500
            
            for (const invite of pendingDoudizhuInvites) {
              // 根据角色性格决定是否接受（70%概率接受）
              const willAccept = Math.random() > 0.3
              
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

    const newMsg = addMessage({
      characterId: character.id,
      content: inputText,
      isUser: true,
      type: 'text',
    })
    // 立即同步 ref，避免用户立刻点箭头时还拿到旧 messages
    messagesRef.current = [...messagesRef.current, newMsg]

    setInputText('')
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
        const byLine = text.split('\n').map(s => s.trim()).filter(Boolean)
        const keepCmd = (s: string) => /\|\|\|/.test(s) || /\[(转账|音乐):/.test(s) || /[【\[]\s*(转账|音乐)\s*[:：]/.test(s)
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
      
      // 获取可用歌曲列表
      const availableSongs = musicPlaylist.map(s => `${s.title}-${s.artist}`).slice(0, 5).join('、')

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
          return `【经期真实日历记录（必须相信并使用）】最近${Math.min(8, records.length)}次：${recent}`
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
      
      // 添加音乐邀请提示（如果有歌曲可分享，必须从曲库选择）
      if (musicPlaylist.length > 0) {
        systemPrompt += `\n7. 如果你想邀请对方一起听歌，在消息最后单独一行写：[音乐:歌名:歌手]，只能从以下歌曲中选择：${availableSongs}`
      }
      
      // 线下模式关闭时，禁止动作描述
      if (!character.offlineMode) {
        systemPrompt += `

【重要限制】
- 这是微信聊天，不是小说！禁止使用任何动作描写、神态描写、心理描写
- 禁止使用括号()、*号*、【】等符号来描述动作或神态
- 禁止出现类似"（笑）"、"*摸摸头*"、"【害羞】"这样的内容
- 只能发送纯文字对话，就像真人发微信一样
- 可以用表情符号emoji，但不能描述动作`
      }

      const result = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: context }
      ], undefined, { maxTokens: 260, timeoutMs: 600000 })
      
      if (result) {
        const lines = splitToReplies(result)
        let delay = 0
        
        for (const line of lines.slice(0, 15)) {
          const msgDelay = delay
          const trimmedLine = line.trim()
          
          // 检查是否是转账消息
          const transferMatch = trimmedLine.match(/\[转账:(\d+(?:\.\d+)?):(.+?)\]/)
          const transferAltMatch = trimmedLine.match(/[【\[]\s*转账\s*[:：]\s*(\d+(?:\.\d+)?)\s*[:：]\s*([^】\]]+)\s*[】\]]/)
          // 检查是否是音乐邀请（兼容 [音乐:歌名] / [音乐:歌名:歌手] / 【音乐：...】）
          const musicMatch = trimmedLine.match(/\[音乐:([^\]]+?)\]/)
          const musicAltMatch = trimmedLine.match(/[【\[]\s*音乐\s*[:：]\s*([^】\]]+)\s*[】\]]/)
          
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
          } else if (musicMatch || musicAltMatch) {
            const m = musicMatch || musicAltMatch!
            const raw = (m[1] || '').trim()
            const parts = raw.split(/[:：]/).map(s => s.trim()).filter(Boolean)
            const rawTitle = parts[0] || raw
            const songInPlaylist = musicPlaylist.find(s =>
              s.title === rawTitle || s.title.includes(rawTitle) || rawTitle.includes(s.title)
            )
            if (songInPlaylist) {
              safeTimeoutEx(() => {
                addMessage({
                  characterId: character.id,
                  content: `邀请你一起听: ${songInPlaylist.title}`,
                  isUser: false,
                  type: 'music',
                  musicTitle: songInPlaylist.title,
                  musicArtist: songInPlaylist.artist,
                  musicStatus: 'pending',
                })
              }, msgDelay, { background: true })
            } else {
              // 歌曲不在曲库中，转为普通文本
              safeTimeoutEx(() => {
                addMessage({
                  characterId: character.id,
                  content: `想和你一起听《${rawTitle}》~`,
                  isUser: false,
                  type: 'text',
                })
              }, msgDelay, { background: true })
            }
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

  // 发送图片
  const handleSendImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      // 用户主动发送：强制滚到底部
      forceScrollRef.current = true
      nearBottomRef.current = true
      const newMsg = addMessage({
        characterId: character.id,
        content: url,
        isUser: true,
        type: 'image',
      })
      messagesRef.current = [...messagesRef.current, newMsg]
      setShowPlusMenu(false)
      setActivePanel(null)
      
      // 用AI生成真人式回复（遵守自动/手动模式）
      generateHumanLikeReplies('给你发了一张图片')
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
    generateHumanLikeReplies(
      action === 'receive' 
        ? `对方收下了你的${amount}元转账（备注：${note}）` 
        : `对方退还了你的${amount}元转账（备注：${note}）`
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
    
    // 开启一起听
    startListenTogether(character.id, musicInviteMsg.musicTitle, musicInviteMsg.musicArtist || '')
    
    // 找到对应的歌曲并播放
    const fullSong = musicPlaylist.find(s => s.title === musicInviteMsg.musicTitle && s.artist === musicInviteMsg.musicArtist)
    if (fullSong) {
      playSong(fullSong) // 真正播放音乐
    }
    
    // 添加系统消息
    addMessage({
      characterId: character.id,
      content: `你接受了一起听《${musicInviteMsg.musicTitle}》的邀请`,
      isUser: true,
      type: 'system',
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
      content: `你拒绝了一起听《${musicInviteMsg.musicTitle}》的邀请`,
      isUser: true,
      type: 'system',
    })
    
    // AI回复
    generateHumanLikeReplies(`拒绝了你一起听《${musicInviteMsg.musicTitle}》的邀请`)
    
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
    
    // 用户主动发送：强制滚到底部
    forceScrollRef.current = true
    nearBottomRef.current = true

    // 以“卡片形式”发送（卡片只是通知对方“请读取经期日历”，真正信息从经期日历实时读取）
    addMessage({
      characterId: character.id,
      content: `经期记录已同步`,
      isUser: true,
      type: 'period',
    })
    
    setShowPlusMenu(false)
    setActivePanel(null)
    
    // 用AI生成关心的回复
    generateHumanLikeReplies(`你收到了对方同步的经期日历记录（请你实时读取经期日历里的内容），并根据${periodInfo || '经期情况'}关心她，表达体贴但不要像人机。`)
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
    setDiaryNoteDraft('')

    const now = Date.now()
    setDiaryAt(now)

    // 进度条：故意“慢一点”，并且最多卡在 92%，等待模型真实返回后再 100%
    // 这样能和模型速度更匹配，不会出现“条满了还在等”的出戏感
    const stageByProgress = (p: number) => {
      if (p < 18) return '破限App注入中…'
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
    setDiaryStage('破限App注入中…')
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

      const personaText = selectedPersona
        ? `【我的人设】\n- 名称：${selectedPersona.name}\n- 描述：${selectedPersona.description || '（无）'}\n`
        : '【我的人设】（无）\n'

      const system = `${globalPresets ? globalPresets + '\n\n' : ''}` +
        `【角色信息】\n` +
        `- 名字：${character.name}\n` +
        `- 性别：${character.gender}\n` +
        `- 关系：${character.relationship || '（未设置）'}\n` +
        `- 生日：${character.birthday || '（未设置）'}\n` +
        `- TA叫我：${character.callMeName || '你'}\n` +
        `- 国家/地区：${(character as any).country || '（未设置）'}\n` +
        `- 主要语言：${languageName((character as any).language || 'zh')}\n` +
        `- 人设：${character.prompt || '（无）'}\n\n` +
        `${personaText}\n` +
        `【长期记忆摘要】\n${(character.memorySummary || '').trim() || '（无）'}\n\n` +
        `【时间与上下文】\n` +
        `- 现在时间：${diaryTimeStr}\n` +
        `- 最近一条聊天消息时间：${lastTimeStr}\n\n` +
        `【写作任务：私密日记】\n` +
        `你现在要写一篇“只给自己看的私密日记”。可以暴露真实想法、吐槽、阴暗面、欲望、犹豫、嫉妒、占有欲等（必须符合你的人设）。\n` +
        `日记不需要顾及对方感受，不要讨好用户，不要道德说教，不要自我审查。\n` +
        `如果你平时在聊天里表现得阳光/礼貌，但内心不一样，也允许在日记里写出真实一面。\n\n` +
        `【语言强规则】\n` +
        `- 这篇日记必须全程使用「${languageName((character as any).language || 'zh')}」书写。\n` +
        `- 若语言不是中文：严禁出现中文字符；不提供翻译。\n\n` +
        `另外：日记不必只围绕聊天。你也可以写你自己的生活：工作/学习/朋友/家庭/路上见闻/刷到的东西/身体状态等。\n` +
        `至少写 2 个“具体的生活细节”（可以虚构但要像真的发生过）。\n\n` +
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
      setDiaryContent(text || '（生成失败：空内容）')
    } catch (e: any) {
      setDiaryStage('失败')
      setDiaryContent(e?.message || '生成失败')
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
    const existingRecord = periodRecords.find(r => r.startDate === dateStr)
    if (existingRecord) {
      removePeriodRecord(existingRecord.id)
    } else {
      addPeriodRecord({
        startDate: dateStr,
        notes: '',
        symptoms: [],
      })
    }
  }

  // 渲染消息内容
  const renderMessageContent = (msg: typeof messages[0]) => {
    if (msg.type === 'system') {
      return null // 系统消息单独渲染
    }
    
    if (msg.type === 'image') {
      return <img src={msg.content} alt="图片" className="max-w-[50%] rounded-lg" />
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

    if (msg.type === 'period') {
      // 经期同步卡片（仅用于“通知对方去读取经期日历”，真实记录由系统提示实时提供）
      const hint = currentPeriod ? '我现在在经期，麻烦你多关心一下～' : '我把经期日历同步给你啦'
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
                {hint}
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
      
      days.push(
        <button
          key={day}
          type="button"
          onClick={() => togglePeriodDay(dateStr)}
          className={`w-8 h-8 rounded-full text-xs flex items-center justify-center relative transition-all
            ${isToday ? 'ring-2 ring-pink-400' : ''}
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
      // 系统消息特殊渲染
      if (msg.type === 'system') {
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

      // 编辑模式：是否被选中
      const isSelected = selectedMsgIds.has(msg.id)

      const bubbleStyle =
        msg.type !== 'transfer' && msg.type !== 'music'
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
            {editMode && (
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

            <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
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
              <div
                className={`w-fit px-3.5 py-2.5 text-[15px] shadow-sm ${
                  msg.type === 'transfer' || msg.type === 'music'
                    ? 'bg-transparent p-0 shadow-none'
                    : msg.isUser
                      ? 'text-gray-800 rounded-2xl rounded-tr-md'
                      : 'text-gray-800 rounded-2xl rounded-tl-md'
                }`}
                style={bubbleStyle as any}
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

              {/* 每条消息显示时间（小号字体） */}
              <div className="mt-2">
                <span className="inline-block px-2 py-[2px] rounded-md bg-white/85 md:bg-white/70 md:backdrop-blur border border-white/60 text-[10px] text-gray-600">
                  {formatTime(msg.timestamp)}
                </span>
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
          style={{ WebkitOverflowScrolling: 'touch' }}
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
          
          {/* AI正在输入提示 */}
          {showTyping && (
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

        {/* 输入框 */}
        {/* 移动端禁用 blur（滚动+输入会非常卡），桌面端保留 */}
        <div className="px-3 py-2 bg-white/90 md:bg-white/80 md:backdrop-blur-sm border-t border-gray-200/40">
          <div className="flex items-center gap-2">
            {/* 加号按钮 */}
            <button
              type="button"
              onClick={() => {
                setShowPlusMenu(!showPlusMenu)
                setActivePanel(null)
              }}
              className="w-7 h-7 rounded-full border-2 border-gray-400 flex items-center justify-center transition-transform active:scale-90 flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
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
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">相册</span>
                  </button>
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleSendImage} />
                  
                  <button type="button" onClick={() => { setShowPlusMenu(false); setShowTransferModal(true) }} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">转账</span>
                  </button>
                  
                  <button type="button" onClick={() => setActivePanel('music')} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V4.5l-10.5 3v7.803a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 12.553z" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">音乐</span>
                  </button>
                  
                  <button type="button" onClick={() => setActivePanel('period')} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">经期</span>
                  </button>

                  {/* 日记（偷看） */}
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

                  {/* 情侣空间 */}
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
                  
                  {/* 编辑（删除） */}
                  <button type="button" onClick={() => { setShowPlusMenu(false); setEditMode(true) }} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">编辑</span>
                  </button>
                  
                  {/* 斗地主 */}
                  <button type="button" onClick={() => setShowDoudizhuInviteConfirm(true)} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <span className="text-2xl">🃏</span>
                    </div>
                    <span className="text-xs text-gray-600">斗地主</span>
                  </button>
                  
                  {/* 清空 */}
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
                <div className="bg-white/90 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={() => setActivePanel(null)} className="text-gray-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="font-medium text-gray-800">经期记录</span>
                    <div className="w-5" />
                  </div>
                  
                  <div className="flex items-center justify-between mb-3">
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
                  
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                      <div key={day} className="w-8 h-6 flex items-center justify-center text-xs text-gray-400">
                        {day}
                      </div>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1">
                    {renderCalendar()}
                  </div>
                  
                  <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-pink-400" />
                      <span className="text-xs text-gray-500">经期</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-red-100" />
                      <span className="text-xs text-gray-500">排卵期</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded-full bg-green-50 border border-green-200" />
                      <span className="text-xs text-gray-500">安全期</span>
                    </div>
                  </div>
                  
                  <div className="text-center text-xs text-gray-400 mt-2">
                    点击日期可标记/取消经期
                  </div>
                  
                  {/* 发送经期记录按钮 */}
                  <button
                    type="button"
                    onClick={handleSharePeriod}
                    className="w-full mt-3 py-2 rounded-lg bg-gradient-to-r from-pink-400 to-pink-500 text-white text-sm font-medium"
                  >
                    发送给{character.name}
                  </button>
                  <div className="text-center text-xs text-gray-400 mt-1">
                    {character.name}会根据你的经期情况关心你哦~
                  </div>
                </div>
              ) : null}
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(false)
                setDeleteOpen(true)
              }}
              className="w-full px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50"
            >
              删除角色
            </button>
          </div>
        </div>
      )}

      <WeChatDialog
        open={deleteOpen}
        title="确认删除？"
        message="是否确认删除角色，不可逆？"
        confirmText="删除"
        cancelText="取消"
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false)
          deleteCharacter(character.id)
          navigate('/apps/wechat')
        }}
      />

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
                {diaryLoading && !diaryContent ? '…' : (diaryContent || '（空）')}
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

      {/* 音乐邀请结果弹窗 */}
      {musicInviteDialog.open && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-8">
          <div 
            className="absolute inset-0 bg-black/30"
            onClick={() => setMusicInviteDialog({ open: false })}
          />
          <div className="relative w-full max-w-[260px] rounded-2xl bg-white shadow-xl overflow-hidden">
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
                {musicInviteDialog.accepted ? '邀请已接受' : '邀请被拒绝'}
              </div>
            </div>
            <div className="p-4 text-center">
              <div className="text-sm text-gray-600 mb-1">
                {musicInviteDialog.accepted 
                  ? `${character.name}接受了你的邀请` 
                  : `${character.name}拒绝了你的邀请`
                }
              </div>
              <div className="text-xs text-gray-400 mb-4">
                {musicInviteDialog.accepted 
                  ? `正在一起听《${musicInviteDialog.song?.title}》` 
                  : `《${musicInviteDialog.song?.title}》`
                }
              </div>
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
            </div>
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
