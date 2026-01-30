import { useState, useEffect, useMemo } from 'react'
import { useWeChat, FUND_FEE_RATE } from '../../context/WeChatContext'
import type { Fund } from '../../context/WeChatContext'
import { useNavigate } from 'react-router-dom'

type Props = {
  onBack: () => void
}

// 基金类型中文名
const FUND_TYPE_NAMES: Record<string, string> = {
  stock: '股票型',
  bond: '债券型',
  hybrid: '混合型',
  index: '指数型',
  qdii: 'QDII',
  money: '货币型',
}

// 风险等级显示
const getRiskStars = (level: number) => '⭐'.repeat(level)

// 折线图组件
function PriceChart({ prices, width = 280, height = 120 }: { prices: number[], width?: number, height?: number }) {
  if (prices.length < 2) return null
  
  const padding = { top: 10, right: 10, bottom: 20, left: 40 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceRange = maxPrice - minPrice || 0.01 // 防止除零
  
  // 计算点位置
  const points = prices.map((price, i) => ({
    x: padding.left + (i / (prices.length - 1)) * chartWidth,
    y: padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight,
    price,
  }))
  
  // 生成折线路径
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  
  // 生成填充区域路径
  const areaPath = linePath + 
    ` L ${points[points.length - 1].x} ${padding.top + chartHeight}` +
    ` L ${points[0].x} ${padding.top + chartHeight} Z`
  
  // 判断整体趋势（首尾对比）
  const isUp = prices[prices.length - 1] >= prices[0]
  const strokeColor = isUp ? '#ef4444' : '#22c55e'
  const fillColor = isUp ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'
  
  // Y轴刻度
  const yTicks = [minPrice, (minPrice + maxPrice) / 2, maxPrice]
  
  return (
    <svg width={width} height={height} className="overflow-visible">
      {/* 背景网格 */}
      {[0, 1, 2].map(i => (
        <line
          key={`grid-${i}`}
          x1={padding.left}
          y1={padding.top + (i * chartHeight) / 2}
          x2={padding.left + chartWidth}
          y2={padding.top + (i * chartHeight) / 2}
          stroke="#e5e7eb"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
      ))}
      
      {/* Y轴刻度标签 */}
      {yTicks.map((tick, i) => (
        <text
          key={`y-${i}`}
          x={padding.left - 5}
          y={padding.top + chartHeight - (i * chartHeight) / 2}
          textAnchor="end"
          dominantBaseline="middle"
          className="text-[9px] fill-gray-400"
        >
          {tick.toFixed(3)}
        </text>
      ))}
      
      {/* X轴标签 */}
      <text
        x={padding.left}
        y={height - 5}
        textAnchor="start"
        className="text-[9px] fill-gray-400"
      >
        7次前
      </text>
      <text
        x={padding.left + chartWidth}
        y={height - 5}
        textAnchor="end"
        className="text-[9px] fill-gray-400"
      >
        最新
      </text>
      
      {/* 填充区域 */}
      <path d={areaPath} fill={fillColor} />
      
      {/* 折线 */}
      <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      
      {/* 数据点 */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 4 : 2.5}
          fill={i === points.length - 1 ? strokeColor : 'white'}
          stroke={strokeColor}
          strokeWidth={1.5}
        />
      ))}
      
      {/* 最新价格标注 */}
      <text
        x={points[points.length - 1].x}
        y={points[points.length - 1].y - 8}
        textAnchor="middle"
        className="text-[10px] font-medium"
        fill={strokeColor}
      >
        {prices[prices.length - 1].toFixed(4)}
      </text>
    </svg>
  )
}

export default function FundScreen({ onBack }: Props) {
  const navigate = useNavigate()
  const {
    walletBalance,
    funds,
    fundHoldings,
    refreshFunds,
    getNextRefreshTime,
    buyFund,
    sellFund,
    getFundHolding,
    getTotalFundValue,
    characters,
    addMessage,
  } = useWeChat()

  const [countdown, setCountdown] = useState(0)
  const [selectedFund, setSelectedFund] = useState<Fund | null>(null)
  const [actionType, setActionType] = useState<'buy' | 'sell' | null>(null)
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [showRules, setShowRules] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [shareFundId, setShareFundId] = useState<string | null>(null)
  const [detailFund, setDetailFund] = useState<Fund | null>(null) // 查看详情的基金

  // 刷新倒计时
  useEffect(() => {
    const update = () => setCountdown(Math.ceil(getNextRefreshTime() / 1000))
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [getNextRefreshTime])

  // 格式化倒计时
  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return '可刷新'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // 计算涨跌幅
  const getChangeRate = (fund: Fund) => {
    const rate = ((fund.currentPrice - fund.previousPrice) / fund.previousPrice) * 100
    return rate
  }

  // 计算持仓盈亏
  const getHoldingProfit = (fundId: string) => {
    const holding = getFundHolding(fundId)
    if (!holding) return null
    const fund = funds.find(f => f.id === fundId)
    if (!fund) return null
    
    const currentValue = holding.shares * fund.currentPrice
    const cost = holding.shares * holding.costPrice
    const profit = currentValue - cost
    const profitRate = (profit / cost) * 100
    
    return { currentValue, cost, profit, profitRate, shares: holding.shares }
  }

  // 我的持仓列表
  const myHoldings = useMemo(() => {
    return fundHoldings.map(h => {
      const fund = funds.find(f => f.id === h.fundId)
      const profit = getHoldingProfit(h.fundId)
      return { holding: h, fund, profit }
    }).filter(item => item.fund && item.profit)
  }, [fundHoldings, funds])

  // 总资产
  const totalValue = getTotalFundValue()
  const totalCost = fundHoldings.reduce((sum, h) => sum + h.shares * h.costPrice, 0)
  const totalProfit = totalValue - totalCost

  // 处理刷新
  const handleRefresh = () => {
    const success = refreshFunds()
    if (success) {
      setMessage('行情已更新')
    } else {
      setMessage('刷新太频繁，请稍后再试')
    }
    setTimeout(() => setMessage(''), 2000)
  }

  // 处理买入/卖出
  const handleAction = () => {
    if (!selectedFund || !actionType) return
    
    const value = parseFloat(amount)
    if (isNaN(value) || value <= 0) {
      setMessage('请输入有效金额')
      setTimeout(() => setMessage(''), 2000)
      return
    }
    
    let result
    if (actionType === 'buy') {
      result = buyFund(selectedFund.id, value)
    } else {
      result = sellFund(selectedFund.id, value)
    }
    
    setMessage(result.message)
    setTimeout(() => setMessage(''), 2000)
    
    if (result.success) {
      setSelectedFund(null)
      setActionType(null)
      setAmount('')
    }
  }

  // 打开买入弹窗
  const openBuy = (fund: Fund) => {
    setSelectedFund(fund)
    setActionType('buy')
    setAmount('')
  }

  // 打开卖出弹窗
  const openSell = (fund: Fund) => {
    const holding = getFundHolding(fund.id)
    if (!holding || holding.shares <= 0) {
      setMessage('没有持仓')
      setTimeout(() => setMessage(''), 2000)
      return
    }
    setSelectedFund(fund)
    setActionType('sell')
    setAmount('')
  }

  // 打开分享
  const openShare = (fundId: string) => {
    setShareFundId(fundId)
    setShowShare(true)
  }

  // 分享给好友
  const shareToCharacter = (characterId: string) => {
    if (!shareFundId) return
    const holding = getFundHolding(shareFundId)
    const fund = funds.find(f => f.id === shareFundId)
    if (!holding || !fund) return

    const profit = getHoldingProfit(shareFundId)
    if (!profit) return

    // 生成走势符号
    const trend = fund.historyPrices.slice(-7).map((price, i, arr) => {
      if (i === 0) return ''
      return price >= arr[i - 1] ? '📈' : '📉'
    }).filter(Boolean).join('')

    addMessage({
      characterId,
      content: JSON.stringify({
        type: 'fund_result',
        fundName: fund.name,
        fundCode: fund.code,
        fundType: FUND_TYPE_NAMES[fund.type],
        riskLevel: fund.riskLevel,
        currentPrice: fund.currentPrice,
        shares: holding.shares,
        costPrice: holding.costPrice,
        profitLoss: profit.profit,
        profitRate: profit.profitRate,
        trend,
      }),
      isUser: true,
      type: 'fund_share' as any,
    })

    setShowShare(false)
    setShareFundId(null)
    setMessage('分享成功')
    setTimeout(() => {
      navigate(`/apps/wechat/chat/${characterId}`)
    }, 500)
  }

  return (
    <div className="absolute inset-0 bg-gray-100 z-50 flex flex-col">
      {/* 头部 */}
      <div className="bg-[#2aae67] text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onBack} className="text-white">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-medium text-lg">基金</span>
          <button onClick={() => setShowRules(true)} className="text-white/80 text-sm">
            规则
          </button>
        </div>

        {/* 总资产 */}
        <div className="px-6 py-4">
          <p className="text-white/70 text-sm mb-1">基金总市值（元）</p>
          <p className="text-3xl font-light tracking-wide">
            ¥{totalValue.toFixed(2)}
          </p>
          <p className={`text-sm mt-1 ${totalProfit >= 0 ? 'text-yellow-300' : 'text-red-300'}`}>
            {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)} ({totalCost > 0 ? ((totalProfit / totalCost) * 100).toFixed(2) : '0.00'}%)
          </p>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {/* 我的持仓 */}
        {myHoldings.length > 0 && (
          <div className="bg-white mb-2">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <span className="font-medium text-gray-800">我的持仓</span>
              <span className="text-xs text-gray-400">{myHoldings.length}只</span>
            </div>
            {myHoldings.map(({ holding, fund, profit }) => (
              <div 
                key={holding.fundId}
                className="px-4 py-3 border-b border-gray-50 last:border-b-0 cursor-pointer active:bg-gray-50"
                onClick={() => setDetailFund(fund!)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium text-gray-800">{fund!.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{fund!.code}</span>
                  </div>
                  <div className={`text-right ${profit!.profit >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                    <div className="font-medium">{profit!.profit >= 0 ? '+' : ''}{profit!.profit.toFixed(2)}</div>
                    <div className="text-xs">{profit!.profitRate >= 0 ? '+' : ''}{profit!.profitRate.toFixed(2)}%</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span onClick={(e) => e.stopPropagation()}>持有{profit!.shares}份 · 成本{holding.costPrice.toFixed(4)}</span>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => openShare(fund!.id)}
                      className="px-2 py-1 bg-blue-50 text-blue-600 rounded"
                    >
                      分享
                    </button>
                    <button 
                      onClick={() => openBuy(fund!)}
                      className="px-2 py-1 bg-red-50 text-red-500 rounded"
                    >
                      买入
                    </button>
                    <button 
                      onClick={() => openSell(fund!)}
                      className="px-2 py-1 bg-green-50 text-green-600 rounded"
                    >
                      卖出
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 mt-1">点击查看走势图</div>
              </div>
            ))}
          </div>
        )}

        {/* 基金市场 */}
        <div className="bg-white">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-800">基金市场</span>
              <button
                onClick={handleRefresh}
                disabled={countdown > 0}
                className={`text-base px-4 py-1.5 rounded-full font-medium ${
                  countdown > 0 
                    ? 'bg-gray-100 text-gray-500' 
                    : 'bg-green-500 text-white active:bg-green-600'
                }`}
              >
                {formatCountdown(countdown)}
              </button>
            </div>
            <div className="text-xs text-gray-400 mt-1 text-right">
              {countdown > 0 ? '倒计时结束后可刷新，每10分钟一次' : '点击刷新获取最新行情'}
            </div>
          </div>

          {funds.map(fund => {
            const changeRate = getChangeRate(fund)
            const isUp = changeRate >= 0
            const holding = getFundHolding(fund.id)
            
            return (
              <div 
                key={fund.id}
                className="px-4 py-3 border-b border-gray-50 last:border-b-0"
                onClick={() => setDetailFund(fund)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 truncate">{fund.name}</span>
                      {holding && <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded">持有</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {fund.code} · {FUND_TYPE_NAMES[fund.type]} · {getRiskStars(fund.riskLevel)}
                    </div>
                  </div>
                  <div className="text-right mr-3">
                    <div className="font-medium text-gray-800">{fund.currentPrice.toFixed(4)}</div>
                    <div className={`text-xs ${isUp ? 'text-red-500' : 'text-green-600'}`}>
                      {isUp ? '+' : ''}{changeRate.toFixed(2)}%
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openBuy(fund) }}
                    className="px-3 py-1.5 bg-red-500 text-white text-sm rounded active:bg-red-600"
                  >
                    买入
                  </button>
                </div>
                
                {/* 迷你走势 */}
                <div className="flex items-center gap-0.5 mt-2">
                  {fund.historyPrices.slice(-7).map((price, i, arr) => {
                    if (i === 0) return null
                    const prev = arr[i - 1]
                    const up = price >= prev
                    return (
                      <div 
                        key={i}
                        className={`w-3 h-3 rounded-sm text-[8px] flex items-center justify-center ${
                          up ? 'bg-red-100 text-red-500' : 'bg-green-100 text-green-600'
                        }`}
                      >
                        {up ? '↑' : '↓'}
                      </div>
                    )
                  })}
                  <span className="text-[10px] text-gray-400 ml-1">点击查看详情</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* 底部提示 */}
        <div className="p-4 text-center text-xs text-gray-400">
          基金有风险，投资需谨慎（娱乐功能）
        </div>
      </div>

      {/* 买入/卖出弹窗 */}
      {selectedFund && actionType && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <button onClick={() => { setSelectedFund(null); setActionType(null) }} className="text-gray-500">
                取消
              </button>
              <span className="font-medium">{actionType === 'buy' ? '买入' : '卖出'} {selectedFund.name}</span>
              <button onClick={handleAction} className="text-green-600 font-medium">
                确定
              </button>
            </div>
            
            <div className="p-4">
              <div className="text-center mb-4">
                <div className="text-2xl font-bold text-gray-800">{selectedFund.currentPrice.toFixed(4)}</div>
                <div className="text-sm text-gray-500">当前净值</div>
              </div>
              
              {actionType === 'buy' ? (
                <>
                  <div className="text-sm text-gray-500 mb-2">
                    可用余额：¥{walletBalance.toFixed(2)}
                  </div>
                  <div className="flex items-center bg-gray-50 rounded-lg px-4 py-3">
                    <span className="text-gray-500 mr-2">¥</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="输入买入金额"
                      className="flex-1 bg-transparent outline-none text-lg"
                    />
                  </div>
                  {amount && parseFloat(amount) > 0 && (
                    <div className="mt-2 text-sm text-gray-500">
                      预计买入 ≈{(parseFloat(amount) * (1 - FUND_FEE_RATE) / selectedFund.currentPrice).toFixed(2)} 份
                      <span className="text-orange-500 ml-2">（手续费{FUND_FEE_RATE * 100}%）</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-sm text-gray-500 mb-2">
                    可卖份额：{getFundHolding(selectedFund.id)?.shares.toFixed(2) || 0} 份
                  </div>
                  <div className="flex items-center bg-gray-50 rounded-lg px-4 py-3">
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="输入卖出份额"
                      className="flex-1 bg-transparent outline-none text-lg"
                    />
                    <span className="text-gray-500 ml-2">份</span>
                  </div>
                  <button
                    onClick={() => setAmount(getFundHolding(selectedFund.id)?.shares.toFixed(2) || '0')}
                    className="mt-2 text-sm text-green-600"
                  >
                    全部卖出
                  </button>
                  {amount && parseFloat(amount) > 0 && (
                    <div className="mt-2 text-sm text-gray-500">
                      预计到账 ≈¥{(parseFloat(amount) * selectedFund.currentPrice * (1 - FUND_FEE_RATE)).toFixed(2)}
                      <span className="text-orange-500 ml-2">（手续费{FUND_FEE_RATE * 100}%）</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 基金详情弹窗 */}
      {detailFund && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col">
          {/* 头部 */}
          <div className="bg-gray-50 border-b">
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => setDetailFund(null)} className="text-gray-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="font-medium">{detailFund.name}</span>
              <div className="w-6" />
            </div>
          </div>

          {/* 内容 */}
          <div className="flex-1 overflow-y-auto">
            {/* 价格信息 */}
            <div className="bg-white p-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-gray-800">{detailFund.currentPrice.toFixed(4)}</span>
                <span className={`text-lg font-medium ${getChangeRate(detailFund) >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {getChangeRate(detailFund) >= 0 ? '+' : ''}{getChangeRate(detailFund).toFixed(2)}%
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {detailFund.code} · {FUND_TYPE_NAMES[detailFund.type]} · 风险{getRiskStars(detailFund.riskLevel)}
              </div>
            </div>

            {/* 走势图 */}
            <div className="bg-white px-4 py-3 border-t">
              <div className="text-sm font-medium text-gray-700 mb-3">净值走势（近7次刷新）</div>
              <div className="flex justify-center">
                <PriceChart prices={detailFund.historyPrices.slice(-7)} width={300} height={140} />
              </div>
            </div>

            {/* 持仓信息 */}
            {(() => {
              const holding = getFundHolding(detailFund.id)
              if (!holding) return null
              const profit = getHoldingProfit(detailFund.id)
              if (!profit) return null
              
              return (
                <div className="bg-white px-4 py-3 border-t">
                  <div className="text-sm font-medium text-gray-700 mb-3">我的持仓</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">持有份额</div>
                      <div className="text-lg font-medium text-gray-800">{holding.shares.toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">成本净值</div>
                      <div className="text-lg font-medium text-gray-800">{holding.costPrice.toFixed(4)}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">持仓市值</div>
                      <div className="text-lg font-medium text-gray-800">¥{profit.currentValue.toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <div className="text-xs text-gray-500">累计盈亏</div>
                      <div className={`text-lg font-medium ${profit.profit >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {profit.profit >= 0 ? '+' : ''}{profit.profit.toFixed(2)}
                        <span className="text-xs ml-1">({profit.profitRate >= 0 ? '+' : ''}{profit.profitRate.toFixed(2)}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* 基金信息 */}
            <div className="bg-white px-4 py-3 border-t">
              <div className="text-sm font-medium text-gray-700 mb-3">基金信息</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">基金代码</span>
                  <span className="text-gray-800">{detailFund.code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">基金类型</span>
                  <span className="text-gray-800">{FUND_TYPE_NAMES[detailFund.type]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">风险等级</span>
                  <span className="text-gray-800">{getRiskStars(detailFund.riskLevel)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">上次净值</span>
                  <span className="text-gray-800">{detailFund.previousPrice.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">手续费率</span>
                  <span className="text-gray-800">{(FUND_FEE_RATE * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* 底部操作 */}
          <div className="border-t bg-white px-4 py-3 flex gap-3">
            {getFundHolding(detailFund.id) && (
              <button
                onClick={() => { setDetailFund(null); openSell(detailFund) }}
                className="flex-1 py-2.5 bg-green-500 text-white rounded-lg font-medium active:bg-green-600"
              >
                卖出
              </button>
            )}
            <button
              onClick={() => { setDetailFund(null); openBuy(detailFund) }}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-lg font-medium active:bg-red-600"
            >
              买入
            </button>
          </div>
        </div>
      )}

      {/* 规则弹窗 */}
      {showRules && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl w-full max-w-sm">
            <div className="px-4 py-3 border-b font-medium text-center">游戏规则</div>
            <div className="p-4 text-sm text-gray-600 space-y-2">
              <p>📊 <strong>行情刷新</strong>：每10分钟可刷新一次</p>
              <p>📉 <strong>涨跌概率</strong>：约50%涨，50%跌</p>
              <p>💸 <strong>手续费</strong>：买入卖出各收1.5%</p>
              <p>⚠️ <strong>风险等级</strong>：星越多波动越大</p>
              <p>🎯 <strong>温馨提示</strong>：这是娱乐功能，模拟基金涨跌规律，请勿当真～</p>
            </div>
            <div className="p-4 border-t">
              <button
                onClick={() => setShowRules(false)}
                className="w-full py-2 bg-green-500 text-white rounded-lg active:bg-green-600"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 分享弹窗 */}
      {showShare && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-end">
          <div className="w-full bg-white rounded-t-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-medium">分享给好友</span>
              <button onClick={() => { setShowShare(false); setShareFundId(null) }} className="text-gray-500">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {characters.length === 0 ? (
                <div className="text-center text-gray-400 py-8">暂无好友</div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {characters.map(char => (
                    <button
                      key={char.id}
                      onClick={() => shareToCharacter(char.id)}
                      className="flex flex-col items-center p-2"
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-200">
                        {char.avatar ? (
                          <img src={char.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            {char.name[0]}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-gray-600 mt-1 truncate w-full text-center">{char.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 消息提示 */}
      {message && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 text-white px-4 py-2 rounded-lg text-sm z-[60]">
          {message}
        </div>
      )}
    </div>
  )
}
