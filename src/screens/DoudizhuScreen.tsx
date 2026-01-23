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

type GamePhase = 'idle' | 'bidding' | 'playing' | 'ended'
type Player = 0 | 1 | 2

const PLAYER_NAMES = ['我', '电脑A', '电脑B']

// 音效播放
const playSound = (type: 'start' | 'card' | 'win' | 'lose') => {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    
    if (type === 'start') {
      osc.frequency.value = 523 // C5
      gain.gain.value = 0.3
      osc.start()
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1) // E5
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2) // G5
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

// 头像组件
function PlayerAvatar({ 
  avatarUrl,
  isActive, 
  isLandlord,
  isComputer,
  cardCount,
  size = 'normal'
}: { 
  avatarUrl?: string
  isActive: boolean
  isLandlord: boolean
  isComputer: boolean
  cardCount: number
  size?: 'normal' | 'large'
}) {
  const sizeClass = size === 'large' ? 'w-14 h-14' : 'w-12 h-12'
  const textSize = size === 'large' ? 'text-base' : 'text-sm'
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div 
        className={`relative ${sizeClass} rounded-full flex items-center justify-center shadow-lg overflow-hidden`}
        style={{
          background: isComputer 
            ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            : 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
          boxShadow: isActive 
            ? '0 0 0 4px #facc15, 0 0 25px rgba(250, 204, 21, 0.7)' 
            : '0 2px 8px rgba(0,0,0,0.3)',
          animation: isActive ? 'glow 1s ease-in-out infinite alternate' : 'none'
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className={`text-white ${textSize}`}>{isComputer ? '🤖' : '😊'}</span>
        )}
        {isLandlord && (
          <div className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center shadow text-[10px]">
            👑
          </div>
        )}
      </div>
      <div className="text-white text-xs font-medium">{isComputer ? '电脑' : '我'}</div>
      <div className="bg-black/50 rounded px-2 py-0.5 text-xs text-yellow-300 font-bold">{cardCount}张</div>
    </div>
  )
}

export default function DoudizhuScreen() {
  const navigate = useNavigate()
  const { userPersonas } = useWeChat()
  
  // 获取默认人设头像
  const defaultPersona = userPersonas[0]
  const myAvatarUrl = defaultPersona?.avatar || ''
  
  const [phase, setPhase] = useState<GamePhase>('idle')
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
  
  // 开始游戏
  const startGame = () => {
    playSound('start')
    const { hands: newHands, dizhu } = dealCards()
    setHands(newHands)
    setDizhuCards(dizhu)
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
    setPhase('bidding')
  }
  
  // AI叫地主
  useEffect(() => {
    if (phase !== 'bidding') return
    
    const interval = setInterval(() => {
      const s = stateRef.current
      if (s.phase !== 'bidding' || s.currentBidder === 0 || s.aiThinking) return
      
      setAiThinking(true)
      setMessage(`${PLAYER_NAMES[s.currentBidder]} 思考中...`)
      
      // 2-4秒思考时间
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
  
  // AI出牌
  useEffect(() => {
    if (phase !== 'playing') return
    
    const interval = setInterval(() => {
      const s = stateRef.current
      if (s.phase !== 'playing' || s.currentPlayer === 0 || s.aiThinking) return
      
      setAiThinking(true)
      setMessage(`${PLAYER_NAMES[s.currentPlayer]} 思考中...`)
      
      // 2-5秒思考时间
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
  
  // 渲染牌 - 放大版
  const renderCard = (card: Card, isSelected: boolean, onClick?: () => void, size: 'large' | 'normal' | 'small' = 'normal') => {
    const isJoker = card.suit === 'joker'
    const color = SUIT_COLORS[card.suit]
    
    const sizeClass = size === 'large' ? 'w-14 h-20' : size === 'normal' ? 'w-12 h-16' : 'w-10 h-14'
    const fontSize = size === 'large' ? 'text-lg' : size === 'normal' ? 'text-base' : 'text-sm'
    const suitSize = size === 'large' ? 'text-sm' : size === 'normal' ? 'text-xs' : 'text-[10px]'
    
    return (
      <div
        key={card.id}
        onClick={onClick}
        className={`${sizeClass} bg-white rounded-lg shadow-lg border-2 border-gray-200 flex flex-col items-center justify-center flex-shrink-0
          ${onClick ? 'cursor-pointer active:scale-95' : ''} ${isSelected ? '-translate-y-4 ring-3 ring-yellow-400 shadow-xl' : ''} transition-all`}
        style={{ color }}
      >
        {isJoker ? (
          <span className={`${size === 'large' ? 'text-sm' : 'text-xs'} font-bold text-center`}>
            {card.rank === 16 ? '小王' : '大王'}
          </span>
        ) : (
          <>
            <span className={`${fontSize} font-bold leading-none`}>{card.display}</span>
            <span className={`${suitSize} leading-none mt-0.5`}>{SUIT_SYMBOLS[card.suit]}</span>
          </>
        )}
      </div>
    )
  }
  
  // 渲染出的牌 - 放大版
  const renderPlayedCards = (player: Player) => {
    const cards = roundPlays.get(player)
    if (cards === undefined) return null
    if (cards.length === 0) return <div className="text-yellow-300 text-sm bg-black/50 px-3 py-1.5 rounded-lg">不出</div>
    return (
      <div className="flex -space-x-5">
        {cards.map(card => renderCard(card, false, undefined, 'normal'))}
      </div>
    )
  }

  return (
    <div 
      className="flex flex-col h-full bg-gradient-to-br from-emerald-900 via-green-800 to-green-900 overflow-hidden"
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
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 flex-shrink-0">
        <button onClick={() => navigate(-1)} className="text-white/80 p-1">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-white font-bold text-base">🃏 欢乐斗地主</h1>
        {phase === 'playing' && (
          <div className="flex gap-1 items-center">
            <span className="text-white/60 text-xs mr-1">底牌:</span>
            {dizhuCards.map(card => renderCard(card, false, undefined, 'small'))}
          </div>
        )}
        {phase !== 'playing' && <div className="w-24" />}
      </div>
      
      {/* 消息 */}
      {message && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-black/85 text-white px-6 py-3 rounded-2xl text-base font-medium shadow-2xl">
          {message}
        </div>
      )}
      
      {/* 开始界面 */}
      {phase === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="text-6xl">🃏</div>
          <h2 className="text-white text-2xl font-bold">欢乐斗地主</h2>
          <p className="text-white/60 text-sm">单机模式 · 不消耗API</p>
          <button onClick={startGame} className="px-8 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full text-lg shadow-xl active:scale-95 transition-transform">
            开始游戏
          </button>
        </div>
      )}
      
      {/* 叫地主 */}
      {phase === 'bidding' && (
        <div className="flex-1 flex">
          {/* 左侧 - 我的头像 */}
          <div className="w-24 flex flex-col justify-end pb-4 pl-2">
            <PlayerAvatar 
              avatarUrl={myAvatarUrl}
              isActive={currentBidder === 0} 
              isLandlord={landlord === 0} 
              isComputer={false} 
              cardCount={hands[0].length}
              size="large"
            />
          </div>
          
          {/* 中间区域 */}
          <div className="flex-1 flex flex-col">
            {/* 上方电脑头像 */}
            <div className="flex justify-around py-3">
              <PlayerAvatar avatarUrl="" isActive={currentBidder === 2} isLandlord={landlord === 2} isComputer={true} cardCount={hands[2].length} size="large" />
              <PlayerAvatar avatarUrl="" isActive={currentBidder === 1} isLandlord={landlord === 1} isComputer={true} cardCount={hands[1].length} size="large" />
            </div>
            
            {/* 底牌和叫分按钮 */}
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="text-white/70 text-sm">底牌</div>
              <div className="flex gap-2">
                {dizhuCards.map(card => <div key={card.id} className="w-10 h-14 bg-gradient-to-br from-pink-300 to-pink-400 rounded-lg border-2 border-pink-200 shadow-lg" />)}
              </div>
              
              {currentBidder === 0 && !aiThinking && (
                <div className="flex gap-3 mt-3">
                  <button onClick={() => handleBid(0)} className="px-5 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium active:scale-95">不叫</button>
                  {bidScore < 1 && <button onClick={() => handleBid(1)} className="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium active:scale-95">1分</button>}
                  {bidScore < 2 && <button onClick={() => handleBid(2)} className="px-5 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium active:scale-95">2分</button>}
                  {bidScore < 3 && <button onClick={() => handleBid(3)} className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium active:scale-95">3分</button>}
                </div>
              )}
            </div>
            
            {/* 我的手牌 */}
            <div className="pb-3 px-2">
              <div className="flex gap-1 overflow-x-auto hide-scrollbar justify-center">
                {hands[0].map(card => renderCard(card, selectedCards.has(card.id), () => toggleCard(card.id), 'normal'))}
              </div>
            </div>
          </div>
          
          <div className="w-24" />
        </div>
      )}
      
      {/* 游戏中 */}
      {phase === 'playing' && (
        <div className="flex-1 flex flex-col">
          {/* 上方：电脑头像和出牌 */}
          <div className="flex justify-around items-start py-2 px-8">
            <div className="flex flex-col items-center gap-2">
              <PlayerAvatar avatarUrl="" isActive={currentPlayer === 2} isLandlord={landlord === 2} isComputer={true} cardCount={hands[2].length} size="large" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <PlayerAvatar avatarUrl="" isActive={currentPlayer === 1} isLandlord={landlord === 1} isComputer={true} cardCount={hands[1].length} size="large" />
            </div>
          </div>
          
          {/* 中间：所有人出的牌集中显示 */}
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            {/* 电脑出的牌 */}
            <div className="flex gap-12">
              <div className="min-w-[120px] flex justify-center">
                {renderPlayedCards(2)}
              </div>
              <div className="min-w-[120px] flex justify-center">
                {renderPlayedCards(1)}
              </div>
            </div>
            
            {/* 我出的牌 */}
            <div className="min-h-[70px] flex items-center justify-center">
              {renderPlayedCards(0)}
            </div>
          </div>
          
          {/* 下方：操作按钮 + 手牌 + 头像 */}
          <div className="pb-2 px-2">
            {/* 操作按钮在手牌上方 */}
            {currentPlayer === 0 && !aiThinking && (
              <div className="flex justify-center gap-3 mb-2">
                <button onClick={handleHint} className="px-5 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium active:scale-95">提示</button>
                <button onClick={handlePass} disabled={lastPlayPlayer === 0 || lastPlayPlayer === null} className="px-5 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium active:scale-95 disabled:opacity-40">不出</button>
                <button onClick={handlePlay} className="px-6 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg text-sm font-bold active:scale-95">出牌</button>
              </div>
            )}
            
            {currentPlayer !== 0 && (
              <div className="text-center text-white/70 text-sm mb-2">等待对方出牌...</div>
            )}
            
            {/* 手牌和头像 */}
            <div className="flex items-end gap-3">
              <PlayerAvatar 
                avatarUrl={myAvatarUrl}
                isActive={currentPlayer === 0} 
                isLandlord={landlord === 0} 
                isComputer={false} 
                cardCount={hands[0].length}
                size="large"
              />
              <div className="flex-1 flex gap-1 overflow-x-auto hide-scrollbar pb-1 justify-center">
                {hands[0].map(card => renderCard(card, selectedCards.has(card.id), () => toggleCard(card.id), 'normal'))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 结束 */}
      {phase === 'ended' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <div className="text-6xl">{winner === 'landlord' ? (landlord === 0 ? '🎉' : '😢') : (landlord === 0 ? '😢' : '🎉')}</div>
          <h2 className="text-white text-2xl font-bold">
            {winner === 'landlord' ? (landlord === 0 ? '恭喜你赢了！' : '地主获胜') : (landlord === 0 ? '农民获胜' : '恭喜你赢了！')}
          </h2>
          <button onClick={startGame} className="px-8 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full text-lg shadow-xl active:scale-95 transition-transform">再来一局</button>
          <button onClick={() => navigate(-1)} className="text-white/70 underline">返回</button>
        </div>
      )}
      
      <style>{`
        @keyframes glow {
          from { box-shadow: 0 0 0 4px #facc15, 0 0 20px rgba(250, 204, 21, 0.5); }
          to { box-shadow: 0 0 0 6px #facc15, 0 0 35px rgba(250, 204, 21, 0.8); }
        }
      `}</style>
    </div>
  )
}
