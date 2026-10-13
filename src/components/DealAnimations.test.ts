import { describe, expect, it } from 'vitest'
import { createGame, seededRandom, startHand } from '../game'
import { holeCardDelay, holeDealDuration } from './DealAnimations'

function startedGame(playerCount: number) {
  return startHand(createGame(Array.from({ length: playerCount }, (_, index) => ({
    id: `P${index}`,
    name: `P${index}`,
  }))), seededRandom(42))
}

describe('发牌动画顺序', () => {
  it('多人桌从小盲开始，按顺时针发完第一轮再发第二轮', () => {
    const game = startedGame(3)
    expect(game.smallBlindSeat).toBe(1)
    expect(holeCardDelay(game, 1, 0)).toBe(0)
    expect(holeCardDelay(game, 2, 0)).toBe(105)
    expect(holeCardDelay(game, 0, 0)).toBe(210)
    expect(holeCardDelay(game, 1, 1)).toBe(315)
  })

  it('双人桌由庄家先收牌，并给最后一张牌留足落位时间', () => {
    const game = startedGame(2)
    expect(holeCardDelay(game, game.dealerSeat, 0)).toBe(0)
    expect(holeCardDelay(game, game.bigBlindSeat!, 0)).toBe(105)
    expect(holeCardDelay(game, game.dealerSeat, 1)).toBe(210)
    expect(holeDealDuration(game)).toBe(1220)
  })

  it('十人桌完整发出二十张底牌后才解锁行动', () => {
    expect(holeDealDuration(startedGame(10))).toBe(2900)
  })
})
