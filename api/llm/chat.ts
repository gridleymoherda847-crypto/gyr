import { isSafeTargetUrl, json, normalizeApiBaseUrl, readJsonBody } from './_utils'

export default async function handler(req: any, res: any) {
  try {
    const method = String(req?.method || 'POST').toUpperCase()
    if (method !== 'POST') {
      return json(res, 405, { error: { message: 'Method Not Allowed' } })
    }

    const body = await readJsonBody(req)
    const apiBaseUrl = String(body?.apiBaseUrl || '').trim()
    const apiKey = String(body?.apiKey || '').trim()
    const payload = body?.payload || body?.request || null

    if (!apiBaseUrl || !apiKey) {
      return json(res, 400, { error: { message: 'Missing apiBaseUrl/apiKey' } })
    }
    if (!payload || typeof payload !== 'object') {
      return json(res, 400, { error: { message: 'Missing payload' } })
    }

    const base = normalizeApiBaseUrl(apiBaseUrl)
    let target: URL
    try {
      target = new URL(`${base}/chat/completions`)
    } catch {
      return json(res, 400, { error: { message: 'Invalid apiBaseUrl' } })
    }
    if (!isSafeTargetUrl(target)) {
      return json(res, 400, { error: { message: 'Unsafe target url' } })
    }

    const r = await fetch(target.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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

