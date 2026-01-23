import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../context/OSContext'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'

const RECHARGE_PACKAGES = [
  { id: 1, coins: 10, price: '¥1' },
  { id: 2, coins: 30, price: '¥3', popular: true },
  { id: 3, coins: 68, price: '¥6' },
  { id: 4, coins: 128, price: '¥12' },
  { id: 5, coins: 328, price: '¥30' },
  { id: 6, coins: 648, price: '¥60' },
]

type ModelInfo = {
  id: string
  object?: string
  owned_by?: string
}

export default function MibiScreen() {
  const navigate = useNavigate()
  const { miCoinBalance, addMiCoins, addNotification, fontColor, llmConfig, setLLMConfig, fetchAvailableModels } = useOS()
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null)
  const [recharging, setRecharging] = useState(false)
  
  // 模型相关状态
  const [loadingModels, setLoadingModels] = useState(false)
  const [showModelDialog, setShowModelDialog] = useState(false)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelError, setModelError] = useState('')
  const [successTip, setSuccessTip] = useState('')

  const handleRecharge = (coins: number) => {
    setSelectedPackage(coins)
    setRecharging(true)
    setTimeout(() => {
      addMiCoins(coins)
      addNotification({ app: '米币', title: '充值成功', body: `已到账 ${coins} 米币` })
      setRecharging(false)
      setSelectedPackage(null)
      setSuccessTip(`充值成功！+${coins} 米币`)
      setTimeout(() => setSuccessTip(''), 2000)
    }, 1000)
  }

  // 获取模型列表
  const fetchModels = async () => {
    setLoadingModels(true)
    setModelError('')
    
    try {
      const modelIds = await fetchAvailableModels()
      
      // 转换为ModelInfo格式
      const modelList: ModelInfo[] = modelIds.map(id => ({ id }))
      setModels(modelList)
      setShowModelDialog(true)
      setSuccessTip('获取模型成功')
      setTimeout(() => setSuccessTip(''), 2000)
    } catch (error) {
      setModelError(error instanceof Error ? error.message : '获取模型失败')
    } finally {
      setLoadingModels(false)
    }
  }

  // 选择模型
  const selectModel = (modelId: string) => {
    setLLMConfig({
      selectedModel: modelId,
      availableModels: models.map(m => m.id),
    })
    setShowModelDialog(false)
    setSuccessTip(`已选择模型: ${modelId}`)
    setTimeout(() => setSuccessTip(''), 2000)
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="米币" onBack={() => navigate('/', { replace: true })} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-4 sm:space-y-5">
          {/* 余额卡片 */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-amber-300 via-yellow-300 to-orange-300 p-4 sm:p-5 shadow-[0_6px_24px_rgba(251,191,36,0.3)]">
            <div className="absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-white/20 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-amber-900/80 mb-2 sm:mb-3">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                <span className="font-medium text-sm sm:text-base">我的米币</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl sm:text-5xl font-bold text-amber-900">{miCoinBalance}</span>
                <span className="text-base sm:text-lg text-amber-800/70">枚</span>
              </div>
              {llmConfig.selectedModel && (
                <div className="mt-2 text-xs text-amber-800/60">
                  当前模型: {llmConfig.selectedModel}
                </div>
              )}
            </div>
          </div>

          {/* 模型配置 */}
          <div className="rounded-xl sm:rounded-2xl bg-white/50 border border-white/30 p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium" style={{ color: fontColor.value }}>AI 模型</div>
                <div className="text-xs opacity-50 mt-0.5" style={{ color: fontColor.value }}>
                  {llmConfig.selectedModel || '未选择模型'}
                </div>
              </div>
              <button
                type="button"
                onClick={fetchModels}
                disabled={loadingModels}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: 'white',
                }}
              >
                {loadingModels ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    获取中
                  </span>
                ) : '获取模型'}
              </button>
            </div>
            {modelError && (
              <div className="mt-2 text-xs text-red-500">{modelError}</div>
            )}
          </div>

          {/* 充值套餐 */}
          <div className="space-y-2 sm:space-y-3">
            <div className="text-xs sm:text-sm font-medium opacity-60 px-1" style={{ color: fontColor.value }}>充值套餐</div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {RECHARGE_PACKAGES.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handleRecharge(pkg.coins)}
                  disabled={recharging}
                  className={`relative p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border-2 transition-all press-effect ${
                    selectedPackage === pkg.coins ? 'border-amber-400 bg-amber-500/20' : 'border-white/30 bg-white/40 hover:bg-white/50'
                  } ${recharging ? 'opacity-50' : ''}`}
                >
                  {pkg.popular && (
                    <div className="absolute -top-1.5 sm:-top-2 -right-1.5 sm:-right-2 px-1.5 sm:px-2 py-0.5 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full text-[9px] sm:text-[10px] font-bold text-white">热门</div>
                  )}
                  <div className="text-center">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-0.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    <div className="text-base sm:text-lg font-bold" style={{ color: fontColor.value }}>{pkg.coins}</div>
                    <div className="text-[10px] sm:text-xs opacity-50" style={{ color: fontColor.value }}>{pkg.price}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 说明 */}
          <div className="rounded-xl sm:rounded-2xl bg-white/50 border border-white/30 p-3 sm:p-4 space-y-1.5 sm:space-y-2">
            <div className="text-xs sm:text-sm font-medium opacity-80" style={{ color: fontColor.value }}>使用说明</div>
            <ul className="text-[10px] sm:text-xs opacity-50 space-y-1" style={{ color: fontColor.value }}>
              <li>• 米币用于调用 AI 模型服务</li>
              <li>• 每次对话消耗对应米币</li>
              <li>• 点击"获取模型"选择要使用的AI模型</li>
              <li>• 当前为演示模式，点击即可模拟充值</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 成功提示 */}
      {successTip && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
          <div className="px-6 py-3 rounded-2xl bg-black/70 text-white text-sm font-medium animate-fade-in">
            {successTip}
          </div>
        </div>
      )}

      {/* 模型选择弹窗 */}
      {showModelDialog && (
        <div 
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModelDialog(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div 
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <span className="font-semibold text-gray-800">选择模型</span>
              <button
                type="button"
                onClick={() => setShowModelDialog(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* 模型列表 */}
            <div className="max-h-80 overflow-y-auto p-2">
              {models.length === 0 ? (
                <div className="text-center text-gray-400 py-8">暂无可用模型</div>
              ) : (
                <div className="space-y-1">
                  {models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => selectModel(model.id)}
                      className={`w-full px-4 py-3 rounded-xl text-left transition-all ${
                        llmConfig.selectedModel === model.id
                          ? 'bg-amber-100 border-2 border-amber-400'
                          : 'hover:bg-gray-50 border-2 border-transparent'
                      }`}
                    >
                      <div className="font-medium text-gray-800 text-sm">{model.id}</div>
                      {model.owned_by && (
                        <div className="text-xs text-gray-400 mt-0.5">{model.owned_by}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* 底部提示 */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100">
              <div className="text-xs text-gray-400 text-center">
                共 {models.length} 个可用模型
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
