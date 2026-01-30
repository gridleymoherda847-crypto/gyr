import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useWeChat } from '../context/WeChatContext'

// 三个档位配置
const TIERS = [
  {
    id: 'low',
    name: '小赌怡情',
    price: 100,
    color: 'from-green-400 to-emerald-500',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    maxPrize: 10000,
    prizes: [
      { symbol: '💎', name: '头奖', amount: 10000, probability: 0.02 },
      { symbol: '🌟', name: '一等奖', amount: 2000, probability: 0.05 },
      { symbol: '🍒', name: '二等奖', amount: 500, probability: 0.10 },
      { symbol: '🍇', name: '三等奖', amount: 200, probability: 0.15 },
      { symbol: '🍊', name: '四等奖', amount: 100, probability: 0.20 },
      { symbol: '🍋', name: '五等奖', amount: 50, probability: 0.20 },
      { symbol: '😢', name: '未中奖', amount: 0, probability: 0.28 },
    ]
  },
  {
    id: 'mid',
    name: '适可而止',
    price: 500,
    color: 'from-yellow-400 to-orange-500',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    maxPrize: 100000,
    prizes: [
      { symbol: '💎', name: '头奖', amount: 100000, probability: 0.015 },
      { symbol: '🌟', name: '一等奖', amount: 20000, probability: 0.03 },
      { symbol: '🍒', name: '二等奖', amount: 5000, probability: 0.08 },
      { symbol: '🍇', name: '三等奖', amount: 1000, probability: 0.12 },
      { symbol: '🍊', name: '四等奖', amount: 500, probability: 0.18 },
      { symbol: '🍋', name: '五等奖', amount: 200, probability: 0.22 },
      { symbol: '😢', name: '未中奖', amount: 0, probability: 0.355 },
    ]
  },
  {
    id: 'high',
    name: '梭哈人生',
    price: 2000,
    color: 'from-red-400 to-rose-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    maxPrize: 1000000,
    prizes: [
      { symbol: '💎', name: '头奖', amount: 1000000, probability: 0.01 },
      { symbol: '🌟', name: '一等奖', amount: 100000, probability: 0.02 },
      { symbol: '🍒', name: '二等奖', amount: 20000, probability: 0.05 },
      { symbol: '🍇', name: '三等奖', amount: 5000, probability: 0.10 },
      { symbol: '🍊', name: '四等奖', amount: 2000, probability: 0.15 },
      { symbol: '🍋', name: '五等奖', amount: 500, probability: 0.25 },
      { symbol: '😢', name: '未中奖', amount: 0, probability: 0.42 },
    ]
  }
]

// 根据概率随机选择奖项
function randomPrize(tier: typeof TIERS[0]) {
  const rand = Math.random()
  let cumulative = 0
  for (const prize of tier.prizes) {
    cumulative += prize.probability
    if (rand < cumulative) {
      return prize
    }
  }
  return tier.prizes[tier.prizes.length - 1]
}

// 生成刮刮乐卡片（9个格子）
function generateCard(tier: typeof TIERS[0]): { symbols: string[]; prize: typeof tier.prizes[0] } {
  const prize = randomPrize(tier)
  const symbols: string[] = []
  
  if (prize.amount > 0) {
    symbols.push(prize.symbol, prize.symbol, prize.symbol)
    const otherSymbols = tier.prizes
      .filter(p => p.symbol !== prize.symbol && p.symbol !== '😢')
      .map(p => p.symbol)
    
    const usedCount: Record<string, number> = {}
    for (let i = 0; i < 6; i++) {
      let sym: string
      let attempts = 0
      do {
        sym = otherSymbols[Math.floor(Math.random() * otherSymbols.length)]
        attempts++
      } while ((usedCount[sym] || 0) >= 2 && attempts < 20)
      usedCount[sym] = (usedCount[sym] || 0) + 1
      symbols.push(sym)
    }
  } else {
    const allSymbols = tier.prizes
      .filter(p => p.symbol !== '😢')
      .map(p => p.symbol)
    
    const usedCount: Record<string, number> = {}
    for (let i = 0; i < 9; i++) {
      let sym: string
      let attempts = 0
      do {
        sym = allSymbols[Math.floor(Math.random() * allSymbols.length)]
        attempts++
      } while ((usedCount[sym] || 0) >= 2 && attempts < 20)
      usedCount[sym] = (usedCount[sym] || 0) + 1
      symbols.push(sym)
    }
  }
  
  for (let i = symbols.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[symbols[i], symbols[j]] = [symbols[j], symbols[i]]
  }
  
  return { symbols, prize }
}

// 格式化金额
function formatMoney(amount: number): string {
  if (amount >= 10000) {
    return `${(amount / 10000).toFixed(amount % 10000 === 0 ? 0 : 1)}万`
  }
  return amount.toLocaleString()
}

// 统计数据存储
const STATS_KEY = 'scratch_card_stats'
interface ScratchStats {
  totalCards: number
  totalSpent: number
  totalWon: number
}

function loadStats(): ScratchStats {
  try {
    const data = localStorage.getItem(STATS_KEY)
    if (data) return JSON.parse(data)
  } catch {}
  return { totalCards: 0, totalSpent: 0, totalWon: 0 }
}

function saveStats(stats: ScratchStats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {}
}

// 分享结果类型
interface ScratchResult {
  tierName: string
  tierColor: string
  price: number
  isWin: boolean
  prizeName: string
  prizeAmount: number
  prizeSymbol: string
}

// 分享战绩弹窗组件
function ShareDialog({ 
  result, 
  onClose 
}: { 
  result: ScratchResult
  onClose: () => void 
}) {
  const navigate = useNavigate()
  const { characters, addMessage } = useWeChat()
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)
  const [shared, setShared] = useState(false)
  
  const handleShare = () => {
    if (!selectedCharacter) return
    
    addMessage({
      characterId: selectedCharacter,
      content: JSON.stringify({
        type: 'scratch_card_result',
        tierName: result.tierName,
        price: result.price,
        isWin: result.isWin,
        prizeName: result.prizeName,
        prizeAmount: result.prizeAmount,
        prizeSymbol: result.prizeSymbol,
      }),
      isUser: true,
      type: 'scratch_share'
    })
    
    setShared(true)
    setTimeout(() => {
      onClose()
      navigate(`/apps/wechat/chat/${selectedCharacter}`)
    }, 1000)
  }
  
  return createPortal(
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="bg-gradient-to-br from-white to-gray-100 rounded-xl w-[86vw] max-w-[320px] max-h-[82vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-3 pt-3 pb-2">
          <h3 className="text-center font-bold text-sm">📤 分享战绩</h3>
        </div>

        {shared ? (
          <div className="flex-1 flex flex-col items-center justify-center py-6">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-green-600 font-medium text-sm">分享成功！</p>
          </div>
        ) : (
          <>
            <div className="px-3 flex-1 min-h-0 overflow-y-auto pb-2">
              {/* 战报卡片预览 */}
              <div className={`bg-gradient-to-br ${result.isWin ? 'from-yellow-400 to-orange-500' : 'from-gray-400 to-gray-500'} rounded-lg p-3 mb-3 text-white shadow`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs opacity-80">🎫 刮刮乐</span>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{result.tierName}</span>
                </div>
                <div className="text-center py-2">
                  <div className="text-3xl mb-1">
                    {result.isWin ? result.prizeSymbol.repeat(3) : '😢'}
                  </div>
                  <div className="text-lg font-bold">
                    {result.isWin ? `中奖 ¥${result.prizeAmount.toLocaleString()}` : '未中奖'}
                  </div>
                  <div className="text-xs opacity-80 mt-1">
                    本金 ¥{result.price} · {result.isWin ? result.prizeName : '谢谢参与'}
                  </div>
                </div>
              </div>
              
              {/* 选择好友 */}
              <p className="text-xs text-gray-500 mb-2">选择要分享的好友：</p>
              <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto">
                {characters.map(char => (
                  <button
                    key={char.id}
                    type="button"
                    onClick={() => setSelectedCharacter(char.id)}
                    className={`flex flex-col items-center p-1.5 rounded-lg transition-all ${
                      selectedCharacter === char.id 
                        ? 'bg-pink-100 ring-2 ring-pink-400' 
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <img 
                      src={char.avatar} 
                      alt={char.name} 
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <span className="text-[10px] text-gray-600 mt-1 truncate w-full text-center">
                      {char.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="px-3 py-2 border-t border-gray-200 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-lg bg-gray-200 text-gray-700 font-medium text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleShare}
                disabled={!selectedCharacter}
                className={`flex-1 py-2 rounded-lg text-white font-medium text-sm ${
                  selectedCharacter 
                    ? 'bg-gradient-to-r from-pink-500 to-rose-500' 
                    : 'bg-gray-300'
                }`}
              >
                发送
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export default function ScratchCardScreen() {
  const navigate = useNavigate()
  const { walletBalance, updateWalletBalance, addWalletBill } = useWeChat()
  
  const [selectedTier, setSelectedTier] = useState<typeof TIERS[0] | null>(null)
  const [card, setCard] = useState<{ symbols: string[]; prize: typeof TIERS[0]['prizes'][0] } | null>(null)
  const [revealed, setRevealed] = useState<boolean[]>([])
  const [isRevealing, setIsRevealing] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [settled, setSettled] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [pendingTier, setPendingTier] = useState<typeof TIERS[0] | null>(null)
  const [stats, setStats] = useState<ScratchStats>(loadStats)
  const [showShareDialog, setShowShareDialog] = useState(false)
  
  // 购买刮刮乐
  const handleBuy = useCallback((tier: typeof TIERS[0]) => {
    if (walletBalance < tier.price) {
      alert(`余额不足！需要 ¥${tier.price}，当前余额 ¥${walletBalance.toFixed(2)}`)
      return
    }
    
    if (tier.id === 'high' && !showWarning) {
      setPendingTier(tier)
      setShowWarning(true)
      return
    }
    
    updateWalletBalance(-tier.price)
    addWalletBill({
      type: 'shopping',
      amount: tier.price,
      description: `购买刮刮乐【${tier.name}】`,
    })
    
    const newCard = generateCard(tier)
    setCard(newCard)
    setRevealed(Array(9).fill(false))
    setSelectedTier(tier)
    setShowResult(false)
    setSettled(false)
    
    setStats(prev => {
      const next = { ...prev, totalCards: prev.totalCards + 1, totalSpent: prev.totalSpent + tier.price }
      saveStats(next)
      return next
    })
  }, [walletBalance, updateWalletBalance, addWalletBill, showWarning])
  
  // 确认购买高档位
  const confirmHighTier = () => {
    setShowWarning(false)
    if (pendingTier) {
      if (walletBalance < pendingTier.price) {
        alert(`余额不足！`)
        return
      }
      updateWalletBalance(-pendingTier.price)
      addWalletBill({
        type: 'shopping',
        amount: pendingTier.price,
        description: `购买刮刮乐【${pendingTier.name}】`,
      })
      const newCard = generateCard(pendingTier)
      setCard(newCard)
      setRevealed(Array(9).fill(false))
      setSelectedTier(pendingTier)
      setShowResult(false)
      setSettled(false)
      setStats(prev => {
        const next = { ...prev, totalCards: prev.totalCards + 1, totalSpent: prev.totalSpent + pendingTier.price }
        saveStats(next)
        return next
      })
      setPendingTier(null)
    }
  }
  
  // 结算奖金
  const settleResult = (currentCard: typeof card, tier: typeof selectedTier) => {
    if (!currentCard || !tier) return
    const prize = currentCard.prize
    if (prize.amount > 0) {
      updateWalletBalance(prize.amount)
      addWalletBill({
        type: 'transfer_in',
        amount: prize.amount,
        description: `刮刮乐【${tier.name}】中奖 - ${prize.name}`,
      })
      
      setStats(prev => {
        const next = { 
          ...prev, 
          totalWon: prev.totalWon + prize.amount,
        }
        saveStats(next)
        return next
      })
    }
  }
  
  // 刮开一个格子
  const revealCell = (index: number) => {
    if (!card || revealed[index] || isRevealing || settled) return
    
    setIsRevealing(true)
    const newRevealed = [...revealed]
    newRevealed[index] = true
    setRevealed(newRevealed)
    
    const symbolCount: Record<string, number> = {}
    newRevealed.forEach((r, i) => {
      if (r) {
        const sym = card.symbols[i]
        symbolCount[sym] = (symbolCount[sym] || 0) + 1
      }
    })
    
    const hasThree = Object.values(symbolCount).some(c => c >= 3)
    
    if (hasThree || newRevealed.every(Boolean)) {
      setTimeout(() => {
        const finalRevealed = Array(9).fill(true)
        setRevealed(finalRevealed)
        setTimeout(() => {
          setIsRevealing(false)
          setShowResult(true)
          setSettled(true)
          settleResult(card, selectedTier)
        }, 300)
      }, 200)
    } else {
      setTimeout(() => setIsRevealing(false), 150)
    }
  }
  
  // 再来一张
  const playAgain = () => {
    if (selectedTier) {
      setCard(null)
      setShowResult(false)
      setSettled(false)
    }
  }
  
  // 返回选择档位
  const backToSelect = () => {
    setSelectedTier(null)
    setCard(null)
    setShowResult(false)
    setSettled(false)
  }
  
  // 获取当前结果用于分享
  const getCurrentResult = (): ScratchResult | null => {
    if (!card || !selectedTier) return null
    return {
      tierName: selectedTier.name,
      tierColor: selectedTier.color,
      price: selectedTier.price,
      isWin: card.prize.amount > 0,
      prizeName: card.prize.name,
      prizeAmount: card.prize.amount,
      prizeSymbol: card.prize.symbol,
    }
  }
  
  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-purple-50 to-pink-50">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur border-b border-gray-100">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-gray-500"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="font-bold text-gray-800 text-lg">🎫 幸运刮刮乐</span>
        <div className="w-6" />
      </div>
      
      {/* 余额显示 */}
      <div className="px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white">
        <div className="flex items-center justify-between">
          <span className="text-sm opacity-90">💰 钱包余额</span>
          <span className="text-xl font-bold">¥ {walletBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {!selectedTier || !card ? (
          <>
            <div className="text-center mb-4">
              <p className="text-gray-600 text-sm">选择档位，试试手气~</p>
            </div>
            
            <div className="space-y-4">
              {TIERS.map(tier => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => handleBuy(tier)}
                  disabled={walletBalance < tier.price}
                  className={`w-full p-4 rounded-2xl border-2 ${tier.borderColor} ${tier.bgColor} ${
                    walletBalance < tier.price ? 'opacity-50' : 'active:scale-[0.98]'
                  } transition-transform`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tier.color} flex items-center justify-center text-2xl text-white font-bold`}>
                        {tier.id === 'low' ? '🟢' : tier.id === 'mid' ? '🟡' : '🔴'}
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-gray-800">{tier.name}</div>
                        <div className="text-xs text-gray-500">最高 ¥{formatMoney(tier.maxPrize)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold bg-gradient-to-r ${tier.color} bg-clip-text text-transparent`}>
                        ¥{tier.price}
                      </div>
                      <div className="text-xs text-gray-400">/张</div>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-xs text-gray-500">
                    {tier.prizes.slice(0, 4).map((p, i) => (
                      <div key={i} className="text-center">
                        <div className="text-lg">{p.symbol}</div>
                        <div>¥{formatMoney(p.amount)}</div>
                      </div>
                    ))}
                    <div className="text-center">
                      <div className="text-lg">...</div>
                      <div>更多</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            {/* 统计 - 只显示3项 */}
            <div className="mt-6 p-4 bg-white/60 rounded-2xl">
              <div className="text-sm font-medium text-gray-700 mb-3">📊 我的统计</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">累计抽奖</span>
                  <span className="font-medium">{stats.totalCards} 次</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">累计花销</span>
                  <span className="font-medium text-red-500">¥{formatMoney(stats.totalSpent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">累计中奖</span>
                  <span className="font-medium text-green-500">¥{formatMoney(stats.totalWon)}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-center mb-3">
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium text-white bg-gradient-to-r ${selectedTier.color}`}>
                {selectedTier.name} · ¥{selectedTier.price}
              </span>
            </div>
            
            {/* 刮刮乐卡片 */}
            <div className={`p-4 rounded-3xl ${selectedTier.bgColor} border-2 ${selectedTier.borderColor} shadow-lg`}>
              <div className="grid grid-cols-3 gap-3">
                {card.symbols.map((symbol, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => revealCell(index)}
                    disabled={revealed[index] || showResult}
                    className={`aspect-square rounded-2xl flex items-center justify-center text-4xl transition-all duration-300 ${
                      revealed[index]
                        ? 'bg-white shadow-inner'
                        : `bg-gradient-to-br ${selectedTier.color} shadow-lg active:scale-95`
                    }`}
                  >
                    {revealed[index] ? (
                      <span className="animate-bounce-once">{symbol}</span>
                    ) : (
                      <span className="text-white/80 text-2xl">?</span>
                    )}
                  </button>
                ))}
              </div>
              
              {!showResult && (
                <p className="text-center text-sm text-gray-500 mt-4">
                  点击格子刮开，集齐 3 个相同即中奖！
                </p>
              )}
            </div>
            
            {/* 中奖结果 */}
            {showResult && card && (
              <div className={`mt-4 p-4 rounded-2xl text-center ${
                card.prize.amount > 0 
                  ? 'bg-gradient-to-r from-yellow-100 to-orange-100 border-2 border-yellow-300' 
                  : 'bg-gray-100'
              }`}>
                {card.prize.amount > 0 ? (
                  <>
                    <div className="text-4xl mb-2">
                      {card.prize.symbol === '💎' ? '🎉🎊💎🎊🎉' : card.prize.symbol.repeat(3)}
                    </div>
                    <div className="text-2xl font-bold text-orange-600 mb-1">
                      恭喜中奖！
                    </div>
                    <div className="text-3xl font-bold text-red-500">
                      +¥{card.prize.amount.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">{card.prize.name}</div>
                  </>
                ) : (
                  <>
                    <div className="text-4xl mb-2">😢</div>
                    <div className="text-lg text-gray-600">很遗憾，未中奖</div>
                    <div className="text-sm text-gray-400 mt-1">下次一定！</div>
                  </>
                )}
              </div>
            )}
            
            {/* 操作按钮 */}
            {showResult && (
              <div className="mt-4 space-y-2">
                {/* 分享战绩按钮 */}
                <button
                  type="button"
                  onClick={() => setShowShareDialog(true)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-green-400 to-emerald-500 text-white font-medium active:scale-[0.98]"
                >
                  📤 分享战绩
                </button>
                
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={backToSelect}
                    className="flex-1 py-3 rounded-xl bg-gray-200 text-gray-700 font-medium active:scale-[0.98]"
                  >
                    换个档位
                  </button>
                  <button
                    type="button"
                    onClick={playAgain}
                    disabled={walletBalance < selectedTier.price}
                    className={`flex-1 py-3 rounded-xl text-white font-medium bg-gradient-to-r ${selectedTier.color} ${
                      walletBalance < selectedTier.price ? 'opacity-50' : 'active:scale-[0.98]'
                    }`}
                  >
                    再来一张 ¥{selectedTier.price}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      
      {/* 高档位警告弹窗 */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-black/50">
          <div className="w-full max-w-[300px] bg-white rounded-2xl p-5 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <div className="text-lg font-bold text-gray-800 mb-2">温馨提示</div>
            <div className="text-sm text-gray-600 mb-4">
              「梭哈人生」单张 <span className="font-bold text-red-500">¥2,000</span>
              <br />
              最高可中 <span className="font-bold text-orange-500">¥1,000,000</span>
              <br /><br />
              <span className="text-gray-500">小赌怡情，大赌伤身。</span>
              <br />
              <span className="text-gray-500">虚拟游戏，理性娱乐。</span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowWarning(false); setPendingTier(null) }}
                className="flex-1 py-2.5 rounded-xl bg-gray-200 text-gray-700 font-medium"
              >
                算了
              </button>
              <button
                type="button"
                onClick={confirmHighTier}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-400 to-rose-600 text-white font-medium"
              >
                继续购买
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 分享战绩弹窗 */}
      {showShareDialog && getCurrentResult() && (
        <ShareDialog 
          result={getCurrentResult()!} 
          onClose={() => setShowShareDialog(false)} 
        />
      )}
      
      {/* 底部提示 */}
      <div className="px-4 py-2 bg-white/80 border-t border-gray-100 text-center text-xs text-gray-400">
        虚拟游戏，仅供娱乐 · 奖金自动存入钱包
      </div>
      
      <style>{`
        @keyframes bounce-once {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        .animate-bounce-once {
          animation: bounce-once 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
