import { describe, expect, it } from 'vitest'
import { parseCard } from './cards'
import { evaluateBestHand } from './handEvaluator'
import { buildPots, settlePots } from './pots'
import type { PlayerState } from './types'

function player(id: string, seat: number, contribution: number, folded = false): PlayerState {
  return {
    id, name: id, seat, chips: 0, holeCards: [], streetContribution: 0,
    totalContribution: contribution, folded, allIn: true, acted: true,
    raiseRights: false, isHuman: false,
  }
}

const hand = (value: string) => evaluateBestHand(value.split(' ').map(parseCard))

describe('主池与边池', () => {
  it('按投入层级拆分多个底池，保留弃牌玩家的筹码', () => {
    const pots = buildPots([
      player('A', 0, 100), player('B', 1, 300), player('C', 2, 500), player('D', 3, 500, true),
    ])
    expect(pots.map((pot) => pot.amount)).toEqual([400, 600, 400])
    expect(pots[0].eligiblePlayerIds).toEqual(['A', 'B', 'C'])
    expect(pots[2].eligiblePlayerIds).toEqual(['C'])
  })

  it('不同玩家可分别赢得主池和边池', () => {
    const players = [player('A', 0, 100), player('B', 1, 300), player('C', 2, 300)]
    const ranks = new Map([
      ['A', hand('AS AD AC KH KD 2C 3D')],
      ['B', hand('QS QD 9C 8H 7S 2D 3C')],
      ['C', hand('JS 10S 9S 8S 7S 2H 3H')],
    ])
    const pots = settlePots(players, ranks, 2)
    expect(pots[0].awards).toEqual({ C: 300 })
    expect(pots[1].awards).toEqual({ C: 400 })
  })

  it('平分底池，并把零头给庄家左侧最先出现的赢家', () => {
    const players = [player('A', 0, 5), player('B', 1, 5), player('C', 2, 5, true)]
    const tied = hand('AS KS QS JS 10S 2D 3C')
    const pots = settlePots(players, new Map([['A', tied], ['B', tied]]), 0)
    expect(pots[0].awards).toEqual({ B: 8, A: 7 })
  })
})
