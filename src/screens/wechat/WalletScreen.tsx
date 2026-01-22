import { useState } from 'react'
import { useWeChat } from '../../context/WeChatContext'

type Props = {
  onBack: () => void
}

export default function WalletScreen({ onBack }: Props) {
  const { 
    walletBalance, walletInitialized, walletBills,
    initializeWallet
  } = useWeChat()
  
  const [showDice, setShowDice] = useState(!walletInitialized)
  const [diceRolling, setDiceRolling] = useState(false)
  const [diceResult, setDiceResult] = useState(0)
  const [showBills, setShowBills] = useState(false)

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

  // 获取账单类型文字
  const getBillTypeText = (type: string) => {
    switch (type) {
      case 'transfer_in': return '收款'
      case 'transfer_out': return '转账'
      case 'shopping': return '购物'
      case 'dice_init': return '初始资金'
      default: return '其他'
    }
  }

  // 骰子界面
  if (showDice) {
    return (
      <div className="absolute inset-0 bg-gradient-to-b from-orange-400 to-yellow-500 z-50 flex flex-col items-center justify-center">
        <div className="text-white text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">🎲 欢迎来到钱包</h2>
          <p className="text-white/80">掷骰子决定你的初始资金！</p>
        </div>
        
        {/* 骰子 */}
        <div className="w-32 h-32 bg-white rounded-2xl shadow-2xl flex items-center justify-center mb-8">
          {diceResult > 0 ? (
            <span className={`text-6xl ${diceRolling ? 'animate-bounce' : ''}`}>
              {['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][diceResult - 1]}
            </span>
          ) : (
            <span className="text-4xl text-gray-300">?</span>
          )}
        </div>
        
        {diceResult > 0 && !diceRolling && (
          <div className="text-white text-center mb-6 animate-pulse">
            <p className="text-lg">你获得了</p>
            <p className="text-4xl font-bold">¥{getDiceAmount(diceResult)}</p>
          </div>
        )}
        
        {!diceRolling && diceResult === 0 && (
          <button
            onClick={rollDice}
            className="px-8 py-3 bg-white text-orange-500 rounded-full font-bold text-lg shadow-lg active:scale-95 transition-transform"
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
    <div className="absolute inset-0 bg-gradient-to-b from-orange-400 to-yellow-500 z-50 flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onBack} className="text-white">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-white font-semibold text-lg">钱包</span>
        <div className="w-6" />
      </div>

      {/* 余额卡片 */}
      <div className="mx-4 mt-4 bg-white/20 backdrop-blur rounded-2xl p-6">
        <p className="text-white/80 text-sm">账户余额</p>
        <p className="text-white text-4xl font-bold mt-2">¥{walletBalance.toFixed(2)}</p>
      </div>

      {/* 功能按钮 */}
      <div className="flex justify-around mx-4 mt-6">
        <button 
          onClick={() => setShowBills(true)}
          className="flex flex-col items-center gap-2"
        >
          <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <span className="text-white text-sm">账单</span>
        </button>
      </div>

      {/* 最近账单 */}
      <div className="flex-1 mt-6 bg-white rounded-t-3xl overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-gray-800">最近账单</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {walletBills.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              暂无账单记录
            </div>
          ) : (
            <div className="divide-y">
              {walletBills.slice(0, 10).map(bill => (
                <div key={bill.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium text-gray-800">{getBillTypeText(bill.type)}</p>
                    <p className="text-xs text-gray-500 mt-1">{bill.description}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(bill.timestamp).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  <span className={`font-semibold ${
                    bill.type === 'transfer_in' || bill.type === 'dice_init' 
                      ? 'text-green-500' 
                      : 'text-red-500'
                  }`}>
                    {bill.type === 'transfer_in' || bill.type === 'dice_init' ? '+' : '-'}
                    ¥{bill.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 全部账单弹窗 */}
      {showBills && (
        <div className="absolute inset-0 bg-white z-[60] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <button onClick={() => setShowBills(false)} className="text-gray-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="font-semibold">全部账单</span>
            <div className="w-6" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {walletBills.length === 0 ? (
              <div className="text-center text-gray-400 py-12">
                暂无账单记录
              </div>
            ) : (
              <div className="divide-y">
                {walletBills.map(bill => (
                  <div key={bill.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium text-gray-800">{getBillTypeText(bill.type)}</p>
                      <p className="text-xs text-gray-500 mt-1">{bill.description}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(bill.timestamp).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <span className={`font-semibold ${
                      bill.type === 'transfer_in' || bill.type === 'dice_init' 
                        ? 'text-green-500' 
                        : 'text-red-500'
                    }`}>
                      {bill.type === 'transfer_in' || bill.type === 'dice_init' ? '+' : '-'}
                      ¥{bill.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
