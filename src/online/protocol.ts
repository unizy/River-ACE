import type { BotPersonality, Card, GameConfig, LegalActions, PlayerAction, Pot, Street, WinnerRecord } from '../game'

export interface OnlineUser {
  id: string
  username: string
  games: number
  wins: number
  profit: number
  createdAt: string
}

export interface LobbyRoom {
  id: string
  name: string
  hostName: string
  playerCount: number
  maxPlayers: number
  spectatorCount: number
  hasPassword: boolean
  status: 'waiting' | 'playing'
}

export interface OnlinePlayerView {
  id: string
  name: string
  seat: number
  chips: number
  holeCards: Card[]
  hasCards: boolean
  streetContribution: number
  totalContribution: number
  folded: boolean
  allIn: boolean
  connected: boolean
  isBot: boolean
}

export interface OnlineGameView {
  config: GameConfig
  phase: Street
  handNumber: number
  dealerSeat: number
  smallBlindSeat: number | null
  bigBlindSeat: number | null
  communityCards: Card[]
  players: OnlinePlayerView[]
  pots: Pot[]
  currentPlayerSeat: number | null
  currentBet: number
  lastFullRaiseSize: number
  actionHistory: string[]
  winners: WinnerRecord[]
}

export interface RoomView {
  id: string
  name: string
  hostId: string
  maxPlayers: number
  hasPassword: boolean
  status: 'waiting' | 'playing'
  players: Array<{ id: string; name: string; seat: number; chips: number; connected: boolean; isBot: boolean; personality?: BotPersonality }>
  spectators: number
  viewerRole: 'player' | 'spectator'
  game?: OnlineGameView
  legalActions?: LegalActions
  actionDeadline?: number
}

export interface ReplaySummary {
  id: string
  roomName: string
  handNumber: number
  completedAt: string
  winnerNames: string[]
  pot: number
}

export interface ReplayDetail extends ReplaySummary {
  communityCards: Card[]
  players: Array<{ id: string; name: string; seat: number; holeCards: Card[]; folded: boolean; contribution: number }>
  winners: WinnerRecord[]
  pots: Pot[]
  actionHistory: string[]
}

export type ClientMessage =
  | { type: 'listRooms' }
  | { type: 'createRoom'; name: string; password?: string; maxPlayers: number }
  | { type: 'joinRoom'; roomId: string; password?: string }
  | { type: 'spectateRoom'; roomId: string; password?: string }
  | { type: 'leaveRoom' }
  | { type: 'startGame' }
  | { type: 'addBot'; personality: BotPersonality }
  | { type: 'removeBot'; botId: string }
  | { type: 'action'; action: PlayerAction }
  | { type: 'report'; targetUserId: string; reason: string }
  | { type: 'ping'; sentAt: number }

export type ServerMessage =
  | { type: 'hello'; user: OnlineUser }
  | { type: 'lobby'; rooms: LobbyRoom[] }
  | { type: 'room'; room: RoomView }
  | { type: 'leftRoom' }
  | { type: 'error'; message: string }
  | { type: 'notice'; message: string }
  | { type: 'pong'; sentAt: number }

