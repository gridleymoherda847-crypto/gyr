type Json = any

export function readJsonBody(req: any): Promise<Json> {
  return new Promise((resolve) => {
    try {
      // Vercel/Node 可能已经解析好了 body
      if (req?.body && typeof req.body === 'object') return resolve(req.body)
      let raw = ''
      req.on('data', (chunk: any) => {
        raw += chunk
        // 防止过大
        if (raw.length > 2_500_000) raw = raw.slice(0, 2_500_000)
      })
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {})
        } catch {
          resolve({})
        }
      })
    } catch {
      resolve({})
    }
  })
}

export function normalizeApiBaseUrl(input: string): string {
  let trimmed = (input || '').trim()
  if (!trimmed) return ''
  trimmed = trimmed.replace(/\/+$/, '')
  trimmed = trimmed.replace(/\/chat\/completions\/?$/i, '')
  trimmed = trimmed.replace(/\/models\/?$/i, '')
  // 智谱 GLM（open.bigmodel.cn /api/paas/v4）是 OpenAI 兼容但不走 /v1 路径，保持原路径
  if (/^https?:\/\/open\.bigmodel\.cn\/api\/paas\/v4(?:\/|$)/i.test(trimmed)) {
    return trimmed
  }
  const v1Index = trimmed.toLowerCase().indexOf('/v1')
  if (v1Index >= 0) {
    const prefix = trimmed.slice(0, v1Index)
    return `${prefix}/v1`
  }
  return `${trimmed}/v1`
}

function isIPv4(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
}

function isLocalOrPrivateIPv4(host: string): boolean {
  if (!isIPv4(host)) return false
  const parts = host.split('.').map((x) => parseInt(x, 10))
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 127) return true
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  return false
}

export function isSafeTargetUrl(u: URL): boolean {
  const protocol = (u.protocol || '').toLowerCase()
  if (protocol !== 'https:' && protocol !== 'http:') return false
  const host = (u.hostname || '').toLowerCase()
  if (!host) return false
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1') return false
  if (host.endsWith('.local')) return false
  if (isLocalOrPrivateIPv4(host)) return false
  // 对于 IPv6 / DNS 指向内网：这里无法完全防住，但至少挡住明显的本机/内网
  return true
}

export function setNoStore(res: any) {
  try {
    res.setHeader('Cache-Control', 'no-store')
  } catch {}
}

export function json(res: any, status: number, data: any) {
  try {
    setNoStore(res)
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(data ?? {}))
  } catch {
    // ignore
  }
}

