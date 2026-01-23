import { useState, useEffect, useCallback } from 'react'
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

export default function DoudizhuScreen() {
  const navigate = useNavigate()
  
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
  const [playedCards, setPlayedCards] = useState<{ player: Player; cards: Card[] }[]>([])
  const [winner, setWinner] = useState<'landlord' | 'farmer' | null>(null)
  const [message, setMessage] = useState('')
  const [bidScore, setBidScore] = useState(0)
  const [currentBidder, setCurrentBidder] = useState<Player>(0)
  const [aiThinking, setAiThinking] = useState(false)
  
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
    if (cards.length === 0) {
      // 不出
      setPassCount(prev => prev + 1)
      setPlayedCards(prev => [...prev, { player, cards: [] }])
      
      // 如果连续两个人不出，清空上家
      if (passCount >= 1) {
        setLastPlay(null)
        setLastPlayPlayer(null)
        setPassCount(0)
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
  }, [hands, landlord, passCount])
  
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
  
  // AI出牌
  useEffect(() => {
    if (phase !== 'playing' || currentPlayer === 0 || aiThinking) return
    
    setAiThinking(true)
    const timer = setTimeout(() => {
      const isLandlord = currentPlayer === landlord
      const cards = aiDecide(
        hands[currentPlayer],
        lastPlayPlayer === currentPlayer ? null : lastPlay,
        isLandlord,
        'normal'
      )
      
      if (cards) {
        setMessage(`${PLAYER_NAMES[currentPlayer]}出牌`)
      } else {
        setMessage(`${PLAYER_NAMES[currentPlayer]}不出`)
      }
      
      setTimeout(() => {
        playCards(currentPlayer, cards || [])
        setAiThinking(false)
        setMessage('')
      }, 600)
    }, 1200)
    
    return () => clearTimeout(timer)
  }, [phase, currentPlayer, hands, lastPlay, lastPlayPlayer, landlord, aiThinking, playCards])
  
  // 渲染单张牌
  const renderCard = (card: Card, isSelected: boolean, onClick?: () => void, small = false) => {
    const isJoker = card.suit === 'joker'
    const color = SUIT_COLORS[card.suit]
    
    return (
      <div
        key={card.id}
        onClick={onClick}
        className={`
          ${small ? 'w-8 h-11' : 'w-12 h-16'} 
          bg-white rounded-lg shadow-md border border-gray-200
          flex flex-col items-center justify-center
          ${onClick ? 'cursor-pointer active:scale-95' : ''}
          ${isSelected ? '-translate-y-3' : ''}
          transition-transform duration-150
        `}
        style={{ color }}
      >
        {isJoker ? (
          <span className={`${small ? 'text-[8px]' : 'text-[10px]'} font-bold`}>
            {card.display}
          </span>
        ) : (
          <>
            <span className={`${small ? 'text-xs' : 'text-sm'} font-bold leading-none`}>
              {card.display}
            </span>
            <span className={`${small ? 'text-[10px]' : 'text-xs'} leading-none`}>
              {SUIT_SYMBOLS[card.suit]}
            </span>
          </>
        )}
      </div>
    )
  }
  
  // 渲染手牌
  const renderHand = (playerIndex: Player, _isHidden = false) => {
    const cards = hands[playerIndex]
    const isCurrentPlayer = currentPlayer === playerIndex
    const isLandlordPlayer = landlord === playerIndex
    
    if (playerIndex === 0) {
      // 玩家的牌（展开显示）
      return (
        <div className="flex justify-center">
          <div className="flex -space-x-6 overflow-x-auto max-w-full px-2">
            {cards.map(card => renderCard(
              card,
              selectedCards.has(card.id),
              () => toggleCard(card.id)
            ))}
          </div>
        </div>
      )
    }
    
    // AI的牌（隐藏或小牌显示）
    return (
      <div className="flex items-center gap-1">
        <div className={`text-xs font-medium ${isCurrentPlayer ? 'text-pink-500' : 'text-gray-500'}`}>
          {PLAYER_NAMES[playerIndex]}
          {isLandlordPlayer && <span className="ml-1 text-yellow-500">👑</span>}
        </div>
        <div className="bg-pink-100 rounded-lg px-2 py-1 text-xs font-bold text-pink-600">
          {cards.length}张
        </div>
      </div>
    )
  }
  
  // 渲染出的牌
  const renderPlayedCards = (playerIndex: Player) => {
    const lastPlayed = [...playedCards].reverse().find(p => p.player === playerIndex)
    if (!lastPlayed || lastPlayed.cards.length === 0) {
      if (playedCards.some(p => p.player === playerIndex && p.cards.length === 0)) {
        return <div className="text-gray-400 text-sm">不出</div>
      }
      return null
    }
    
    return (
      <div className="flex -space-x-4">
        {lastPlayed.cards.map(card => renderCard(card, false, undefined, true))}
      </div>
    )
  }
  
  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-green-800 to-green-900">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/20">
          <button
            onClick={() => navigate(-1)}
            className="text-white/80 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-white font-bold text-lg">斗地主</h1>
          <div className="w-6" />
        </div>
        
        {/* 游戏区域 */}
        <div className="flex-1 flex flex-col relative">
          {/* 消息提示 */}
          {message && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-black/70 text-white px-6 py-3 rounded-xl text-lg font-medium">
              {message}
            </div>
          )}
          
          {/* 开始界面 */}
          {phase === 'idle' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
              <div className="text-6xl">🃏</div>
              <h2 className="text-white text-2xl font-bold">欢乐斗地主</h2>
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
              <div className="flex justify-between px-6 py-3">
                {renderHand(2)}
                {renderHand(1)}
              </div>
              
              {/* 中间底牌 */}
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <div className="text-white/70 text-sm">底牌</div>
                <div className="flex gap-2">
                  {dizhuCards.map(card => (
                    <div key={card.id} className="w-10 h-14 bg-pink-200 rounded-lg border-2 border-pink-300" />
                  ))}
                </div>
                
                {currentBidder === 0 && !aiThinking && (
                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => handleBid(0)}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg font-medium active:scale-95"
                    >
                      不叫
                    </button>
                    {bidScore < 1 && (
                      <button
                        onClick={() => handleBid(1)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium active:scale-95"
                      >
                        1分
                      </button>
                    )}
                    {bidScore < 2 && (
                      <button
                        onClick={() => handleBid(2)}
                        className="px-4 py-2 bg-purple-500 text-white rounded-lg font-medium active:scale-95"
                      >
                        2分
                      </button>
                    )}
                    {bidScore < 3 && (
                      <button
                        onClick={() => handleBid(3)}
                        className="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium active:scale-95"
                      >
                        3分
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              {/* 玩家手牌 */}
              <div className="pb-4">
                {renderHand(0)}
              </div>
            </div>
          )}
          
          {/* 游戏进行中 */}
          {phase === 'playing' && (
            <div className="flex-1 flex flex-col">
              {/* 上方两个AI */}
              <div className="flex justify-between px-4 py-2">
                <div className="flex flex-col items-start gap-2">
                  {renderHand(2)}
                  <div className="min-h-[50px] flex items-center">
                    {renderPlayedCards(2)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {renderHand(1)}
                  <div className="min-h-[50px] flex items-center">
                    {renderPlayedCards(1)}
                  </div>
                </div>
              </div>
              
              {/* 中间区域 - 底牌和玩家出的牌 */}
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                {/* 底牌展示 */}
                <div className="flex gap-1 mb-2">
                  <div className="text-white/50 text-xs mr-2">底牌:</div>
                  {dizhuCards.map(card => renderCard(card, false, undefined, true))}
                </div>
                
                {/* 玩家出的牌 */}
                <div className="min-h-[60px] flex items-center">
                  {renderPlayedCards(0)}
                </div>
                
                {/* 地主标识 */}
                <div className="text-white/70 text-sm">
                  {landlord === 0 ? '👑 你是地主' : `👑 ${PLAYER_NAMES[landlord!]}是地主`}
                </div>
              </div>
              
              {/* 玩家手牌和操作按钮 */}
              <div className="pb-3">
                {renderHand(0)}
                
                {currentPlayer === 0 && !aiThinking && (
                  <div className="flex justify-center gap-3 mt-3">
                    <button
                      onClick={handleHint}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium active:scale-95"
                    >
                      提示
                    </button>
                    <button
                      onClick={handlePass}
                      disabled={lastPlayPlayer === 0 || lastPlayPlayer === null}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg font-medium active:scale-95 disabled:opacity-50"
                    >
                      不出
                    </button>
                    <button
                      onClick={handlePlay}
                      className="px-6 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-lg font-bold active:scale-95"
                    >
                      出牌
                    </button>
                  </div>
                )}
                
                {currentPlayer !== 0 && (
                  <div className="text-center text-white/70 text-sm mt-3">
                    等待 {PLAYER_NAMES[currentPlayer]} 出牌...
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* 游戏结束 */}
          {phase === 'ended' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-6">
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
                className="text-white/70 underline"
              >
                返回
              </button>
            </div>
          )}
        </div>
      </div>
  )
}
