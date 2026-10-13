import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import type { OnlineUser, VoiceTokenResponse } from '../src/online/protocol'

const TOKEN_TTL_SECONDS = 15 * 60

function publicVoiceUrl() {
  return process.env.LIVEKIT_URL?.trim() ?? ''
}

function apiVoiceUrl(url: string) {
  const configured = process.env.LIVEKIT_API_URL?.trim()
  if (configured) return configured
  return url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')
}

function credentials() {
  return {
    apiKey: process.env.LIVEKIT_API_KEY?.trim() ?? '',
    apiSecret: process.env.LIVEKIT_API_SECRET?.trim() ?? '',
  }
}

export function voiceIsConfigured() {
  const { apiKey, apiSecret } = credentials()
  return Boolean(publicVoiceUrl() && apiKey && apiSecret)
}

export function voiceRoomName(roomId: string) {
  return `river-ace-${roomId.toLowerCase()}`
}

export async function createVoiceToken(user: OnlineUser, roomId: string, role: 'player' | 'spectator'): Promise<VoiceTokenResponse> {
  const url = publicVoiceUrl()
  const { apiKey, apiSecret } = credentials()
  if (!url || !apiKey || !apiSecret) throw new Error('语音服务尚未配置')

  const roomName = voiceRoomName(roomId)
  const canPublish = role === 'player'
  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: user.username,
    ttl: TOKEN_TTL_SECONDS,
    metadata: JSON.stringify({ gameRoomId: roomId, role }),
  })
  accessToken.addGrant({
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish,
    canPublishData: false,
    canPublishSources: canPublish ? [TrackSource.MICROPHONE] : [],
  })

  return {
    url,
    token: await accessToken.toJwt(),
    roomName,
    canPublish,
    expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000,
  }
}

function roomService() {
  const url = publicVoiceUrl()
  const { apiKey, apiSecret } = credentials()
  if (!url || !apiKey || !apiSecret) return null
  return new RoomServiceClient(apiVoiceUrl(url), apiKey, apiSecret)
}

export function removeVoiceParticipant(roomId: string, userId: string) {
  const service = roomService()
  if (!service) return
  void service.removeParticipant(voiceRoomName(roomId), userId, {
    revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)),
  }).catch((error) => console.warn('移除语音参与者失败：', error instanceof Error ? error.message : error))
}

export function deleteVoiceRoom(roomId: string) {
  const service = roomService()
  if (!service) return
  void service.deleteRoom(voiceRoomName(roomId))
    .catch((error) => console.warn('清理语音房间失败：', error instanceof Error ? error.message : error))
}
