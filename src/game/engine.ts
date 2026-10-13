import { draw, shuffledDeck } from './deck'
import { evaluateBestHand } from './handEvaluator'
import { getLegalActions } from './legalActions'
import { settlePots } from './pots'
import type {
  Card, GameConfig, GameState, PlayerAction, PlayerSetup, PlayerState, RandomSource, Street, WinnerRecord,
} from './types'

const DEFAULT_CONFIG: GameConfig = { smallBlind: 10, bigBlind: 20, startingChips: 2000 }
const BETTING_STREETS: Street[] = ['PREFLOP', 'FLOP', 'TURN', 'RIVER']

function cloneState(state: GameState): GameState {
  return structuredClone(state)
}

function playerAt(state: GameState, seat: number): PlayerState {
  const player = state.players.find((candidate) => candidate.seat === seat)
  if (!player) throw new Error(`座位 ${seat} 不存在`)
  return player
}

function inCurrentHand(player: PlayerState): boolean {
  return player.holeCards.length === 2
}

function canAct(player: PlayerState): boolean {
  return inCurrentHand(player) && !player.folded && !player.allIn
}

function nextSeat(
  state: GameState,
  fromSeat: number,
  predicate: (player: PlayerState) => boolean,
): number | null {
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const seat = (fromSeat + offset + state.players.length) % state.players.length
    const player = state.players.find((candidate) => candidate.seat === seat)
    if (player && predicate(player)) return seat
  }
  return null
}

function commit(player: PlayerState, amount: number): number {
  const paid = Math.min(player.chips, Math.max(0, amount))
  player.chips -= paid
  player.streetContribution += paid
  player.totalContribution += paid
  if (player.chips === 0) player.allIn = true
  return paid
}

function postBlind(state: GameState, seat: number, amount: number, label: string): void {
  const player = playerAt(state, seat)
  const paid = commit(player, amount)
  state.actionHistory.push(`${player.name} 支付${label} ${paid}`)
}

export function createGame(players: PlayerSetup[], config: Partial<GameConfig> = {}): GameState {
  if (players.length < 2 || players.length > 10) throw new Error('牌桌人数必须为 2～10 人')
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  if (mergedConfig.smallBlind <= 0 || mergedConfig.bigBlind <= mergedConfig.smallBlind) {
    throw new Error('盲注配置无效')
  }
  const ids = new Set<string>()
  const playerStates = players.map((setup, seat): PlayerState => {
    const id = setup.id ?? `player-${seat + 1}`
    if (ids.has(id)) throw new Error(`玩家 ID 重复：${id}`)
    ids.add(id)
    return {
      id,
      name: setup.name,
      seat,
      chips: setup.chips ?? mergedConfig.startingChips,
      holeCards: [],
      streetContribution: 0,
      totalContribution: 0,
      folded: false,
      allIn: false,
      acted: false,
      raiseRights: true,
      isHuman: setup.isHuman ?? false,
      personality: setup.personality,
    }
  })
  return {
    config: mergedConfig,
    phase: 'WAITING',
    handNumber: 0,
    dealerSeat: -1,
    smallBlindSeat: null,
    bigBlindSeat: null,
    deck: [],
    communityCards: [],
    players: playerStates,
    pots: [],
    currentPlayerSeat: null,
    currentBet: 0,
    lastFullRaiseSize: mergedConfig.bigBlind,
    actionHistory: [],
    winners: [],
  }
}

function dealHoleCards(state: GameState, activeSeats: number[]): void {
  const startSeat = activeSeats.length === 2 ? state.dealerSeat : state.smallBlindSeat!
  for (let round = 0; round < 2; round += 1) {
    let seat: number | null = startSeat
    for (let dealt = 0; dealt < activeSeats.length; dealt += 1) {
      playerAt(state, seat!).holeCards.push(draw(state.deck))
      seat = nextSeat(state, seat!, (player) => activeSeats.includes(player.seat))
    }
  }
}

export function startHand(input: GameState, random?: RandomSource): GameState {
  const state = cloneState(input)
  const active = state.players.filter((player) => player.chips > 0)
  if (active.length < 2) throw new Error('至少需要两名有筹码的玩家才能开始')

  for (const player of state.players) {
    player.holeCards = []
    player.streetContribution = 0
    player.totalContribution = 0
    player.folded = player.chips <= 0
    player.allIn = false
    player.acted = false
    player.raiseRights = true
  }
  state.phase = 'POSTING_BLINDS'
  state.handNumber += 1
  state.communityCards = []
  state.pots = []
  state.winners = []
  state.actionHistory = [`第 ${state.handNumber} 局开始`]
  state.deck = shuffledDeck(random)
  state.dealerSeat = nextSeat(state, state.dealerSeat, (player) => player.chips > 0)!

  if (active.length === 2) {
    state.smallBlindSeat = state.dealerSeat
    state.bigBlindSeat = nextSeat(state, state.dealerSeat, (player) => player.chips > 0)
  } else {
    state.smallBlindSeat = nextSeat(state, state.dealerSeat, (player) => player.chips > 0)
    state.bigBlindSeat = nextSeat(state, state.smallBlindSeat!, (player) => player.chips > 0)
  }
  postBlind(state, state.smallBlindSeat!, state.config.smallBlind, '小盲注')
  postBlind(state, state.bigBlindSeat!, state.config.bigBlind, '大盲注')
  state.currentBet = Math.max(...state.players.map((player) => player.streetContribution))
  state.lastFullRaiseSize = state.config.bigBlind

  state.phase = 'DEALING'
  dealHoleCards(state, active.map((player) => player.seat))
  state.phase = 'PREFLOP'
  const firstToAct = active.length === 2
    ? state.dealerSeat
    : nextSeat(state, state.bigBlindSeat!, canAct)
  state.currentPlayerSeat = firstToAct !== null && canAct(playerAt(state, firstToAct))
    ? firstToAct
    : nextSeat(state, firstToAct ?? state.bigBlindSeat!, canAct)
  return autoAdvanceIfNoDecision(state)
}

function burnAndDeal(state: GameState, count: number): void {
  draw(state.deck)
  for (let index = 0; index < count; index += 1) state.communityCards.push(draw(state.deck))
}

function beginStreet(state: GameState, phase: 'FLOP' | 'TURN' | 'RIVER', cardCount: number): GameState {
  burnAndDeal(state, cardCount)
  state.phase = phase
  state.currentBet = 0
  state.lastFullRaiseSize = state.config.bigBlind
  for (const player of state.players) {
    player.streetContribution = 0
    player.acted = !canAct(player)
    player.raiseRights = canAct(player)
  }
  state.actionHistory.push(phase === 'FLOP' ? '发出翻牌' : phase === 'TURN' ? '发出转牌' : '发出河牌')
  state.currentPlayerSeat = nextSeat(state, state.dealerSeat, canAct)
  return autoAdvanceIfNoDecision(state)
}

function aggregateWinners(state: GameState): WinnerRecord[] {
  const awards = new Map<string, number>()
  for (const pot of state.pots) {
    for (const [id, amount] of Object.entries(pot.awards)) awards.set(id, (awards.get(id) ?? 0) + amount)
  }
  return [...awards.entries()].map(([playerId, amount]) => ({
    playerId,
    amount,
    hand: state.players.find((player) => player.id === playerId)?.folded
      ? undefined
      : evaluateBestHand([
        ...state.players.find((player) => player.id === playerId)!.holeCards,
        ...state.communityCards,
      ]),
  }))
}

function showdown(state: GameState): GameState {
  state.phase = 'SHOWDOWN'
  state.currentPlayerSeat = null
  const ranks = new Map(
    state.players
      .filter((player) => inCurrentHand(player) && !player.folded)
      .map((player) => [player.id, evaluateBestHand([...player.holeCards, ...state.communityCards])]),
  )
  state.pots = settlePots(state.players, ranks, state.dealerSeat)
  state.winners = aggregateWinners(state)
  for (const winner of state.winners) {
    const player = state.players.find((candidate) => candidate.id === winner.playerId)!
    state.actionHistory.push(`${player.name} 以 ${winner.hand?.categoryName ?? '未摊牌'} 赢得 ${winner.amount}`)
  }
  state.phase = 'SETTLEMENT'
  return state
}

function awardUncontested(state: GameState, winner: PlayerState): GameState {
  const amount = state.players.reduce((total, player) => total + player.totalContribution, 0)
  winner.chips += amount
  state.pots = [{ amount, eligiblePlayerIds: [winner.id], winners: [winner.id], awards: { [winner.id]: amount } }]
  state.winners = [{ playerId: winner.id, amount }]
  state.currentPlayerSeat = null
  state.actionHistory.push(`${winner.name} 无需摊牌赢得 ${amount}`)
  state.phase = 'SETTLEMENT'
  return state
}

function advanceStreet(state: GameState): GameState {
  if (state.phase === 'PREFLOP') return beginStreet(state, 'FLOP', 3)
  if (state.phase === 'FLOP') return beginStreet(state, 'TURN', 1)
  if (state.phase === 'TURN') return beginStreet(state, 'RIVER', 1)
  if (state.phase === 'RIVER') return showdown(state)
  return state
}

function autoAdvanceIfNoDecision(state: GameState): GameState {
  if (!BETTING_STREETS.includes(state.phase)) return state
  const contenders = state.players.filter((player) => inCurrentHand(player) && !player.folded)
  if (contenders.length === 1) return awardUncontested(state, contenders[0])
  const actors = contenders.filter(canAct)
  const outstandingCall = actors.some((player) => player.streetContribution < state.currentBet)
  if (actors.length === 0 || (actors.length === 1 && !outstandingCall)) return advanceStreet(state)
  if (state.currentPlayerSeat === null || !canAct(playerAt(state, state.currentPlayerSeat))) {
    state.currentPlayerSeat = nextSeat(state, state.dealerSeat, canAct)
  }
  return state
}

function bettingRoundComplete(state: GameState): boolean {
  return state.players
    .filter(canAct)
    .every((player) => player.acted && player.streetContribution === state.currentBet)
}

function logAction(state: GameState, player: PlayerState, action: PlayerAction, paid: number): void {
  const labels: Record<PlayerAction['type'], string> = {
    fold: '弃牌', check: '过牌', call: `跟注 ${paid}`,
    bet: `下注到 ${player.streetContribution}`, raise: `加注到 ${player.streetContribution}`,
    allIn: `全下到 ${player.streetContribution}`,
  }
  state.actionHistory.push(`${player.name} ${labels[action.type]}`)
}

export function performAction(input: GameState, seat: number, action: PlayerAction): GameState {
  const state = cloneState(input)
  if (seat !== state.currentPlayerSeat) throw new Error('尚未轮到该玩家行动')
  const player = playerAt(state, seat)
  const legal = getLegalActions(state, seat)
  if (!legal.actions.includes(action.type)) throw new Error(`非法操作：${action.type}`)

  const previousBet = state.currentBet
  const previouslyActed = new Map(state.players.map((candidate) => [candidate.id, candidate.acted]))
  let paid = 0
  let aggressive = false
  let fullRaise = false

  if (action.type === 'fold') player.folded = true
  else if (action.type === 'check') player.acted = true
  else if (action.type === 'call') {
    paid = commit(player, legal.toCall)
    player.acted = true
  } else if (action.type === 'bet') {
    if (!Number.isInteger(action.amount) || action.amount < legal.minBet! || action.amount > legal.maxTo) {
      throw new Error(`下注额必须在 ${legal.minBet}～${legal.maxTo} 之间`)
    }
    paid = commit(player, action.amount - player.streetContribution)
    state.currentBet = player.streetContribution
    aggressive = true
    fullRaise = true
  } else if (action.type === 'raise') {
    if (!Number.isInteger(action.amount) || action.amount < legal.minRaiseTo! || action.amount > legal.maxTo) {
      throw new Error(`加注目标必须在 ${legal.minRaiseTo}～${legal.maxTo} 之间`)
    }
    paid = commit(player, action.amount - player.streetContribution)
    state.currentBet = player.streetContribution
    aggressive = true
    fullRaise = true
  } else {
    paid = commit(player, player.chips)
    if (player.streetContribution > previousBet) {
      aggressive = true
      state.currentBet = player.streetContribution
      fullRaise = player.streetContribution - previousBet >= state.lastFullRaiseSize
    }
    player.acted = true
  }

  if (aggressive) {
    if (fullRaise) {
      state.lastFullRaiseSize = state.currentBet - previousBet
      for (const other of state.players) {
        if (other.id !== player.id && canAct(other)) {
          other.acted = false
          other.raiseRights = true
        }
      }
    } else {
      for (const other of state.players) {
        if (
          other.id !== player.id && canAct(other) && other.streetContribution < state.currentBet &&
          previouslyActed.get(other.id)
        ) {
          other.acted = false
          other.raiseRights = false
        }
      }
    }
    player.acted = true
  }
  if (action.type === 'fold') player.acted = true
  logAction(state, player, action, paid)

  const contenders = state.players.filter((candidate) => inCurrentHand(candidate) && !candidate.folded)
  if (contenders.length === 1) return awardUncontested(state, contenders[0])
  if (bettingRoundComplete(state)) return advanceStreet(state)

  const pending = (candidate: PlayerState) => canAct(candidate) &&
    (!candidate.acted || candidate.streetContribution < state.currentBet)
  state.currentPlayerSeat = nextSeat(state, seat, pending)
  if (state.currentPlayerSeat === null) return advanceStreet(state)
  return autoAdvanceIfNoDecision(state)
}

export function startNextHand(
  input: GameState,
  random?: RandomSource,
  autoRebuyBots = true,
): GameState {
  if (input.phase !== 'SETTLEMENT' && input.phase !== 'WAITING') throw new Error('当前不能开始下一局')
  const state = cloneState(input)
  if (autoRebuyBots) {
    for (const player of state.players) {
      if (!player.isHuman && player.chips === 0) player.chips = state.config.startingChips
    }
  }
  return startHand(state, random)
}

export function totalChips(state: GameState): number {
  const stacks = state.players.reduce((sum, player) => sum + player.chips, 0)
  if (state.phase === 'SETTLEMENT' || state.phase === 'WAITING') return stacks
  return stacks + state.players.reduce((sum, player) => sum + player.totalContribution, 0)
}

export function replaceDeckForTest(input: GameState, deck: Card[]): GameState {
  const state = cloneState(input)
  state.deck = [...deck]
  return state
}
