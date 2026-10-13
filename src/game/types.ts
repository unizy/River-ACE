export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades'
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14
export type BotPersonality = 'tight' | 'aggressive' | 'calling' | 'balanced'

export interface Card {
  rank: Rank
  suit: Suit
}

export type Street =
  | 'WAITING'
  | 'POSTING_BLINDS'
  | 'DEALING'
  | 'PREFLOP'
  | 'FLOP'
  | 'TURN'
  | 'RIVER'
  | 'SHOWDOWN'
  | 'SETTLEMENT'

export interface PlayerState {
  id: string
  name: string
  seat: number
  chips: number
  holeCards: Card[]
  streetContribution: number
  totalContribution: number
  folded: boolean
  allIn: boolean
  acted: boolean
  raiseRights: boolean
  isHuman: boolean
  personality?: BotPersonality
}

export interface Pot {
  amount: number
  eligiblePlayerIds: string[]
  winners: string[]
  awards: Record<string, number>
}

export interface HandRank {
  category: number
  categoryName: string
  value: number[]
  cards: Card[]
}

export type PlayerAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number }
  | { type: 'allIn' }

export type LegalActionType = PlayerAction['type']

export interface LegalActions {
  actions: LegalActionType[]
  toCall: number
  minBet: number | null
  minRaiseTo: number | null
  maxTo: number
}

export interface WinnerRecord {
  playerId: string
  amount: number
  hand?: HandRank
}

export interface GameConfig {
  smallBlind: number
  bigBlind: number
  startingChips: number
}

export interface GameState {
  config: GameConfig
  phase: Street
  handNumber: number
  dealerSeat: number
  smallBlindSeat: number | null
  bigBlindSeat: number | null
  deck: Card[]
  communityCards: Card[]
  players: PlayerState[]
  pots: Pot[]
  currentPlayerSeat: number | null
  currentBet: number
  lastFullRaiseSize: number
  actionHistory: string[]
  winners: WinnerRecord[]
}

export type RandomSource = () => number

export interface PlayerSetup {
  id?: string
  name: string
  chips?: number
  isHuman?: boolean
  personality?: BotPersonality
}
