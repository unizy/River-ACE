import { describe, expect, it } from 'vitest'
import { createGame, performAction, seededRandom, startHand, type GameState } from '../game'
import { createSavedHand, historyAsText, prependHand, type SavedHand } from './handHistory'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings'
import { EMPTY_STATISTICS, recordSettledHand } from './statistics'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

function foldedHand(): GameState {
  let state = startHand(createGame([
    { id: 'hero', name: '你', isHuman: true },
    { id: 'bot', name: '电脑' },
  ]), seededRandom(2))
  state = performAction(state, state.currentPlayerSeat!, { type: 'fold' })
  return state
}

describe('本地设置与统计', () => {
  it('设置可以保存、恢复并修正越界人数', () => {
    const storage = new MemoryStorage()
    saveSettings({ ...DEFAULT_SETTINGS, playerCount: 10, soundEnabled: false }, storage)
    expect(loadSettings(storage).playerCount).toBe(10)
    expect(loadSettings(storage).soundEnabled).toBe(false)
    storage.setItem('river-ace:settings:v1', JSON.stringify({ playerCount: 99 }))
    expect(loadSettings(storage).playerCount).toBe(10)
  })

  it('结算后累计局数、盈亏和最大底池', () => {
    const state = foldedHand()
    const next = recordSettledHand(EMPTY_STATISTICS, state)
    expect(next.handsPlayed).toBe(1)
    expect(next.totalProfit).toBe(-10)
    expect(next.biggestPot).toBe(30)
  })

  it('只保留最近 50 手牌并可导出可读文本', () => {
    const storage = new MemoryStorage()
    const hand = createSavedHand(foldedHand())
    let history: SavedHand[] = []
    for (let index = 0; index < 55; index += 1) {
      history = prependHand({ ...hand, id: `${index}` }, history, storage)
    }
    expect(history).toHaveLength(50)
    expect(history[0].id).toBe('54')
    expect(historyAsText(history)).toContain('River Ace')
    expect(historyAsText(history)).toContain('底池 30')
  })
})
