import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'
import { useOS } from '../context/OSContext'
import { useWeChat } from '../context/WeChatContext'
import WeChatDialog from './wechat/components/WeChatDialog'
import { getGlobalPresets } from './PresetScreen'
import {
  forumEnsureDMThread,
  forumLoad,
  forumNewComment,
  forumNewPost,
  forumSave,
  type ForumDataV1,
  type ForumDMMessage,
  type ForumDMThread,
  type ForumPost,
  type ForumUser,
} from '../storage/forum'

type TabId = 'feed' | 'dm'

const fmt = (ts: number) => {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mi}`
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

export default function ForumScreen() {
  const navigate = useNavigate()
  const { callLLM } = useOS()
  const { getCurrentPersona, characters, getMessagesByCharacter } = useWeChat()

  const persona = useMemo(() => getCurrentPersona(), [getCurrentPersona])
  const me: ForumUser = useMemo(
    () => ({ id: 'me', name: persona?.name || '我', avatar: persona?.avatar || '' }),
    [persona?.avatar, persona?.name]
  )

  const [tab, setTab] = useState<TabId>('feed')
  const [data, setData] = useState<ForumDataV1 | null>(null)
  const [openPostId, setOpenPostId] = useState<string | null>(null)

  const [newPostOpen, setNewPostOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')

  const [dmPeerId, setDmPeerId] = useState<string | null>(null)
  const [dmDraft, setDmDraft] = useState('')
  const [dmSending, setDmSending] = useState(false)

  const [loadingOpen, setLoadingOpen] = useState(false)
  const [loadingStage, setLoadingStage] = useState('正在加载论坛…')
  const [loadingProgress, setLoadingProgress] = useState(0)
  const loadingTimerRef = useRef<number | null>(null)

  const [infoDialog, setInfoDialog] = useState<{ open: boolean; title?: string; message?: string }>({ open: false })

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

  useEffect(() => {
    ;(async () => {
      try {
        startLoadingAnim()
        setLoadingOpen(true)
        setLoadingStage('正在打开论坛…')
        const loaded = await forumLoad(me)
        // 若 persona 改了：同步更新论坛账号显示
        const next = { ...loaded, me }
        setData(next)
        await forumSave(next)
        setLoadingProgress(100)
        window.setTimeout(() => setLoadingOpen(false), 220)
      } catch {
        setLoadingOpen(false)
        setInfoDialog({ open: true, title: '加载失败', message: '论坛数据加载失败了，稍后再试～' })
      } finally {
        stopLoadingTimer()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, me.name, me.avatar])

  const posts = useMemo(() => {
    const arr = data?.posts || []
    return arr.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 60)
  }, [data?.posts])

  const commentsByPost = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of data?.comments || []) {
      map.set(c.postId, (map.get(c.postId) || 0) + 1)
    }
    return map
  }, [data?.comments])

  const openPost = useMemo(() => {
    if (!openPostId) return null
    return (data?.posts || []).find((p) => p.id === openPostId) || null
  }, [data?.posts, openPostId])

  const openPostComments = useMemo(() => {
    if (!openPostId) return []
    return (data?.comments || [])
      .filter((c) => c.postId === openPostId)
      .slice()
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .slice(-80)
  }, [data?.comments, openPostId])

  const dms = useMemo(() => {
    const arr = data?.dms || []
    return arr.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 60)
  }, [data?.dms])

  const openThread: ForumDMThread | null = useMemo(() => {
    if (!dmPeerId) return null
    return (data?.dms || []).find((t) => t.peerId === dmPeerId) || null
  }, [data?.dms, dmPeerId])

  const refreshForum = async () => {
    if (!data) return
    const now = Date.now()
    if (data.lastRefreshAt && now - data.lastRefreshAt < 60 * 1000) {
      setInfoDialog({ open: true, title: '别急～', message: '刚刷新过啦，稍等一会再来。' })
      return
    }

    const globalPresets = getGlobalPresets()
    const charList = (characters || []).filter((c) => !c.isHiddenFromChat && !c.isBlocked).slice(0, 18)
    const authorBrief = charList
      .map((c) => {
        const msgs = getMessagesByCharacter(c.id) || []
        const last = msgs[msgs.length - 1]
        const lastAt = last?.timestamp ? fmt(last.timestamp) : '（无）'
        return `- id=${c.id} 名字=${c.name} 最近聊天=${lastAt} 人设=${String(c.prompt || '').trim().slice(0, 120) || '（无）'}`
      })
      .join('\n')

    startLoadingAnim()
    setLoadingOpen(true)
    setLoadingStage('正在刷新论坛…')
    try {
      const sys =
        `${globalPresets ? globalPresets + '\n\n' : ''}` +
        `【论坛（广场刷新）】\n` +
        `你要生成一些“像真的论坛”的新帖子，用户会在手机里刷到。\n` +
        `要求：\n` +
        `- 每次最多生成 4 条新帖\n` +
        `- 语气真实，像论坛用户发帖（可以有情绪、口头禅，但严禁辱女/性羞辱词汇）\n` +
        `- 不要让不同角色互相对骂/互相互动（评论区先留给“我”和“作者”来互动）\n` +
        `- 不要输出多余解释\n` +
        `\n` +
        `【可用发帖作者（来自微信角色）】\n${authorBrief || '（无）'}\n` +
        `\n` +
        `【只输出 JSON】\n` +
        `{\n` +
        `  "posts": [\n` +
        `    { "authorId": "角色id", "title": "标题(<=30字)", "content": "正文(<=380字)" }\n` +
        `  ]\n` +
        `}\n`

      setLoadingStage('正在生成帖子…')
      const res = await callLLM([{ role: 'system', content: sys }, { role: 'user', content: '现在输出 JSON。' }], undefined, {
        maxTokens: 900,
        timeoutMs: 600000,
        temperature: 0.85,
      })

      const parsed = tryParseJsonBlock(res) || {}
      const rawPosts = Array.isArray(parsed.posts) ? parsed.posts : []
      const normalized: ForumPost[] = []

      for (const rp of rawPosts.slice(0, 4)) {
        const authorId = String(rp?.authorId || '').trim()
        const author = charList.find((c) => c.id === authorId) || charList[Math.floor(Math.random() * Math.max(1, charList.length))]
        if (!author) continue
        const title = String(rp?.title || '').trim().slice(0, 60)
        const content = String(rp?.content || '').trim().replace(/\n{3,}/g, '\n\n').slice(0, 900)
        if (!title && !content) continue
        const post = forumNewPost({ id: author.id, name: author.name, avatar: author.avatar }, title || '（无标题）', content || '（空）')
        normalized.push(post)
      }

      const next: ForumDataV1 = {
        ...data,
        posts: [...normalized, ...(data.posts || [])].slice(0, 200),
        lastRefreshAt: now,
      }
      setData(next)
      await forumSave(next)
      setLoadingProgress(100)
      window.setTimeout(() => setLoadingOpen(false), 240)
    } catch (e: any) {
      setLoadingOpen(false)
      setInfoDialog({ open: true, title: '刷新失败', message: e?.message || '刷新失败了，检查一下 API 配置～' })
    } finally {
      stopLoadingTimer()
    }
  }

  const submitNewPost = async () => {
    if (!data) return
    const title = newTitle.trim()
    const content = newContent.trim()
    if (!content) return
    const post = forumNewPost(me, title || '（无标题）', content)
    const next: ForumDataV1 = { ...data, posts: [post, ...(data.posts || [])] }
    setData(next)
    await forumSave(next)
    setNewTitle('')
    setNewContent('')
    setNewPostOpen(false)
    setTab('feed')
    setOpenPostId(post.id)
  }

  const addComment = async (text: string) => {
    if (!data || !openPost) return
    const content = (text || '').trim()
    if (!content) return
    const c = forumNewComment(openPost.id, me, content)
    const next: ForumDataV1 = { ...data, comments: [...(data.comments || []), c].slice(-1200) }
    setData(next)
    await forumSave(next)
  }

  const sendDM = async () => {
    if (!data || !dmPeerId) return
    const character = (characters || []).find((c) => c.id === dmPeerId)
    if (!character) return
    const text = dmDraft.trim()
    if (!text) return

    setDmDraft('')
    setDmSending(true)
    try {
      let nextData = forumEnsureDMThread(data, { id: character.id, name: character.name, avatar: character.avatar })
      let thread = nextData.dms.find((t) => t.peerId === character.id)!
      const now = Date.now()
      const userMsg: ForumDMMessage = { id: `dm_${now}_${Math.random().toString(16).slice(2)}`, from: 'user', text, at: now }
      thread = {
        ...thread,
        messages: [...(thread.messages || []), userMsg].slice(-120),
        updatedAt: now,
      }
      nextData = { ...nextData, dms: [thread, ...nextData.dms.filter((t) => t.peerId !== character.id)] }
      setData(nextData)
      await forumSave(nextData)

      // 生成对方回复
      const globalPresets = getGlobalPresets()
      const recent = thread.messages.slice(-14).map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text }))
      const sys =
        `${globalPresets ? globalPresets + '\n\n' : ''}` +
        `【论坛私信】\n` +
        `你是：${character.name}\n` +
        `你的人设：${String(character.prompt || '').trim() || '（无）'}\n` +
        `我（用户）：${me.name}\n` +
        `要求：\n` +
        `- 像私信聊天，短一点也可以，只输出回复正文\n` +
        `- 严禁辱女/性羞辱词汇\n`
      const res = await callLLM([{ role: 'system', content: sys }, ...recent], undefined, {
        maxTokens: 220,
        timeoutMs: 600000,
        temperature: 0.9,
      })
      const reply = (res || '').trim().replace(/\n{3,}/g, '\n\n').slice(0, 260)
      if (reply) {
        const at2 = Date.now()
        const peerMsg: ForumDMMessage = { id: `dm_${at2}_${Math.random().toString(16).slice(2)}`, from: 'peer', text: reply, at: at2 }
        const thread2: ForumDMThread = {
          ...thread,
          messages: [...thread.messages, peerMsg].slice(-120),
          updatedAt: at2,
        }
        const next2: ForumDataV1 = { ...nextData, dms: [thread2, ...nextData.dms.filter((t) => t.peerId !== character.id)] }
        setData(next2)
        await forumSave(next2)
      }
    } catch (e: any) {
      setInfoDialog({ open: true, title: '发送失败', message: e?.message || '私信发送失败了，稍后再试～' })
    } finally {
      setDmSending(false)
    }
  }

  if (!data) {
    return (
      <PageContainer>
        <div className="flex h-full flex-col px-3 pt-2 pb-2">
          <AppHeader title="论坛" onBack={() => navigate('/', { replace: true })} />
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">加载中…</div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 pt-2 pb-2">
        <AppHeader title="论坛" onBack={() => navigate('/', { replace: true })} />

        {/* Tabs */}
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            className={`flex-1 py-2 rounded-xl text-[13px] font-semibold border ${
              tab === 'feed' ? 'bg-pink-500 text-white border-pink-500' : 'bg-white/70 text-gray-700 border-black/10'
            }`}
            onClick={() => {
              setTab('feed')
              setDmPeerId(null)
              setOpenPostId(null)
            }}
          >
            广场
          </button>
          <button
            type="button"
            className={`flex-1 py-2 rounded-xl text-[13px] font-semibold border ${
              tab === 'dm' ? 'bg-pink-500 text-white border-pink-500' : 'bg-white/70 text-gray-700 border-black/10'
            }`}
            onClick={() => {
              setTab('dm')
              setOpenPostId(null)
            }}
          >
            私信
          </button>
        </div>

        {/* Feed */}
        {tab === 'feed' && (
          <div className="mt-2 flex-1 overflow-y-auto pb-16">
            <div className="flex items-center justify-between">
              <div className="text-[12px] text-gray-500">账号：{data.me.name}</div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-full bg-white/70 border border-black/10 text-[12px] font-semibold text-gray-700 active:scale-[0.98]"
                onClick={() => void refreshForum()}
              >
                刷新
              </button>
            </div>

            {openPost ? (
              <div className="mt-3 rounded-2xl bg-white/80 border border-black/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-gray-900">{openPost.title}</div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      {openPost.authorName} · {fmt(openPost.createdAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 text-[12px] font-semibold active:scale-[0.98]"
                    onClick={() => setOpenPostId(null)}
                  >
                    返回
                  </button>
                </div>
                <div className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-gray-800">
                  {openPost.content}
                </div>

                <div className="mt-4 border-t border-black/5 pt-3">
                  <div className="text-[12px] font-semibold text-gray-800">评论</div>
                  <div className="mt-2 space-y-2">
                    {openPostComments.map((c) => (
                      <div key={c.id} className="rounded-xl bg-gray-50 border border-black/5 px-3 py-2">
                        <div className="text-[11px] text-gray-600">
                          {c.authorName} · {fmt(c.createdAt)}
                        </div>
                        <div className="mt-1 text-[13px] text-gray-800 whitespace-pre-wrap break-words">{c.content}</div>
                      </div>
                    ))}
                    {openPostComments.length === 0 && <div className="text-[12px] text-gray-500">还没有评论，抢个沙发～</div>}
                  </div>

                  <CommentComposer onSend={(t) => void addComment(t)} />
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {posts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left rounded-2xl bg-white/80 border border-black/10 px-3 py-3 active:scale-[0.99]"
                    onClick={() => setOpenPostId(p.id)}
                  >
                    <div className="text-[14px] font-bold text-gray-900 line-clamp-1">{p.title}</div>
                    <div className="mt-1 text-[12px] text-gray-700 line-clamp-2 whitespace-pre-wrap">{p.content}</div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                      <span>
                        {p.authorName} · {fmt(p.createdAt)}
                      </span>
                      <span>评论 {commentsByPost.get(p.id) || 0}</span>
                    </div>
                  </button>
                ))}
                {posts.length === 0 && <div className="text-[12px] text-gray-500 mt-6 text-center">这里还空空的～点右下角发第一帖。</div>}
              </div>
            )}

            {/* Floating post button */}
            {!openPost && (
              <button
                type="button"
                className="fixed bottom-[90px] right-4 w-12 h-12 rounded-full bg-pink-500 text-white shadow-lg flex items-center justify-center active:scale-[0.98]"
                onClick={() => setNewPostOpen(true)}
                title="发帖"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* DMs */}
        {tab === 'dm' && (
          <div className="mt-2 flex-1 overflow-y-auto pb-3">
            {dmPeerId && openThread ? (
              <div className="rounded-2xl bg-white/80 border border-black/10 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[14px] font-bold text-gray-900">{openThread.peerName}</div>
                  <button
                    type="button"
                    className="px-2 py-1 rounded-lg bg-gray-100 text-gray-700 text-[12px] font-semibold active:scale-[0.98]"
                    onClick={() => setDmPeerId(null)}
                  >
                    返回
                  </button>
                </div>

                <div className="mt-3 space-y-2 max-h-[52vh] overflow-y-auto pr-0.5">
                  {openThread.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[82%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                          m.from === 'user' ? 'bg-pink-500 text-white rounded-tr-md' : 'bg-gray-50 text-gray-800 rounded-tl-md'
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">{m.text}</div>
                        <div className={`mt-1 text-[10px] ${m.from === 'user' ? 'text-white/80' : 'text-gray-500'}`}>{fmt(m.at)}</div>
                      </div>
                    </div>
                  ))}
                  {openThread.messages.length === 0 && <div className="text-[12px] text-gray-500">发一句私信试试～</div>}
                </div>

                <div className="mt-3 flex items-end gap-2">
                  <textarea
                    value={dmDraft}
                    onChange={(e) => setDmDraft(e.target.value)}
                    className="flex-1 min-h-[44px] max-h-[92px] resize-none rounded-2xl bg-white border border-black/10 px-3 py-2 text-[12px] text-gray-800 outline-none"
                    placeholder="私信内容…"
                  />
                  <button
                    type="button"
                    disabled={dmSending || !dmDraft.trim()}
                    onClick={() => void sendDM()}
                    className={`h-[44px] px-4 rounded-2xl text-[12px] font-semibold text-white shadow-sm active:scale-[0.99] ${
                      dmSending || !dmDraft.trim() ? 'bg-gray-300' : 'bg-pink-500'
                    }`}
                  >
                    {dmSending ? '发送中…' : '发送'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-[12px] text-gray-500">从这里给角色发私信（和微信聊天不冲突）。</div>
                {(characters || [])
                  .filter((c) => !c.isHiddenFromChat && !c.isBlocked)
                  .slice(0, 40)
                  .map((c) => {
                    const thread = dms.find((t) => t.peerId === c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full rounded-2xl bg-white/80 border border-black/10 px-3 py-3 flex items-center gap-3 active:scale-[0.99]"
                        onClick={() => {
                          setDmPeerId(c.id)
                          setTab('dm')
                        }}
                      >
                        <div className="w-11 h-11 rounded-2xl overflow-hidden bg-gray-100 border border-black/10 shrink-0">
                          {c.avatar ? (
                            <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-700 font-semibold">{c.name[0]}</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <div className="text-[14px] font-bold text-gray-900">{c.name}</div>
                          <div className="mt-0.5 text-[12px] text-gray-600 line-clamp-1">
                            {thread?.messages?.length ? thread.messages[thread.messages.length - 1].text : '点我发私信'}
                          </div>
                        </div>
                        <div className="text-[11px] text-gray-400">{thread?.updatedAt ? fmt(thread.updatedAt) : ''}</div>
                      </button>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/* New post dialog */}
        <WeChatDialog
          open={newPostOpen}
          title="发帖"
          message="像真的论坛一样发一条。"
          confirmText="发布"
          cancelText="取消"
          onConfirm={() => void submitNewPost()}
          onCancel={() => setNewPostOpen(false)}
        >
          <div className="space-y-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="标题（可选）"
              className="w-full px-3 py-2 rounded-xl bg-white border border-black/10 text-[13px] text-gray-800 outline-none"
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="正文（必填）"
              className="w-full min-h-[120px] resize-none px-3 py-2 rounded-xl bg-white border border-black/10 text-[13px] text-gray-800 outline-none"
            />
            <div className="text-[11px] text-gray-500">发布后可在评论区继续互动。</div>
          </div>
        </WeChatDialog>

        {/* Loading dialog */}
        <WeChatDialog open={loadingOpen} title="论坛正在加载中" message={loadingStage} confirmText="稍等" onConfirm={() => {}} onCancel={() => {}}>
          <div className="mt-2">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-400 transition-all"
                style={{ width: `${Math.max(3, Math.min(100, loadingProgress))}%` }}
              />
            </div>
            <div className="mt-2 text-center text-[11px] text-gray-500">{Math.round(loadingProgress)}%</div>
          </div>
        </WeChatDialog>

        {/* Info */}
        <WeChatDialog
          open={infoDialog.open}
          title={infoDialog.title}
          message={infoDialog.message}
          confirmText="好"
          onConfirm={() => setInfoDialog({ open: false })}
          onCancel={() => setInfoDialog({ open: false })}
        />
      </div>
    </PageContainer>
  )
}

function CommentComposer({ onSend }: { onSend: (text: string) => void }) {
  const [v, setV] = useState('')
  return (
    <div className="mt-3 flex items-end gap-2">
      <textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="flex-1 min-h-[44px] max-h-[92px] resize-none rounded-2xl bg-white border border-black/10 px-3 py-2 text-[12px] text-gray-800 outline-none"
        placeholder="写评论…"
      />
      <button
        type="button"
        disabled={!v.trim()}
        onClick={() => {
          const t = v.trim()
          if (!t) return
          setV('')
          onSend(t)
        }}
        className={`h-[44px] px-4 rounded-2xl text-[12px] font-semibold text-white shadow-sm active:scale-[0.99] ${
          !v.trim() ? 'bg-gray-300' : 'bg-gray-900'
        }`}
      >
        发送
      </button>
    </div>
  )
}

