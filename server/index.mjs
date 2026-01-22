import express from 'express'

const app = express()
app.use(express.json({ limit: '2mb' }))

// 只在本机/局域网后端保存，不会出现在前端源码里
const API_BASE_URL = process.env.MIBI_API_BASE_URL || ''
const API_KEY = process.env.MIBI_API_KEY || ''

function normalizeBase(url) {
  const t = (url || '').trim().replace(/\/+$/, '')
  if (!t) return ''
  return t.endsWith('/v1') ? t : `${t}/v1`
}

function assertConfigured(res) {
  if (!API_BASE_URL || !API_KEY) {
    res.status(500).json({ error: { message: 'Server API not configured' } })
    return false
  }
  return true
}

app.get('/api/models', async (req, res) => {
  if (!assertConfigured(res)) return
  const base = normalizeBase(API_BASE_URL)
  try {
    const r = await fetch(`${base}/models`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    })
    const data = await r.json().catch(() => ({}))
    res.status(r.status).json(data)
  } catch (e) {
    res.status(500).json({ error: { message: 'Network error' } })
  }
})

app.post('/api/chat', async (req, res) => {
  if (!assertConfigured(res)) return
  const base = normalizeBase(API_BASE_URL)
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body || {}),
    })
    const data = await r.json().catch(() => ({}))
    res.status(r.status).json(data)
  } catch (e) {
    res.status(500).json({ error: { message: 'Network error' } })
  }
})

const port = Number(process.env.PORT || 8787)
app.listen(port, '0.0.0.0', () => {
  console.log(`[littlephone-server] listening on http://0.0.0.0:${port}`)
})

