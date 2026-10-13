import type { Card, HandRank, Rank } from './types'

export const HAND_NAMES = [
  '高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺',
] as const

function compareNumbers(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return Math.sign(difference)
  }
  return 0
}

export function compareHandRanks(left: HandRank, right: HandRank): number {
  return compareNumbers(left.value, right.value)
}

function straightHigh(ranks: number[]): number | null {
  const unique = [...new Set(ranks)].sort((a, b) => b - a)
  if (unique.includes(14)) unique.push(1)
  for (let index = 0; index <= unique.length - 5; index += 1) {
    if (unique.slice(index, index + 5).every((rank, offset) => rank === unique[index] - offset)) {
      return unique[index]
    }
  }
  return null
}

export function evaluateFive(cards: Card[]): HandRank {
  if (cards.length !== 5) throw new Error('五张牌评估必须恰好传入 5 张牌')

  const sorted = [...cards].sort((a, b) => b.rank - a.rank)
  const ranks = sorted.map((card) => card.rank)
  const counts = new Map<Rank, number>()
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const flush = sorted.every((card) => card.suit === sorted[0].suit)
  const highStraight = straightHigh(ranks)

  let value: number[]
  if (flush && highStraight !== null) value = [8, highStraight]
  else if (groups[0][1] === 4) value = [7, groups[0][0], groups[1][0]]
  else if (groups[0][1] === 3 && groups[1][1] === 2) value = [6, groups[0][0], groups[1][0]]
  else if (flush) value = [5, ...ranks]
  else if (highStraight !== null) value = [4, highStraight]
  else if (groups[0][1] === 3) {
    value = [3, groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)]
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = groups.filter(([, count]) => count === 2).map(([rank]) => rank).sort((a, b) => b - a)
    const kicker = groups.find(([, count]) => count === 1)?.[0] ?? 0
    value = [2, pairs[0], pairs[1], kicker]
  } else if (groups[0][1] === 2) {
    value = [1, groups[0][0], ...groups.slice(1).map(([rank]) => rank).sort((a, b) => b - a)]
  } else value = [0, ...ranks]

  return { category: value[0], categoryName: HAND_NAMES[value[0]], value, cards: sorted }
}

function combinations<T>(items: T[], count: number): T[][] {
  const result: T[][] = []
  const choose = (start: number, chosen: T[]) => {
    if (chosen.length === count) {
      result.push(chosen)
      return
    }
    for (let index = start; index <= items.length - (count - chosen.length); index += 1) {
      choose(index + 1, [...chosen, items[index]])
    }
  }
  choose(0, [])
  return result
}

export function evaluateBestHand(cards: Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7) throw new Error('最佳牌型评估需要 5～7 张牌')
  let best: HandRank | null = null
  for (const candidate of combinations(cards, 5)) {
    const rank = evaluateFive(candidate)
    if (!best || compareHandRanks(rank, best) > 0) best = rank
  }
  return best!
}
