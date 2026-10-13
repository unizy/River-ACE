import type { GameState } from '../game'

export interface SavedHand {
  id: string
  playedAt: string
  handNumber: number
  playerCount: number
  pot: number
  heroProfit: number
  winnerNames: string[]
  log: string[]
}

const KEY = 'river-ace:history:v1'
const MAX_HANDS = 50

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

export function loadHandHistory(storage: StorageLike | undefined = globalThis.localStorage): SavedHand[] {
  try {
    const saved = storage?.getItem(KEY)
    return saved ? (JSON.parse(saved) as SavedHand[]) : []
  } catch {
    return []
  }
}

export function createSavedHand(state: GameState, heroId = 'hero'): SavedHand {
  const hero = state.players.find((player) => player.id === heroId)!
  const award = state.winners.find((winner) => winner.playerId === heroId)?.amount ?? 0
  return {
    id: `${Date.now()}-${state.handNumber}`,
    playedAt: new Date().toISOString(),
    handNumber: state.handNumber,
    playerCount: state.players.length,
    pot: state.pots.reduce((sum, pot) => sum + pot.amount, 0),
    heroProfit: award - hero.totalContribution,
    winnerNames: state.winners.map((winner) => state.players.find((player) => player.id === winner.playerId)?.name ?? winner.playerId),
    log: [...state.actionHistory],
  }
}

export function prependHand(
  hand: SavedHand,
  previous: SavedHand[],
  storage: StorageLike | undefined = globalThis.localStorage,
): SavedHand[] {
  const next = [hand, ...previous].slice(0, MAX_HANDS)
  try { storage?.setItem(KEY, JSON.stringify(next)) } catch { /* 保持当前会话可用 */ }
  return next
}

export function clearHandHistory(storage: StorageLike | undefined = globalThis.localStorage): SavedHand[] {
  try { storage?.removeItem?.(KEY) } catch { /* 保持当前会话可用 */ }
  return []
}

export function historyAsText(history: SavedHand[]): string {
  return history.map((hand) => [
    `River Ace · ${new Date(hand.playedAt).toLocaleString()} · ${hand.playerCount} 人桌`,
    `底池 ${hand.pot} · 你的盈亏 ${hand.heroProfit >= 0 ? '+' : ''}${hand.heroProfit} · 获胜者 ${hand.winnerNames.join('、')}`,
    ...hand.log,
  ].join('\n')).join('\n\n--------------------\n\n')
}
