import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'
import WeChatLayout from './WeChatLayout'
import WeChatDialog from './components/WeChatDialog'
import { compressImageFileToDataUrl } from '../../utils/image'
import { saveBlobAsFile } from '../../utils/saveFile'

export default function ChatSettingsScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { fontColor, llmConfig, callLLM, ttsConfig, getAllFontOptions } = useOS()
  const { characterId } = useParams<{ characterId: string }>()
  const { 
    getCharacter, updateCharacter, deleteCharacter, 
    getStickersByCharacter, addSticker, updateSticker,
    characters, addStickerToCharacter,
    userPersonas, getUserPersona, getCurrentPersona,
    stickerCategories, addStickerCategory, removeStickerCategory,
    getMessagesByCharacter, addMessage,
    replaceMessagesForCharacter
  } = useWeChat()
  
  const character = getCharacter(characterId || '')
  const stickers = getStickersByCharacter(characterId || '')
  const publicStickers = getStickersByCharacter('all')
  const messages = getMessagesByCharacter(characterId || '')

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
  
  const bgInputRef = useRef<HTMLInputElement>(null)
  const stickerInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const chatHistoryInputRef = useRef<HTMLInputElement>(null)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  
  const [showStickerManager, setShowStickerManager] = useState(false)
  const [showPersonaSelector, setShowPersonaSelector] = useState(false)
  const [showAddToOthers, setShowAddToOthers] = useState<string | null>(null)
  const [newStickerImage, setNewStickerImage] = useState('')
  const [newStickerUrl, setNewStickerUrl] = useState('')
  const [newStickerCategory, setNewStickerCategory] = useState('')
  const [stickerGroupsExpanded, setStickerGroupsExpanded] = useState<Record<string, boolean>>({})
  const [publicGroupsExpanded, setPublicGroupsExpanded] = useState<Record<string, boolean>>({})
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showBubbleSettings, setShowBubbleSettings] = useState(false)
  const [showEditCharacter, setShowEditCharacter] = useState(false)
  const [showMemorySettings, setShowMemorySettings] = useState(false)
  const [showTimeSyncSettings, setShowTimeSyncSettings] = useState(false)
  const [showVoiceSettings, setShowVoiceSettings] = useState(false)
  const [showPatSettings, setShowPatSettings] = useState(false)
  const [chatHistoryTransferOpen, setChatHistoryTransferOpen] = useState(false)
  const [chatHistoryBusy, setChatHistoryBusy] = useState(false)

  // 添加好友后提示“记忆已导入”
  const [postAddTipOpen, setPostAddTipOpen] = useState(false)
  const [postAddArmed, setPostAddArmed] = useState(false)
  useEffect(() => {
    if (searchParams.get('postAdd') === '1') {
      // 不要一进来就弹：等用户从相册设置完头像“回来”再提示
      setPostAddArmed(true)
    }
  }, [searchParams])

  // 从设置App导入后：可直接跳到这里并自动打开“表情包管理”
  useEffect(() => {
    if (searchParams.get('panel') === 'stickers') {
      setShowStickerManager(true)
    }
  }, [searchParams])

  // 记忆草稿：当真正打开“记忆功能”时，从最新 character 同步一次，避免首次为空
  useEffect(() => {
    if (!showMemorySettings) return
    setMemoryRoundsDraft(character?.memoryRounds || 100)
    setMemorySummaryDraft(character?.memorySummary || '')
  }, [showMemorySettings, character?.memorySummaryUpdatedAt, character?.memoryRounds])
  
  // 编辑角色信息状态
  const [editName, setEditName] = useState(character?.name || '')
  const [editGender, setEditGender] = useState<'male' | 'female' | 'other'>(character?.gender || 'female')
  const [editPrompt, setEditPrompt] = useState(character?.prompt || '')
  const [editBirthday, setEditBirthday] = useState(character?.birthday || '')
  const [editCallMeName, setEditCallMeName] = useState(character?.callMeName || '')
  const [editRelationship, setEditRelationship] = useState(character?.relationship || '')
  const [editCountry, setEditCountry] = useState(character?.country || '')
  const [editLanguage, setEditLanguage] = useState<'zh' | 'en' | 'ru' | 'fr' | 'ja' | 'ko' | 'de'>((character as any)?.language || 'zh')
  const [editChatTranslationEnabled, setEditChatTranslationEnabled] = useState<boolean>(!!(character as any)?.chatTranslationEnabled)
  const prevEditLangRef = useRef<'zh' | 'en' | 'ru' | 'fr' | 'ja' | 'ko' | 'de'>(((character as any)?.language || 'zh') as any)
  const [langDialog, setLangDialog] = useState<{ open: boolean; lang: 'zh' | 'en' | 'ru' | 'fr' | 'ja' | 'ko' | 'de' }>({
    open: false,
    lang: 'zh',
  })
  const [langPickerOpen, setLangPickerOpen] = useState(false)
  const [promptExpanded, setPromptExpanded] = useState(false)

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

  // 记忆功能状态（草稿）
  const [memoryRoundsDraft, setMemoryRoundsDraft] = useState<number>(character?.memoryRounds || 100)
  const [memorySummaryDraft, setMemorySummaryDraft] = useState<string>(character?.memorySummary || '')
  const [summaryRoundsDraft, setSummaryRoundsDraft] = useState<number>(50)
  const [summarizing, setSummarizing] = useState(false)

  // 时间同步状态（草稿）
  const [timeSyncEnabledDraft, setTimeSyncEnabledDraft] = useState<boolean>(character?.timeSyncEnabled !== false)
  const [manualTimeDraft, setManualTimeDraft] = useState<string>(character?.manualTime || '')
  
  // 语音设置状态（草稿）
  const [voiceEnabledDraft, setVoiceEnabledDraft] = useState<boolean>(character?.voiceEnabled ?? false)
  const [voiceIdDraft, setVoiceIdDraft] = useState<string>(character?.voiceId || '')
  const [voiceFrequencyDraft, setVoiceFrequencyDraft] = useState<'always' | 'often' | 'sometimes' | 'rarely'>(character?.voiceFrequency || 'sometimes')
  
  // 拍一拍设置状态（草稿）
  const [patMeTextDraft, setPatMeTextDraft] = useState<string>(character?.patMeText || '拍了拍我的小脑袋')
  const [patThemTextDraft, setPatThemTextDraft] = useState<string>(character?.patThemText || '拍了拍TA的肩膀')

  // 线上回复条数区间（草稿，字符串：允许先删空再输入，避免数字“顶着删不掉”）
  const [onlineReplyMinDraft, setOnlineReplyMinDraft] = useState<string>(String(Math.min(20, Math.max(1, Number((character as any)?.onlineReplyMin ?? 3) || 3))))
  const [onlineReplyMaxDraft, setOnlineReplyMaxDraft] = useState<string>(String(Math.min(20, Math.max(1, Number((character as any)?.onlineReplyMax ?? 8) || 8))))
  // 主动发消息（草稿，字符串）
  const [autoReachMinDraft, setAutoReachMinDraft] = useState<string>(String(Math.min(20, Math.max(0, Number((character as any)?.autoReachMinPerDay ?? 3) || 3))))
  const [autoReachMaxDraft, setAutoReachMaxDraft] = useState<string>(String(Math.min(20, Math.max(1, Number((character as any)?.autoReachMaxPerDay ?? 5) || 5))))

  const toIntInRange = (raw: string, min: number, max: number, fallback: number) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return fallback
    return Math.min(max, Math.max(min, Math.round(n)))
  }
  const getOnlineRange = (minRaw: string, maxRaw: string) => {
    const min0 = toIntInRange(minRaw, 1, 20, 3)
    const max0 = toIntInRange(maxRaw, 1, 20, 8)
    return { min: Math.min(min0, max0), max: Math.max(min0, max0) }
  }
  const getAutoReachRange = (minRaw: string, maxRaw: string) => {
    const min0 = toIntInRange(minRaw, 0, 20, 3)
    const max0 = toIntInRange(maxRaw, 1, 20, 5)
    return { min: Math.min(min0, max0), max: Math.max(min0, max0) }
  }
  const onlineRangePreview = useMemo(() => getOnlineRange(onlineReplyMinDraft, onlineReplyMaxDraft), [onlineReplyMinDraft, onlineReplyMaxDraft])
  const autoReachRangePreview = useMemo(() => getAutoReachRange(autoReachMinDraft, autoReachMaxDraft), [autoReachMinDraft, autoReachMaxDraft])
  const commitOnlineReplyRange = () => {
    if (!character) return
    const normalized = getOnlineRange(onlineReplyMinDraft, onlineReplyMaxDraft)
    setOnlineReplyMinDraft(String(normalized.min))
    setOnlineReplyMaxDraft(String(normalized.max))
    updateCharacter(character.id, { onlineReplyMin: normalized.min, onlineReplyMax: normalized.max } as any)
  }
  const commitAutoReachRange = () => {
    if (!character) return
    const normalized = getAutoReachRange(autoReachMinDraft, autoReachMaxDraft)
    setAutoReachMinDraft(String(normalized.min))
    setAutoReachMaxDraft(String(normalized.max))
    updateCharacter(character.id, { autoReachMinPerDay: normalized.min, autoReachMaxPerDay: normalized.max } as any)
  }

  useEffect(() => {
    if (!character) return
    const minV = Math.min(20, Math.max(1, Number((character as any).onlineReplyMin ?? 3) || 3))
    const maxV = Math.min(20, Math.max(1, Number((character as any).onlineReplyMax ?? 8) || 8))
    setOnlineReplyMinDraft(String(Math.min(minV, maxV)))
    setOnlineReplyMaxDraft(String(Math.max(minV, maxV)))
  }, [character?.id, (character as any)?.onlineReplyMin, (character as any)?.onlineReplyMax])
  useEffect(() => {
    if (!character) return
    const minV = Math.min(20, Math.max(0, Number((character as any).autoReachMinPerDay ?? 3) || 3))
    const maxV = Math.min(20, Math.max(1, Number((character as any).autoReachMaxPerDay ?? 5) || 5))
    setAutoReachMinDraft(String(Math.min(minV, maxV)))
    setAutoReachMaxDraft(String(Math.max(minV, maxV)))
  }, [character?.id, (character as any)?.autoReachMinPerDay, (character as any)?.autoReachMaxPerDay])
  
  // 线下模式设置（折叠面板）
  const [offlineSettingsExpanded, setOfflineSettingsExpanded] = useState(false)
  const [offlineUserColorDraft, setOfflineUserColorDraft] = useState(character?.offlineUserColor || '#2563eb')
  const [offlineCharColorDraft, setOfflineCharColorDraft] = useState(character?.offlineCharColor || '#7c3aed')
  const [offlineDialogColorDraft, setOfflineDialogColorDraft] = useState(character?.offlineDialogColor || '#111827')
  const [offlineTextBgOpacityDraft, setOfflineTextBgOpacityDraft] = useState(character?.offlineTextBgOpacity ?? 85)
  const [offlineMinLengthDraft, setOfflineMinLengthDraft] = useState(character?.offlineMinLength || 50)
  const [offlineMaxLengthDraft, setOfflineMaxLengthDraft] = useState(character?.offlineMaxLength || 300)
  const [offlineFontIdDraft, setOfflineFontIdDraft] = useState(character?.offlineFontId || '')
  const [offlineNarrationItalicDraft, setOfflineNarrationItalicDraft] = useState<boolean>(character?.offlineNarrationItalic ?? true)
  const [offlineNarrationBoldDraft, setOfflineNarrationBoldDraft] = useState<boolean>(character?.offlineNarrationBold ?? false)
  const [offlineQuoteItalicDraft, setOfflineQuoteItalicDraft] = useState<boolean>(character?.offlineQuoteItalic ?? false)
  const [offlineQuoteBoldDraft, setOfflineQuoteBoldDraft] = useState<boolean>(character?.offlineQuoteBold ?? true)
  
  // 气泡设置状态
  const defaultBubble = { bgColor: '#fce7f3', bgOpacity: 100, borderColor: '#f9a8d4', borderOpacity: 0, textColor: '#111827' }
  const [userBubble, setUserBubble] = useState(character?.userBubbleStyle || { ...defaultBubble, presetId: '01' })
  const [charBubble, setCharBubble] = useState(character?.charBubbleStyle || { bgColor: '#ffffff', bgOpacity: 90, borderColor: '#e5e7eb', borderOpacity: 0, presetId: '01', textColor: '#111827' })
  const [editingBubble, setEditingBubble] = useState<'user' | 'char'>('user')
  const [bubbleSyncEnabled, setBubbleSyncEnabled] = useState<boolean>(character?.bubbleSyncEnabled ?? false)
  const [bubbleSizeDraft, setBubbleSizeDraft] = useState<'xs' | 'sm' | 'md' | 'lg'>((character as any)?.bubbleSize || 'md')
  // 预览背景（为了看清透明/磨砂等质感）
  const [previewBgMode, setPreviewBgMode] = useState<'checker' | 'light' | 'dark' | 'custom'>('checker')
  const [previewBgColor, setPreviewBgColor] = useState('#CBD5E1') // slate-300

  // X 账号绑定（草稿）
  const [xHandleDraft, setXHandleDraft] = useState(character?.xHandle || '')
  const [xAliasesDraft, setXAliasesDraft] = useState((character?.xAliases || []).join('，'))
  const [xBindingOpen, setXBindingOpen] = useState(false)

  useEffect(() => {
    setXHandleDraft(character?.xHandle || '')
    setXAliasesDraft((character?.xAliases || []).join('，'))
  }, [character?.id, character?.xHandle, (character?.xAliases || []).length])

  const normalizeHandle = (h: string) => {
    const raw = (h || '').trim()
    if (!raw) return ''
    return raw.startsWith('@') ? raw : `@${raw}`
  }

  const parseAliases = (raw: string) => {
    const list = String(raw || '')
      .split(/[，,、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    return Array.from(new Set(list)).slice(0, 20)
  }

  const getPreviewBgStyle = (): React.CSSProperties => {
    if (previewBgMode === 'light') {
      return { background: 'linear-gradient(180deg, #F8FAFC 0%, #EEF2F7 100%)' }
    }
    if (previewBgMode === 'dark') {
      return { background: 'linear-gradient(180deg, #0B1220 0%, #111827 100%)' }
    }
    if (previewBgMode === 'custom') {
      return { background: previewBgColor }
    }
    // checker: 最适合看透明度/玻璃质感
    return {
      backgroundColor: '#E5E7EB',
      backgroundImage:
        'linear-gradient(45deg, rgba(255,255,255,0.55) 25%, transparent 25%),' +
        'linear-gradient(-45deg, rgba(255,255,255,0.55) 25%, transparent 25%),' +
        'linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.55) 75%),' +
        'linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.55) 75%)',
      backgroundSize: '18px 18px',
      backgroundPosition: '0 0, 0 9px, 9px -9px, -9px 0px',
    }
  }
  
  const [dialog, setDialog] = useState<{
    open: boolean
    title?: string
    message?: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
    onConfirm?: () => void
  }>({ open: false })

  const exportChatHistory = () => {
    if (!character) return
    try {
      const payload = {
        type: 'littlephone_chat_export',
        version: 1,
        exportedAt: Date.now(),
        character: {
          id: character.id,
          name: character.name,
          memoryRounds: character.memoryRounds || 100,
          memorySummary: character.memorySummary || '',
          memorySummaryUpdatedAt: character.memorySummaryUpdatedAt || null,
        },
        messages,
      }
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
      const safeName = (character.name || '角色').replace(/[\\/:*?"<>|]/g, '_')
      const filename = `LittlePhone-聊天记录-${safeName}-${new Date().toISOString().slice(0, 10)}.json`
      saveBlobAsFile(blob, filename, {
        title: '聊天记录导出',
        hintText: '导出后可在另一台设备导入恢复（含长期记忆摘要）。',
      })
    } catch (e: any) {
      setDialog({ open: true, title: '导出失败', message: e?.message || '导出失败，请稍后重试。', confirmText: '知道了' })
    }
  }

  const triggerImportChatHistory = () => {
    try {
      chatHistoryInputRef.current?.click()
    } catch {
      // ignore
    }
  }

  const handleImportChatHistoryFile = async (file: File | null) => {
    if (!file || !character) return
    setChatHistoryBusy(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text || '{}')
      if (!data || data.type !== 'littlephone_chat_export') {
        throw new Error('文件格式不对：请导入“小手机”导出的聊天记录 JSON。')
      }
      const importedMessages = Array.isArray(data.messages) ? data.messages : []
      const imported = replaceMessagesForCharacter(character.id, importedMessages, { keepExisting: false })
      const mem = data.character?.memorySummary
      const rounds = data.character?.memoryRounds
      const memAt = data.character?.memorySummaryUpdatedAt
      if (typeof mem === 'string' || typeof rounds === 'number' || memAt != null) {
        updateCharacter(character.id, {
          memorySummary: typeof mem === 'string' ? mem : (character.memorySummary || ''),
          memoryRounds: typeof rounds === 'number' ? Math.min(1000, Math.max(1, Math.floor(rounds))) : (character.memoryRounds || 100),
          memorySummaryUpdatedAt: typeof memAt === 'number' ? memAt : (character.memorySummaryUpdatedAt || Date.now()),
        } as any)
      }
      setDialog({
        open: true,
        title: '导入成功',
        message: `已导入 ${imported.imported} 条聊天记录，并同步了长期记忆摘要。`,
        confirmText: '知道了',
      })
    } catch (e: any) {
      setDialog({ open: true, title: '导入失败', message: e?.message || '导入失败，请检查文件内容。', confirmText: '知道了' })
    } finally {
      setChatHistoryBusy(false)
      // 允许重复导入同一个文件
      if (chatHistoryInputRef.current) chatHistoryInputRef.current.value = ''
    }
  }

  // 预览：复用聊天页的“质感预设”渲染逻辑（简化版）
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

  const getPreviewBubbleStyle = (bubble: any, isUser: boolean) => {
    const bgAlpha = 1 - Math.max(0, Math.min(100, bubble.bgOpacity ?? 0)) / 100
    const borderAlpha = 1 - Math.max(0, Math.min(100, bubble.borderOpacity ?? 0)) / 100
    const baseBg = rgba(bubble.bgColor, bgAlpha)
    const baseBorder = borderAlpha > 0.01
      ? `1px solid ${rgba(bubble.borderColor, borderAlpha)}`
      : 'none'

    const presetId = bubble.presetId || '01'
    const style: any = { backgroundColor: baseBg, border: baseBorder, color: bubble.textColor || '#111827' }
    const layer = (a: number) => Math.max(0, Math.min(1, a * bgAlpha))

    if (presetId === '01') style.boxShadow = isUser ? '0 8px 18px rgba(236, 72, 153, 0.10)' : '0 8px 18px rgba(0, 0, 0, 0.06)'
    if (presetId === '02') {
      style.backdropFilter = 'blur(10px) saturate(1.2)'
      style.WebkitBackdropFilter = 'blur(10px) saturate(1.2)'
      style.backgroundImage = `linear-gradient(135deg, ${rgba('#ffffff', layer(0.40))}, ${rgba('#ffffff', layer(0.05))})`
      style.border = `1px solid ${rgba('#ffffff', 0.35)}`
      style.boxShadow = '0 10px 22px rgba(0,0,0,0.10)'
    }
    if (presetId === '03') {
      style.backgroundImage = `linear-gradient(135deg, ${rgba('#ffffff', layer(0.28))}, ${rgba('#ffffff', layer(0))}), radial-gradient(circle at 20% 0%, ${rgba(bubble.bgColor, layer(0.25))}, ${rgba('#ffffff', layer(0))} 60%)`
      style.border = `1px solid ${rgba(bubble.borderColor || '#ffffff', 0.18)}`
      style.boxShadow = isUser ? '0 10px 24px rgba(236, 72, 153, 0.16)' : '0 10px 24px rgba(0,0,0,0.10)'
    }
    if (presetId === '04') {
      style.border = `1px solid ${rgba(bubble.borderColor, Math.max(0.18, (bubble.borderOpacity ?? 0) / 100))}`
      style.boxShadow = '0 2px 10px rgba(0,0,0,0.06)'
    }
    if (presetId === '05') {
      style.backgroundImage = `linear-gradient(180deg, ${rgba('#ffffff', layer(0.55))}, ${rgba('#ffffff', layer(0.05))})`
      style.boxShadow = isUser ? '0 14px 30px rgba(236, 72, 153, 0.18)' : '0 14px 30px rgba(0,0,0,0.12)'
      style.border = `1px solid ${rgba('#ffffff', 0.28)}`
    }
    if (presetId === '06') {
      style.border = `1px solid ${rgba(bubble.borderColor || bubble.bgColor, 0.55)}`
      style.boxShadow = `0 0 0 1px ${rgba(bubble.borderColor || bubble.bgColor, 0.35)}, 0 10px 24px ${rgba(bubble.borderColor || bubble.bgColor, 0.22)}`
    }
    if (presetId === '07') {
      style.backgroundColor = rgba(bubble.bgColor, Math.min(0.92, bgAlpha))
      style.boxShadow = '0 6px 14px rgba(0,0,0,0.06)'
      style.border = `1px solid ${rgba('#000000', 0.06)}`
    }
    if (presetId === '08') {
      style.backgroundColor = rgba(bubble.bgColor, Math.min(0.70, bgAlpha))
      style.backdropFilter = 'blur(12px) saturate(1.1)'
      style.WebkitBackdropFilter = 'blur(12px) saturate(1.1)'
      style.border = `1px solid ${rgba('#ffffff', 0.16)}`
      style.boxShadow = '0 12px 26px rgba(0,0,0,0.22)'
    }
    if (presetId === '09') {
      style.backgroundImage = `linear-gradient(135deg, ${rgba('#ffffff', layer(0.42))}, ${rgba('#ffffff', layer(0.08))})`
      style.border = `1px solid ${rgba('#ffffff', 0.45)}`
      style.boxShadow = '0 10px 22px rgba(0,0,0,0.10)'
    }
    if (presetId === '10') {
      style.boxShadow = 'none'
      style.border = bubble.borderOpacity > 0 ? baseBorder : `1px solid ${rgba('#000000', 0.06)}`
    }
    if (presetId === '11') {
      style.backgroundImage = `linear-gradient(180deg, ${rgba('#ffffff', layer(0.25))}, ${rgba('#ffffff', layer(0))})`
      style.boxShadow = '0 6px 16px rgba(0,0,0,0.10)'
      style.border = `1px solid ${rgba('#ffffff', 0.18)}`
    }
    if (presetId === '12') {
      style.backgroundImage = `radial-gradient(circle at 25% 10%, ${rgba('#ffffff', layer(0.35))}, ${rgba('#ffffff', layer(0))} 55%)`
      style.boxShadow = isUser ? '0 14px 30px rgba(168, 85, 247, 0.16)' : '0 14px 30px rgba(0,0,0,0.12)'
      style.border = `1px solid ${rgba(bubble.borderColor || bubble.bgColor, 0.20)}`
    }
    if (presetId === '13') {
      style.backgroundImage =
        `conic-gradient(from 210deg at 30% 20%, ${rgba('#60A5FA', 0.55)}, ${rgba('#A78BFA', 0.55)}, ${rgba('#F472B6', 0.45)}, ${rgba('#34D399', 0.45)}, ${rgba('#60A5FA', 0.55)})`
      style.border = `1px solid ${rgba(bubble.borderColor || '#A78BFA', 0.45)}`
      style.boxShadow = '0 12px 26px rgba(0,0,0,0.14)'
    }
    if (presetId === '14') {
      style.backgroundImage =
        `radial-gradient(circle at 10px 10px, ${rgba('#ffffff', layer(0.55))} 0 2px, ${rgba('#ffffff', layer(0))} 2.5px),
         radial-gradient(circle at 22px 18px, ${rgba('#ffffff', layer(0.45))} 0 1.5px, ${rgba('#ffffff', layer(0))} 2px)`
      style.backgroundSize = '28px 28px'
      style.border = `2px solid ${rgba(bubble.borderColor || bubble.bgColor, 0.75)}`
      style.boxShadow = '0 10px 22px rgba(0,0,0,0.10)'
    }
    if (presetId === '15') {
      style.border = `2px dashed ${rgba(bubble.borderColor || bubble.bgColor, 0.70)}`
      style.boxShadow = `inset 0 1px 0 ${rgba('#ffffff', 0.45)}, 0 10px 22px rgba(0,0,0,0.10)`
      style.backgroundImage = `linear-gradient(180deg, ${rgba('#ffffff', layer(0.35))}, ${rgba('#ffffff', layer(0))})`
    }
    if (presetId === '16') {
      style.border = `2px solid ${rgba(bubble.borderColor || '#F59E0B', 0.75)}`
      style.outline = `1px solid ${rgba('#ffffff', 0.10)}`
      style.outlineOffset = '-3px'
      style.backgroundImage = `linear-gradient(180deg, ${rgba('#ffffff', layer(0.18))}, ${rgba('#ffffff', layer(0))})`
      style.boxShadow = '0 14px 30px rgba(0,0,0,0.25)'
    }
    return style
  }

  if (!character) {
    return (
      <WeChatLayout>
        <div className="flex items-center justify-center h-full">
          <span className="text-gray-500">角色不存在</span>
        </div>
      </WeChatLayout>
    )
  }

  const handleBgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      ;(async () => {
        try {
          const base64 = await compressImageFileToDataUrl(file, { maxSide: 1440, mimeType: 'image/jpeg', quality: 0.86 })
          // localStorage 容量有限，过大会导致“看似设置成功，但刷新就没了”
          if ((base64 || '').length > 1_400_000) {
            setDialog({
              open: true,
              title: '背景图太大',
              message: '这张图太大，可能导致刷新后丢失。建议换一张更小的图片，或先截图/压缩后再选。',
              confirmText: '知道了',
            })
            return
          }
          updateCharacter(character.id, { chatBackground: base64 })
        } catch {
          setDialog({
            open: true,
            title: '设置失败',
            message: '读取图片失败，请换一张图片再试试。',
            confirmText: '好的',
          })
        }
      })()
      e.target.value = ''
    }
  }

  const handleStickerImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      try {
        // 压缩表情包图片
        const base64 = await compressImageFileToDataUrl(file, { maxSide: 256, quality: 0.8 })
        setNewStickerImage(base64)
      } catch {
        // 压缩失败时使用原始方式
        const reader = new FileReader()
        reader.onload = (event) => {
          const base64 = event.target?.result as string
          setNewStickerImage(base64)
        }
        reader.readAsDataURL(file)
      }
    }
  }

  const handleAddSticker = () => {
    if (!newStickerImage) {
      setDialog({
        open: true,
        title: '还差一点点',
        message: '请选择一张表情图片～',
        confirmText: '知道啦',
      })
      return
    }

    // 关键词不再用于触发逻辑，这里仅作内部标识（导出包/排序等）
    const internalName = `sticker_${Date.now()}`
    addSticker({
      // 写入总表情库，并绑定到当前角色（不复制）
      characterId: 'all',
      boundCharacterIds: [character.id],
      keyword: internalName,
      imageUrl: newStickerImage,
      category: newStickerCategory || undefined
    })

    setNewStickerImage('')
    setNewStickerCategory('')
  }
  
  // 添加分类
  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return
    addStickerCategory(newCategoryName.trim())
    setNewCategoryName('')
  }

  const handleDelete = () => {
    setDialog({
      open: true,
      title: '确认删除？',
      message: '是否确认删除角色，不可逆？',
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
      onConfirm: () => {
        deleteCharacter(character.id)
        navigate('/apps/wechat')
      },
    })
  }

  const hasApiConfig = llmConfig.apiBaseUrl && llmConfig.apiKey && llmConfig.selectedModel

  // 生成“长期记忆摘要”：把最近 N 回合总结为精简记忆，并与旧摘要合并（用户可编辑）
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

  const buildHistoryForSummary = (all: any[], rounds: number) => {
    const maxRounds = Math.min(1000, Math.max(1, Math.floor(rounds || 1)))
    let userRounds = 0
    const picked: any[] = []
    for (let i = all.length - 1; i >= 0; i--) {
      const m = all[i]
      if (!m) continue
      if (m.type === 'system') continue
      if (m.isUser) {
        userRounds += 1
        if (userRounds > maxRounds) break
      }
      picked.push(m)
    }
    const chronological = picked.reverse()
    const MAX_CHARS = 20000
    const formatWithCap = (cap: number) => {
      const lines: string[] = []
      for (const m of chronological) {
        const who = m.isUser ? '我' : character.name
        const type = m.type
        if (type === 'image') {
          lines.push(`${who}：<图片>`)
        } else if (type === 'sticker') {
          lines.push(`${who}：<表情包>`)
        } else if (type === 'transfer') {
          lines.push(`${who}：<转账 ${m.transferAmount ?? ''} ${m.transferNote ?? ''} ${m.transferStatus ?? ''}>`)
        } else if (type === 'music') {
          lines.push(`${who}：<音乐 ${m.musicTitle ?? ''} ${m.musicArtist ?? ''} ${m.musicStatus ?? ''}>`)
        } else if (type === 'voice') {
          const vt = String((m.voiceText || m.voiceOriginalText || '')).trim()
          lines.push(`${who}：<语音>${vt ? ' ' + vt.slice(0, cap) : ''}`)
        } else {
          const txt = String(m.content || '').replace(/\s+/g, ' ').trim()
          lines.push(`${who}：${txt.slice(0, cap)}`)
        }
      }
      return lines.join('\n')
    }
    // 先用较高 cap，如果超长就逐步缩短，尽量保证“选中的回合都能读到”，而不是只保留最后几条
    for (const cap of [260, 200, 140, 100, 80]) {
      const s = formatWithCap(cap)
      if (s.length <= MAX_CHARS) return s
    }
    // 仍超长：最后兜底截断（保留开头，避免只剩最后几条）
    return formatWithCap(80).slice(0, MAX_CHARS)
  }

  const selectedPersona = character.selectedUserPersonaId 
    ? getUserPersona(character.selectedUserPersonaId) 
    : null
  const defaultPersona = getCurrentPersona()

  const myStickers = useMemo(() => stickers.filter(s => s.characterId === character.id), [stickers, character.id])
  const myStickerImageSet = useMemo(() => new Set(myStickers.map(s => s.imageUrl)), [myStickers])
  const publicOnlyStickers = useMemo(() => publicStickers.filter(s => s.characterId === 'all' && !myStickerImageSet.has(s.imageUrl)), [publicStickers, myStickerImageSet])

  const stickersGrouped = useMemo(() => {
    const map: Record<string, typeof myStickers> = {}
    for (const s of myStickers) {
      const cat = (s.category || '').trim() || '未分类'
      if (!map[cat]) map[cat] = []
      map[cat].push(s)
    }
    const keys = Object.keys(map).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    return { keys, map }
  }, [myStickers])

  const publicGrouped = useMemo(() => {
    const map: Record<string, typeof publicOnlyStickers> = {}
    for (const s of publicOnlyStickers) {
      const cat = (s.category || '').trim() || '未分类'
      if (!map[cat]) map[cat] = []
      map[cat].push(s)
    }
    const keys = Object.keys(map).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    return { keys, map }
  }, [publicOnlyStickers])

  const handleBack = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    navigate(-1)
  }
  
  // 角色卡导出相关状态
  const [showExportCard, setShowExportCard] = useState(false)
  const [exportCardData, setExportCardData] = useState('')
  
  // 导出角色卡
  const exportCharacterCard = () => {
    if (!character) return
    const card = {
      schemaVersion: 1,
      type: 'mina_character_card',
      exportedAt: Date.now(),
      character: {
        name: character.name,
        avatar: character.avatar || '',
        gender: character.gender,
        prompt: character.prompt || '',
        birthday: character.birthday || '',
        callMeName: character.callMeName || '',
        relationship: character.relationship || '',
        country: character.country || '',
        language: character.language || 'zh',
        chatTranslationEnabled: !!character.chatTranslationEnabled,
      }
    }
    const json = JSON.stringify(card, null, 2)
    setExportCardData(json)
    setShowExportCard(true)
  }
  
  const downloadCharacterCard = () => {
    if (!character || !exportCardData) return
    const blob = new Blob([exportCardData], { type: 'application/json;charset=utf-8' })
    const filename = `${character.name}_角色卡_${Date.now()}.json`
    saveBlobAsFile(blob, filename, { title: '角色卡导出', hintText: '导出角色卡（iOS 可选择“存储到文件”）' })
      .then((method) => {
        if (method !== 'download') {
          // iOS 上提示一下，避免用户以为“没下载”
          setDialog({
            open: true,
            title: '导出提示',
            message: 'iOS 浏览器可能不支持直接下载：已弹出分享/打开新页。请在分享菜单选择“存储到文件”。',
            confirmText: '知道了',
            onConfirm: () => setDialog({ open: false }),
          })
        }
      })
      .catch(() => {})
  }
  
  const copyCharacterCard = async () => {
    if (!exportCardData) return
    try {
      await navigator.clipboard.writeText(exportCardData)
      setShowExportCard(false)
    } catch {
      // fallback
    }
  }

  return (
    <WeChatLayout>
      <div className="flex flex-col h-full -mt-1">
        {/* 头部 */}
        <div className="flex items-center justify-between px-3 py-3 bg-transparent">
          <button 
            type="button" 
            onClick={handleBack}
            className="flex items-center gap-0.5 relative z-10"
            style={{ color: fontColor.value }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[13px] font-medium">返回</span>
          </button>
          <span className="font-semibold text-[#000]">聊天设置</span>
          <div className="w-12" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 人物信息卡片（重排：头像更换 + 人设入口，避免拥挤） */}
          <div className="bg-transparent mt-2 mx-3 rounded-xl p-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-200"
                onClick={() => avatarInputRef.current?.click()}
                title="点击更换头像"
              >
                {character.avatar ? (
                  <img src={character.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-xl text-white">
                    {character.name[0]}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/10 opacity-0 hover:opacity-100 transition-opacity" />
              </button>
              <div className="flex flex-col items-start min-w-0">
                <div className="text-[11px] text-gray-500">点击更换头像</div>
                <div className="text-[11px] text-gray-400 mt-0.5">（从相册选择）</div>
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  // 使用 FileReader 转换为 base64，这样刷新后不会丢失
                  const reader = new FileReader()
                  reader.onload = (event) => {
                    const base64 = event.target?.result as string
                    updateCharacter(character.id, { avatar: base64 })
                    // 从相册返回后再弹“记忆已导入”提示
                    if (postAddArmed) {
                      window.setTimeout(() => setPostAddTipOpen(true), 200)
                      setPostAddArmed(false)
                    }
                  }
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }}
              />
              <div className="flex-1">
                <div className="font-semibold text-lg text-[#000]">
                  {character.nickname || character.name}
                  {character.nickname && (
                    <span className="text-xs text-gray-400 font-normal ml-1">（{character.name}）</span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">
                  {character.gender === 'male' ? '男' : character.gender === 'female' ? '女' : '其他'}
                  {character.relationship && ` · ${character.relationship}`}
                </div>
              </div>
              {/* 导出角色卡按钮 */}
              <button
                type="button"
                onClick={exportCharacterCard}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-600 text-[11px] font-medium active:scale-[0.98]"
              >
                导出角色卡
              </button>
            </div>
            
            {/* 设置备注 */}
            <div className="mt-3 w-full px-3 py-3 rounded-xl bg-white/70 border border-black/10">
              <div className="flex items-center justify-between">
                <div className="text-[#000] font-medium">设置备注</div>
                <span className="text-[10px] text-gray-400">仅你可见，不影响AI</span>
              </div>
              <input
                type="text"
                value={character.nickname || ''}
                onChange={(e) => updateCharacter(character.id, { nickname: e.target.value || undefined })}
                placeholder="给TA起个备注名..."
                className="mt-2 w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-800 text-sm outline-none focus:ring-2 focus:ring-green-400/50"
              />
            </div>

            {/* 角色人设入口（避免在此处展示长文本） */}
            <button
              type="button"
              onClick={() => {
                setEditName(character.name)
                setEditGender(character.gender)
                setEditPrompt(character.prompt)
                setEditBirthday(character.birthday)
                setEditCallMeName(character.callMeName)
                setEditRelationship(character.relationship)
                setEditCountry((character as any).country || '')
                setEditLanguage(((character as any).language as any) || 'zh')
                setEditChatTranslationEnabled(!!(character as any).chatTranslationEnabled)
                setShowEditCharacter(true)
              }}
              className="mt-3 w-full flex items-center justify-between px-3 py-3 rounded-xl bg-white/70 border border-black/10 active:scale-[0.99]"
            >
              <div className="text-[#000] font-medium">角色人设</div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500">点击查看/编辑</span>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </div>

          {/* 我的人设选择（与“角色人设”入口统一视觉格式） */}
          <div className="bg-transparent mt-2 mx-3 rounded-xl p-4">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-3 rounded-xl bg-white/70 border border-black/10 active:scale-[0.99]"
              onClick={() => {
                if (userPersonas.length === 0) {
                  setDialog({
                    open: true,
                    title: '还没有人设',
                    message: '请先到微信「我」里添加一个人设～',
                    confirmText: '好哒',
                  })
                } else {
                  setShowPersonaSelector(true)
                }
              }}
            >
              <div className="text-[#000] font-medium">我的人设</div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500">
                  {selectedPersona ? selectedPersona.name : `未选择（默认：${defaultPersona?.name || '无'}）`}
                </span>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
            <div className="px-1 pt-2 text-[11px] text-gray-400">
              未选择时，将自动使用微信「我」里当前使用的人设。
            </div>
          </div>

          {/* X 账号绑定 */}
          <div className="bg-transparent mt-2 mx-3 rounded-xl p-4">
            <button
              type="button"
              onClick={() => setXBindingOpen((v) => !v)}
              className="w-full flex items-center justify-between"
            >
              <div className="text-[13px] font-semibold text-[#000]">X 账号绑定</div>
              <div className="flex items-center gap-2 text-[11px] text-gray-400">
                <span>{xBindingOpen ? '收起' : '展开'}</span>
                <svg className={`w-4 h-4 transition-transform ${xBindingOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
            {xBindingOpen && (
              <>
                <div className="text-[11px] text-gray-400 mt-2 mb-3">用于在推特中稳定关联，避免同名混淆。</div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[12px] text-gray-500 block mb-1">推特账号（@handle）</label>
                    <input
                      type="text"
                      value={xHandleDraft}
                      onChange={(e) => setXHandleDraft(e.target.value)}
                      placeholder={`例如：@${character.name}`}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-black/10 text-[#000] text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] text-gray-500 block mb-1">别名/关键词（可选）</label>
                    <input
                      type="text"
                      value={xAliasesDraft}
                      onChange={(e) => setXAliasesDraft(e.target.value)}
                      placeholder="例如：小名、圈内称呼、昵称（用逗号分隔）"
                      className="w-full px-3 py-2 rounded-lg bg-white border border-black/10 text-[#000] text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      updateCharacter(character.id, {
                        xHandle: normalizeHandle(xHandleDraft),
                        xAliases: parseAliases(xAliasesDraft),
                      })
                      setDialog({ open: true, title: '已保存', message: 'X 账号绑定已更新。', confirmText: '知道了' })
                    }}
                    className="px-4 py-2 rounded-lg bg-[#07C160] text-white text-sm font-medium"
                  >
                    保存绑定
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const handle = normalizeHandle(`@${character.name}`)
                      setXHandleDraft(handle)
                      setXAliasesDraft(character.name)
                    }}
                    className="px-4 py-2 rounded-lg bg-white border border-black/10 text-[#333] text-sm"
                  >
                    一键使用名字
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 功能列表 */}
          <div className="bg-transparent mt-2">
            {/* 聊天背景 */}
            <div 
              className="flex items-center justify-between px-4 py-4 border-b border-gray-100 cursor-pointer active:bg-gray-50"
              onClick={() => bgInputRef.current?.click()}
            >
              <span className="text-[#000]">聊天背景</span>
              <div className="flex items-center gap-2">
                {character.chatBackground && (
                  <div className="w-8 h-8 rounded overflow-hidden">
                    <img src={character.chatBackground} alt="" className="w-full h-full object-cover" />
                  </div>
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

            {/* 气泡设置 */}
            <div 
              className="flex items-center justify-between px-4 py-4 border-b border-gray-100 cursor-pointer active:bg-gray-50"
              onClick={() => {
                // 打开时同步一次状态，避免热更新/返回后状态不同步
                setBubbleSyncEnabled(character.bubbleSyncEnabled ?? false)
                setUserBubble(character.userBubbleStyle || { ...defaultBubble, presetId: '01' })
                setCharBubble(character.charBubbleStyle || { bgColor: '#ffffff', bgOpacity: 90, borderColor: '#e5e7eb', borderOpacity: 0, presetId: '01', textColor: '#111827' })
                setBubbleSizeDraft(((character as any)?.bubbleSize === 'xs' || (character as any)?.bubbleSize === 'sm' || (character as any)?.bubbleSize === 'lg') ? (character as any).bubbleSize : 'md')
                setShowBubbleSettings(true)
              }}
            >
              <span className="text-[#000]">气泡设置</span>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* 表情包管理 */}
            <div 
              className="flex items-center justify-between px-4 py-4 border-b border-gray-100 cursor-pointer active:bg-gray-50"
              onClick={() => setShowStickerManager(true)}
            >
              <span className="text-[#000]">表情包管理</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{stickers.length}个</span>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* 线上回复条数（仅线上模式显示） */}
            {!character.offlineMode && (
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col">
                    <span className="text-[#000]">线上回复气泡数量</span>
                    <span className="text-xs text-gray-400 mt-0.5">设置最少~最多条数（1~20，默认3~8）</span>
                  </div>
                  <span className="text-xs font-medium text-gray-600">{onlineRangePreview.min}~{onlineRangePreview.max}条</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-gray-500">
                    最少
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={onlineReplyMinDraft}
                      onChange={(e) => {
                        setOnlineReplyMinDraft(e.target.value)
                      }}
                      onBlur={commitOnlineReplyRange}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
                      className="mt-1 w-full px-2 py-1.5 rounded-lg bg-gray-100 text-[12px] outline-none"
                    />
                  </label>
                  <label className="text-[11px] text-gray-500">
                    最多
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={onlineReplyMaxDraft}
                      onChange={(e) => {
                        setOnlineReplyMaxDraft(e.target.value)
                      }}
                      onBlur={commitOnlineReplyRange}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
                      className="mt-1 w-full px-2 py-1.5 rounded-lg bg-gray-100 text-[12px] outline-none"
                    />
                  </label>
                </div>
                <div className="mt-2 text-[11px] text-gray-400">
                  线上模式会严格按区间控制，并尽量避免硬拆一句话。
                </div>
              </div>
            )}

            {/* 主动发消息（仅线上模式） */}
            {!character.offlineMode && (
              <div className="px-4 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col pr-3">
                    <span className="text-[#000]">主动发消息</span>
                    <span className="text-xs text-gray-400 mt-0.5">
                      开启后会在离线时自动调用 API 发送消息（按次数扣费）
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      const enabled = !!(character as any).autoReachEnabled
                      if (enabled) {
                        updateCharacter(character.id, { autoReachEnabled: false } as any)
                        return
                      }
                      setDialog({
                        open: true,
                        title: '开启主动发消息？',
                        message:
                          '开启后将强制启用时间感知，并允许角色在你离线时自动调用 API 给你发消息。\n' +
                          '按“自动找你一次=一次API调用”计费；不需要时请及时关闭。',
                        confirmText: '确认开启',
                        cancelText: '先不开',
                        onConfirm: () => {
                          // 互斥：同一时刻只允许一个角色开启“主动发消息”
                          for (const c of characters) {
                            if (c.id !== character.id && (c as any).autoReachEnabled) {
                              updateCharacter(c.id, { autoReachEnabled: false } as any)
                            }
                          }
                          updateCharacter(character.id, {
                            autoReachEnabled: true,
                            autoReachMinPerDay: autoReachRangePreview.min,
                            autoReachMaxPerDay: autoReachRangePreview.max,
                            timeSyncEnabled: true,
                          } as any)
                        },
                      })
                    }}
                    className={`w-12 h-7 rounded-full transition-colors ${(character as any).autoReachEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <div className={`w-6 h-6 bg-white rounded-full shadow mt-0.5 transition-transform ${(character as any).autoReachEnabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-gray-500">
                    最少次数/天
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={autoReachMinDraft}
                      onChange={(e) => {
                        setAutoReachMinDraft(e.target.value)
                      }}
                      onBlur={commitAutoReachRange}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
                      className="mt-1 w-full px-2 py-1.5 rounded-lg bg-gray-100 text-[12px] outline-none"
                    />
                  </label>
                  <label className="text-[11px] text-gray-500">
                    最多次数/天
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={autoReachMaxDraft}
                      onChange={(e) => {
                        setAutoReachMaxDraft(e.target.value)
                      }}
                      onBlur={commitAutoReachRange}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur() } }}
                      className="mt-1 w-full px-2 py-1.5 rounded-lg bg-gray-100 text-[12px] outline-none"
                    />
                  </label>
                </div>
                <div className="mt-2 text-[11px] text-gray-400">
                  默认 3~5 次；线下模式会自动关闭此功能。
                </div>
              </div>
            )}
            
            {/* 线下模式 */}
            <div 
              className="flex items-center justify-between px-4 py-4 cursor-pointer active:bg-gray-50"
              onClick={() => {
                const newOfflineMode = !character.offlineMode
                // 如果开启线下模式且语音功能开启，自动关闭语音并提示
                if (newOfflineMode && character.voiceEnabled) {
                  updateCharacter(character.id, { offlineMode: newOfflineMode, voiceEnabled: false, autoReachEnabled: false } as any)
                  setDialog({
                    open: true,
                    title: '语音功能已自动关闭',
                    message: '线下模式暂不支持语音功能，已帮你自动关闭。主动发消息也已关闭。',
                  })
                } else {
                  updateCharacter(character.id, newOfflineMode ? ({ offlineMode: true, autoReachEnabled: false } as any) : { offlineMode: false })
                }
                // 插入分割线消息
                addMessage({
                  characterId: character.id,
                  content: newOfflineMode ? '—— 进入线下模式 ——' : '—— 结束线下模式 ——',
                  isUser: false,
                  type: 'system',
                  systemSubtype: newOfflineMode ? 'offline_start' : 'offline_end',
                })
              }}
            >
              <div className="flex flex-col">
                <span className="text-[#000]">线下模式</span>
                <span className="text-xs text-gray-400 mt-0.5">开启后可使用线下互动功能</span>
              </div>
              <div className={`w-12 h-7 rounded-full transition-colors ${character.offlineMode ? 'bg-green-500' : 'bg-gray-300'}`}>
                <div className={`w-6 h-6 bg-white rounded-full shadow mt-0.5 transition-transform ${character.offlineMode ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
              </div>
            </div>
            
            {/* 线下模式详细设置（折叠面板） */}
            {character.offlineMode && (
              <div className="border-t border-gray-100">
                <div 
                  className="flex items-center justify-between px-4 py-3 cursor-pointer active:bg-gray-50"
                  onClick={() => setOfflineSettingsExpanded(!offlineSettingsExpanded)}
                >
                  <div className="flex flex-col">
                    <span className="text-[#000]">线下模式设置</span>
                    <span className="text-xs text-gray-400 mt-0.5">可调整字体颜色和输出字数</span>
                  </div>
                  <svg 
                    className={`w-5 h-5 text-gray-400 transition-transform ${offlineSettingsExpanded ? 'rotate-90' : ''}`} 
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                
                {offlineSettingsExpanded && (
                  <div className="px-4 pb-4 space-y-4">
                    {/* 字体颜色设置 */}
                    <div className="space-y-3">
                      <div className="text-sm text-gray-700 font-medium">字体颜色</div>
                      
                      {/* 用户字体颜色 */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">我的叙述</span>
                        <div className="flex items-center gap-2">
                          <label className="relative w-8 h-8 rounded-lg border border-gray-200 cursor-pointer overflow-hidden">
                            <input
                              type="color"
                              value={offlineUserColorDraft}
                              onChange={(e) => {
                                const color = e.target.value
                                setOfflineUserColorDraft(color)
                                updateCharacter(character.id, { offlineUserColor: color })
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div 
                              className="w-full h-full"
                              style={{ backgroundColor: offlineUserColorDraft }}
                            />
                          </label>
                          <span className="text-xs text-gray-400 w-16">{offlineUserColorDraft}</span>
                        </div>
                      </div>
                      
                      {/* 角色字体颜色 */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">TA的叙述</span>
                        <div className="flex items-center gap-2">
                          <label className="relative w-8 h-8 rounded-lg border border-gray-200 cursor-pointer overflow-hidden">
                            <input
                              type="color"
                              value={offlineCharColorDraft}
                              onChange={(e) => {
                                const color = e.target.value
                                setOfflineCharColorDraft(color)
                                updateCharacter(character.id, { offlineCharColor: color })
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div 
                              className="w-full h-full"
                              style={{ backgroundColor: offlineCharColorDraft }}
                            />
                          </label>
                          <span className="text-xs text-gray-400 w-16">{offlineCharColorDraft}</span>
                        </div>
                      </div>
                      
                      {/* 语言/对话颜色 */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">引号内语言</span>
                        <div className="flex items-center gap-2">
                          <label className="relative w-8 h-8 rounded-lg border border-gray-200 cursor-pointer overflow-hidden">
                            <input
                              type="color"
                              value={offlineDialogColorDraft}
                              onChange={(e) => {
                                const color = e.target.value
                                setOfflineDialogColorDraft(color)
                                updateCharacter(character.id, { offlineDialogColor: color })
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div 
                              className="w-full h-full"
                              style={{ backgroundColor: offlineDialogColorDraft }}
                            />
                          </label>
                          <span className="text-xs text-gray-400 w-16">{offlineDialogColorDraft}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* 字体选择 */}
                    <div className="space-y-3 pt-2 border-t border-gray-100">
                      <div className="text-sm text-gray-700 font-medium">叙事字体</div>
                      <select
                        value={offlineFontIdDraft}
                        onChange={(e) => {
                          setOfflineFontIdDraft(e.target.value)
                          updateCharacter(character.id, { offlineFontId: e.target.value || undefined })
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/50 bg-white"
                      >
                        <option value="">跟随全局字体</option>
                        {getAllFontOptions().map((font) => (
                          <option key={font.id} value={font.id}>{font.name}</option>
                        ))}
                      </select>
                      <div className="text-[11px] text-gray-400">设置线下模式的叙事文字字体，留空则使用全局设置</div>
                    </div>

                    {/* 文字样式 */}
                    <div className="space-y-3 pt-2 border-t border-gray-100">
                      <div className="text-sm text-gray-700 font-medium">文字样式</div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">旁白部分</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next = !offlineNarrationItalicDraft
                              setOfflineNarrationItalicDraft(next)
                              updateCharacter(character.id, { offlineNarrationItalic: next })
                            }}
                            className={`px-2 py-1 rounded-lg text-xs border ${
                              offlineNarrationItalicDraft ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-600'
                            }`}
                          >
                            斜体
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = !offlineNarrationBoldDraft
                              setOfflineNarrationBoldDraft(next)
                              updateCharacter(character.id, { offlineNarrationBold: next })
                            }}
                            className={`px-2 py-1 rounded-lg text-xs border ${
                              offlineNarrationBoldDraft ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-600'
                            }`}
                          >
                            加粗
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">引号部分</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next = !offlineQuoteItalicDraft
                              setOfflineQuoteItalicDraft(next)
                              updateCharacter(character.id, { offlineQuoteItalic: next })
                            }}
                            className={`px-2 py-1 rounded-lg text-xs border ${
                              offlineQuoteItalicDraft ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-600'
                            }`}
                          >
                            斜体
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = !offlineQuoteBoldDraft
                              setOfflineQuoteBoldDraft(next)
                              updateCharacter(character.id, { offlineQuoteBold: next })
                            }}
                            className={`px-2 py-1 rounded-lg text-xs border ${
                              offlineQuoteBoldDraft ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-600'
                            }`}
                          >
                            加粗
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] text-gray-400">
                        说明：旁白=不在引号内的叙述；引号=角色台词。支持 “…”、"..."、「...」 三种常见引号。
                      </div>
                    </div>
                    
                    {/* 文字底图透明度 */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-medium">文字底图透明度</span>
                        <span className="text-xs text-gray-400">{offlineTextBgOpacityDraft}%</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={offlineTextBgOpacityDraft}
                        onChange={(e) => {
                          const val = Number(e.target.value)
                          setOfflineTextBgOpacityDraft(val)
                          updateCharacter(character.id, { offlineTextBgOpacity: val })
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-500"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400">
                        <span>透明</span>
                        <span>不透明</span>
                      </div>
                      <div className="text-[11px] text-gray-400">调整线下模式聊天文字下方白色底图的透明度</div>
                    </div>
                    
                    {/* 输出字数范围 */}
                    <div className="space-y-3 pt-2 border-t border-gray-100">
                      <div className="text-xs text-gray-500 font-medium">对方输出字数范围</div>
                      
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 mb-1 block">最少</label>
                          <input
                            type="number"
                            min={10}
                            max={500}
                            value={offlineMinLengthDraft}
                            onChange={(e) => {
                              const val = Math.max(10, Math.min(500, Number(e.target.value) || 10))
                              setOfflineMinLengthDraft(val)
                              updateCharacter(character.id, { offlineMinLength: val })
                            }}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/50"
                          />
                        </div>
                        <span className="text-gray-400 mt-5">~</span>
                        <div className="flex-1">
                          <label className="text-xs text-gray-500 mb-1 block">最多</label>
                          <input
                            type="number"
                            min={50}
                            max={5000}
                            value={offlineMaxLengthDraft}
                            onChange={(e) => {
                              const val = Math.max(50, Math.min(5000, Number(e.target.value) || 300))
                              setOfflineMaxLengthDraft(val)
                              updateCharacter(character.id, { offlineMaxLength: val })
                            }}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/50"
                          />
                        </div>
                        <span className="text-xs text-gray-400 mt-5">字</span>
                      </div>
                      
                      {/* 预设快捷选项 */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {[
                          { label: '简短', min: 30, max: 100 },
                          { label: '适中', min: 50, max: 300 },
                          { label: '详细', min: 100, max: 500 },
                          { label: '长文', min: 200, max: 1000 },
                          { label: '超长', min: 500, max: 3000 },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setOfflineMinLengthDraft(preset.min)
                              setOfflineMaxLengthDraft(preset.max)
                              updateCharacter(character.id, { 
                                offlineMinLength: preset.min, 
                                offlineMaxLength: preset.max 
                              })
                            }}
                            className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                              offlineMinLengthDraft === preset.min && offlineMaxLengthDraft === preset.max
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* 预览效果 */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <div className="text-sm text-gray-700 font-medium">预览效果</div>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                        <div
                          className="text-sm text-right"
                          style={{
                            color: offlineUserColorDraft,
                            fontStyle: offlineNarrationItalicDraft ? 'italic' : 'normal',
                            fontWeight: offlineNarrationBoldDraft ? 600 : 400,
                          }}
                        >
                          我轻轻靠近，<span
                            style={{
                              color: offlineDialogColorDraft,
                              fontStyle: offlineQuoteItalicDraft ? 'italic' : 'normal',
                              fontWeight: offlineQuoteBoldDraft ? 600 : 400,
                            }}
                          >"你在想什么？"</span>
                        </div>
                        <div
                          className="text-sm"
                          style={{
                            color: offlineCharColorDraft,
                            fontStyle: offlineNarrationItalicDraft ? 'italic' : 'normal',
                            fontWeight: offlineNarrationBoldDraft ? 600 : 400,
                          }}
                        >
                          TA抬起头，眼中闪过一丝温柔，<span
                            style={{
                              color: offlineDialogColorDraft,
                              fontStyle: offlineQuoteItalicDraft ? 'italic' : 'normal',
                              fontWeight: offlineQuoteBoldDraft ? 600 : 400,
                            }}
                          >"在想你呀。"</span>
                        </div>
                      </div>
                      <div className="text-[11px] text-green-600 bg-green-50 rounded-lg px-3 py-2 mt-2">
                        ✓ 颜色和字数设置已自动保存，返回聊天后所有历史消息都会应用新颜色
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 记忆功能 */}
            <div
              className="flex items-center justify-between px-4 py-4 border-t border-gray-100 cursor-pointer active:bg-gray-50"
              onClick={() => {
                setMemoryRoundsDraft(character.memoryRounds || 100)
                setMemorySummaryDraft(character.memorySummary || '')
                setSummaryRoundsDraft(50)
                setShowMemorySettings(true)
              }}
            >
              <div className="flex flex-col">
                <span className="text-[#000]">记忆功能</span>
                <span className="text-xs text-gray-400 mt-0.5">回合数越大越不失忆，但会更慢</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{Math.min(1000, Math.max(1, character.memoryRounds || 100))} 回合</span>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* 聊天记录导入/导出（跨设备迁移） */}
            <div
              className="flex items-center justify-between px-4 py-4 border-t border-gray-100 cursor-pointer active:bg-gray-50"
              onClick={() => setChatHistoryTransferOpen(true)}
            >
              <div className="flex flex-col">
                <span className="text-[#000]">聊天记录导入/导出</span>
                <span className="text-xs text-gray-400 mt-0.5">换设备也能恢复对话（含长期记忆）</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{chatHistoryBusy ? '处理中…' : ''}</span>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* 时间同步 */}
            <div
              className="flex items-center justify-between px-4 py-4 border-t border-gray-100 cursor-pointer active:bg-gray-50"
              onClick={() => {
                setTimeSyncEnabledDraft(character.timeSyncEnabled !== false)
                setManualTimeDraft(character.manualTime || '')
                setShowTimeSyncSettings(true)
              }}
            >
              <div className="flex flex-col">
                <span className="text-[#000]">时间同步</span>
                <span className="text-xs text-gray-400 mt-0.5">影响TA的作息/对白时间感</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{character.timeSyncEnabled !== false ? '已开启' : '手动'}</span>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* 隐藏时间戳（仅UI显示，不影响时间感知） */}
            <div className="flex items-center justify-between px-4 py-4 border-t border-gray-100">
              <div className="flex flex-col">
                <span className="text-[#000]">隐藏时间戳</span>
                <span className="text-xs text-gray-400 mt-0.5">只隐藏气泡下方的小时间，不影响“时间同步/时间感知”</span>
              </div>
              <button
                type="button"
                onClick={() => updateCharacter(character.id, { hideBubbleTimestamps: !(character?.hideBubbleTimestamps ?? false) })}
                className={`w-12 h-7 rounded-full transition-colors relative ${(character?.hideBubbleTimestamps ?? false) ? 'bg-[#07C160]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${(character?.hideBubbleTimestamps ?? false) ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* 拍一拍开关 */}
            <div className="flex items-center justify-between px-4 py-4 border-t border-gray-100">
              <div className="flex flex-col">
                <span className="text-[#000]">拍一拍</span>
                <span className="text-xs text-gray-400 mt-0.5">点击头像触发拍一拍效果</span>
              </div>
              <button
                type="button"
                onClick={() => updateCharacter(character.id, { patEnabled: !(character?.patEnabled ?? true) })}
                className={`w-12 h-7 rounded-full transition-colors relative ${(character?.patEnabled ?? true) ? 'bg-[#07C160]' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${(character?.patEnabled ?? true) ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* 拍一拍设置（仅开启时显示） */}
            {(character?.patEnabled ?? true) && (
              <div
                className="flex items-center justify-between px-4 py-4 border-t border-gray-100 cursor-pointer active:bg-gray-50"
                onClick={() => {
                  setPatMeTextDraft(character?.patMeText || '拍了拍我的小脑袋')
                  setPatThemTextDraft(character?.patThemText || '拍了拍TA的肩膀')
                  setShowPatSettings(true)
                }}
              >
                <div className="flex flex-col">
                  <span className="text-[#000]">拍一拍设置</span>
                  <span className="text-xs text-gray-400 mt-0.5">自定义拍一拍内容</span>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            )}
            
            {/* 语音设置 */}
            <div
              className="flex items-center justify-between px-4 py-4 border-t border-gray-100 cursor-pointer active:bg-gray-50"
              onClick={() => {
                setVoiceEnabledDraft(character.voiceEnabled ?? false)
                setVoiceIdDraft(character.voiceId || '')
                setVoiceFrequencyDraft(character.voiceFrequency || 'sometimes')
                setShowVoiceSettings(true)
              }}
            >
              <div className="flex flex-col">
                <span className="text-[#000]">语音设置</span>
                <span className="text-xs text-gray-400 mt-0.5">让TA用语音回复你</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">
                  {!ttsConfig.enabled ? '未配置' : character.voiceEnabled ? '已开启' : '已关闭'}
                </span>
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>

          {/* 清除背景 */}
          {character.chatBackground && (
            <div className="bg-transparent mt-2">
              <div 
                className="flex items-center justify-center px-4 py-4 cursor-pointer active:bg-gray-50"
                onClick={() => updateCharacter(character.id, { chatBackground: '' })}
              >
                <span className="text-[#576B95]">清除聊天背景</span>
              </div>
            </div>
          )}

          {/* 删除角色 */}
          <div className="bg-transparent mt-4">
            <div 
              className="flex items-center justify-center px-4 py-4 cursor-pointer active:bg-gray-50"
              onClick={handleDelete}
            >
              <span className="text-red-500">删除角色</span>
            </div>
          </div>

          <div className="h-6" />
        </div>

        {/* 人设选择弹窗 */}
        {showPersonaSelector && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-end">
            <div className="w-full bg-white rounded-t-2xl max-h-[60%] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <span className="font-semibold text-[#000]">选择我的人设</span>
                <button type="button" onClick={() => setShowPersonaSelector(false)} className="text-gray-500">
                  关闭
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {/* 不使用人设选项 */}
                <div
                  onClick={() => {
                    updateCharacter(character.id, { selectedUserPersonaId: null })
                    setShowPersonaSelector(false)
                  }}
                  className={`p-3 rounded-xl cursor-pointer ${
                    !character.selectedUserPersonaId ? 'bg-[#07C160]/10 border border-[#07C160]' : 'bg-gray-50'
                  }`}
                >
                  <span className="text-[#000]">不使用人设</span>
                </div>
                
                {userPersonas.map(persona => (
                  <div
                    key={persona.id}
                    onClick={() => {
                      updateCharacter(character.id, { selectedUserPersonaId: persona.id })
                      setShowPersonaSelector(false)
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer ${
                      character.selectedUserPersonaId === persona.id ? 'bg-[#07C160]/10 border border-[#07C160]' : 'bg-gray-50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200">
                      {persona.avatar ? (
                        <img src={persona.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-white">
                          {persona.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-[#000]">{persona.name}</div>
                      {persona.description && (
                        <div className="text-xs text-gray-500 truncate">{persona.description}</div>
                      )}
                    </div>
                  </div>
                ))}
                
                {userPersonas.length === 0 && (
                  <div className="text-center text-gray-400 py-8">
                    还没有人设，请在"我"页面中添加
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 表情包管理弹窗 */}
        {showStickerManager && (
          <div className="absolute inset-0 bg-white z-50 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <button type="button" onClick={() => setShowStickerManager(false)} className="text-[#000]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="font-semibold text-[#000]">表情包管理</span>
              <div className="w-5" />
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {/* 情绪分类管理 */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-[#000]">情绪分类</div>
                  <button
                    type="button"
                    onClick={() => setShowCategoryManager(true)}
                    className="text-[#07C160] text-xs"
                  >
                    管理分类
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  AI会随机夹带你为本角色配置的表情包（不再按情绪关键词匹配）。
                </p>
                <div className="flex flex-wrap gap-2">
                  {stickerCategories.length === 0 ? (
                    <span className="text-gray-400 text-xs">暂无分类，点击"管理分类"添加</span>
                  ) : (
                    stickerCategories.map(cat => (
                      <span key={cat.id} className="px-3 py-1 bg-purple-100 text-purple-600 rounded-full text-xs">
                        {cat.name}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* 添加表情包（本角色） */}
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="text-sm font-medium text-[#000] mb-1">添加表情包（本角色）</div>
                <div className="text-xs text-gray-500 mb-3">角色会按情绪夹带你配置的表情包，不需要关键词。</div>
                
                <div className="flex gap-3 items-start">
                  <div 
                    className="w-16 h-16 rounded-lg bg-white border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer overflow-hidden"
                    onClick={() => stickerInputRef.current?.click()}
                  >
                    {newStickerImage ? (
                      <img src={newStickerImage} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-gray-400 text-xl">+</span>
                    )}
                  </div>
                  <input
                    ref={stickerInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleStickerImageSelect}
                  />
                  
                  <div className="flex-1">
                    {/* 链接导入 */}
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newStickerUrl}
                        onChange={(e) => setNewStickerUrl(e.target.value)}
                        placeholder="粘贴图片链接（可选）"
                        className="flex-1 px-3 py-2 rounded-lg bg-white border border-gray-200 outline-none text-[#000] text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const url = newStickerUrl.trim()
                          if (!url) {
                            setDialog({ open: true, title: '提示', message: '请输入图片链接' })
                            return
                          }
                          if (!url.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i) && !url.match(/^https?:\/\//i)) {
                            // 宽松检查，只要是 http(s) 开头就允许尝试
                          }
                          setNewStickerImage(url)
                          setNewStickerUrl('')
                        }}
                        className="px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300"
                      >
                        加载
                      </button>
                    </div>
                    
                    {/* 情绪分类选择 */}
                    <select
                      value={newStickerCategory}
                      onChange={(e) => setNewStickerCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 outline-none text-[#000] text-sm"
                    >
                      <option value="">选择情绪分类（可选）</option>
                      {stickerCategories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                      ))}
                    </select>
                    
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddSticker}
                        className="px-4 py-1.5 bg-[#07C160] text-white text-sm rounded-full"
                      >
                        添加
                      </button>
                      <span className="text-xs text-gray-400">点击左边图框选择本地图片</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 已绑定（本角色） */}
              <div className="text-sm font-medium text-[#000] mb-3">已绑定（本角色）({myStickers.length})</div>
              
              {myStickers.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">
                  暂无表情包
                </div>
              ) : (
                <div className="space-y-2">
                  {stickersGrouped.keys.map((cat) => {
                    const list = stickersGrouped.map[cat] || []
                    const open = !!stickerGroupsExpanded[cat]
                    return (
                      <div key={cat} className="bg-gray-50 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setStickerGroupsExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))}
                          className="w-full px-4 py-3 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-[#000] truncate">{cat}</span>
                            <span className="text-[11px] text-gray-400">{list.length} 个</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-gray-400">{open ? '收起' : '展开'}</span>
                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </button>
                        {open && (
                          <div className="px-4 pb-3 space-y-2">
                            {list.map(sticker => (
                              <div key={sticker.id} className="flex items-center gap-3 p-3 bg-white rounded-xl">
                                <img src={sticker.imageUrl} alt="" className="w-10 h-10 object-contain rounded" />
                                <div className="flex-1">
                                  <div className="text-xs text-gray-400 flex items-center gap-2">
                                    <span>已绑定</span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setShowAddToOthers(sticker.id)}
                                  className="text-[#07C160] text-xs"
                                >
                                  添加到其他
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const bound = Array.isArray((sticker as any).boundCharacterIds) ? (sticker as any).boundCharacterIds : []
                                    const next = bound.filter((x: any) => String(x || '').trim() !== character.id)
                                    // 角色内“删除”=解绑，不删除总库资产
                                    updateSticker(sticker.id, { boundCharacterIds: next.length > 0 ? next : undefined })
                                  }}
                                  className="text-red-500 text-xs"
                                >
                                  移除
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 从公共库添加 */}
              <div className="mt-5 text-sm font-medium text-[#000] mb-3">从公共库添加</div>
              <div className="text-xs text-gray-500 mb-3">
                先在设置App里把表情包导入到“公共库”，再在这里一键添加到本角色。
              </div>

              {publicOnlyStickers.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-6">
                  公共库暂无可添加的表情包
                </div>
              ) : (
                <div className="space-y-2">
                  {publicGrouped.keys.map((cat) => {
                    const list = publicGrouped.map[cat] || []
                    const open = !!publicGroupsExpanded[cat]
                    return (
                      <div key={cat} className="bg-gray-50 rounded-xl overflow-hidden">
                        <div className="w-full px-4 py-3 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setPublicGroupsExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))}
                            className="flex items-center gap-2 min-w-0"
                          >
                            <span className="text-sm font-medium text-[#000] truncate">{cat}</span>
                            <span className="text-[11px] text-gray-400">{list.length} 个</span>
                            <span className="text-[11px] text-gray-400 ml-1">{open ? '收起' : '展开'}</span>
                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            disabled={list.length === 0}
                            onClick={() => {
                              // 一键导入：把公共库该分类全部同步到本角色（publicOnlyStickers 已去重）
                              for (const s of list) addStickerToCharacter(s.id, character.id)
                              setDialog({
                                open: true,
                                title: '已一键导入',
                                message: `已将「${cat}」分类的 ${list.length} 个表情包添加到本角色。`,
                                confirmText: '好',
                              })
                            }}
                            className="flex-shrink-0 px-3 py-1.5 rounded-full bg-[#07C160]/10 text-[#07C160] text-[11px] font-semibold disabled:opacity-40"
                          >
                            一键导入
                          </button>
                        </div>
                        {open && (
                          <div className="px-4 pb-3 space-y-2">
                            {list.map(sticker => (
                              <div key={sticker.id} className="flex items-center gap-3 p-3 bg-white rounded-xl">
                                <img src={sticker.imageUrl} alt="" className="w-10 h-10 object-contain rounded" />
                                <div className="flex-1">
                                  <div className="text-xs text-gray-400">公共库</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    addStickerToCharacter(sticker.id, character.id)
                                    setDialog({
                                      open: true,
                                      title: '已添加到本角色',
                                      message: '现在这个角色就会按情绪夹带这张表情包了。',
                                      confirmText: '好',
                                    })
                                  }}
                                  className="text-[#07C160] text-xs"
                                >
                                  添加到本角色
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 添加到其他角色弹窗 */}
            {showAddToOthers && (
              <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl w-full max-h-[70%] flex flex-col">
                  <div className="flex items-center justify-between p-4 border-b">
                    <span className="font-semibold text-[#000]">选择角色</span>
                    <button type="button" onClick={() => setShowAddToOthers(null)} className="text-gray-500">
                      关闭
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    {characters.filter(c => c.id !== character.id).map(c => (
                      <div
                        key={c.id}
                        onClick={() => {
                          addStickerToCharacter(showAddToOthers, c.id)
                          setShowAddToOthers(null)
                        }}
                        className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-gray-50"
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200">
                          {c.avatar ? (
                            <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white">
                              {c.name[0]}
                            </div>
                          )}
                        </div>
                        <span className="text-[#000]">{c.name}</span>
                      </div>
                    ))}
                    {characters.filter(c => c.id !== character.id).length === 0 && (
                      <div className="text-center text-gray-400 py-8">
                        没有其他角色
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 情绪分类管理弹窗 */}
            {showCategoryManager && (
              <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl w-full max-h-[70%] flex flex-col">
                  <div className="flex items-center justify-between p-4 border-b">
                    <span className="font-semibold text-[#000]">情绪分类管理</span>
                    <button type="button" onClick={() => setShowCategoryManager(false)} className="text-gray-500">
                      关闭
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <p className="text-xs text-gray-500 mb-4">
                      创建情绪分类后，添加表情包时可以选择分类。AI聊天时会根据情绪自动选择对应分类的表情包发送。
                    </p>
                    
                    {/* 添加新分类 */}
                    <div className="flex gap-2 mb-4">
                      <input
                        type="text"
                        placeholder="输入分类名称（如：开心、难过、生气）"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 outline-none text-[#000] text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        className="px-4 py-2 bg-[#07C160] text-white text-sm rounded-lg"
                      >
                        添加
                      </button>
                    </div>
                    
                    {/* 分类列表 */}
                    {stickerCategories.length === 0 ? (
                      <div className="text-center text-gray-400 py-8">
                        暂无分类
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {stickerCategories.map(cat => (
                          <div key={cat.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                            <span className="text-[#000]">{cat.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setDialog({
                                  open: true,
                                  title: '删除分类？',
                                  message: `确定删除「${cat.name}」分类吗？\n（不会删除表情包图片，但会清空它们的分类标签）`,
                                  confirmText: '删除',
                                  cancelText: '取消',
                                  danger: true,
                                  onConfirm: () => removeStickerCategory(cat.id),
                                })
                              }}
                              className="text-red-500 text-xs"
                            >
                              删除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 聊天记录导入/导出弹窗 */}
      {chatHistoryTransferOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => (chatHistoryBusy ? null : setChatHistoryTransferOpen(false))}
            role="presentation"
          />
          <div className="relative w-full max-w-[340px] rounded-2xl bg-white p-4 shadow-xl">
            <div className="text-center font-bold text-[#111] mb-2">聊天记录导入/导出</div>
            <div className="text-[12px] text-gray-600 bg-gray-50 rounded-xl p-3 mb-3 leading-relaxed">
              - 导出：会导出本角色的全部聊天记录 + 长期记忆摘要<br />
              - 导入：会覆盖本角色当前聊天记录（用于换设备恢复）
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={chatHistoryBusy}
                onClick={() => {
                  exportChatHistory()
                  setChatHistoryTransferOpen(false)
                }}
                className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium active:scale-[0.98] ${
                  chatHistoryBusy ? 'bg-gray-100 text-gray-400' : 'bg-[#07C160] text-white'
                }`}
              >
                导出
              </button>
              <button
                type="button"
                disabled={chatHistoryBusy}
                onClick={() => {
                  setChatHistoryTransferOpen(false)
                  setDialog({
                    open: true,
                    title: '导入会覆盖当前聊天',
                    message: '确定导入吗？（建议先导出备份一份再导入）',
                    confirmText: '继续导入',
                    cancelText: '取消',
                    danger: true,
                    onConfirm: () => triggerImportChatHistory(),
                  })
                }}
                className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium active:scale-[0.98] ${
                  chatHistoryBusy ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-700'
                }`}
              >
                导入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 隐藏的导入文件输入 */}
      <input
        ref={chatHistoryInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files && e.target.files[0]
          handleImportChatHistoryFile(f || null)
        }}
      />

      <WeChatDialog
        open={dialog.open}
        title={dialog.title}
        message={dialog.message}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        danger={dialog.danger}
        onCancel={() => setDialog({ open: false })}
        onConfirm={() => {
          const cb = dialog.onConfirm
          setDialog({ open: false })
          cb?.()
        }}
      />

      {/* 添加好友后的提示（记忆已导入） */}
      <WeChatDialog
        open={postAddTipOpen}
        title="已自动导入"
        message={'人物设定与自动导入：对话要点已经导入到聊天设置里的「记忆功能」。'}
        confirmText="去查看记忆"
        cancelText="不看了"
        onCancel={() => setPostAddTipOpen(false)}
        onConfirm={() => {
          setPostAddTipOpen(false)
          setShowMemorySettings(true)
        }}
      />
      
      {/* 导出角色卡弹窗 */}
      {showExportCard && (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowExportCard(false)} role="presentation" />
          <div className="relative w-full max-w-[340px] rounded-2xl bg-white p-4 shadow-xl">
            <div className="text-center font-bold text-[#111] mb-2">导出角色卡</div>
            <div className="p-3 bg-green-50 rounded-xl mb-3">
              <div className="text-[12px] text-green-700 font-medium mb-1">已导出内容：</div>
              <div className="text-[11px] text-green-600 space-y-0.5">
                <div>• 头像、名字、性别</div>
                <div>• 人设提示词</div>
                <div>• 生日、称呼、关系</div>
                <div>• 国籍、语言设置</div>
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded-xl mb-3">
              <div className="text-[12px] text-gray-500 font-medium mb-1">未导出（隐私保护）：</div>
              <div className="text-[11px] text-gray-400">
                聊天记录、记忆、表情包、气泡、背景等
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyCharacterCard}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-[13px] font-medium text-gray-700 active:scale-[0.98]"
              >
                复制
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadCharacterCard()
                  setShowExportCard(false)
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#07C160] text-[13px] font-medium text-white active:scale-[0.98]"
              >
                下载文件
              </button>
            </div>
          </div>
        </div>
      )}

      <WeChatDialog
        open={langDialog.open}
        title="语言提示"
        message={
          '你选择了中文以外的语言。\n' +
          '- 该角色会用此语言输出（聊天/日记/朋友圈/情侣空间等）。\n' +
          '- 翻译开关默认开启，可在本页随时关闭。\n' +
          '- 关闭后：聊天（线上/线下）/日记/朋友圈/X/朋友圈等都不再显示该角色翻译。\n'
        }
        hideDefaultActions
        footer={
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="w-full rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #34d399 0%, #07C160 100%)' }}
              onClick={() => {
                prevEditLangRef.current = langDialog.lang
                setEditLanguage(langDialog.lang)
                setEditChatTranslationEnabled(true)
                setLangDialog({ open: false, lang: 'zh' })
              }}
            >
              知道了
            </button>
            <button
              type="button"
              className="w-full rounded-full border border-black/10 bg-white/40 px-4 py-2 text-[13px] font-medium text-[#666] active:scale-[0.98]"
              onClick={() => {
                const prev = prevEditLangRef.current || 'zh'
                setEditLanguage(prev)
                setEditChatTranslationEnabled(prev === 'zh' ? false : editChatTranslationEnabled)
                setLangDialog({ open: false, lang: 'zh' })
              }}
            >
              撤销切换
            </button>
          </div>
        }
        onCancel={() => {
          const prev = prevEditLangRef.current || 'zh'
          setEditLanguage(prev)
          setEditChatTranslationEnabled(prev === 'zh' ? false : editChatTranslationEnabled)
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
                editLanguage === lang ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white/60 border-black/10 text-[#111]'
              }`}
              onClick={() => {
                setLangPickerOpen(false)
                if (lang === 'zh') {
                  prevEditLangRef.current = 'zh'
                  setEditLanguage('zh')
                  setEditChatTranslationEnabled(false)
                  return
                }
                prevEditLangRef.current = editLanguage || 'zh'
                setEditLanguage(lang)
                // 非中文：默认开启聊天翻译（无需用户手动开）
                setEditChatTranslationEnabled(true)
                setLangDialog({ open: true, lang })
              }}
            >
              {languageLabel(lang)}
            </button>
          ))}
        </div>
      </WeChatDialog>

      {/* 记忆功能设置弹窗 */}
      {showMemorySettings && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button type="button" onClick={() => setShowMemorySettings(false)} className="text-gray-500">取消</button>
            <span className="font-medium text-[#000]">记忆功能</span>
            <button
              type="button"
              onClick={() => {
                updateCharacter(character.id, {
                  memoryRounds: Math.min(1000, Math.max(1, Math.floor(memoryRoundsDraft || 100))),
                  memorySummary: memorySummaryDraft,
                  memorySummaryUpdatedAt: Date.now(),
                })
                setShowMemorySettings(false)
              }}
              className="text-[#07C160] font-medium"
            >
              保存
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                <span className="text-sm text-gray-800">{estimateTokens(memorySummaryDraft || '')} Tokens</span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-800 font-medium">读取当前角色总上下文 Token</span>
                <span className="text-sm text-gray-800">
                  {estimatedContextTokens + estimateTokens(memorySummaryDraft || '')} Tokens
                </span>
              </div>
              <div className="px-4 pb-3 text-[11px] text-gray-400">
                说明：总上下文=预估上下文+记忆总结。该统计不包含：角色人设/系统提示词、创作工坊预设、世界书注入、工具/识图等额外提示，也不包含模型输出Token。Token 为预估值（用于参考上下文长度）。
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-sm font-medium text-[#000] mb-1">每次回复读取的历史回合数</div>
              <div className="text-xs text-gray-500 mb-3">默认 100，最大 1000。回合数越大越不失忆，但会影响回复速度。</div>
              <input
                type="number"
                min={1}
                max={1000}
                value={memoryRoundsDraft}
                onChange={(e) => setMemoryRoundsDraft(parseInt(e.target.value || '0', 10))}
                className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 outline-none text-[#000] text-sm"
              />
            </div>

            <div className="bg-gray-50 rounded-xl p-4">
              <div className="text-sm font-medium text-[#000] mb-1">AI 总结（生成长期记忆）</div>
              <div className="text-xs text-gray-500 mb-3">
                你可以把最近 N 回合对话总结成“长期记忆”。以后无论读取多少历史回合，这段记忆都会被每次回复必读。
                记忆叠太多会变慢，你可以随时手动编辑/删改。
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-500 flex-shrink-0">总结回合</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={summaryRoundsDraft}
                  onChange={(e) => setSummaryRoundsDraft(parseInt(e.target.value || '0', 10))}
                  className="flex-1 px-3 py-2 rounded-lg bg-white border border-gray-200 outline-none text-[#000] text-sm"
                />
                <button
                  type="button"
                  disabled={summarizing}
                  onClick={async () => {
                    if (!hasApiConfig) {
                      setDialog({
                        open: true,
                        title: '需要先配置API',
                        message: '请到：手机主屏 → 设置App → API 配置，填写 Base URL / API Key 并选择模型后再使用 AI 总结。',
                        confirmText: '知道了',
                      })
                      return
                    }
                    setSummarizing(true)
                    try {
                      const history = buildHistoryForSummary(messages, summaryRoundsDraft)
                      const prev = (memorySummaryDraft || '').trim()
                      const prompt = `你是“微信聊天记忆整理器”。请把“最近对话”总结为可长期使用的记忆条目，用中文，尽量精简但信息密度高。

要求：
- 输出为 8~20 条要点（短句），每条以“- ”开头
- 只记录稳定事实/关系/偏好/禁忌/重要事件/未解决的问题
- 不要编造，没有信息就不写
- 不要输出任何XML/标签/系统标记

【已有长期记忆（可为空）】
${prev || '（空）'}

【最近对话】
${history}`
                      const summary = await callLLM(
                        [{ role: 'system', content: '你只负责总结，不聊天。' }, { role: 'user', content: prompt }],
                        undefined,
                        { maxTokens: 450, timeoutMs: 600000 }
                      )
                      setMemorySummaryDraft(prevDraft => mergeMemorySummary(prevDraft, summary))
                    } catch (e: any) {
                      setDialog({
                        open: true,
                        title: '总结失败',
                        message: e?.message || '模型调用失败，请稍后重试',
                        confirmText: '知道了',
                      })
                    } finally {
                      setSummarizing(false)
                    }
                  }}
                  className="px-3 py-2 rounded-lg bg-[#07C160] text-white text-sm font-medium disabled:opacity-50"
                >
                  {summarizing ? '总结中…' : '生成'}
                </button>
              </div>

              <div className="text-xs text-gray-500 mb-2">长期记忆（可手动修改）：</div>
              <textarea
                value={memorySummaryDraft}
                onChange={(e) => setMemorySummaryDraft(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 outline-none text-[#000] text-sm resize-none"
                placeholder="这里是长期记忆摘要…（会被每次回复必读）"
              />
            </div>
          </div>
        </div>
      )}

      {/* 时间同步设置弹窗 */}
      {showTimeSyncSettings && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button type="button" onClick={() => setShowTimeSyncSettings(false)} className="text-gray-500">取消</button>
            <span className="font-medium text-[#000]">时间同步</span>
            <button
              type="button"
              onClick={() => {
                updateCharacter(character.id, {
                  timeSyncEnabled: timeSyncEnabledDraft,
                  manualTime: timeSyncEnabledDraft ? '' : manualTimeDraft,
                })
                setShowTimeSyncSettings(false)
              }}
              className="text-[#07C160] font-medium"
            >
              保存
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="text-sm font-medium text-[#000]">与当前时间同步</div>
                  <div className="text-xs text-gray-500 mt-0.5">默认开启。关闭后可手动设置“当前时间”。</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (timeSyncEnabledDraft) {
                      // 从开启切换到关闭时，弹出确认对话框
                      setDialog({
                        open: true,
                        title: '关闭时间同步',
                        message: `关闭后，${character.name}将失去时间感知，例如不会询问你"那么久去做什么了"`,
                        confirmText: '确认关闭',
                        cancelText: '取消',
                        onConfirm: () => setTimeSyncEnabledDraft(false),
                      })
                    } else {
                      // 从关闭切换到开启，直接开启
                      setTimeSyncEnabledDraft(true)
                    }
                  }}
                  className={`w-12 h-7 rounded-full transition-colors ${timeSyncEnabledDraft ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full shadow mt-0.5 transition-transform ${timeSyncEnabledDraft ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            {!timeSyncEnabledDraft && (
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="text-sm font-medium text-[#000] mb-1">手动时间</div>
                <div className="text-xs text-gray-500 mb-3">用于让TA以你设定的时间来理解“现在”。</div>
                <input
                  type="datetime-local"
                  value={manualTimeDraft}
                  onChange={(e) => setManualTimeDraft(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 outline-none text-[#000] text-sm"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* 语音设置弹窗 */}
      {showVoiceSettings && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button type="button" onClick={() => setShowVoiceSettings(false)} className="text-gray-500">取消</button>
            <span className="font-medium text-[#000]">语音设置</span>
            <button
              type="button"
              onClick={() => {
                updateCharacter(character.id, {
                  voiceEnabled: voiceEnabledDraft,
                  voiceId: voiceIdDraft,
                  voiceFrequency: voiceFrequencyDraft,
                })
                setShowVoiceSettings(false)
              }}
              className="text-[#07C160] font-medium"
            >
              保存
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 未配置提示 */}
            {!ttsConfig.enabled && (
              <div className="bg-yellow-50 rounded-xl p-4 text-sm">
                <div className="font-medium text-yellow-800 mb-1">⚠️ 语音功能未配置</div>
                <div className="text-yellow-700 text-xs">
                  请先去「设置 → API配置」中启用 MiniMax 语音功能并填写 API Key。
                </div>
              </div>
            )}

            {/* 启用开关 */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="text-sm font-medium text-[#000]">启用语音回复</div>
                  <div className="text-xs text-gray-500 mt-0.5">TA的部分回复会以语音形式发送</div>
                </div>
                <button
                  type="button"
                  onClick={() => setVoiceEnabledDraft(v => !v)}
                  disabled={!ttsConfig.enabled}
                  className={`w-12 h-7 rounded-full transition-colors ${voiceEnabledDraft && ttsConfig.enabled ? 'bg-green-500' : 'bg-gray-300'} ${!ttsConfig.enabled ? 'opacity-50' : ''}`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full shadow mt-0.5 transition-transform ${voiceEnabledDraft && ttsConfig.enabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            {/* 音色选择 */}
            {voiceEnabledDraft && ttsConfig.enabled && (
              <>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-sm font-medium text-[#000] mb-1">选择音色</div>
                  <div className="text-xs text-gray-500 mb-3">选择TA说话的声音</div>
                  <select
                    value={voiceIdDraft}
                    onChange={(e) => setVoiceIdDraft(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-white border border-gray-200 outline-none text-[#000] text-sm"
                  >
                    <option value="">使用默认音色</option>
                    <optgroup label="系统预设音色">
                      <option value="female-shaonv">少女 - 温柔甜美</option>
                      <option value="female-yujie">御姐 - 成熟知性</option>
                      <option value="female-chengshu">成熟女性 - 稳重大方</option>
                      <option value="female-tianmei">甜美 - 可爱甜蜜</option>
                      <option value="male-qn-qingse">青涩青年 - 年轻活力</option>
                      <option value="male-qn-jingying">精英青年 - 自信干练</option>
                      <option value="male-qn-badao">霸道青年 - 强势霸气</option>
                      <option value="presenter_male">男主持 - 专业播音</option>
                      <option value="presenter_female">女主持 - 专业播音</option>
                      <option value="audiobook_male_1">有声书男 - 温和叙述</option>
                      <option value="audiobook_female_1">有声书女 - 温柔叙述</option>
                    </optgroup>
                    {ttsConfig.customVoices && ttsConfig.customVoices.length > 0 && (
                      <optgroup label="我克隆的音色">
                        {ttsConfig.customVoices.map((v: any) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {/* 频率控制 */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="text-sm font-medium text-[#000] mb-1">发语音频率</div>
                  <div className="text-xs text-gray-500 mb-3">控制TA发语音的频率（语音需要付费，频率越高费用越多）</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'always', label: '总是', desc: '每条都发语音' },
                      { id: 'often', label: '经常', desc: '约50%发语音' },
                      { id: 'sometimes', label: '偶尔', desc: '约20%发语音' },
                      { id: 'rarely', label: '很少', desc: '约5%发语音' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setVoiceFrequencyDraft(opt.id as any)}
                        className={`p-3 rounded-xl text-left transition-colors ${
                          voiceFrequencyDraft === opt.id
                            ? 'bg-green-500 text-white'
                            : 'bg-white border border-gray-200'
                        }`}
                      >
                        <div className={`text-sm font-medium ${voiceFrequencyDraft === opt.id ? 'text-white' : 'text-[#000]'}`}>
                          {opt.label}
                        </div>
                        <div className={`text-xs mt-0.5 ${voiceFrequencyDraft === opt.id ? 'text-white/80' : 'text-gray-500'}`}>
                          {opt.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 费用提示 */}
                <div className="bg-blue-50 rounded-xl p-4 text-xs text-blue-700">
                  💡 语音功能使用 MiniMax API，约 ¥0.1/千字符。频率越低越省钱。
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 气泡设置弹窗 */}
      {showBubbleSettings && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button
              type="button"
              onClick={() => setShowBubbleSettings(false)}
              className="text-gray-500"
            >
              取消
            </button>
            <span className="font-medium text-[#000]">气泡设置</span>
            <button
              type="button"
              onClick={() => {
                const base = bubbleSyncEnabled ? userBubble : undefined
                updateCharacter(character.id, {
                  bubbleSyncEnabled,
                  userBubbleStyle: base ? base : userBubble,
                  charBubbleStyle: base ? base : charBubble,
                  bubbleSize: bubbleSizeDraft,
                })
                setShowBubbleSettings(false)
              }}
              className="text-[#07C160] font-medium"
            >
              保存
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* 预览区域 */}
            <div className="rounded-xl p-4 mb-4" style={getPreviewBgStyle()}>
              <div className="text-xs text-gray-500 mb-3 text-center">预览效果</div>

              {/* 预览背景切换 */}
              <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setPreviewBgMode('checker')}
                  className={`px-2.5 py-1 rounded-full text-[11px] border ${
                    previewBgMode === 'checker' ? 'bg-pink-500 text-white border-pink-500' : 'bg-white/70 text-gray-600 border-white/70'
                  }`}
                >
                  棋盘格
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewBgMode('light')}
                  className={`px-2.5 py-1 rounded-full text-[11px] border ${
                    previewBgMode === 'light' ? 'bg-pink-500 text-white border-pink-500' : 'bg-white/70 text-gray-600 border-white/70'
                  }`}
                >
                  浅色
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewBgMode('dark')}
                  className={`px-2.5 py-1 rounded-full text-[11px] border ${
                    previewBgMode === 'dark' ? 'bg-pink-500 text-white border-pink-500' : 'bg-white/70 text-gray-600 border-white/70'
                  }`}
                >
                  深色
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewBgMode('custom')}
                  className={`px-2.5 py-1 rounded-full text-[11px] border ${
                    previewBgMode === 'custom' ? 'bg-pink-500 text-white border-pink-500' : 'bg-white/70 text-gray-600 border-white/70'
                  }`}
                >
                  自定义
                </button>
                {previewBgMode === 'custom' && (
                  <input
                    type="color"
                    value={previewBgColor}
                    onChange={(e) => setPreviewBgColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border border-white/70 bg-white/70"
                    title="选择预览背景颜色"
                  />
                )}
              </div>

              {/* 双方同步开关 */}
              <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-xl bg-white/55">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-gray-700">双方同步气泡</span>
                  <span className="text-[11px] text-gray-500 mt-0.5">开启后，你改一次，两边自动用同一套气泡</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBubbleSyncEnabled(v => {
                      const next = !v
                      if (next) {
                        // 开启时立即同步一次（以“我的气泡”为准）
                        setCharBubble(userBubble)
                      }
                      return next
                    })
                  }}
                  className={`w-12 h-7 rounded-full transition-colors ${bubbleSyncEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full shadow mt-0.5 transition-transform ${bubbleSyncEnabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* 气泡大小 */}
              <div className="mb-3 px-3 py-2 rounded-xl bg-white/55">
                <div className="text-xs font-medium text-gray-700">气泡大小（头像联动）</div>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[
                    { id: 'xs', label: '超小号' },
                    { id: 'sm', label: '小号' },
                    { id: 'md', label: '中号' },
                    { id: 'lg', label: '大号' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setBubbleSizeDraft(s.id as any)}
                      className={`py-1.5 rounded-lg text-[11px] border ${
                        bubbleSizeDraft === s.id
                          ? 'bg-pink-500 text-white border-pink-500'
                          : 'bg-white/80 text-gray-600 border-white/70'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 对方消息 */}
              <div className="flex gap-2 mb-3">
                <div className={`${
                  bubbleSizeDraft === 'xs' ? 'w-6 h-6 text-[10px]' :
                  bubbleSizeDraft === 'sm' ? 'w-7 h-7 text-[11px]' :
                  bubbleSizeDraft === 'lg' ? 'w-9 h-9 text-[13px]' :
                  'w-8 h-8 text-xs'
                } rounded-lg bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white flex-shrink-0`}>
                  {character.name[0]}
                </div>
                <div 
                  className={`rounded-2xl rounded-tl-md max-w-[70%] ${
                    bubbleSizeDraft === 'xs' ? 'px-2 py-1.5 text-[11px]' :
                    bubbleSizeDraft === 'sm' ? 'px-2.5 py-1.5 text-[12px]' :
                    bubbleSizeDraft === 'lg' ? 'px-4 py-3 text-[16px]' :
                    'px-3 py-2 text-sm'
                  }`}
                  style={getPreviewBubbleStyle(charBubble, false)}
                >
                  你好呀~
                </div>
              </div>
              
              {/* 我的消息 */}
              <div className="flex gap-2 flex-row-reverse">
                <div className={`${
                  bubbleSizeDraft === 'xs' ? 'w-6 h-6 text-[10px]' :
                  bubbleSizeDraft === 'sm' ? 'w-7 h-7 text-[11px]' :
                  bubbleSizeDraft === 'lg' ? 'w-9 h-9 text-[13px]' :
                  'w-8 h-8 text-xs'
                } rounded-lg bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white flex-shrink-0`}>
                  我
                </div>
                <div 
                  className={`rounded-2xl rounded-tr-md max-w-[70%] ${
                    bubbleSizeDraft === 'xs' ? 'px-2 py-1.5 text-[11px]' :
                    bubbleSizeDraft === 'sm' ? 'px-2.5 py-1.5 text-[12px]' :
                    bubbleSizeDraft === 'lg' ? 'px-4 py-3 text-[16px]' :
                    'px-3 py-2 text-sm'
                  }`}
                  style={getPreviewBubbleStyle(userBubble, true)}
                >
                  嗨~今天心情怎么样？
                </div>
              </div>
            </div>

            {/* 切换编辑对象 */}
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setEditingBubble('user')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  editingBubble === 'user' 
                    ? 'bg-pink-500 text-white' 
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                我的气泡
              </button>
              <button
                type="button"
                onClick={() => setEditingBubble('char')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  editingBubble === 'char' 
                    ? 'bg-pink-500 text-white' 
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {character.name}的气泡
              </button>
            </div>
            <div className="text-[11px] text-gray-400 mb-4">
              先选“质感预设编号”，再调颜色/透明度会更快出效果。
            </div>

            {/* 颜色设置 */}
            {(() => {
              const bubble = editingBubble === 'user' ? userBubble : charBubble
              const setBubble = editingBubble === 'user' ? setUserBubble : setCharBubble
              
              // 透明度快捷选项
              const opacityOptions = [0, 25, 50, 75, 100]
              
              const texturePresets = [
                // 每个预设都给一套“更好看”的默认配色/透明度/边框（你仍可继续手动调）
                { id: '01', name: '奶油雾面', bg: '#FFE4F2', border: '#FF8BC7', bgOpacity: 92, borderOpacity: 18, text: '#111827' },
                { id: '02', name: '冰透玻璃', bg: '#FFFFFF', border: '#FFFFFF', bgOpacity: 40, borderOpacity: 35, text: '#111827' },
                { id: '03', name: '糖果渐变', bg: '#FFD6E8', border: '#FF67B2', bgOpacity: 78, borderOpacity: 22, text: '#111827' },
                { id: '04', name: '漫画描边（推荐）', bg: '#FFFFFF', border: '#111827', bgOpacity: 96, borderOpacity: 85, text: '#111827' },
                { id: '05', name: '果冻 3D（推荐）', bg: '#E9D5FF', border: '#A855F7', bgOpacity: 72, borderOpacity: 20, text: '#111827' },
                { id: '06', name: '霓虹双边', bg: '#0B1220', border: '#22D3EE', bgOpacity: 55, borderOpacity: 60, text: '#FFFFFF' },
                { id: '07', name: '纸感虚线', bg: '#FFF7ED', border: '#FB7185', bgOpacity: 92, borderOpacity: 40, text: '#111827' },
                { id: '08', name: '暗夜磨砂', bg: '#111827', border: '#FFFFFF', bgOpacity: 62, borderOpacity: 18, text: '#FFFFFF' },
                { id: '09', name: '波点可爱', bg: '#FFF1F2', border: '#FB7185', bgOpacity: 88, borderOpacity: 18, text: '#111827' },
                { id: '10', name: '条纹清爽（推荐）', bg: '#ECFEFF', border: '#06B6D4', bgOpacity: 86, borderOpacity: 18, text: '#111827' },
                { id: '11', name: '网格极简（推荐）', bg: '#F3F4F6', border: '#9CA3AF', bgOpacity: 92, borderOpacity: 18, text: '#111827' },
                { id: '12', name: '闪粉梦幻', bg: '#FDE68A', border: '#F472B6', bgOpacity: 72, borderOpacity: 18, text: '#111827' },
                { id: '13', name: '全息渐变（推荐）', bg: '#FFFFFF', border: '#A78BFA', bgOpacity: 60, borderOpacity: 28, text: '#111827' },
                { id: '14', name: '樱花贴纸（推荐）', bg: '#FFE4E6', border: '#FB7185', bgOpacity: 90, borderOpacity: 22, text: '#111827' },
                { id: '15', name: '薄荷贴纸（推荐）', bg: '#D1FAE5', border: '#10B981', bgOpacity: 86, borderOpacity: 18, text: '#111827' },
                { id: '16', name: '黑金质感', bg: '#0A0A0A', border: '#F59E0B', bgOpacity: 70, borderOpacity: 28, text: '#FFFFFF' },
              ]

              return (
                <div className="space-y-4" style={{ touchAction: 'pan-y' }}>
                  {/* 质感预设 */}
                  <div>
                    <span className="text-sm text-gray-700 block mb-2">质感方案（编号）</span>
                    <div className="flex flex-wrap gap-2">
                      {texturePresets.map(p => {
                        const active = (bubble.presetId || '01') === p.id
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setBubble({
                              ...bubble,
                              presetId: p.id,
                              bgColor: p.bg,
                              borderColor: p.border,
                              bgOpacity: p.bgOpacity,
                              borderOpacity: p.borderOpacity,
                              textColor: p.text,
                            })}
                            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                              active ? 'bg-pink-500 text-white border-pink-500' : 'bg-white text-gray-600 border-gray-200'
                            }`}
                          >
                            {p.id} {p.name}
                          </button>
                        )
                      })}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-2">
                      提示：质感叠得太复杂可能会稍微影响性能；不喜欢就换回 01 或 10。
                    </div>
                  </div>

                  {/* 气泡背景底色 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-700">气泡背景底色</span>
                      <input
                        type="color"
                        value={bubble.bgColor}
                        onChange={(e) => setBubble({ ...bubble, bgColor: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 flex-shrink-0">透明度</span>
                      <div className="flex-1 flex gap-1">
                        {opacityOptions.map(op => (
                          <button
                            key={op}
                            type="button"
                            onClick={() => setBubble({ ...bubble, bgOpacity: op })}
                            className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                              bubble.bgOpacity === op 
                                ? 'bg-pink-500 text-white' 
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {op}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-2">
                      100% = 最透明（最能看到底图），0% = 不透明。
                    </div>
                  </div>

                  {/* 气泡边框颜色 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-700">气泡边框颜色</span>
                      <input
                        type="color"
                        value={bubble.borderColor}
                        onChange={(e) => setBubble({ ...bubble, borderColor: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 flex-shrink-0">透明度</span>
                      <div className="flex-1 flex gap-1">
                        {opacityOptions.map(op => (
                          <button
                            key={op}
                            type="button"
                            onClick={() => setBubble({ ...bubble, borderOpacity: op })}
                            className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                              bubble.borderOpacity === op 
                                ? 'bg-pink-500 text-white' 
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {op}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 文字颜色 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-700">文字颜色</span>
                      <input
                        type="color"
                        value={bubble.textColor || '#111827'}
                        onChange={(e) => setBubble({ ...bubble, textColor: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { name: '自动', color: 'auto' },
                        { name: '黑', color: '#111827' },
                        { name: '白', color: '#FFFFFF' },
                        { name: '灰', color: '#374151' },
                        { name: '粉', color: '#EC4899' },
                        { name: '紫', color: '#8B5CF6' },
                        { name: '蓝', color: '#3B82F6' },
                        { name: '青', color: '#06B6D4' },
                        { name: '绿', color: '#10B981' },
                        { name: '黄', color: '#F59E0B' },
                        { name: '红', color: '#EF4444' },
                      ].map((opt) => (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => {
                            if (opt.color === 'auto') {
                              // 简易自动对比：按背景亮度选黑/白
                              const hex = (bubble.bgColor || '#ffffff').replace('#', '')
                              const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.slice(0, 2), 16)
                              const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.slice(2, 4), 16)
                              const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.slice(4, 6), 16)
                              const y = (r * 299 + g * 587 + b * 114) / 1000
                              setBubble({ ...bubble, textColor: y < 140 ? '#FFFFFF' : '#111827' })
                            } else {
                              setBubble({ ...bubble, textColor: opt.color })
                            }
                          }}
                          className="px-3 py-1.5 rounded-full text-xs font-medium border bg-white"
                          style={{
                            borderColor: opt.color === 'auto' ? '#E5E7EB' : opt.color,
                            color: opt.color === 'auto' ? '#6B7280' : opt.color,
                          }}
                        >
                          {opt.name}
                        </button>
                      ))}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-2">
                      文字看不清就点“自动”，会根据背景颜色自动选黑/白。
                    </div>
                  </div>

                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* 拍一拍设置弹窗 */}
      {showPatSettings && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button type="button" onClick={() => setShowPatSettings(false)} className="text-gray-500">取消</button>
            <span className="font-medium text-[#000]">拍一拍设置</span>
            <button
              type="button"
              onClick={() => {
                updateCharacter(character.id, {
                  patMeText: patMeTextDraft.trim() || '拍了拍我的小脑袋',
                  patThemText: patThemTextDraft.trim() || '拍了拍TA的肩膀',
                })
                setShowPatSettings(false)
              }}
              className="text-[#07C160] font-medium"
            >
              保存
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 拍一拍我 */}
            <div>
              <label className="text-sm text-gray-600 block mb-1">拍一拍我</label>
              <div className="text-xs text-gray-400 mb-2">对方拍你时显示的内容</div>
              <input
                type="text"
                value={patMeTextDraft}
                onChange={(e) => setPatMeTextDraft(e.target.value)}
                placeholder="拍了拍我的小脑袋"
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-800 outline-none"
              />
              <div className="text-xs text-gray-400 mt-1">示例：拍了拍我的小脑袋、拍了拍我的肩膀</div>
            </div>

            {/* 拍一拍TA */}
            <div>
              <label className="text-sm text-gray-600 block mb-1">拍一拍TA</label>
              <div className="text-xs text-gray-400 mb-2">你拍对方时显示的内容</div>
              <input
                type="text"
                value={patThemTextDraft}
                onChange={(e) => setPatThemTextDraft(e.target.value)}
                placeholder="拍了拍TA的肩膀"
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-800 outline-none"
              />
              <div className="text-xs text-gray-400 mt-1">示例：拍了拍TA的肩膀、拍了拍TA的小脑袋</div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑角色信息弹窗 */}
      {showEditCharacter && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white">
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button
              type="button"
              onClick={() => setShowEditCharacter(false)}
              className="text-gray-500"
            >
              取消
            </button>
            <span className="font-medium text-[#000]">编辑角色</span>
            <button
              type="button"
              onClick={() => {
                // 保存前同步 textarea 的最新值（防止未触发 onBlur 时丢失数据）
                const latestPrompt = promptTextareaRef.current?.value ?? editPrompt
                updateCharacter(character.id, {
                  name: editName.trim() || character.name,
                  gender: editGender,
                  prompt: latestPrompt,
                  birthday: editBirthday,
                  callMeName: editCallMeName,
                  relationship: editRelationship,
                  country: editCountry,
                  language: editLanguage,
                  chatTranslationEnabled: editLanguage === 'zh' ? false : editChatTranslationEnabled,
                })
                setShowEditCharacter(false)
              }}
              className="text-[#07C160] font-medium"
            >
              保存
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* 名字 */}
            <div>
              <label className="text-sm text-gray-600 block mb-1">名字</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="角色名字"
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-800 outline-none"
              />
            </div>

            {/* 性别 */}
            <div>
              <label className="text-sm text-gray-600 block mb-1">性别</label>
              <div className="flex gap-2">
                {[
                  { value: 'male', label: '男' },
                  { value: 'female', label: '女' },
                  { value: 'other', label: '其他' },
                ].map((g) => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setEditGender(g.value as 'male' | 'female' | 'other')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      editGender === g.value
                        ? 'bg-pink-500 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 生日 */}
            <div>
              <label className="text-sm text-gray-600 block mb-1">生日</label>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={editBirthday}
                  onChange={(e) => setEditBirthday(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-gray-100 text-gray-800 outline-none"
                />
                <span className="text-xs text-gray-500">
                  {(() => {
                    if (!editBirthday) return '年龄：—'
                    const d = new Date(editBirthday)
                    if (Number.isNaN(d.getTime())) return '年龄：—'
                    const now = new Date()
                    let age = now.getFullYear() - d.getFullYear()
                    const m = now.getMonth() - d.getMonth()
                    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
                    return `年龄：${age}`
                  })()}
                </span>
              </div>
            </div>

            {/* TA叫我 */}
            <div>
              <label className="text-sm text-gray-600 block mb-1">TA叫我</label>
              <input
                type="text"
                value={editCallMeName}
                onChange={(e) => setEditCallMeName(e.target.value)}
                placeholder="例如：宝贝、亲爱的"
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-800 outline-none"
              />
            </div>

            {/* 关系 */}
            <div>
              <label className="text-sm text-gray-600 block mb-1">与我的关系</label>
              <input
                type="text"
                value={editRelationship}
                onChange={(e) => setEditRelationship(e.target.value)}
                placeholder="例如：男朋友、闺蜜、老公"
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-800 outline-none"
              />
            </div>

            {/* 语言/国家 */}
            <div>
              <label className="text-sm text-gray-600 block mb-1">语言</label>
              <button
                type="button"
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-800 outline-none flex items-center justify-between active:scale-[0.99]"
                onClick={() => setLangPickerOpen(true)}
              >
                <span>{languageLabel(editLanguage)}</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="mt-1 text-[11px] text-gray-400">
                语言会影响聊天/日记/朋友圈/X等。非中文角色可单独控制翻译开关。
              </div>
            </div>

            {editLanguage !== 'zh' && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-100">
                <div className="flex flex-col">
                  <div className="text-sm text-gray-700">聊天翻译</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">默认开启；关闭后该角色全域不显示翻译</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditChatTranslationEnabled(v => !v)}
                  className={`w-12 h-7 rounded-full transition-colors ${editChatTranslationEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-6 h-6 bg-white rounded-full shadow mt-0.5 transition-transform ${editChatTranslationEnabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            )}
            <div>
              <label className="text-sm text-gray-600 block mb-1">国家/地区</label>
              <input
                type="text"
                value={editCountry}
                onChange={(e) => setEditCountry(e.target.value)}
                placeholder="例如：日本 / 中国 / 法国"
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-800 outline-none"
              />
            </div>

            {/* 人设 - 可折叠 */}
            <div className="bg-gray-50 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setPromptExpanded(!promptExpanded)}
                className="w-full flex items-center justify-between px-3 py-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">角色人设</span>
                  {editPrompt && <span className="text-xs text-green-500 bg-green-50 px-1.5 py-0.5 rounded">已填写</span>}
                </div>
                <svg 
                  className={`w-4 h-4 text-gray-400 transition-transform ${promptExpanded ? 'rotate-90' : ''}`} 
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {promptExpanded && (
                <div className="px-3 pb-3">
                  <textarea
                    ref={promptTextareaRef}
                    defaultValue={editPrompt}
                    onBlur={(e) => setEditPrompt(e.target.value)}
                    placeholder="描述角色的性格、背景、说话方式等..."
                    rows={8}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-800 outline-none resize-none text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-2">好的人设让角色更生动：性格、语气、口头禅、背景故事...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </WeChatLayout>
  )
}
