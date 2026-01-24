import { kvSet } from './kv'

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

  // OS
  'os_llm_config',
  'os_micoin_balance',
  'os_current_font_id',
  'os_font_color_id',

  // Music / system
  'littlephone_is_locked',
  'littlephone_music_playlist',
  'littlephone_music_version',
  'littlephone_location',
  'littlephone_weather',

  // Presets
  'littlephone_preset_config',
  'littlephone_presets_content',

  // Game
  'doudizhu_stats',
])

const ALLOW_PREFIXES = [
  // 情侣空间：每个角色一个 key
  'littlephone_couple_space_',
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

  ;(window as any).__LP_IMPORTING__ = true
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
      const value = normalizeValueToString(raw)
      if (value == null) {
        skipped.push(key)
        continue
      }
      tasks.push(
        kvSet(key, value).then(() => {
          written++
        })
      )
    }
    await Promise.all(tasks)
  }

  ;(window as any).__LP_IMPORTING__ = false
  return { written, skipped }
}

