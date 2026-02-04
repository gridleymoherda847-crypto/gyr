import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS, type LLMApiInterface, type TTSRegion, type TTSVoice } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'
import { getAdvancedConfig } from '../PresetScreen'

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
  const isHttpsPage = typeof window !== 'undefined' && window.location?.protocol === 'https:'

  const getBaseUrlPlaceholder = (t: LLMApiInterface) => {
    if (t === 'gemini_native') return 'https://generativelanguage.googleapis.com/v1beta'
    if (t === 'anthropic_native') return 'https://api.anthropic.com/v1'
    if (t === 'ollama') return 'http://localhost:11434/api'
    return 'https://api.openai.com/v1'
  }
  
  // API 配置条目类型
  type ApiConfigItem = {
    id: string
    name: string // 备注名
    baseUrl: string
    apiKey: string
    selectedModel: string
    models: string[]
    apiInterface?: LLMApiInterface
  }
  
  // 从 localStorage 加载保存的 API 配置列表
  const loadSavedConfigs = (): ApiConfigItem[] => {
    try {
      const saved = localStorage.getItem('mina_api_configs')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  }
  
  // 保存 API 配置列表到 localStorage
  const saveSavedConfigs = (configs: ApiConfigItem[]) => {
    try {
      localStorage.setItem('mina_api_configs', JSON.stringify(configs))
    } catch {}
  }
  
  // API 配置条目列表
  const [savedConfigs, setSavedConfigs] = useState<ApiConfigItem[]>(loadSavedConfigs)
  const [newConfigName, setNewConfigName] = useState('')
  // 编辑已保存配置
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null)
  const [editConfigName, setEditConfigName] = useState('')
  const [editBaseUrl, setEditBaseUrl] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [editSelectedModel, setEditSelectedModel] = useState('')
  const [editModels, setEditModels] = useState<string[]>([])
  const [editApiInterface, setEditApiInterface] = useState<LLMApiInterface>('openai_compatible')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  
  // LLM 配置状态
  const [baseUrl, setBaseUrl] = useState(llmConfig.apiBaseUrl)
  const [apiKey, setApiKey] = useState(llmConfig.apiKey)
  const [selectedModel, setSelectedModel] = useState(llmConfig.selectedModel)
  const [models, setModels] = useState<string[]>(llmConfig.availableModels)
  const [apiInterface, setApiInterface] = useState<LLMApiInterface>(llmConfig.apiInterface || 'openai_compatible')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('mina_current_api_config_id') || null
    } catch { return null }
  })
  
  // TTS 配置状态
  const [ttsApiKey, setTtsApiKey] = useState(ttsConfig.apiKey)
  const [ttsVoiceId, setTtsVoiceId] = useState(ttsConfig.voiceId)
  const [ttsModel, setTtsModel] = useState(ttsConfig.model)
  const [ttsSpeed, setTtsSpeed] = useState(ttsConfig.speed)
  const [ttsRegion, setTtsRegion] = useState<TTSRegion>(ttsConfig.region || 'cn')
  const [customVoices, setCustomVoices] = useState<TTSVoice[]>(ttsConfig.customVoices || [])
  const [ttsSaved, setTtsSaved] = useState(false)
  const [ttsTestLoading, setTtsTestLoading] = useState(false)
  const [ttsTestError, setTtsTestError] = useState('')
  
  // 板块折叠状态
  const [showTTSSection, setShowTTSSection] = useState(false)
  
  // 密钥可见性状态
  const [showApiKey, setShowApiKey] = useState(false)
  const [showTtsApiKey, setShowTtsApiKey] = useState(false)
  const [showEditApiKey, setShowEditApiKey] = useState(false)
  
  // 高级选项展开状态
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  // 音色克隆状态
  const [cloneLoading, setCloneLoading] = useState(false)
  const [cloneError, setCloneError] = useState('')
  const [cloneSuccess, setCloneSuccess] = useState('')
  const [cloneVoiceName, setCloneVoiceName] = useState('')
  
  // 获取音色列表状态
  const [fetchVoicesLoading, setFetchVoicesLoading] = useState(false)
  
  // 导入已有音色状态
  const [showImportVoice, setShowImportVoice] = useState(false)
  const [importVoiceId, setImportVoiceId] = useState('')
  const [importVoiceName, setImportVoiceName] = useState('')
  
  // 高级参数状态
  const advancedConfig = getAdvancedConfig()
  const [temperature, setTemperature] = useState(advancedConfig.temperature)
  const [topP, setTopP] = useState(advancedConfig.topP)
  const [maxTokens, setMaxTokens] = useState(advancedConfig.maxTokens)
  const [frequencyPenalty, setFrequencyPenalty] = useState(advancedConfig.frequencyPenalty)
  const [presencePenalty, setPresencePenalty] = useState(advancedConfig.presencePenalty)

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
      const modelList = await fetchAvailableModels({ apiBaseUrl: baseUrl, apiKey, apiInterface })
      setModels(modelList)
    } catch (err: any) {
      const raw = String(err?.message || err || '')
      const hint =
        isHttpsPage && baseUrl.trim().toLowerCase().startsWith('http://')
          ? '\n\n提示：当前是 HTTPS 页面，Base URL 用 http:// 会被浏览器拦截（混合内容）。'
          : ''
      setError(`获取模型失败（已加载默认列表）。\n${raw}${hint}`.trim())
      setModels(['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet'])
    } finally { setLoading(false) }
  }

  const openEditConfig = (config: ApiConfigItem) => {
    setEditingConfigId(config.id)
    setEditConfigName(config.name || '')
    setEditBaseUrl(config.baseUrl || '')
    setEditApiKey(config.apiKey || '')
    setEditSelectedModel(config.selectedModel || '')
    setEditModels(Array.isArray(config.models) ? config.models : [])
    setEditApiInterface((config.apiInterface as any) || 'openai_compatible')
    setEditError('')
  }

  const fetchModelsForEdit = async () => {
    if (!editBaseUrl || !editApiKey) {
      setEditError('请先填写 API Base URL 和 API Key')
      return
    }
    setEditLoading(true)
    setEditError('')
    try {
      const modelList = await fetchAvailableModels({ apiBaseUrl: editBaseUrl, apiKey: editApiKey, apiInterface: editApiInterface })
      setEditModels(modelList)
      // 如果当前选中的模型不在列表里，先清空，避免保存无效模型
      if (editSelectedModel && !modelList.includes(editSelectedModel)) {
        setEditSelectedModel('')
      }
    } catch (err: any) {
      const raw = String(err?.message || err || '')
      const hint =
        isHttpsPage && editBaseUrl.trim().toLowerCase().startsWith('http://')
          ? '\n\n提示：HTTPS 页面下使用 http:// Base URL 可能会被浏览器拦截（混合内容）。'
          : ''
      setEditError(`获取模型失败。\n${raw}${hint}`.trim())
    } finally {
      setEditLoading(false)
    }
  }

  const saveEditedConfig = () => {
    if (!editingConfigId) return
    if (!editConfigName.trim() || !editBaseUrl.trim() || !editApiKey.trim()) {
      setEditError('请填写：配置名称 / Base URL / API Key')
      return
    }
    const updatedItem: ApiConfigItem = {
      id: editingConfigId,
      name: editConfigName.trim(),
      baseUrl: editBaseUrl.trim(),
      apiKey: editApiKey.trim(),
      selectedModel: editSelectedModel,
      models: editModels,
      apiInterface: editApiInterface,
    }
    const updated = savedConfigs.map(c => (c.id === editingConfigId ? updatedItem : c))
    setSavedConfigs(updated)
    saveSavedConfigs(updated)
    // 如果正在使用的是这个配置：立即同步到全局配置
    if (currentConfigId === editingConfigId) {
      loadConfig(updatedItem)
    }
    setEditingConfigId(null)
  }

  // 保存当前配置为新条目
  const handleSaveAsConfig = () => {
    if (!newConfigName.trim() || !baseUrl.trim() || !apiKey.trim()) return
    const newConfig: ApiConfigItem = {
      id: `config_${Date.now()}`,
      name: newConfigName.trim(),
      baseUrl,
      apiKey,
      selectedModel,
      models,
      apiInterface,
    }
    const updated = [...savedConfigs, newConfig]
    setSavedConfigs(updated)
    saveSavedConfigs(updated)
    setCurrentConfigId(newConfig.id)
    localStorage.setItem('mina_current_api_config_id', newConfig.id)
    // 同时更新到全局配置（立即使用）
    setLLMConfig({ 
      apiBaseUrl: baseUrl, 
      apiKey, 
      selectedModel, 
      availableModels: models,
      apiInterface,
    })
    // 保存高级参数
    saveAdvancedConfig({ temperature, topP, maxTokens, frequencyPenalty, presencePenalty })
    // 清空输入框，准备添加下一个
    setNewConfigName('')
    setBaseUrl('')
    setApiKey('')
    setSelectedModel('')
    setModels([])
    // 显示保存成功
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  
  // 保存高级参数到 localStorage
  const saveAdvancedConfig = (params: { temperature: number; topP: number; maxTokens: number; frequencyPenalty: number; presencePenalty: number }) => {
    try {
      const saved = localStorage.getItem('littlephone_workshop_config')
      const config = saved ? JSON.parse(saved) : { narrative: {}, lorebooks: [], advanced: {} }
      config.advanced = params
      localStorage.setItem('littlephone_workshop_config', JSON.stringify(config))
    } catch {}
  }
  
  // 加载已保存的配置
  const loadConfig = (config: ApiConfigItem) => {
    setBaseUrl(config.baseUrl)
    setApiKey(config.apiKey)
    setSelectedModel(config.selectedModel)
    setModels(config.models)
    setApiInterface((config.apiInterface as any) || 'openai_compatible')
    setCurrentConfigId(config.id)
    localStorage.setItem('mina_current_api_config_id', config.id)
    // 同时更新到全局配置
    setLLMConfig({ 
      apiBaseUrl: config.baseUrl, 
      apiKey: config.apiKey, 
      selectedModel: config.selectedModel, 
      availableModels: config.models,
      apiInterface: ((config.apiInterface as any) || 'openai_compatible') as LLMApiInterface,
    })
  }
  
  // 删除已保存的配置
  const deleteConfig = (id: string) => {
    const updated = savedConfigs.filter(c => c.id !== id)
    setSavedConfigs(updated)
    saveSavedConfigs(updated)
    if (currentConfigId === id) {
      setCurrentConfigId(null)
      localStorage.removeItem('mina_current_api_config_id')
    }
  }
  
  const handleSaveTTS = () => {
    // enabled 根据 apiKey 是否填写自动判断
    setTTSConfig({ 
      apiKey: ttsApiKey, 
      voiceId: ttsVoiceId, 
      model: ttsModel, 
      speed: ttsSpeed, 
      enabled: !!ttsApiKey.trim(),
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
        createdAt: Date.now(),
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
          {/* AI 对话配置区域 */}
          <div className="bg-white/40 rounded-2xl overflow-hidden p-4 space-y-4 border border-white/50 shadow-sm">
            <div className="flex items-center gap-3 pb-3 border-b border-white/30">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center shadow-sm">
                <span className="text-xl">🤖</span>
              </div>
              <div>
                <h3 className="text-sm font-bold" style={{ color: fontColor.value }}>
                  AI 对话配置
                </h3>
                <p className="text-xs opacity-50" style={{ color: fontColor.value }}>
                  配置 LLM API 让角色能对话
                </p>
              </div>
            </div>
            
            {/* 我的 API 配置列表 */}
            {savedConfigs.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-medium opacity-60" style={{ color: fontColor.value }}>
                  我的 API 配置
                </label>
                <div className="space-y-2">
                  {savedConfigs.map(config => (
                    <div 
                      key={config.id}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                        currentConfigId === config.id 
                          ? 'bg-green-50/80 border-green-400 shadow-sm' 
                          : 'bg-white/50 border-white/30 hover:bg-white/70'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => loadConfig(config)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            currentConfigId === config.id ? 'border-green-500 bg-green-500' : 'border-gray-300'
                          }`}>
                            {currentConfigId === config.id && (
                              <span className="text-white text-xs">✓</span>
                            )}
                          </span>
                          <span className="text-sm font-medium truncate" style={{ color: fontColor.value }}>
                            {config.name}
                          </span>
                        </div>
                        <div className="text-xs opacity-50 truncate ml-6" style={{ color: fontColor.value }}>
                          {config.selectedModel || config.baseUrl}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditConfig(config)}
                        className="flex-shrink-0 whitespace-nowrap text-blue-500 text-xs px-2 py-1 hover:text-blue-700"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteConfig(config.id)}
                        className="flex-shrink-0 whitespace-nowrap text-red-400 text-xs px-2 py-1 hover:text-red-600"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 分隔线 */}
            {savedConfigs.length > 0 && (
              <div className="border-t border-white/20 pt-4">
                <div className="text-xs font-medium opacity-60 mb-3" style={{ color: fontColor.value }}>
                  添加新配置
                </div>
              </div>
            )}
            
            {/* 配置名称（放在最上面） */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>配置名称</label>
              <input
                type="text"
                value={newConfigName}
                onChange={(e) => setNewConfigName(e.target.value)}
                placeholder="例如：Gemini Pro、Claude 3.5、GPT-4"
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs sm:text-sm"
                style={{ color: fontColor.value }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>接口类型</label>
              <div className="relative">
                <select
                  value={apiInterface}
                  onChange={(e) => setApiInterface(e.target.value as LLMApiInterface)}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 appearance-none focus:border-white/50 cursor-pointer text-sm sm:text-base"
                  style={{ color: fontColor.value }}
                >
                  <option value="openai_compatible">OpenAI 兼容（/v1/models + /v1/chat/completions）</option>
                  <option value="anthropic_native">Claude 原生（Anthropic /v1/messages）</option>
                  <option value="gemini_native">Gemini 原生（Google /v1beta/models）</option>
                  <option value="ollama">Ollama 本地（/api/chat）</option>
                </select>
                <svg className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" style={{ color: fontColor.value }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              <div className="text-[11px] opacity-50 leading-relaxed" style={{ color: fontColor.value }}>
                如果你用的是 Claude/Gemini 官方原生接口，记得在这里切换；否则会出现“返回空内容/格式不兼容”的报错。
              </div>
            </div>
          
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>API Base URL</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={getBaseUrlPlaceholder(apiInterface)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs sm:text-sm"
                style={{ color: fontColor.value }}
              />
              {isHttpsPage && baseUrl.trim().toLowerCase().startsWith('http://') && (
                <div className="text-xs text-orange-600 bg-orange-50/60 px-3 py-2 rounded-2xl border border-orange-200 whitespace-pre-wrap">
                  你当前是 HTTPS 页面。Base URL 如果用 http://，浏览器通常会拦截（混合内容），表现为“少部分手机怎么都连不上/请求失败”。
                  建议改成 https:// 的中转地址。
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-xxxxxxxx"
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 pr-12 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs sm:text-sm"
                  style={{ color: fontColor.value }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-50 hover:opacity-80 transition-opacity"
                  style={{ color: fontColor.value }}
                >
                  {showApiKey ? '隐藏' : '查看'}
                </button>
              </div>
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

            {/* 存储按钮 */}
            <button 
              onClick={handleSaveAsConfig} 
              disabled={!newConfigName.trim() || !baseUrl.trim() || !apiKey.trim()}
              className={`w-full py-3 sm:py-3.5 rounded-2xl font-semibold text-white transition-all press-effect disabled:opacity-50 ${
                saved ? 'bg-green-500' : 'bg-gradient-to-r from-blue-500 to-cyan-500 shadow-[0_6px_20px_rgba(59,130,246,0.3)]'
              }`}
            >
              {saved ? '✓ 已存储' : '存储此配置'}
            </button>
            
            {!newConfigName.trim() && baseUrl.trim() && apiKey.trim() && (
              <div className="text-xs text-orange-500 text-center">请先填写配置名称</div>
            )}
                
            {/* 高级参数设置 */}
            <div className="mt-4 pt-4 border-t border-white/20 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">⚙️</span>
                <span className="font-medium text-sm" style={{ color: fontColor.value }}>高级参数</span>
                <span className="text-xs opacity-50" style={{ color: fontColor.value }}>（不确定就保持默认）</span>
              </div>
              
              {/* 温度 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm" style={{ color: fontColor.value }}>温度 (Temperature)</div>
                  <span className="text-xs font-mono bg-white/30 px-2 py-1 rounded" style={{ color: fontColor.value }}>
                    {temperature.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs opacity-40" style={{ color: fontColor.value }}>
                  <span>稳定 0</span>
                  <span>平衡 1</span>
                  <span>创意 2</span>
                </div>
              </div>
              
              {/* Top P */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm" style={{ color: fontColor.value }}>Top P</div>
                  <span className="text-xs font-mono bg-white/30 px-2 py-1 rounded" style={{ color: fontColor.value }}>
                    {topP.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={topP}
                  onChange={(e) => setTopP(parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs opacity-40" style={{ color: fontColor.value }}>
                  <span>精确 0</span>
                  <span>推荐 0.95</span>
                  <span>多样 1</span>
                </div>
              </div>
              
              {/* 最大回复长度 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm" style={{ color: fontColor.value }}>最大回复长度</div>
                  <span className="text-xs font-mono bg-white/30 px-2 py-1 rounded" style={{ color: fontColor.value }}>
                    {maxTokens}
                  </span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="4000"
                  step="100"
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs opacity-40" style={{ color: fontColor.value }}>
                  <span>简短 100</span>
                  <span>适中 1000</span>
                  <span>详细 4000</span>
                </div>
              </div>
              
              {/* 频率惩罚 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm" style={{ color: fontColor.value }}>频率惩罚（减少重复）</div>
                  <span className="text-xs font-mono bg-white/30 px-2 py-1 rounded" style={{ color: fontColor.value }}>
                    {frequencyPenalty.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={frequencyPenalty}
                  onChange={(e) => setFrequencyPenalty(parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              
              {/* 存在惩罚 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm" style={{ color: fontColor.value }}>存在惩罚（鼓励新话题）</div>
                  <span className="text-xs font-mono bg-white/30 px-2 py-1 rounded" style={{ color: fontColor.value }}>
                    {presencePenalty.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={presencePenalty}
                  onChange={(e) => setPresencePenalty(parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              
              {/* 重置默认 */}
              <button
                type="button"
                onClick={() => {
                  setTemperature(0.8)
                  setTopP(0.95)
                  setMaxTokens(1000)
                  setFrequencyPenalty(0)
                  setPresencePenalty(0)
                }}
                className="w-full py-2 rounded-xl bg-white/30 text-sm hover:bg-white/40 transition-colors"
                style={{ color: fontColor.value }}
              >
                重置为默认参数
              </button>
            </div>
          </div>
          
          {/* TTS 语音配置区域 - 可折叠 */}
          <div className="bg-white/40 rounded-2xl overflow-hidden border border-white/50 shadow-sm">
            {/* 折叠头部 */}
            <button
              onClick={() => setShowTTSSection(!showTTSSection)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-sm">
                  <span className="text-xl">🎙️</span>
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-bold" style={{ color: fontColor.value }}>
                    语音配置
                  </h3>
                  <p className="text-xs opacity-50" style={{ color: fontColor.value }}>
                    {ttsConfig.enabled ? `已启用：${ttsConfig.voiceId || '默认音色'}` : '让角色用语音回复你'}
                  </p>
                </div>
              </div>
              <svg 
                className={`w-5 h-5 opacity-50 transition-transform ${showTTSSection ? 'rotate-180' : ''}`} 
                style={{ color: fontColor.value }} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* 折叠内容 */}
            {showTTSSection && (
              <div className="p-3 sm:p-4 pt-0 space-y-3 border-t border-white/10">
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
                
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>MiniMax API Key</label>
                  <div className="relative">
                    <input
                      type={showTtsApiKey ? "text" : "password"}
                      value={ttsApiKey}
                      onChange={(e) => setTtsApiKey(e.target.value)}
                      placeholder="从 MiniMax 控制台复制"
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 pr-12 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs sm:text-sm"
                      style={{ color: fontColor.value }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowTtsApiKey(!showTtsApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-50 hover:opacity-80 transition-opacity"
                      style={{ color: fontColor.value }}
                    >
                      {showTtsApiKey ? '隐藏' : '查看'}
                    </button>
                  </div>
                </div>
                
                {/* 音色选择 - 简化版 */}
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>
                    默认音色
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
                  <p className="text-xs opacity-40" style={{ color: fontColor.value }}>
                    每个角色可以在聊天设置里单独选择音色
                  </p>
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
                    
                    {/* 已克隆音色管理 */}
                    <div className="bg-purple-50/30 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium" style={{ color: fontColor.value }}>
                          🎭 我的克隆音色
                        </h4>
                        <button
                          onClick={() => setShowImportVoice(!showImportVoice)}
                          className="text-xs px-2 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600"
                        >
                          + 导入已有
                        </button>
                      </div>
                      
                      {/* 导入已有音色表单 */}
                      {showImportVoice && (
                        <div className="bg-blue-50/50 rounded-lg p-3 space-y-2 border border-blue-200/50">
                          <p className="text-xs text-blue-700">
                            如果你已在 MiniMax 官网克隆过音色，可以直接输入 Voice ID 导入使用。
                          </p>
                          <input
                            type="text"
                            value={importVoiceId}
                            onChange={(e) => setImportVoiceId(e.target.value)}
                            placeholder="Voice ID（在 MiniMax 控制台复制）"
                            className="w-full px-3 py-2 rounded-lg bg-white border border-blue-200 text-xs"
                            style={{ color: fontColor.value }}
                          />
                          <input
                            type="text"
                            value={importVoiceName}
                            onChange={(e) => setImportVoiceName(e.target.value)}
                            placeholder="给音色起个名字"
                            className="w-full px-3 py-2 rounded-lg bg-white border border-blue-200 text-xs"
                            style={{ color: fontColor.value }}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (importVoiceId.trim()) {
                                  const newVoice = {
                                    id: importVoiceId.trim(),
                                    name: importVoiceName.trim() || '导入的音色',
                                    desc: '从 MiniMax 导入',
                                    isCloned: true,
                                    createdAt: Date.now(),
                                  }
                                  setCustomVoices(prev => [...prev, newVoice])
                                  setImportVoiceId('')
                                  setImportVoiceName('')
                                  setShowImportVoice(false)
                                }
                              }}
                              disabled={!importVoiceId.trim()}
                              className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-xs font-medium disabled:opacity-50"
                            >
                              导入
                            </button>
                            <button
                              onClick={() => setShowImportVoice(false)}
                              className="px-3 py-2 rounded-lg bg-gray-200 text-gray-600 text-xs"
                            >
                              取消
                            </button>
                          </div>
                          <a 
                            href="https://platform.minimaxi.com/user-center/basic-information/interface-key" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 underline block"
                          >
                            去 MiniMax 控制台查看我的音色 →
                          </a>
                        </div>
                      )}
                      
                      {customVoices.length > 0 ? (
                        <div className="space-y-2">
                          {customVoices.map((voice) => (
                            <div key={voice.id} className="flex items-center justify-between bg-white/50 rounded-lg px-3 py-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate" style={{ color: fontColor.value }}>{voice.name}</div>
                                <div className="text-xs opacity-50" style={{ color: fontColor.value }}>
                                  {voice.createdAt 
                                    ? `添加于 ${new Date(voice.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                                    : voice.id
                                  }
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setCustomVoices(prev => prev.filter(v => v.id !== voice.id))
                                  if (ttsVoiceId === voice.id) {
                                    setTtsVoiceId('female-shaonv')
                                  }
                                }}
                                className="text-red-500 hover:text-red-600 text-xs px-2 py-1 rounded-lg hover:bg-red-50 flex-shrink-0"
                              >
                                删除
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs opacity-50 text-center py-2" style={{ color: fontColor.value }}>
                          暂无克隆音色，点击上方"导入已有"或下方"克隆新音色"添加
                        </p>
                      )}
                      <div className="text-xs opacity-50" style={{ color: fontColor.value }}>
                        注：删除只是从本地列表移除，不会删除 MiniMax 服务器上的音色
                      </div>
                    </div>
                    
                    {/* 音色克隆区域 */}
                    <div className="bg-orange-50/30 rounded-xl p-3 space-y-3">
                      <h4 className="text-sm font-medium" style={{ color: fontColor.value }}>
                        🎭 克隆新音色
                      </h4>
                      
                      {/* 注意事项 */}
                      <div className="text-xs space-y-1.5 bg-yellow-50/50 p-2.5 rounded-lg border border-yellow-200/50">
                        <p className="font-medium text-yellow-700">📋 克隆前须知：</p>
                        <ul className="text-yellow-600 space-y-1 pl-3">
                          <li>• 需要先在 MiniMax 官网完成<span className="font-medium">个人实名认证</span></li>
                          <li>• 音频要求：10秒-5分钟，清晰人声，无背景音乐</li>
                          <li>• 支持格式：MP3、WAV、M4A（不支持微信语音）</li>
                          <li>• 手机录音 App 录制的效果最好</li>
                        </ul>
                      </div>
                      
                      {/* 音色名称 */}
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
                      
                      {/* 错误/成功提示 */}
                      {cloneError && (
                        <div className="text-xs text-red-500 bg-red-50/50 px-3 py-2 rounded-xl border border-red-200 whitespace-pre-wrap">
                          {cloneError}
                        </div>
                      )}
                      
                      {cloneSuccess && (
                        <div className="text-xs text-green-600 bg-green-50/50 px-3 py-2 rounded-xl border border-green-200">
                          {cloneSuccess}
                        </div>
                      )}
                      
                      {/* 上传文件按钮 */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*,.mp3,.wav,.m4a,.aac"
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
                      
                      <div className="text-xs text-center opacity-50" style={{ color: fontColor.value }}>
                        手机端推荐：先用录音App录好，再点上面按钮选择
                      </div>
                      
                      {/* 官网备用方案 */}
                      <div className="border-t border-orange-200/30 pt-3 mt-2">
                        <p className="text-xs opacity-60 mb-2" style={{ color: fontColor.value }}>
                          如果上传失败，可以去 MiniMax 官网克隆：
                        </p>
                        <a
                          href="https://platform.minimaxi.com/user-center/basic-information/voice-clone"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full py-2 rounded-xl bg-white/50 border border-orange-200 text-center text-xs font-medium press-effect"
                          style={{ color: fontColor.value }}
                        >
                          🔗 打开 MiniMax 官网克隆页面
                        </a>
                        <p className="text-xs opacity-40 mt-2 text-center" style={{ color: fontColor.value }}>
                          在官网克隆后，点击上方「刷新我的音色」同步到这里
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* 底部留白 */}
          <div className="h-4" />
        </div>
      </div>

      {/* 编辑已保存的 API 配置 */}
      {editingConfigId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/35"
            onClick={() => setEditingConfigId(null)}
            role="presentation"
          />
          <div className="relative w-full max-w-[420px] rounded-2xl bg-white/95 border border-white/30 shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-black/10 text-center text-sm font-semibold" style={{ color: fontColor.value }}>
              编辑 API 配置
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs opacity-60" style={{ color: fontColor.value }}>配置名称</label>
                <input
                  value={editConfigName}
                  onChange={(e) => setEditConfigName(e.target.value)}
                  placeholder="例如：Gemini / Claude / GPT"
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-black/10 text-[13px] outline-none"
                  style={{ color: fontColor.value }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs opacity-60" style={{ color: fontColor.value }}>接口类型</label>
                <div className="relative">
                  <select
                    value={editApiInterface}
                    onChange={(e) => setEditApiInterface(e.target.value as LLMApiInterface)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-black/10 text-[13px] outline-none appearance-none"
                    style={{ color: fontColor.value }}
                  >
                    <option value="openai_compatible">OpenAI 兼容</option>
                    <option value="anthropic_native">Claude 原生（Anthropic）</option>
                    <option value="gemini_native">Gemini 原生（Google）</option>
                    <option value="ollama">Ollama 本地</option>
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" style={{ color: fontColor.value }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs opacity-60" style={{ color: fontColor.value }}>API Base URL</label>
                <input
                  value={editBaseUrl}
                  onChange={(e) => setEditBaseUrl(e.target.value)}
                  placeholder={getBaseUrlPlaceholder(editApiInterface)}
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-black/10 text-[13px] outline-none"
                  style={{ color: fontColor.value }}
                />
                {isHttpsPage && editBaseUrl.trim().toLowerCase().startsWith('http://') && (
                  <div className="text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded-xl border border-orange-200 whitespace-pre-wrap">
                    提示：HTTPS 页面下使用 http:// Base URL 可能会被浏览器拦截（混合内容）。
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs opacity-60" style={{ color: fontColor.value }}>API Key</label>
                <div className="relative">
                  <input
                    type={showEditApiKey ? "text" : "password"}
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    placeholder="sk-xxxx"
                    className="w-full px-3 py-2.5 pr-12 rounded-xl bg-white border border-black/10 text-[13px] outline-none"
                    style={{ color: fontColor.value }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditApiKey(!showEditApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs opacity-50 hover:opacity-80 transition-opacity"
                    style={{ color: fontColor.value }}
                  >
                    {showEditApiKey ? '隐藏' : '查看'}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={fetchModelsForEdit}
                disabled={editLoading}
                className="w-full py-2.5 rounded-xl bg-white hover:bg-gray-50 border border-black/10 text-[13px] font-medium disabled:opacity-50"
                style={{ color: fontColor.value }}
              >
                {editLoading ? '获取中...' : '获取模型列表'}
              </button>

              {editModels.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs opacity-60" style={{ color: fontColor.value }}>选择模型</label>
                  <select
                    value={editSelectedModel}
                    onChange={(e) => setEditSelectedModel(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-black/10 text-[13px] outline-none"
                    style={{ color: fontColor.value }}
                  >
                    <option value="">请选择模型</option>
                    {editModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!!editError && (
                <div className="text-xs text-red-600 bg-red-50/70 border border-red-200 rounded-xl px-3 py-2">
                  {editError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingConfigId(null)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-700 active:scale-[0.99]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={saveEditedConfig}
                  className="flex-1 py-2.5 rounded-xl bg-[#07C160] text-[13px] font-semibold text-white active:scale-[0.99]"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
