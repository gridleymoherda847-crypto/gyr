import { createParser, type EventSourceMessage } from 'eventsource-parser'

function extractDeltaTextFromOpenAISSE(jsonText: string): string {
  const raw = String(jsonText || '').trim()
  if (!raw || raw === '[DONE]') return ''

  try {
    const j: any = JSON.parse(raw)
    const delta = j?.choices?.[0]?.delta

    let content = ''
    if (typeof delta?.content === 'string') content = delta.content
    else if (Array.isArray(delta?.content)) {
      content = delta.content
        .map((p: any) => (typeof p?.text === 'string' ? p.text : typeof p === 'string' ? p : ''))
        .filter(Boolean)
        .join('')
    } else if (delta?.content && typeof delta?.content === 'object' && typeof delta?.content?.text === 'string') {
      content = delta.content.text
    } else if (typeof delta?.text === 'string') {
      content = delta.text
    }

    if (content) return content

    // 有些中转会在 SSE 里塞 error 对象 / message
    const errMsg =
      j?.error?.message ||
      j?.error?.msg ||
      j?.message
    if (typeof errMsg === 'string' && errMsg.trim()) return errMsg.trim()
    return ''
  } catch {
    // 非 JSON：当作纯文本（用于把错误/HTML片段吐到 UI，便于排查）
    return raw
  }
}

/**
 * Read OpenAI-compatible SSE from a Response and return the full text.
 * Keeps behavior similar to the project's previous hand-rolled parser:
 * - Only consumes `data:` events
 * - Stops on `[DONE]`
 * - Tries JSON parse → delta.content; otherwise appends raw
 */
export async function readOpenAISSEToText(resp: Response): Promise<string> {
  const reader = resp.body?.getReader?.()
  if (!reader) throw new Error('SSE stream not readable')

  const decoder = new TextDecoder()
  let out = ''
  let done = false

  const parser = createParser({
    onEvent: (event: EventSourceMessage) => {
      if (done) return
      const data = String(event?.data || '')
      if (!data) return
      if (data.trim() === '[DONE]') {
        done = true
        return
      }
      out += extractDeltaTextFromOpenAISSE(data)
    },
  })

  while (true) {
    const { value, done: readerDone } = await reader.read()
    if (readerDone) break
    const chunk = decoder.decode(value || new Uint8Array(), { stream: true })
    if (chunk) parser.feed(chunk)
    if (done) break
  }

  return out
}

