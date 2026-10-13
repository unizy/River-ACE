import { describe, expect, it } from 'vitest'
import { cardKey, createDeck } from './cards'
import { seededRandom, shuffledDeck } from './deck'

describe('牌堆', () => {
  it('包含 52 张不重复的牌', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(52)
    expect(new Set(deck.map(cardKey))).toHaveLength(52)
  })

  it('测试种子可以复现洗牌', () => {
    expect(shuffledDeck(seededRandom(42))).toEqual(shuffledDeck(seededRandom(42)))
    expect(shuffledDeck(seededRandom(42))).not.toEqual(shuffledDeck(seededRandom(43)))
  })
})
