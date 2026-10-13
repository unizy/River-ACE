import type { GameState, LegalActions, PlayerState } from './types'

export function amountToCall(state: GameState, player: PlayerState): number {
  return Math.max(0, state.currentBet - player.streetContribution)
}

export function getLegalActions(state: GameState, seat = state.currentPlayerSeat): LegalActions {
  const empty: LegalActions = { actions: [], toCall: 0, minBet: null, minRaiseTo: null, maxTo: 0 }
  if (seat === null || seat !== state.currentPlayerSeat) return empty
  const player = state.players.find((candidate) => candidate.seat === seat)
  if (!player || player.folded || player.allIn || !['PREFLOP', 'FLOP', 'TURN', 'RIVER'].includes(state.phase)) {
    return empty
  }

  const toCall = amountToCall(state, player)
  const maxTo = player.streetContribution + player.chips
  const actions: LegalActions['actions'] = ['fold']
  if (toCall === 0) actions.push('check')
  else actions.push('call')

  let minBet: number | null = null
  let minRaiseTo: number | null = null
  if (state.currentBet === 0 && player.chips >= state.config.bigBlind) {
    minBet = state.config.bigBlind
    actions.push('bet')
  } else if (
    state.currentBet > 0 &&
    player.raiseRights &&
    maxTo >= state.currentBet + state.lastFullRaiseSize
  ) {
    minRaiseTo = state.currentBet + state.lastFullRaiseSize
    actions.push('raise')
  }

  if (player.chips > 0 && (maxTo <= state.currentBet || player.raiseRights)) actions.push('allIn')
  return { actions, toCall, minBet, minRaiseTo, maxTo }
}
