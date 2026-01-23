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

type GamePhase = 'idle' | 'bidding' | 'playing' | 'ended'
type Player = 0 | 1 | 2

const PLAYER_NAMES = ['我', '电脑A', '电脑B']

// 头像组件
function PlayerAvatar({ 
  name, 
  isActive, 
  isLandlord,
  isComputer,
  cardCount
}: { 
  name: string
  isActive: boolean
  isLandlord: boolean
  isComputer: boolean
  cardCount: number
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div 
        className={`relative w-10 h-10 rounded-full flex items-center justify-center shadow-lg`}
        style={{
          background: isComputer 
            ? (name === '电脑A' 
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)')
            : 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
          boxShadow: isActive 
            ? '0 0 0 3px #facc15, 0 0 20px rgba(250, 204, 21, 0.6)' 
            : 'none',
          animation: isActive ? 'glow 1s ease-in-out infinite alternate' : 'none'
        }}
      >
        <span className="text-white text-sm">{isComputer ? '🤖' : '😊'}</span>
        {isLandlord && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center shadow text-[8px]">
            👑
          </div>
        )}
      </div>
      <div className="text-white text-[10px] font-medium">{isComputer ? '电脑' : name}</div>
      <div className="bg-black/40 rounded px-1.5 py-0.5 text-[10px] text-yellow-300 font-bold">{cardCount}张</div>
    </div>
  )
}

export default function DoudizhuScreen() {
  const navigate = useNavigate()
  
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
  
  // 用ref追踪最新状态，避免闭包问题
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
    dizhuCards: [] as Card[]
  })
  
  // 同步state到ref
  useEffect(() => {
    stateRef.current = { phase, hands, currentBidder, currentPlayer, bidScore, lastPlay, lastPlayPlayer, passCount, landlord, dizhuCards }
  }, [phase, hands, currentBidder, currentPlayer, bidScore, lastPlay, lastPlayPlayer, passCount, landlord, dizhuCards])
  
  // 开始游戏
  const startGame = () => {
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
    setPhase('bidding')
  }
  
  // AI叫地主 - 简化版，用setInterval轮询
  useEffect(() => {
    if (phase !== 'bidding') return
    
    const interval = setInterval(() => {
      const s = stateRef.current
      if (s.phase !== 'bidding') return
      if (s.currentBidder === 0) return // 玩家回合
      
      // AI叫地主
      const handScore = evaluateHandForBidding(s.hands[s.currentBidder])
      let bid = 0
      if (handScore >= 18 && s.bidScore < 3) bid = 3
      else if (handScore >= 12 && s.bidScore < 2) bid = 2
      else if (handScore >= 8 && s.bidScore < 1) bid = 1
      
      const bidderName = PLAYER_NAMES[s.currentBidder]
      if (bid > s.bidScore) {
        setMessage(`${bidderName}叫${bid}分`)
        setBidScore(bid)
        setLandlord(s.currentBidder)
      } else {
        setMessage(`${bidderName}不叫`)
      }
      
      // 计算下一个叫地主的人
      const nextBidder = ((s.currentBidder + 1) % 3) as Player
      
      setTimeout(() => {
        setMessage('')
        
        // 判断是否结束叫地主
        if (bid === 3) {
          // 叫3分直接成为地主
          finishBidding(s.currentBidder)
        } else if (nextBidder === 0) {
          // 轮完一圈
          const finalLandlord = stateRef.current.landlord ?? 0
          finishBidding(finalLandlord)
        } else {
          setCurrentBidder(nextBidder)
        }
      }, 1000)
      
    }, 1500)
    
    return () => clearInterval(interval)
  }, [phase])
  
  // 结束叫地主阶段
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
  
  // 玩家叫地主
  const handleBid = (score: number) => {
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
  
  // 选牌
  const toggleCard = (cardId: string) => {
    if (phase !== 'playing' || currentPlayer !== 0) return
    setSelectedCards(prev => {
      const newSet = new Set(prev)
      if (newSet.has(cardId)) newSet.delete(cardId)
      else newSet.add(cardId)
      return newSet
    })
  }
  
  // 出牌
  const doPlayCards = useCallback((player: Player, cards: Card[]) => {
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
        setWinner(player === stateRef.current.landlord ? 'landlord' : 'farmer')
        setPhase('ended')
        return
      }
    }
    
    setCurrentPlayer(((player + 1) % 3) as Player)
    setSelectedCards(new Set())
  }, [])
  
  // 玩家出牌
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
  
  // 不出
  const handlePass = () => {
    if (lastPlayPlayer === 0 || lastPlayPlayer === null) {
      setMessage('必须出牌！')
      setTimeout(() => setMessage(''), 1000)
      return
    }
    doPlayCards(0, [])
  }
  
  // 提示
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
  
  // AI出牌 - 用setInterval轮询
  useEffect(() => {
    if (phase !== 'playing') return
    
    const interval = setInterval(() => {
      const s = stateRef.current
      if (s.phase !== 'playing') return
      if (s.currentPlayer === 0) return // 玩家回合
      
      const player = s.currentPlayer
      const needToBeat = s.lastPlayPlayer !== null && s.lastPlayPlayer !== player
      const cards = aiDecide(s.hands[player], needToBeat ? s.lastPlay : null, player === s.landlord, 'normal')
      
      doPlayCards(player, cards || [])
    }, 1200)
    
    return () => clearInterval(interval)
  }, [phase, doPlayCards])
  
  // 渲染牌
  const renderCard = (card: Card, isSelected: boolean, onClick?: () => void, size: 'normal' | 'small' | 'tiny' = 'normal') => {
    const isJoker = card.suit === 'joker'
    const color = SUIT_COLORS[card.suit]
    const sizeClass = size === 'tiny' ? 'w-6 h-8' : size === 'small' ? 'w-8 h-11' : 'w-11 h-[60px]'
    const fontSize = size === 'tiny' ? 'text-[9px]' : size === 'small' ? 'text-[11px]' : 'text-sm'
    
    return (
      <div
        key={card.id}
        onClick={onClick}
        className={`${sizeClass} bg-white rounded shadow border border-gray-300 flex flex-col items-center justify-center flex-shrink-0
          ${onClick ? 'cursor-pointer active:scale-95' : ''} ${isSelected ? '-translate-y-3 ring-2 ring-yellow-400' : ''} transition-all`}
        style={{ color }}
      >
        {isJoker ? (
          <span className="text-[7px] font-bold">{card.rank === 16 ? '小王' : '大王'}</span>
        ) : (
          <>
            <span className={`${fontSize} font-bold leading-none`}>{card.display}</span>
            <span className="text-[9px] leading-none">{SUIT_SYMBOLS[card.suit]}</span>
          </>
        )}
      </div>
    )
  }
  
  // 渲染出的牌
  const renderPlayedCards = (player: Player) => {
    const cards = roundPlays.get(player)
    if (cards === undefined) return null
    if (cards.length === 0) return <div className="text-yellow-300 text-xs bg-black/40 px-2 py-1 rounded">不出</div>
    return (
      <div className="flex -space-x-3">
        {cards.map(card => renderCard(card, false, undefined, 'tiny'))}
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
      <div className="flex items-center justify-between px-3 py-1.5 bg-black/30 flex-shrink-0">
        <button onClick={() => navigate(-1)} className="text-white/80 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-white font-bold text-sm">🃏 斗地主</h1>
        {phase === 'playing' && (
          <div className="flex gap-1">
            {dizhuCards.map(card => renderCard(card, false, undefined, 'tiny'))}
          </div>
        )}
        {phase !== 'playing' && <div className="w-16" />}
      </div>
      
      {/* 消息 */}
      {message && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-black/80 text-white px-4 py-2 rounded-xl text-sm font-medium">
          {message}
        </div>
      )}
      
      {/* 开始界面 */}
      {phase === 'idle' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-5xl">🃏</div>
          <h2 className="text-white text-xl font-bold">欢乐斗地主</h2>
          <p className="text-white/60 text-xs">单机模式 · 不消耗API</p>
          <button onClick={startGame} className="px-6 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full shadow-lg active:scale-95">
            开始游戏
          </button>
        </div>
      )}
      
      {/* 叫地主 */}
      {phase === 'bidding' && (
        <div className="flex-1 flex">
          <div className="w-20 flex flex-col items-center justify-center">
            <PlayerAvatar name="电脑B" isActive={currentBidder === 2} isLandlord={landlord === 2} isComputer={true} cardCount={hands[2].length} />
          </div>
          
          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="text-white/70 text-xs">底牌</div>
              <div className="flex gap-1">
                {dizhuCards.map(card => <div key={card.id} className="w-8 h-11 bg-gradient-to-br from-pink-300 to-pink-400 rounded border-2 border-pink-200 shadow" />)}
              </div>
              
              {currentBidder === 0 && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleBid(0)} className="px-3 py-1.5 bg-gray-600 text-white rounded text-xs active:scale-95">不叫</button>
                  {bidScore < 1 && <button onClick={() => handleBid(1)} className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs active:scale-95">1分</button>}
                  {bidScore < 2 && <button onClick={() => handleBid(2)} className="px-3 py-1.5 bg-purple-500 text-white rounded text-xs active:scale-95">2分</button>}
                  {bidScore < 3 && <button onClick={() => handleBid(3)} className="px-3 py-1.5 bg-orange-500 text-white rounded text-xs active:scale-95">3分</button>}
                </div>
              )}
              
              {currentBidder !== 0 && <div className="text-white/70 text-xs">{PLAYER_NAMES[currentBidder]} 思考中...</div>}
            </div>
            
            <div className="h-24 flex items-end pb-2 px-2">
              <PlayerAvatar name="我" isActive={currentBidder === 0} isLandlord={landlord === 0} isComputer={false} cardCount={hands[0].length} />
              <div className="flex-1 flex gap-0.5 overflow-x-auto hide-scrollbar ml-2">
                {hands[0].map(card => renderCard(card, selectedCards.has(card.id), () => toggleCard(card.id), 'small'))}
              </div>
            </div>
          </div>
          
          <div className="w-20 flex flex-col items-center justify-center">
            <PlayerAvatar name="电脑A" isActive={currentBidder === 1} isLandlord={landlord === 1} isComputer={true} cardCount={hands[1].length} />
          </div>
        </div>
      )}
      
      {/* 游戏中 */}
      {phase === 'playing' && (
        <div className="flex-1 flex">
          <div className="w-24 flex flex-col items-center justify-center gap-2 px-1">
            <PlayerAvatar name="电脑B" isActive={currentPlayer === 2} isLandlord={landlord === 2} isComputer={true} cardCount={hands[2].length} />
            <div className="min-h-[44px] flex items-center">{renderPlayedCards(2)}</div>
          </div>
          
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 flex items-center justify-center">
              <div className="min-h-[50px] flex items-center">{renderPlayedCards(0)}</div>
            </div>
            
            <div className="pb-2 px-2">
              <div className="flex items-end gap-2">
                <PlayerAvatar name="我" isActive={currentPlayer === 0} isLandlord={landlord === 0} isComputer={false} cardCount={hands[0].length} />
                <div className="flex-1 min-w-0 flex gap-0.5 overflow-x-auto hide-scrollbar pb-1">
                  {hands[0].map(card => renderCard(card, selectedCards.has(card.id), () => toggleCard(card.id), 'small'))}
                </div>
                
                {currentPlayer === 0 && (
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={handleHint} className="px-2 py-1 bg-blue-500 text-white rounded text-[10px] active:scale-95">提示</button>
                    <button onClick={handlePass} disabled={lastPlayPlayer === 0 || lastPlayPlayer === null} className="px-2 py-1 bg-gray-600 text-white rounded text-[10px] active:scale-95 disabled:opacity-40">不出</button>
                    <button onClick={handlePlay} className="px-2 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded text-[10px] font-bold active:scale-95">出牌</button>
                  </div>
                )}
                
                {currentPlayer !== 0 && <div className="text-white/70 text-[10px] w-12 text-center">等待中...</div>}
              </div>
            </div>
          </div>
          
          <div className="w-24 flex flex-col items-center justify-center gap-2 px-1">
            <PlayerAvatar name="电脑A" isActive={currentPlayer === 1} isLandlord={landlord === 1} isComputer={true} cardCount={hands[1].length} />
            <div className="min-h-[44px] flex items-center">{renderPlayedCards(1)}</div>
          </div>
        </div>
      )}
      
      {/* 结束 */}
      {phase === 'ended' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-5xl">{winner === 'landlord' ? (landlord === 0 ? '🎉' : '😢') : (landlord === 0 ? '😢' : '🎉')}</div>
          <h2 className="text-white text-xl font-bold">
            {winner === 'landlord' ? (landlord === 0 ? '恭喜你赢了！' : '地主获胜') : (landlord === 0 ? '农民获胜' : '恭喜你赢了！')}
          </h2>
          <button onClick={startGame} className="px-6 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full shadow-lg active:scale-95">再来一局</button>
          <button onClick={() => navigate(-1)} className="text-white/70 underline text-sm">返回</button>
        </div>
      )}
      
      <style>{`
        @keyframes glow {
          from { box-shadow: 0 0 0 3px #facc15, 0 0 15px rgba(250, 204, 21, 0.4); }
          to { box-shadow: 0 0 0 5px #facc15, 0 0 25px rgba(250, 204, 21, 0.7); }
        }
      `}</style>
    </div>
  )
}
