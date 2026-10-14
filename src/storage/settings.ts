import type { AiDifficulty } from '../ai'

export interface GameSettings {
  playerCount: number
  startingChips: number
  aiDifficulty: AiDifficulty
  aiSpeed: 'slow' | 'normal' | 'fast'
  soundEnabled: boolean
  autoNextHand: boolean
}

export const DEFAULT_SETTINGS: GameSettings = {
  playerCount: 4,
  startingChips: 2000,
  aiDifficulty: 'normal',
  aiSpeed: 'normal',
  soundEnabled: true,
  autoNextHand: true,
}

const KEY = 'river-ace:settings:v1'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function normalized(value: Partial<GameSettings>): GameSettings {
  return {
    playerCount: Math.max(2, Math.min(10, Math.round(value.playerCount ?? DEFAULT_SETTINGS.playerCount))),
    startingChips: [1000, 2000, 5000, 10000, 20000].includes(value.startingChips ?? 0)
      ? value.startingChips!
      : DEFAULT_SETTINGS.startingChips,
    aiDifficulty: ['easy', 'normal', 'hard'].includes(value.aiDifficulty ?? '')
      ? value.aiDifficulty!
      : DEFAULT_SETTINGS.aiDifficulty,
    aiSpeed: ['slow', 'normal', 'fast'].includes(value.aiSpeed ?? '')
      ? value.aiSpeed!
      : DEFAULT_SETTINGS.aiSpeed,
    soundEnabled: value.soundEnabled ?? DEFAULT_SETTINGS.soundEnabled,
    autoNextHand: value.autoNextHand ?? DEFAULT_SETTINGS.autoNextHand,
  }
}

export function loadSettings(storage: StorageLike | undefined = globalThis.localStorage): GameSettings {
  try {
    const saved = storage?.getItem(KEY)
    return saved ? normalized(JSON.parse(saved) as Partial<GameSettings>) : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: GameSettings, storage: StorageLike | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(KEY, JSON.stringify(normalized(settings)))
  } catch {
    // 隐私模式或存储配额不足时，游戏仍可在当前会话中运行。
  }
}
