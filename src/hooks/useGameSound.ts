import { useCallback, useRef } from 'react'

type SoundName = 'action' | 'deal' | 'win'

const tones: Record<SoundName, [number, number, number]> = {
  action: [240, 0.035, 0.025],
  deal: [420, 0.045, 0.025],
  win: [660, 0.16, 0.045],
}

export function useGameSound(enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null)
  return useCallback((name: SoundName) => {
    if (!enabled || typeof AudioContext === 'undefined') return
    try {
      const context = contextRef.current ?? new AudioContext()
      contextRef.current = context
      const [frequency, duration, volume] = tones[name]
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.frequency.value = frequency
      oscillator.type = 'sine'
      gain.gain.setValueAtTime(volume, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + duration)
    } catch {
      // 浏览器尚未允许音频时静默跳过。
    }
  }, [enabled])
}
