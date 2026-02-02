import { useEffect, useMemo, useRef, useState } from 'react'
import AppHeader from '../components/AppHeader'

type StatKey = 'health' | 'beauty' | 'smarts' | 'social' | 'luck'
type Stats = Record<StatKey, number>

type PersonRole = 'parent' | 'friend' | 'partner' | 'child'
type Person = {
  id: string
  role: PersonRole
  name: string
  trait: string
  intimacy: number // 0-100
}

type HouseLevel = 'none' | 'small' | 'mid' | 'big'
type HouseState = {
  level: HouseLevel
  mortgageLeft: number // 剩余期数（年）
  yearlyPay: number // 每年还款
  partnerShare: number // 0-100 伴侣分担比例
}

type YearFlags = {
  plazaUsed: boolean
  assetUsed: boolean
  schoolUsed: boolean
}

type CityTier = 'tier1' | 'tier2' | 'tier3'
type City = { id: string; name: string; tier: CityTier }

type EducationStage =
  | 'none'
  | 'primary'
  | 'middle_public'
  | 'middle_private'
  | 'high_public'
  | 'high_private'
  | 'uni'
  | 'graduated'
  | 'dropped'

type EducationState = {
  stage: EducationStage
  score: number // 0-100 预计成绩（越高越好）
  yearsInStage: number // 当前学段已过几年
}

type RentTier = 'none' | '1000' | '2500' | '5000'
type RentState = {
  tier: RentTier
  yearlyRent: number
}

type OptionResult = {
  text?: string
  moneyDelta?: number
  statsDelta?: Partial<Stats>
  addTags?: string[]
  removeTags?: string[]
  addFriend?: boolean
  meetPartner?: boolean
  haveChild?: boolean
  heal?: number
  hurt?: number
}

type OptionDef = {
  id: string
  text: string
  outcomes: { weight: number; result: OptionResult }[]
}

type EventDef = {
  id: string
  title: string
  minAge: number
  maxAge: number
  weight: (g: GameState) => number
  text: (g: GameState) => string
  options: (g: GameState) => OptionDef[]
}

type CurrentEvent = {
  id: string
  title: string
  text: string
  options: { id: string; text: string; picked: boolean }[]
  resolved: boolean
}

type GameState = {
  version: 1
  seed: number
  name: string
  gender: 'male' | 'female'
  birthCity: City
  currentCity: City
  familyWealth: number // 0-100 家境（影响学费/零花钱/城市机会）
  age: number
  year: number
  alive: boolean
  money: number
  stats: Stats
  tags: string[]
  logs: string[]
  parents: Person[]
  friends: Person[]
  partner: Person | null
  children: Person[]
  edu: EducationState
  rent: RentState
  house: HouseState
  yearFlags: YearFlags
  currentEvent: CurrentEvent | null
}

const STORAGE_KEY = 'lp_liaoliao_yisheng_v1'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeRng(seed: number) {
  const next = mulberry32(seed)
  let calls = 0
  return {
    nextFloat() {
      calls++
      return next()
    },
    nextInt(min: number, max: number) {
      const r = next()
      calls++
      return Math.floor(r * (max - min + 1)) + min
    },
    chance(p: number) {
      return this.nextFloat() < p
    },
    pickOne<T>(arr: T[]) {
      const idx = this.nextInt(0, Math.max(0, arr.length - 1))
      return arr[idx]!
    },
    calls() {
      return calls
    },
  }
}

function uuidLike(rng: ReturnType<typeof makeRng>) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 10; i++) s += chars[rng.nextInt(0, chars.length - 1)]
  return `id_${Date.now()}_${s}`
}

function genName(rng: ReturnType<typeof makeRng>, gender: 'male' | 'female') {
  const surnames = ['林', '陈', '李', '张', '王', '刘', '周', '吴', '徐', '孙', '胡', '朱', '高', '何', '郭', '马', '罗', '梁', '宋', '郑']
  const male = ['昊', '宇', '晨', '泽', '轩', '铭', '霖', '皓', '恺', '骁', '辰', '然', '屿', '川', '凡', '澄']
  const female = ['然', '宁', '清', '妍', '柔', '悦', '瑶', '橙', '汐', '琪', '晴', '雪', '盈', '珂', '萱', '晚']
  const surname = rng.pickOne(surnames)
  const pool = gender === 'male' ? male : female
  const given = rng.pickOne(pool) + (rng.chance(0.55) ? rng.pickOne(pool) : '')
  return surname + given
}

function genTrait(rng: ReturnType<typeof makeRng>) {
  const traits = [
    '嘴硬心软', '行动派', '有点社恐', '爱逞强', '爱学习', '情绪稳定', '玻璃心', '很会安慰人',
    '爱面子', '很会省钱', '有点恋爱脑', '事业心强', '容易冲动', '很会做饭', '爱八卦', '很会共情',
  ]
  return rng.pickOne(traits)
}

const CITIES: City[] = [
  // 一线（“像中国但不重名”）
  { id: 'jinglan', name: '京澜', tier: 'tier1' },
  { id: 'huhai', name: '沪海', tier: 'tier1' },
  { id: 'shenlan', name: '深岚', tier: 'tier1' },
  { id: 'guangling', name: '广陵', tier: 'tier1' },
  // 二线
  { id: 'hanglin', name: '杭临', tier: 'tier2' },
  { id: 'ningbo', name: '宁泊', tier: 'tier2' },
  { id: 'rongzhou', name: '蓉州', tier: 'tier2' },
  { id: 'wuhan', name: '武汉埠', tier: 'tier2' },
  // 三线
  { id: 'linchuan', name: '临川', tier: 'tier3' },
  { id: 'qinghe', name: '青禾', tier: 'tier3' },
  { id: 'wucheng', name: '梧城', tier: 'tier3' },
  { id: 'anping', name: '安平码', tier: 'tier3' },
]

function pickCity(rng: ReturnType<typeof makeRng>, tier?: CityTier) {
  const list = tier ? CITIES.filter(c => c.tier === tier) : CITIES
  return rng.pickOne(list)
}

function normalizeLoadedGame(raw: any): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  if (raw.version !== 1) return null
  const seed = typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? raw.seed : (Date.now() ^ Math.floor(Math.random() * 1e9))
  const rng = makeRng(seed + 2026)

  const gender: 'male' | 'female' = raw.gender === 'female' ? 'female' : 'male'
  const name = typeof raw.name === 'string' && raw.name ? raw.name : genName(rng, gender)

  const birthCity: City = raw.birthCity?.name ? raw.birthCity : pickCity(rng)
  const currentCity: City = raw.currentCity?.name ? raw.currentCity : birthCity
  const familyWealth = typeof raw.familyWealth === 'number' ? clamp(raw.familyWealth, 0, 100) : clamp(rng.nextInt(15, 95) + rng.nextInt(-10, 10), 0, 100)

  const stats: Stats = {
    health: typeof raw.stats?.health === 'number' ? clamp(raw.stats.health, 0, 100) : rng.nextInt(40, 90),
    beauty: typeof raw.stats?.beauty === 'number' ? clamp(raw.stats.beauty, 0, 100) : rng.nextInt(30, 90),
    smarts: typeof raw.stats?.smarts === 'number' ? clamp(raw.stats.smarts, 0, 100) : rng.nextInt(30, 90),
    social: typeof raw.stats?.social === 'number' ? clamp(raw.stats.social, 0, 100) : rng.nextInt(25, 90),
    luck: typeof raw.stats?.luck === 'number' ? clamp(raw.stats.luck, 0, 100) : rng.nextInt(25, 90),
  }

  const edu: EducationState = raw.edu && typeof raw.edu === 'object'
    ? {
        stage: typeof raw.edu.stage === 'string' ? raw.edu.stage : 'none',
        score: typeof raw.edu.score === 'number' ? clamp(raw.edu.score, 0, 100) : clamp(rng.nextInt(25, 80) + Math.floor(stats.smarts / 20) - 2, 0, 100),
        yearsInStage: typeof raw.edu.yearsInStage === 'number' ? Math.max(0, Math.floor(raw.edu.yearsInStage)) : 0,
      }
    : { stage: 'none', score: clamp(rng.nextInt(25, 80) + Math.floor(stats.smarts / 20) - 2, 0, 100), yearsInStage: 0 }

  const rent: RentState = raw.rent && typeof raw.rent === 'object'
    ? {
        tier: (raw.rent.tier === '1000' || raw.rent.tier === '2500' || raw.rent.tier === '5000') ? raw.rent.tier : 'none',
        yearlyRent: typeof raw.rent.yearlyRent === 'number' ? Math.max(0, Math.floor(raw.rent.yearlyRent)) : 0,
      }
    : { tier: 'none', yearlyRent: 0 }

  const yearFlags: YearFlags = {
    plazaUsed: !!raw.yearFlags?.plazaUsed,
    assetUsed: !!raw.yearFlags?.assetUsed,
    schoolUsed: !!raw.yearFlags?.schoolUsed,
  }

  const house: HouseState = raw.house && typeof raw.house === 'object'
    ? {
        level: (raw.house.level === 'small' || raw.house.level === 'mid' || raw.house.level === 'big') ? raw.house.level : 'none',
        mortgageLeft: typeof raw.house.mortgageLeft === 'number' ? Math.max(0, Math.floor(raw.house.mortgageLeft)) : 0,
        yearlyPay: typeof raw.house.yearlyPay === 'number' ? Math.max(0, Math.floor(raw.house.yearlyPay)) : 0,
        partnerShare: typeof raw.house.partnerShare === 'number' ? clamp(raw.house.partnerShare, 0, 100) : 0,
      }
    : { level: 'none', mortgageLeft: 0, yearlyPay: 0, partnerShare: 0 }

  const out: GameState = {
    version: 1,
    seed,
    name,
    gender,
    birthCity,
    currentCity,
    familyWealth,
    age: typeof raw.age === 'number' ? Math.max(0, Math.floor(raw.age)) : 0,
    year: typeof raw.year === 'number' ? Math.max(0, Math.floor(raw.year)) : 0,
    alive: raw.alive !== false,
    money: typeof raw.money === 'number' ? Math.floor(raw.money) : 0,
    stats,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((x: any) => typeof x === 'string').slice(0, 50) : [],
    logs: Array.isArray(raw.logs) ? raw.logs.filter((x: any) => typeof x === 'string').slice(-120) : [],
    parents: Array.isArray(raw.parents) ? raw.parents : [],
    friends: Array.isArray(raw.friends) ? raw.friends : [],
    partner: raw.partner && typeof raw.partner === 'object' ? raw.partner : null,
    children: Array.isArray(raw.children) ? raw.children : [],
    edu,
    rent,
    house,
    yearFlags,
    currentEvent: raw.currentEvent && typeof raw.currentEvent === 'object' ? raw.currentEvent : null,
  }
  return out
}

function pushLog(g: GameState, text: string) {
  const line = `${g.age}岁：${text}`
  const next = g.logs.length > 120 ? g.logs.slice(-120) : g.logs.slice()
  next.push(line)
  return next
}

function addTag(tags: string[], t: string) {
  if (!t) return tags
  if (tags.includes(t)) return tags
  return [...tags, t]
}

function removeTag(tags: string[], t: string) {
  if (!t) return tags
  return tags.filter(x => x !== t)
}

function applyDelta(g: GameState, r: OptionResult) {
  let stats = { ...g.stats }
  if (r.statsDelta) {
    for (const [k, v] of Object.entries(r.statsDelta) as [StatKey, number][]) {
      stats[k] = clamp((stats[k] || 0) + (v || 0), 0, 100)
    }
  }
  if (typeof r.heal === 'number') stats.health = clamp(stats.health + r.heal, 0, 100)
  if (typeof r.hurt === 'number') stats.health = clamp(stats.health - r.hurt, 0, 100)

  let money = g.money + (r.moneyDelta || 0)
  if (!Number.isFinite(money)) money = g.money

  let tags = g.tags.slice()
  for (const t of r.addTags || []) tags = addTag(tags, t)
  for (const t of r.removeTags || []) tags = removeTag(tags, t)

  return { ...g, stats, money, tags }
}

function chooseOutcome(rng: ReturnType<typeof makeRng>, outcomes: { weight: number; result: OptionResult }[]) {
  const items = outcomes.filter(o => o.weight > 0)
  const sum = items.reduce((s, o) => s + o.weight, 0)
  if (sum <= 0) return items[0]?.result || {}
  const r = rng.nextFloat() * sum
  let acc = 0
  for (const o of items) {
    acc += o.weight
    if (r <= acc) return o.result
  }
  return items[items.length - 1]?.result || {}
}

function deathCheck(rng: ReturnType<typeof makeRng>, g: GameState) {
  if (!g.alive) return true
  if (g.age < 10) return false
  const ageFactor = clamp((g.age - 10) / 90, 0, 1)
  const healthFactor = clamp((100 - g.stats.health) / 100, 0, 1)
  const p = 0.002 + ageFactor * 0.08 + healthFactor * 0.06
  const p2 = g.age >= 70 && g.stats.health <= 25 ? 0.15 : 0
  return rng.chance(clamp(p + p2, 0, 0.35))
}

function settleAllowance(rng: ReturnType<typeof makeRng>, g: GameState) {
  // 家境越好、未成年越容易给；太穷时也会救急
  const base = g.age <= 18 ? 0.32 : 0.06
  const wealthBoost = (g.familyWealth >= 70 ? 0.12 : g.familyWealth >= 45 ? 0.06 : 0.02)
  const poorBoost = g.money < 1500 ? 0.14 : g.money < 3000 ? 0.08 : 0
  const p = clamp(base + wealthBoost + poorBoost, 0, 0.65)
  if (!rng.chance(p)) return g
  const wealthMul = 0.6 + g.familyWealth / 100 // 0.6~1.6
  const baseAmt = g.age <= 18 ? rng.nextInt(120, 900) : rng.nextInt(200, 2200)
  const amt = Math.max(50, Math.round(baseAmt * wealthMul))
  const next = { ...g, money: g.money + amt }
  return { ...next, logs: pushLog(next, `父母给了你${amt}零花钱。`) }
}

function settleHouse(rng: ReturnType<typeof makeRng>, g: GameState) {
  if (g.house.level === 'none') return g
  if (g.house.mortgageLeft <= 0) return g

  const share = clamp(g.house.partnerShare, 0, 100) / 100
  const partnerPay = g.partner ? Math.floor(g.house.yearlyPay * share) : 0
  const selfPay = g.house.yearlyPay - partnerPay
  const canPay = g.money >= selfPay

  let next = g
  if (canPay) {
    next = { ...next, money: next.money - selfPay }
    next = { ...next, logs: pushLog(next, `房贷到期还款：你付${selfPay}${partnerPay ? `，伴侣分担${partnerPay}` : ''}。`) }
  } else {
    next = { ...next, logs: pushLog(next, `房贷压力爆表：你没凑够${selfPay}，只能硬扛。`) }
    next = applyDelta(next, { statsDelta: { health: -4, social: -3 }, addTags: ['负债焦虑'] })
  }

  const left = Math.max(0, next.house.mortgageLeft - 1)
  next = { ...next, house: { ...next.house, mortgageLeft: left } }
  if (left === 0) {
    next = { ...next, logs: pushLog(next, '恭喜：房贷结清了。你突然觉得空气都清新了。') }
    next = applyDelta(next, { statsDelta: { health: +2, social: +1 }, removeTags: ['负债焦虑'] })
  }
  if (rng.chance(0.08)) {
    const cost = rng.nextInt(2000, 12000)
    next = { ...next, money: next.money - cost, logs: pushLog(next, `房屋小修：花了${cost}。`) }
  }
  return next
}

function ensurePartner(rng: ReturnType<typeof makeRng>, g: GameState) {
  if (g.partner) return g
  const p: Person = { id: uuidLike(rng), role: 'partner', name: genName(rng, rng.chance(0.5) ? 'male' : 'female'), trait: genTrait(rng), intimacy: rng.nextInt(35, 65) }
  const next = { ...g, partner: p }
  return { ...next, logs: pushLog(next, `你和「${p.name}」开始在一起了。`) }
}

function addFriend(rng: ReturnType<typeof makeRng>, g: GameState) {
  const p: Person = { id: uuidLike(rng), role: 'friend', name: genName(rng, rng.chance(0.5) ? 'male' : 'female'), trait: genTrait(rng), intimacy: rng.nextInt(20, 55) }
  const next = { ...g, friends: [...g.friends, p] }
  return { ...next, logs: pushLog(next, `你认识了新朋友「${p.name}」。`) }
}

function haveChild(rng: ReturnType<typeof makeRng>, g: GameState) {
  const babyGender: 'male' | 'female' = rng.chance(0.52) ? 'male' : 'female'
  const baby: Person = { id: uuidLike(rng), role: 'child', name: genName(rng, babyGender), trait: genTrait(rng), intimacy: rng.nextInt(35, 70) }
  const next = { ...g, children: [...g.children, baby] }
  return { ...next, logs: pushLog(next, `你有了孩子「${baby.name}」。`) }
}

function defaultNewGame(seed: number): GameState {
  const rng = makeRng(seed)
  const gender: 'male' | 'female' = rng.chance(0.52) ? 'male' : 'female'
  const name = genName(rng, gender)
  const birthCity = pickCity(rng)
  const familyWealth = clamp(rng.nextInt(15, 95) + rng.nextInt(-10, 10), 0, 100)

  const stats: Stats = {
    health: clamp(rng.nextInt(35, 95) + rng.nextInt(-8, 8), 0, 100),
    beauty: clamp(rng.nextInt(25, 95) + rng.nextInt(-10, 10), 0, 100),
    smarts: clamp(rng.nextInt(25, 95) + rng.nextInt(-10, 10), 0, 100),
    social: clamp(rng.nextInt(20, 95) + rng.nextInt(-10, 10), 0, 100),
    luck: clamp(rng.nextInt(20, 95) + rng.nextInt(-10, 10), 0, 100),
  }

  const dad: Person = { id: uuidLike(rng), role: 'parent', name: genName(rng, 'male'), trait: genTrait(rng), intimacy: rng.nextInt(45, 80) }
  const mom: Person = { id: uuidLike(rng), role: 'parent', name: genName(rng, 'female'), trait: genTrait(rng), intimacy: rng.nextInt(45, 85) }

  const g: GameState = {
    version: 1,
    seed,
    name,
    gender,
    birthCity,
    currentCity: birthCity,
    familyWealth,
    age: 0,
    year: 0,
    alive: true,
    money: rng.nextInt(0, 3000),
    stats,
    tags: [],
    logs: [],
    parents: [dad, mom],
    friends: [],
    partner: null,
    children: [],
    edu: { stage: 'none', score: clamp(rng.nextInt(25, 80) + Math.floor(stats.smarts / 20) - 2, 0, 100), yearsInStage: 0 },
    rent: { tier: 'none', yearlyRent: 0 },
    house: { level: 'none', mortgageLeft: 0, yearlyPay: 0, partnerShare: 0 },
    yearFlags: { plazaUsed: false, assetUsed: false, schoolUsed: false },
    currentEvent: null,
  }

  return {
    ...g,
    logs: pushLog(g, `你出生了。名字叫「${name}」。出生地：${birthCity.name}（${birthCity.tier === 'tier1' ? '一线' : birthCity.tier === 'tier2' ? '二线' : '三线'}）。`),
  }
}

function getEvents(): EventDef[] {
  return [
    {
      id: 'E00',
      title: '出生',
      minAge: 0,
      maxAge: 0,
      weight: () => 100,
      text: () => '你出生在一个普通家庭。大人的世界很吵，你的世界很空。',
      options: () => [
        { id: 'o1', text: '哇哇大哭', outcomes: [{ weight: 1, result: { text: '你哭得很响亮。', statsDelta: { health: +1, social: +1 } } }, { weight: 1, result: { text: '你哭两声就停了，很省心。', statsDelta: { health: +2 } } }] },
        { id: 'o2', text: '安静眨眼', outcomes: [{ weight: 1, result: { text: '你像在观察世界。', statsDelta: { smarts: +2 } } }, { weight: 1, result: { text: '父母反而更紧张了。', statsDelta: { social: -1, luck: +1 } } }] },
      ],
    },
    {
      id: 'E01',
      title: '幼儿园第一天',
      minAge: 3,
      maxAge: 6,
      weight: (g) => 8 + Math.floor(g.stats.social / 20),
      text: () => '你第一次走进幼儿园。小鞋架像一排排未知的领地。',
      options: (g) => [
        { id: 'o1', text: '牵紧老师的手', outcomes: [{ weight: 2, result: { text: '老师夸你乖。', statsDelta: { social: +2, health: +1 } } }, { weight: 1, result: { text: '你被哭声影响，差点也哭。', statsDelta: { social: +1, luck: -1 } } }] },
        { id: 'o2', text: '自己去找玩具', outcomes: [{ weight: 2, result: { text: '你玩得很投入。', statsDelta: { smarts: +2 } } }, { weight: 1, result: { text: '你抢玩具失败，被教育了。', statsDelta: { social: -1, health: -1 } } }] },
        ...(g.friends.length === 0 ? [{ id: 'o3', text: '主动跟旁边的小朋友说话', outcomes: [{ weight: 2, result: { text: '你交到了第一个朋友。', statsDelta: { social: +3 }, addFriend: true } }, { weight: 1, result: { text: '对方不理你，你有点尴尬。', statsDelta: { social: -1, luck: +1 } } }] }] : []),
      ],
    },
    {
      id: 'E02',
      title: '小病一场',
      minAge: 0,
      maxAge: 12,
      weight: (g) => 6 + Math.floor((100 - g.stats.health) / 15),
      text: () => '你发烧了。天花板的灯像一个模糊的太阳。',
      options: () => [
        { id: 'o1', text: '乖乖吃药', outcomes: [{ weight: 3, result: { text: '你很快退烧。', heal: 6, statsDelta: { health: +2 } } }, { weight: 1, result: { text: '药太苦，你记仇了。', heal: 3, statsDelta: { social: -1, smarts: +1 } } }] },
        { id: 'o2', text: '死活不吃', outcomes: [{ weight: 2, result: { text: '你拖了两天才好。', hurt: 4, statsDelta: { health: -2 } } }, { weight: 1, result: { text: '父母拿糖哄你，你勉强吃了。', heal: 2, statsDelta: { luck: +1 } } }] },
      ],
    },
    {
      id: 'E03',
      title: '第一次考试',
      minAge: 7,
      maxAge: 12,
      weight: (g) => 7 + Math.floor(g.stats.smarts / 20),
      text: () => '试卷发下来了。你盯着分数，像盯着一面镜子。',
      options: (g) => [
        { id: 'o1', text: '认真订正', outcomes: [{ weight: 2, result: { text: '你把错题都弄懂了。', statsDelta: { smarts: +3 } } }, { weight: 1, result: { text: '订正到一半就走神。', statsDelta: { smarts: +1, luck: +1 } } }] },
        { id: 'o2', text: '偷偷塞进书包', outcomes: [{ weight: 2, result: { text: '你短暂逃避了，但心更慌。', statsDelta: { social: -1, health: -1 } } }, { weight: 1, result: { text: '你没被发现，松口气。', statsDelta: { luck: +2 } } }] },
        ...(g.friends.length === 0 ? [{ id: 'o3', text: '鼓起勇气请同桌一起玩', outcomes: [{ weight: 2, result: { text: '你交到了朋友。', statsDelta: { social: +3 }, addFriend: true } }, { weight: 1, result: { text: '对方很忙，你只好作罢。', statsDelta: { luck: +1 } } }] }] : []),
      ],
    },
    {
      id: 'E04',
      title: '青春期的风',
      minAge: 13,
      maxAge: 18,
      weight: () => 10,
      text: () => '你开始在意别人的目光。镜子里的你，比昨天更像“一个人”。',
      options: () => [
        { id: 'o1', text: '开始运动', outcomes: [{ weight: 2, result: { text: '汗水很诚实。', statsDelta: { health: +4, beauty: +1 } } }, { weight: 1, result: { text: '三天打鱼两天晒网。', statsDelta: { health: +1, luck: +1 } } }] },
        { id: 'o2', text: '熬夜刷手机', outcomes: [{ weight: 2, result: { text: '你把睡眠当成可有可无。', statsDelta: { health: -3, smarts: -1 } } }, { weight: 1, result: { text: '你笑了一整晚。', statsDelta: { social: +1, health: -2 } } }] },
        { id: 'o3', text: '认真学习', outcomes: [{ weight: 2, result: { text: '你突然开窍。', statsDelta: { smarts: +4 } } }, { weight: 1, result: { text: '你努力但很累。', statsDelta: { smarts: +2, health: -1 } } }] },
      ],
    },
    {
      id: 'E05',
      title: '打工与饭钱',
      minAge: 16,
      maxAge: 30,
      weight: (g) => 6 + Math.floor(g.stats.social / 30),
      text: () => '你开始尝试靠自己赚点钱。那感觉像第一次学会走路。',
      options: () => [
        { id: 'o1', text: '去做兼职', outcomes: [{ weight: 2, result: { text: '你赚到了第一笔属于自己的钱。', moneyDelta: 1200, statsDelta: { social: +1 } } }, { weight: 1, result: { text: '你被骂了一顿，但也学会忍耐。', moneyDelta: 600, statsDelta: { health: -2, smarts: +1 } } }] },
        { id: 'o2', text: '算了，回家吃饭', outcomes: [{ weight: 2, result: { text: '你省了钱，也省了心。', statsDelta: { health: +1, luck: +1 } } }, { weight: 1, result: { text: '你有点不甘心。', statsDelta: { social: -1, smarts: +1 } } }] },
      ],
    },
    {
      id: 'E06',
      title: '暧昧',
      minAge: 16,
      maxAge: 35,
      weight: (g) => (g.partner ? 0 : 7 + Math.floor(g.stats.beauty / 25) + Math.floor(g.stats.social / 25)),
      text: () => '有人对你示好，像把一盏小灯放进你的口袋。',
      options: () => [
        { id: 'o1', text: '试着多聊聊', outcomes: [{ weight: 2, result: { text: '你们的距离近了一点。', statsDelta: { social: +2 }, meetPartner: true } }, { weight: 1, result: { text: '聊着聊着就散了。', statsDelta: { luck: -1, smarts: +1 } } }] },
        { id: 'o2', text: '装作没看见', outcomes: [{ weight: 2, result: { text: '你把自己藏起来，没人能伤到你。', statsDelta: { social: -1, luck: +1 } } }, { weight: 1, result: { text: '你后来有点后悔。', statsDelta: { health: -1, smarts: +1 } } }] },
      ],
    },
    {
      id: 'E07',
      title: '升学选择',
      minAge: 18,
      maxAge: 24,
      weight: (g) => 8 + Math.floor(g.stats.smarts / 25),
      text: () => '你站在岔路口：继续读书，还是先去社会碰碰。',
      options: () => [
        { id: 'o1', text: '继续读书', outcomes: [{ weight: 2, result: { text: '你读到了更多世界。', statsDelta: { smarts: +4, social: +1 }, moneyDelta: -600 } }, { weight: 1, result: { text: '你很累，但你知道自己在变强。', statsDelta: { smarts: +3, health: -1 }, moneyDelta: -800 } }] },
        { id: 'o2', text: '先去工作', outcomes: [{ weight: 2, result: { text: '你更早接触现实。', statsDelta: { social: +2 }, moneyDelta: 1800 } }, { weight: 1, result: { text: '你撞了些墙，也学会转弯。', statsDelta: { social: +1, smarts: +1 }, moneyDelta: 1200 } }] },
      ],
    },
    {
      id: 'E08',
      title: '孩子的事',
      minAge: 22,
      maxAge: 45,
      weight: (g) => (g.partner && g.children.length < 2 ? 5 : 0),
      text: () => '你开始想：要不要有个孩子？',
      options: () => [
        { id: 'o1', text: '顺其自然', outcomes: [{ weight: 2, result: { text: '你们决定试试。', haveChild: true, statsDelta: { health: -1, social: +1 } } }, { weight: 1, result: { text: '你们还没准备好。', statsDelta: { smarts: +1 } } }] },
        { id: 'o2', text: '先等等', outcomes: [{ weight: 2, result: { text: '你更想把自己照顾好。', statsDelta: { health: +1 } } }, { weight: 1, result: { text: '你们达成共识：以后再说。', statsDelta: { social: +1 } } }] },
      ],
    },
    {
      id: 'E09',
      title: '老朋友的消息',
      minAge: 19,
      maxAge: 80,
      weight: (g) => (g.friends.length > 0 ? 7 : 2),
      text: () => '一个很久没联系的朋友突然发来消息。',
      options: () => [
        { id: 'o1', text: '热情回应', outcomes: [{ weight: 2, result: { text: '你们聊得很开心。', statsDelta: { social: +3, luck: +1 } } }, { weight: 1, result: { text: '你约到了一个聚会。', statsDelta: { social: +2 }, moneyDelta: -200 } }] },
        { id: 'o2', text: '礼貌但疏远', outcomes: [{ weight: 2, result: { text: '联系停在了“哈哈”。', statsDelta: { social: -1 } } }, { weight: 1, result: { text: '你松了一口气。', statsDelta: { health: +1 } } }] },
      ],
    },
    {
      id: 'E10',
      title: '中年疲惫',
      minAge: 31,
      maxAge: 60,
      weight: (g) => 6 + Math.floor((100 - g.stats.health) / 20),
      text: () => '你突然觉得：时间跑得太快，而你追得太累。',
      options: () => [
        { id: 'o1', text: '去体检', outcomes: [{ weight: 2, result: { text: '你被医生吓了一跳，然后开始自律。', statsDelta: { health: +4 } } }, { weight: 1, result: { text: '问题不大，安心了。', statsDelta: { health: +2, luck: +1 } } }] },
        { id: 'o2', text: '继续熬着', outcomes: [{ weight: 2, result: { text: '你把疲惫吞下去。', statsDelta: { health: -4, smarts: -1 } } }, { weight: 1, result: { text: '你硬撑过去了一年。', statsDelta: { health: -2, social: -1 }, addTags: ['硬撑'] } }] },
      ],
    },
    {
      id: 'E11',
      title: '养生与懒',
      minAge: 45,
      maxAge: 90,
      weight: (g) => 5 + Math.floor((100 - g.stats.health) / 25),
      text: () => '你开始相信：身体是要“养”的。',
      options: () => [
        { id: 'o1', text: '早睡早起', outcomes: [{ weight: 2, result: { text: '你一觉到天亮。', statsDelta: { health: +4 } } }, { weight: 1, result: { text: '你坚持了三天。', statsDelta: { health: +1 } } }] },
        { id: 'o2', text: '舒服最重要', outcomes: [{ weight: 2, result: { text: '舒服是舒服，但身体抗议。', statsDelta: { health: -2 } } }, { weight: 1, result: { text: '你开心了一阵。', statsDelta: { luck: +1 } } }] },
      ],
    },
  ]
}

function pickEvent(rng: ReturnType<typeof makeRng>, g: GameState) {
  const defs = getEvents()
  const candidates = defs
    .map(def => ({ def, w: def.minAge <= g.age && g.age <= def.maxAge ? def.weight(g) : 0 }))
    .filter(x => x.w > 0)
  const sum = candidates.reduce((s, x) => s + x.w, 0)
  if (sum <= 0) return defs[0]
  const r = rng.nextFloat() * sum
  let acc = 0
  for (const x of candidates) {
    acc += x.w
    if (r <= acc) return x.def
  }
  return candidates[candidates.length - 1].def
}

function startYear(rng: ReturnType<typeof makeRng>, g: GameState) {
  const def = pickEvent(rng, g)
  const ce: CurrentEvent = {
    id: def.id,
    title: def.title,
    text: def.text(g),
    options: def.options(g).map(o => ({ id: o.id, text: o.text, picked: false })),
    resolved: false,
  }
  return { ...g, currentEvent: ce }
}

function resolveOption(rng: ReturnType<typeof makeRng>, g: GameState, optId: string) {
  if (!g.currentEvent || g.currentEvent.resolved) return g
  const def = getEvents().find(x => x.id === g.currentEvent?.id)
  if (!def) return g
  const opts = def.options(g)
  const opt = opts.find(o => o.id === optId)
  if (!opt) return g

  const outcome = chooseOutcome(rng, opt.outcomes)
  let next = applyDelta(g, outcome)
  if (outcome.addFriend) next = addFriend(rng, next)
  if (outcome.meetPartner) next = ensurePartner(rng, next)
  if (outcome.haveChild && next.partner) next = haveChild(rng, next)
  if (outcome.text) next = { ...next, logs: pushLog(next, outcome.text) }

  const updatedEvent: CurrentEvent = {
    ...next.currentEvent!,
    resolved: true,
    options: next.currentEvent!.options.map(o => ({ ...o, picked: o.id === optId })),
  }
  return { ...next, currentEvent: updatedEvent }
}

function nextYear(rng: ReturnType<typeof makeRng>, g: GameState) {
  if (!g.alive) return g
  if (!g.currentEvent?.resolved) return g

  let next: GameState = {
    ...g,
    age: g.age + 1,
    year: g.year + 1,
    yearFlags: { plazaUsed: false, assetUsed: false, schoolUsed: false },
  }

  // 6岁解锁学校（小学）
  if (next.age === 6 && next.edu.stage === 'none') {
    next = { ...next, edu: { ...next.edu, stage: 'primary', yearsInStage: 0 } }
    next = { ...next, logs: pushLog(next, '你6岁了：学校解锁了。') }
  }

  // 学段自动推进（即使不点“学校”，时间也会过）
  if (['primary', 'middle_public', 'middle_private', 'high_public', 'high_private', 'uni'].includes(next.edu.stage)) {
    next = { ...next, edu: { ...next.edu, yearsInStage: next.edu.yearsInStage + 1 } }
  }

  // 学费/房租/房贷结算（每年）
  const payTuition = (cost: number, label: string) => {
    if (cost <= 0) return
    if (next.money >= cost) {
      next = { ...next, money: next.money - cost, logs: pushLog(next, `${label}学费支出：${cost}。`) }
      return
    }
    // 家境好：父母兜底
    if (next.familyWealth >= 55) {
      next = { ...next, logs: pushLog(next, `${label}学费：你有点吃紧，父母帮你垫上了。`) }
      next = { ...next, money: 0 }
      return
    }
    // 读不起：辍学
    next = { ...next, edu: { ...next.edu, stage: 'dropped' }, logs: pushLog(next, `你读不起${label}了：只能辍学。`) }
    next = applyDelta(next, { statsDelta: { social: -2, smarts: -2 }, addTags: ['辍学'] })
  }

  // 私立学费
  if (next.edu.stage === 'middle_private') payTuition(8000, '私立初中')
  if (next.edu.stage === 'high_private') payTuition(15000, '私立高中')
  if (next.edu.stage === 'uni') payTuition(18000, '大学')

  // 房租（成年后生效）
  if (next.age >= 18 && next.rent.tier !== 'none' && next.rent.yearlyRent > 0) {
    if (next.money >= next.rent.yearlyRent) {
      next = { ...next, money: next.money - next.rent.yearlyRent, logs: pushLog(next, `房租缴费：${next.rent.yearlyRent}。`) }
    } else {
      next = { ...next, logs: pushLog(next, '房租交不起了：你只能先搬出去。') }
      next = { ...next, rent: { tier: 'none', yearlyRent: 0 } }
    }
  }

  next = settleAllowance(rng, next)
  next = settleHouse(rng, next)

  // 小学毕业分流（6年后）
  if (next.age === 12 && next.edu.stage === 'primary' && next.edu.yearsInStage >= 6) {
    const score = next.edu.score
    if (score >= 65) {
      next = { ...next, edu: { ...next.edu, stage: 'middle_public', yearsInStage: 0 }, logs: pushLog(next, `小学毕业：凭预计成绩${score}，你进了重点初中（公立）。`) }
    } else {
      next = { ...next, edu: { ...next.edu, stage: 'middle_private', yearsInStage: 0 }, logs: pushLog(next, `小学毕业：预计成绩${score}一般，你去了私立初中（更贵）。`) }
    }
  }

  // 初中毕业分流（3年）
  if (next.age === 15 && (next.edu.stage === 'middle_public' || next.edu.stage === 'middle_private') && next.edu.yearsInStage >= 3) {
    const score = next.edu.score
    if (score >= 70) {
      next = { ...next, edu: { ...next.edu, stage: 'high_public', yearsInStage: 0 }, logs: pushLog(next, `初中毕业：预计成绩${score}，你进了好高中（公立）。`) }
    } else {
      next = { ...next, edu: { ...next.edu, stage: 'high_private', yearsInStage: 0 }, logs: pushLog(next, `初中毕业：预计成绩${score}不够稳，你去了私立高中（更贵）。`) }
    }
  }

  // 高考/上大学（3年高中）
  if (next.age === 18 && (next.edu.stage === 'high_public' || next.edu.stage === 'high_private') && next.edu.yearsInStage >= 3) {
    const score = next.edu.score
    if (score < 55) {
      next = { ...next, edu: { ...next.edu, stage: 'graduated', yearsInStage: 0 }, logs: pushLog(next, `18岁：你没考上大学（预计成绩${score}）。你决定直接去社会闯闯。`) }
    } else {
      // 城市分配：成绩越高越可能去更大城市；家境也会拉一把
      const boost = Math.floor(next.familyWealth / 25) * 3
      const s = clamp(score + boost, 0, 100)
      const tier: CityTier = s >= 85 ? 'tier1' : s >= 70 ? (rng.chance(0.25) ? 'tier1' : 'tier2') : (rng.chance(0.25) ? 'tier2' : 'tier3')
      const city = pickCity(rng, tier)
      next = { ...next, currentCity: city, edu: { ...next.edu, stage: 'uni', yearsInStage: 0 }, logs: pushLog(next, `18岁：你考上大学，去了${city.name}（${tier === 'tier1' ? '一线' : tier === 'tier2' ? '二线' : '三线'}）。`) }
    }
  }

  // 大学毕业（4年）
  if (next.age === 22 && next.edu.stage === 'uni' && next.edu.yearsInStage >= 4) {
    next = { ...next, edu: { ...next.edu, stage: 'graduated', yearsInStage: 0 }, logs: pushLog(next, '22岁：你大学毕业了。') }
  }

  // 毕业后没住房：露宿街头风险
  const hasHousing = next.house.level !== 'none' || next.rent.tier !== 'none'
  if (next.age >= 22 && next.edu.stage === 'graduated' && !hasHousing) {
    next = { ...next, logs: pushLog(next, '你没有住处：只能先露宿街头。') }
    next = applyDelta(next, { statsDelta: { health: -3 } })
    if (rng.chance(0.35) && next.money > 0) {
      const stolen = Math.min(next.money, rng.nextInt(50, 600))
      next = { ...next, money: next.money - stolen, logs: pushLog(next, `你被流浪汉顺走了${stolen}。`) }
    }
  }

  if (next.partner && rng.chance(0.25)) {
    const delta = rng.chance(0.6) ? rng.nextInt(1, 4) : -rng.nextInt(1, 3)
    const p = { ...next.partner, intimacy: clamp(next.partner.intimacy + delta, 0, 100) }
    next = { ...next, partner: p, logs: pushLog(next, delta >= 0 ? `你和${p.name}更默契了一点。` : `你和${p.name}闹了点小别扭。`) }
  }

  if (deathCheck(rng, next)) {
    next = { ...next, alive: false, currentEvent: null, logs: pushLog(next, '你走到了人生的终点。') }
    return next
  }

  return startYear(rng, next)
}

function statLabel(k: StatKey) {
  switch (k) {
    case 'health': return '健康'
    case 'beauty': return '颜值'
    case 'smarts': return '智慧'
    case 'social': return '社交'
    case 'luck': return '运气'
  }
}

function barColor(k: StatKey) {
  switch (k) {
    case 'health': return 'from-emerald-400 to-green-500'
    case 'beauty': return 'from-pink-400 to-rose-500'
    case 'smarts': return 'from-indigo-400 to-blue-500'
    case 'social': return 'from-amber-400 to-orange-500'
    case 'luck': return 'from-purple-400 to-fuchsia-500'
  }
}

export default function LiaoliaoYishengScreen() {
  const [game, setGame] = useState<GameState | null>(null)
  const [showRelations, setShowRelations] = useState(false)
  const [showPlaza, setShowPlaza] = useState(false)
  const [showAssets, setShowAssets] = useState(false)
  const [showSchool, setShowSchool] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const normalized = normalizeLoadedGame(parsed)
        if (normalized) {
          // 若存档缺字段，补齐后回写一次，避免后续再崩
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
          } catch {
            // ignore
          }
          setGame(normalized)
          return
        }
      }
    } catch {
      // ignore
    }
    setGame(null)
  }, [])

  useEffect(() => {
    if (!game) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(game))
    } catch {
      // ignore
    }
  }, [game])

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    shouldAutoScrollRef.current = false
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [game?.logs.length, game?.currentEvent?.id, game?.currentEvent?.resolved])

  const startFresh = () => {
    const seed = Date.now() ^ Math.floor(Math.random() * 1e9)
    const g0 = defaultNewGame(seed)
    const rng = makeRng(seed)
    const g1 = startYear(rng, g0)
    shouldAutoScrollRef.current = true
    setGame(g1)
  }

  const doPickOption = (optId: string) => {
    if (!game) return
    const rng = makeRng(game.seed + game.year * 131 + game.logs.length * 17)
    shouldAutoScrollRef.current = true
    setGame(resolveOption(rng, game, optId))
  }

  const doNextYear = () => {
    if (!game) return
    const rng = makeRng(game.seed + game.year * 131 + game.logs.length * 17 + 999)
    shouldAutoScrollRef.current = true
    setGame(nextYear(rng, game))
  }

  const plazaChoices = useMemo(() => {
    if (!game) return []
    const rng = makeRng(game.seed + game.year * 777 + 1)
    const pool = [
      { id: 'p1', title: '路边摊', desc: '买点吃的，心情可能会变好。' },
      { id: 'p2', title: '随机结识', desc: '遇到一个有意思的人。' },
      { id: 'p3', title: '小倒霉', desc: '可能会破财消灾。' },
      { id: 'p4', title: '小幸运', desc: '可能捡到点好事。' },
      ...(game.age >= 16 ? [{ id: 'p_clinic', title: '医院/整容', desc: '花钱买颜值（有风险）。' }] : []),
    ]
    // 每年给 3~4 个可选项（可包含“医院/整容”）
    const n = Math.min(pool.length, rng.chance(0.4) ? 4 : 3)
    const selected: typeof pool = []
    const tmp = pool.slice()
    while (selected.length < n && tmp.length > 0) {
      const idx = rng.nextInt(0, tmp.length - 1)
      selected.push(tmp.splice(idx, 1)[0]!)
    }
    return selected
  }, [game?.seed, game?.year])

  const assetChoices = useMemo(() => {
    if (!game) return []
    // 18岁后才需要考虑租房/购房
    if (game.age < 18) {
      return [
        { id: 'a_minor', title: '未成年', desc: '18岁后才需要考虑租房/买房。' },
        { id: 'a_skip', title: '算了', desc: '今年先不折腾。' },
      ]
    }
    return [
      { id: 'a_rent_1000', title: '租房：简陋大单间（¥1000/月）', desc: '便宜但条件一般。' },
      { id: 'a_rent_2500', title: '租房：一室一厅（¥2500/月）', desc: '中等舒适。' },
      { id: 'a_rent_5000', title: '租房：豪华Loft（¥5000/月）', desc: '舒服但贵。' },
      ...(game.rent.tier !== 'none' ? [{ id: 'a_rent_cancel', title: '退租', desc: '不租了（可能会露宿街头）。' }] : []),
      { id: 'a_house_small', title: '购房：小房（18+）', desc: '首付更低，压力也更小。' },
      { id: 'a_house_mid', title: '购房：中房（18+）', desc: '更体面，压力也更大。' },
      { id: 'a_skip', title: '算了', desc: '今年先不折腾。' },
    ]
  }, [game])

  const statusBadges = useMemo(() => {
    if (!game) return []
    const out: { text: string; tone: 'ok' | 'warn' }[] = []
    if (game.tags.includes('负债焦虑')) out.push({ text: '负债焦虑', tone: 'warn' })
    if (game.tags.includes('硬撑')) out.push({ text: '硬撑', tone: 'warn' })
    if (game.partner) out.push({ text: `伴侣：${game.partner.name}`, tone: 'ok' })
    if (game.house.level !== 'none') out.push({ text: `房：${game.house.level === 'small' ? '小' : game.house.level === 'mid' ? '中' : '大'}`, tone: 'ok' })
    return out.slice(0, 4)
  }, [game])

  const handlePlazaPick = (id: string) => {
    if (!game) return
    const rng = makeRng(game.seed + game.year * 777 + game.logs.length * 3)
    let next = { ...game, yearFlags: { ...game.yearFlags, plazaUsed: true } }

    if (id === 'p1') {
      const cost = rng.nextInt(10, 80)
      next = { ...next, money: next.money - cost, logs: pushLog(next, `你在路边摊花了${cost}，吃得很满足。`) }
      next = applyDelta(next, { statsDelta: { health: +1, luck: +1 } })
    } else if (id === 'p2') {
      if (!next.partner && next.age >= 16 && rng.chance(0.35)) next = ensurePartner(rng, next)
      else next = addFriend(rng, next)
      next = applyDelta(next, { statsDelta: { social: +2 } })
    } else if (id === 'p3') {
      const loss = rng.nextInt(50, 600)
      next = { ...next, money: next.money - loss, logs: pushLog(next, `你今天有点倒霉，损失了${loss}。`) }
      next = applyDelta(next, { statsDelta: { luck: -2, health: -1 } })
    } else if (id === 'p4') {
      const gain = rng.nextInt(80, 900)
      next = { ...next, money: next.money + gain, logs: pushLog(next, `你捡到了点好运：多了${gain}。`) }
      next = applyDelta(next, { statsDelta: { luck: +3 } })
      if (rng.chance(0.25) && next.friends.length === 0) next = addFriend(rng, next)
    } else if (id === 'p_clinic') {
      const cost = rng.nextInt(2000, 15000)
      next = { ...next, money: next.money - cost, logs: pushLog(next, `你去了医院/整容，花了${cost}。`) }
      if (rng.chance(0.78)) {
        next = applyDelta(next, { statsDelta: { beauty: +rng.nextInt(2, 8) } })
        next = { ...next, logs: pushLog(next, '你照镜子时，突然觉得自己顺眼多了。') }
      } else {
        next = applyDelta(next, { statsDelta: { beauty: -rng.nextInt(2, 8), health: -rng.nextInt(2, 6) } })
        next = { ...next, logs: pushLog(next, '效果不太理想，你有点后悔。') }
      }
    }

    shouldAutoScrollRef.current = true
    setGame(next)
    setShowPlaza(false)
  }

  const handleAssetPick = (id: string) => {
    if (!game) return
    const rng = makeRng(game.seed + game.year * 999 + game.logs.length * 5)
    let next = { ...game, yearFlags: { ...game.yearFlags, assetUsed: true } }

    // 未成年：不消耗“资产次数”，直接提示
    if (next.age < 18 && id !== 'a_skip') {
      next = { ...next, yearFlags: { ...next.yearFlags, assetUsed: false }, logs: pushLog(next, '你还未成年：不用考虑租房/买房。') }
      shouldAutoScrollRef.current = true
      setGame(next)
      setShowAssets(false)
      return
    }

    if (id === 'a_house_small' || id === 'a_house_mid') {
      if (next.age < 18) {
        next = { ...next, yearFlags: { ...next.yearFlags, assetUsed: false }, logs: pushLog(next, '18岁之后才能买房。') }
        shouldAutoScrollRef.current = true
        setGame(next)
        setShowAssets(false)
        return
      }
      if (next.house.level !== 'none') {
        next = { ...next, logs: pushLog(next, '你已经有房了，今年不再折腾买房。') }
      } else {
        const level: HouseLevel = id === 'a_house_small' ? 'small' : 'mid'
        const down = level === 'small' ? 15000 : 40000
        const yearlyPay = level === 'small' ? 8000 : 18000
        const years = level === 'small' ? 8 : 12
        const partnerShare = next.partner ? (rng.chance(0.35) ? 100 : rng.chance(0.55) ? 50 : 0) : 0
        if (next.money < down) {
          next = { ...next, logs: pushLog(next, `你想买房，但首付${down}不够。`) }
          next = { ...next, yearFlags: { ...next.yearFlags, assetUsed: false } }
          shouldAutoScrollRef.current = true
          setGame(next)
          setShowAssets(false)
          return
        }
        next = { ...next, money: next.money - down }
        next = { ...next, house: { level, mortgageLeft: years, yearlyPay, partnerShare } }
        next = { ...next, logs: pushLog(next, `你买了${level === 'small' ? '小房' : '中房'}，首付${down}，房贷${years}年。${next.partner ? `伴侣分担：${partnerShare}%` : ''}`) }
        next = applyDelta(next, { statsDelta: { social: +2 }, addTags: ['背房贷'] })
      }
    } else if (id.startsWith('a_rent_')) {
      const monthly = id === 'a_rent_1000' ? 1000 : id === 'a_rent_2500' ? 2500 : 5000
      const yearly = monthly * 12
      next = { ...next, rent: { tier: String(monthly) as RentTier, yearlyRent: yearly }, logs: pushLog(next, `你租了房：¥${monthly}/月（年付${yearly}）。`) }
    } else if (id === 'a_rent_cancel') {
      next = { ...next, rent: { tier: 'none', yearlyRent: 0 }, logs: pushLog(next, '你退租了。') }
    } else if (id === 'a_skip') {
      next = { ...next, logs: pushLog(next, '你决定今年不折腾，先把日子过稳。') }
      next = applyDelta(next, { statsDelta: { health: +1 } })
    }

    shouldAutoScrollRef.current = true
    setGame(next)
    setShowAssets(false)
  }

  const canSchool =
    !!game?.alive &&
    (game?.age ?? 0) >= 6 &&
    !game?.yearFlags.schoolUsed &&
    game?.edu.stage !== 'dropped' &&
    game?.edu.stage !== 'graduated'

  const handleSchoolPick = (id: 'study' | 'social' | 'play') => {
    if (!game) return
    if (!canSchool) return
    const rng = makeRng(game.seed + game.year * 2027 + game.logs.length * 11)
    let next = { ...game, yearFlags: { ...game.yearFlags, schoolUsed: true } }

    if (next.edu.stage === 'none') {
      // 兜底：万一存档里没有自动解锁
      next = { ...next, edu: { ...next.edu, stage: 'primary', yearsInStage: 0 } }
    }

    if (id === 'study') {
      const inc = rng.nextInt(4, 9)
      next = applyDelta(next, { statsDelta: { smarts: +3 }, })
      next = { ...next, edu: { ...next.edu, score: clamp(next.edu.score + inc, 0, 100) }, logs: pushLog(next, `你去学校学习：预计成绩 +${inc}。`) }
    } else if (id === 'social') {
      const inc = rng.nextInt(2, 6)
      next = applyDelta(next, { statsDelta: { social: +3, beauty: +2 } })
      next = { ...next, edu: { ...next.edu, score: clamp(next.edu.score + inc, 0, 100) }, logs: pushLog(next, `你在学校社交：预计成绩 +${inc}。`) }
    } else if (id === 'play') {
      const inc = rng.nextInt(1, 3)
      next = applyDelta(next, { statsDelta: { health: +3 } })
      next = { ...next, edu: { ...next.edu, score: clamp(next.edu.score + inc, 0, 100) }, logs: pushLog(next, `你在操场活动：预计成绩 +${inc}。`) }
    }

    shouldAutoScrollRef.current = true
    setGame(next)
    setShowSchool(false)
  }

  const canNextYear = !!game?.alive && !!game?.currentEvent && game.currentEvent.resolved

  return (
    <div className="h-full flex flex-col px-4 pt-3 pb-3">
      <AppHeader
        title="寥寥一生"
        rightElement={
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(STORAGE_KEY)
              setGame(null)
            }}
            className="text-xs px-2 py-1 rounded-full bg-white/40 border border-white/40"
          >
            重开
          </button>
        }
      />

      {!game ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-full max-w-[360px] rounded-3xl bg-white/60 border border-white/50 shadow-ios p-5">
            <div className="text-lg font-bold text-gray-800 mb-1">寥寥一生</div>
            <div className="text-sm text-gray-500 mb-4">
              随机开局，事件直接出现在主页面；必须先做选择，才能点“下一年”。
            </div>
            <button
              type="button"
              onClick={startFresh}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold active:scale-[0.99]"
            >
              开始人生
            </button>
            <div className="text-[11px] text-gray-400 mt-3">
              提示：所有进度保存在本地浏览器，清理数据会丢档。
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-3xl bg-white/40 border border-white/40 shadow-ios p-4 mb-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-800">
                  {game.name} · {game.gender === 'male' ? '男' : '女'} · {game.age}岁
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  资金：<span className="font-semibold text-gray-700">{game.money}</span>
                  {game.children.length > 0 ? <span className="ml-2">孩子：{game.children.length}</span> : null}
                  {game.friends.length > 0 ? <span className="ml-2">朋友：{game.friends.length}</span> : null}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  城市：{game.currentCity?.name || game.birthCity?.name || '（未知）'}
                  <span className="ml-2">预计成绩：{Math.round(game.edu?.score ?? 0)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 justify-end max-w-[160px]">
                {statusBadges.map(b => (
                  <span
                    key={b.text}
                    className={`text-[10px] px-2 py-0.5 rounded-full border ${b.tone === 'warn' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white/60 border-white/60 text-gray-700'}`}
                  >
                    {b.text}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 mt-3">
              {(['health', 'beauty', 'smarts', 'social', 'luck'] as StatKey[]).map(k => (
                <div key={k} className="bg-white/50 rounded-2xl px-2 py-2 border border-white/50">
                  <div className="text-[10px] text-gray-500">{statLabel(k)}</div>
                  <div className="text-sm font-bold text-gray-800">{game.stats[k]}</div>
                  <div className="h-1 rounded-full bg-gray-200/60 overflow-hidden mt-1">
                    <div className={`h-full bg-gradient-to-r ${barColor(k)}`} style={{ width: `${clamp(game.stats[k], 0, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto scroll-container custom-scrollbar rounded-3xl bg-white/30 border border-white/40 shadow-ios px-4 py-4"
          >
            <div className="text-xs text-gray-500 mb-2">人生小记</div>
            <div className="space-y-2">
              {game.logs.map((line, idx) => (
                <div key={`${idx}-${line.slice(0, 20)}`} className="text-sm text-gray-800 leading-relaxed">
                  {line}
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-white/60">
              {!game.alive ? (
                <div className="rounded-2xl bg-black/5 border border-white/50 p-4">
                  <div className="text-sm font-bold text-gray-800">人生落幕</div>
                  <div className="text-xs text-gray-500 mt-1">你可以重开，或者回看这段人生。</div>
                </div>
              ) : (
                <div className="rounded-2xl bg-white/60 border border-white/60 p-4">
                  <div className="text-sm font-bold text-gray-800">{game.currentEvent?.title || '这一年'}</div>
                  <div className="text-sm text-gray-700 mt-2 leading-relaxed">
                    {game.currentEvent?.text || '……'}
                  </div>
                  <div className="mt-3 space-y-2">
                    {game.currentEvent?.options.map(o => (
                      <button
                        key={o.id}
                        type="button"
                        disabled={game.currentEvent?.resolved}
                        onClick={() => doPickOption(o.id)}
                        className={`w-full text-left px-3 py-2 rounded-xl border transition-colors ${
                          game.currentEvent?.resolved
                            ? (o.picked ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white/50 border-white/60 text-gray-400')
                            : 'bg-white/70 border-white/70 hover:bg-white active:bg-white'
                        }`}
                      >
                        <div className="text-sm font-medium">{o.text}</div>
                        {!game.currentEvent?.resolved ? (
                          <div className="text-[11px] text-gray-400 mt-0.5">点我做选择</div>
                        ) : (
                          <div className="text-[11px] mt-0.5">{o.picked ? '已选择' : '未选择'}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-3xl bg-white/40 border border-white/40 shadow-ios px-3 py-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!game.alive) return
                  if (game.yearFlags.plazaUsed) return
                  setShowPlaza(true)
                }}
                disabled={!game.alive || game.yearFlags.plazaUsed}
                className="py-2 rounded-2xl bg-white/60 border border-white/60 text-sm font-semibold text-gray-800 disabled:opacity-50"
              >
                出门
                <div className="text-[10px] text-gray-400 font-normal">
                  {game.yearFlags.plazaUsed ? '本年已用' : '一年一次'}
                </div>
              </button>

              <button
                type="button"
                onClick={doNextYear}
                disabled={!canNextYear}
                className="py-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 text-white text-sm font-bold disabled:opacity-50"
              >
                下一年
                <div className="text-[10px] text-white/80 font-normal">
                  {game.currentEvent?.resolved ? '继续前进' : '先做选择'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setShowRelations(true)}
                className="py-2 rounded-2xl bg-white/60 border border-white/60 text-sm font-semibold text-gray-800"
              >
                关系
                <div className="text-[10px] text-gray-400 font-normal">
                  {game.partner ? '有伴侣' : '单身'}
                </div>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  if (!game.alive) return
                  if (game.yearFlags.assetUsed) return
                  setShowAssets(true)
                }}
                disabled={!game.alive || game.yearFlags.assetUsed}
                className="py-2 rounded-2xl bg-white/60 border border-white/60 text-sm font-semibold text-gray-800 disabled:opacity-50"
              >
                资产
                <div className="text-[10px] text-gray-400 font-normal">
                  {game.yearFlags.assetUsed ? '本年已用' : '一年一次'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!game.alive) return
                  if (!canSchool) return
                  setShowSchool(true)
                }}
                disabled={!game.alive || !canSchool}
                className="py-2 rounded-2xl bg-white/60 border border-white/60 text-sm font-semibold text-gray-800 disabled:opacity-50"
              >
                学校
                <div className="text-[10px] text-gray-400 font-normal">
                  {(game.age < 6) ? '6岁解锁' : (game.yearFlags.schoolUsed ? '本年已用' : '一年一次')}
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {showRelations && game && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[420px] rounded-t-3xl bg-white p-4 shadow-ios-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-gray-800">关系</div>
              <button type="button" onClick={() => setShowRelations(false)} className="text-sm text-gray-500">关闭</button>
            </div>

            <div className="space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3">
                <div className="text-xs text-gray-500 mb-1">父母</div>
                <div className="space-y-1">
                  {game.parents.map(p => (
                    <div key={p.id} className="text-sm text-gray-800">
                      {p.name} · {p.trait} · 亲密 {p.intimacy}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3">
                <div className="text-xs text-gray-500 mb-1">伴侣</div>
                {game.partner ? (
                  <div className="text-sm text-gray-800">
                    {game.partner.name} · {game.partner.trait} · 亲密 {game.partner.intimacy}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">暂无</div>
                )}
              </div>

              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3">
                <div className="text-xs text-gray-500 mb-1">孩子</div>
                {game.children.length > 0 ? (
                  <div className="space-y-1">
                    {game.children.map(c => (
                      <div key={c.id} className="text-sm text-gray-800">
                        {c.name} · {c.trait} · 亲密 {c.intimacy}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">暂无</div>
                )}
              </div>

              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3">
                <div className="text-xs text-gray-500 mb-1">朋友</div>
                {game.friends.length > 0 ? (
                  <div className="space-y-1">
                    {game.friends.slice(-12).map(f => (
                      <div key={f.id} className="text-sm text-gray-800">
                        {f.name} · {f.trait} · 亲密 {f.intimacy}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">暂无（可以“出门”试试）</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showPlaza && game && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[420px] rounded-t-3xl bg-white p-4 shadow-ios-lg max-h-[70vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-gray-800">广场（本年一次）</div>
              <button type="button" onClick={() => setShowPlaza(false)} className="text-sm text-gray-500">取消</button>
            </div>
            <div className="space-y-2">
              {plazaChoices.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handlePlazaPick(c.id)}
                  className="w-full text-left px-3 py-3 rounded-2xl bg-gray-50 border border-gray-100 active:bg-gray-100"
                >
                  <div className="text-sm font-semibold text-gray-800">{c.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{c.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSchool && game && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[420px] rounded-t-3xl bg-white p-4 shadow-ios-lg max-h-[70vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-gray-800">学校（本年一次）</div>
              <button type="button" onClick={() => setShowSchool(false)} className="text-sm text-gray-500">取消</button>
            </div>

            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 mb-3">
              <div className="text-xs text-gray-500">预计成绩</div>
              <div className="text-lg font-bold text-gray-800 mt-1">{Math.round(game.edu.score)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {game.edu.stage === 'primary' ? '小学' :
                  game.edu.stage === 'middle_public' ? '初中（公立）' :
                    game.edu.stage === 'middle_private' ? '初中（私立）' :
                      game.edu.stage === 'high_public' ? '高中（公立）' :
                        game.edu.stage === 'high_private' ? '高中（私立）' :
                          game.edu.stage === 'uni' ? '大学' :
                            game.edu.stage === 'dropped' ? '已辍学' : '未入学'}
              </div>
            </div>

            <div className="space-y-2">
              <button type="button" onClick={() => handleSchoolPick('study')}
                className="w-full text-left px-3 py-3 rounded-2xl bg-gray-50 border border-gray-100 active:bg-gray-100">
                <div className="text-sm font-semibold text-gray-800">学习</div>
                <div className="text-xs text-gray-500 mt-0.5">增加智慧，提升预计成绩</div>
              </button>
              <button type="button" onClick={() => handleSchoolPick('social')}
                className="w-full text-left px-3 py-3 rounded-2xl bg-gray-50 border border-gray-100 active:bg-gray-100">
                <div className="text-sm font-semibold text-gray-800">社交</div>
                <div className="text-xs text-gray-500 mt-0.5">增加社交/颜值，预计成绩也会小涨</div>
              </button>
              <button type="button" onClick={() => handleSchoolPick('play')}
                className="w-full text-left px-3 py-3 rounded-2xl bg-gray-50 border border-gray-100 active:bg-gray-100">
                <div className="text-sm font-semibold text-gray-800">操场</div>
                <div className="text-xs text-gray-500 mt-0.5">增加健康，预计成绩小涨</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssets && game && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="w-full max-w-[420px] rounded-t-3xl bg-white p-4 shadow-ios-lg max-h-[70vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-gray-800">资产（本年一次）</div>
              <button type="button" onClick={() => setShowAssets(false)} className="text-sm text-gray-500">取消</button>
            </div>

            <div className="rounded-2xl bg-gray-50 border border-gray-100 p-3 mb-3">
              <div className="text-xs text-gray-500">当前资产</div>
              <div className="text-sm text-gray-800 mt-1">
                房：{game.house.level === 'none' ? '无' : game.house.level === 'small' ? '小房' : game.house.level === 'mid' ? '中房' : '大房'}
                {game.house.level !== 'none' ? (
                  <span className="ml-2 text-xs text-gray-500">
                    房贷剩 {game.house.mortgageLeft} 年 · 年供 {game.house.yearlyPay}
                  </span>
                ) : null}
              </div>
              <div className="text-sm text-gray-800 mt-1">现金：{game.money}</div>
              {game.age >= 18 ? (
                <div className="text-sm text-gray-800 mt-1">
                  租：{game.rent.tier === 'none' ? '无' : `¥${game.rent.tier}/月（年付${game.rent.yearlyRent}）`}
                </div>
              ) : (
                <div className="text-xs text-gray-500 mt-1">18岁后才会出现租房/购房选项</div>
              )}
            </div>

            <div className="space-y-2">
              {assetChoices.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleAssetPick(c.id)}
                  className="w-full text-left px-3 py-3 rounded-2xl bg-gray-50 border border-gray-100 active:bg-gray-100"
                >
                  <div className="text-sm font-semibold text-gray-800">{c.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{c.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

