import type { Card } from '../game'

export function preflopStrength(cards: Card[], activePlayers: number, positionFactor = 0): number {
  if (cards.length !== 2) return 0
  const [high, low] = [...cards].sort((left, right) => right.rank - left.rank)
  const pair = high.rank === low.rank
  const suited = high.suit === low.suit
  const gap = high.rank - low.rank

  let score = (high.rank + low.rank) / 28
  if (pair) score = 0.48 + high.rank / 28
  else {
    if (suited) score += 0.07
    if (gap === 1) score += 0.06
    else if (gap === 2) score += 0.025
    else if (gap >= 5) score -= 0.08
    if (high.rank >= 13 && low.rank >= 10) score += 0.08
    if (low.rank < 6) score -= 0.04
  }
  score += positionFactor * 0.05
  score -= Math.max(0, activePlayers - 2) * 0.018
  return Math.max(0.04, Math.min(0.98, score))
}
