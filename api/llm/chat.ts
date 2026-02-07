import { isSafeTargetUrl, json, normalizeApiBaseUrl, readJsonBody, setNoStore } from './_utils'

function normalizeGeminiBaseUrl(input: string): string {
  let trimmed = String(input || '').trim()
  if (!trimmed) return ''
  trimmed = trimmed.replace(/\/+$/, '')
  // 允许用户把 URL 填到具体路径（例如 .../v1beta/models 或 .../models/gemini-...）
  trimmed = trimmed.replace(/\/models\/?$/i, '')
  trimmed = trimmed.replace(/\/models\/[^/]+(:generateContent|:streamGenerateContent)?$/i, '')
  return trimmed
}

function looksLikeGeminiNativeBase(input: string): boolean {
  const t = String(input || '').toLowerCase()
  return t.includes('generativelanguage.googleapis.com') || t.includes('googleapis.com')
}

function toGeminiContentsFromOpenAI(messages: any[]) {
  const safeText = (c: any) => {
    if (typeof c === 'string') return c
    if (Array.isArray(c)) {
      return c
        .map((p: any) => {
          if (!p) return ''
          if (typeof p?.text === 'string' && p.text.trim()) return String(p.text)
          if (p?.type === 'image_url' || p?.type === 'image') return '[图片]'
          return ''
        })
        .filter(Boolean)
        .join('\n')
    }
    return String(c || '')
  }

  const sys = (messages || [])
    .filter((m: any) => m?.role === 'system')
    .map((m: any) => safeText(m?.content))
    .filter(Boolean)
    .join('\n\n')
    .trim()

  const contents = (messages || [])
    .filter((m: any) => m?.role !== 'system')
    .map((m: any) => {
      const role = m?.role === 'assistant' ? 'model' : 'user'
      const text = safeText(m?.content)
      return { role, parts: [{ text }] }
    })

  return { systemInstructionText: sys, contents }
}

function mapGeminiFinishReasonToOpenAI(reason: any): 'stop' | 'length' | 'content_filter' | null {
  const r = String(reason || '').toUpperCase()
  if (!r) return null
  if (r === 'STOP') return 'stop'
  if (r === 'MAX_TOKENS') return 'length'
  // SAFETY / RECITATION / OTHER：统一映射为 content_filter（前端一般只认这几个）
  if (r === 'SAFETY' || r === 'RECITATION' || r === 'OTHER') return 'content_filter'
  return 'stop'
}

function startSSE(res: any, statusCode = 200) {
  try {
    setNoStore(res)
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()
  } catch {
    // ignore
  }
}

function sseData(res: any, data: any) {
  try {
    res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
  } catch {
    // ignore
  }
}

function sseDone(res: any) {
  try {
    res.write('data: [DONE]\n\n')
    res.end()
  } catch {
    // ignore
  }
}

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
    const apiInterface = String(body?.apiInterface || '').trim() // optional: 'gemini_native' | 'openai_compatible'

    if (!apiBaseUrl || !apiKey) {
      return json(res, 400, { error: { message: 'Missing apiBaseUrl/apiKey' } })
    }
    if (!payload || typeof payload !== 'object') {
      return json(res, 400, { error: { message: 'Missing payload' } })
    }

    const wantsStream =
      payload?.stream === true ||
      String(req?.headers?.accept || '').toLowerCase().includes('text/event-stream') ||
      body?.stream === true

    const useGeminiNative =
      apiInterface === 'gemini_native' || (apiInterface ? false : looksLikeGeminiNativeBase(apiBaseUrl))

    // ====== A) Gemini 原生：streamGenerateContent / generateContent ======
    if (useGeminiNative) {
      const base = normalizeGeminiBaseUrl(apiBaseUrl)
      const modelRaw = String(payload?.model || '').trim()
      const modelPath = modelRaw
        ? modelRaw.startsWith('models/') ? modelRaw : `models/${modelRaw}`
        : 'models/gemini-2.0-flash'

      let target: URL
      try {
        const suffix = wantsStream ? ':streamGenerateContent' : ':generateContent'
        target = new URL(`${base}/${modelPath}${suffix}`)
        target.searchParams.set('key', apiKey)
      } catch {
        return json(res, 400, { error: { message: 'Invalid apiBaseUrl/model for Gemini' } })
      }
      if (!isSafeTargetUrl(target)) {
        return json(res, 400, { error: { message: 'Unsafe target url' } })
      }

      // 兼容：如果前端用 OpenAI chat payload，后端在此转换为 Gemini contents
      const openAIMessages = Array.isArray(payload?.messages) ? payload.messages : []
      const { systemInstructionText, contents } = toGeminiContentsFromOpenAI(openAIMessages)

      const temperature =
        typeof payload?.temperature === 'number' ? payload.temperature : undefined
      const maxTokens =
        typeof payload?.max_tokens === 'number'
          ? payload.max_tokens
          : typeof payload?.maxOutputTokens === 'number'
            ? payload.maxOutputTokens
            : undefined

      const geminiBody: any = {
        contents,
        generationConfig: {
          ...(typeof temperature === 'number' ? { temperature } : {}),
          ...(typeof maxTokens === 'number' ? { maxOutputTokens: maxTokens } : {}),
        },
      }
      if (systemInstructionText) {
        geminiBody.systemInstruction = { parts: [{ text: systemInstructionText }] }
      }

      const r = await fetch(target.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      })

      if (!r.ok) {
        const text = await r.text().catch(() => '')
        let data: any = {}
        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          data = { error: { message: 'Upstream returned non-JSON' }, raw: text.slice(0, 1200) }
        }
        return json(res, r.status, data)
      }

      // 非流式：直接转换成 OpenAI 兼容 JSON（choices.message.content）
      if (!wantsStream) {
        const text = await r.text().catch(() => '')
        let data: any = {}
        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          data = {}
        }
        const parts = data?.candidates?.[0]?.content?.parts
        const out = Array.isArray(parts) ? parts.map((p: any) => p?.text).filter(Boolean).join('') : ''
        return json(res, 200, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: modelRaw || modelPath,
          choices: [{ index: 0, message: { role: 'assistant', content: String(out || '') }, finish_reason: mapGeminiFinishReasonToOpenAI(data?.candidates?.[0]?.finishReason) }],
        })
      }

      // 流式：Gemini chunk -> OpenAI SSE chunk（choices[].delta）
      startSSE(res, 200)
      const id = `chatcmpl_${Date.now()}_${Math.random().toString(16).slice(2)}`
      const created = Math.floor(Date.now() / 1000)
      let sentRole = false
      let closed = false

      const decoder = new TextDecoder()
      const reader = (r as any).body?.getReader?.()
      if (!reader) {
        sseData(res, { error: { message: 'Upstream stream not readable' } })
        return sseDone(res)
      }

      let buf = ''
      const emitText = (txt: string) => {
        const t = String(txt || '')
        if (!t) return
        if (!sentRole) {
          sentRole = true
          sseData(res, {
            id,
            object: 'chat.completion.chunk',
            created,
            model: modelRaw || modelPath,
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
          })
        }
        sseData(res, {
          id,
          object: 'chat.completion.chunk',
          created,
          model: modelRaw || modelPath,
          choices: [{ index: 0, delta: { content: t }, finish_reason: null }],
        })
      }
      const emitFinish = (finishReason: any) => {
        if (closed) return
        closed = true
        sseData(res, {
          id,
          object: 'chat.completion.chunk',
          created,
          model: modelRaw || modelPath,
          choices: [{ index: 0, delta: {}, finish_reason: mapGeminiFinishReasonToOpenAI(finishReason) || 'stop' }],
        })
        sseDone(res)
      }

      try {
        // Gemini REST 流通常是 NDJSON；也可能是 SSE（data: {...}）
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value || new Uint8Array(), { stream: true })

          // 按行切分处理（NDJSON / SSE）
          while (true) {
            const nl = buf.indexOf('\n')
            if (nl < 0) break
            const lineRaw = buf.slice(0, nl)
            buf = buf.slice(nl + 1)
            const line = String(lineRaw || '').trim()
            if (!line) continue
            if (line === '[DONE]') {
              emitFinish('STOP')
              return
            }
            const payloadLine = line.startsWith('data:') ? line.replace(/^data:\s*/i, '') : line
            if (!payloadLine || payloadLine === '[DONE]') {
              emitFinish('STOP')
              return
            }
            let j: any = null
            try {
              j = JSON.parse(payloadLine)
            } catch {
              // 可能是半截 JSON：拼回 buffer 继续等
              buf = `${payloadLine}\n${buf}`
              break
            }
            const parts = j?.candidates?.[0]?.content?.parts
            const txt = Array.isArray(parts) ? parts.map((p: any) => p?.text).filter(Boolean).join('') : ''
            if (txt) emitText(txt)
            const fr = j?.candidates?.[0]?.finishReason
            if (fr) {
              emitFinish(fr)
              return
            }
          }
        }
      } catch (e: any) {
        if (!closed) {
          sseData(res, { error: { message: String(e?.message || 'Stream error') } })
          sseDone(res)
        }
        return
      }

      // 兜底：上游结束但没给 finishReason
      emitFinish('STOP')
      return
    }

    // ====== B) OpenAI 兼容：可选 stream=true，尽量直通不拼接 ======
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

    const openaiPayload = wantsStream ? { ...(payload as any), stream: true } : payload

    const r = await fetch(target.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(wantsStream ? { Accept: 'text/event-stream' } : {}),
      },
      body: JSON.stringify(openaiPayload),
    })

    if (wantsStream) {
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        let data: any = {}
        try {
          data = text ? JSON.parse(text) : {}
        } catch {
          data = { error: { message: 'Upstream returned non-JSON' }, raw: text.slice(0, 1200) }
        }
        return json(res, r.status, data)
      }

      startSSE(res, 200)
      const reader = (r as any).body?.getReader?.()
      if (!reader) {
        sseData(res, { error: { message: 'Upstream stream not readable' } })
        return sseDone(res)
      }
      try {
        const decoder = new TextDecoder()
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          // OpenAI SSE：直接透传（不在内存拼接完整字符串）
          res.write(decoder.decode(value || new Uint8Array(), { stream: true }))
        }
      } catch (e: any) {
        sseData(res, { error: { message: String(e?.message || 'Stream error') } })
      }
      return sseDone(res)
    }

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

