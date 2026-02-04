/**
 * 兑换码验证服务
 * 使用 Supabase 后端 + FingerprintJS 设备指纹
 */

import FingerprintJS from '@fingerprintjs/fingerprintjs'

// Supabase 配置
const SUPABASE_URL = 'https://mrohruvzkxlnbjbrcqvp.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yb2hydXZ6a3hsbmJqYnJjcXZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MjY4ODksImV4cCI6MjA4NTAwMjg4OX0.QhhbejT86qUSG9ojNleVrZNMJhf-hc-oN15S8OPC0-8'

// 本地存储 key
const LOCAL_STORAGE_KEY = 'mina_phone_activation'

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
    const fp = await FingerprintJS.load()
    const result = await fp.get()
    cachedFingerprint = result.visitorId
    return cachedFingerprint
  } catch (error) {
    console.error('获取设备指纹失败:', error)
    // 降级方案：使用随机 ID 存储到 localStorage
    let fallbackId = localStorage.getItem('mina_device_id')
    if (!fallbackId) {
      fallbackId = 'fallback_' + Math.random().toString(36).substring(2) + Date.now().toString(36)
      localStorage.setItem('mina_device_id', fallbackId)
    }
    cachedFingerprint = fallbackId
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
  return { isActivated: false }
}

// 保存激活状态到本地
function saveLocalActivation(code: string, activatedAt: string) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
    code,
    activatedAt,
  }))
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
      localStorage.removeItem(LOCAL_STORAGE_KEY)
      return { ok: false, reason: 'code_missing' }
    }
    
    const codeData = codes[0]
    
    // 检查设备指纹是否匹配
    if (codeData.device_fingerprint === fingerprint) {
      return { ok: true }
    }
    
    // 设备不匹配（可能已迁移到其他设备），清除本地状态
    localStorage.removeItem(LOCAL_STORAGE_KEY)
    return { ok: false, reason: 'mismatch' }
    
  } catch (error) {
    console.error('检查激活状态失败:', error)
    return { ok: false, reason: 'network' }
  }
}

// 清除本地激活状态（用于调试）
export function clearLocalActivation() {
  localStorage.removeItem(LOCAL_STORAGE_KEY)
  cachedFingerprint = null
}
