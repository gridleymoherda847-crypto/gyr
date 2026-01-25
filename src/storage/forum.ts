import { kvGetJSON, kvSetJSON } from './kv'

export type ForumUser = {
  id: string
  name: string
  avatar?: string
}

export type ForumPost = {
  id: string
  authorId: string
  authorName: string
  authorAvatar?: string
  title: string
  content: string
  createdAt: number
  updatedAt?: number
}

export type ForumComment = {
  id: string
  postId: string
  authorId: string
  authorName: string
  authorAvatar?: string
  content: string
  createdAt: number
}

export type ForumDMMessage = {
  id: string
  from: 'user' | 'peer'
  text: string
  at: number
}

export type ForumDMThread = {
  peerId: string // characterId
  peerName: string
  peerAvatar?: string
  messages: ForumDMMessage[]
  updatedAt: number
}

export type ForumDataV1 = {
  version: 1
  me: ForumUser
  posts: ForumPost[]
  comments: ForumComment[]
  dms: ForumDMThread[]
  lastRefreshAt?: number
}

const KEY = 'littlephone_forum_v1'

const genId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`

export async function forumLoad(fallbackMe: ForumUser): Promise<ForumDataV1> {
  const base: ForumDataV1 = {
    version: 1,
    me: fallbackMe,
    posts: [],
    comments: [],
    dms: [],
    lastRefreshAt: undefined,
  }
  const loaded = await kvGetJSON<ForumDataV1>(KEY, base)
  const safe = loaded && typeof loaded === 'object' ? loaded : base
  return {
    ...base,
    ...safe,
    me: safe.me && typeof safe.me === 'object' ? { ...fallbackMe, ...safe.me } : fallbackMe,
    posts: Array.isArray(safe.posts) ? safe.posts : [],
    comments: Array.isArray(safe.comments) ? safe.comments : [],
    dms: Array.isArray(safe.dms) ? safe.dms : [],
  }
}

export async function forumSave(data: ForumDataV1): Promise<void> {
  await kvSetJSON(KEY, data)
}

export function forumNewPost(author: ForumUser, title: string, content: string): ForumPost {
  const now = Date.now()
  return {
    id: genId('fp'),
    authorId: author.id,
    authorName: author.name,
    authorAvatar: author.avatar,
    title: title.trim().slice(0, 60) || '（无标题）',
    content: content.trim().slice(0, 2400),
    createdAt: now,
    updatedAt: now,
  }
}

export function forumNewComment(postId: string, author: ForumUser, content: string): ForumComment {
  const now = Date.now()
  return {
    id: genId('fc'),
    postId,
    authorId: author.id,
    authorName: author.name,
    authorAvatar: author.avatar,
    content: content.trim().slice(0, 600),
    createdAt: now,
  }
}

export function forumEnsureDMThread(data: ForumDataV1, peer: { id: string; name: string; avatar?: string }): ForumDataV1 {
  const existing = data.dms.find((t) => t.peerId === peer.id)
  if (existing) return data
  const now = Date.now()
  return {
    ...data,
    dms: [
      {
        peerId: peer.id,
        peerName: peer.name,
        peerAvatar: peer.avatar,
        messages: [],
        updatedAt: now,
      },
      ...data.dms,
    ],
  }
}

