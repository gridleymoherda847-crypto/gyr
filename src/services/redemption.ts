/**
 * 兑换码验证服务
 * 使用 Supabase 后端 + FingerprintJS 设备指纹
 */

import FingerprintJS from '@fingerprintjs/fingerprintjs'
import { kvGet, kvRemove, kvSet, kvSetJSON, kvGetJSON } from '../storage/kv'

// Supabase 配置
const SUPABASE_URL = 'https://mrohruvzkxlnbjbrcqvp.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yb2hydXZ6a3hsbmJqYnJjcXZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MjY4ODksImV4cCI6MjA4NTAwMjg4OX0.QhhbejT86qUSG9ojNleVrZNMJhf-hc-oN15S8OPC0-8'

// 本地存储 key
const LOCAL_STORAGE_KEY = 'mina_phone_activation'
const KV_STORAGE_KEY = 'mina_phone_activation_kv'
const LOCAL_FP_KEY = 'mina_fp_cached'
const KV_FP_KEY = 'mina_fp_cached_kv'
const LOCAL_FALLBACK_ID_KEY = 'mina_device_id'
const KV_FALLBACK_ID_KEY = 'mina_device_id_kv'
// Cookie 兜底：部分浏览器可能会清理 localStorage / IndexedDB，但 cookie 往往还能保留更久一点
const COOKIE_ACT_KEY = 'mina_act'
const COOKIE_FP_KEY = 'mina_fp'
const COOKIE_FALLBACK_ID_KEY = 'mina_did'

function getCookie(name: string): string | null {
  try {
    const raw = String(document?.cookie || '')
    if (!raw) return null
    const parts = raw.split(';')
    for (const p of parts) {
      const s = p.trim()
      if (!s) continue
      if (!s.startsWith(name + '=')) continue
      const v = s.slice(name.length + 1)
      return v ? decodeURIComponent(v) : ''
    }
  } catch {}
  return null
}

function setCookie(name: string, value: string, maxAgeDays = 3650) {
  try {
    const maxAge = Math.max(1, Math.floor(maxAgeDays)) * 24 * 60 * 60
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${name}=${encodeURIComponent(String(value || ''))}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
  } catch {}
}

function deleteCookie(name: string) {
  try {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${secure}`
  } catch {}
}

async function tryRequestPersistentStorage(): Promise<boolean> {
  try {
    const nav: any = navigator as any
    if (!nav?.storage) return false
    const persisted = typeof nav.storage.persisted === 'function' ? await nav.storage.persisted() : false
    if (persisted) return true
    if (typeof nav.storage.persist === 'function') {
      const ok = await nav.storage.persist()
      return !!ok
    }
  } catch {}
  return false
}

// 类型定义
type RedemptionCode = {
  id: number
  code: string
  device_fingerprint: string | null
  is_used: boolean
  activated_at: string | null
  created_at: string
}

type ActivationStatus = {
  isActivated: boolean
  code?: string
  activatedAt?: string
}

// 获取设备指纹
let cachedFingerprint: string | null = null

export async function getDeviceFingerprint(): Promise<string> {
  if (cachedFingerprint) return cachedFingerprint
  
  try {
    // -1) cookie 兜底（某些环境 localStorage/IDB 会被清掉，但 cookie 还在）
    try {
      const pinnedC = getCookie(COOKIE_FP_KEY)
      if (pinnedC) {
        cachedFingerprint = pinnedC
        try { localStorage.setItem(LOCAL_FP_KEY, pinnedC) } catch {}
        try { await kvSet(KV_FP_KEY, pinnedC) } catch {}
        return pinnedC
      }
    } catch {}

    // 0) 优先使用“已缓存的指纹”（避免某些浏览器/隐私策略导致 visitorId 偶发变化，引发反复需要换绑/重激活）
    try {
      const pinned = localStorage.getItem(LOCAL_FP_KEY)
      if (pinned) {
        cachedFingerprint = pinned
        try { setCookie(COOKIE_FP_KEY, pinned) } catch {}
        return pinned
      }
    } catch {}
    try {
      const pinnedKv = await kvGet(KV_FP_KEY)
      if (pinnedKv) {
        try { localStorage.setItem(LOCAL_FP_KEY, pinnedKv) } catch {}
        try { setCookie(COOKIE_FP_KEY, pinnedKv) } catch {}
        cachedFingerprint = pinnedKv
        return pinnedKv
      }
    } catch {}

    const fp = await FingerprintJS.load()
    const result = await fp.get()
    cachedFingerprint = result.visitorId
    try { localStorage.setItem(LOCAL_FP_KEY, cachedFingerprint) } catch {}
    try { await kvSet(KV_FP_KEY, cachedFingerprint) } catch {}
    try { setCookie(COOKIE_FP_KEY, cachedFingerprint) } catch {}
    return cachedFingerprint
  } catch (error) {
    console.error('获取设备指纹失败:', error)
    // 降级方案：使用随机 ID 存储到 localStorage
    let fallbackId: string | null = null
    try { fallbackId = localStorage.getItem(LOCAL_FALLBACK_ID_KEY) } catch {}
    if (!fallbackId) {
      try { fallbackId = getCookie(COOKIE_FALLBACK_ID_KEY) } catch {}
    }
    if (!fallbackId) {
      try { fallbackId = await kvGet(KV_FALLBACK_ID_KEY) } catch {}
    }
    if (!fallbackId) {
      fallbackId = 'fallback_' + Math.random().toString(36).substring(2) + Date.now().toString(36)
      try { localStorage.setItem(LOCAL_FALLBACK_ID_KEY, fallbackId) } catch {}
      try { await kvSet(KV_FALLBACK_ID_KEY, fallbackId) } catch {}
      try { setCookie(COOKIE_FALLBACK_ID_KEY, fallbackId) } catch {}
    }
    cachedFingerprint = fallbackId
    try { setCookie(COOKIE_FP_KEY, cachedFingerprint) } catch {}
    return cachedFingerprint
  }
}

// 检查本地激活状态
export function getLocalActivationStatus(): ActivationStatus {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (saved) {
      const data = JSON.parse(saved)
      return {
        isActivated: true,
        code: data.code,
        activatedAt: data.activatedAt,
      }
    }
  } catch {}
  // cookie 兜底
  try {
    const savedC = getCookie(COOKIE_ACT_KEY)
    if (savedC) {
      const data = JSON.parse(savedC)
      if (data && data.code) {
        return { isActivated: true, code: data.code, activatedAt: data.activatedAt }
      }
    }
  } catch {}
  return { isActivated: false }
}

// 保存激活状态到本地
function saveLocalActivation(code: string, activatedAt: string) {
  const payload = { code, activatedAt }
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload))
  } catch {}
  // cookie 再存一份
  try {
    setCookie(COOKIE_ACT_KEY, JSON.stringify(payload))
  } catch {}
  // 冗余保存一份到 IndexedDB（localforage），降低“某些浏览器 localStorage 退出即清”导致反复输入兑换码的概率
  void kvSetJSON(KV_STORAGE_KEY, payload).catch(() => {})
  // 尝试申请“持久化存储”（降低 iOS/移动端系统清理概率）
  void tryRequestPersistentStorage().catch(() => {})
}

// 验证兑换码（主函数）
export async function verifyRedemptionCode(code: string): Promise<{
  success: boolean
  message: string
  needMigration?: boolean
  existingDevice?: string
}> {
  const fingerprint = await getDeviceFingerprint()
  const normalizedCode = code.trim().toUpperCase()
  
  try {
    // 1. 查询兑换码
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/redemption_codes?code=eq.${encodeURIComponent(normalizedCode)}`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    )
    
    if (!response.ok) {
      throw new Error('网络请求失败')
    }
    
    const codes: RedemptionCode[] = await response.json()
    
    if (codes.length === 0) {
      return { success: false, message: '兑换码不存在' }
    }
    
    const codeData = codes[0]
    
    // 2. 检查是否已被使用
    if (codeData.is_used && codeData.device_fingerprint) {
      // 如果是同一设备，直接激活成功
      if (codeData.device_fingerprint === fingerprint) {
        saveLocalActivation(normalizedCode, codeData.activated_at || new Date().toISOString())
        return { success: true, message: '验证成功！欢迎回来' }
      }
      
      // 如果是不同设备，询问是否迁移
      return {
        success: false,
        message: '此兑换码已在其他设备激活',
        needMigration: true,
        existingDevice: codeData.device_fingerprint.substring(0, 8) + '...',
      }
    }
    
    // 3. 首次激活：绑定设备
    const activatedAt = new Date().toISOString()
    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/redemption_codes?id=eq.${codeData.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          device_fingerprint: fingerprint,
          is_used: true,
          activated_at: activatedAt,
        }),
      }
    )
    
    if (!updateResponse.ok) {
      throw new Error('激活失败，请重试')
    }
    
    // 4. 保存到本地
    saveLocalActivation(normalizedCode, activatedAt)
    
    return { success: true, message: '激活成功！欢迎使用 Mina 小手机' }
    
  } catch (error) {
    console.error('验证兑换码失败:', error)
    return { success: false, message: '网络错误，请稍后重试' }
  }
}

// 迁移到新设备
export async function migrateToNewDevice(code: string): Promise<{
  success: boolean
  message: string
}> {
  const fingerprint = await getDeviceFingerprint()
  const normalizedCode = code.trim().toUpperCase()
  
  try {
    // 1. 查询兑换码
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/redemption_codes?code=eq.${encodeURIComponent(normalizedCode)}`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    )
    
    const codes: RedemptionCode[] = await response.json()
    
    if (codes.length === 0) {
      return { success: false, message: '兑换码不存在' }
    }
    
    const codeData = codes[0]
    
    // 2. 更新设备指纹
    const activatedAt = new Date().toISOString()
    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/redemption_codes?id=eq.${codeData.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          device_fingerprint: fingerprint,
          activated_at: activatedAt,
        }),
      }
    )
    
    if (!updateResponse.ok) {
      throw new Error('迁移失败，请重试')
    }
    
    // 3. 保存到本地
    saveLocalActivation(normalizedCode, activatedAt)
    
    return { success: true, message: '设备迁移成功！旧设备已失效' }
    
  } catch (error) {
    console.error('设备迁移失败:', error)
    return { success: false, message: '网络错误，请稍后重试' }
  }
}

// 验证当前设备是否已激活（用于自动检查）
export async function checkDeviceActivation(): Promise<boolean> {
  const res = await checkDeviceActivationDetailed()
  return res.ok
}

export type ActivationCheckResult =
  | { ok: true }
  | { ok: false; reason: 'no_local' | 'code_missing' | 'mismatch' | 'network' | 'server' }

// 更细粒度的激活校验：用于“网络宽限”策略
export async function checkDeviceActivationDetailed(): Promise<ActivationCheckResult> {
  // 1. 先检查本地存储
  const local = getLocalActivationStatus()
  if (!local.isActivated || !local.code) {
    return { ok: false, reason: 'no_local' }
  }
  // 有激活记录时，后台尝试申请持久化存储（不阻塞）
  void tryRequestPersistentStorage().catch(() => {})
  
  // 2. 验证服务器端
  const fingerprint = await getDeviceFingerprint()
  
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/redemption_codes?code=eq.${encodeURIComponent(local.code)}`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    )

    if (!response.ok) {
      return { ok: false, reason: 'server' }
    }
    
    const codes: RedemptionCode[] = await response.json()
    
    if (codes.length === 0) {
      // 兑换码不存在了，清除本地状态
      try { localStorage.removeItem(LOCAL_STORAGE_KEY) } catch {}
      try { await kvRemove(KV_STORAGE_KEY) } catch {}
      try { deleteCookie(COOKIE_ACT_KEY) } catch {}
      return { ok: false, reason: 'code_missing' }
    }
    
    const codeData = codes[0]
    
    // 检查设备指纹是否匹配
    if (codeData.device_fingerprint === fingerprint) {
      return { ok: true }
    }
    
    // 设备不匹配（可能已迁移到其他设备），清除本地状态
    try { localStorage.removeItem(LOCAL_STORAGE_KEY) } catch {}
    try { await kvRemove(KV_STORAGE_KEY) } catch {}
    try { deleteCookie(COOKIE_ACT_KEY) } catch {}
    return { ok: false, reason: 'mismatch' }
    
  } catch (error) {
    console.error('检查激活状态失败:', error)
    return { ok: false, reason: 'network' }
  }
}

// 清除本地激活状态（用于调试）
export function clearLocalActivation() {
  try { localStorage.removeItem(LOCAL_STORAGE_KEY) } catch {}
  void kvRemove(KV_STORAGE_KEY).catch(() => {})
  try { deleteCookie(COOKIE_ACT_KEY) } catch {}
  cachedFingerprint = null
}

// 从 IndexedDB 里尝试恢复激活状态（当 localStorage 丢失但 IndexedDB 仍在时可自动修复）
export async function recoverActivationFromKv(): Promise<boolean> {
  // 先尝试 cookie（最轻量）
  try {
    const savedC = getCookie(COOKIE_ACT_KEY)
    if (savedC) {
      const data = JSON.parse(savedC)
      const code = String((data as any)?.code || '').trim()
      const activatedAt = String((data as any)?.activatedAt || '').trim()
      if (code) {
        try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ code, activatedAt })) } catch {}
        try { await kvSetJSON(KV_STORAGE_KEY, { code, activatedAt }) } catch {}
        return true
      }
    }
  } catch {}
  try {
    const v = await kvGetJSON<{ code?: string; activatedAt?: string } | null>(KV_STORAGE_KEY, null)
    const code = String((v as any)?.code || '').trim()
    const activatedAt = String((v as any)?.activatedAt || '').trim()
    if (!code) return false
    // 写回 localStorage，后续走现有快速路径
    try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ code, activatedAt })) } catch {}
    try { setCookie(COOKIE_ACT_KEY, JSON.stringify({ code, activatedAt })) } catch {}
    return true
  } catch {
    return false
  }
}
