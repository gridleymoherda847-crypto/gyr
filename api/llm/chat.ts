import { isSafeTargetUrl, json, normalizeApiBaseUrl, readJsonBody, setNoStore } from './_utils'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createParser } from 'eventsource-parser'

/**
 * 安全网：从 OpenAI messages 里剔除 Gemini/中转不支持的 MIME（image/gif 等）
 * - image_url 含 .gif 或 data:image/gif → 替换为纯文本占位
 * - 防止前端遗漏、或旧消息/缓存导致 GIF 仍被发出
 */
function stripUnsupportedImages(messages: any[]): any[] {
  if (!Array.isArray(messages)) return messages
  const isGifUrl = (u: string) =>
    /\.gif(\?|$)/i.test(u) || /^data:image\/gif/i.test(u)
  return messages.map((m: any) => {
    if (!m) return m
    const c = m.content
    if (!Array.isArray(c)) return m
    // content 是多模态数组
    const hasGif = c.some((p: any) => {
      if (!p) return false
      const url =
        p?.image_url?.url || p?.imageUrl?.url || ''
      return (p?.type === 'image_url' || p?.type === 'image') && isGifUrl(url)
    })
    if (!hasGif) return m
    // 过滤掉 GIF，加一个文本占位
    const filtered = c
      .filter((p: any) => {
        if (!p) return false
        const url = p?.image_url?.url || p?.imageUrl?.url || ''
        if ((p?.type === 'image_url' || p?.type === 'image') && isGifUrl(url)) return false
        return true
      })
    filtered.push({ type: 'text', text: '[动图/GIF：已省略，不支持该格式]' })
    return { ...m, content: filtered }
  })
}

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

function toAISDKMessagesFromOpenAI(openaiMessages: any[]) {
  const safeRole = (r: any) => {
    const role = String(r || '').trim()
    if (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool') return role
    // 兜底：未知角色按 user 处理，避免 SDK 直接报错
    return 'user'
  }

  const toParts = (content: any) => {
    if (typeof content === 'string') return content
    if (!Array.isArray(content)) return String(content ?? '')

    const parts: any[] = []
    for (const p of content) {
      if (!p) continue
      // OpenAI: { type:'text', text:'...' }
      if (p.type === 'text' && typeof p.text === 'string') {
        if (p.text.trim()) parts.push({ type: 'text', text: p.text })
        continue
      }
      // OpenAI: { type:'image_url', image_url:{ url:'https://...' } }
      if ((p.type === 'image_url' || p.type === 'image') && (p.image_url?.url || p.imageUrl?.url)) {
        const url = String(p.image_url?.url || p.imageUrl?.url || '').trim()
        if (url) parts.push({ type: 'image', image: url })
        continue
      }
      // 其它未知 part：降级为文本占位
      const raw = typeof p === 'string' ? p : JSON.stringify(p)
      if (raw && raw.trim()) parts.push({ type: 'text', text: `[不支持的消息片段：${raw.slice(0, 160)}]` })
    }

    // 没有任何 part 时，至少返回空串（SDK 要求有 content）
    if (parts.length === 0) return ''
    return parts
  }

  return (Array.isArray(openaiMessages) ? openaiMessages : [])
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({
      role: safeRole(m.role),
      content: toParts(m.content),
    }))
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

function createGeminiStreamDecoder(opts: {
  onJson: (j: any) => void
  onDone: () => void
}) {
  let sseSeen = false
  const parser = createParser({
    onEvent: (event: any) => {
      sseSeen = true
      const data = String(event?.data || '').trim()
      if (!data) return
      if (data === '[DONE]') return opts.onDone()
      try {
        opts.onJson(JSON.parse(data))
      } catch {
        // ignore invalid JSON event
      }
    },
  })

  let buf = ''
  const feed = (chunk: string) => {
    // Always feed SSE parser (if stream is SSE, it will work; if NDJSON, it will do nothing)
    try { parser.feed(chunk) } catch { /* ignore */ }
    if (sseSeen) return
    buf += chunk
    while (true) {
      const nl = buf.indexOf('\n')
      if (nl < 0) break
      const lineRaw = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      const line = String(lineRaw || '').trim()
      if (!line) continue
      if (line === '[DONE]') { opts.onDone(); return }
      const payloadLine = line.startsWith('data:') ? line.replace(/^data:\s*/i, '') : line
      if (!payloadLine || payloadLine === '[DONE]') { opts.onDone(); return }
      try {
        opts.onJson(JSON.parse(payloadLine))
      } catch {
        // Half JSON: put back and wait more
        buf = `${payloadLine}\n${buf}`
        break
      }
    }
  }

  return { feed }
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
        // ★ 安全网：先过滤掉 GIF（Gemini 不支持 image/gif）
        const openAIMessages = stripUnsupportedImages(Array.isArray(payload?.messages) ? payload.messages : [])
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
          const decoder2 = createGeminiStreamDecoder({
            onJson: (j: any) => {
              const parts = j?.candidates?.[0]?.content?.parts
              const txt = Array.isArray(parts) ? parts.map((p: any) => p?.text).filter(Boolean).join('') : ''
              if (txt) emitText(txt)
              const fr = j?.candidates?.[0]?.finishReason
              if (fr) emitFinish(fr)
            },
            onDone: () => emitFinish('STOP'),
          })
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value || new Uint8Array(), { stream: true })
            if (!chunk) continue
            decoder2.feed(chunk)
            if (closed) return
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

    // ====== B) OpenAI 兼容：使用 Vercel AI SDK 处理流式 ======
    // 注意：此项目的前端仍消费 OpenAI SSE（choices[].delta.content），因此这里输出仍保持 OpenAI SSE 形态，避免前端先一起改。
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

    const modelId = String(payload?.model || '').trim()
    if (!modelId) {
      return json(res, 400, { error: { message: 'Missing model' } })
    }

    // ★ 安全网：剔除 GIF 图片，防止部分中转/Gemini兼容层报 mime type not supported
    const cleanedMessages = stripUnsupportedImages(Array.isArray(payload?.messages) ? payload.messages : [])
    const sdkMessages = toAISDKMessagesFromOpenAI(cleanedMessages)

    const temperature = typeof payload?.temperature === 'number' ? payload.temperature : undefined
    const maxOutputTokens =
      typeof payload?.max_tokens === 'number'
        ? payload.max_tokens
        : typeof payload?.maxOutputTokens === 'number'
          ? payload.maxOutputTokens
          : undefined

    // 动态初始化 provider（用户自带 Key + Base URL）
    const openai = createOpenAI({
      apiKey,
      baseURL: base,
      // 说明：AI SDK 6 的 OpenAI provider 暂无 compatibility:'strict' 这个配置项；
      // 未来切前端 useChat 后，我们可在此改为 pipeDataStreamToResponse / toDataStreamResponse。
    })

    const controller = new AbortController()
    const timeoutMs = 600000
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
      try {
        // 客户端断开时取消上游请求
        req?.on?.('close', () => controller.abort())
      } catch {
        // ignore
      }

      const result = streamText({
        model: openai.chat(modelId),
        messages: sdkMessages,
        ...(typeof temperature === 'number' ? { temperature } : {}),
        ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
        abortSignal: controller.signal,
        // 允许更高兼容性：部分中转会较慢
        maxRetries: 1,
      })

      if (wantsStream) {
        startSSE(res, 200)
        const id = `chatcmpl_${Date.now()}_${Math.random().toString(16).slice(2)}`
        const created = Math.floor(Date.now() / 1000)
        // role 帧
        sseData(res, {
          id,
          object: 'chat.completion.chunk',
          created,
          model: modelId,
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        })

        for await (const delta of result.textStream) {
          if (!delta) continue
          sseData(res, {
            id,
            object: 'chat.completion.chunk',
            created,
            model: modelId,
            choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
          })
        }

        sseData(res, {
          id,
          object: 'chat.completion.chunk',
          created,
          model: modelId,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })
        return sseDone(res)
      }

      // 非流式：聚合成一个 OpenAI chat completion 响应
      let out = ''
      for await (const delta of result.textStream) {
        out += delta || ''
      }
      return json(res, 200, {
        id: `chatcmpl_${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelId,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: String(out || '') },
          finish_reason: 'stop',
        }],
      })
    } catch (e: any) {
      const info = buildDebugError(e, { stage: 'openai_ai_sdk' })
      // 低风险兼容兜底：非流式失败时，尝试一次原生 OpenAI 兼容接口
      if (!wantsStream) {
        try {
          const fallbackBody: any = {
            model: modelId,
            messages: cleanedMessages,
          }
          if (typeof temperature === 'number') fallbackBody.temperature = temperature
          if (typeof maxOutputTokens === 'number') fallbackBody.max_tokens = maxOutputTokens
          const rr = await fetch(String(target), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(fallbackBody),
            signal: controller.signal,
          })
          const raw = await rr.text()
          if (rr.ok) {
            let data: any = {}
            try { data = JSON.parse(raw) } catch { data = {} }
            const content =
              String(
                data?.choices?.[0]?.message?.content ??
                data?.output_text ??
                ''
              )
            if (content) {
              return json(res, 200, {
                id: String(data?.id || `chatcmpl_${Date.now()}`),
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: String(data?.model || modelId),
                choices: [{
                  index: 0,
                  message: { role: 'assistant', content },
                  finish_reason: 'stop',
                }],
              })
            }
          }
        } catch {
          // ignore fallback error, continue original error path
        }
      }
      if (wantsStream) {
        startSSE(res, 200)
        sseData(res, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: modelId || 'unknown',
          choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        })
        sseData(res, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: modelId || 'unknown',
          choices: [{ index: 0, delta: { content: debugErrorToText(info) }, finish_reason: null }],
        })
        sseData(res, {
          id: `chatcmpl_${Date.now()}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: modelId || 'unknown',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        })
        return sseDone(res)
      }
      return sendNonStreamErrorAsOpenAI(res, modelId || 'unknown', info)
    } finally {
      clearTimeout(t)
    }
  } catch (e: any) {
    // 排查阶段：不要返回 500；把错误细节以“可在聊天里直接看到”的形式返回
    const info = buildDebugError(e, { stage: 'handler' })
    return sendNonStreamErrorAsOpenAI(res, 'unknown', info)
  }
}

