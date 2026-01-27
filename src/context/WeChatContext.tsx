import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type PropsWithChildren,
} from 'react'
import { kvGetJSONDeep, kvSetJSON, kvGet, kvSet, kvRemove } from '../storage/kv'

// ==================== 类型定义 ====================

// 用户人设（可以有多个）
export type UserPersona = {
  id: string
  name: string
  avatar: string
  description: string
  createdAt: number
}

// 气泡样式设置
export type BubbleStyle = {
  bgColor: string // 背景颜色
  bgOpacity: number // 背景透明度 0-100
  borderColor: string // 边框颜色
  borderOpacity: number // 边框透明度 0-100
  presetId?: string // 质感预设编号（01~12）
  textColor?: string // 文字颜色（避免和背景撞色）
}

// 角色信息
export type CharacterLanguage = 'zh' | 'en' | 'ru' | 'fr' | 'ja' | 'ko' | 'de'

export type WeChatCharacter = {
  id: string
  name: string
  avatar: string
  gender: 'male' | 'female' | 'other'
  prompt: string
  birthday: string
  callMeName: string
  relationship: string
  country: string // 国家/地区（用于人设补充）
  language: CharacterLanguage // 角色主要聊天语言（用于强制输出语言 + 翻译）
  chatTranslationEnabled: boolean // 仅聊天对话框：是否自动翻译为中文（非中文语言时可用）
  coupleSpaceEnabled: boolean
  coupleStartedAt: number | null // 情侣空间开通/在一起开始时间（用于“在一起xx天”）
  chatBackground: string
  createdAt: number
  isSpecialCare: boolean // 特别关心
  isPinned: boolean // 置顶
  isHiddenFromChat: boolean // 从消息列表隐藏（删除聊天但不删人）
  selectedUserPersonaId: string | null // 该角色使用的我的人设ID
  unreadCount: number // 未读消息数
  autoReplyMode: boolean // true=自动回复（每条消息立即回复），false=手动回复（需要点击触发）
  isBlocked: boolean // 是否被拉黑
  blockedAt: number | null // 拉黑时间戳，用于判断哪些消息是拉黑后发的
  userBubbleStyle?: BubbleStyle // 用户气泡样式
  charBubbleStyle?: BubbleStyle // 角色气泡样式
  bubbleSyncEnabled?: boolean // 气泡样式双方同步（编辑时便捷开关）
  offlineMode: boolean // 线下模式（默认关闭）
  // 记忆功能
  memoryRounds: number // 每次回复附带的历史“回合”数量（按用户发言回合计）
  memorySummary: string // 长期记忆摘要（用户可编辑），每次回复必读
  memorySummaryUpdatedAt: number | null
  // 时间同步
  timeSyncEnabled: boolean // 是否与本机时间同步
  manualTime: string // 手动时间（ISO字符串），timeSyncEnabled=false 时生效
  // 正在输入（用于离开聊天仍能显示“正在输入中…”）
  isTyping: boolean
  typingUpdatedAt: number | null
  // X 账号绑定（用于稳定关联虚拟人物）
  xHandle?: string // 角色在 X 的唯一 handle（@xxx）
  xAliases?: string[] // 角色在 X 的别名/关键词
  // 角色钱包（虚拟财富，防止通货膨胀）
  walletBalance?: number // 角色钱包余额
  walletInitialized?: boolean // 是否已根据人设初始化钱包
  // 语音配置
  voiceEnabled?: boolean // 是否启用语音（该角色）
  voiceId?: string // 使用的音色ID
  voiceFrequency?: 'always' | 'often' | 'sometimes' | 'rarely' // 发语音频率
  // 拍一拍功能
  patEnabled?: boolean // 是否启用拍一拍（默认true）
  patMeText?: string // 对方拍我时显示的内容（如"拍了拍我的小脑袋"）
  patThemText?: string // 我拍对方时显示的内容（如"拍了拍TA的肩膀"）
}

// 聊天消息
export type WeChatMessage = {
  id: string
  characterId: string
  content: string
  isUser: boolean
  timestamp: number
  type: 'text' | 'image' | 'sticker' | 'transfer' | 'music' | 'diary' | 'tweet_share' | 'x_profile_share' | 'couple' | 'period' | 'system' | 'doudizhu_share' | 'doudizhu_invite' | 'location' | 'location_request' | 'voice' | 'pat' | 'fund_share' | 'chat_forward'
  // 群聊相关
  groupId?: string // 群ID（有值=群消息，无值=私聊）
  groupSenderId?: string // 群消息发送者（角色ID）
  replyToMessageId?: string // 引用的消息ID
  // 转账相关
  transferAmount?: number
  transferNote?: string
  transferStatus?: 'pending' | 'received' | 'refunded' | 'processed' // 转账状态：待处理/已收款/已退还/已处理（防止重复）
  transferId?: string // 转账消息ID，用于关联
  // 音乐分享相关
  musicTitle?: string
  musicArtist?: string
  musicStatus?: 'pending' | 'accepted' | 'rejected' | 'closed' // 音乐邀请状态
  // 日记分享相关（以“文件卡片”形式显示，但内部可携带全文供AI理解）
  diaryAuthorId?: string
  diaryAuthorName?: string
  diaryAt?: number
  diaryTitle?: string
  diaryExcerpt?: string
  diaryContent?: string
  diaryNote?: string

  // 推文分享（卡片展示短，内部可携带全文供 AI 读取）
  tweetId?: string
  tweetAuthorName?: string
  tweetAt?: number
  tweetExcerpt?: string
  tweetContent?: string
  tweetStats?: string

  // 推特主页分享
  xUserId?: string
  xUserName?: string
  xUserHandle?: string
  xUserAvatar?: string

  // 经期分享相关（卡片展示简短，内部可携带完整内容供AI读取）
  periodSummary?: string
  periodContent?: string

  // 情侣空间申请/结果卡片（“像转账一样”的小窗口）
  coupleAction?: 'request' | 'response'
  coupleStatus?: 'pending' | 'accepted' | 'rejected'
  coupleTitle?: string
  coupleHint?: string

  // 自动翻译（用于“微信翻译”样式展示）
  translatedZh?: string
  translationStatus?: 'pending' | 'done' | 'error'
  messageLanguage?: CharacterLanguage
  chatTranslationEnabledAtSend?: boolean

  // 位置共享相关
  locationName?: string // 位置名称（如"星巴克咖啡"）
  locationAddress?: string // 详细地址（如"樱花街88号"）
  locationCity?: string // 城市名（虚拟）
  locationCountry?: string // 国家/地区
  locationRequestStatus?: 'pending' | 'shared' | 'declined' // 索要位置的状态
  
  // 语音消息相关
  voiceText?: string // 语音对应的文字（用于显示"转文字"，翻译模式下为中文）
  voiceOriginalText?: string // 语音原文（用于TTS朗读，非中文语言时存储原文）
  voiceDuration?: number // 语音时长（秒）
  voiceUrl?: string // 语音文件URL（用于播放）
  
  // 消息引用相关
  replyTo?: {
    messageId: string // 被引用的消息ID
    content: string // 被引用的消息内容快照（防止原消息被编辑后引用失效）
    senderName: string // 被引用消息的发送者名称
  }
  
  // 拍一拍相关
  patText?: string // 拍一拍显示的文字（如"拍了拍我的小脑袋"）
  
  // 转发聊天记录相关
  forwardedMessages?: {
    senderName: string
    content: string
    timestamp: number
    type: 'text' | 'image' | 'sticker' | 'transfer' | 'voice'
    // 转账相关
    transferAmount?: number
    transferNote?: string
    // 语音相关
    voiceText?: string
    voiceDuration?: number
  }[]
  forwardedFrom?: string // 来源（私聊角色名 或 群聊名）
}

// 转账记录
export type TransferRecord = {
  id: string
  characterId: string
  amount: number
  note: string
  isIncome: boolean // true=收到，false=发出
  timestamp: number
}

// 群聊关系网项
export type GroupRelation = {
  id: string
  person1Id: string // 'user' 表示自己，否则是角色ID
  person2Id: string // 'user' 表示自己，否则是角色ID
  relationship: string // 关系描述（如"情侣"、"闺蜜"、"死对头"）
  story?: string // 故事设定
}

// 群聊
export type GroupChat = {
  id: string
  name: string
  avatar: string // 群头像（可以是自定义图片或空字符串）
  memberIds: string[] // 成员角色ID列表
  createdAt: number
  lastMessageAt: number
  // 群设置
  chatBackground?: string // 聊天背景
  offlineMode?: boolean // 离线模式（手动模式）
  memoryEnabled?: boolean // 记忆功能
  memorySummary?: string // 长期记忆摘要
  timeSyncEnabled?: boolean // 时间同步
  timeSyncType?: 'realtime' | 'custom' // 同步类型
  customTime?: string // 自定义时间（如 2024-01-01 12:00）
  patEnabled?: boolean // 拍一拍开关
  // 气泡设置（每个成员可以有不同气泡，用 memberId 做 key）
  bubbleSettings?: {
    user?: { bgColor?: string; bgOpacity?: number; borderColor?: string; borderOpacity?: number }
    [memberId: string]: { bgColor?: string; bgOpacity?: number; borderColor?: string; borderOpacity?: number } | undefined
  }
  // 关系网
  relations?: GroupRelation[]
}

// 纪念日
export type Anniversary = {
  id: string
  characterId: string
  title: string
  date: string // YYYY-MM-DD
  isAutoGenerated: boolean // 系统自动生成
  createdAt: number
}

// 经期记录
export type PeriodRecord = {
  id: string
  startDate: string // YYYY-MM-DD
  endDate?: string // YYYY-MM-DD
  notes: string
  symptoms: string[] // 症状标签
  // 每日记录（疼痛/血量等）
  daily?: PeriodDailyEntry[]
  createdAt: number
}

export type PeriodFlowLevel = 'none' | 'light' | 'medium' | 'heavy'
export type PeriodPainLevel = 0 | 1 | 2 | 3 | 4
export type PeriodDailyEntry = {
  date: string // YYYY-MM-DD
  pain: PeriodPainLevel
  flow: PeriodFlowLevel
  note?: string
  updatedAt: number
}

// 一起听状态
export type ListenTogetherState = {
  characterId: string
  songTitle: string
  songArtist: string
  startTime: number
} | null

// 钱包账单记录
export type WalletBill = {
  id: string
  type: 'transfer_in' | 'transfer_out' | 'shopping' | 'dice_init' | 'fund_buy' | 'fund_sell' // 转入/转出/购物/骰子初始化/基金买入/基金卖出
  amount: number
  description: string
  relatedCharacterId?: string // 相关角色ID（转账时）
  timestamp: number
}

// ==================== 基金系统 ====================

// 基金定义
export type Fund = {
  id: string
  name: string              // 基金名称
  code: string              // 基金代码
  type: 'stock' | 'bond' | 'hybrid' | 'index' | 'qdii' | 'money'  // 类型
  riskLevel: 1 | 2 | 3 | 4 | 5   // 风险等级
  currentPrice: number      // 当前净值
  previousPrice: number     // 上次净值
  historyPrices: number[]   // 历史净值（最近7次）
  lastUpdate: number        // 上次更新时间戳
  consecutiveDrops: number  // 连续下跌次数（用于假反弹）
}

// 用户基金持仓
export type FundHolding = {
  fundId: string
  shares: number            // 持有份额
  costPrice: number         // 成本净值（买入均价）
  totalCost: number         // 总投入成本（含手续费）
  buyTime: number           // 首次买入时间
}

// 预设基金列表
export const PRESET_FUNDS: Omit<Fund, 'currentPrice' | 'previousPrice' | 'historyPrices' | 'lastUpdate' | 'consecutiveDrops'>[] = [
  { id: 'fund_001', name: '稳健收益A', code: '001111', type: 'bond', riskLevel: 1 },
  { id: 'fund_002', name: '货币宝', code: '002222', type: 'money', riskLevel: 1 },
  { id: 'fund_003', name: '沪深300指数', code: '003333', type: 'index', riskLevel: 3 },
  { id: 'fund_004', name: '科技创新混合', code: '004444', type: 'hybrid', riskLevel: 3 },
  { id: 'fund_005', name: '新能源先锋', code: '005555', type: 'stock', riskLevel: 4 },
  { id: 'fund_006', name: '医药健康精选', code: '006666', type: 'stock', riskLevel: 4 },
  { id: 'fund_007', name: '消费升级主题', code: '007777', type: 'stock', riskLevel: 4 },
  { id: 'fund_008', name: '纳斯达克100', code: '008888', type: 'qdii', riskLevel: 5 },
]

// 基金手续费率
export const FUND_FEE_RATE = 0.015 // 1.5%

// 表情包配置
export type StickerConfig = {
  id: string
  characterId: string // 'all' 表示所有角色
  imageUrl: string
  keyword: string
  category?: string // 情绪分类：开心、难过、生气、害羞、撒娇等
}

// 表情包分类
export type StickerCategory = {
  id: string
  name: string // 分类名称：开心、难过、哭、撒娇等
  createdAt: number
}

// 收藏的日记（跨角色）
export type FavoriteDiary = {
  id: string
  characterId: string
  characterName: string
  createdAt: number // 收藏时间
  diaryAt: number // 日记“写下”的时间
  title: string // 展示标题（例如：YYYY-MM-DD 的日记）
  content: string // 日记全文
  note?: string // 收藏备注（可选）
}

// 我的日记
export type MyDiary = {
  id: string
  date: string // YYYY-MM-DD 格式
  title: string // 日记标题
  content: string // 日记内容
  mood?: string // 心情标签（可选）
  weather?: string // 天气（可选）
  createdAt: number // 创建时间
  updatedAt: number // 最后更新时间
}

// 朋友圈动态
export type MomentPost = {
  id: string
  authorId: string
  authorName: string
  authorAvatar: string
  content: string
  images: string[]
  timestamp: number
  likes: string[]
  comments: MomentComment[]
}

export type MomentComment = {
  id: string
  authorId: string
  authorName: string
  content: string
  timestamp: number
  // 评论回复：可对评论进行回复
  replyToCommentId?: string
  replyToAuthorName?: string
}

// 用户设置
export type WeChatUserSettings = {
  currentPersonaId: string | null // 当前使用的人设ID
  chatListBackground: string
  momentsBackground: string
}

// ==================== Context ====================

type AddCharacterInput = Omit<
  WeChatCharacter,
  | 'id'
  | 'createdAt'
  | 'isSpecialCare'
  | 'isPinned'
  | 'isHiddenFromChat'
  | 'selectedUserPersonaId'
  | 'autoReplyMode'
  | 'isBlocked'
  | 'blockedAt'
  | 'offlineMode'
  | 'unreadCount'
  | 'bubbleSyncEnabled'
  | 'memoryRounds'
  | 'memorySummary'
  | 'memorySummaryUpdatedAt'
  | 'timeSyncEnabled'
  | 'manualTime'
  | 'isTyping'
  | 'typingUpdatedAt'
  | 'coupleStartedAt'
  | 'country'
  | 'language'
  | 'chatTranslationEnabled'
  | 'xHandle'
  | 'xAliases'
> & Partial<Pick<
  WeChatCharacter,
  | 'unreadCount'
  | 'bubbleSyncEnabled'
  | 'memoryRounds'
  | 'memorySummary'
  | 'memorySummaryUpdatedAt'
  | 'timeSyncEnabled'
  | 'manualTime'
  | 'isTyping'
  | 'typingUpdatedAt'
  | 'country'
  | 'language'
  | 'chatTranslationEnabled'
  | 'xHandle'
  | 'xAliases'
>>

type WeChatContextValue = {
  isHydrated: boolean
  // 数据
  characters: WeChatCharacter[]
  messages: WeChatMessage[]
  stickers: StickerConfig[]
  favoriteDiaries: FavoriteDiary[]
  moments: MomentPost[]
  userSettings: WeChatUserSettings
  userPersonas: UserPersona[] // 多个人设
  transfers: TransferRecord[]
  anniversaries: Anniversary[]
  periods: PeriodRecord[]
  listenTogether: ListenTogetherState
  
  // 角色操作
  addCharacter: (character: AddCharacterInput) => WeChatCharacter
  updateCharacter: (id: string, updates: Partial<WeChatCharacter>) => void
  deleteCharacter: (id: string) => void
  getCharacter: (id: string) => WeChatCharacter | undefined
  togglePinned: (id: string) => void
  toggleSpecialCare: (id: string) => void
  toggleBlocked: (id: string) => void
  hideFromChat: (id: string) => void
  showInChat: (id: string) => void
  setCurrentChatId: (id: string | null) => void
  setCharacterTyping: (characterId: string, isTyping: boolean) => void
  
  // 消息操作
  addMessage: (message: Omit<WeChatMessage, 'id' | 'timestamp'>) => WeChatMessage
  updateMessage: (id: string, updates: Partial<WeChatMessage>) => void
  deleteMessage: (id: string) => void
  deleteMessagesByIds: (ids: string[]) => void
  deleteMessagesAfter: (characterId: string, messageId: string) => void
  getMessagesByCharacter: (characterId: string) => WeChatMessage[]
  getMessagesPage: (characterId: string, opts?: { limit?: number; beforeTimestamp?: number }) => WeChatMessage[]
  getLastMessage: (characterId: string) => WeChatMessage | undefined
  clearMessages: (characterId: string) => void
  
  // 表情包操作
  addSticker: (sticker: Omit<StickerConfig, 'id'>) => void
  removeSticker: (id: string) => void
  getStickersByCharacter: (characterId: string) => StickerConfig[]
  addStickerToCharacter: (stickerId: string, targetCharacterId: string) => void
  addStickerToAll: (sticker: Omit<StickerConfig, 'id' | 'characterId'>) => void
  // 表情包分类
  stickerCategories: StickerCategory[]
  addStickerCategory: (name: string) => StickerCategory
  removeStickerCategory: (id: string) => void
  getStickersByCategory: (categoryName: string) => StickerConfig[]

  // 日记收藏
  addFavoriteDiary: (diary: Omit<FavoriteDiary, 'id' | 'createdAt'>) => FavoriteDiary
  removeFavoriteDiary: (id: string) => void
  isDiaryFavorited: (characterId: string, diaryAt: number, content: string) => boolean

  // 我的日记
  myDiaries: MyDiary[]
  addMyDiary: (diary: Omit<MyDiary, 'id' | 'createdAt' | 'updatedAt'>) => MyDiary
  updateMyDiary: (id: string, updates: Partial<Omit<MyDiary, 'id' | 'createdAt'>>) => void
  deleteMyDiary: (id: string) => void
  getMyDiaryByDate: (date: string) => MyDiary | undefined
  
  // 朋友圈操作
  addMoment: (moment: Omit<MomentPost, 'id' | 'timestamp' | 'likes' | 'comments'> & { timestamp?: number }) => MomentPost
  deleteMoment: (id: string) => void
  likeMoment: (momentId: string, userId: string) => void
  addMomentComment: (momentId: string, comment: Omit<MomentComment, 'id' | 'timestamp'> & { timestamp?: number }) => MomentComment
  
  // 用户设置
  updateUserSettings: (settings: Partial<WeChatUserSettings>) => void
  
  // 用户人设操作
  addUserPersona: (persona: Omit<UserPersona, 'id' | 'createdAt'>) => UserPersona
  updateUserPersona: (id: string, updates: Partial<UserPersona>) => void
  deleteUserPersona: (id: string) => void
  getUserPersona: (id: string) => UserPersona | undefined
  getCurrentPersona: () => UserPersona | undefined
  
  // 转账操作
  addTransfer: (transfer: Omit<TransferRecord, 'id' | 'timestamp'>) => void
  getTransfersByCharacter: (characterId: string) => TransferRecord[]
  
  // 纪念日操作
  addAnniversary: (anniversary: Omit<Anniversary, 'id' | 'createdAt'>) => void
  removeAnniversary: (id: string) => void
  getAnniversariesByCharacter: (characterId: string) => Anniversary[]
  
  // 经期记录操作
  addPeriodRecord: (record: Omit<PeriodRecord, 'id' | 'createdAt'>) => void
  updatePeriodRecord: (id: string, updates: Partial<PeriodRecord>) => void
  removePeriodRecord: (id: string) => void
  getPeriodRecords: () => PeriodRecord[]
  getCurrentPeriod: () => PeriodRecord | undefined
  
  // 一起听操作
  startListenTogether: (characterId: string, songTitle: string, songArtist: string) => void
  updateListenTogetherSong: (songTitle: string, songArtist: string) => void
  stopListenTogether: () => void
  
  // 钱包操作
  walletBalance: number
  walletInitialized: boolean
  walletBills: WalletBill[]
  initializeWallet: (diceResult: number) => void // 骰子初始化钱包
  addWalletBill: (bill: Omit<WalletBill, 'id' | 'timestamp'>) => void
  updateWalletBalance: (amount: number) => void // 正数增加，负数减少
  
  // 基金操作
  funds: Fund[]
  fundHoldings: FundHolding[]
  refreshFunds: () => boolean // 刷新基金价格，返回是否成功（10分钟内不能刷新）
  getNextRefreshTime: () => number // 获取下次可刷新时间
  buyFund: (fundId: string, amount: number) => { success: boolean; message: string; shares?: number }
  sellFund: (fundId: string, shares: number) => { success: boolean; message: string; amount?: number }
  getFundHolding: (fundId: string) => FundHolding | undefined
  getTotalFundValue: () => number // 获取基金总市值
  
  // 群聊操作
  groups: GroupChat[]
  createGroup: (memberIds: string[], name?: string) => GroupChat
  updateGroup: (id: string, updates: Partial<GroupChat>) => void
  deleteGroup: (id: string) => void
  getGroup: (id: string) => GroupChat | undefined
  addGroupMember: (groupId: string, memberId: string) => void
  removeGroupMember: (groupId: string, memberId: string) => void
  getGroupMessages: (groupId: string) => WeChatMessage[]
  
}

const WeChatContext = createContext<WeChatContextValue | undefined>(undefined)

// LocalStorage keys
const STORAGE_KEYS = {
  characters: 'wechat_characters',
  messages: 'wechat_messages',
  stickers: 'wechat_stickers',
  stickerCategories: 'wechat_sticker_categories',
  favoriteDiaries: 'wechat_favorite_diaries',
  myDiaries: 'wechat_my_diaries',
  moments: 'wechat_moments',
  userSettings: 'wechat_user_settings',
  userPersonas: 'wechat_user_personas',
  transfers: 'wechat_transfers',
  anniversaries: 'wechat_anniversaries',
  periods: 'wechat_periods',
  listenTogether: 'wechat_listen_together',
  walletBalance: 'wechat_wallet_balance',
  walletInitialized: 'wechat_wallet_initialized',
  walletBills: 'wechat_wallet_bills',
  bubbleOpacityMode: 'wechat_bubble_opacity_mode',
  funds: 'wechat_funds',
  fundHoldings: 'wechat_fund_holdings',
  groups: 'wechat_groups', // 群聊
}

// 初始化基金列表（带随机初始价格）
function initializeFunds(): Fund[] {
  return PRESET_FUNDS.map(preset => {
    // 初始净值在0.8-1.5之间随机
    const initialPrice = 0.8 + Math.random() * 0.7
    return {
      ...preset,
      currentPrice: Number(initialPrice.toFixed(4)),
      previousPrice: Number(initialPrice.toFixed(4)),
      historyPrices: Array(7).fill(0).map(() => Number((initialPrice * (0.95 + Math.random() * 0.1)).toFixed(4))),
      lastUpdate: Date.now(),
      consecutiveDrops: 0,
    }
  })
}

// 刷新单只基金价格
function refreshFundPrice(fund: Fund): Fund {
  const riskVolatility: Record<number, [number, number, number, number]> = {
    // [涨幅下限, 涨幅上限, 跌幅下限, 跌幅上限] - 加大波动幅度
    1: [0.005, 0.02, 0.005, 0.03],     // 低风险：涨0.5%-2%，跌0.5%-3%
    2: [0.01, 0.04, 0.015, 0.06],      // 中低风险：涨1%-4%，跌1.5%-6%
    3: [0.02, 0.08, 0.03, 0.12],       // 中风险：涨2%-8%，跌3%-12%
    4: [0.03, 0.12, 0.05, 0.18],       // 中高风险：涨3%-12%，跌5%-18%
    5: [0.05, 0.20, 0.08, 0.25],       // 高风险：涨5%-20%，跌8%-25%
  }

  const [upMin, upMax, downMin, downMax] = riskVolatility[fund.riskLevel]
  
  // 基础概率：35%涨，65%跌
  let upChance = 0.35
  
  // 连续下跌后给个假反弹（诱多）
  if (fund.consecutiveDrops >= 4) {
    upChance = 0.75 // 连跌4次后，75%概率反弹
  } else if (fund.consecutiveDrops >= 2) {
    // 跌后更容易继续跌
    upChance = 0.25
  }
  
  const isUp = Math.random() < upChance
  const changeRate = isUp
    ? upMin + Math.random() * (upMax - upMin)
    : -(downMin + Math.random() * (downMax - downMin))
  
  const newPrice = Math.max(0.1, fund.currentPrice * (1 + changeRate))
  
  return {
    ...fund,
    previousPrice: fund.currentPrice,
    currentPrice: Number(newPrice.toFixed(4)),
    historyPrices: [...fund.historyPrices.slice(-6), fund.currentPrice],
    lastUpdate: Date.now(),
    consecutiveDrops: isUp ? 0 : fund.consecutiveDrops + 1,
  }
}

// 默认用户设置
const defaultUserSettings: WeChatUserSettings = {
  currentPersonaId: null,
  chatListBackground: '',
  momentsBackground: '',
}

// 兼容迁移：直接读取 localStorage 原始字符串（仅迁移时使用）

export function WeChatProvider({ children }: PropsWithChildren) {
  const [isHydrated, setIsHydrated] = useState(false)
  const [characters, setCharacters] = useState<WeChatCharacter[]>(() => 
    []
  )
  const [messages, setMessages] = useState<WeChatMessage[]>(() => 
    []
  )
  const [stickers, setStickers] = useState<StickerConfig[]>(() => 
    []
  )
  const [favoriteDiaries, setFavoriteDiaries] = useState<FavoriteDiary[]>(() =>
    []
  )
  const [myDiaries, setMyDiaries] = useState<MyDiary[]>(() =>
    []
  )
  const [stickerCategories, setStickerCategories] = useState<StickerCategory[]>(() => 
    []
  )
  const [moments, setMoments] = useState<MomentPost[]>(() => 
    []
  )
  const [userSettings, setUserSettings] = useState<WeChatUserSettings>(() => 
    defaultUserSettings
  )
  const [userPersonas, setUserPersonas] = useState<UserPersona[]>(() => 
    []
  )
  const [transfers, setTransfers] = useState<TransferRecord[]>(() => 
    []
  )
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>(() => 
    []
  )
  const [periods, setPeriods] = useState<PeriodRecord[]>(() => 
    []
  )
  const [listenTogether, setListenTogether] = useState<ListenTogetherState>(() => 
    null
  )
  const [currentChatId, setCurrentChatIdState] = useState<string | null>(null)
  const currentChatIdRef = useRef<string | null>(null)

  useEffect(() => {
    currentChatIdRef.current = currentChatId
  }, [currentChatId])

  // 兼容旧存档：补齐新增字段（只在首次挂载时跑一次）
  useEffect(() => {
    // 一次性迁移：把旧版“不透明度”语义转换为新版“透明度”语义（保持视觉不变）
    const opacityMode = (() => {
      try { return localStorage.getItem(STORAGE_KEYS.bubbleOpacityMode) } catch { return null }
    })()
    const shouldMigrateBubbleOpacity = opacityMode !== 'transparency'

    setCharacters(prev => prev.map(c => ({
      ...c,
      country: typeof (c as any).country === 'string' ? (c as any).country : '',
      language: (() => {
        const v = (c as any).language
        return v === 'zh' || v === 'en' || v === 'ru' || v === 'fr' || v === 'ja' || v === 'ko' || v === 'de'
          ? v
          : 'zh'
      })(),
      chatTranslationEnabled: typeof (c as any).chatTranslationEnabled === 'boolean'
        ? (c as any).chatTranslationEnabled
        : (((c as any).language && (c as any).language !== 'zh') ? true : false),
      offlineMode: c.offlineMode ?? false,
      bubbleSyncEnabled: typeof (c as any).bubbleSyncEnabled === 'boolean' ? (c as any).bubbleSyncEnabled : false,
      memoryRounds: typeof (c as any).memoryRounds === 'number' ? (c as any).memoryRounds : 100,
      memorySummary: typeof (c as any).memorySummary === 'string' ? (c as any).memorySummary : '',
      memorySummaryUpdatedAt: typeof (c as any).memorySummaryUpdatedAt === 'number' ? (c as any).memorySummaryUpdatedAt : null,
      timeSyncEnabled: typeof (c as any).timeSyncEnabled === 'boolean' ? (c as any).timeSyncEnabled : true,
      manualTime: typeof (c as any).manualTime === 'string' ? (c as any).manualTime : '',
      isTyping: typeof (c as any).isTyping === 'boolean' ? (c as any).isTyping : false,
      typingUpdatedAt: typeof (c as any).typingUpdatedAt === 'number' ? (c as any).typingUpdatedAt : null,
      coupleStartedAt: typeof (c as any).coupleStartedAt === 'number'
        ? (c as any).coupleStartedAt
        : (c.coupleSpaceEnabled ? (typeof c.createdAt === 'number' ? c.createdAt : Date.now()) : null),
      xHandle: typeof (c as any).xHandle === 'string' ? (c as any).xHandle : '',
      xAliases: Array.isArray((c as any).xAliases) ? (c as any).xAliases.filter((x: any) => typeof x === 'string') : [],
      patMeText: typeof (c as any).patMeText === 'string' ? (c as any).patMeText : '拍了拍我的小脑袋',
      patThemText: typeof (c as any).patThemText === 'string' ? (c as any).patThemText : '拍了拍TA的肩膀',
      userBubbleStyle: (() => {
        const s = (c as any).userBubbleStyle
        if (!s) return s
        if (!shouldMigrateBubbleOpacity) return s
        return {
          ...s,
          // 旧：opacity 0=透明 100=不透明；新：transparency 0=不透明 100=透明
          bgOpacity: typeof s.bgOpacity === 'number' ? (100 - s.bgOpacity) : s.bgOpacity,
          borderOpacity: typeof s.borderOpacity === 'number' ? (100 - s.borderOpacity) : s.borderOpacity,
        }
      })(),
      charBubbleStyle: (() => {
        const s = (c as any).charBubbleStyle
        if (!s) return s
        if (!shouldMigrateBubbleOpacity) return s
        return {
          ...s,
          bgOpacity: typeof s.bgOpacity === 'number' ? (100 - s.bgOpacity) : s.bgOpacity,
          borderOpacity: typeof s.borderOpacity === 'number' ? (100 - s.borderOpacity) : s.borderOpacity,
        }
      })(),
    })))
    if (shouldMigrateBubbleOpacity) {
      try { localStorage.setItem(STORAGE_KEYS.bubbleOpacityMode, 'transparency') } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  
  // 钱包状态
  const [walletBalance, setWalletBalance] = useState<number>(() => 0)
  const [walletInitialized, setWalletInitialized] = useState<boolean>(() => false)
  const [walletBills, setWalletBills] = useState<WalletBill[]>(() => [])
  
  // 基金状态
  const [funds, setFunds] = useState<Fund[]>(() => [])
  const [fundHoldings, setFundHoldings] = useState<FundHolding[]>(() => [])
  
  // 群聊状态
  const [groups, setGroups] = useState<GroupChat[]>(() => [])

  // 异步 Hydration：从 IndexedDB 加载；首次会从 localStorage 迁移（避免丢数据）
  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      try {
        // 检测是否在私密浏览模式（iOS Safari 私密模式下 IndexedDB 数据会丢失）
        const isPrivateMode = await (async () => {
          try {
            const testKey = '__private_test__'
            await kvSet(testKey, 'test')
            const result = await kvGet(testKey)
            await kvRemove(testKey)
            // 如果无法写入或读取，可能是私密模式
            return result !== 'test'
          } catch {
            return true
          }
        })()
        
        // 若 KV 中无数据但 localStorage 有旧数据：迁移一次
        const existing = await kvGet(STORAGE_KEYS.characters)
        if (!existing) {
          // 迁移 WeChat 相关 key（只复制我们自己维护的 keys）
          const toMove = Object.values(STORAGE_KEYS)
          await Promise.allSettled(
            toMove.map(async (k) => {
              try {
                const raw = localStorage.getItem(k)
                if (raw != null) {
                  await kvSet(k, raw)
                }
              } catch {
                // ignore
              }
            })
          )
        }
        
        // 检测数据异常丢失：如果 localStorage 有备份记录但 IndexedDB 是空的
        const backupCount = localStorage.getItem('wechat_characters_count_backup')
        const kvCharacters = await kvGet(STORAGE_KEYS.characters)
        let kvCharactersParsed: any[] = []
        try {
          kvCharactersParsed = kvCharacters ? JSON.parse(kvCharacters) : []
        } catch {
          console.error('[LittlePhone] 角色数据解析失败，可能已损坏')
        }
        
        if (backupCount && parseInt(backupCount) > 0 && (!kvCharactersParsed || kvCharactersParsed.length === 0)) {
          // 数据可能丢失了！显示警告
          console.warn('[LittlePhone] 检测到数据异常：localStorage 有备份但 IndexedDB 为空')
          console.warn('[LittlePhone] 可能原因：私密浏览模式、浏览器清除数据、存储空间被清理')
          console.warn('[LittlePhone] 私密模式检测:', isPrivateMode ? '是' : '否')
          
          // 尝试从 localStorage 备份恢复
          const backupChars = localStorage.getItem(STORAGE_KEYS.characters + '_backup')
          const backupMsgs = localStorage.getItem(STORAGE_KEYS.messages + '_backup')
          
          if (backupChars || backupMsgs) {
            console.warn('[LittlePhone] 发现 localStorage 备份，但备份数据不完整，无法自动恢复')
            // 显示用户提示
            setTimeout(() => {
              const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
              const privateWarning = isPrivateMode ? '\n\n⚠️ 检测到可能是私密浏览模式，私密模式下数据无法持久保存！' : ''
              alert(`⚠️ 数据异常提醒\n\n检测到您之前有 ${backupCount} 个角色，但当前数据为空。\n\n可能原因：\n• 使用了私密浏览模式\n• 浏览器清除了网站数据\n• ${isIOS ? 'iOS 自动清理了存储空间' : '存储空间被清理'}\n\n建议：\n• 定期使用「设置→导出数据」备份\n• 避免使用私密浏览模式${privateWarning}`)
            }, 1000)
          }
        }

      // 并行读取：减少启动等待（尤其消息/朋友圈数据较大时）
      const [
        nextCharacters,
        nextMessages,
        nextStickers,
        nextFavoriteDiaries,
        nextMyDiaries,
        nextStickerCategories,
        nextMoments,
        nextUserSettings,
        nextUserPersonas,
        nextTransfers,
        nextAnniversaries,
        nextPeriods,
        nextListenTogether,
        nextWalletBalance,
        nextWalletInitialized,
        nextWalletBills,
        nextFunds,
        nextFundHoldings,
        nextGroups,
      ] = await Promise.all([
        kvGetJSONDeep<WeChatCharacter[]>(STORAGE_KEYS.characters, []),
        kvGetJSONDeep<WeChatMessage[]>(STORAGE_KEYS.messages, []),
        kvGetJSONDeep<StickerConfig[]>(STORAGE_KEYS.stickers, []),
        kvGetJSONDeep<FavoriteDiary[]>(STORAGE_KEYS.favoriteDiaries, []),
        kvGetJSONDeep<MyDiary[]>(STORAGE_KEYS.myDiaries, []),
        kvGetJSONDeep<StickerCategory[]>(STORAGE_KEYS.stickerCategories, []),
        kvGetJSONDeep<MomentPost[]>(STORAGE_KEYS.moments, []),
        kvGetJSONDeep<WeChatUserSettings>(STORAGE_KEYS.userSettings, defaultUserSettings),
        kvGetJSONDeep<UserPersona[]>(STORAGE_KEYS.userPersonas, []),
        kvGetJSONDeep<TransferRecord[]>(STORAGE_KEYS.transfers, []),
        kvGetJSONDeep<Anniversary[]>(STORAGE_KEYS.anniversaries, []),
        kvGetJSONDeep<PeriodRecord[]>(STORAGE_KEYS.periods, []),
        kvGetJSONDeep<ListenTogetherState>(STORAGE_KEYS.listenTogether, null),
        kvGetJSONDeep<number>(STORAGE_KEYS.walletBalance, 0),
        kvGetJSONDeep<boolean>(STORAGE_KEYS.walletInitialized, false),
        kvGetJSONDeep<WalletBill[]>(STORAGE_KEYS.walletBills, []),
        kvGetJSONDeep<Fund[]>(STORAGE_KEYS.funds, []),
        kvGetJSONDeep<FundHolding[]>(STORAGE_KEYS.fundHoldings, []),
        kvGetJSONDeep<GroupChat[]>(STORAGE_KEYS.groups, []),
      ])

      if (cancelled) return
      // 防止重启后“正在输入中”卡死：启动时清空所有 typing
      const resetTyping = nextCharacters.map(c => ({
        ...c,
        isTyping: false,
        typingUpdatedAt: null,
      }))
      setCharacters(resetTyping)
      setMessages(nextMessages)
      setStickers(nextStickers)
      setFavoriteDiaries(nextFavoriteDiaries)
      setMyDiaries(nextMyDiaries)
      setStickerCategories(nextStickerCategories)
      setMoments(nextMoments)
      setUserSettings(nextUserSettings)
      setUserPersonas(nextUserPersonas)
      setTransfers(nextTransfers)
      setAnniversaries(nextAnniversaries)
      setPeriods(nextPeriods)
      setListenTogether(nextListenTogether)
      setWalletBalance(nextWalletBalance)
      setWalletInitialized(nextWalletInitialized)
      setWalletBills(nextWalletBills)
      // 基金：如果没有数据则初始化
      setFunds(nextFunds.length > 0 ? nextFunds : initializeFunds())
      setFundHoldings(nextFundHoldings)
      // 群聊
      setGroups(nextGroups)
      setIsHydrated(true)
      } catch (err) {
        // IndexedDB 读取失败（可能是数据库损坏）
        console.error('[LittlePhone] 数据加载失败:', err)
        // 仍然标记为已加载，避免白屏
        setIsHydrated(true)
        // 延迟提示用户
        setTimeout(() => {
          alert('⚠️ 数据加载异常\n\n数据库可能已损坏。\n\n建议：\n• 如果有备份文件，请使用「设置→导入数据」恢复\n• 清除浏览器数据后重新开始\n\n如果问题持续，请尝试更换浏览器。')
        }, 500)
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [])

  // 异步保存（IndexedDB）
  // 关键：必须等 hydration 完成后再开始自动保存，否则会把“初始空数组/默认值”写回 KV 覆盖导入数据
  const isImporting = () => !!(window as any).__LP_IMPORTING__
  const canPersist = () => isHydrated && !isImporting()
  // 角色和消息额外备份到 localStorage（防止 IndexedDB 被清除导致数据丢失）
  useEffect(() => {
    if (!canPersist()) return
    void kvSetJSON(STORAGE_KEYS.characters, characters)
    // 备份角色数量和精简数据到 localStorage
    if (characters.length > 0) {
      localStorage.setItem('wechat_characters_count_backup', String(characters.length))
      // 只备份核心字段，避免 localStorage 超限
      try {
        const slim = characters.map(c => ({ id: c.id, name: c.name, avatar: c.avatar?.slice(0, 100), prompt: c.prompt?.slice(0, 200) }))
        localStorage.setItem(STORAGE_KEYS.characters + '_backup', JSON.stringify(slim))
      } catch { /* ignore quota errors */ }
    }
  }, [characters, isHydrated])
  useEffect(() => {
    if (!canPersist()) return
    void kvSetJSON(STORAGE_KEYS.messages, messages)
    // 备份最近消息到 localStorage（只保留最近 200 条）
    if (messages.length > 0) {
      try {
        const recent = messages.slice(-200).map(m => ({ ...m, content: m.content?.slice(0, 500) }))
        localStorage.setItem(STORAGE_KEYS.messages + '_backup', JSON.stringify(recent))
      } catch { /* ignore quota errors */ }
    }
  }, [messages, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.stickers, stickers) }, [stickers, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.favoriteDiaries, favoriteDiaries) }, [favoriteDiaries, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.myDiaries, myDiaries) }, [myDiaries, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.stickerCategories, stickerCategories) }, [stickerCategories, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.moments, moments) }, [moments, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.userSettings, userSettings) }, [userSettings, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.userPersonas, userPersonas) }, [userPersonas, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.transfers, transfers) }, [transfers, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.anniversaries, anniversaries) }, [anniversaries, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.periods, periods) }, [periods, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.listenTogether, listenTogether) }, [listenTogether, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.walletBalance, walletBalance) }, [walletBalance, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.walletInitialized, walletInitialized) }, [walletInitialized, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.walletBills, walletBills) }, [walletBills, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.funds, funds) }, [funds, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.fundHoldings, fundHoldings) }, [fundHoldings, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.groups, groups) }, [groups, isHydrated])

  // 清理“卡住的正在输入中”状态（防止重启后一直显示）
  useEffect(() => {
    if (!isHydrated) return
    const interval = window.setInterval(() => {
      const now = Date.now()
      setCharacters(prev => {
        let changed = false
        const next = prev.map(c => {
          if (c.isTyping && c.typingUpdatedAt && now - c.typingUpdatedAt > 2 * 60 * 1000) {
            changed = true
            return { ...c, isTyping: false, typingUpdatedAt: null }
          }
          return c
        })
        return changed ? next : prev
      })
    }, 30000)
    return () => window.clearInterval(interval)
  }, [isHydrated])

  // 预计算：按角色分组的消息（避免在列表/聊天界面反复 filter+sort 导致手机端卡顿）
  const messagesByCharacter = useMemo(() => {
    const map: Record<string, WeChatMessage[]> = {}
    for (const m of messages) {
      const key = m.characterId
      if (!map[key]) map[key] = []
      map[key].push(m)
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.timestamp - b.timestamp)
    }
    return map
  }, [messages])

  const lastMessageByCharacter = useMemo(() => {
    const map: Record<string, WeChatMessage | undefined> = {}
    for (const [cid, list] of Object.entries(messagesByCharacter)) {
      map[cid] = list[list.length - 1]
    }
    return map
  }, [messagesByCharacter])

  // ==================== 角色操作 ====================
  
  const addCharacter = (character: AddCharacterInput): WeChatCharacter => {
    const newCharacter: WeChatCharacter = {
      ...character,
      id: `char_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
      isSpecialCare: false,
      isPinned: false,
      isHiddenFromChat: false,
      selectedUserPersonaId: null,
      country: character.country ?? '',
      language: character.language ?? 'zh',
      chatTranslationEnabled: character.chatTranslationEnabled ?? ((character.language ?? 'zh') !== 'zh'),
      unreadCount: character.unreadCount ?? 0,
      autoReplyMode: false, // 默认手动回复（由用户点击触发）
      isBlocked: false, // 默认未拉黑
      blockedAt: null, // 拉黑时间戳
      offlineMode: false, // 默认关闭线下模式
      bubbleSyncEnabled: character.bubbleSyncEnabled ?? false,
      memoryRounds: character.memoryRounds ?? 100,
      memorySummary: character.memorySummary ?? '',
      memorySummaryUpdatedAt: character.memorySummaryUpdatedAt ?? null,
      timeSyncEnabled: character.timeSyncEnabled ?? true,
      manualTime: character.manualTime ?? '',
      isTyping: character.isTyping ?? false,
      typingUpdatedAt: character.typingUpdatedAt ?? null,
      coupleStartedAt: character.coupleSpaceEnabled ? Date.now() : null,
      xHandle: character.xHandle ?? '',
      xAliases: Array.isArray(character.xAliases) ? character.xAliases : [],
      patMeText: character.patMeText ?? '拍了拍我的小脑袋',
      patThemText: character.patThemText ?? '拍了拍TA的肩膀',
    }
    setCharacters(prev => [...prev, newCharacter])
    return newCharacter
  }

  const updateCharacter = (id: string, updates: Partial<WeChatCharacter>) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }

  const deleteCharacter = (id: string) => {
    setCharacters(prev => prev.filter(c => c.id !== id))
    setMessages(prev => prev.filter(m => m.characterId !== id))
    setStickers(prev => prev.filter(s => s.characterId !== id && s.characterId !== 'all'))
    // 同步清理朋友圈数据：
    // - 删除该角色发布的动态
    // - 清理他在他人动态里的点赞/评论（含回复）
    setMoments(prev =>
      prev
        .filter(p => p.authorId !== id)
        .map(p => ({
          ...p,
          likes: p.likes.filter(uid => uid !== id),
          comments: p.comments.filter(c => c.authorId !== id),
        }))
    )
  }

  const getCharacter = (id: string) => characters.find(c => c.id === id)

  const togglePinned = (id: string) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c))
  }

  const toggleSpecialCare = (id: string) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, isSpecialCare: !c.isSpecialCare } : c))
  }

  const toggleBlocked = (id: string) => {
    setCharacters(prev => prev.map(c => {
      if (c.id !== id) return c
      const newBlocked = !c.isBlocked
      return {
        ...c,
        isBlocked: newBlocked,
        blockedAt: newBlocked ? Date.now() : null, // 拉黑时记录时间，解除拉黑时清空
      }
    }))
  }

  const hideFromChat = (id: string) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, isHiddenFromChat: true } : c))
  }

  const showInChat = (id: string) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, isHiddenFromChat: false } : c))
  }

  const setCharacterTyping = (characterId: string, isTyping: boolean) => {
    setCharacters(prev => prev.map(c => c.id === characterId ? { ...c, isTyping, typingUpdatedAt: Date.now() } : c))
  }

  // 用 useCallback 固定函数引用，避免 ChatScreen useEffect 依赖变化导致无限循环渲染
  const setCurrentChatId = useCallback((id: string | null) => {
    setCurrentChatIdState(id)
    currentChatIdRef.current = id
    if (id) {
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c))
    }
  }, [])

  // ==================== 消息操作 ====================

  const addMessage = (message: Omit<WeChatMessage, 'id' | 'timestamp'>): WeChatMessage => {
    const newMessage: WeChatMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    }
    setMessages(prev => [...prev, newMessage])
    // 发消息时自动显示在聊天列表
    showInChat(message.characterId)
    // 对方消息且不在当前聊天时，增加未读数
    if (!message.isUser && message.characterId !== currentChatIdRef.current) {
      setCharacters(prev => prev.map(c =>
        c.id === message.characterId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c
      ))
    }
    return newMessage
  }

  const updateMessage = (id: string, updates: Partial<WeChatMessage>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m))
  }

  const getMessagesByCharacter = useCallback((characterId: string) => {
    return messagesByCharacter[characterId] || []
  }, [messagesByCharacter])

  const getMessagesPage = useCallback(
    (characterId: string, opts?: { limit?: number; beforeTimestamp?: number }) => {
      const list = messagesByCharacter[characterId] || []
      const limit = Math.max(1, Math.min(200, opts?.limit ?? 15))
      const before = opts?.beforeTimestamp
      if (before == null) {
        return list.slice(Math.max(0, list.length - limit))
      }
      // 找到严格小于 before 的最后一个位置
      let hi = list.length
      let lo = 0
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (list[mid].timestamp < before) lo = mid + 1
        else hi = mid
      }
      const end = Math.max(0, lo) // lo 是第一个 >= before 的位置
      const start = Math.max(0, end - limit)
      return list.slice(start, end)
    },
    [messagesByCharacter]
  )

  const getLastMessage = useCallback((characterId: string) => {
    return lastMessageByCharacter[characterId]
  }, [lastMessageByCharacter])

  const clearMessages = (characterId: string) => {
    setMessages(prev => prev.filter(m => m.characterId !== characterId))
  }

  const deleteMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id))
  }

  const deleteMessagesByIds = (ids: string[]) => {
    if (!ids || ids.length === 0) return
    const set = new Set(ids)
    setMessages(prev => prev.filter(m => !set.has(m.id)))
  }

  const deleteMessagesAfter = (characterId: string, messageId: string) => {
    const charMessages = getMessagesByCharacter(characterId)
    const targetIndex = charMessages.findIndex(m => m.id === messageId)
    if (targetIndex === -1) return
    
    // 获取要删除的消息ID（目标消息之后的所有消息）
    const idsToDelete = charMessages.slice(targetIndex + 1).map(m => m.id)
    setMessages(prev => prev.filter(m => !idsToDelete.includes(m.id)))
  }

  // ==================== 表情包操作 ====================

  const addSticker = (sticker: Omit<StickerConfig, 'id'>) => {
    const newSticker: StickerConfig = {
      ...sticker,
      id: `sticker_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    }
    setStickers(prev => [...prev, newSticker])
  }

  const removeSticker = (id: string) => {
    setStickers(prev => prev.filter(s => s.id !== id))
  }

  const getStickersByCharacter = useCallback(
    (characterId: string) => stickers.filter(s => s.characterId === characterId || s.characterId === 'all'),
    [stickers]
  )

  const addStickerToCharacter = (stickerId: string, targetCharacterId: string) => {
    const sticker = stickers.find(s => s.id === stickerId)
    if (sticker) {
      addSticker({
        characterId: targetCharacterId,
        imageUrl: sticker.imageUrl,
        keyword: sticker.keyword,
        category: sticker.category,
      })
    }
  }

  const addStickerToAll = (sticker: Omit<StickerConfig, 'id' | 'characterId'>) => {
    addSticker({
      ...sticker,
      characterId: 'all',
    })
  }

  // 表情包分类操作
  const addStickerCategory = (name: string): StickerCategory => {
    const newCategory: StickerCategory = {
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name,
      createdAt: Date.now()
    }
    setStickerCategories(prev => [...prev, newCategory])
    return newCategory
  }

  const removeStickerCategory = (id: string) => {
    setStickerCategories(prev => prev.filter(c => c.id !== id))
    // 同时清除该分类下的所有表情包的分类标签
    setStickers(prev => prev.map(s => 
      s.category === stickerCategories.find(c => c.id === id)?.name 
        ? { ...s, category: undefined } 
        : s
    ))
  }

  const getStickersByCategory = (categoryName: string): StickerConfig[] => {
    return stickers.filter(s => s.category === categoryName)
  }

  // ==================== 日记收藏 ====================

  const addFavoriteDiary = (diary: Omit<FavoriteDiary, 'id' | 'createdAt'>): FavoriteDiary => {
    const newDiary: FavoriteDiary = {
      ...diary,
      id: `diary_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    }
    setFavoriteDiaries(prev => [newDiary, ...prev])
    return newDiary
  }

  const removeFavoriteDiary = (id: string) => {
    setFavoriteDiaries(prev => prev.filter(d => d.id !== id))
  }

  const isDiaryFavorited = (characterId: string, diaryAt: number, content: string) => {
    const key = `${characterId}|${diaryAt}|${(content || '').slice(0, 40)}`
    return favoriteDiaries.some(d => `${d.characterId}|${d.diaryAt}|${(d.content || '').slice(0, 40)}` === key)
  }

  // ==================== 我的日记操作 ====================

  const addMyDiary = (diary: Omit<MyDiary, 'id' | 'createdAt' | 'updatedAt'>): MyDiary => {
    const now = Date.now()
    const newDiary: MyDiary = {
      ...diary,
      id: `my_diary_${now}_${Math.random().toString(36).slice(2)}`,
      createdAt: now,
      updatedAt: now,
    }
    setMyDiaries(prev => [newDiary, ...prev])
    return newDiary
  }

  const updateMyDiary = (id: string, updates: Partial<Omit<MyDiary, 'id' | 'createdAt'>>) => {
    setMyDiaries(prev => prev.map(d =>
      d.id === id ? { ...d, ...updates, updatedAt: Date.now() } : d
    ))
  }

  const deleteMyDiary = (id: string) => {
    setMyDiaries(prev => prev.filter(d => d.id !== id))
  }

  const getMyDiaryByDate = (date: string): MyDiary | undefined => {
    return myDiaries.find(d => d.date === date)
  }

  // ==================== 朋友圈操作 ====================

  const addMoment = (moment: Omit<MomentPost, 'id' | 'timestamp' | 'likes' | 'comments'> & { timestamp?: number }): MomentPost => {
    const newMoment: MomentPost = {
      ...moment,
      id: `moment_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: moment.timestamp ?? Date.now(),
      likes: [],
      comments: [],
    }
    setMoments(prev => [newMoment, ...prev])
    return newMoment
  }

  const deleteMoment = (id: string) => {
    setMoments(prev => prev.filter(m => m.id !== id))
  }

  const likeMoment = (momentId: string, userId: string) => {
    setMoments(prev => prev.map(m => {
      if (m.id !== momentId) return m
      const hasLiked = m.likes.includes(userId)
      return { ...m, likes: hasLiked ? m.likes.filter(id => id !== userId) : [...m.likes, userId] }
    }))
  }

  const addMomentComment = (momentId: string, comment: Omit<MomentComment, 'id' | 'timestamp'> & { timestamp?: number }): MomentComment => {
    const newComment: MomentComment = {
      ...comment,
      id: `comment_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: comment.timestamp ?? Date.now(),
    }
    setMoments(prev => prev.map(m => 
      m.id === momentId ? { ...m, comments: [...m.comments, newComment] } : m
    ))
    return newComment
  }

  // ==================== 用户设置 ====================

  const updateUserSettings = (settings: Partial<WeChatUserSettings>) => {
    setUserSettings(prev => ({ ...prev, ...settings }))
  }

  // ==================== 用户人设操作 ====================

  const addUserPersona = (persona: Omit<UserPersona, 'id' | 'createdAt'>): UserPersona => {
    const newPersona: UserPersona = {
      ...persona,
      id: `persona_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    }
    setUserPersonas(prev => [...prev, newPersona])
    return newPersona
  }

  const updateUserPersona = (id: string, updates: Partial<UserPersona>) => {
    setUserPersonas(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  const deleteUserPersona = (id: string) => {
    setUserPersonas(prev => prev.filter(p => p.id !== id))
    // 如果删除的是当前使用的人设，清空
    if (userSettings.currentPersonaId === id) {
      updateUserSettings({ currentPersonaId: null })
    }
    // 清空使用该人设的角色设置
    setCharacters(prev => prev.map(c => 
      c.selectedUserPersonaId === id ? { ...c, selectedUserPersonaId: null } : c
    ))
  }

  const getUserPersona = (id: string) => userPersonas.find(p => p.id === id)

  const getCurrentPersona = () => {
    if (!userSettings.currentPersonaId) return undefined
    return getUserPersona(userSettings.currentPersonaId)
  }

  // ==================== 转账操作 ====================

  const addTransfer = (transfer: Omit<TransferRecord, 'id' | 'timestamp'>) => {
    const newTransfer: TransferRecord = {
      ...transfer,
      id: `transfer_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    }
    setTransfers(prev => [...prev, newTransfer])
  }

  const getTransfersByCharacter = (characterId: string) =>
    transfers.filter(t => t.characterId === characterId).sort((a, b) => b.timestamp - a.timestamp)

  // ==================== 纪念日操作 ====================

  const addAnniversary = (anniversary: Omit<Anniversary, 'id' | 'createdAt'>) => {
    const newAnniversary: Anniversary = {
      ...anniversary,
      id: `anniversary_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    }
    setAnniversaries(prev => [...prev, newAnniversary])
  }

  const removeAnniversary = (id: string) => {
    setAnniversaries(prev => prev.filter(a => a.id !== id))
  }

  const getAnniversariesByCharacter = (characterId: string) =>
    anniversaries.filter(a => a.characterId === characterId).sort((a, b) => {
      // 按日期排序，最近的在前
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })

  // ==================== 经期记录操作 ====================

  const addPeriodRecord = (record: Omit<PeriodRecord, 'id' | 'createdAt'>) => {
    const newRecord: PeriodRecord = {
      ...record,
      id: `period_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    }
    setPeriods(prev => [...prev, newRecord])
  }

  const updatePeriodRecord = (id: string, updates: Partial<PeriodRecord>) => {
    setPeriods(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  const removePeriodRecord = (id: string) => {
    setPeriods(prev => prev.filter(p => p.id !== id))
  }

  const getPeriodRecords = () =>
    periods.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())

  const getCurrentPeriod = () => {
    const today = new Date().toISOString().split('T')[0]
    return periods.find(p => {
      if (p.endDate) {
        return p.startDate <= today && p.endDate >= today
      }
      // 如果没有结束日期，检查是否在7天内
      const start = new Date(p.startDate)
      const diff = (new Date().getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      return diff >= 0 && diff <= 7
    })
  }

  // ==================== 一起听操作 ====================

  const startListenTogether = (characterId: string, songTitle: string, songArtist: string) => {
    setListenTogether({
      characterId,
      songTitle,
      songArtist,
      startTime: Date.now(),
    })
  }

  const updateListenTogetherSong = (songTitle: string, songArtist: string) => {
    setListenTogether(prev => {
      if (!prev) return prev
      return { ...prev, songTitle, songArtist }
    })
  }

  const stopListenTogether = () => {
    setListenTogether(null)
  }

  // ==================== 钱包操作 ====================
  
  const initializeWallet = (diceResult: number) => {
    // 骰子点数对应金额：1=100, 2=500, 3=1000, 4=2000, 5=5000, 6=10000
    const amounts = [100, 500, 1000, 2000, 5000, 10000]
    const amount = amounts[diceResult - 1] || 1000
    setWalletBalance(amount)
    setWalletInitialized(true)
    setWalletBills([{
      id: `bill_${Date.now()}`,
      type: 'dice_init',
      amount: amount,
      description: `掷骰子获得 ${amount} 元`,
      timestamp: Date.now()
    }])
  }
  
  const addWalletBill = (bill: Omit<WalletBill, 'id' | 'timestamp'>) => {
    setWalletBills(prev => [{
      ...bill,
      id: `bill_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now()
    }, ...prev])
  }
  
  const updateWalletBalance = (amount: number) => {
    setWalletBalance(prev => Math.max(0, prev + amount))
  }
  
  // ==================== 基金操作 ====================
  
  // 刷新所有基金价格（10分钟冷却）
  const refreshFunds = useCallback(() => {
    const now = Date.now()
    const minRefreshInterval = 10 * 60 * 1000 // 10分钟
    
    // 检查是否可以刷新（任意一只基金的lastUpdate超过10分钟即可）
    const canRefresh = funds.some(f => now - f.lastUpdate >= minRefreshInterval) || funds.length === 0
    if (!canRefresh) return false
    
    setFunds(prev => {
      if (prev.length === 0) return initializeFunds()
      return prev.map(fund => {
        if (now - fund.lastUpdate >= minRefreshInterval) {
          return refreshFundPrice(fund)
        }
        return fund
      })
    })
    return true
  }, [funds])
  
  // 获取下次可刷新时间
  const getNextRefreshTime = useCallback(() => {
    if (funds.length === 0) return 0
    const minRefreshInterval = 10 * 60 * 1000
    const oldestUpdate = Math.min(...funds.map(f => f.lastUpdate))
    return Math.max(0, oldestUpdate + minRefreshInterval - Date.now())
  }, [funds])
  
  // 买入基金
  const buyFund = useCallback((fundId: string, amount: number): { success: boolean; message: string; shares?: number } => {
    const fund = funds.find(f => f.id === fundId)
    if (!fund) return { success: false, message: '基金不存在' }
    if (amount <= 0) return { success: false, message: '请输入有效金额' }
    if (amount > walletBalance) return { success: false, message: '余额不足' }
    
    // 扣除手续费后的实际买入金额
    const actualAmount = amount * (1 - FUND_FEE_RATE)
    const shares = Number((actualAmount / fund.currentPrice).toFixed(2))
    
    if (shares <= 0) return { success: false, message: '买入金额太小' }
    
    // 更新钱包余额
    setWalletBalance(prev => prev - amount)
    
    // 添加账单
    addWalletBill({
      type: 'fund_buy',
      amount: amount,
      description: `买入${fund.name}，${shares}份，手续费${(amount * FUND_FEE_RATE).toFixed(2)}元`,
    })
    
    // 更新持仓
    setFundHoldings(prev => {
      const existing = prev.find(h => h.fundId === fundId)
      if (existing) {
        // 计算新的平均成本
        const totalShares = existing.shares + shares
        const totalCost = existing.totalCost + amount
        const newCostPrice = (existing.costPrice * existing.shares + fund.currentPrice * shares) / totalShares
        return prev.map(h => h.fundId === fundId ? {
          ...h,
          shares: Number(totalShares.toFixed(2)),
          costPrice: Number(newCostPrice.toFixed(4)),
          totalCost: totalCost,
        } : h)
      } else {
        return [...prev, {
          fundId,
          shares,
          costPrice: fund.currentPrice,
          totalCost: amount,
          buyTime: Date.now(),
        }]
      }
    })
    
    return { success: true, message: `成功买入${shares}份`, shares }
  }, [funds, walletBalance, addWalletBill])
  
  // 卖出基金
  const sellFund = useCallback((fundId: string, shares: number): { success: boolean; message: string; amount?: number } => {
    const fund = funds.find(f => f.id === fundId)
    if (!fund) return { success: false, message: '基金不存在' }
    
    const holding = fundHoldings.find(h => h.fundId === fundId)
    if (!holding || holding.shares <= 0) return { success: false, message: '没有持仓' }
    if (shares <= 0 || shares > holding.shares) return { success: false, message: '份额无效' }
    
    // 卖出金额（扣除手续费）
    const grossAmount = shares * fund.currentPrice
    const actualAmount = Number((grossAmount * (1 - FUND_FEE_RATE)).toFixed(2))
    
    // 增加钱包余额
    setWalletBalance(prev => prev + actualAmount)
    
    // 计算盈亏
    const costForShares = holding.costPrice * shares
    const profitLoss = actualAmount - costForShares
    const profitText = profitLoss >= 0 ? `盈利${profitLoss.toFixed(2)}` : `亏损${Math.abs(profitLoss).toFixed(2)}`
    
    // 添加账单
    addWalletBill({
      type: 'fund_sell',
      amount: actualAmount,
      description: `卖出${fund.name}，${shares}份，${profitText}，手续费${(grossAmount * FUND_FEE_RATE).toFixed(2)}元`,
    })
    
    // 更新持仓
    setFundHoldings(prev => {
      const remaining = holding.shares - shares
      if (remaining <= 0.01) {
        // 全部卖出，移除持仓
        return prev.filter(h => h.fundId !== fundId)
      } else {
        // 部分卖出
        const remainingCost = holding.totalCost * (remaining / holding.shares)
        return prev.map(h => h.fundId === fundId ? {
          ...h,
          shares: Number(remaining.toFixed(2)),
          totalCost: remainingCost,
        } : h)
      }
    })
    
    return { success: true, message: `成功卖出，到账${actualAmount}元`, amount: actualAmount }
  }, [funds, fundHoldings, addWalletBill])
  
  // 获取持仓
  const getFundHolding = useCallback((fundId: string) => {
    return fundHoldings.find(h => h.fundId === fundId)
  }, [fundHoldings])
  
  // 获取基金总市值
  const getTotalFundValue = useCallback(() => {
    return fundHoldings.reduce((total, holding) => {
      const fund = funds.find(f => f.id === holding.fundId)
      if (!fund) return total
      return total + holding.shares * fund.currentPrice
    }, 0)
  }, [funds, fundHoldings])

  // ==================== 群聊操作 ====================
  
  const createGroup = useCallback((memberIds: string[], name?: string): GroupChat => {
    const memberNames = memberIds.map(id => {
      const char = characters.find(c => c.id === id)
      return char?.name || '未知'
    })
    const newGroup: GroupChat = {
      id: `group_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: name || memberNames.slice(0, 3).join('、'),
      avatar: '',
      memberIds,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
    }
    setGroups(prev => [...prev, newGroup])
    return newGroup
  }, [characters])
  
  const updateGroup = useCallback((id: string, updates: Partial<GroupChat>) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))
  }, [])
  
  const deleteGroup = useCallback((id: string) => {
    setGroups(prev => prev.filter(g => g.id !== id))
    // 同时删除群消息
    setMessages(prev => prev.filter(m => m.groupId !== id))
  }, [])
  
  const getGroup = useCallback((id: string) => {
    return groups.find(g => g.id === id)
  }, [groups])
  
  const addGroupMember = useCallback((groupId: string, memberId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id === groupId && !g.memberIds.includes(memberId)) {
        return { ...g, memberIds: [...g.memberIds, memberId] }
      }
      return g
    }))
  }, [])
  
  const removeGroupMember = useCallback((groupId: string, memberId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const newMemberIds = g.memberIds.filter(id => id !== memberId)
        // 如果成员少于2人，不允许移除
        if (newMemberIds.length < 2) return g
        return { ...g, memberIds: newMemberIds }
      }
      return g
    }))
  }, [])
  
  const getGroupMessages = useCallback((groupId: string) => {
    return messages.filter(m => m.groupId === groupId)
  }, [messages])

  // ==================== Context Value ====================

  const value = useMemo<WeChatContextValue>(() => ({
    isHydrated,
    characters, messages, stickers, favoriteDiaries, moments, userSettings, userPersonas,
    transfers, anniversaries, periods, listenTogether,
    addCharacter, updateCharacter, deleteCharacter, getCharacter,
    togglePinned, toggleSpecialCare, toggleBlocked, hideFromChat, showInChat, setCurrentChatId, setCharacterTyping,
    addMessage, updateMessage, deleteMessage, deleteMessagesByIds, deleteMessagesAfter, getMessagesByCharacter, getLastMessage, clearMessages,
    getMessagesPage,
    addSticker, removeSticker, getStickersByCharacter, addStickerToCharacter, addStickerToAll,
    addFavoriteDiary, removeFavoriteDiary, isDiaryFavorited,
    myDiaries, addMyDiary, updateMyDiary, deleteMyDiary, getMyDiaryByDate,
    addMoment, deleteMoment, likeMoment, addMomentComment,
    updateUserSettings,
    addUserPersona, updateUserPersona, deleteUserPersona, getUserPersona, getCurrentPersona,
    addTransfer, getTransfersByCharacter,
    addAnniversary, removeAnniversary, getAnniversariesByCharacter,
    addPeriodRecord, updatePeriodRecord, removePeriodRecord, getPeriodRecords, getCurrentPeriod,
    startListenTogether, updateListenTogetherSong, stopListenTogether,
    // 表情包分类
    stickerCategories, addStickerCategory, removeStickerCategory, getStickersByCategory,
    // 钱包
    walletBalance, walletInitialized, walletBills,
    initializeWallet, addWalletBill, updateWalletBalance,
    // 基金
    funds, fundHoldings, refreshFunds, getNextRefreshTime, buyFund, sellFund, getFundHolding, getTotalFundValue,
    // 群聊
    groups, createGroup, updateGroup, deleteGroup, getGroup, addGroupMember, removeGroupMember, getGroupMessages,
  }), [isHydrated, characters, messages, stickers, favoriteDiaries, myDiaries, stickerCategories, moments, userSettings, userPersonas, transfers, anniversaries, periods, listenTogether, walletBalance, walletInitialized, walletBills, funds, fundHoldings, groups, getMessagesByCharacter, getLastMessage, getStickersByCharacter, getMessagesPage, refreshFunds, getNextRefreshTime, buyFund, sellFund, getFundHolding, getTotalFundValue, createGroup, updateGroup, deleteGroup, getGroup, addGroupMember, removeGroupMember, getGroupMessages])

  return <WeChatContext.Provider value={value}>{children}</WeChatContext.Provider>
}

export const useWeChat = () => {
  const ctx = useContext(WeChatContext)
  if (!ctx) throw new Error('useWeChat must be used within WeChatProvider')
  return ctx
}
