import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'

// MiniMax 可用音色列表
const VOICE_OPTIONS = [
  { id: 'female-shaonv', name: '少女', desc: '温柔甜美' },
  { id: 'female-yujie', name: '御姐', desc: '成熟知性' },
  { id: 'female-chengshu', name: '成熟女性', desc: '稳重大方' },
  { id: 'female-tianmei', name: '甜美', desc: '可爱甜蜜' },
  { id: 'male-qn-qingse', name: '青涩青年', desc: '年轻活力' },
  { id: 'male-qn-jingying', name: '精英青年', desc: '自信干练' },
  { id: 'male-qn-badao', name: '霸道青年', desc: '强势霸气' },
  { id: 'presenter_male', name: '男主持', desc: '专业播音' },
  { id: 'presenter_female', name: '女主持', desc: '专业播音' },
  { id: 'audiobook_male_1', name: '有声书男1', desc: '温和叙述' },
  { id: 'audiobook_female_1', name: '有声书女1', desc: '温柔叙述' },
]

const MODEL_OPTIONS = [
  { id: 'speech-02-turbo', name: 'Turbo（快速便宜）', desc: '推荐' },
  { id: 'speech-02-hd', name: 'HD（高品质）', desc: '音质更好' },
  { id: 'speech-2.6-turbo', name: '2.6 Turbo', desc: '新版快速' },
  { id: 'speech-2.6-hd', name: '2.6 HD', desc: '新版高品质' },
  { id: 'speech-2.8-turbo', name: '2.8 Turbo（最新）', desc: '最新快速' },
  { id: 'speech-2.8-hd', name: '2.8 HD（最新）', desc: '最新高品质' },
]

export default function ApiConfigScreen() {
  const navigate = useNavigate()
  const { llmConfig, setLLMConfig, ttsConfig, setTTSConfig, textToSpeech, fontColor, fetchAvailableModels } = useOS()
  
  // LLM 配置状态
  const [baseUrl, setBaseUrl] = useState(llmConfig.apiBaseUrl)
  const [apiKey, setApiKey] = useState(llmConfig.apiKey)
  const [selectedModel, setSelectedModel] = useState(llmConfig.selectedModel)
  const [models, setModels] = useState<string[]>(llmConfig.availableModels)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  
  // TTS 配置状态
  const [ttsApiKey, setTtsApiKey] = useState(ttsConfig.apiKey)
  const [ttsVoiceId, setTtsVoiceId] = useState(ttsConfig.voiceId)
  const [ttsModel, setTtsModel] = useState(ttsConfig.model)
  const [ttsSpeed, setTtsSpeed] = useState(ttsConfig.speed)
  const [ttsEnabled, setTtsEnabled] = useState(ttsConfig.enabled)
  const [ttsSaved, setTtsSaved] = useState(false)
  const [ttsTestLoading, setTtsTestLoading] = useState(false)
  const [ttsTestError, setTtsTestError] = useState('')

  const fetchModels = async () => {
    if (!baseUrl || !apiKey) { setError('请先填写 API Base URL 和 API Key'); return }
    setLoading(true); setError('')
    try {
      const modelList = await fetchAvailableModels({ apiBaseUrl: baseUrl, apiKey })
      setModels(modelList)
    } catch {
      setError('获取模型失败（请检查网络或服务状态），已加载默认列表')
      setModels(['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet'])
    } finally { setLoading(false) }
  }

  const handleSave = () => {
    setLLMConfig({ apiBaseUrl: baseUrl, apiKey, selectedModel, availableModels: models })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  
  const handleSaveTTS = () => {
    setTTSConfig({ 
      apiKey: ttsApiKey, 
      voiceId: ttsVoiceId, 
      model: ttsModel, 
      speed: ttsSpeed, 
      enabled: ttsEnabled 
    })
    setTtsSaved(true); setTimeout(() => setTtsSaved(false), 2000)
  }
  
  const handleTestTTS = async () => {
    if (!ttsApiKey) {
      setTtsTestError('请先填写 MiniMax API Key')
      return
    }
    setTtsTestLoading(true)
    setTtsTestError('')
    
    // 临时保存配置用于测试
    setTTSConfig({ 
      apiKey: ttsApiKey, 
      voiceId: ttsVoiceId, 
      model: ttsModel, 
      speed: ttsSpeed, 
      enabled: true 
    })
    
    try {
      const audioUrl = await textToSpeech('你好，这是语音测试。')
      if (audioUrl) {
        const audio = new Audio(audioUrl)
        audio.play()
      } else {
        setTtsTestError('语音合成失败，请检查 API Key')
      }
    } catch (err) {
      setTtsTestError('测试失败：' + (err as Error).message)
    } finally {
      setTtsTestLoading(false)
    }
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="API 配置" onBack={() => navigate('/apps/settings')} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-4 sm:space-y-5">
          {/* LLM 配置区域 */}
          <div className="bg-white/30 rounded-2xl p-3 sm:p-4 space-y-3">
            <h3 className="text-sm font-semibold opacity-80" style={{ color: fontColor.value }}>
              🤖 AI 对话配置
            </h3>
            
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
              {saved ? '✓ 已保存' : '保存 AI 配置'}
            </button>
          </div>
          
          {/* TTS 语音配置区域 */}
          <div className="bg-white/30 rounded-2xl p-3 sm:p-4 space-y-3">
            <h3 className="text-sm font-semibold opacity-80" style={{ color: fontColor.value }}>
              🎙️ MiniMax 语音配置
            </h3>
            
            <div className="text-xs opacity-60 bg-blue-50/50 px-3 py-2 rounded-xl" style={{ color: fontColor.value }}>
              <p>💡 注册 MiniMax 获取 API Key：</p>
              <p className="mt-1">platform.minimaxi.com → 注册 → 账户管理 → 接口密钥</p>
            </div>
            
            {/* 启用开关 */}
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: fontColor.value }}>启用语音功能</span>
              <button
                onClick={() => setTtsEnabled(!ttsEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${ttsEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${ttsEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>MiniMax API Key</label>
              <input
                type="password"
                value={ttsApiKey}
                onChange={(e) => setTtsApiKey(e.target.value)}
                placeholder="eyJhbGciOiJSUz..."
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs sm:text-sm"
                style={{ color: fontColor.value }}
              />
            </div>
            
            {/* 音色选择 */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>选择音色</label>
              <div className="relative">
                <select 
                  value={ttsVoiceId} 
                  onChange={(e) => setTtsVoiceId(e.target.value)} 
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 appearance-none focus:border-white/50 cursor-pointer text-sm" 
                  style={{ color: fontColor.value }}
                >
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>{v.name} - {v.desc}</option>
                  ))}
                </select>
                <svg className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" style={{ color: fontColor.value }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
            
            {/* 模型选择 */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>语音模型</label>
              <div className="relative">
                <select 
                  value={ttsModel} 
                  onChange={(e) => setTtsModel(e.target.value)} 
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 appearance-none focus:border-white/50 cursor-pointer text-sm" 
                  style={{ color: fontColor.value }}
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} - {m.desc}</option>
                  ))}
                </select>
                <svg className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" style={{ color: fontColor.value }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
            
            {/* 语速调节 */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>
                语速：{ttsSpeed.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={ttsSpeed}
                onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                className="w-full h-2 bg-white/50 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs opacity-50" style={{ color: fontColor.value }}>
                <span>慢 0.5x</span>
                <span>正常 1x</span>
                <span>快 2x</span>
              </div>
            </div>
            
            {ttsTestError && (
              <div className="text-xs sm:text-sm text-red-500 bg-red-50/50 px-3 py-2.5 rounded-2xl border border-red-200">
                {ttsTestError}
              </div>
            )}
            
            <div className="flex gap-2">
              <button 
                onClick={handleTestTTS} 
                disabled={ttsTestLoading}
                className="flex-1 py-2.5 sm:py-3 rounded-2xl bg-white/50 hover:bg-white/60 border border-white/30 font-medium transition-colors disabled:opacity-50 press-effect text-sm" 
                style={{ color: fontColor.value }}
              >
                {ttsTestLoading ? '测试中...' : '🔊 测试语音'}
              </button>
              
              <button 
                onClick={handleSaveTTS} 
                className={`flex-1 py-2.5 sm:py-3 rounded-2xl font-semibold text-white transition-all press-effect ${ttsSaved ? 'bg-green-500' : 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-[0_6px_20px_rgba(168,85,247,0.3)]'}`}
              >
                {ttsSaved ? '✓ 已保存' : '保存语音配置'}
              </button>
            </div>
          </div>
          
          {/* 底部留白 */}
          <div className="h-4" />
        </div>
      </div>
    </PageContainer>
  )
}
