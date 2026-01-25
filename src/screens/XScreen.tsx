import { useEffect, useMemo, useRef, useState, type ReactNode, type ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import AppHeader from '../components/AppHeader'
import { useOS } from '../context/OSContext'
import { useWeChat } from '../context/WeChatContext'
import WeChatDialog from './wechat/components/WeChatDialog'
import { getGlobalPresets } from './PresetScreen'
import { compressImageFileToDataUrl } from '../utils/image'
import {
  xEnsureUser,
  xMakeAvatarSvgDataUrl,
  xMakeBannerSvgDataUrl,
  xMakeColor,
  xMakeHandle,
  xLoad,
  xNewPost,
  xNewReply,
  xSave,
  type XDataV1,
  type XDMMessage,
  type XPost,
  type XReply,
} from '../storage/x'

type MainTab = 'home' | 'search' | 'notifications' | 'messages'
type View = 'main' | 'post' | 'profile' | 'dm'

const initials = (name: string) => (String(name || '').trim().slice(0, 1) || '?').toUpperCase()

const fmtRelative = (ts: number) => {
  const now = Date.now()
  const d = Math.max(0, now - ts)
  const m = Math.floor(d / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时`
  const day = Math.floor(h / 24)
  if (day < 7) return `${day}天`
  const date = new Date(ts)
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function tryParseJsonBlock(text: string) {
  const raw = (text || '').trim()
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

const normalizeLang = (langRaw?: string) => {
  const v = String(langRaw || '').trim()
  return v === 'en' || v === 'ja' || v === 'ko' || v === 'zh' ? v : 'zh'
}

const mapWeChatLang = (langRaw?: string) => {
  const v = String(langRaw || '').trim()
  return v === 'en' || v === 'ja' || v === 'ko' ? v : 'zh'
}

const parseDualLine = (line: string) => {
  const idx = line.indexOf('|||')
  if (idx < 0) return null
  const orig = line.slice(0, idx).trim()
  const zh = line.slice(idx + 3).trim()
  if (!orig || !zh) return null
  return { orig, zh }
}

const splitDmLines = (raw: string, maxLines: number) => {
  const text = (raw || '').trim()
  if (!text) return []
  const byLine = text.split('\n').map((s) => s.trim()).filter(Boolean)
  const out: string[] = []
  const keepCmd = (s: string) => /\|\|\|/.test(s)
  for (const line of byLine) {
    if (keepCmd(line)) {
      out.push(line)
      continue
    }
    const parts = line.match(/[^。！？!?]+[。！？!?]?/g) || [line]
    for (const p of parts) {
      const t = (p || '').trim()
      if (t) out.push(t)
    }
  }
  if (out.length <= 1) return out.slice(0, maxLines)
  const merged: string[] = []
  for (const s of out) {
    if (merged.length === 0) {
      merged.push(s)
      continue
    }
    const last = merged[merged.length - 1]
    if (!keepCmd(s) && !keepCmd(last) && (last.length < 10 || s.length < 8)) {
      merged[merged.length - 1] = `${last}${s}`
    } else {
      merged.push(s)
    }
  }
  return merged.filter(Boolean).slice(0, Math.max(1, maxLines))
}

const calcDmDelay = (index: number, content: string) => {
  if (index === 0) return 50 + Math.random() * 50
  const len = (content || '').length
  let baseMin = 1000
  let baseMax = 2000
  if (len <= 10) {
    baseMin = 1000
    baseMax = 2000
  } else if (len <= 30) {
    baseMin = 2000
    baseMax = 3500
  } else {
    baseMin = 3000
    baseMax = 5000
  }
  const randomMultiplier = 0.7 + Math.random() * 0.6
  return (baseMin + Math.random() * (baseMax - baseMin)) * randomMultiplier
}

export default function XScreen() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { callLLM } = useOS()
  const { getCurrentPersona, characters, addMessage } = useWeChat()

  const persona = useMemo(() => getCurrentPersona(), [getCurrentPersona])
  const meNameBase = persona?.name || '我'

  const [data, setData] = useState<XDataV1 | null>(null)
  const meName = data?.meDisplayName || meNameBase
  const [tab, setTab] = useState<MainTab>('home')
  const [homeMode, setHomeMode] = useState<'forYou' | 'following'>('forYou')

  const [view, setView] = useState<View>('main')
  const [openPostId, setOpenPostId] = useState<string | null>(null)
  const [openProfileUserId, setOpenProfileUserId] = useState<string | null>(null)
  const [postMenu, setPostMenu] = useState<{ open: boolean; postId?: string }>({ open: false })

  // DM detail
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [dmDraft, setDmDraft] = useState('')

  const viewRef = useRef(view)
  const openThreadIdRef = useRef(openThreadId)
  useEffect(() => {
    viewRef.current = view
  }, [view])
  useEffect(() => {
    openThreadIdRef.current = openThreadId
  }, [openThreadId])

  // Search
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')

  // Compose
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeText, setComposeText] = useState('')

  // Profile edit
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  const [followingOpen, setFollowingOpen] = useState(false)
  const [avatarEditTargetId, setAvatarEditTargetId] = useState<string | null>(null)
  const [bannerEditTargetId, setBannerEditTargetId] = useState<string | null>(null)
  const [otherProfileTipOpen, setOtherProfileTipOpen] = useState(false)
  const [otherProfileTipDontShow, setOtherProfileTipDontShow] = useState(false)
  const lastProfileTipIdRef = useRef<string | null>(null)
  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [profileDraftName, setProfileDraftName] = useState('')
  const [profileDraftBio, setProfileDraftBio] = useState('')
  const [profileTab, setProfileTab] = useState<'posts' | 'replies'>('posts')
  const [tipDialog, setTipDialog] = useState<{ open: boolean; title: string; message: string }>({ open: false, title: '', message: '' })

  // Reply
  const [replyDraft, setReplyDraft] = useState('')

  // Share to WeChat
  const [shareOpen, setShareOpen] = useState(false)
  const [shareTargetPostId, setShareTargetPostId] = useState<string | null>(null)
  const [shareResult, setShareResult] = useState<{ open: boolean; targetId: string | null }>({ open: false, targetId: null })

  // Loading
  const [loadingOpen, setLoadingOpen] = useState(false)
  const [loadingStage, setLoadingStage] = useState('正在加载…')
  const [loadingProgress, setLoadingProgress] = useState(0)
  const loadingTimerRef = useRef<number | null>(null)
  const refreshLockRef = useRef(false)

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
        const next = p + Math.max(0.7, (cap - p) * 0.06)
        return Math.min(cap, next)
      })
    }, 120)
  }

  // 说明：浏览器把页面切到后台时，JS 定时器会被强制节流/暂停
  // 我们这里做两件事：
  // 1) 后台时停止进度条 interval（避免假卡）；2) 回到前台如果还在 loading，就继续动画
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (loadingOpen) setLoadingStage((s) => (s.includes('后台') ? s : `${s}（后台生成中…）`))
        stopLoadingTimer()
      } else {
        if (loadingOpen && loadingProgress < 92) startLoadingAnim()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingOpen, loadingProgress])

  useEffect(() => {
    ;(async () => {
      startLoadingAnim()
      setLoadingOpen(true)
      setLoadingStage('正在打开 X…')
      try {
        const loaded = await xLoad(meNameBase)
        setData(loaded)
        setLoadingProgress(100)
        window.setTimeout(() => setLoadingOpen(false), 220)
      } catch {
        setLoadingOpen(false)
      } finally {
        stopLoadingTimer()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meNameBase])

  useEffect(() => {
    if (!data) return
    const postId = searchParams.get('postId')
    if (!postId) return
    const target = data.posts.find((p) => p.id === postId)
    if (!target) return
    setView('post')
    setOpenPostId(target.id)
    setTab('home')
  }, [data, searchParams])

  useEffect(() => {
    if (!data) return
    const userId = searchParams.get('userId')
    if (!userId) return
    setData((prev) => {
      if (!prev) return prev
      const { data: d2 } = ensureXUserFromCharacter(prev, userId)
      if (d2 === prev) return prev
      void xSave(d2)
      return d2
    })
    setOpenProfileUserId(userId)
    setView('profile')
    setTab('home')
  }, [data, searchParams])

  useEffect(() => {
    if (!data || !openProfileUserId || openProfileUserId === 'me') return
    if (data.suppressOtherProfileEditTip) return
    if (lastProfileTipIdRef.current === openProfileUserId) return
    lastProfileTipIdRef.current = openProfileUserId
    setOtherProfileTipDontShow(false)
    setOtherProfileTipOpen(true)
  }, [data, openProfileUserId])

  const posts = useMemo(() => (data?.posts || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [data?.posts])
  const replies = useMemo(() => data?.replies || [], [data?.replies])
  const mutedSet = useMemo(() => new Set(data?.muted || []), [data?.muted])
  const blockedSet = useMemo(() => new Set(data?.blocked || []), [data?.blocked])

  const openPost = useMemo(() => {
    if (!openPostId) return null
    return (data?.posts || []).find((p) => p.id === openPostId) || null
  }, [data?.posts, openPostId])

  const openPostReplies = useMemo(() => {
    if (!openPostId) return []
    return replies
      .filter((r) => r.postId === openPostId)
      .slice()
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .slice(-120)
  }, [openPostId, replies])

  const feedPosts = useMemo(() => {
    if (!data) return []
    const visible = posts.filter((p) => !mutedSet.has(p.authorId) && !blockedSet.has(p.authorId))
    if (homeMode === 'forYou') return visible.slice(0, 40)
    const followSet = new Set(data.follows || [])
    return visible.filter((p) => followSet.has(p.authorId) || p.authorId === 'me').slice(0, 40)
  }, [data, homeMode, posts, mutedSet, blockedSet])

  const searchPosts = useMemo(() => {
    if (!data) return []
    const key = (activeQuery || '').trim()
    if (!key) return []
    const cached = data.searchCache?.[key]
    if (!cached?.postIds?.length) return []
    const set = new Set(cached.postIds)
    return posts.filter((p) => set.has(p.id) && !mutedSet.has(p.authorId) && !blockedSet.has(p.authorId)).slice(0, 60)
  }, [activeQuery, data, posts, mutedSet, blockedSet])

  const sysPrefix = () => {
    const globalPresets = getGlobalPresets()
    return globalPresets ? `${globalPresets}\n\n` : ''
  }

  const withLoading = async (stage: string, fn: () => Promise<void>) => {
    if (refreshLockRef.current) return
    refreshLockRef.current = true
    startLoadingAnim()
    setLoadingOpen(true)
    setLoadingStage(stage)
    try {
      await fn()
      setLoadingProgress(100)
      window.setTimeout(() => setLoadingOpen(false), 240)
    } finally {
      stopLoadingTimer()
      refreshLockRef.current = false
    }
  }

  const callJson = async (system: string, user: string, maxTokens: number) => {
    const res = await callLLM(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      undefined,
      { maxTokens, timeoutMs: 600000, temperature: 0.9 }
    )
    return tryParseJsonBlock(res) || {}
  }

  const refreshHome = async () => {
    if (!data) return
    const mode = homeMode
    const followUsers = data.users.filter((u) => (data.follows || []).includes(u.id))
    const authorPool =
      mode === 'following'
        ? followUsers.map((u) => u.name).slice(0, 12)
        : data.users.map((u) => u.name).slice(0, 18)

    const authorHint = authorPool.length ? authorPool.join('、') : '随机构造一些网名（2~4字/英文混合都可以）'

    const want = 5 + Math.floor(Math.random() * 11) // 5~15
    await withLoading(mode === 'following' ? '正在刷新正在关注…' : '正在刷新为你推荐…', async () => {
      const sys =
        sysPrefix() +
        `【X（推特风格）/首页信息流生成】\n` +
        `你要生成一些“像真的推特/X”的帖子（短为主，偶尔长一点）。\n` +
        `要求（重要，必须遵守）：\n` +
        `- 每次生成 ${want} 条\n` +
        `- 长度分布：至少 3 条超短（1~20字）；至少 3 条中等（20~80字）；最多 2 条接近上限（80~140字）\n` +
        `- 风格必须有明显差异：吐槽/阴阳怪气/梗/碎碎念/认真科普/一句话问号/冷幽默/新闻搬运 等至少 6 种\n` +
        `- 可以带情绪与脏话，但严禁辱女/性羞辱词汇\n` +
        `- 不要出现违法内容、未成年人性内容、极端仇恨\n` +
        `- 作者名字必须多样：至少 30% 非中文（英文/日文/韩文/混合都可以）\n` +
        `- 可选字段：hashtags（0~3 个话题，不要每条都堆）；imageDesc（可选，用一句话描述“配图”，像真的配图说明）\n` +
        `- 只输出 JSON，不要解释\n` +
        `\n` +
        `可用作者名字参考：${authorHint}\n` +
        `\n` +
        `JSON 格式：\n` +
        `{\n` +
        `  "posts": [ { "authorName": "名字", "text": "内容(<=140字)", "hashtags": ["话题"], "imageDesc": "图片描述(可选)" } ]\n` +
        `}\n`

      const parsed = await callJson(sys, '现在生成 posts。', 900)
      const raw = Array.isArray((parsed as any).posts) ? (parsed as any).posts : []

      let next = data
      const newPosts: XPost[] = []
      for (const p of raw.slice(0, want)) {
        const authorName = String(p?.authorName || '').trim()
        const text = String(p?.text || '').trim()
        if (!text) continue
        const ensured = (() => {
          const { data: d2, userId } = xEnsureUser(next, { name: authorName || 'User' })
          next = d2
          const u = next.users.find((x) => x.id === userId)
          return {
            id: userId,
            name: (authorName || 'User').trim() || 'User',
            handle: u?.handle || xMakeHandle(authorName || 'User'),
            color: u?.color || xMakeColor((u?.handle || authorName || 'User').trim()),
          }
        })()
        const post = xNewPost(ensured.id, ensured.name, text)
        post.authorHandle = ensured.handle
        post.authorColor = ensured.color
        post.hashtags = Array.isArray(p?.hashtags) ? p.hashtags.slice(0, 6).map((t: any) => String(t || '').replace(/^#/, '').trim()).filter(Boolean) : []
        post.imageDesc = typeof p?.imageDesc === 'string' ? p.imageDesc.trim().slice(0, 260) : ''
        // 随机一点互动数（不追求真实算法）
        post.likeCount = Math.floor(Math.random() * 800)
        post.repostCount = Math.floor(Math.random() * 180)
        post.replyCount = Math.floor(Math.random() * 90)
        newPosts.push(post)
      }

      // 留存：非我的帖子最多 50；我的帖子永久保留
      const mine = (next.posts || []).filter((p) => p.authorId === 'me')
      const others = [...newPosts, ...next.posts].filter((p) => p.authorId !== 'me').slice(0, 50)
      next = { ...next, posts: [...mine, ...others].slice(0, 600) }
      setData(next)
      await xSave(next)
    })
  }

  const doSearch = async (q: string, force: boolean) => {
    if (!data) return
    const key = (q || '').trim()
    if (!key) return

    const cached = data.searchCache?.[key]
    if (!force && cached?.postIds?.length) {
      const nextHistory = [key, ...(data.searchHistory || []).filter((x) => x !== key)].slice(0, 10)
      if ((data.searchHistory || []).join('|') !== nextHistory.join('|')) {
        const next: XDataV1 = { ...data, searchHistory: nextHistory }
        setData(next)
        void xSave(next)
      }
      setActiveQuery(key)
      return
    }

    const want = 5 + Math.floor(Math.random() * 11) // 5~15
    await withLoading(`正在搜索「${key}」…`, async () => {
      const sys =
        sysPrefix() +
        `【X（推特风格）/搜索生成】\n` +
        `用户在搜索一个话题/关键词：${key}\n` +
        `你要生成一组“像真的推特/X 搜索结果”的帖子（更贴合关键词，不要空泛）。\n` +
        `要求（重要）：\n` +
        `- 每次生成 ${want} 条\n` +
        `- 长度分布：至少 4 条超短；至少 4 条中等；最多 2 条接近上限\n` +
        `- 风格差异：至少 6 种不同口吻\n` +
        `- 必须出现与关键词强相关的内容/细节/立场冲突/玩梗（但不要写成小作文）\n` +
        `- 允许情绪与脏话，但严禁辱女/性羞辱词汇\n` +
        `- 不要出现违法内容、未成年人性内容、极端仇恨\n` +
        `- 作者名字必须多样：至少 30% 非中文（英文/日文/韩文/混合都可以）\n` +
        `- hashtags（0~3）建议包含关键词或其变体；imageDesc 可选\n` +
        `- 只输出 JSON，不要解释\n` +
        `\n` +
        `JSON 格式：\n` +
        `{\n` +
        `  "posts": [ { "authorName": "名字", "text": "内容(<=140字)", "hashtags": ["话题"], "imageDesc": "图片描述(可选)" } ]\n` +
        `}\n`
      const parsed = await callJson(sys, '现在生成 posts。', 900)
      const raw = Array.isArray((parsed as any).posts) ? (parsed as any).posts : []

      let next = data
      const ids: string[] = []
      const newPosts: XPost[] = []
      for (const p of raw.slice(0, want)) {
        const authorName = String(p?.authorName || '').trim()
        const text = String(p?.text || '').trim()
        if (!text) continue
        const ensured = (() => {
          const { data: d2, userId } = xEnsureUser(next, { name: authorName || 'User' })
          next = d2
          const u = next.users.find((x) => x.id === userId)
          return {
            id: userId,
            name: (authorName || 'User').trim() || 'User',
            handle: u?.handle || xMakeHandle(authorName || 'User'),
            color: u?.color || xMakeColor((u?.handle || authorName || 'User').trim()),
          }
        })()
        const post = xNewPost(ensured.id, ensured.name, text)
        post.authorHandle = ensured.handle
        post.authorColor = ensured.color
        post.hashtags = Array.isArray(p?.hashtags) ? p.hashtags.slice(0, 6).map((t: any) => String(t || '').replace(/^#/, '').trim()).filter(Boolean) : []
        post.imageDesc = typeof p?.imageDesc === 'string' ? p.imageDesc.trim().slice(0, 260) : ''
        post.likeCount = Math.floor(Math.random() * 1200)
        post.repostCount = Math.floor(Math.random() * 260)
        post.replyCount = Math.floor(Math.random() * 120)
        ids.push(post.id)
        newPosts.push(post)
      }

      next = {
        ...next,
        posts: (() => {
          const mine = (next.posts || []).filter((p) => p.authorId === 'me')
          const others = [...newPosts, ...next.posts].filter((p) => p.authorId !== 'me').slice(0, 50)
          return [...mine, ...others].slice(0, 650)
        })(),
        searchCache: {
          ...(next.searchCache || {}),
          [key]: { postIds: ids, updatedAt: Date.now() },
        },
        searchHistory: [key, ...(next.searchHistory || []).filter((x) => x !== key)].slice(0, 10),
      }
      setData(next)
      await xSave(next)
      setActiveQuery(key)
    })
  }

  const refreshReplies = async () => {
    if (!data || !openPost) return
    await withLoading('正在加载更多评论…', async () => {
      const myRecent = (data.replies || [])
        .filter((r) => r.postId === openPost.id && r.authorId === 'me')
        .slice(-5)
        .map((r) => `- ${r.text.replace(/\s+/g, ' ').slice(0, 120)}`)
        .join('\n')
      const want = 8 + Math.floor(Math.random() * 13) // 8~20
      const sys =
        sysPrefix() +
        `【X（推特风格）/评论区生成】\n` +
        `你要生成一些评论，像推特评论区那样。\n` +
        `主贴作者：${openPost.authorName}\n` +
        `主贴内容：${openPost.text}\n` +
        `用户（我）的最近评论（如果有）：\n${myRecent || '（无）'}\n` +
        `要求（重要）：\n` +
        `- 生成 ${want} 条评论\n` +
        `- 如果用户发过评论：本次新评论中，必须有 20%~40% 是“在和用户评论互动”的（回复/引用/阴阳/支持/反驳都行）\n` +
        `- 其余可以是路人互相对线/玩梗/补充信息\n` +
        `- 长度分布：至少 2 条超短（比如“？”“笑死”“懂了”）\n` +
        `- 允许情绪与脏话，但严禁辱女/性羞辱词汇\n` +
        `- 不要出现违法内容、未成年人性内容、极端仇恨\n` +
        `- 每条 <= 120 字\n` +
        `- 只输出 JSON，不要解释\n` +
        `\n` +
        `JSON 格式：\n` +
        `{\n` +
        `  "replies": [ { "authorName": "名字", "text": "评论" } ]\n` +
        `}\n`
      const parsed = await callJson(sys, '现在生成 replies。', 700)
      const raw = Array.isArray((parsed as any).replies) ? (parsed as any).replies : []

      let next = data
      const newReplies: XReply[] = []
      for (const r of raw.slice(0, want)) {
        const authorName = String(r?.authorName || '').trim()
        const text = String(r?.text || '').trim()
        if (!text) continue
        const ensured = (() => {
          const { data: d2, userId } = xEnsureUser(next, { name: authorName || 'User' })
          next = d2
          return { id: userId, name: (authorName || 'User').trim() || 'User' }
        })()
        newReplies.push(xNewReply(openPost.id, ensured.id, ensured.name, text))
      }

      // 轻量更新 replyCount
      const updatedPosts = next.posts.map((p) => (p.id === openPost.id ? { ...p, replyCount: Math.max(0, (p.replyCount || 0) + newReplies.length) } : p))
      // 留存：每个帖子的评论最多 50（按最早删）
      const combined = [...next.replies, ...newReplies]
      const grouped: Record<string, XReply[]> = {}
      for (const r of combined) {
        ;(grouped[r.postId] ||= []).push(r)
      }
      const pruned: XReply[] = []
      for (const [, arr] of Object.entries(grouped)) {
        arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        const keep = arr.slice(-50)
        pruned.push(...keep)
      }
      pruned.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      next = { ...next, posts: updatedPosts, replies: pruned }
      setData(next)
      await xSave(next)
    })
  }

  const postMyTweet = async () => {
    if (!data) return
    const text = composeText.trim()
    if (!text) return
    const mePost = xNewPost('me', meName, text)
    const follower = bumpFollowers(data.meFollowerCount || 0)
    let next: XDataV1 = { ...data, posts: [mePost, ...data.posts], meFollowerCount: follower.nextVal }
    setData(next)
    await xSave(next)
    setComposeText('')
    setComposeOpen(false)
    setHomeMode('forYou')
    setTab('home')
    setView('post')
    setOpenPostId(mePost.id)
    setReplyDraft('')
  }

  const addMyReply = async () => {
    if (!data || !openPost) return
    const text = replyDraft.trim()
    if (!text) return
    const r = xNewReply(openPost.id, 'me', meName, text)
    const updatedPosts = data.posts.map((p) => (p.id === openPost.id ? { ...p, replyCount: (p.replyCount || 0) + 1 } : p))
    // 用户可无限评论，但留存每帖最多 50（旧的按最早删）
    const combined = [...data.replies, r]
    const grouped: Record<string, XReply[]> = {}
    for (const rr of combined) {
      ;(grouped[rr.postId] ||= []).push(rr)
    }
    const pruned: XReply[] = []
    for (const [, arr] of Object.entries(grouped)) {
      arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      pruned.push(...arr.slice(-50))
    }
    const follower = bumpFollowers(data.meFollowerCount || 0)
    const next: XDataV1 = { ...data, posts: updatedPosts, replies: pruned, meFollowerCount: follower.nextVal }
    setData(next)
    await xSave(next)
    setReplyDraft('')
    // 你发了评论后：再点刷新就会触发路人互动（由 refreshReplies 做）
  }

  const deletePostById = async (postId: string) => {
    if (!data) return
    const nextPosts = (data.posts || []).filter((p) => p.id !== postId)
    const nextReplies = (data.replies || []).filter((r) => r.postId !== postId)
    const next: XDataV1 = { ...data, posts: nextPosts, replies: nextReplies }
    setData(next)
    await xSave(next)
    if (openPostId === postId) {
      setOpenPostId(null)
      setView('main')
    }
  }

  const deleteReplyById = async (replyId: string, postId?: string) => {
    if (!data) return
    const nextReplies = (data.replies || []).filter((r) => r.id !== replyId)
    const nextPosts = (data.posts || []).map((p) => {
      if (postId && p.id === postId) {
        return { ...p, replyCount: Math.max(0, (p.replyCount || 0) - 1) }
      }
      return p
    })
    const next: XDataV1 = { ...data, replies: nextReplies, posts: nextPosts }
    setData(next)
    await xSave(next)
  }

  const toggleLike = async (postId: string) => {
    if (!data) return
    const nextPosts = data.posts.map((p) => {
      if (p.id !== postId) return p
      const liked = !!p.likedByMe
      return { ...p, likedByMe: !liked, likeCount: Math.max(0, (p.likeCount || 0) + (liked ? -1 : 1)) }
    })
    const next: XDataV1 = { ...data, posts: nextPosts }
    setData(next)
    await xSave(next)
  }

  const toggleRepost = async (postId: string) => {
    if (!data) return
    const p = data.posts.find((x) => x.id === postId)
    if (!p) return
    // 轻量：直接在原贴上做“我已转发”状态，不额外生成新贴（避免列表复杂）
    const nextPosts = data.posts.map((x) => {
      if (x.id !== postId) return x
      const r = !!x.repostedByMe
      return { ...x, repostedByMe: !r, repostCount: Math.max(0, (x.repostCount || 0) + (r ? -1 : 1)) }
    })
    const next: XDataV1 = { ...data, posts: nextPosts }
    setData(next)
    await xSave(next)
  }

  const openUserProfile = (userId: string) => {
    setData((prev) => {
      if (!prev) return prev
      const { data: d2 } = ensureXUserFromCharacter(prev, userId)
      if (d2 !== prev) void xSave(d2)
      return d2
    })
    setOpenProfileUserId(userId)
    setView('profile')
  }

  const openDMThread = (threadId: string) => {
    setOpenThreadId(threadId)
    setDmDraft('')
    setView('dm')
    void markThreadRead(threadId)
  }

  const ensureThreadForUser = async (peerId: string, peerName: string) => {
    if (!data) return null
    const existing = data.dms.find((t) => t.peerId === peerId)
    if (existing) return existing.id
    const now = Date.now()
    const t = {
      id: `xdmt_${now}_${Math.random().toString(16).slice(2)}`,
      peerId,
      peerName,
      updatedAt: now,
      messages: [],
    }
    const next: XDataV1 = { ...data, dms: [t, ...(data.dms || [])].slice(0, 20) }
    setData(next)
    await xSave(next)
    return t.id
  }

  const markThreadRead = async (threadId: string) => {
    setData((prev) => {
      if (!prev) return prev
      const threads = (prev.dms || []).slice()
      const idx = threads.findIndex((t) => t.id === threadId)
      if (idx < 0) return prev
      const t = threads[idx]
      if (!t.unreadCount) return prev
      const t2 = { ...t, unreadCount: 0 }
      threads[idx] = t2
      const next: XDataV1 = { ...prev, dms: threads }
      void xSave(next)
      return next
    })
  }

  const updateDmMessage = async (threadId: string, messageId: string, patch: Partial<{ translatedZh: string; translationStatus: 'pending' | 'done' | 'error' }>) => {
    setData((prev) => {
      if (!prev) return prev
      const threads = (prev.dms || []).slice()
      const idx = threads.findIndex((t) => t.id === threadId)
      if (idx < 0) return prev
      const t = threads[idx]
      const messages = (t.messages || []).map((m) => (m.id === messageId ? { ...m, ...patch } : m))
      const t2 = { ...t, messages }
      threads[idx] = t2
      const next: XDataV1 = { ...prev, dms: threads }
      void xSave(next)
      return next
    })
  }

  const scheduleDmMessages = (
    threadId: string,
    peerId: string,
    peerName: string,
    lang: 'zh' | 'en' | 'ja' | 'ko',
    items: Array<{ id: string; text: string; at: number; _dual?: ReturnType<typeof parseDualLine> | null }>
  ) => {
    let totalDelay = 0
    items.forEach((item, index) => {
      totalDelay += calcDmDelay(index, item.text)
      window.setTimeout(() => {
        const now = Date.now()
        setData((prev) => {
          if (!prev) return prev
          const threads = (prev.dms || []).slice()
          const idx = threads.findIndex((t) => t.id === threadId)
          const isThreadOpen = viewRef.current === 'dm' && openThreadIdRef.current === threadId
          const baseMsg: XDMMessage = {
            id: item.id,
            from: 'peer' as const,
            text: item.text,
            at: now,
            lang,
            translatedZh: undefined,
            translationStatus: lang !== 'zh' ? ('pending' as const) : undefined,
          }
          if (idx >= 0) {
            const t = threads[idx]
            const t2 = {
              ...t,
              peerId,
              peerName,
              updatedAt: now,
              unreadCount: isThreadOpen ? 0 : Math.max(0, (t.unreadCount || 0) + 1),
              messages: [...(t.messages || []), baseMsg].slice(-160),
            }
            threads.splice(idx, 1)
            threads.unshift(t2)
          } else {
            threads.unshift({
              id: threadId,
              peerId,
              peerName,
              updatedAt: now,
              unreadCount: isThreadOpen ? 0 : 1,
              messages: [baseMsg],
            })
          }
          const next: XDataV1 = { ...prev, dms: threads }
          void xSave(next)
          return next
        })

        if (lang !== 'zh') {
          const dual = item._dual || null
          if (dual) {
            window.setTimeout(() => {
              void updateDmMessage(threadId, item.id, { translatedZh: dual.zh, translationStatus: 'done' })
            }, 420 + Math.random() * 520)
          } else {
            window.setTimeout(() => {
              ;(async () => {
                try {
                  const sys =
                    `你是一个翻译器。把用户给你的内容翻译成“简体中文”。\n` +
                    `要求：\n` +
                    `- 只输出中文翻译，不要解释\n` +
                    `- 保留人名/歌名/专有名词原样\n` +
                    `- 不要添加引号/括号/前后缀\n`
                  const zh = await callLLM(
                    [
                      { role: 'system', content: sys },
                      { role: 'user', content: item.text },
                    ],
                    undefined,
                    { maxTokens: 140, timeoutMs: 60000, temperature: 0.2 }
                  )
                  const cleaned = (zh || '').trim()
                  void updateDmMessage(threadId, item.id, { translatedZh: cleaned || '（空）', translationStatus: cleaned ? 'done' : 'error' })
                } catch {
                  void updateDmMessage(threadId, item.id, { translationStatus: 'error' })
                }
              })()
            }, 200 + Math.random() * 250)
          }
        }
      }, totalDelay)
    })
  }

  const refreshDMThread = async (threadId: string) => {
    if (!data) return
    const hasMyContent = (data.posts || []).some((p) => p.authorId === 'me') || (data.replies || []).some((r) => r.authorId === 'me')
    if (!hasMyContent) {
      setTipDialog({ open: true, title: '先发一条', message: '你还没有发过推文/评论，先发布一条再刷新私信吧。' })
      return
    }
    const thread = (data.dms || []).find((t) => t.id === threadId)
    if (!thread) return
    const meta = getUserMeta(thread.peerId)
    await withLoading('正在刷新私信…', async () => {
      const recent = (thread.messages || []).slice(-16).map((m) => ({ role: m.from === 'me' ? 'user' : 'assistant', content: m.text }))
      const peerCharacter = characters.find((c) => c.id === thread.peerId)
      const peerLang = peerCharacter ? mapWeChatLang((peerCharacter as any).language) : normalizeLang((meta as any).lang)
      const myRecentPosts = (data.posts || [])
        .filter((p) => p.authorId === 'me')
        .slice(0, 6)
        .map((p) => `- ${p.text.replace(/\s+/g, ' ').slice(0, 80)}`)
        .join('\n')
      const myRecentReplies = (data.replies || [])
        .filter((r) => r.authorId === 'me')
        .slice(-6)
        .map((r) => `- ${r.text.replace(/\s+/g, ' ').slice(0, 80)}`)
        .join('\n')
      const sys =
        sysPrefix() +
        `【X（推特风格）/私信会话】\n` +
        `对方网名：${meta.name}\n` +
        `对方账号：${meta.handle}\n` +
        `对方主要语言：${peerLang}\n` +
        `用户：${meName}（${data.meHandle || xMakeHandle(meName)}）\n` +
        (peerCharacter
          ? `对方角色人设：${(peerCharacter.prompt || '').replace(/\s+/g, ' ').slice(0, 280)}\n` +
            `对方长期记忆摘要：${(peerCharacter as any).memorySummary || '（无）'}\n`
          : '') +
        `用户最近发的推文：\n${myRecentPosts || '（无）'}\n` +
        `用户最近的评论：\n${myRecentReplies || '（无）'}\n` +
        `要求：\n` +
        `- 像真实私信，短一点\n` +
        `- 这次输出 1~5 条新消息，每条一行\n` +
        `- 允许情绪与脏话，但严禁辱女/性羞辱词汇\n` +
        `- 你是对方账号本人，不要代替用户说话，不要自称“用户/我”（除非在对话中指代自己）\n` +
        (peerLang === 'zh'
          ? `- 只输出对方消息正文，不要解释\n`
          : `- 必须使用对方主要语言输出\n- 每条都必须按这个格式输出：外语原文 ||| 中文翻译\n- 中文翻译必须是简体中文，只允许用 "|||" 作为分隔符\n`)
      const res = await callLLM([{ role: 'system', content: sys }, ...recent], undefined, {
        maxTokens: 420,
        timeoutMs: 600000,
        temperature: 0.9,
      })
      const lines = splitDmLines(res, 5)
      if (!lines.length) return
      const base = Date.now()
      const newMsgs = lines.map((line, i) => {
        const trimmed = line.trim()
        const dual = peerLang !== 'zh' ? parseDualLine(trimmed) : null
        const text = dual ? dual.orig : trimmed
        return {
          id: `xdm_${base + i}_${Math.random().toString(16).slice(2)}`,
          from: 'peer' as const,
          text: text.slice(0, 260),
          at: base + i * 320,
          lang: peerLang,
          translatedZh: undefined,
          translationStatus: peerLang !== 'zh' ? 'pending' : undefined,
          _dual: dual,
        }
      })
      scheduleDmMessages(threadId, thread.peerId, thread.peerName, peerLang, newMsgs)
    })
  }

  const sendDMInThread = async (threadId: string) => {
    if (!data) return
    const text = dmDraft.trim()
    if (!text) return
    const threads = (data.dms || []).slice()
    const idx = threads.findIndex((t) => t.id === threadId)
    if (idx < 0) return
    const now = Date.now()
    const userMsg = { id: `xdm_${now}_${Math.random().toString(16).slice(2)}`, from: 'me' as const, text: text.slice(0, 260), at: now }
    const t = threads[idx]
    const t2 = { ...t, updatedAt: now, unreadCount: 0, messages: [...(t.messages || []), userMsg].slice(-160) }
    threads.splice(idx, 1)
    threads.unshift(t2)
    const next: XDataV1 = { ...data, dms: threads }
    setData(next)
    await xSave(next)
    setDmDraft('')
    // 发送后不自动生成对方（保持“刷新=生成”规则）
  }

  const bumpFollowers = (base?: number) => {
    const roll = Math.random()
    let inc = 0
    if (roll < 0.45) inc = Math.floor(Math.random() * 6) // 0-5
    else if (roll < 0.8) inc = 6 + Math.floor(Math.random() * 9) // 6-14
    else inc = 15 + Math.floor(Math.random() * 30) // 15-44
    const nextVal = Math.max(0, (base || 0) + inc)
    return { inc, nextVal }
  }

  const toggleFollow = async (userId: string) => {
    if (!data) return
    if (userId === 'me') return
    let next = data
    const set = new Set(next.follows || [])
    if (set.has(userId)) set.delete(userId)
    else {
      const ensured = ensureXUserFromCharacter(next, userId)
      next = ensured.data
      set.add(userId)
    }
    const updated: XDataV1 = { ...next, follows: Array.from(set) }
    setData(updated)
    await xSave(updated)
  }

  const muteUser = async (userId: string) => {
    if (!data) return
    if (userId === 'me') return
    const set = new Set(data.muted || [])
    set.add(userId)
    const next: XDataV1 = { ...data, muted: Array.from(set) }
    setData(next)
    await xSave(next)
  }

  const blockUser = async (userId: string) => {
    if (!data) return
    if (userId === 'me') return
    const set = new Set(data.blocked || [])
    set.add(userId)
    const next: XDataV1 = { ...data, blocked: Array.from(set) }
    setData(next)
    await xSave(next)
  }

  const shareToWeChat = (postId: string) => {
    setShareTargetPostId(postId)
    setShareOpen(true)
  }

  const doShareToCharacter = (targetCharacterId: string) => {
    if (!data || !shareTargetPostId) return
    const p = data.posts.find((x) => x.id === shareTargetPostId)
    if (!p) return
    const excerpt = p.text.replace(/\s+/g, ' ').slice(0, 60)
    // 这里先按“日记文件”逻辑：卡片短，但内部带全文（后续会在微信侧加渲染和AI读取）
    addMessage({
      characterId: targetCharacterId,
      isUser: true,
      type: 'tweet_share',
      content: '推文',
      tweetId: p.id,
      tweetAuthorName: p.authorName,
      tweetAt: p.createdAt,
      tweetExcerpt: excerpt,
      tweetContent: p.text,
      tweetStats: `赞 ${p.likeCount} · 转发 ${p.repostCount} · 评论 ${p.replyCount}`,
    })
    setShareOpen(false)
    setShareTargetPostId(null)
    setShareResult({ open: true, targetId: targetCharacterId })
  }

  const ensureXUserFromCharacter = (next: XDataV1, characterId: string) => {
    const c = characters.find((ch) => ch.id === characterId)
    if (!c) return { data: next, userId: characterId }
    const { data: d2, userId } = xEnsureUser(next, {
      id: c.id,
      name: c.name,
      avatarUrl: c.avatar || undefined,
      bio: (c.prompt || '').replace(/\s+/g, ' ').slice(0, 80) || undefined,
    })
    return { data: d2, userId }
  }

  const handlePickMeAvatar = () => {
    setAvatarEditTargetId('me')
    avatarInputRef.current?.click()
  }
  const handlePickMeBanner = () => {
    setBannerEditTargetId('me')
    bannerInputRef.current?.click()
  }

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await compressImageFileToDataUrl(file, { maxSide: 720 })
    setData((prev) => {
      if (!prev) return prev
      const targetId = avatarEditTargetId || 'me'
      if (targetId === 'me') {
        const next = { ...prev, meAvatarUrl: dataUrl }
        void xSave(next)
        return next
      }
      const users = (prev.users || []).map((u) => (u.id === targetId ? { ...u, avatarUrl: dataUrl } : u))
      const next = { ...prev, users }
      void xSave(next)
      return next
    })
    setAvatarEditTargetId(null)
    e.currentTarget.value = ''
  }

  const handleMeBannerChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await compressImageFileToDataUrl(file, { maxSide: 1400 })
    setData((prev) => {
      if (!prev) return prev
      const targetId = bannerEditTargetId || 'me'
      if (targetId === 'me') {
        const next = { ...prev, meBannerUrl: dataUrl }
        void xSave(next)
        return next
      }
      const users = (prev.users || []).map((u) => (u.id === targetId ? { ...u, bannerUrl: dataUrl } : u))
      const next = { ...prev, users }
      void xSave(next)
      return next
    })
    setBannerEditTargetId(null)
    e.currentTarget.value = ''
  }


  const openProfileEditor = () => {
    const meta = getUserMeta('me')
    setProfileDraftName(String(meta.name || ''))
    setProfileDraftBio(String(meta.bio || ''))
    setProfileEditOpen(true)
  }

  const saveProfileEditor = () => {
    const name = profileDraftName.trim().slice(0, 24)
    const bio = profileDraftBio.trim().slice(0, 120)
    setData((prev) => {
      if (!prev) return prev
      const next: XDataV1 = { ...prev, meDisplayName: name || prev.meName, meBio: bio }
      void xSave(next)
      return next
    })
    setProfileEditOpen(false)
  }

  const getUserMeta = (userId: string) => {
    if (!data) {
      return { name: userId === 'me' ? meName : 'User', handle: userId === 'me' ? xMakeHandle(meName) : xMakeHandle('User'), color: xMakeColor(userId) }
    }
    if (userId === 'me') {
      const handle = data.meHandle || xMakeHandle(meName)
      return {
        name: data.meDisplayName || meName,
        handle,
        color: xMakeColor(handle),
        avatarUrl: data.meAvatarUrl || xMakeAvatarSvgDataUrl(handle + '::' + meName, meName),
        bannerUrl: data.meBannerUrl || xMakeBannerSvgDataUrl(handle + '::banner'),
        bio: data.meBio || '',
      }
    }
    const u = data.users.find((x) => x.id === userId)
    const name = u?.name || 'User'
    const handle = u?.handle || xMakeHandle(name)
    const color = u?.color || xMakeColor(handle)
    return {
      name,
      handle,
      color,
      avatarUrl: (u as any)?.avatarUrl as string | undefined || xMakeAvatarSvgDataUrl(handle + '::' + name, name),
      bannerUrl: (u as any)?.bannerUrl as string | undefined || xMakeBannerSvgDataUrl(handle + '::banner'),
      lang: (u as any)?.lang as any,
      bio: (u as any)?.bio as string | undefined,
    }
  }

  const refreshCurrentPage = async () => {
    if (!data) return
    if (view === 'post') return await refreshReplies()
    if (view === 'profile') {
      if (openProfileUserId && openProfileUserId !== 'me') {
        return await withLoading('正在刷新TA的日常…', async () => {
          let next = data
          const { data: synced } = ensureXUserFromCharacter(next, openProfileUserId)
          next = synced
          const meta = getUserMeta(openProfileUserId)
          const myRecentPosts = (next.posts || [])
            .filter((p) => p.authorId === openProfileUserId)
            .slice(0, 6)
            .map((p) => `- ${p.text.replace(/\s+/g, ' ').slice(0, 80)}`)
            .join('\n')
          const want = 1 + Math.floor(Math.random() * 5)
          const sys =
            sysPrefix() +
            `【X（推特风格）/角色主页日常生成】\n` +
            `角色：${meta.name}\n` +
            `账号：${meta.handle}\n` +
            `人物设定：${meta.bio || '（无）'}\n` +
            `最近已发：\n${myRecentPosts || '（无）'}\n` +
            `要求：\n` +
            `- 生成 ${want} 条“日常/碎碎念”推文\n` +
            `- 更像真实推特，不要过长\n` +
            `- 允许情绪与脏话，但严禁辱女/性羞辱词汇\n` +
            `- 只输出 JSON\n` +
            `\n` +
            `JSON 格式：\n` +
            `{\n` +
            `  "posts": [ { "text": "内容(<=140字)", "hashtags": ["话题"], "imageDesc": "图片描述(可选)" } ]\n` +
            `}\n`
          const parsed = await callJson(sys, '现在生成 posts。', 700)
          const raw = Array.isArray((parsed as any).posts) ? (parsed as any).posts : []
          const newPosts: XPost[] = []
          for (const p of raw.slice(0, want)) {
            const text = String(p?.text || '').trim()
            if (!text) continue
            const post = xNewPost(openProfileUserId, meta.name, text)
            post.authorHandle = meta.handle
            post.authorColor = meta.color
            post.hashtags = Array.isArray(p?.hashtags) ? p.hashtags.slice(0, 6).map((t: any) => String(t || '').replace(/^#/, '').trim()).filter(Boolean) : []
            post.imageDesc = typeof p?.imageDesc === 'string' ? p.imageDesc.trim().slice(0, 260) : ''
            post.likeCount = Math.floor(Math.random() * 800)
            post.repostCount = Math.floor(Math.random() * 180)
            post.replyCount = Math.floor(Math.random() * 90)
            newPosts.push(post)
          }
          const mine = (next.posts || []).filter((p) => p.authorId === 'me')
          const others = [...newPosts, ...next.posts].filter((p) => p.authorId !== 'me').slice(0, 80)
          next = { ...next, posts: [...mine, ...others].slice(0, 650) }
          setData(next)
          await xSave(next)
        })
      }
      // 轻量：刷新个人主页=生成一些通知（点赞/评论/关注）
      return await withLoading('正在刷新主页动态…', async () => {
        const minePosts = data.posts.filter((p) => p.authorId === 'me').slice(0, 6)
        const mineHint = minePosts.map((p) => `- ${p.id}：${p.text.slice(0, 60)}`).join('\n') || '（暂无）'
        const sys =
          sysPrefix() +
          `【X（推特风格）/个人主页动态生成】\n` +
          `用户：${meName}\n` +
          `用户最近发的帖子：\n${mineHint}\n` +
          `要求：\n` +
          `- 生成最多 5 条“通知事件”：有人点赞/回复/关注/转发\n` +
          `- 名字随机构造\n` +
          `- 允许情绪与脏话，但严禁辱女/性羞辱词汇\n` +
          `- 只输出 JSON\n` +
          `\n` +
          `JSON 格式：\n` +
          `{\n` +
          `  "events": [ { "kind": "like|reply|follow|repost", "fromName": "名字", "postId": "可选", "snippet": "可选" } ]\n` +
          `}\n`
        const parsed = await callJson(sys, '现在生成 events。', 550)
        const ev = Array.isArray((parsed as any).events) ? (parsed as any).events : []

        let next = data
        const notifs = (next.notifications || []).slice()
        for (const e of ev.slice(0, 6)) {
          const kind = String(e?.kind || 'like')
          const fromName = String(e?.fromName || '').trim() || 'User'
          const ensured = (() => {
            const { data: d2, userId } = xEnsureUser(next, { name: fromName })
            next = d2
            return { id: userId, name: fromName }
          })()
          const postId = String(e?.postId || '').trim()
          const snippet = String(e?.snippet || '').trim().slice(0, 80)
          notifs.unshift({
            id: `xn_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            kind: kind === 'reply' || kind === 'follow' || kind === 'repost' ? kind : 'like',
            at: Date.now(),
            fromUserId: ensured.id,
            fromUserName: ensured.name,
            postId: postId || undefined,
            snippet: snippet || undefined,
            read: false,
          })
        }
        next = { ...next, notifications: notifs.slice(0, 200) }
        setData(next)
        await xSave(next)
      })
    }

    if (tab === 'home') return await refreshHome()
    if (tab === 'search') return await doSearch(activeQuery || query, true)
    if (tab === 'messages') {
      const hasMyContent = (data.posts || []).some((p) => p.authorId === 'me') || (data.replies || []).some((r) => r.authorId === 'me')
      if (!hasMyContent) {
        setTipDialog({ open: true, title: '先发一条', message: '你还没有发过推文/评论，先发布一条再刷新私信吧。' })
        return
      }
      return await withLoading('正在刷新私信…', async () => {
        const myRecentPosts = (data.posts || [])
          .filter((p) => p.authorId === 'me')
          .slice(0, 6)
          .map((p) => `- ${p.text.replace(/\s+/g, ' ').slice(0, 80)}`)
          .join('\n')
        const myRecentReplies = (data.replies || [])
          .filter((r) => r.authorId === 'me')
          .slice(-6)
          .map((r) => `- ${r.text.replace(/\s+/g, ' ').slice(0, 80)}`)
          .join('\n')
        const sys =
          sysPrefix() +
          `【X（推特风格）/私信刷新生成】\n` +
          `你要生成 2~5 条“陌生人私信”或“已有私信的新消息”。\n` +
          `要求：\n` +
          `- 每条消息都要给出对方语言：zh/en/ja/ko\n` +
          `- 如果是外国人：消息正文必须用对应语言（比如 ja 用日语，ko 用韩语，en 用英文）\n` +
          `- 如果 lang 不是 zh：texts 里的每条必须是“外语原文 ||| 中文翻译”格式\n` +
          `- 每个对话可以发 1~5 条连续私信（请用 texts 数组表示）\n` +
          `- 内容像推特私信，短一点\n` +
          `- 私信内容尽量结合用户最近发的推文/评论\n` +
          `- 允许情绪与脏话，但严禁辱女/性羞辱词汇\n` +
          `- 只输出 JSON\n` +
          `\n` +
          `用户最近发的推文：\n${myRecentPosts || '（无）'}\n` +
          `用户最近的评论：\n${myRecentReplies || '（无）'}\n` +
          `\n` +
          `JSON 格式：\n` +
          `{\n` +
          `  "messages": [ { "peerName": "名字", "lang": "zh|en|ja|ko", "texts": ["消息1","消息2"] } ]\n` +
          `}\n`
        const parsed = await callJson(sys, '现在输出 JSON。', 520)
        const list = Array.isArray((parsed as any).messages) ? (parsed as any).messages : []
        if (list.length === 0) return

        let next = data
        const scheduleQueue: Array<{
          threadId: string
          peerId: string
          peerName: string
          lang: 'zh' | 'en' | 'ja' | 'ko'
          messages: Array<{ id: string; text: string; at: number; _dual?: ReturnType<typeof parseDualLine> | null }>
        }> = []
        for (const item of list.slice(0, 5)) {
          let peerName = String(item?.peerName || '').trim() || '陌生人'
          if (peerName === meName) peerName = `${meName}的粉丝`
          const lang = normalizeLang(String(item?.lang || 'zh').trim())
          const rawTexts = Array.isArray(item?.texts) ? item.texts : [item?.text]
          const textList: string[] = rawTexts
            .map((t: any) => String(t || '').trim())
            .filter(Boolean)
            .flatMap((t: string) => splitDmLines(t, 5))
            .map((t: string) => t.slice(0, 220))
            .filter(Boolean)
            .slice(0, 5)
          if (textList.length === 0) continue

          const ensured = (() => {
            const { data: d2, userId } = xEnsureUser(next, { name: peerName })
            next = d2
            return { userId }
          })()

          // 保存语言到 user 上
          next = {
            ...next,
            users: next.users.map(u => u.id === ensured.userId ? ({ ...u, lang }) : u),
          }

          const threads = (next.dms || []).slice()
          const idx = threads.findIndex((t) => t.peerId === ensured.userId)
          const base = Date.now()
          const newMsgs: Array<{
            id: string
            from: 'peer'
            text: string
            at: number
            lang: 'zh' | 'en' | 'ja' | 'ko'
            translatedZh: undefined
            translationStatus: 'pending' | undefined
            _dual: ReturnType<typeof parseDualLine> | null
          }> = textList.map((line: string, i: number) => {
            const trimmed = line.trim()
            const dual = lang !== 'zh' ? parseDualLine(trimmed) : null
            const text = dual ? dual.orig : trimmed
            return {
              id: `xdm_${base + i}_${Math.random().toString(16).slice(2)}`,
              from: 'peer' as const,
              text: text.slice(0, 260),
              at: base + i * 260,
              lang,
              translatedZh: undefined,
              translationStatus: lang !== 'zh' ? 'pending' : undefined,
              _dual: dual,
            }
          })
          if (idx >= 0) {
            const t = threads[idx]
            const t2 = {
              ...t,
              peerName,
            }
            threads.splice(idx, 1)
            threads.unshift(t2)
          } else {
            threads.unshift({
              id: `xdmt_${base}_${Math.random().toString(16).slice(2)}`,
              peerId: ensured.userId,
              peerName,
              updatedAt: base,
              unreadCount: 0,
              messages: [],
            })
          }
          next = { ...next, dms: threads.slice(0, 20) } // 私信列表最多 20 人
          const threadId = idx >= 0 ? threads[0]?.id : (threads[0]?.id || '')
          if (threadId) {
            scheduleQueue.push({
              threadId,
              peerId: ensured.userId,
              peerName,
              lang,
              messages: newMsgs.map((m) => ({ id: m.id, text: m.text, at: m.at, _dual: m._dual })),
            })
          }
        }

        setData(next)
        await xSave(next)
        scheduleQueue.forEach((item) => {
          scheduleDmMessages(item.threadId, item.peerId, item.peerName, item.lang, item.messages)
        })
      })
    }
    if (tab === 'notifications') {
      return await withLoading('正在刷新通知…', async () => {
        const minePosts = data.posts.filter((p) => p.authorId === 'me').slice(0, 6)
        const mineHint = minePosts.map((p) => `- ${p.id}：${p.text.slice(0, 60)}`).join('\n') || '（暂无）'
        const sys =
          sysPrefix() +
          `【X（推特风格）/通知生成】\n` +
          `用户：${meName}\n` +
          `用户最近发的帖子：\n${mineHint}\n` +
          `要求：\n` +
          `- 生成最多 6 条“通知事件”：有人点赞/回复/关注/转发\n` +
          `- 名字随机构造\n` +
          `- 允许情绪与脏话，但严禁辱女/性羞辱词汇\n` +
          `- 只输出 JSON\n` +
          `\n` +
          `JSON 格式：\n` +
          `{\n` +
          `  "events": [ { "kind": "like|reply|follow|repost", "fromName": "名字", "postId": "可选", "snippet": "可选" } ]\n` +
          `}\n`
        const parsed = await callJson(sys, '现在生成 events。', 600)
        const ev = Array.isArray((parsed as any).events) ? (parsed as any).events : []

        let next = data
        const notifs = (next.notifications || []).slice()
        for (const e of ev.slice(0, 7)) {
          const kind = String(e?.kind || 'like')
          const fromName = String(e?.fromName || '').trim() || 'User'
          const ensured = (() => {
            const { data: d2, userId } = xEnsureUser(next, { name: fromName })
            next = d2
            return { id: userId, name: fromName }
          })()
          const postId = String(e?.postId || '').trim()
          const snippet = String(e?.snippet || '').trim().slice(0, 80)
          notifs.unshift({
            id: `xn_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            kind: kind === 'reply' || kind === 'follow' || kind === 'repost' ? kind : 'like',
            at: Date.now(),
            fromUserId: ensured.id,
            fromUserName: ensured.name,
            postId: postId || undefined,
            snippet: snippet || undefined,
            read: false,
          })
        }
        next = { ...next, notifications: notifs.slice(0, 200) }
        setData(next)
        await xSave(next)
      })
    }
  }

  const renderBottomNav = () => {
    const Item = ({ id, label, icon }: { id: MainTab; label: string; icon: ReactNode }) => {
      const active = tab === id && view === 'main'
      return (
        <button
          type="button"
          className="flex flex-col items-center gap-0.5 px-4 py-1"
          onClick={() => {
            setView('main')
            setOpenPostId(null)
            setOpenThreadId(null)
            setOpenProfileUserId(null)
            setTab(id)
          }}
        >
          <div className={active ? 'text-black' : 'text-gray-500'}>{icon}</div>
          <div className={`text-[10px] ${active ? 'text-black' : 'text-gray-500'}`}>{label}</div>
        </button>
      )
    }
    return (
      <div className="flex items-center justify-around py-2 border-t border-black/10 bg-white/95">
        <Item
          id="home"
          label="主页"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5V21a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 21V10.5Z" />
            </svg>
          }
        />
        <Item
          id="search"
          label="搜索"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 20l-3.5-3.5" />
            </svg>
          }
        />
        <Item
          id="notifications"
          label="通知"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a3 3 0 0 0 6 0" />
            </svg>
          }
        />
        <Item
          id="messages"
          label="私信"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v12H7l-3 3V5Z" />
            </svg>
          }
        />
      </div>
    )
  }

  const renderPostCard = (p: XPost) => (
    <button
      key={p.id}
      type="button"
      className="w-full text-left px-3 py-3 border-b border-black/5 bg-white active:bg-gray-50"
      onClick={() => {
        setView('post')
        setOpenPostId(p.id)
        setReplyDraft('')
      }}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="w-10 h-10 rounded-full overflow-hidden shrink-0 active:scale-[0.98]"
          onClick={(e) => {
            e.stopPropagation()
            openUserProfile(p.authorId)
          }}
          title="进入主页"
        >
          {(() => {
            const meta = getUserMeta(p.authorId)
            const avatarUrl = (meta as any)?.avatarUrl as string | undefined
            if (avatarUrl) return <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            return (
              <div className="w-full h-full text-white flex items-center justify-center font-extrabold" style={{ background: p.authorColor || meta.color }}>
                {initials(p.authorName)}
              </div>
            )
          })()}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openUserProfile(p.authorId)
                  }}
                  className="text-[14px] font-extrabold text-gray-900 truncate"
                >
                  {p.authorName}
                </button>
                <div className="text-[12px] text-gray-500 truncate">{p.authorHandle || getUserMeta(p.authorId).handle || xMakeHandle(p.authorName)}</div>
                <div className="text-[12px] text-gray-400">· {fmtRelative(p.createdAt)}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setPostMenu({ open: true, postId: p.id })
              }}
              className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center active:scale-[0.98]"
              title="更多"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h.01M12 12h.01M18 12h.01" />
              </svg>
            </button>
          </div>
          <div className="mt-1 text-[14px] leading-relaxed text-gray-900 whitespace-pre-wrap break-words">{p.text}</div>
          {!!(p.imageDesc || '').trim() && (
            <div className="mt-2 rounded-2xl border border-black/10 bg-gray-50 overflow-hidden">
              <div className="px-3 py-2 text-[11px] font-semibold text-gray-700 border-b border-black/5">图片</div>
              <div className="px-3 py-2 text-[13px] text-gray-800 leading-relaxed">{String(p.imageDesc).trim().slice(0, 220)}</div>
            </div>
          )}
          {Array.isArray(p.hashtags) && p.hashtags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {p.hashtags.slice(0, 5).map((t) => (
                <span key={t} className="text-[12px] text-sky-600 font-semibold">
                  #{String(t).replace(/^#/, '').slice(0, 18)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-4 text-[12px] text-gray-500">
            <span>💬 {p.replyCount}</span>
            <span>🔁 {p.repostCount}</span>
            <span>♥ {p.likeCount}</span>
          </div>
        </div>
      </div>
    </button>
  )

  const renderMain = () => {
    if (!data) return null

    if (tab === 'home') {
      return (
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 bg-white/95 border-b border-black/10">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/', { replace: true })}
                  className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center active:scale-[0.98]"
                  title="退出"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="text-[16px] font-extrabold text-gray-900">X</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpenProfileUserId('me')
                    setView('profile')
                  }}
                  className="w-9 h-9 rounded-full overflow-hidden bg-gray-100"
                  title="我的主页"
                >
                  {(() => {
                    const meta = getUserMeta('me')
                    return (meta as any).avatarUrl ? (
                      <img src={(meta as any).avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-extrabold" style={{ background: meta.color }}>
                        {initials(meta.name)}
                      </div>
                    )
                  })()}
                </button>
                <button
                  type="button"
                  onClick={() => void refreshCurrentPage()}
                  className="w-9 h-9 rounded-full bg-gray-100 text-gray-800 flex items-center justify-center active:scale-[0.98]"
                  title="刷新"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 8a8 8 0 0 0-14.7-3M4 16a8 8 0 0 0 14.7 3" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex">
              <button
                type="button"
                onClick={() => setHomeMode('forYou')}
                className={`flex-1 py-2 text-[13px] font-semibold ${homeMode === 'forYou' ? 'text-black border-b-2 border-black' : 'text-gray-500'}`}
              >
                为你推荐
              </button>
              <button
                type="button"
                onClick={() => setHomeMode('following')}
                className={`flex-1 py-2 text-[13px] font-semibold ${homeMode === 'following' ? 'text-black border-b-2 border-black' : 'text-gray-500'}`}
              >
                正在关注
              </button>
            </div>
          </div>

          {feedPosts.length === 0 ? (
            <div className="py-14 text-center text-[13px] text-gray-500">点右上角刷新，生成第一批内容。</div>
          ) : (
            <div>{feedPosts.map(renderPostCard)}</div>
          )}

          <button
            type="button"
            className="fixed bottom-[86px] right-4 w-12 h-12 rounded-full bg-black text-white shadow-lg flex items-center justify-center active:scale-[0.98]"
            onClick={() => setComposeOpen(true)}
            title="发帖"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      )
    }

    if (tab === 'search') {
      return (
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 bg-white/95 border-b border-black/10 px-3 py-2 flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索话题/关键词"
              className="flex-1 px-3 py-2 rounded-full bg-gray-100 text-[13px] outline-none"
            />
            <button
              type="button"
              onClick={() => void doSearch(query, false)}
              className="px-3 py-2 rounded-full bg-black text-white text-[12px] font-semibold active:scale-[0.98]"
            >
              搜索
            </button>
            <button
              type="button"
              onClick={() => void refreshCurrentPage()}
              className="w-9 h-9 rounded-full bg-gray-100 text-gray-800 flex items-center justify-center active:scale-[0.98]"
              title="刷新结果"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 8a8 8 0 0 0-14.7-3M4 16a8 8 0 0 0 14.7 3" />
              </svg>
            </button>
          </div>
          {(data.searchHistory || []).length > 0 && (
            <div className="px-3 py-2 border-b border-black/5">
              <div className="text-[11px] text-gray-500 mb-2">搜索历史</div>
              <div className="flex flex-wrap gap-2">
                {(data.searchHistory || []).slice(0, 10).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      setQuery(h)
                      void doSearch(h, false)
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-gray-100 text-[12px] text-gray-700 active:scale-[0.98]"
                    title={h}
                  >
                    <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-[11px] text-gray-600">🔎</span>
                    <span className="max-w-[120px] truncate">{h}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!activeQuery ? (
            <div className="py-14 text-center text-[13px] text-gray-500">搜一个话题试试。</div>
          ) : searchPosts.length === 0 ? (
            <div className="py-14 text-center text-[13px] text-gray-500">暂无结果，点右上角刷新生成。</div>
          ) : (
            <div>
              <div className="px-3 py-2 text-[12px] text-gray-500">结果：{activeQuery}</div>
              {searchPosts.map(renderPostCard)}
            </div>
          )}
        </div>
      )
    }

    if (tab === 'messages') {
      const threads = (data.dms || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 60)
      return (
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 bg-white/95 border-b border-black/10 px-3 py-2 flex items-center justify-between">
            <div className="text-[15px] font-extrabold text-gray-900">私信</div>
            <button
              type="button"
              onClick={() => void refreshCurrentPage()}
              className="w-9 h-9 rounded-full bg-gray-100 text-gray-800 flex items-center justify-center active:scale-[0.98]"
              title="刷新"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 8a8 8 0 0 0-14.7-3M4 16a8 8 0 0 0 14.7 3" />
              </svg>
            </button>
          </div>

          {threads.slice(0, 20).length === 0 ? (
            <div className="py-14 text-center text-[13px] text-gray-500">点右上角刷新，会收到陌生人私信。</div>
          ) : (
            <div>
              {threads.slice(0, 20).map((t) => {
                const last = t.messages?.[t.messages.length - 1]
                const meta = getUserMeta(t.peerId)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openDMThread(t.id)}
                    className="w-full text-left px-3 py-3 border-b border-black/5 active:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openUserProfile(t.peerId)
                        }}
                        className="relative w-11 h-11 rounded-full overflow-hidden bg-gray-100 shrink-0 active:scale-[0.98]"
                        title="进入主页"
                      >
                        {(meta as any).avatarUrl ? (
                          <img src={(meta as any).avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white font-extrabold" style={{ background: meta.color }}>
                            {initials(meta.name)}
                          </div>
                        )}
                        {!!t.unreadCount && (
                          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-extrabold text-[14px] text-gray-900 truncate">{t.peerName}</div>
                            <div className="text-[11px] text-gray-500 truncate">{(meta as any).handle || ''}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-[11px] text-gray-400">{fmtRelative(t.updatedAt)}</div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!data) return
                                const next: XDataV1 = { ...data, dms: (data.dms || []).filter((x) => x.id !== t.id) }
                                setData(next)
                                void xSave(next)
                              }}
                              className="w-8 h-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center active:scale-[0.98]"
                              title="删除"
                            >
                              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-7 3v9m8-9v9M7 7l1 14h8l1-14" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 text-[12px] text-gray-600 truncate">{last ? last.text : '（空）'}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    // notifications -> 折叠成“我的主页动态”
    if (tab === 'notifications') {
      const list = (data.notifications || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 80)
      return (
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 bg-white/95 border-b border-black/10 px-3 py-2 flex items-center justify-between">
            <div className="text-[15px] font-extrabold text-gray-900">通知</div>
            <button
              type="button"
              onClick={() => void refreshCurrentPage()}
              className="w-9 h-9 rounded-full bg-gray-100 text-gray-800 flex items-center justify-center active:scale-[0.98]"
              title="刷新"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 8a8 8 0 0 0-14.7-3M4 16a8 8 0 0 0 14.7 3" />
              </svg>
            </button>
          </div>
          {list.length === 0 ? (
            <div className="py-14 text-center text-[13px] text-gray-500">点右上角刷新，生成一些通知。</div>
          ) : (
            <div>
              {list.map((n) => (
                <div key={n.id} className="px-3 py-3 border-b border-black/5">
                  <div className="text-[13px] text-gray-900">
                    <span className="font-bold">{n.fromUserName}</span>
                    <span className="text-gray-600">
                      {n.kind === 'like' ? ' 赞了你' : n.kind === 'reply' ? ' 回复了你' : n.kind === 'repost' ? ' 转发了你' : ' 关注了你'}
                    </span>
                  </div>
                  {!!n.snippet && <div className="mt-1 text-[12px] text-gray-600 line-clamp-2">{n.snippet}</div>}
                  <div className="mt-1 text-[11px] text-gray-400">{fmtRelative(n.at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    return null
  }

  const renderPostDetail = () => {
    if (!data || !openPost) return null
    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex items-center justify-between px-3 py-2 border-b border-black/10">
          <button
            type="button"
            onClick={() => {
              setView('main')
              setOpenPostId(null)
              const nextParams = new URLSearchParams(searchParams)
              nextParams.delete('postId')
              setSearchParams(nextParams, { replace: true })
            }}
            className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center active:scale-[0.98]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-[14px] font-extrabold text-gray-900">帖子</div>
          <button
            type="button"
            onClick={() => void refreshCurrentPage()}
            className="w-9 h-9 rounded-full bg-gray-100 text-gray-800 flex items-center justify-center active:scale-[0.98]"
            title="刷新评论"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 8a8 8 0 0 0-14.7-3M4 16a8 8 0 0 0 14.7 3" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {renderPostCard(openPost)}

          <div className="px-3 py-2 border-b border-black/5 flex items-center justify-around text-[13px] text-gray-700">
            <button type="button" onClick={() => void toggleLike(openPost.id)} className="px-3 py-1.5 rounded-full bg-gray-100 active:scale-[0.98]">
              {openPost.likedByMe ? '♥ 已赞' : '♥ 赞'}
            </button>
            <button type="button" onClick={() => void toggleRepost(openPost.id)} className="px-3 py-1.5 rounded-full bg-gray-100 active:scale-[0.98]">
              {openPost.repostedByMe ? '🔁 已转发' : '🔁 转发'}
            </button>
            <button
              type="button"
              onClick={() => shareToWeChat(openPost.id)}
              className="px-3 py-1.5 rounded-full bg-gray-100 active:scale-[0.98]"
            >
              分享到微信
            </button>
          </div>

          <div className="px-3 py-2 text-[12px] text-gray-500">评论</div>
          {openPostReplies.length === 0 ? (
            <div className="px-3 pb-8 text-[13px] text-gray-500">还没有评论，点刷新生成，或者你先评一句。</div>
          ) : (
            <div>
              {openPostReplies.map((r) => (
                <div key={r.id} className="px-3 py-3 border-b border-black/5">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => openUserProfile(r.authorId)}
                      className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 shrink-0 active:scale-[0.98]"
                      title="进入主页"
                    >
                      {(() => {
                        const meta = getUserMeta(r.authorId)
                        const avatarUrl = (meta as any).avatarUrl as string | undefined
                        if (avatarUrl) return <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                        return (
                          <div className="w-full h-full flex items-center justify-center text-white font-bold" style={{ background: meta.color }}>
                            {initials(r.authorName)}
                          </div>
                        )
                      })()}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-bold text-gray-900 truncate">{r.authorName}</div>
                        <div className="text-[11px] text-gray-400">{fmtRelative(r.createdAt)}</div>
                      </div>
                      <div className="mt-1 text-[13px] text-gray-900 whitespace-pre-wrap break-words">{r.text}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-black/10 px-3 py-2 bg-white">
          <div className="flex items-end gap-2">
            <textarea
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              className="flex-1 min-h-[42px] max-h-[90px] resize-none rounded-2xl bg-gray-100 px-3 py-2 text-[13px] outline-none"
              placeholder="写评论…（你评论后，点刷新会有路人互动）"
            />
            <button
              type="button"
              disabled={!replyDraft.trim()}
              onClick={() => void addMyReply()}
              className={`h-[42px] px-4 rounded-2xl text-[12px] font-semibold text-white active:scale-[0.99] ${
                !replyDraft.trim() ? 'bg-gray-300' : 'bg-black'
              }`}
            >
              发送
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderProfile = () => {
    if (!data) return null
    const uid = openProfileUserId || 'me'
    const isMe = uid === 'me'
    const meta = getUserMeta(uid)
    const userName = meta.name
    const mine = posts.filter((p) => p.authorId === uid).slice(0, 60)
    const myReplies = isMe ? (replies || []).filter((r) => r.authorId === 'me').slice(-120).reverse() : []
    const followed = !isMe && (data.follows || []).includes(uid)
    const followerCount = isMe
      ? Math.max(0, data?.meFollowerCount || 0)
      : Math.floor((Math.abs((meta.handle || '').length * 193) + 860) % 52000)

    return (
      <div className="flex h-full flex-col bg-white">
        <div className="flex items-center justify-between px-3 py-2 border-b border-black/10">
          <button
            type="button"
            onClick={() => {
              setView('main')
              setOpenProfileUserId(null)
              const nextParams = new URLSearchParams(searchParams)
              nextParams.delete('userId')
              setSearchParams(nextParams, { replace: true })
            }}
            className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center active:scale-[0.98]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-[14px] font-extrabold text-gray-900">{isMe ? '我的主页' : '主页'}</div>
          <button
            type="button"
            onClick={() => void refreshCurrentPage()}
            className="w-9 h-9 rounded-full bg-gray-100 text-gray-800 flex items-center justify-center active:scale-[0.98]"
            title="刷新"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 8a8 8 0 0 0-14.7-3M4 16a8 8 0 0 0 14.7 3" />
            </svg>
          </button>
        </div>

        {/* Banner */}
        <div className="relative">
          <div
            className={`h-[190px] w-full bg-gray-100 ${isMe ? 'cursor-pointer' : ''}`}
            onClick={isMe ? handlePickMeBanner : undefined}
            style={{
              backgroundImage: meta.bannerUrl ? `url(${meta.bannerUrl})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div
            className={`absolute left-4 -bottom-10 w-24 h-24 rounded-full overflow-hidden border-4 border-white bg-gray-100 ${isMe ? 'cursor-pointer' : ''}`}
            onClick={isMe ? handlePickMeAvatar : undefined}
            title={isMe ? '更换头像' : undefined}
          >
            {(meta as any).avatarUrl ? (
              <img src={(meta as any).avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-extrabold text-[18px]" style={{ background: meta.color }}>
                {initials(userName)}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pt-16 pb-4 border-b border-black/5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-extrabold text-gray-900">{userName}</div>
              <div className="text-[12px] text-gray-500 mt-0.5">{meta.handle}</div>
              <div className="mt-2 text-[12px] text-gray-700 leading-relaxed">
                {meta.bio
                  ? `签名：${meta.bio}`
                  : isMe && !data?.meAvatarUrl && !data?.meBannerUrl && !data?.meBio
                    ? '点击更换头像、背景或简介'
                    : ''}
              </div>
              <div className="mt-2 flex items-center gap-4 text-[12px] text-gray-600">
                <button
                  type="button"
                  onClick={() => {
                    if (isMe) setFollowingOpen(true)
                  }}
                  className={`font-semibold ${isMe ? 'text-gray-900' : ''}`}
                >
                  {(data?.follows || []).length} 关注
                </button>
                <span className="font-semibold">{followerCount} 粉丝</span>
              </div>
            </div>
            {isMe ? (
              <button
                type="button"
                onClick={openProfileEditor}
                className="px-4 h-10 rounded-full bg-gray-100 text-[12px] font-semibold text-gray-800 active:scale-[0.98]"
              >
                编辑个人资料
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const id = await ensureThreadForUser(uid, userName)
                      if (id) openDMThread(id)
                    })()
                  }}
                  className="w-10 h-10 rounded-full bg-gray-100 text-gray-900 flex items-center justify-center active:scale-[0.98]"
                  title="私信"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H7l-3 3V6Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void toggleFollow(uid)}
                  className={`px-4 h-10 rounded-full text-[12px] font-semibold active:scale-[0.98] ${
                    followed ? 'bg-gray-100 text-gray-800' : 'bg-black text-white'
                  }`}
                >
                  {followed ? '已关注' : '关注'}
                </button>
              </div>
            )}
          </div>
          {isMe && (
            <div className="mt-3" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isMe && (
            <div className="sticky top-0 z-10 bg-white/95 border-b border-black/5 px-4 py-2 flex gap-2">
              <button
                type="button"
                onClick={() => setProfileTab('posts')}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold ${profileTab === 'posts' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                我的帖子
              </button>
              <button
                type="button"
                onClick={() => setProfileTab('replies')}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold ${profileTab === 'replies' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                我的评论
              </button>
            </div>
          )}
          {!isMe || profileTab === 'posts' ? (
            mine.length === 0 ? (
              <div className="py-14 text-center text-[13px] text-gray-500">{isMe ? '你还没发过帖。' : 'TA 还没发过帖。'}</div>
            ) : (
              <div>{mine.map(renderPostCard)}</div>
            )
          ) : myReplies.length === 0 ? (
            <div className="py-14 text-center text-[13px] text-gray-500">你还没在别人评论区发过内容。</div>
          ) : (
            <div className="divide-y divide-black/5">
              {myReplies.map((r) => {
                const p = posts.find((x) => x.id === r.postId)
                const pAuthor = p?.authorName || '未知'
                const pExcerpt = (p?.text || '').replace(/\s+/g, ' ').slice(0, 80)
                return (
                  <div key={r.id} className="px-4 py-3">
                    <div className="text-[12px] text-gray-500">评论 @ {pAuthor} · {fmtRelative(r.createdAt)}</div>
                    <div className="mt-1 text-[13px] text-gray-900 whitespace-pre-wrap">{r.text}</div>
                    {p && (
                      <div className="mt-2 text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2 py-1">
                        原帖：{pExcerpt || '（无）'}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {p && (
                        <button
                          type="button"
                          onClick={() => {
                            setView('post')
                            setOpenPostId(r.postId)
                          }}
                          className="px-3 h-8 rounded-full bg-gray-100 text-[12px] text-gray-700"
                        >
                          查看原帖
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void deleteReplyById(r.id, r.postId)}
                        className="px-3 h-8 rounded-full bg-red-50 text-[12px] text-red-600"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleMeBannerChange} />
        </>

        {followingOpen && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/35" onClick={() => setFollowingOpen(false)} role="presentation" />
            <div className="relative w-full max-w-[320px] rounded-2xl bg-white/95 border border-white/30 shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-black/5 text-center text-sm font-semibold">我的关注</div>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {(data?.follows || []).length === 0 ? (
                  <div className="text-center text-sm text-gray-400 py-8">暂无关注</div>
                ) : (
                  <div className="space-y-1">
                    {(data?.follows || []).map((uid) => {
                      const meta = getUserMeta(uid)
                      return (
                        <button
                          key={uid}
                          type="button"
                          onClick={() => {
                            setFollowingOpen(false)
                            openUserProfile(uid)
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 active:bg-gray-100"
                        >
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                            {(meta as any).avatarUrl ? (
                              <img src={(meta as any).avatarUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white font-extrabold" style={{ background: meta.color }}>
                                {initials(meta.name)}
                              </div>
                            )}
                          </div>
                          <div className="text-left min-w-0">
                            <div className="text-[13px] font-medium text-[#111] truncate">{meta.name}</div>
                            <div className="text-[11px] text-gray-500 truncate">{(meta as any).handle || ''}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-black/5">
                <button type="button" onClick={() => setFollowingOpen(false)} className="w-full py-2 rounded-xl bg-gray-100 text-sm text-gray-700">
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        {!isMe && otherProfileTipOpen && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => {
                if (otherProfileTipDontShow) {
                  const next: XDataV1 = { ...data, suppressOtherProfileEditTip: true }
                  setData(next)
                  void xSave(next)
                }
                setOtherProfileTipOpen(false)
              }}
              role="presentation"
            />
            <div className="relative w-full max-w-[320px] rounded-2xl bg-white/95 border border-white/30 shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-black/5 text-center text-sm font-semibold">编辑 TA 的主页</div>
              <div className="p-4 space-y-3">
                <div className="text-[12px] text-gray-600">你可以更换 TA 的头像和背景。</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarEditTargetId(uid)
                      avatarInputRef.current?.click()
                    }}
                    className="flex-1 py-2 rounded-xl bg-gray-100 text-sm text-gray-800"
                  >
                    更换头像
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBannerEditTargetId(uid)
                      bannerInputRef.current?.click()
                    }}
                    className="flex-1 py-2 rounded-xl bg-gray-100 text-sm text-gray-800"
                  >
                    更换背景
                  </button>
                </div>
                <label className="flex items-center gap-2 text-[12px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={otherProfileTipDontShow}
                    onChange={(e) => setOtherProfileTipDontShow(e.target.checked)}
                  />
                  不再提示
                </label>
              </div>
              <div className="p-3 border-t border-black/5">
                <button
                  type="button"
                  onClick={() => {
                    if (otherProfileTipDontShow) {
                      const next: XDataV1 = { ...data, suppressOtherProfileEditTip: true }
                      setData(next)
                      void xSave(next)
                    }
                    setOtherProfileTipOpen(false)
                  }}
                  className="w-full py-2 rounded-xl bg-black text-sm text-white"
                >
                  知道了
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderDM = () => {
    if (!data || !openThreadId) return null
    const thread = data.dms.find((t) => t.id === openThreadId)
    if (!thread) return null
    const meta = getUserMeta(thread.peerId)
    const msgs = (thread.messages || []).slice(-180)

    return (
      <div className="flex h-full flex-col bg-white">
        <div className="relative flex items-center justify-center px-3 py-3 border-b border-black/10 min-h-[96px]">
          <button
            type="button"
            onClick={() => {
              setView('main')
              setOpenThreadId(null)
            }}
            className="absolute left-3 w-9 h-9 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center active:scale-[0.98]"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex flex-col items-center min-w-0">
            <button
              type="button"
              onClick={() => openUserProfile(thread.peerId)}
              className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 mb-1 active:scale-[0.98]"
              title="进入主页"
            >
              {(meta as any).avatarUrl ? (
                <img src={(meta as any).avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white font-extrabold" style={{ background: meta.color }}>
                  {initials(meta.name)}
                </div>
              )}
            </button>
            <div className="text-[12px] font-extrabold text-gray-900 truncate max-w-[180px]">{meta.name}</div>
            <div className="text-[11px] text-gray-500 truncate max-w-[180px]">{meta.handle}</div>
          </div>
          <button
            type="button"
            onClick={() => void refreshDMThread(thread.id)}
            className="absolute right-3 w-9 h-9 rounded-full bg-gray-100 text-gray-800 flex items-center justify-center active:scale-[0.98]"
            title="刷新"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 8a8 8 0 0 0-14.7-3M4 16a8 8 0 0 0 14.7 3" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {msgs.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-gray-500">点右上角刷新，生成对方新消息。</div>
          ) : (
            msgs.map((m) => (
              <div key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                    m.from === 'me' ? 'bg-black text-white rounded-tr-md' : 'bg-gray-100 text-gray-900 rounded-tl-md'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  {m.from === 'peer' && normalizeLang(m.lang || (meta as any).lang) !== 'zh' && (
                    <div className="mt-1.5 border-t border-black/5 pt-1 text-[10px] text-gray-500">
                      <div className="text-[10px] text-gray-500 mb-0.5">翻译</div>
                      <div className="text-[11px] text-gray-700">
                        {m.translationStatus === 'done'
                          ? (m.translatedZh || '')
                          : m.translationStatus === 'error'
                            ? '翻译失败'
                            : '翻译中…'}
                      </div>
                    </div>
                  )}
                  <div className={`mt-1 text-[10px] ${m.from === 'me' ? 'text-white/75' : 'text-gray-500'}`}>{fmtRelative(m.at)}</div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-black/10 px-3 py-2 bg-white">
          <div className="flex items-end gap-2">
            <textarea
              value={dmDraft}
              onChange={(e) => setDmDraft(e.target.value)}
              className="flex-1 min-h-[42px] max-h-[90px] resize-none rounded-2xl bg-gray-100 px-3 py-2 text-[13px] outline-none"
              placeholder="发一条私信…（发送后点刷新生成对方回复）"
            />
            <button
              type="button"
              disabled={!dmDraft.trim()}
              onClick={() => void sendDMInThread(thread.id)}
              className={`h-[42px] px-4 rounded-2xl text-[12px] font-semibold text-white active:scale-[0.99] ${
                !dmDraft.trim() ? 'bg-gray-300' : 'bg-black'
              }`}
            >
              发送
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-0 pt-0 pb-0">
        {/* 用一个隐藏的 AppHeader 保持整体导航一致（但 X 自己有顶部栏） */}
        <div className="hidden">
          <AppHeader title="X" onBack={() => navigate('/', { replace: true })} />
        </div>

        {!data ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">加载中…</div>
        ) : view === 'post' ? (
          renderPostDetail()
        ) : view === 'profile' ? (
          renderProfile()
        ) : view === 'dm' ? (
          renderDM()
        ) : (
          <>
            {renderMain()}
            {renderBottomNav()}
          </>
        )}

        {/* 发帖弹窗 */}
        <WeChatDialog
          open={composeOpen}
          title="发帖"
          message="像 X 一样发一句。"
          confirmText="发布"
          cancelText="取消"
          onConfirm={() => void postMyTweet()}
          onCancel={() => setComposeOpen(false)}
        >
          <div className="space-y-2">
            <textarea
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              placeholder="你在想什么？"
              className="w-full min-h-[130px] resize-none px-3 py-2 rounded-xl bg-white border border-black/10 text-[13px] text-gray-900 outline-none"
            />
            <div className="text-[11px] text-gray-500">发完后想看新互动：点“刷新”。</div>
          </div>
        </WeChatDialog>

        <WeChatDialog
          open={profileEditOpen}
          title="编辑个人资料"
          message="可以编辑头像、背景、名称与简介。"
          confirmText="保存"
          cancelText="取消"
          onConfirm={saveProfileEditor}
          onCancel={() => setProfileEditOpen(false)}
        >
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handlePickMeAvatar}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-sm text-gray-800"
              >
                更换头像
              </button>
              <button
                type="button"
                onClick={handlePickMeBanner}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-sm text-gray-800"
              >
                更换背景
              </button>
            </div>
            <input
              value={profileDraftName}
              onChange={(e) => setProfileDraftName(e.target.value)}
              placeholder="昵称"
              className="w-full px-3 py-2 rounded-xl bg-white border border-black/10 text-[13px] text-gray-900 outline-none"
            />
            <textarea
              value={profileDraftBio}
              onChange={(e) => setProfileDraftBio(e.target.value)}
              placeholder="简介/签名"
              className="w-full min-h-[90px] resize-none px-3 py-2 rounded-xl bg-white border border-black/10 text-[13px] text-gray-900 outline-none"
            />
            <div className="text-[11px] text-gray-500">昵称最多 24 字，简介最多 120 字。</div>
          </div>
        </WeChatDialog>

        <WeChatDialog
          open={tipDialog.open}
          title={tipDialog.title}
          message={tipDialog.message}
          confirmText="知道了"
          onConfirm={() => setTipDialog({ open: false, title: '', message: '' })}
          onCancel={() => setTipDialog({ open: false, title: '', message: '' })}
        />

        {/* 分享弹窗（复用日记分享样式） */}
        {shareOpen && shareTargetPostId && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/35" onClick={() => setShareOpen(false)} role="presentation" />
            <div className="relative w-full max-w-[320px] rounded-2xl bg-white/95 border border-white/30 shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-black/5 text-center text-sm font-semibold">分享给谁</div>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {characters.length === 0 ? (
                  <div className="text-center text-sm text-gray-400 py-8">暂无好友</div>
                ) : (
                  <div className="space-y-1">
                    {characters.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => doShareToCharacter(c.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 active:bg-gray-100"
                      >
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                          {c.avatar ? (
                            <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white">
                              {c.name[0]}
                            </div>
                          )}
                        </div>
                        <div className="text-left min-w-0">
                          <div className="text-[13px] font-medium text-[#111] truncate">{c.name}</div>
                          <div className="text-[11px] text-gray-500 truncate">发送到聊天</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-black/5">
                <button type="button" onClick={() => setShareOpen(false)} className="w-full py-2 rounded-xl bg-gray-100 text-sm text-gray-700">
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        <WeChatDialog
          open={shareResult.open}
          title="已分享"
          message="已把推文分享出去啦。要现在去聊天看看吗？"
          confirmText="去聊天"
          cancelText="稍后再去"
          onCancel={() => setShareResult({ open: false, targetId: null })}
          onConfirm={() => {
            const id = shareResult.targetId
            setShareResult({ open: false, targetId: null })
            if (id) navigate(`/apps/wechat/chat/${encodeURIComponent(id)}`)
          }}
        />

        {/* Loading */}
        <WeChatDialog open={loadingOpen} title="加载中" message={loadingStage} confirmText="稍等" onConfirm={() => {}} onCancel={() => {}}>
          <div className="mt-2">
            <div className="text-[11px] text-amber-600 text-center mb-2">本次将消耗 API 调用，请勿退出浏览器或此界面。</div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gray-700 to-black transition-all"
                style={{ width: `${Math.max(3, Math.min(100, loadingProgress))}%` }}
              />
            </div>
            <div className="mt-2 text-center text-[11px] text-gray-500">{Math.round(loadingProgress)}%</div>
          </div>
        </WeChatDialog>

        {/* 三点菜单 */}
        {postMenu.open && postMenu.postId && data && (() => {
          const p = data.posts.find(x => x.id === postMenu.postId)
          if (!p) return null
          const isMePost = p.authorId === 'me'
          const followed = !isMePost && (data.follows || []).includes(p.authorId)
          return (
            <WeChatDialog
              open={true}
              title="更多"
              message={`${p.authorName} ${p.authorHandle || xMakeHandle(p.authorName)}`}
              confirmText="关闭"
              cancelText="操作"
              onConfirm={() => setPostMenu({ open: false })}
              onCancel={() => setPostMenu({ open: false })}
            >
              <div className="space-y-2">
                {isMePost && (
                  <button
                    type="button"
                    onClick={() => {
                      setPostMenu({ open: false })
                      void deletePostById(p.id)
                    }}
                    className="w-full py-2 rounded-xl bg-red-50 text-red-600 text-[13px] font-semibold active:scale-[0.99]"
                  >
                    删除这条
                  </button>
                )}
                {!isMePost && (
                  <button
                    type="button"
                    onClick={() => {
                      setPostMenu({ open: false })
                      void toggleFollow(p.authorId)
                    }}
                    className="w-full py-2 rounded-xl bg-gray-900 text-white text-[13px] font-semibold active:scale-[0.99]"
                  >
                    {followed ? '取消关注' : '关注'}
                  </button>
                )}
                {!isMePost && (
                  <button
                    type="button"
                    onClick={() => {
                      setPostMenu({ open: false })
                      void muteUser(p.authorId)
                    }}
                    className="w-full py-2 rounded-xl bg-gray-100 text-gray-800 text-[13px] font-semibold active:scale-[0.99]"
                  >
                    屏蔽此人
                  </button>
                )}
                {!isMePost && (
                  <button
                    type="button"
                    onClick={() => {
                      setPostMenu({ open: false })
                      void blockUser(p.authorId)
                    }}
                    className="w-full py-2 rounded-xl bg-red-50 text-red-600 text-[13px] font-semibold active:scale-[0.99]"
                  >
                    拉黑
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPostMenu({ open: false })
                    openUserProfile(p.authorId)
                  }}
                  className="w-full py-2 rounded-xl bg-white border border-black/10 text-gray-800 text-[13px] font-semibold active:scale-[0.99]"
                >
                  查看主页
                </button>
              </div>
            </WeChatDialog>
          )
        })()}
      </div>
    </PageContainer>
  )
}

