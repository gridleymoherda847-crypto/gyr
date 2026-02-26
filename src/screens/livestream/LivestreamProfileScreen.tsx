import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../../components/AppHeader'
import { useWeChat } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'

function randomCommentAuthor() {
  const pool = ['星星眼', '奶盖不加糖', '今天也摸鱼', '骑车看海', '晚风', '小熊软糖', '青柠气泡', '山海', '阿喵', '上岸中']
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function LivestreamProfileScreen() {
  const navigate = useNavigate()
  const { streamerId } = useParams<{ streamerId: string }>()
  const { callLLM } = useOS()
  const {
    getFollowedStreamer,
    setFollowedStreamerUnlocked,
    updateFollowedStreamer,
    appendFollowedStreamerPost,
  } = useWeChat()

  const streamer = useMemo(() => getFollowedStreamer(streamerId || ''), [getFollowedStreamer, streamerId])
  const [loading, setLoading] = useState(false)

  if (!streamer) {
    return (
      <div className="h-full w-full bg-white flex flex-col">
        <AppHeader title="主播主页" onBack={() => navigate('/apps/livestream')} />
        <div className="flex-1 flex items-center justify-center text-sm text-gray-500">未找到该主播数据</div>
      </div>
    )
  }

  const needMask = !streamer.unlocked && streamer.posts.length === 0

  const generateLatest = async (unlockAfter: boolean) => {
    if (loading) return
    setLoading(true)
    try {
      const summary = String(streamer.lastLiveSummary || streamer.desc || streamer.title || '').slice(0, 500)
      const res = await callLLM(
        [
          {
            role: 'system',
            content: '你是直播内容文案助手。根据给定直播摘要，生成主播个性签名、1条最新动态、20-30条评论。只输出JSON，不要解释。',
          },
          {
            role: 'user',
            content:
              `主播名：${streamer.name}\n分类：${streamer.category}\n最近直播内容摘要：${summary || '暂无'}\n\n` +
              '请输出JSON格式：{"signature":"...","post":"...","comments":["..."]}\n' +
              '要求：\n' +
              '- signature 12~40字\n' +
              '- post 40~120字，只要1条\n' +
              '- comments 20~30条，口语化、短句',
          },
        ],
        undefined,
        { maxTokens: 2200, timeoutMs: 60000, temperature: 0.9 }
      )
      let parsed: any = null
      try {
        const m = res.match(/\{[\s\S]*\}/)
        if (m) parsed = JSON.parse(m[0])
      } catch {
        parsed = null
      }

      const signature = String(parsed?.signature || `${streamer.name}：正在直播，欢迎来玩`).slice(0, 80)
      const postContent = String(parsed?.post || `${streamer.name} 今天直播状态不错，感谢大家的支持！`).slice(0, 300)
      const commentsRaw = Array.isArray(parsed?.comments) ? parsed.comments : []
      const comments = commentsRaw
        .slice(0, 30)
        .map((t: any, i: number) => ({
          id: `pc_${Date.now()}_${i}`,
          author: randomCommentAuthor(),
          content: String(t || '').trim().slice(0, 80) || '支持支持！',
          timestamp: Date.now() - i * 60_000,
        }))
        .filter((c: any) => c.content)

      updateFollowedStreamer(streamer.id, {
        signature,
        lastRefreshedAt: Date.now(),
      })
      appendFollowedStreamerPost(streamer.id, {
        content: postContent,
        comments,
      })
      if (unlockAfter) setFollowedStreamerUnlocked(streamer.id, true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full w-full bg-white flex flex-col relative overflow-hidden">
      <div className="h-48 relative">
        <div className="absolute inset-0" style={{ background: streamer.avatarGradient }} />
        {streamer.coverUrl && (
          <img src={streamer.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-black/25" />
      </div>

      <div className="absolute top-0 left-0 right-0 z-20">
        <AppHeader title="主页" onBack={() => navigate('/apps/livestream')} />
      </div>

      <div className="relative -mt-10 z-10 px-4">
        <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white bg-white shadow">
          {streamer.avatarUrl ? (
            <img src={streamer.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{ background: streamer.avatarGradient }} />
          )}
        </div>
        <div className="mt-2 text-base font-semibold text-gray-900">{streamer.name}</div>
        <div className="mt-1 text-sm text-gray-500">{streamer.signature || '点击查看后生成签名'}</div>
        <div className="mt-1 text-xs text-pink-600">已关注 · {streamer.category}</div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 mt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-800">最近动态</div>
          {!needMask && (
            <button
              type="button"
              disabled={loading}
              onClick={() => generateLatest(false)}
              className="px-3 py-1.5 rounded-full text-xs bg-pink-50 text-pink-600 disabled:opacity-50"
            >
              {loading ? '刷新中...' : '刷新最近动态'}
            </button>
          )}
        </div>
        {streamer.posts.length === 0 ? (
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-400 text-center">还没有动态</div>
        ) : (
          <div className="space-y-3">
            {streamer.posts.map((p) => (
              <div key={p.id} className="rounded-xl bg-gray-50 p-3">
                <div className="text-sm text-gray-800 whitespace-pre-wrap">{p.content}</div>
                <div className="text-[11px] text-gray-400 mt-1">{new Date(p.timestamp).toLocaleString('zh-CN')}</div>
                <div className="mt-2 rounded-lg bg-white p-2">
                  <div className="text-[11px] text-gray-500 mb-1">评论（{p.comments.length}）</div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {p.comments.map((c) => (
                      <div key={c.id} className="text-xs">
                        <span className="text-gray-500">{c.author}：</span>
                        <span className="text-gray-700">{c.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {needMask && (
        <div className="absolute inset-0 z-30 backdrop-blur-xl bg-black/35 flex items-center justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => generateLatest(true)}
            className="px-6 py-3 rounded-full bg-white text-gray-900 text-sm font-semibold shadow disabled:opacity-60"
          >
            {loading ? '加载中...' : '点击查看'}
          </button>
        </div>
      )}
    </div>
  )
}
