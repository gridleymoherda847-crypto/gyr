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

type GamePhase = 'idle' | 'matching' | 'selectBase' | 'bidding' | 'playing' | 'ended'
type Player = 0 | 1 | 2

const PLAYER_NAMES = ['我', '电脑A', '电脑B']
const DOUDIZHU_STORAGE_KEY = 'doudizhu_stats'

interface DoudizhuStats {
  coins: number
  wins: number
  losses: number
}

interface GameResult {
  playerCoins: [number, number, number]
  bombCount: number
  multiplier: number
  baseScore: number
  bidScore: number
}

const loadStats = (): DoudizhuStats => {
  try {
    const saved = localStorage.getItem(DOUDIZHU_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return { coins: 1000, wins: 0, losses: 0 }
}

const saveStats = (stats: DoudizhuStats) => {
  localStorage.setItem(DOUDIZHU_STORAGE_KEY, JSON.stringify(stats))
}

const playSound = (type: 'start' | 'card' | 'win' | 'lose' | 'coin') => {
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
    } else if (type === 'coin') {
      // 充值成功音效 - 金币叮当声
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.value = 0.25
      osc.start()
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.2)
      osc.stop(ctx.currentTime + 0.35)
    }
  } catch {}
}

// 头像组件
function PlayerAvatar({ 
  avatarUrl,
  isActive, 
  isLandlord,
  isComputer,
  cardCount,
  coins,
  name
}: { 
  avatarUrl?: string
  isActive: boolean
  isLandlord: boolean
  isComputer: boolean
  cardCount: number
  coins?: number
  name: string
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center gap-1">
        {isLandlord && (
          <div className="bg-gradient-to-r from-amber-400 to-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold shadow-lg border border-yellow-300">
            👑地主
          </div>
        )}
        <div 
          className="relative w-12 h-12 rounded-full flex items-center justify-center shadow-xl overflow-hidden border-2"
          style={{
            background: isComputer 
              ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
              : 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)',
            borderColor: isActive ? '#fbbf24' : 'rgba(255,255,255,0.3)',
            boxShadow: isActive 
              ? '0 0 0 3px #fbbf24, 0 0 20px rgba(251, 191, 36, 0.6)' 
              : '0 4px 12px rgba(0,0,0,0.3)',
            animation: isActive ? 'glow 1s ease-in-out infinite alternate' : 'none'
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white text-xl">{isComputer ? '🤖' : '😊'}</span>
          )}
        </div>
      </div>
      <div className="text-white text-[11px] font-medium drop-shadow">{name}</div>
      <div className="bg-black/60 backdrop-blur rounded-full px-2 py-0.5 text-[10px] text-white font-bold">{cardCount}张</div>
      {coins !== undefined && (
        <div className="bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full px-2 py-0.5 text-[9px] text-white font-bold shadow">💰{coins}</div>
      )}
    </div>
  )
}

export default function DoudizhuScreen() {
  const navigate = useNavigate()
  const { userPersonas, walletBalance, updateWalletBalance, addWalletBill } = useWeChat()
  
  const defaultPersona = userPersonas[0]
  const myAvatarUrl = defaultPersona?.avatar || ''
  
  const [stats, setStats] = useState<DoudizhuStats>(loadStats)
  const [showRecharge, setShowRecharge] = useState(false)
  const [rechargeAmount, setRechargeAmount] = useState(10)
  const [showRechargeSuccess, setShowRechargeSuccess] = useState(false)
  
  const [phase, setPhase] = useState<GamePhase>('idle')
  const [matchProgress, setMatchProgress] = useState(0)
  const [baseScore, setBaseScore] = useState(100)
  const [hands, setHands] = useState<Card[][]>([[], [], []])
  const [dizhuCards, setDizhuCards] = useState<Card[]>([])
  const [landlord, setLandlord] = useState<Player | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<Player>(0)
  const [lastPlay, setLastPlay] = useState<PlayResult | null>(null)
  const [lastPlayPlayer, setLastPlayPlayer] = useState<Player | null>(null)
  const [passCount, setPassCount] = useState(0)
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [bidScore, setBidScore] = useState(0)
  const [currentBidder, setCurrentBidder] = useState<Player>(0)
  const [bidRound, setBidRound] = useState(0) // 叫地主轮数
  const [playedCards, setPlayedCards] = useState<Map<Player, Card[]>>(new Map())
  const [aiThinking, setAiThinking] = useState(false)
  const [bombCount, setBombCount] = useState(0)
  const [aiCoins, setAiCoins] = useState<[number, number]>([0, 0])
  const [gameResult, setGameResult] = useState<GameResult | null>(null)
  
  const stateRef = useRef({
    phase: 'idle' as GamePhase,
    hands: [[], [], []] as Card[][],
    currentBidder: 0 as Player,
    currentPlayer: 0 as Player,
    bidScore: 0,
    bidRound: 0,
    lastPlay: null as PlayResult | null,
    lastPlayPlayer: null as Player | null,
    passCount: 0,
    landlord: null as Player | null,
    dizhuCards: [] as Card[],
    aiThinking: false,
    bombCount: 0,
    baseScore: 100
  })
  
  useEffect(() => {
    stateRef.current = { phase, hands, currentBidder, currentPlayer, bidScore, bidRound, lastPlay, lastPlayPlayer, passCount, landlord, dizhuCards, aiThinking, bombCount, baseScore }
  }, [phase, hands, currentBidder, currentPlayer, bidScore, bidRound, lastPlay, lastPlayPlayer, passCount, landlord, dizhuCards, aiThinking, bombCount, baseScore])
  
  const handleRecharge = () => {
    if (walletBalance >= rechargeAmount) {
      updateWalletBalance(-rechargeAmount)
      // 添加账单记录
      addWalletBill({
        type: 'shopping',
        amount: rechargeAmount,
        description: '斗地主金币充值'
      })
      const newStats = { ...stats, coins: stats.coins + rechargeAmount * 10 }
      setStats(newStats)
      saveStats(newStats)
      setShowRecharge(false)
      // 播放充值成功音效
      playSound('coin')
      setShowRechargeSuccess(true)
      setTimeout(() => setShowRechargeSuccess(false), 2000)
    }
  }
  
  useEffect(() => {
    if (phase !== 'matching') return
    const interval = setInterval(() => {
      setMatchProgress(prev => {
        if (prev >= 100) { clearInterval(interval); return 100 }
        return prev + 5
      })
    }, 100)
    return () => clearInterval(interval)
  }, [phase])
  
  useEffect(() => {
    if (phase === 'matching' && matchProgress >= 100) {
      setAiCoins([
        2000 + Math.floor(Math.random() * 8000),
        2000 + Math.floor(Math.random() * 8000)
      ])
      setTimeout(() => setPhase('selectBase'), 300)
    }
  }, [phase, matchProgress])
  
  const startGame = () => {
    if (stats.coins < 1000) { setShowRecharge(true); return }
    playSound('start')
    setMatchProgress(0)
    setPhase('matching')
  }
  
  const startBidding = (base: number) => {
    setBaseScore(base)
    const { hands: newHands, dizhu } = dealCards()
    setHands(newHands)
    setDizhuCards(dizhu)
    setLandlord(null)
    setCurrentPlayer(0)
    setLastPlay(null)
    setLastPlayPlayer(null)
    setPassCount(0)
    setSelectedCards(new Set())
    setPlayedCards(new Map())
    setMessage('')
    setBidScore(0)
    setCurrentBidder(0)
    setBidRound(0)
    setAiThinking(false)
    setBombCount(0)
    setGameResult(null)
    setPhase('bidding')
  }
  
  // 叫地主逻辑 - 只叫一轮
  useEffect(() => {
    if (phase !== 'bidding') return
    const interval = setInterval(() => {
      const s = stateRef.current
      if (s.phase !== 'bidding' || s.currentBidder === 0 || s.aiThinking) return
      if (s.bidRound >= 3) return // 已经叫完一轮
      
      setAiThinking(true)
      setMessage(`${PLAYER_NAMES[s.currentBidder]} 思考中...`)
      
      // AI思考时间 1-3秒
      const thinkTime = 1000 + Math.random() * 2000
      setTimeout(() => {
        const currentState = stateRef.current
        const handScore = evaluateHandForBidding(currentState.hands[currentState.currentBidder])
        let bid = 0
        
        // 根据手牌强度决定是否叫地主
        if (handScore >= 16 && currentState.bidScore < 3) bid = 3
        else if (handScore >= 12 && currentState.bidScore < 2) bid = Math.max(currentState.bidScore + 1, 2)
        else if (handScore >= 8 && currentState.bidScore < 1) bid = 1
        
        const bidderName = PLAYER_NAMES[currentState.currentBidder]
        if (bid > currentState.bidScore) {
          setMessage(`${bidderName}叫${bid}分`)
          setBidScore(bid)
          setLandlord(currentState.currentBidder)
        } else {
          setMessage(`${bidderName}不叫`)
        }
        
        const newBidRound = currentState.bidRound + 1
        setBidRound(newBidRound)
        
        setTimeout(() => {
          setMessage('')
          setAiThinking(false)
          
          // 如果叫了3分，直接结束
          if (bid === 3) {
            finishBidding(currentState.currentBidder)
          } 
          // 如果已经叫完一轮（3人都叫过）
          else if (newBidRound >= 3) {
            // 有人叫分就确定地主
            if (stateRef.current.landlord !== null) {
              finishBidding(stateRef.current.landlord)
            } else {
              // 没人叫分，随机选一个
              const randomLandlord = Math.floor(Math.random() * 3) as Player
              setBidScore(1)
              setLandlord(randomLandlord)
              finishBidding(randomLandlord)
            }
          } else {
            // 继续下一个人叫
            setCurrentBidder(((currentState.currentBidder + 1) % 3) as Player)
          }
        }, 800)
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
    setTimeout(() => { setMessage(''); setPhase('playing') }, 1500)
  }
  
  const handleBid = (score: number) => {
    playSound('card')
    const newBidRound = bidRound + 1
    setBidRound(newBidRound)
    
    if (score > bidScore) {
      setBidScore(score)
      setLandlord(0)
      setMessage(`我叫${score}分`)
    } else {
      setMessage('我不叫')
    }
    
    setTimeout(() => {
      setMessage('')
      // 叫了3分直接结束
      if (score === 3) {
        finishBidding(0)
      } 
      // 如果已经叫完一轮
      else if (newBidRound >= 3) {
        if (stateRef.current.landlord !== null) {
          finishBidding(stateRef.current.landlord)
        } else {
          // 没人叫分，随机选一个
          const randomLandlord = Math.floor(Math.random() * 3) as Player
          setBidScore(1)
          setLandlord(randomLandlord)
          finishBidding(randomLandlord)
        }
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
  
  const calculateResult = (winnerSide: 'landlord' | 'farmer', finalBombCount: number) => {
    const s = stateRef.current
    const multiplier = Math.pow(2, finalBombCount)
    const totalScore = s.baseScore * (s.bidScore || 1) * multiplier
    const playerCoins: [number, number, number] = [0, 0, 0]
    const landlordIdx = s.landlord ?? 0
    
    if (winnerSide === 'landlord') {
      const farmerIndices = [0, 1, 2].filter(i => i !== landlordIdx) as Player[]
      farmerIndices.forEach(fi => {
        const farmerCoins = fi === 0 ? stats.coins : aiCoins[fi - 1]
        const actualLoss = Math.min(totalScore, farmerCoins)
        playerCoins[fi] = -actualLoss
        playerCoins[landlordIdx] += actualLoss
      })
    } else {
      const landlordCoins = landlordIdx === 0 ? stats.coins : aiCoins[landlordIdx - 1]
      const farmerIndices = [0, 1, 2].filter(i => i !== landlordIdx) as Player[]
      let totalLandlordLoss = 0
      farmerIndices.forEach(() => { totalLandlordLoss += totalScore })
      const actualTotalLoss = Math.min(totalLandlordLoss, landlordCoins)
      playerCoins[landlordIdx] = -actualTotalLoss
      const perFarmer = Math.floor(actualTotalLoss / 2)
      farmerIndices.forEach(fi => { playerCoins[fi] = perFarmer })
    }
    
    return { playerCoins, bombCount: finalBombCount, multiplier, baseScore: s.baseScore, bidScore: s.bidScore || 1 }
  }
  
  const doPlayCards = useCallback((player: Player, cards: Card[]) => {
    if (cards.length > 0) playSound('card')
    
    // 更新出牌记录
    setPlayedCards(prev => {
      const newMap = new Map(prev)
      newMap.set(player, cards)
      return newMap
    })
    
    // 轮到玩家时，清除玩家上一轮的牌
    if (player === 0) {
      setPlayedCards(prev => {
        const newMap = new Map(prev)
        newMap.delete(0)
        newMap.set(player, cards)
        return newMap
      })
    }
    
    let newBombCount = stateRef.current.bombCount
    
    if (cards.length === 0) {
      const newPassCount = stateRef.current.passCount + 1
      setPassCount(newPassCount)
      if (newPassCount >= 2) {
        setLastPlay(null)
        setLastPlayPlayer(null)
        setPassCount(0)
        setPlayedCards(new Map())
      }
    } else {
      const result = analyzeHand(cards)
      if (result.type === 'bomb' || result.type === 'rocket') {
        newBombCount++
        setBombCount(newBombCount)
      }
      setLastPlay(result)
      setLastPlayPlayer(player)
      setPassCount(0)
      
      const newHands = [...stateRef.current.hands]
      const cardIds = new Set(cards.map(c => c.id))
      newHands[player] = newHands[player].filter(c => !cardIds.has(c.id))
      setHands(newHands)
      
      if (newHands[player].length === 0) {
        const winnerSide = player === stateRef.current.landlord ? 'landlord' : 'farmer'
        const isWin = (player === 0 && player === stateRef.current.landlord) || 
                      (player !== 0 && stateRef.current.landlord !== 0) ||
                      (player === 0 && stateRef.current.landlord !== 0)
        playSound(isWin ? 'win' : 'lose')
        
        const result = calculateResult(winnerSide, newBombCount)
        setGameResult(result)
        
        const myChange = result.playerCoins[0]
        setStats(prev => {
          const newStats = {
            coins: Math.max(0, prev.coins + myChange),
            wins: isWin ? prev.wins + 1 : prev.wins,
            losses: isWin ? prev.losses : prev.losses + 1
          }
          saveStats(newStats)
          return newStats
        })
        
        setAiCoins(prev => [
          Math.max(0, prev[0] + result.playerCoins[1]),
          Math.max(0, prev[1] + result.playerCoins[2])
        ])
        
        setPhase('ended')
        return
      }
    }
    
    setCurrentPlayer(((player + 1) % 3) as Player)
    setSelectedCards(new Set())
    setAiThinking(false)
  }, [stats.coins, aiCoins])
  
  const handlePlay = () => {
    const cards = hands[0].filter(c => selectedCards.has(c.id))
    if (cards.length === 0) {
      if (lastPlayPlayer !== 0 && lastPlayPlayer !== null) doPlayCards(0, [])
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
  
  // AI出牌逻辑
  useEffect(() => {
    if (phase !== 'playing') return
    const interval = setInterval(() => {
      const s = stateRef.current
      if (s.phase !== 'playing' || s.currentPlayer === 0 || s.aiThinking) return
      
      setAiThinking(true)
      setMessage(`${PLAYER_NAMES[s.currentPlayer]} 思考中...`)
      
      // AI思考时间 1-3秒
      const thinkTime = 1000 + Math.random() * 2000
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
  
  // 渲染手牌
  const renderFanCard = (card: Card, index: number, isSelected: boolean, onClick?: () => void) => {
    const isJoker = card.suit === 'joker'
    const isBigJoker = card.rank === 17
    const jokerColor = isBigJoker ? '#DAA520' : '#708090'
    const color = isJoker ? jokerColor : SUIT_COLORS[card.suit]
    const offset = index * 28
    
    return (
      <div
        key={card.id}
        onClick={onClick}
        className={`absolute bg-gradient-to-br from-white to-gray-100 rounded-lg shadow-lg border-2 
          ${onClick ? 'cursor-pointer hover:shadow-xl active:scale-95' : ''} transition-all duration-150`}
        style={{ 
          left: `${offset}px`,
          width: '48px',
          height: '72px',
          transform: isSelected ? 'translateY(-18px)' : 'translateY(0)',
          zIndex: index,
          borderColor: isSelected ? '#f472b6' : '#e5e7eb',
          boxShadow: isSelected ? '0 8px 20px rgba(244, 114, 182, 0.4)' : '0 4px 12px rgba(0,0,0,0.15)'
        }}
      >
        {isJoker ? (
          <>
            <div className="absolute top-1 left-1.5 leading-none" style={{ color: jokerColor }}>
              <span className="text-base font-black">王</span>
            </div>
            <div className="absolute bottom-1 right-1.5 leading-none rotate-180" style={{ color: jokerColor }}>
              <span className="text-base font-black">王</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center" style={{ color: jokerColor }}>
              <span className="text-sm font-black">{isBigJoker ? '大' : '小'}</span>
            </div>
          </>
        ) : (
          <>
            <div className="absolute top-1 left-1.5 flex flex-col items-center leading-none" style={{ color }}>
              <span className="text-base font-black">{card.display}</span>
              <span className="text-sm">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
            <div className="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180" style={{ color }}>
              <span className="text-base font-black">{card.display}</span>
              <span className="text-sm">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
          </>
        )}
      </div>
    )
  }
  
  // 渲染出的牌 - 统一大小，放中间
  const renderPlayedCards = (cards: Card[]) => {
    if (cards.length === 0) return <div className="text-pink-300 text-sm bg-black/40 backdrop-blur px-3 py-1.5 rounded-full font-medium">不出</div>
    
    const cardW = 44
    const cardH = 64
    const gap = 22
    const totalWidth = (cards.length - 1) * gap + cardW
    
    return (
      <div className="relative" style={{ width: `${totalWidth}px`, height: `${cardH}px` }}>
        {cards.map((card, i) => {
          const isJoker = card.suit === 'joker'
          const isBigJoker = card.rank === 17
          const jokerColor = isBigJoker ? '#DAA520' : '#708090'
          const color = isJoker ? jokerColor : SUIT_COLORS[card.suit]
          return (
            <div
              key={card.id}
              className="absolute bg-gradient-to-br from-white to-gray-100 rounded-lg shadow-lg border border-gray-200"
              style={{ width: `${cardW}px`, height: `${cardH}px`, left: `${i * gap}px`, zIndex: i }}
            >
              {isJoker ? (
                <>
                  <div className="absolute top-0.5 left-1 leading-none" style={{ color: jokerColor }}>
                    <span className="text-sm font-black">王</span>
                  </div>
                  <div className="absolute bottom-0.5 right-1 leading-none rotate-180" style={{ color: jokerColor }}>
                    <span className="text-sm font-black">王</span>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center" style={{ color: jokerColor }}>
                    <span className="text-xs font-black">{isBigJoker ? '大' : '小'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="absolute top-0.5 left-1 flex flex-col items-center leading-none" style={{ color }}>
                    <span className="text-sm font-black">{card.display}</span>
                    <span className="text-xs">{SUIT_SYMBOLS[card.suit]}</span>
                  </div>
                  <div className="absolute bottom-0.5 right-1 flex flex-col items-center leading-none rotate-180" style={{ color }}>
                    <span className="text-sm font-black">{card.display}</span>
                    <span className="text-xs">{SUIT_SYMBOLS[card.suit]}</span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    )
  }
  
  const renderSmallCard = (card: Card) => {
    const isJoker = card.suit === 'joker'
    const isBigJoker = card.rank === 17
    const jokerColor = isBigJoker ? '#DAA520' : '#708090'
    const color = isJoker ? jokerColor : SUIT_COLORS[card.suit]
    return (
      <div key={card.id} className="w-7 h-10 bg-gradient-to-br from-white to-gray-100 rounded shadow-md border border-gray-200 relative">
        {isJoker ? (
          <div className="absolute top-0.5 left-1 leading-none" style={{ color: jokerColor }}>
            <span className="text-[10px] font-black">王</span>
          </div>
        ) : (
          <div className="absolute top-0.5 left-1 flex flex-col items-center leading-none" style={{ color }}>
            <span className="text-[10px] font-black">{card.display}</span>
            <span className="text-[7px]">{SUIT_SYMBOLS[card.suit]}</span>
          </div>
        )}
      </div>
    )
  }

  const handWidth = hands[0].length > 0 ? (hands[0].length - 1) * 28 + 48 : 0
  const isInGame = phase === 'bidding' || phase === 'playing'
  const currentMultiplier = Math.pow(2, bombCount)

  return (
    <div 
      className="flex flex-col h-full overflow-hidden relative"
      style={{ 
        transform: 'rotate(90deg)',
        transformOrigin: 'center center',
        width: '100vh',
        height: '100vw',
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: '-50vw',
        marginLeft: '-50vh',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 30%, #4c1d95 70%, #581c87 100%)'
      }}
    >
      {/* 装饰背景 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl" />
      </div>
      
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-black/30 backdrop-blur-sm flex-shrink-0 border-b border-white/10">
        <button onClick={() => navigate(-1)} className="text-white/80 p-1.5 hover:bg-white/10 rounded-lg transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        {/* 中间：倍数显示 */}
        {isInGame && (
          <div className="flex items-center gap-3">
            <span className="text-white/70 text-sm font-medium">底分 {baseScore}</span>
            <div className="bg-gradient-to-r from-pink-500 to-rose-500 text-white text-sm px-3 py-1 rounded-full font-bold shadow-lg">
              {currentMultiplier}倍
            </div>
            {bombCount > 0 && <span className="text-yellow-300 text-sm font-bold">💣×{bombCount}</span>}
          </div>
        )}
        {!isInGame && (
          <h1 className="text-white font-bold text-lg flex items-center gap-2">
            <span className="text-2xl">🃏</span> 欢乐斗地主
          </h1>
        )}
        
        {/* 右上角 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur rounded-full px-3 py-1.5">
            <span className="text-yellow-400 text-base">💰</span>
            <span className="text-yellow-300 text-sm font-bold">{stats.coins}</span>
            <button onClick={() => setShowRecharge(true)} className="ml-1 bg-gradient-to-r from-yellow-400 to-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold active:scale-95 shadow">充值</button>
          </div>
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur rounded-full px-3 py-1.5">
            <span className="text-green-400 text-sm font-bold">胜{stats.wins}</span>
            <span className="text-white/30">|</span>
            <span className="text-red-400 text-sm font-bold">负{stats.losses}</span>
          </div>
        </div>
      </div>
      
      {/* 充值成功提示 */}
      {showRechargeSuccess && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce">
          <span className="text-2xl">✨</span>
          <span className="font-bold">充值成功！</span>
        </div>
      )}
      
      {/* 充值弹窗 */}
      {showRecharge && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-white to-gray-100 rounded-2xl p-5 w-72 shadow-2xl">
            <h3 className="text-center font-bold text-xl mb-3 flex items-center justify-center gap-2">
              <span className="text-2xl">💰</span> 金币充值
            </h3>
            <p className="text-center text-gray-500 text-xs mb-2">消耗微信钱包余额</p>
            <p className="text-center text-sm text-orange-500 font-medium mb-3">1元 = 10金币</p>
            <p className="text-center text-sm mb-3">钱包余额: <span className="text-green-600 font-bold">¥{walletBalance.toFixed(2)}</span></p>
            <div className="flex gap-2 justify-center mb-4">
              {[10, 50, 100].map(amount => (
                <button 
                  key={amount} 
                  onClick={() => setRechargeAmount(amount)} 
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    rechargeAmount === amount 
                      ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-lg scale-105' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ¥{amount}
                </button>
              ))}
            </div>
            <p className="text-center text-sm mb-4">可获得 <span className="text-yellow-600 font-bold text-lg">{rechargeAmount * 10}</span> 金币</p>
            {stats.coins < 1000 && <p className="text-center text-red-500 text-xs mb-3">⚠️ 金币不足1000，无法开始游戏</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowRecharge(false)} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-300 transition-colors">取消</button>
              <button onClick={handleRecharge} disabled={walletBalance < rechargeAmount} className="flex-1 py-2.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-white rounded-xl text-sm font-bold disabled:opacity-50 shadow-lg hover:shadow-xl transition-all">确认充值</button>
            </div>
          </div>
        </div>
      )}
      
      {/* 消息 */}
      {message && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-black/80 backdrop-blur-sm text-white px-6 py-3 rounded-2xl text-base font-medium shadow-2xl border border-white/10">
          {message}
        </div>
      )}
      
      {/* 开始界面 */}
      {phase === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-6xl animate-bounce">🃏</div>
          <h2 className="text-white text-2xl font-bold">欢乐斗地主</h2>
          <p className="text-white/60 text-sm">单机模式 · 不消耗API</p>
          {stats.coins < 1000 ? (
            <>
              <p className="text-red-400 text-sm font-medium">⚠️ 金币不足1000，无法开始游戏</p>
              <button onClick={() => setShowRecharge(true)} className="px-8 py-3 bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-bold rounded-full text-lg shadow-xl active:scale-95 hover:shadow-2xl transition-all">充值金币</button>
            </>
          ) : (
            <button onClick={startGame} className="px-8 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-full text-lg shadow-xl active:scale-95 hover:shadow-2xl transition-all">开始游戏</button>
          )}
        </div>
      )}
      
      {/* 匹配中 */}
      {phase === 'matching' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="text-5xl animate-bounce">🔍</div>
          <h2 className="text-white text-xl font-bold">正在匹配对手...</h2>
          <div className="w-56 h-3 bg-black/30 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-pink-500 to-rose-500 transition-all duration-100 rounded-full" style={{ width: `${matchProgress}%` }} />
          </div>
          <p className="text-white/60 text-sm">{matchProgress < 30 ? '搜索玩家中...' : matchProgress < 70 ? '匹配到电脑A' : '匹配到电脑B'}</p>
        </div>
      )}
      
      {/* 选择底分 */}
      {phase === 'selectBase' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <h2 className="text-white text-xl font-bold">选择底分</h2>
          <p className="text-white/60 text-sm">底分 × 叫分 × 炸弹翻倍 = 输赢金币</p>
          <div className="flex gap-4">
            {[100, 200, 500, 1000].map(base => (
              <button 
                key={base} 
                onClick={() => startBidding(base)} 
                className="px-5 py-3 bg-gradient-to-br from-pink-500 to-rose-500 text-white font-bold rounded-2xl text-xl shadow-xl active:scale-95 hover:shadow-2xl transition-all border-2 border-white/20"
              >
                {base}
              </button>
            ))}
          </div>
          <div className="flex gap-6 mt-3 text-white/70 text-sm">
            <span>🤖 电脑A: 💰{aiCoins[0]}</span>
            <span>🤖 电脑B: 💰{aiCoins[1]}</span>
          </div>
        </div>
      )}
      
      {/* 游戏中 */}
      {isInGame && (
        <div className="flex-1 flex flex-col relative">
          {/* 顶部：两个AI头像和出牌区 */}
          <div className="flex justify-between items-start px-4 pt-2">
            {/* 左侧：电脑B头像 + 出牌 */}
            <div className="flex items-start gap-2">
              <PlayerAvatar 
                avatarUrl="" 
                isActive={phase === 'bidding' ? currentBidder === 2 : currentPlayer === 2} 
                isLandlord={landlord === 2} 
                isComputer={true} 
                cardCount={hands[2].length} 
                coins={aiCoins[1]}
                name="电脑B"
              />
              {/* 电脑B出的牌 - 在头像右侧 */}
              {phase === 'playing' && playedCards.has(2) && (
                <div className="mt-2">
                  {renderPlayedCards(playedCards.get(2) || [])}
                </div>
              )}
            </div>
            
            {/* 中间：底牌 */}
            <div className="flex items-center gap-1.5">
              <span className="text-white/50 text-xs">底牌:</span>
              {dizhuCards.map(card => renderSmallCard(card))}
            </div>
            
            {/* 右侧：电脑A出牌 + 头像 */}
            <div className="flex items-start gap-2">
              {/* 电脑A出的牌 - 在头像左侧 */}
              {phase === 'playing' && playedCards.has(1) && (
                <div className="mt-2">
                  {renderPlayedCards(playedCards.get(1) || [])}
                </div>
              )}
              <PlayerAvatar 
                avatarUrl="" 
                isActive={phase === 'bidding' ? currentBidder === 1 : currentPlayer === 1} 
                isLandlord={landlord === 1} 
                isComputer={true} 
                cardCount={hands[1].length} 
                coins={aiCoins[0]}
                name="电脑A"
              />
            </div>
          </div>
          
          {/* 中间区域 - 叫地主按钮 / 我出的牌 */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {phase === 'bidding' && (
              <>
                {currentBidder === 0 && !aiThinking && (
                  <div className="flex gap-3">
                    <button onClick={() => handleBid(0)} className="px-5 py-2 bg-gray-600/80 backdrop-blur text-white rounded-xl text-sm font-medium active:scale-95 hover:bg-gray-500 transition-colors">不叫</button>
                    {bidScore < 1 && <button onClick={() => handleBid(1)} className="px-5 py-2 bg-blue-500 text-white rounded-xl text-sm font-bold active:scale-95 hover:bg-blue-400 transition-colors shadow-lg">1分</button>}
                    {bidScore < 2 && <button onClick={() => handleBid(2)} className="px-5 py-2 bg-purple-500 text-white rounded-xl text-sm font-bold active:scale-95 hover:bg-purple-400 transition-colors shadow-lg">2分</button>}
                    {bidScore < 3 && <button onClick={() => handleBid(3)} className="px-5 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl text-sm font-bold active:scale-95 hover:shadow-lg transition-all shadow-lg">3分</button>}
                  </div>
                )}
              </>
            )}
            
            {phase === 'playing' && (
              <div className="flex flex-col items-center">
                {/* 我出的牌 - 在中间 */}
                {playedCards.has(0) && (
                  <div className="flex flex-col items-center gap-1">
                    {renderPlayedCards(playedCards.get(0) || [])}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* 下方：操作按钮 + 手牌 */}
          <div className="flex-shrink-0 pb-2">
            {phase === 'playing' && currentPlayer === 0 && !aiThinking && (
              <div className="flex justify-center gap-3 mb-2">
                <button onClick={handleHint} className="px-5 py-2 bg-blue-500/80 backdrop-blur text-white rounded-xl text-sm font-medium active:scale-95 hover:bg-blue-400 transition-colors">提示</button>
                <button onClick={handlePass} disabled={lastPlayPlayer === 0 || lastPlayPlayer === null} className="px-5 py-2 bg-gray-600/80 backdrop-blur text-white rounded-xl text-sm font-medium active:scale-95 disabled:opacity-40 hover:bg-gray-500 transition-colors">不出</button>
                <button onClick={handlePlay} className="px-6 py-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl text-sm font-bold active:scale-95 shadow-lg hover:shadow-xl transition-all">出牌</button>
              </div>
            )}
            {phase === 'playing' && currentPlayer !== 0 && (
              <div className="text-center text-white/70 text-sm mb-2">等待对方出牌...</div>
            )}
            
            {/* 手牌和头像 */}
            <div className="h-[100px] flex items-center px-3">
              <div className="mr-3">
                <PlayerAvatar 
                  avatarUrl={myAvatarUrl} 
                  isActive={phase === 'bidding' ? currentBidder === 0 : currentPlayer === 0} 
                  isLandlord={landlord === 0} 
                  isComputer={false} 
                  cardCount={hands[0].length}
                  name="我"
                />
              </div>
              <div className="flex-1 flex justify-center overflow-visible">
                <div className="relative" style={{ width: `${handWidth}px`, height: '72px' }}>
                  {hands[0].map((card, i) => renderFanCard(card, i, selectedCards.has(card.id), () => toggleCard(card.id)))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 结算界面 */}
      {phase === 'ended' && gameResult && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
          <div className="text-5xl">{gameResult.playerCoins[0] > 0 ? '🎉' : '😢'}</div>
          <h2 className="text-white text-2xl font-bold">{gameResult.playerCoins[0] > 0 ? '恭喜你赢了！' : '很遗憾，你输了'}</h2>
          
          <div className="bg-black/40 backdrop-blur rounded-2xl p-4 w-full max-w-sm border border-white/10">
            <div className="text-white/70 text-sm text-center mb-3">
              底分{gameResult.baseScore} × 叫分{gameResult.bidScore} × {gameResult.multiplier}倍
              {gameResult.bombCount > 0 && ` (💣×${gameResult.bombCount})`}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center bg-white/5 rounded-lg px-3 py-2">
                <span className="text-white font-medium">我</span>
                <span className={`font-bold text-lg ${gameResult.playerCoins[0] > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {gameResult.playerCoins[0] > 0 ? '+' : ''}{gameResult.playerCoins[0]}
                </span>
              </div>
              <div className="flex justify-between items-center bg-white/5 rounded-lg px-3 py-2">
                <span className="text-white/70">电脑A</span>
                <span className={`font-bold ${gameResult.playerCoins[1] > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {gameResult.playerCoins[1] > 0 ? '+' : ''}{gameResult.playerCoins[1]}
                </span>
              </div>
              <div className="flex justify-between items-center bg-white/5 rounded-lg px-3 py-2">
                <span className="text-white/70">电脑B</span>
                <span className={`font-bold ${gameResult.playerCoins[2] > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {gameResult.playerCoins[2] > 0 ? '+' : ''}{gameResult.playerCoins[2]}
                </span>
              </div>
            </div>
            
            <div className="border-t border-white/20 mt-3 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-white font-medium">我的金币</span>
                <span className="text-yellow-300 font-bold text-lg">💰 {stats.coins}</span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-4 mt-3">
            <button onClick={() => setPhase('selectBase')} className="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold rounded-full shadow-xl active:scale-95 hover:shadow-2xl transition-all">再来一局</button>
            <button onClick={() => navigate(-1)} className="px-6 py-2.5 bg-white/10 backdrop-blur text-white font-medium rounded-full active:scale-95 hover:bg-white/20 transition-colors">返回</button>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes glow {
          from { box-shadow: 0 0 0 3px #fbbf24, 0 0 15px rgba(251, 191, 36, 0.5); }
          to { box-shadow: 0 0 0 5px #fbbf24, 0 0 30px rgba(251, 191, 36, 0.8); }
        }
      `}</style>
    </div>
  )
}
