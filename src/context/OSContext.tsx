import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type PropsWithChildren,
} from 'react'
import { kvGet, kvGetJSONDeep, kvSet, kvSetJSON } from '../storage/kv'
import { readOpenAISSEToText } from '../utils/sse'
import { compressDataUrlToDataUrl } from '../utils/image'

export type UserProfile = { avatar: string; nickname: string; persona: string }
export type LLMApiInterface = 'openai_compatible' | 'anthropic_native' | 'gemini_native' | 'ollama'
export type LLMConfig = {
  apiBaseUrl: string
  apiKey: string
  selectedModel: string
  availableModels: string[]
  apiInterface: LLMApiInterface
}

// MiniMax 语音配置
export type TTSRegion = 'cn' | 'global'  // 国内版 / 海外版
export type TTSVoice = {
  id: string
  name: string
  desc?: string
  isCloned?: boolean  // 是否是克隆音色
  createdAt?: number  // 克隆时间戳
}
export type TTSConfig = {
  apiKey: string
  voiceId: string  // 音色ID
  model: string    // 模型版本
  speed: number    // 语速 0.5-2
  enabled: boolean // 是否启用语音
  region: TTSRegion // 国内版/海外版
  customVoices: TTSVoice[] // 用户克隆的音色列表
}

export type Notification = { id: string; app: string; title: string; body: string; avatar?: string; timestamp: number; read: boolean }
export type VirtualCharacter = { id: string; name: string; avatar: string; prompt: string; intimacy: number }
export type ChatMessage = { id: string; senderId: string; senderName: string; text: string; app?: string; timestamp: number }
export type FontOption = { id: string; name: string; fontFamily: string; preview: string }

// 自定义字体
export type CustomFont = {
  id: string
  name: string
  fontFamily: string  // 字体族名称（用于 CSS）
  dataUrl: string     // base64 编码的字体文件
  createdAt: number
}
export type ColorOption = { id: string; name: string; value: string }

// 纪念日类型
export type Anniversary = {
  id: string
  name: string
  date: string  // YYYY-MM-DD 格式
  icon: string  // emoji
  type: 'countdown' | 'countup'  // 倒计时（还有X天）或正计时（已经X天）
}

// 待办事项
export type TodoItem = {
  id: string
  text: string
  done: boolean
}

// 备忘录类型
export type Memo = {
  content: string
  image: string  // base64 或 URL
  todos: TodoItem[]  // 待办事项列表
}

// 位置和天气相关类型
export type LocationMode = 'auto' | 'manual'
export type WeatherData = {
  temp: string
  desc: string
  icon: string
  city: string
  updatedAt: number
}
export type ManualWeatherType = 'sunny' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'storm'
export type LocationSettings = {
  mode: LocationMode
  manualCity: string
  manualWeatherType?: ManualWeatherType
  manualTempC?: number
  latitude?: number
  longitude?: number
}

// 全局字体大小（影响整个小手机 UI）
export type FontSizeTier = 'small' | 'medium' | 'large' | 'xlarge'

// 音乐相关类型
export type Song = {
  id: string
  title: string
  artist: string
  cover: string
  url: string
  duration: number // 秒
  // 标记来源，便于兼容/迁移（可选）
  source?: 'builtin' | 'data' | 'url'
}

export type MusicPlayMode = 'order' | 'shuffle' | 'repeat_one'

export const FONT_OPTIONS: FontOption[] = [
  { id: 'cute-round', name: '可爱圆体', fontFamily: '"ZCOOL KuaiLe", "Baloo 2", cursive', preview: '可爱圆润 ABC 123' },
  { id: 'handwrite', name: '手写体', fontFamily: '"Ma Shan Zheng", cursive', preview: '手写风格 ABC 123' },
  { id: 'pixel', name: '像素风', fontFamily: '"ZCOOL QingKe HuangYou", cursive', preview: '像素风格 ABC 123' },
  { id: 'elegant', name: '优雅衬线', fontFamily: '"Noto Serif SC", serif', preview: '优雅衬线 ABC 123' },
  { id: 'modern', name: '现代无衬线', fontFamily: '"Noto Sans SC", "SF Pro Display", sans-serif', preview: '现代简洁 ABC 123' },
]

export const COLOR_OPTIONS: ColorOption[] = [
  { id: 'white', name: '纯白', value: '#ffffff' },
  { id: 'cream', name: '奶油白', value: '#fdf6e3' },
  { id: 'black', name: '深黑', value: '#1a1a1a' },
  { id: 'brown', name: '棕褐', value: '#5d4037' },
  { id: 'pink', name: '樱花粉', value: '#f48fb1' },
  { id: 'purple', name: '梦幻紫', value: '#b39ddb' },
  { id: 'blue', name: '天空蓝', value: '#81d4fa' },
  { id: 'mint', name: '薄荷绿', value: '#a5d6a7' },
]

// 默认壁纸：优先用图片，图片不存在则用渐变
const DEFAULT_WALLPAPER = '/icons/wallpaper.jpg'
const FALLBACK_WALLPAPER = 'linear-gradient(180deg, #fef7f0 0%, #fde8e0 30%, #fce0d8 60%, #fad4c8 100%)'

// 默认歌曲封面
const DEFAULT_COVER = '/icons/music-cover.png'

// 音乐列表存储键
const MUSIC_STORAGE_KEY = 'littlephone_music_playlist'
const MUSIC_VERSION_KEY = 'littlephone_music_version'
const MUSIC_PLAY_MODE_KEY = 'littlephone_music_play_mode'
const CURRENT_MUSIC_VERSION = '8' // 更新这个数字会强制重置音乐列表

// 位置和天气存储键
const LOCATION_STORAGE_KEY = 'littlephone_location'
const WEATHER_STORAGE_KEY = 'littlephone_weather'

// 默认位置设置
const defaultLocationSettings: LocationSettings = {
  mode: 'manual',
  manualCity: '北京',
  manualWeatherType: 'sunny',
  manualTempC: 18,
}

// 默认天气
const defaultWeather: WeatherData = {
  temp: '18°',
  desc: '晴',
  icon: '☀️',
  city: '北京',
  updatedAt: 0
}

// 内置默认歌曲（打包时会包含）
const DEFAULT_SONGS: Song[] = [
  {
    id: 'default-1',
    title: 'Diary - 花日 (治愈版)',
    artist: 'H',
    cover: DEFAULT_COVER,
    url: '/music/diary.ogg',
    duration: 200,
    source: 'builtin',
  },
  {
    id: 'default-2',
    title: 'City of Stars (Live)',
    artist: '周深 / INTO1-米卡',
    cover: DEFAULT_COVER,
    url: '/music/City of Stars.Live.-周深.INTO1-米卡.mp3',
    duration: 240,
    source: 'builtin',
  },
  {
    id: 'default-3',
    title: 'If',
    artist: '丁可',
    cover: DEFAULT_COVER,
    url: '/music/If-丁可.mp3',
    duration: 210,
    source: 'builtin',
  },
  {
    id: 'default-4',
    title: 'Paris in the Rain',
    artist: 'Lauv',
    cover: DEFAULT_COVER,
    url: '/music/Paris in the Rain-Lauv.mp3',
    duration: 195,
    source: 'builtin',
  },
  {
    id: 'default-5',
    title: 'Time Machine (feat. Aren Park)',
    artist: 'MJ Apanay / Aren Park',
    cover: DEFAULT_COVER,
    url: '/music/time machine .feat. aren park.-mj apanay.aren park.mp3',
    duration: 220,
    source: 'builtin',
  }
]

// 旧：同步从 localStorage 读取歌曲列表（已废弃，改为 IndexedDB 异步 hydration）

type OSContextValue = {
  isHydrated: boolean
  time: string; wallpaper: string
  currentFont: FontOption; fontColor: ColorOption; userProfile: UserProfile
  fontSizeTier: FontSizeTier
  setFontSizeTier: (tier: FontSizeTier) => void
  glassOpacity: number
  setGlassOpacity: (opacity: number) => void
  llmConfig: LLMConfig; ttsConfig: TTSConfig; miCoinBalance: number; notifications: Notification[]
  characters: VirtualCharacter[]; chatLog: ChatMessage[]
  // 当前桌面排版（排版1=custom，排版2=minimal）下的自定义图标（仅作用于当前排版）
  customAppIcons: Record<string, string>
  // 分排版存储：用于图标管理页切换编辑
  customAppIconsLayout1: Record<string, string>
  customAppIconsLayout2: Record<string, string>
  // 当前排版下的唱片封面（排版1/2分离）
  decorImage: string
  decorImageLayout1: string
  decorImageLayout2: string
  homeAvatar: string
  // 位置和天气
  locationSettings: LocationSettings
  weather: WeatherData
  setLocationSettings: (settings: Partial<LocationSettings>) => void
  refreshWeather: () => Promise<void>
  // 音乐相关
  musicPlaying: boolean
  currentSong: Song | null
  musicProgress: number
  musicPlaylist: Song[]
  musicFavorites: string[]
  musicPlayMode: MusicPlayMode
  audioRef: React.RefObject<HTMLAudioElement | null>
  setWallpaper: (wallpaper: string) => void
  setCurrentFont: (font: FontOption) => void
  setFontColor: (color: ColorOption) => void
  setUserProfile: (profile: Partial<UserProfile>) => void
  setLLMConfig: (config: Partial<LLMConfig>) => void
  setTTSConfig: (config: Partial<TTSConfig>) => void
  textToSpeech: (text: string) => Promise<string | null>  // 返回音频 URL 或 null
  setMiCoinBalance: (balance: number) => void
  addMiCoins: (amount: number) => void
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markNotificationRead: (id: string) => void
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number }) => void
  updateIntimacy: (characterId: string, delta: number) => void
  setCustomAppIcon: (appId: string, iconUrl: string) => void
  setCustomAppIconForLayout: (layout: 'layout1' | 'layout2', appId: string, iconUrl: string) => void
  setDecorImage: (url: string) => void
  setDecorImageForLayout: (layout: 'layout1' | 'layout2', url: string) => void
  setHomeAvatar: (url: string) => void
  // 签名
  signature: string
  setSignature: (text: string) => void
  // 喝水计数
  waterCount: number
  addWater: () => void
  wallpaperError: boolean
  setWallpaperError: (error: boolean) => void
  // 音乐控制
  playSong: (song: Song) => void
  pauseMusic: () => void
  resumeMusic: () => void
  toggleMusic: () => void
  nextSong: () => void
  prevSong: () => void
  cycleMusicPlayMode: () => void
  seekMusic: (progress: number) => void
  toggleFavorite: (songId: string) => void
  isFavorite: (songId: string) => boolean
  addSong: (song: Song) => void
  removeSong: (songId: string) => void
  setMusicPlaying: (playing: boolean) => void
  setCurrentSong: (song: Song | null) => void
  // 图标主题
  iconTheme: IconTheme
  setIconTheme: (theme: IconTheme) => void
  // 纪念日
  anniversaries: Anniversary[]
  addAnniversary: (anniversary: Omit<Anniversary, 'id'>) => void
  updateAnniversary: (id: string, anniversary: Partial<Anniversary>) => void
  removeAnniversary: (id: string) => void
  // 备忘录
  memo: Memo
  setMemo: (memo: Partial<Memo>) => void
  // 自定义字体
  customFonts: CustomFont[]
  addCustomFont: (font: Omit<CustomFont, 'id' | 'createdAt'>) => CustomFont
  removeCustomFont: (id: string) => void
  getAllFontOptions: () => FontOption[]  // 获取所有字体选项（内置 + 自定义）
  // API相关（手动配置）
  fetchAvailableModels: (override?: { apiBaseUrl?: string; apiKey?: string; apiInterface?: LLMApiInterface }) => Promise<string[]>
  testLLMConfig: (override: { apiBaseUrl: string; apiKey: string; apiInterface: LLMApiInterface; model?: string }) => Promise<{ modelUsed: string; reply: string }>
  callLLM: (
    messages: {
      role: string
      content:
        | string
        | Array<{
            type: string
            text?: string
            image_url?: { url: string }
            // 兼容部分 OpenAI-compat 代理使用 camelCase
            imageUrl?: { url: string }
          }>
    }[],
    model?: string,
    options?: { temperature?: number; maxTokens?: number; timeoutMs?: number },
    configOverride?: {
      apiBaseUrl?: string
      apiKey?: string
      apiInterface?: LLMApiInterface
      selectedModel?: string
    }
  ) => Promise<string>
}

const OSContext = createContext<OSContextValue | undefined>(undefined)

const formatTime = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

const defaultUserProfile: UserProfile = { avatar: '', nickname: '用户', persona: '' }
const defaultLLMConfig: LLMConfig = { apiBaseUrl: '', apiKey: '', selectedModel: '', availableModels: [], apiInterface: 'openai_compatible' }
const defaultTTSConfig: TTSConfig = { 
  apiKey: '', 
  voiceId: 'female-shaonv',  // 默认少女音色
  model: 'speech-02-turbo',  // 默认 turbo 模型（便宜快速）
  speed: 1,
  enabled: false,
  region: 'cn',  // 默认国内版
  customVoices: [],
}

const STORAGE_KEYS = {
  llmConfig: 'os_llm_config',
  ttsConfig: 'os_tts_config',
  miCoinBalance: 'os_micoin_balance',
  currentFontId: 'os_current_font_id',
  fontColorId: 'os_font_color_id',
  fontSizeTier: 'os_font_size_tier',
  glassOpacity: 'os_glass_opacity',
  wallpaper: 'os_wallpaper',
  // 兼容旧版本：曾经是单一 map（会在 hydration 时迁移到两份）
  customAppIcons: 'os_custom_app_icons',
  // 新版：按桌面排版分别存两份
  customAppIconsLayout1: 'os_custom_app_icons_layout1',
  customAppIconsLayout2: 'os_custom_app_icons_layout2',
  // 兼容旧版本：单一唱片封面
  decorImage: 'os_decor_image',
  // 新版：按桌面排版分别存两份唱片封面
  decorImageLayout1: 'os_decor_image_layout1',
  decorImageLayout2: 'os_decor_image_layout2',
  userProfile: 'os_user_profile',
  iconTheme: 'os_icon_theme',
  anniversaries: 'os_anniversaries',
  memo: 'os_memo',
  homeAvatar: 'os_home_avatar',
  waterCount: 'os_water_count',
  waterDate: 'os_water_date',
  signature: 'os_signature',
  customFonts: 'os_custom_fonts',
} as const

// 图标主题定义
export type IconTheme = 'custom' | 'minimal'

// 简洁主题图标映射
export const MINIMAL_ICONS: Record<string, string> = {
  wechat: '/icons/minimal/wechat.svg',
  gameCenter: '/icons/minimal/game-center.svg',
  diaryVault: '/icons/minimal/diary.svg',
  x: '/icons/minimal/x.svg',
  music: '/icons/minimal/music.svg',
  settings: '/icons/minimal/settings.svg',
  manual: '/icons/minimal/manual.svg',
  preset: '/icons/minimal/preset.svg',
}

function normalizeApiBaseUrl(input: string, apiInterface: LLMApiInterface = 'openai_compatible'): string {
  let trimmed = (input || '').trim()
  if (!trimmed) return ''
  // 去掉结尾的多余斜杠
  trimmed = trimmed.replace(/\/+$/, '')

  // 用户常见误填：直接填到了具体接口（/chat/completions 或 /models）
  // 统一裁剪回“base(/v1)”级别，避免拼接出 /v1/chat/completions/v1 这种路径
  trimmed = trimmed.replace(/\/chat\/completions\/?$/i, '')
  trimmed = trimmed.replace(/\/models\/?$/i, '')
  // anthropic / gemini / ollama 的常见误填
  trimmed = trimmed.replace(/\/messages\/?$/i, '')
  trimmed = trimmed.replace(/\/generateContent\/?$/i, '')
  trimmed = trimmed.replace(/\/chat\/?$/i, '')
  trimmed = trimmed.replace(/\/tags\/?$/i, '')

  const lower = trimmed.toLowerCase()
  // 智谱 GLM（open.bigmodel.cn /api/paas/v4）是 OpenAI 兼容但不走 /v1 路径，保持原路径
  if (
    apiInterface === 'openai_compatible' &&
    /^https?:\/\/open\.bigmodel\.cn\/api\/paas\/v4(?:\/|$)/i.test(trimmed)
  ) {
    return trimmed
  }
  // Gemini 原生：v1beta
  const v1betaMatch = lower.match(/\/v1beta(\/|$)/)
  if (v1betaMatch) {
    const idx = lower.indexOf('/v1beta')
    const prefix = trimmed.slice(0, idx)
    return `${prefix}/v1beta`
  }
  // 仅当“真正包含 /v1 片段”时才裁剪（避免把 /v1beta 错裁成 /v1）
  const v1Match = lower.match(/\/v1(\/|$)/)
  if (v1Match) {
    const idx = lower.indexOf('/v1')
    const prefix = trimmed.slice(0, idx)
    return `${prefix}/v1`
  }

  // 没写版本号：按接口类型补默认路径
  if (apiInterface === 'gemini_native') return `${trimmed}/v1beta`
  if (apiInterface === 'ollama') return `${trimmed}/api`
  // OpenAI/Claude 兼容：默认 /v1
  return `${trimmed}/v1`
}

function toText(v: any): string {
  try {
    if (v == null) return ''
    if (typeof v === 'string') return v
    if (typeof v?.message === 'string') return v.message
    return String(v)
  } catch {
    return ''
  }
}

function parseHttpStatusFromText(text: string): number | undefined {
  const t = (text || '').trim()
  if (!t) return undefined
  // 常见：请求失败: 429 / HTTP 429 / status:429
  const m = t.match(/(?:HTTP\s*)?(\d{3})\b/)
  if (!m) return undefined
  const code = Number(m[1])
  if (code >= 100 && code <= 599) return code
  return undefined
}

function summarizeLLMError(error: any, _ctx: { apiInterface: LLMApiInterface; baseUrl: string; model: string; phase: 'models' | 'chat' }): string {
  const rawMsg = toText(error) || ''
  const msg = rawMsg.trim()
  const status: number | undefined =
    typeof error?.status === 'number'
      ? error.status
      : parseHttpStatusFromText(msg)

  // 1) 超时
  if (error?.name === 'AbortError') {
    return (
      '请求超时：模型响应太慢或网络不稳定。\n' +
      '建议：\n' +
      '- 点击“重新生成/重试”\n' +
      '- 换一个更快的模型（如有）\n' +
      '- 减少上下文：降低记忆回合/清空部分聊天\n'
    ).trim()
  }

  // 2) 浏览器网络类（CORS/混合内容/DNS）
  if (
    error instanceof TypeError ||
    /failed to fetch|networkerror|load failed/i.test(msg) ||
    /mixed content/i.test(msg)
  ) {
    return (
      '网络请求失败（浏览器拦截或无法连接）。\n' +
      '常见原因：\n' +
      '1) HTTPS 页面下使用了 http:// Base URL（混合内容会被拦截）\n' +
      '2) 中转站未开启 CORS（网页无法跨域；但 Postman/后端可能正常）\n' +
      '3) 证书/域名问题（证书链不完整、DNS 异常、被运营商拦截）\n' +
      '4) 网络环境限制（公司网/校园网/代理/VPN）\n' +
      '建议：换一个支持网页调用的中转站，或使用 https:// 的地址。\n' +
      (msg ? `\n原始错误：${msg}` : '')
    ).trim()
  }

  // 3) 上下文过长/超出限制
  if (
    /context length|max(imum)? tokens|too many tokens|token limit|提示词过长|上下文过长/i.test(msg)
  ) {
    return (
      '上下文过长：这次对话历史/设定太多，超过了模型可接受的长度。\n' +
      '建议：\n' +
      '- 降低“记忆回合/附带历史”数量\n' +
      '- 清理部分聊天记录后再生成\n' +
      '- 换一个支持更长上下文的模型\n'
    ).trim()
  }

  // 4) 选错模型/模型不存在
  if (
    status === 404 ||
    /model.*not found|The model .* does not exist|找不到模型|模型不存在/i.test(msg)
  ) {
    return (
      '模型不存在 / 模型名不匹配（404）。\n' +
      '建议：\n' +
      '- 到「设置 → API 配置」点击“获取模型列表”刷新\n' +
      '- 换一个模型再试\n' +
      '- 确认接口类型正确（OpenAI兼容 / Claude原生 / Gemini原生 / Ollama）\n'
    ).trim()
  }

  // 5) Key/权限问题
  if (status === 401 || /invalid api key|unauthorized|未授权|无效的.?key/i.test(msg)) {
    return (
      '鉴权失败（401）：API Key 无效/过期/权限不足。\n' +
      '建议：\n' +
      '- 检查 Key 是否复制完整\n' +
      '- 中转站用户：检查是否欠费/余额不足/Key 被封\n'
    ).trim()
  }
  if (status === 403 || /forbidden|权限不足|无权限/i.test(msg)) {
    return (
      '权限不足（403）：Key 没有权限访问该模型/接口。\n' +
      '建议：换模型或联系服务商开通权限。'
    ).trim()
  }

  // 6) 限流/余额不足（很多中转站把余额不足也用 429）
  if (status === 429 || /rate limit|too many requests|限流|请求过于频繁|quota|insufficient/i.test(msg)) {
    return (
      '请求过于频繁/额度不足（429）。\n' +
      '可能原因：限流、并发太高、或中转站余额不足。\n' +
      '建议：\n' +
      '- 等 10~60 秒后重试\n' +
      '- 换一个便宜/更快的模型\n' +
      '- 中转站用户：检查余额/套餐/并发限制\n'
    ).trim()
  }

  // 7) 服务器故障
  if ((status != null && status >= 500) || /server error|bad gateway|gateway|服务不可用|内部错误/i.test(msg)) {
    const detail = msg
      ? `\n\n【上游原始返回片段】\n${msg.slice(0, 1200)}`
      : ''
    return (
      `服务端异常（${status || '5xx'}）：上游/中转站故障。\n` +
      '建议：\n' +
      '- 稍后重试或点击“重新生成”\n' +
      '- 换模型/换一个中转站\n' +
      detail
    ).trim()
  }

  // 8) 空回复/格式问题（用户最常见困扰）
  if (/空内容|empty|no content|格式不兼容/i.test(msg)) {
    return (
      '模型返回空回复/格式不兼容。\n' +
      '建议：\n' +
      '- 切换“接口类型”（OpenAI兼容 / Claude原生 / Gemini原生 / Ollama）\n' +
      '- 换模型后重试\n' +
      '- 点击“重新生成”\n'
    ).trim()
  }

  // 兜底：保留原始信息，但加一行操作建议
  return (
    `${msg || '请求失败（未知原因）'}\n\n` +
    '建议：\n' +
    '- 先重试/重新生成\n' +
    '- 不行就换模型\n' +
    '- 仍然不行：检查 Base URL / API Key / 接口类型'
  ).trim()
}
const seedCharacters: VirtualCharacter[] = [
  { id: 'char-01', name: '青禾', avatar: 'https://i.pravatar.cc/150?img=5', prompt: '温柔的生活助手', intimacy: 68 },
  { id: 'char-02', name: '森野', avatar: 'https://i.pravatar.cc/150?img=3', prompt: '冷静的技术宅', intimacy: 55 },
]
const seedChat: ChatMessage[] = [
  { id: 'chat-01', senderId: 'char-01', senderName: '青禾', text: '欢迎来到 LittlePhone~', timestamp: Date.now() - 1000 * 60 * 45, app: '系统' },
]

// 注入自定义字体的 CSS @font-face 规则
function injectCustomFontStyle(font: CustomFont) {
  const styleId = `custom-font-style-${font.id}`
  // 避免重复注入
  if (document.getElementById(styleId)) return
  
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @font-face {
      font-family: "${font.fontFamily}";
      src: url("${font.dataUrl}") format("truetype");
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }
  `
  document.head.appendChild(style)
}

// 移除自定义字体的 CSS 规则
function removeCustomFontStyle(fontId: string) {
  const styleId = `custom-font-style-${fontId}`
  const style = document.getElementById(styleId)
  if (style) style.remove()
}

export function OSProvider({ children }: PropsWithChildren) {
  const [isHydrated, setIsHydrated] = useState(false)
  const [time, setTime] = useState(formatTime)
  const [wallpaper, setWallpaper] = useState(DEFAULT_WALLPAPER)
  const [wallpaperError, setWallpaperError] = useState(false)
  const [currentFont, setCurrentFontState] = useState<FontOption>(() => {
    // 默认字体：优雅衬线（但如果用户保存过选择，则完全尊重用户保存）
    const defaultId = FONT_OPTIONS.find(f => f.id === 'elegant')?.id || FONT_OPTIONS[0].id
    return FONT_OPTIONS.find(f => f.id === defaultId) || FONT_OPTIONS[0]
  })
  const [fontColor, setFontColorState] = useState<ColorOption>(() => {
    return COLOR_OPTIONS[3]
  })
  const [fontSizeTier, setFontSizeTierState] = useState<FontSizeTier>('medium')
  const [glassOpacity, setGlassOpacityState] = useState(25)
  const [userProfile, setUserProfileState] = useState<UserProfile>(defaultUserProfile)
  const [llmConfig, setLLMConfigState] = useState<LLMConfig>(defaultLLMConfig)
  const [ttsConfig, setTTSConfigState] = useState<TTSConfig>(defaultTTSConfig)
  const [miCoinBalance, setMiCoinBalance] = useState(() => 100)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [characters, setCharacters] = useState<VirtualCharacter[]>(seedCharacters)
  const [chatLog, setChatLog] = useState<ChatMessage[]>(seedChat)
  // 自定义图标：按“桌面排版1/2”分别存储（排版1=custom，排版2=minimal）
  const [customAppIconsLayout1, setCustomAppIconsLayout1] = useState<Record<string, string>>({})
  const [customAppIconsLayout2, setCustomAppIconsLayout2] = useState<Record<string, string>>({})
  const [decorImageLayout1, setDecorImageLayout1] = useState('')
  const [decorImageLayout2, setDecorImageLayout2] = useState('')
  const [homeAvatar, setHomeAvatar] = useState('')
  const [signature, setSignature] = useState('今天也要开心鸭~')
  
  // 喝水计数
  const [waterCount, setWaterCount] = useState(0)
  const [waterDate, setWaterDate] = useState('')

  // 位置和天气状态
  const [locationSettings, setLocationSettingsState] = useState<LocationSettings>(defaultLocationSettings)
  const [weather, setWeather] = useState<WeatherData>(defaultWeather)

  // 音乐状态
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [musicProgress, setMusicProgress] = useState(0)
  const [musicPlaylist, setMusicPlaylist] = useState<Song[]>(() => [...DEFAULT_SONGS])
  const [musicFavorites, setMusicFavorites] = useState<string[]>([])
  const [musicPlayMode, setMusicPlayModeState] = useState<MusicPlayMode>('order')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentSongRef = useRef<Song | null>(null)
  const musicPlaylistRef = useRef<Song[]>([])
  const musicPlayModeRef = useRef<MusicPlayMode>('order')
  
  // 图标主题
  const [iconTheme, setIconThemeState] = useState<IconTheme>('custom')
  const iconThemeRef = useRef<IconTheme>('custom')
  useEffect(() => { iconThemeRef.current = iconTheme }, [iconTheme])

  // 当前排版下的自定义图标（对外继续叫 customAppIcons，兼容旧代码）
  const customAppIcons =
    (iconTheme === 'custom' ? customAppIconsLayout1 : customAppIconsLayout2)
  const decorImage =
    (iconTheme === 'custom' ? decorImageLayout1 : decorImageLayout2)
  
  // 纪念日
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([])
  
  // 备忘录
  const defaultMemo: Memo = { content: '', image: '', todos: [] }
  const [memo, setMemoState] = useState<Memo>(defaultMemo)
  
  // 自定义字体
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([])
  // 兼容：hydration 完成前导入音乐，后续 hydrate 会 setMusicPlaylist 覆盖，导致“导入后刷新就没了”
  const pendingAddedSongsRef = useRef<Song[]>([])

  useEffect(() => {
    const tick = setInterval(() => setTime(formatTime()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    currentSongRef.current = currentSong
  }, [currentSong])
  useEffect(() => {
    musicPlaylistRef.current = musicPlaylist
  }, [musicPlaylist])
  useEffect(() => {
    musicPlayModeRef.current = musicPlayMode
  }, [musicPlayMode])

  // 异步 Hydration：从 IndexedDB 加载；首次会从 localStorage 迁移（避免丢数据）
  useEffect(() => {
    let cancelled = false
    const hydrate = async () => {
      // 迁移一次（如果 kv 没有这些 key）
      const has = await kvGet(STORAGE_KEYS.llmConfig)
      if (!has) {
        const keysToMove: string[] = [
          STORAGE_KEYS.llmConfig,
          STORAGE_KEYS.miCoinBalance,
          STORAGE_KEYS.currentFontId,
          STORAGE_KEYS.fontColorId,
          STORAGE_KEYS.fontSizeTier,
          MUSIC_STORAGE_KEY,
          MUSIC_VERSION_KEY,
          MUSIC_PLAY_MODE_KEY,
          LOCATION_STORAGE_KEY,
          WEATHER_STORAGE_KEY,
        ]
        await Promise.allSettled(
          keysToMove.map(async (k) => {
            try {
              const raw = localStorage.getItem(k)
              if (raw != null) await kvSet(k, raw)
            } catch {
              // ignore
            }
          })
        )
      }

      // 并行读取：减少启动等待
      const [
        nextLLM,
        nextTTS,
        nextMi,
        nextFontId,
        nextColorId,
        nextFontSizeTier,
        nextGlassOpacity,
        nextLocation,
        nextWeather,
        _savedVersion, // 不再用于强制重置，但保留读取以备将来使用
        nextWallpaper,
        nextCustomAppIconsLegacy,
        nextCustomAppIconsLayout1,
        nextCustomAppIconsLayout2,
        nextDecorImageLegacy,
        nextDecorImageLayout1,
        nextDecorImageLayout2,
        nextHomeAvatar,
        nextSignature,
        nextWaterCount,
        nextWaterDate,
        nextUserProfile,
        nextIconTheme,
        nextAnniversaries,
        nextMemo,
        nextCustomFonts,
        nextMusicPlayMode,
      ] = await Promise.all([
        kvGetJSONDeep<LLMConfig>(STORAGE_KEYS.llmConfig, defaultLLMConfig),
        kvGetJSONDeep<TTSConfig>(STORAGE_KEYS.ttsConfig, defaultTTSConfig),
        kvGetJSONDeep<number>(STORAGE_KEYS.miCoinBalance, 100),
        kvGetJSONDeep<string>(
          STORAGE_KEYS.currentFontId,
          (FONT_OPTIONS.find(f => f.id === 'elegant')?.id || FONT_OPTIONS[0].id)
        ),
        kvGetJSONDeep<string>(STORAGE_KEYS.fontColorId, COLOR_OPTIONS[3].id),
        kvGetJSONDeep<FontSizeTier>(STORAGE_KEYS.fontSizeTier, 'medium'),
        kvGetJSONDeep<number>(STORAGE_KEYS.glassOpacity, 25),
        kvGetJSONDeep<LocationSettings>(LOCATION_STORAGE_KEY, defaultLocationSettings),
        kvGetJSONDeep<WeatherData>(WEATHER_STORAGE_KEY, defaultWeather),
        kvGetJSONDeep<string>(MUSIC_VERSION_KEY, ''),
        kvGetJSONDeep<string>(STORAGE_KEYS.wallpaper, DEFAULT_WALLPAPER),
        kvGetJSONDeep<Record<string, string>>(STORAGE_KEYS.customAppIcons, {}),
        kvGetJSONDeep<Record<string, string>>(STORAGE_KEYS.customAppIconsLayout1, {}),
        kvGetJSONDeep<Record<string, string>>(STORAGE_KEYS.customAppIconsLayout2, {}),
        kvGetJSONDeep<string>(STORAGE_KEYS.decorImage, ''),
        kvGetJSONDeep<string>(STORAGE_KEYS.decorImageLayout1, ''),
        kvGetJSONDeep<string>(STORAGE_KEYS.decorImageLayout2, ''),
        kvGetJSONDeep<string>(STORAGE_KEYS.homeAvatar, ''),
        kvGetJSONDeep<string>(STORAGE_KEYS.signature, '今天也要开心鸭~'),
        kvGetJSONDeep<number>(STORAGE_KEYS.waterCount, 0),
        kvGetJSONDeep<string>(STORAGE_KEYS.waterDate, ''),
        kvGetJSONDeep<UserProfile>(STORAGE_KEYS.userProfile, defaultUserProfile),
        kvGetJSONDeep<IconTheme>(STORAGE_KEYS.iconTheme, 'custom'),
        kvGetJSONDeep<Anniversary[]>(STORAGE_KEYS.anniversaries, []),
        kvGetJSONDeep<Memo>(STORAGE_KEYS.memo, { content: '', image: '', todos: [] }),
        kvGetJSONDeep<CustomFont[]>(STORAGE_KEYS.customFonts, []),
        kvGetJSONDeep<MusicPlayMode>(MUSIC_PLAY_MODE_KEY, 'order'),
      ])

      // 自定义图标迁移：旧版本只有一个 map；新版本按排版存两份
      const sanitizeIconMap = (m: any) => {
        if (!m || typeof m !== 'object') return {}
        const out: Record<string, string> = {}
        try {
          Object.entries(m).forEach(([k, v]) => {
            const key = String(k || '').trim()
            if (!key) return
            const val = String(v || '').trim()
            if (!val) return
            out[key] = val
          })
        } catch {
          return {}
        }
        return out
      }
      const legacyMap = sanitizeIconMap(nextCustomAppIconsLegacy)
      const layout1Map = sanitizeIconMap(nextCustomAppIconsLayout1)
      const layout2Map = sanitizeIconMap(nextCustomAppIconsLayout2)
      const finalLayout1 = Object.keys(layout1Map).length ? layout1Map : legacyMap
      const finalLayout2 = Object.keys(layout2Map).length ? layout2Map : legacyMap

      // 兜底：如果 IndexedDB 的 userProfile 丢失（回到默认），尝试从 localStorage 备份恢复
      let finalUserProfile = nextUserProfile
      try {
        const rawInKv = await kvGet(STORAGE_KEYS.userProfile)
        const hasKv = !!rawInKv
        if (!hasKv) {
          const backup = localStorage.getItem(STORAGE_KEYS.userProfile + '_backup')
          if (backup) {
            const parsed = JSON.parse(backup)
            if (parsed && typeof parsed === 'object') {
              finalUserProfile = parsed as UserProfile
              await kvSetJSON(STORAGE_KEYS.userProfile, finalUserProfile)
              console.warn('[LittlePhone] 已从 localStorage 备份恢复 userProfile')
            }
          }
        }
      } catch {
        // ignore
      }

      // 音乐：读取已保存的列表
      // 优先从 IndexedDB 读取，如果失败则从 localStorage 备份恢复
      let nextPlaylist = await kvGetJSONDeep<Song[]>(MUSIC_STORAGE_KEY, null as any)
      console.log('[Music] Loaded from IndexedDB:', nextPlaylist?.length || 0, 'songs')
      
      // 如果 IndexedDB 没有数据，尝试从 localStorage 备份恢复
      if (!nextPlaylist || !Array.isArray(nextPlaylist) || nextPlaylist.length === 0) {
        try {
          const backup = localStorage.getItem(MUSIC_STORAGE_KEY + '_backup')
          if (backup) {
            const parsed = JSON.parse(backup)
            if (Array.isArray(parsed) && parsed.length > 0) {
              nextPlaylist = parsed
              console.log('[Music] Restored from localStorage backup:', nextPlaylist.length, 'songs')
              // 同步回 IndexedDB
              await kvSetJSON(MUSIC_STORAGE_KEY, nextPlaylist)
            }
          }
        } catch (e) {
          console.error('[Music] Failed to restore from backup:', e)
        }
      }
      
      // 如果仍然没有任何歌曲，使用默认列表
      if (!nextPlaylist || !Array.isArray(nextPlaylist) || nextPlaylist.length === 0) {
        console.log('[Music] No saved songs, using defaults')
        nextPlaylist = [...DEFAULT_SONGS]
      } else {
        // 打印用户导入的歌曲（非默认）
        const userSongs = nextPlaylist.filter(s => s.source === 'url' || s.source === 'data')
        if (userSongs.length > 0) {
          console.log('[Music] User imported songs:', userSongs.length, userSongs.map(s => s.title))
        }
      }
      
      // 更新版本号（仅记录，不强制重置）
      await kvSetJSON(MUSIC_VERSION_KEY, CURRENT_MUSIC_VERSION)
      // 合并 hydration 前新增歌曲（避免覆盖）
      try {
        const pending = pendingAddedSongsRef.current || []
        if (pending.length > 0) {
          const seen = new Set<string>()
          const merged: Song[] = []
          const push = (s: Song) => {
            const k = `${s.id}::${s.url}`
            if (seen.has(k)) return
            seen.add(k)
            merged.push(s)
          }
          for (const s of nextPlaylist || []) push(s)
          for (const s of pending) push(s)
          nextPlaylist = merged
          pendingAddedSongsRef.current = []
        }
      } catch {
        // ignore
      }
      // 兼容：blob URL 不能跨刷新持久化；ogg 在部分浏览器（尤其 iOS）不可播放
      try {
        const probe = document.createElement('audio')
        const canOgg = !!probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') !== ''
        nextPlaylist = (nextPlaylist || []).filter((s) => {
          if (!s?.url) return false
          if (typeof s.url !== 'string') return false
          if (s.url.startsWith('blob:')) return false
          // 仅过滤内置 ogg；自定义/外链让用户自己尝试
          if (!canOgg && (s.source === 'builtin' || !s.source) && s.url.toLowerCase().endsWith('.ogg')) return false
          return true
        })
        if (nextPlaylist.length === 0) {
          nextPlaylist = [...DEFAULT_SONGS].filter(s => typeof s.url === 'string' && !s.url.toLowerCase().endsWith('.ogg'))
        }
      } catch {
        // ignore
      }

      if (cancelled) return
      setLLMConfigState(nextLLM)
      setTTSConfigState(nextTTS)
      setMiCoinBalance(nextMi)
      setCurrentFontState(FONT_OPTIONS.find(f => f.id === nextFontId) || currentFont)
      setFontColorState(COLOR_OPTIONS.find(c => c.id === nextColorId) || fontColor)
      setFontSizeTierState((nextFontSizeTier === 'small' || nextFontSizeTier === 'medium' || nextFontSizeTier === 'large' || nextFontSizeTier === 'xlarge') ? nextFontSizeTier : 'medium')
      setGlassOpacityState(Number.isFinite(Number(nextGlassOpacity)) ? Math.max(0, Math.min(100, Number(nextGlassOpacity))) : 25)
      const fixedLocation = { ...(nextLocation as any), mode: 'manual' } as LocationSettings
      setLocationSettingsState(fixedLocation)
      // weather：如果已保存过手动天气（weather.updatedAt>0），优先尊重；否则用手动配置生成一个
      if (nextWeather && typeof nextWeather.updatedAt === 'number' && nextWeather.updatedAt > 0) {
        setWeather(nextWeather)
      } else {
        // 这里不调用 refreshWeather（避免依赖顺序），直接生成
        try {
          const t = typeof fixedLocation.manualTempC === 'number' && Number.isFinite(fixedLocation.manualTempC) ? fixedLocation.manualTempC : 18
          const type = fixedLocation.manualWeatherType || 'sunny'
          const map: Record<ManualWeatherType, { desc: string; icon: string }> = {
            sunny: { desc: '晴', icon: '☀️' },
            cloudy: { desc: '多云', icon: '⛅' },
            rain: { desc: '下雨', icon: '🌧️' },
            snow: { desc: '下雪', icon: '❄️' },
            fog: { desc: '有雾', icon: '🌫️' },
            storm: { desc: '雷雨', icon: '⛈️' },
          }
          const w = map[type] || map.sunny
          setWeather({
            temp: `${Math.round(t)}°`,
            desc: w.desc,
            icon: w.icon,
            city: String(fixedLocation.manualCity || '').trim() || '未知',
            updatedAt: Date.now(),
          })
        } catch {
          setWeather(nextWeather)
        }
      }
      setMusicPlaylist(nextPlaylist)
      setMusicPlayModeState(
        nextMusicPlayMode === 'order' || nextMusicPlayMode === 'shuffle' || nextMusicPlayMode === 'repeat_one'
          ? nextMusicPlayMode
          : 'order'
      )
      // 加载自定义壁纸、图标等
      if (nextWallpaper) setWallpaper(nextWallpaper)
      setCustomAppIconsLayout1(finalLayout1)
      setCustomAppIconsLayout2(finalLayout2)
      // 唱片封面迁移：旧版是单图，新版是排版1/2分离。
      // 规则：若 layout1/2 为空且 legacy 有值，则两边都用 legacy 初始化，避免丢图。
      const sanitizeDecor = async (raw: any) => {
        let out = String(raw || '')
        if (!out) return ''
        try {
          // 老图过大时自动压缩，避免音乐页首开卡顿
          if (out.startsWith('data:image/') && out.length > 180_000) {
            out = await compressDataUrlToDataUrl(out, {
              maxSide: 320,
              mimeType: 'image/webp',
              quality: 0.5,
            })
          }
        } catch {
          // ignore and keep original
        }
        return out
      }
      const legacyDecor = await sanitizeDecor(nextDecorImageLegacy)
      const d1Raw = String(nextDecorImageLayout1 || '').trim() || legacyDecor
      const d2Raw = String(nextDecorImageLayout2 || '').trim() || legacyDecor
      const d1 = await sanitizeDecor(d1Raw)
      const d2 = await sanitizeDecor(d2Raw)
      setDecorImageLayout1(d1)
      setDecorImageLayout2(d2)
      if (nextHomeAvatar) setHomeAvatar(nextHomeAvatar)
      if (nextSignature) setSignature(nextSignature)
      // 喝水计数 - 检查是否新的一天
      const today = new Date().toISOString().slice(0, 10)
      if (nextWaterDate === today) {
        setWaterCount(nextWaterCount || 0)
        setWaterDate(today)
      } else {
        // 新的一天，重置计数
        setWaterCount(0)
        setWaterDate(today)
      }
      if (finalUserProfile) setUserProfileState(finalUserProfile)
      if (nextIconTheme) setIconThemeState(nextIconTheme)
      if (Array.isArray(nextAnniversaries)) setAnniversaries(nextAnniversaries)
      if (nextMemo) setMemoState({ ...defaultMemo, ...nextMemo, todos: nextMemo.todos || [] })
      // 加载自定义字体
      if (Array.isArray(nextCustomFonts) && nextCustomFonts.length > 0) {
        setCustomFonts(nextCustomFonts)
        // 注入 CSS @font-face 规则
        nextCustomFonts.forEach(font => injectCustomFontStyle(font))
      }
      // 如果当前选中的是自定义字体，需要从 customFonts 中找到
      if (nextFontId?.startsWith('custom-') && nextCustomFonts) {
        const customFont = nextCustomFonts.find((f: CustomFont) => f.id === nextFontId)
        if (customFont) {
          setCurrentFontState({
            id: customFont.id,
            name: customFont.name,
            fontFamily: customFont.fontFamily,
            preview: '自定义字体 ABC 123',
          })
        }
      }
      setIsHydrated(true)
    }
    void hydrate()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 异步持久化（IndexedDB）
  // 关键：必须等 hydration 完成后再开始自动保存，否则会把“初始默认值”写回 KV 覆盖导入数据
  const isImporting = () => !!(window as any).__LP_IMPORTING__
  const canPersist = () => isHydrated && !isImporting()
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.llmConfig, llmConfig) }, [llmConfig, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.ttsConfig, ttsConfig) }, [ttsConfig, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.miCoinBalance, miCoinBalance) }, [miCoinBalance, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.currentFontId, currentFont.id) }, [currentFont.id, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.fontColorId, fontColor.id) }, [fontColor.id, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.fontSizeTier, fontSizeTier) }, [fontSizeTier, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.glassOpacity, glassOpacity) }, [glassOpacity, isHydrated])
  // 壁纸、自定义图标等持久化
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.wallpaper, wallpaper) }, [wallpaper, isHydrated])
  // 新版：按排版分别存两份（旧 key 仅用于兼容读取，不再写回）
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.customAppIconsLayout1, customAppIconsLayout1) }, [customAppIconsLayout1, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.customAppIconsLayout2, customAppIconsLayout2) }, [customAppIconsLayout2, isHydrated])
  // 新版按排版持久化；旧 key 仅做兼容读取，不再写回
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.decorImageLayout1, decorImageLayout1) }, [decorImageLayout1, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.decorImageLayout2, decorImageLayout2) }, [decorImageLayout2, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.homeAvatar, homeAvatar) }, [homeAvatar, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.signature, signature) }, [signature, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.waterCount, waterCount) }, [waterCount, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.waterDate, waterDate) }, [waterDate, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.userProfile, userProfile) }, [userProfile, isHydrated])
  // 关键：我的资料也备份到 localStorage（防止 IndexedDB 被系统清理导致“我的资料/人设”丢失）
  useEffect(() => {
    if (!canPersist()) return
    try {
      localStorage.setItem(STORAGE_KEYS.userProfile + '_backup', JSON.stringify(userProfile))
    } catch {
      // ignore quota errors
    }
  }, [userProfile, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.iconTheme, iconTheme) }, [iconTheme, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.anniversaries, anniversaries) }, [anniversaries, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.memo, memo) }, [memo, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.customFonts, customFonts) }, [customFonts, isHydrated])

  const setCurrentFont = (font: FontOption) => setCurrentFontState(font)
  const setFontSizeTier = (tier: FontSizeTier) => setFontSizeTierState(tier)
  const setGlassOpacity = (opacity: number) => setGlassOpacityState(Math.max(0, Math.min(100, Math.round(Number(opacity) || 0))))
  const setIconTheme = (theme: IconTheme) => setIconThemeState(theme)
  
  // 自定义字体管理
  const addCustomFont = (font: Omit<CustomFont, 'id' | 'createdAt'>): CustomFont => {
    const newFont: CustomFont = {
      ...font,
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
    }
    // 注入 CSS 规则
    injectCustomFontStyle(newFont)
    setCustomFonts(prev => [...prev, newFont])
    return newFont
  }
  
  const removeCustomFont = (id: string) => {
    // 如果当前使用的是这个字体，切换回默认字体
    if (currentFont.id === id) {
      setCurrentFontState(FONT_OPTIONS.find(f => f.id === 'elegant') || FONT_OPTIONS[0])
    }
    // 移除 CSS 规则
    removeCustomFontStyle(id)
    setCustomFonts(prev => prev.filter(f => f.id !== id))
  }
  
  // 获取所有字体选项（内置 + 自定义）
  const getAllFontOptions = (): FontOption[] => {
    const customOptions: FontOption[] = customFonts.map(f => ({
      id: f.id,
      name: f.name,
      fontFamily: `"${f.fontFamily}", sans-serif`,
      preview: '自定义字体 ABC 123',
    }))
    return [...FONT_OPTIONS, ...customOptions]
  }
  
  // 喝水计数
  const addWater = () => {
    const today = new Date().toISOString().slice(0, 10)
    if (waterDate !== today) {
      // 新的一天，重置
      setWaterCount(1)
      setWaterDate(today)
    } else {
      setWaterCount(prev => prev + 1)
    }
  }
  
  // 纪念日操作
  const addAnniversary = (anniversary: Omit<Anniversary, 'id'>) => {
    const newAnniversary: Anniversary = { ...anniversary, id: `ann-${Date.now()}` }
    setAnniversaries(prev => [...prev, newAnniversary])
  }
  const updateAnniversary = (id: string, updates: Partial<Anniversary>) => {
    setAnniversaries(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
  }
  const removeAnniversary = (id: string) => {
    setAnniversaries(prev => prev.filter(a => a.id !== id))
  }
  
  // 备忘录操作
  const setMemo = (updates: Partial<Memo>) => {
    setMemoState(prev => ({ ...prev, ...updates }))
  }
  const setFontColor = (color: ColorOption) => setFontColorState(color)
  
  // 持久化：音乐列表（IndexedDB）
  useEffect(() => {
    if (!canPersist()) return
    void kvSetJSON(MUSIC_STORAGE_KEY, musicPlaylist)
    void kvSetJSON(MUSIC_VERSION_KEY, CURRENT_MUSIC_VERSION)
  }, [musicPlaylist, isHydrated])

  useEffect(() => {
    if (!canPersist()) return
    void kvSetJSON(MUSIC_PLAY_MODE_KEY, musicPlayMode)
  }, [musicPlayMode, isHydrated])

  // 检查壁纸图片是否存在
  useEffect(() => {
    const img = new Image()
    img.onload = () => setWallpaperError(false)
    img.onerror = () => {
      setWallpaperError(true)
      setWallpaper(FALLBACK_WALLPAPER)
    }
    img.src = DEFAULT_WALLPAPER
  }, [])

  // 校验当前壁纸：避免“更新后壁纸突然全黑/丢失”
  useEffect(() => {
    const w = String(wallpaper || '').trim()
    if (!w) {
      setWallpaperError(true)
      setWallpaper(FALLBACK_WALLPAPER)
      return
    }
    const isImageUrl =
      w.startsWith('data:') ||
      w.startsWith('http') ||
      w.startsWith('blob') ||
      w.startsWith('/')
    if (!isImageUrl) {
      setWallpaperError(false)
      return
    }
    // blob: 跨刷新不可用，容易变黑：直接降级为 fallback（避免用户看到黑屏）
    if (w.startsWith('blob:')) {
      setWallpaperError(true)
      setWallpaper(FALLBACK_WALLPAPER)
      return
    }
    const img = new Image()
    img.onload = () => setWallpaperError(false)
    img.onerror = () => {
      setWallpaperError(true)
      setWallpaper(FALLBACK_WALLPAPER)
    }
    img.src = w
  }, [wallpaper])

  // 初始化音频元素
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.addEventListener('timeupdate', () => {
        if (audioRef.current && audioRef.current.duration) {
          setMusicProgress((audioRef.current.currentTime / audioRef.current.duration) * 100)
        }
      })
      audioRef.current.addEventListener('ended', () => {
        // 若开启 loop（例如“一起听歌”），不要切下一首
        if (audioRef.current?.loop) {
          return
        }
        const playlist = musicPlaylistRef.current || []
        const cur = currentSongRef.current
        if (!cur || playlist.length === 0) {
          setMusicPlaying(false)
          setMusicProgress(0)
          return
        }

        const mode = musicPlayModeRef.current || 'order'

        // 单曲循环：不依赖 audio.loop，避免与“一起听歌”逻辑冲突
        if (mode === 'repeat_one' || playlist.length === 1) {
          try {
            const audio = audioRef.current
            if (!audio) return
            audio.currentTime = 0
            const p = audio.play()
            if (p && typeof (p as any).catch === 'function') (p as any).catch(() => {})
            setMusicPlaying(true)
          } catch {
            // ignore
          }
          return
        }

        const currentIndex = playlist.findIndex(s => s.id === cur.id)
        const pickShuffleIndex = () => {
          if (playlist.length <= 1) return 0
          const base = currentIndex >= 0 ? currentIndex : 0
          let idx = base
          for (let tries = 0; tries < 6; tries++) {
            idx = Math.floor(Math.random() * playlist.length)
            if (idx !== base) break
          }
          return idx
        }

        const nextIndex =
          mode === 'shuffle'
            ? pickShuffleIndex()
            : (currentIndex >= 0 ? (currentIndex + 1) % playlist.length : 0)

        playSong(playlist[nextIndex])
      })
      // 添加错误监听
      audioRef.current.addEventListener('error', (e) => {
        const audio = e.target as HTMLAudioElement
        console.error('Audio error:', audio.error?.code, audio.error?.message, 'src:', audio.src)
      })
      audioRef.current.addEventListener('canplay', () => {
        console.log('Audio can play now')
      })
    }
  }, [currentSong, musicPlaylist])

  const cycleMusicPlayMode = () => {
    setMusicPlayModeState(prev => (prev === 'order' ? 'shuffle' : prev === 'shuffle' ? 'repeat_one' : 'order'))
  }

  const setUserProfile = (profile: Partial<UserProfile>) => setUserProfileState((prev) => ({ ...prev, ...profile }))
  const setLLMConfig = (config: Partial<LLMConfig>) =>
    setLLMConfigState((prev) => {
      const next = { ...prev, ...config }
      // 先合并 apiInterface，再按接口类型归一化 baseUrl
      if (typeof config.apiInterface === 'string') {
        next.apiInterface = config.apiInterface
      }
      if (typeof config.apiBaseUrl === 'string') {
        next.apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl, next.apiInterface)
      } else if (typeof config.apiInterface === 'string' && typeof next.apiBaseUrl === 'string') {
        // 只改了接口类型：也要重新归一化一下 baseUrl（例如 /v1 ↔ /v1beta ↔ /api）
        next.apiBaseUrl = normalizeApiBaseUrl(next.apiBaseUrl, next.apiInterface)
      }
      return next
    })
  const setTTSConfig = (config: Partial<TTSConfig>) =>
    setTTSConfigState((prev) => ({ ...prev, ...config }))
  
  // MiniMax 语音合成函数
  // 根据区域获取 API 基础 URL
  const getTTSBaseUrl = () => {
    return ttsConfig.region === 'global' 
      ? 'https://api.minimax.chat'  // 海外版
      : 'https://api.minimaxi.com'   // 国内版
  }
  
  const textToSpeech = async (text: string): Promise<string | null> => {
    if (!ttsConfig.enabled || !ttsConfig.apiKey || !text.trim()) return null
    
    const controller = new AbortController()
    const timeoutMs = 45_000
    const t = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      const baseUrl = getTTSBaseUrl()
      const response = await fetch(`${baseUrl}/v1/t2a_v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ttsConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: ttsConfig.model || 'speech-02-turbo',
          text: text.slice(0, 1000), // 限制长度避免费用过高
          stream: false,
          voice_setting: {
            voice_id: ttsConfig.voiceId || 'female-shaonv',
            speed: ttsConfig.speed || 1,
            vol: 1,
            pitch: 0,
          },
          audio_setting: {
            sample_rate: 24000,
            bitrate: 128000,
            format: 'mp3',
            channel: 1,
          },
          output_format: 'url',  // 返回 URL 格式，更方便播放
        }),
      })
      if (!response.ok) {
        console.error('TTS API error:', response.status)
        return null
      }
      
      const data = await response.json()
      if (data.base_resp?.status_code !== 0) {
        console.error('TTS error:', data.base_resp?.status_msg)
        return null
      }
      
      // 如果返回 URL
      if (data.data?.audio && typeof data.data.audio === 'string') {
        // 如果是 hex 编码的音频，转换为 blob URL
        if (!data.data.audio.startsWith('http')) {
          const bytes = new Uint8Array(data.data.audio.match(/.{1,2}/g)?.map((byte: string) => parseInt(byte, 16)) || [])
          const blob = new Blob([bytes], { type: 'audio/mp3' })
          return URL.createObjectURL(blob)
        }
        return data.data.audio
      }
      
      return null
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        console.error('TTS timeout')
        return null
      }
      console.error('TTS failed:', err)
      return null
    } finally {
      window.clearTimeout(t)
    }
  }
  
  const addMiCoins = (amount: number) => setMiCoinBalance((prev) => prev + amount)
  const addNotification = (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    setNotifications((prev) => [{ ...notification, id: crypto.randomUUID(), timestamp: Date.now(), read: false }, ...prev])
  }
  const markNotificationRead = (id: string) => setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)))
  const addChatMessage = (message: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number }) => {
    setChatLog((prev) => [...prev, { ...message, id: crypto.randomUUID(), timestamp: message.timestamp ?? Date.now() }])
  }
  const updateIntimacy = (characterId: string, delta: number) => {
    setCharacters((prev) => prev.map((char) => char.id === characterId ? { ...char, intimacy: Math.min(100, Math.max(0, char.intimacy + delta)) } : char))
  }
  const setCustomAppIconForLayout = (layout: 'layout1' | 'layout2', appId: string, iconUrl: string) => {
    if (layout === 'layout2') {
      setCustomAppIconsLayout2((prev) => ({ ...prev, [appId]: iconUrl }))
    } else {
      setCustomAppIconsLayout1((prev) => ({ ...prev, [appId]: iconUrl }))
    }
  }
  // 兼容旧调用：默认修改“当前排版”的那一份
  const setCustomAppIcon = (appId: string, iconUrl: string) => {
    const theme = iconThemeRef.current || iconTheme
    setCustomAppIconForLayout(theme === 'minimal' ? 'layout2' : 'layout1', appId, iconUrl)
  }
  const setDecorImageForLayout = (layout: 'layout1' | 'layout2', url: string) => {
    if (layout === 'layout2') setDecorImageLayout2(String(url || ''))
    else setDecorImageLayout1(String(url || ''))
  }
  // 兼容旧调用：默认修改“当前排版”的那一份
  const setDecorImage = (url: string) => {
    const theme = iconThemeRef.current || iconTheme
    setDecorImageForLayout(theme === 'minimal' ? 'layout2' : 'layout1', url)
  }

  // 音乐控制函数
  const playSong = (song: Song) => {
    if (!audioRef.current) return
    
    const audio = audioRef.current
    
    // 先停止当前播放
    audio.pause()
    audio.currentTime = 0
    
    // 设置新的音频源 - 根据来源决定是否编码
    let audioUrl = song.url
    if (song.url.startsWith('blob:') || song.url.startsWith('http://') || song.url.startsWith('https://')) {
      audioUrl = song.url
    } else if (song.url.startsWith('data:')) {
      audioUrl = song.url
    } else {
      audioUrl = encodeURI(song.url).replace(/#/g, '%23')
    }
    
    console.log('[Music] Loading:', audioUrl.slice(0, 80))
    
    // 移动端兼容：不设置 crossOrigin，让浏览器用默认策略
    audio.crossOrigin = null
    audio.src = audioUrl
    
    // 移动端需要先 load 再 play
    audio.load()
    
    // 更新状态（先设置，让UI响应）
    setCurrentSong(song)
    setMusicPlaying(true)
    setMusicProgress(0)
    
    // 等待 canplay 事件再播放（移动端更可靠）
    const tryPlay = () => {
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[Music] Playing:', song.title)
          })
          .catch((error) => {
            console.error('[Music] Play failed:', error.message || error)
            // 移动端常见错误：用户未交互
            if (error.name === 'NotAllowedError') {
              console.warn('[Music] 需要用户先点击页面才能播放音频（移动端限制）')
              // 不要设置 musicPlaying = false，让用户可以手动点播放
            }
          })
      }
    }
    
    // 如果已经可以播放，直接播放；否则等 canplay 事件
    if (audio.readyState >= 3) {
      tryPlay()
    } else {
      audio.addEventListener('canplay', tryPlay, { once: true })
      // 超时处理：5秒后如果还没 canplay，也尝试播放
      setTimeout(() => {
        if (audio.src === audioUrl && audio.paused) {
          tryPlay()
        }
      }, 5000)
    }
  }

  const pauseMusic = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      setMusicPlaying(false)
    }
  }

  const resumeMusic = () => {
    if (audioRef.current && currentSong) {
      const playPromise = audioRef.current.play()
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setMusicPlaying(true)
          })
          .catch((error) => {
            console.error('[Music] Resume failed:', error.message || error)
          })
      } else {
        setMusicPlaying(true)
      }
    }
  }

  const toggleMusic = () => {
    if (musicPlaying) {
      pauseMusic()
    } else if (currentSong) {
      resumeMusic()
    } else if (musicPlaylist.length > 0) {
      playSong(musicPlaylist[0])
    }
  }

  const nextSong = () => {
    if (!musicPlaylist || musicPlaylist.length === 0) return
    if (musicPlayMode === 'repeat_one' && currentSong) {
      playSong(currentSong)
      return
    }
    const currentIndex = musicPlaylist.findIndex(s => s.id === currentSong?.id)
    if (musicPlayMode === 'shuffle') {
      if (musicPlaylist.length === 1) {
        playSong(musicPlaylist[0])
        return
      }
      const base = currentIndex >= 0 ? currentIndex : 0
      let idx = base
      for (let tries = 0; tries < 6; tries++) {
        idx = Math.floor(Math.random() * musicPlaylist.length)
        if (idx !== base) break
      }
      playSong(musicPlaylist[idx])
      return
    }
    const nextIndex = (currentIndex >= 0 ? currentIndex + 1 : 0) % musicPlaylist.length
    playSong(musicPlaylist[nextIndex])
  }

  const prevSong = () => {
    if (!musicPlaylist || musicPlaylist.length === 0) return
    if (musicPlayMode === 'repeat_one' && currentSong) {
      playSong(currentSong)
      return
    }
    const currentIndex = musicPlaylist.findIndex(s => s.id === currentSong?.id)
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : musicPlaylist.length - 1
    playSong(musicPlaylist[prevIndex])
  }

  const seekMusic = (progress: number) => {
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = (progress / 100) * audioRef.current.duration
      setMusicProgress(progress)
    }
  }

  const toggleFavorite = (songId: string) => {
    setMusicFavorites(prev => 
      prev.includes(songId) 
        ? prev.filter(id => id !== songId)
        : [...prev, songId]
    )
  }

  const isFavorite = (songId: string) => musicFavorites.includes(songId)

  const addSong = (song: Song) => {
    const normalized: Song = {
      ...song,
      source: song.source || (song.url?.startsWith('data:') ? 'data' : song.url?.startsWith('http') ? 'url' : 'builtin'),
    }
    if (!isHydrated) {
      pendingAddedSongsRef.current = [...(pendingAddedSongsRef.current || []), normalized]
    }
    setMusicPlaylist(prev => {
      const next = [...prev, normalized]
      
      // 立即持久化
      void (async () => {
        // 保存到 IndexedDB
        try {
          await kvSetJSON(MUSIC_STORAGE_KEY, next)
          await kvSetJSON(MUSIC_VERSION_KEY, CURRENT_MUSIC_VERSION)
          console.log('[Music] Saved to IndexedDB:', next.length, 'songs')
        } catch (e) {
          console.error('[Music] IndexedDB save failed:', e)
        }
        
        // 备份到 localStorage（只保存 URL 类型的歌曲，不保存 base64 以避免超限）
        try {
          const urlOnlySongs = next.filter(s => s.source === 'url' || s.source === 'builtin' || !s.url?.startsWith('data:'))
          localStorage.setItem(MUSIC_STORAGE_KEY + '_backup', JSON.stringify(urlOnlySongs))
          console.log('[Music] Backup to localStorage:', urlOnlySongs.length, 'URL songs')
        } catch (e) {
          // localStorage 可能已满，忽略
          console.warn('[Music] localStorage backup skipped (may be full)')
        }
      })()
      return next
    })
  }

  const removeSong = (songId: string) => {
    // 如果删除的是当前播放的歌，先停止播放
    if (currentSong?.id === songId) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      setCurrentSong(null)
      setMusicPlaying(false)
      setMusicProgress(0)
    }
    setMusicPlaylist(prev => prev.filter(s => s.id !== songId))
    // 同时从收藏中移除
    setMusicFavorites(prev => prev.filter(id => id !== songId))
  }

  // 位置设置
  const setLocationSettings = (settings: Partial<LocationSettings>) => {
    setLocationSettingsState(prev => {
      // 移除自动定位：强制保持 manual
      const next = { ...prev, ...settings, mode: 'manual' as const }
      // 位置改动后立即同步天气城市，避免主页面仍显示旧城市（如“北京”）
      setWeather(getManualWeather(next))
      if (!!(window as any).__LP_IMPORTING__) return next
      void kvSetJSON(LOCATION_STORAGE_KEY, next)
      void kvSetJSON(WEATHER_STORAGE_KEY, getManualWeather(next))
      return next
    })
  }

  const getManualWeather = (settings: LocationSettings): WeatherData => {
    const t = typeof settings.manualTempC === 'number' && Number.isFinite(settings.manualTempC) ? settings.manualTempC : 18
    const type = settings.manualWeatherType || 'sunny'
    const map: Record<ManualWeatherType, { desc: string; icon: string }> = {
      sunny: { desc: '晴', icon: '☀️' },
      cloudy: { desc: '多云', icon: '⛅' },
      rain: { desc: '下雨', icon: '🌧️' },
      snow: { desc: '下雪', icon: '❄️' },
      fog: { desc: '有雾', icon: '🌫️' },
      storm: { desc: '雷雨', icon: '⛈️' },
    }
    const w = map[type] || map.sunny
    return {
      temp: `${Math.round(t)}°`,
      desc: w.desc,
      icon: w.icon,
      city: String(settings.manualCity || '').trim() || '未知',
      updatedAt: Date.now(),
    }
  }

  // 刷新天气
  const refreshWeather = async () => {
    // 避免并发刷新导致“看起来没反应/被覆盖”
    if ((refreshWeather as any).__inFlight) return
    ;(refreshWeather as any).__inFlight = true
    try {
      const newWeather = getManualWeather(locationSettings)
      setWeather(newWeather)
      void kvSetJSON(WEATHER_STORAGE_KEY, newWeather)
    } catch (error) {
      console.error('获取天气失败:', error)
      // 兜底：仍然给 UI 一个“可见变化”
      const newWeather = { ...getManualWeather(locationSettings), desc: '获取失败', icon: '⚠️', updatedAt: Date.now() }
      setWeather(newWeather)
      void kvSetJSON(WEATHER_STORAGE_KEY, newWeather)
    } finally {
      ;(refreshWeather as any).__inFlight = false
    }
  }

  // 注意：天气支持手动设置，因此不再自动刷新覆盖用户自定义值

  // 获取可用模型列表
  const fetchAvailableModels = async (override?: { apiBaseUrl?: string; apiKey?: string; apiInterface?: LLMApiInterface }): Promise<string[]> => {
    const apiInterface = override?.apiInterface ?? llmConfig.apiInterface ?? 'openai_compatible'
    const base = normalizeApiBaseUrl(override?.apiBaseUrl ?? llmConfig.apiBaseUrl, apiInterface)
    const key = override?.apiKey ?? llmConfig.apiKey
    if (!base || !key) throw new Error('请先在「设置 -> API 配置」中填写 Base URL 和 API Key')

    // Ollama：/api/tags
    if (apiInterface === 'ollama') {
      const response = await fetch(`${base}/tags`, { method: 'GET' })
      if (!response.ok) throw new Error(`请求失败: ${response.status}`)
      const data = await response.json().catch(() => ({}))
      const models = Array.isArray(data?.models) ? data.models : []
      return models.map((m: any) => m?.name).filter(Boolean)
    }

    // Gemini 原生：GET /models?key=...
    if (apiInterface === 'gemini_native') {
      const url = `${base}/models?key=${encodeURIComponent(key)}`
      const response = await fetch(url, { method: 'GET' })
      if (!response.ok) throw new Error(`请求失败: ${response.status}${response.status === 401 ? '（未授权：请检查 API Key / 权限）' : ''}`)
      const data = await response.json().catch(() => ({}))
      const models = Array.isArray(data?.models) ? data.models : []
      // 返回形如 "models/gemini-..." 的 name
      const ids = models.map((m: any) => m?.name).filter(Boolean)
      return ids.length ? ids : []
    }

    // Anthropic 原生：GET /models（如果上游不支持，让上层 UI 走兜底列表）
    if (apiInterface === 'anthropic_native') {
      const response = await fetch(`${base}/models`, {
        method: 'GET',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      })
      if (!response.ok) throw new Error(`请求失败: ${response.status}${response.status === 401 ? '（未授权：请检查 API Key / 权限）' : ''}`)
      const data = await response.json().catch(() => ({}))
      if (Array.isArray(data?.data)) return data.data.map((m: any) => m?.id).filter(Boolean)
      if (Array.isArray(data?.models)) return data.models.map((m: any) => m?.id || m?.name).filter(Boolean)
      throw new Error('返回数据格式错误')
    }

    const fetchViaProxy = async (): Promise<string[]> => {
      const proxyRes = await fetch('/api/llm/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiBaseUrl: override?.apiBaseUrl ?? llmConfig.apiBaseUrl, apiKey: key }),
      })
      const text = await proxyRes.text().catch(() => '')
      let data: any = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = { error: { message: '同域转发返回非 JSON' }, raw: String(text || '').slice(0, 300) }
      }
      if (!proxyRes.ok) {
        const e: any = new Error(data?.error?.message || `请求失败: ${proxyRes.status}`)
        e.status = proxyRes.status
        e.phase = 'models'
        throw e
      }
      if (data.data && Array.isArray(data.data)) {
        return data.data.map((m: any) => m.id).filter(Boolean)
      }
      throw new Error(data?.error?.message || '返回数据格式错误（同域转发）')
    }

    try {
      // HTTPS 页面 + HTTP Base URL：浏览器会拦截混合内容，必须走同域转发
      if (window.location.protocol === 'https:' && base.trim().toLowerCase().startsWith('http://')) {
        return await fetchViaProxy()
      }
      const response = await fetch(`${base}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        let msg = ''
        try {
          const j = text ? JSON.parse(text) : {}
          msg = j?.error?.message || j?.message || ''
        } catch {
          msg = ''
        }
        const e: any = new Error(msg || `请求失败: ${response.status}${response.status === 401 ? '（未授权：请检查 API Key / 权限）' : ''}`)
        e.status = response.status
        e.phase = 'models'
        throw e
      }
      
      const data = await response.json()
      
      if (data.data && Array.isArray(data.data)) {
        const modelIds = data.data.map((m: any) => m.id).filter(Boolean)
        // 安全：这里绝不改用户已保存的 Base/Key/Model（避免“自动换成更贵模型”等风险）
        return modelIds
      } else {
        throw new Error('返回数据格式错误')
      }
    } catch (error: any) {
      // 同域转发兜底：解决 CORS / 部分机型“Failed to fetch”
      try {
        return await fetchViaProxy()
      } catch (e2: any) {
        const msg2 = String(e2?.message || '')
        if (msg2) throw new Error(msg2)
      }
      // 给上层 UI 统一一个“可读版本”
      const pretty = summarizeLLMError(error, {
        apiInterface,
        baseUrl: override?.apiBaseUrl ?? llmConfig.apiBaseUrl,
        model: '',
        phase: 'models',
      })
      throw new Error(pretty)
    }
  }

  const callLLMWithConfig = async (
    cfg: { apiBaseUrl: string; apiKey: string; apiInterface: LLMApiInterface; selectedModel: string },
    messages: {
      role: string
      content:
        | string
        | Array<{
            type: string
            text?: string
            image_url?: { url: string }
            imageUrl?: { url: string }
          }>
    }[],
    options?: { temperature?: number; maxTokens?: number; timeoutMs?: number; __disableAutoContinue?: boolean }
  ): Promise<string> => {
    const apiInterface = cfg.apiInterface ?? 'openai_compatible'
    const base = normalizeApiBaseUrl(cfg.apiBaseUrl, apiInterface)
    const key = cfg.apiKey
    if (!base || !key) throw new Error('请先在「设置 -> API 配置」中填写 Base URL 和 API Key')

    const callCore = async (selectedModel: string): Promise<string> => {
      if (!selectedModel) throw new Error('请先选择一个模型')

      try {
      const maxTokens = options?.maxTokens ?? 900
      const temperature = options?.temperature ?? 0.7
      const disableAutoContinue = !!options?.__disableAutoContinue

      const hasStrongSentenceEnd = (s: string) => {
        const t = String(s || '').trim()
        if (!t) return false
        return /[。！？!?…~～.\])】）”’"'`]\s*$/.test(t)
      }
      const endsLikeConnector = (s: string) => {
        const t = String(s || '').trim()
        if (!t) return false
        return (
          /[，,、；;：:]\s*$/.test(t) ||
          /(的|了|着|过|在|和|跟|与|并|而|但|或|又|就|也|都|把|被|给|让|向|对|到|从|由|为|中|里|上|下|前|后|吗|呢|嘛|啊|呀|吧|吃的|说的|写的|讲的)\s*$/i.test(t) ||
          /(and|or|to|of|for|with|in|on|at|is|are|was|were|be|been|being|the|a|an)\s*$/i.test(t)
        )
      }
      const likelyTruncated = (s: string, finishReason?: any) => {
        const t = String(s || '').trim()
        if (!t) return false
        const fr = String(finishReason || '').toLowerCase()
        if (fr === 'length' || fr === 'max_tokens') return true
        // 明显是结构化指令/卡片，不做补写，避免误伤
        if (/^\[(转账|音乐|推文|推特主页|X主页|外卖)/.test(t)) return false
        if (t.length < 18) return false
        if (hasStrongSentenceEnd(t)) return false
        const lastLine = t.split('\n').pop()?.trim() || t
        if (lastLine.length <= 2) return false
        return endsLikeConnector(lastLine)
      }
      const cutOverlap = (base: string, tail: string) => {
        const a = String(base || '')
        const b = String(tail || '')
        const max = Math.min(80, a.length, b.length)
        for (let i = max; i >= 12; i--) {
          const head = b.slice(0, i)
          if (a.endsWith(head)) return b.slice(i)
        }
        return b
      }
      const mergeContinuation = (base: string, cont: string) => {
        const a = String(base || '').trimEnd()
        const b = cutOverlap(a, String(cont || '').trimStart())
        if (!b) return a
        if (!a) return b
        if (/[\u4e00-\u9fff]$/.test(a)) return `${a}${b}`
        if (/[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b)) return `${a} ${b}`
        return `${a}${b}`
      }
      const maybeContinueOnce = async (partial: string, finishReason?: any): Promise<string> => {
        const text = String(partial || '').trim()
        if (!text) return text
        if (disableAutoContinue) return text
        if (!likelyTruncated(text, finishReason)) return text
        try {
          const continueHint =
            '你上一条回复疑似被截断了。请只从中断处继续补完，不要重复前文，不要改写已输出内容。'
          const cont = await callLLMWithConfig(
            cfg,
            [
              ...messages,
              { role: 'assistant', content: text },
              { role: 'user', content: continueHint },
            ],
            {
              temperature: Math.min(0.7, temperature),
              maxTokens: Math.max(160, Math.min(600, Math.floor(maxTokens * 0.6))),
              timeoutMs: options?.timeoutMs ?? 600000,
              __disableAutoContinue: true,
            }
          )
          const ct = String(cont || '').trim()
          if (!ct) return text
          return mergeContinuation(text, ct).trim()
        } catch {
          return text
        }
      }
      
      // OpenAI 兼容中转“常见坑”：不支持多模态消息格式（content 为数组 / image_url）
      // 这里提供一个自动降级：遇到 400 且包含多模态内容时，重试一次“纯文本版”
      const downgradeMessagesToText = (ms: typeof messages) => {
        return ms.map((m) => {
          if (typeof m.content === 'string') return m
          if (!Array.isArray(m.content)) return { ...m, content: String((m as any).content || '') }
          const text = m.content
            .map((p: any) => {
              if (!p) return ''
              if (typeof p?.text === 'string' && p.text.trim()) return String(p.text)
              if (p?.type === 'image_url' || p?.type === 'image') return '[图片]'
              return ''
            })
            .filter(Boolean)
            .join('\n')
          return { ...m, content: text || '[图片]' }
        })
      }
      // ★ 全局安全网：从消息中剔除 GIF 图片（Gemini/中转不支持 image/gif）
      const _isGifUrl = (u: string) => /\.gif(\?|$)/i.test(u) || /^data:image\/gif/i.test(u)
      messages = messages.map(m => {
        if (!Array.isArray(m.content)) return m
        const hasGif = m.content.some((p: any) => {
          const url = p?.image_url?.url || p?.imageUrl?.url || ''
          return (p?.type === 'image_url' || p?.type === 'image') && _isGifUrl(url)
        })
        if (!hasGif) return m
        const filtered = m.content
          .filter((p: any) => {
            const url = p?.image_url?.url || p?.imageUrl?.url || ''
            return !((p?.type === 'image_url' || p?.type === 'image') && _isGifUrl(url))
          })
        filtered.push({ type: 'text', text: '[动图/GIF，已省略]' } as any)
        return { ...m, content: filtered }
      }) as typeof messages

      const hasMultimodal = messages.some(m => Array.isArray(m.content))

      // ====== 1) Ollama 原生 ======
      if (apiInterface === 'ollama') {
        const controller = new AbortController()
        const timeoutMs = options?.timeoutMs ?? 600000
        const t = window.setTimeout(() => controller.abort(), timeoutMs)
        const response = await fetch(`${base}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: selectedModel,
            messages: messages.map((m) => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
            stream: false,
            options: {
              temperature,
              num_predict: maxTokens,
            },
          }),
        })
        window.clearTimeout(t)
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          const e: any = new Error(text || `请求失败: ${response.status}`)
          e.status = response.status
          e.phase = 'chat'
          throw e
        }
        const data = await response.json().catch(() => ({}))
        const content = data?.message?.content ?? data?.response ?? ''
        const finalText = typeof content === 'string' ? content.trim() : ''
        if (!finalText) throw new Error('模型返回空内容（Ollama）')
        return await maybeContinueOnce(finalText)
      }

      // ====== 2) Gemini 原生 ======
      if (apiInterface === 'gemini_native') {
        // 排查阶段：Gemini 统一走同域转发（/api/llm/chat），并开启 stream=true
        // - 避免 Serverless “等完整响应”超时
        // - 后端会把 Gemini 流实时转换为 OpenAI SSE；这里把 SSE 读完再返回字符串
        const readOpenAISSE = async (resp: Response): Promise<string> => {
          try {
            return await readOpenAISSEToText(resp)
          } catch {
            // 兜底：保持旧行为（返回空串会触发更明确的错误提示）
            return ''
          }
        }

        const controller = new AbortController()
        const timeoutMs = options?.timeoutMs ?? 600000
        const t = window.setTimeout(() => controller.abort(), timeoutMs)
        try {
          const proxyRes = await fetch('/api/llm/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
            },
            signal: controller.signal,
            body: JSON.stringify({
              apiBaseUrl: cfg.apiBaseUrl,
              apiKey: key,
              apiInterface: 'gemini_native',
              payload: {
                model: selectedModel,
                messages,
                temperature,
                max_tokens: maxTokens,
                stream: true,
              },
            }),
          })

          const ct = String(proxyRes.headers.get('content-type') || '').toLowerCase()
          if (proxyRes.ok && ct.includes('text/event-stream')) {
            const sseText = (await readOpenAISSE(proxyRes)).trim()
            if (!sseText) throw new Error('模型返回空内容（Gemini SSE）')
            return await maybeContinueOnce(sseText)
          }

          // 兜底：非流式 JSON
          const data: any = await proxyRes.json().catch(() => ({}))
          const content =
            data?.choices?.[0]?.message?.content ??
            data?.choices?.[0]?.text ??
            data?.message?.content ??
            data?.content
          const finalText = typeof content === 'string' ? content.trim() : ''
          if (!finalText) throw new Error('模型返回空内容（Gemini via proxy）。')
          return await maybeContinueOnce(finalText, data?.choices?.[0]?.finish_reason)
        } catch (e: any) {
          // 本地开发可能没有 /api/llm/chat：回退到直连（旧逻辑）
          try {
            const sys = messages.filter(m => m.role === 'system').map(m => (typeof m.content === 'string' ? m.content : '')).filter(Boolean).join('\n\n').trim()
            const contents = messages
              .filter(m => m.role !== 'system')
              .map((m) => {
                const role = m.role === 'assistant' ? 'model' : 'user'
                const text =
                  typeof m.content === 'string'
                    ? m.content
                    : Array.isArray(m.content)
                      ? m.content.map(p => (p?.text ? String(p.text) : p?.type === 'image_url' || p?.type === 'image' ? '[图片]' : '')).filter(Boolean).join('\n')
                      : String(m.content || '')
                return { role, parts: [{ text }] }
              })
            const modelPath = selectedModel.startsWith('models/') ? selectedModel : `models/${selectedModel}`
            const url = `${base}/${modelPath}:generateContent?key=${encodeURIComponent(key)}`
            const body: any = {
              contents,
              generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
              },
            }
            if (sys) body.systemInstruction = { parts: [{ text: sys }] }
            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            if (!response.ok) {
              const text = await response.text().catch(() => '')
              const err: any = new Error(text || `请求失败: ${response.status}`)
              err.status = response.status
              err.phase = 'chat'
              throw err
            }
            const data = await response.json().catch(() => ({}))
            const parts = data?.candidates?.[0]?.content?.parts
            const text = Array.isArray(parts) ? parts.map((p: any) => p?.text).filter(Boolean).join('') : ''
            const finalText = typeof text === 'string' ? text.trim() : ''
            if (!finalText) {
              throw new Error('模型返回空内容（Gemini）。请检查：模型名是否正确、API Key 权限是否包含 Generative Language API。')
            }
            return await maybeContinueOnce(finalText, data?.candidates?.[0]?.finishReason)
          } catch {
            throw e
          }
        } finally {
          window.clearTimeout(t)
        }
      }

      // ====== 3) Claude（Anthropic）原生 ======
      if (apiInterface === 'anthropic_native') {
        const sys = messages.filter(m => m.role === 'system').map(m => (typeof m.content === 'string' ? m.content : '')).filter(Boolean).join('\n\n').trim()
        const anthMessages = messages
          .filter(m => m.role !== 'system')
          .map((m) => {
            const role = m.role === 'assistant' ? 'assistant' : 'user'
            const text =
              typeof m.content === 'string'
                ? m.content
                : Array.isArray(m.content)
                  ? m.content.map(p => (p?.text ? String(p.text) : p?.type === 'image_url' || p?.type === 'image' ? '[图片]' : '')).filter(Boolean).join('\n')
                  : String(m.content || '')
            return { role, content: [{ type: 'text', text }] }
          })

        const controller = new AbortController()
        const timeoutMs = options?.timeoutMs ?? 600000
        const t = window.setTimeout(() => controller.abort(), timeoutMs)
        const response = await fetch(`${base}/messages`, {
          method: 'POST',
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: selectedModel,
            max_tokens: maxTokens,
            temperature,
            system: sys || undefined,
            messages: anthMessages,
          }),
        })
        window.clearTimeout(t)
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          const e: any = new Error(text || `请求失败: ${response.status}`)
          e.status = response.status
          e.phase = 'chat'
          throw e
        }
        const data = await response.json().catch(() => ({}))
        const parts = Array.isArray(data?.content) ? data.content : []
        const text = parts.map((p: any) => (p?.type === 'text' ? p?.text : '')).filter(Boolean).join('')
        const finalText = typeof text === 'string' ? text.trim() : ''
        if (!finalText) throw new Error('模型返回空内容（Claude/Anthropic）。请检查：接口是否为 /v1/messages、以及模型名是否正确。')
        return await maybeContinueOnce(finalText, data?.stop_reason)
      }

      // ====== 4) OpenAI 兼容 ======
      const payload = {
        model: selectedModel,
        messages: messages,
        temperature,
        max_tokens: maxTokens,
      }

      // 排查/稳定性：OpenAI 兼容优先走同域转发（避免 CORS/拿不到上游错误体，只能看到“500”）
      // - 代理侧会尽可能把上游错误体转换成“可读文本”回传
      const readOpenAISSE = async (resp: Response): Promise<string> => {
        try {
          return await readOpenAISSEToText(resp)
        } catch {
          return ''
        }
      }

      const callOpenAICompatViaProxy = async (pl: any, opts?: { stream?: boolean; signal?: AbortSignal }) => {
        const wantStream = !!opts?.stream
        const proxyRes = await fetch('/api/llm/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(wantStream ? { Accept: 'text/event-stream' } : {}),
          },
          signal: opts?.signal,
          body: JSON.stringify({
            apiBaseUrl: cfg.apiBaseUrl,
            apiKey: key,
            apiInterface: 'openai_compatible',
            payload: wantStream ? { ...(pl as any), stream: true } : pl,
          }),
        })
        if (!proxyRes.ok) {
          const raw = await proxyRes.text().catch(() => '')
          let msg = ''
          try {
            const j = raw ? JSON.parse(raw) : {}
            msg = j?.error?.message || j?.message || ''
          } catch {
            msg = ''
          }
          const snippet = raw ? raw.trim().slice(0, 900) : ''
          throw new Error(msg || (snippet ? `请求失败: ${proxyRes.status}\n上游返回片段：${snippet}` : `请求失败: ${proxyRes.status}`))
        }
        const ct = String(proxyRes.headers.get('content-type') || '').toLowerCase()
        if (wantStream && ct.includes('text/event-stream')) {
          return { __streamText: await readOpenAISSE(proxyRes) }
        }
        return await proxyRes.json().catch(() => ({}))
      }

      const extractOpenAIContent = (dataAny: any): string => {
        const fromParts = (v: any): string => {
          if (typeof v === 'string') return v
          if (!Array.isArray(v)) return ''
          const out: string[] = []
          for (const p of v) {
            if (!p) continue
            if (typeof p === 'string') { out.push(p); continue }
            // OpenAI responses / 部分中转：[{type:'text', text:'...'}]
            if (typeof p?.text === 'string') { out.push(p.text); continue }
            if (typeof p?.content === 'string') { out.push(p.content); continue }
            if (typeof p?.delta?.text === 'string') { out.push(p.delta.text); continue }
            if (typeof p?.delta?.content === 'string') { out.push(p.delta.content); continue }
            if (typeof p?.value === 'string') { out.push(p.value); continue }
          }
          return out.join('')
        }
        const fromObject = (v: any): string => {
          if (!v || typeof v !== 'object') return ''
          if (typeof v.text === 'string') return v.text
          if (typeof v.content === 'string') return v.content
          // OpenAI responses style: {type:'output_text', text:'...'}
          if (typeof v.type === 'string' && typeof v.value === 'string') return v.value
          // Sometimes nested: { data: { text } }
          if (typeof v?.data?.text === 'string') return v.data.text
          return ''
        }

        const content0 =
          dataAny?.choices?.[0]?.message?.content ??
          dataAny?.choices?.[0]?.text ??
          dataAny?.message?.content ??
          dataAny?.content ??
          // OpenAI Responses API 风格（部分“自定义兼容”会这么回）
          dataAny?.output_text ??
          dataAny?.output?.[0]?.content ??
          dataAny?.output?.[0]?.content?.[0]?.text ??
          // Gemini 风格（有些 new api 会把 gemini 直接透传）
          (Array.isArray(dataAny?.candidates?.[0]?.content?.parts)
            ? dataAny.candidates[0].content.parts.map((p: any) => p?.text).filter(Boolean).join('')
            : '') ??
          ''

        if (typeof content0 === 'string') return content0
        const o1 = fromObject(content0)
        if (o1) return o1
        const t1 = fromParts(content0)
        if (t1) return t1
        const o2 = fromObject(dataAny?.choices?.[0]?.message?.content)
        if (o2) return o2
        const t2 = fromParts(dataAny?.choices?.[0]?.message?.content)
        if (t2) return t2
        // 工具调用兜底：避免“看起来像空回复”
        const toolCalls = dataAny?.choices?.[0]?.message?.tool_calls || dataAny?.choices?.[0]?.tool_calls
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          return '（模型返回了工具调用，但当前接口/中转未输出文本内容。请关闭工具调用或更换接口类型/模型。）'
        }
        return ''
      }

      const controller = new AbortController()
      const timeoutMs = options?.timeoutMs ?? 600000
      const t = window.setTimeout(() => controller.abort(), timeoutMs)
      const allowDirectFallback = ['localhost', '127.0.0.1'].includes(window.location.hostname)

      // 代理优先（尤其是排查阶段要看到上游详细报错）
      try {
        // 优先走流式：避免 serverless 等完整响应超时；同时更容易把上游错误吐到前端
        const proxyStreamAny: any = await callOpenAICompatViaProxy(payload, { stream: true, signal: controller.signal })
        const streamText = typeof proxyStreamAny?.__streamText === 'string' ? proxyStreamAny.__streamText.trim() : ''
        if (streamText) return await maybeContinueOnce(streamText)

        const proxyData = await callOpenAICompatViaProxy(payload, { stream: false, signal: controller.signal })
        const proxyContent = extractOpenAIContent(proxyData)
        const proxyText = typeof proxyContent === 'string' ? proxyContent.trim() : ''
        if (proxyText) return await maybeContinueOnce(proxyText, proxyData?.choices?.[0]?.finish_reason)
        // 如果代理返回了标准 OpenAI JSON：继续走下面的正常解析/报错逻辑
      } catch (proxyError) {
        // 线上优先固定走同域代理（后端使用官方 SDK 处理），减少端上格式适配分叉导致的不兼容
        if (!allowDirectFallback) throw proxyError
      }

      // 兜底：直连（本地开发/Vite 环境可能没有 /api/llm/chat）
      // HTTPS 页面 + HTTP Base URL：浏览器会拦截混合内容（此时代理通常能绕过）
      if (window.location.protocol === 'https:' && base.trim().toLowerCase().startsWith('http://')) {
        throw new TypeError('Mixed content blocked')
      }

      let response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify(payload),
      })
      window.clearTimeout(t)
      
      if (!response.ok) {
        const status = response.status
        const text = await response.text().catch(() => '')
        
        // 自动兼容降级：多模态 -> 纯文本（仅对 400 尝试一次）
        if (status === 400 && hasMultimodal) {
          try {
            const downgradedPayload = {
              ...payload,
              messages: downgradeMessagesToText(messages),
            }
            const controller2 = new AbortController()
            const t2 = window.setTimeout(() => controller2.abort(), options?.timeoutMs ?? 600000)
            response = await fetch(`${base}/chat/completions`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
              },
              signal: controller2.signal,
              body: JSON.stringify(downgradedPayload),
            })
            window.clearTimeout(t2)
            if (response.ok) {
              const data2 = await response.json().catch(() => ({}))
              const content2 =
                data2?.choices?.[0]?.message?.content ??
                data2?.choices?.[0]?.text ??
                data2?.message?.content ??
                data2?.content
              const finalText2 = typeof content2 === 'string' ? content2.trim() : ''
              if (finalText2) return finalText2
            }
          } catch {
            // ignore: fallthrough to original error
          }
        }
        let msg = ''
        try {
          const j = text ? JSON.parse(text) : {}
          msg = j?.error?.message || j?.message || ''
        } catch {
          msg = ''
        }
        // 直连时经常拿不到上游 JSON（网关返回 HTML/纯文本），这里把片段也带出来，方便排查
        const rawSnippet = !msg && text ? String(text).trim().slice(0, 900) : ''
        const e: any = new Error(
          (msg || (rawSnippet ? `请求失败: ${status}\n上游返回片段：${rawSnippet}` : `请求失败: ${status}`)) +
            (status === 400 && hasMultimodal
              ? '\n（提示：你的接口可能不支持“图片/贴纸”多模态格式。建议换支持 vision 的模型/中转，或尽量避免在本轮带图。）'
              : '')
        )
        e.status = status
        e.phase = 'chat'
        throw e
      }
      
      const data = await response.json()

      const content = extractOpenAIContent(data)

      const finalText = typeof content === 'string' ? content.trim() : ''
      if (!finalText) {
        throw new Error(
          '模型返回空内容（常见原因：接口返回格式不兼容）。' +
            '请到：设置App → API 配置，把“接口类型”切换到正确的（OpenAI兼容 / Claude原生 / Gemini原生 / Ollama）。'
        )
      }

      // 处理“上游返回了错误文案但被当作正常回复”的情况（极窄匹配，避免误伤）
      // 例：This version of Antigravity is no longer Supported.Please update to receive the latest features!
      if (/This version of Antigravity is no longer Supported\.?Please update to receive the latest features!?/i.test(finalText)) {
        throw new Error(
          '接口返回了上游错误提示（Antigravity 版本不支持），并非模型正常回复。\n' +
            '这通常意味着：你使用的中转/网关服务端返回了“升级提示页/错误文案”，但仍然用 200 返回。\n' +
            '建议：更换一个 OpenAI 兼容中转、或让对方升级/修复该网关服务。'
        )
      }

      const finishReason =
        data?.choices?.[0]?.finish_reason ??
        data?.choices?.[0]?.finishReason ??
        data?.finish_reason
      return await maybeContinueOnce(finalText, finishReason)
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error('请求超时：模型响应太慢（可尝试换模型/减少上下文/稍后重试）')
      }

      // 同域转发兜底：仅在“网络失败”场景启用（CORS/混合内容/部分机型网络）
      try {
        const msg = String(error?.message || '')
        const isNetworkFail =
          error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg)
        if (isNetworkFail) {
          const proxyRes = await fetch('/api/llm/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiBaseUrl: cfg.apiBaseUrl,
              apiKey: key,
              payload: {
                model: selectedModel,
                messages: messages,
                temperature: options?.temperature ?? 0.7,
                max_tokens: options?.maxTokens ?? 900,
              },
            }),
          })
          if (!proxyRes.ok) {
            const errData = await proxyRes.json().catch(() => ({}))
            throw new Error(errData?.error?.message || `请求失败: ${proxyRes.status}`)
          }
          const data = await proxyRes.json().catch(() => ({}))
          const content =
            data?.choices?.[0]?.message?.content ??
            data?.choices?.[0]?.text ??
            data?.message?.content ??
            data?.content
          const finalText = typeof content === 'string' ? content.trim() : ''
          if (finalText) return finalText
          throw new Error(data?.error?.message || '模型返回空内容（同域转发）')
        }
      } catch (e2: any) {
        // 如果同域转发也失败：优先展示更可读的原因（而不是静默）
        const msg2 = String(e2?.message || '')
        if (msg2) throw new Error(msg2)
      }

      // 浏览器常见网络错误：多数不会给出更细的错误码，只会是 Failed to fetch / NetworkError
      // 这里补充可读提示，方便定位“少部分手机连不上”的真实原因
      const msg = String(error?.message || '')
      if (
        error instanceof TypeError ||
        /failed to fetch|networkerror|load failed/i.test(msg)
      ) {
        throw new Error(
          '网络请求失败（浏览器拦截或无法连接）。常见原因：\n' +
            '1) 你当前是 HTTPS 页面，但 Base URL 用了 http://（混合内容会被拦截）\n' +
            '2) API 服务端未开启 CORS（浏览器不允许跨域调用；Postman/后端能用但网页不能用）\n' +
            '3) 证书/域名问题（证书链不完整、被运营商拦截、DNS 解析异常）\n' +
            '4) 网络环境限制（公司网/校园网/代理/VPN）\n\n' +
            `原始错误：${msg || 'TypeError'}`
        )
      }

      // 统一分型：把常见错误转成“原因 + 建议”
      const pretty = summarizeLLMError(error, {
        apiInterface,
        baseUrl: cfg.apiBaseUrl,
        model: selectedModel,
        phase: 'chat',
      })
      throw new Error(pretty)
      }
    }

    // 聊天时严格使用用户选择的模型，避免“自动换更贵模型”带来价格争议
    const requestedModel = String(cfg.selectedModel || '').trim()
    if (!requestedModel) {
      throw new Error('未选择模型：请到「设置 → API 配置」点击「测试连接」自动填入一个可用模型，或手动选择模型后再聊天。')
    }
    return await callCore(requestedModel)
  }

  // 测试连接：不要求先进入聊天再发现问题
  const testLLMConfig = async (override: {
    apiBaseUrl: string
    apiKey: string
    apiInterface: LLMApiInterface
    model?: string
  }): Promise<{ modelUsed: string; reply: string }> => {
    const apiBaseUrl = String(override.apiBaseUrl || '').trim()
    const apiKey = String(override.apiKey || '').trim()
    const apiInterface = (override.apiInterface || 'openai_compatible') as LLMApiInterface
    if (!apiBaseUrl || !apiKey) throw new Error('请先填写 Base URL 和 API Key')

    const pickProbeModels = (iface: LLMApiInterface): string[] => {
      // 目标：让“只填 URL+Key 的小白用户”也能直接测试成功，即使 /models 不可用
      if (iface === 'gemini_native') {
        return ['models/gemini-2.0-flash', 'models/gemini-1.5-flash', 'models/gemini-1.5-pro']
      }
      if (iface === 'anthropic_native') {
        return ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229']
      }
      if (iface === 'ollama') {
        return ['llama3.1', 'qwen2.5', 'gemma2']
      }
      // openai_compatible（含各种中转/new-api/one-api/卖家网关等）
      return [
        'gpt-4o-mini',
        'gpt-4o',
        'gpt-4.1-mini',
        'gpt-4.1',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        // 常见国产网关/聚合平台会暴露这些模型名
        'deepseek-chat',
        'deepseek-reasoner',
        'qwen-plus',
        'qwen-turbo',
        'glm-4',
        'moonshot-v1-8k',
      ]
    }

    const manual = String(override.model || '').trim()

    // 用户手动指定了模型：只测试该模型，不要“自动换成别的模型”
    if (manual) {
      const reply = await callLLMWithConfig(
        { apiBaseUrl, apiKey, apiInterface, selectedModel: manual },
        [
          { role: 'system', content: '你是连接测试。你只允许回复一个词：OK。禁止输出其他任何内容。' },
          { role: 'user', content: 'test' },
        ],
        { temperature: 0, maxTokens: 8, timeoutMs: 60_000 }
      )
      return { modelUsed: manual, reply: (reply || '').trim() }
    }

    let modelList: string[] = []
    try {
      modelList = await fetchAvailableModels({ apiBaseUrl, apiKey, apiInterface })
    } catch {
      modelList = []
    }
    const candidates = Array.from(
      new Set([...(Array.isArray(modelList) ? modelList : []), ...pickProbeModels(apiInterface)].filter(Boolean))
    ).slice(0, 18)
    if (candidates.length === 0) throw new Error('无法探测可用模型：请检查 Base URL / API Key / 接口类型')

    let lastErr: any = null
    for (const modelUsed of candidates) {
      try {
        const reply = await callLLMWithConfig(
          { apiBaseUrl, apiKey, apiInterface, selectedModel: modelUsed },
          [
            { role: 'system', content: '你是连接测试。你只允许回复一个词：OK。禁止输出其他任何内容。' },
            { role: 'user', content: 'test' },
          ],
          { temperature: 0, maxTokens: 8, timeoutMs: 60_000 }
        )
        return { modelUsed, reply: (reply || '').trim() }
      } catch (e: any) {
        lastErr = e
      }
    }
    throw new Error(String(lastErr?.message || lastErr || '测试失败：无法自动探测可用模型'))
  }

  // 调用LLM API（使用用户自己配置的API，不消耗米币）
  const callLLM = async (
    messages: {
      role: string
      content:
        | string
        | Array<{
            type: string
            text?: string
            image_url?: { url: string }
            imageUrl?: { url: string }
          }>
    }[],
    model?: string,
    options?: { temperature?: number; maxTokens?: number; timeoutMs?: number },
    configOverride?: {
      apiBaseUrl?: string
      apiKey?: string
      apiInterface?: LLMApiInterface
      selectedModel?: string
    }
  ): Promise<string> => {
    return await callLLMWithConfig(
      {
        apiBaseUrl: configOverride?.apiBaseUrl || llmConfig.apiBaseUrl,
        apiKey: configOverride?.apiKey || llmConfig.apiKey,
        apiInterface: configOverride?.apiInterface || llmConfig.apiInterface || 'openai_compatible',
        selectedModel: model || configOverride?.selectedModel || llmConfig.selectedModel,
      },
      messages,
      options
    )
  }

  const value = useMemo<OSContextValue>(() => ({
    isHydrated,
    time, wallpaper, currentFont, fontColor, userProfile, llmConfig, ttsConfig, miCoinBalance,
    fontSizeTier, setFontSizeTier,
    glassOpacity, setGlassOpacity,
    notifications,
    characters,
    chatLog,
    customAppIcons,
    customAppIconsLayout1,
    customAppIconsLayout2,
    decorImage,
    decorImageLayout1,
    decorImageLayout2,
    homeAvatar,
    signature,
    wallpaperError,
    locationSettings, weather, setLocationSettings, refreshWeather,
    musicPlaying, currentSong, musicProgress, musicPlaylist, musicFavorites, musicPlayMode, audioRef,
    setWallpaper, setCurrentFont, setFontColor, setUserProfile, setLLMConfig, setTTSConfig, textToSpeech,
    setMiCoinBalance, addMiCoins, addNotification, markNotificationRead, addChatMessage, updateIntimacy,
    setCustomAppIcon,
    setCustomAppIconForLayout,
    setDecorImage,
    setDecorImageForLayout,
    setHomeAvatar,
    setSignature,
    waterCount,
    addWater,
    setWallpaperError,
    playSong, pauseMusic, resumeMusic, toggleMusic, nextSong, prevSong, cycleMusicPlayMode, seekMusic, toggleFavorite, isFavorite, addSong, removeSong,
    setMusicPlaying, setCurrentSong,
    iconTheme, setIconTheme,
    anniversaries, addAnniversary, updateAnniversary, removeAnniversary,
    memo, setMemo,
    customFonts, addCustomFont, removeCustomFont, getAllFontOptions,
    fetchAvailableModels, testLLMConfig, callLLM,
  }), [time, wallpaper, currentFont, fontColor, userProfile, llmConfig, ttsConfig, miCoinBalance, fontSizeTier, glassOpacity,
      notifications, characters, chatLog, customAppIcons, customAppIconsLayout1, customAppIconsLayout2, decorImage, decorImageLayout1, decorImageLayout2, homeAvatar, signature, waterCount, wallpaperError, iconTheme, anniversaries, memo, customFonts,
      locationSettings, weather,
      musicPlaying, currentSong, musicProgress, musicPlaylist, musicFavorites, musicPlayMode, isHydrated, fetchAvailableModels])

  return <OSContext.Provider value={value}>{children}</OSContext.Provider>
}

export const useOS = () => {
  const ctx = useContext(OSContext)
  if (!ctx) throw new Error('useOS must be used within OSProvider')
  return ctx
}
