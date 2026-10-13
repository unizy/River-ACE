import { useEffect } from 'react'
import type { RoomVoice } from './useRoomVoice'

function isTextEntry(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'))
}

export function VoiceControls({ voice, canPublish }: { voice: RoomVoice; canPublish: boolean }) {
  const { mode, startTalking, status, stopTalking } = voice
  useEffect(() => {
    if (!canPublish || status !== 'connected' || mode !== 'push-to-talk') return
    const keyDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyV' || event.repeat || isTextEntry(event.target)) return
      event.preventDefault()
      startTalking()
    }
    const keyUp = (event: KeyboardEvent) => {
      if (event.code !== 'KeyV') return
      event.preventDefault()
      stopTalking()
    }
    const stop = () => stopTalking()
    const visibility = () => { if (document.hidden) stop() }
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', visibility)
      stop()
    }
  }, [canPublish, mode, startTalking, status, stopTalking])

  if (voice.status === 'idle' || voice.status === 'error') return <section className="voice-panel compact-voice-panel">
    <div><strong>房间语音</strong><small>{canPublish ? '默认按住说话，避免意外收音' : '观战者可以收听房间语音'}</small></div>
    <button onClick={voice.join}>加入语音</button>
    {voice.error && <span className="voice-error">{voice.error}</span>}
  </section>

  if (voice.status === 'connecting') return <section className="voice-panel compact-voice-panel"><div><strong>房间语音</strong><small>正在连接并检查设备…</small></div><button disabled>连接中</button></section>

  return <section className="voice-panel">
    <div className="voice-status"><i className={voice.status === 'reconnecting' ? 'reconnecting' : ''} /><div><strong>房间语音</strong><small>{voice.status === 'reconnecting' ? '正在重连' : '已连接'} · {voice.speakingIds.size} 人正在说话</small></div></div>
    {canPublish && <div className="voice-mode" role="group" aria-label="发言模式">
      <button className={voice.mode === 'push-to-talk' ? 'active' : ''} onClick={() => voice.setMode('push-to-talk')}>按下发言</button>
      <button className={voice.mode === 'open-mic' ? 'active' : ''} onClick={() => voice.setMode('open-mic')}>自由发言</button>
    </div>}
    {canPublish && voice.mode === 'push-to-talk' && <button
      className={`push-to-talk ${voice.pressing ? 'talking' : ''}`}
      disabled={voice.microphoneDisabled || voice.status !== 'connected'}
      onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); voice.startTalking() }}
      onPointerUp={voice.stopTalking}
      onPointerCancel={voice.stopTalking}
      onLostPointerCapture={voice.stopTalking}
    >{voice.pressing ? '正在发言…松开结束' : '按住说话（V）'}</button>}
    <div className="voice-actions">
      {canPublish && <button className={voice.microphoneDisabled ? 'danger' : ''} onClick={() => voice.setMicrophoneDisabled(!voice.microphoneDisabled)}>{voice.microphoneDisabled ? '启用麦克风' : voice.muted ? '麦克风待机' : '关闭麦克风'}</button>}
      <button onClick={() => voice.setDeafened(!voice.deafened)}>{voice.deafened ? '恢复收听' : '关闭收听'}</button>
      {voice.needsPlayback && <button className="gold" onClick={voice.enablePlayback}>启用声音</button>}
      <button onClick={voice.leave}>退出语音</button>
    </div>
    {canPublish && voice.devices.length > 1 && <label className="voice-device">麦克风<select value={voice.selectedDeviceId} onChange={(event) => voice.selectDevice(event.target.value)}>
      {voice.devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `麦克风 ${index + 1}`}</option>)}
    </select></label>}
    {voice.error && <span className="voice-error">{voice.error}</span>}
  </section>
}
