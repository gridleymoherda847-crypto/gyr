import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useOS } from '../../context/OSContext'
import { useWeChat } from '../../context/WeChatContext'
import { getGlobalPresets } from '../PresetScreen'
import WeChatLayout from './WeChatLayout'
import WeChatDialog from './components/WeChatDialog'

type MoodId = 'love' | 'happy' | 'ok' | 'tired' | 'sad' | 'angry'

type CoupleCheckIn = {
  userMood?: MoodId
  partnerMood?: MoodId
  userAt?: number
  partnerAt?: number
}

type CoupleMessage = {
  id: string
  from: 'user' | 'partner'
  text: string
  at: number
}

type CoupleSpaceData = {
  version: 1
  characterId: string
  baseBgUrl?: string // base64 或静态资源路径
  overlayBgUrl?: string // base64 或静态资源路径
  lastUpdateAt?: number // 最近一次“进入时尝试更新”的时间
  lastGeneratedDay?: string // YYYY-MM-DD（当天只生成一次）
  checkIns: Record<string, CoupleCheckIn> // key: YYYY-MM-DD
  messages: CoupleMessage[]
}

const DEFAULT_BASE_BG = '/icons/couple-space-base.svg'
const DEFAULT_OVERLAY_BG = '/icons/couple-space-bg.svg'

const STORAGE_KEY = (characterId: string) => `littlephone_couple_space_${characterId}`

const ymd = (ts: number) => {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const formatMd = (ts: number) => {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const formatHms = (ts: number) => {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

const safeLoad = (key: string): any => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const safeSave = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // ignore
  }
}

const genId = () => `cs_${Date.now()}_${Math.random().toString(16).slice(2)}`

const MOOD_OPTIONS: { id: MoodId; label: string }[] = [
  { id: 'love', label: '甜甜' },
  { id: 'happy', label: '开心' },
  { id: 'ok', label: '一般' },
  { id: 'tired', label: '好累' },
  { id: 'sad', label: '难过' },
  { id: 'angry', label: '生气' },
]

function MoodIcon({ id, className = 'w-4 h-4' }: { id: MoodId; className?: string }) {
  switch (id) {
    case 'love':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
          />
        </svg>
      )
    case 'happy':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15a3 3 0 01-6 0" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h.01M15 9h.01" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'ok':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h.01M15 9h.01" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 15h8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'tired':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h.01M15 9h.01" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 15c2.5-1.5 5.5-1.5 8 0" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'sad':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9h.01M15 9h.01" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 16c-2.5-1.5-5.5-1.5-8 0" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'angry':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l2 1M16 9l-2 1" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 15h8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    default:
      return null
  }
}

function buildMonthGrid(anchor: Date) {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const first = new Date(year, month, 1)
  const firstWeekday = (first.getDay() + 6) % 7 // Monday=0
  const start = new Date(year, month, 1 - firstWeekday)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }
  return { year, month, days }
}

function tryParseJsonBlock(text: string) {
  const raw = (text || '').trim()
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

export default function CoupleSpaceScreen() {
  const navigate = useNavigate()
  const { characterId } = useParams<{ characterId: string }>()
  const { callLLM } = useOS()
  const { getCharacter, getMessagesByCharacter, getUserPersona, getCurrentPersona, updateCharacter, addMessage } = useWeChat()

  const character = getCharacter(characterId || '')
  const now = Date.now()
  const todayKey = ymd(now)
  const togetherDays = (() => {
    const startAt = character?.coupleStartedAt ?? character?.createdAt ?? now
    const diffDays = Math.floor(Math.max(0, now - startAt) / (1000 * 60 * 60 * 24))
    return Math.max(1, diffDays + 1)
  })()

  const selectedPersona = useMemo(() => {
    if (!character) return null
    return character.selectedUserPersonaId ? getUserPersona(character.selectedUserPersonaId) : null
  }, [character, getUserPersona])
  const defaultPersona = useMemo(() => getCurrentPersona(), [getCurrentPersona])

  const userName = selectedPersona?.name || defaultPersona?.name || '我'
  const userAvatar = selectedPersona?.avatar || defaultPersona?.avatar || ''

  const [data, setData] = useState<CoupleSpaceData | null>(null)
  const [monthAnchor, setMonthAnchor] = useState(() => new Date())

  const [loadingOpen, setLoadingOpen] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [loadingStage, setLoadingStage] = useState('正在更新情侣空间…')

  const loadingTimerRef = useRef<number | null>(null)

  const [dialog, setDialog] = useState<{
    open: boolean
    title?: string
    message?: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
    onConfirm?: () => void
    onCancel?: () => void
  }>({ open: false })
  const [unbindConfirmOpen, setUnbindConfirmOpen] = useState(false)

  const [pickMoodOpen, setPickMoodOpen] = useState(false)
  const [pickMoodDay, setPickMoodDay] = useState<string | null>(null)
  const [monthDialogOpen, setMonthDialogOpen] = useState(false)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const baseInputRef = useRef<HTMLInputElement | null>(null)
  const overlayInputRef = useRef<HTMLInputElement | null>(null)

  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)

  const ensureData = (cid: string): CoupleSpaceData => {
    const loaded = safeLoad(STORAGE_KEY(cid))
    const base: CoupleSpaceData = {
      version: 1,
      characterId: cid,
      baseBgUrl: DEFAULT_BASE_BG,
      overlayBgUrl: DEFAULT_OVERLAY_BG,
      lastUpdateAt: undefined,
      lastGeneratedDay: undefined,
      checkIns: {},
      messages: [],
    }
    if (!loaded || typeof loaded !== 'object') return base
    return {
      ...base,
      ...loaded,
      checkIns: loaded.checkIns && typeof loaded.checkIns === 'object' ? loaded.checkIns : {},
      messages: Array.isArray(loaded.messages) ? loaded.messages : [],
    }
  }

  const saveData = (next: CoupleSpaceData) => {
    safeSave(STORAGE_KEY(next.characterId), next)
    setData(next)
  }

  const stopLoadingTimer = () => {
    if (loadingTimerRef.current) {
      window.clearInterval(loadingTimerRef.current)
      loadingTimerRef.current = null
    }
  }

  const startLoadingAnim = () => {
    stopLoadingTimer()
    setLoadingProgress(0)
    loadingTimerRef.current = window.setInterval(() => {
      setLoadingProgress((p) => {
        const cap = 92
        if (p >= cap) return p
        const next = p + Math.max(0.6, (cap - p) * 0.05)
        return Math.min(cap, next)
      })
    }, 120)
  }

  const sweetStages = [
    '正在把今天的甜度打包中…',
    '正在贴上你们俩的心情小贴纸…',
    '正在把小心思藏进日历里…',
    '正在把留言板擦得干干净净…',
    '嘘…差点被发现，继续加载…',
  ]

  const maybeUpdateOnOpen = async (cid: string) => {
    if (!character) return

    startLoadingAnim()
    setLoadingOpen(true)
    setLoadingStage('情侣空间正在更新加载中…')

    const seed = ensureData(cid)

    try {
      const nowTs = Date.now()
      const tooFrequent = !!seed.lastUpdateAt && nowTs - seed.lastUpdateAt < 4 * 60 * 1000
      const needDaily = seed.lastGeneratedDay !== todayKey

      // 随机切换甜甜提示
      let stageIndex = 0
      const stageTimer = window.setInterval(() => {
        stageIndex = (stageIndex + 1) % sweetStages.length
        setLoadingStage(sweetStages[stageIndex])
      }, 1400)

      let next = seed
      if (!tooFrequent && needDaily) {
        setLoadingStage('正在写下今天的“双人心情”…')
        next = await generateDailyUpdate(seed)
      } else {
        setLoadingStage(tooFrequent ? '刚更新过啦～再甜也要缓一缓…' : '正在打开你们的专属小角落…')
      }

      window.clearInterval(stageTimer)

      next = {
        ...next,
        lastUpdateAt: nowTs,
      }
      saveData(next)

      setLoadingProgress(100)
      window.setTimeout(() => setLoadingOpen(false), 250)
    } catch (e: any) {
      setDialog({
        open: true,
        title: '更新失败',
        message: e?.message || '情侣空间更新失败了，稍后再试试～',
        confirmText: '好',
        onConfirm: () => setDialog({ open: false }),
      })
      setLoadingProgress(100)
      window.setTimeout(() => setLoadingOpen(false), 250)
    } finally {
      stopLoadingTimer()
    }
  }

  const generateDailyUpdate = async (seed: CoupleSpaceData): Promise<CoupleSpaceData> => {
    if (!character) return seed

    const globalPresets = getGlobalPresets()
    const chat = getMessagesByCharacter(character.id) || []

    const compressChat = () => {
      const nonSystem = chat.filter((m) => m.type !== 'system')
      const maxChars = 9000
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
        const extra = content.length + 10
        if (used + extra > maxChars) break
        used += extra
        out.push({ role: m.isUser ? 'user' : 'assistant', content })
      }
      return out.reverse()
    }

    const recentCoupleMsgs = seed.messages.slice(-16).map((m) => ({
      role: m.from === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))

    const recentCheckins = Object.entries(seed.checkIns)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-7)
      .map(([day, v]) => `${day}：我=${v.userMood || '（空）'}，TA=${v.partnerMood || '（空）'}`)
      .join('\n')

    const sys =
      `${globalPresets ? globalPresets + '\n\n' : ''}` +
      `【情侣空间（更新任务）】\n` +
      `- 你是微信里的角色：${character.name}\n` +
      `- 我（用户）叫：${userName}\n` +
      `- 现在日期：${new Date().toLocaleString('zh-CN', { hour12: false })}\n` +
      `\n` +
      `【你的人设】\n${(character.prompt || '').trim() || '（无）'}\n` +
      `\n` +
      `【最近 7 天签到摘要】\n${recentCheckins || '（暂无）'}\n` +
      `\n` +
      `【输出要求】\n` +
      `- 这是“情侣空间”的一次更新：最多生成 1 条新的甜甜留言（可带一点小情绪，但整体偏粉色/可爱/亲昵）\n` +
      `- 生成“你今天的心情”一个：love/happy/ok/tired/sad/angry\n` +
      `- 频率：每天最多 1 次更新（今天已更新过就不要重复写新内容）\n` +
      `- 严禁出现任何辱女/性羞辱/骂女性词汇\n` +
      `\n` +
      `【只输出 JSON】\n` +
      `{\n` +
      `  "partnerMood": "love|happy|ok|tired|sad|angry",\n` +
      `  "partnerMessage": "一句留言（1~2句，像真的微信留言，不要太长）"\n` +
      `}\n`

    const llmMessages = [
      { role: 'system', content: sys },
      ...compressChat(),
      ...recentCoupleMsgs,
      { role: 'user', content: '现在请按要求输出 JSON。' },
    ]

    const res = await callLLM(llmMessages, undefined, { maxTokens: 260, timeoutMs: 600000, temperature: 0.85 })
    const parsed = tryParseJsonBlock(res) || {}
    const partnerMood: MoodId = MOOD_OPTIONS.some((m) => m.id === parsed.partnerMood) ? parsed.partnerMood : 'love'
    const partnerMessage: string = String(parsed.partnerMessage || '').trim()

    const next: CoupleSpaceData = {
      ...seed,
      lastGeneratedDay: todayKey,
      checkIns: {
        ...seed.checkIns,
        [todayKey]: {
          ...(seed.checkIns[todayKey] || {}),
          partnerMood,
          partnerAt: Date.now(),
        },
      },
    }

    // 今天只加一条“TA留言”（如果返回空就不加）
    if (partnerMessage) {
      const lastMsg = next.messages[next.messages.length - 1]
      const safeText = partnerMessage.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, 220)
      const sameDayAlready =
        !!lastMsg && ymd(lastMsg.at) === todayKey && lastMsg.from === 'partner' && lastMsg.text.trim() === safeText.trim()
      if (!sameDayAlready) {
        next.messages = [
          ...next.messages,
          {
            id: genId(),
            from: 'partner',
            text: safeText,
            at: Date.now(),
          },
        ]
      }
    }

    return next
  }

  useEffect(() => {
    if (!characterId || !character) return
    if (!character.coupleSpaceEnabled) return
    const seed = ensureData(characterId)
    setData(seed)
    void maybeUpdateOnOpen(characterId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId])

  const grid = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor])

  const baseBgUrl = data?.baseBgUrl || DEFAULT_BASE_BG
  const overlayBgUrl = data?.overlayBgUrl || DEFAULT_OVERLAY_BG

  // 壁纸策略：
  // - 默认 SVG：可平铺当底纹
  // - 用户上传图片（data: / png/jpg 等）：一律 cover，避免“重复平铺”导致乱
  const isRepeatablePattern = (url: string) => {
    const u = (url || '').trim()
    if (!u) return false
    if (u.startsWith('data:image')) return false
    // 默认内置 SVG 当做底纹
    return /\.svg(\?|#|$)/i.test(u)
  }

  const handleBack = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    navigate(-1)
  }

  const handleUnbind = () => {
    if (!character) return
    setUnbindConfirmOpen(false)
    // 清空情侣空间开通状态（允许后续重新申请）
    updateCharacter(character.id, { coupleSpaceEnabled: false, coupleStartedAt: null })
    // 清掉本地情侣空间数据（避免下次开通仍显示旧内容）
    try {
      localStorage.removeItem(STORAGE_KEY(character.id))
    } catch {
      // ignore
    }
    // 写入聊天记录（系统分割线风格）
    addMessage({
      characterId: character.id,
      content: `——${userName}解绑了情侣空间——`,
      isUser: false,
      type: 'system',
    })
    navigate(-1)
  }

  const pickMood = (day: string, mood: MoodId) => {
    if (!data) return
    const prev = data.checkIns[day] || {}
    const next: CoupleSpaceData = {
      ...data,
      checkIns: {
        ...data.checkIns,
        [day]: {
          ...prev,
          userMood: mood,
          userAt: Date.now(),
        },
      },
    }
    saveData(next)
  }

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })

  const handlePickBg = async (type: 'base' | 'overlay', file: File) => {
    if (!data) return
    try {
      const base64 = await fileToBase64(file)
      const next = {
        ...data,
        baseBgUrl: type === 'base' ? base64 : data.baseBgUrl,
        overlayBgUrl: type === 'overlay' ? base64 : data.overlayBgUrl,
      }
      saveData(next)
      setDialog({
        open: true,
        title: '已更新',
        message: type === 'base' ? '底色图已更换～' : '背景图已更换～',
        confirmText: '好',
        onConfirm: () => setDialog({ open: false }),
      })
    } catch (e: any) {
      setDialog({
        open: true,
        title: '更换失败',
        message: e?.message || '更换失败了，换一张试试～',
        confirmText: '好',
        onConfirm: () => setDialog({ open: false }),
      })
    }
  }

  const sendMessage = async () => {
    if (!data || !character) return
    const text = newMsg.trim()
    if (!text) return
    setNewMsg('')
    setSending(true)

    const next0: CoupleSpaceData = {
      ...data,
      messages: [
        ...data.messages,
        {
          id: genId(),
          from: 'user',
          text: text.slice(0, 300),
          at: Date.now(),
        },
      ],
    }
    saveData(next0)

    try {
      const globalPresets = getGlobalPresets()
      const recentMsgs = next0.messages.slice(-20).map((m) => ({
        role: m.from === 'user' ? 'user' : 'assistant',
        content: m.text,
      }))
      const recentCheckins = Object.entries(next0.checkIns)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-10)
        .map(([day, v]) => `${day}：我=${v.userMood || '（空）'}，TA=${v.partnerMood || '（空）'}`)
        .join('\n')

      const sys =
        `${globalPresets ? globalPresets + '\n\n' : ''}` +
        `【情侣空间 - 留言板】\n` +
        `你是：${character.name}。我（用户）：${userName}。\n` +
        `你的人设：${(character.prompt || '').trim() || '（无）'}\n` +
        `现在时间：${new Date().toLocaleString('zh-CN', { hour12: false })}\n` +
        `最近签到：\n${recentCheckins || '（暂无）'}\n` +
        `\n` +
        `写一条给我的留言回复（1~2句，像真情侣，甜甜的、自然的，也可以带一点小情绪；不要太长）。\n` +
        `严禁辱女/性羞辱词汇。只输出留言正文。`

      const res = await callLLM([{ role: 'system', content: sys }, ...recentMsgs], undefined, {
        maxTokens: 220,
        timeoutMs: 600000,
        temperature: 0.85,
      })

      const reply = (res || '').trim().replace(/\n{3,}/g, '\n\n').slice(0, 260)
      if (reply) {
        const next1: CoupleSpaceData = {
          ...next0,
          messages: [
            ...next0.messages,
            {
              id: genId(),
              from: 'partner',
              text: reply,
              at: Date.now(),
            },
          ],
        }
        saveData(next1)
      }
    } catch (e: any) {
      setDialog({
        open: true,
        title: '发送失败',
        message: e?.message || '这条留言没发出去，稍后再试试～',
        confirmText: '好',
        onConfirm: () => setDialog({ open: false }),
      })
    } finally {
      setSending(false)
    }
  }

  if (!character) {
    return (
      <WeChatLayout>
        <div className="flex h-full flex-col items-center justify-center">
          <div className="text-gray-500 text-sm">找不到这个角色…</div>
          <button type="button" className="mt-3 text-pink-600 text-sm" onClick={() => navigate(-1)}>
            返回
          </button>
        </div>
      </WeChatLayout>
    )
  }

  // 未开通：不允许直接进入（只能在聊天里申请开通）
  if (!character.coupleSpaceEnabled) {
    return (
      <WeChatLayout>
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-pink-100 border border-pink-200 flex items-center justify-center">
            <svg className="w-9 h-9 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          </div>
          <div className="mt-4 text-[15px] font-semibold text-[#111]">情侣空间还没开通</div>
          <div className="mt-2 text-[12px] text-gray-500 leading-relaxed">
            需要先在聊天里向对方发起申请，
            <br />
            对方同意后才能进入你们的小窝～
          </div>
          <button
            type="button"
            className="mt-5 px-5 py-2.5 rounded-2xl bg-pink-500 text-white text-[13px] font-semibold active:scale-[0.98]"
            onClick={() => navigate(-1)}
          >
            返回聊天
          </button>
        </div>
      </WeChatLayout>
    )
  }

  return (
    <WeChatLayout>
      <div className="relative h-full w-full overflow-hidden">
        {/* 背景层 */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${baseBgUrl})`,
            backgroundSize: isRepeatablePattern(baseBgUrl) ? '240px 240px' : 'cover',
            backgroundRepeat: isRepeatablePattern(baseBgUrl) ? 'repeat' : 'no-repeat',
            backgroundPosition: 'center',
          }}
        />
        <div
          className="absolute inset-0 bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${overlayBgUrl})`,
            backgroundSize: isRepeatablePattern(overlayBgUrl) ? 'contain' : 'cover',
            backgroundPosition: 'center top',
            opacity: isRepeatablePattern(overlayBgUrl) ? 0.9 : 0.32,
          }}
        />
        {/* 轻薄遮罩：压住照片壁纸的杂讯，保证文字清晰（不使用重度 blur） */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/35 via-pink-50/25 to-white/35" />

        {/* 头部 */}
        <div className="relative z-10 flex items-center justify-between px-4 py-2">
          <button type="button" onClick={handleBack} className="flex items-center text-pink-600 relative z-10">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-semibold text-pink-600">情侣空间</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded-full bg-white/60 border border-white/45 backdrop-blur text-[11px] font-semibold text-red-500 active:scale-[0.98]"
              onClick={() => setUnbindConfirmOpen(true)}
              title="解绑"
            >
              解绑
            </button>
            <button
              type="button"
              className="w-9 h-9 rounded-full bg-white/55 border border-white/40 backdrop-blur flex items-center justify-center active:scale-[0.98]"
              onClick={() => setSettingsOpen(true)}
              title="更换背景"
            >
              <svg className="w-5 h-5 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* 内容 */}
        <div className="relative z-10 flex-1 h-[calc(100%-44px)] overflow-y-auto px-3 pb-4 pt-2">
          {/* 双人头像区 */}
          <div className="mt-4 rounded-2xl bg-white/40 border border-white/40 backdrop-blur-md p-4 shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between">
              <div className="text-[12px] text-pink-700/80 font-medium">今天 · {formatMd(now)} {formatHms(now)}</div>
              <div className="text-[12px] font-semibold text-pink-600">已经在一起 {togetherDays} 天啦</div>
            </div>
            <div className="mt-3 flex items-center justify-center gap-3">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/70 border border-white/60 shadow-sm">
                  {userAvatar ? (
                    <img src={userAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-pink-700 font-semibold">{userName[0]}</div>
                  )}
                </div>
                <div className="absolute -right-2 -top-2 w-7 h-7 rounded-full bg-pink-500/90 text-white flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-8-4.438-8-11a4.5 4.5 0 018-2.61A4.5 4.5 0 0120 10c0 6.562-8 11-8 11z" />
                  </svg>
                </div>
              </div>

              <div className="w-10 h-10 rounded-full bg-white/70 border border-white/60 flex items-center justify-center shadow-sm">
                <svg className="w-6 h-6 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                  />
                </svg>
              </div>

              <div className="relative">
                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white/70 border border-white/60 shadow-sm">
                  {character.avatar ? (
                    <img src={character.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-pink-700 font-semibold">{character.name[0]}</div>
                  )}
                </div>
                <div className="absolute -left-2 -top-2 w-7 h-7 rounded-full bg-pink-500/90 text-white flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-8-4.438-8-11a4.5 4.5 0 018-2.61A4.5 4.5 0 0120 10c0 6.562-8 11-8 11z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="mt-3 text-[12px] text-gray-600 text-center">
              {userName} × {character.name}
            </div>
          </div>

          {/* 双人签到（默认本周视图，月历放进弹窗避免拥挤） */}
          <div className="mt-3 rounded-2xl bg-white/45 border border-white/45 backdrop-blur-md p-4 shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-[#111]">双人签到</div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-full bg-white/65 border border-white/60 text-[12px] text-gray-700 font-medium active:scale-[0.98]"
                onClick={() => setMonthDialogOpen(true)}
              >
                月历
              </button>
            </div>

            {(() => {
              const base = new Date(now)
              base.setHours(0, 0, 0, 0)
              const dow = (base.getDay() + 6) % 7 // Monday=0
              base.setDate(base.getDate() - dow)
              const weekDays = Array.from({ length: 7 }, (_, i) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + i))
              const weekLabels = ['一', '二', '三', '四', '五', '六', '日']
              return (
                <div className="mt-3 grid grid-cols-7 gap-2">
                  {weekDays.map((d, idx) => {
                    const key = ymd(d.getTime())
                    const entry = data?.checkIns?.[key] || {}
                    const isToday = key === todayKey
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`rounded-2xl border bg-white/60 border-white/55 px-2 py-2 text-left active:scale-[0.99] ${
                          isToday ? 'ring-2 ring-pink-400/70' : ''
                        }`}
                        onClick={() => {
                          setPickMoodDay(key)
                          setPickMoodOpen(true)
                        }}
                        title="设置心情"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] text-gray-500">{weekLabels[idx]}</div>
                          {isToday && <div className="text-[10px] text-pink-600 font-semibold">今</div>}
                        </div>
                        <div className="mt-1 text-[12px] font-semibold text-gray-800">{d.getDate()}</div>
                        <div className="mt-1.5 flex flex-col gap-1">
                          <div className="flex items-center gap-1 text-pink-600">
                            <span className="text-[10px] text-gray-500">我</span>
                            <div className="w-5 h-5 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center">
                              {entry.userMood ? <MoodIcon id={entry.userMood} className="w-3.5 h-3.5" /> : <span className="text-[10px]">·</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-pink-600">
                            <span className="text-[10px] text-gray-500">TA</span>
                            <div className="w-5 h-5 rounded-lg bg-pink-50 border border-pink-100 flex items-center justify-center">
                              {entry.partnerMood ? <MoodIcon id={entry.partnerMood} className="w-3.5 h-3.5" /> : <span className="text-[10px]">·</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })()}

            <div className="mt-3 text-[11px] text-gray-600">
              点日期写心情：上面是“我”，下面是“TA”。（内容会永久保存）
            </div>
          </div>

          {/* 留言板 */}
          <div className="mt-3 rounded-2xl bg-white/45 border border-white/45 backdrop-blur-md p-4 shadow-[0_12px_30px_rgba(0,0,0,0.08)]">
            <div className="text-[13px] font-semibold text-[#111]">留言板</div>
            <div className="mt-3 space-y-2">
              {(data?.messages || []).slice(-40).map((m) => (
                <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[82%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed shadow-sm ${
                      m.from === 'user' ? 'bg-pink-500/85 text-white rounded-tr-md' : 'bg-white/70 text-gray-800 rounded-tl-md'
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.text}</div>
                    <div className={`mt-1 text-[10px] ${m.from === 'user' ? 'text-white/80' : 'text-gray-500'}`}>
                      {formatMd(m.at)} {formatHms(m.at)}
                    </div>
                  </div>
                </div>
              ))}
              {(!data || (data.messages || []).length === 0) && (
                <div className="text-[12px] text-gray-500">还没有留言～先写一句甜甜的吧。</div>
              )}
            </div>

            <div className="mt-3 flex items-end gap-2">
              <textarea
                value={newMsg}
                onChange={(e) => setNewMsg(e.target.value)}
                className="flex-1 min-h-[44px] max-h-[96px] resize-none rounded-2xl bg-white/75 border border-white/60 px-3 py-2 text-[12px] text-gray-800 outline-none"
                placeholder={`给 ${character.name} 留言…`}
              />
              <button
                type="button"
                disabled={sending || !newMsg.trim()}
                onClick={() => void sendMessage()}
                className={`h-[44px] px-4 rounded-2xl text-[12px] font-semibold text-white shadow-sm active:scale-[0.99] ${
                  sending || !newMsg.trim() ? 'bg-gray-300' : 'bg-pink-500'
                }`}
              >
                {sending ? '发送中…' : '发送'}
              </button>
            </div>
          </div>

          <div className="h-6" />
        </div>

        {/* 进入时更新加载弹窗 */}
        <WeChatDialog
          open={loadingOpen}
          title="情侣空间正在更新加载中"
          message={loadingStage}
          confirmText="稍等"
          onConfirm={() => {}}
          onCancel={() => {}}
        >
          <div className="mt-2">
            <div className="text-[11px] text-amber-600 text-center mb-2">本次将消耗 API 调用，请勿退出浏览器或此界面。</div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-400 transition-all"
                style={{ width: `${Math.max(3, Math.min(100, loadingProgress))}%` }}
              />
            </div>
            <div className="mt-2 text-center text-[11px] text-gray-500">{Math.round(loadingProgress)}%</div>
          </div>
        </WeChatDialog>

        {/* 月历签到（放在弹窗里，避免主界面拥挤） */}
        <WeChatDialog
          open={monthDialogOpen}
          title="月历签到"
          message="点日期写“我”的心情；TA 的心情会在进入情侣空间时自动更新。"
          confirmText="关闭"
          onConfirm={() => setMonthDialogOpen(false)}
          onCancel={() => setMonthDialogOpen(false)}
        >
          <div className="mt-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-white/70 border border-black/10 flex items-center justify-center active:scale-[0.98]"
                onClick={() => setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                title="上个月"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="text-[12px] text-gray-700 font-semibold">
                {grid.year}年{grid.month + 1}月
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-white/70 border border-black/10 flex items-center justify-center active:scale-[0.98]"
                onClick={() => setMonthAnchor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                title="下个月"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1 text-[10px] text-gray-500">
              {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
                <div key={w} className="text-center">
                  {w}
                </div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1">
              {grid.days.map((d) => {
                const inMonth = d.getMonth() === grid.month
                const key = ymd(d.getTime())
                const entry = data?.checkIns?.[key] || {}
                const isToday = key === todayKey
                return (
                  <button
                    key={key}
                    type="button"
                    className={`rounded-xl border px-1 py-1.5 text-left active:scale-[0.99] ${
                      inMonth ? 'bg-white/65 border-white/60' : 'bg-white/25 border-white/30 opacity-60'
                    } ${isToday ? 'ring-2 ring-pink-400/70' : ''}`}
                    onClick={() => {
                      setMonthDialogOpen(false)
                      setPickMoodDay(key)
                      setPickMoodOpen(true)
                    }}
                    title="设置心情"
                  >
                    <div className={`text-[11px] font-medium ${inMonth ? 'text-gray-800' : 'text-gray-500'}`}>{d.getDate()}</div>
                    <div className="mt-1 flex items-center gap-1">
                      <div className="w-4 h-4 rounded-md bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600">
                        {entry.userMood ? <MoodIcon id={entry.userMood} className="w-3 h-3" /> : <span className="text-[10px]">我</span>}
                      </div>
                      <div className="w-4 h-4 rounded-md bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600">
                        {entry.partnerMood ? <MoodIcon id={entry.partnerMood} className="w-3 h-3" /> : <span className="text-[10px]">TA</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </WeChatDialog>

        {/* 心情选择弹窗 */}
        <WeChatDialog
          open={pickMoodOpen}
          title="今天心情是？"
          message={pickMoodDay ? `选择你在 ${pickMoodDay} 的心情` : undefined}
          confirmText="完成"
          cancelText="关闭"
          onConfirm={() => setPickMoodOpen(false)}
          onCancel={() => setPickMoodOpen(false)}
        >
          <div className="grid grid-cols-3 gap-2">
            {MOOD_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                className="rounded-2xl border border-black/10 bg-white/70 px-3 py-2 text-[12px] text-gray-800 flex items-center justify-center gap-2 active:scale-[0.98]"
                onClick={() => {
                  if (!pickMoodDay) return
                  pickMood(pickMoodDay, m.id)
                  setPickMoodOpen(false)
                }}
              >
                <span className="text-pink-600">
                  <MoodIcon id={m.id} className="w-4 h-4" />
                </span>
                <span>{m.label}</span>
              </button>
            ))}
          </div>
        </WeChatDialog>

        {/* 背景设置 */}
        <WeChatDialog
          open={settingsOpen}
          title="情侣空间外观"
          message="底色图/背景图都可以随时更换（永久保存）。"
          confirmText="关闭"
          cancelText="恢复默认"
          onConfirm={() => setSettingsOpen(false)}
          onCancel={() => {
            if (!data) return
            const next = { ...data, baseBgUrl: DEFAULT_BASE_BG, overlayBgUrl: DEFAULT_OVERLAY_BG }
            saveData(next)
            setSettingsOpen(false)
          }}
        >
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => baseInputRef.current?.click()}
              className="w-full rounded-2xl border border-black/10 bg-white/70 px-3 py-2 text-[13px] font-medium text-[#111] active:scale-[0.98]"
            >
              更换底色图
            </button>
            <button
              type="button"
              onClick={() => overlayInputRef.current?.click()}
              className="w-full rounded-2xl border border-black/10 bg-white/70 px-3 py-2 text-[13px] font-medium text-[#111] active:scale-[0.98]"
            >
              更换背景图
            </button>

            <div className="flex gap-2 pt-1">
              <div className="flex-1 rounded-xl overflow-hidden border border-white/60 bg-white/60">
                <div className="text-[11px] text-gray-600 px-2 py-1">底色预览</div>
                <div
                  className="h-14"
                  style={{
                    backgroundImage: `url(${baseBgUrl})`,
                    backgroundSize: isRepeatablePattern(baseBgUrl) ? '140px 140px' : 'cover',
                    backgroundRepeat: isRepeatablePattern(baseBgUrl) ? 'repeat' : 'no-repeat',
                    backgroundPosition: 'center',
                  }}
                />
              </div>
              <div className="flex-1 rounded-xl overflow-hidden border border-white/60 bg-white/60">
                <div className="text-[11px] text-gray-600 px-2 py-1">背景预览</div>
                <div
                  className="h-14 bg-center bg-no-repeat"
                  style={{
                    backgroundImage: `url(${overlayBgUrl})`,
                    backgroundSize: isRepeatablePattern(overlayBgUrl) ? 'contain' : 'cover',
                    backgroundPosition: 'center top',
                  }}
                />
              </div>
            </div>

            <input
              ref={baseInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handlePickBg('base', f)
                e.target.value = ''
              }}
            />
            <input
              ref={overlayInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handlePickBg('overlay', f)
                e.target.value = ''
              }}
            />
          </div>
        </WeChatDialog>

        {/* 通用弹窗 */}
        <WeChatDialog
          open={dialog.open}
          title={dialog.title}
          message={dialog.message}
          confirmText={dialog.confirmText || '确定'}
          cancelText={dialog.cancelText}
          danger={dialog.danger}
          onConfirm={() => dialog.onConfirm?.()}
          onCancel={() => (dialog.onCancel ? dialog.onCancel() : setDialog({ open: false }))}
        />

        {/* 解绑确认 */}
        <WeChatDialog
          open={unbindConfirmOpen}
          title="解绑情侣空间？"
          message="解绑后会退出情侣空间，并在聊天记录里生成一条系统提示。之后仍可重新申请开通。"
          confirmText="确认解绑"
          cancelText="取消"
          danger
          onConfirm={handleUnbind}
          onCancel={() => setUnbindConfirmOpen(false)}
        />
      </div>
    </WeChatLayout>
  )
}
