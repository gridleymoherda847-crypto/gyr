import { kvGetJSON, kvSetJSON } from './kv'

export type XUser = {
  id: string
  name: string
  handle: string // @xxxx
  color: string // avatar bg color
  avatarUrl?: string // “真实头像”（SVG DataURL）
  bannerUrl?: string // 主页背景图（SVG DataURL）
  lang?: 'zh' | 'en' | 'ja' | 'ko' // 主要语言（用于私信/内容生成）
  bio?: string
  createdAt: number
}

export type XPost = {
  id: string
  authorId: string
  authorName: string
  authorHandle?: string
  authorColor?: string
  text: string
  hashtags?: string[]
  imageDesc?: string // 用“图片卡片”模拟图片
  createdAt: number
  // 互动统计（本地）
  likeCount: number
  repostCount: number
  replyCount: number
  // 当前用户状态（本地）
  likedByMe?: boolean
  repostedByMe?: boolean
  // 引用转发/转发（轻量做法：只存引用目标id）
  repostOfId?: string
  quoteOfId?: string
  quoteText?: string
}

export type XReply = {
  id: string
  postId: string
  authorId: string
  authorName: string
  text: string
  createdAt: number
  // 允许楼中楼后续扩展：replyToId
  replyToId?: string
}

export type XNotification = {
  id: string
  kind: 'like' | 'reply' | 'follow' | 'repost'
  at: number
  fromUserId: string
  fromUserName: string
  postId?: string
  snippet?: string
  read?: boolean
}

export type XDMMessage = {
  id: string
  from: 'me' | 'peer'
  text: string
  at: number
  lang?: 'zh' | 'en' | 'ja' | 'ko'
  translatedZh?: string
  translationStatus?: 'pending' | 'done' | 'error'
}

export type XDMThread = {
  id: string
  peerId: string
  peerName: string
  updatedAt: number
  messages: XDMMessage[]
  unreadCount?: number
}

export type XDataV1 = {
  version: 1
  meName: string
  meHandle: string
  meAvatarUrl?: string
  meBannerUrl?: string
  meDisplayName?: string
  meBio?: string
  meFollowerCount?: number
  suppressOtherProfileEditTip?: boolean
  follows: string[] // userIds
  muted: string[] // muted userIds
  blocked: string[] // blocked userIds
  users: XUser[]
  posts: XPost[]
  replies: XReply[]
  notifications: XNotification[]
  dms: XDMThread[]
  // 缓存：避免重复生成导致卡/耗 API
  searchCache: Record<string, { postIds: string[]; updatedAt: number }>
  searchHistory: string[]
  lastRefreshAt?: Record<string, number> // per-page throttling
}

const KEY = 'littlephone_x_v1'
const genId = (p: string) => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`

const palette = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E',
  '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
  '#EC4899', '#F43F5E',
]

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0)
}

export function xMakeHandle(name: string) {
  // 推特号尽量用 ascii（避免全中文）
  const suffix = (hash(name).toString(36).replace(/[^a-z0-9]/g, '').slice(0, 10) || '000000')
  return `@${suffix}`.slice(0, 15)
}

export function xMakeColor(seed: string) {
  return palette[hash(seed) % palette.length]
}

export function xMakeAvatarSvgDataUrl(seed: string, label?: string) {
  const h = hash(seed)
  const s = 256
  const c1 = palette[h % palette.length]
  const c2 = palette[(h >>> 5) % palette.length]
  const c3 = palette[(h >>> 9) % palette.length]
  const style = h % 4
  const initial = (String(label || seed).trim().slice(0, 1) || '?').toUpperCase()
  let body = ''
  if (style === 0) {
    const a = 0.55 + ((h % 30) / 100)
    body =
      `<defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${c1}"/><stop offset="0.6" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<rect width="${s}" height="${s}" rx="128" fill="url(#g)"/>` +
      `<circle cx="${(h % 120) + 70}" cy="${((h >>> 7) % 120) + 70}" r="${(h % 40) + 28}" fill="rgba(255,255,255,${a.toFixed(2)})"/>` +
      `<circle cx="${((h >>> 11) % 140) + 50}" cy="${((h >>> 15) % 140) + 50}" r="${((h >>> 3) % 32) + 18}" fill="rgba(0,0,0,0.10)"/>`
  } else if (style === 1) {
    body =
      `<rect width="${s}" height="${s}" rx="128" fill="${c1}"/>` +
      `<circle cx="${(h % 80) + 40}" cy="${((h >>> 7) % 80) + 40}" r="${(h % 26) + 18}" fill="rgba(255,255,255,0.18)"/>` +
      `<circle cx="${((h >>> 5) % 120) + 80}" cy="${((h >>> 11) % 120) + 80}" r="${((h >>> 2) % 30) + 20}" fill="rgba(0,0,0,0.12)"/>` +
      `<text x="50%" y="56%" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="96" font-weight="800" fill="rgba(255,255,255,0.85)">${initial}</text>`
  } else if (style === 2) {
    body =
      `<rect width="${s}" height="${s}" rx="128" fill="${c2}"/>` +
      `<g stroke="rgba(255,255,255,0.55)" stroke-width="${(h % 4) + 2}">` +
      `<line x1="${(h % 40)}" y1="30" x2="260" y2="${(h % 40) + 100}"/>` +
      `<line x1="-10" y1="${(h % 60) + 60}" x2="270" y2="${(h % 60) + 140}"/>` +
      `<line x1="0" y1="${(h % 80) + 140}" x2="256" y2="${(h % 80) + 200}"/>` +
      `</g>` +
      `<circle cx="${(h % 120) + 70}" cy="${((h >>> 7) % 120) + 70}" r="${(h % 30) + 20}" fill="rgba(0,0,0,0.12)"/>`
  } else {
    body =
      `<rect width="${s}" height="${s}" rx="128" fill="${c3}"/>` +
      `<rect x="${(h % 40) + 30}" y="${((h >>> 6) % 40) + 30}" width="120" height="120" rx="28" fill="rgba(255,255,255,0.18)"/>` +
      `<rect x="${((h >>> 2) % 50) + 90}" y="${((h >>> 9) % 50) + 90}" width="110" height="110" rx="28" fill="rgba(0,0,0,0.14)"/>` +
      `<path d="M40 ${140 + (h % 20)} Q120 ${60 + (h % 30)} 216 ${140 + ((h >>> 4) % 20)}" stroke="rgba(255,255,255,0.55)" stroke-width="6" fill="none"/>`
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" data-x="xv2" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
    body +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function xMakeBio(seed: string) {
  const h = hash(seed)
  const pools = [
    ['清醒一点', '别太当真', '随便看看', '懂的人都懂', '忙着生活'],
    ['今天也想躺平', '努力营业中', '脑子短路了', '快乐第一', '别催我'],
    ['随缘上线', '无话可说', '仅代表个人观点', '别在意', '做人好难'],
  ]
  const pick = (arr: string[]) => arr[h % arr.length]
  const pick2 = (arr: string[]) => arr[(h >>> 7) % arr.length]
  return `${pick(pools[0])} · ${pick2(pools[1])}`
}

export function xMakeBannerSvgDataUrl(seed: string) {
  const h = hash(seed)
  const c1 = palette[h % palette.length]
  const c2 = palette[(h >>> 6) % palette.length]
  const c3 = palette[(h >>> 10) % palette.length]
  const w = 1200
  const hh = 400
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}">` +
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="0.55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="${w}" height="${hh}" rx="28" fill="url(#bg)"/>` +
    `<g opacity="0.18">` +
    `<circle cx="${(h % 520) + 180}" cy="${((h >>> 8) % 180) + 110}" r="${(h % 90) + 60}" fill="#fff"/>` +
    `<circle cx="${((h >>> 13) % 520) + 520}" cy="${((h >>> 19) % 180) + 140}" r="${((h >>> 2) % 110) + 70}" fill="#000"/>` +
    `<circle cx="${((h >>> 5) % 520) + 820}" cy="${((h >>> 11) % 180) + 120}" r="${((h >>> 3) % 90) + 60}" fill="#fff"/>` +
    `</g>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function xBase(meName: string): XDataV1 {
  return {
    version: 1,
    meName,
    meHandle: xMakeHandle(meName),
    meAvatarUrl: undefined,
    meBannerUrl: undefined,
    meDisplayName: '',
    meBio: '',
    meFollowerCount: 0,
    suppressOtherProfileEditTip: false,
    follows: [],
    muted: [],
    blocked: [],
    users: [],
    posts: [],
    replies: [],
    notifications: [],
    dms: [],
    searchCache: {},
    searchHistory: [],
    lastRefreshAt: {},
  }
}

export async function xLoad(meName: string): Promise<XDataV1> {
  const base = xBase(meName)
  const loaded = await kvGetJSON<XDataV1>(KEY, base)
  const safe = loaded && typeof loaded === 'object' ? loaded : base
  const meHandle = safe.meHandle && typeof safe.meHandle === 'string' ? safe.meHandle : xMakeHandle(meName)
  const usersRaw = Array.isArray(safe.users) ? safe.users : []
  const users: XUser[] = usersRaw.map((u: any) => {
    const name = String(u?.name || '').trim() || 'User'
    const handle = typeof u?.handle === 'string' && u.handle ? u.handle : xMakeHandle(name)
    const color = typeof u?.color === 'string' && u.color ? u.color : xMakeColor(handle || name)
    const avatarUrl =
      typeof u?.avatarUrl === 'string' && u.avatarUrl
        ? (u.avatarUrl.includes('xv2') || !u.avatarUrl.startsWith('data:image/svg+xml') ? u.avatarUrl : xMakeAvatarSvgDataUrl(handle + '::' + name, name))
        : xMakeAvatarSvgDataUrl(handle + '::' + name, name)
    const bannerUrl =
      typeof u?.bannerUrl === 'string' && u.bannerUrl
        ? u.bannerUrl
        : xMakeBannerSvgDataUrl(handle + '::banner')
    const lang = typeof u?.lang === 'string' ? u.lang : undefined
    return {
      id: String(u?.id || genId('xu')),
      name,
      handle,
      color,
      avatarUrl,
      bannerUrl,
      lang: lang === 'en' || lang === 'ja' || lang === 'ko' || lang === 'zh' ? lang : undefined,
      bio: typeof u?.bio === 'string' ? u.bio : xMakeBio(handle + '::bio'),
      createdAt: typeof u?.createdAt === 'number' ? u.createdAt : Date.now(),
    }
  })
  const dms: XDMThread[] = Array.isArray(safe.dms)
    ? safe.dms.map((t: any) => {
        const messages: XDMMessage[] = Array.isArray(t?.messages)
          ? t.messages.map((m: any) => {
              const langRaw = typeof m?.lang === 'string' ? m.lang : undefined
              const lang = langRaw === 'en' || langRaw === 'ja' || langRaw === 'ko' || langRaw === 'zh' ? langRaw : undefined
              const statusRaw = typeof m?.translationStatus === 'string' ? m.translationStatus : undefined
              const status = statusRaw === 'pending' || statusRaw === 'done' || statusRaw === 'error' ? statusRaw : undefined
              return {
                id: String(m?.id || genId('xdm')),
                from: m?.from === 'peer' ? 'peer' : 'me',
                text: String(m?.text || ''),
                at: typeof m?.at === 'number' ? m.at : Date.now(),
                lang,
                translatedZh: typeof m?.translatedZh === 'string' ? m.translatedZh : undefined,
                translationStatus: status,
              }
            })
          : []
        return {
          id: String(t?.id || genId('xdmt')),
          peerId: String(t?.peerId || genId('peer')),
          peerName: String(t?.peerName || '陌生人'),
          updatedAt: typeof t?.updatedAt === 'number' ? t.updatedAt : Date.now(),
          unreadCount: typeof t?.unreadCount === 'number' ? t.unreadCount : 0,
          messages,
        }
      })
    : []

  return {
    ...base,
    ...safe,
    meName,
    meHandle,
    meAvatarUrl: typeof safe.meAvatarUrl === 'string' ? safe.meAvatarUrl : undefined,
    meBannerUrl: typeof safe.meBannerUrl === 'string' ? safe.meBannerUrl : undefined,
    meDisplayName: typeof (safe as any).meDisplayName === 'string' ? (safe as any).meDisplayName : '',
    meBio: typeof safe.meBio === 'string' ? safe.meBio : '',
    meFollowerCount: typeof safe.meFollowerCount === 'number' ? safe.meFollowerCount : 0,
    suppressOtherProfileEditTip: typeof safe.suppressOtherProfileEditTip === 'boolean' ? safe.suppressOtherProfileEditTip : false,
    follows: Array.isArray(safe.follows) ? safe.follows : [],
    muted: Array.isArray((safe as any).muted) ? ((safe as any).muted as any[]) : [],
    blocked: Array.isArray((safe as any).blocked) ? ((safe as any).blocked as any[]) : [],
    users,
    posts: Array.isArray(safe.posts) ? safe.posts : [],
    replies: Array.isArray(safe.replies) ? safe.replies : [],
    notifications: Array.isArray(safe.notifications) ? safe.notifications : [],
    dms,
    searchCache: safe.searchCache && typeof safe.searchCache === 'object' ? safe.searchCache : {},
    searchHistory: Array.isArray((safe as any).searchHistory) ? (safe as any).searchHistory.filter((x: any) => typeof x === 'string').slice(0, 10) : [],
    lastRefreshAt: safe.lastRefreshAt && typeof safe.lastRefreshAt === 'object' ? safe.lastRefreshAt : {},
  }
}

export async function xSave(data: XDataV1): Promise<void> {
  await kvSetJSON(KEY, data)
}

export function xEnsureUser(
  data: XDataV1,
  user: { id?: string; name: string; bio?: string; avatarUrl?: string; bannerUrl?: string }
): { data: XDataV1; userId: string } {
  const name = (user.name || '').trim() || 'User'
  const exists = data.users.find((u) => u.name === name)
  if (exists) {
    const nextUsers = data.users.map((u) => {
      if (u.id !== exists.id) return u
      return {
        ...u,
        avatarUrl: user.avatarUrl || u.avatarUrl,
        bannerUrl: user.bannerUrl || u.bannerUrl,
        bio: user.bio || u.bio || xMakeBio(u.handle + '::bio'),
      }
    })
    return { data: { ...data, users: nextUsers }, userId: exists.id }
  }
  const id = user.id || genId('xu')
  const handle = xMakeHandle(name)
  const color = xMakeColor(handle)
  // 全量“真实头像”：用本地 SVG 生成（不走生图接口，轻量且稳定）
  const avatarUrl = user.avatarUrl || xMakeAvatarSvgDataUrl(handle + '::' + name, name)
  const bannerUrl = user.bannerUrl || xMakeBannerSvgDataUrl(handle + '::banner')
  const next: XUser = { id, name, handle, color, avatarUrl, bannerUrl, bio: user.bio || xMakeBio(handle + '::bio'), createdAt: Date.now() }
  return { data: { ...data, users: [next, ...data.users].slice(0, 400) }, userId: id }
}

export function xNewPost(authorId: string, authorName: string, text: string): XPost {
  const now = Date.now()
  const clean = (text || '').trim().replace(/\n{3,}/g, '\n\n').slice(0, 140)
  return {
    id: genId('xp'),
    authorId,
    authorName,
    text: clean,
    createdAt: now,
    likeCount: 0,
    repostCount: 0,
    replyCount: 0,
  }
}

export function xNewReply(postId: string, authorId: string, authorName: string, text: string, replyToId?: string): XReply {
  const now = Date.now()
  const clean = (text || '').trim().replace(/\n{3,}/g, '\n\n').slice(0, 500)
  return { id: genId('xr'), postId, authorId, authorName, text: clean, createdAt: now, replyToId }
}

export function xNewDMThread(peerName: string): XDMThread {
  const now = Date.now()
  return { id: genId('xdm'), peerId: genId('peer'), peerName: peerName.trim() || '陌生人', updatedAt: now, messages: [] }
}

