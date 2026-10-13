import { describe, expect, it } from 'vitest'
import { cardKey } from './cards'
import { seededRandom } from './deck'
import { createGame, performAction, startHand, totalChips } from './engine'
import { getLegalActions } from './legalActions'
import type { GameState, PlayerAction } from './types'

function gameWithChips(chips: number[]): GameState {
  return startHand(createGame(chips.map((stack, index) => ({
    id: `P${index}`, name: `P${index}`, chips: stack, isHuman: index === 0,
  }))), seededRandom(123))
}

describe('游戏状态机', () => {
  it('限制牌桌人数为 2～10 人', () => {
    expect(() => createGame([{ name: 'A' }])).toThrow('2～10')
    expect(() => createGame(Array.from({ length: 11 }, (_, index) => ({ name: `${index}` })))).toThrow('2～10')
    expect(createGame(Array.from({ length: 10 }, (_, index) => ({ name: `${index}` }))).players).toHaveLength(10)
  })

  it('单挑时庄家支付小盲且翻牌前先行动，翻牌后大盲先行动', () => {
    let state = gameWithChips([2000, 2000])
    expect(state.dealerSeat).toBe(0)
    expect(state.smallBlindSeat).toBe(0)
    expect(state.bigBlindSeat).toBe(1)
    expect(state.currentPlayerSeat).toBe(0)
    state = performAction(state, 0, { type: 'call' })
    state = performAction(state, 1, { type: 'check' })
    expect(state.phase).toBe('FLOP')
    expect(state.currentPlayerSeat).toBe(1)
  })

  it('完整加注更新最低加注目标', () => {
    let state = gameWithChips([1000, 1000, 1000])
    expect(getLegalActions(state).minRaiseTo).toBe(40)
    state = performAction(state, 0, { type: 'raise', amount: 60 })
    expect(state.lastFullRaiseSize).toBe(40)
    expect(getLegalActions(state).minRaiseTo).toBe(100)
  })

  it('短码全下有效，但不会向已经行动的玩家重新开放加注权', () => {
    let state = gameWithChips([1000, 1000, 50])
    state = performAction(state, 0, { type: 'raise', amount: 40 })
    state = performAction(state, 1, { type: 'call' })
    state = performAction(state, 2, { type: 'allIn' })
    expect(state.currentBet).toBe(50)
    expect(state.currentPlayerSeat).toBe(0)
    expect(getLegalActions(state).actions).toContain('call')
    expect(getLegalActions(state).actions).not.toContain('raise')
    expect(getLegalActions(state).actions).not.toContain('allIn')
  })

  it('只剩一人时立即结束，不再发公共牌', () => {
    let state = gameWithChips([1000, 1000, 1000])
    state = performAction(state, 0, { type: 'fold' })
    state = performAction(state, 1, { type: 'fold' })
    expect(state.phase).toBe('SETTLEMENT')
    expect(state.communityCards).toHaveLength(0)
    expect(state.winners[0].playerId).toBe('P2')
    expect(totalChips(state)).toBe(3000)
  })

  it('所有剩余玩家全下后自动发完公共牌并结算', () => {
    let state = gameWithChips([20, 20])
    state = performAction(state, 0, { type: 'allIn' })
    expect(state.phase).toBe('SETTLEMENT')
    expect(state.communityCards).toHaveLength(5)
    expect(totalChips(state)).toBe(40)
  })
})

function chooseAction(state: GameState, random: () => number): PlayerAction {
  const legal = getLegalActions(state)
  const roll = random()
  if (legal.actions.includes('raise') && roll < 0.07) return { type: 'raise', amount: legal.minRaiseTo! }
  if (legal.actions.includes('bet') && roll < 0.12) return { type: 'bet', amount: legal.minBet! }
  if (legal.actions.includes('allIn') && roll < 0.025) return { type: 'allIn' }
  if (legal.actions.includes('check')) return { type: 'check' }
  if (legal.actions.includes('call') && roll < 0.88) return { type: 'call' }
  return { type: 'fold' }
}

describe('随机稳定性', () => {
  it('自动运行一万局且始终守恒、无重复牌、无负筹码并能结束', () => {
    const random = seededRandom(20261012)
    for (let hand = 0; hand < 10_000; hand += 1) {
      const playerCount = 2 + Math.floor(random() * 9)
      const stacks = Array.from({ length: playerCount }, () => 100 + Math.floor(random() * 1901))
      const expectedChips = stacks.reduce((sum, stack) => sum + stack, 0)
      let state = startHand(createGame(stacks.map((chips, index) => ({
        id: `${index}`, name: `${index}`, chips,
      }))), random)
      let actions = 0
      while (state.phase !== 'SETTLEMENT' && actions < 300) {
        expect(totalChips(state)).toBe(expectedChips)
        expect(state.players.every((player) => player.chips >= 0)).toBe(true)
        state = performAction(state, state.currentPlayerSeat!, chooseAction(state, random))
        actions += 1
      }
      expect(actions).toBeLessThan(300)
      expect(state.phase).toBe('SETTLEMENT')
      expect(totalChips(state)).toBe(expectedChips)
      const allCards = [...state.communityCards, ...state.players.flatMap((player) => player.holeCards)]
      expect(new Set(allCards.map(cardKey)).size).toBe(allCards.length)
      expect(state.players.every((player) => player.chips >= 0)).toBe(true)
      expect(state.pots.every((pot) => pot.winners.every((id) => pot.eligiblePlayerIds.includes(id)))).toBe(true)
    }
  }, 120_000)
})
