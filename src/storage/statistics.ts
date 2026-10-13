import type { GameState } from '../game'

export interface Statistics {
  handsPlayed: number
  handsWon: number
  showdowns: number
  totalProfit: number
  biggestPot: number
}

export const EMPTY_STATISTICS: Statistics = {
  handsPlayed: 0,
  handsWon: 0,
  showdowns: 0,
  totalProfit: 0,
  biggestPot: 0,
}

const KEY = 'river-ace:statistics:v1'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

export function loadStatistics(storage: StorageLike | undefined = globalThis.localStorage): Statistics {
  try {
    const saved = storage?.getItem(KEY)
    return saved ? { ...EMPTY_STATISTICS, ...JSON.parse(saved) } : { ...EMPTY_STATISTICS }
  } catch {
    return { ...EMPTY_STATISTICS }
  }
}

export function recordSettledHand(
  previous: Statistics,
  state: GameState,
  heroId = 'hero',
): Statistics {
  const hero = state.players.find((player) => player.id === heroId)
  if (!hero || state.phase !== 'SETTLEMENT') return previous
  const award = state.winners.find((winner) => winner.playerId === heroId)?.amount ?? 0
  const totalPot = state.pots.reduce((sum, pot) => sum + pot.amount, 0)
  const next = {
    handsPlayed: previous.handsPlayed + 1,
    handsWon: previous.handsWon + (award > 0 ? 1 : 0),
    showdowns: previous.showdowns + (state.communityCards.length === 5 && !hero.folded ? 1 : 0),
    totalProfit: previous.totalProfit + award - hero.totalContribution,
    biggestPot: Math.max(previous.biggestPot, totalPot),
  }
  return next
}

export function saveStatistics(stats: Statistics, storage: StorageLike | undefined = globalThis.localStorage): void {
  try { storage?.setItem(KEY, JSON.stringify(stats)) } catch { /* 保持当前会话可用 */ }
}

export function clearStatistics(storage: StorageLike | undefined = globalThis.localStorage): Statistics {
  try { storage?.removeItem?.(KEY) } catch { /* 保持当前会话可用 */ }
  return { ...EMPTY_STATISTICS }
}
