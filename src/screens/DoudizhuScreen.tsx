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
type Player = 0 | 1 | 2 // 0=玩家(下), 1=右边AI, 2=左边AI

const PLAYER_NAMES = ['我', '电脑A', '电脑B']

// 头像组件（带闪烁边框）
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
        className={`relative w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${
          isActive ? 'animate-pulse-border' : ''
        }`} 
        style={{
          background: isComputer 
            ? (name === '电脑A' 
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)')
            : 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
          boxShadow: isActive 
            ? '0 0 0 3px rgba(250, 204, 21, 0.8), 0 0 20px rgba(250, 204, 21, 0.5)' 
            : 'none'
        }}
      >
        <span className="text-white text-sm">{isComputer ? '🤖' : '😊'}</span>
        {isLandlord && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rounded-full flex items-center justify-center shadow text-[8px]">
            👑
          </div>
        )}
      </div>
      <div className="text-white text-[10px] font-medium text-center leading-tight">
        {isComputer ? '电脑' : name}
      </div>
      <div className="bg-black/40 rounded px-1.5 py-0.5 text-[10px] text-yellow-300 font-bold">
        {cardCount}张
      </div>
    </div>
  )
}

export default function DoudizhuScreen() {
  const navigate = useNavigate()
  const handScrollRef = useRef<HTMLDivElement>(null)
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // 游戏状态
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
  const [aiThinking, setAiThinking] = useState(false)
  
  // 当前回合每个玩家出的牌
  const [roundPlays, setRoundPlays] = useState<Map<Player, Card[]>>(new Map())
  
  // 清理定时器
  useEffect(() => {
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current)
    }
  }, [])
  
  // 开始新游戏
  const startGame = useCallback(() => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current)
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
  }, [])
  
  // 叫地主
  const handleBid = useCallback((score: number) => {
    if (score > bidScore) {
      setBidScore(score)
      setLandlord(currentBidder)
    }
    
    const nextBidder = ((currentBidder + 1) % 3) as Player
    
    if (score === 3 || (nextBidder === 0 && (score > 0 || bidScore > 0))) {
      const finalLandlord = score === 3 ? currentBidder : (landlord ?? 0)
      setLandlord(finalLandlord)
      
      const newHands = [...hands]
      newHands[finalLandlord] = sortCards([...newHands[finalLandlord], ...dizhuCards])
      setHands(newHands)
      
      setCurrentPlayer(finalLandlord)
      setPhase('playing')
      setMessage(`${PLAYER_NAMES[finalLandlord]}是地主！`)
      setAiThinking(false)
      
      setTimeout(() => setMessage(''), 1500)
    } else {
      setCurrentBidder(nextBidder)
      setAiThinking(false)
    }
  }, [currentBidder, bidScore, landlord, hands, dizhuCards])
  
  // AI叫地主
  useEffect(() => {
    if (phase !== 'bidding' || currentBidder === 0 || aiThinking) return
    
    setAiThinking(true)
    aiTimerRef.current = setTimeout(() => {
      const handScore = evaluateHandForBidding(hands[currentBidder])
      let bid = 0
      
      if (handScore >= 20 && bidScore < 3) bid = 3
      else if (handScore >= 15 && bidScore < 2) bid = 2
      else if (handScore >= 10 && bidScore < 1) bid = 1
      
      setMessage(bid > bidScore ? `${PLAYER_NAMES[currentBidder]}叫${bid}分` : `${PLAYER_NAMES[currentBidder]}不叫`)
      
      aiTimerRef.current = setTimeout(() => {
        handleBid(bid)
      }, 800)
    }, 1000)
    
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current)
    }
  }, [phase, currentBidder, bidScore, hands, handleBid, aiThinking])
  
  // 选择牌
  const toggleCard = (cardId: string) => {
    if (phase !== 'playing' || currentPlayer !== 0) return
    
    const newSelected = new Set(selectedCards)
    if (newSelected.has(cardId)) {
      newSelected.delete(cardId)
    } else {
      newSelected.add(cardId)
    }
    setSelectedCards(newSelected)
  }
  
  // 出牌核心逻辑
  const playCards = useCallback((player: Player, cards: Card[]) => {
    // 记录本回合出牌
    setRoundPlays(prev => {
      const newMap = new Map(prev)
      newMap.set(player, cards)
      return newMap
    })
    
    let newPassCount = passCount
    
    if (cards.length === 0) {
      newPassCount = passCount + 1
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
      
      const newHands = [...hands]
      const cardIds = new Set(cards.map(c => c.id))
      newHands[player] = newHands[player].filter(c => !cardIds.has(c.id))
      setHands(newHands)
      
      if (newHands[player].length === 0) {
        setWinner(player === landlord ? 'landlord' : 'farmer')
        setPhase('ended')
        return
      }
    }
    
    const nextPlayer = ((player + 1) % 3) as Player
    setCurrentPlayer(nextPlayer)
    setSelectedCards(new Set())
    setAiThinking(false)
  }, [hands, landlord, passCount])
  
  // 玩家出牌
  const handlePlay = () => {
    const cards = hands[0].filter(c => selectedCards.has(c.id))
    
    if (cards.length === 0) {
      if (lastPlayPlayer !== 0 && lastPlayPlayer !== null) {
        playCards(0, [])
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
    
    playCards(0, cards)
  }
  
  // 不出
  const handlePass = () => {
    if (lastPlayPlayer === 0 || lastPlayPlayer === null) {
      setMessage('必须出牌！')
      setTimeout(() => setMessage(''), 1000)
      return
    }
    playCards(0, [])
  }
  
  // 提示
  const handleHint = () => {
    const needToBeat = lastPlayPlayer !== null && lastPlayPlayer !== 0
    const validPlays = hands[0].filter(c => {
      const result = analyzeHand([c])
      return needToBeat ? canBeat(result, lastPlay) : result.type !== 'invalid'
    })
    
    if (validPlays.length > 0) {
      setSelectedCards(new Set([validPlays[validPlays.length - 1].id]))
    }
  }
  
  // AI出牌
  useEffect(() => {
    if (phase !== 'playing' || currentPlayer === 0 || aiThinking) return
    
    setAiThinking(true)
    
    aiTimerRef.current = setTimeout(() => {
      const isLandlord = currentPlayer === landlord
      const needToBeat = lastPlayPlayer !== null && lastPlayPlayer !== currentPlayer
      
      const cards = aiDecide(
        hands[currentPlayer],
        needToBeat ? lastPlay : null,
        isLandlord,
        'normal'
      )
      
      aiTimerRef.current = setTimeout(() => {
        playCards(currentPlayer, cards || [])
      }, 500)
    }, 800)
    
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current)
    }
  }, [phase, currentPlayer, hands, lastPlay, lastPlayPlayer, landlord, aiThinking, playCards])
  
  // 渲染单张牌
  const renderCard = (card: Card, isSelected: boolean, onClick?: () => void, size: 'normal' | 'small' | 'tiny' = 'normal') => {
    const isJoker = card.suit === 'joker'
    const color = SUIT_COLORS[card.suit]
    
    const sizeClass = size === 'tiny' ? 'w-6 h-8' : size === 'small' ? 'w-8 h-11' : 'w-11 h-[60px]'
    const fontSize = size === 'tiny' ? 'text-[9px]' : size === 'small' ? 'text-[11px]' : 'text-sm'
    const suitSize = size === 'tiny' ? 'text-[7px]' : size === 'small' ? 'text-[9px]' : 'text-[11px]'
    
    return (
      <div
        key={card.id}
        onClick={onClick}
        className={`
          ${sizeClass}
          bg-white rounded shadow border border-gray-300
          flex flex-col items-center justify-center flex-shrink-0
          ${onClick ? 'cursor-pointer active:scale-95' : ''}
          ${isSelected ? '-translate-y-3 ring-2 ring-yellow-400 shadow-lg' : ''}
          transition-all duration-100
        `}
        style={{ color }}
      >
        {isJoker ? (
          <span className={`${size === 'tiny' ? 'text-[6px]' : 'text-[8px]'} font-bold text-center leading-tight`}>
            {card.rank === 16 ? '小王' : '大王'}
          </span>
        ) : (
          <>
            <span className={`${fontSize} font-bold leading-none`}>{card.display}</span>
            <span className={`${suitSize} leading-none`}>{SUIT_SYMBOLS[card.suit]}</span>
          </>
        )}
      </div>
    )
  }
  
  // 渲染出的牌
  const renderPlayedCards = (player: Player, size: 'small' | 'tiny' = 'small') => {
    const cards = roundPlays.get(player)
    if (cards === undefined) return null
    
    if (cards.length === 0) {
      return <div className="text-yellow-300 text-xs bg-black/40 px-2 py-1 rounded">不出</div>
    }
    
    return (
      <div className={`flex ${size === 'tiny' ? '-space-x-3' : '-space-x-4'}`}>
        {cards.map(card => renderCard(card, false, undefined, size))}
      </div>
    )
  }

  return (
    <div 
      className="flex flex-col h-full bg-gradient-to-br from-emerald-900 via-green-800 to-green-900 overflow-hidden"
      style={{ 
        // 强制横屏显示
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
        {phase !== 'playing' && <div className="w-5" />}
      </div>
      
      {/* 消息提示 */}
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
          <button
            onClick={startGame}
            className="px-6 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full shadow-lg active:scale-95"
          >
            开始游戏
          </button>
        </div>
      )}
      
      {/* 叫地主阶段 */}
      {phase === 'bidding' && (
        <div className="flex-1 flex">
          {/* 左边电脑B */}
          <div className="w-20 flex flex-col items-center justify-center">
            <PlayerAvatar 
              name="电脑B" 
              isActive={currentBidder === 2}
              isLandlord={false}
              isComputer={true}
              cardCount={hands[2].length}
            />
          </div>
          
          {/* 中间区域 */}
          <div className="flex-1 flex flex-col">
            {/* 底牌和叫分 */}
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="text-white/70 text-xs">底牌</div>
              <div className="flex gap-1">
                {dizhuCards.map(card => (
                  <div key={card.id} className="w-8 h-11 bg-gradient-to-br from-pink-300 to-pink-400 rounded border-2 border-pink-200 shadow" />
                ))}
              </div>
              
              {currentBidder === 0 && !aiThinking && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleBid(0)} className="px-3 py-1.5 bg-gray-600 text-white rounded text-xs active:scale-95">不叫</button>
                  {bidScore < 1 && <button onClick={() => handleBid(1)} className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs active:scale-95">1分</button>}
                  {bidScore < 2 && <button onClick={() => handleBid(2)} className="px-3 py-1.5 bg-purple-500 text-white rounded text-xs active:scale-95">2分</button>}
                  {bidScore < 3 && <button onClick={() => handleBid(3)} className="px-3 py-1.5 bg-orange-500 text-white rounded text-xs active:scale-95">3分</button>}
                </div>
              )}
              
              {aiThinking && <div className="text-white/70 text-xs">{PLAYER_NAMES[currentBidder]} 思考中...</div>}
            </div>
            
            {/* 玩家手牌 */}
            <div className="h-24 flex items-end pb-2">
              <div className="flex items-center gap-2 w-full">
                <PlayerAvatar 
                  name="我" 
                  isActive={currentBidder === 0}
                  isLandlord={false}
                  isComputer={false}
                  cardCount={hands[0].length}
                />
                <div ref={handScrollRef} className="flex-1 flex gap-0.5 overflow-x-auto hide-scrollbar">
                  {hands[0].map(card => renderCard(card, selectedCards.has(card.id), () => toggleCard(card.id), 'small'))}
                </div>
              </div>
            </div>
          </div>
          
          {/* 右边电脑A */}
          <div className="w-20 flex flex-col items-center justify-center">
            <PlayerAvatar 
              name="电脑A" 
              isActive={currentBidder === 1}
              isLandlord={false}
              isComputer={true}
              cardCount={hands[1].length}
            />
          </div>
        </div>
      )}
      
      {/* 游戏进行中 - 横屏布局 */}
      {phase === 'playing' && (
        <div className="flex-1 flex">
          {/* 左边电脑B */}
          <div className="w-24 flex flex-col items-center justify-center gap-2 px-1">
            <PlayerAvatar 
              name="电脑B" 
              isActive={currentPlayer === 2}
              isLandlord={landlord === 2}
              isComputer={true}
              cardCount={hands[2].length}
            />
            <div className="min-h-[44px] flex items-center">
              {renderPlayedCards(2, 'tiny')}
            </div>
          </div>
          
          {/* 中间区域 */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* 中央出牌区 */}
            <div className="flex-1 flex items-center justify-center">
              <div className="min-h-[50px] flex items-center">
                {renderPlayedCards(0, 'small')}
              </div>
            </div>
            
            {/* 玩家手牌和按钮 */}
            <div className="pb-2 px-2">
              <div className="flex items-end gap-2">
                {/* 玩家头像 */}
                <PlayerAvatar 
                  name="我" 
                  isActive={currentPlayer === 0}
                  isLandlord={landlord === 0}
                  isComputer={false}
                  cardCount={hands[0].length}
                />
                
                {/* 手牌 */}
                <div className="flex-1 min-w-0">
                  <div ref={handScrollRef} className="flex gap-0.5 overflow-x-auto hide-scrollbar pb-1">
                    {hands[0].map(card => renderCard(card, selectedCards.has(card.id), () => toggleCard(card.id), 'small'))}
                  </div>
                </div>
                
                {/* 操作按钮 */}
                {currentPlayer === 0 && !aiThinking && (
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={handleHint} className="px-2 py-1 bg-blue-500 text-white rounded text-[10px] active:scale-95">提示</button>
                    <button 
                      onClick={handlePass} 
                      disabled={lastPlayPlayer === 0 || lastPlayPlayer === null}
                      className="px-2 py-1 bg-gray-600 text-white rounded text-[10px] active:scale-95 disabled:opacity-40"
                    >不出</button>
                    <button onClick={handlePlay} className="px-2 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded text-[10px] font-bold active:scale-95">出牌</button>
                  </div>
                )}
                
                {currentPlayer !== 0 && (
                  <div className="text-white/70 text-[10px] flex-shrink-0 w-12 text-center">
                    等待中...
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* 右边电脑A */}
          <div className="w-24 flex flex-col items-center justify-center gap-2 px-1">
            <PlayerAvatar 
              name="电脑A" 
              isActive={currentPlayer === 1}
              isLandlord={landlord === 1}
              isComputer={true}
              cardCount={hands[1].length}
            />
            <div className="min-h-[44px] flex items-center">
              {renderPlayedCards(1, 'tiny')}
            </div>
          </div>
        </div>
      )}
      
      {/* 游戏结束 */}
      {phase === 'ended' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-5xl">
            {winner === 'landlord' 
              ? (landlord === 0 ? '🎉' : '😢')
              : (landlord === 0 ? '😢' : '🎉')
            }
          </div>
          <h2 className="text-white text-xl font-bold">
            {winner === 'landlord'
              ? (landlord === 0 ? '恭喜你赢了！' : '地主获胜')
              : (landlord === 0 ? '农民获胜' : '恭喜你赢了！')
            }
          </h2>
          <button
            onClick={startGame}
            className="px-6 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full shadow-lg active:scale-95"
          >
            再来一局
          </button>
          <button onClick={() => navigate(-1)} className="text-white/70 underline text-sm">返回</button>
        </div>
      )}
      
      {/* 闪烁边框动画样式 */}
      <style>{`
        @keyframes pulse-border {
          0%, 100% { box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.8), 0 0 15px rgba(250, 204, 21, 0.4); }
          50% { box-shadow: 0 0 0 5px rgba(250, 204, 21, 1), 0 0 25px rgba(250, 204, 21, 0.7); }
        }
        .animate-pulse-border {
          animation: pulse-border 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
