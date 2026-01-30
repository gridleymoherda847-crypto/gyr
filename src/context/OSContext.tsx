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

export type UserProfile = { avatar: string; nickname: string; persona: string }
export type LLMConfig = { apiBaseUrl: string; apiKey: string; selectedModel: string; availableModels: string[] }

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
export type LocationSettings = {
  mode: LocationMode
  manualCity: string
  latitude?: number
  longitude?: number
}

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
const CURRENT_MUSIC_VERSION = '8' // 更新这个数字会强制重置音乐列表

// 位置和天气存储键
const LOCATION_STORAGE_KEY = 'littlephone_location'
const WEATHER_STORAGE_KEY = 'littlephone_weather'

// 默认位置设置
const defaultLocationSettings: LocationSettings = {
  mode: 'manual',
  manualCity: '北京'
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
  llmConfig: LLMConfig; ttsConfig: TTSConfig; miCoinBalance: number; notifications: Notification[]
  characters: VirtualCharacter[]; chatLog: ChatMessage[]
  customAppIcons: Record<string, string>; decorImage: string; homeAvatar: string
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
  setDecorImage: (url: string) => void
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
  fetchAvailableModels: (override?: { apiBaseUrl?: string; apiKey?: string }) => Promise<string[]>
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
    options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
  ) => Promise<string>
}

const OSContext = createContext<OSContextValue | undefined>(undefined)

const formatTime = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

const defaultUserProfile: UserProfile = { avatar: '', nickname: '用户', persona: '' }
const defaultLLMConfig: LLMConfig = { apiBaseUrl: '', apiKey: '', selectedModel: '', availableModels: [] }
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
  wallpaper: 'os_wallpaper',
  customAppIcons: 'os_custom_app_icons',
  decorImage: 'os_decor_image',
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
  doudizhu: '/icons/minimal/doudizhu.svg',
  diaryVault: '/icons/minimal/diary.svg',
  x: '/icons/minimal/x.svg',
  music: '/icons/minimal/music.svg',
  settings: '/icons/minimal/settings.svg',
  manual: '/icons/minimal/manual.svg',
  preset: '/icons/minimal/preset.svg',
}

function normalizeApiBaseUrl(input: string): string {
  let trimmed = (input || '').trim()
  if (!trimmed) return ''
  // 去掉结尾的多余斜杠
  trimmed = trimmed.replace(/\/+$/, '')

  // 用户常见误填：直接填到了具体接口（/chat/completions 或 /models）
  // 统一裁剪回“base(/v1)”级别，避免拼接出 /v1/chat/completions/v1 这种路径
  trimmed = trimmed.replace(/\/chat\/completions\/?$/i, '')
  trimmed = trimmed.replace(/\/models\/?$/i, '')

  // 若 URL 中间已经包含 /v1（如 https://xxx/openai/v1），则裁剪到该 /v1 结尾
  const v1Index = trimmed.toLowerCase().indexOf('/v1')
  if (v1Index >= 0) {
    const prefix = trimmed.slice(0, v1Index)
    return `${prefix}/v1`
  }

  // 兼容用户填 https://xxx
  return `${trimmed}/v1`
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
  const [userProfile, setUserProfileState] = useState<UserProfile>(defaultUserProfile)
  const [llmConfig, setLLMConfigState] = useState<LLMConfig>(defaultLLMConfig)
  const [ttsConfig, setTTSConfigState] = useState<TTSConfig>(defaultTTSConfig)
  const [miCoinBalance, setMiCoinBalance] = useState(() => 100)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [characters, setCharacters] = useState<VirtualCharacter[]>(seedCharacters)
  const [chatLog, setChatLog] = useState<ChatMessage[]>(seedChat)
  const [customAppIcons, setCustomAppIcons] = useState<Record<string, string>>({})
  const [decorImage, setDecorImage] = useState('')
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
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // 图标主题
  const [iconTheme, setIconThemeState] = useState<IconTheme>('custom')
  
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
          MUSIC_STORAGE_KEY,
          MUSIC_VERSION_KEY,
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
        nextLocation,
        nextWeather,
        _savedVersion, // 不再用于强制重置，但保留读取以备将来使用
        nextWallpaper,
        nextCustomAppIcons,
        nextDecorImage,
        nextHomeAvatar,
        nextSignature,
        nextWaterCount,
        nextWaterDate,
        nextUserProfile,
        nextIconTheme,
        nextAnniversaries,
        nextMemo,
        nextCustomFonts,
      ] = await Promise.all([
        kvGetJSONDeep<LLMConfig>(STORAGE_KEYS.llmConfig, defaultLLMConfig),
        kvGetJSONDeep<TTSConfig>(STORAGE_KEYS.ttsConfig, defaultTTSConfig),
        kvGetJSONDeep<number>(STORAGE_KEYS.miCoinBalance, 100),
        kvGetJSONDeep<string>(
          STORAGE_KEYS.currentFontId,
          (FONT_OPTIONS.find(f => f.id === 'elegant')?.id || FONT_OPTIONS[0].id)
        ),
        kvGetJSONDeep<string>(STORAGE_KEYS.fontColorId, COLOR_OPTIONS[3].id),
        kvGetJSONDeep<LocationSettings>(LOCATION_STORAGE_KEY, defaultLocationSettings),
        kvGetJSONDeep<WeatherData>(WEATHER_STORAGE_KEY, defaultWeather),
        kvGetJSONDeep<string>(MUSIC_VERSION_KEY, ''),
        kvGetJSONDeep<string>(STORAGE_KEYS.wallpaper, DEFAULT_WALLPAPER),
        kvGetJSONDeep<Record<string, string>>(STORAGE_KEYS.customAppIcons, {}),
        kvGetJSONDeep<string>(STORAGE_KEYS.decorImage, ''),
        kvGetJSONDeep<string>(STORAGE_KEYS.homeAvatar, ''),
        kvGetJSONDeep<string>(STORAGE_KEYS.signature, '今天也要开心鸭~'),
        kvGetJSONDeep<number>(STORAGE_KEYS.waterCount, 0),
        kvGetJSONDeep<string>(STORAGE_KEYS.waterDate, ''),
        kvGetJSONDeep<UserProfile>(STORAGE_KEYS.userProfile, defaultUserProfile),
        kvGetJSONDeep<IconTheme>(STORAGE_KEYS.iconTheme, 'custom'),
        kvGetJSONDeep<Anniversary[]>(STORAGE_KEYS.anniversaries, []),
        kvGetJSONDeep<Memo>(STORAGE_KEYS.memo, { content: '', image: '', todos: [] }),
        kvGetJSONDeep<CustomFont[]>(STORAGE_KEYS.customFonts, []),
      ])

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
      setLocationSettingsState(nextLocation)
      setWeather(nextWeather)
      setMusicPlaylist(nextPlaylist)
      // 加载自定义壁纸、图标等
      if (nextWallpaper) setWallpaper(nextWallpaper)
      if (nextCustomAppIcons) setCustomAppIcons(nextCustomAppIcons)
      if (nextDecorImage) setDecorImage(nextDecorImage)
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
  // 壁纸、自定义图标等持久化
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.wallpaper, wallpaper) }, [wallpaper, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.customAppIcons, customAppIcons) }, [customAppIcons, isHydrated])
  useEffect(() => { if (!canPersist()) return; void kvSetJSON(STORAGE_KEYS.decorImage, decorImage) }, [decorImage, isHydrated])
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
          try {
            audioRef.current.currentTime = 0
            void audioRef.current.play()
          } catch {
            // ignore
          }
          return
        }
        // 自动播放下一首
        const currentIndex = musicPlaylist.findIndex(s => s.id === currentSong?.id)
        if (currentIndex < musicPlaylist.length - 1) {
          playSong(musicPlaylist[currentIndex + 1])
        } else {
          setMusicPlaying(false)
          setMusicProgress(0)
        }
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

  const setUserProfile = (profile: Partial<UserProfile>) => setUserProfileState((prev) => ({ ...prev, ...profile }))
  const setLLMConfig = (config: Partial<LLMConfig>) =>
    setLLMConfigState((prev) => {
      const next = { ...prev, ...config }
      if (typeof config.apiBaseUrl === 'string') {
        next.apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl)
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
    
    try {
      const baseUrl = getTTSBaseUrl()
      const response = await fetch(`${baseUrl}/v1/t2a_v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ttsConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
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
      console.error('TTS failed:', err)
      return null
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
  const setCustomAppIcon = (appId: string, iconUrl: string) => setCustomAppIcons((prev) => ({ ...prev, [appId]: iconUrl }))

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
    const currentIndex = musicPlaylist.findIndex(s => s.id === currentSong?.id)
    const nextIndex = currentIndex < musicPlaylist.length - 1 ? currentIndex + 1 : 0
    playSong(musicPlaylist[nextIndex])
  }

  const prevSong = () => {
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
      const next = { ...prev, ...settings }
      if (!!(window as any).__LP_IMPORTING__) return next
      void kvSetJSON(LOCATION_STORAGE_KEY, next)
      return next
    })
  }

  // 获取天气图标
  const getWeatherIcon = (code: number): string => {
    if (code === 0) return '☀️'
    if (code <= 3) return '⛅'
    if (code <= 49) return '🌫️'
    if (code <= 59) return '🌧️'
    if (code <= 69) return '🌨️'
    if (code <= 79) return '❄️'
    if (code <= 99) return '⛈️'
    return '☀️'
  }

  // 获取天气描述
  const getWeatherDesc = (code: number): string => {
    if (code === 0) return '晴'
    if (code <= 3) return '多云'
    if (code <= 49) return '雾'
    if (code <= 59) return '小雨'
    if (code <= 69) return '雨夹雪'
    if (code <= 79) return '雪'
    if (code <= 99) return '雷雨'
    return '晴'
  }

  // 刷新天气
  const refreshWeather = async () => {
    try {
      let lat: number | undefined
      let lon: number | undefined
      let cityName = locationSettings.manualCity

      if (locationSettings.mode === 'auto') {
        // 自动定位
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        })
        lat = position.coords.latitude
        lon = position.coords.longitude
        
        // 反向地理编码获取城市名
        try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh`)
          const geoData = await geoRes.json()
          cityName = geoData.address?.city || geoData.address?.town || geoData.address?.county || '未知'
        } catch {
          cityName = '当前位置'
        }
        
        // 保存坐标
        setLocationSettings({ latitude: lat, longitude: lon })
      } else {
        // 手动定位 - 根据城市名获取坐标
        try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cityName)}&format=json&limit=1&accept-language=zh`)
          const geoData = await geoRes.json()
          if (geoData.length > 0) {
            lat = parseFloat(geoData[0].lat)
            lon = parseFloat(geoData[0].lon)
          }
        } catch {
          // 使用默认北京坐标
          lat = 39.9
          lon = 116.4
        }
      }

      if (lat && lon) {
        // 获取天气数据
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
        const weatherData = await weatherRes.json()
        
        if (weatherData.current_weather) {
          const newWeather: WeatherData = {
            temp: `${Math.round(weatherData.current_weather.temperature)}°`,
            desc: getWeatherDesc(weatherData.current_weather.weathercode),
            icon: getWeatherIcon(weatherData.current_weather.weathercode),
            city: cityName,
            updatedAt: Date.now()
          }
          setWeather(newWeather)
          void kvSetJSON(WEATHER_STORAGE_KEY, newWeather)
        }
      }
    } catch (error) {
      console.error('获取天气失败:', error)
    }
  }

  // 初始化时获取天气（如果超过30分钟未更新）
  useEffect(() => {
    const shouldRefresh = Date.now() - weather.updatedAt > 30 * 60 * 1000
    if (shouldRefresh) {
      refreshWeather()
    }
  }, [])

  // 位置设置变化时刷新天气
  useEffect(() => {
    refreshWeather()
  }, [locationSettings.mode, locationSettings.manualCity])

  // 获取可用模型列表
  const fetchAvailableModels = async (override?: { apiBaseUrl?: string; apiKey?: string }): Promise<string[]> => {
    const base = normalizeApiBaseUrl(override?.apiBaseUrl ?? llmConfig.apiBaseUrl)
    const key = override?.apiKey ?? llmConfig.apiKey
    if (!base || !key) throw new Error('请先在「设置 -> API 配置」中填写 Base URL 和 API Key')
    try {
      const response = await fetch(`${base}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}${response.status === 401 ? '（未授权：请检查 API Key / 权限）' : ''}`)
      }
      
      const data = await response.json()
      
      if (data.data && Array.isArray(data.data)) {
        const modelIds = data.data.map((m: any) => m.id).filter(Boolean)
        // 安全：这里绝不改用户已保存的 Base/Key/Model（避免“自动换成更贵模型”等风险）
        return modelIds
      } else {
        throw new Error('返回数据格式错误')
      }
    } catch (error) {
      // 同域转发兜底：解决 CORS / 部分机型“Failed to fetch”
      try {
        const proxyRes = await fetch('/api/llm/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiBaseUrl: override?.apiBaseUrl ?? llmConfig.apiBaseUrl, apiKey: key }),
        })
        if (!proxyRes.ok) {
          const errData = await proxyRes.json().catch(() => ({}))
          throw new Error(errData?.error?.message || `请求失败: ${proxyRes.status}`)
        }
        const data = await proxyRes.json().catch(() => ({}))
        if (data.data && Array.isArray(data.data)) {
          return data.data.map((m: any) => m.id).filter(Boolean)
        }
      } catch {
        // ignore: fallthrough to original error
      }
      throw error
    }
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
    options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
  ): Promise<string> => {
    const base = normalizeApiBaseUrl(llmConfig.apiBaseUrl)
    const key = llmConfig.apiKey
    const selectedModel = model || llmConfig.selectedModel
    if (!base || !key) throw new Error('请先在「设置 -> API 配置」中填写 Base URL 和 API Key')
    if (!selectedModel) throw new Error('请先选择一个模型')
    
    try {
      const maxTokens = options?.maxTokens ?? 900
      const payload = {
        model: selectedModel,
        messages: messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: maxTokens,
      }

      const controller = new AbortController()
      const timeoutMs = options?.timeoutMs ?? 600000
      const t = window.setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(`${base}/chat/completions`, {
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
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `请求失败: ${response.status}`)
      }
      
      const data = await response.json()

      const content =
        data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.text ??
        data?.message?.content ??
        data?.content

      const finalText = typeof content === 'string' ? content.trim() : ''
      if (!finalText) {
        throw new Error(
          '模型返回空内容（常见原因：接口返回格式不兼容）。' +
            '当前这里走的是 OpenAI 兼容接口：需要支持 GET /models 与 POST /chat/completions，并返回 choices[0].message.content。' +
            '如果你用的是 Gemini/Claude 官方原生接口，需要使用“OpenAI兼容中转”，或者后续我再给你加“接口类型”切换适配。'
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

      // 兜底：Gemini 2.5 / 部分中转容易 length 截断（话说一半）
      // 如果看到 finish_reason=length，自动走一次“继续输出”的补全（同域转发更稳定且无 CORS）
      const finishReason =
        data?.choices?.[0]?.finish_reason ??
        data?.choices?.[0]?.finishReason ??
        data?.finish_reason
      if (String(finishReason || '').toLowerCase() === 'length') {
        try {
          const continueHint =
            '继续上文，从刚才中断处接着写。\n' +
            '要求：不要重复已说过的句子；保持同一语言与语气；继续完成这一轮回复。'
          const contPayload = {
            ...payload,
            messages: [
              ...messages,
              { role: 'assistant', content: finalText },
              { role: 'user', content: continueHint },
            ],
            max_tokens: Math.max(120, maxTokens),
          }
          const proxyRes = await fetch('/api/llm/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              apiBaseUrl: llmConfig.apiBaseUrl,
              apiKey: key,
              payload: contPayload,
            }),
          })
          if (proxyRes.ok) {
            const contData = await proxyRes.json().catch(() => ({}))
            const contContent =
              contData?.choices?.[0]?.message?.content ??
              contData?.choices?.[0]?.text ??
              contData?.message?.content ??
              contData?.content
            const contText = typeof contContent === 'string' ? contContent.trim() : ''
            if (contText) return `${finalText}\n${contText}`.trim()
          }
        } catch {
          // ignore
        }
      }

      return finalText
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
              apiBaseUrl: llmConfig.apiBaseUrl,
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
      throw error
    }
  }

  const value = useMemo<OSContextValue>(() => ({
    isHydrated,
    time, wallpaper, currentFont, fontColor, userProfile, llmConfig, ttsConfig, miCoinBalance,
    notifications, characters, chatLog, customAppIcons, decorImage, homeAvatar, signature, wallpaperError,
    locationSettings, weather, setLocationSettings, refreshWeather,
    musicPlaying, currentSong, musicProgress, musicPlaylist, musicFavorites, audioRef,
    setWallpaper, setCurrentFont, setFontColor, setUserProfile, setLLMConfig, setTTSConfig, textToSpeech,
    setMiCoinBalance, addMiCoins, addNotification, markNotificationRead, addChatMessage, updateIntimacy,
    setCustomAppIcon, setDecorImage, setHomeAvatar, setSignature, waterCount, addWater, setWallpaperError,
    playSong, pauseMusic, resumeMusic, toggleMusic, nextSong, prevSong, seekMusic, toggleFavorite, isFavorite, addSong, removeSong,
    setMusicPlaying, setCurrentSong,
    iconTheme, setIconTheme,
    anniversaries, addAnniversary, updateAnniversary, removeAnniversary,
    memo, setMemo,
    customFonts, addCustomFont, removeCustomFont, getAllFontOptions,
    fetchAvailableModels, callLLM,
  }), [time, wallpaper, currentFont, fontColor, userProfile, llmConfig, ttsConfig, miCoinBalance, 
      notifications, characters, chatLog, customAppIcons, decorImage, homeAvatar, signature, waterCount, wallpaperError, iconTheme, anniversaries, memo, customFonts,
      locationSettings, weather,
      musicPlaying, currentSong, musicProgress, musicPlaylist, musicFavorites, isHydrated])

  return <OSContext.Provider value={value}>{children}</OSContext.Provider>
}

export const useOS = () => {
  const ctx = useContext(OSContext)
  if (!ctx) throw new Error('useOS must be used within OSProvider')
  return ctx
}
