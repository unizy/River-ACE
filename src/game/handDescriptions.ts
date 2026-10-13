import { compareHandRanks, evaluateBestHand } from './handEvaluator'
import type { Card, GameState, HandRank } from './types'

const rankName = (rank: number) => ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J' }[rank] ?? `${rank}`)

export function describeHand(hand: HandRank): string {
  const values = hand.value.slice(1).map(rankName)
  switch (hand.category) {
    case 8: return hand.value[1] === 14 ? '皇家同花顺（A-K-Q-J-10）' : `${values[0]} 高同花顺`
    case 7: return `${values[0]} 四条，${values[1]} 踢脚`
    case 6: return `${values[0]} 三条带 ${values[1]} 对子组成葫芦`
    case 5: return `${values.join('、')} 组成的 ${values[0]} 高同花`
    case 4: return `${values[0]} 高顺子`
    case 3: return `${values[0]} 三条，踢脚 ${values.slice(1).join('、')}`
    case 2: return `${values[0]} 和 ${values[1]} 两对，${values[2]} 踢脚`
    case 1: return `${values[0]} 一对，踢脚 ${values.slice(1).join('、')}`
    default: return `${values[0]} 高牌，依次比较 ${values.slice(1).join('、')}`
  }
}

export interface WinnerExplanation {
  playerId: string
  playerName: string
  amount: number
  categoryName: string
  description: string
  reason: string
  bestCards: Card[]
  potNames: string[]
}

export function buildWinnerExplanations(state: GameState): WinnerExplanation[] {
  return state.winners.map((winner) => {
    const player = state.players.find((candidate) => candidate.id === winner.playerId)!
    const potsWon = state.pots
      .map((pot, index) => ({ pot, index }))
      .filter(({ pot }) => (pot.awards[winner.playerId] ?? 0) > 0)
    const potNames = potsWon.map(({ index }) => index === 0 ? '主池' : `边池 ${index}`)
    if (!winner.hand) {
      return {
        playerId: winner.playerId, playerName: player.name, amount: winner.amount,
        categoryName: '未摊牌获胜', description: '其他玩家均已弃牌',
        reason: '所有仍在牌局中的对手都已弃牌，因此无需公开底牌。', bestCards: [], potNames,
      }
    }

    const opponentIds = new Set(potsWon.flatMap(({ pot }) => pot.eligiblePlayerIds).filter((id) => id !== winner.playerId))
    const opponents = [...opponentIds].map((id) => state.players.find((candidate) => candidate.id === id)!)
      .filter((candidate) => candidate && !candidate.folded && candidate.holeCards.length === 2)
      .map((candidate) => ({
        player: candidate,
        hand: evaluateBestHand([...candidate.holeCards, ...state.communityCards]),
      }))
    const tied = opponents.filter((opponent) => compareHandRanks(winner.hand!, opponent.hand) === 0)
    const beaten = opponents.filter((opponent) => compareHandRanks(winner.hand!, opponent.hand) > 0)
      .sort((left, right) => compareHandRanks(right.hand, left.hand))
    let reason = '这是该底池中最大的五张牌组合。'
    if (tied.length > 0) {
      reason = `与 ${tied.map((opponent) => opponent.player.name).join('、')} 的最佳五张完全相同，因此平分相应底池。`
    } else if (beaten[0]) {
      const runnerUp = beaten[0]
      reason = winner.hand.category !== runnerUp.hand.category
        ? `${winner.hand.categoryName} 的牌型级别高于 ${runnerUp.player.name} 的 ${runnerUp.hand.categoryName}。`
        : `双方同为${winner.hand.categoryName}，比较关键点数 ${winner.hand.value.slice(1).map(rankName).join('、')}，领先 ${runnerUp.player.name} 的 ${runnerUp.hand.value.slice(1).map(rankName).join('、')}。`
    }
    return {
      playerId: winner.playerId, playerName: player.name, amount: winner.amount,
      categoryName: winner.hand.categoryName, description: describeHand(winner.hand),
      reason, bestCards: winner.hand.cards, potNames,
    }
  })
}
