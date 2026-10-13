import assert from 'node:assert/strict'
import { unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import WebSocket from 'ws'
import { TokenVerifier } from 'livekit-server-sdk'
import type { ClientMessage, RoomView, ServerMessage } from '../src/online/protocol'

const port = 8799
const storePath = resolve(`server/data/e2e-${Date.now()}.json`)
process.env.PORT = String(port)
process.env.TURN_MS = '3000'
process.env.NEXT_HAND_MS = '3000'
process.env.DISCONNECT_GRACE_MS = '600'
process.env.RIVER_ACE_DATA = storePath
process.env.LIVEKIT_URL = 'wss://voice.test.invalid'
process.env.LIVEKIT_API_KEY = 'e2e-key'
process.env.LIVEKIT_API_SECRET = 'e2e-secret-with-enough-entropy'
await import('./index')

const base = `http://127.0.0.1:${port}`
const stamp = Date.now().toString(36)

async function register(username: string) {
  const response = await fetch(`${base}/api/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'test-pass-123' }),
  })
  assert.equal(response.status, 201)
  return response.json() as Promise<{ token: string; user: { id: string; username: string } }>
}

class Client {
  ws: WebSocket
  messages: ServerMessage[] = []
  room?: RoomView
  constructor(token: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`)
    this.ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as ServerMessage
      this.messages.push(message)
      if (message.type === 'room') this.room = message.room
      if (message.type === 'leftRoom') this.room = undefined
    })
  }
  send(message: ClientMessage) { this.ws.send(JSON.stringify(message)) }
  async wait(predicate: () => boolean, timeout = 4000) {
    const started = Date.now()
    while (!predicate()) {
      if (Date.now() - started > timeout) throw new Error(`等待在线状态超时：${JSON.stringify(this.messages.slice(-3))}`)
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20))
    }
  }
}

const aliceAccount = await register(`Alice_${stamp}`)
const bobAccount = await register(`Bob_${stamp}`)
const watcherAccount = await register(`Watch_${stamp}`)
const watcher2Account = await register(`Watch2_${stamp}`)
const alice = new Client(aliceAccount.token)
const bob = new Client(bobAccount.token)
const watcher = new Client(watcherAccount.token)
const watcher2 = new Client(watcher2Account.token)

try {
  await Promise.all([alice, bob, watcher, watcher2].map((client) => client.wait(() => client.ws.readyState === WebSocket.OPEN)))
  alice.send({ type: 'createRoom', name: 'E2E 好友房', password: 'room-pass', maxPlayers: 4 })
  await alice.wait(() => Boolean(alice.room))
  const roomId = alice.room!.id
  alice.send({ type: 'addBot', personality: 'tight' })
  await alice.wait(() => alice.room?.players.filter((player) => player.isBot).length === 1)
  alice.send({ type: 'addBot', personality: 'aggressive' })
  await alice.wait(() => alice.room?.players.filter((player) => player.isBot).length === 2)
  const removedBotId = alice.room!.players.find((player) => player.isBot)!.id
  alice.send({ type: 'removeBot', botId: removedBotId })
  await alice.wait(() => alice.room?.players.some((player) => player.id === removedBotId) === false)
  alice.send({ type: 'addBot', personality: 'balanced' })
  await alice.wait(() => alice.room?.players.filter((player) => player.isBot).length === 2)
  bob.send({ type: 'joinRoom', roomId, password: 'room-pass' })
  watcher.send({ type: 'spectateRoom', roomId, password: 'room-pass' })
  watcher2.send({ type: 'spectateRoom', roomId, password: 'room-pass' })
  await Promise.all([alice.wait(() => alice.room?.players.length === 4 && alice.room.spectators === 2), bob.wait(() => bob.room?.players.length === 4), watcher.wait(() => watcher.room?.viewerRole === 'spectator')])

  alice.send({ type: 'quickMessage', messageId: 'shine-shoes' })
  await Promise.all([bob, watcher].map((client) => client.wait(() => client.messages.some((message) =>
    message.type === 'quickMessage' && message.userId === aliceAccount.user.id && message.messageId === 'shine-shoes',
  ))))
  alice.send({ type: 'quickMessage', messageId: 'check-cards' })
  alice.send({ type: 'quickMessage', messageId: 'cards-ok' })
  alice.send({ type: 'quickMessage', messageId: 'great-hand' })
  await bob.wait(() => bob.messages.filter((message) => message.type === 'quickMessage' && message.userId === aliceAccount.user.id).length === 3)
  await alice.wait(() => alice.messages.some((message) => message.type === 'error' && message.message.includes('快捷语连发冷却中')))

  const voiceHeaders = (token: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' })
  const playerVoiceResponse = await fetch(`${base}/api/voice/token`, { method: 'POST', headers: voiceHeaders(aliceAccount.token), body: JSON.stringify({ roomId }) })
  const playerVoice = await playerVoiceResponse.json() as { token: string; url: string; canPublish: boolean; roomName: string }
  assert.equal(playerVoiceResponse.status, 200)
  assert.equal(playerVoice.url, 'wss://voice.test.invalid')
  assert.equal(playerVoice.roomName, `river-ace-${roomId.toLowerCase()}`)
  assert.equal(playerVoice.canPublish, true)
  const verifier = new TokenVerifier('e2e-key', 'e2e-secret-with-enough-entropy')
  const playerGrant = await verifier.verify(playerVoice.token)
  assert.equal(playerGrant.sub, aliceAccount.user.id)
  assert.equal(playerGrant.video?.room, playerVoice.roomName)
  assert.equal(playerGrant.video?.canPublish, true)

  const spectatorVoiceResponse = await fetch(`${base}/api/voice/token`, { method: 'POST', headers: voiceHeaders(watcherAccount.token), body: JSON.stringify({ roomId }) })
  const spectatorVoice = await spectatorVoiceResponse.json() as { token: string; canPublish: boolean }
  const spectatorGrant = await verifier.verify(spectatorVoice.token)
  assert.equal(spectatorVoiceResponse.status, 200)
  assert.equal(spectatorVoice.canPublish, false)
  assert.equal(spectatorGrant.video?.canPublish, false)
  assert.equal((await fetch(`${base}/api/voice/token`, { method: 'POST' })).status, 401)

  delete process.env.LIVEKIT_URL
  delete process.env.LIVEKIT_API_KEY
  delete process.env.LIVEKIT_API_SECRET
  watcher2.ws.close()
  await alice.wait(() => alice.room?.spectators === 1)

  const aliceMirror = new Client(aliceAccount.token)
  await aliceMirror.wait(() => aliceMirror.room?.id === roomId)
  aliceMirror.ws.close()
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 80))
  assert.equal(alice.room!.players.find((player) => player.id === aliceAccount.user.id)?.connected, true)

  alice.send({ type: 'startGame' })
  await Promise.all([alice.wait(() => Boolean(alice.room?.game)), bob.wait(() => Boolean(bob.room?.game)), watcher.wait(() => Boolean(watcher.room?.game))])
  assert.equal(alice.room!.game!.players.find((player) => player.id === aliceAccount.user.id)!.holeCards.length, 2)
  assert.equal(alice.room!.game!.players.find((player) => player.id === bobAccount.user.id)!.holeCards.length, 0)
  assert.ok(watcher.room!.game!.players.every((player) => player.holeCards.length === 0))
  assert.equal(alice.room!.game!.players.filter((player) => player.isBot).length, 2)
  assert.equal('deck' in alice.room!.game!, false)

  bob.ws.close()
  await alice.wait(() => alice.room!.game!.players.find((player) => player.id === bobAccount.user.id)?.connected === false)
  const bobReconnected = new Client(bobAccount.token)
  await bobReconnected.wait(() => Boolean(bobReconnected.room?.game))
  await alice.wait(() => alice.room!.game!.players.find((player) => player.id === bobAccount.user.id)?.connected === true)

  const clients = new Map([[aliceAccount.user.id, alice], [bobAccount.user.id, bobReconnected]])
  for (let step = 0; step < 60 && alice.room?.game?.phase !== 'SETTLEMENT'; step += 1) {
    const game = alice.room!.game!
    const actor = game.players.find((player) => player.seat === game.currentPlayerSeat)!
    const previousLength = game.actionHistory.length
    if (actor.isBot) {
      await alice.wait(() => alice.room?.game?.phase === 'SETTLEMENT' || (alice.room?.game?.actionHistory.length ?? 0) > previousLength, 5000)
    } else {
      const client = clients.get(actor.id)!
      await client.wait(() => Boolean(client.room?.legalActions?.actions.length))
      const legal = client.room!.legalActions!
      const action = legal.actions.includes('check') ? { type: 'check' as const } : { type: 'call' as const }
      client.send({ type: 'action', action })
      await alice.wait(() => alice.room?.game?.phase === 'SETTLEMENT' || (alice.room?.game?.actionHistory.length ?? 0) > previousLength)
    }
  }
  await alice.wait(() => alice.room?.game?.phase === 'SETTLEMENT')
  await watcher.wait(() => watcher.room?.game?.phase === 'SETTLEMENT')
  assert.equal(watcher.room!.game!.players.filter((player) => !player.folded).every((player) => player.holeCards.length === 2), true)

  alice.send({ type: 'report', targetUserId: bobAccount.user.id, reason: '自动化测试举报记录' })
  await alice.wait(() => alice.messages.some((message) => message.type === 'notice'))
  const replayResponse = await fetch(`${base}/api/replays`, { headers: { authorization: `Bearer ${aliceAccount.token}` } })
  const replayList = await replayResponse.json() as Array<{ id: string }>
  assert.equal(replayResponse.status, 200)
  assert.ok(replayList.length >= 1)
  const detailResponse = await fetch(`${base}/api/replays/${replayList[0].id}`, { headers: { authorization: `Bearer ${aliceAccount.token}` } })
  assert.equal(detailResponse.status, 200)
  const rankingResponse = await fetch(`${base}/api/leaderboard`)
  const ranking = await rankingResponse.json() as Array<{ username: string; games: number }>
  assert.ok(ranking.some((entry) => entry.username === aliceAccount.user.username && entry.games === 1))

  alice.ws.close()
  await bobReconnected.wait(() => bobReconnected.room?.players.find((player) => player.id === aliceAccount.user.id)?.connected === false)
  await bobReconnected.wait(() => bobReconnected.room?.hostId === bobAccount.user.id)
  await bobReconnected.wait(() => bobReconnected.room?.players.some((player) => player.id === aliceAccount.user.id) === false, 5000)

  bobReconnected.ws.close()
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  const graceHealthResponse = await fetch(`${base}/api/health`)
  const graceHealth = await graceHealthResponse.json() as { rooms: number }
  assert.equal(graceHealth.rooms, 1)
  await watcher.wait(() => watcher.room === undefined, 3000)
  const healthResponse = await fetch(`${base}/api/health`)
  const health = await healthResponse.json() as { rooms: number }
  assert.equal(health.rooms, 0)

  console.log('在线 E2E 通过：语音令牌与发布权限、多标签页单房间、观战断开清理、断线宽限重连、房主转移、超时离桌、全员超时自动解散，以及原有完整牌局流程')
} finally {
  alice.ws.close()
  bob.ws.close()
  watcher.ws.close()
  watcher2.ws.close()
  setTimeout(() => {
    try { unlinkSync(storePath) } catch { /* ignore */ }
    process.exit(0)
  }, 100)
}

