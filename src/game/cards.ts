import type { Card, Rank, Suit } from './types'

export const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades']
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

const rankLabels: Record<Rank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
}

const suitLabels: Record<Suit, string> = {
  clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠',
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })))
}

export function cardKey(card: Card): string {
  return `${card.rank}-${card.suit}`
}

export function formatCard(card: Card): string {
  return `${rankLabels[card.rank]}${suitLabels[card.suit]}`
}

export function parseCard(value: string): Card {
  const match = value.trim().toUpperCase().match(/^(10|[2-9TJQKA])([CDHS♣♦♥♠])$/)
  if (!match) throw new Error(`无效的牌面：${value}`)
  const ranks: Record<string, Rank> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, T: 10, J: 11, Q: 12, K: 13, A: 14,
  }
  const suits: Record<string, Suit> = {
    C: 'clubs', '♣': 'clubs', D: 'diamonds', '♦': 'diamonds',
    H: 'hearts', '♥': 'hearts', S: 'spades', '♠': 'spades',
  }
  return { rank: ranks[match[1]], suit: suits[match[2]] }
}
