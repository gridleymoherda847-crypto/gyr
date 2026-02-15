import { useEffect, useRef } from 'react'
import { useOS } from '../context/OSContext'
import { useWeChat, type WeChatCharacter } from '../context/WeChatContext'

declare global {
  interface Window {
    __LP_AUTO_REACH_DAEMON__?: boolean
  }
}

type AutoReachPlan = {
  day: string
  target: number
  sent: number
  apiCalls: number
  nextAt: number
  lastManualMsgId?: string
  lastSeenAt?: number
}

type CatchUpWave = {
  topic: string
  messages: string[]
  ratio: number
}

const dayKey = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

const toBubbleLines = (raw: string, fallbackMin = 1, fallbackMax = 3) => {
  const text = String(raw || '').replace(/\r/g, '\n').trim()
  if (!text) return []
  const lines = text
    .split('\n')
    .map(s => s.replace(/^\s*[-*•\d.、)\]]+\s*/, '').trim())
    .filter(Boolean)
  if (lines.length > 0) return lines.slice(0, 6)
  const chunks = text
    .split(/[。！？!?]\s*/)
    .map(s => s.trim())
    .filter(Boolean)
  const n = Math.min(fallbackMax, Math.max(fallbackMin, chunks.length || fallbackMin))
  return chunks.slice(0, n)
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const extractJsonBlock = (raw: string) => {
  const s = String(raw || '').trim()
  const i = s.indexOf('{')
  const j = s.lastIndexOf('}')
  if (i >= 0 && j > i) return s.slice(i, j + 1)
  return s
}
const dedupeLines = (lines: string[]) => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s0 of lines) {
    const s = String(s0 || '').trim()
    if (!s) continue
    const k = s.replace(/\s+/g, '').toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}
const parseTranslatedLine = (line: string) => {
  const raw = String(line || '').trim()
  if (!raw) return { rawText: '', zh: '' }
  const sep = raw.split('|||')
  if (sep.length >= 2) {
    return { rawText: String(sep[0] || '').trim(), zh: String(sep.slice(1).join('|||') || '').trim() }
  }
  const m = raw.match(/^(.+?)[（(]\s*([\u4e00-\u9fff][^）)]*)[）)]\s*$/)
  if (m) {
    return { rawText: String(m[1] || '').trim(), zh: String(m[2] || '').trim() }
  }
  const hasZh = /[\u4e00-\u9fff]/.test(raw)
  if (hasZh) {
    // 模型没按 "|||" 返回时，至少把翻译状态置为 done，避免一直显示“翻译中”
    return { rawText: raw, zh: raw }
  }
  return { rawText: raw, zh: '' }
}

export default function AutoReachDaemon() {
  const { llmConfig, callLLM } = useOS()
  const {
    characters,
    getMessagesByCharacter,
    addMessage,
    updateMessage,
  } = useWeChat()

  const runningRef = useRef(false)
  const visibleResumeRef = useRef(false)
  const lastTriggerMapRef = useRef<Record<string, number>>({})

  const hasApiConfig = !!(llmConfig.apiBaseUrl && llmConfig.apiKey && llmConfig.selectedModel)

  useEffect(() => {
    window.__LP_AUTO_REACH_DAEMON__ = true
    return () => {
      try { delete window.__LP_AUTO_REACH_DAEMON__ } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        visibleResumeRef.current = true
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => {
    if (!hasApiConfig) return
    const allCharacterNames = () => (characters || []).map(c => String(c?.name || '').trim()).filter(Boolean)
    const isNightOwl = (c: WeChatCharacter) => {
      const s = `${String((c as any)?.prompt || '')}\n${String(c?.name || '')}`
      return /(熬夜|夜猫子|夜生活|夜班|凌晨|通宵|晚睡|作息紊乱|失眠|夜里|夜间活跃)/.test(s)
    }
    const toLocalDate = (ts: number) => new Date(ts)
    const clampToDaytime = (ts: number, c: WeChatCharacter) => {
      if (isNightOwl(c)) return ts
      const d = toLocalDate(ts)
      const h = d.getHours()
      const m = d.getMinutes()
      const mins = h * 60 + m
      const start = 8 * 60
      const end = 23 * 60
      if (mins >= start && mins <= end) return ts
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0, 0, 0).getTime()
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 0, 0, 0).getTime()
      if (mins < start) return dayStart + Math.floor(Math.random() * 45) * 60 * 1000
      return dayEnd - Math.floor(Math.random() * 45) * 60 * 1000
    }
    const normalizeForCharacter = (line: string, c: WeChatCharacter) => {
      let t = String(line || '').trim()
      if (!t) return ''
      // 去掉过度机械化开头：只有明确提及旧话题时才用“前段时间/上次聊到”
      if (/^(前段时间|上次聊到|之前你提过|前阵子你说过)/.test(t) && !/(聊到|提到|你说过|之前那个|上次那个)/.test(t.slice(0, 18))) {
        t = t.replace(/^(前段时间|上次聊到|之前你提过|前阵子你说过)[，,\s]*/g, '').trim()
      }
      // 防串聊：不提其他角色名字
      for (const n of allCharacterNames()) {
        if (!n || n === c.name) continue
        const reg = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
        t = t.replace(reg, '你')
      }
      return t
    }

    const loadPlan = (characterId: string): AutoReachPlan | null => {
      try {
        const raw = localStorage.getItem(`lp_auto_reach_plan_${characterId}`)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    }
    const savePlan = (characterId: string, plan: AutoReachPlan) => {
      try {
        localStorage.setItem(`lp_auto_reach_plan_${characterId}`, JSON.stringify(plan))
      } catch {
        // ignore
      }
    }
    const mkPlan = (c: WeChatCharacter): AutoReachPlan => {
      const now = Date.now()
      const minRaw = clamp(Number((c as any).autoReachMinPerDay ?? 3) || 3, 0, 20)
      const maxRaw = clamp(Number((c as any).autoReachMaxPerDay ?? 5) || 5, 1, 20)
      const minDaily = Math.min(minRaw, maxRaw)
      const maxDaily = Math.max(minRaw, maxRaw)
      const target = minDaily === maxDaily ? maxDaily : (minDaily + Math.floor(Math.random() * (maxDaily - minDaily + 1)))
      return {
        day: dayKey(),
        target,
        sent: 0,
        apiCalls: 0,
        nextAt: clampToDaytime(now + (2 + Math.floor(Math.random() * 6)) * 60 * 1000, c),
        lastSeenAt: now,
      }
    }
    const pickNextAt = (plan: AutoReachPlan) => {
      const now = Date.now()
      const d = new Date(now)
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 50, 0, 0).getTime()
      const left = Math.max(0, Number(plan.target || 0) - Number(plan.sent || 0))
      if (left <= 0) return end + 60 * 1000
      const remain = Math.max(30 * 60 * 1000, end - now)
      const avg = Math.max(30 * 60 * 1000, Math.floor(remain / left))
      const jitter = Math.floor((Math.random() * 0.8 - 0.4) * avg)
      return now + Math.max(30 * 60 * 1000, avg + jitter)
    }
    const buildShortHistory = (characterId: string, maxChars: number) => {
      const list = (getMessagesByCharacter(characterId) || []).filter(m => m.type !== 'system')
      let used = 0
      const out: { role: 'user' | 'assistant'; content: string }[] = []
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i]
        let content = String(m.content || '').trim()
        if (!content) continue
        if (m.type === 'image') content = '[图片]'
        if (m.type === 'sticker') content = '[表情包]'
        if (m.type === 'transfer') content = '[转账]'
        if (m.type === 'music') content = '[音乐]'
        if (m.type === 'diary') content = '[日记]'
        if (m.type === 'couple') content = '[情侣空间]'
        const extra = content.length + 10
        if (used + extra > maxChars) break
        used += extra
        out.push({ role: m.isUser ? 'user' : 'assistant', content })
      }
      return out.reverse()
    }
    const parseManualReachRequest = (characterId: string) => {
      const list = (getMessagesByCharacter(characterId) || []).filter(m => m.isUser && m.type === 'text')
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i]
        const text = String(m.content || '').trim()
        if (!text) continue
        const a = text.match(/(\d{1,3})\s*分钟后.*(给我发|找我|联系我|发消息)/)
        const b = text.match(/(给我发|找我|联系我|发消息).*(\d{1,3})\s*分钟后/)
        const mins = a ? Number(a[1]) : b ? Number(b[2]) : 0
        if (!mins || !Number.isFinite(mins)) continue
        const clampedMins = clamp(mins, 1, 180)
        return { msgId: String(m.id || ''), dueAt: Number(m.timestamp || Date.now()) + clampedMins * 60 * 1000 }
      }
      return null
    }

    const sendLiveRound = async (c: WeChatCharacter) => {
      const minRaw = clamp(Number((c as any).onlineReplyMin ?? 3) || 3, 1, 20)
      const maxRaw = clamp(Number((c as any).onlineReplyMax ?? 8) || 8, 1, 20)
      const minN = Math.min(minRaw, maxRaw)
      const maxN = Math.max(minRaw, maxRaw)
      const targetN = minN === maxN ? minN : (minN + Math.floor(Math.random() * (maxN - minN + 1)))
      const history = buildShortHistory(c.id, 1200)
      const histText = history.map(h => `${h.role === 'user' ? '我' : c.name}：${h.content}`).join('\n')
      const holidayHint = (() => {
        const now = new Date()
        const y = now.getFullYear()
        const m = now.getMonth() + 1
        const d = now.getDate()
        const key = `${m}-${d}`
        const fixed: Record<string, string> = {
          '1-1': '元旦',
          '2-14': '情人节',
          '5-1': '劳动节',
          '10-1': '国庆节',
        }
        const cny: Record<number, string> = {
          2024: '2-10',
          2025: '1-29',
          2026: '2-17',
          2027: '2-6',
          2028: '1-26',
          2029: '2-13',
          2030: '2-3',
        }
        if (cny[y] === key) return '春节（今天）'
        if (fixed[key]) return `${fixed[key]}（今天）`
        return '普通日期'
      })()
      const prompt = await callLLM([
        {
          role: 'system',
          content:
            `你是“${c.name}”。你要主动找我聊天（微信短气泡）。\n` +
            `严格要求：\n` +
            `1) 严格输出 ${targetN} 行，每行一条消息；\n` +
            `2) 禁止旁白、动作、神态、引号叙事；\n` +
            `3) 禁止 emoji；\n` +
            `4) 只延续已有话题，避免突然新设定；\n` +
            `5) 口吻自然，像真人。\n` +
            `6) 禁止重复同一句话。\n` +
            `6.1) 结合中国节日/饭点时间感自然聊天；当前节日提示：${holidayHint}。\n` +
            `${(c as any)?.language && (c as any).language !== 'zh' && (c as any)?.chatTranslationEnabled
              ? `7) 每行必须使用格式：外语原文 ||| 简体中文翻译`
              : ''}`,
        },
        {
          role: 'user',
          content:
            `这是最近聊天上下文：\n${histText || '（暂无历史）'}\n\n` +
            `请直接输出消息内容，每行一条，不要解释。`,
        },
      ], undefined, { temperature: 0.85, maxTokens: 260, timeoutMs: 45_000 })
      let lines = dedupeLines(toBubbleLines(prompt, targetN, targetN)).slice(0, maxN)
      if (lines.length < minN) {
        const extra = String(prompt || '')
          .split(/[。！？!?；;\n]/g)
          .map(s => s.trim())
          .filter(Boolean)
        for (const s of extra) {
          if (lines.length >= minN) break
          const n = normalizeForCharacter(s, c)
          if (n && !lines.includes(n)) lines.push(n)
        }
      }
      if (lines.length > maxN) lines = lines.slice(0, maxN)
      if (lines.length < minN) {
        const fillers = ['在吗？', '我刚想到你了。', '有空回我一下呀。', '你今天还顺利吗？']
        for (const f of fillers) {
          if (lines.length >= minN) break
          if (!lines.includes(f)) lines.push(f)
        }
      }
      // 这里是一轮“主动找我”：只调用一次 LLM，但可下发多条气泡（3~5等）
      const sentKeys = new Set<string>()
      for (const line of lines) {
        const normalized = normalizeForCharacter(line, c)
        if (!normalized) continue
        const lang = String((c as any)?.language || 'zh')
        const transOn = !!(c as any)?.chatTranslationEnabled && lang !== 'zh'
        if (transOn) {
          const p = parseTranslatedLine(normalized)
          const key = (p.rawText || p.zh || normalized).replace(/\s+/g, '').toLowerCase()
          if (key && sentKeys.has(key)) continue
          if (key) sentKeys.add(key)
          addMessage({
            characterId: c.id,
            content: p.rawText || p.zh || normalized,
            isUser: false,
            type: 'text',
            messageLanguage: lang as any,
            chatTranslationEnabledAtSend: true,
            translatedZh: p.zh || undefined,
            translationStatus: p.zh ? 'done' : 'pending',
          } as any)
        } else {
          const key = normalized.replace(/\s+/g, '').toLowerCase()
          if (key && sentKeys.has(key)) continue
          if (key) sentKeys.add(key)
          addMessage({ characterId: c.id, content: normalized, isUser: false, type: 'text' })
        }
      }
      return lines.length > 0
    }

    const makeFallbackWaves = (remain: number): CatchUpWave[] => {
      const waves: CatchUpWave[] = []
      const n = clamp(remain, 1, 8)
      for (let i = 0; i < n; i++) {
        waves.push({
          topic: i % 2 ? '思念惦记' : '日常分享',
          ratio: (i + 1) / (n + 1),
          messages: i % 2
            ? ['我有点想你了。', '等你有空回我就好。']
            : ['今天遇到个挺有意思的小事。', '想跟你分享一下。'],
        })
      }
      return waves
    }

    const generateCatchUpWaves = async (c: WeChatCharacter, remain: number, useApi: boolean): Promise<CatchUpWave[]> => {
      if (!useApi) return makeFallbackWaves(remain)
      const history = buildShortHistory(c.id, 1400)
      const histText = history.map(h => `${h.role === 'user' ? '我' : c.name}：${h.content}`).join('\n')
      try {
        const raw = await callLLM([
          {
            role: 'system',
            content:
              `你是“${c.name}”，现在要补写“离线期间对我主动发过的消息”。\n` +
              `输出 JSON：{"waves":[{"topic":"", "ratio":0.3, "messages":["",""]}]}\n` +
              `规则：\n` +
              `- waves 数量 = ${remain}（每个 wave 代表一次主动找我）；\n` +
              `- 每个 wave 的 messages 为 2~4 条；\n` +
              `- 同一 wave 只聊一个话题，不要跨话题；\n` +
              `- 不同 wave 话题尽量不同，不要把同一话题拆成多波；\n` +
              `- 只有在提及旧话题时，才可用“前段时间/上次聊到/之前你提过”；日常分享和思念开场不要强行加这类词；\n` +
              `- 可结合中国节日、三餐饭点、作息时段自然提一嘴，但不要条条都提节日；\n` +
              `- 禁止“刚刚/现在/5分钟前”这类精确实时词；\n` +
              `- 禁止旁白动作，禁止 emoji；\n` +
              `${(c as any)?.language && (c as any).language !== 'zh' && (c as any)?.chatTranslationEnabled
                ? `- 每条消息用“外语原文 ||| 简体中文翻译”格式；\n`
                : ''}` +
              `- ratio 介于 0~1，且递增。`,
          },
          {
            role: 'user',
            content:
              `最近真实聊天上下文：\n${histText || '（暂无历史）'}\n\n` +
              `只返回 JSON，不要附加解释。`,
          },
        ], undefined, { temperature: 0.9, maxTokens: 900, timeoutMs: 60_000 })
        const jsonText = extractJsonBlock(raw)
        const parsed = JSON.parse(jsonText)
        const waves = Array.isArray(parsed?.waves) ? parsed.waves : []
        const cleaned: CatchUpWave[] = waves
          .map((w: any, idx: number) => ({
            topic: String(w?.topic || `话题${idx + 1}`).slice(0, 40),
            ratio: Number.isFinite(Number(w?.ratio)) ? clamp(Number(w.ratio), 0.05, 0.95) : (idx + 1) / (waves.length + 1),
            messages: Array.isArray(w?.messages)
              ? w.messages.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 4)
              : [],
          }))
          .filter((w: CatchUpWave) => w.messages.length > 0)
          .slice(0, Math.max(1, remain))
        if (cleaned.length === 0) return makeFallbackWaves(remain)
        cleaned.sort((a, b) => a.ratio - b.ratio)
        const normTopic = (t: string) => String(t || '').replace(/\s+/g, '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase()
        const seen = new Set<string>()
        const uniq: CatchUpWave[] = []
        for (const w of cleaned) {
          const k = normTopic(w.topic)
          if (k && seen.has(k)) continue
          if (k) seen.add(k)
          uniq.push(w)
          if (uniq.length >= remain) break
        }
        if (uniq.length < remain) {
          const fallback = makeFallbackWaves(remain + 2)
          for (const w of fallback) {
            const k = normTopic(w.topic)
            if (k && seen.has(k)) continue
            if (k) seen.add(k)
            uniq.push(w)
            if (uniq.length >= remain) break
          }
        }
        return uniq.slice(0, Math.max(1, remain))
      } catch {
        return makeFallbackWaves(remain)
      }
    }

    const flushCatchUp = async (c: WeChatCharacter, plan: AutoReachPlan) => {
      const remain = Math.max(0, Number(plan.target || 0) - Number(plan.sent || 0))
      if (remain <= 0) return false
      const now = Date.now()
      const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
      const from = Math.max(startOfToday, Number(plan.lastSeenAt || (now - 8 * 60 * 60 * 1000)))
      const to = Math.max(from + 2 * 60 * 1000, now - 20 * 1000)
      const currentCalls = Math.max(0, Number(plan.apiCalls || 0))
      const targetCalls = Math.max(0, Number(plan.target || 0))
      const useApi = currentCalls < targetCalls
      if (useApi) {
        plan.apiCalls = currentCalls + 1 // 严格计数：调用前占位，确保当天不超用户区间
      }
      const waves = await generateCatchUpWaves(c, remain, useApi)
      const n = Math.min(remain, Math.max(1, waves.length))
      for (let i = 0; i < n; i++) {
        const w = waves[i]
        const baseRatio = clamp(Number(w.ratio || (i + 1) / (n + 1)), 0.02, 0.98)
        const waveTs = clampToDaytime(Math.floor(from + (to - from) * baseRatio), c)
        const list = dedupeLines((w.messages || []).map(x => normalizeForCharacter(x, c))).slice(0, 4)
        const sentKeys = new Set<string>()
        for (let j = 0; j < list.length; j++) {
          const ts = clampToDaytime(waveTs + j * (20_000 + Math.floor(Math.random() * 40_000)), c)
          const lang = String((c as any)?.language || 'zh')
          const transOn = !!(c as any)?.chatTranslationEnabled && lang !== 'zh'
          const p = parseTranslatedLine(list[j])
          const key = (p.rawText || p.zh || list[j]).replace(/\s+/g, '').toLowerCase()
          if (key && sentKeys.has(key)) continue
          if (key) sentKeys.add(key)
          const msg = addMessage(transOn
            ? {
                characterId: c.id,
                content: p.rawText || p.zh || list[j],
                isUser: false,
                type: 'text',
                messageLanguage: lang as any,
                chatTranslationEnabledAtSend: true,
                translatedZh: p.zh || undefined,
                translationStatus: p.zh ? 'done' : 'pending',
              } as any
            : { characterId: c.id, content: list[j], isUser: false, type: 'text' })
          updateMessage(msg.id, { timestamp: ts })
        }
      }
      plan.sent = Number(plan.sent || 0) + n
      plan.nextAt = clampToDaytime(pickNextAt(plan), c)
      plan.lastSeenAt = now
      return true
    }

    const tick = async () => {
      if (runningRef.current) return
      if (document.visibilityState !== 'visible') return
      runningRef.current = true
      try {
        const now = Date.now()
        const enabledChars = (characters || []).filter(c => !!(c as any).autoReachEnabled && !c.offlineMode)
        // 兜底：只取一个角色执行，避免历史脏数据导致多角色同时开造成“串聊”
        const sortedEnabled = enabledChars
          .slice()
          .sort((a, b) => {
            const ta = Number((getMessagesByCharacter(a.id) || []).slice(-1)[0]?.timestamp || 0)
            const tb = Number((getMessagesByCharacter(b.id) || []).slice(-1)[0]?.timestamp || 0)
            return tb - ta
          })
        for (const c of sortedEnabled.slice(0, 1)) {
          let plan = loadPlan(c.id)
          if (!plan || plan.day !== dayKey()) {
            plan = mkPlan(c)
          }
          plan.apiCalls = Math.max(0, Number(plan.apiCalls || 0))
          const msgList = getMessagesByCharacter(c.id) || []
          const latestMsg = msgList.length > 0 ? msgList[msgList.length - 1] : null
          const latestUserMsg = [...msgList].reverse().find((m) => !!m?.isUser) || null

          const manualReq = parseManualReachRequest(c.id)
          if (manualReq && manualReq.msgId && plan.lastManualMsgId !== manualReq.msgId) {
            plan.lastManualMsgId = manualReq.msgId
            plan.nextAt = manualReq.dueAt
          }

          const manualDueNow = !!manualReq && plan.lastManualMsgId === manualReq.msgId && now >= Number(manualReq.dueAt || 0)
          const resumed = visibleResumeRef.current
          const backlog = Number(plan.sent || 0) < Number(plan.target || 0)
          const apiBudgetLeft = Number(plan.apiCalls || 0) < Number(plan.target || 0)
          const userActiveRecently = !!latestUserMsg && (now - Number(latestUserMsg.timestamp || 0) < 30 * 60 * 1000)
          const chatActiveRecently = !!latestMsg && (now - Number(latestMsg.timestamp || 0) < 30 * 60 * 1000)
          if (chatActiveRecently) {
            // 用户正在正常聊天时，刷新活跃时间，避免误判成“需要补齐离线消息”
            plan.lastSeenAt = now
          }
          // 严格上限：一旦达到当日目标次数，或 API 调用数达到 target，不再自动调用
          if (!backlog || !apiBudgetLeft) {
            plan.lastSeenAt = now
            savePlan(c.id, plan)
            continue
          }
          const lastSeenAt = Number(plan.lastSeenAt || 0)
          const staleSeen = !lastSeenAt || (now - lastSeenAt > 3 * 60 * 1000)
          const missedSchedule = now > Number(plan.nextAt || 0) + 2 * 60 * 1000
          const needCatchUp = backlog && (resumed || (staleSeen && missedSchedule))

          if (needCatchUp && !manualDueNow && !userActiveRecently && !chatActiveRecently) {
            const ok = await flushCatchUp(c, plan)
            if (ok) {
              savePlan(c.id, plan)
              lastTriggerMapRef.current[c.id] = now
              continue
            }
          }

          const lastTrigger = Number(lastTriggerMapRef.current[c.id] || 0)
          // 手动“X分钟后找我”到点时，不受常规冷却限制
          if (!manualDueNow && now - lastTrigger < 5 * 60 * 1000) {
            savePlan(c.id, plan)
            continue
          }

          if ((!manualDueNow && Number(plan.sent || 0) >= Number(plan.target || 0)) || now < Number(plan.nextAt || 0)) {
            savePlan(c.id, plan)
            continue
          }

          if (!manualDueNow && latestMsg && now - Number(latestMsg.timestamp || 0) < 30 * 60 * 1000) {
            plan.nextAt = clampToDaytime(now + 30 * 60 * 1000, c)
            savePlan(c.id, plan)
            continue
          }

          plan.apiCalls = Number(plan.apiCalls || 0) + 1 // 调用前计数，避免任何重试导致超出上限
          const ok = await sendLiveRound(c)
          if (ok) {
            plan.sent = Number(plan.sent || 0) + 1
            plan.nextAt = clampToDaytime(pickNextAt(plan), c)
            plan.lastSeenAt = now
            lastTriggerMapRef.current[c.id] = now
          }
          savePlan(c.id, plan)
        }
      } catch {
        // ignore tick failure
      } finally {
        visibleResumeRef.current = false
        runningRef.current = false
      }
    }

    void tick()
    const id = window.setInterval(() => { void tick() }, 25_000)
    return () => window.clearInterval(id)
  }, [characters, getMessagesByCharacter, addMessage, updateMessage, callLLM, hasApiConfig])

  return null
}

