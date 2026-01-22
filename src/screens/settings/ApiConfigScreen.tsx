import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'

export default function ApiConfigScreen() {
  const navigate = useNavigate()
  const { llmConfig, setLLMConfig, fontColor, fetchAvailableModels } = useOS()
  
  const [baseUrl, setBaseUrl] = useState(llmConfig.apiBaseUrl)
  const [apiKey, setApiKey] = useState(llmConfig.apiKey)
  const [selectedModel, setSelectedModel] = useState(llmConfig.selectedModel)
  const [models, setModels] = useState<string[]>(llmConfig.availableModels)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const fetchModels = async () => {
    if (!baseUrl || !apiKey) { setError('请先填写 API Base URL 和 API Key'); return }
    setLoading(true); setError('')
    try {
      const modelList = await fetchAvailableModels({ apiBaseUrl: baseUrl, apiKey })
      setModels(modelList)
      if (modelList.length > 0 && !selectedModel) setSelectedModel(modelList[0])
    } catch {
      setError('获取模型失败（请检查网络或服务状态），已加载默认列表')
      setModels(['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet'])
    } finally { setLoading(false) }
  }

  const handleSave = () => {
    setLLMConfig({ apiBaseUrl: baseUrl, apiKey, selectedModel, availableModels: models })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="API 配置" onBack={() => navigate('/apps/settings')} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-4 sm:space-y-5">
          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>API Base URL</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs sm:text-sm"
              style={{ color: fontColor.value }}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-xxxxxxxx"
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs sm:text-sm"
              style={{ color: fontColor.value }}
            />
          </div>

          <button onClick={fetchModels} disabled={loading} className="w-full py-2.5 sm:py-3 rounded-2xl bg-white/50 hover:bg-white/60 border border-white/30 font-medium transition-colors disabled:opacity-50 press-effect text-sm sm:text-base" style={{ color: fontColor.value }}>
            {loading ? '获取中...' : '获取模型列表'}
          </button>

          {error && <div className="text-xs sm:text-sm text-red-500 bg-red-50/50 px-3 py-2.5 rounded-2xl border border-red-200">{error}</div>}

          {models.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>选择模型</label>
              <div className="relative">
                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 appearance-none focus:border-white/50 cursor-pointer text-sm sm:text-base" style={{ color: fontColor.value }}>
                  <option value="" disabled>请选择模型</option>
                  {models.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
                <svg className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" style={{ color: fontColor.value }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          )}

          <button onClick={handleSave} className={`w-full py-3 sm:py-3.5 rounded-2xl font-semibold text-white transition-all press-effect ${saved ? 'bg-green-500' : 'bg-gradient-to-r from-blue-500 to-cyan-500 shadow-[0_6px_20px_rgba(59,130,246,0.3)]'}`}>
            {saved ? '✓ 已保存' : '保存配置'}
          </button>
        </div>
      </div>
    </PageContainer>
  )
}
