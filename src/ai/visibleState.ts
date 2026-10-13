import { getLegalActions, type BotPersonality, type Card, type GameState, type LegalActions, type Street } from '../game'

export interface VisibleOpponent {
  id: string
  seat: number
  chips: number
  streetContribution: number
  folded: boolean
  allIn: boolean
}

export interface BotView {
  playerId: string
  seat: number
  personality: BotPersonality
  holeCards: Card[]
  communityCards: Card[]
  phase: Street
  pot: number
  currentBet: number
  bigBlind: number
  dealerSeat: number
  playerCount: number
  opponents: VisibleOpponent[]
  legal: LegalActions
  chips: number
  streetContribution: number
  actionHistory: string[]
}

export function createBotView(state: GameState, seat = state.currentPlayerSeat): BotView {
  if (seat === null) throw new Error('当前没有行动玩家')
  const player = state.players.find((candidate) => candidate.seat === seat)
  if (!player || player.isHuman) throw new Error('只能为电脑玩家创建可见状态')
  return {
    playerId: player.id,
    seat: player.seat,
    personality: player.personality ?? 'balanced',
    holeCards: structuredClone(player.holeCards),
    communityCards: structuredClone(state.communityCards),
    phase: state.phase,
    pot: state.players.reduce((sum, candidate) => sum + candidate.totalContribution, 0),
    currentBet: state.currentBet,
    bigBlind: state.config.bigBlind,
    dealerSeat: state.dealerSeat,
    playerCount: state.players.length,
    opponents: state.players
      .filter((candidate) => candidate.id !== player.id)
      .map((candidate) => ({
        id: candidate.id,
        seat: candidate.seat,
        chips: candidate.chips,
        streetContribution: candidate.streetContribution,
        folded: candidate.folded,
        allIn: candidate.allIn,
      })),
    legal: getLegalActions(state, seat),
    chips: player.chips,
    streetContribution: player.streetContribution,
    actionHistory: [...state.actionHistory],
  }
}
