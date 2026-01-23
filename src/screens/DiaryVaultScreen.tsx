import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import AppHeader from '../components/AppHeader'
import { useWeChat } from '../context/WeChatContext'
import WeChatDialog from './wechat/components/WeChatDialog'

export default function DiaryVaultScreen() {
  const navigate = useNavigate()
  const { favoriteDiaries, removeFavoriteDiary, characters, addMessage } = useWeChat()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareDiaryId, setShareDiaryId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [shareResult, setShareResult] = useState<{ open: boolean; targetId: string | null }>({ open: false, targetId: null })

  const selected = useMemo(() => favoriteDiaries.find(d => d.id === selectedId) || null, [favoriteDiaries, selectedId])

  const list = useMemo(() => {
    return [...favoriteDiaries].sort((a, b) => (b.diaryAt || b.createdAt) - (a.diaryAt || a.createdAt))
  }, [favoriteDiaries])

  const formatTs = (ts: number) =>
    new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  const shareTo = (diaryId: string, targetCharacterId: string) => {
    const d = favoriteDiaries.find(x => x.id === diaryId)
    if (!d) return
    addMessage({
      characterId: targetCharacterId,
      isUser: true,
      type: 'diary',
      content: '日记',
      diaryAuthorId: d.characterId,
      diaryAuthorName: d.characterName,
      diaryAt: d.diaryAt,
      diaryTitle: d.title,
      diaryExcerpt: (d.content || '').replace(/\s+/g, ' ').slice(0, 40),
      diaryContent: d.content,
      diaryNote: d.note,
    })
    setShareOpen(false)
    setShareDiaryId(null)
    setShareResult({ open: true, targetId: targetCharacterId })
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="收藏日记" onBack={() => navigate('/', { replace: true })} />

        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4">
          {list.length === 0 ? (
            <div className="mt-10 text-center text-sm text-gray-400">还没有收藏日记</div>
          ) : (
            <div className="space-y-2 mt-2">
              {list.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  className="w-full text-left rounded-2xl bg-white/70 border border-black/10 px-4 py-3 active:scale-[0.99] transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-[#111] truncate">{d.characterName}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5 truncate">{d.title}</div>
                    {!!d.note && <div className="text-[11px] text-gray-400 mt-0.5 truncate">备注：{d.note}</div>}
                    </div>
                    <div className="text-[11px] text-gray-400 flex-shrink-0">{formatTs(d.diaryAt || d.createdAt)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 详情 */}
        {selected && (
          <div className="absolute inset-0 z-50 flex flex-col bg-[#F7F4EE]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 bg-white/70 backdrop-blur">
              <button type="button" onClick={() => setSelectedId(null)} className="text-gray-700 text-sm">返回</button>
              <div className="text-sm font-semibold text-[#111] truncate">{selected.characterName} 的日记</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShareDiaryId(selected.id)
                    setShareOpen(true)
                  }}
                  className="px-3 py-1.5 rounded-full bg-white/70 border border-black/10 text-[12px] text-gray-700"
                >
                  分享
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeFavoriteDiary(selected.id)
                    setSelectedId(null)
                    setToast('已取消收藏')
                    window.setTimeout(() => setToast(null), 1600)
                  }}
                  className="px-3 py-1.5 rounded-full bg-white/70 border border-black/10 text-[12px] text-red-500"
                >
                  删除
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="rounded-[22px] bg-white/75 border border-black/10 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-black/5">
                  <div className="text-[13px] font-semibold text-[#111]">{selected.title}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{formatTs(selected.diaryAt)}</div>
                {!!selected.note && <div className="text-[11px] text-gray-500 mt-1">备注：{selected.note}</div>}
                </div>
                <div
                  className="px-4 py-4 text-[13px] leading-relaxed text-[#111] whitespace-pre-wrap"
                  style={{
                    backgroundImage:
                      'linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)',
                    backgroundSize: '100% 26px',
                  }}
                >
                  {selected.content}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 分享弹窗 */}
        {shareOpen && shareDiaryId && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/35" onClick={() => setShareOpen(false)} role="presentation" />
            <div className="relative w-full max-w-[320px] rounded-2xl bg-white/90 border border-white/30 shadow-xl overflow-hidden backdrop-blur">
              <div className="px-4 py-3 border-b border-black/5 text-center text-sm font-semibold">分享给谁</div>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {characters.length === 0 ? (
                  <div className="text-center text-sm text-gray-400 py-8">暂无好友</div>
                ) : (
                  <div className="space-y-1">
                    {characters.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => shareTo(shareDiaryId, c.id)}
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
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="w-full py-2 rounded-xl bg-gray-100 text-sm text-gray-700"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="pointer-events-none absolute bottom-16 left-0 right-0 flex justify-center z-[70]">
            <div className="px-3 py-2 rounded-full bg-black/70 text-white text-xs">
              {toast}
            </div>
          </div>
        )}

        <WeChatDialog
          open={shareResult.open}
          title="已分享"
          message="已把日记文件分享出去啦。要现在去聊天看看吗？"
          confirmText="去聊天"
          cancelText="稍后再去"
          onCancel={() => setShareResult({ open: false, targetId: null })}
          onConfirm={() => {
            const id = shareResult.targetId
            setShareResult({ open: false, targetId: null })
            if (id) navigate(`/apps/wechat/chat/${encodeURIComponent(id)}`)
          }}
        />
      </div>
    </PageContainer>
  )
}

