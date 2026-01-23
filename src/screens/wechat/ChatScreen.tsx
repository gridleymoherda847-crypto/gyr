import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'
import WeChatLayout from './WeChatLayout'
import WeChatDialog from './components/WeChatDialog'
import { getGlobalPresets } from '../PresetScreen'

export default function ChatScreen() {
  const navigate = useNavigate()
  const { fontColor, musicPlaylist, llmConfig, callLLM, pauseMusic, playSong } = useOS()
  const { characterId } = useParams<{ characterId: string }>()
  const { 
    getCharacter, getMessagesByCharacter, addMessage, updateMessage, deleteMessage, deleteMessagesAfter,
    getStickersByCharacter, deleteCharacter, clearMessages,
    addTransfer, getPeriodRecords, addPeriodRecord,
    removePeriodRecord, getCurrentPeriod, listenTogether, startListenTogether, stopListenTogether,
    setCurrentChatId, toggleBlocked, setCharacterTyping,
    walletBalance, updateWalletBalance, addWalletBill,
    getStickersByCategory,
    getUserPersona, getCurrentPersona
  } = useWeChat()
  
  const character = getCharacter(characterId || '')
  const messages = getMessagesByCharacter(characterId || '')
  const stickers = getStickersByCharacter(characterId || '')
  const currentPeriod = getCurrentPeriod()

  // 该对话选择的“我的人设”（没有选则回退到当前全局人设）
  const selectedPersona = character?.selectedUserPersonaId
    ? getUserPersona(character.selectedUserPersonaId)
    : getCurrentPersona()

  // 从AI输出里识别情绪，并从对应分类里随机挑一个表情包
  const pickStickerByMood = (text: string) => {
    const t = (text || '').toLowerCase()
    const mood =
      /哭|难过|委屈|心碎|崩溃|想哭|呜呜|伤心/.test(t) ? '哭' :
      /开心|快乐|高兴|哈哈|笑死|甜|心动/.test(t) ? '开心' :
      /生气|烦|火大|气死|讨厌|怒/.test(t) ? '生气' :
      /害羞|脸红|不好意思|羞/.test(t) ? '害羞' :
      /撒娇|求你|拜托|想要|贴贴/.test(t) ? '撒娇' :
      null

    if (!mood) return null
    const cid = characterId || ''
    if (!cid) return null
    const list = getStickersByCategory(mood).filter(s => s.characterId === cid || s.characterId === 'all')
    if (list.length === 0) return null
    return list[Math.floor(Math.random() * list.length)]
  }
  
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const forceScrollRef = useRef(false)
  const navLockRef = useRef(0)
  const [showMenu, setShowMenu] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [infoDialog, setInfoDialog] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: '', message: '' })
  
  // 功能面板状态
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [activePanel, setActivePanel] = useState<'album' | 'music' | 'period' | null>(null)
  
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
  
  // 经期日历状态
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  
  // 手动模式下待发送的消息数量（保留用于显示/以后扩展）
  const [, setPendingCount] = useState(0)
  
  // AI正在输入
  const [aiTyping, setAiTyping] = useState(false)
  const showTyping = aiTyping || !!character?.isTyping
  
  // 回溯模式
  const [rewindMode, setRewindMode] = useState(false)
  const [rewindSelectedId, setRewindSelectedId] = useState<string | null>(null)
  const [showRewindConfirm, setShowRewindConfirm] = useState(false)
  
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
    if (aliveRef.current) setAiTyping(value)
  }

  const safeSetPending = (value: number) => {
    if (aliveRef.current) setPendingCount(value)
  }

  // 检查是否配置了API
  const hasApiConfig = llmConfig.apiBaseUrl && llmConfig.apiKey && llmConfig.selectedModel

  // 根据性格/情绪/经期生成1-15条回复，每条间隔1-8秒（按字数）
  const generateAIReplies = useCallback(async (messagesOverride?: typeof messages) => {
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
          const keepCmd = (s: string) => /\[(转账|音乐):/.test(s) || /[【\[]\s*(转账|音乐)\s*[:：]/.test(s)
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
        // 关键：如果用户隔了很久才回，lastMsg 是“用户新发的这条”，gap 应该看它和 prevMsg 的间隔
        const gapMs = lastMsg
          ? (lastMsg.isUser && prevMsg ? Math.max(0, lastMsg.timestamp - prevMsg.timestamp) : Math.max(0, nowTs - lastMsg.timestamp))
          : 0
        const lastUserMsg = [...nonSystem].reverse().find(m => m.isUser) || null
        const formatGap = (ms: number) => {
          const mins = Math.floor(ms / 60000)
          if (mins < 1) return '不到1分钟'
          if (mins < 60) return `${mins}分钟`
          const hours = Math.floor(mins / 60)
          if (hours < 24) return `${hours}小时`
          const days = Math.floor(hours / 24)
          return `${days}天`
        }

        // 构建系统提示（严格顺序：预设 → 角色设定 → 我的人设 → 长期记忆摘要 → 时间感 → 输出）
        let systemPrompt = `${globalPresets ? globalPresets + '\n\n' : ''}【角色信息】
你的名字：${character.name}
你的性别：${character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : '其他'}
你的人设：${character.prompt || '（未设置）'}
你和用户的关系：${character.relationship || '朋友'}
你称呼用户为：${character.callMeName || '你'}
${currentPeriod ? '\n【特殊状态】用户目前处于经期，请适当关心她的身体状况。' : ''}

【用户人设（本对话选择）】
用户的人设名：${selectedPersona?.name || '（未选择）'}
用户的人设描述：${selectedPersona?.description || '（未填写）'}

【长期记忆摘要（每次回复必读，用户可手动编辑）】
${character.memorySummary ? character.memorySummary : '（暂无）'}

【当前时间】
${character.timeSyncEnabled ? new Date().toLocaleString('zh-CN') : (character.manualTime ? new Date(character.manualTime).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN'))}

【时间感（必须严格遵守，否则算失败）】
- 这次消息与上一条消息间隔：${formatGap(gapMs)}
- 用户上一条发言时间：${lastUserMsg ? new Date(lastUserMsg.timestamp).toLocaleString('zh-CN') : '（无）'}
- 强规则：如果间隔 >= 2小时，第一条回复必须先提到“你很久没回/刚刚在忙吗”等
- 强规则：如果间隔 >= 1天，第一条回复必须带一点点情绪（担心/委屈/吐槽/想你），并追问原因
- 强规则：如果间隔 >= 2天，第一条回复必须明确说出“都两天了”或“好几天了”，并要求对方解释（语气可按人设）

【回复要求】
- 用自然、亲切的语气回复，像真人聊天
- 根据对话情绪和内容，回复1-15条消息，每条消息用换行分隔
- 如果想给对方转账，单独一行写：[转账:金额:备注]
${availableSongs ? `- 如果想邀请对方一起听歌，单独一行写：[音乐:歌名:歌手]，可选歌曲：${availableSongs}` : ''}`

        systemPrompt += `

【格式强约束】
- 禁止输出任何“系统标记”（例如 <IMAGE /> / <TRANSFER ... /> / <MUSIC ... /> 等），只按真实微信聊天输出
- 若要触发转账/音乐，必须使用上面的 [转账:金额:备注] / [音乐:歌名:歌手] 格式，且单独一行`

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

        const llmMessages = [
          { role: 'system', content: systemPrompt },
          ...chatHistory
        ]

        // 允许“连续点箭头继续生成”：如果最后一条不是用户发言，补一个“继续聊”的用户指令
        const lastRole = llmMessages.length > 0 ? llmMessages[llmMessages.length - 1].role : ''
        if (lastRole !== 'user') {
          llmMessages.push({ role: 'user', content: '继续接着刚才的话题聊几句，像真人一样自然延展。' })
        }
        
        const response = await callLLM(llmMessages, undefined, { maxTokens: 420, timeoutMs: 600000 })
        
        // 分割回复为多条消息（最多15条；即便模型只回一大段也能拆成多条）
        const replies = splitToReplies(response)
        
        // 检查是否有待处理的用户转账
        const pendingUserTransfers = workingMessages.filter(m => 
          m.isUser && m.type === 'transfer' && m.transferStatus === 'pending'
        )
        
        // 随机决定在哪条回复后处理转账（如果有的话）
        const transferProcessIndex = pendingUserTransfers.length > 0 
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

        replies.forEach((content, index) => {
          const base = index === 0 ? 350 : 650
          const charDelay = Math.min(5000, Math.max(300, base + content.length * 45 + Math.random() * 400))
          totalDelay += charDelay
          
          const trimmedContent = content.trim()
          
          const transferCmd = parseTransferCommand(trimmedContent) || (() => {
            const m = trimmedContent.match(/\[转账:(\d+(?:\.\d+)?):(.+?)\]/)
            if (!m) return null
            return { amount: parseFloat(m[1]), note: (m[2] || '').trim(), status: 'pending' as const }
          })()
          const musicCmd = parseMusicCommand(trimmedContent)
          
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
              // 普通文本消息
              addMessage({
                characterId: character.id,
                content: trimmedContent,
                isUser: false,
                type: 'text',
              })

              // 有概率夹杂情绪表情包（需要用户配置分类表情包）
              const sticker = pickStickerByMood(trimmedContent)
              if (sticker && Math.random() < 0.35) {
                safeTimeoutEx(() => {
                  addMessage({
                    characterId: character.id,
                    content: sticker.imageUrl,
                    isUser: false,
                    type: 'sticker',
                  })
                }, 220, { background: true })
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
                  transferNote: willAccept ? '已领取' : '已退还',
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

    addMessage({
      characterId: character.id,
      content: inputText,
      isUser: true,
      type: 'text',
    })

    setInputText('')
    // 统一手动：累计待回复数量（点击箭头触发）
    setPendingCount(prev => prev + 1)
  }

  // 手动触发回复（随时可按，不需要先发消息）
  const triggerReply = async () => {
    // 触发回复时也自动滚到底部，确保看得到“正在输入…”
    forceScrollRef.current = true
    nearBottomRef.current = true
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
    safeTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'instant' }), 50)
    // 不在这里“秒收款/秒退还”。转账处理必须跟随一次API回复流程，由 generateAIReplies 统一处理。
    // 重置待回复计数
    setPendingCount(0)
    
    // 生成AI回复
    generateAIReplies()
  }

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp)
    const now = new Date()
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
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
        const keepCmd = (s: string) => /\[(转账|音乐):/.test(s) || /[【\[]\s*(转账|音乐)\s*[:：]/.test(s)
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
      
      // 构建系统提示（包含全局预设）
      let systemPrompt = `${globalPresets ? globalPresets + '\n\n' : ''}【角色信息】
你的名字：${character.name}
你的性别：${character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : '其他'}
你的人设：${character.prompt || '（未设置）'}
你称呼对方为：${character.callMeName || '你'}
你们的关系：${character.relationship || '朋友'}

【当前情境】
对方${context}

【回复要求】
1. 根据情境和你的性格，回复1-15条消息
2. 每条消息用换行分隔
3. 要有情感，不要机械化
4. 可以表达惊喜、感动、开心等情绪
5. 可以追问、撒娇、表达关心等`

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
      addMessage({
        characterId: character.id,
        content: url,
        isUser: true,
        type: 'image',
      })
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
    
    addMessage({
      characterId: character.id,
      content: `转账 ¥${amount.toFixed(2)}`,
      isUser: true,
      type: 'transfer',
      transferAmount: amount,
      transferNote: transferNote || '转账',
      transferStatus: 'pending',
    })

    updateWalletBalance(-amount)
    // 立刻插入一条系统提示，避免“没扣钱”的错觉（并便于排查）
    addMessage({
      characterId: character.id,
      content: `钱包已扣除 ¥${amount.toFixed(2)}（当前余额约 ¥${Math.max(0, walletBalance - amount).toFixed(2)}）`,
      isUser: true,
      type: 'system',
    })
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
    
    // 不修改原转账消息（美化框A保持原样）
    // 用户生成一条新的转账消息显示收款/退款状态（美化框B）
    addMessage({
      characterId: character.id,
      content: action === 'receive' ? `已收款 ¥${amount.toFixed(2)}` : `已退还 ¥${amount.toFixed(2)}`,
      isUser: true,
      type: 'transfer',
      transferAmount: amount,
      transferNote: action === 'receive' ? '已领取' : '已退还',
      transferStatus: action === 'receive' ? 'received' : 'refunded',
    })

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
    addMessage({
      characterId: character.id,
      content: `分享音乐: ${song.title}`,
      isUser: true,
      type: 'music',
      musicTitle: song.title,
      musicArtist: song.artist,
      musicStatus: 'pending',
    })
    
    setShowPlusMenu(false)
    setActivePanel(null)
    
    // 统一手动：增加待回复计数（点击箭头触发对方回复/是否接受邀请）
    setPendingCount(prev => prev + 1)
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

  // 关闭一起听
  const handleStopListening = () => {
    const songTitle = listenTogether?.songTitle || '歌'
    stopListenTogether()
    // 真正停止音乐播放
    pauseMusic()
    // 添加系统消息到消息列表
    addMessage({
      characterId: character.id,
      content: '你关闭了一起听',
      isUser: true,
      type: 'system',
    })
    // 用AI生成真人式回复（遵守自动/手动模式）
    generateHumanLikeReplies(`关闭了和你一起听《${songTitle}》的功能`)
  }

  // 回溯功能：选择一条消息后删除它之后的所有消息
  const handleRewind = () => {
    if (!rewindSelectedId) return
    deleteMessagesAfter(character.id, rewindSelectedId)
    setRewindMode(false)
    setRewindSelectedId(null)
    setShowRewindConfirm(false)
  }

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
    
    addMessage({
      characterId: character.id,
      content: `[经期记录] ${periodInfo}`,
      isUser: true,
      type: 'system',
    })
    
    setShowPlusMenu(false)
    setActivePanel(null)
    
    // 用AI生成关心的回复
    generateHumanLikeReplies(`${periodInfo}，请根据这个信息关心对方，表达你的体贴和爱意`)
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
  
  const periodRecords = getPeriodRecords()
  
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
    
    // 文本消息
    for (const sticker of stickers) {
      if (msg.content.includes(sticker.keyword)) {
        const parts = msg.content.split(sticker.keyword)
        return (
          <div>
            {parts.map((part, i) => (
              <span key={i}>
                {part}
                {i < parts.length - 1 && (
                  <img src={sticker.imageUrl} alt="表情" className="inline-block w-16 h-16 object-contain" />
                )}
              </span>
            ))}
          </div>
        )
      }
    }
    return <span>{msg.content}</span>
  }

  const isListeningWithThisCharacter = listenTogether?.characterId === character.id

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
      style.backdropFilter = 'blur(10px) saturate(1.2)'
      style.WebkitBackdropFilter = 'blur(10px) saturate(1.2)'
      style.backgroundImage = `linear-gradient(135deg, ${rgba('#ffffff', layer(0.40))}, ${rgba('#ffffff', layer(0.05))})`
      style.border = `1px solid ${rgba('#ffffff', 0.35)}`
      style.boxShadow = '0 10px 22px rgba(0,0,0,0.10)'
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
      style.backdropFilter = 'blur(12px) saturate(1.1)'
      style.WebkitBackdropFilter = 'blur(12px) saturate(1.1)'
      style.border = `1px solid ${rgba('#ffffff', 0.16)}`
      style.boxShadow = '0 12px 26px rgba(0,0,0,0.22)'
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

  return (
    <WeChatLayout>
      <div className="flex flex-col h-full" style={chatBgStyle}>
        {character.chatBackground && <div className="pointer-events-none absolute inset-0 bg-white/35 backdrop-blur-[1px]" />}
        
        {/* 一起听浮窗 */}
        {isListeningWithThisCharacter && (
          <div className="mx-3 mt-1 px-3 py-2 rounded-full bg-gradient-to-r from-pink-500/80 to-purple-500/80 backdrop-blur flex items-center gap-2">
            <svg className="w-4 h-4 text-white animate-pulse" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
            <span className="flex-1 text-white text-xs truncate">
              {character.name}正在和你一起听《{listenTogether.songTitle}》
            </span>
            <button 
              type="button"
              onClick={handleStopListening}
              className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center"
            >
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        {/* 头部 - 参考 ChatsTab 的结构 */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-transparent mt-1">
          {rewindMode ? (
            // 回溯模式头部
            <>
              <button 
                type="button" 
                onClick={() => { setRewindMode(false); setRewindSelectedId(null) }}
                className="text-gray-500 text-sm"
              >
                取消
              </button>
              <span className="font-semibold text-[#000]">选择回溯点</span>
              <button 
                type="button" 
                onClick={() => rewindSelectedId && setShowRewindConfirm(true)}
                disabled={!rewindSelectedId}
                className={`text-sm font-medium ${rewindSelectedId ? 'text-pink-500' : 'text-gray-300'}`}
              >
                确认
              </button>
            </>
          ) : (
            // 正常模式头部
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
          onScroll={() => {
            const el = messagesContainerRef.current
            if (!el) return
            const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
            nearBottomRef.current = distanceToBottom < 140
          }}
        >
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 text-sm mt-10">
              开始和{character.name}聊天吧~
            </div>
          ) : (
            messages.map((msg, index) => {
              
              // 系统消息特殊渲染
              if (msg.type === 'system') {
                return (
                  <div key={msg.id} className="flex justify-center mb-3">
                    <div className="px-3 py-1.5 rounded-lg bg-white/90 shadow-sm text-xs text-gray-500">
                      {msg.content}
                    </div>
                  </div>
                )
              }
              
              // 判断是否是拉黑后对方新发的消息（只有拉黑后发的才显示感叹号）
              const isBlockedMessage = !msg.isUser && 
                character.isBlocked && 
                character.blockedAt && 
                msg.timestamp > character.blockedAt
              
              // 判断是否被选中（回溯模式）
              const isSelected = rewindSelectedId === msg.id
              const isAfterSelected = rewindSelectedId && messages.findIndex(m => m.id === rewindSelectedId) < index
              
              return (
                <div key={msg.id} className={`${isAfterSelected ? 'opacity-40' : ''}`}>
                  <div className={`flex gap-2 mb-3 ${msg.isUser ? 'flex-row-reverse' : ''}`}>
                    {/* 回溯模式下显示选择圆圈（只在用户消息左边显示） */}
                    {rewindMode && msg.isUser && (
                      <button
                        type="button"
                        onClick={() => setRewindSelectedId(isSelected ? null : msg.id)}
                        className="flex items-center self-center"
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-pink-500 bg-pink-500' : 'border-gray-400'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </button>
                    )}
                    
                    <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                      {msg.isUser ? (
                        selectedPersona?.avatar ? (
                          <img src={selectedPersona.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                            {(selectedPersona?.name || '我')[0]}
                          </div>
                        )
                      ) : character.avatar ? (
                        <img src={character.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm font-medium">
                          {character.name[0]}
                        </div>
                      )}
                    </div>
                    
                    <div className={`flex flex-col max-w-[70%] ${msg.isUser ? 'items-end' : 'items-start'}`}>
                      <div 
                        className={`w-fit px-3.5 py-2.5 text-sm shadow-sm ${
                          msg.type === 'transfer' || msg.type === 'music' 
                            ? 'bg-transparent p-0 shadow-none' 
                            : msg.isUser 
                              ? 'text-gray-800 rounded-2xl rounded-tr-md' 
                              : 'text-gray-800 rounded-2xl rounded-tl-md'
                        }`}
                        style={msg.type !== 'transfer' && msg.type !== 'music' ? getBubbleStyle(msg.isUser) : undefined}
                      >
                        {renderMessageContent(msg)}
                      </div>
                      {/* 每条消息显示时间（小号字体） */}
                      <div className="mt-1 text-[10px] text-gray-400">
                        {formatTime(msg.timestamp)}
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
          )}
          
          {/* AI正在输入提示 */}
          {showTyping && (
            <div className="flex gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                {character.avatar ? (
                  <img src={character.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm font-medium">
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
          {!aiTyping && messages.length > 0 && !messages[messages.length - 1].isUser && messages[messages.length - 1].type !== 'system' && (
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
        <div className="px-3 py-2 bg-white/80 backdrop-blur-sm border-t border-gray-200/40">
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
              className="flex-1 min-w-0 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur outline-none text-gray-800 text-sm"
            />
            
            {/* 手动：触发回复按钮（随时可按，可连续点继续生成） */}
            <button
              type="button"
              onClick={triggerReply}
              disabled={aiTyping}
              className={`w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition-all flex-shrink-0 bg-gradient-to-r from-pink-400 to-pink-500 ${aiTyping ? 'opacity-50' : 'active:scale-90'}`}
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
                  
                  {/* 回溯 */}
                  <button type="button" onClick={() => { setShowPlusMenu(false); setRewindMode(true) }} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">回溯</span>
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
      
      {/* 已移除：模式切换提示弹窗（统一手动回复） */}

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

      {/* 回溯确认弹窗 */}
      <WeChatDialog
        open={showRewindConfirm}
        title="确认回溯？"
        message="选中消息之后的所有对话将被永久删除，记忆也会被清除，此操作不可逆！"
        confirmText="确认回溯"
        cancelText="取消"
        danger
        onCancel={() => setShowRewindConfirm(false)}
        onConfirm={handleRewind}
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
    </WeChatLayout>
  )
}
