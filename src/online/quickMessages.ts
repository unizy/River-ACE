export const QUICK_MESSAGES = [
  { id: 'shine-shoes', text: '给我擦皮鞋', audioFile: 'shine-shoes.mp3' },
  { id: 'check-cards', text: '我要验牌', audioFile: 'check-cards.mp3' },
  { id: 'cards-ok', text: '牌没有问题', audioFile: 'cards-ok.mp3' },
  { id: 'great-hand', text: '这牌也忒好了', audioFile: 'great-hand.mp3' },
  { id: 'dont-run', text: '都别跑，一个一个来', audioFile: 'dont-run.mp3' },
  { id: 'hurry-up', text: '快点吧，我等到花儿都谢了', audioFile: 'hurry-up.mp3' },
  { id: 'nice-play', text: '你这牌打得也太好了', audioFile: 'nice-play.mp3' },
  { id: 'won-again', text: '不好意思，我又赢了', audioFile: 'won-again.mp3' },
  { id: 'about-to-raise', text: '小心点，我可要加注了', audioFile: 'about-to-raise.mp3' },
] as const

export type QuickMessageId = typeof QUICK_MESSAGES[number]['id']

export const QUICK_MESSAGE_BY_ID = Object.fromEntries(
  QUICK_MESSAGES.map((message) => [message.id, message]),
) as Record<QuickMessageId, typeof QUICK_MESSAGES[number]>

export const QUICK_MESSAGE_AUDIO_ROOT = './audio/quick-messages'

export function isQuickMessageId(value: unknown): value is QuickMessageId {
  return typeof value === 'string' && value in QUICK_MESSAGE_BY_ID
}
