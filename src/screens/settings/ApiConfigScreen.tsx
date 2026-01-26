import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS, type TTSRegion, type TTSVoice } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'

// MiniMax 系统预设音色列表
const SYSTEM_VOICE_OPTIONS: TTSVoice[] = [
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  
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
  const [ttsRegion, setTtsRegion] = useState<TTSRegion>(ttsConfig.region || 'cn')
  const [customVoices, setCustomVoices] = useState<TTSVoice[]>(ttsConfig.customVoices || [])
  const [ttsSaved, setTtsSaved] = useState(false)
  const [ttsTestLoading, setTtsTestLoading] = useState(false)
  const [ttsTestError, setTtsTestError] = useState('')
  
  // 高级选项展开状态
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  // 音色克隆状态
  const [cloneLoading, setCloneLoading] = useState(false)
  const [cloneError, setCloneError] = useState('')
  const [cloneSuccess, setCloneSuccess] = useState('')
  const [cloneVoiceName, setCloneVoiceName] = useState('')
  
  // 获取音色列表状态
  const [fetchVoicesLoading, setFetchVoicesLoading] = useState(false)

  // 获取 API 基础 URL
  const getBaseUrl = (region: TTSRegion) => {
    return region === 'global' 
      ? 'https://api.minimax.chat'  // 海外版
      : 'https://api.minimaxi.com'   // 国内版
  }
  
  // 生成随机音色ID
  const generateVoiceId = () => {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 6)
    return `Voice${timestamp}${random}`
  }

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
      enabled: ttsEnabled,
      region: ttsRegion,
      customVoices: customVoices,
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
      enabled: true,
      region: ttsRegion,
      customVoices: customVoices,
    })
    
    try {
      const audioUrl = await textToSpeech('你好，这是语音测试。')
      if (audioUrl) {
        const audio = new Audio(audioUrl)
        audio.play()
      } else {
        setTtsTestError('语音合成失败，请检查 API Key 和区域设置')
      }
    } catch (err) {
      setTtsTestError('测试失败：' + (err as Error).message)
    } finally {
      setTtsTestLoading(false)
    }
  }
  
  // 获取已有音色列表（包括克隆的）
  const handleFetchVoices = async () => {
    if (!ttsApiKey) {
      setTtsTestError('请先填写 API Key')
      return
    }
    setFetchVoicesLoading(true)
    setTtsTestError('')
    
    try {
      const baseUrl = getBaseUrl(ttsRegion)
      const response = await fetch(`${baseUrl}/v1/get_voice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ttsApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ voice_type: 'all' }),
      })
      
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`)
      }
      
      const data = await response.json()
      if (data.base_resp?.status_code !== 0) {
        throw new Error(data.base_resp?.status_msg || '获取失败')
      }
      
      // 解析克隆的音色
      const clonedVoices: TTSVoice[] = []
      if (data.voice_cloning && Array.isArray(data.voice_cloning)) {
        data.voice_cloning.forEach((v: any) => {
          clonedVoices.push({
            id: v.voice_id,
            name: v.voice_name || v.voice_id,
            desc: '我的克隆',
            isCloned: true,
          })
        })
      }
      
      setCustomVoices(clonedVoices)
      setTtsTestError('')
      if (clonedVoices.length > 0) {
        setCloneSuccess(`找到 ${clonedVoices.length} 个已克隆的音色`)
        setTimeout(() => setCloneSuccess(''), 3000)
      } else {
        setCloneSuccess('暂无已克隆的音色')
        setTimeout(() => setCloneSuccess(''), 3000)
      }
    } catch (err) {
      setTtsTestError('获取音色失败：' + (err as Error).message)
    } finally {
      setFetchVoicesLoading(false)
    }
  }
  
  // 上传音频并克隆音色
  const handleCloneVoice = async (file: File) => {
    if (!ttsApiKey) {
      setCloneError('请先在上方填写 API Key')
      return
    }
    
    // 自动生成音色ID
    const voiceId = generateVoiceId()
    const voiceName = cloneVoiceName.trim() || file.name.replace(/\.[^.]+$/, '') || voiceId
    
    setCloneLoading(true)
    setCloneError('')
    setCloneSuccess('')
    
    try {
      const baseUrl = getBaseUrl(ttsRegion)
      
      // 1. 上传音频文件
      const formData = new FormData()
      formData.append('file', file)
      formData.append('purpose', 'voice_clone')
      
      const uploadResponse = await fetch(`${baseUrl}/v1/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ttsApiKey}`,
        },
        body: formData,
      })
      
      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text()
        console.error('Upload error:', errText)
        throw new Error(`上传失败: ${uploadResponse.status}`)
      }
      
      const uploadData = await uploadResponse.json()
      if (uploadData.base_resp?.status_code !== 0) {
        throw new Error(uploadData.base_resp?.status_msg || '上传失败')
      }
      
      const fileId = uploadData.file?.file_id
      if (!fileId) {
        throw new Error('未获取到文件 ID')
      }
      
      // 2. 调用克隆接口
      const cloneResponse = await fetch(`${baseUrl}/v1/voice_clone`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ttsApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_id: fileId,
          voice_id: voiceId,
          text: '你好，这是克隆音色的测试。',
          model: 'speech-02-turbo',
          need_noise_reduction: true,
          need_volume_normalization: true,
        }),
      })
      
      if (!cloneResponse.ok) {
        const errText = await cloneResponse.text()
        console.error('Clone error:', errText)
        throw new Error(`克隆失败: ${cloneResponse.status}`)
      }
      
      const cloneData = await cloneResponse.json()
      if (cloneData.base_resp?.status_code !== 0) {
        throw new Error(cloneData.base_resp?.status_msg || '克隆失败')
      }
      
      // 添加到自定义音色列表
      const newVoice: TTSVoice = {
        id: voiceId,
        name: voiceName,
        desc: '我的克隆',
        isCloned: true,
      }
      setCustomVoices(prev => [...prev, newVoice])
      setTtsVoiceId(voiceId)
      
      // 播放试听
      if (cloneData.demo_audio) {
        const audio = new Audio(cloneData.demo_audio)
        audio.play()
      }
      
      setCloneSuccess(`克隆成功！音色「${voiceName}」已添加`)
      setCloneVoiceName('')
      setTimeout(() => setCloneSuccess(''), 5000)
      
    } catch (err) {
      setCloneError((err as Error).message)
    } finally {
      setCloneLoading(false)
    }
  }
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleCloneVoice(file)
    }
    e.target.value = ''
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
            
            {/* 区域选择 */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>
                选择区域（根据你注册的网站选）
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setTtsRegion('cn')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    ttsRegion === 'cn' 
                      ? 'bg-green-500 text-white' 
                      : 'bg-white/50 border border-white/30'
                  }`}
                  style={ttsRegion !== 'cn' ? { color: fontColor.value } : undefined}
                >
                  <div>🇨🇳 国内版</div>
                  <div className="text-xs opacity-70">minimaxi.com</div>
                </button>
                <button
                  onClick={() => setTtsRegion('global')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    ttsRegion === 'global' 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-white/50 border border-white/30'
                  }`}
                  style={ttsRegion !== 'global' ? { color: fontColor.value } : undefined}
                >
                  <div>🌍 海外版</div>
                  <div className="text-xs opacity-70">minimax.io</div>
                </button>
              </div>
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
                placeholder="从 MiniMax 控制台复制"
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs sm:text-sm"
                style={{ color: fontColor.value }}
              />
            </div>
            
            {/* 音色选择 - 简化版 */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>
                选择音色
              </label>
              <div className="relative">
                <select 
                  value={ttsVoiceId} 
                  onChange={(e) => setTtsVoiceId(e.target.value)} 
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 appearance-none focus:border-white/50 cursor-pointer text-sm" 
                  style={{ color: fontColor.value }}
                >
                  <optgroup label="📢 系统预设音色（免费使用）">
                    {SYSTEM_VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>{v.name} - {v.desc}</option>
                    ))}
                  </optgroup>
                  {customVoices.length > 0 && (
                    <optgroup label="🎭 我克隆的音色">
                      {customVoices.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </optgroup>
                  )}
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
            
            {cloneSuccess && (
              <div className="text-xs sm:text-sm text-green-600 bg-green-50/50 px-3 py-2.5 rounded-2xl border border-green-200">
                ✓ {cloneSuccess}
              </div>
            )}
            
            <div className="flex gap-2">
              <button 
                onClick={handleTestTTS} 
                disabled={ttsTestLoading}
                className="flex-1 py-2.5 sm:py-3 rounded-2xl bg-white/50 hover:bg-white/60 border border-white/30 font-medium transition-colors disabled:opacity-50 press-effect text-sm" 
                style={{ color: fontColor.value }}
              >
                {ttsTestLoading ? '播放中...' : '🔊 试听'}
              </button>
              
              <button 
                onClick={handleSaveTTS} 
                className={`flex-1 py-2.5 sm:py-3 rounded-2xl font-semibold text-white transition-all press-effect ${ttsSaved ? 'bg-green-500' : 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-[0_6px_20px_rgba(168,85,247,0.3)]'}`}
              >
                {ttsSaved ? '✓ 已保存' : '保存'}
              </button>
            </div>
            
            {/* 高级选项折叠按钮 */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm opacity-60 hover:opacity-80 transition-opacity"
              style={{ color: fontColor.value }}
            >
              <span>{showAdvanced ? '收起高级选项' : '展开高级选项（克隆音色等）'}</span>
              <svg 
                className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* 高级选项内容 */}
            {showAdvanced && (
              <div className="space-y-4 pt-2 border-t border-white/20">
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
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <svg className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" style={{ color: fontColor.value }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
                
                {/* 刷新已有音色 */}
                <button
                  onClick={handleFetchVoices}
                  disabled={fetchVoicesLoading || !ttsApiKey}
                  className="w-full py-2.5 rounded-2xl bg-white/50 hover:bg-white/60 border border-white/30 font-medium transition-colors disabled:opacity-50 press-effect text-sm"
                  style={{ color: fontColor.value }}
                >
                  {fetchVoicesLoading ? '获取中...' : '🔄 刷新我已克隆的音色'}
                </button>
                
                {/* 音色克隆区域 */}
                <div className="bg-orange-50/30 rounded-xl p-3 space-y-3">
                  <h4 className="text-sm font-medium" style={{ color: fontColor.value }}>
                    🎭 克隆新音色
                  </h4>
                  
                  <div className="text-xs opacity-60 space-y-1" style={{ color: fontColor.value }}>
                    <p>上传一段音频（10秒-5分钟），系统会学习这个声音。</p>
                    <p>之后就能用这个声音来朗读文字了。</p>
                    <p className="text-orange-600">⚠️ 需要在 MiniMax 完成个人认证才能使用</p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-medium opacity-60" style={{ color: fontColor.value }}>
                      给音色起个名字（可选）
                    </label>
                    <input
                      type="text"
                      value={cloneVoiceName}
                      onChange={(e) => setCloneVoiceName(e.target.value)}
                      placeholder="例如：小红的声音"
                      className="w-full px-3 py-2 rounded-xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs"
                      style={{ color: fontColor.value }}
                    />
                  </div>
                  
                  {cloneError && (
                    <div className="text-xs text-red-500 bg-red-50/50 px-3 py-2 rounded-xl border border-red-200">
                      {cloneError}
                    </div>
                  )}
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mp3,audio/m4a,audio/wav,audio/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={cloneLoading || !ttsApiKey}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-400 to-pink-500 text-white font-medium text-sm disabled:opacity-50 press-effect"
                  >
                    {cloneLoading ? '正在克隆...' : '📤 选择音频文件并克隆'}
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* 底部留白 */}
          <div className="h-4" />
        </div>
      </div>
    </PageContainer>
  )
}
