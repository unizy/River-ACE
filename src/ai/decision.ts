import type { PlayerAction, RandomSource } from '../game'
import { estimateEquity } from './equity'
import { PERSONALITIES } from './personalities'
import { preflopStrength } from './preflopTable'
import type { BotView } from './visibleState'

export type AiDifficulty = 'easy' | 'normal' | 'hard'

export interface DecisionResult {
  action: PlayerAction
  equity: number
  potOdds: number
  reason: string
}

const simulationsByDifficulty: Record<AiDifficulty, number> = { easy: 35, normal: 90, hard: 180 }

function positionFactor(view: BotView): number {
  const distance = (view.seat - view.dealerSeat + view.playerCount) % view.playerCount
  return 1 - distance / Math.max(1, view.playerCount - 1)
}

function roundedAmount(value: number, blind: number): number {
  return Math.max(blind, Math.round(value / blind) * blind)
}

function aggressiveAction(view: BotView, fraction: number): PlayerAction | null {
  const { legal } = view
  if (legal.actions.includes('bet')) {
    const target = Math.min(legal.maxTo, Math.max(legal.minBet!, roundedAmount(view.pot * fraction, view.bigBlind)))
    return { type: 'bet', amount: target }
  }
  if (legal.actions.includes('raise')) {
    const target = Math.min(
      legal.maxTo,
      Math.max(legal.minRaiseTo!, view.currentBet + roundedAmount(view.pot * fraction, view.bigBlind)),
    )
    return { type: 'raise', amount: target }
  }
  return null
}

export function decideBotAction(
  view: BotView,
  difficulty: AiDifficulty,
  random: RandomSource = Math.random,
): DecisionResult {
  const activeOpponents = view.opponents.filter((opponent) => !opponent.folded).length
  const equity = view.phase === 'PREFLOP'
    ? preflopStrength(view.holeCards, activeOpponents + 1, positionFactor(view))
    : estimateEquity(
      view.holeCards,
      view.communityCards,
      activeOpponents,
      simulationsByDifficulty[difficulty],
      random,
    )
  const potOdds = view.legal.toCall > 0 ? view.legal.toCall / (view.pot + view.legal.toCall) : 0
  const profile = PERSONALITIES[view.personality]
  const noise = difficulty === 'easy' ? (random() - 0.5) * 0.18 : difficulty === 'normal' ? (random() - 0.5) * 0.07 : 0
  const edge = equity + profile.callBias + noise - potOdds
  const bluff = random() < profile.bluffChance

  if ((edge >= profile.raiseThreshold || bluff) && random() < profile.aggression) {
    const fraction = equity > 0.72 ? 0.75 : equity > 0.55 ? 0.5 : 1 / 3
    const aggression = aggressiveAction(view, fraction)
    if (aggression) return { action: aggression, equity, potOdds, reason: bluff ? '位置性诈唬' : '牌力领先' }
  }

  if (view.legal.toCall > 0) {
    const pressure = view.legal.toCall / Math.max(1, view.chips + view.legal.toCall)
    if (edge < profile.foldThreshold || (pressure > 0.55 && equity < 0.62 && profile.id !== 'calling')) {
      return { action: { type: 'fold' }, equity, potOdds, reason: '胜率不足以覆盖底池赔率' }
    }
    return { action: { type: 'call' }, equity, potOdds, reason: '胜率达到跟注要求' }
  }

  if (view.legal.actions.includes('check')) {
    return { action: { type: 'check' }, equity, potOdds, reason: '控制底池' }
  }
  return { action: { type: view.legal.actions[0] ?? 'fold' } as PlayerAction, equity, potOdds, reason: '选择可用操作' }
}
