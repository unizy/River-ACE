import { describe, expect, it } from 'vitest'
import { isQuickMessageId, QUICK_MESSAGE_BY_ID, QUICK_MESSAGES } from './quickMessages'

describe('在线快捷语', () => {
  it('保持 8～10 条固定话术，并为每条话术配置唯一 MP3', () => {
    expect(QUICK_MESSAGES.length).toBeGreaterThanOrEqual(8)
    expect(QUICK_MESSAGES.length).toBeLessThanOrEqual(10)
    expect(new Set(QUICK_MESSAGES.map((message) => message.id)).size).toBe(QUICK_MESSAGES.length)
    expect(new Set(QUICK_MESSAGES.map((message) => message.audioFile)).size).toBe(QUICK_MESSAGES.length)
    expect(QUICK_MESSAGES.every((message) => message.audioFile.endsWith('.mp3'))).toBe(true)
  })

  it('只接受清单中的消息 ID', () => {
    expect(isQuickMessageId('shine-shoes')).toBe(true)
    expect(QUICK_MESSAGE_BY_ID['shine-shoes'].text).toBe('给我擦皮鞋')
    expect(isQuickMessageId('custom-message')).toBe(false)
  })
})
