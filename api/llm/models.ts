import { isSafeTargetUrl, json, normalizeApiBaseUrl, readJsonBody } from './_utils'

export default async function handler(req: any, res: any) {
  try {
    const method = String(req?.method || 'GET').toUpperCase()
    if (method !== 'POST' && method !== 'GET') {
      return json(res, 405, { error: { message: 'Method Not Allowed' } })
    }

    // 建议用 POST body；GET 时允许从 header 取（避免 key 出现在 URL）
    const body = method === 'POST' ? await readJsonBody(req) : {}
    const apiBaseUrl = String(body?.apiBaseUrl || req?.headers?.['x-mina-api-base-url'] || '').trim()
    const apiKey = String(body?.apiKey || req?.headers?.['x-mina-api-key'] || '').trim()
    if (!apiBaseUrl || !apiKey) {
      return json(res, 400, { error: { message: 'Missing apiBaseUrl/apiKey' } })
    }

    const base = normalizeApiBaseUrl(apiBaseUrl)
    let target: URL
    try {
      target = new URL(`${base}/models`)
    } catch {
      return json(res, 400, { error: { message: 'Invalid apiBaseUrl' } })
    }
    if (!isSafeTargetUrl(target)) {
      return json(res, 400, { error: { message: 'Unsafe target url' } })
    }

    const r = await fetch(target.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })
    const text = await r.text()
    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { error: { message: 'Upstream returned non-JSON' }, raw: text.slice(0, 800) }
    }
    return json(res, r.status, data)
  } catch (e: any) {
    return json(res, 500, { error: { message: String(e?.message || 'Server error') } })
  }
}

