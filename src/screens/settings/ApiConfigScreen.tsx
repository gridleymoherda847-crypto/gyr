import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS, type LLMApiInterface, type TTSRegion, type TTSVoice } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'
import { getAdvancedConfig } from '../PresetScreen'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

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
  const { llmConfig, setLLMConfig, ttsConfig, setTTSConfig, textToSpeech, fontColor, fetchAvailableModels, testLLMConfig } = useOS()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isHttpsPage = typeof window !== 'undefined' && window.location?.protocol === 'https:'

  // ===== 进入 API 配置提示（每次进入都提示，除非用户二次确认“不再提示”）=====
  const API_GUIDE_DISMISSED_KEY = 'littlephone_api_config_guide_dismissed_v1'
  const [apiGuideOpen, setApiGuideOpen] = useState(false)
  const [apiGuideDontShowAgain, setApiGuideDontShowAgain] = useState(false)
  const [apiGuideConfirmOpen, setApiGuideConfirmOpen] = useState(false)
  useEffect(() => {
    let dismissed = false
    try {
      dismissed = localStorage.getItem(API_GUIDE_DISMISSED_KEY) === '1'
    } catch {
      dismissed = false
    }
    if (!dismissed) {
      setApiGuideOpen(true)
      setApiGuideDontShowAgain(false)
      setApiGuideConfirmOpen(false)
    }
  }, [])

  const getBaseUrlPlaceholder = (t: LLMApiInterface) => {
    if (t === 'gemini_native') return 'https://generativelanguage.googleapis.com'
    if (t === 'anthropic_native') return 'https://api.anthropic.com'
    if (t === 'ollama') return 'http://localhost:11434'
    return 'https://api.openai.com'
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
    useStreaming?: boolean
    // 高级参数（可选，向后兼容）
    advanced?: {
      temperature: number
      topP: number
      maxTokens: number
      frequencyPenalty: number
      presencePenalty: number
    }
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
  const [editTestLoading, setEditTestLoading] = useState(false)
  const [editTestError, setEditTestError] = useState('')
  const [editTestOk, setEditTestOk] = useState('')
  // 编辑时的高级参数状态
  const [editTemperature, setEditTemperature] = useState(0.8)
  const [editTopP, setEditTopP] = useState(0.95)
  const [editMaxTokens, setEditMaxTokens] = useState(1000)
  const [editFrequencyPenalty, setEditFrequencyPenalty] = useState(0)
  const [editPresencePenalty, setEditPresencePenalty] = useState(0)
  const [showEditAdvanced, setShowEditAdvanced] = useState(false)
  const [editUseStreaming, setEditUseStreaming] = useState(true)
  
  // LLM 配置状态
  const [useStreaming, setUseStreaming] = useState(llmConfig.useStreaming !== false)
  const [baseUrl, setBaseUrl] = useState(llmConfig.apiBaseUrl)
  const [apiKey, setApiKey] = useState(llmConfig.apiKey)
  const [selectedModel, setSelectedModel] = useState(llmConfig.selectedModel)
  // 用 ref 保证“保存时”读取到的一定是用户最后选择的模型（移动端 select 有时会出现视觉已变但 state 未及时落地）
  const selectedModelRef = useRef<string>(llmConfig.selectedModel || '')
  const [models, setModels] = useState<string[]>(llmConfig.availableModels)
  const [apiInterface, setApiInterface] = useState<LLMApiInterface>(llmConfig.apiInterface || 'openai_compatible')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [llmTestLoading, setLlmTestLoading] = useState(false)
  const [llmTestError, setLlmTestError] = useState('')
  const [llmTestOk, setLlmTestOk] = useState('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelPickerTarget, setModelPickerTarget] = useState<'main' | 'edit'>('main')
  const [modelPickerQuery, setModelPickerQuery] = useState('')
  const [currentConfigId, setCurrentConfigId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('mina_current_api_config_id') || null
    } catch { return null }
  })

  // ===== 表单校验（react-hook-form + zod，仅做校验/错误聚合；不改变现有交互形态）=====
  type LLMMainForm = {
    newConfigName: string
    apiInterface: LLMApiInterface
    baseUrl: string
    apiKey: string
    selectedModel: string
  }

  const llmMainBaseSchema = z.object({
    newConfigName: z.string().trim(),
    apiInterface: z.enum(['openai_compatible', 'anthropic_native', 'gemini_native', 'ollama']),
    baseUrl: z.string().trim().min(1, '请先填写 API Base URL'),
    apiKey: z.string().trim().min(1, '请先填写 API Key'),
    selectedModel: z.string().trim(),
  })

  const {
    register: registerLLMMain,
    setValue: setLLMMainValue,
    clearErrors: clearLLMMainErrors,
    setError: setLLMMainError,
    formState: { errors: llmMainErrors },
  } = useForm<LLMMainForm>({
    defaultValues: {
      newConfigName: newConfigName,
      apiInterface,
      baseUrl,
      apiKey,
      selectedModel: String(selectedModelRef.current || selectedModel || ''),
    },
  })

  // 当代码里“程序性更新 state”（例如 loadConfig/清空）时，同步进 RHF，避免校验读到旧值
  useEffect(() => {
    setLLMMainValue('newConfigName', newConfigName || '')
  }, [newConfigName, setLLMMainValue])
  useEffect(() => {
    setLLMMainValue('apiInterface', apiInterface)
  }, [apiInterface, setLLMMainValue])
  useEffect(() => {
    setLLMMainValue('baseUrl', baseUrl || '')
  }, [baseUrl, setLLMMainValue])
  useEffect(() => {
    setLLMMainValue('apiKey', apiKey || '')
  }, [apiKey, setLLMMainValue])
  useEffect(() => {
    setLLMMainValue('selectedModel', String(selectedModelRef.current || selectedModel || ''))
  }, [selectedModel, setLLMMainValue])

  const validateLLMMain = (need: { name?: boolean; model?: boolean } = {}) => {
    clearLLMMainErrors()
    const data: LLMMainForm = {
      newConfigName: String(newConfigName || ''),
      apiInterface,
      baseUrl: String(baseUrl || ''),
      apiKey: String(apiKey || ''),
      selectedModel: String(selectedModelRef.current || selectedModel || ''),
    }
    const parsed = llmMainBaseSchema.safeParse(data)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const k = issue.path?.[0] as keyof LLMMainForm
        if (k) setLLMMainError(k, { type: 'manual', message: issue.message })
      }
      return null
    }
    const v = parsed.data
    if (need.name && !v.newConfigName.trim()) {
      setLLMMainError('newConfigName', { type: 'manual', message: '请先填写配置名称' })
      return null
    }
    if (need.model && !v.selectedModel.trim()) {
      setLLMMainError('selectedModel', { type: 'manual', message: '请先填写/选择模型名' })
      return null
    }
    return {
      ...v,
      newConfigName: v.newConfigName.trim(),
      baseUrl: v.baseUrl.trim(),
      apiKey: v.apiKey.trim(),
      selectedModel: v.selectedModel.trim(),
    }
  }
  
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
  const [showLLMSection, setShowLLMSection] = useState(false) // AI 对话配置默认收起
  
  // 密钥可见性状态
  const [showApiKey, setShowApiKey] = useState(false)
  const [showTtsApiKey, setShowTtsApiKey] = useState(false)
  const [showEditApiKey, setShowEditApiKey] = useState(false)
  
  // 语音配置：克隆/导入音色区域默认直接展开（避免手机端误以为“功能丢了”）
  const showAdvanced = true
  // 当前配置高级参数展开状态
  const [showCurrentAdvanced, setShowCurrentAdvanced] = useState(false)
  
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
    const v = validateLLMMain()
    if (!v) {
      setError(llmMainErrors.baseUrl?.message || llmMainErrors.apiKey?.message || '请先填写 API Base URL 和 API Key')
      return
    }
    setLoading(true); setError('')
    try {
      const modelList = await fetchAvailableModels({ apiBaseUrl: v.baseUrl, apiKey: v.apiKey, apiInterface: v.apiInterface })
      setModels(modelList)
      // 获取成功后：直接弹出模型选择（减少“没反应”的错觉）
      if (modelList.length > 0) {
        setModelPickerTarget('main')
        setModelPickerQuery('')
        setModelPickerOpen(true)
      }
      // 如果当前选中的模型不在新列表里，清空，避免“保存时沿用上一次的模型”
      const cur = selectedModelRef.current || selectedModel
      if (cur && !modelList.includes(cur)) {
        selectedModelRef.current = ''
        setSelectedModel('')
      }
    } catch (err: any) {
      const raw = String(err?.message || err || '')
      const hint =
        isHttpsPage && baseUrl.trim().toLowerCase().startsWith('http://')
          ? '\n\n提示：当前是 HTTPS 页面，Base URL 用 http:// 会被浏览器拦截（混合内容）。'
          : ''
      // 体验优先：模型列表拉不到不影响聊天，只要能测试成功即可自动填入可用模型
      setError(
        `获取模型列表失败（不影响使用）。建议直接点「测试连接」自动匹配可用模型。\n` +
          `${raw ? raw.slice(0, 300) : ''}${hint}`.trim()
      )
      setModels(['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'claude-3-opus', 'claude-3-sonnet'])
    } finally { setLoading(false) }
  }

  const handleTestLLM = async () => {
    const v = validateLLMMain()
    if (!v) {
      setLlmTestError(llmMainErrors.baseUrl?.message || llmMainErrors.apiKey?.message || '请先填写 API Base URL 和 API Key')
      setLlmTestOk('')
      return
    }
    setLlmTestLoading(true)
    setLlmTestError('')
    setLlmTestOk('')
    try {
      const modelToTry = (selectedModelRef.current || selectedModel || '').trim() || undefined
      const { modelUsed, reply } = await testLLMConfig({
        apiBaseUrl: v.baseUrl,
        apiKey: v.apiKey,
        apiInterface: v.apiInterface,
        model: modelToTry,
      })
      const text = String(reply || '').trim()
      const looksLikeFailure =
        /【API 调用失败】|upstreamStatus|error\.response\.data|请求失败[:：]|networkerror|failed to fetch/i.test(text)
      if (looksLikeFailure) {
        throw new Error(text || '测试失败：上游返回异常')
      }
      const ok = /(^|\b)ok\b/i.test(text)
      setLlmTestOk(
        `连接正常：模型「${modelUsed}」回复「${text || 'OK'}」${ok ? '' : '（提示：上游没严格按 OK 返回，但已能正常调用）'}`
      )
      // 体验优化：测试成功后自动选中可用模型，避免用户还要手动挑
      if (modelUsed) {
        selectedModelRef.current = modelUsed
        setSelectedModel(modelUsed)
        // 让模型列表里一定包含它（即使 /models 拉取失败）
        setModels(prev => {
          const arr = Array.isArray(prev) ? prev : []
          if (arr.includes(modelUsed)) return arr
          return [modelUsed, ...arr].slice(0, 200)
        })
      }
    } catch (err: any) {
      const raw = String(err?.message || err || '测试失败')
      setLlmTestError(
        `${raw}\n\n建议：换一个模型再试（模型名必须和卖家提供的一致）。如果你买的是 Gemini：常见是 gemini-2.5-pro / gemini-2.5-flash；如果是 OpenAI 兼容：常见是 gpt-4o-mini / gpt-4o / gpt-3.5-turbo；也可能是 deepseek-chat / qwen-plus 等。`
      )
    } finally {
      setLlmTestLoading(false)
    }
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
    // 加载高级参数：优先使用配置中保存的，否则使用全局默认值
    const advConfig = config.advanced || getAdvancedConfig()
    setEditTemperature(advConfig.temperature)
    setEditTopP(advConfig.topP)
    setEditMaxTokens(advConfig.maxTokens)
    setEditFrequencyPenalty(advConfig.frequencyPenalty)
    setEditPresencePenalty(advConfig.presencePenalty)
    setShowEditAdvanced(false)
    setEditUseStreaming(config.useStreaming !== false)
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
      if (modelList.length > 0) {
        setModelPickerTarget('edit')
        setModelPickerQuery('')
        setModelPickerOpen(true)
      }
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
      setEditError(
        `获取模型列表失败（不影响使用）。建议直接点「测试连接」自动匹配可用模型。\n` +
          `${raw ? raw.slice(0, 300) : ''}${hint}`.trim()
      )
    } finally {
      setEditLoading(false)
    }
  }

  const handleTestLLMForEdit = async () => {
    if (!editBaseUrl.trim() || !editApiKey.trim()) {
      setEditTestError('请先填写 Base URL 和 API Key')
      setEditTestOk('')
      return
    }
    setEditTestLoading(true)
    setEditTestError('')
    setEditTestOk('')
    try {
      const modelToTry = String(editSelectedModel || '').trim() || undefined
      const { modelUsed, reply } = await testLLMConfig({
        apiBaseUrl: editBaseUrl,
        apiKey: editApiKey,
        apiInterface: editApiInterface,
        model: modelToTry,
      })
      const text = String(reply || '').trim()
      const looksLikeFailure =
        /【API 调用失败】|upstreamStatus|error\.response\.data|请求失败[:：]|networkerror|failed to fetch/i.test(text)
      if (looksLikeFailure) {
        throw new Error(text || '测试失败：上游返回异常')
      }
      const ok = /(^|\b)ok\b/i.test(text)
      setEditTestOk(
        `连接正常：模型「${modelUsed}」回复「${text || 'OK'}」${ok ? '' : '（提示：上游没严格按 OK 返回，但已能正常调用）'}`
      )
      // 体验优化：测试成功后自动填入可用模型
      if (modelUsed) {
        setEditSelectedModel(modelUsed)
        setEditModels(prev => {
          const arr = Array.isArray(prev) ? prev : []
          if (arr.includes(modelUsed)) return arr
          return [modelUsed, ...arr].slice(0, 200)
        })
      }
    } catch (err: any) {
      const raw = String(err?.message || err || '测试失败')
      setEditTestError(
        `${raw}\n\n建议：换一个模型再试（模型名必须和卖家提供的一致）。也可以先点「获取模型列表」（如果能获取），再从列表里选一个。`
      )
    } finally {
      setEditTestLoading(false)
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
      useStreaming: editUseStreaming,
      advanced: {
        temperature: editTemperature,
        topP: editTopP,
        maxTokens: editMaxTokens,
        frequencyPenalty: editFrequencyPenalty,
        presencePenalty: editPresencePenalty,
      },
    }
    const updated = savedConfigs.map(c => (c.id === editingConfigId ? updatedItem : c))
    setSavedConfigs(updated)
    saveSavedConfigs(updated)
    // 保存高级参数到全局配置（如果正在使用）
    if (currentConfigId === editingConfigId) {
      saveAdvancedConfig({
        temperature: editTemperature,
        topP: editTopP,
        maxTokens: editMaxTokens,
        frequencyPenalty: editFrequencyPenalty,
        presencePenalty: editPresencePenalty,
      })
    }
    // 如果正在使用的是这个配置：立即同步到全局配置
    if (currentConfigId === editingConfigId) {
      loadConfig(updatedItem)
    }
    setEditingConfigId(null)
  }

  // 保存当前配置为新条目
  const handleSaveAsConfig = () => {
    const v = validateLLMMain({ name: true, model: true })
    if (!v) {
      // 兼容原 UI：仍在按钮下方显示提示
      setError(llmMainErrors.newConfigName?.message || llmMainErrors.baseUrl?.message || llmMainErrors.apiKey?.message || llmMainErrors.selectedModel?.message || '')
      return
    }
    const modelToSave = v.selectedModel
    const newConfig: ApiConfigItem = {
      id: `config_${Date.now()}`,
      name: v.newConfigName,
      baseUrl: v.baseUrl,
      apiKey: v.apiKey,
      selectedModel: modelToSave,
      models,
      apiInterface: v.apiInterface,
      useStreaming,
      advanced: {
        temperature,
        topP,
        maxTokens,
        frequencyPenalty,
        presencePenalty,
      },
    }
    const updated = [...savedConfigs, newConfig]
    setSavedConfigs(updated)
    saveSavedConfigs(updated)
    setCurrentConfigId(newConfig.id)
    localStorage.setItem('mina_current_api_config_id', newConfig.id)
    setLLMConfig({ 
      apiBaseUrl: v.baseUrl, 
      apiKey: v.apiKey, 
      selectedModel: modelToSave, 
      availableModels: models,
      apiInterface: v.apiInterface,
      useStreaming,
    })
    // 保存高级参数
    saveAdvancedConfig({ temperature, topP, maxTokens, frequencyPenalty, presencePenalty })
    // 清空输入框，准备添加下一个
    setNewConfigName('')
    setBaseUrl('')
    setApiKey('')
    selectedModelRef.current = ''
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
    selectedModelRef.current = config.selectedModel || ''
    setSelectedModel(config.selectedModel)
    setModels(config.models)
    setApiInterface((config.apiInterface as any) || 'openai_compatible')
    setUseStreaming(config.useStreaming !== false)
    setCurrentConfigId(config.id)
    localStorage.setItem('mina_current_api_config_id', config.id)
    if (config.advanced) {
      setTemperature(config.advanced.temperature)
      setTopP(config.advanced.topP)
      setMaxTokens(config.advanced.maxTokens)
      setFrequencyPenalty(config.advanced.frequencyPenalty)
      setPresencePenalty(config.advanced.presencePenalty)
      saveAdvancedConfig(config.advanced)
    }
    setLLMConfig({ 
      apiBaseUrl: config.baseUrl, 
      apiKey: config.apiKey, 
      selectedModel: config.selectedModel, 
      availableModels: config.models,
      apiInterface: ((config.apiInterface as any) || 'openai_compatible') as LLMApiInterface,
      useStreaming: config.useStreaming !== false,
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
      const msg = String((err as any)?.message || err || '')
      if (/failed to fetch|networkerror|load failed/i.test(msg) || err instanceof TypeError) {
        setTtsTestError(
          '获取音色失败：网络请求被浏览器拦截或无法连接（常见是跨域/CORS）。\n' +
            '建议：\n' +
            '- 确认你选择的区域正确（国内/海外）\n' +
            '- 尝试换浏览器/换网络\n' +
            '- 也可以先去 MiniMax 官网克隆，再回这里点“刷新我已克隆的音色”同步\n'
        )
        return
      }
      setTtsTestError('获取音色失败：' + (msg || '未知错误'))
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
      // 简单校验：避免用户误选极大文件导致长时间无反应
      try {
        const maxMB = 25
        if (file.size > maxMB * 1024 * 1024) {
          throw new Error(`音频文件过大（>${maxMB}MB）。建议剪短到 10秒-5分钟再试。`)
        }
      } catch {}
      
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
        // 尝试从返回里提取可读错误
        try {
          const j = errText ? JSON.parse(errText) : {}
          const m = j?.base_resp?.status_msg || j?.error?.message || j?.message
          if (m) throw new Error(String(m))
        } catch {
          // ignore
        }
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
        try {
          const j = errText ? JSON.parse(errText) : {}
          const m = j?.base_resp?.status_msg || j?.error?.message || j?.message
          if (m) throw new Error(String(m))
        } catch {
          // ignore
        }
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
      const msg = String((err as any)?.message || err || '')
      if (/failed to fetch|networkerror|load failed/i.test(msg) || err instanceof TypeError) {
        setCloneError(
          '克隆失败：网络请求被浏览器拦截或无法连接（常见是跨域/CORS）。\n' +
            '建议：\n' +
            '- 先确认你选择的区域正确（国内/海外）\n' +
            '- 尝试换浏览器/换网络\n' +
            '- 如果仍失败：用下方“MiniMax 官网克隆页面”完成克隆，再回这里点“刷新我已克隆的音色”同步\n'
        )
        return
      }
      setCloneError(msg || '克隆失败：未知错误')
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
      {/* ===== 进入 API 配置提示弹窗 ===== */}
      {apiGuideOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/55" />
          <div className="relative w-full max-w-[360px] rounded-2xl bg-white shadow-xl border border-black/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-black/10 text-center">
              <div className="text-[15px] font-semibold text-gray-900">重要提示：需要自备 API 才能使用</div>
            </div>
            <div className="px-4 py-3 text-[13px] text-gray-800 space-y-3 leading-relaxed">
              <div>
                <div className="font-semibold">1) 本小手机不内置任何模型服务</div>
                <div>你必须自行接入可用的 API（填写 URL + API Key + 选择模型），否则 AI 功能无法正常工作。</div>
              </div>
              <div>
                <div className="font-semibold">2) URL 和 API Key 不能自己瞎编</div>
                <div>乱填/乱编会导致“测试失败 / 空回复 / 格式不兼容”等问题。</div>
              </div>
              <div>
                <div className="font-semibold">3) 新手最简单的方式</div>
                <div>可自行在某书/某鱼等渠道购买现成的 API/中转服务。购买与使用方法请直接咨询你的商家。</div>
              </div>
              <div>
                <div className="font-semibold">4) 作者声明（请务必读完）</div>
                <div>作者不提供任何 API，也不提供填写教程/购买渠道/代购。如需使用，请自行解决服务来源与配置问题。</div>
              </div>
              <div className="pt-1 flex items-center gap-2">
                <label className="flex items-center gap-2 text-[12px] text-gray-600 select-none">
                  <input
                    type="checkbox"
                    checked={apiGuideDontShowAgain}
                    onChange={(e) => setApiGuideDontShowAgain(e.target.checked)}
                    className="w-4 h-4 accent-red-600"
                  />
                  不再提示
                </label>
              </div>
            </div>
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={() => {
                  if (apiGuideDontShowAgain) {
                    setApiGuideConfirmOpen(true)
                  } else {
                    setApiGuideOpen(false)
                  }
                }}
                className="w-full py-2.5 rounded-xl border-2 border-red-500 text-red-600 font-semibold bg-white hover:bg-red-50 active:opacity-80"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 二次确认：永久关闭提示 */}
      {apiGuideOpen && apiGuideConfirmOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/65" />
          <div className="relative w-full max-w-[340px] rounded-2xl bg-white shadow-xl border border-black/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-black/10 text-center">
              <div className="text-[15px] font-semibold text-gray-900">二次确认</div>
            </div>
            <div className="px-4 py-4 text-[13px] text-gray-800 leading-relaxed">
              勾选“不再提示”后，今后进入 API 配置将不再弹出本提示。<br />
              请确认你已知晓：本应用不提供任何 API 服务，需要自备 API 并自行配置。
            </div>
            <div className="px-4 pb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setApiGuideConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-600 bg-white hover:bg-gray-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem(API_GUIDE_DISMISSED_KEY, '1')
                  } catch {}
                  setApiGuideConfirmOpen(false)
                  setApiGuideOpen(false)
                }}
                className="flex-1 py-2.5 rounded-xl border-2 border-red-500 text-red-600 font-semibold bg-white hover:bg-red-50 active:opacity-80"
              >
                我确定明白
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex h-full min-h-0 flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="API 配置" onBack={() => navigate('/apps/settings')} />
        
        {/* 这里不要隐藏滚动条：否则“语音克隆/导入”等长内容在手机端像“消失” */}
        {/* 移动端滚动兼容：
           - 外层固定（body overflow hidden）时，必须依赖内部滚动容器
           - 这里用 overflow-y-auto + iOS momentum scroll，避免“滑不动/被吃手势”
           - 底部 padding 只留安全区 + 少量空间，避免出现一大块“空白遮挡” */}
        {/* iOS/Safari 在“overflow 滚动容器 + display:flex”组合下偶发滚动失效（表现为：展开后卡住/滑不动）。
            这里把“滚动容器”和“flex 排版容器”拆成两层：外层只负责滚动，内层负责 flex 排版/排序。 */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] custom-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 pb-[calc(2.25rem+env(safe-area-inset-bottom))] touch-pan-y">
          <div className="flex flex-col gap-4 sm:gap-5">
          {/* 当前使用的配置（常驻展示） */}
          <div className="order-1">
            {currentConfigId && (() => {
              const currentConfig = savedConfigs.find(c => c.id === currentConfigId)
              if (!currentConfig) return null
              return (
                <div className="bg-gradient-to-br from-green-50/80 to-emerald-50/60 rounded-2xl p-4 border border-green-200/50 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 text-lg">✓</span>
                      <span className="text-sm font-semibold" style={{ color: fontColor.value }}>
                        当前使用的配置
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditConfig(currentConfig)}
                        className="text-xs px-2 py-1 rounded-lg bg-white/60 hover:bg-white/80 text-blue-600 font-medium"
                      >
                        编辑
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="opacity-60 w-16" style={{ color: fontColor.value }}>配置名称：</span>
                      <span className="font-medium" style={{ color: fontColor.value }}>{currentConfig.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="opacity-60 w-16" style={{ color: fontColor.value }}>接口类型：</span>
                      <span style={{ color: fontColor.value }}>
                        {currentConfig.apiInterface === 'openai_compatible' ? 'OpenAI 兼容' :
                         currentConfig.apiInterface === 'anthropic_native' ? 'Claude 原生' :
                         currentConfig.apiInterface === 'gemini_native' ? 'Gemini 原生' :
                         currentConfig.apiInterface === 'ollama' ? 'Ollama 本地' : 'OpenAI 兼容'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="opacity-60 w-16" style={{ color: fontColor.value }}>Base URL：</span>
                      <span className="truncate font-mono text-[10px]" style={{ color: fontColor.value }}>
                        {currentConfig.baseUrl}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="opacity-60 w-16" style={{ color: fontColor.value }}>模型：</span>
                      <span className="font-medium" style={{ color: fontColor.value }}>
                        {currentConfig.selectedModel || '未选择'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="opacity-60 w-16" style={{ color: fontColor.value }}>响应模式：</span>
                      <span style={{ color: fontColor.value }}>
                        非流式（固定）
                      </span>
                    </div>
                    {currentConfig.advanced && (
                      <button
                        type="button"
                        onClick={() => setShowCurrentAdvanced(!showCurrentAdvanced)}
                        className="mt-2 text-xs px-2 py-1 rounded-lg bg-white/60 hover:bg-white/80 text-gray-600"
                      >
                        {showCurrentAdvanced ? '收起' : '查看'}高级参数
                      </button>
                    )}
                    {showCurrentAdvanced && currentConfig.advanced && (
                      <div className="mt-2 pt-2 border-t border-green-200/50 space-y-1 text-[10px]">
                        <div>温度：{currentConfig.advanced.temperature.toFixed(2)}</div>
                        <div>Top P：{currentConfig.advanced.topP.toFixed(2)}</div>
                        <div>最大长度：{currentConfig.advanced.maxTokens}</div>
                        <div>频率惩罚：{currentConfig.advanced.frequencyPenalty.toFixed(1)}</div>
                        <div>存在惩罚：{currentConfig.advanced.presencePenalty.toFixed(1)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* AI 对话配置：默认收起 */}
          <div className="order-2">
            <div className="bg-white/40 rounded-2xl overflow-hidden border border-white/50 shadow-sm">
              <button
                type="button"
                onClick={() => setShowLLMSection(!showLLMSection)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center shadow-sm">
                    <span className="text-xl">🤖</span>
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-bold" style={{ color: fontColor.value }}>
                      AI 对话配置
                    </h3>
                    <p className="text-xs opacity-50" style={{ color: fontColor.value }}>
                      {currentConfigId ? '管理/切换对话 API 与模型' : '配置对话 API 让角色能聊天'}
                    </p>
                  </div>
                </div>
                <svg
                  className={`w-5 h-5 opacity-50 transition-transform ${showLLMSection ? 'rotate-180' : ''}`}
                  style={{ color: fontColor.value }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showLLMSection && (
                <div className="p-4 pt-0 space-y-4 border-t border-white/10">
            
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
                      {currentConfigId !== config.id && (
                        <button
                          type="button"
                          onClick={() => loadConfig(config)}
                          className="flex-shrink-0 whitespace-nowrap text-blue-500 text-xs px-2 py-1 hover:text-blue-700"
                        >
                          使用
                        </button>
                      )}
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
                {...registerLLMMain('newConfigName')}
                onChange={(e) => {
                  registerLLMMain('newConfigName').onChange(e)
                  setNewConfigName(e.target.value)
                }}
                placeholder="例如：Gemini Pro、Claude 3.5、GPT-4"
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs sm:text-sm"
                style={{ color: fontColor.value }}
              />
              {llmMainErrors.newConfigName?.message && (
                <div className="text-[11px] text-red-600">{String(llmMainErrors.newConfigName.message)}</div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>接口类型</label>
              <div className="relative">
                <select
                  value={apiInterface}
                  {...registerLLMMain('apiInterface')}
                  onChange={(e) => {
                    registerLLMMain('apiInterface').onChange(e)
                    setApiInterface(e.target.value as LLMApiInterface)
                  }}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 appearance-none focus:border-white/50 cursor-pointer text-sm sm:text-base"
                  style={{ color: fontColor.value }}
                >
                  <option value="openai_compatible">OpenAI 兼容</option>
                  <option value="anthropic_native">Claude 原生</option>
                  <option value="gemini_native">Gemini 原生</option>
                  <option value="ollama">Ollama 本地</option>
                </select>
                <svg className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" style={{ color: fontColor.value }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              <div className="text-[11px] opacity-50 leading-relaxed" style={{ color: fontColor.value }}>
                如果报“返回空内容/格式不兼容”，通常是接口类型没选对。
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>响应模式</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled
                  className="flex-1 px-3 py-2 rounded-2xl text-xs sm:text-sm border transition-all bg-white/30 border-white/20 opacity-40 cursor-not-allowed"
                  style={{ color: fontColor.value }}
                >流式（已关闭）</button>
                <button
                  type="button"
                  onClick={() => { setUseStreaming(false); setLLMConfig({ useStreaming: false }) }}
                  className="flex-1 px-3 py-2 rounded-2xl text-xs sm:text-sm border transition-all bg-blue-500/20 border-blue-400/50 font-medium"
                  style={{ color: fontColor.value }}
                >非流式（固定）</button>
              </div>
              <div className="text-[11px] opacity-50 leading-relaxed" style={{ color: fontColor.value }}>
                为避免异常重复扣费，当前版本固定使用非流式单次请求。
              </div>
            </div>
          
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>API Base URL</label>
              <input
                type="url"
                value={baseUrl}
                {...registerLLMMain('baseUrl')}
                onChange={(e) => {
                  registerLLMMain('baseUrl').onChange(e)
                  setBaseUrl(e.target.value)
                }}
                placeholder={getBaseUrlPlaceholder(apiInterface)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs sm:text-sm"
                style={{ color: fontColor.value }}
              />
              {llmMainErrors.baseUrl?.message && (
                <div className="text-[11px] text-red-600">{String(llmMainErrors.baseUrl.message)}</div>
              )}
              <div className="text-[11px] opacity-50 leading-relaxed" style={{ color: fontColor.value }}>
                {apiInterface === 'gemini_native'
                  ? '提示：Gemini 原生一般填根地址（如 https://generativelanguage.googleapis.com），应用会自动规整为 /v1beta。若你用的是“OpenAI 兼容中转站”（常见特征：地址里有 /v1），请把「接口类型」改成 OpenAI 兼容。'
                  : apiInterface === 'ollama'
                    ? '提示：Ollama 本地一般填根地址（如 http://localhost:11434），应用会自动规整到 /api。'
                    : '提示：OpenAI/Claude 兼容一般填根地址即可（例如 https://xxx.com 或 https://xxx.com/v1 都行）。应用会自动规整为 /v1，避免出现 /v1/v1。'}
              </div>
              {apiInterface === 'gemini_native' && /\/v1(\/|$)/i.test(baseUrl.trim()) && !/\/v1beta(\/|$)/i.test(baseUrl.trim()) && (
                <div className="text-xs text-orange-700 bg-orange-50/70 px-3 py-2 rounded-2xl border border-orange-200 whitespace-pre-wrap">
                  检测到你选择了「Gemini 原生」，但 Base URL 看起来是 OpenAI 兼容地址（包含 /v1）。
                  如果你使用的是中转站（OpenAI 兼容），请把「接口类型」切换为 OpenAI 兼容；否则请改用 Gemini 官方根地址（通常不包含 /v1）。
                </div>
              )}
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
                  {...registerLLMMain('apiKey')}
                  onChange={(e) => {
                    registerLLMMain('apiKey').onChange(e)
                    setApiKey(e.target.value)
                  }}
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
              {llmMainErrors.apiKey?.message && (
                <div className="text-[11px] text-red-600">{String(llmMainErrors.apiKey.message)}</div>
              )}
            </div>

            <button onClick={fetchModels} disabled={loading} className="w-full py-2.5 sm:py-3 rounded-2xl bg-white/50 hover:bg-white/60 border border-white/30 font-medium transition-colors disabled:opacity-50 press-effect text-sm sm:text-base" style={{ color: fontColor.value }}>
              {loading ? '获取中...' : '获取模型列表'}
            </button>

            {error && <div className="text-xs sm:text-sm text-red-500 bg-red-50/50 px-3 py-2.5 rounded-2xl border border-red-200 whitespace-pre-wrap">{error}</div>}

            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-medium opacity-60" style={{ color: fontColor.value }}>模型（可手动输入）</label>
              <input
                value={selectedModel}
                {...registerLLMMain('selectedModel')}
                onChange={(e) => {
                  const v = e.target.value
                  registerLLMMain('selectedModel').onChange(e)
                  selectedModelRef.current = v
                  setSelectedModel(v)
                }}
                placeholder="例如：gemini-2.5-pro / gpt-4o-mini / deepseek-chat"
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-sm sm:text-base"
                style={{ color: fontColor.value }}
              />
              {llmMainErrors.selectedModel?.message && (
                <div className="text-[11px] text-red-600">{String(llmMainErrors.selectedModel.message)}</div>
              )}
              {models.length > 0 && (
                <div className="relative">
                  <select
                    value={selectedModel}
                    onChange={(e) => {
                      const v = e.target.value
                      setLLMMainValue('selectedModel', v)
                      selectedModelRef.current = v
                      setSelectedModel(v)
                    }}
                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-white/50 border border-white/30 appearance-none focus:border-white/50 cursor-pointer text-sm sm:text-base"
                    style={{ color: fontColor.value }}
                  >
                    <option value="">从列表选择（可选）</option>
                    {models.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                  <svg className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" style={{ color: fontColor.value }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              )}
            </div>

            {/* 存储按钮 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleTestLLM}
                disabled={llmTestLoading || !baseUrl.trim() || !apiKey.trim()}
                className="w-full py-3 sm:py-3.5 rounded-2xl font-semibold bg-white/55 hover:bg-white/65 border border-white/30 transition-all press-effect disabled:opacity-50 text-sm sm:text-base"
                style={{ color: fontColor.value }}
              >
                {llmTestLoading ? '测试中...' : '测试连接'}
              </button>
              <button 
                onClick={handleSaveAsConfig} 
                disabled={!newConfigName.trim() || !baseUrl.trim() || !apiKey.trim() || !(selectedModelRef.current || selectedModel || '').trim()}
                className={`w-full py-3 sm:py-3.5 rounded-2xl font-semibold text-white transition-all press-effect disabled:opacity-50 ${
                  saved ? 'bg-green-500' : 'bg-gradient-to-r from-blue-500 to-cyan-500 shadow-[0_6px_20px_rgba(59,130,246,0.3)]'
                }`}
              >
                {saved ? '✓ 已存储' : '存储此配置'}
              </button>
            </div>

            {(llmTestOk || llmTestError) && (
              <div className={`text-xs sm:text-sm px-3 py-2.5 rounded-2xl border whitespace-pre-wrap ${llmTestError ? 'text-red-600 bg-red-50/60 border-red-200' : 'text-green-700 bg-green-50/60 border-green-200'}`}>
                {llmTestError || llmTestOk}
              </div>
            )}
            
            {!newConfigName.trim() && baseUrl.trim() && apiKey.trim() && (
              <div className="text-xs text-orange-500 text-center">请先填写配置名称</div>
            )}
                
            {/* 高级参数设置（折叠，省空间） */}
            <details className="mt-4 pt-4 border-t border-white/20">
              <summary className="cursor-pointer select-none">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">⚙️</span>
                    <span className="font-medium text-sm" style={{ color: fontColor.value }}>高级参数</span>
                    <span className="text-xs opacity-50" style={{ color: fontColor.value }}>（不确定就别改）</span>
                  </div>
                  <span className="text-xs opacity-50" style={{ color: fontColor.value }}>点开</span>
                </div>
              </summary>
              <div className="mt-4 space-y-4">
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
            </details>

            {/* 常见报错速查（高命中） */}
            <details className="mt-4 rounded-2xl bg-white/35 border border-white/25 p-3">
              <summary className="cursor-pointer select-none text-sm font-medium" style={{ color: fontColor.value }}>
                常见报错速查（点开）
              </summary>
              <div className="mt-3 space-y-2 text-[12px] leading-relaxed" style={{ color: fontColor.value }}>
                <div className="opacity-70">
                  下面是最常见的报错关键词与处理方式（不涉及任何第三方平台名，按“先自救再换模型”的顺序）。
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="font-semibold">401 / Unauthorized / invalid api key</div>
                    <div className="opacity-70">Key 无效/复制不完整/含空格换行。处理：重新粘贴 Key（确保无空格换行）→ 重试。</div>
                  </div>
                  <div>
                    <div className="font-semibold">403 / Forbidden</div>
                    <div className="opacity-70">权限不足/策略拦截。处理：换模型 → 重试；仍不行就换 Key/换服务。</div>
                  </div>
                  <div>
                    <div className="font-semibold">404 / model not found / 模型不存在</div>
                    <div className="opacity-70">模型名不对或被下架。处理：点“获取模型列表”刷新 → 换一个模型再试。</div>
                  </div>
                  <div>
                    <div className="font-semibold">429 / Too Many Requests / quota / cooling down</div>
                    <div className="opacity-70">限流/额度不足/并发太高。处理：等 10–60 秒 → 重试/重新生成 → 换更快/更轻量模型。</div>
                  </div>
                  <div>
                    <div className="font-semibold">500/502/503/5xx / overloaded / 上游负载过高</div>
                    <div className="opacity-70">上游或中转站故障。处理：重新生成（多试几次）→ 换模型 → 稍后再试。</div>
                  </div>
                  <div>
                    <div className="font-semibold">Failed to fetch / NetworkError / Mixed content</div>
                    <div className="opacity-70">浏览器连不上（HTTPS 页面用 http://、CORS、证书/DNS、网络环境）。处理：改用 https:// 地址、换网络/代理节点。</div>
                  </div>
                  <div>
                    <div className="font-semibold">400 / invalid argument / Bad Request</div>
                    <div className="opacity-70">参数不被支持。处理：先把 frequency/presence 设为 0，top_p 设为 1，温度 0.7–0.9，最大回复长度先降到 2000–8000。</div>
                  </div>
                  <div>
                    <div className="font-semibold">context length / Token budget exceeded / too many tokens</div>
                    <div className="opacity-70">上下文太长。处理：降低记忆回合/清空部分聊天 → 降低最大回复长度 → 换长上下文模型。</div>
                  </div>
                  <div>
                    <div className="font-semibold">Empty Message Returned / no candidates returned / 空回复</div>
                    <div className="opacity-70">上游波动/格式不兼容/内容被拦截。处理：重新生成 → 换模型；如果频繁出现，检查“接口类型”是否选错。</div>
                  </div>
                  <div>
                    <div className="font-semibold">CUSTOMER_POLICY_VIOLATION / Request blocked</div>
                    <div className="opacity-70">内容触发安全策略。处理：改写内容（更含蓄/去掉敏感描述）→ 换模型再试。</div>
                  </div>
                  <div>
                    <div className="font-semibold">Streaming request failed 400 / data: [DONE] is not valid JSON</div>
                    <div className="opacity-70">流式协议不兼容。处理：关闭流式重试（或开关流式各试一次，以稳定为准）。</div>
                  </div>
                  <div>
                    <div className="font-semibold">524 / Gateway Timeout</div>
                    <div className="opacity-70">网关超时/链路太慢。处理：重试、换网络、换更快模型。</div>
                  </div>
                </div>
              </div>
            </details>
          </div>
              )}
            </div>
          </div>
          
          {/* TTS 语音配置区域 - 可折叠 */}
          <div className="order-3 bg-white/40 rounded-2xl overflow-hidden border border-white/50 shadow-sm">
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
              // 移动端常见问题：外层滚动容器高度计算异常/被裁切，导致“展开后下面空白像丢功能”
              // 解决：不要在面板内部再做限高滚动（容易被“框”裁切/误以为丢功能）；统一交给整页滚动
              <div className="p-3 sm:p-4 pt-0 pb-4 space-y-3 border-t border-white/10">
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

                {/* 克隆/导入音色（默认展示，不做收纳） */}
                <div className="w-full px-3 py-2.5 rounded-2xl bg-purple-50/40 border border-white/30">
                  <div className="text-left">
                    <div className="text-sm font-semibold" style={{ color: fontColor.value }}>🎭 克隆/导入音色</div>
                    <div className="text-xs opacity-60" style={{ color: fontColor.value }}>
                      这里可以：上传音频克隆 / 导入 Voice ID / 刷新我已克隆的音色
                    </div>
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
                    // 手机上 range 的滑块经常被裁掉一半：把输入本身高度加大
                    // 同时避免“卡在语速这里滑不动”：滑块会吃掉手势，强制允许纵向 pan 作为滚动
                    className="w-full h-8 bg-white/40 rounded-lg appearance-none cursor-pointer touch-pan-y"
                    style={{ touchAction: 'pan-y' }}
                  />
                <div className="text-[11px] opacity-50 -mt-1" style={{ color: fontColor.value }}>
                  提示：在滑块上左右拖动调语速；上下滑动可继续滚动页面。
                </div>
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

                {/* 克隆/导入音色内容（原“高级选项”） */}
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
          <div className="order-[99] h-4" />
          </div>
        </div>
      </div>

      {/* 模型选择弹窗：获取模型后自动弹出 */}
      {modelPickerOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/35"
            onClick={() => setModelPickerOpen(false)}
            role="presentation"
          />
          <div className="relative w-full max-w-[480px] rounded-2xl bg-white/95 border border-white/30 shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between">
              <div className="text-sm font-semibold" style={{ color: fontColor.value }}>选择模型</div>
              <button
                type="button"
                onClick={() => setModelPickerOpen(false)}
                className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center"
                title="关闭"
              >
                <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input
                value={modelPickerQuery}
                onChange={(e) => setModelPickerQuery(e.target.value)}
                placeholder="搜索模型名称…"
                className="w-full px-3 py-2.5 rounded-xl bg-white border border-black/10 text-[13px] outline-none"
                style={{ color: fontColor.value }}
              />
              <div className="max-h-[55vh] overflow-y-auto space-y-1">
                {(() => {
                  const list = (modelPickerTarget === 'main' ? models : editModels) || []
                  const q = modelPickerQuery.trim().toLowerCase()
                  const filtered = q ? list.filter(m => String(m).toLowerCase().includes(q)) : list
                  if (!filtered.length) {
                    return <div className="text-xs text-gray-500 py-6 text-center">没有匹配的模型</div>
                  }
                  return filtered.map((m) => {
                    const selected =
                      modelPickerTarget === 'main'
                        ? String(selectedModelRef.current || selectedModel || '') === String(m)
                        : String(editSelectedModel || '') === String(m)
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          if (modelPickerTarget === 'main') {
                            selectedModelRef.current = m
                            setSelectedModel(m)
                          } else {
                            setEditSelectedModel(m)
                          }
                          setModelPickerOpen(false)
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl border text-[13px] transition-colors ${
                          selected ? 'bg-green-50 border-green-300' : 'bg-white border-black/10 hover:bg-gray-50'
                        }`}
                        style={{ color: fontColor.value }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{m}</span>
                          {selected && <span className="text-green-600 text-xs font-semibold">✓ 已选</span>}
                        </div>
                      </button>
                    )
                  })
                })()}
              </div>
              <div className="text-[11px] text-gray-500">
                提示：选择后会自动填入模型，不需要再手动点下拉框。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑已保存的 API 配置 */}
      {editingConfigId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/35"
            onClick={() => setEditingConfigId(null)}
            role="presentation"
          />
          <div className="relative w-full max-w-[420px] rounded-2xl bg-white/95 border border-white/30 shadow-xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="px-4 py-3 border-b border-black/10 text-center text-sm font-semibold" style={{ color: fontColor.value }}>
              编辑 API 配置
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto [-webkit-overflow-scrolling:touch] p-4 space-y-3">
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
                    <option value="anthropic_native">Claude 原生</option>
                    <option value="gemini_native">Gemini 原生</option>
                    <option value="ollama">Ollama 本地</option>
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50 pointer-events-none" style={{ color: fontColor.value }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs opacity-60" style={{ color: fontColor.value }}>响应模式</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled
                    className="flex-1 px-3 py-2 rounded-xl text-xs border transition-all bg-white border-black/10 opacity-40 cursor-not-allowed"
                    style={{ color: fontColor.value }}
                  >流式（已关闭）</button>
                  <button
                    type="button"
                    onClick={() => setEditUseStreaming(false)}
                    className="flex-1 px-3 py-2 rounded-xl text-xs border transition-all bg-blue-500/15 border-blue-400/40 font-medium"
                    style={{ color: fontColor.value }}
                  >非流式（固定）</button>
                </div>
                <div className="text-[11px] opacity-50 leading-relaxed" style={{ color: fontColor.value }}>
                  当前固定非流式，避免流式回退导致重复请求。
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
                <div className="text-[11px] opacity-50 leading-relaxed" style={{ color: fontColor.value }}>
                  {editApiInterface === 'gemini_native'
                    ? '提示：Gemini 原生一般填根地址（如 https://generativelanguage.googleapis.com），应用会自动规整为 /v1beta。若你用的是“OpenAI 兼容中转站”（常见特征：地址里有 /v1），请把「接口类型」改成 OpenAI 兼容。'
                    : editApiInterface === 'ollama'
                      ? '提示：Ollama 本地一般填根地址（如 http://localhost:11434），应用会自动规整到 /api。'
                      : '提示：OpenAI/Claude 兼容一般填根地址即可（例如 https://xxx.com 或 https://xxx.com/v1 都行）。应用会自动规整为 /v1，避免 /v1/v1。'}
                </div>
                {editApiInterface === 'gemini_native' && /\/v1(\/|$)/i.test(editBaseUrl.trim()) && !/\/v1beta(\/|$)/i.test(editBaseUrl.trim()) && (
                  <div className="text-xs text-orange-700 bg-orange-50 px-3 py-2 rounded-xl border border-orange-200 whitespace-pre-wrap">
                    检测到你选择了「Gemini 原生」，但 Base URL 看起来是 OpenAI 兼容地址（包含 /v1）。
                    如果你使用的是中转站（OpenAI 兼容），请把「接口类型」切换为 OpenAI 兼容；否则请改用 Gemini 官方根地址（通常不包含 /v1）。
                  </div>
                )}
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
                <div className="text-xs text-red-600 bg-red-50/70 border border-red-200 rounded-xl px-3 py-2 whitespace-pre-wrap">
                  {editError}
                </div>
              )}

              {(editTestOk || editTestError) && (
                <div className={`text-xs border rounded-xl px-3 py-2 whitespace-pre-wrap ${editTestError ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'}`}>
                  {editTestError || editTestOk}
                </div>
              )}

              {/* 高级参数（折叠） */}
              <div className="pt-2 border-t border-black/10">
                <button
                  type="button"
                  onClick={() => setShowEditAdvanced(!showEditAdvanced)}
                  className="w-full flex items-center justify-between py-2 text-xs opacity-60 hover:opacity-80 transition-opacity"
                  style={{ color: fontColor.value }}
                >
                  <span>⚙️ 高级参数（{showEditAdvanced ? '点击收起' : '点击展开'}）</span>
                  <svg 
                    className={`w-4 h-4 transition-transform ${showEditAdvanced ? 'rotate-180' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showEditAdvanced && (
                  <div className="space-y-3 pt-2">
                    {/* 温度 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs opacity-60" style={{ color: fontColor.value }}>温度 (Temperature)</label>
                        <span className="text-xs font-mono bg-white/30 px-2 py-0.5 rounded" style={{ color: fontColor.value }}>
                          {editTemperature.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.05"
                        value={editTemperature}
                        onChange={(e) => setEditTemperature(parseFloat(e.target.value))}
                        className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] opacity-40" style={{ color: fontColor.value }}>
                        <span>稳定 0</span>
                        <span>平衡 1</span>
                        <span>创意 2</span>
                      </div>
                    </div>
                    
                    {/* Top P */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs opacity-60" style={{ color: fontColor.value }}>Top P</label>
                        <span className="text-xs font-mono bg-white/30 px-2 py-0.5 rounded" style={{ color: fontColor.value }}>
                          {editTopP.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={editTopP}
                        onChange={(e) => setEditTopP(parseFloat(e.target.value))}
                        className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] opacity-40" style={{ color: fontColor.value }}>
                        <span>精确 0</span>
                        <span>推荐 0.95</span>
                        <span>多样 1</span>
                      </div>
                    </div>
                    
                    {/* 最大回复长度 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs opacity-60" style={{ color: fontColor.value }}>最大回复长度</label>
                        <span className="text-xs font-mono bg-white/30 px-2 py-0.5 rounded" style={{ color: fontColor.value }}>
                          {editMaxTokens}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="100"
                        max="4000"
                        step="100"
                        value={editMaxTokens}
                        onChange={(e) => setEditMaxTokens(parseInt(e.target.value))}
                        className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] opacity-40" style={{ color: fontColor.value }}>
                        <span>简短 100</span>
                        <span>适中 1000</span>
                        <span>详细 4000</span>
                      </div>
                    </div>
                    
                    {/* 频率惩罚 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs opacity-60" style={{ color: fontColor.value }}>频率惩罚（减少重复）</label>
                        <span className="text-xs font-mono bg-white/30 px-2 py-0.5 rounded" style={{ color: fontColor.value }}>
                          {editFrequencyPenalty.toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={editFrequencyPenalty}
                        onChange={(e) => setEditFrequencyPenalty(parseFloat(e.target.value))}
                        className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    
                    {/* 存在惩罚 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs opacity-60" style={{ color: fontColor.value }}>存在惩罚（鼓励新话题）</label>
                        <span className="text-xs font-mono bg-white/30 px-2 py-0.5 rounded" style={{ color: fontColor.value }}>
                          {editPresencePenalty.toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={editPresencePenalty}
                        onChange={(e) => setEditPresencePenalty(parseFloat(e.target.value))}
                        className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    
                    {/* 重置默认 */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditTemperature(0.8)
                        setEditTopP(0.95)
                        setEditMaxTokens(1000)
                        setEditFrequencyPenalty(0)
                        setEditPresencePenalty(0)
                      }}
                      className="w-full py-2 rounded-xl bg-white/30 text-xs hover:bg-white/40 transition-colors"
                      style={{ color: fontColor.value }}
                    >
                      重置为默认参数
                    </button>
                  </div>
                )}
              </div>

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
                  保存配置
                </button>
              </div>
              <button
                type="button"
                onClick={handleTestLLMForEdit}
                disabled={editTestLoading}
                className="w-full py-2.5 rounded-xl bg-white border border-black/10 text-[13px] font-semibold active:scale-[0.99] disabled:opacity-50"
                style={{ color: fontColor.value }}
              >
                {editTestLoading ? '测试中...' : '测试连接'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
