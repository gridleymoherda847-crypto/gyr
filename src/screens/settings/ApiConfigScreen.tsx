import { useState, useRef, useEffect } from 'react'
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
  
  // 板块折叠状态
  const [showLLMSection, setShowLLMSection] = useState(false)
  const [showTTSSection, setShowTTSSection] = useState(false)
  
  // 高级选项展开状态
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  // 音色克隆状态
  const [cloneLoading, setCloneLoading] = useState(false)
  const [cloneError, setCloneError] = useState('')
  const [cloneSuccess, setCloneSuccess] = useState('')
  const [cloneVoiceName, setCloneVoiceName] = useState('')
  const [cloneMode, setCloneMode] = useState<'file' | 'record' | 'url'>('record') // 默认录音模式
  const [audioUrl, setAudioUrl] = useState('') // URL 输入
  
  // 录音状态
  const [isRecording, setIsRecording] = useState(false)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  
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
  
  // 开始录音
  const startRecording = async () => {
    try {
      setCloneError('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setRecordedBlob(blob)
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
      setRecordedBlob(null)
      
      // 计时器
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
    } catch (err: any) {
      console.error('Recording error:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCloneError('麦克风权限被拒绝。请点击浏览器地址栏左侧的锁图标，允许麦克风权限后刷新页面重试。')
      } else if (err.name === 'NotFoundError') {
        setCloneError('未检测到麦克风设备')
      } else if (err.name === 'NotSupportedError' || err.name === 'TypeError') {
        setCloneError('当前浏览器不支持录音，请使用 Chrome 或 Safari')
      } else {
        setCloneError(`录音失败: ${err.message || '未知错误'}`)
      }
    }
  }
  
  // 停止录音
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
  }
  
  // 从 URL 下载音频并克隆
  const handleCloneFromUrl = async () => {
    if (!audioUrl.trim()) {
      setCloneError('请输入音频文件的网络链接')
      return
    }
    
    setCloneLoading(true)
    setCloneError('')
    
    try {
      // 下载音频
      const response = await fetch(audioUrl.trim())
      if (!response.ok) throw new Error('无法下载音频文件')
      
      const blob = await response.blob()
      const file = new File([blob], 'audio.mp3', { type: blob.type || 'audio/mpeg' })
      
      await handleCloneVoice(file)
    } catch (err) {
      console.error('URL clone error:', err)
      setCloneError('下载失败，请检查链接是否正确且可访问')
    } finally {
      setCloneLoading(false)
    }
  }
  
  // 从录音克隆
  const handleCloneFromRecording = async () => {
    if (!recordedBlob) {
      setCloneError('请先录制一段声音')
      return
    }
    
    // 转换为 File 对象
    const file = new File([recordedBlob], 'recording.webm', { type: 'audio/webm' })
    await handleCloneVoice(file)
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
  
  // 自动保存 TTS 配置（当关键设置变化时）
  const isFirstRender = useRef(true)
  useEffect(() => {
    // 跳过首次渲染
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    // 自动保存
    setTTSConfig({ 
      apiKey: ttsApiKey, 
      voiceId: ttsVoiceId, 
      model: ttsModel, 
      speed: ttsSpeed, 
      enabled: ttsEnabled,
      region: ttsRegion,
      customVoices: customVoices,
    })
  }, [ttsApiKey, ttsVoiceId, ttsModel, ttsSpeed, ttsEnabled, ttsRegion, customVoices, setTTSConfig])
  
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
    
    if (!file || file.size === 0) {
      setCloneError('文件无效，请重新选择')
      return
    }
    
    // 自动生成音色ID
    const voiceId = generateVoiceId()
    const voiceName = cloneVoiceName.trim() || file.name?.replace(/\.[^.]+$/, '') || voiceId
    
    setCloneLoading(true)
    setCloneError('')
    setCloneSuccess('')
    
    try {
      console.log('Starting voice clone:', { fileName: file.name, fileSize: file.size, fileType: file.type })
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
      console.error('Voice clone failed:', err)
      const errMsg = (err as Error).message || '克隆失败，请重试'
      setCloneError(errMsg)
    } finally {
      setCloneLoading(false)
    }
  }
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = e.target.files?.[0]
      if (!file) {
        e.target.value = ''
        return
      }
      
      // 检查文件大小（限制 20MB）
      const maxSize = 20 * 1024 * 1024
      if (file.size > maxSize) {
        setCloneError('文件太大，请选择 20MB 以内的音频文件')
        e.target.value = ''
        return
      }
      
      // 检查文件类型
      const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm', '']
      if (file.type && !allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|aac|ogg|webm)$/i)) {
        setCloneError('不支持的文件格式，请选择 MP3/WAV/M4A 等音频文件')
        e.target.value = ''
        return
      }
      
      handleCloneVoice(file)
    } catch (err) {
      console.error('File select error:', err)
      setCloneError('文件选择失败，请重试')
    } finally {
      // 延迟清空，避免某些手机浏览器问题
      setTimeout(() => {
        if (e.target) e.target.value = ''
      }, 100)
    }
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="API 配置" onBack={() => navigate('/apps/settings')} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-4 sm:space-y-5">
          {/* LLM 配置区域 - 可折叠 */}
          <div className="bg-white/30 rounded-2xl overflow-hidden">
            {/* 折叠头部 */}
            <button
              onClick={() => setShowLLMSection(!showLLMSection)}
              className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🤖</span>
                <div className="text-left">
                  <h3 className="text-sm font-semibold" style={{ color: fontColor.value }}>
                    AI 对话配置
                  </h3>
                  <p className="text-xs opacity-50" style={{ color: fontColor.value }}>
                    {llmConfig.selectedModel ? `已配置：${llmConfig.selectedModel}` : '配置 LLM API 让角色能对话'}
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
            
            {/* 折叠内容 */}
            {showLLMSection && (
              <div className="p-3 sm:p-4 pt-0 space-y-3 border-t border-white/10">
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
            )}
          </div>
          
          {/* TTS 语音配置区域 - 可折叠 */}
          <div className="bg-white/30 rounded-2xl overflow-hidden">
            {/* 折叠头部 */}
            <button
              onClick={() => setShowTTSSection(!showTTSSection)}
              className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-white/10 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🎙️</span>
                <div className="text-left">
                  <h3 className="text-sm font-semibold" style={{ color: fontColor.value }}>
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
                    {customVoices.length > 0 && (
                      <div className="bg-purple-50/30 rounded-xl p-3 space-y-2">
                        <h4 className="text-sm font-medium" style={{ color: fontColor.value }}>
                          🎭 我的克隆音色
                        </h4>
                        <div className="space-y-2">
                          {customVoices.map((voice) => (
                            <div key={voice.id} className="flex items-center justify-between bg-white/50 rounded-lg px-3 py-2">
                              <div>
                                <div className="text-sm font-medium" style={{ color: fontColor.value }}>{voice.name}</div>
                                <div className="text-xs opacity-50" style={{ color: fontColor.value }}>{voice.id}</div>
                              </div>
                              <button
                                onClick={() => {
                                  setCustomVoices(prev => prev.filter(v => v.id !== voice.id))
                                  if (ttsVoiceId === voice.id) {
                                    setTtsVoiceId('female-shaonv')
                                  }
                                }}
                                className="text-red-500 hover:text-red-600 text-xs px-2 py-1 rounded-lg hover:bg-red-50"
                              >
                                删除
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="text-xs opacity-50" style={{ color: fontColor.value }}>
                          注：这里删除只是从本地列表移除，不会删除 MiniMax 服务器上的音色
                        </div>
                      </div>
                    )}
                    
                    {/* 音色克隆区域 */}
                    <div className="bg-orange-50/30 rounded-xl p-3 space-y-3">
                      <h4 className="text-sm font-medium" style={{ color: fontColor.value }}>
                        🎭 克隆新音色
                      </h4>
                      
                      <div className="text-xs opacity-60 space-y-1" style={{ color: fontColor.value }}>
                        <p>录制或上传一段音频（10秒-5分钟），系统会学习这个声音。</p>
                        <p className="text-orange-600">⚠️ 需要在 MiniMax 完成个人认证才能使用</p>
                      </div>
                      
                      {/* 模式切换 */}
                      <div className="flex gap-1 p-1 bg-white/30 rounded-xl">
                        <button
                          onClick={() => setCloneMode('record')}
                          className={`flex-1 py-1.5 text-xs rounded-lg transition-all ${cloneMode === 'record' ? 'bg-white shadow text-orange-600 font-medium' : 'opacity-60'}`}
                          style={{ color: cloneMode === 'record' ? undefined : fontColor.value }}
                        >
                          🎤 录音
                        </button>
                        <button
                          onClick={() => setCloneMode('url')}
                          className={`flex-1 py-1.5 text-xs rounded-lg transition-all ${cloneMode === 'url' ? 'bg-white shadow text-orange-600 font-medium' : 'opacity-60'}`}
                          style={{ color: cloneMode === 'url' ? undefined : fontColor.value }}
                        >
                          🔗 链接
                        </button>
                        <button
                          onClick={() => setCloneMode('file')}
                          className={`flex-1 py-1.5 text-xs rounded-lg transition-all ${cloneMode === 'file' ? 'bg-white shadow text-orange-600 font-medium' : 'opacity-60'}`}
                          style={{ color: cloneMode === 'file' ? undefined : fontColor.value }}
                        >
                          📁 文件
                        </button>
                      </div>
                      
                      {/* 音色名称输入 */}
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
                      
                      {/* 录音模式 */}
                      {cloneMode === 'record' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-center gap-4 py-4">
                            {!isRecording ? (
                              <button
                                onClick={startRecording}
                                disabled={cloneLoading || !ttsApiKey}
                                className="w-20 h-20 rounded-full bg-gradient-to-r from-red-400 to-pink-500 text-white flex items-center justify-center shadow-lg disabled:opacity-50 press-effect"
                              >
                                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                                </svg>
                              </button>
                            ) : (
                              <button
                                onClick={stopRecording}
                                className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg animate-pulse press-effect"
                              >
                                <div className="w-8 h-8 bg-white rounded-sm" />
                              </button>
                            )}
                          </div>
                          
                          {isRecording && (
                            <div className="text-center text-sm text-red-500 font-medium">
                              录音中... {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                            </div>
                          )}
                          
                          {recordedBlob && !isRecording && (
                            <div className="space-y-2">
                              <div className="text-center text-xs text-green-600">
                                ✓ 已录制 {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                              </div>
                              <button
                                onClick={handleCloneFromRecording}
                                disabled={cloneLoading || !ttsApiKey}
                                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-400 to-pink-500 text-white font-medium text-sm disabled:opacity-50 press-effect"
                              >
                                {cloneLoading ? '正在克隆...' : '🎭 使用这段录音克隆'}
                              </button>
                            </div>
                          )}
                          
                          {!isRecording && !recordedBlob && (
                            <div className="text-center text-xs opacity-50" style={{ color: fontColor.value }}>
                              点击麦克风开始录音（建议 10-60 秒）
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* URL 模式 */}
                      {cloneMode === 'url' && (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <label className="text-xs font-medium opacity-60" style={{ color: fontColor.value }}>
                              音频文件链接
                            </label>
                            <input
                              type="url"
                              value={audioUrl}
                              onChange={(e) => setAudioUrl(e.target.value)}
                              placeholder="https://example.com/voice.mp3"
                              className="w-full px-3 py-2 rounded-xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 text-xs"
                              style={{ color: fontColor.value }}
                            />
                          </div>
                          <div className="text-xs opacity-50" style={{ color: fontColor.value }}>
                            提示：可以把音频上传到网盘/OSS，获取直链后粘贴到这里
                          </div>
                          <button
                            onClick={handleCloneFromUrl}
                            disabled={cloneLoading || !ttsApiKey || !audioUrl.trim()}
                            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-400 to-pink-500 text-white font-medium text-sm disabled:opacity-50 press-effect"
                          >
                            {cloneLoading ? '正在克隆...' : '🔗 从链接克隆'}
                          </button>
                        </div>
                      )}
                      
                      {/* 文件模式（保留给电脑端） */}
                      {cloneMode === 'file' && (
                        <div className="space-y-3">
                          <div className="text-xs opacity-50" style={{ color: fontColor.value }}>
                            ⚠️ 如果手机端选择文件闪退，请使用「录音」或「链接」方式
                          </div>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                            capture={undefined}
                            className="hidden"
                            onChange={handleFileSelect}
                          />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={cloneLoading || !ttsApiKey}
                            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-400 to-pink-500 text-white font-medium text-sm disabled:opacity-50 press-effect"
                          >
                            {cloneLoading ? '正在克隆...' : '📁 选择文件并克隆'}
                          </button>
                        </div>
                      )}
                      
                      {/* 错误/成功提示 */}
                      {cloneError && (
                        <div className="text-xs text-red-500 bg-red-50/50 px-3 py-2 rounded-xl border border-red-200">
                          {cloneError}
                        </div>
                      )}
                      
                      {cloneSuccess && (
                        <div className="text-xs text-green-600 bg-green-50/50 px-3 py-2 rounded-xl border border-green-200">
                          {cloneSuccess}
                        </div>
                      )}
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
    </PageContainer>
  )
}
