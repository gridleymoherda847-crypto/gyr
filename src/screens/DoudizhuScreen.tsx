import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Card, PlayResult } from '../utils/doudizhu'
import {
  dealCards,
  sortCards,
  analyzeHand,
  canBeat,
  aiDecide,
  evaluateHandForBidding,
  SUIT_SYMBOLS,
  SUIT_COLORS
} from '../utils/doudizhu'
import { useWeChat } from '../context/WeChatContext'

type GamePhase = 'idle' | 'matching' | 'bidding' | 'playing' | 'ended'
type Player = 0 | 1 | 2

const PLAYER_NAMES = ['我', '电脑A', '电脑B']

// 斗地主金币存储
const DOUDIZHU_STORAGE_KEY = 'doudizhu_stats'

interface DoudizhuStats {
  coins: number
  wins: number
  losses: number
}

const loadStats = (): DoudizhuStats => {
  try {
    const saved = localStorage.getItem(DOUDIZHU_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return { coins: 100, wins: 0, losses: 0 }
}

const saveStats = (stats: DoudizhuStats) => {
  localStorage.setItem(DOUDIZHU_STORAGE_KEY, JSON.stringify(stats))
}

// 音效播放
const playSound = (type: 'start' | 'card' | 'win' | 'lose') => {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    
    if (type === 'start') {
      osc.frequency.value = 523
      gain.gain.value = 0.3
      osc.start()
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1)
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2)
      osc.stop(ctx.currentTime + 0.3)
    } else if (type === 'card') {
      osc.type = 'square'
      osc.frequency.value = 800
      gain.gain.value = 0.15
      osc.start()
      osc.stop(ctx.currentTime + 0.05)
    } else if (type === 'win') {
      osc.frequency.value = 523
      gain.gain.value = 0.3
      osc.start()
      setTimeout(() => { osc.frequency.value = 659 }, 100)
      setTimeout(() => { osc.frequency.value = 784 }, 200)
      setTimeout(() => { osc.frequency.value = 1047 }, 300)
      osc.stop(ctx.currentTime + 0.5)
    } else if (type === 'lose') {
      osc.frequency.value = 400
      gain.gain.value = 0.2
      osc.start()
      setTimeout(() => { osc.frequency.value = 300 }, 150)
      setTimeout(() => { osc.frequency.value = 200 }, 300)
      osc.stop(ctx.currentTime + 0.5)
    }
  } catch {
    // 音频不可用时静默失败
  }
}

// 头像组件 - 放大版
function PlayerAvatar({ 
  avatarUrl,
  isActive, 
  isLandlord,
  isComputer,
  cardCount
}: { 
  avatarUrl?: string
  isActive: boolean
  isLandlord: boolean
  isComputer: boolean
  cardCount: number
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div 
        className="relative w-14 h-14 rounded-full flex items-center justify-center shadow-lg overflow-hidden"
        style={{
          background: isComputer 
            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            : 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
          boxShadow: isActive 
            ? '0 0 0 3px #facc15, 0 0 20px rgba(250, 204, 21, 0.7)' 
            : '0 2px 8px rgba(0,0,0,0.3)',
          animation: isActive ? 'glow 1s ease-in-out infinite alternate' : 'none'
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-white text-xl">{isComputer ? '🤖' : '😊'}</span>
        )}
        {isLandlord && (
          <div className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center shadow text-[10px]">
            👑
          </div>
        )}
      </div>
      <div className="text-white text-[10px] font-medium">{isComputer ? '电脑' : '我'}</div>
      <div className="bg-black/50 rounded px-1.5 py-0.5 text-[10px] text-yellow-300 font-bold">{cardCount}张</div>
    </div>
  )
}

export default function DoudizhuScreen() {
  const navigate = useNavigate()
  const { userPersonas, walletBalance, updateWalletBalance } = useWeChat()
  
  const defaultPersona = userPersonas[0]
  const myAvatarUrl = defaultPersona?.avatar || ''
  
  const [stats, setStats] = useState<DoudizhuStats>(loadStats)
  const [showRecharge, setShowRecharge] = useState(false)
  const [rechargeAmount, setRechargeAmount] = useState(10)
  
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [matchProgress, setMatchProgress] = useState(0)
  const [hands, setHands] = useState<Card[][]>([[], [], []])
  const [dizhuCards, setDizhuCards] = useState<Card[]>([])
  const [landlord, setLandlord] = useState<Player | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player>(0)
  const [lastPlay, setLastPlay] = useState<PlayResult | null>(null)
  const [lastPlayPlayer, setLastPlayPlayer] = useState<Player | null>(null)
  const [passCount, setPassCount] = useState(0)
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set())
  const [winner, setWinner] = useState<'landlord' | 'farmer' | null>(null)
  const [message, setMessage] = useState('')
  const [bidScore, setBidScore] = useState(0)
  const [currentBidder, setCurrentBidder] = useState<Player>(0)
  const [roundPlays, setRoundPlays] = useState<Map<Player, Card[]>>(new Map())
  const [aiThinking, setAiThinking] = useState(false)
  
  const stateRef = useRef({
    phase: 'idle' as GamePhase,
    hands: [[], [], []] as Card[][],
    currentBidder: 0 as Player,
    currentPlayer: 0 as Player,
    bidScore: 0,
    lastPlay: null as PlayResult | null,
    lastPlayPlayer: null as Player | null,
    passCount: 0,
    landlord: null as Player | null,
    dizhuCards: [] as Card[],
    aiThinking: false
  })
  
  useEffect(() => {
    stateRef.current = { phase, hands, currentBidder, currentPlayer, bidScore, lastPlay, lastPlayPlayer, passCount, landlord, dizhuCards, aiThinking }
  }, [phase, hands, currentBidder, currentPlayer, bidScore, lastPlay, lastPlayPlayer, passCount, landlord, dizhuCards, aiThinking])
  
  // 充值
  const handleRecharge = () => {
    if (walletBalance >= rechargeAmount) {
      updateWalletBalance(-rechargeAmount)
      const newStats = { ...stats, coins: stats.coins + rechargeAmount * 10 }
      setStats(newStats)
      saveStats(newStats)
      setShowRecharge(false)
    }
  }
  
  // 匹配进度条动画
  useEffect(() => {
    if (phase !== 'matching') return
    
    const interval = setInterval(() => {
      setMatchProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          return 100
        }
        return prev + 5
      })
    }, 100)
    
    return () => clearInterval(interval)
  }, [phase])
  
  // 匹配完成后开始游戏
  useEffect(() => {
    if (phase === 'matching' && matchProgress >= 100) {
      setTimeout(() => {
        const { hands: newHands, dizhu } = dealCards()
        setHands(newHands)
        setDizhuCards(dizhu)
        setPhase('bidding')
      }, 300)
    }
  }, [phase, matchProgress])
  
  const startGame = () => {
    playSound('start')
    setMatchProgress(0)
    setLandlord(null)
    setCurrentPlayer(0)
    setLastPlay(null)
    setLastPlayPlayer(null)
    setPassCount(0)
    setSelectedCards(new Set())
    setRoundPlays(new Map())
    setWinner(null)
    setMessage('')
    setBidScore(0)
    setCurrentBidder(0)
    setAiThinking(false)
    setPhase('matching')
  }
  
  useEffect(() => {
    if (phase !== 'bidding') return
    
    const interval = setInterval(() => {
      const s = stateRef.current
      if (s.phase !== 'bidding' || s.currentBidder === 0 || s.aiThinking) return
      
      setAiThinking(true)
      setMessage(`${PLAYER_NAMES[s.currentBidder]} 思考中...`)
      
      const thinkTime = 2000 + Math.random() * 2000
      
      setTimeout(() => {
        const handScore = evaluateHandForBidding(stateRef.current.hands[stateRef.current.currentBidder])
        let bid = 0
        if (handScore >= 18 && stateRef.current.bidScore < 3) bid = 3
        else if (handScore >= 12 && stateRef.current.bidScore < 2) bid = 2
        else if (handScore >= 8 && stateRef.current.bidScore < 1) bid = 1
        
        const bidderName = PLAYER_NAMES[stateRef.current.currentBidder]
        if (bid > stateRef.current.bidScore) {
          setMessage(`${bidderName}叫${bid}分`)
          setBidScore(bid)
          setLandlord(stateRef.current.currentBidder)
        } else {
          setMessage(`${bidderName}不叫`)
        }
        
        const nextBidder = ((stateRef.current.currentBidder + 1) % 3) as Player
        
        setTimeout(() => {
          setMessage('')
          setAiThinking(false)
          
          if (bid === 3) {
            finishBidding(stateRef.current.currentBidder)
          } else if (nextBidder === 0) {
            const finalLandlord = stateRef.current.landlord ?? 0
            finishBidding(finalLandlord)
          } else {
            setCurrentBidder(nextBidder)
          }
        }, 1000)
      }, thinkTime)
      
    }, 500)
    
    return () => clearInterval(interval)
  }, [phase])
  
  const finishBidding = (finalLandlord: Player) => {
    const s = stateRef.current
    setLandlord(finalLandlord)
    
    const newHands = [...s.hands]
    newHands[finalLandlord] = sortCards([...newHands[finalLandlord], ...s.dizhuCards])
    setHands(newHands)
    
    setCurrentPlayer(finalLandlord)
    setMessage(`${PLAYER_NAMES[finalLandlord]}是地主！`)
    
    setTimeout(() => {
      setMessage('')
      setPhase('playing')
    }, 1500)
  }
  
  const handleBid = (score: number) => {
    playSound('card')
    if (score > bidScore) {
      setBidScore(score)
      setLandlord(0)
      setMessage(`我叫${score}分`)
    } else {
      setMessage('我不叫')
    }
    
    setTimeout(() => {
      setMessage('')
      if (score === 3) {
        finishBidding(0)
      } else {
        setCurrentBidder(1)
      }
    }, 800)
  }
  
  const toggleCard = (cardId: string) => {
    if (phase !== 'playing' || currentPlayer !== 0) return
    setSelectedCards(prev => {
      const newSet = new Set(prev)
      if (newSet.has(cardId)) newSet.delete(cardId)
      else newSet.add(cardId)
      return newSet
    })
  }
  
  const doPlayCards = useCallback((player: Player, cards: Card[]) => {
    if (cards.length > 0) playSound('card')
    
    setRoundPlays(prev => new Map(prev).set(player, cards))
    
    if (cards.length === 0) {
      const newPassCount = stateRef.current.passCount + 1
      setPassCount(newPassCount)
      
      if (newPassCount >= 2) {
        setLastPlay(null)
        setLastPlayPlayer(null)
        setPassCount(0)
        setRoundPlays(new Map())
      }
    } else {
      const result = analyzeHand(cards)
      setLastPlay(result)
      setLastPlayPlayer(player)
      setPassCount(0)
      
      const newHands = [...stateRef.current.hands]
      const cardIds = new Set(cards.map(c => c.id))
      newHands[player] = newHands[player].filter(c => !cardIds.has(c.id))
      setHands(newHands)
      
      if (newHands[player].length === 0) {
        const isWin = (player === 0 && player === stateRef.current.landlord) || 
                      (player !== 0 && stateRef.current.landlord !== 0) ||
                      (player === 0 && stateRef.current.landlord !== 0)
        playSound(isWin ? 'win' : 'lose')
        setWinner(player === stateRef.current.landlord ? 'landlord' : 'farmer')
        
        // 更新统计
        setStats(prev => {
          const newStats = {
            ...prev,
            wins: isWin ? prev.wins + 1 : prev.wins,
            losses: isWin ? prev.losses : prev.losses + 1,
            coins: isWin ? prev.coins + 10 : Math.max(0, prev.coins - 5)
          }
          saveStats(newStats)
          return newStats
        })
        
        setPhase('ended')
        return
      }
    }
    
    setCurrentPlayer(((player + 1) % 3) as Player)
    setSelectedCards(new Set())
    setAiThinking(false)
  }, [])
  
  const handlePlay = () => {
    const cards = hands[0].filter(c => selectedCards.has(c.id))
    
    if (cards.length === 0) {
      if (lastPlayPlayer !== 0 && lastPlayPlayer !== null) {
        doPlayCards(0, [])
      }
      return
    }
    
    const result = analyzeHand(cards)
    if (result.type === 'invalid') {
      setMessage('无效牌型！')
      setTimeout(() => setMessage(''), 1000)
      return
    }
    
    const needToBeat = lastPlayPlayer !== null && lastPlayPlayer !== 0
    if (needToBeat && !canBeat(result, lastPlay)) {
      setMessage('打不过上家！')
      setTimeout(() => setMessage(''), 1000)
      return
    }
    
    doPlayCards(0, cards)
  }
  
  const handlePass = () => {
    if (lastPlayPlayer === 0 || lastPlayPlayer === null) {
      setMessage('必须出牌！')
      setTimeout(() => setMessage(''), 1000)
      return
    }
    doPlayCards(0, [])
  }
  
  const handleHint = () => {
    const needToBeat = lastPlayPlayer !== null && lastPlayPlayer !== 0
    for (let i = hands[0].length - 1; i >= 0; i--) {
      const card = hands[0][i]
      const result = analyzeHand([card])
      if (needToBeat ? canBeat(result, lastPlay) : result.type !== 'invalid') {
        setSelectedCards(new Set([card.id]))
        return
      }
    }
  }
  
  useEffect(() => {
    if (phase !== 'playing') return
    
    const interval = setInterval(() => {
      const s = stateRef.current
      if (s.phase !== 'playing' || s.currentPlayer === 0 || s.aiThinking) return
      
      setAiThinking(true)
      setMessage(`${PLAYER_NAMES[s.currentPlayer]} 思考中...`)
      
      const thinkTime = 2000 + Math.random() * 3000
      
      setTimeout(() => {
        const player = stateRef.current.currentPlayer
        const needToBeat = stateRef.current.lastPlayPlayer !== null && stateRef.current.lastPlayPlayer !== player
        const cards = aiDecide(stateRef.current.hands[player], needToBeat ? stateRef.current.lastPlay : null, player === stateRef.current.landlord, 'normal')
        
        setMessage('')
        doPlayCards(player, cards || [])
      }, thinkTime)
      
    }, 500)
    
    return () => clearInterval(interval)
  }, [phase, doPlayCards])
  
  // 渲染单张牌 - 左上角+右下角设计，大小王特殊处理
  const renderFanCard = (card: Card, index: number, isSelected: boolean, onClick?: () => void) => {
    const isJoker = card.suit === 'joker'
    const isBigJoker = card.rank === 17
    
    // 大王金色，小王银灰色
    const jokerColor = isBigJoker ? '#DAA520' : '#708090'
    const color = isJoker ? jokerColor : SUIT_COLORS[card.suit]
    
    // 每张牌露出30px
    const offset = index * 30
    
    return (
      <div
        key={card.id}
        onClick={onClick}
        className={`absolute w-14 h-[76px] bg-white rounded-lg shadow-lg border border-gray-300 
          ${onClick ? 'cursor-pointer active:scale-95' : ''} transition-all duration-150`}
        style={{ 
          left: `${offset}px`,
          transform: isSelected ? 'translateY(-14px)' : 'translateY(0)',
          zIndex: index
        }}
      >
        {isJoker ? (
          <>
            {/* 左上角 */}
            <div className="absolute top-1 left-1.5 flex flex-col items-center leading-none" style={{ color: jokerColor }}>
              <span className="text-base font-bold">王</span>
            </div>
            {/* 右下角（倒置） */}
            <div className="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180" style={{ color: jokerColor }}>
              <span className="text-base font-bold">王</span>
            </div>
            {/* 中间标识 */}
            <div className="absolute inset-0 flex items-center justify-center" style={{ color: jokerColor }}>
              <span className="text-[10px] font-bold">{isBigJoker ? '大' : '小'}</span>
            </div>
          </>
        ) : (
          <>
            {/* 左上角 */}
            <div className="absolute top-1 left-1.5 flex flex-col items-center leading-none" style={{ color }}>
              <span className="text-base font-bold">{card.display}</span>
              <span className="text-xs">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
            {/* 右下角（倒置） */}
            <div className="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180" style={{ color }}>
              <span className="text-base font-bold">{card.display}</span>
              <span className="text-xs">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
          </>
        )}
      </div>
    )
  }
  
  // 渲染出的牌 - 放大版
  const renderPlayedCards = (player: Player) => {
    const cards = roundPlays.get(player)
    if (cards === undefined) return null
    if (cards.length === 0) return <div className="text-yellow-300 text-sm bg-black/50 px-3 py-1.5 rounded">不出</div>
    
    const totalWidth = (cards.length - 1) * 28 + 56
    return (
      <div className="relative" style={{ width: `${totalWidth}px`, height: '72px' }}>
        {cards.map((card, i) => {
          const isJoker = card.suit === 'joker'
          const isBigJoker = card.rank === 17
          const jokerColor = isBigJoker ? '#DAA520' : '#708090'
          const color = isJoker ? jokerColor : SUIT_COLORS[card.suit]
          return (
            <div
              key={card.id}
              className="absolute w-14 h-[72px] bg-white rounded-lg shadow border border-gray-300"
              style={{ left: `${i * 28}px`, zIndex: i }}
            >
              {isJoker ? (
                <>
                  <div className="absolute top-1 left-1.5 flex flex-col items-center leading-none" style={{ color: jokerColor }}>
                    <span className="text-base font-bold">王</span>
                  </div>
                  <div className="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180" style={{ color: jokerColor }}>
                    <span className="text-base font-bold">王</span>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center" style={{ color: jokerColor }}>
                    <span className="text-[10px] font-bold">{isBigJoker ? '大' : '小'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="absolute top-1 left-1.5 flex flex-col items-center leading-none" style={{ color }}>
                    <span className="text-sm font-bold">{card.display}</span>
                    <span className="text-[10px]">{SUIT_SYMBOLS[card.suit]}</span>
                  </div>
                  <div className="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180" style={{ color }}>
                    <span className="text-sm font-bold">{card.display}</span>
                    <span className="text-[10px]">{SUIT_SYMBOLS[card.suit]}</span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  }
  
  // 渲染底牌小牌
  const renderSmallCard = (card: Card) => {
    const isJoker = card.suit === 'joker'
    const isBigJoker = card.rank === 17
    const jokerColor = isBigJoker ? '#DAA520' : '#708090'
    const color = isJoker ? jokerColor : SUIT_COLORS[card.suit]
    return (
      <div
        key={card.id}
        className="w-8 h-11 bg-white rounded shadow border border-gray-300 relative"
      >
        {isJoker ? (
          <div className="absolute top-0.5 left-1 flex flex-col items-center leading-none" style={{ color: jokerColor }}>
            <span className="text-xs font-bold">王</span>
          </div>
        ) : (
          <div className="absolute top-0.5 left-1 flex flex-col items-center leading-none" style={{ color }}>
            <span className="text-xs font-bold">{card.display}</span>
            <span className="text-[8px]">{SUIT_SYMBOLS[card.suit]}</span>
          </div>
        )}
      </div>
    )
  }

  // 计算手牌容器宽度
  const handWidth = hands[0].length > 0 ? (hands[0].length - 1) * 30 + 56 : 0

  // 游戏进行中的界面
  const isInGame = phase === 'bidding' || phase === 'playing'

  return (
    <div 
      className="flex flex-col h-full bg-gradient-to-br from-emerald-900 via-green-800 to-green-900 overflow-hidden relative"
      style={{ 
        transform: 'rotate(90deg)',
        transformOrigin: 'center center',
        width: '100vh',
        height: '100vw',
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: '-50vw',
        marginLeft: '-50vh'
      }}
    >
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-3 py-1 bg-black/40 flex-shrink-0">
        <button onClick={() => navigate(-1)} className="text-white/80 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-white font-bold text-sm">🃏 欢乐斗地主</h1>
        
        {/* 右上角：金币、战绩、充值 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-black/30 rounded px-2 py-0.5">
            <span className="text-yellow-400 text-xs">💰</span>
            <span className="text-yellow-300 text-xs font-bold">{stats.coins}</span>
          </div>
          <div className="flex items-center gap-1 bg-black/30 rounded px-2 py-0.5">
            <span className="text-green-400 text-[10px]">胜{stats.wins}</span>
            <span className="text-red-400 text-[10px]">负{stats.losses}</span>
          </div>
          <button 
            onClick={() => setShowRecharge(true)}
            className="bg-yellow-500 text-white text-[10px] px-2 py-0.5 rounded font-medium active:scale-95"
          >
            充值
          </button>
        </div>
      </div>
      
      {/* 充值弹窗 */}
      {showRecharge && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-4 w-64 shadow-2xl">
            <h3 className="text-center font-bold text-lg mb-3">💰 金币充值</h3>
            <p className="text-center text-gray-500 text-xs mb-3">1元 = 10金币</p>
            <p className="text-center text-sm mb-2">钱包余额: <span className="text-green-600 font-bold">¥{walletBalance}</span></p>
            
            <div className="flex gap-2 justify-center mb-3">
              {[10, 50, 100].map(amount => (
                <button
                  key={amount}
                  onClick={() => setRechargeAmount(amount)}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${rechargeAmount === amount ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  ¥{amount}
                </button>
              ))}
            </div>
            
            <p className="text-center text-sm mb-3">
              可获得 <span className="text-yellow-600 font-bold">{rechargeAmount * 10}</span> 金币
            </p>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setShowRecharge(false)}
                className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
              >
                取消
              </button>
              <button 
                onClick={handleRecharge}
                disabled={walletBalance < rechargeAmount}
                className="flex-1 py-2 bg-yellow-500 text-white rounded-lg text-sm font-bold disabled:opacity-50"
              >
                确认充值
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 消息 */}
      {message && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-black/85 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-2xl">
          {message}
        </div>
      )}
      
      {/* 开始界面 */}
      {phase === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="text-5xl">🃏</div>
          <h2 className="text-white text-xl font-bold">欢乐斗地主</h2>
          <p className="text-white/60 text-xs">单机模式 · 不消耗API</p>
          <button onClick={startGame} className="px-6 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full text-base shadow-xl active:scale-95 transition-transform">
            开始游戏
          </button>
        </div>
      )}
      
      {/* 匹配中 */}
      {phase === 'matching' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-4xl animate-bounce">🔍</div>
          <h2 className="text-white text-lg font-bold">正在匹配对手...</h2>
          <div className="w-48 h-2 bg-black/30 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-100"
              style={{ width: `${matchProgress}%` }}
            />
          </div>
          <p className="text-white/60 text-xs">
            {matchProgress < 30 ? '搜索玩家中...' : matchProgress < 70 ? '匹配到电脑A' : '匹配到电脑B'}
          </p>
        </div>
      )}
      
      {/* 游戏中布局 - 电脑在左上角和右上角 */}
      {isInGame && (
        <div className="flex-1 flex flex-col relative">
          {/* 左上角电脑B */}
          <div className="absolute top-1 left-2 z-10">
            <PlayerAvatar 
              avatarUrl="" 
              isActive={phase === 'bidding' ? currentBidder === 2 : currentPlayer === 2} 
              isLandlord={landlord === 2} 
              isComputer={true} 
              cardCount={hands[2].length} 
            />
          </div>
          
          {/* 右上角电脑A */}
          <div className="absolute top-1 right-2 z-10">
            <PlayerAvatar 
              avatarUrl="" 
              isActive={phase === 'bidding' ? currentBidder === 1 : currentPlayer === 1} 
              isLandlord={landlord === 1} 
              isComputer={true} 
              cardCount={hands[1].length} 
            />
          </div>
          
          {/* 中间区域 */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {phase === 'bidding' && (
              <>
                <div className="text-white/70 text-xs mb-1">底牌</div>
                <div className="flex gap-1 mb-3">
                  {dizhuCards.map(card => <div key={card.id} className="w-9 h-12 bg-gradient-to-br from-pink-300 to-pink-400 rounded border-2 border-pink-200 shadow-lg" />)}
                </div>
                
                {currentBidder === 0 && !aiThinking && (
                  <div className="flex gap-2">
                    <button onClick={() => handleBid(0)} className="px-4 py-1.5 bg-gray-600 text-white rounded-lg text-sm font-medium active:scale-95">不叫</button>
                    {bidScore < 1 && <button onClick={() => handleBid(1)} className="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium active:scale-95">1分</button>}
                    {bidScore < 2 && <button onClick={() => handleBid(2)} className="px-4 py-1.5 bg-purple-500 text-white rounded-lg text-sm font-medium active:scale-95">2分</button>}
                    {bidScore < 3 && <button onClick={() => handleBid(3)} className="px-4 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-medium active:scale-95">3分</button>}
                  </div>
                )}
              </>
            )}
            
            {phase === 'playing' && (
              <>
                {/* 底牌显示 */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 flex gap-0.5 items-center">
                  <span className="text-white/50 text-[9px] mr-0.5">底牌:</span>
                  {dizhuCards.map(card => renderSmallCard(card))}
                </div>
                
                {/* 出牌区域 */}
                <div className="flex flex-col items-center gap-2">
                  {/* 电脑出的牌 */}
                  <div className="flex gap-10 justify-center">
                    <div className="min-w-[100px] flex justify-center">
                      {renderPlayedCards(2)}
                    </div>
                    <div className="min-w-[100px] flex justify-center">
                      {renderPlayedCards(1)}
                    </div>
                  </div>
                  
                  {/* 我出的牌 */}
                  <div className="min-h-[72px] flex items-center justify-center">
                    {renderPlayedCards(0)}
                  </div>
                </div>
              </>
            )}
          </div>
          
          {/* 下方：操作按钮 + 手牌 + 头像 */}
          <div className="flex-shrink-0">
            {/* 操作按钮 */}
            {phase === 'playing' && currentPlayer === 0 && !aiThinking && (
              <div className="flex justify-center gap-2 mb-1">
                <button onClick={handleHint} className="px-4 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium active:scale-95">提示</button>
                <button onClick={handlePass} disabled={lastPlayPlayer === 0 || lastPlayPlayer === null} className="px-4 py-1.5 bg-gray-600 text-white rounded-lg text-sm font-medium active:scale-95 disabled:opacity-40">不出</button>
                <button onClick={handlePlay} className="px-5 py-1.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg text-sm font-bold active:scale-95">出牌</button>
              </div>
            )}
            
            {phase === 'playing' && currentPlayer !== 0 && (
              <div className="text-center text-white/70 text-xs mb-1">等待对方出牌...</div>
            )}
            
            {/* 手牌和头像 */}
            <div className="h-[100px] flex items-center px-3 pb-1">
              <div className="mr-3">
                <PlayerAvatar 
                  avatarUrl={myAvatarUrl}
                  isActive={phase === 'bidding' ? currentBidder === 0 : currentPlayer === 0} 
                  isLandlord={landlord === 0} 
                  isComputer={false} 
                  cardCount={hands[0].length}
                />
              </div>
              <div className="flex-1 flex justify-center overflow-x-auto">
                <div className="relative" style={{ width: `${handWidth}px`, height: '76px' }}>
                  {hands[0].map((card, i) => renderFanCard(card, i, selectedCards.has(card.id), () => toggleCard(card.id)))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 结束 */}
      {phase === 'ended' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="text-5xl">{winner === 'landlord' ? (landlord === 0 ? '🎉' : '😢') : (landlord === 0 ? '😢' : '🎉')}</div>
          <h2 className="text-white text-xl font-bold">
            {winner === 'landlord' ? (landlord === 0 ? '恭喜你赢了！' : '地主获胜') : (landlord === 0 ? '农民获胜' : '恭喜你赢了！')}
          </h2>
          <p className="text-yellow-300 text-sm">
            {(winner === 'landlord' && landlord === 0) || (winner === 'farmer' && landlord !== 0) 
              ? '+10 金币' 
              : '-5 金币'}
          </p>
          <button onClick={startGame} className="px-6 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full text-base shadow-xl active:scale-95 transition-transform">再来一局</button>
          <button onClick={() => navigate(-1)} className="text-white/70 underline text-sm">返回</button>
        </div>
      )}
      
      <style>{`
        @keyframes glow {
          from { box-shadow: 0 0 0 3px #facc15, 0 0 15px rgba(250, 204, 21, 0.5); }
          to { box-shadow: 0 0 0 5px #facc15, 0 0 30px rgba(250, 204, 21, 0.8); }
        }
      `}</style>
    </div>
  )
}
