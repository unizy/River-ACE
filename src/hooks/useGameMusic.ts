import { useEffect, useRef } from 'react'

// 背景音乐：public/bgm.mp3
// 素材来源 OpenGameArt「Town Theme RPG」（作者 cynicmusic），CC0 1.0 公共领域，可免费商用、无需署名。
// https://opengameart.org/content/town-theme-rpg
const MUSIC_URL = `${import.meta.env.BASE_URL}bgm.mp3`

/**
 * 循环播放背景音乐。浏览器禁止自动播放，
 * 因此在首次用户交互（点击/按键/触摸）后才开始播放；开关与音量变化时立即生效。
 */
export function useGameMusic(enabled: boolean, volume: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const enabledRef = useRef(enabled)
  const volumeRef = useRef(volume)
  enabledRef.current = enabled
  volumeRef.current = volume

  useEffect(() => {
    const audio = new Audio(MUSIC_URL)
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = volumeRef.current
    audioRef.current = audio

    const resume = () => {
      if (enabledRef.current && audio.paused) void audio.play().catch(() => undefined)
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    window.addEventListener('touchstart', resume)

    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
      window.removeEventListener('touchstart', resume)
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = volume
  }, [volume])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (enabled) void audio.play().catch(() => undefined)
    else audio.pause()
  }, [enabled])
}
