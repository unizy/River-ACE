import { describe, expect, it } from 'vitest'
import { cardKey, createGame, getLegalActions, parseCard, performAction, seededRandom, startHand, totalChips } from '../game'
import { decideBotAction } from './decision'
import { estimateEquity } from './equity'
import { preflopStrength } from './preflopTable'
import { createBotView, type BotView } from './visibleState'

const cards = (value: string) => value.split(' ').map(parseCard)

describe('电脑玩家', () => {
  it('可见状态不包含牌堆或对手底牌', () => {
    const state = startHand(createGame([
      { id: 'bot-a', name: 'A', personality: 'balanced' },
      { id: 'bot-b', name: 'B', personality: 'tight' },
      { id: 'bot-c', name: 'C', personality: 'aggressive' },
    ]), seededRandom(4))
    const actingPlayer = state.players.find((player) => player.seat === state.currentPlayerSeat)!
    const view = createBotView(state)
    expect(view.holeCards).toEqual(actingPlayer.holeCards)
    expect('deck' in view).toBe(false)
    expect(view.opponents.every((opponent) => !('holeCards' in opponent))).toBe(true)
    const serialized = JSON.stringify(view)
    for (const opponent of state.players.filter((player) => player.id !== actingPlayer.id)) {
      expect(serialized).not.toContain(JSON.stringify(opponent.holeCards))
    }
  })

  it('所有性格只会返回当前合法操作', () => {
    for (const personality of ['tight', 'aggressive', 'calling', 'balanced'] as const) {
      const state = startHand(createGame([
        { id: 'bot-a', name: 'A', personality },
        { id: 'bot-b', name: 'B', personality: 'balanced' },
      ]), seededRandom(12))
      const view = createBotView(state)
      const decision = decideBotAction(view, 'normal', seededRandom(20))
      expect(getLegalActions(state).actions).toContain(decision.action.type)
    }
  })

  it('谨慎型会放弃赔率不足的弱牌，激进型会用强牌加注', () => {
    const base: BotView = {
      playerId: 'bot', seat: 0, personality: 'tight', holeCards: cards('7C 2D'),
      communityCards: [], phase: 'PREFLOP', pot: 100, currentBet: 200, bigBlind: 20,
      dealerSeat: 1, playerCount: 4, chips: 800, streetContribution: 0, actionHistory: [],
      opponents: [
        { id: '1', seat: 1, chips: 800, streetContribution: 200, folded: false, allIn: false },
        { id: '2', seat: 2, chips: 800, streetContribution: 0, folded: false, allIn: false },
        { id: '3', seat: 3, chips: 800, streetContribution: 0, folded: false, allIn: false },
      ],
      legal: { actions: ['fold', 'call', 'raise', 'allIn'], toCall: 200, minBet: null, minRaiseTo: 400, maxTo: 800 },
    }
    expect(decideBotAction(base, 'hard', () => 0.5).action.type).toBe('fold')
    const strong = { ...base, personality: 'aggressive' as const, holeCards: cards('AS AD'), legal: { ...base.legal, toCall: 20, minRaiseTo: 220 } }
    expect(decideBotAction(strong, 'hard', () => 0.5).action.type).toBe('raise')
  })

  it('起手牌表和翻牌后模拟能区分明显牌力', () => {
    expect(preflopStrength(cards('AS AD'), 4)).toBeGreaterThan(preflopStrength(cards('7C 2D'), 4))
    const equity = estimateEquity(cards('AS KS'), cards('QS JS 10S 2D 3C'), 3, 40, seededRandom(9))
    expect(equity).toBe(1)
  })

  it('自动运行 200 局策略电脑对战且均能正确结束', () => {
    const random = seededRandom(8802)
    for (let handNumber = 0; handNumber < 200; handNumber += 1) {
      const playerCount = 2 + Math.floor(random() * 9)
      const stack = 600
      let state = startHand(createGame(Array.from({ length: playerCount }, (_, index) => ({
        id: `${index}`,
        name: `${index}`,
        personality: ['tight', 'aggressive', 'calling', 'balanced'][index % 4] as 'tight' | 'aggressive' | 'calling' | 'balanced',
        chips: stack,
      }))), random)
      let actions = 0
      while (state.phase !== 'SETTLEMENT' && actions < 200) {
        const view = createBotView(state)
        const decision = decideBotAction(view, 'easy', random)
        expect(view.legal.actions).toContain(decision.action.type)
        state = performAction(state, state.currentPlayerSeat!, decision.action)
        actions += 1
      }
      expect(state.phase).toBe('SETTLEMENT')
      expect(actions).toBeLessThan(200)
      expect(totalChips(state)).toBe(playerCount * stack)
      const dealt = [...state.communityCards, ...state.players.flatMap((player) => player.holeCards)]
      expect(new Set(dealt.map(cardKey)).size).toBe(dealt.length)
    }
  }, 30_000)
})
