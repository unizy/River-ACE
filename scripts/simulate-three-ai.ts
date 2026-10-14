import { createBotView, decideBotAction, PERSONALITIES } from '../src/ai/index'
import { createGame, performAction, seededRandom, startHand, type BotPersonality } from '../src/game/index'

const hands = Number(process.argv[2] ?? 10_000)
const seed = Number(process.argv[3] ?? 20261014)
const personalities: BotPersonality[] = ['tight', 'aggressive', 'calling']
const random = seededRandom(seed)
const results = Object.fromEntries(personalities.map((id) => [id, {
  id, hands: 0, outrightWins: 0, tiedWins: 0, winShares: 0, netChips: 0, chipsWon: 0, invested: 0,
}])) as Record<BotPersonality, { id: BotPersonality; hands: number; outrightWins: number; tiedWins: number; winShares: number; netChips: number; chipsWon: number; invested: number }>

for (let hand = 0; hand < hands; hand += 1) {
  const seated = Array.from({ length: 3 }, (_, seat) => personalities[(seat + hand) % personalities.length])
  let state = startHand(createGame(seated.map((personality, seat) => ({
    id: `${personality}-${seat}`, name: PERSONALITIES[personality].name, personality, isHuman: false,
  })), { startingChips: 10_000 }), random)
  let actions = 0
  while (state.phase !== 'SETTLEMENT') {
    const seat = state.currentPlayerSeat
    if (seat === null) throw new Error(`第 ${hand + 1} 局没有行动玩家`)
    const decision = decideBotAction(createBotView(state, seat), 'normal', random)
    state = performAction(state, seat, decision.action)
    actions += 1
    if (actions > 500) throw new Error(`第 ${hand + 1} 局动作超过上限`)
  }
  const winnerIds = new Set(state.winners.map((winner) => winner.playerId))
  for (const player of state.players) {
    const personality = player.personality!
    const result = results[personality]
    const award = state.winners.find((winner) => winner.playerId === player.id)?.amount ?? 0
    result.hands += 1
    result.netChips += player.chips - 10_000
    result.chipsWon += award
    result.invested += player.totalContribution
    if (winnerIds.has(player.id)) {
      if (winnerIds.size === 1) result.outrightWins += 1
      else result.tiedWins += 1
      result.winShares += 1 / winnerIds.size
    }
  }
}

console.log(JSON.stringify({ hands, seed, difficulty: 'normal', startingChips: 10_000, results: personalities.map((id) => results[id]) }, null, 2))
