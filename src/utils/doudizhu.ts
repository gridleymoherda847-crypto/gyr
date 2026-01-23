// 斗地主规则引擎

// 牌的花色
export type Suit = 'spade' | 'heart' | 'club' | 'diamond' | 'joker'

// 单张牌
export type Card = {
  id: string
  suit: Suit
  rank: number // 3-15 (3-10, J=11, Q=12, K=13, A=14, 2=15), 小王=16, 大王=17
  display: string // 显示的文字
}

// 牌型
export type HandType =
  | 'single'       // 单张
  | 'pair'         // 对子
  | 'triple'       // 三张
  | 'triple_one'   // 三带一
  | 'triple_two'   // 三带二
  | 'straight'     // 顺子（至少5张）
  | 'pair_straight' // 连对（至少3对）
  | 'plane'        // 飞机不带
  | 'plane_single' // 飞机带单
  | 'plane_pair'   // 飞机带对
  | 'four_two'     // 四带二（单）
  | 'four_four'    // 四带二（对）
  | 'bomb'         // 炸弹
  | 'rocket'       // 火箭（王炸）
  | 'invalid'      // 无效牌型

// 出牌结果
export type PlayResult = {
  type: HandType
  mainRank: number // 主牌点数（用于比较大小）
  cards: Card[]
  length?: number // 顺子/连对/飞机的长度
}

// 花色符号
export const SUIT_SYMBOLS: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
  joker: '🃏'
}

// 花色颜色
export const SUIT_COLORS: Record<Suit, string> = {
  spade: '#000',
  heart: '#e53935',
  club: '#000',
  diamond: '#e53935',
  joker: '#9c27b0'
}

// 点数显示
const RANK_DISPLAY: Record<number, string> = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王'
}

// 创建一副牌（54张）
export function createDeck(): Card[] {
  const deck: Card[] = []
  const suits: Suit[] = ['spade', 'heart', 'club', 'diamond']
  
  // 普通牌 3-2
  for (const suit of suits) {
    for (let rank = 3; rank <= 15; rank++) {
      deck.push({
        id: `${suit}-${rank}`,
        suit,
        rank,
        display: RANK_DISPLAY[rank]
      })
    }
  }
  
  // 大小王
  deck.push({ id: 'joker-small', suit: 'joker', rank: 16, display: '小王' })
  deck.push({ id: 'joker-big', suit: 'joker', rank: 17, display: '大王' })
  
  return deck
}

// 洗牌
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// 发牌：返回三个玩家的手牌和底牌
export function dealCards(): { hands: Card[][]; dizhu: Card[] } {
  const deck = shuffleDeck(createDeck())
  return {
    hands: [
      sortCards(deck.slice(0, 17)),
      sortCards(deck.slice(17, 34)),
      sortCards(deck.slice(34, 51))
    ],
    dizhu: deck.slice(51, 54)
  }
}

// 排序手牌（从大到小）
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank
    const suitOrder: Suit[] = ['spade', 'heart', 'club', 'diamond', 'joker']
    return suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit)
  })
}

// 统计每个点数的牌数量
function countRanks(cards: Card[]): Map<number, number> {
  const counts = new Map<number, number>()
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) || 0) + 1)
  }
  return counts
}

// 检查是否是顺子
function isStraight(ranks: number[]): boolean {
  if (ranks.length < 5) return false
  const sorted = [...ranks].sort((a, b) => a - b)
  // 顺子不能包含2和王
  if (sorted.some(r => r >= 15)) return false
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] !== 1) return false
  }
  return true
}

// 识别牌型
export function analyzeHand(cards: Card[]): PlayResult {
  if (cards.length === 0) {
    return { type: 'invalid', mainRank: 0, cards }
  }
  
  const counts = countRanks(cards)
  const ranks = cards.map(c => c.rank)
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b)
  
  // 按数量分组
  const groups: { rank: number; count: number }[] = []
  counts.forEach((count, rank) => {
    groups.push({ rank, count })
  })
  groups.sort((a, b) => b.count - a.count || b.rank - a.rank)
  
  // 火箭（王炸）
  if (cards.length === 2 && counts.get(16) === 1 && counts.get(17) === 1) {
    return { type: 'rocket', mainRank: 17, cards }
  }
  
  // 炸弹
  if (cards.length === 4 && groups[0].count === 4) {
    return { type: 'bomb', mainRank: groups[0].rank, cards }
  }
  
  // 单张
  if (cards.length === 1) {
    return { type: 'single', mainRank: cards[0].rank, cards }
  }
  
  // 对子
  if (cards.length === 2 && groups[0].count === 2) {
    return { type: 'pair', mainRank: groups[0].rank, cards }
  }
  
  // 三张
  if (cards.length === 3 && groups[0].count === 3) {
    return { type: 'triple', mainRank: groups[0].rank, cards }
  }
  
  // 三带一
  if (cards.length === 4 && groups[0].count === 3) {
    return { type: 'triple_one', mainRank: groups[0].rank, cards }
  }
  
  // 三带二
  if (cards.length === 5 && groups[0].count === 3 && groups[1]?.count === 2) {
    return { type: 'triple_two', mainRank: groups[0].rank, cards }
  }
  
  // 顺子
  if (cards.length >= 5 && groups.every(g => g.count === 1) && isStraight(ranks)) {
    return { type: 'straight', mainRank: Math.max(...ranks), cards, length: cards.length }
  }
  
  // 连对
  if (cards.length >= 6 && cards.length % 2 === 0 && groups.every(g => g.count === 2)) {
    const pairRanks = uniqueRanks
    if (pairRanks.length >= 3 && !pairRanks.some(r => r >= 15)) {
      let isConsecutive = true
      for (let i = 1; i < pairRanks.length; i++) {
        if (pairRanks[i] - pairRanks[i - 1] !== 1) {
          isConsecutive = false
          break
        }
      }
      if (isConsecutive) {
        return { type: 'pair_straight', mainRank: Math.max(...pairRanks), cards, length: pairRanks.length }
      }
    }
  }
  
  // 飞机（连续的三张）
  const triples = groups.filter(g => g.count >= 3).map(g => g.rank).filter(r => r < 15).sort((a, b) => a - b)
  if (triples.length >= 2) {
    // 找最长的连续三张
    let maxStart = 0, maxLen = 1, curStart = 0, curLen = 1
    for (let i = 1; i < triples.length; i++) {
      if (triples[i] - triples[i - 1] === 1) {
        curLen++
        if (curLen > maxLen) {
          maxLen = curLen
          maxStart = curStart
        }
      } else {
        curStart = i
        curLen = 1
      }
    }
    
    if (maxLen >= 2) {
      const planeRanks = triples.slice(maxStart, maxStart + maxLen)
      const planeCards = maxLen * 3
      const extraCards = cards.length - planeCards
      
      // 飞机不带
      if (extraCards === 0) {
        return { type: 'plane', mainRank: Math.max(...planeRanks), cards, length: maxLen }
      }
      
      // 飞机带单
      if (extraCards === maxLen) {
        return { type: 'plane_single', mainRank: Math.max(...planeRanks), cards, length: maxLen }
      }
      
      // 飞机带对
      if (extraCards === maxLen * 2) {
        const nonPlaneCards = groups.filter(g => !planeRanks.includes(g.rank) || g.count > 3)
        const pairs = nonPlaneCards.filter(g => g.count >= 2)
        if (pairs.length >= maxLen) {
          return { type: 'plane_pair', mainRank: Math.max(...planeRanks), cards, length: maxLen }
        }
      }
    }
  }
  
  // 四带二（单）
  if (cards.length === 6 && groups[0].count === 4) {
    return { type: 'four_two', mainRank: groups[0].rank, cards }
  }
  
  // 四带二（对）
  if (cards.length === 8 && groups[0].count === 4 && groups.slice(1).every(g => g.count === 2)) {
    return { type: 'four_four', mainRank: groups[0].rank, cards }
  }
  
  return { type: 'invalid', mainRank: 0, cards }
}

// 比较两手牌的大小，返回 true 表示 play 能打过 lastPlay
export function canBeat(play: PlayResult, lastPlay: PlayResult | null): boolean {
  // 没有上家出牌，任何有效牌型都可以出
  if (!lastPlay) {
    return play.type !== 'invalid'
  }
  
  // 火箭最大
  if (play.type === 'rocket') return true
  if (lastPlay.type === 'rocket') return false
  
  // 炸弹能打非炸弹
  if (play.type === 'bomb' && lastPlay.type !== 'bomb') return true
  if (lastPlay.type === 'bomb' && play.type !== 'bomb') return false
  
  // 炸弹比大小
  if (play.type === 'bomb' && lastPlay.type === 'bomb') {
    return play.mainRank > lastPlay.mainRank
  }
  
  // 牌型必须相同
  if (play.type !== lastPlay.type) return false
  
  // 顺子/连对/飞机长度必须相同
  if (play.length !== undefined && lastPlay.length !== undefined) {
    if (play.length !== lastPlay.length) return false
  }
  
  // 比较主牌大小
  return play.mainRank > lastPlay.mainRank
}

// AI：找出所有可以打过上家的牌组合
export function findValidPlays(hand: Card[], lastPlay: PlayResult | null): Card[][] {
  const validPlays: Card[][] = []
  const counts = countRanks(hand)
  
  // 如果没有上家出牌，需要返回所有可能的牌型
  // 为了简化，我们只返回一些基本的出牌选择
  
  if (!lastPlay) {
    // 单张
    const ranks = [...new Set(hand.map(c => c.rank))].sort((a, b) => a - b)
    for (const rank of ranks) {
      const card = hand.find(c => c.rank === rank)
      if (card) validPlays.push([card])
    }
    
    // 对子
    counts.forEach((count, rank) => {
      if (count >= 2) {
        const cards = hand.filter(c => c.rank === rank).slice(0, 2)
        validPlays.push(cards)
      }
    })
    
    // 三张
    counts.forEach((count, rank) => {
      if (count >= 3) {
        const cards = hand.filter(c => c.rank === rank).slice(0, 3)
        validPlays.push(cards)
      }
    })
    
    // 炸弹
    counts.forEach((count, rank) => {
      if (count === 4) {
        const cards = hand.filter(c => c.rank === rank)
        validPlays.push(cards)
      }
    })
    
    // 火箭
    if (counts.get(16) && counts.get(17)) {
      validPlays.push(hand.filter(c => c.rank >= 16))
    }
    
    return validPlays
  }
  
  // 根据上家牌型找对应的更大的牌
  switch (lastPlay.type) {
    case 'single':
      for (const card of hand) {
        if (card.rank > lastPlay.mainRank) {
          validPlays.push([card])
        }
      }
      break
      
    case 'pair':
      counts.forEach((count, rank) => {
        if (count >= 2 && rank > lastPlay.mainRank) {
          validPlays.push(hand.filter(c => c.rank === rank).slice(0, 2))
        }
      })
      break
      
    case 'triple':
      counts.forEach((count, rank) => {
        if (count >= 3 && rank > lastPlay.mainRank) {
          validPlays.push(hand.filter(c => c.rank === rank).slice(0, 3))
        }
      })
      break
      
    case 'triple_one':
      counts.forEach((count, rank) => {
        if (count >= 3 && rank > lastPlay.mainRank) {
          const triple = hand.filter(c => c.rank === rank).slice(0, 3)
          // 找一张单牌
          const single = hand.find(c => c.rank !== rank)
          if (single) {
            validPlays.push([...triple, single])
          }
        }
      })
      break
      
    case 'triple_two':
      counts.forEach((count, rank) => {
        if (count >= 3 && rank > lastPlay.mainRank) {
          const triple = hand.filter(c => c.rank === rank).slice(0, 3)
          // 找一对
          for (const [pairRank, pairCount] of counts) {
            if (pairCount >= 2 && pairRank !== rank) {
              validPlays.push([...triple, ...hand.filter(c => c.rank === pairRank).slice(0, 2)])
              break
            }
          }
        }
      })
      break
      
    case 'straight':
      if (lastPlay.length) {
        const len = lastPlay.length
        const maxRank = 14 // A
        for (let start = 3; start <= maxRank - len + 1; start++) {
          const endRank = start + len - 1
          if (endRank > lastPlay.mainRank && endRank <= 14) {
            const straightCards: Card[] = []
            let valid = true
            for (let r = start; r <= endRank; r++) {
              const card = hand.find(c => c.rank === r)
              if (card) {
                straightCards.push(card)
              } else {
                valid = false
                break
              }
            }
            if (valid && straightCards.length === len) {
              validPlays.push(straightCards)
            }
          }
        }
      }
      break
      
    case 'pair_straight':
      if (lastPlay.length) {
        const len = lastPlay.length
        for (let start = 3; start <= 14 - len + 1; start++) {
          const endRank = start + len - 1
          if (endRank > lastPlay.mainRank && endRank <= 14) {
            const pairCards: Card[] = []
            let valid = true
            for (let r = start; r <= endRank; r++) {
              const count = counts.get(r) || 0
              if (count >= 2) {
                pairCards.push(...hand.filter(c => c.rank === r).slice(0, 2))
              } else {
                valid = false
                break
              }
            }
            if (valid) {
              validPlays.push(pairCards)
            }
          }
        }
      }
      break
      
    case 'bomb':
      counts.forEach((count, rank) => {
        if (count === 4 && rank > lastPlay.mainRank) {
          validPlays.push(hand.filter(c => c.rank === rank))
        }
      })
      break
  }
  
  // 炸弹可以打任何非炸弹/非火箭
  if (lastPlay.type !== 'bomb' && lastPlay.type !== 'rocket') {
    counts.forEach((count, rank) => {
      if (count === 4) {
        validPlays.push(hand.filter(c => c.rank === rank))
      }
    })
  }
  
  // 火箭可以打任何牌
  if (counts.get(16) && counts.get(17)) {
    validPlays.push(hand.filter(c => c.rank >= 16))
  }
  
  return validPlays
}

// AI决策：选择要出的牌
export function aiDecide(
  hand: Card[], 
  lastPlay: PlayResult | null, 
  _isLandlord: boolean,
  difficulty: 'easy' | 'normal' | 'hard' = 'normal'
): Card[] | null {
  const validPlays = findValidPlays(hand, lastPlay)
  
  if (validPlays.length === 0) {
    return null // 不出
  }
  
  // 按牌型评估排序
  const scored = validPlays.map(cards => {
    const result = analyzeHand(cards)
    let score = 0
    
    // 基础分：优先出小牌
    score = 20 - result.mainRank
    
    // 炸弹/火箭要谨慎出
    if (result.type === 'bomb') score -= 50
    if (result.type === 'rocket') score -= 100
    
    // 手牌少时更激进
    if (hand.length <= 5) score += 10
    
    // 如果这把能出完，加分
    if (cards.length === hand.length) score += 200
    
    return { cards, score }
  })
  
  scored.sort((a, b) => b.score - a.score)
  
  // 根据难度决定是否不出
  if (lastPlay) {
    const passChance = difficulty === 'easy' ? 0.3 : difficulty === 'normal' ? 0.15 : 0.05
    if (Math.random() < passChance && scored[0].score < 0) {
      return null
    }
  }
  
  // 简单难度随机选
  if (difficulty === 'easy') {
    return scored[Math.floor(Math.random() * Math.min(3, scored.length))].cards
  }
  
  return scored[0].cards
}

// 计算叫地主的分数建议
export function evaluateHandForBidding(hand: Card[]): number {
  let score = 0
  const counts = countRanks(hand)
  
  // 大小王
  if (counts.get(17)) score += 8 // 大王
  if (counts.get(16)) score += 6 // 小王
  
  // 2
  score += (counts.get(15) || 0) * 3
  
  // A
  score += (counts.get(14) || 0) * 2
  
  // 炸弹
  counts.forEach((count) => {
    if (count === 4) score += 10
  })
  
  // 三张
  counts.forEach((count) => {
    if (count === 3) score += 3
  })
  
  return score
}
