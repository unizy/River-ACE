import type { BotPersonality } from '../game'

export interface PersonalityProfile {
  id: BotPersonality
  name: string
  description: string
  foldThreshold: number
  raiseThreshold: number
  bluffChance: number
  callBias: number
  aggression: number
}

export const PERSONALITIES: Record<BotPersonality, PersonalityProfile> = {
  tight: {
    id: 'tight', name: '谨慎型', description: '范围较窄，重视牌力和底池赔率',
    foldThreshold: 0.08, raiseThreshold: 0.2, bluffChance: 0.015, callBias: -0.04, aggression: 0.35,
  },
  aggressive: {
    id: 'aggressive', name: '激进型', description: '频繁施压，偶尔进行合理诈唬',
    foldThreshold: -0.03, raiseThreshold: 0.1, bluffChance: 0.12, callBias: 0, aggression: 0.8,
  },
  calling: {
    id: 'calling', name: '跟注型', description: '愿意看更多公共牌，但很少主动加注',
    foldThreshold: -0.09, raiseThreshold: 0.28, bluffChance: 0.01, callBias: 0.1, aggression: 0.18,
  },
  balanced: {
    id: 'balanced', name: '均衡型', description: '根据位置、牌力和底池赔率调整行动',
    foldThreshold: 0.02, raiseThreshold: 0.15, bluffChance: 0.05, callBias: 0.02, aggression: 0.55,
  },
}

export const PERSONALITY_ORDER: BotPersonality[] = ['tight', 'aggressive', 'calling', 'balanced']
