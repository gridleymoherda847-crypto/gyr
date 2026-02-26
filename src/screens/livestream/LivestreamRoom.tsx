import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'
import DanmakuLayer, { type DanmakuMessage } from './components/DanmakuLayer'
import GiftPanel, { GIFT_LIST, type GiftDef } from './components/GiftPanel'
import GiftAnimation, { type GiftEvent } from './components/GiftAnimation'
import type { LiveStreamer } from './LivestreamHome'

// ─── 分区弹幕 ──────────────────────────────────
const CATEGORY_DANMAKU: Record<string, string[]> = {
  recommend: [
    '主播好好看！', '666666', '来啦来啦', '大家晚上好~', '今天好开心',
    '哈哈哈笑死我了', '怎么这么可爱', '加油加油！', '好有趣啊', '第一次来',
    '老粉报道', '太厉害了', '绝绝子', '好想认识你', '直播多久啦',
    '催更催更', '明天还播吗', '粉丝团在哪', '感觉氛围好棒', '新人求关注',
    '被种草了', '哇塞', '支持主播！', '冲冲冲', '前排占座', '精彩精彩',
  ],
  beauty: [
    '好帅啊啊啊', '脸好小！', '今天穿的好好看', '求同款链接', '太A了吧',
    '笑起来好甜', '这颜值绝了', '可以近距离看一下吗', '好想捏脸', '侧脸杀我',
    '今天化了什么妆', '发型好看', '五官真的精致', '360度无死角', '纯天然吧',
    '眼睛会说话', '嘴巴好翘', '下巴好尖', '皮肤太好了吧', '求护肤秘诀',
    '这个角度绝了', '能不能对镜头笑一下', '呜呜太好看了', '老婆/老公！', 'wink一下',
  ],
  shopping: [
    '多少钱啊', '能便宜点吗', '已下单！', '求链接', '这个好用吗',
    '和XX比哪个好', '买过了 真的好用', '色号推荐一下', '有优惠吗', '库存还有吗',
    '适合干皮吗', '尺码偏大还是偏小', '能看下实物吗', '拍一号链接', '回购了三次了',
    '成分安全吗', '这个是正品吗', '主播用了多久了', '有赠品吗', '等这个等好久了',
    '上车上车', '3 2 1 上链接', '冲了冲了', '求翻牌', '家人们抢到了吗',
  ],
  gaming: [
    '这波操作66', '主播太强了', '带我上分', 'MVP预定', '对面要被打哭了',
    '这枪法绝了', '菜就多练', '别送头啊', '稳住我们能赢', '团战跟紧',
    '闪现交了', '这个走位可以', '大招好了没', '打野来gank', '补兵不错',
    '这把必赢', '别浪了', '好好打别聊天', '主播段位多少', '教教我',
    '对面挂了吧', '这也能秀', '太菜了', '认真打！', '五杀五杀！',
  ],
  talent: [
    '唱的好好听', '再来一首！', '高音绝了', '我的耳朵怀孕了', '什么神仙嗓音',
    '可以唱XX吗', '好有感觉', '鸡皮疙瘩都起来了', '钢琴弹的太好了', '画的真像',
    '跳舞好飒', '节奏感好强', '这个转音太绝了', 'B站看过你', '专业的吧',
    '什么时候出道', '音色太好了', '小提琴拉的好棒', '求翻唱XX', '声音好治愈',
    '气息好稳', '这个画风好喜欢', '才华横溢', '天赋型选手', '能教教吗',
  ],
  outdoor: [
    '这是哪里啊', '好美啊', '想去！', '住一晚多少钱', '这个店我去过',
    '风景太美了', '空气好好', '我也想旅游', '主播在哪个城市', '人好少好安静',
    '要注意安全', '夜景更好看', '有推荐的美食吗', '交通方便吗', '这条路好浪漫',
    '感觉好治愈', '我家附近！', '下次去打卡', '门票贵不贵', '拍的好好看',
    '好羡慕', '带上我', '日落绝了', '这个季节最适合', '明天还播户外吗',
  ],
  chat: [
    '好治愈', '声音好好听', '陪陪我', '今天心情不好', '主播说的好有道理',
    '被安慰到了', '眼眶湿了', '同感同感', '谢谢主播', '最近好累',
    '怎么脱单啊', '深夜emo了', '主播好温柔', '说的太对了', '听哭了',
    '能念念我的信吗', '好想倾诉', '感觉好多了', '主播是心理医生吗', '被治愈了',
    '夜深了注意休息', '感觉找到知己了', '能聊聊天吗', '好喜欢这个氛围', '晚安',
  ],
  food: [
    '看饿了', '好好吃的样子', '什么味道', '教教怎么做', '食材哪买的',
    '口水流了', '主播吃好多', '不怕胖吗', '今晚加餐', '好想吃',
    '一口下去太满足了', '这个我做过超好吃', '火候要注意', '放多少盐', '简单吗',
    '适合新手吗', '有素食版本吗', '配什么酒好', '主播推荐一下', '我也在做',
    '颜色好漂亮', '摆盘好精致', '深夜放毒', '减肥的人看了想哭', '出食谱吧',
  ],
}

function getMockDanmaku(category: string): string[] {
  return CATEGORY_DANMAKU[category] || CATEGORY_DANMAKU.recommend
}

const MOCK_NAMES = [
  '小糖果', '夜色微凉', '追风少年', '甜甜圈', '月亮代表我的心',
  '风之子', '奔跑吧蜗牛', '阳光男孩', '浅浅笑', '星河漫步',
  '猫耳朵', '夏天的风', '蓝莓酱', '小确幸', '晚安世界',
  '柠檬不酸', '向日葵', '可爱多', '流浪猫', '暖暖的太阳',
]

const USER_COLORS = [
  '#FF6B9D', '#C084FC', '#67E8F9', '#FCD34D', '#86EFAC',
  '#FDA4AF', '#93C5FD', '#FCA5A5', '#D8B4FE', '#6EE7B7',
]

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─── 点赞飘心组件（最顶层 z-index） ────────────────
type FloatingHeart = { id: number; x: number; emoji: string }
const HEART_EMOJIS = ['❤️', '💗', '💖', '💕', '🧡', '💛', '💚', '💙', '💜', '🤍', '⭐', '✨', '🌟', '🎉', '👍', '🥰']

function FloatingHearts({ hearts }: { hearts: FloatingHeart[] }) {
  return (
    <div className="absolute right-6 w-16 pointer-events-none" style={{ bottom: '30%', height: '250px', zIndex: 9999 }}>
      {hearts.map(h => (
        <div
          key={h.id}
          className="absolute bottom-0 animate-heartFloat"
          style={{ left: `${h.x}%` }}
        >
          <span className="text-2xl drop-shadow-lg">{h.emoji}</span>
        </div>
      ))}
    </div>
  )
}

// ─── 主组件 ──────────────────────────────────────
export default function LivestreamRoom() {
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode') === 'host' ? 'host' : 'watch'
  const navigate = useNavigate()
  const {
    livestreamCoins,
    updateLivestreamCoins,
    userPersonas,
    userSettings,
    isStreamerFollowed,
    followStreamer,
    unfollowStreamer,
    updateFollowedStreamer,
    updateFollowedStreamerLastSummary,
    appendFollowedStreamerPost,
    appendMyLivestreamPost,
  } = useWeChat()
  const { callLLM } = useOS()

  const streamerData = useMemo<LiveStreamer | null>(() => {
    try {
      const raw = searchParams.get('data')
      if (raw) return JSON.parse(decodeURIComponent(raw)) as LiveStreamer
    } catch { /* */ }
    return null
  }, [searchParams])

  const myName = useMemo(() => {
    const persona = userPersonas.find(p => p.id === userSettings.currentPersonaId)
    return persona?.name || '我'
  }, [userPersonas, userSettings.currentPersonaId])

  const [userExp, setUserExp] = useState(() => {
    try { return Number(sessionStorage.getItem('livestream_user_exp')) || 0 } catch { return 0 }
  })
  const userLevel = useMemo(() => {
    if (userExp < 5) return 1
    if (userExp < 15) return 2
    if (userExp < 30) return 3
    if (userExp < 60) return 4
    if (userExp < 120) return 5
    if (userExp < 250) return 6
    if (userExp < 500) return 7
    if (userExp < 1000) return 8
    return 9
  }, [userExp])
  const addExp = useCallback((pts: number) => {
    setUserExp(prev => {
      const next = prev + pts
      try { sessionStorage.setItem('livestream_user_exp', String(next)) } catch { /* */ }
      return next
    })
  }, [])

  const roomId = streamerData?.id || 'unknown'
  const roomStateKey = `livestream_room_${roomId}`

  const savedRoom = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(roomStateKey)
      if (raw) return JSON.parse(raw) as { sceneText?: string; apiDanmaku?: { user: string; text: string }[] }
    } catch { /* */ }
    return null
  }, [roomStateKey])

  const [danmaku, setDanmaku] = useState<DanmakuMessage[]>([])
  const [giftEvents, setGiftEvents] = useState<GiftEvent[]>([])
  const [showGiftPanel, setShowGiftPanel] = useState(false)
  const [inputText, setInputText] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [viewerCount, setViewerCount] = useState(() => streamerData?.viewers || Math.floor(Math.random() * 5000) + 500)
  const [receivedCoins, setReceivedCoins] = useState(0)
  const [hearts, setHearts] = useState<FloatingHeart[]>([])
  const [liveSceneText, setLiveSceneText] = useState(() => savedRoom?.sceneText || '')
  const [refreshLoading, setRefreshLoading] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState(0)
  const [apiDanmaku, setApiDanmaku] = useState<{ user: string; text: string }[]>(() => savedRoom?.apiDanmaku || [])
  const [toastMsg, setToastMsg] = useState('')
  const apiDanmakuIndexRef = useRef(0)

  const danmakuIdRef = useRef(0)
  const heartIdRef = useRef(0)
  const timerRefs = useRef<number[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const userMessagesRef = useRef<string[]>([])
  const hasRefreshedRef = useRef(false)
  const userGiftsRef = useRef<{ name: string; icon: string; count: number }[]>([])

  // 保存房间状态到 sessionStorage
  useEffect(() => {
    if (!liveSceneText && apiDanmaku.length === 0) return
    try {
      sessionStorage.setItem(roomStateKey, JSON.stringify({ sceneText: liveSceneText, apiDanmaku }))
    } catch { /* */ }
  }, [liveSceneText, apiDanmaku, roomStateKey])

  const streamerName = mode === 'host' ? myName : (streamerData?.name || '主播')
  const streamerGradient = streamerData?.avatarGradient || 'linear-gradient(135deg, #667eea, #764ba2)'
  const streamerAvatarUrl = streamerData?.avatarUrl || ''
  const streamerCoverUrl = streamerData?.coverUrl || ''
  const streamerTitle = streamerData?.title || '直播中'
  const streamerDesc = streamerData?.desc || '欢迎来到直播间~'
  const streamerCategory = streamerData?.category || 'recommend'
  const initialSceneText = streamerData?.sceneText || ''
  const displaySceneText = liveSceneText || initialSceneText
  const isFollowed = mode === 'watch' && !!streamerData?.id ? isStreamerFollowed(streamerData.id) : false

  const handleToggleFollow = useCallback(() => {
    if (!streamerData?.id) return
    if (isStreamerFollowed(streamerData.id)) {
      unfollowStreamer(streamerData.id)
      return
    }
    followStreamer({
      id: streamerData.id,
      name: streamerData.name,
      avatarUrl: streamerData.avatarUrl,
      avatarGradient: streamerData.avatarGradient,
      coverUrl: streamerData.coverUrl,
      category: streamerData.category,
      title: streamerData.title,
      desc: streamerData.desc,
    })
  }, [streamerData, isStreamerFollowed, unfollowStreamer, followStreamer])

  const addDanmaku = useCallback((msg: Omit<DanmakuMessage, 'id'>) => {
    danmakuIdRef.current++
    setDanmaku(prev => [...prev.slice(-80), { ...msg, id: `dm_${danmakuIdRef.current}` }])
  }, [])

  const addHeart = useCallback((emoji?: string) => {
    heartIdRef.current++
    const h: FloatingHeart = {
      id: heartIdRef.current,
      x: Math.random() * 60 + 20,
      emoji: emoji || randomPick(HEART_EMOJIS),
    }
    setHearts(prev => [...prev.slice(-15), h])
    setTimeout(() => {
      setHearts(prev => prev.filter(x => x.id !== h.id))
    }, 2000)
  }, [])

  // 自动播放 mock 数据
  useEffect(() => {
    const entryTimer = window.setInterval(() => {
      const name = randomPick(MOCK_NAMES)
      addDanmaku({ user: '', text: `${name} 进入了直播间`, isSystem: true })
      setViewerCount(prev => prev + Math.floor(Math.random() * 3) - 1)
    }, 3000 + Math.random() * 4000)
    timerRefs.current.push(entryTimer)

    const chatTimer = window.setInterval(() => {
      if (apiDanmaku.length > 0 && Math.random() < 0.45) {
        const idx = apiDanmakuIndexRef.current % apiDanmaku.length
        apiDanmakuIndexRef.current++
        const ad = apiDanmaku[idx]
        const color = randomPick(USER_COLORS)
        const level = Math.floor(Math.random() * 6) + 1
        addDanmaku({ user: ad.user, text: ad.text, color, level })
      } else {
        const name = randomPick(MOCK_NAMES)
        const text = randomPick(getMockDanmaku(streamerCategory))
        const color = randomPick(USER_COLORS)
        const level = Math.floor(Math.random() * 6)
        addDanmaku({ user: name, text, color, level })
      }
    }, 1500 + Math.random() * 2500)
    timerRefs.current.push(chatTimer)

    const viewerTimer = window.setInterval(() => {
      setViewerCount(prev => Math.max(100, prev + Math.floor(Math.random() * 20) - 8))
    }, 5000)
    timerRefs.current.push(viewerTimer)

    const heartTimer = window.setInterval(() => {
      if (Math.random() < 0.4) addHeart()
    }, 2000)
    timerRefs.current.push(heartTimer)

    const giftTimer = window.setInterval(() => {
      if (Math.random() < 0.25) {
        const sender = randomPick(MOCK_NAMES)
        const gift = randomPick(GIFT_LIST.filter(g => g.price <= 100))
        const ev: GiftEvent = {
          id: `ge_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          gift, sender, timestamp: Date.now(),
        }
        setGiftEvents(prev => [...prev.slice(-10), ev])
        addDanmaku({ user: sender, text: `送出 ${gift.name} ${gift.icon}`, color: '#FFD700', isGift: true })
        if (mode === 'host') setReceivedCoins(prev => prev + gift.price)
      }
    }, 5000 + Math.random() * 5000)
    timerRefs.current.push(giftTimer)

    return () => {
      timerRefs.current.forEach(t => window.clearInterval(t))
      timerRefs.current = []
    }
  }, [addDanmaku, addHeart, mode, apiDanmaku])

  const handleSendDanmaku = () => {
    if (!inputText.trim()) return
    const text = inputText.trim()
    addDanmaku({ user: myName, text, color: '#FFD700', level: userLevel })
    userMessagesRef.current.push(text)
    if (userMessagesRef.current.length > 10) userMessagesRef.current = userMessagesRef.current.slice(-10)
    addExp(1)
    setInputText('')
    setShowInput(false)
  }

  const handleSendGift = (gift: GiftDef) => {
    if (livestreamCoins < gift.price) return
    updateLivestreamCoins(-gift.price)
    const ev: GiftEvent = {
      id: `ge_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      gift, sender: myName, timestamp: Date.now(),
    }
    setGiftEvents(prev => [...prev.slice(-10), ev])
    addDanmaku({ user: myName, text: `送出 ${gift.name} ${gift.icon}`, color: '#FFD700', isGift: true, level: userLevel })
    setShowGiftPanel(false)
    addExp(Math.max(1, Math.floor(gift.price / 10)))
    const existing = userGiftsRef.current.find(g => g.name === gift.name)
    if (existing) { existing.count++ } else { userGiftsRef.current.push({ name: gift.name, icon: gift.icon, count: 1 }) }
  }

  useEffect(() => {
    const el = document.getElementById('scene-text-box')
    if (!el) return
    if (!hasRefreshedRef.current) {
      el.scrollTop = 0
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [displaySceneText])

  const handleRefreshRoom = useCallback(async () => {
    if (refreshLoading) return
    setRefreshLoading(true)
    setRefreshProgress(0)

    const progressTimer = window.setInterval(() => {
      setRefreshProgress(prev => Math.min(prev + Math.random() * 15 + 5, 90))
    }, 300)

    try {
      const userMsgs = [...userMessagesRef.current]
      const hasUserMsg = userMsgs.length > 0
      const catMap: Record<string, string> = {
        recommend: '综合', beauty: '颜值', shopping: '带货', gaming: '电竞',
        talent: '才艺', outdoor: '户外', chat: '聊天', food: '美食',
      }
      const catLabel = catMap[streamerCategory] || '综合'

      const userGifts = [...userGiftsRef.current]
      const hasGifts = userGifts.length > 0
      const giftSummary = hasGifts ? userGifts.map(g => `${g.icon}${g.name}x${g.count}`).join('、') : ''

      let userInteractionBlock = ''
      if (hasUserMsg || hasGifts) {
        userInteractionBlock = `\n\n【最重要·必须执行】有一个叫"${myName}"的Lv.${userLevel}观众：`
        if (userLevel >= 5) {
          userInteractionBlock += `\n（这是一位高等级老粉，主播要格外热情，点名感谢，语气亲切宠溺！）`
        }
        if (hasUserMsg) {
          userInteractionBlock += `\n在弹幕里发了这些消息：\n${userMsgs.slice(-5).map(m => `  - "${m}"`).join('\n')}\n主播必须看到这些弹幕并做出回应（比如念出来、回答问题、感谢等）。`
        }
        if (hasGifts) {
          userInteractionBlock += `\n送了这些礼物：${giftSummary}\n主播必须感谢这位观众的礼物，表达惊喜和感动！越贵的礼物反应越夸张（比如站起来鞠躬、叫出声、感动到红眼睛）。`
        }
        userInteractionBlock += `\n你的danmaku里，至少3条弹幕要和"${myName}"的互动相关（比如附和、讨论、感慨大佬等）。`
      }

      const prompt = `你是「${catLabel}区」的主播"${streamerName}"，直播间标题"${streamerTitle}"，简介"${streamerDesc}"。
当前直播分类是【${catLabel}】，你的所有内容必须紧扣这个分类！

之前的直播画面：
${displaySceneText.slice(-400)}
${userInteractionBlock}

请生成接下来的内容：

1. sceneText（至少250字）：
   - 像写小说一样续写直播画面，描写主播此刻在做什么、说什么、什么表情动作
   - 必须紧扣【${catLabel}】分类：${catLabel === '颜值' ? '展示穿搭/化妆/自拍/互动' : catLabel === '电竞' ? '打游戏/操作/解说/吐槽' : catLabel === '带货' ? '介绍产品/试用/报价/催单' : catLabel === '才艺' ? '表演唱歌/乐器/画画/舞蹈' : catLabel === '户外' ? '探店/旅行/街拍/吃东西' : catLabel === '美食' ? '做菜/试吃/讲解做法' : catLabel === '聊天' ? '情感聊天/读信/念书/陪伴' : '随意发挥'}
   - 包含主播说的台词（用引号）${(hasUserMsg || hasGifts) ? `\n   - 主播一定要看到并回应"${myName}"的弹幕和礼物` : ''}

2. danmaku（22条路人弹幕）：
   - 每条含user(昵称2-6字)和text(弹幕内容)
   - 弹幕必须和当前直播画面内容直接相关
   - 风格多样：有夸的、搞笑的、提问的、刷梗的、吐槽的
   - 要有活人感，像真实直播间的弹幕${(hasUserMsg || hasGifts) ? `\n   - 至少3条和"${myName}"的互动相关` : ''}

只输出JSON：{"sceneText":"...","danmaku":[{"user":"..","text":".."},...]}`

      const res = await callLLM(
        [
          { role: 'system', content: `你是${catLabel}区直播内容生成器。只输出JSON。` },
          { role: 'user', content: prompt },
        ],
        undefined,
        { maxTokens: 3500, timeoutMs: 60000, temperature: 0.9 }
      )

      let parsed: any = null
      try {
        const m = res.match(/\{[\s\S]*\}/)
        if (m) parsed = JSON.parse(m[0])
      } catch { /* */ }

      if (parsed) {
        const latestScene = String(parsed.sceneText || '').trim()
        if (parsed.sceneText) {
          setLiveSceneText(prev => {
            const base = prev || initialSceneText
            return base + '\n\n—— 最新画面 ——\n\n' + String(parsed.sceneText)
          })
        }
        if (Array.isArray(parsed.danmaku) && parsed.danmaku.length > 0) {
          const newDm = parsed.danmaku.slice(0, 25).map((d: any) => ({
            user: String(d.user || '路人').slice(0, 8),
            text: String(d.text || '666').slice(0, 50),
          }))
          setApiDanmaku(newDm)
          apiDanmakuIndexRef.current = 0
        }

        if (mode === 'watch' && streamerData?.id && isStreamerFollowed(streamerData.id)) {
          updateFollowedStreamer(streamerData.id, {
            name: streamerData.name,
            avatarUrl: streamerData.avatarUrl,
            avatarGradient: streamerData.avatarGradient,
            coverUrl: streamerData.coverUrl,
            category: streamerData.category,
            title: streamerData.title,
            desc: streamerData.desc,
          })
          updateFollowedStreamerLastSummary(streamerData.id, latestScene.slice(0, 500))
          if (latestScene) {
            appendFollowedStreamerPost(streamerData.id, {
              content: latestScene.slice(0, 240),
              comments: [],
            })
          }
        }

        if (mode === 'host' && latestScene) {
          appendMyLivestreamPost({
            content: latestScene.slice(0, 240),
            comments: [],
          })
        }
        if (hasUserMsg) userMessagesRef.current = []
        if (hasGifts) userGiftsRef.current = []
        hasRefreshedRef.current = true
        setToastMsg('✅ 加载成功，直播内容已更新')
        setTimeout(() => setToastMsg(''), 2500)
      }
    } catch { /* */ } finally {
      window.clearInterval(progressTimer)
      setRefreshProgress(100)
      setTimeout(() => { setRefreshLoading(false); setRefreshProgress(0) }, 500)
    }
  }, [refreshLoading, callLLM, myName, streamerName, streamerTitle, streamerDesc, streamerCategory, displaySceneText, initialSceneText, mode, streamerData, isStreamerFollowed, updateFollowedStreamer, updateFollowedStreamerLastSummary, appendFollowedStreamerPost, appendMyLivestreamPost])

  const handleTapEmpty = (e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button, input, [data-interactive]')) return
    addHeart()
  }

  return (
    <div className="h-full w-full relative overflow-hidden bg-white flex flex-col" onClick={handleTapEmpty}>
      {/* ═══ 全屏背景（封面铺满整屏） ═══ */}
      <div className="absolute inset-0" style={{ background: streamerGradient }}>
        {streamerCoverUrl && (
          <img src={streamerCoverUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/50" />
      </div>

      {/* ═══ 顶部栏 ═══ */}
      <div className="relative z-10 flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center bg-black/30 backdrop-blur-md rounded-full pr-3 pl-0.5 py-0.5 gap-1.5">
          <div
            className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-pink-400/60"
            style={{ background: streamerGradient }}
          >
            {streamerAvatarUrl && (
              <img src={streamerAvatarUrl} alt="" className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            )}
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-white text-[11px] font-semibold">{streamerName}</span>
            <span className="text-white/40 text-[9px]">{Math.floor(viewerCount * 1.5)} 粉丝</span>
          </div>
          {mode === 'watch' && (
            <button type="button" data-interactive onClick={handleToggleFollow}
              className={`ml-1 px-2 py-0.5 rounded-full text-[9px] font-medium ${isFollowed ? 'bg-white/20 text-white/60' : 'bg-pink-500 text-white'}`}
            >{isFollowed ? '已关注' : '关注'}</button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-black/30 backdrop-blur-md rounded-full pl-1 pr-2 py-0.5 gap-1">
            <div className="flex -space-x-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="w-5 h-5 rounded-full border border-black/50 flex items-center justify-center text-[7px] text-white font-bold"
                  style={{ background: USER_COLORS[i] }}>{MOCK_NAMES[i]?.[0]}</div>
              ))}
            </div>
            <span className="text-white/80 text-[10px] ml-0.5">
              {viewerCount > 10000 ? `${(viewerCount / 10000).toFixed(1)}万` : viewerCount}
            </span>
          </div>
          <button type="button" data-interactive onClick={() => navigate('/apps/livestream')}
            className="w-7 h-7 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 开播指示条 */}
      {mode === 'host' && (
        <div className="relative z-10 mx-3 mt-1 flex items-center justify-between">
          <div className="flex items-center gap-1.5 bg-red-500/30 backdrop-blur-md rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-300 text-[10px] font-medium">直播中</span>
          </div>
          <div className="flex items-center gap-1 bg-yellow-500/20 backdrop-blur-md rounded-full px-2.5 py-1 text-yellow-300 text-[10px]">
            🪙 收到 {receivedCoins}
          </div>
        </div>
      )}

      {/* ═══ 中间空白区 ═══ */}
      <div className="relative z-10 flex-1" />

      {/* ═══ 直播画面文字区（10行高，半透明，可滚动） ═══ */}
      {displaySceneText && (
        <div className="relative z-10 mx-3 mb-1.5 flex-shrink-0">
          <div id="scene-text-box" className="bg-black/55 backdrop-blur-sm rounded-xl px-3.5 py-2.5 max-h-[220px] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }} data-interactive>
            <p className="text-white font-medium text-xs leading-[1.9] whitespace-pre-wrap drop-shadow-sm">{displaySceneText}</p>
          </div>
        </div>
      )}

      {/* ═══ 礼物动画 ═══ */}
      <GiftAnimation events={giftEvents} />

      {/* ═══ 飘心动画（最顶层） ═══ */}
      <FloatingHearts hearts={hearts} />

      {/* ═══ 下半屏：简介 → 弹幕 → 底部栏 ═══ */}
      <div className="relative z-10 flex flex-col" style={{ height: '44%' }}>
        {/* 直播简介（在弹幕上方） */}
        <div className="mx-2.5 mb-1 flex-shrink-0">
          <div className="flex items-center bg-black/40 backdrop-blur-sm rounded-xl px-2.5 py-1.5 gap-2" data-interactive>
            <div
              className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 border border-gray-300/40"
              style={{ background: streamerGradient }}
            >
              {streamerAvatarUrl && (
                <img src={streamerAvatarUrl} alt="" className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-[10px] font-medium truncate">{streamerTitle}</div>
              {streamerDesc && <div className="text-white/50 text-[8px] truncate">{streamerDesc}</div>}
            </div>
          </div>
        </div>

        {/* 弹幕区（左侧 ~70% 宽度） */}
        <div className="flex-1 min-h-0 pl-2.5 pr-16">
          <DanmakuLayer messages={danmaku} />
        </div>

        {/* 加载进度条 */}
        {refreshLoading && (
          <div className="mx-2.5 mb-1 flex-shrink-0">
            <div className="bg-black/40 backdrop-blur-sm rounded-full overflow-hidden h-5 flex items-center px-2">
              <div className="h-1.5 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full transition-all duration-300"
                style={{ width: `${refreshProgress}%` }} />
              <span className="text-[9px] text-white/60 ml-2 whitespace-nowrap">网络加载中，正在更新直播间最新状况</span>
            </div>
          </div>
        )}

        {/* ═══ 底部操作栏 ═══ */}
        <div className="flex items-center gap-2 px-2.5 pb-2 pt-1">
          {showInput ? (
            <div className="flex-1 flex items-center bg-black/40 backdrop-blur-sm rounded-full px-3 py-2 border border-white/10">
              <input ref={inputRef} value={inputText} onChange={e => setInputText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSendDanmaku() }}
                onBlur={() => { if (!inputText.trim()) setShowInput(false) }}
                placeholder="说点什么..." autoFocus data-interactive
                className="flex-1 bg-transparent text-white text-xs outline-none placeholder-white/50" />
              <button type="button" data-interactive onClick={handleSendDanmaku}
                className="text-pink-500 text-xs font-medium ml-2">发送</button>
            </div>
          ) : (
            <button type="button" data-interactive
              onClick={() => { setShowInput(true); setTimeout(() => inputRef.current?.focus(), 100) }}
              className="flex-1 flex items-center bg-black/40 backdrop-blur-sm rounded-full px-3 py-2">
              <span className="text-white/40 text-xs">说点什么...</span>
            </button>
          )}

          {/* 播放键（刷新直播内容） */}
          {mode === 'watch' && (
            <button type="button" data-interactive onClick={handleRefreshRoom} disabled={refreshLoading}
              className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform disabled:opacity-50">
              {refreshLoading ? (
                <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          )}

          {mode === 'watch' && (
            <>
              <button type="button" data-interactive onClick={() => setShowGiftPanel(true)}
                className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg active:scale-90 transition-transform">
                <span className="text-base">🎁</span>
              </button>
              <button type="button" data-interactive onClick={() => addHeart('❤️')}
                className="w-9 h-9 rounded-full bg-pink-500/80 flex items-center justify-center active:scale-90 transition-transform">
                <span className="text-base">❤️</span>
              </button>
            </>
          )}

          {mode === 'host' && (
            <button type="button" data-interactive onClick={() => navigate('/apps/livestream')}
              className="px-4 py-2 rounded-full bg-red-500 text-white text-xs font-medium active:bg-red-600">
              结束直播
            </button>
          )}
        </div>
      </div>

      {showGiftPanel && (
        <GiftPanel coins={livestreamCoins} onSend={handleSendGift} onClose={() => setShowGiftPanel(false)} />
      )}

      {/* Toast 提示 */}
      {toastMsg && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-sm text-white text-xs px-4 py-2 rounded-full whitespace-nowrap animate-fadeInUp" style={{ zIndex: 10000 }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
