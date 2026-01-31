import { useMemo, useState, useRef } from 'react'
import { useWeChat } from '../../../context/WeChatContext'
import { useOS } from '../../../context/OSContext'
import WeChatDialog from '../components/WeChatDialog'
import { getGlobalPresets, getLorebookEntriesForCharacter } from '../../PresetScreen'

type Props = {
  onBack: () => void
}

export default function MomentsTab({ onBack }: Props) {
  const { llmConfig, callLLM } = useOS()
  const { moments, characters, userSettings, updateUserSettings, addMoment, likeMoment, deleteMoment, addMomentComment, deleteMomentComment, getCurrentPersona, getMessagesByCharacter } = useWeChat()
  const currentPersona = getCurrentPersona()
  const [showPostModal, setShowPostModal] = useState(false)
  const [postContent, setPostContent] = useState('')
  const [postImages, setPostImages] = useState<string[]>([])
  const coverInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; title?: string; message?: string }>({ open: false })
  const [refreshWarnOpen, setRefreshWarnOpen] = useState(false)
  const [commentDraftByMoment, setCommentDraftByMoment] = useState<Record<string, string>>({})
  const [replyTarget, setReplyTarget] = useState<{ momentId: string; commentId: string; authorId: string; authorName: string } | null>(null)
  const [replyInputText, setReplyInputText] = useState('')
  const [coverShrink, setCoverShrink] = useState(0)
  const [translatedMoments, setTranslatedMoments] = useState<Set<string>>(new Set()) // 已切换到中文的朋友圈

  const hasApiConfig = llmConfig.apiBaseUrl && llmConfig.apiKey && llmConfig.selectedModel

  const displayNameById = useMemo(() => {
    const map: Record<string, string> = {}
    map['user'] = currentPersona?.name || '我'
    for (const c of characters) map[c.id] = c.name
    return map
  }, [characters, currentPersona?.name])

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => resolve((event.target?.result as string) || '')
      reader.onerror = () => reject(new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })

  const handleChangeCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      fileToBase64(file)
        .then((base64) => updateUserSettings({ momentsBackground: base64 }))
        .catch(() => setDialog({ open: true, title: '失败', message: '封面读取失败，请重试' }))
    }
  }

  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      const list = Array.from(files).slice(0, Math.max(0, 9 - postImages.length))
      Promise.all(list.map(fileToBase64))
        .then((imgs) => setPostImages(prev => [...prev, ...imgs].slice(0, 9)))
        .catch(() => setDialog({ open: true, title: '失败', message: '图片读取失败，请重试' }))
    }
  }

  const handleRefresh = async () => {
    if (refreshing) return
    if (!hasApiConfig) {
      setDialog({ open: true, title: '需要先配置API', message: '请到：手机主屏 → 设置App → API 配置，配置好后再刷新朋友圈。' })
      return
    }
    if (characters.length === 0) {
      setDialog({ open: true, title: '还没有好友', message: '先去微信创建几个角色，刷新才能刷到好友动态/评论。' })
      return
    }
    setRefreshing(true)
    try {
      // 根据聊天频率计算每个好友的权重（聊天越多权重越高）
      const now = Date.now()
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000
      
      const friendWeights = characters.map(c => {
        const msgs = getMessagesByCharacter(c.id)
        // 只计算最近一周的消息
        const recentMsgs = msgs.filter(m => m.timestamp > oneWeekAgo)
        // 基础权重 + 消息数量权重（每条消息+0.5权重，最多+50）
        const weight = 1 + Math.min(50, recentMsgs.length * 0.5)
        return { character: c, weight }
      })
      
      // 按权重随机选择好友
      const totalWeight = friendWeights.reduce((sum, fw) => sum + fw.weight, 0)
      let random = Math.random() * totalWeight
      let selectedFriend = friendWeights[0].character
      for (const fw of friendWeights) {
        random -= fw.weight
        if (random <= 0) {
          selectedFriend = fw.character
          break
        }
      }
      
      const friend = selectedFriend
      const anyPosts = moments
      
      // 降低评论概率，提高发新朋友圈的概率（40%评论，60%发朋友圈）
      // 如果用户没有发过朋友圈，则100%发新朋友圈
      const userPosts = anyPosts.filter(p => p.authorId === 'user')
      const willComment = userPosts.length > 0 && Math.random() < 0.4
      
      const globalPresets = getGlobalPresets()
      const recentChat = getMessagesByCharacter(friend.id).slice(-8).map(m => `${m.isUser ? '我' : friend.name}：${m.content}`).join('\n')
      const randomPastMs = (minMin: number, maxMin: number) => {
        const min = minMin * 60 * 1000
        const max = maxMin * 60 * 1000
        return now - (min + Math.random() * (max - min))
      }

      // 决定是评论还是发新朋友圈
      const postsToComment = anyPosts.filter(p => p.authorId === 'user')
      const shouldComment = willComment && postsToComment.length > 0
      
      if (shouldComment) {
        // AI角色评论用户发的朋友圈
        const target = postsToComment[Math.floor(Math.random() * postsToComment.length)]
        // 有概率回复用户的评论（楼中楼），只回复用户的评论
        const userComments = target.comments.filter(c => c.authorId === 'user')
        const willReplyComment = userComments.length > 0 && Math.random() < 0.6
        const replyTo = willReplyComment ? userComments[Math.floor(Math.random() * userComments.length)] : null
        const lang = (friend as any).language || 'zh'
        const langName =
          lang === 'zh' ? '中文' : lang === 'en' ? '英语' : lang === 'ru' ? '俄语' : lang === 'fr' ? '法语' : lang === 'ja' ? '日语' : lang === 'ko' ? '韩语' : lang === 'de' ? '德语' : '中文'
        const lore = getLorebookEntriesForCharacter(
          friend.id,
          `${recentChat || ''}\n${target.content || ''}\n${replyTo ? replyTo.content : ''}`
        )
        // 获取角色的长期记忆
        const characterMemory = friend.memorySummary || ''
        // 获取图片信息提示
        const hasImages = target.images && target.images.length > 0
        const imageHint = hasImages ? `（朋友圈配图${target.images.length}张，可能是聊天记录截图、自拍、风景等）` : ''
        const prompt = `${globalPresets ? globalPresets + '\n\n' : ''}${lore ? lore + '\n\n' : ''}你正在以微信朋友圈"评论/回复"的方式发言。

【你的身份】
你是：${friend.name}
你的人设：${friend.prompt || '（未设置）'}
你的国家/地区：${(friend as any).country || '（未设置）'}
你的主要语言：${langName}
你称呼TA为：${friend.callMeName || '（未设置）'}
你们的关系：${friend.relationship || '朋友'}
${characterMemory ? `你的长期记忆：\n${characterMemory}` : ''}

【朋友圈发布者信息】
发布者：${target.authorName}（就是你认识的那个${friend.callMeName || '朋友'}）
朋友圈内容：${target.content || '（仅图片）'}${imageHint}

【最近你们的聊天片段】
${recentChat || '（暂无）'}

${replyTo ? `【你要回复的评论】\n@${replyTo.authorName}：${replyTo.content}` : ''}

【任务】
请写1条朋友圈评论：
- 【语言强规则】只用「${langName}」输出
- 【翻译规则】如果不是中文，必须在后面加括号写简体中文翻译，格式：原文（中文翻译）
  例如：That's so cool!（太酷了！）
- 你认识发朋友圈的人（${target.authorName}），要基于你们的关系和聊天记忆来评论
- 口语化、短（<=30字）
- 不要动作描写/旁白
- 只输出评论内容，不要加引号，不要换行`
        const text = await callLLM([{ role: 'user', content: prompt }], undefined, { maxTokens: 90, timeoutMs: 600000 })
        addMomentComment(target.id, {
          authorId: friend.id,
          authorName: friend.name,
          content: text.trim(),
          replyToCommentId: replyTo?.id,
          replyToAuthorName: replyTo?.authorName,
          timestamp: randomPastMs(1, 30), // 评论时间改为1~30分钟内，更合理
        })
      } else {
        // 发新朋友圈（没有可评论的帖子时也发新朋友圈）
        // 获取最近聊天的时间，用于生成合理的发帖时间
        const recentMessages = getMessagesByCharacter(friend.id).slice(-10)
        const lastMsgTime = recentMessages.length > 0 ? recentMessages[recentMessages.length - 1].timestamp : now
        // 发帖时间在最近消息之后的1~30分钟内，但不能超过当前时间
        const baseTime = Math.min(lastMsgTime, now - 60 * 1000)
        const postTime = Math.min(baseTime + Math.random() * 30 * 60 * 1000, now - 60 * 1000)
        
        const lang = (friend as any).language || 'zh'
        const langName =
          lang === 'zh' ? '中文' : lang === 'en' ? '英语' : lang === 'ru' ? '俄语' : lang === 'fr' ? '法语' : lang === 'ja' ? '日语' : lang === 'ko' ? '韩语' : lang === 'de' ? '德语' : '中文'
        const isNonChinese = lang !== 'zh'
        const lore = getLorebookEntriesForCharacter(friend.id, `${recentChat || ''}`)
        
        // 非中文角色需要同时生成原文和中文翻译
        const prompt = isNonChinese
          ? `${globalPresets ? globalPresets + '\n\n' : ''}${lore ? lore + '\n\n' : ''}你正在以微信朋友圈"发布动态"的方式发言。
你是：${friend.name}
你的人设：${friend.prompt || '（未设置）'}
你的国家/地区：${(friend as any).country || '（未设置）'}
你的主要语言：${langName}
最近聊天片段（可用来贴合语境）：
${recentChat || '（暂无）'}

请写1条朋友圈动态，同时提供原文和中文翻译：
- 原文用「${langName}」写，中文翻译要自然流畅
- 口语化、自然（<=80字）
- 不要动作描写/旁白

【输出格式】严格按以下格式输出：
原文：（${langName}内容）
中文：（中文翻译）`
          : `${globalPresets ? globalPresets + '\n\n' : ''}${lore ? lore + '\n\n' : ''}你正在以微信朋友圈"发布动态"的方式发言。
你是：${friend.name}
你的人设：${friend.prompt || '（未设置）'}
你的国家/地区：${(friend as any).country || '（未设置）'}
你的主要语言：${langName}
最近聊天片段（可用来贴合语境）：
${recentChat || '（暂无）'}

请写1条朋友圈动态：
- 【语言强规则】只用「${langName}」输出
- 口语化、自然（<=80字）
- 不要动作描写/旁白
- 只输出动态内容，不要加引号，不要换行`

        const text = await callLLM([{ role: 'user', content: prompt }], undefined, { maxTokens: isNonChinese ? 280 : 140, timeoutMs: 600000 })
        
        // 解析双语内容
        let content = text.trim()
        let contentZh: string | undefined
        
        if (isNonChinese) {
          // 尝试解析格式：原文：xxx\n中文：xxx
          const originalMatch = text.match(/原文[：:]\s*(.+?)(?:\n|中文[：:]|$)/s)
          const zhMatch = text.match(/中文[：:]\s*(.+?)$/s)
          
          if (originalMatch && zhMatch) {
            content = originalMatch[1].trim()
            contentZh = zhMatch[1].trim()
          }
        }
        
        addMoment({
          authorId: friend.id,
          authorName: friend.name,
          authorAvatar: friend.avatar || '',
          content,
          contentZh,
          images: [],
          timestamp: postTime,
        })
      }
    } catch (e: any) {
      setDialog({ open: true, title: '刷新失败', message: e?.message || '模型调用失败，请稍后重试' })
    } finally {
      setRefreshing(false)
      setRefreshWarnOpen(false)
    }
  }

  const handlePost = async () => {
    if (!postContent.trim() && postImages.length === 0) return
    
    const newMomentContent = postContent
    const newMomentImages = postImages
    const newMoment = addMoment({
      authorId: 'user',
      authorName: currentPersona?.name || '我',
      authorAvatar: currentPersona?.avatar || '',
      content: postContent,
      images: postImages,
    })
    
    setPostContent('')
    setPostImages([])
    setShowPostModal(false)
    
    // 用户发朋友圈后，让大部分好友来评论
    if (hasApiConfig && characters.length > 0) {
      const newMomentId = newMoment.id
      
      // 80%的好友会来评论
      const shuffled = [...characters].sort(() => Math.random() - 0.5)
      const numCommenters = Math.max(1, Math.ceil(shuffled.length * 0.8))
      const commenters = shuffled.slice(0, Math.min(numCommenters, 15)) // 最多15个，避免太多API调用
      
      // 构建所有好友的名字列表（用于互相识别）
      const allFriendNames = characters.map(c => c.name)
      
      // 延迟执行，等待新帖子添加完成
      window.setTimeout(async () => {
        const globalPresets = getGlobalPresets()
        const collectedComments: { friendId: string; friendName: string; content: string; timestamp: number }[] = []
        
        // 第一轮：每个好友独立评论
        for (const friend of commenters) {
          const recentChat = getMessagesByCharacter(friend.id).slice(-12).map(m => `${m.isUser ? '我' : friend.name}：${m.content}`).join('\n')
          const lore = getLorebookEntriesForCharacter(friend.id, `${recentChat || ''}\n${newMomentContent || ''}`)
          const lang = (friend as any).language || 'zh'
          const langName =
            lang === 'zh' ? '中文' : lang === 'en' ? '英语' : lang === 'ru' ? '俄语' : lang === 'fr' ? '法语' : lang === 'ja' ? '日语' : lang === 'ko' ? '韩语' : lang === 'de' ? '德语' : '中文'
          const characterMemory = friend.memorySummary || ''
          const hasImages = newMomentImages && newMomentImages.length > 0
          
          // 其他好友名字（排除自己）
          const otherFriendNames = allFriendNames.filter(n => n !== friend.name)
          
          // 检测截图中是否可能有自己的聊天记录
          const chatMentionHint = recentChat 
            ? `\n【重要】如果朋友圈截图里有你和TA的聊天记录，你要能认出是自己的对话！查看最近聊天片段判断。`
            : ''
          
          const imageHint = hasImages 
            ? `（朋友圈配图${newMomentImages.length}张，可能是聊天记录截图、自拍、风景等）${chatMentionHint}` 
            : ''
          
          try {
            const prompt = `${globalPresets ? globalPresets + '\n\n' : ''}${lore ? lore + '\n\n' : ''}你正在以微信朋友圈"评论"的方式发言。

【你的身份】
你是：${friend.name}
你的人设：${friend.prompt || '（未设置）'}
你的国家/地区：${(friend as any).country || '（未设置）'}
你的主要语言：${langName}
你称呼TA为：${friend.callMeName || '（未设置）'}
你们的关系：${friend.relationship || '朋友'}
${characterMemory ? `你的长期记忆：\n${characterMemory}` : ''}

【朋友圈发布者信息】
发布者：${currentPersona?.name || '我'}（就是你认识的那个${friend.callMeName || '朋友'}）
朋友圈内容：${newMomentContent || '（仅图片）'}${imageHint}

【最近你们的聊天片段】
${recentChat || '（暂无）'}

【其他好友名字（仅供参考，你可能不认识他们）】
${otherFriendNames.slice(0, 10).join('、') || '（无）'}

【任务】
请写1条朋友圈评论：
- 【语言强规则】只用「${langName}」输出
- 【翻译规则】如果不是中文，必须在后面加括号写简体中文翻译，格式：原文（中文翻译）
  例如：That's so cool!（太酷了！）
- 如果截图里有你和TA的聊天记录，你可以认出来并回应（比如"这不是我吗""我说的话被发出来了"）
- 你认识发朋友圈的人，要基于你们的关系和聊天记忆来评论
- 口语化、短（<=30字）
- 不要动作描写/旁白
- 只输出评论内容，不要加引号，不要换行`
            
            const text = await callLLM([{ role: 'user', content: prompt }], undefined, { maxTokens: 90, timeoutMs: 600000 })
            const cleanText = text.trim()
            if (cleanText) {
              const timestamp = Date.now() - Math.random() * 5 * 60 * 1000
              collectedComments.push({
                friendId: friend.id,
                friendName: friend.name,
                content: cleanText,
                timestamp
              })
              // 立即添加评论
              addMomentComment(newMomentId, {
                authorId: friend.id,
                authorName: friend.name,
                content: cleanText,
                timestamp
              })
            }
          } catch {
            // ignore
          }
        }
        
        // 第二轮：50%的好友会互相回复（但不能乱回复）
        if (collectedComments.length >= 2) {
          const replyCount = Math.max(1, Math.floor(collectedComments.length * 0.5))
          const shuffledForReply = [...commenters].sort(() => Math.random() - 0.5).slice(0, replyCount)
          
          for (const friend of shuffledForReply) {
            // 找一个可以回复的评论（排除自己的评论）
            const otherComments = collectedComments.filter(c => c.friendId !== friend.id)
            if (otherComments.length === 0) continue
            
            const targetComment = otherComments[Math.floor(Math.random() * otherComments.length)]
            const targetFriend = characters.find(c => c.id === targetComment.friendId)
            if (!targetFriend) continue
            
            // 检查这两个好友是否"认识"（有共同的聊天记录提及对方）
            // 简化处理：假设同一个朋友圈下的好友都互相认识
            
            const lang = (friend as any).language || 'zh'
            const langName =
              lang === 'zh' ? '中文' : lang === 'en' ? '英语' : lang === 'ru' ? '俄语' : lang === 'fr' ? '法语' : lang === 'ja' ? '日语' : lang === 'ko' ? '韩语' : lang === 'de' ? '德语' : '中文'
            
            try {
              const replyPrompt = `${globalPresets ? globalPresets + '\n\n' : ''}你正在微信朋友圈评论区回复另一个人的评论。

【你的身份】
你是：${friend.name}
你的人设：${friend.prompt || '（未设置）'}
你的主要语言：${langName}

【朋友圈发布者】
发布者：${currentPersona?.name || '我'}

【你要回复的评论】
评论者：${targetComment.friendName}
评论内容：${targetComment.content}

【严格规则 - 必须遵守】
1. 你回复的是「${targetComment.friendName}」，不是「${currentPersona?.name || '我'}」！
2. 禁止把「${targetComment.friendName}」当成朋友圈发布者来回复
3. 禁止调情、暧昧、亲密称呼（你们只是普通朋友/网友）
4. 可以友好互动、玩梗、附和、吐槽，但要保持正常社交距离
5. 【语言强规则】只用「${langName}」输出

【任务】
写1条回复「${targetComment.friendName}」的评论（<=20字）：
- 只输出评论内容，不要加引号、@符号
- 【翻译规则】如果不是中文，必须在后面加括号写简体中文翻译，格式：原文（中文翻译）`
              
              const replyText = await callLLM([{ role: 'user', content: replyPrompt }], undefined, { maxTokens: 60, timeoutMs: 600000 })
              const cleanReply = replyText.trim()
              if (cleanReply) {
                addMomentComment(newMomentId, {
                  authorId: friend.id,
                  authorName: friend.name,
                  content: `回复 ${targetComment.friendName}：${cleanReply}`,
                  timestamp: Date.now() - Math.random() * 2 * 60 * 1000
                })
              }
            } catch {
              // ignore
            }
          }
        }
      }, 100)
    }
  }

  const maybeAutoReplyToUserComment = async (params: { momentId: string; friendId: string; friendName: string; friendPrompt: string; userText: string; replyToCommentId: string; replyToAuthorName: string }) => {
    if (!hasApiConfig) return
    // 90% 概率回一句（大幅提高回复率，让用户评论后几乎一定会得到回复）
    if (Math.random() > 0.9) return
    const globalPresets = getGlobalPresets()
    try {
      const now = Date.now()
      // 回复时间应该是"刚刚"到几分钟前，因为是实时互动
      const replyTimestamp = now - Math.random() * (5 * 60 * 1000) // 0~5分钟前
      const friend = characters.find(c => c.id === params.friendId)
      const lang = (friend as any)?.language || 'zh'
      const langName =
        lang === 'zh' ? '中文' : lang === 'en' ? '英语' : lang === 'ru' ? '俄语' : lang === 'fr' ? '法语' : lang === 'ja' ? '日语' : lang === 'ko' ? '韩语' : lang === 'de' ? '德语' : '中文'
      const recentChat = getMessagesByCharacter(params.friendId).slice(-8).map(m => `${m.isUser ? '我' : params.friendName}：${m.content}`).join('\n')
      const characterMemory = friend?.memorySummary || ''
      const prompt = `${globalPresets ? globalPresets + '\n\n' : ''}你正在以微信朋友圈"回复评论"的方式发言。

【你的身份】
你是：${params.friendName}
你的人设：${params.friendPrompt || '（未设置）'}
你的国家/地区：${(friend as any)?.country || '（未设置）'}
你的主要语言：${langName}
你称呼TA为：${friend?.callMeName || '（未设置）'}
你们的关系：${friend?.relationship || '朋友'}
${characterMemory ? `你的长期记忆：\n${characterMemory}` : ''}

【最近你们的聊天片段】
${recentChat || '（暂无）'}

【对方刚刚评论/回复了你】
${params.userText}

【任务】
请写1条回复：
- 【语言强规则】只用「${langName}」输出
- 【翻译规则】如果不是中文，必须在后面加括号写简体中文翻译，格式：原文（中文翻译）
  例如：That's so cool!（太酷了！）
- 你认识对方，要基于你们的关系来回复
- 口语化、短（<=30字）
- 不要动作描写/旁白
- 只输出回复内容，不要加引号，不要换行`
      const text = await callLLM([{ role: 'user', content: prompt }], undefined, { maxTokens: 90, timeoutMs: 600000 })
      // 稍微延迟，像真人看到通知再回
      window.setTimeout(() => {
        addMomentComment(params.momentId, {
          authorId: params.friendId,
          authorName: params.friendName,
          content: text.trim(),
          replyToCommentId: params.replyToCommentId,
          replyToAuthorName: params.replyToAuthorName,
          timestamp: replyTimestamp,
        })
      }, 900 + Math.random() * 1800)
    } catch {
      // ignore
    }
  }

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (mins < 1) return '刚刚'
    if (mins < 60) return `${mins}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return new Date(timestamp).toLocaleDateString('zh-CN')
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* 封面区域 */}
      <div 
        className="relative bg-cover bg-center transition-[height] duration-100 ease-out"
        style={{ height: `${Math.max(140, 256 - coverShrink)}px`, backgroundImage: userSettings.momentsBackground ? `url(${userSettings.momentsBackground})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
        onClick={() => coverInputRef.current?.click()}
      >
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleChangeCover}
        />
        
        {/* 左上角返回 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onBack()
          }}
          onTouchEnd={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onBack()
          }}
          className="absolute top-2 left-3 flex items-center gap-0.5 text-white drop-shadow-lg z-10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-[13px] font-medium">返回</span>
        </button>
        
        {/* 用户信息 */}
        <div className="absolute bottom-4 right-4 flex items-center gap-3">
          <span className="text-white font-semibold text-lg drop-shadow-lg">
            {currentPersona?.name || '我'}
          </span>
          <div className="w-16 h-16 rounded-lg overflow-hidden border-2 border-white shadow-lg">
            {currentPersona?.avatar ? (
              <img src={currentPersona.avatar} alt="头像" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-2xl text-white">
                {(currentPersona?.name || '我')[0]}
              </div>
            )}
          </div>
        </div>

        {/* 发布按钮 */}
        <div className="absolute top-2 right-3 flex items-center gap-2">
          {/* 刷新 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (!refreshing) setRefreshWarnOpen(true)
            }}
            className="w-8 h-8 rounded-full bg-black/30 backdrop-blur flex items-center justify-center text-white"
            title="刷新"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 8a8 8 0 00-14.828-3M4 16a8 8 0 0014.828 3" />
            </svg>
          </button>
          {/* 发布 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setShowPostModal(true)
            }}
            className="w-8 h-8 rounded-full bg-black/30 backdrop-blur flex items-center justify-center text-white"
            title="发布"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 动态列表 */}
      <div
        className="flex-1 overflow-y-auto bg-transparent"
        onScroll={(e) => {
          const top = (e.currentTarget as HTMLDivElement).scrollTop
          // 增大收缩力度：滚动距离乘以2.5倍，最大收缩到116px（从256到140）
          setCoverShrink(Math.min(116, Math.max(0, top * 2.5)))
        }}
      >
        {moments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 text-sm">
            <span>暂无动态</span>
            <span className="text-xs mt-1">点击右上角相机发布第一条朋友圈</span>
          </div>
        ) : (
          [...moments].sort((a, b) => b.timestamp - a.timestamp).map(moment => (
            <div key={moment.id} className="px-4 py-4 border-b border-gray-100">
              <div className="flex gap-3">
                {/* 头像 */}
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                  {moment.authorAvatar ? (
                    <img src={moment.authorAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center text-lg text-white">
                      {moment.authorName[0]}
                    </div>
                  )}
                </div>
                
                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-[#576B95]">{moment.authorName}</div>
                    {/* 翻译按钮 - 只在有中文翻译时显示 */}
                    {moment.contentZh && (
                      <button
                        type="button"
                        onClick={() => {
                          setTranslatedMoments(prev => {
                            const next = new Set(prev)
                            if (next.has(moment.id)) {
                              next.delete(moment.id)
                            } else {
                              next.add(moment.id)
                            }
                            return next
                          })
                        }}
                        className="text-[10px] text-[#576B95] px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200"
                      >
                        {translatedMoments.has(moment.id) ? '原文' : '翻译'}
                      </button>
                    )}
                  </div>
                  {moment.content && (
                    <div className="text-[#000] text-sm mt-1 whitespace-pre-wrap">
                      {translatedMoments.has(moment.id) && moment.contentZh ? moment.contentZh : moment.content}
                    </div>
                  )}
                  
                  {/* 图片 */}
                  {moment.images.length > 0 && (
                    <div className={`mt-2 grid gap-1 ${moment.images.length === 1 ? 'grid-cols-1 w-48' : moment.images.length <= 4 ? 'grid-cols-2 w-40' : 'grid-cols-3 w-52'}`}>
                      {moment.images.map((img, i) => (
                        <img key={i} src={img} alt="" className="w-full aspect-square object-cover rounded" />
                      ))}
                    </div>
                  )}
                  
                  {/* 底部操作 */}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">{formatTime(moment.timestamp)}</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => likeMoment(moment.id, 'user')}
                        className="text-gray-400 text-sm flex items-center gap-1"
                      >
                        <span>{moment.likes.includes('user') ? '❤️' : '🤍'}</span>
                        {moment.likes.length > 0 && <span>{moment.likes.length}</span>}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteId(moment.id)
                        }}
                        className="text-gray-400 text-xs"
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  {/* 点赞/评论展示 */}
                  {(moment.likes.length > 0 || moment.comments.length > 0) && (
                    <div className="mt-2 rounded bg-gray-50 px-3 py-2 text-xs text-gray-700">
                      {moment.likes.length > 0 && (
                        <div className="mb-1 text-gray-600">
                          赞：{moment.likes.map(id => id === 'user' ? (currentPersona?.name || '我') : id).join('、')}
                        </div>
                      )}
                      {moment.comments.length > 0 && (
                        <div className="space-y-1 max-h-[200px] overflow-y-auto">
                          {moment.comments.map(c => (
                            <div
                              key={c.id}
                              className="flex items-start gap-1"
                            >
                              <div
                                className="flex-1 cursor-pointer active:opacity-70"
                                onClick={() => setReplyTarget({ momentId: moment.id, commentId: c.id, authorId: c.authorId, authorName: c.authorName })}
                                title="点击回复"
                              >
                                <span className="text-[#576B95]">{c.authorName}</span>
                                {c.replyToAuthorName && (
                                  <span className="text-gray-500"> 回复 </span>
                                )}
                                {c.replyToAuthorName && (
                                  <span className="text-[#576B95]">{c.replyToAuthorName}</span>
                                )}
                                ：{c.content}
                              </div>
                              <button
                                type="button"
                                onClick={() => deleteMomentComment(moment.id, c.id)}
                                className="text-[10px] text-red-400 active:text-red-500 flex-shrink-0 px-1"
                              >
                                删除
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 评论输入 */}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={commentDraftByMoment[moment.id] || ''}
                      onChange={(e) => setCommentDraftByMoment(prev => ({ ...prev, [moment.id]: e.target.value }))}
                      placeholder="评论…"
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-full bg-gray-100 text-[#000] text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const text = (commentDraftByMoment[moment.id] || '').trim()
                        if (!text) return
                        const newC = addMomentComment(moment.id, {
                          authorId: 'user',
                          authorName: displayNameById['user'] || '我',
                          content: text,
                        })
                        setCommentDraftByMoment(prev => ({ ...prev, [moment.id]: '' }))
                        // 如果我评论的是好友动态，让好友有概率回复我
                        if (moment.authorId !== 'user') {
                          const friend = characters.find(c => c.id === moment.authorId)
                          if (friend) {
                            maybeAutoReplyToUserComment({
                              momentId: moment.id,
                              friendId: friend.id,
                              friendName: friend.name,
                              friendPrompt: friend.prompt,
                              userText: text,
                              replyToCommentId: newC.id,
                              replyToAuthorName: displayNameById['user'] || '我',
                            })
                          }
                        }
                      }}
                      className="px-3 py-1.5 rounded-full bg-[#07C160] text-white text-xs font-medium"
                    >
                      发送
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 发布弹窗 */}
      {showPostModal && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <button type="button" onClick={() => setShowPostModal(false)} className="text-gray-500">
              取消
            </button>
            <span className="font-semibold text-[#000]">发表图文</span>
            <button 
              type="button" 
              onClick={handlePost}
              className="text-[#07C160] font-medium"
              disabled={!postContent.trim() && postImages.length === 0}
            >
              发表
            </button>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto">
            <textarea
              placeholder="这一刻的想法..."
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              className="w-full h-32 resize-none outline-none text-[#000]"
            />
            
            {/* 图片预览 */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              {postImages.map((img, i) => (
                <div key={i} className="relative aspect-square">
                  <img src={img} alt="" className="w-full h-full object-cover rounded" />
                  <button
                    type="button"
                    onClick={() => setPostImages(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-black/60 rounded-full text-white text-xs flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
              {postImages.length < 9 && (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="aspect-square bg-gray-100 rounded flex items-center justify-center text-gray-400 text-2xl"
                >
                  +
                </button>
              )}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddImages}
            />
          </div>
        </div>
      )}

      <WeChatDialog
        open={!!deleteId}
        title="删除这条动态？"
        message="删除后无法恢复哦～"
        confirmText="删除"
        cancelText="取消"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteMoment(deleteId)
          setDeleteId(null)
        }}
      />

      <WeChatDialog
        open={dialog.open}
        title={dialog.title}
        message={dialog.message}
        confirmText="知道了"
        onConfirm={() => setDialog({ open: false })}
      />

      <WeChatDialog
        open={refreshWarnOpen || refreshing}
        title={refreshing ? "正在生成中…" : "提示"}
        message={refreshing ? "请稍候，AI 正在生成朋友圈内容，请勿退出此页面。" : "本次将消耗 API 调用，生成中请勿退出浏览器或此界面。"}
        confirmText={refreshing ? undefined : "继续生成"}
        cancelText={refreshing ? undefined : "取消"}
        onCancel={refreshing ? undefined : () => setRefreshWarnOpen(false)}
        onConfirm={refreshing ? undefined : () => {
          // 不要在这里关闭 refreshWarnOpen，让弹窗靠 refreshing 状态来控制
          // 这样可以避免弹窗在 setRefreshing(true) 生效前短暂消失
          handleRefresh()
        }}
      />

      {/* 回复评论弹窗 - 带输入框 */}
      {replyTarget && (
        <div className="absolute inset-0 z-50 flex items-end justify-center">
          <div 
            className="absolute inset-0 bg-black/40" 
            onClick={() => {
              setReplyTarget(null)
              setReplyInputText('')
            }} 
            role="presentation" 
          />
          <div className="relative w-full bg-white rounded-t-2xl p-4 animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">
                回复 <span className="text-[#576B95]">@{replyTarget.authorName}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setReplyTarget(null)
                  setReplyInputText('')
                }}
                className="text-gray-400 text-sm"
              >
                取消
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={replyInputText}
                onChange={(e) => setReplyInputText(e.target.value)}
                placeholder={`回复 ${replyTarget.authorName}...`}
                autoFocus
                className="flex-1 px-4 py-2.5 rounded-full bg-gray-100 text-[#000] text-sm outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && replyInputText.trim()) {
                    e.preventDefault()
                    const text = replyInputText.trim()
                    const newC = addMomentComment(replyTarget.momentId, {
                      authorId: 'user',
                      authorName: displayNameById['user'] || '我',
                      content: text,
                      replyToCommentId: replyTarget.commentId,
                      replyToAuthorName: replyTarget.authorName,
                    })
                    // 让被回复的人（如果是好友）有概率再回我一句（楼中楼）
                    const friend = characters.find(c => c.id === replyTarget.authorId)
                    if (friend) {
                      maybeAutoReplyToUserComment({
                        momentId: replyTarget.momentId,
                        friendId: friend.id,
                        friendName: friend.name,
                        friendPrompt: friend.prompt,
                        userText: text,
                        replyToCommentId: newC.id,
                        replyToAuthorName: displayNameById['user'] || '我',
                      })
                    }
                    setReplyTarget(null)
                    setReplyInputText('')
                  }
                }}
              />
              <button
                type="button"
                disabled={!replyInputText.trim()}
                onClick={() => {
                  const text = replyInputText.trim()
                  if (!text) return
                  const newC = addMomentComment(replyTarget.momentId, {
                    authorId: 'user',
                    authorName: displayNameById['user'] || '我',
                    content: text,
                    replyToCommentId: replyTarget.commentId,
                    replyToAuthorName: replyTarget.authorName,
                  })
                  // 让被回复的人（如果是好友）有概率再回我一句（楼中楼）
                  const friend = characters.find(c => c.id === replyTarget.authorId)
                  if (friend) {
                    maybeAutoReplyToUserComment({
                      momentId: replyTarget.momentId,
                      friendId: friend.id,
                      friendName: friend.name,
                      friendPrompt: friend.prompt,
                      userText: text,
                      replyToCommentId: newC.id,
                      replyToAuthorName: displayNameById['user'] || '我',
                    })
                  }
                  setReplyTarget(null)
                  setReplyInputText('')
                }}
                className="px-4 py-2.5 rounded-full bg-[#07C160] text-white text-sm font-medium disabled:opacity-50"
              >
                发送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
