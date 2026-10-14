import { useEffect, useState } from 'react'
import type { Card } from '../game'

export function useStagedCommunityCards(cards: Card[], handNumber: number) {
  const [visual, setVisual] = useState({ handNumber, count: 0 })
  const [completed, setCompleted] = useState({ handNumber, count: 0 })
  const count = visual.handNumber === handNumber ? visual.count : 0

  useEffect(() => {
    if (visual.handNumber !== handNumber) {
      setVisual({ handNumber, count: 0 })
      setCompleted({ handNumber, count: 0 })
      return
    }
    if (cards.length <= count) {
      if (cards.length < count) setVisual({ handNumber, count: cards.length })
      return
    }
    const indexes = Array.from({ length: cards.length - count }, (_, offset) => count + offset)
    const runout = count === 0 && cards.length === 5
    const delayFor = (index: number) => runout ? [700, 1_300, 1_900, 3_350, 4_850][index] : 520 + (index - count) * 320
    const timers = indexes.map((index) => window.setTimeout(() => setVisual((current) => current.handNumber === handNumber
      ? { ...current, count: Math.max(current.count, index + 1) } : current), delayFor(index)))
    timers.push(window.setTimeout(() => setCompleted({ handNumber, count: cards.length }), delayFor(indexes[indexes.length - 1]) + 850))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [cards.length, handNumber, visual.handNumber])

  const flipComplete = completed.handNumber === handNumber && completed.count === cards.length
  return { visibleCards: cards.slice(0, count), revealing: cards.length > 0 && (count < cards.length || !flipComplete) }
}
