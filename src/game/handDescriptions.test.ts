import { describe, expect, it } from 'vitest'
import { parseCard } from './cards'
import { createGame } from './engine'
import { buildShowdownComparisons, buildWinnerExplanations, describeHand } from './handDescriptions'
import { evaluateBestHand } from './handEvaluator'

const cards = (value: string) => value.split(' ').map(parseCard)

describe('获胜牌型说明', () => {
  it('准确描述最大五张牌', () => {
    expect(describeHand(evaluateBestHand(cards('AS KS QS JS 10S 2D 3C')))).toBe('皇家同花顺（A-K-Q-J-10）')
    expect(describeHand(evaluateBestHand(cards('AH AD AC 7S 7D 2C 3C')))).toContain('A 三条带 7 对子组成葫芦')
    expect(describeHand(evaluateBestHand(cards('AH AD KC KD 9S 2C 3C')))).toBe('A 和 K 两对，9 踢脚')
  })

  it('说明胜者牌型为何领先次强玩家', () => {
    const state = createGame([{ id: 'hero', name: '你' }, { id: 'bot', name: '电脑' }])
    state.phase = 'SETTLEMENT'
    state.communityCards = cards('AS 7D 7C 2H 3S')
    state.players[0].holeCards = cards('AH AD')
    state.players[1].holeCards = cards('KH KD')
    const winningHand = evaluateBestHand([...state.players[0].holeCards, ...state.communityCards])
    state.pots = [{ amount: 100, eligiblePlayerIds: ['hero', 'bot'], winners: ['hero'], awards: { hero: 100 } }]
    state.winners = [{ playerId: 'hero', amount: 100, hand: winningHand }]
    const [explanation] = buildWinnerExplanations(state)
    expect(explanation.categoryName).toBe('葫芦')
    expect(explanation.bestCards).toHaveLength(5)
    expect(explanation.reason).toContain('牌型级别高于')
    expect(explanation.description).toContain('A 三条带 7 对子')

    const comparison = buildShowdownComparisons(state)
    expect(comparison).toHaveLength(2)
    expect(comparison.map((result) => [result.playerId, result.isWinner, result.categoryName])).toEqual([
      ['hero', true, '葫芦'],
      ['bot', false, '两对'],
    ])
    expect(comparison[1].bestCards).toHaveLength(5)
    expect(comparison[1].reason).toContain('牌型级别高于')
  })

  it('弃牌获胜时明确说明无需摊牌', () => {
    const state = createGame([{ id: 'hero', name: '你' }, { id: 'bot', name: '电脑' }])
    state.phase = 'SETTLEMENT'
    state.pots = [{ amount: 30, eligiblePlayerIds: ['hero'], winners: ['hero'], awards: { hero: 30 } }]
    state.winners = [{ playerId: 'hero', amount: 30 }]
    expect(buildWinnerExplanations(state)[0].reason).toContain('无需公开底牌')
  })
})
