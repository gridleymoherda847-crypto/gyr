import { useState, useMemo } from 'react'
import { useWeChat } from '../../context/WeChatContext'

type Props = {
  onBack: () => void
}

export default function WalletScreen({ onBack }: Props) {
  const { 
    walletBalance, walletInitialized, walletBills,
    initializeWallet, characters
  } = useWeChat()
  
  const [showDice, setShowDice] = useState(!walletInitialized)
  const [diceRolling, setDiceRolling] = useState(false)
  const [diceResult, setDiceResult] = useState(0)
  const [activeTab, setActiveTab] = useState<'all' | 'in' | 'out'>('all')

  // 掷骰子
  const rollDice = () => {
    setDiceRolling(true)
    let count = 0
    const interval = setInterval(() => {
      setDiceResult(Math.floor(Math.random() * 6) + 1)
      count++
      if (count > 15) {
        clearInterval(interval)
        const finalResult = Math.floor(Math.random() * 6) + 1
        setDiceResult(finalResult)
        setDiceRolling(false)
        setTimeout(() => {
          initializeWallet(finalResult)
          setShowDice(false)
        }, 1000)
      }
    }, 100)
  }

  // 骰子点数对应金额
  const getDiceAmount = (dice: number) => {
    const amounts = [100, 500, 1000, 2000, 5000, 10000]
    return amounts[dice - 1] || 0
  }

  // 根据tab筛选账单
  const filteredBills = useMemo(() => {
    if (activeTab === 'all') return walletBills
    if (activeTab === 'in') return walletBills.filter(b => b.type === 'transfer_in' || b.type === 'dice_init')
    return walletBills.filter(b => b.type === 'transfer_out' || b.type === 'shopping')
  }, [walletBills, activeTab])

  // 按日期分组账单
  const groupedBills = useMemo(() => {
    const groups: { [key: string]: typeof walletBills } = {}
    for (const bill of filteredBills) {
      const date = new Date(bill.timestamp)
      const key = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
      if (!groups[key]) groups[key] = []
      groups[key].push(bill)
    }
    return Object.entries(groups).sort((a, b) => {
      const dateA = new Date(a[1][0].timestamp)
      const dateB = new Date(b[1][0].timestamp)
      return dateB.getTime() - dateA.getTime()
    })
  }, [filteredBills])

  // 获取角色名称
  const getCharacterName = (id?: string) => {
    if (!id) return ''
    const char = characters.find(c => c.id === id)
    return char?.name || ''
  }

  // 获取账单图标和描述
  const getBillInfo = (bill: typeof walletBills[0]) => {
    const charName = getCharacterName(bill.relatedCharacterId)
    switch (bill.type) {
      case 'transfer_in':
        return {
          icon: '💰',
          title: charName ? `${charName}-转账` : '收款',
          subtitle: bill.description || '微信转账',
          color: 'text-green-600',
          prefix: '+'
        }
      case 'transfer_out':
        return {
          icon: '💸',
          title: charName ? `${charName}-转账` : '转账',
          subtitle: bill.description || '微信转账',
          color: 'text-gray-800',
          prefix: '-'
        }
      case 'shopping':
        return {
          icon: '🛒',
          title: '消费',
          subtitle: bill.description || '购物支出',
          color: 'text-gray-800',
          prefix: '-'
        }
      case 'dice_init':
        return {
          icon: '🎲',
          title: '初始资金',
          subtitle: '掷骰子获得',
          color: 'text-green-600',
          prefix: '+'
        }
      default:
        return {
          icon: '📝',
          title: '其他',
          subtitle: bill.description || '',
          color: 'text-gray-800',
          prefix: ''
        }
    }
  }

  // 骰子界面
  if (showDice) {
    return (
      <div className="absolute inset-0 bg-gradient-to-b from-green-500 to-green-600 z-50 flex flex-col items-center justify-center">
        <div className="text-white text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">🎲 欢迎来到钱包</h2>
          <p className="text-white/80">掷骰子决定你的初始资金！</p>
        </div>
        
        {/* 骰子 */}
        <div className="w-28 h-28 bg-white rounded-2xl shadow-2xl flex items-center justify-center mb-8">
          {diceResult > 0 ? (
            <span className={`text-5xl ${diceRolling ? 'animate-bounce' : ''}`}>
              {['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][diceResult - 1]}
            </span>
          ) : (
            <span className="text-3xl text-gray-300">?</span>
          )}
        </div>
        
        {diceResult > 0 && !diceRolling && (
          <div className="text-white text-center mb-6 animate-pulse">
            <p className="text-lg">你获得了</p>
            <p className="text-4xl font-bold">¥{getDiceAmount(diceResult).toLocaleString()}</p>
          </div>
        )}
        
        {!diceRolling && diceResult === 0 && (
          <button
            onClick={rollDice}
            className="px-8 py-3 bg-white text-green-600 rounded-full font-bold text-lg shadow-lg active:scale-95 transition-transform"
          >
            掷骰子
          </button>
        )}
        
        {diceRolling && (
          <p className="text-white text-lg animate-pulse">正在掷骰子...</p>
        )}
      </div>
    )
  }

  return (
    <div className="absolute inset-0 bg-gray-100 z-50 flex flex-col">
      {/* 头部 - 仿微信绿色 */}
      <div className="bg-[#2aae67] text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onBack} className="text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-medium text-lg">钱包</span>
          <div className="w-6" />
        </div>

        {/* 余额区域 */}
        <div className="px-6 py-6 text-center">
          <p className="text-white/70 text-sm mb-1">账户余额（元）</p>
          <p className="text-4xl font-light tracking-wide">
            ¥{walletBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* 账单区域 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab切换 */}
        <div className="bg-white flex border-b border-gray-100">
          {[
            { key: 'all' as const, label: '全部' },
            { key: 'in' as const, label: '收入' },
            { key: 'out' as const, label: '支出' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm font-medium relative ${
                activeTab === tab.key ? 'text-green-600' : 'text-gray-500'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-green-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* 账单列表 */}
        <div className="flex-1 overflow-y-auto">
          {filteredBills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <svg className="w-16 h-16 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm">暂无账单记录</p>
            </div>
          ) : (
            <div>
              {groupedBills.map(([date, bills]) => (
                <div key={date}>
                  {/* 日期分割 */}
                  <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 sticky top-0">
                    {date}
                  </div>
                  {/* 账单项 */}
                  {bills.map(bill => {
                    const info = getBillInfo(bill)
                    const time = new Date(bill.timestamp)
                    const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`
                    return (
                      <div key={bill.id} className="bg-white px-4 py-3 flex items-center border-b border-gray-50">
                        {/* 图标 */}
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl flex-shrink-0">
                          {info.icon}
                        </div>
                        {/* 信息 */}
                        <div className="flex-1 min-w-0 ml-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-800 text-sm truncate">{info.title}</span>
                            <span className={`font-medium text-sm ${info.color}`}>
                              {info.prefix}¥{bill.amount.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-xs text-gray-400 truncate">{info.subtitle}</span>
                            <span className="text-xs text-gray-400">{timeStr}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
