import { useCallback, useEffect, useRef } from 'react'

export type SoundName = 'deal' | 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn' | 'win'

function createNoise(context: AudioContext) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.25), context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1
  return buffer
}

// 单次“咔哒”，用于筹码碰撞或敲桌。
function playTick(context: AudioContext, at: number, frequency: number, duration: number, volume: number, type: OscillatorType = 'triangle') {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, at)
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.004)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start(at)
  oscillator.stop(at + duration + 0.02)
}

// 过滤白噪声的扫频，用于发牌与弃牌。
function playNoise(context: AudioContext, noise: AudioBuffer, options: { type: BiquadFilterType; from: number; to: number; duration: number; peak: number }) {
  const { type, from, to, duration, peak } = options
  const now = context.currentTime
  const source = context.createBufferSource()
  source.buffer = noise
  const filter = context.createBiquadFilter()
  filter.type = type
  filter.Q.value = 0.9
  filter.frequency.setValueAtTime(from, now)
  filter.frequency.exponentialRampToValueAtTime(to, now + duration)
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.02)
  source.connect(filter).connect(gain).connect(context.destination)
  source.start(now)
  source.stop(now + duration + 0.03)
}

// 各下注动作的筹码碰撞节奏：[延迟, 频率, 时长]
const chipPatterns: Record<'call' | 'bet' | 'raise' | 'allIn', Array<[number, number, number]>> = {
  call: [[0, 1550, 0.06]],
  bet: [[0, 1700, 0.05], [0.06, 2100, 0.05]],
  raise: [[0, 1900, 0.05], [0.05, 2300, 0.045], [0.1, 1650, 0.055]],
  allIn: [[0, 2000, 0.05], [0.045, 2400, 0.045], [0.09, 1750, 0.05], [0.135, 2650, 0.045], [0.18, 1950, 0.06]],
}

function playChips(context: AudioContext, kind: keyof typeof chipPatterns, volume: number) {
  const now = context.currentTime
  for (const [offset, frequency, duration] of chipPatterns[kind]) playTick(context, now + offset, frequency, duration, 0.32 * volume)
}

// 指关节敲击桌面：宽带噪声瞬时冲击 + 低频木质共鸣。
function playKnock(context: AudioContext, at: number, noise: AudioBuffer, volume: number) {
  const source = context.createBufferSource()
  source.buffer = noise
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(1100, at)
  filter.Q.value = 1.1
  const gain = context.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09)
  source.connect(filter).connect(gain).connect(context.destination)
  source.start(at)
  source.stop(at + 0.12)

  const body = context.createOscillator()
  const bodyGain = context.createGain()
  body.type = 'sine'
  body.frequency.setValueAtTime(210, at)
  body.frequency.exponentialRampToValueAtTime(120, at + 0.08)
  bodyGain.gain.setValueAtTime(0.0001, at)
  bodyGain.gain.exponentialRampToValueAtTime(volume * 0.9, at + 0.004)
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.1)
  body.connect(bodyGain).connect(context.destination)
  body.start(at)
  body.stop(at + 0.12)
}

// 过牌：指关节敲桌两下。
function playCheck(context: AudioContext, noise: AudioBuffer, volume: number) {
  const now = context.currentTime
  playKnock(context, now, noise, 0.9 * volume)
  playKnock(context, now + 0.16, noise, 0.7 * volume)
}

// 获胜：上行琶音，模拟筹码被收拢。
function playWin(context: AudioContext, volume: number) {
  const now = context.currentTime
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((frequency, index) => playTick(context, now + index * 0.09, frequency, 0.26, 0.26 * volume))
}

export function useGameSound(enabled: boolean, volume: number) {
  const contextRef = useRef<AudioContext | null>(null)
  const noiseRef = useRef<AudioBuffer | null>(null)
  const enabledRef = useRef(enabled)
  const volumeRef = useRef(volume)
  enabledRef.current = enabled
  volumeRef.current = volume

  // 浏览器自动播放策略：AudioContext 必须在用户手势中创建或恢复才能出声。
  useEffect(() => {
    const unlock = () => {
      const context = contextRef.current
      if (context && context.state === 'suspended') void context.resume()
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchstart', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [])

  return useCallback((name: SoundName) => {
    if (!enabledRef.current || volumeRef.current <= 0) return
    const AudioContextClass = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    try {
      const context = contextRef.current ?? new AudioContextClass()
      contextRef.current = context
      if (context.state === 'suspended') void context.resume()
      const noise = noiseRef.current ?? (noiseRef.current = createNoise(context))
      const gain = volumeRef.current
      switch (name) {
        case 'deal': playNoise(context, noise, { type: 'bandpass', from: 2800, to: 1100, duration: 0.12, peak: 0.45 * gain }); break
        case 'fold': playNoise(context, noise, { type: 'lowpass', from: 1400, to: 280, duration: 0.16, peak: 0.5 * gain }); break
        case 'check': playCheck(context, noise, gain); break
        case 'call':
        case 'bet':
        case 'raise':
        case 'allIn': playChips(context, name, gain); break
        case 'win': playWin(context, gain); break
      }
    } catch {
      // 浏览器尚未允许音频时静默跳过。
    }
  }, [])
}
