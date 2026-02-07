import { isSafeTargetUrl, json, normalizeApiBaseUrl, readJsonBody, setNoStore } from './_utils'

function safeJsonParse(text: string): any | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function buildDebugError(e: any, extra?: any) {
  const message = String(e?.message || e || 'Unknown error')
  const responseData = (e as any)?.response?.data
  const stack = typeof e?.stack === 'string' ? e.stack.split('\n').slice(0, 6).join('\n') : undefined
  return {
    message,
    responseData: responseData ?? undefined,
    ...(extra && typeof extra === 'object' ? extra : {}),
    stack,
  }
}

function debugErrorToText(info: any) {
  try {
    const msg = String(info?.message || 'Unknown error')
    const upstreamStatus = info?.upstreamStatus
    const upstream = info?.upstreamData
    const raw = info?.upstreamRaw
    const pieces: string[] = []
    pieces.push(`【API 调用失败】${msg}`)
    if (upstreamStatus) pieces.push(`- upstreamStatus: ${upstreamStatus}`)
    if (upstream && typeof upstream === 'object') {
      const compact = JSON.stringify(upstream).slice(0, 1800)
      pieces.push(`- upstreamData: ${compact}`)
    } else if (typeof raw === 'string' && raw.trim()) {
      pieces.push(`- upstreamRaw: ${raw.trim().slice(0, 1800)}`)
    }
    if (info?.responseData) {
      const compact = JSON.stringify(info.responseData).slice(0, 1800)
      pieces.push(`- error.response.data: ${compact}`)
    }
    return pieces.join('\n')
  } catch {
    return `【API 调用失败】${String(info?.message || 'Unknown error')}`
  }
}

function sendNonStreamErrorAsOpenAI(res: any, model: string, info: any) {
  const text = debugErrorToText(info)
  return json(res, 200, {
    id: `chatcmpl_err_${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model || 'unknown',
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    error: info,
  })
}

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
        // 排查阶段：不要返回 500/400 让前端只看到“失败”，直接把原因吐给 UI
        return sendNonStreamErrorAsOpenAI(res, modelRaw || modelPath, buildDebugError(new Error('Invalid apiBaseUrl/model for Gemini')))
      }
      if (!isSafeTargetUrl(target)) {
        return sendNonStreamErrorAsOpenAI(res, modelRaw || modelPath, buildDebugError(new Error('Unsafe target url')))
      }

      try {
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
          const rawText = await r.text().catch(() => '')
          const parsed = safeJsonParse(rawText)
          const info = buildDebugError(new Error('Gemini upstream error'), {
            upstreamStatus: r.status,
            upstreamData: parsed ?? undefined,
            upstreamRaw: parsed ? undefined : rawText.slice(0, 2000),
          })

          if (wantsStream) {
            startSSE(res, 200)
            // 用 OpenAI SSE 的 delta.content 吐出错误文本，让手机聊天界面直接看见
            sseData(res, {
              id: `chatcmpl_${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: modelRaw || modelPath,
              choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
            })
            sseData(res, {
              id: `chatcmpl_${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: modelRaw || modelPath,
              choices: [{ index: 0, delta: { content: debugErrorToText(info) }, finish_reason: null }],
            })
            sseData(res, {
              id: `chatcmpl_${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: modelRaw || modelPath,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            })
            return sseDone(res)
          }
          return sendNonStreamErrorAsOpenAI(res, modelRaw || modelPath, info)
        }

        // 非流式：直接转换成 OpenAI 兼容 JSON（choices.message.content）
        if (!wantsStream) {
          const rawText = await r.text().catch(() => '')
          const data: any = safeJsonParse(rawText) || {}
          const parts = data?.candidates?.[0]?.content?.parts
          const out = Array.isArray(parts) ? parts.map((p: any) => p?.text).filter(Boolean).join('') : ''
          return json(res, 200, {
            id: `chatcmpl_${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: modelRaw || modelPath,
            choices: [{
              index: 0,
              message: { role: 'assistant', content: String(out || '') },
              finish_reason: mapGeminiFinishReasonToOpenAI(data?.candidates?.[0]?.finishReason),
            }],
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
          const info = buildDebugError(new Error('Upstream stream not readable'))
          sseData(res, {
            id,
            object: 'chat.completion.chunk',
            created,
            model: modelRaw || modelPath,
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
          })
          sseData(res, {
            id,
            object: 'chat.completion.chunk',
            created,
            model: modelRaw || modelPath,
            choices: [{ index: 0, delta: { content: debugErrorToText(info) }, finish_reason: null }],
          })
          sseData(res, {
            id,
            object: 'chat.completion.chunk',
            created,
            model: modelRaw || modelPath,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          })
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
            const info = buildDebugError(e, { stage: 'gemini_stream_parse' })
            emitText(debugErrorToText(info))
            emitFinish('STOP')
          }
          return
        }

        // 兜底：上游结束但没给 finishReason
        emitFinish('STOP')
        return
      } catch (e: any) {
        // Gemini 任意异常：不要返回 500，直接把具体错误吐给前端/聊天 UI
        const info = buildDebugError(e, { stage: 'gemini_call' })
        if (wantsStream) {
          startSSE(res, 200)
          sseData(res, {
            id: `chatcmpl_${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: modelRaw || modelPath,
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
          })
          sseData(res, {
            id: `chatcmpl_${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: modelRaw || modelPath,
            choices: [{ index: 0, delta: { content: debugErrorToText(info) }, finish_reason: null }],
          })
          sseData(res, {
            id: `chatcmpl_${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: modelRaw || modelPath,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          })
          return sseDone(res)
        }
        return sendNonStreamErrorAsOpenAI(res, modelRaw || modelPath, info)
      }
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
    let r: any
    try {
      r = await fetch(target.toString(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(wantsStream ? { Accept: 'text/event-stream' } : {}),
        },
        body: JSON.stringify(openaiPayload),
      })
    } catch (e: any) {
      // 排查阶段：不要 500；把网络错误也吐给前端
      const info = buildDebugError(e, { stage: 'openai_fetch' })
      if (wantsStream) {
        startSSE(res, 200)
        sseData(res, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: String(openaiPayload?.model || 'unknown'),
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        })
        sseData(res, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: String(openaiPayload?.model || 'unknown'),
          choices: [{ index: 0, delta: { content: debugErrorToText(info) }, finish_reason: null }],
        })
        sseData(res, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: String(openaiPayload?.model || 'unknown'),
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })
        return sseDone(res)
      }
      return sendNonStreamErrorAsOpenAI(res, String(openaiPayload?.model || 'unknown'), info)
    }

    if (wantsStream) {
      if (!r.ok) {
        const rawText = await r.text().catch(() => '')
        const parsed = safeJsonParse(rawText)
        const info = buildDebugError(new Error('OpenAI-compatible upstream error'), {
          upstreamStatus: r.status,
          upstreamData: parsed ?? undefined,
          upstreamRaw: parsed ? undefined : rawText.slice(0, 2000),
        })
        startSSE(res, 200)
        sseData(res, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: String(openaiPayload?.model || 'unknown'),
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        })
        sseData(res, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: String(openaiPayload?.model || 'unknown'),
          choices: [{ index: 0, delta: { content: debugErrorToText(info) }, finish_reason: null }],
        })
        sseData(res, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: String(openaiPayload?.model || 'unknown'),
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })
        return sseDone(res)
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
        const info = buildDebugError(e, { stage: 'openai_stream_passthrough' })
        sseData(res, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: String(openaiPayload?.model || 'unknown'),
          choices: [{ index: 0, delta: { content: debugErrorToText(info) }, finish_reason: null }],
        })
      }
      return sseDone(res)
    }

    // 非流式：上游错误也不要直接让前端看到 500/难读错误，直接把细节吐给 UI
    if (!r.ok) {
      const rawText = await r.text().catch(() => '')
      const parsed = safeJsonParse(rawText)
      const info = buildDebugError(new Error('OpenAI-compatible upstream error'), {
        upstreamStatus: r.status,
        upstreamData: parsed ?? undefined,
        upstreamRaw: parsed ? undefined : rawText.slice(0, 2000),
      })
      return sendNonStreamErrorAsOpenAI(res, String(openaiPayload?.model || 'unknown'), info)
    }

    const rawText = await r.text().catch(() => '')
    const data: any = safeJsonParse(rawText) ?? {}
    return json(res, 200, data)
  } catch (e: any) {
    // 排查阶段：不要返回 500；把错误细节以“可在聊天里直接看到”的形式返回
    const info = buildDebugError(e, { stage: 'handler' })
    return sendNonStreamErrorAsOpenAI(res, 'unknown', info)
  }
}

