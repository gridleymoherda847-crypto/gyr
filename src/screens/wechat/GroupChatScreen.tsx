import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'
import WeChatLayout from './WeChatLayout'
import WeChatDialog from './components/WeChatDialog'
import { compressImageFileToDataUrl } from '../../utils/image'
import { getGlobalPresets, getLorebookEntriesByLorebookId, getLorebookEntriesForCharacter, getLorebooks } from '../PresetScreen'

export default function GroupChatScreen() {
  const navigate = useNavigate()
  const { fontColor, callLLM, ttsConfig } = useOS()
  const { groupId } = useParams<{ groupId: string }>()
  const { 
    getGroup, getGroupMessages, addMessage, updateMessage, updateGroup, deleteGroup, deleteMessage,
    addGroupMember, removeGroupMember, addPeriodRecord, updatePeriodRecord,
    characters, getCurrentPersona, getStickersByCharacter, groups,
    getPeriodRecords, getCurrentPeriod, deleteMessagesByIds
  } = useWeChat()
  
  const group = getGroup(groupId || '')
  const messages = getGroupMessages(groupId || '')
  const members = useMemo(() => {
    if (!group) return []
    return group.memberIds.map(id => characters.find(c => c.id === id)).filter(Boolean) as typeof characters
  }, [group, characters])
  
  const selectedPersona = getCurrentPersona()
  getCurrentPeriod() // 调用以保持依赖

  // 群备注（仅本群显示/使用）
  const getNameInGroup = useCallback((id: string) => {
    if (!group) return '群友'
    if (id === 'user') return selectedPersona?.name || '我'
    const remark = String(group.memberRemarks?.[id] || '').trim()
    if (remark) return remark
    return characters.find(c => c.id === id)?.name || '群友'
  }, [group, characters, selectedPersona?.name])

  const [memberRemarkDrafts, setMemberRemarkDrafts] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!group) return
    const next: Record<string, string> = {}
    for (const id of group.memberIds) {
      next[id] = String(group.memberRemarks?.[id] || '')
    }
    setMemberRemarkDrafts(next)
  }, [group?.id])

  // ===== 对话统计（回合/Token 预估）=====
  const estimateTokens = (text: string) => {
    const s = String(text || '')
    let cjk = 0
    let ascii = 0
    let other = 0
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i)
      if (code <= 0x7f) ascii++
      else if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) cjk++
      else other++
    }
    return Math.max(0, Math.ceil(cjk * 1.0 + other * 0.7 + ascii / 4))
  }
  const currentRounds = useMemo(() => {
    return (messages || []).filter(m => (m as any)?.isUser && (m as any)?.type !== 'system').length
  }, [messages])
  const estimatedContextTokens = useMemo(() => {
    const parts = (messages || []).map(m => {
      const type = (m as any)?.type
      if (type === 'image') return '[图片]'
      if (type === 'sticker') return '[表情包]'
      if (type === 'voice') return '[语音]'
      if (type === 'transfer') return '[转账]'
      if (type === 'location') return '[位置]'
      if (type === 'period') return '[经期]'
      if (type === 'doudizhu_share') return '[斗地主]'
      if (type === 'pat') return '[拍一拍]'
      return String((m as any)?.content || '').slice(0, 4000)
    })
    return estimateTokens(parts.join('\n'))
  }, [messages])
  const memorySummaryTokens = useMemo(() => estimateTokens(String(group?.memorySummary || '')), [group?.memorySummary])

  // 群聊识图：缓存图片描述，避免同一张图反复 OCR
  const imageDescCacheRef = useRef<Record<string, string>>({})
  const getImageDescription = async (imageUrl: string): Promise<string> => {
    const key = String(imageUrl || '').trim()
    if (!key) return '（空图片）'
    // 安全网：GIF 图片 Gemini/中转不支持，直接跳过
    if (/\.gif(\?|$)/i.test(key) || /^data:image\/gif/i.test(key)) return '（动图/GIF，跳过识别）'
    if (imageDescCacheRef.current[key]) return imageDescCacheRef.current[key]
    try {
      const res = await callLLM(
        [
          {
            role: 'system',
            content:
              '你是“图片识别/截图文字提取器”。只输出简体中文，不要加引号，不要换行。\n' +
              '要求：\n' +
              '- 如果是聊天截图/页面截图：优先提取截图里可见的关键文字（人名、金额、按钮文案、对话内容、时间等），并做一句话总结。\n' +
              '- 如果是普通照片：描述你看到的主体/场景/动作/情绪。\n' +
              '- 输出尽量精炼（<=80字）。\n' +
              '- 如果无法识别，就输出：无法识别图片内容',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: '请识别这张图片的内容：' },
              // 兼容：OpenAI-compat
              { type: 'image_url', image_url: { url: key } },
            ],
          },
        ],
        undefined,
        { maxTokens: 200, timeoutMs: 600000, temperature: 0.2 }
      )
      const text = (res || '').trim()
      const finalText = text.slice(0, 120) || '无法识别图片内容'
      imageDescCacheRef.current[key] = finalText
      return finalText
    } catch {
      imageDescCacheRef.current[key] = '无法识别图片内容'
      return '无法识别图片内容'
    }
  }
  
  // 获取所有表情包（全局 + 群成员的）
  const allStickersWithInfo = useMemo(() => {
    const stickers: { id: string; url: string; category: string; keyword?: string; description?: string }[] = []
    // 先获取全局表情包（任意角色都可以，因为 getStickersByCharacter 会包含 characterId='all' 的）
    const globalStickers = getStickersByCharacter('')
    globalStickers.forEach(s => {
      if (!stickers.find(st => st.url === s.imageUrl)) {
        stickers.push({ id: s.id, url: s.imageUrl, category: s.category || '未分类', keyword: s.keyword, description: s.description })
      }
    })
    // 再获取群成员的表情包
    members.forEach(m => {
      const memberStickers = getStickersByCharacter(m.id)
      memberStickers.forEach(s => {
        if (!stickers.find(st => st.url === s.imageUrl)) {
          stickers.push({ id: s.id, url: s.imageUrl, category: s.category || '未分类', keyword: s.keyword, description: s.description })
        }
      })
    })
    return stickers
  }, [members, getStickersByCharacter])
  
  // 表情包分类列表
  const stickerCategoryList = useMemo(() => {
    const categories = new Set<string>()
    for (const s of allStickersWithInfo) {
      if (s.category) categories.add(s.category)
    }
    return Array.from(categories).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [allStickersWithInfo])
  
  // 最近使用的表情包
  const [recentStickers, setRecentStickers] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('littlephone_recent_stickers')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  
  // 当前表情包标签
  const [stickerTab, setStickerTab] = useState<string>('recent')
  
  // 当前标签页的表情包
  const currentTabStickers = useMemo(() => {
    if (stickerTab === 'recent') {
      return recentStickers
        .map(url => allStickersWithInfo.find(s => s.url === url))
        .filter((s): s is typeof allStickersWithInfo[0] => !!s)
    }
    return allStickersWithInfo.filter(s => s.category === stickerTab)
  }, [stickerTab, allStickersWithInfo, recentStickers])
  
  const [inputText, setInputText] = useState('')
  const [aiTyping, setAiTyping] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // 群聊绑定世界书（来自创作工坊）
  const lorebooks = useMemo(() => {
    try {
      return getLorebooks().slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'))
    } catch {
      return []
    }
  }, [])
  const [lorebookBindDialogOpen, setLorebookBindDialogOpen] = useState(false)
  const [pendingLorebookId, setPendingLorebookId] = useState<string | null>(null)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  
  // +号菜单
  const [showPlusMenu, setShowPlusMenu] = useState(false)
  const [activePanel, setActivePanel] = useState<'location' | 'period' | 'doudizhu' | null>(null)
  
  // 表情包面板
  const [showStickerPanel, setShowStickerPanel] = useState(false)
  
  // 记忆功能折叠状态
  const [memoryExpanded, setMemoryExpanded] = useState(false)
  
  // 位置分享
  const [locationName, setLocationName] = useState('')
  const [locationAddress, setLocationAddress] = useState('')
  const [locationCity, setLocationCity] = useState('')
  
  // 斗地主：选择2人
  const [doudizhuSelected, setDoudizhuSelected] = useState<string[]>([])
  
  // 群设置相关
  const [settingsTab, setSettingsTab] = useState<'info' | 'chat' | 'bubble' | 'relations'>('info')
  const [groupNameDraft, setGroupNameDraft] = useState('')
  
  // 关系网状态
  const [relationExpanded, setRelationExpanded] = useState<Set<string>>(new Set())
  const [newRelationPerson1, setNewRelationPerson1] = useState<string>('')
  const [newRelationPerson2, setNewRelationPerson2] = useState<string>('')
  const [newRelationMode, setNewRelationMode] = useState<'single' | 'oneToMany' | 'manyToOne'>('single')
  const [newRelationMulti, setNewRelationMulti] = useState<string[]>([])
  const [newRelationship, setNewRelationship] = useState('')
  const [newRelationStory, setNewRelationStory] = useState('')
  const [editingRelationId, setEditingRelationId] = useState<string | null>(null)
  const [editRelationship, setEditRelationship] = useState('')
  const [editRelationStory, setEditRelationStory] = useState('')
  
  // 转发模式
  const [forwardMode, setForwardMode] = useState(false)
  const [forwardSelectedIds, setForwardSelectedIds] = useState<Set<string>>(new Set())
  const [showForwardTargetPicker, setShowForwardTargetPicker] = useState(false)
  
  // 生成选择器
  const [showGenerateSelector, setShowGenerateSelector] = useState(false)
  const [generateSelectedMembers, setGenerateSelectedMembers] = useState<string[]>([])
  
  const [memorySummaryDraft, setMemorySummaryDraft] = useState('')
  const [memoryGenerating, setMemoryGenerating] = useState(false)
  const [summaryRoundsDraft, setSummaryRoundsDraft] = useState(50)
  
  // 时间同步弹窗
  const [showTimeSyncModal, setShowTimeSyncModal] = useState(false)
  const [timeSyncTypeDraft, setTimeSyncTypeDraft] = useState<'realtime' | 'custom'>('realtime')
  const [customTimeDraft, setCustomTimeDraft] = useState('')
  
  // 气泡设置弹窗
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showBubbleModal, _setShowBubbleModal] = useState(false)
  const [bubbleEditingMember, setBubbleEditingMember] = useState<string>('user')
  const [bubbleBgColor, setBubbleBgColor] = useState('#95EC69')
  const [bubbleBgOpacity, setBubbleBgOpacity] = useState(100)
  const [bubbleBorderColor, setBubbleBorderColor] = useState('#000000')
  const [bubbleBorderOpacity, setBubbleBorderOpacity] = useState(0)
  
  // 添加/移除成员弹窗
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)
  const [showRemoveMemberModal, setShowRemoveMemberModal] = useState(false)
  const [addMemberSelected, setAddMemberSelected] = useState<string[]>([])
  const [removeMemberSelected, setRemoveMemberSelected] = useState<string[]>([])
  
  // 编辑消息
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  
  // 引用消息
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(null)
  
  // 经期日历状态
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selectedPeriodDate, setSelectedPeriodDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [periodPainDraft, setPeriodPainDraft] = useState<0 | 1 | 2 | 3 | 4>(0)
  const [periodFlowDraft, setPeriodFlowDraft] = useState<'none' | 'light' | 'medium' | 'heavy'>('none')
  const [periodNoteDraft, setPeriodNoteDraft] = useState('')
  const [infoDialog, setInfoDialog] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: '', message: '' })

  // ===== 群聊语音 =====
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const groupAudioRef = useRef<HTMLAudioElement | null>(null)
  const voiceGenLockRef = useRef<Record<string, boolean>>({})

  // ===== 群聊表情包：拦截模型输出的“表情包描述文本”，改为真正发送表情包 =====
  const parseStickerMetaLine = (text: string) => {
    const t = String(text || '').trim()
    if (!t) return null
    if (!/^[【\[]\s*表情包/.test(t)) return null
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

  const pickStickerForMemberText = (memberId: string, basisText: string) => {
    const basis = String(basisText || '').trim()
    const pool = getStickersByCharacter(memberId)
    const candidates = pool.length > 0 ? pool : getStickersByCharacter('')
    if (candidates.length === 0) return null
    const hayOf = (s: any) => [s.description, s.keyword, s.category].map((x: any) => String(x || '').trim()).filter(Boolean).join(' ')
    const tokens = basis.split(/\s+/).map(s => s.trim()).filter(Boolean).slice(0, 12)
    let bestScore = -1
    let best: any[] = []
    for (const s of candidates) {
      const hay = hayOf(s)
      let score = 0
      if (basis && hay && (hay.includes(basis) || basis.includes(hay))) score += 3
      for (const tk of tokens) if (tk && hay.includes(tk)) score += 1
      if (score > bestScore) { bestScore = score; best = [s] }
      else if (score === bestScore) best.push(s)
    }
    const picked = (best.length > 0 ? best : candidates)[Math.floor(Math.random() * (best.length > 0 ? best.length : candidates.length))]
    return picked || null
  }

  // 决定某个成员是否发语音
  const shouldSendVoiceForMember = useCallback((memberId: string) => {
    if (!ttsConfig.enabled || !group?.voiceEnabled) return false
    const member = characters.find(c => c.id === memberId)
    // 成员必须启用了语音 + 有 voiceId
    const memberVoiceId = group?.memberVoiceSettings?.[memberId]?.voiceId || member?.voiceId
    if (!memberVoiceId) return false
    const freq = group?.voiceFrequency || 'sometimes'
    const rand = Math.random()
    if (freq === 'always') return true
    if (freq === 'often') return rand < 0.5
    if (freq === 'sometimes') return rand < 0.2
    if (freq === 'rarely') return rand < 0.05
    return false
  }, [ttsConfig.enabled, group?.voiceEnabled, group?.voiceFrequency, group?.memberVoiceSettings, characters])

  // 为指定成员生成语音
  const generateVoiceUrlForMember = useCallback(async (text: string, memberId: string): Promise<string | null> => {
    const member = characters.find(c => c.id === memberId)
    const voiceId = group?.memberVoiceSettings?.[memberId]?.voiceId || member?.voiceId || ttsConfig.voiceId
    if (!voiceId || !ttsConfig.apiKey) return null
    const controller = new AbortController()
    const timeoutMs = 45_000
    const t = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const baseUrl = ttsConfig.region === 'global' ? 'https://api.minimax.chat' : 'https://api.minimaxi.com'
      const response = await fetch(`${baseUrl}/v1/t2a_v2`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ttsConfig.apiKey}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: ttsConfig.model || 'speech-02-turbo',
          text: text.slice(0, 500),
          stream: false,
          voice_setting: { voice_id: voiceId, speed: ttsConfig.speed || 1, vol: 1, pitch: 0 },
          audio_setting: { sample_rate: 24000, bitrate: 128000, format: 'mp3', channel: 1 },
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
    } catch { return null } finally { window.clearTimeout(t) }
  }, [characters, group?.memberVoiceSettings, ttsConfig])

  const regenGroupVoice = useCallback(async (msgId: string, text: string, memberId: string) => {
    if (!msgId || !text) return
    if (voiceGenLockRef.current[msgId]) return
    voiceGenLockRef.current[msgId] = true
    try {
      updateMessage(msgId, { voiceStatus: 'pending', voiceError: '' })
      const url = await generateVoiceUrlForMember(text, memberId)
      if (!url) {
        updateMessage(msgId, { voiceStatus: 'error', voiceError: '语音生成失败，点击可重试。', voiceUrl: undefined as any })
        return
      }
      updateMessage(msgId, { voiceUrl: url, voiceStatus: 'ready', voiceError: '' })
    } finally { voiceGenLockRef.current[msgId] = false }
  }, [generateVoiceUrlForMember, updateMessage])

  const playGroupVoice = useCallback((messageId: string, voiceUrl: string) => {
    if (groupAudioRef.current) { groupAudioRef.current.pause(); groupAudioRef.current = null }
    if (playingVoiceId === messageId) { setPlayingVoiceId(null); return }
    const audio = new Audio(voiceUrl)
    groupAudioRef.current = audio
    setPlayingVoiceId(messageId)
    audio.onended = () => { setPlayingVoiceId(null); groupAudioRef.current = null }
    audio.onerror = () => { setPlayingVoiceId(null); groupAudioRef.current = null }
    audio.play().catch(() => { setPlayingVoiceId(null) })
  }, [playingVoiceId])

  // 图片上传
  const imageInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bgInputRef = useRef<HTMLInputElement>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  
  // 滚动到底部的ref
  const shouldScrollRef = useRef(false)
  const hasInitialScrolledRef = useRef(false)
  
  // 进入群聊时自动滚动到底部
  useEffect(() => {
    if (group && !hasInitialScrolledRef.current) {
      // 使用 setTimeout 确保 DOM 已渲染
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
        hasInitialScrolledRef.current = true
      }, 50)
    }
  }, [group])
  
  // 只在需要时滚动到底部（发消息/收到回复时）
  useEffect(() => {
    if (shouldScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      shouldScrollRef.current = false
    }
  }, [messages])
  
  // 打开设置时初始化
  // 打开设置弹窗时只初始化群名称草稿，不重置标签页
  useEffect(() => {
    if (showSettings && group) {
      setGroupNameDraft(group.name)
      // 同步“已保存的长期记忆”到草稿（否则刷新后草稿为空，看起来像丢失）
      setMemorySummaryDraft(group.memorySummary || '')
      setSummaryRoundsDraft(50)
    }
  }, [showSettings, group])
  
  // 打开时间同步弹窗时初始化
  useEffect(() => {
    if (showTimeSyncModal && group) {
      setTimeSyncTypeDraft(group.timeSyncType || 'realtime')
      setCustomTimeDraft(group.customTime || '')
    }
  }, [showTimeSyncModal, group])
  
  // 打开气泡设置时初始化
  useEffect(() => {
    if (showBubbleModal && group) {
      const settings = group.bubbleSettings?.[bubbleEditingMember] || {}
      setBubbleBgColor(settings.bgColor || (bubbleEditingMember === 'user' ? '#95EC69' : '#FFFFFF'))
      setBubbleBgOpacity(settings.bgOpacity ?? 100)
      setBubbleBorderColor(settings.borderColor || '#000000')
      setBubbleBorderOpacity(settings.borderOpacity ?? 0)
    }
  }, [showBubbleModal, group, bubbleEditingMember])
  
  if (!group) {
    return (
      <WeChatLayout>
        <div className="flex h-full items-center justify-center text-gray-400">
          群聊不存在
        </div>
      </WeChatLayout>
    )
  }
  
  // 可添加的成员（不在群里的角色）
  const availableToAdd = characters.filter(c => !c.isHiddenFromChat && !group.memberIds.includes(c.id))
  
  // 格式化时间
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

  const languageName = (lang: any) => {
    const map: Record<string, string> = {
      zh: '中文',
      en: '英语',
      ru: '俄语',
      fr: '法语',
      ja: '日语',
      ko: '韩语',
      de: '德语',
    }
    return map[String(lang || 'zh')] || '中文'
  }

  // 伪翻译解析：外语原文 ||| 中文翻译
  const parseDual = (line: string) => {
    const idx = String(line || '').indexOf('|||')
    if (idx < 0) return null
    const orig = String(line || '').slice(0, idx).trim()
    const zh = String(line || '').slice(idx + 3).trim()
    if (!orig || !zh) return null
    return { orig, zh }
  }
  
  // 获取当前时间字符串（用于时间同步）
  const getCurrentTimeStr = () => {
    if (!group.timeSyncEnabled) return new Date().toLocaleString('zh-CN')
    if (group.timeSyncType === 'custom' && group.customTime) {
      return group.customTime
    }
    return new Date().toLocaleString('zh-CN')
  }
  
  // 构建用于总结的历史
  const buildHistoryForSummary = (msgs: typeof messages, rounds: number) => {
    const nonSystem = msgs.filter(m => m.type !== 'system')
    const limited = nonSystem.slice(-rounds * 2)
    return limited.map(m => {
      const sender = m.isUser
        ? (selectedPersona?.name || '用户')
        : getNameInGroup(m.groupSenderId || '')
      return `${sender}: ${m.content?.slice(0, 200) || ''}`
    }).join('\n')
  }
  
  // 构建系统提示（参考私聊：人设 → 世界书 → 上下文）
  const buildSystemPrompt = (params: { recentContext: string; recentMessages: string }) => {
    // 1. 全局预设
    const globalPresets = getGlobalPresets()
    
    // 2. 每个成员的人设
    const memberProfiles = members.map(m => {
      const displayName = getNameInGroup(m.id)
      const rawName = m.name
      const translationMode = (m as any).language !== 'zh' && !!(m as any).chatTranslationEnabled
      return `【${displayName}】
${displayName !== rawName ? `- 群备注名：${displayName}\n- 原名：${rawName}` : `- 名称：${rawName}`}
- 性别：${m.gender === 'male' ? '男' : m.gender === 'female' ? '女' : '其他'}
- 主要语言：${languageName((m as any).language || 'zh')}${translationMode ? '（已开启聊天翻译：输出 外语原文 ||| 中文翻译）' : ''}
- 人设：${m.prompt || '普通朋友'}
- 关系：${m.relationship || '朋友'}`
    }).join('\n\n')
    
    // 3. 世界书（基于所有成员和最近上下文）
    const memberLore = members.map(m => getLorebookEntriesForCharacter(m.id, params.recentContext)).filter(Boolean).join('\n\n')
    const boundLore = group.lorebookId ? getLorebookEntriesByLorebookId(group.lorebookId, params.recentContext) : ''
    // 优先级：如果群聊绑定了世界书，则优先读取群聊世界书（覆盖成员各自绑定的世界书），避免“双重世界书”冲突
    const lorebookEntries = (group.lorebookId ? boundLore : memberLore).trim()
    
    // 5. 关系网（必读）
    const relationsText = (group.relations || []).length > 0 ? (group.relations || []).map(rel => {
      const p1Name = getNameInGroup(rel.person1Id)
      const p2Name = getNameInGroup(rel.person2Id)
      let line = `- ${p1Name} ↔ ${p2Name}：${rel.relationship}`
      if (rel.story) line += `\n  背景故事：${rel.story}`
      return line
    }).join('\n') : ''
    
    // 严格按照顺序：1.叙事设置 2.世界书 3.角色人设 4.上下文
    let prompt =
      `${globalPresets ? globalPresets + '\n\n' : ''}` +
      `${lorebookEntries ? '【世界书/背景设定】\n' + lorebookEntries + '\n\n' : ''}` +
      `【最高优先级规则（必须读，必须执行）】\n` +
      `- “创作工坊提示词/叙事设置”与“世界书”是最高优先级约束，优先级高于成员人设与任何后续聊天。\n` +
      `- 如果世界书/创作工坊与成员人设或群聊上下文冲突：以世界书/创作工坊为准。\n` +
      `- 回复前必须先通读：创作工坊提示词 → 世界书 → 成员人设/关系网 → 群聊上下文。\n\n` +
      `【群聊成员人设】
${memberProfiles}

${relationsText ? '【关系网（必读，影响成员间互动方式）】\n' + relationsText + '\n\n' : ''}【群聊信息】
- 群名：${group.name}
- 群成员：${members.map(m => getNameInGroup(m.id)).join('、')}
- 用户名：${selectedPersona?.name || '我'}
${Object.keys(group.memberRemarks || {}).length ? `\n【群备注（成员在本群里的显示名）】\n${Object.entries(group.memberRemarks || {}).map(([id, name]) => `- ${characters.find(c => c.id === id)?.name || '未知'} → ${String(name || '').trim()}`).join('\n')}\n` : ''}

【当前时间】
${getCurrentTimeStr()}

【重要规则】
1. 你需要模拟群里多个成员的回复，每条格式：[成员名字]内容
2. 成员之间可以互相回复、聊天、吐槽，不一定都回复用户
3. 每个成员要保持自己的性格特点，说话风格要符合人设
4. 回复要简短自然，像真实群聊
5. 可以有成员不说话，也可以有成员连续发多条
6. 根据关系网设定，成员之间的互动方式应符合他们的关系（如情侣会更亲密，死对头会互怼等）
7. 注意消息中的[回复XXX]标记，表示该消息是在回复/引用XXX说的话，回复时要理解这个上下文关系
8. 【群聊翻译（伪翻译）】对“主要语言不是中文且已开启聊天翻译”的成员：每一条内容都必须按同一行格式输出：
   外语原文 ||| 中文翻译
   - 外语原文必须严格使用该成员的主要语言
   - 中文翻译必须是简体中文
   - 只允许用 "|||" 作为分隔符，不要添加其他括号/标签

【群聊上下文】
${params.recentMessages || '（暂无消息）'}`
    
    // 记忆功能
    if (group.memoryEnabled && group.memorySummary) {
      prompt += `\n\n【长期记忆（必读）】\n${group.memorySummary}`
    }
    
    return prompt
  }
  
  // 计算回复条数
  const getReplyCount = () => {
    const memberCount = members.length
    if (memberCount >= 10) {
      return Math.floor(10 + Math.random() * 21) // 10-30
    }
    return Math.floor(5 + Math.random() * 11) // 5-15
  }
  
  // 发送消息（不触发AI回复）
  const handleSend = async () => {
    if (!inputText.trim() || aiTyping) return
    
    const text = inputText.trim()
    setInputText('')
    
    shouldScrollRef.current = true // 发送消息时滚动到底部
    
    addMessage({
      characterId: '',
      groupId: group.id,
      content: text,
      isUser: true,
      type: 'text',
      replyToMessageId: replyingToMessageId || undefined,
    })
    
    setReplyingToMessageId(null)
    updateGroup(group.id, { lastMessageAt: Date.now() })
  }
  
  // 生成回复（一次API调用生成所有回复）
  const generateReplies = useCallback(async (specificMembers?: string[]) => {
    if (aiTyping || !group) return
    setAiTyping(true)
    setShowGenerateSelector(false)
    
    try {
      const replyCount = specificMembers?.length || getReplyCount()
      
      // 确定要回复的成员名字
      let targetMemberNames: string[]
      if (specificMembers && specificMembers.length > 0) {
        targetMemberNames = members.filter(m => specificMembers.includes(m.id)).map(m => getNameInGroup(m.id))
      } else {
        // 随机选择
        const shuffled = [...members].sort(() => Math.random() - 0.5)
        const count = Math.min(replyCount, members.length * 3)
        targetMemberNames = []
        for (let i = 0; i < count; i++) {
          targetMemberNames.push(getNameInGroup(shuffled[i % shuffled.length].id))
        }
      }
      
      const uniqueNames = [...new Set(targetMemberNames)]
      
      // ========= 群聊识图：把最近图片转成可读文本，写进上下文 =========
      const userName = selectedPersona?.name || '用户'
      const senderNameOf = (m: any) =>
        m.isUser ? userName : getNameInGroup(String(m.groupSenderId || ''))
      
      // 只识别最近少量图片，避免一次生成耗费过多 API
      const recentForVision = messages.slice(-30)
      const imageUrls = Array.from(
        new Set(
          recentForVision
            .filter(m =>
              // 不再把表情包/GIF 发给识图 API（Gemini/中转不支持 image/gif）
              m.type === 'image' &&
              typeof m.content === 'string' &&
              String(m.content || '').trim() &&
              !/\.gif(\?|$)/i.test(String(m.content || '')) &&
              !/^data:image\/gif/i.test(String(m.content || ''))
            )
            .map(m => String(m.content || '').trim())
        )
      ).slice(0, 3)
      
      if (imageUrls.length > 0) {
        await Promise.all(imageUrls.map(async (u) => void (await getImageDescription(u))))
      }
      
      const summarizeForContext = (m: any) => {
        if (!m) return ''
        if (m.type === 'image') {
          const u = String(m.content || '').trim()
          const desc = u ? (imageDescCacheRef.current[u] || '无法识别图片内容') : '无法识别图片内容'
          return `【图片内容：${desc}】`
        }
        if (m.type === 'sticker') {
          // 不走识图（GIF 会导致 Gemini/中转报 mime type not supported）
          // 用关键词/备注/分类替代（和私聊一致）
          const u = String(m.content || '').trim()
          const st = allStickersWithInfo.find((s: any) => String(s?.url || '').trim() === u) || null
          const desc = String(st?.description || '').trim()
          const kw = String(st?.keyword || '').trim()
          const cat = String(st?.category || '').trim()
          const ref = String((st as any)?.refKey || '').trim()
          const parts = [desc ? `备注=${desc}` : '', kw ? `关键词=${kw}` : '', cat ? `分类=${cat}` : ''].filter(Boolean)
          if (ref) parts.push(`引用=${ref}`)
          return parts.length > 0 ? `【表情包】${parts.join('；')}` : '【表情包】'
        }
        if (m.type === 'voice') return '<语音>'
        if (m.type === 'transfer') return '<转账>'
        if (m.type === 'location') return '<位置>'
        if (m.type === 'period') return '<经期记录>'
        if (m.type === 'doudizhu_share') return '<斗地主战绩>'
        const text = String(m.content || '').trim()
        if (/^data:image\//i.test(text)) return '<图片>'
        return text
      }
      
      const recentContextText = messages.slice(-10).map(m => summarizeForContext(m)).join(' ')
      const recentMessagesText = messages.slice(-30).map(m => {
        // 如果有引用消息，添加引用信息
        let replyInfo = ''
        if (m.replyToMessageId) {
          const replyTo = messages.find(rm => rm.id === m.replyToMessageId)
          if (replyTo) {
            const replyToSender = senderNameOf(replyTo)
            const replyPreview = String(summarizeForContext(replyTo)).slice(0, 20)
            replyInfo = `[回复${replyToSender}："${replyPreview}${replyPreview.length >= 20 ? '...' : ''}"] `
          }
        }
        return `${senderNameOf(m)}: ${replyInfo}${summarizeForContext(m)}`
      }).join('\n')
      
      const systemPrompt = buildSystemPrompt({ recentContext: recentContextText, recentMessages: recentMessagesText })
      
      const userPrompt = `请模拟以下成员的群聊回复（总共约${replyCount}条，每人可发多条）：
${uniqueNames.join('、')}

输出格式说明：
- 普通回复：[成员名]内容
- 引用/回复某人消息：[成员名>>被引用者名]内容
注意：如果该成员“主要语言不是中文且已开启聊天翻译”，则该成员的每条内容必须按：外语原文 ||| 中文翻译（同一行）输出。

输出格式示例：
[小明]今天天气不错
[小红]是啊，出去玩吧
[小明]好主意！
[小刚>>小红]你们去哪？带我一个
[小红>>小刚]去商场啊

注意：如果要回复/引用某人说的话，使用 >> 符号，比如[小刚>>小红]表示小刚回复小红

现在开始生成回复：`

      const response = await callLLM([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], undefined, { maxTokens: 2000 })
      
      // 解析回复，支持引用格式 [成员名>>被引用者] 或普通格式 [成员名]
      const lines = response.split('\n').filter(l => l.trim())
      const parsedReplies: { name: string; content: string; replyTo?: string }[] = []
      
      for (const line of lines) {
        // 尝试匹配引用格式：[成员名>>被引用者]内容
        const matchWithReply = line.match(/^[\[【]([^\]】>]+)>>([^\]】]+)[\]】]\s*(.+)$/)
        if (matchWithReply) {
          parsedReplies.push({ 
            name: matchWithReply[1].trim(), 
            content: matchWithReply[3].trim(),
            replyTo: matchWithReply[2].trim()
          })
          continue
        }
        // 普通格式：[成员名]内容
        const match = line.match(/^[\[【]([^\]】]+)[\]】]\s*(.+)$/)
        if (match) {
          parsedReplies.push({ name: match[1].trim(), content: match[2].trim() })
        }
      }
      
      // 逐条发送，根据字数间隔1-5秒
      // 记录每个成员最近发送的消息ID，用于引用
      const recentMessageIdBySender: Record<string, string> = {}
      
      // 先记录现有消息中每个人最近的消息
      for (const msg of messages.slice(-30)) {
        const senderName = msg.isUser 
          ? (selectedPersona?.name || '我') 
          : getNameInGroup(msg.groupSenderId || '')
        if (senderName) {
          recentMessageIdBySender[senderName] = msg.id
        }
      }
      
      for (const reply of parsedReplies) {
        const member = members.find(m => getNameInGroup(m.id) === reply.name || m.name === reply.name)
        if (!member) continue
        
        const charCount = reply.content.length
        const delay = Math.min(5000, Math.max(1000, charCount * 100))
        
        await new Promise(resolve => setTimeout(resolve, delay))
        
        shouldScrollRef.current = true // AI回复时滚动到底部
        
        // 查找引用目标
        let replyToMessageId: string | undefined
        if (reply.replyTo) {
          replyToMessageId = recentMessageIdBySender[reply.replyTo]
        }
        
        const translationMode = (member as any).language !== 'zh' && !!(member as any).chatTranslationEnabled
        const dual = translationMode ? parseDual(reply.content) : null
        const textContent = dual ? dual.orig : reply.content
        const stickerMeta = parseStickerMetaLine(String(textContent || '').trim())

        // 判断是否发语音
        const sendAsVoice = shouldSendVoiceForMember(member.id)

        // 如果模型输出了“【表情包】备注=...”，优先按表情包处理（不显示那坨字）
        if (stickerMeta) {
          const basis = [stickerMeta.desc, stickerMeta.kw, stickerMeta.cat].filter(Boolean).join(' ')
          const byRef =
            stickerMeta.ref
              ? getStickersByCharacter(member.id).find((s: any) => String((s as any).refKey || '').trim() === String(stickerMeta.ref || '').trim()) ||
                getStickersByCharacter('').find((s: any) => String((s as any).refKey || '').trim() === String(stickerMeta.ref || '').trim())
              : null
          const picked = byRef || pickStickerForMemberText(member.id, basis || String(textContent || ''))
          if (picked?.imageUrl) {
            const stMsg = addMessage({
              characterId: '',
              groupId: group.id,
              groupSenderId: member.id,
              content: picked.imageUrl,
              isUser: false,
              type: 'sticker',
              replyToMessageId,
            })
            recentMessageIdBySender[member.name] = stMsg.id
          }
        } else if (sendAsVoice) {
          const voiceDuration = Math.max(2, Math.min(60, Math.ceil(textContent.length / 5)))
          const isChinese = (member as any).language === 'zh' || /[\u4e00-\u9fa5]/.test(textContent.slice(0, 20))
          const dualZh = dual?.zh ? String(dual.zh).trim() : ''
          const voiceMsg = addMessage({
            characterId: '',
            groupId: group.id,
            groupSenderId: member.id,
            content: '[语音消息]',
            isUser: false,
            type: 'voice',
            voiceText: isChinese ? textContent : (dualZh ? `${textContent}（${dualZh}）` : textContent),
            voiceOriginalText: textContent,
            voiceDuration,
            voiceUrl: undefined as any,
            voiceStatus: 'pending',
            voiceError: '',
            replyToMessageId,
          })
          // 异步生成语音
          ;(async () => {
            const url = await generateVoiceUrlForMember(textContent, member.id)
            if (url) updateMessage(voiceMsg.id, { voiceUrl: url, voiceStatus: 'ready', voiceError: '' })
            else updateMessage(voiceMsg.id, { voiceStatus: 'error', voiceError: '语音生成失败，点击可重试。' })
          })()
          recentMessageIdBySender[member.name] = voiceMsg.id
        } else {
          const newMsg = addMessage({
            characterId: '',
            groupId: group.id,
            groupSenderId: member.id,
            content: textContent,
            isUser: false,
            type: 'text',
            replyToMessageId,
            messageLanguage: translationMode ? (member as any).language : undefined,
            chatTranslationEnabledAtSend: translationMode ? true : undefined,
            translationStatus: translationMode ? (dual ? 'done' : 'error') : undefined,
            translatedZh: dual ? dual.zh : undefined,
          })
          recentMessageIdBySender[member.name] = newMsg.id
        }
        
        updateGroup(group.id, { lastMessageAt: Date.now() })
      }
      
    } catch (err) {
      console.error('群聊回复失败:', err)
    } finally {
      setAiTyping(false)
      setGenerateSelectedMembers([])
    }
  }, [aiTyping, group, members, messages, selectedPersona, characters, callLLM, addMessage, updateGroup, updateMessage, shouldSendVoiceForMember, generateVoiceUrlForMember])
  
  const handleSendImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    
    try {
      const compressed = await compressImageFileToDataUrl(file, { maxSide: 800, quality: 0.8 })
      addMessage({
        characterId: '',
        groupId: group.id,
        content: compressed,
        isUser: true,
        type: 'image',
      })
      updateGroup(group.id, { lastMessageAt: Date.now() })
      setShowPlusMenu(false)
    } catch (err) {
      console.error('图片压缩失败:', err)
    }
  }
  
  const handleSendSticker = (sticker: { url: string; id?: string }) => {
    shouldScrollRef.current = true
    
    addMessage({
      characterId: '',
      groupId: group.id,
      content: sticker.url,
      isUser: true,
      type: 'sticker',
    })
    updateGroup(group.id, { lastMessageAt: Date.now() })
    setShowStickerPanel(false)
    
    // 更新最近使用
    setRecentStickers(prev => {
      const filtered = prev.filter(url => url !== sticker.url)
      const updated = [sticker.url, ...filtered].slice(0, 20)
      localStorage.setItem('littlephone_recent_stickers', JSON.stringify(updated))
      return updated
    })
  }
  
  const handleSendLocation = () => {
    if (!locationName.trim()) return
    addMessage({
      characterId: '',
      groupId: group.id,
      content: `[位置] ${locationName}`,
      isUser: true,
      type: 'location',
      locationName: locationName.trim(),
      locationAddress: locationAddress.trim(),
      locationCity: locationCity.trim(),
    })
    updateGroup(group.id, { lastMessageAt: Date.now() })
    setLocationName('')
    setLocationAddress('')
    setLocationCity('')
    setActivePanel(null)
    setShowPlusMenu(false)
  }
  
  // 经期相关
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
  
  useEffect(() => {
    if (activePanel !== 'period') return
    const r = findRecordForDate(selectedPeriodDate)
    const entry = r?.daily?.find((e: any) => e?.date === selectedPeriodDate)
    setPeriodPainDraft((entry?.pain ?? 0) as any)
    setPeriodFlowDraft((entry?.flow ?? 'none') as any)
    setPeriodNoteDraft(String(entry?.note ?? ''))
  }, [activePanel, selectedPeriodDate])
  
  const formatDateStr = (y: number, m: number, d: number) => {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  
  const renderCalendar = () => {
    const year = calendarMonth.getFullYear()
    const month = calendarMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = new Date().toISOString().split('T')[0]
    const predicted = calcPredictedNextStart()
    
    const cells = []
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="w-8 h-8" />)
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateStr(year, month, day)
      const isToday = dateStr === today
      const isSelected = dateStr === selectedPeriodDate
      const record = findRecordForDate(dateStr)
      const isPeriod = !!record
      const isPredicted = predicted === dateStr
      
      cells.push(
        <button
          key={day}
          type="button"
          onClick={() => setSelectedPeriodDate(dateStr)}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors
            ${isSelected ? 'ring-2 ring-pink-400' : ''}
            ${isPeriod ? 'bg-pink-400 text-white' : isPredicted ? 'bg-pink-100 text-pink-600' : isToday ? 'bg-gray-100' : 'hover:bg-gray-50'}
          `}
        >
          {day}
        </button>
      )
    }
    return cells
  }
  
  const handleSharePeriod = () => {
    const current = getCurrentPeriod()
    let periodInfo = ''
    
    if (current) {
      const daysPassed = Math.floor((Date.now() - new Date(current.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
      periodInfo = `我现在是经期第${daysPassed}天`
    } else {
      const records = getPeriodRecords()
      if (records.length > 0) {
        const lastRecord = records[records.length - 1]
        const lastStart = new Date(lastRecord.startDate)
        const nextStart = new Date(lastStart.getTime() + 28 * 24 * 60 * 60 * 1000)
        const daysUntil = Math.floor((nextStart.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        if (daysUntil > 0 && daysUntil <= 7) {
          periodInfo = `我的经期大概还有${daysUntil}天就要来了`
        } else if (daysUntil <= 0) {
          periodInfo = `我的经期可能快要来了`
        } else {
          periodInfo = `我分享了我的经期记录`
        }
      } else {
        periodInfo = `我分享了我的经期记录`
      }
    }
    
    addMessage({
      characterId: '',
      groupId: group.id,
      content: `经期记录已同步`,
      isUser: true,
      type: 'period',
      periodSummary: periodInfo,
    })
    updateGroup(group.id, { lastMessageAt: Date.now() })
    setActivePanel(null)
    setShowPlusMenu(false)
  }
  
  const handleStartDoudizhu = () => {
    if (doudizhuSelected.length !== 2) return
    const player1 = characters.find(c => c.id === doudizhuSelected[0])
    const player2 = characters.find(c => c.id === doudizhuSelected[1])
    if (!player1 || !player2) return
    
    // 关闭面板
    setDoudizhuSelected([])
    setActivePanel(null)
    setShowPlusMenu(false)
    
    // 跳转到斗地主界面，传递好友信息和群聊ID（用于战绩同步）
    navigate('/apps/doudizhu', { 
      state: { 
        mode: 'online', 
        friends: [
          { id: player1.id, name: player1.name, avatar: player1.avatar, position: 1 },
          { id: player2.id, name: player2.name, avatar: player2.avatar, position: 2 }
        ],
        fromGroupId: group.id  // 传递群聊ID，用于战绩同步
      } 
    })
  }
  
  const handleClearMessages = () => {
    const groupMsgIds = messages.map(m => m.id)
    deleteMessagesByIds(groupMsgIds)
    setShowClearConfirm(false)
  }
  
  const handleDeleteGroup = () => {
    deleteGroup(group.id)
    navigate('/apps/wechat')
  }
  
  const handleChangeAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    
    try {
      const compressed = await compressImageFileToDataUrl(file, { maxSide: 200, quality: 0.8 })
      updateGroup(group.id, { avatar: compressed })
    } catch (err) {
      console.error('头像压缩失败:', err)
    }
  }
  
  const handleChangeBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    
    try {
      const compressed = await compressImageFileToDataUrl(file, { maxSide: 1200, quality: 0.85 })
      updateGroup(group.id, { chatBackground: compressed })
    } catch (err) {
      console.error('背景压缩失败:', err)
    }
  }
  
  const handleSaveGroupName = () => {
    if (groupNameDraft.trim()) {
      updateGroup(group.id, { name: groupNameDraft.trim() })
    }
  }
  
  const handleAddMembers = () => {
    addMemberSelected.forEach(id => {
      addGroupMember(group.id, id)
    })
    setAddMemberSelected([])
    setShowAddMemberModal(false)
  }
  
  const handleRemoveMembers = () => {
    removeMemberSelected.forEach(id => {
      removeGroupMember(group.id, id)
    })
    setRemoveMemberSelected([])
    setShowRemoveMemberModal(false)
  }
  
  // 生成记忆摘要（参考私聊）
  const handleGenerateMemory = async () => {
    if (memoryGenerating) return
    setMemoryGenerating(true)
    
    try {
      if (!messages || messages.length === 0) {
        setInfoDialog({ open: true, title: '无法总结', message: '群聊里还没有可总结的消息。先聊几句再生成记忆吧。' })
        return
      }

      const history = buildHistoryForSummary(messages, summaryRoundsDraft)
      const prev = (memorySummaryDraft || '').trim()

      const mergeMemorySummary = (prevRaw: string, nextRaw: string) => {
        const prev = String(prevRaw || '').trim()
        const next = String(nextRaw || '').trim()
        if (!next) return prev
        if (!prev) return next
        if (prev === next) return prev
        if (prev.includes(next)) return prev
        if (next.includes(prev)) return next

        const prevLines = prev.split('\n').map(s => s.trim()).filter(Boolean)
        const nextLines = next.split('\n').map(s => s.trim()).filter(Boolean)
        const allPrevBullet = prevLines.length > 0 && prevLines.every(l => l.startsWith('-'))
        const allNextBullet = nextLines.length > 0 && nextLines.every(l => l.startsWith('-'))
        if (allPrevBullet && allNextBullet) {
          const set = new Set(prevLines)
          for (const l of nextLines) {
            if (!set.has(l)) prevLines.push(l)
          }
          return prevLines.join('\n')
        }

        const d = new Date()
        const pad2 = (n: number) => String(n).padStart(2, '0')
        const stamp = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
        return `${prev}\n\n—— 新增记忆总结（${stamp}）——\n${next}`
      }
      
      const prompt = `你是"群聊记忆整理器"。请把"最近群聊对话"总结为可长期使用的记忆条目，用中文，尽量精简但信息密度高。

要求：
- 输出为 8~20 条要点（短句），每条以"- "开头
- 记录：谁说了什么重要的话、群里发生了什么事、有什么共识或约定、成员之间的关系变化
- 不要编造，没有信息就不写
- 不要输出任何XML/标签/系统标记

【已有长期记忆（可为空）】
${prev || '（空）'}

【最近群聊对话】
${history}`

      const response = await callLLM([
        { role: 'system', content: '你只负责总结群聊内容，不聊天。' },
        { role: 'user', content: prompt }
      ], undefined, { maxTokens: 500 })
      
      const next = String(response || '').trim()
      if (!next) {
        setInfoDialog({ open: true, title: '总结失败', message: '这次没有生成出内容。你可以把“总结回合”调大一点，或先多聊几句再试。' })
        return
      }
      setMemorySummaryDraft(prevDraft => mergeMemorySummary(prevDraft, next))
    } catch (err) {
      console.error('生成记忆失败:', err)
      setInfoDialog({
        open: true,
        title: '总结失败',
        message:
          '可能原因：没有配置 API（Base URL / API Key / 模型）或网络异常。\n' +
          '请先到：手机主屏 → 设置App → API 配置，填写后再试。',
      })
    } finally {
      setMemoryGenerating(false)
    }
  }
  
  const handleSaveMemory = () => {
    const trimmed = String(memorySummaryDraft || '').trim()
    updateGroup(group.id, { memorySummary: trimmed })
    setMemorySummaryDraft(trimmed)
    setInfoDialog({ open: true, title: '已保存', message: '群聊长期记忆已保存。后续群聊回复会读取这段记忆。' })
  }
  
  const handleSaveTimeSync = () => {
    updateGroup(group.id, {
      timeSyncType: timeSyncTypeDraft,
      customTime: customTimeDraft,
    })
    setShowTimeSyncModal(false)
  }
  
  const handleSaveBubble = () => {
    const newSettings = {
      ...(group.bubbleSettings || {}),
      [bubbleEditingMember]: {
        bgColor: bubbleBgColor,
        bgOpacity: bubbleBgOpacity,
        borderColor: bubbleBorderColor,
        borderOpacity: bubbleBorderOpacity,
      }
    }
    updateGroup(group.id, { bubbleSettings: newSettings })
  }
  
  const getBubbleStyle = (isUser: boolean, senderId?: string) => {
    const memberId = isUser ? 'user' : senderId
    const settings = memberId ? group.bubbleSettings?.[memberId] : undefined
    const defaultBg = isUser ? '#95EC69' : '#FFFFFF'
    
    const bgColor = settings?.bgColor || defaultBg
    const bgOpacity = settings?.bgOpacity ?? 100
    const borderColor = settings?.borderColor || '#000000'
    const borderOpacity = settings?.borderOpacity ?? 0
    
    const bgRgba = hexToRgba(bgColor, bgOpacity / 100)
    const borderRgba = hexToRgba(borderColor, borderOpacity / 100)
    
    return {
      backgroundColor: bgRgba,
      border: borderOpacity > 0 ? `1px solid ${borderRgba}` : 'none',
    }
  }
  
  const renderMessageContent = (msg: typeof messages[number]) => {
    if (msg.type === 'image') {
      return <img src={msg.content} alt="" className="max-w-[200px] max-h-[200px] rounded-lg" />
    }
    if (msg.type === 'sticker') {
      return <img src={msg.content} alt="" className="w-24 h-24 object-contain" />
    }
    if (msg.type === 'location') {
      return (
        <div className="min-w-[160px] rounded-xl overflow-hidden bg-white border border-gray-100 shadow-sm">
          <div className="h-16 bg-gradient-to-br from-green-100 to-blue-50 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </div>
          <div className="px-2 py-1.5">
            <div className="text-xs font-medium text-gray-800 truncate">{msg.locationName}</div>
            {msg.locationAddress && <div className="text-[10px] text-gray-500 truncate">{msg.locationAddress}</div>}
          </div>
        </div>
      )
    }
    if (msg.type === 'period') {
      return (
        <div className="min-w-[190px] max-w-[240px] rounded-xl overflow-hidden border border-black/10 bg-white/80 shadow-sm">
          <div className="px-3 py-2 flex items-start gap-2">
            <div className="w-9 h-9 rounded-lg bg-pink-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-gray-800">经期记录</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{(msg as any).periodSummary || '已同步'}</div>
            </div>
          </div>
        </div>
      )
    }
    if (msg.type === 'doudizhu_share') {
      try {
        const data = JSON.parse(msg.content)
        const isWin = data.isWin
        return (
          <div className={`min-w-[150px] rounded-xl overflow-hidden ${isWin ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50 border border-gray-200'}`}>
            <div className="px-3 py-2">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-lg">🃏</span>
                <span className={`text-sm font-bold ${isWin ? 'text-yellow-600' : 'text-gray-600'}`}>
                  {isWin ? '胜利！' : '失败'}
                </span>
              </div>
              <div className="text-xs text-gray-600">对手：{data.opponents?.join('、')}</div>
              <div className={`text-xs mt-1 ${isWin ? 'text-green-600' : 'text-red-500'}`}>
                金币 {data.coinChange > 0 ? '+' : ''}{data.coinChange}
              </div>
            </div>
          </div>
        )
      } catch {
        return <span>{msg.content}</span>
      }
    }
    if (msg.type === 'pat') {
      return null
    }
    // 语音消息渲染
    if (msg.type === 'voice') {
      const duration = (msg as any).voiceDuration || 3
      const status = (() => {
        const explicit = (msg as any).voiceStatus
        if (explicit) return explicit
        if ((msg as any).voiceUrl === '') return 'error'
        return (msg as any).voiceUrl ? 'ready' : 'pending'
      })()
      const hasUrl = status === 'ready' && !!(msg as any).voiceUrl
      const isPlaying = playingVoiceId === msg.id
      const barWidth = Math.min(280, Math.max(140, 100 + duration * 6))
      return (
        <div className="min-w-[140px] max-w-[300px]">
          <button type="button"
            onClick={() => {
              if (hasUrl && (msg as any).voiceUrl) playGroupVoice(msg.id, (msg as any).voiceUrl)
              else if (status === 'error') {
                const raw = String((msg as any).voiceOriginalText || '').trim()
                if (!raw) { setInfoDialog({ open: true, title: '语音不可重试', message: '找不到原文内容。' }); return }
                void regenGroupVoice(msg.id, raw, msg.groupSenderId || '')
              }
            }}
            disabled={!hasUrl && status !== 'error'}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-transform active:scale-[0.98] bg-white text-gray-800 shadow-sm border border-gray-100 ${!hasUrl ? 'opacity-70' : ''}`}
            style={{ width: barWidth }}
          >
            {status !== 'ready' ? (
              status === 'error' ? (
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-red-50 border border-red-200">
                  <span className="text-red-600 text-[12px] font-bold">!</span>
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full border-2 border-current border-t-transparent animate-spin flex-shrink-0" />
              )
            ) : isPlaying ? (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100">
                <div className="flex items-center gap-0.5">
                  <div className="w-1 h-3 rounded-full bg-gray-600 animate-pulse" />
                  <div className="w-1 h-4 rounded-full bg-gray-600 animate-pulse" style={{ animationDelay: '0.1s' }} />
                  <div className="w-1 h-3 rounded-full bg-gray-600 animate-pulse" style={{ animationDelay: '0.2s' }} />
                </div>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-100">
                <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              </div>
            )}
            <div className="flex-1 flex items-center justify-center gap-1">
              {[...Array(Math.min(12, Math.max(5, Math.floor(duration / 1.5))))].map((_, i) => (
                <div key={i} className={`w-1 rounded-full transition-all bg-gray-300 ${isPlaying ? 'animate-pulse' : ''}`}
                  style={{ height: `${10 + Math.random() * 12}px`, animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
            <span className="text-sm font-medium flex-shrink-0 text-gray-500">{duration}"</span>
          </button>
          {status === 'error' && (
            <div className="mt-2 px-3 py-2 rounded-xl text-[12px] bg-red-50/80 border border-red-200 text-red-700 whitespace-pre-wrap">
              {String((msg as any).voiceError || '语音生成失败，点击可重试。')}
            </div>
          )}
          {(msg as any).voiceText && (
            <div className="mt-2 px-3 py-2 rounded-xl text-sm bg-white/90 border border-gray-200 text-gray-700">
              <div className="text-xs mb-1 text-gray-400">转文字</div>
              <div className="whitespace-pre-wrap break-words leading-relaxed">{(msg as any).voiceText}</div>
            </div>
          )}
        </div>
      )
    }
    return <span className="whitespace-pre-wrap break-words">{msg.content}</span>
  }
  
  const handlePat = (targetIsUser: boolean, targetMember?: typeof members[0]) => {
    if (group.patEnabled === false) return
    
    let patText: string
    if (targetIsUser) {
      patText = `${targetMember?.name || '群友'} 拍了拍 ${selectedPersona?.name || '我'}`
    } else {
      patText = `${selectedPersona?.name || '我'} 拍了拍 ${targetMember?.name || '群友'}`
    }
    
    addMessage({
      characterId: '',
      groupId: group.id,
      content: patText,
      isUser: false,
      type: 'pat',
      patText,
    })
  }
  
  const canForward = (msg: typeof messages[number]) => ['text', 'image', 'sticker'].includes(msg.type)
  
  // 获取引用的消息
  const replyingToMessage = replyingToMessageId ? messages.find(m => m.id === replyingToMessageId) : null
  
  return (
    <WeChatLayout>
      <div 
        className="flex h-full flex-col"
        style={{
          backgroundImage: group.chatBackground ? `url(${group.chatBackground})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-white/80 backdrop-blur-sm">
          {forwardMode ? (
            <>
              <button type="button" onClick={() => { setForwardMode(false); setForwardSelectedIds(new Set()) }} className="text-gray-500 text-sm">取消</button>
              <span className="font-semibold text-[#000]">选择要转发的消息</span>
              <button type="button" disabled={forwardSelectedIds.size === 0} onClick={() => setShowForwardTargetPicker(true)}
                className={`text-sm font-medium ${forwardSelectedIds.size > 0 ? 'text-green-500' : 'text-gray-300'}`}>
                转发({forwardSelectedIds.size})
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => navigate('/apps/wechat')}
                className="flex items-center gap-0.5 transition-opacity hover:opacity-70" style={{ color: fontColor.value }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-[13px] font-medium">返回</span>
              </button>
              <div className="flex flex-col items-center">
                <span className="font-semibold text-[#000]">{group.name}</span>
                <span className="text-[10px] text-gray-500">{members.length}人</span>
              </div>
              <button type="button" onClick={() => setShowSettings(true)} className="w-7 h-7 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#000]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                </svg>
              </button>
            </>
          )}
        </div>
        
        {/* 消息列表 */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8 bg-white/50 rounded-xl">暂无消息，开始聊天吧</div>
          ) : (
            messages.map(msg => {
              const sender = msg.isUser ? null : characters.find(c => c.id === msg.groupSenderId)
              const senderDisplayName = msg.isUser ? (selectedPersona?.name || '我') : getNameInGroup(msg.groupSenderId || '')
              const isForwardSelected = forwardSelectedIds.has(msg.id)
              const bubbleStyle = getBubbleStyle(msg.isUser, msg.groupSenderId)
              
              if (msg.type === 'pat') {
                return (
                  <div key={msg.id} className="text-center py-2">
                    <span className="text-xs text-gray-400 bg-black/5 px-3 py-1 rounded-full">{msg.content}</span>
                  </div>
                )
              }
              
              return (
                <div key={msg.id} className={`flex gap-2 mb-3 ${msg.isUser ? 'flex-row-reverse' : ''}`}>
                  {forwardMode && canForward(msg) && (
                    <button type="button" onClick={() => {
                      setForwardSelectedIds(prev => {
                        const next = new Set(prev)
                        if (next.has(msg.id)) next.delete(msg.id)
                        else next.add(msg.id)
                        return next
                      })
                    }} className="flex items-center self-center">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isForwardSelected ? 'border-green-500 bg-green-500' : 'border-gray-400 bg-white/70'}`}>
                        {isForwardSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                    </button>
                  )}
                  
                  <button type="button" onClick={() => {
                    if (msg.isUser) {
                      if (group.patEnabled !== false && members.length > 0) {
                        const randomMember = members[Math.floor(Math.random() * members.length)]
                        handlePat(true, randomMember)
                      }
                    } else {
                      handlePat(false, sender || undefined)
                    }
                  }} className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 cursor-pointer active:scale-95 transition-transform">
                    {msg.isUser ? (
                      selectedPersona?.avatar ? <img src={selectedPersona.avatar} alt="" className="w-full h-full object-cover" /> :
                      <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm">{(selectedPersona?.name || '我')[0]}</div>
                    ) : sender?.avatar ? <img src={sender.avatar} alt="" className="w-full h-full object-cover" /> :
                      <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm">{senderDisplayName?.[0] || '?'}</div>
                    }
                  </button>
                  
                  <div className={`flex flex-col max-w-[70%] ${msg.isUser ? 'items-end' : 'items-start'}`}>
                    {!msg.isUser && sender && <span className="text-xs text-gray-500 mb-1">{senderDisplayName}</span>}
                    
                    {/* 引用显示 */}
                    {msg.replyToMessageId && (() => {
                      const replyTo = messages.find(m => m.id === msg.replyToMessageId)
                      if (!replyTo) return null
                      const replyToSender = replyTo.isUser ? (selectedPersona?.name || '我') : getNameInGroup(replyTo.groupSenderId || '')
                      return (
                        <div className="text-[10px] text-gray-400 mb-1 px-2 py-1 bg-black/5 rounded max-w-full truncate">
                          引用 {replyToSender}: {replyTo.content?.slice(0, 30)}...
                        </div>
                      )
                    })()}
                    
                    <div className={`px-3 py-2 rounded-2xl text-sm ${
                      msg.type === 'image' || msg.type === 'sticker' || msg.type === 'location' || msg.type === 'period' || msg.type === 'doudizhu_share' || msg.type === 'voice'
                        ? 'p-0 bg-transparent' : msg.isUser ? 'text-gray-800 rounded-tr-md' : 'text-gray-800 rounded-tl-md shadow-sm'
                    }`} style={msg.type === 'image' || msg.type === 'sticker' || msg.type === 'location' || msg.type === 'period' || msg.type === 'doudizhu_share' || msg.type === 'voice' ? undefined : bubbleStyle}>
                      {editingMessageId === msg.id ? (
                        <div className="flex flex-col gap-1">
                          <textarea value={editingContent} onChange={(e) => setEditingContent(e.target.value)}
                            className="px-2 py-1 rounded bg-white/80 text-sm outline-none resize-none min-w-[150px]" rows={2} />
                          <div className="flex gap-1">
                            <button type="button" onClick={() => { updateMessage(msg.id, { content: editingContent }); setEditingMessageId(null) }}
                              className="px-2 py-0.5 rounded bg-green-500 text-white text-[10px]">保存</button>
                            <button type="button" onClick={() => setEditingMessageId(null)}
                              className="px-2 py-0.5 rounded bg-gray-300 text-gray-700 text-[10px]">取消</button>
                          </div>
                        </div>
                      ) : renderMessageContent(msg)}
                    </div>

                    {/* 群聊翻译（伪翻译）展示：与私聊一致 */}
                    {msg.type === 'text' && (msg as any).chatTranslationEnabledAtSend && (msg as any).messageLanguage && (msg as any).messageLanguage !== 'zh' && (
                      <div className={`mt-1 max-w-full ${msg.isUser ? 'text-right' : 'text-left'}`}>
                        {(msg as any).translationStatus === 'done' && (msg as any).translatedZh ? (
                          <div className="inline-block px-2 py-1 rounded-lg bg-black/5 text-[12px] text-gray-700 whitespace-pre-wrap break-words">
                            {(msg as any).translatedZh}
                          </div>
                        ) : (
                          <div className="inline-block px-2 py-1 rounded-lg bg-black/5 text-[12px] text-gray-500">
                            {String((msg as any).translationStatus) === 'error' ? '（未生成翻译）' : '（翻译中…）'}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* 时间戳和操作按钮 */}
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="inline-block px-2 py-[2px] rounded-md bg-white/85 border border-white/60 text-[10px] text-gray-600">
                        {formatTime(msg.timestamp)}
                      </span>
                      
                      {(msg.type === 'text' || msg.type === 'voice' || msg.type === 'image') && !forwardMode && !editingMessageId && (
                        <>
                          {!msg.isUser && msg.type === 'text' && (
                            <button type="button" onClick={() => { setEditingMessageId(msg.id); setEditingContent(msg.content) }}
                              className="px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:bg-gray-100 active:opacity-70">编辑</button>
                          )}
                          {!msg.isUser && msg.type === 'text' && (
                            <button type="button" onClick={() => setReplyingToMessageId(msg.id)}
                              className="px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:bg-gray-100 active:opacity-70">引用</button>
                          )}
                          <button type="button" onClick={() => { if (confirm('确定删除这条消息吗？')) deleteMessage(msg.id) }}
                            className="px-1.5 py-0.5 rounded text-[10px] text-red-400 hover:bg-red-50 active:opacity-70">删除</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          
          {aiTyping && (
            <div className="flex gap-2 mb-3">
              <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center"><span className="text-sm">💭</span></div>
              <div className="px-3 py-2 rounded-2xl bg-white text-gray-500 text-sm shadow-sm">正在输入...</div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* 引用显示 */}
        {replyingToMessage && (
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-500 mb-1">引用 {replyingToMessage.isUser ? (selectedPersona?.name || '我') : getNameInGroup(replyingToMessage.groupSenderId || '')}</div>
              <div className="text-sm text-gray-700 truncate">{replyingToMessage.content}</div>
            </div>
            <button type="button" onClick={() => setReplyingToMessageId(null)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        
        {/* 输入框区域 - 参考私聊布局 */}
        <div className="px-3 py-2 bg-white/90 border-t border-gray-200/40">
          <div className="flex items-center gap-2">
            {/* +号按钮 */}
            <button type="button" onClick={() => { setShowPlusMenu(!showPlusMenu); setShowStickerPanel(false); setActivePanel(null); setShowGenerateSelector(false) }}
              className="w-7 h-7 rounded-full border-2 border-gray-400 flex items-center justify-center transition-transform active:scale-90 flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            
            {/* 表情按钮 */}
            <button type="button" onClick={() => { setShowStickerPanel(!showStickerPanel); setShowPlusMenu(false); setShowGenerateSelector(false) }}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform active:scale-90 flex-shrink-0 ${showStickerPanel ? 'bg-green-100' : ''}`}>
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
              </svg>
            </button>
            
            <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              onFocus={() => { setShowPlusMenu(false); setShowStickerPanel(false); setShowGenerateSelector(false) }}
              placeholder="输入消息..." className="flex-1 min-w-0 px-3 py-1.5 rounded-full bg-white/90 outline-none text-gray-800 text-sm" disabled={aiTyping} />
            
            {/* 生成按钮 */}
            <div className="relative flex-shrink-0">
              <button type="button" onClick={() => {
                if (showGenerateSelector) {
                  generateReplies(generateSelectedMembers.length > 0 ? generateSelectedMembers : undefined)
                } else {
                  setShowGenerateSelector(true); setShowPlusMenu(false); setShowStickerPanel(false)
                }
              }} disabled={aiTyping}
                className={`w-7 h-7 rounded-full flex items-center justify-center shadow-sm transition-all flex-shrink-0 ${aiTyping ? 'opacity-50' : 'active:scale-90'} bg-gradient-to-r from-green-400 to-green-500`}
                title="生成群成员回复">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" />
                </svg>
              </button>
              
              {showGenerateSelector && (
                <div className="absolute bottom-full right-0 mb-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
                  <div className="px-3 py-2 border-b border-gray-100 text-xs text-gray-500">选择回复成员（不选=随机）</div>
                  <div className="max-h-48 overflow-y-auto p-2">
                    {members.map(m => {
                      const isSelected = generateSelectedMembers.includes(m.id)
                      return (
                        <button key={m.id} type="button" onClick={() => {
                          if (isSelected) setGenerateSelectedMembers(prev => prev.filter(id => id !== m.id))
                          else setGenerateSelectedMembers(prev => [...prev, m.id])
                        }} className="w-full flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                            {isSelected && <span className="text-white text-[10px]">✓</span>}
                          </div>
                          <div className="w-6 h-6 rounded overflow-hidden bg-gray-200">
                            {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> :
                              <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-[10px]">{m.name[0]}</div>}
                          </div>
                          <span className="text-xs text-gray-700 truncate">{m.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="px-2 py-2 border-t border-gray-100 flex gap-2">
                    <button type="button" onClick={() => { setShowGenerateSelector(false); setGenerateSelectedMembers([]) }}
                      className="flex-1 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs">取消</button>
                    <button type="button" onClick={() => generateReplies(generateSelectedMembers.length > 0 ? generateSelectedMembers : undefined)}
                      className="flex-1 py-1.5 rounded-lg bg-green-500 text-white text-xs font-medium">
                      {generateSelectedMembers.length > 0 ? `生成 ${generateSelectedMembers.length} 人` : '随机生成'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <button type="button" onClick={handleSend} disabled={!inputText.trim() || aiTyping}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex-shrink-0 ${inputText.trim() && !aiTyping ? 'bg-gradient-to-r from-green-400 to-green-500 text-white shadow-sm' : 'bg-gray-200 text-gray-400'}`}>
              发送
            </button>
          </div>
          
          {/* +号菜单 */}
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
                    <span className="text-xs text-gray-600">图片</span>
                  </button>
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleSendImage} />
                  
                  <button type="button" onClick={() => setActivePanel('location')} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">位置</span>
                  </button>
                  
                  <button type="button" onClick={() => setActivePanel('period')} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">经期</span>
                  </button>
                  
                  <button type="button" onClick={() => { setActivePanel('doudizhu'); setDoudizhuSelected([]) }} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm"><span className="text-2xl">🃏</span></div>
                    <span className="text-xs text-gray-600">斗地主</span>
                  </button>
                  
                  <button type="button" onClick={() => { setShowPlusMenu(false); setForwardMode(true); setForwardSelectedIds(new Set()) }} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">转发</span>
                  </button>
                  
                  <button type="button" onClick={() => { setShowPlusMenu(false); setShowClearConfirm(true) }} className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-xl bg-white/60 flex items-center justify-center shadow-sm">
                      <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-600">清空</span>
                  </button>
                </div>
              ) : activePanel === 'location' ? (
                <div className="bg-white/80 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={() => setActivePanel(null)} className="text-gray-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <span className="font-medium text-gray-800">分享位置</span>
                    <div className="w-5" />
                  </div>
                  <input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="位置名称" className="w-full px-3 py-2 rounded-lg bg-gray-100 text-sm outline-none mb-2" />
                  <input type="text" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} placeholder="详细地址（可选）" className="w-full px-3 py-2 rounded-lg bg-gray-100 text-sm outline-none mb-2" />
                  <input type="text" value={locationCity} onChange={(e) => setLocationCity(e.target.value)} placeholder="城市（可选）" className="w-full px-3 py-2 rounded-lg bg-gray-100 text-sm outline-none mb-3" />
                  <button type="button" onClick={handleSendLocation} disabled={!locationName.trim()}
                    className={`w-full py-2 rounded-lg text-sm font-medium ${locationName.trim() ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>发送位置</button>
                </div>
              ) : activePanel === 'period' ? (
                <div className="bg-white/90 rounded-xl p-3 max-h-[62vh] overflow-hidden flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <button type="button" onClick={() => setActivePanel(null)} className="text-gray-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <span className="font-medium text-gray-800">经期记录</span>
                    <div className="w-5" />
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))} className="p-1">
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <span className="text-sm font-medium text-gray-700">{calendarMonth.getFullYear()}年{calendarMonth.getMonth() + 1}月</span>
                    <button type="button" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))} className="p-1">
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {['日', '一', '二', '三', '四', '五', '六'].map(day => <div key={day} className="w-8 h-6 flex items-center justify-center text-xs text-gray-400">{day}</div>)}
                  </div>
                  <div className="flex-1 overflow-y-auto pr-0.5">
                    <div className="grid grid-cols-7 gap-1">{renderCalendar()}</div>
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="text-[13px] font-medium text-gray-800">已选：{selectedPeriodDate}</div>
                        <div className="text-[11px] text-gray-400">预计下次：{calcPredictedNextStart() || '—'}</div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => {
                          const exists = periodRecords.some(r => r.startDate === selectedPeriodDate)
                          if (!exists) addPeriodRecord({ startDate: selectedPeriodDate, notes: '', symptoms: [], daily: [] })
                          setInfoDialog({ open: true, title: '已保存', message: `已设置 ${selectedPeriodDate} 为本次开始日` })
                        }} className="flex-1 py-2 rounded-lg bg-pink-500 text-white text-sm font-medium">设为开始日</button>
                        <button type="button" onClick={() => {
                          const target = findRecordForDate(selectedPeriodDate) || periodRecords[0]
                          if (!target) { setInfoDialog({ open: true, title: '还没开始日', message: '请先设置开始日。' }); return }
                          if (selectedPeriodDate < target.startDate) { setInfoDialog({ open: true, title: '不能早于开始日', message: `结束日不能早于开始日 ${target.startDate}` }); return }
                          updatePeriodRecord(target.id, { endDate: selectedPeriodDate })
                          setInfoDialog({ open: true, title: '已保存', message: `已设置 ${selectedPeriodDate} 为本次结束日` })
                        }} className="flex-1 py-2 rounded-lg bg-pink-100 text-pink-600 text-sm font-medium">设为结束日</button>
                      </div>
                      {findRecordForDate(selectedPeriodDate) && (
                        <div className="mt-3 space-y-2">
                          <div className="text-xs text-gray-500">今日状态（{selectedPeriodDate}）</div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-12">疼痛：</span>
                            {[0, 1, 2, 3, 4].map(level => (
                              <button key={level} type="button" onClick={() => setPeriodPainDraft(level as any)}
                                className={`w-7 h-7 rounded-full text-xs ${periodPainDraft === level ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                {['无', '轻', '中', '重', '爆'][level]}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-12">血量：</span>
                            {(['none', 'light', 'medium', 'heavy'] as const).map(level => (
                              <button key={level} type="button" onClick={() => setPeriodFlowDraft(level)}
                                className={`px-2 py-1 rounded text-xs ${periodFlowDraft === level ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                {level === 'none' ? '无' : level === 'light' ? '少' : level === 'medium' ? '中' : '多'}
                              </button>
                            ))}
                          </div>
                          <input type="text" value={periodNoteDraft} onChange={(e) => setPeriodNoteDraft(e.target.value)} placeholder="备注（可选）" className="w-full px-2 py-1.5 rounded bg-gray-50 text-xs outline-none" />
                          <button type="button" onClick={() => {
                            const target = findRecordForDate(selectedPeriodDate)
                            if (!target) return
                            const daily = target.daily || []
                            const idx = daily.findIndex((e: any) => e?.date === selectedPeriodDate)
                            const entry = { date: selectedPeriodDate, pain: periodPainDraft, flow: periodFlowDraft, note: periodNoteDraft, updatedAt: Date.now() }
                            if (idx >= 0) daily[idx] = entry; else daily.push(entry)
                            updatePeriodRecord(target.id, { daily })
                            setInfoDialog({ open: true, title: '已保存', message: `${selectedPeriodDate} 状态已记录` })
                          }} className="w-full py-1.5 rounded bg-pink-100 text-pink-600 text-xs font-medium">保存今日状态</button>
                        </div>
                      )}
                      <button type="button" onClick={handleSharePeriod} className="w-full mt-3 py-2 rounded-lg bg-green-500 text-white text-sm font-medium">分享经期状态到群</button>
                    </div>
                  </div>
                </div>
              ) : activePanel === 'doudizhu' ? (
                <div className="bg-white/80 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <button type="button" onClick={() => setActivePanel(null)} className="text-gray-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <span className="font-medium text-gray-800">选择2个玩家</span>
                    <div className="w-5" />
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
                    {members.map(m => {
                      const isSelected = doudizhuSelected.includes(m.id)
                      const canSelect = isSelected || doudizhuSelected.length < 2
                      return (
                        <button key={m.id} type="button" disabled={!canSelect} onClick={() => {
                          if (isSelected) setDoudizhuSelected(prev => prev.filter(id => id !== m.id))
                          else if (doudizhuSelected.length < 2) setDoudizhuSelected(prev => [...prev, m.id])
                        }} className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${isSelected ? 'bg-yellow-100 border border-yellow-300' : canSelect ? 'hover:bg-gray-50' : 'opacity-50'}`}>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-yellow-500 bg-yellow-500' : 'border-gray-300'}`}>
                            {isSelected && <span className="text-white text-[10px]">✓</span>}
                          </div>
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-200">
                            {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> :
                              <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-xs">{m.name[0]}</div>}
                          </div>
                          <span className="text-sm text-gray-800">{m.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  <button type="button" onClick={handleStartDoudizhu} disabled={doudizhuSelected.length !== 2}
                    className={`w-full py-2 rounded-lg text-sm font-medium ${doudizhuSelected.length === 2 ? 'bg-yellow-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                    开始斗地主 ({doudizhuSelected.length}/2)
                  </button>
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
                  <button type="button" onClick={() => setStickerTab('recent')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${stickerTab === 'recent' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    最近
                  </button>
                  {stickerCategoryList.map(cat => (
                    <button key={cat} type="button" onClick={() => setStickerTab(cat)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${stickerTab === cat ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {cat}
                    </button>
                  ))}
                  <button type="button" onClick={() => { setShowStickerPanel(false); navigate('/apps/settings/stickers') }}
                    className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 bg-gray-100 text-gray-500">
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
                          <button type="button" onClick={() => { setShowStickerPanel(false); navigate('/apps/settings/stickers') }}
                            className="mt-2 px-3 py-1.5 rounded-full bg-green-500 text-white text-xs">去添加表情</button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {currentTabStickers.map(sticker => (
                        <button key={sticker.id || sticker.url} type="button" onClick={() => handleSendSticker(sticker)}
                          className="aspect-square rounded-xl overflow-hidden bg-gray-50 hover:bg-gray-100 active:scale-95 transition-transform">
                          <img src={sticker.url} alt={sticker.keyword || '表情'} className="w-full h-full object-cover" />
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
      
      {/* ========== 群设置弹窗 ========== */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[340px] bg-white rounded-2xl shadow-xl max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <button type="button" onClick={() => setShowSettings(false)} className="text-gray-500 text-sm">关闭</button>
              <span className="font-semibold">群聊设置</span>
              <div className="w-10" />
            </div>
            
            <div className="flex border-b border-gray-100 flex-shrink-0">
              {[{ key: 'info', label: '基本' }, { key: 'relations', label: '关系' }, { key: 'chat', label: '聊天' }, { key: 'bubble', label: '气泡' }].map(tab => (
                <button key={tab.key} type="button" onClick={() => setSettingsTab(tab.key as any)}
                  className={`flex-1 py-2 text-xs ${settingsTab === tab.key ? 'text-green-500 border-b-2 border-green-500' : 'text-gray-500'}`}>{tab.label}</button>
              ))}
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {settingsTab === 'info' && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <button type="button" onClick={() => avatarInputRef.current?.click()} className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 flex items-center justify-center">
                      {group.avatar ? <img src={group.avatar} alt="" className="w-full h-full object-cover" /> :
                        <div className="w-full h-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center"><span className="text-white text-2xl">{group.name[0]}</span></div>}
                    </button>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleChangeAvatar} />
                    <div className="text-sm text-gray-500">点击更换群头像</div>
                  </div>
                  
                  <div className="mb-4">
                    <div className="text-sm text-gray-600 mb-2">群名称</div>
                    <input type="text" value={groupNameDraft} onChange={(e) => setGroupNameDraft(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-100 text-sm outline-none mb-2" placeholder="输入群名称" />
                    <button type="button" onClick={handleSaveGroupName} className="w-full py-2 rounded-lg bg-green-500 text-white text-sm font-medium">保存群名称</button>
                  </div>
                  
                  {/* 群成员 + 添加/移除按钮（包含自己） */}
                  <div className="mb-4">
                    <div className="text-sm text-gray-600 mb-2">群成员 ({members.length + 1}人)</div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {/* 自己（群主）放第一位 */}
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 ring-2 ring-green-400 ring-offset-1">
                          {selectedPersona?.avatar ? <img src={selectedPersona.avatar} alt="" className="w-full h-full object-cover" /> :
                            <div className="w-full h-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs">{(selectedPersona?.name || '我')[0]}</div>}
                        </div>
                        <span className="text-[10px] text-green-600 mt-1 truncate max-w-[40px] font-medium">{selectedPersona?.name || '我'}</span>
                      </div>
                      {/* 其他成员 - 显示所有成员 */}
                      {members.map(m => (
                        <div key={m.id} className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200">
                            {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> :
                              <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-xs">{m.name[0]}</div>}
                          </div>
                      <span className="text-[10px] text-gray-500 mt-1 truncate max-w-[40px]">{getNameInGroup(m.id)}</span>
                        </div>
                      ))}
                      {/* + 按钮 */}
                      <button type="button" onClick={() => { setAddMemberSelected([]); setShowAddMemberModal(true) }}
                        className="w-10 h-10 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-green-400 hover:text-green-500">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      </button>
                      {/* - 按钮 */}
                      {members.length > 2 && (
                        <button type="button" onClick={() => { setRemoveMemberSelected([]); setShowRemoveMemberModal(true) }}
                          className="w-10 h-10 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-red-400 hover:text-red-500">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" /></svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 群备注 */}
                  <div className="mb-4">
                    <div className="text-sm text-gray-600 mb-2">群备注</div>
                    <div className="text-xs text-gray-400 mb-2">仅本群生效；成员与 AI 都会读取群备注名</div>
                    <div className="space-y-2">
                      {members.map((m) => (
                        <div key={m.id} className="rounded-xl bg-gray-50 p-2">
                          <div className="text-[11px] text-gray-500 mb-1">原名：{m.name}</div>
                          <div className="flex items-center gap-2">
                            <input
                              value={memberRemarkDrafts[m.id] ?? ''}
                              onChange={(e) => {
                                const v = e.target.value
                                setMemberRemarkDrafts((prev) => ({ ...prev, [m.id]: v }))
                              }}
                              placeholder="输入群备注（留空=使用原名）"
                              className="flex-1 px-3 py-2 rounded-lg bg-white border border-black/10 text-[12px] text-gray-900 outline-none"
                              maxLength={24}
                            />
                            <button
                              type="button"
                              onClick={() => setMemberRemarkDrafts((prev) => ({ ...prev, [m.id]: '' }))}
                              className="px-2.5 py-2 rounded-lg bg-white border border-black/10 text-[12px] text-gray-600"
                            >
                              清空
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const obj: Record<string, string> = {}
                        for (const [id, name] of Object.entries(memberRemarkDrafts || {})) {
                          const v = String(name || '').trim()
                          if (v) obj[id] = v
                        }
                        updateGroup(group.id, { memberRemarks: Object.keys(obj).length ? obj : undefined })
                      }}
                      className="mt-2 w-full py-2 rounded-lg bg-gray-900 text-white text-sm font-medium"
                    >
                      保存群备注
                    </button>
                  </div>
                  
                  <button type="button" onClick={() => { setShowSettings(false); setShowDeleteConfirm(true) }}
                    className="w-full py-2 rounded-lg bg-red-50 text-red-500 text-sm font-medium">解散群聊</button>
                </>
              )}
              
              {settingsTab === 'chat' && (
                <>
                  <div className="mb-4">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-800">聊天背景</span>
                      <button type="button" onClick={() => bgInputRef.current?.click()} className="text-sm text-green-500">更换</button>
                    </div>
                    <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleChangeBg} />
                    {group.chatBackground && <button type="button" onClick={() => updateGroup(group.id, { chatBackground: undefined })} className="text-sm text-red-500">清除背景</button>}
                  </div>

                  {/* 绑定世界书 */}
                  <div className="py-3 border-t border-gray-100">
                    <div className="text-sm text-gray-800 mb-1">绑定世界书</div>
                    <div className="text-xs text-gray-400 mb-2">来自「创作工坊 → 世界书」，会额外注入到群聊 AI 提示词</div>
                    <select
                      value={group.lorebookId || ''}
                      onChange={(e) => {
                        const v = e.target.value || ''
                        if (!v) {
                          // 解绑：直接生效
                          updateGroup(group.id, { lorebookId: undefined })
                          return
                        }
                        // 绑定：弹提示确认（避免用户没意识到覆盖优先级）
                        setPendingLorebookId(v)
                        setLorebookBindDialogOpen(true)
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-gray-100 text-sm outline-none"
                    >
                      <option value="">不绑定</option>
                      {lorebooks.map(lb => (
                        <option key={lb.id} value={lb.id}>
                          {lb.isGlobal ? `🌍 ${lb.name}` : `📚 ${lb.name}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* 记忆功能（可折叠） */}
                  <div className="border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => {
                        setMemoryExpanded(prev => {
                          const next = !prev
                          // 展开时：如果草稿为空但群里有已保存记忆，则自动回填
                          if (
                            next &&
                            !String(memorySummaryDraft || '').trim() &&
                            String(group.memorySummary || '').trim()
                          ) {
                            setMemorySummaryDraft(group.memorySummary || '')
                          }
                          return next
                        })
                      }}
                      className="w-full flex items-center justify-between py-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="text-sm text-gray-800">记忆功能</div>
                          <div className="text-xs text-gray-400">AI 会记住重要对话</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          role="switch"
                          aria-checked={!!group.memoryEnabled}
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); updateGroup(group.id, { memoryEnabled: !group.memoryEnabled }) }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              e.stopPropagation()
                              updateGroup(group.id, { memoryEnabled: !group.memoryEnabled })
                            }
                          }}
                          className={`w-12 h-7 rounded-full transition-colors cursor-pointer ${group.memoryEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                          <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${group.memoryEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </div>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform ${memoryExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                    
                    {/* 折叠内容 */}
                    {memoryExpanded && group.memoryEnabled && (
                      <div className="px-0 pb-3 space-y-3">
                        {/* 对话统计（回合/Token） */}
                        <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
                          <div className="px-4 py-3 flex items-center justify-between">
                            <span className="text-sm text-gray-800 font-medium">当前对话回合数</span>
                            <span className="text-sm text-gray-800">{currentRounds} 回合</span>
                          </div>
                          <div className="h-px bg-gray-100" />
                          <div className="px-4 py-3 flex items-center justify-between">
                            <span className="text-sm text-gray-800 font-medium">预估上下文 Token</span>
                            <span className="text-sm text-gray-800">{estimatedContextTokens} Tokens</span>
                          </div>
                          <div className="h-px bg-gray-100" />
                          <div className="px-4 py-3 flex items-center justify-between">
                            <span className="text-sm text-gray-800 font-medium">已有总结 Token</span>
                            <span className="text-sm text-gray-800">{memorySummaryTokens} Tokens</span>
                          </div>
                          <div className="h-px bg-gray-100" />
                          <div className="px-4 py-3 flex items-center justify-between">
                            <span className="text-sm text-gray-800 font-medium">读取当前群聊总上下文 Token</span>
                            <span className="text-sm text-gray-800">{estimatedContextTokens + memorySummaryTokens} Tokens</span>
                          </div>
                          <div className="px-4 pb-3 text-[11px] text-gray-400">
                            说明：总上下文=预估上下文+记忆总结。该统计不包含：系统提示词、创作工坊预设、世界书注入、工具/识图等额外提示，也不包含模型输出Token。
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded-xl p-3">
                          <div className="text-xs text-gray-500 mb-2">把最近N回合对话总结成长期记忆</div>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-gray-500 flex-shrink-0">总结</span>
                            <input type="number" min={1} max={500} value={summaryRoundsDraft}
                              onChange={(e) => setSummaryRoundsDraft(parseInt(e.target.value || '0', 10))}
                              className="w-16 px-2 py-1 rounded bg-white border border-gray-200 outline-none text-xs text-center" />
                            <span className="text-xs text-gray-500">回合</span>
                            <button type="button" disabled={memoryGenerating} onClick={handleGenerateMemory}
                              className="px-2 py-1 rounded bg-green-500 text-white text-xs disabled:opacity-50">
                              {memoryGenerating ? '生成中…' : '生成'}
                            </button>
                          </div>
                          <textarea value={memorySummaryDraft} onChange={(e) => setMemorySummaryDraft(e.target.value)} rows={4}
                            className="w-full px-2 py-1.5 rounded bg-white border border-gray-200 outline-none text-xs resize-none" placeholder="长期记忆摘要…" />
                          <button type="button" onClick={handleSaveMemory} className="w-full mt-2 py-1.5 rounded bg-green-500 text-white text-xs font-medium">保存记忆</button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* 时间同步 */}
                  <div className="flex items-center justify-between py-3 border-t border-gray-100">
                    <div>
                      <div className="text-sm text-gray-800">时间同步</div>
                      <div className="text-xs text-gray-400">AI 知道当前时间</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateGroup(group.id, { timeSyncEnabled: !group.timeSyncEnabled })}
                        className={`w-12 h-7 rounded-full transition-colors ${group.timeSyncEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                        <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${group.timeSyncEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                      {group.timeSyncEnabled && <button type="button" onClick={() => setShowTimeSyncModal(true)} className="text-xs text-green-500">设置</button>}
                    </div>
                  </div>
                  
                  {/* 拍一拍 */}
                  <div className="flex items-center justify-between py-3 border-t border-gray-100">
                    <div>
                      <div className="text-sm text-gray-800">拍一拍</div>
                      <div className="text-xs text-gray-400">点击头像触发</div>
                    </div>
                    <button type="button" onClick={() => updateGroup(group.id, { patEnabled: group.patEnabled === false ? true : false })}
                      className={`w-12 h-7 rounded-full transition-colors ${group.patEnabled !== false ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${group.patEnabled !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* 语音设置 */}
                  <div className="border-t border-gray-100">
                    <div className="flex items-center justify-between py-3">
                      <div>
                        <div className="text-sm text-gray-800">语音消息</div>
                        <div className="text-xs text-gray-400">AI 回复时随机发语音</div>
                      </div>
                      <button type="button" onClick={() => updateGroup(group.id, { voiceEnabled: !group.voiceEnabled })}
                        className={`w-12 h-7 rounded-full transition-colors ${group.voiceEnabled ? 'bg-green-500' : 'bg-gray-300'}`}>
                        <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${group.voiceEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {group.voiceEnabled && (
                      <div className="pb-3 space-y-3">
                        {!ttsConfig.enabled && (
                          <div className="px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200 text-xs text-yellow-700">
                            请先在「设置 → API配置 → 语音配置」中启用语音并填写 API Key
                          </div>
                        )}
                        <div>
                          <div className="text-xs text-gray-500 mb-1">发语音频率</div>
                          <select value={group.voiceFrequency || 'sometimes'}
                            onChange={e => updateGroup(group.id, { voiceFrequency: e.target.value as any })}
                            className="w-full px-3 py-2 rounded-lg bg-gray-100 text-sm outline-none">
                            <option value="always">总是 (100%)</option>
                            <option value="often">经常 (50%)</option>
                            <option value="sometimes">偶尔 (20%)</option>
                            <option value="rarely">很少 (5%)</option>
                          </select>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-2">成员语音设置</div>
                          <div className="text-xs text-gray-400 mb-2">默认使用各成员私聊中绑定的语音，也可单独覆盖</div>
                          <div className="space-y-2">
                            {members.map(m => {
                              const memberVoiceId = group.memberVoiceSettings?.[m.id]?.voiceId || ''
                              const privateVoiceId = m.voiceId || ''
                              return (
                                <div key={m.id} className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                                    {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> :
                                      <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-[10px]">{m.name[0]}</div>}
                                  </div>
                                  <span className="text-xs text-gray-700 min-w-[40px] truncate">{m.name}</span>
                                  <select value={memberVoiceId}
                                    onChange={e => {
                                      const v = e.target.value
                                      const prev = group.memberVoiceSettings || {}
                                      if (!v) {
                                        const { [m.id]: _, ...rest } = prev
                                        updateGroup(group.id, { memberVoiceSettings: Object.keys(rest).length ? rest : undefined })
                                      } else {
                                        updateGroup(group.id, { memberVoiceSettings: { ...prev, [m.id]: { voiceId: v } } })
                                      }
                                    }}
                                    className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-gray-100 text-xs outline-none">
                                    <option value="">{privateVoiceId ? `默认（私聊: ${privateVoiceId}）` : '未设置语音'}</option>
                                    <option value="female-shaonv">少女 - 温柔甜美</option>
                                    <option value="female-yujie">御姐 - 成熟知性</option>
                                    <option value="female-chengshu">成熟女性 - 稳重大方</option>
                                    <option value="female-tianmei">甜美 - 可爱甜蜜</option>
                                    <option value="male-qn-qingse">青涩青年 - 年轻活力</option>
                                    <option value="male-qn-jingying">精英青年 - 自信干练</option>
                                    <option value="male-qn-badao">霸道青年 - 强势霸气</option>
                                    <option value="presenter_male">男主持 - 专业播音</option>
                                    <option value="presenter_female">女主持 - 专业播音</option>
                                    <option value="audiobook_male_1">有声书男1</option>
                                    <option value="audiobook_female_1">有声书女1</option>
                                    {ttsConfig.customVoices?.map(cv => (
                                      <option key={cv.id} value={cv.id}>🎙 {cv.name}{cv.desc ? ` - ${cv.desc}` : ''}</option>
                                    ))}
                                  </select>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
              
              {settingsTab === 'bubble' && (
                <>
                  <div className="text-sm text-gray-600 mb-3">选择要设置气泡的成员：</div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <button type="button" onClick={() => setBubbleEditingMember('user')}
                      className={`px-3 py-1.5 rounded-full text-xs ${bubbleEditingMember === 'user' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}`}>我</button>
                    {members.map(m => (
                      <button key={m.id} type="button" onClick={() => setBubbleEditingMember(m.id)}
                        className={`px-3 py-1.5 rounded-full text-xs ${bubbleEditingMember === m.id ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{m.name}</button>
                    ))}
                  </div>
                  <div className="mb-4 p-3 rounded-xl bg-gray-50">
                    <div className="text-xs text-gray-500 mb-2">预览：</div>
                    <div className="px-3 py-2 rounded-2xl text-sm inline-block" style={{
                      backgroundColor: hexToRgba(bubbleBgColor, bubbleBgOpacity / 100),
                      border: bubbleBorderOpacity > 0 ? `1px solid ${hexToRgba(bubbleBorderColor, bubbleBorderOpacity / 100)}` : 'none',
                    }}>这是一条消息</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-xs text-gray-600 mb-1">背景颜色</div>
                    <div className="flex items-center gap-2">
                      <input type="color" value={bubbleBgColor} onChange={(e) => setBubbleBgColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
                      <input type="range" min="0" max="100" value={bubbleBgOpacity} onChange={(e) => setBubbleBgOpacity(Number(e.target.value))} className="flex-1" />
                      <span className="text-xs text-gray-500 w-10">{bubbleBgOpacity}%</span>
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="text-xs text-gray-600 mb-1">边框颜色</div>
                    <div className="flex items-center gap-2">
                      <input type="color" value={bubbleBorderColor} onChange={(e) => setBubbleBorderColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
                      <input type="range" min="0" max="100" value={bubbleBorderOpacity} onChange={(e) => setBubbleBorderOpacity(Number(e.target.value))} className="flex-1" />
                      <span className="text-xs text-gray-500 w-10">{bubbleBorderOpacity}%</span>
                    </div>
                  </div>
                  <button type="button" onClick={handleSaveBubble} className="w-full py-2 rounded-lg bg-green-500 text-white text-sm font-medium">保存气泡设置</button>
                </>
              )}
              
              {settingsTab === 'relations' && (
                <>
                  <div className="text-xs text-gray-500 mb-3 p-2 bg-yellow-50 rounded-lg">
                    💡 关系网设定会在每次 AI 回复前必读，帮助 AI 更好地理解群内人物关系
                  </div>
                  
                  {/* 已有的关系列表 */}
                  {(group.relations || []).length > 0 && (
                    <div className="space-y-2 mb-4">
                      {(group.relations || []).map(rel => {
                        const p1Name = rel.person1Id === 'user' ? (selectedPersona?.name || '我') : (characters.find(c => c.id === rel.person1Id)?.name || '未知')
                        const p2Name = rel.person2Id === 'user' ? (selectedPersona?.name || '我') : (characters.find(c => c.id === rel.person2Id)?.name || '未知')
                        const isExpanded = relationExpanded.has(rel.id)
                        const isEditing = editingRelationId === rel.id
                        
                        return (
                          <div key={rel.id} className="bg-gray-50 rounded-xl overflow-hidden">
                            <button type="button" onClick={() => {
                              setRelationExpanded(prev => {
                                const next = new Set(prev)
                                if (next.has(rel.id)) next.delete(rel.id)
                                else next.add(rel.id)
                                return next
                              })
                            }} className="w-full flex items-center justify-between p-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-800">{p1Name}</span>
                                <span className="text-xs text-gray-400">↔</span>
                                <span className="text-sm font-medium text-gray-800">{p2Name}</span>
                                <span className="text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded">{rel.relationship}</span>
                              </div>
                              <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            
                            {isExpanded && (
                              <div className="px-3 pb-3 border-t border-gray-100">
                                {isEditing ? (
                                  <div className="pt-2 space-y-2">
                                    <input type="text" value={editRelationship} onChange={(e) => setEditRelationship(e.target.value)}
                                      placeholder="关系（如：情侣、闺蜜、死对头）" className="w-full px-2 py-1.5 rounded bg-white border border-gray-200 text-xs outline-none" />
                                    <textarea value={editRelationStory} onChange={(e) => setEditRelationStory(e.target.value)}
                                      placeholder="故事设定（选填）" rows={3} className="w-full px-2 py-1.5 rounded bg-white border border-gray-200 text-xs outline-none resize-none" />
                                    <div className="flex gap-2">
                                      <button type="button" onClick={() => setEditingRelationId(null)} className="flex-1 py-1.5 rounded bg-gray-100 text-gray-600 text-xs">取消</button>
                                      <button type="button" onClick={() => {
                                        const updatedRelations = (group.relations || []).map(r => 
                                          r.id === rel.id ? { ...r, relationship: editRelationship, story: editRelationStory } : r
                                        )
                                        updateGroup(group.id, { relations: updatedRelations })
                                        setEditingRelationId(null)
                                      }} className="flex-1 py-1.5 rounded bg-green-500 text-white text-xs">保存</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="pt-2">
                                    {rel.story && <div className="text-xs text-gray-600 mb-2 whitespace-pre-wrap">{rel.story}</div>}
                                    <div className="flex gap-2">
                                      <button type="button" onClick={() => {
                                        setEditingRelationId(rel.id)
                                        setEditRelationship(rel.relationship)
                                        setEditRelationStory(rel.story || '')
                                      }} className="flex-1 py-1.5 rounded bg-gray-100 text-gray-600 text-xs">编辑</button>
                                      <button type="button" onClick={() => {
                                        const updatedRelations = (group.relations || []).filter(r => r.id !== rel.id)
                                        updateGroup(group.id, { relations: updatedRelations })
                                      }} className="flex-1 py-1.5 rounded bg-red-50 text-red-500 text-xs">删除</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  
                  {/* 添加新关系 */}
                  <div className="bg-green-50 rounded-xl p-3">
                    <div className="text-sm font-medium text-gray-800 mb-2">添加关系</div>
                    {/* 模式：单对单 / 1对多 / 多对1（只改这里，不影响读取顺序） */}
                    <div className="flex gap-2 mb-2">
                      {([
                        { id: 'single' as const, label: '单对单' },
                        { id: 'oneToMany' as const, label: '1对多' },
                        { id: 'manyToOne' as const, label: '多对1' },
                      ]).map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setNewRelationMode(t.id)
                            setNewRelationMulti([])
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs ${
                            newRelationMode === t.id ? 'bg-green-500 text-white' : 'bg-white/70 border border-gray-200 text-gray-700'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    {(() => {
                      const people = [
                        { id: 'user', name: selectedPersona?.name || '我' },
                        ...members.map(m => ({ id: m.id, name: m.name })),
                      ]
                      const toggleMulti = (id: string) => {
                        setNewRelationMulti(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
                      }

                      if (newRelationMode === 'single') {
                        return (
                          <div className="flex gap-2 mb-2">
                            <select value={newRelationPerson1} onChange={(e) => setNewRelationPerson1(e.target.value)}
                              className="flex-1 px-2 py-1.5 rounded bg-white border border-gray-200 text-xs outline-none">
                              <option value="">选择人物</option>
                              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <span className="flex items-center text-xs text-gray-400">和</span>
                            <select value={newRelationPerson2} onChange={(e) => setNewRelationPerson2(e.target.value)}
                              className="flex-1 px-2 py-1.5 rounded bg-white border border-gray-200 text-xs outline-none">
                              <option value="">选择人物</option>
                              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                        )
                      }

                      if (newRelationMode === 'oneToMany') {
                        const p1 = newRelationPerson1
                        return (
                          <div className="mb-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <select value={newRelationPerson1} onChange={(e) => { setNewRelationPerson1(e.target.value); setNewRelationMulti([]) }}
                                className="flex-1 px-2 py-1.5 rounded bg-white border border-gray-200 text-xs outline-none">
                                <option value="">选择“1”（人物）</option>
                                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                              <span className="text-xs text-gray-400">→</span>
                              <span className="text-xs text-gray-600">多个对象</span>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-gray-200">
                              <div className="text-[11px] text-gray-500 mb-1">选择“多”（可多选）</div>
                              <div className="flex flex-wrap gap-2">
                                {people.filter(p => p.id !== p1).map(p => {
                                  const checked = newRelationMulti.includes(p.id)
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => toggleMulti(p.id)}
                                      className={`px-2.5 py-1.5 rounded-full text-xs border ${
                                        checked ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-700'
                                      }`}
                                    >
                                      {checked ? '✅ ' : ''}{p.name}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )
                      }

                      // manyToOne
                      const p2 = newRelationPerson2
                      return (
                        <div className="mb-2 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">多个对象</span>
                            <span className="text-xs text-gray-400">→</span>
                            <select value={newRelationPerson2} onChange={(e) => setNewRelationPerson2(e.target.value)}
                              className="flex-1 px-2 py-1.5 rounded bg-white border border-gray-200 text-xs outline-none">
                              <option value="">选择“1”（人物）</option>
                              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </div>
                          <div className="p-2 rounded-lg bg-white border border-gray-200">
                            <div className="text-[11px] text-gray-500 mb-1">选择“多”（可多选）</div>
                            <div className="flex flex-wrap gap-2">
                              {people.filter(p => p.id !== p2).map(p => {
                                const checked = newRelationMulti.includes(p.id)
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => toggleMulti(p.id)}
                                    className={`px-2.5 py-1.5 rounded-full text-xs border ${
                                      checked ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-700'
                                    }`}
                                  >
                                    {checked ? '✅ ' : ''}{p.name}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      )
                    })()}
                    <input type="text" value={newRelationship} onChange={(e) => setNewRelationship(e.target.value)}
                      placeholder="关系（如：情侣、闺蜜、死对头、上下级）" className="w-full px-2 py-1.5 rounded bg-white border border-gray-200 text-xs outline-none mb-2" />
                    <textarea value={newRelationStory} onChange={(e) => setNewRelationStory(e.target.value)}
                      placeholder="故事设定（选填，可以写两人之间的故事背景）" rows={3} className="w-full px-2 py-1.5 rounded bg-white border border-gray-200 text-xs outline-none resize-none mb-2" />
                    <button type="button" onClick={() => {
                      if (!newRelationship.trim()) {
                        setInfoDialog({ open: true, title: '提示', message: '请填写关系' })
                        return
                      }

                      const existing = group.relations || []
                      const hasPair = (a: string, b: string) =>
                        existing.some(r =>
                          (r.person1Id === a && r.person2Id === b) ||
                          (r.person1Id === b && r.person2Id === a)
                        )

                      const pairs: Array<[string, string]> = []
                      if (newRelationMode === 'single') {
                        if (!newRelationPerson1 || !newRelationPerson2) {
                          setInfoDialog({ open: true, title: '提示', message: '请选择两个人物' })
                          return
                        }
                        pairs.push([newRelationPerson1, newRelationPerson2])
                      } else if (newRelationMode === 'oneToMany') {
                        if (!newRelationPerson1 || newRelationMulti.length === 0) {
                          setInfoDialog({ open: true, title: '提示', message: '请选择“1”和至少一个对象' })
                          return
                        }
                        for (const p of newRelationMulti) pairs.push([newRelationPerson1, p])
                      } else {
                        if (!newRelationPerson2 || newRelationMulti.length === 0) {
                          setInfoDialog({ open: true, title: '提示', message: '请选择“1”和至少一个对象' })
                          return
                        }
                        for (const p of newRelationMulti) pairs.push([p, newRelationPerson2])
                      }

                      const deduped = pairs
                        .filter(([a, b]) => !!a && !!b && a !== b)
                        .filter(([a, b]) => !hasPair(a, b))

                      if (deduped.length === 0) {
                        setInfoDialog({ open: true, title: '提示', message: '没有可添加的关系（可能重复或选择无效）' })
                        return
                      }

                      const now = Date.now()
                      const newRelations = deduped.map(([a, b], idx) => ({
                        id: `rel_${now}_${idx}`,
                        person1Id: a,
                        person2Id: b,
                        relationship: newRelationship.trim(),
                        story: newRelationStory.trim() || undefined,
                      }))
                      const updatedRelations = [...existing, ...newRelations]
                      updateGroup(group.id, { relations: updatedRelations })

                      setNewRelationPerson1('')
                      setNewRelationPerson2('')
                      setNewRelationMulti([])
                      setNewRelationship('')
                      setNewRelationStory('')
                    }} className="w-full py-1.5 rounded bg-green-500 text-white text-xs font-medium">添加关系</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* ========== 添加成员弹窗 ========== */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[320px] bg-white rounded-2xl shadow-xl max-h-[60vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <button type="button" onClick={() => setShowAddMemberModal(false)} className="text-gray-500 text-sm">取消</button>
              <span className="font-semibold text-sm">添加成员</span>
              <button type="button" onClick={handleAddMembers} disabled={addMemberSelected.length === 0}
                className={`text-sm font-medium ${addMemberSelected.length > 0 ? 'text-green-500' : 'text-gray-300'}`}>添加({addMemberSelected.length})</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {availableToAdd.length === 0 ? <div className="text-center text-gray-400 text-sm py-8">没有可添加的联系人</div> : (
                <div className="space-y-2">
                  {availableToAdd.map(c => {
                    const isSelected = addMemberSelected.includes(c.id)
                    return (
                      <button key={c.id} type="button" onClick={() => {
                        if (isSelected) setAddMemberSelected(prev => prev.filter(id => id !== c.id))
                        else setAddMemberSelected(prev => [...prev, c.id])
                      }} className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${isSelected ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50'}`}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
                          {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-200">
                          {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> :
                            <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm">{c.name[0]}</div>}
                        </div>
                        <span className="text-sm text-gray-800">{c.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* ========== 移除成员弹窗 ========== */}
      {showRemoveMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[320px] bg-white rounded-2xl shadow-xl max-h-[60vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <button type="button" onClick={() => setShowRemoveMemberModal(false)} className="text-gray-500 text-sm">取消</button>
              <span className="font-semibold text-sm">移除成员</span>
              <button type="button" onClick={handleRemoveMembers} disabled={removeMemberSelected.length === 0}
                className={`text-sm font-medium ${removeMemberSelected.length > 0 ? 'text-red-500' : 'text-gray-300'}`}>移除({removeMemberSelected.length})</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {members.map(m => {
                  const isSelected = removeMemberSelected.includes(m.id)
                  const canRemove = members.length - removeMemberSelected.length > 2 || isSelected
                  return (
                    <button key={m.id} type="button" disabled={!canRemove && !isSelected} onClick={() => {
                      if (isSelected) setRemoveMemberSelected(prev => prev.filter(id => id !== m.id))
                      else if (canRemove) setRemoveMemberSelected(prev => [...prev, m.id])
                    }} className={`w-full flex items-center gap-2 p-2 rounded-lg transition-colors ${isSelected ? 'bg-red-50 border border-red-200' : canRemove ? 'hover:bg-gray-50' : 'opacity-50'}`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
                        {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-200">
                        {m.avatar ? <img src={m.avatar} alt="" className="w-full h-full object-cover" /> :
                          <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm">{m.name[0]}</div>}
                      </div>
                      <span className="text-sm text-gray-800">{m.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* ========== 时间同步弹窗 ========== */}
      {showTimeSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[320px] bg-white rounded-2xl shadow-xl">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <button type="button" onClick={() => setShowTimeSyncModal(false)} className="text-gray-500 text-sm">取消</button>
              <span className="font-semibold text-sm">时间同步</span>
              <button type="button" onClick={handleSaveTimeSync} className="text-green-500 text-sm font-medium">保存</button>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                <button type="button" onClick={() => setTimeSyncTypeDraft('realtime')}
                  className={`w-full p-3 rounded-lg border text-left ${timeSyncTypeDraft === 'realtime' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                  <div className="text-sm font-medium">实时同步</div>
                  <div className="text-xs text-gray-500">使用设备当前时间</div>
                </button>
                <button type="button" onClick={() => setTimeSyncTypeDraft('custom')}
                  className={`w-full p-3 rounded-lg border text-left ${timeSyncTypeDraft === 'custom' ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}>
                  <div className="text-sm font-medium">自定义时间</div>
                  <div className="text-xs text-gray-500">模拟特定时间点</div>
                </button>
              </div>
              {timeSyncTypeDraft === 'custom' && (
                <input type="text" value={customTimeDraft} onChange={(e) => setCustomTimeDraft(e.target.value)} placeholder="如：2024年1月1日 晚上8点"
                  className="w-full mt-3 px-3 py-2 rounded-lg bg-gray-100 text-sm outline-none" />
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* ========== 转发目标选择弹窗 ========== */}
      {showForwardTargetPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50">
          <div className="w-full max-w-[400px] rounded-t-2xl bg-white shadow-xl max-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <button type="button" onClick={() => setShowForwardTargetPicker(false)} className="text-gray-500 text-sm">取消</button>
              <span className="font-semibold text-gray-800">转发给...</span>
              <div className="w-10" />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {/* 群聊列表 */}
              {groups.filter(g => g.id !== group.id).length > 0 && (
                <>
                  <div className="text-xs text-gray-400 px-3 py-2">群聊</div>
                  <div className="space-y-1 mb-2">
                    {groups.filter(g => g.id !== group.id).map(g => {
                      const groupMembers = g.memberIds.map(id => characters.find(c => c.id === id)).filter(Boolean)
                      return (
                        <button key={g.id} type="button" onClick={() => {
                          const selectedMessages = messages.filter(m => forwardSelectedIds.has(m.id)).sort((a, b) => a.timestamp - b.timestamp).map(m => ({
                            senderName: m.isUser ? (selectedPersona?.name || '我') : getNameInGroup(m.groupSenderId || ''),
                            content: m.content, timestamp: m.timestamp, type: m.type as 'text' | 'image' | 'sticker' | 'transfer' | 'voice',
                          }))
                          addMessage({ characterId: '', groupId: g.id, content: `[转发了${selectedMessages.length}条消息]`, isUser: true, type: 'chat_forward', forwardedMessages: selectedMessages, forwardedFrom: group.name })
                          setShowForwardTargetPicker(false); setForwardMode(false); setForwardSelectedIds(new Set())
                          setInfoDialog({ open: true, title: '转发成功', message: `已转发${selectedMessages.length}条消息到「${g.name}」` })
                        }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                          <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                            {g.avatar ? <img src={g.avatar} alt="" className="w-full h-full object-cover" /> :
                              <span className="text-white text-sm font-medium">{g.name[0]}</span>}
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
              {characters.filter(c => !c.isHiddenFromChat).length === 0 ? <div className="text-center text-gray-400 text-sm py-8">暂无联系人</div> : (
                <div className="space-y-1">
                  {characters.filter(c => !c.isHiddenFromChat).map(c => (
                    <button key={c.id} type="button" onClick={() => {
                      const selectedMessages = messages.filter(m => forwardSelectedIds.has(m.id)).sort((a, b) => a.timestamp - b.timestamp).map(m => ({
                        senderName: m.isUser ? (selectedPersona?.name || '我') : getNameInGroup(m.groupSenderId || ''),
                        content: m.content, timestamp: m.timestamp, type: m.type as 'text' | 'image' | 'sticker' | 'transfer' | 'voice',
                      }))
                      addMessage({ characterId: c.id, content: `[转发了${selectedMessages.length}条消息]`, isUser: true, type: 'chat_forward', forwardedMessages: selectedMessages, forwardedFrom: group.name })
                      setShowForwardTargetPicker(false); setForwardMode(false); setForwardSelectedIds(new Set())
                      setInfoDialog({ open: true, title: '转发成功', message: `已转发${selectedMessages.length}条消息给${c.name}` })
                    }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors">
                      <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0">
                        {c.avatar ? <img src={c.avatar} alt="" className="w-full h-full object-cover" /> :
                          <div className="w-full h-full bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm font-medium">{c.name[0]}</div>}
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
      
      <WeChatDialog open={showClearConfirm} title="清空聊天记录" message="确定要清空所有聊天记录吗？" confirmText="清空" cancelText="取消" danger onConfirm={handleClearMessages} onCancel={() => setShowClearConfirm(false)} />
      <WeChatDialog open={showDeleteConfirm} title="解散群聊" message="确定要解散这个群聊吗？所有聊天记录将被删除。" confirmText="解散" cancelText="取消" danger onConfirm={handleDeleteGroup} onCancel={() => setShowDeleteConfirm(false)} />
      <WeChatDialog
        open={lorebookBindDialogOpen}
        title="绑定世界书（群聊全局）"
        message={
          '提示：这个世界书是【绑定群聊全局】的。\n' +
          '当群聊绑定了世界书时，会【优先读取群聊世界书】；即使群成员已经绑定过其他世界书，也会被群聊世界书覆盖。\n\n' +
          '双重世界书可能会冲突：你可以选择性解绑其中一个（群聊解绑 或 成员各自解绑）。'
        }
        confirmText="继续绑定"
        cancelText="取消"
        onCancel={() => {
          setLorebookBindDialogOpen(false)
          setPendingLorebookId(null)
        }}
        onConfirm={() => {
          const v = pendingLorebookId
          setLorebookBindDialogOpen(false)
          setPendingLorebookId(null)
          if (v) updateGroup(group.id, { lorebookId: v })
        }}
      />
      <WeChatDialog open={infoDialog.open} title={infoDialog.title} message={infoDialog.message} confirmText="好的" onConfirm={() => setInfoDialog({ open: false, title: '', message: '' })} onCancel={() => setInfoDialog({ open: false, title: '', message: '' })} />
    </WeChatLayout>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
