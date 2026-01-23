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
type Player = 0 | 1 | 2 // 0=玩家, 1=右边AI, 2=左边AI

const PLAYER_NAMES = ['你', '电脑A', '电脑B']

// 电脑头像组件
function ComputerAvatar({ name, isActive, isLandlord }: { name: string; isActive: boolean; isLandlord: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative w-12 h-12 rounded-full flex items-center justify-center shadow-lg ${
        isActive ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-green-800' : ''
      }`} style={{
        background: name === '电脑A' 
          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
      }}>
        <span className="text-white text-lg">🤖</span>
        {isLandlord && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center shadow">
            <span className="text-[10px]">👑</span>
          </div>
        )}
      </div>
      <span className="text-white text-xs font-medium">{name}</span>
    </div>
  )
}

export default function DoudizhuScreen() {
  const navigate = useNavigate()
  const handScrollRef = useRef<HTMLDivElement>(null)
  
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
  const [, setPlayedCards] = useState<{ player: Player; cards: Card[] }[]>([])
  const [winner, setWinner] = useState<'landlord' | 'farmer' | null>(null)
  const [message, setMessage] = useState('')
  const [bidScore, setBidScore] = useState(0)
  const [currentBidder, setCurrentBidder] = useState<Player>(0)
  const [aiThinking, setAiThinking] = useState(false)
  
  // 用于追踪当前回合的出牌（每回合重置）
  const [currentRoundPlays, setCurrentRoundPlays] = useState<Map<Player, Card[]>>(new Map())
  
  // 开始新游戏
  const startGame = useCallback(() => {
    const { hands: newHands, dizhu } = dealCards()
    setHands(newHands)
    setDizhuCards(dizhu)
    setLandlord(null)
    setCurrentPlayer(0)
    setLastPlay(null)
    setLastPlayPlayer(null)
    setPassCount(0)
    setSelectedCards(new Set())
    setPlayedCards([])
    setCurrentRoundPlays(new Map())
    setWinner(null)
    setMessage('')
    setBidScore(0)
    setCurrentBidder(0)
    setPhase('bidding')
  }, [])
  
  // 叫地主
  const handleBid = useCallback((score: number) => {
    if (score > bidScore) {
      setBidScore(score)
      setLandlord(currentBidder)
    }
    
    const nextBidder = ((currentBidder + 1) % 3) as Player
    
    // 如果叫到3分或者所有人都叫过了
    if (score === 3 || (nextBidder === 0 && (score > 0 || bidScore > 0))) {
      // 确定地主
      const finalLandlord = score === 3 ? currentBidder : (landlord ?? 0)
      setLandlord(finalLandlord)
      
      // 地主拿底牌
      const newHands = [...hands]
      newHands[finalLandlord] = sortCards([...newHands[finalLandlord], ...dizhuCards])
      setHands(newHands)
      
      setCurrentPlayer(finalLandlord)
      setPhase('playing')
      setMessage(`${PLAYER_NAMES[finalLandlord]}是地主！`)
      
      setTimeout(() => setMessage(''), 1500)
    } else {
      setCurrentBidder(nextBidder)
    }
  }, [currentBidder, bidScore, landlord, hands, dizhuCards])
  
  // AI叫地主
  useEffect(() => {
    if (phase !== 'bidding' || currentBidder === 0) return
    
    setAiThinking(true)
    const timer = setTimeout(() => {
      const handScore = evaluateHandForBidding(hands[currentBidder])
      let bid = 0
      
      if (handScore >= 20 && bidScore < 3) bid = 3
      else if (handScore >= 15 && bidScore < 2) bid = 2
      else if (handScore >= 10 && bidScore < 1) bid = 1
      
      if (bid > bidScore) {
        setMessage(`${PLAYER_NAMES[currentBidder]}叫${bid}分`)
      } else {
        setMessage(`${PLAYER_NAMES[currentBidder]}不叫`)
      }
      
      setTimeout(() => {
        handleBid(bid)
        setAiThinking(false)
      }, 800)
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [phase, currentBidder, bidScore, hands, handleBid])
  
  // 选择/取消选择牌
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
  
  // 出牌
  const playCards = useCallback((player: Player, cards: Card[]) => {
    // 更新当前回合的出牌记录
    const newRoundPlays = new Map(currentRoundPlays)
    newRoundPlays.set(player, cards)
    setCurrentRoundPlays(newRoundPlays)
    
    if (cards.length === 0) {
      // 不出
      const newPassCount = passCount + 1
      setPassCount(newPassCount)
      setPlayedCards(prev => [...prev, { player, cards: [] }])
      
      // 如果连续两个人不出，清空上家，开始新回合
      if (newPassCount >= 2) {
        setLastPlay(null)
        setLastPlayPlayer(null)
        setPassCount(0)
        setCurrentRoundPlays(new Map())
      }
    } else {
      const result = analyzeHand(cards)
      setLastPlay(result)
      setLastPlayPlayer(player)
      setPassCount(0)
      setPlayedCards(prev => [...prev, { player, cards }])
      
      // 从手牌中移除
      const newHands = [...hands]
      const cardIds = new Set(cards.map(c => c.id))
      newHands[player] = newHands[player].filter(c => !cardIds.has(c.id))
      setHands(newHands)
      
      // 检查是否获胜
      if (newHands[player].length === 0) {
        const isLandlordWin = player === landlord
        setWinner(isLandlordWin ? 'landlord' : 'farmer')
        setPhase('ended')
        return
      }
    }
    
    // 下一个玩家
    setCurrentPlayer(prev => ((prev + 1) % 3) as Player)
    setSelectedCards(new Set())
  }, [hands, landlord, passCount, currentRoundPlays])
  
  // 玩家出牌
  const handlePlay = () => {
    const cards = hands[0].filter(c => selectedCards.has(c.id))
    
    if (cards.length === 0) {
      // 不出（只有不是自己回合才能不出）
      if (lastPlayPlayer !== 0) {
        playCards(0, [])
        setMessage('不出')
        setTimeout(() => setMessage(''), 800)
      }
      return
    }
    
    const result = analyzeHand(cards)
    
    if (result.type === 'invalid') {
      setMessage('无效牌型！')
      setTimeout(() => setMessage(''), 1000)
      return
    }
    
    if (!canBeat(result, lastPlayPlayer === 0 ? null : lastPlay)) {
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
    setMessage('不出')
    setTimeout(() => setMessage(''), 800)
  }
  
  // 提示
  const handleHint = () => {
    const validPlays = hands[0].filter(c => {
      const result = analyzeHand([c])
      return canBeat(result, lastPlayPlayer === 0 ? null : lastPlay)
    })
    
    if (validPlays.length > 0) {
      // 简单提示：选中最小的能出的牌
      setSelectedCards(new Set([validPlays[validPlays.length - 1].id]))
    }
  }
  
  // AI出牌 - 修复：确保AI会出牌
  useEffect(() => {
    if (phase !== 'playing' || currentPlayer === 0) return
    if (aiThinking) return
    
    setAiThinking(true)
    
    const timer = setTimeout(() => {
      const isLandlord = currentPlayer === landlord
      // 判断是否需要接牌：如果上家是自己，则不需要接
      const needToBeat = lastPlayPlayer !== null && lastPlayPlayer !== currentPlayer
      const cards = aiDecide(
        hands[currentPlayer],
        needToBeat ? lastPlay : null,
        isLandlord,
        'normal'
      )
      
      if (cards && cards.length > 0) {
        setMessage(`${PLAYER_NAMES[currentPlayer]}出牌`)
      } else {
        setMessage(`${PLAYER_NAMES[currentPlayer]}不出`)
      }
      
      setTimeout(() => {
        playCards(currentPlayer, cards || [])
        setAiThinking(false)
        setMessage('')
      }, 600)
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [phase, currentPlayer, hands, lastPlay, lastPlayPlayer, landlord, aiThinking, playCards])
  
  // 渲染单张牌（竖屏优化：更小的牌）
  const renderCard = (card: Card, isSelected: boolean, onClick?: () => void, small = false) => {
    const isJoker = card.suit === 'joker'
    const color = SUIT_COLORS[card.suit]
    
    return (
      <div
        key={card.id}
        onClick={onClick}
        className={`
          ${small ? 'w-7 h-10' : 'w-10 h-14'} 
          bg-white rounded-md shadow-md border border-gray-200
          flex flex-col items-center justify-center flex-shrink-0
          ${onClick ? 'cursor-pointer active:scale-95' : ''}
          ${isSelected ? '-translate-y-4 shadow-lg ring-2 ring-yellow-400' : ''}
          transition-all duration-150
        `}
        style={{ color }}
      >
        {isJoker ? (
          <span className={`${small ? 'text-[7px]' : 'text-[9px]'} font-bold text-center leading-tight`}>
            {card.rank === 16 ? '小' : '大'}
            <br />
            王
          </span>
        ) : (
          <>
            <span className={`${small ? 'text-[11px]' : 'text-sm'} font-bold leading-none`}>
              {card.display}
            </span>
            <span className={`${small ? 'text-[9px]' : 'text-[11px]'} leading-none`}>
              {SUIT_SYMBOLS[card.suit]}
            </span>
          </>
        )}
      </div>
    )
  }
  
  // 渲染玩家手牌（可滚动）
  const renderPlayerHand = () => {
    const cards = hands[0]
    
    return (
      <div className="w-full px-2">
        <div 
          ref={handScrollRef}
          className="flex gap-1 overflow-x-auto pb-2 hide-scrollbar"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {cards.map(card => (
            <div key={card.id} style={{ scrollSnapAlign: 'start' }}>
              {renderCard(
                card,
                selectedCards.has(card.id),
                () => toggleCard(card.id)
              )}
            </div>
          ))}
        </div>
        <div className="text-center text-white/60 text-xs mt-1">
          {cards.length}张牌 {landlord === 0 && '👑 地主'}
        </div>
      </div>
    )
  }
  
  // 渲染AI信息和出牌
  const renderAIPlayer = (playerIndex: 1 | 2) => {
    const cards = hands[playerIndex]
    const isActive = currentPlayer === playerIndex
    const isLandlordPlayer = landlord === playerIndex
    const roundPlay = currentRoundPlays.get(playerIndex)
    
    return (
      <div className="flex flex-col items-center gap-2">
        <ComputerAvatar 
          name={PLAYER_NAMES[playerIndex]} 
          isActive={isActive}
          isLandlord={isLandlordPlayer}
        />
        <div className="bg-black/30 rounded-lg px-2 py-1 text-xs text-white">
          {cards.length}张
        </div>
        {/* 显示这回合出的牌 */}
        <div className="min-h-[44px] flex items-center justify-center">
          {roundPlay !== undefined ? (
            roundPlay.length > 0 ? (
              <div className="flex -space-x-3">
                {roundPlay.map(card => renderCard(card, false, undefined, true))}
              </div>
            ) : (
              <div className="text-yellow-300 text-sm font-medium bg-black/30 px-3 py-1 rounded">不出</div>
            )
          ) : null}
        </div>
      </div>
    )
  }
  
  // 渲染玩家出的牌
  const renderPlayerPlayedCards = () => {
    const roundPlay = currentRoundPlays.get(0)
    
    if (roundPlay === undefined) return null
    
    return roundPlay.length > 0 ? (
      <div className="flex -space-x-3 justify-center">
        {roundPlay.map(card => renderCard(card, false, undefined, true))}
      </div>
    ) : (
      <div className="text-yellow-300 text-sm font-medium bg-black/30 px-3 py-1 rounded">不出</div>
    )
  }
  
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-emerald-800 via-green-800 to-green-900">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/30">
        <button
          onClick={() => navigate(-1)}
          className="text-white/80 hover:text-white p-1"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-white font-bold">🃏 斗地主</h1>
        <div className="w-5" />
      </div>
      
      {/* 游戏区域 */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* 消息提示 */}
        {message && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-black/80 text-white px-5 py-2.5 rounded-xl text-base font-medium shadow-xl">
            {message}
          </div>
        )}
        
        {/* 开始界面 */}
        {phase === 'idle' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <div className="text-7xl animate-bounce">🃏</div>
            <h2 className="text-white text-2xl font-bold">欢乐斗地主</h2>
            <p className="text-white/60 text-sm">单机模式 · 不消耗API</p>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full text-lg shadow-lg active:scale-95 transition-transform"
            >
              开始游戏
            </button>
          </div>
        )}
        
        {/* 叫地主阶段 */}
        {phase === 'bidding' && (
          <div className="flex-1 flex flex-col">
            {/* 上方两个AI */}
            <div className="flex justify-around px-4 py-3">
              <ComputerAvatar 
                name="电脑B" 
                isActive={currentBidder === 2}
                isLandlord={false}
              />
              <ComputerAvatar 
                name="电脑A" 
                isActive={currentBidder === 1}
                isLandlord={false}
              />
            </div>
            
            {/* 中间底牌 */}
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div className="text-white/70 text-sm">底牌</div>
              <div className="flex gap-2">
                {dizhuCards.map(card => (
                  <div key={card.id} className="w-9 h-12 bg-gradient-to-br from-pink-300 to-pink-400 rounded-md border-2 border-pink-200 shadow-lg" />
                ))}
              </div>
              
              {currentBidder === 0 && !aiThinking && (
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => handleBid(0)}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium active:scale-95 text-sm"
                  >
                    不叫
                  </button>
                  {bidScore < 1 && (
                    <button
                      onClick={() => handleBid(1)}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium active:scale-95 text-sm"
                    >
                      1分
                    </button>
                  )}
                  {bidScore < 2 && (
                    <button
                      onClick={() => handleBid(2)}
                      className="px-4 py-2 bg-purple-500 text-white rounded-lg font-medium active:scale-95 text-sm"
                    >
                      2分
                    </button>
                  )}
                  {bidScore < 3 && (
                    <button
                      onClick={() => handleBid(3)}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium active:scale-95 text-sm"
                    >
                      3分
                    </button>
                  )}
                </div>
              )}
              
              {aiThinking && (
                <div className="text-white/70 text-sm mt-4">
                  {PLAYER_NAMES[currentBidder]} 思考中...
                </div>
              )}
            </div>
            
            {/* 玩家手牌 */}
            <div className="pb-3">
              {renderPlayerHand()}
            </div>
          </div>
        )}
        
        {/* 游戏进行中 */}
        {phase === 'playing' && (
          <div className="flex-1 flex flex-col">
            {/* 上方两个AI */}
            <div className="flex justify-around px-2 py-2">
              {renderAIPlayer(2)}
              {renderAIPlayer(1)}
            </div>
            
            {/* 中间区域 */}
            <div className="flex-1 flex flex-col items-center justify-center gap-2">
              {/* 底牌展示 */}
              <div className="flex items-center gap-1 bg-black/20 rounded-lg px-2 py-1">
                <span className="text-white/50 text-[10px]">底牌</span>
                {dizhuCards.map(card => renderCard(card, false, undefined, true))}
              </div>
              
              {/* 玩家出的牌 */}
              <div className="min-h-[50px] flex items-center justify-center">
                {renderPlayerPlayedCards()}
              </div>
            </div>
            
            {/* 玩家手牌和操作按钮 */}
            <div className="pb-2">
              {renderPlayerHand()}
              
              {currentPlayer === 0 && !aiThinking && (
                <div className="flex justify-center gap-2 mt-2">
                  <button
                    onClick={handleHint}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium active:scale-95 text-sm"
                  >
                    提示
                  </button>
                  <button
                    onClick={handlePass}
                    disabled={lastPlayPlayer === 0 || lastPlayPlayer === null}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg font-medium active:scale-95 disabled:opacity-40 text-sm"
                  >
                    不出
                  </button>
                  <button
                    onClick={handlePlay}
                    className="px-5 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg font-bold active:scale-95 text-sm"
                  >
                    出牌
                  </button>
                </div>
              )}
              
              {currentPlayer !== 0 && (
                <div className="text-center text-white/70 text-sm mt-2">
                  等待 {PLAYER_NAMES[currentPlayer]} 出牌...
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* 游戏结束 */}
        {phase === 'ended' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <div className="text-6xl">
              {winner === 'landlord' 
                ? (landlord === 0 ? '🎉' : '😢')
                : (landlord === 0 ? '😢' : '🎉')
              }
            </div>
            <h2 className="text-white text-2xl font-bold">
              {winner === 'landlord'
                ? (landlord === 0 ? '恭喜你赢了！' : '地主获胜')
                : (landlord === 0 ? '农民获胜' : '恭喜你赢了！')
              }
            </h2>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full text-lg shadow-lg active:scale-95 transition-transform"
            >
              再来一局
            </button>
            <button
              onClick={() => navigate(-1)}
              className="text-white/70 underline text-sm"
            >
              返回
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
