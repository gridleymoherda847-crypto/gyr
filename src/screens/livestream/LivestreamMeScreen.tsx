import { useNavigate } from 'react-router-dom'
import AppHeader from '../../components/AppHeader'
import { useWeChat } from '../../context/WeChatContext'

export default function LivestreamMeScreen() {
  const navigate = useNavigate()
  const { myLivestreamProfile } = useWeChat()

  return (
    <div className="h-full w-full bg-white flex flex-col">
      <AppHeader title="我的主页" onBack={() => navigate('/apps/livestream')} />

      <div className="flex-1 overflow-y-auto bg-gray-50 pb-6">
        <div className="mx-3 mt-2 rounded-2xl overflow-hidden bg-white shadow-sm">
          <div className="h-40 bg-gradient-to-r from-fuchsia-400 via-pink-400 to-orange-300 relative">
            {myLivestreamProfile.coverUrl && (
              <img src={myLivestreamProfile.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute left-1/2 -bottom-10 -translate-x-1/2 w-20 h-20 rounded-full overflow-hidden border-4 border-white bg-white shadow">
              {myLivestreamProfile.avatarUrl ? (
                <img src={myLivestreamProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white text-2xl">我</div>
              )}
            </div>
          </div>
          <div className="pt-12 pb-4 px-4 text-center">
            <div className="text-lg font-semibold text-gray-900">我的直播主页</div>
            <div className="text-sm text-gray-500 mt-1">{myLivestreamProfile.signature || '这个人很懒，还没写签名。'}</div>
            <div className="text-sm text-pink-600 mt-2">粉丝 {myLivestreamProfile.followers}</div>
          </div>
        </div>

        <div className="mx-3 mt-3 rounded-2xl bg-white p-3 shadow-sm">
          <div className="text-sm font-semibold text-gray-800 mb-2">近期动态（历史保留）</div>
          {myLivestreamProfile.recentPosts.length === 0 ? (
            <div className="text-xs text-gray-400 py-6 text-center">你还没有动态，去开播互动后会自动生成。</div>
          ) : (
            <div className="space-y-3">
              {myLivestreamProfile.recentPosts.map((post) => (
                <div key={post.id} className="rounded-xl bg-gray-50 p-3">
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{post.content}</div>
                  <div className="text-[11px] text-gray-400 mt-1">{new Date(post.timestamp).toLocaleString('zh-CN')}</div>
                  {post.comments.length > 0 && (
                    <div className="mt-2 rounded-lg bg-white p-2">
                      <div className="text-[11px] text-gray-500 mb-1">评论（{post.comments.length}）</div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {post.comments.map((c) => (
                          <div key={c.id} className="text-xs">
                            <span className="text-gray-500">{c.author}：</span>
                            <span className="text-gray-700">{c.content}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mx-3 mt-3">
          <button
            type="button"
            onClick={() => navigate('/apps/livestream/room/me?mode=host')}
            className="w-full bg-gradient-to-r from-pink-500 to-red-500 text-white font-bold px-4 py-3 rounded-xl shadow-lg shadow-pink-500/20 active:scale-[0.99] transition-transform"
          >
            我要开播
          </button>
        </div>
      </div>
    </div>
  )
}
