import { cardKey, compareHandRanks, createDeck, evaluateBestHand, type Card, type RandomSource } from '../game'

function sampleWithoutReplacement(cards: Card[], count: number, random: RandomSource): Card[] {
  const pool = [...cards]
  const result: Card[] = []
  for (let index = 0; index < count; index += 1) {
    const selected = Math.floor(random() * pool.length)
    result.push(pool[selected])
    pool.splice(selected, 1)
  }
  return result
}

export function estimateEquity(
  holeCards: Card[],
  communityCards: Card[],
  opponentCount: number,
  simulations: number,
  random: RandomSource,
): number {
  const known = new Set([...holeCards, ...communityCards].map(cardKey))
  const unknown = createDeck().filter((card) => !known.has(cardKey(card)))
  let equity = 0
  const opponents = Math.max(1, opponentCount)

  for (let run = 0; run < simulations; run += 1) {
    const neededBoard = 5 - communityCards.length
    const sampled = sampleWithoutReplacement(unknown, neededBoard + opponents * 2, random)
    const board = [...communityCards, ...sampled.slice(0, neededBoard)]
    const heroRank = evaluateBestHand([...holeCards, ...board])
    let tied = 1
    let beaten = false
    for (let opponent = 0; opponent < opponents; opponent += 1) {
      const offset = neededBoard + opponent * 2
      const opponentRank = evaluateBestHand([...sampled.slice(offset, offset + 2), ...board])
      const comparison = compareHandRanks(heroRank, opponentRank)
      if (comparison < 0) {
        beaten = true
        break
      }
      if (comparison === 0) tied += 1
    }
    if (!beaten) equity += 1 / tied
  }
  return equity / simulations
}
