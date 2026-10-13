import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createLocalAudioTrack,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
} from 'livekit-client'
import type { VoiceTokenResponse } from '../online/protocol'

export type VoiceMode = 'push-to-talk' | 'open-mic'
export type VoiceConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

const MODE_KEY = 'river-ace-voice-mode'
const AUDIO_CAPTURE_OPTIONS = {
  autoGainControl: true,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
} as const

function readableError(reason: unknown) {
  if (reason instanceof DOMException) {
    if (reason.name === 'NotAllowedError') return '未获得麦克风权限，请在浏览器地址栏中允许使用麦克风'
    if (reason.name === 'NotFoundError') return '没有检测到可用的麦克风'
    if (reason.name === 'NotReadableError') return '麦克风正被其他程序占用'
  }
  return reason instanceof Error ? reason.message : '语音连接失败'
}

export function useRoomVoice(roomId: string, authToken: string, canPublish: boolean) {
  const initialMode = localStorage.getItem(MODE_KEY) === 'open-mic' ? 'open-mic' : 'push-to-talk'
  const [status, setStatus] = useState<VoiceConnectionStatus>('idle')
  const [modeState, setModeState] = useState<VoiceMode>(initialMode)
  const [microphoneDisabled, setMicrophoneDisabledState] = useState(false)
  const [pressing, setPressing] = useState(false)
  const [deafened, setDeafenedState] = useState(false)
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState('')
  const [needsPlayback, setNeedsPlayback] = useState(false)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const roomRef = useRef<Room | null>(null)
  const audioElements = useRef(new Map<string, HTMLMediaElement>())
  const modeRef = useRef<VoiceMode>(initialMode)
  const microphoneDisabledRef = useRef(false)
  const pressingRef = useRef(false)
  const deafenedRef = useRef(false)
  const desiredMutedRef = useRef(true)
  const micQueueRef = useRef(Promise.resolve())

  const clearAudio = useCallback(() => {
    for (const element of audioElements.current.values()) element.remove()
    audioElements.current.clear()
  }, [])

  const refreshDevices = useCallback(async (room: Room) => {
    if (!canPublish) return
    const nextDevices = await Room.getLocalDevices('audioinput', false)
    setDevices(nextDevices)
    setSelectedDeviceId(room.getActiveDevice('audioinput') ?? nextDevices[0]?.deviceId ?? '')
  }, [canPublish])

  const queueMicrophoneState = useCallback((muted: boolean) => {
    desiredMutedRef.current = muted
    const targetRoom = roomRef.current
    if (!targetRoom) return
    micQueueRef.current = micQueueRef.current.then(async () => {
      if (roomRef.current !== targetRoom) return
      const publication = targetRoom.localParticipant.getTrackPublication(Track.Source.Microphone)
      if (!publication) return
      if (desiredMutedRef.current) await publication.mute()
      else await publication.unmute()
    }).catch((reason) => setError(readableError(reason)))
  }, [])

  const leave = useCallback(() => {
    const activeRoom = roomRef.current
    roomRef.current = null
    pressingRef.current = false
    desiredMutedRef.current = true
    setPressing(false)
    setSpeakingIds(new Set())
    setNeedsPlayback(false)
    setDevices([])
    setSelectedDeviceId('')
    clearAudio()
    if (activeRoom) void activeRoom.disconnect(true)
    setStatus('idle')
  }, [clearAudio])

  const join = useCallback(async () => {
    if (roomRef.current || status === 'connecting') return
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setStatus('error')
      setError('浏览器只允许 HTTPS 页面使用麦克风，请通过 https:// 域名访问游戏')
      return
    }

    setStatus('connecting')
    setError('')
    try {
      const response = await fetch('/api/voice/token', {
        method: 'POST',
        headers: { authorization: `Bearer ${authToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ roomId }),
      })
      const value = await response.json() as VoiceTokenResponse & { error?: string }
      if (!response.ok) throw new Error(value.error ?? '无法取得语音房间权限')

      const voiceRoom = new Room({
        audioCaptureDefaults: AUDIO_CAPTURE_OPTIONS,
        disconnectOnPageLeave: true,
      })
      roomRef.current = voiceRoom

      const attachAudio = (track: RemoteTrack) => {
        const trackId = track.sid
        if (track.kind !== Track.Kind.Audio || !trackId || audioElements.current.has(trackId)) return
        const element = track.attach()
        element.autoplay = true
        element.muted = deafenedRef.current
        element.setAttribute('data-river-ace-voice', '')
        element.style.display = 'none'
        document.body.appendChild(element)
        audioElements.current.set(trackId, element)
      }
      voiceRoom
        .on(RoomEvent.TrackSubscribed, (track) => attachAudio(track))
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          for (const element of track.detach()) element.remove()
          if (track.sid) audioElements.current.delete(track.sid)
        })
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => setSpeakingIds(new Set(speakers.map((speaker) => speaker.identity))))
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsPlayback(!voiceRoom.canPlaybackAudio))
        .on(RoomEvent.MediaDevicesChanged, () => { void refreshDevices(voiceRoom) })
        .on(RoomEvent.Reconnecting, () => setStatus('reconnecting'))
        .on(RoomEvent.Reconnected, () => setStatus('connected'))
        .on(RoomEvent.Disconnected, (reason) => {
          if (roomRef.current !== voiceRoom) return
          roomRef.current = null
          clearAudio()
          setSpeakingIds(new Set())
          setStatus(reason === DisconnectReason.CLIENT_INITIATED ? 'idle' : 'error')
          if (reason === DisconnectReason.DUPLICATE_IDENTITY) setError('这个账号已在另一个页面加入语音，本页面的语音已断开')
          else if (reason === DisconnectReason.PARTICIPANT_REMOVED || reason === DisconnectReason.ROOM_DELETED) setError('你已离开语音房间')
          else if (reason !== DisconnectReason.CLIENT_INITIATED) setError('语音连接已中断，请重新加入')
        })

      await voiceRoom.connect(value.url, value.token, { autoSubscribe: true })
      await voiceRoom.startAudio().catch(() => setNeedsPlayback(true))
      if (canPublish && value.canPublish) {
        const microphone = await createLocalAudioTrack(AUDIO_CAPTURE_OPTIONS)
        const shouldMute = modeRef.current === 'push-to-talk' || microphoneDisabledRef.current
        if (shouldMute) await microphone.mute()
        await voiceRoom.localParticipant.publishTrack(microphone, { source: Track.Source.Microphone })
        desiredMutedRef.current = shouldMute
        await refreshDevices(voiceRoom)
      }
      if (roomRef.current === voiceRoom) setStatus('connected')
    } catch (reason) {
      const failedRoom = roomRef.current
      roomRef.current = null
      if (failedRoom) void failedRoom.disconnect(true)
      clearAudio()
      setStatus('error')
      setError(readableError(reason))
    }
  }, [authToken, canPublish, clearAudio, refreshDevices, roomId, status])

  const setMode = useCallback((mode: VoiceMode) => {
    modeRef.current = mode
    localStorage.setItem(MODE_KEY, mode)
    setModeState(mode)
    pressingRef.current = false
    setPressing(false)
    queueMicrophoneState(mode === 'push-to-talk' || microphoneDisabledRef.current)
  }, [queueMicrophoneState])

  const setMicrophoneDisabled = useCallback((disabled: boolean) => {
    microphoneDisabledRef.current = disabled
    setMicrophoneDisabledState(disabled)
    queueMicrophoneState(disabled || modeRef.current === 'push-to-talk' && !pressingRef.current)
  }, [queueMicrophoneState])

  const startTalking = useCallback(() => {
    if (status !== 'connected' || modeRef.current !== 'push-to-talk' || microphoneDisabledRef.current || !canPublish) return
    pressingRef.current = true
    setPressing(true)
    queueMicrophoneState(false)
  }, [canPublish, queueMicrophoneState, status])

  const stopTalking = useCallback(() => {
    if (!pressingRef.current) return
    pressingRef.current = false
    setPressing(false)
    if (modeRef.current === 'push-to-talk') queueMicrophoneState(true)
  }, [queueMicrophoneState])

  const setDeafened = useCallback((value: boolean) => {
    deafenedRef.current = value
    setDeafenedState(value)
    for (const element of audioElements.current.values()) element.muted = value
  }, [])

  const enablePlayback = useCallback(async () => {
    const activeRoom = roomRef.current
    if (!activeRoom) return
    try {
      await activeRoom.startAudio()
      setNeedsPlayback(!activeRoom.canPlaybackAudio)
    } catch (reason) {
      setError(readableError(reason))
    }
  }, [])

  const selectDevice = useCallback(async (deviceId: string) => {
    const activeRoom = roomRef.current
    if (!activeRoom) return
    try {
      if (await activeRoom.switchActiveDevice('audioinput', deviceId, true)) setSelectedDeviceId(deviceId)
    } catch (reason) {
      setError(readableError(reason))
    }
  }, [])

  useEffect(() => leave, [canPublish, leave, roomId])

  return {
    status,
    mode: modeState,
    microphoneDisabled,
    muted: microphoneDisabled || modeState === 'push-to-talk' && !pressing,
    pressing,
    deafened,
    speakingIds,
    error,
    needsPlayback,
    devices,
    selectedDeviceId,
    join,
    leave,
    setMode,
    setMicrophoneDisabled,
    startTalking,
    stopTalking,
    setDeafened,
    enablePlayback,
    selectDevice,
  }
}

export type RoomVoice = ReturnType<typeof useRoomVoice>
