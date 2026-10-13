import { createDeck } from './cards'
import type { Card, RandomSource } from './types'

export const cryptoRandom: RandomSource = () => {
  const values = new Uint32Array(1)
  globalThis.crypto.getRandomValues(values)
  return values[0] / 0x1_0000_0000
}

export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

export function shuffledDeck(random: RandomSource = cryptoRandom): Card[] {
  const deck = createDeck()
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]]
  }
  return deck
}

export function draw(deck: Card[]): Card {
  const card = deck.pop()
  if (!card) throw new Error('牌堆已空')
  return card
}
