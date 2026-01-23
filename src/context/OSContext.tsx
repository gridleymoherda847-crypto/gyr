import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type PropsWithChildren,
} from 'react'

export type UserProfile = { avatar: string; nickname: string; persona: string }
export type LLMConfig = { apiBaseUrl: string; apiKey: string; selectedModel: string; availableModels: string[] }

export type Notification = { id: string; app: string; title: string; body: string; avatar?: string; timestamp: number; read: boolean }
export type VirtualCharacter = { id: string; name: string; avatar: string; prompt: string; intimacy: number }
export type ChatMessage = { id: string; senderId: string; senderName: string; text: string; app?: string; timestamp: number }
export type FontOption = { id: string; name: string; fontFamily: string; preview: string }
export type ColorOption = { id: string; name: string; value: string }

// 音乐相关类型
export type Song = {
  id: string
  title: string
  artist: string
  cover: string
  url: string
  duration: number // 秒
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
const CURRENT_MUSIC_VERSION = '5' // 更新这个数字会强制重置音乐列表

// 内置默认歌曲（打包时会包含）
const DEFAULT_SONGS: Song[] = [
  {
    id: 'default-1',
    title: 'Diary - 花日 (治愈版)',
    artist: 'H',
    cover: DEFAULT_COVER,
    url: '/music/diary.ogg',
    duration: 200
  }
]

// 从localStorage读取歌曲列表
const loadMusicPlaylist = (): Song[] => {
  try {
    const savedVersion = localStorage.getItem(MUSIC_VERSION_KEY)
    
    // 版本不匹配，强制重置为默认歌曲
    if (savedVersion !== CURRENT_MUSIC_VERSION) {
      localStorage.setItem(MUSIC_VERSION_KEY, CURRENT_MUSIC_VERSION)
      localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(DEFAULT_SONGS))
      return [...DEFAULT_SONGS]
    }
    
    // 版本匹配，读取用户保存的列表
    const saved = localStorage.getItem(MUSIC_STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
    
    return [...DEFAULT_SONGS]
  } catch (e) {
    console.error('Failed to load music playlist:', e)
  }
  return [...DEFAULT_SONGS]
}

type OSContextValue = {
  time: string; isLocked: boolean; wallpaper: string; lockWallpaper: string
  currentFont: FontOption; fontColor: ColorOption; userProfile: UserProfile
  fontScale: number
  llmConfig: LLMConfig; miCoinBalance: number; notifications: Notification[]
  characters: VirtualCharacter[]; chatLog: ChatMessage[]
  customAppIcons: Record<string, string>; decorImage: string
  // 音乐相关
  musicPlaying: boolean
  currentSong: Song | null
  musicProgress: number
  musicPlaylist: Song[]
  musicFavorites: string[]
  audioRef: React.RefObject<HTMLAudioElement | null>
  setLocked: (locked: boolean) => void
  setWallpaper: (wallpaper: string) => void
  setLockWallpaper: (wallpaper: string) => void
  setCurrentFont: (font: FontOption) => void
  setFontColor: (color: ColorOption) => void
  setFontScale: (scale: number) => void
  setUserProfile: (profile: Partial<UserProfile>) => void
  setLLMConfig: (config: Partial<LLMConfig>) => void
  setMiCoinBalance: (balance: number) => void
  addMiCoins: (amount: number) => void
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markNotificationRead: (id: string) => void
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'> & { timestamp?: number }) => void
  updateIntimacy: (characterId: string, delta: number) => void
  setCustomAppIcon: (appId: string, iconUrl: string) => void
  setDecorImage: (url: string) => void
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
  // API相关（手动配置）
  fetchAvailableModels: (override?: { apiBaseUrl?: string; apiKey?: string }) => Promise<string[]>
  callLLM: (
    messages: { role: string; content: string }[],
    model?: string,
    options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
  ) => Promise<string>
}

const OSContext = createContext<OSContextValue | undefined>(undefined)

const formatTime = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

const defaultUserProfile: UserProfile = { avatar: '', nickname: '用户', persona: '' }
const defaultLLMConfig: LLMConfig = { apiBaseUrl: '', apiKey: '', selectedModel: '', availableModels: [] }

const STORAGE_KEYS = {
  llmConfig: 'os_llm_config',
  miCoinBalance: 'os_micoin_balance',
  fontScale: 'os_font_scale',
} as const

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : defaultValue
  } catch {
    return defaultValue
  }
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // ignore
  }
}

function normalizeApiBaseUrl(input: string): string {
  const trimmed = (input || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  // 兼容用户填 https://xxx 或 https://xxx/v1
  return trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`
}
const seedCharacters: VirtualCharacter[] = [
  { id: 'char-01', name: '青禾', avatar: 'https://i.pravatar.cc/150?img=5', prompt: '温柔的生活助手', intimacy: 68 },
  { id: 'char-02', name: '森野', avatar: 'https://i.pravatar.cc/150?img=3', prompt: '冷静的技术宅', intimacy: 55 },
]
const seedChat: ChatMessage[] = [
  { id: 'chat-01', senderId: 'char-01', senderName: '青禾', text: '欢迎来到 LittlePhone~', timestamp: Date.now() - 1000 * 60 * 45, app: '系统' },
]

// 锁屏状态存储键
const LOCK_STORAGE_KEY = 'littlephone_is_locked'

export function OSProvider({ children }: PropsWithChildren) {
  const [time, setTime] = useState(formatTime)
  // 从localStorage读取锁屏状态，默认为true
  const [isLocked, setLockedState] = useState(() => {
    try {
      const saved = localStorage.getItem(LOCK_STORAGE_KEY)
      // 如果没有保存过，默认锁屏
      if (saved === null) return true
      return JSON.parse(saved)
    } catch {
      return true
    }
  })
  
  // 包装setLocked以同时保存到localStorage
  const setLocked = (locked: boolean) => {
    setLockedState(locked)
    try {
      localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify(locked))
    } catch {
      // ignore
    }
  }
  
  const [wallpaper, setWallpaper] = useState(DEFAULT_WALLPAPER)
  const [lockWallpaper, setLockWallpaper] = useState(DEFAULT_WALLPAPER)
  const [wallpaperError, setWallpaperError] = useState(false)
  const [currentFont, setCurrentFont] = useState<FontOption>(FONT_OPTIONS[0])
  const [fontColor, setFontColor] = useState<ColorOption>(COLOR_OPTIONS[3])
  const [fontScale, setFontScaleState] = useState<number>(() => loadFromStorage(STORAGE_KEYS.fontScale, 1))
  const [userProfile, setUserProfileState] = useState<UserProfile>(defaultUserProfile)
  const [llmConfig, setLLMConfigState] = useState<LLMConfig>(() => loadFromStorage(STORAGE_KEYS.llmConfig, defaultLLMConfig))
  const [miCoinBalance, setMiCoinBalance] = useState(() => loadFromStorage(STORAGE_KEYS.miCoinBalance, 100))
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [characters, setCharacters] = useState<VirtualCharacter[]>(seedCharacters)
  const [chatLog, setChatLog] = useState<ChatMessage[]>(seedChat)
  const [customAppIcons, setCustomAppIcons] = useState<Record<string, string>>({})
  const [decorImage, setDecorImage] = useState('')

  // 音乐状态
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [musicProgress, setMusicProgress] = useState(0)
  const [musicPlaylist, setMusicPlaylist] = useState<Song[]>(loadMusicPlaylist)
  const [musicFavorites, setMusicFavorites] = useState<string[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const tick = setInterval(() => setTime(formatTime()), 1000)
    return () => clearInterval(tick)
  }, [])

  // 持久化：LLM配置与米币
  useEffect(() => { saveToStorage(STORAGE_KEYS.llmConfig, llmConfig) }, [llmConfig])
  useEffect(() => { saveToStorage(STORAGE_KEYS.miCoinBalance, miCoinBalance) }, [miCoinBalance])
  useEffect(() => { saveToStorage(STORAGE_KEYS.fontScale, fontScale) }, [fontScale])

  const setFontScale = (scale: number) => {
    const v = Math.max(0.85, Math.min(1.25, Number(scale) || 1))
    setFontScaleState(v)
  }
  
  // 持久化：音乐列表
  useEffect(() => {
    localStorage.setItem(MUSIC_STORAGE_KEY, JSON.stringify(musicPlaylist))
  }, [musicPlaylist])

  // 检查壁纸图片是否存在
  useEffect(() => {
    const img = new Image()
    img.onload = () => setWallpaperError(false)
    img.onerror = () => {
      setWallpaperError(true)
      setWallpaper(FALLBACK_WALLPAPER)
      setLockWallpaper(FALLBACK_WALLPAPER)
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
        // 自动播放下一首
        const currentIndex = musicPlaylist.findIndex(s => s.id === currentSong?.id)
        if (currentIndex < musicPlaylist.length - 1) {
          playSong(musicPlaylist[currentIndex + 1])
        } else {
          setMusicPlaying(false)
          setMusicProgress(0)
        }
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
    if (audioRef.current) {
      audioRef.current.src = song.url
      audioRef.current.play()
      setCurrentSong(song)
      setMusicPlaying(true)
      setMusicProgress(0)
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
      audioRef.current.play()
      setMusicPlaying(true)
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
    setMusicPlaylist(prev => [...prev, song])
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
        // 更新可用模型列表（同时把本次调用传入的 base/key 落盘，避免“第一次必失败”的旧 state 闭包问题）
        setLLMConfigState(prev => ({
          ...prev,
          apiBaseUrl: override?.apiBaseUrl ?? prev.apiBaseUrl,
          apiKey: override?.apiKey ?? prev.apiKey,
          availableModels: modelIds,
        }))
        return modelIds
      } else {
        throw new Error('返回数据格式错误')
      }
    } catch (error) {
      throw error
    }
  }

  // 调用LLM API（使用用户自己配置的API，不消耗米币）
  const callLLM = async (
    messages: { role: string; content: string }[],
    model?: string,
    options?: { temperature?: number; maxTokens?: number; timeoutMs?: number }
  ): Promise<string> => {
    const base = normalizeApiBaseUrl(llmConfig.apiBaseUrl)
    const key = llmConfig.apiKey
    const selectedModel = model || llmConfig.selectedModel
    if (!base || !key) throw new Error('请先在「设置 -> API 配置」中填写 Base URL 和 API Key')
    if (!selectedModel) throw new Error('请先选择一个模型')
    
    try {
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
        body: JSON.stringify({
          model: selectedModel,
          messages: messages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 500,
        }),
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
        throw new Error('模型返回空内容（可能是接口返回格式不兼容/被代理改写/上下文过大）')
      }
      return finalText
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error('请求超时：模型响应太慢（可尝试换模型/减少上下文/稍后重试）')
      }
      throw error
    }
  }

  const value = useMemo<OSContextValue>(() => ({
    time, isLocked, wallpaper, lockWallpaper, currentFont, fontColor, userProfile, fontScale, llmConfig, miCoinBalance,
    notifications, characters, chatLog, customAppIcons, decorImage, wallpaperError,
    musicPlaying, currentSong, musicProgress, musicPlaylist, musicFavorites, audioRef,
    setLocked, setWallpaper, setLockWallpaper, setCurrentFont, setFontColor, setFontScale, setUserProfile, setLLMConfig,
    setMiCoinBalance, addMiCoins, addNotification, markNotificationRead, addChatMessage, updateIntimacy,
    setCustomAppIcon, setDecorImage, setWallpaperError,
    playSong, pauseMusic, resumeMusic, toggleMusic, nextSong, prevSong, seekMusic, toggleFavorite, isFavorite, addSong, removeSong,
    setMusicPlaying, setCurrentSong,
    fetchAvailableModels, callLLM,
  }), [time, isLocked, wallpaper, lockWallpaper, currentFont, fontColor, userProfile, fontScale, llmConfig, miCoinBalance, 
      notifications, characters, chatLog, customAppIcons, decorImage, wallpaperError,
      musicPlaying, currentSong, musicProgress, musicPlaylist, musicFavorites])

  return <OSContext.Provider value={value}>{children}</OSContext.Provider>
}

export const useOS = () => {
  const ctx = useContext(OSContext)
  if (!ctx) throw new Error('useOS must be used within OSProvider')
  return ctx
}
