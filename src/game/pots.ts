import { compareHandRanks } from './handEvaluator'
import type { HandRank, PlayerState, Pot } from './types'

export function buildPots(players: PlayerState[]): Pot[] {
  const levels = [...new Set(players.map((player) => player.totalContribution).filter((amount) => amount > 0))]
    .sort((a, b) => a - b)
  let previous = 0
  const pots: Pot[] = []

  for (const level of levels) {
    const contributors = players.filter((player) => player.totalContribution >= level)
    const amount = (level - previous) * contributors.length
    if (amount > 0) {
      pots.push({
        amount,
        eligiblePlayerIds: contributors.filter((player) => !player.folded).map((player) => player.id),
        winners: [],
        awards: {},
      })
    }
    previous = level
  }
  return pots
}

function clockwiseDistance(seat: number, dealerSeat: number, seatCount: number): number {
  const distance = (seat - dealerSeat + seatCount) % seatCount
  return distance === 0 ? seatCount : distance
}

export function settlePots(
  players: PlayerState[],
  ranks: Map<string, HandRank>,
  dealerSeat: number,
): Pot[] {
  const pots = buildPots(players)
  for (const pot of pots) {
    if (pot.eligiblePlayerIds.length === 0) throw new Error('底池没有符合资格的玩家')
    let winners = [...pot.eligiblePlayerIds]
    if (winners.length > 1) {
      winners = winners.filter((id) => {
        const rank = ranks.get(id)
        if (!rank) throw new Error(`缺少玩家 ${id} 的牌型结果`)
        return pot.eligiblePlayerIds.every((otherId) => {
          const otherRank = ranks.get(otherId)
          if (!otherRank) throw new Error(`缺少玩家 ${otherId} 的牌型结果`)
          return compareHandRanks(rank, otherRank) >= 0
        })
      })
    }

    const orderedWinners = winners.sort((leftId, rightId) => {
      const left = players.find((player) => player.id === leftId)!
      const right = players.find((player) => player.id === rightId)!
      return clockwiseDistance(left.seat, dealerSeat, players.length) -
        clockwiseDistance(right.seat, dealerSeat, players.length)
    })
    const share = Math.floor(pot.amount / orderedWinners.length)
    let remainder = pot.amount % orderedWinners.length
    for (const id of orderedWinners) {
      const award = share + (remainder > 0 ? 1 : 0)
      if (remainder > 0) remainder -= 1
      const player = players.find((candidate) => candidate.id === id)!
      player.chips += award
      pot.awards[id] = award
    }
    pot.winners = orderedWinners
  }
  return pots
}
