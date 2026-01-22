import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import type { StarGravityPerson } from '../../context/WeChatContext'
import { useOS } from '../../context/OSContext'
import WeChatDialog from './components/WeChatDialog'
import { getGlobalPresets } from '../PresetScreen'

type Props = {
  onBack: () => void
}

// 统一纯黑头像（星引力：不生成花里胡哨头像）
const STAR_GRAVITY_BLACK_AVATAR =
  'data:image/svg+xml;base64,' +
  btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
      <rect width="256" height="256" rx="128" fill="#000000"/>
    </svg>`
  )

// 星星组件
const Star = ({ delay, size, left, top }: { delay: number; size: number; left: string; top: string }) => (
  <div
    className="absolute rounded-full bg-white animate-pulse"
    style={{
      width: size,
      height: size,
      left,
      top,
      animationDelay: `${delay}s`,
      animationDuration: `${1.5 + Math.random() * 2}s`,
      opacity: 0.4 + Math.random() * 0.6,
      boxShadow: `0 0 ${size * 2}px ${size / 2}px rgba(255,255,255,0.5)`
    }}
  />
)

// 生成随机星星
const generateStars = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    delay: Math.random() * 3,
    size: 1 + Math.random() * 3,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`
  }))
}

// 性格标签列表
const PERSONALITY_TAGS = [
  '温柔', '高冷', '傲娇', '腹黑', '天然呆', '元气', '病娇', '闷骚',
  '毒舌', '话痨', '社恐', '撒娇精', '霸道', '细腻', '幽默', '神秘',
  '活泼', '内敛', '浪漫', '理性', '感性', '慵懒', '勤奋', '佛系',
  '热情', '冷淡', '粘人', '独立', '敏感', '大大咧咧', '小心翼翼', '直球'
]

// 读取破限预设内容
const getPresetContent = () => {
  try {
    return localStorage.getItem('littlephone_presets_content') || ''
  } catch {
    return ''
  }
}

export default function StarGravityScreen({ onBack }: Props) {
  const navigate = useNavigate()
  const { 
    starGravityPersons,
    addStarGravityPerson, updateStarGravityPerson, addStarGravityMessage,
    matchWithPerson, resetShakeCountIfNewDay, removeStarGravityPerson,
    walletBalance, updateWalletBalance, addWalletBill,
    updateCharacter,
    getCurrentPersona
  } = useWeChat()
  const { callLLM, llmConfig } = useOS()
  const currentPersona = getCurrentPersona()

  const [currentView, setCurrentView] = useState<'home' | 'profile' | 'chat'>('home')
  const [selectedGender, setSelectedGender] = useState<'all' | 'male' | 'female'>('all')
  const [currentPerson, setCurrentPerson] = useState<StarGravityPerson | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingText, setGeneratingText] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [isAIReplying, setIsAIReplying] = useState(false)
  const [showAddWechatDialog, setShowAddWechatDialog] = useState(false)
  const [addWechatResult, setAddWechatResult] = useState<'success' | 'fail' | null>(null)
  const [matchedCharacterId, setMatchedCharacterId] = useState<string | null>(null)
  const [apiHelpOpen, setApiHelpOpen] = useState(false)
  const [showGiftMenu, setShowGiftMenu] = useState(false)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferAmount, setTransferAmount] = useState('')
  const [personalityTags, setPersonalityTags] = useState<string[]>([])
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false) // 生成确认弹窗
  const [showBlockDialog, setShowBlockDialog] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [stars] = useState(() => generateStars(50))
  
  // 触摸滑动处理
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  useEffect(() => {
    resetShakeCountIfNewDay()
  }, [])

  // 迁移：历史遇见的头像统一为纯黑（避免旧存档显示花头像）
  useEffect(() => {
    for (const p of starGravityPersons) {
      if (p.avatar !== STAR_GRAVITY_BLACK_AVATAR) {
        updateStarGravityPerson(p.id, { avatar: STAR_GRAVITY_BLACK_AVATAR })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentPerson?.messages])

  // 处理触摸开始
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation()
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  // 处理触摸结束 - 右滑返回
  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX
    const touchEndY = e.changedTouches[0].clientY
    const deltaX = touchEndX - touchStartX.current
    const deltaY = Math.abs(touchEndY - touchStartY.current)
    
    // 右滑超过80px且水平移动大于垂直移动
    if (deltaX > 80 && deltaX > deltaY) {
      e.preventDefault()
      e.stopPropagation()
      // 右滑返回：按顺序返回到上一级
      if (currentView === 'chat') {
        setCurrentView('profile')
      } else if (currentView === 'profile') {
        setCurrentView('home')
      } else if (currentView === 'home') {
        // 从首页右滑，返回到微信"我"界面
        onBack()
      }
    }
  }

  // 礼物列表
  const gifts = [
    { id: 'rose', name: '玫瑰', price: 10, favor: 3 },
    { id: 'chocolate', name: '巧克力', price: 30, favor: 5 },
    { id: 'bear', name: '小熊', price: 99, favor: 10 },
    { id: 'ring', name: '戒指', price: 520, favor: 25 },
    { id: 'car', name: '跑车', price: 1888, favor: 50 },
  ]

  // 送礼物
  const handleSendGift = (gift: typeof gifts[0]) => {
    if (!currentPerson) return
    if (walletBalance < gift.price) {
      alert('余额不足')
      return
    }
    
    updateWalletBalance(-gift.price)
    addWalletBill({
      type: 'shopping',
      amount: gift.price,
      description: `给${currentPerson.name}送${gift.name}`
    })
    
    const newFavor = Math.min(100, currentPerson.favorability + gift.favor)
    updateStarGravityPerson(currentPerson.id, { favorability: newFavor })
    setCurrentPerson(prev => prev ? { ...prev, favorability: newFavor } : null)
    
    addStarGravityMessage(currentPerson.id, { 
      content: `[送出${gift.name}]`, 
      isUser: true 
    })
    setCurrentPerson(prev => prev ? {
      ...prev,
      messages: [...prev.messages, { content: `[送出${gift.name}]`, isUser: true, timestamp: Date.now() }]
    } : null)
    
    setShowGiftMenu(false)

    // 不再自动塞“收到礼物”的固定话术：由一次API回复自然融入对话
    triggerAIReply(`对方送了你一个礼物：${gift.name}（价值¥${gift.price}）。请根据你的性格与当前好感度自然回应，可多条回复。`)
  }

  // 转账
  const handleTransfer = () => {
    if (!currentPerson) return
    const amount = parseFloat(transferAmount)
    if (isNaN(amount) || amount <= 0) return
    if (walletBalance < amount) {
      alert('余额不足')
      return
    }
    
    updateWalletBalance(-amount)
    addWalletBill({
      type: 'transfer_out',
      amount,
      description: `转账给${currentPerson.name}`,
      relatedCharacterId: currentPerson.id
    })
    
    const favorIncrease = Math.min(20, Math.floor(amount / 10))
    const newFavor = Math.min(100, currentPerson.favorability + favorIncrease)
    updateStarGravityPerson(currentPerson.id, { favorability: newFavor })
    setCurrentPerson(prev => prev ? { ...prev, favorability: newFavor } : null)
    
    addStarGravityMessage(currentPerson.id, { 
      content: `[转账 ¥${amount.toFixed(2)}]`, 
      isUser: true 
    })
    setCurrentPerson(prev => prev ? {
      ...prev,
      messages: [...prev.messages, { content: `[转账 ¥${amount.toFixed(2)}]`, isUser: true, timestamp: Date.now() }]
    } : null)
    
    setTransferAmount('')
    setShowTransferModal(false)

    triggerAIReply(`对方向你转账了¥${amount.toFixed(2)}。请根据你的性格与当前好感度自然回应，可多条回复。`)
  }

  const computeAgeFromBirthdate = (dateStr: string) => {
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return null
    const now = new Date()
    let age = now.getFullYear() - d.getFullYear()
    const m = now.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
    return age
  }

  // 用AI生成人设（言情小说风格）
  const generatePersonWithAI = async () => {
    if (!llmConfig.apiKey || !llmConfig.apiBaseUrl) {
      setApiHelpOpen(true)
      return null
    }

    const genderText = selectedGender === 'all' 
      ? (Math.random() > 0.5 ? '男' : '女')
      : (selectedGender === 'male' ? '男' : '女')

    // 读取破限预设
    const presetContent = getPresetContent()

    const prompt = `你是一个言情小说角色生成器。请像创作言情小说男主/女主一样，生成一个极具魅力、让人心动的虚拟人物。

${presetContent ? `【创作规则】\n${presetContent}\n` : ''}

【核心要求】
性别: ${genderText}
年龄: 18-32岁
出生日期: 必须与年龄匹配（格式：YYYY-MM-DD，确保与当前年份一致）

【人物塑造要求 - 像言情小说一样】
1. 外在魅力：要有让人一眼心动的特质（可以是外貌、气质、才华）
2. 性格层次：表面性格和内心要有反差，比如表面高冷内心柔软、表面花心实则专一
3. 童年/成长：要有塑造性格的关键经历，可以是原生家庭问题、童年创伤、某个改变命运的转折点
4. 感情观：要有独特的感情观，可能因为过去的经历而不敢爱、或者很会撩但不敢认真
5. 弱点/软肋：每个人都有弱点，比如害怕被抛弃、无法接受背叛、对某类人特别心软
6. 说话方式：要有个人特色，比如喜欢用某些词、特定的语气、独特的表达习惯
7. 小癖好/小秘密：让人物更真实，比如收集某种东西、有奇怪的习惯、隐藏的爱好

【输出格式】（严格按照此格式）
姓名: （好听的名字）
年龄: （数字）
出生日期: （YYYY-MM-DD）
性别: ${genderText}
职业: （有吸引力的职业）
地点: （中国城市）
一句话简介: （用一句话勾起好奇心，像小说简介一样）
性格标签: （3-4个标签，逗号分隔，如：傲娇,毒舌,外冷内热,恋爱脑）
表面性格: （别人眼中的他/她，50字）
真实内心: （只有亲近的人才知道的一面，50字）
成长经历: （像小说一样描写，包含家庭背景、童年经历、转折点，150字）
感情经历: （过去的感情故事，为什么现在单身，对爱情的态度，100字）
致命弱点: （软肋是什么，什么情况下会破防，50字）
说话风格: （口头禅、语气特点、表达习惯，50字）
小秘密: （不为人知的一面，30字）

请直接输出角色信息，不要有任何解释说明。`

    try {
      console.log('开始调用API生成人设...')
      console.log('API配置:', { base: llmConfig.apiBaseUrl, hasKey: !!llmConfig.apiKey, model: llmConfig.selectedModel })
      
      const response = await callLLM([
        { role: 'user', content: prompt }
      ])
      console.log('API响应:', response)
      
      if (!response || response.trim() === '') {
        throw new Error('API返回空响应')
      }
      
      // 解析响应
      const lines = response.split('\n').filter(l => l.trim())
      const data: Record<string, string> = {}
      
      for (const line of lines) {
        const match = line.match(/^(.+?)[:：]\s*(.+)$/)
        if (match) {
          const key = match[1].trim()
          const value = match[2].trim()
          data[key] = value
        }
      }

      console.log('解析结果:', data)

      // 检查是否解析出必要字段
      if (!data['姓名'] && !data['性格标签']) {
        console.log('解析失败，使用默认值')
      }

      // 组合完整的性格描述
      const fullPersonality = `${data['表面性格'] || data['性格详情'] || '神秘'}

【真实内心】${data['真实内心'] || '内心柔软'}

【成长经历】${data['成长经历'] || data['背景故事'] || '经历丰富'}

【感情经历】${data['感情经历'] || '感情经历复杂'}

【致命弱点】${data['致命弱点'] || '有自己的弱点'}

【小秘密】${data['小秘密'] || '有不为人知的一面'}`

      const birthday = data['出生日期'] || ''
      const computedAge = birthday ? computeAgeFromBirthdate(birthday) : null
      const parsedAge = parseInt(data['年龄'])

      return {
        name: data['姓名'] || '神秘人',
        age: (computedAge && computedAge > 0 ? computedAge : (Number.isFinite(parsedAge) ? parsedAge : 22)),
        birthday: birthday,
        gender: genderText === '男' ? 'male' as const : 'female' as const,
        job: data['职业'] || '自由职业',
        location: data['地点'] || '未知',
        intro: data['一句话简介'] || data['简介'] || '一个神秘而有魅力的人',
        tags: (data['性格标签'] || '神秘,有趣').split(/[,，]/).map(t => t.trim()).filter(t => t),
        personality: fullPersonality,
        speechStyle: data['说话风格'] || '说话方式独特',
        background: data['成长经历'] || data['背景故事'] || '背景神秘'
      }
    } catch (e) {
      console.error('AI生成人设失败:', e)
      const errorMsg = e instanceof Error ? e.message : '未知错误'
      console.error('错误详情:', errorMsg)
      // 不弹alert了，让调用方处理
      throw e
    }
  }

  // 点击摇一摇按钮
  const handleShakeClick = () => {
    if (!llmConfig.apiKey || !llmConfig.apiBaseUrl) {
      setApiHelpOpen(true)
      return
    }
    setShowGenerateConfirm(true)
  }

  // 确认生成（已去掉次数限制）
  const handleShake = async () => {
    setShowGenerateConfirm(false)

    setIsGenerating(true)
    setGeneratingText('正在连接星际网络...')

    // 模拟加载过程
    const loadingTexts = [
      '正在连接星际网络...',
      '正在搜索附近的星星...',
      '发现一颗闪亮的星...',
      '正在解析星座信息...',
      '正在生成缘分档案...',
      '即将完成...'
    ]
    
    let textIndex = 0
    const textInterval = setInterval(() => {
      textIndex = (textIndex + 1) % loadingTexts.length
      setGeneratingText(loadingTexts[textIndex])
    }, 2000)

    try {
      const personData = await generatePersonWithAI()
      
      clearInterval(textInterval)
      
      if (!personData) {
        setIsGenerating(false)
        alert('生成失败，请重试')
        return
      }

      setGeneratingText('星星已找到！')
      
      const newPerson = addStarGravityPerson({
        name: personData.name,
        age: personData.age,
        birthday: personData.birthday || '',
        gender: personData.gender,
        avatar: STAR_GRAVITY_BLACK_AVATAR,
        intro: personData.intro,
        job: personData.job,
        location: personData.location,
        personality: `${personData.personality}\n\n【说话风格】${personData.speechStyle}\n\n【背景故事】${personData.background}`,
        hiddenFields: []
      })
      
      setPersonalityTags(personData.tags)
      setCurrentPerson(newPerson)
      
      setTimeout(() => {
        setIsGenerating(false)
        setCurrentView('profile')
      }, 500)
      
    } catch (e) {
      clearInterval(textInterval)
      setIsGenerating(false)
      console.error('生成失败:', e)
      const errorMsg = e instanceof Error ? e.message : '未知错误'
      setApiHelpOpen(true)
      console.error(`星引力生成失败: ${errorMsg}`)
    }
  }

  // 发送消息
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !currentPerson || isAIReplying) return
    
    const message = chatInput.trim()
    setChatInput('')
    
    addStarGravityMessage(currentPerson.id, { content: message, isUser: true })
    setCurrentPerson(prev => prev ? {
      ...prev,
      messages: [...prev.messages, { content: message, isUser: true, timestamp: Date.now() }]
    } : null)

    setIsAIReplying(true)
    
    try {
      await triggerAIReply(message)
    } catch (e) {
      console.error('AI reply error:', e)
      setApiHelpOpen(true)
    }
    
    setIsAIReplying(false)
  }

  const splitToReplies = (raw: string) => {
    const text = (raw || '').trim()
    if (!text) return []
    const byLine = text.split('\n').map(s => s.trim()).filter(Boolean)
    const out: string[] = []
    for (const line of byLine) {
      const parts = line.match(/[^。！？!?]+[。！？!?]?/g) || [line]
      for (const p of parts) {
        const t = (p || '').trim()
        if (t) out.push(t)
      }
    }
    // 合并过短碎片，避免一堆“嗯”“好”
    const merged: string[] = []
    for (const s of out) {
      if (!merged.length) { merged.push(s); continue }
      const last = merged[merged.length - 1]
      if (last.length < 10 || s.length < 8) merged[merged.length - 1] = `${last}${s}`
      else merged.push(s)
    }
    return merged.slice(0, 15)
  }

  const triggerAIReply = async (userText: string) => {
    if (!currentPerson) return
    if (!llmConfig.apiKey || !llmConfig.apiBaseUrl || !llmConfig.selectedModel) {
      setApiHelpOpen(true)
      return
    }

    setIsAIReplying(true)
    try {
      const preset = getGlobalPresets()
      const personalityParts = currentPerson.personality.split('\n\n')
      const mainPersonality = personalityParts[0] || ''
      const speechStyle = personalityParts.find(p => p.startsWith('【说话风格】'))?.replace('【说话风格】', '') || ''
      const background = personalityParts.find(p => p.startsWith('【背景故事】'))?.replace('【背景故事】', '') || ''

      let systemPrompt = `${preset ? preset + '\n\n' : ''}【角色信息】
你是${currentPerson.name}，${currentPerson.gender === 'male' ? '男' : '女'}，${currentPerson.age}岁。
【性格特点】${mainPersonality}
【说话风格】${speechStyle}
【背景故事】${background}

【用户人设】
用户名字：${currentPersona?.name || '（未选择）'}
用户人设描述：${currentPersona?.description || '（未填写）'}

【当前场景】
你在“星引力”交友软件和对方聊天。当前好感度：${currentPerson.favorability}/100。

【输出要求】
- 像真实微信聊天：只说话，不要任何动作/旁白/括号描述
- 根据情绪和好感度，回复 1~15 条消息，用换行分隔
- 不要自称AI，不要解释规则`

      const history = currentPerson.messages.slice(-20).map(m => ({
        role: m.isUser ? 'user' : 'assistant',
        content: m.content
      }))

      const response = await callLLM(
        [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userText }],
        undefined,
        { maxTokens: 420, timeoutMs: 600000 }
      )

      const replies = splitToReplies(response)
      let totalDelay = 0
      for (let i = 0; i < replies.length; i++) {
        const content = replies[i]
        const base = i === 0 ? 350 : 650
        const delay = Math.min(5000, Math.max(300, base + content.length * 40 + Math.random() * 400))
        totalDelay += delay
        setTimeout(() => {
          addStarGravityMessage(currentPerson.id, { content, isUser: false })
          setCurrentPerson(prev => prev ? {
            ...prev,
            messages: [...prev.messages, { content, isUser: false, timestamp: Date.now() }]
          } : null)
        }, totalDelay)
      }
      // 在最后一条消息发出之后再关闭“正在输入…”
      window.setTimeout(() => setIsAIReplying(false), Math.max(600, totalDelay + 250))

      // 好感度微增（一次对话一次结算）
      const favorIncrease = Math.floor(Math.random() * 5) + 1
      updateStarGravityPerson(currentPerson.id, { favorability: Math.min(100, currentPerson.favorability + favorIncrease) })
      setCurrentPerson(prev => prev ? { ...prev, favorability: Math.min(100, prev.favorability + favorIncrease) } : null)
    } catch {
      setIsAIReplying(false)
    }
  }

  const handleRequestWechat = () => {
    if (!currentPerson) return
    const successRate = currentPerson.favorability / 100
    const success = Math.random() < successRate
    
    if (success) {
      setAddWechatResult('success')
      const wc = matchWithPerson(currentPerson.id)
      setMatchedCharacterId(wc?.id || null)
    } else {
      setAddWechatResult('fail')
    }
    setShowAddWechatDialog(true)
  }

  // 生成中界面
  if (isGenerating) {
    return (
      <div 
        className="absolute inset-0 bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 z-50 flex flex-col items-center justify-center"
        style={{ touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {stars.map(star => (
          <Star key={star.id} {...star} />
        ))}
        <div className="relative z-10 text-center">
          {/* 加载动画 */}
          <div className="w-20 h-20 mx-auto mb-6 relative">
            <div className="absolute inset-0 rounded-full border-4 border-purple-500/30" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-400 animate-spin" />
            <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-pink-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          <p className="text-purple-200 text-lg font-medium animate-pulse">{generatingText}</p>
          <p className="text-purple-300/60 text-sm mt-2">AI正在为你寻找有缘人...</p>
        </div>

        <WeChatDialog
          open={apiHelpOpen}
          title="需要先配置API"
          message="请到：手机主屏 → 设置App → API 配置，填写 Base URL / API Key 并保存。配置完成后回到星引力再摇一摇。"
          confirmText="去设置"
          cancelText="取消"
          onCancel={() => setApiHelpOpen(false)}
          onConfirm={() => {
            setApiHelpOpen(false)
            navigate('/apps/settings/api')
          }}
        />
      </div>
    )
  }

  // 首页 - 星空主题
  if (currentView === 'home') {
    return (
      <div 
        className="absolute inset-0 bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 z-50 flex flex-col overflow-hidden"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {stars.map(star => (
          <Star key={star.id} {...star} />
        ))}
        
        <div className="flex items-center justify-between px-4 py-3 relative z-10">
          <button onClick={onBack} className="text-white/90 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-white font-bold text-lg tracking-wider">星引力</span>
          <div className="w-6" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
          <div 
            className={`w-36 h-36 rounded-full cursor-pointer ${isGenerating ? '' : 'hover:scale-105 transition-transform active:scale-95'}`}
            onClick={handleShakeClick}
            style={{
              background: 'radial-gradient(circle at 30% 30%, rgba(167,139,250,0.8) 0%, rgba(139,92,246,0.6) 50%, rgba(91,33,182,0.4) 100%)',
              boxShadow: '0 0 60px 20px rgba(139,92,246,0.4), inset 0 0 30px rgba(255,255,255,0.2)'
            }}
          >
            <div className="w-full h-full rounded-full flex items-center justify-center">
              <span className="text-white text-xl font-bold drop-shadow-lg">点击</span>
            </div>
          </div>

          <p className="text-purple-200 text-sm mt-8 text-center leading-relaxed">
            每个人都是一颗星<br/>
            <span className="text-purple-300">因引力而相遇</span>
          </p>

          <div className="flex gap-3 mt-8">
            {(['all', 'male', 'female'] as const).map(g => (
              <button
                key={g}
                onClick={() => setSelectedGender(g)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedGender === g 
                    ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/50' 
                    : 'bg-white/10 text-purple-200 hover:bg-white/20'
                }`}
              >
                {g === 'all' ? '不限' : g === 'male' ? '男生' : '女生'}
              </button>
            ))}
          </div>

          <p className="text-purple-300/60 text-xs mt-6">
            点击开始你的缘分之旅
          </p>
        </div>

        {starGravityPersons.length > 0 && (
          <div className="bg-white/5 backdrop-blur-sm p-4 mx-4 mb-4 rounded-2xl border border-white/10 relative z-10">
            <p className="text-purple-200 text-sm mb-3 font-medium">最近遇见</p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {starGravityPersons.slice(-5).reverse().map(person => (
                <div 
                  key={person.id}
                  className="flex-shrink-0 text-center cursor-pointer group"
                  onClick={() => {
                    setCurrentPerson(person)
                    // 从personality中解析标签
                    const tags = PERSONALITY_TAGS.filter(tag => person.personality.includes(tag)).slice(0, 4)
                    setPersonalityTags(tags.length > 0 ? tags : ['神秘'])
                    setCurrentView('profile')
                  }}
                >
                  <img 
                    src={person.avatar} 
                    alt={person.name}
                    className="w-12 h-12 rounded-full bg-purple-300/20 object-cover border-2 border-purple-400/30 group-hover:border-purple-400 transition-colors"
                  />
                  <p className="text-purple-200 text-xs mt-1">{person.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 生成确认弹窗 */}
        <WeChatDialog
          open={showGenerateConfirm}
          title="AI生成角色"
          message="所有人物都是AI实时生成的，每个角色都独一无二。生成过程可能需要1-3分钟，请耐心等待。"
          confirmText="开始生成"
          cancelText="取消"
          onConfirm={handleShake}
          onCancel={() => setShowGenerateConfirm(false)}
        />

        <WeChatDialog
          open={apiHelpOpen}
          title="需要先配置API"
          message="请到：手机主屏 → 设置App → API 配置，填写 Base URL / API Key 并保存。配置完成后回到星引力再摇一摇。"
          confirmText="去设置"
          cancelText="取消"
          onCancel={() => setApiHelpOpen(false)}
          onConfirm={() => {
            setApiHelpOpen(false)
            navigate('/apps/settings/api')
          }}
        />
      </div>
    )
  }

  // 个人资料页
  if (currentView === 'profile' && currentPerson) {
    const personalityParts = currentPerson.personality.split('\n\n')
    const mainPersonality = personalityParts[0] || ''
    
    return (
      <div 
        className="absolute inset-0 bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 z-50 flex flex-col overflow-hidden"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {stars.slice(0, 30).map(star => (
          <Star key={star.id} {...star} />
        ))}
        
        <div className="flex items-center justify-between px-4 py-3 relative z-10">
          <button onClick={() => setCurrentView('home')} className="text-white/90 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-white font-semibold">个人资料</span>
          <div className="w-6" />
        </div>

        <div className="flex-1 flex flex-col items-center px-6 pt-4 overflow-y-auto relative z-10">
          <img 
            src={currentPerson.avatar} 
            alt={currentPerson.name}
            className="w-24 h-24 rounded-full bg-purple-300/20 shadow-2xl object-cover border-4 border-purple-400/50"
            style={{ boxShadow: '0 0 30px rgba(139,92,246,0.5)' }}
          />
          
          <h2 className="text-white text-2xl font-bold mt-4">{currentPerson.name}</h2>
          
          {/* 性格标签 */}
          <div className="flex gap-2 mt-3 flex-wrap justify-center">
            {personalityTags.map((tag, i) => (
              <span key={i} className="bg-gradient-to-r from-purple-500/50 to-pink-500/50 px-3 py-1 rounded-full text-purple-100 text-xs border border-purple-400/30">
                {tag}
              </span>
            ))}
          </div>
          
          <div className="flex gap-3 mt-3 flex-wrap justify-center">
            {!currentPerson.hiddenFields.includes('age') && (
              <span className="bg-purple-500/30 px-3 py-1 rounded-full text-purple-100 text-sm border border-purple-400/30">
                {currentPerson.age}岁
              </span>
            )}
            <span className="bg-purple-500/30 px-3 py-1 rounded-full text-purple-100 text-sm border border-purple-400/30">
              {currentPerson.gender === 'male' ? '男' : '女'}
            </span>
            {currentPerson.location && !currentPerson.hiddenFields.includes('location') && (
              <span className="bg-purple-500/30 px-3 py-1 rounded-full text-purple-100 text-sm border border-purple-400/30">
                {currentPerson.location}
              </span>
            )}
          </div>
          {currentPerson.birthday && (
            <div className="text-purple-300/80 text-xs mt-2">
              出生日期：{currentPerson.birthday}（{currentPerson.age}岁）
            </div>
          )}

          {currentPerson.job && !currentPerson.hiddenFields.includes('job') && (
            <p className="text-purple-200 text-sm mt-3">{currentPerson.job}</p>
          )}

          <div className="bg-white/10 backdrop-blur rounded-2xl p-4 mt-4 w-full border border-white/10">
            <p className="text-purple-100 text-center text-sm">{currentPerson.intro}</p>
          </div>

          <div className="bg-white/10 backdrop-blur rounded-2xl p-4 mt-3 w-full border border-white/10">
            <p className="text-purple-300 text-xs mb-2">性格特点</p>
            <p className="text-purple-100 text-sm">
              {currentPerson.favorability >= 30 
                ? mainPersonality 
                : mainPersonality.slice(0, 30) + '... (聊聊天解锁更多)'}
            </p>
          </div>

          <div className="w-full mt-4">
            <div className="flex justify-between text-purple-200 text-sm mb-2">
              <span>好感度</span>
              <span>{currentPerson.favorability}%</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-pink-400 via-purple-400 to-violet-400 transition-all duration-500"
                style={{ width: `${currentPerson.favorability}%` }}
              />
            </div>
            <p className="text-purple-300/60 text-xs mt-1 text-center">
              {currentPerson.favorability < 30 ? '初次相识' : 
               currentPerson.favorability < 60 ? '渐渐熟悉' :
               currentPerson.favorability < 80 ? '暧昧期' : '情投意合'}
            </p>
          </div>
        </div>

        <div className="flex gap-4 p-4 relative z-10">
          <button 
            onClick={() => setCurrentView('home')}
            className="flex-1 py-3 bg-white/10 text-purple-200 rounded-full font-medium border border-white/20"
          >
            下一个
          </button>
          <button 
            onClick={() => setCurrentView('chat')}
            className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-medium shadow-lg"
          >
            聊一聊
          </button>
        </div>
      </div>
    )
  }

  // 聊天页
  if (currentView === 'chat' && currentPerson) {
    return (
      <div 
        className="absolute inset-0 bg-slate-900 z-50 flex flex-col"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/30 bg-slate-800/80">
          <button onClick={() => setCurrentView('profile')} className="text-purple-300 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center">
            <p className="font-semibold text-white">{currentPerson.name}</p>
            <p className="text-xs text-purple-300">{currentPerson.favorability}%</p>
          </div>
          <button 
            onClick={handleRequestWechat}
            className="text-purple-300 text-sm"
            disabled={currentPerson.matched}
          >
            {currentPerson.matched ? '已添加' : '加微信'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-slate-800/50 to-slate-900">
          {currentPerson.messages.length === 0 && (
            <div className="text-center text-purple-300/60 py-8">
              <p>和 {currentPerson.name} 打个招呼吧</p>
            </div>
          )}
          {currentPerson.messages.map((msg, idx) => (
            <div 
              key={idx}
              className={`flex mb-3 ${msg.isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!msg.isUser && (
                <img 
                  src={currentPerson.avatar} 
                  alt="" 
                  className="w-8 h-8 rounded-full mr-2 flex-shrink-0"
                />
              )}
              <div 
                className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                  msg.isUser 
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-br-sm' 
                    : 'bg-slate-700 text-purple-100 rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isAIReplying && (
            <div className="flex justify-start mb-3">
              <img 
                src={currentPerson.avatar} 
                alt="" 
                className="w-8 h-8 rounded-full mr-2 flex-shrink-0"
              />
              <div className="bg-slate-700 rounded-2xl rounded-bl-sm px-4 py-2">
                <span className="text-purple-300 animate-pulse">正在输入...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-3 border-t border-purple-500/30 bg-slate-800/80">
          <div className="flex items-center gap-2">
            {/* 加号按钮 - 点击展开菜单 */}
            <button 
              onClick={() => setShowGiftMenu(!showGiftMenu)}
              className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0"
            >
              <svg className={`w-5 h-5 text-purple-300 transition-transform ${showGiftMenu ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="说点什么..."
              className="flex-1 min-w-0 px-3 py-2 bg-slate-700 rounded-full outline-none text-white placeholder-purple-300/50 text-sm"
            />
            <button 
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || isAIReplying}
              className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full disabled:opacity-50 text-sm flex-shrink-0"
            >
              发送
            </button>
          </div>
          
          {/* 展开的功能菜单 */}
          {showGiftMenu && (
            <div className="mt-3 p-3 bg-slate-700 rounded-xl">
              <div className="flex gap-4 mb-3">
                <button 
                  onClick={() => setShowTransferModal(true)}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-600 flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                    </svg>
                  </div>
                  <span className="text-purple-300 text-xs">转账</span>
                </button>

                {/* 拉黑（消失） */}
                <button
                  onClick={() => setShowBlockDialog(true)}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-600 flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-12.728 12.728M6.343 6.343a8 8 0 1111.314 11.314A8 8 0 016.343 6.343z" />
                    </svg>
                  </div>
                  <span className="text-purple-300 text-xs">拉黑</span>
                </button>
              </div>
              <p className="text-purple-300 text-xs mb-2">送礼物 (余额: ¥{walletBalance})</p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {gifts.map(gift => (
                  <button
                    key={gift.id}
                    onClick={() => handleSendGift(gift)}
                    className="flex-shrink-0 flex flex-col items-center p-2 bg-slate-600 rounded-lg hover:bg-slate-500 transition-colors min-w-[60px]"
                  >
                    <span className="text-purple-200 text-sm">{gift.name}</span>
                    <span className="text-purple-400 text-xs">¥{gift.price}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {showTransferModal && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-[60]">
            <div className="bg-slate-800 rounded-2xl p-6 mx-6 w-full max-w-sm border border-purple-500/30">
              <h3 className="text-white text-lg font-semibold mb-4 text-center">转账给 {currentPerson.name}</h3>
              <p className="text-purple-300 text-sm mb-2">余额: ¥{walletBalance}</p>
              <input
                type="number"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="输入金额"
                className="w-full px-4 py-3 bg-slate-700 rounded-xl outline-none text-white text-center text-xl"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 py-2 bg-slate-600 text-purple-200 rounded-full"
                >
                  取消
                </button>
                <button
                  onClick={handleTransfer}
                  className="flex-1 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full"
                >
                  确认转账
                </button>
              </div>
            </div>
          </div>
        )}

        <WeChatDialog
          open={showAddWechatDialog}
          title={addWechatResult === 'success' ? '添加成功' : '被拒绝了'}
          message={addWechatResult === 'success' 
            ? `${currentPerson.name}已添加到你的微信通讯录！\n记得去聊天设置里为TA设置你心里幻想的头像~`
            : `${currentPerson.name}觉得还不太熟悉，再聊聊吧\n(提升好感度可提高成功率)`
          }
          confirmText="好的"
          onConfirm={() => {
            setShowAddWechatDialog(false)
            if (addWechatResult === 'success') {
              // 添加成功：星引力里消失，回到首页
              if (currentPerson) removeStarGravityPerson(currentPerson.id)
              setCurrentPerson(null)
              setShowGiftMenu(false)
              setCurrentView('home')

              // 自动生成“星引力聊天记忆”写入微信聊天设置
              if (matchedCharacterId) {
                const history = currentPerson?.messages
                  .map(m => `${m.isUser ? '我' : currentPerson.name}：${m.content}`)
                  .join('\n')
                if (history && history.trim()) {
                  const prompt = `你是“聊天记忆整理器”。请把以下对话总结成长期记忆要点：
- 只输出要点（8~16条）
- 每条以“- ”开头
- 记录稳定事实/关系/偏好/禁忌/关键事件
- 不要旁白和解释

【星引力聊天记录】
${history}`
                  callLLM(
                    [{ role: 'user', content: prompt }],
                    undefined,
                    { maxTokens: 380, timeoutMs: 600000 }
                  ).then((summary) => {
                    updateCharacter(matchedCharacterId, {
                      memorySummary: summary.trim(),
                      memorySummaryUpdatedAt: Date.now(),
                    })
                  }).catch(() => {
                    // ignore
                  })
                }
              }
            }
          }}
          onCancel={() => setShowAddWechatDialog(false)}
        />

        <WeChatDialog
          open={showBlockDialog}
          title="让这颗星永远消失？"
          message="有些相遇像星光，错过了就真的错过了。\n拉黑后对方会从星引力里消失，无法再遇见。"
          confirmText="确定"
          cancelText="再想想"
          danger
          onCancel={() => setShowBlockDialog(false)}
          onConfirm={() => {
            setShowBlockDialog(false)
            if (!currentPerson) return
            removeStarGravityPerson(currentPerson.id)
            setCurrentPerson(null)
            setCurrentView('home')
            setShowGiftMenu(false)
          }}
        />
      </div>
    )
  }

  return null
}
