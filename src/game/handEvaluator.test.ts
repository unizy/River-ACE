import { describe, expect, it } from 'vitest'
import { parseCard } from './cards'
import { compareHandRanks, evaluateBestHand, evaluateFive } from './handEvaluator'

const cards = (values: string) => values.split(' ').map(parseCard)

describe('牌型判断', () => {
  const cases: Array<[string, string, number]> = [
    ['高牌', 'AS KD 9C 6H 3D', 0],
    ['一对', 'QS QD AH 9C 7S', 1],
    ['两对', 'AS AD 10H 10C 8S', 2],
    ['三条', '7S 7D 7C AH 2D', 3],
    ['顺子', '9S 8D 7C 6H 5D', 4],
    ['同花', 'AS JS 8S 4S 2S', 5],
    ['葫芦', 'KH KD KC 4S 4D', 6],
    ['四条', 'AH AD AC AS KD', 7],
    ['同花顺', '9H 8H 7H 6H 5H', 8],
  ]

  it.each(cases)('识别%s', (_, hand, category) => {
    const result = evaluateFive(cards(hand))
    expect(result.category).toBe(category)
  })

  it('把 A2345 识别为五高顺子', () => {
    expect(evaluateFive(cards('AS 2D 3C 4H 5S')).value).toEqual([4, 5])
  })

  it('从七张牌的 21 种组合中选出最佳五张', () => {
    const result = evaluateBestHand(cards('AS AH AD KC KD KH 2S'))
    expect(result.value).toEqual([6, 14, 13])
  })

  it('允许五张公共牌完全构成最佳牌并判定平局', () => {
    const board = cards('AS KS QS JS 10S')
    const left = evaluateBestHand([...board, ...cards('2C 3D')])
    const right = evaluateBestHand([...board, ...cards('AH AD')])
    expect(compareHandRanks(left, right)).toBe(0)
  })

  it('按规则比较同花、葫芦、两对及踢脚', () => {
    expect(compareHandRanks(evaluateFive(cards('AH JH 9H 4H 2H')), evaluateFive(cards('AD 10D 9D 4D 2D')))).toBeGreaterThan(0)
    expect(compareHandRanks(evaluateFive(cards('QH QS QD AH AD')), evaluateFive(cards('JH JS JD AC AS')))).toBeGreaterThan(0)
    expect(compareHandRanks(evaluateFive(cards('AH AD 10C 10D 9S')), evaluateFive(cards('AS AC 10H 10S 8D')))).toBeGreaterThan(0)
  })
})
