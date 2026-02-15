import { kvGet, kvKeys, kvSet } from './kv'

export type LegacyImportResult = {
  written: number
  skipped: string[]
}

type LegacyBackupFile =
  | { version?: string; exportTime?: string; data: Record<string, any> }
  | Record<string, any>

const IGNORE_KEYS_EXACT = new Set<string>([
  // UI 临时态
  'wechat_active_tab',
])

const IGNORE_PREFIXES = [
  // 已删除功能：星引力
  'wechat_star_gravity_',
]

const ALLOW_KEYS_EXACT = new Set<string>([
  // WeChat
  'wechat_characters',
  'wechat_messages',
  'wechat_stickers',
  'wechat_sticker_categories',
  'wechat_favorite_diaries',
  'wechat_my_diaries', // 我的日记
  'wechat_moments',
  'wechat_user_settings',
  'wechat_user_personas',
  'wechat_transfers',
  'wechat_anniversaries',
  'wechat_periods',
  'wechat_listen_together',
  'wechat_wallet_balance',
  'wechat_wallet_initialized',
  'wechat_wallet_bills',
  'wechat_bubble_opacity_mode',
  'wechat_funds', // 基金数据
  'wechat_fund_holdings', // 基金持仓
  'wechat_groups', // 群聊数据
  'wechat_takeout_history', // 外卖历史订单（袋鼠外卖）
  'wechat_takeout_custom_stores_v1', // 自定义外卖店铺
  'wechat_takeout_pinned_store_ids_v1', // 外卖置顶店铺

  // OS
  'os_llm_config',
  'os_tts_config', // TTS配置
  'os_micoin_balance',
  'os_current_font_id',
  'os_font_color_id',
  'os_font_size_tier', // 字体大小档位（全局）
  'os_glass_opacity', // 桌面玻璃底图透明度
  'os_wallpaper', // 壁纸
  'os_custom_app_icons', // 自定义app图标
  'os_custom_app_icons_layout1', // 自定义app图标（桌面排版1）
  'os_custom_app_icons_layout2', // 自定义app图标（桌面排版2）
  'os_decor_image', // 装饰图片
  'os_decor_image_layout1', // 唱片封面（桌面排版1）
  'os_decor_image_layout2', // 唱片封面（桌面排版2）
  'os_user_profile', // 用户资料
  'os_icon_theme', // 图标主题
  'os_anniversaries', // 纪念日
  'os_memo', // 备忘录
  'os_home_avatar', // 主页头像
  'os_water_count', // 喝水计数
  'os_water_date', // 喝水日期
  'os_signature', // 签名
  'os_custom_fonts', // 自定义字体 ★新增

  // API 配置
  'mina_api_configs', // API配置列表 ★新增
  'mina_current_api_config_id', // 当前使用的API配置ID ★新增

  // 屏幕适配设置
  'mina_screen_padding_top', // 屏幕上边距 ★新增
  'mina_screen_padding_bottom', // 屏幕下边距 ★新增
  'mina_screen_padding_left', // 屏幕左边距 ★新增
  'mina_screen_padding_right', // 屏幕右边距 ★新增
  'mina_hide_status_bar', // 隐藏状态栏 ★新增
  'mina_ios_safe_area', // iOS安全区域 ★新增

  // Music / system
  'littlephone_is_locked',
  'littlephone_music_playlist',
  'littlephone_music_version',
  'littlephone_location',
  'littlephone_weather',
  'littlephone_recent_stickers', // 最近使用的表情包 ★新增

  // 创作工坊
  'littlephone_workshop_config', // 工坊配置（叙事设置+世界书）
  'littlephone_preset_config', // 旧版兼容
  'littlephone_presets_content', // 生成的预设内容

  // Game
  'doudizhu_stats',
  'scratch_card_stats', // 刮刮乐统计
  'lp_xiuxian_v1', // 寥寥一生游戏存档
  'lp_xiuxian_stories_v1', // 寥寥一生游戏故事
  'liaoliao_yisheng_bgm_volume', // 寥寥一生背景音乐音量
  'liaoliao_yisheng_bgm_enabled', // 寥寥一生背景音乐开关

  // X (推特)
  'littlephone_x_v1', // X全部数据（用户、推文、私信、关注等）

  // 桌面美化预设历史
  'mina_desktop_beautify_presets_v1',
])

const ALLOW_PREFIXES = [
  // 情侣空间：每个角色一个 key
  'littlephone_couple_space_',
  // 外卖面板：每个角色的配送位置与地址偏好
  'lp_takeout_deliver_to_',
  'lp_takeout_character_addr_',
]

function shouldIgnoreKey(key: string): boolean {
  if (IGNORE_KEYS_EXACT.has(key)) return true
  return IGNORE_PREFIXES.some(p => key.startsWith(p))
}

function shouldImportKey(key: string): boolean {
  if (shouldIgnoreKey(key)) return false
  if (ALLOW_KEYS_EXACT.has(key)) return true
  return ALLOW_PREFIXES.some(p => key.startsWith(p))
}

function normalizeValueToString(value: any): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function parseMaybeJsonDeep(v: any): any {
  // 支持：原生对象/数组；或字符串包 JSON（甚至双层）
  if (v == null) return v
  let cur: any = v
  for (let i = 0; i < 2; i++) {
    if (typeof cur !== 'string') break
    const s = cur.trim()
    if (!s) break
    const looksJson =
      (s.startsWith('{') && s.endsWith('}')) ||
      (s.startsWith('[') && s.endsWith(']')) ||
      (s.startsWith('"') && s.endsWith('"')) ||
      (/^-?\d+(\.\d+)?$/.test(s)) ||
      (s === 'true' || s === 'false' || s === 'null')
    if (!looksJson) break
    try {
      cur = JSON.parse(s)
    } catch {
      break
    }
  }
  return cur
}

function normalizeWeChatCharacters(raw: any): string | null {
  const v = parseMaybeJsonDeep(raw)
  if (!Array.isArray(v)) return normalizeValueToString(raw)
  const now = Date.now()
  const out = v.map((c: any, idx: number) => {
    const id = typeof c?.id === 'string' && c.id ? c.id : `char_${now}_${idx}_${Math.random().toString(36).slice(2)}`
    const createdAt = typeof c?.createdAt === 'number' ? c.createdAt : now
    return { ...c, id, createdAt }
  })
  return JSON.stringify(out)
}

function normalizeWeChatMessages(raw: any): string | null {
  const v = parseMaybeJsonDeep(raw)
  if (!Array.isArray(v)) return normalizeValueToString(raw)
  let lastTs = Date.now()
  const out = v.map((m: any, idx: number) => {
    const id = typeof m?.id === 'string' && m.id ? m.id : `msg_${Date.now()}_${idx}_${Math.random().toString(36).slice(2)}`
    let timestamp = typeof m?.timestamp === 'number' ? m.timestamp : undefined
    if (timestamp == null) {
      timestamp = lastTs + 1
    }
    lastTs = timestamp
    return { ...m, id, timestamp }
  })
  return JSON.stringify(out)
}

function normalizeByKey(key: string, raw: any): string | null {
  if (key === 'wechat_characters') return normalizeWeChatCharacters(raw)
  if (key === 'wechat_messages') return normalizeWeChatMessages(raw)
  return normalizeValueToString(raw)
}

function extractDataMap(parsed: LegacyBackupFile): Record<string, any> {
  if (parsed && typeof parsed === 'object' && 'data' in parsed) {
    const data = (parsed as any).data
    if (data && typeof data === 'object') return data as Record<string, any>
  }
  return parsed as Record<string, any>
}

export async function importLegacyBackupJsonText(text: string): Promise<LegacyImportResult> {
  const trimmed = (text || '').trim()
  if (!trimmed) throw new Error('文件为空或读取失败')

  let parsed: LegacyBackupFile
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('文件解析失败：不是有效 JSON')
  }

  const data = extractDataMap(parsed)
  if (!data || typeof data !== 'object') throw new Error('文件格式不正确：缺少 data')

  const entries = Object.entries(data)
  if (entries.length === 0) throw new Error('备份文件里没有任何数据')

  const skipped: string[] = []
  let written = 0

  // 分批写入（更快且避免 UI 卡死）
  const CHUNK = 40
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK)
    const tasks: Promise<void>[] = []
    for (const [key, raw] of chunk) {
      if (!shouldImportKey(key)) {
        skipped.push(key)
        continue
      }
      const value = normalizeByKey(key, raw)
      if (value == null) {
        skipped.push(key)
        continue
      }
      // 同时写入 IndexedDB 和 localStorage（兼容不同模块的读取方式）
      tasks.push(
        kvSet(key, value).then(() => {
          written++
        })
      )
      // 同时写入 localStorage（某些模块如创作工坊/世界书从 localStorage 读取）
      try {
        localStorage.setItem(key, value)
      } catch {
        // localStorage 可能已满，忽略
      }
    }
    await Promise.all(tasks)
  }

  // 注意：导入完成后不要在这里把 __LP_IMPORTING__ 改回 false。
  // 因为 App 的 WeChat/OS 会在 isHydrated 后自动持久化当前“内存态”，
  // 如果此时还没重启，内存里往往仍是“空白/旧数据”，会把刚导入的数据覆盖回去（部分机型更容易触发）。
  // importing 的生命周期应由调用方（设置页导入流程）控制：成功后直接重启页面即可自然清空 flag。
  return { written, skipped }
}

export async function exportCurrentBackupJsonText(): Promise<string> {
  const data: Record<string, any> = {}
  
  // 1. 从 IndexedDB (kv) 读取数据
  const keys = await kvKeys()
  for (const k of keys) {
    if (!shouldImportKey(k)) continue
    const v = await kvGet(k)
    if (v == null) continue
    // 保持"旧格式"：value 全部是 string（多数是 JSON 字符串），便于跨版本兼容
    data[k] = v
  }
  
  // 2. 从 localStorage 读取数据（兼容旧版存储方式）
  // 某些模块（如创作工坊/世界书）仍然使用 localStorage
  for (const allowedKey of ALLOW_KEYS_EXACT) {
    if (data[allowedKey]) continue // 已从 IndexedDB 读取过
    try {
      const v = localStorage.getItem(allowedKey)
      if (v != null) {
        data[allowedKey] = v
      }
    } catch {
      // ignore
    }
  }
  
  // 3. 从 localStorage 读取前缀匹配的数据
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || data[key]) continue
    if (!shouldImportKey(key)) continue
    try {
      const v = localStorage.getItem(key)
      if (v != null) {
        data[key] = v
      }
    } catch {
      // ignore
    }
  }
  
  return JSON.stringify(
    {
      version: '3.0.0',
      exportTime: new Date().toISOString(),
      data,
    },
    null,
    2
  )
}
