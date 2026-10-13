import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { createBotView, decideBotAction, PERSONALITIES } from '../src/ai/index'
import { createGame, getLegalActions, performAction, startHand, startNextHand, type BotPersonality, type GameState, type LegalActionType, type PlayerAction } from '../src/game/index'
import type { ClientMessage, LobbyRoom, OnlineGameView, OnlineUser, ReplayDetail, RoomView, ServerMessage } from '../src/online/protocol'
import { leaderboard, login, recordHand, register, replayById, replayList, saveReport, userByToken } from './store'
import { createVoiceToken, deleteVoiceRoom, removeVoiceParticipant, voiceIsConfigured } from './voice'

const PORT = Number(process.env.PORT ?? 8787)
const TURN_MS = Number(process.env.TURN_MS ?? 25_000)
const RECONNECT_FOLD_MS = 2_500
const NEXT_HAND_MS = Number(process.env.NEXT_HAND_MS ?? 8_000)
const DISCONNECT_GRACE_MS = Number(process.env.DISCONNECT_GRACE_MS ?? 30_000)
const distRoot = resolve('dist')

interface Member {
  user: OnlineUser
  connected: boolean
  leaving: boolean
  isBot: boolean
  personality?: BotPersonality
  disconnectTimer?: NodeJS.Timeout
}
interface Room {
  id: string
  name: string
  hostId: string
  maxPlayers: number
  passwordSalt?: string
  passwordHash?: string
  status: 'waiting' | 'playing'
  players: Member[]
  spectators: Map<string, OnlineUser>
  game?: GameState
  actionDeadline?: number
  turnTimer?: NodeJS.Timeout
  nextHandTimer?: NodeJS.Timeout
  savedSettlement?: string
  lastAction?: { playerId: string; type: LegalActionType } | null
}

interface ConnectionMeta {
  user: OnlineUser
  roomId?: string
  role?: 'player' | 'spectator'
  messageTimes: number[]
  invalidActions: number
}

const rooms = new Map<string, Room>()
const connections = new Map<string, Set<WebSocket>>()
const meta = new WeakMap<WebSocket, ConnectionMeta>()

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' })
  res.end(JSON.stringify(value))
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 16_384) throw new Error('请求内容过大')
  }
  return raw ? JSON.parse(raw) : {}
}

function bearer(req: IncomingMessage) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, '')
}

function mime(path: string) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg' } as Record<string, string>)[extname(path)] ?? 'application/octet-stream'
}

const httpServer = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' })
      return res.end()
    }
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    if (req.method === 'POST' && url.pathname === '/api/register') {
      const value = await body(req)
      return json(res, 201, register(String(value.username ?? ''), String(value.password ?? '')))
    }
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const value = await body(req)
      return json(res, 200, login(String(value.username ?? ''), String(value.password ?? '')))
    }
    if (req.method === 'GET' && url.pathname === '/api/leaderboard') return json(res, 200, leaderboard())
    if (req.method === 'GET' && url.pathname === '/api/replays') {
      const user = userByToken(bearer(req))
      return user ? json(res, 200, replayList(user.id)) : json(res, 401, { error: '请先登录' })
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/replays/')) {
      const user = userByToken(bearer(req))
      const replay = user && replayById(url.pathname.split('/').pop()!, user.id)
      return replay ? json(res, 200, replay) : json(res, user ? 404 : 401, { error: user ? '回放不存在' : '请先登录' })
    }
    if (req.method === 'POST' && url.pathname === '/api/voice/token') {
      const user = userByToken(bearer(req))
      if (!user) return json(res, 401, { error: '请先登录' })
      if (!voiceIsConfigured()) return json(res, 503, { error: '语音服务尚未配置，请联系管理员' })
      const value = await body(req)
      const requestedRoomId = String(value.roomId ?? '').toUpperCase()
      const room = [...rooms.values()].find((candidate) => {
        if (requestedRoomId && candidate.id !== requestedRoomId) return false
        return candidate.players.some((member) => member.user.id === user.id && !member.isBot && !member.leaving)
          || candidate.spectators.has(user.id)
      })
      if (!room) return json(res, 403, { error: '你当前不在该房间内' })
      const member = room.players.find((candidate) => candidate.user.id === user.id)
      if (member && !member.connected) return json(res, 403, { error: '游戏连接已断开，恢复连接后才能加入语音' })
      const role = member ? 'player' : 'spectator'
      return json(res, 200, await createVoiceToken(user, room.id, role))
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, rooms: rooms.size })

    const requested = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '')
    const filePath = resolve(distRoot, requested)
    const safePath = filePath.startsWith(distRoot) && existsSync(filePath) ? filePath : join(distRoot, 'index.html')
    if (existsSync(safePath)) {
      res.writeHead(200, { 'content-type': mime(safePath) })
      return res.end(readFileSync(safePath))
    }
    json(res, 404, { error: '未找到资源，请先运行 pnpm build' })
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : '请求失败' })
  }
})

const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

function send(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message))
}

function socketsFor(userId: string) {
  return connections.get(userId) ?? new Set<WebSocket>()
}

function socketsInRoom(userId: string, roomId: string) {
  return [...socketsFor(userId)].filter((socket) => meta.get(socket)?.roomId === roomId)
}

function setUserRoom(userId: string, roomId: string | undefined, role: 'player' | 'spectator' | undefined) {
  for (const socket of socketsFor(userId)) {
    const info = meta.get(socket)
    if (!info) continue
    info.roomId = roomId
    info.role = role
  }
}

function lobbyRooms(): LobbyRoom[] {
  return [...rooms.values()].map((room) => ({
    id: room.id, name: room.name, hostName: room.players.find((member) => member.user.id === room.hostId)?.user.username ?? '房主',
    playerCount: room.players.length, maxPlayers: room.maxPlayers, spectatorCount: room.spectators.size,
    hasPassword: Boolean(room.passwordHash), status: room.status,
  }))
}

function broadcastLobby() {
  const message: ServerMessage = { type: 'lobby', rooms: lobbyRooms() }
  for (const sockets of connections.values()) for (const ws of sockets) send(ws, message)
}

function passwordMatches(room: Room, password = '') {
  if (!room.passwordHash || !room.passwordSalt) return true
  const actual = scryptSync(password, room.passwordSalt, 32)
  const expected = Buffer.from(room.passwordHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function viewerGame(room: Room, viewerId: string): OnlineGameView | undefined {
  if (!room.game) return undefined
  const revealShowdown = room.game.phase === 'SETTLEMENT'
  return {
    ...structuredClone(room.game),
    players: room.game.players.map((player) => ({
      id: player.id, name: player.name, seat: player.seat, chips: player.chips,
      holeCards: player.id === viewerId || (revealShowdown && !player.folded) ? player.holeCards : [],
      hasCards: player.holeCards.length === 2, streetContribution: player.streetContribution,
      totalContribution: player.totalContribution, folded: player.folded, allIn: player.allIn,
      connected: room.players.find((member) => member.user.id === player.id)?.connected ?? false,
      isBot: room.players.find((member) => member.user.id === player.id)?.isBot ?? false,
    })),
    deck: undefined,
    lastAction: room.lastAction ?? null,
  } as unknown as OnlineGameView
}

function roomView(room: Room, viewerId: string, role: 'player' | 'spectator'): RoomView {
  const game = viewerGame(room, viewerId)
  const viewerSeat = room.game?.players.find((player) => player.id === viewerId)?.seat
  return {
    id: room.id, name: room.name, hostId: room.hostId, maxPlayers: room.maxPlayers,
    hasPassword: Boolean(room.passwordHash), status: room.status,
    players: room.players.map((member, seat) => ({
      id: member.user.id, name: member.user.username, seat,
      chips: room.game?.players.find((player) => player.id === member.user.id)?.chips ?? 2000,
      connected: member.connected, isBot: member.isBot, personality: member.personality,
    })),
    spectators: room.spectators.size, viewerRole: role, game,
    legalActions: role === 'player' && room.game && viewerSeat !== undefined && viewerSeat === room.game.currentPlayerSeat
      ? getLegalActions(room.game, viewerSeat)
      : undefined,
    actionDeadline: room.actionDeadline,
  }
}

function broadcastRoom(room: Room) {
  for (const member of room.players) for (const ws of socketsFor(member.user.id)) {
    const info = meta.get(ws)
    if (info?.roomId === room.id) send(ws, { type: 'room', room: roomView(room, member.user.id, 'player') })
  }
  for (const spectator of room.spectators.values()) for (const ws of socketsFor(spectator.id)) {
    const info = meta.get(ws)
    if (info?.roomId === room.id) send(ws, { type: 'room', room: roomView(room, spectator.id, 'spectator') })
  }
}

function clearTimers(room: Room) {
  if (room.turnTimer) clearTimeout(room.turnTimer)
  if (room.nextHandTimer) clearTimeout(room.nextHandTimer)
  for (const member of room.players) if (member.disconnectTimer) clearTimeout(member.disconnectTimer)
  room.turnTimer = undefined
  room.nextHandTimer = undefined
}

function hasRetainedHuman(room: Room) {
  return room.players.some((member) => !member.isBot && !member.leaving)
}

function ensureHost(room: Room) {
  const current = room.players.find((member) => member.user.id === room.hostId)
  if (current && !current.isBot && !current.leaving) return
  const replacement = room.players.find((member) => !member.isBot && !member.leaving && member.connected)
    ?? room.players.find((member) => !member.isBot && !member.leaving)
  if (replacement) room.hostId = replacement.user.id
}

function dissolveRoom(room: Room) {
  clearTimers(room)
  rooms.delete(room.id)
  deleteVoiceRoom(room.id)
  const userIds = new Set([
    ...room.players.filter((member) => !member.isBot).map((member) => member.user.id),
    ...room.spectators.keys(),
  ])
  for (const userId of userIds) for (const socket of socketsFor(userId)) {
    const info = meta.get(socket)
    if (info?.roomId !== room.id) continue
    info.roomId = undefined
    info.role = undefined
    send(socket, { type: 'leftRoom' })
    send(socket, { type: 'notice', message: '房间内已无在线玩家，房间已自动解散。' })
  }
  broadcastLobby()
}

function expireDisconnectedPlayer(room: Room, userId: string) {
  if (!rooms.has(room.id)) return
  const member = room.players.find((candidate) => candidate.user.id === userId)
  if (!member || member.connected) return
  member.disconnectTimer = undefined
  member.leaving = true
  removeVoiceParticipant(room.id, userId)
  if (room.status === 'waiting') room.players = room.players.filter((candidate) => candidate !== member)
  ensureHost(room)
  if (!hasRetainedHuman(room)) return dissolveRoom(room)
  broadcastRoom(room)
  broadcastLobby()
}

function scheduleDisconnectExpiry(room: Room, member: Member) {
  if (member.disconnectTimer) clearTimeout(member.disconnectTimer)
  member.disconnectTimer = setTimeout(() => expireDisconnectedPlayer(room, member.user.id), DISCONNECT_GRACE_MS)
}

function recordSettlement(room: Room) {
  const game = room.game!
  const signature = `${game.handNumber}:${game.actionHistory.length}`
  if (room.savedSettlement === signature) return
  room.savedSettlement = signature
  const totalPot = game.pots.reduce((sum, pot) => sum + pot.amount, 0)
  const replay: ReplayDetail = {
    id: randomBytes(10).toString('hex'), roomName: room.name, handNumber: game.handNumber,
    completedAt: new Date().toISOString(), winnerNames: game.winners.map((winner) => game.players.find((player) => player.id === winner.playerId)?.name ?? '玩家'),
    pot: totalPot, communityCards: game.communityCards,
    players: game.players.map((player) => ({
      id: player.id, name: player.name, seat: player.seat,
      holeCards: player.folded ? [] : player.holeCards, folded: player.folded, contribution: player.totalContribution,
    })), winners: game.winners, pots: game.pots, actionHistory: game.actionHistory,
  }
  const awards: Record<string, number> = {}
  for (const pot of game.pots) for (const [playerId, amount] of Object.entries(pot.awards)) awards[playerId] = (awards[playerId] ?? 0) + amount
  const profits = Object.fromEntries(game.players.map((player) => [player.id, (awards[player.id] ?? 0) - player.totalContribution]))
  recordHand(replay, game.players.map((player) => player.id), game.winners.map((winner) => winner.playerId), profits)
}

function beginNextHand(room: Room) {
  if (room.players.some((member) => !member.isBot && !member.connected && !member.leaving)) {
    room.nextHandTimer = setTimeout(() => beginNextHand(room), 500)
    return
  }
  const retained = room.players.filter((member) => !member.leaving)
  room.players = retained
  ensureHost(room)
  if (retained.length < 2 || !room.game) {
    room.status = 'waiting'
    room.game = undefined
    room.actionDeadline = undefined
    broadcastRoom(room)
    broadcastLobby()
    return
  }
  const retainedIds = new Set(retained.map((member) => member.user.id))
  if (room.game.players.some((player) => !retainedIds.has(player.id))) {
    room.game = createGame(retained.map((member) => ({
      id: member.user.id, name: member.user.username, isHuman: !member.isBot, personality: member.personality,
      chips: room.game?.players.find((player) => player.id === member.user.id)?.chips || room.game?.config.startingChips,
    })))
    room.game = startHand(room.game)
  } else {
    for (const player of room.game.players) if (player.chips === 0) player.chips = room.game.config.startingChips
    room.game = startNextHand(room.game, undefined, false)
  }
  room.savedSettlement = undefined
  scheduleTurn(room)
}

function applyAction(room: Room, seat: number, action: PlayerAction) {
  if (!room.game) return
  const actor = room.game.players.find((player) => player.seat === seat)
  room.game = performAction(room.game, seat, action)
  room.lastAction = actor ? { playerId: actor.id, type: action.type } : null
  afterGameChange(room)
}

function afterGameChange(room: Room) {
  if (room.game?.phase === 'SETTLEMENT') {
    if (room.turnTimer) clearTimeout(room.turnTimer)
    room.actionDeadline = undefined
    recordSettlement(room)
    broadcastRoom(room)
    broadcastLobby()
    room.nextHandTimer = setTimeout(() => beginNextHand(room), NEXT_HAND_MS)
    return
  }
  scheduleTurn(room)
}

function scheduleTurn(room: Room) {
  if (room.turnTimer) clearTimeout(room.turnTimer)
  if (!room.game || room.game.currentPlayerSeat === null) return afterGameChange(room)
  const actor = room.game.players.find((player) => player.seat === room.game!.currentPlayerSeat)!
  const member = room.players.find((candidate) => candidate.user.id === actor.id)
  const duration = member?.isBot ? 700 : member?.connected ? TURN_MS : RECONNECT_FOLD_MS
  room.actionDeadline = Date.now() + duration
  broadcastRoom(room)
  room.turnTimer = setTimeout(() => {
    if (!room.game || room.game.phase === 'SETTLEMENT') return
    const seat = room.game.currentPlayerSeat
    if (seat === null) return
    const legal = getLegalActions(room.game, seat)
    let action: PlayerAction = legal.actions.includes('check') ? { type: 'check' } : { type: 'fold' }
    if (member?.isBot) {
      try { action = decideBotAction(createBotView(room.game, seat), 'normal').action } catch { /* use safe fallback */ }
    }
    applyAction(room, seat, action)
  }, duration)
}

function detach(ws: WebSocket, announce = true) {
  const info = meta.get(ws)
  if (!info?.roomId) return
  const room = rooms.get(info.roomId)
  if (!room) return
  const userId = info.user.id
  removeVoiceParticipant(room.id, userId)
  if (info.role === 'spectator') room.spectators.delete(userId)
  else {
    const member = room.players.find((candidate) => candidate.user.id === userId)
    if (member) {
      if (member.disconnectTimer) clearTimeout(member.disconnectTimer)
      member.disconnectTimer = undefined
      if (room.status === 'waiting') room.players = room.players.filter((candidate) => candidate !== member)
      else { member.leaving = true; member.connected = false }
    }
  }
  setUserRoom(userId, undefined, undefined)
  if (announce) for (const socket of socketsFor(userId)) send(socket, { type: 'leftRoom' })
  ensureHost(room)
  if (!hasRetainedHuman(room)) {
    dissolveRoom(room)
  } else {
    const leavingSeat = room.game?.players.find((player) => player.id === userId)?.seat
    if (room.game?.currentPlayerSeat === leavingSeat) scheduleTurn(room)
    else broadcastRoom(room)
  }
  if (rooms.has(room.id)) broadcastLobby()
}

function joinRoom(ws: WebSocket, room: Room, role: 'player' | 'spectator', password?: string) {
  const info = meta.get(ws)!
  const existing = room.players.find((member) => member.user.id === info.user.id)
  const existingSpectator = room.spectators.has(info.user.id)
  if (!existing && !existingSpectator && !passwordMatches(room, password)) throw new Error('房间密码错误')
  if (info.roomId && info.roomId !== room.id) detach(ws, false)
  const effectiveRole = existing ? 'player' : role
  if (effectiveRole === 'player') {
    if (!existing && room.status === 'playing') throw new Error('牌局进行中，请先观战')
    if (!existing && room.players.length >= room.maxPlayers) throw new Error('房间已满')
    room.spectators.delete(info.user.id)
    if (existing) {
      if (existing.disconnectTimer) clearTimeout(existing.disconnectTimer)
      existing.disconnectTimer = undefined
      existing.connected = true
      existing.leaving = false
    } else room.players.push({ user: info.user, connected: true, leaving: false, isBot: false })
  } else {
    room.spectators.set(info.user.id, info.user)
  }
  setUserRoom(info.user.id, room.id, effectiveRole)
  broadcastRoom(room)
  broadcastLobby()
}

function createRoom(ws: WebSocket, message: Extract<ClientMessage, { type: 'createRoom' }>) {
  const info = meta.get(ws)!
  if (message.maxPlayers < 2 || message.maxPlayers > 10) throw new Error('房间人数必须为 2～10 人')
  const name = message.name.trim().slice(0, 24)
  if (!name) throw new Error('请输入房间名称')
  detach(ws, false)
  const id = randomBytes(4).toString('hex').toUpperCase()
  const room: Room = { id, name, hostId: info.user.id, maxPlayers: message.maxPlayers, status: 'waiting', players: [], spectators: new Map() }
  if (message.password) {
    room.passwordSalt = randomBytes(12).toString('hex')
    room.passwordHash = scryptSync(message.password, room.passwordSalt, 32).toString('hex')
  }
  rooms.set(id, room)
  joinRoom(ws, room, 'player', message.password)
}

function handle(ws: WebSocket, message: ClientMessage) {
  const info = meta.get(ws)!
  const now = Date.now()
  info.messageTimes = info.messageTimes.filter((time) => now - time < 10_000)
  if (info.messageTimes.length >= 40) throw new Error('操作过于频繁')
  info.messageTimes.push(now)
  if (message.type === 'ping') return send(ws, { type: 'pong', sentAt: message.sentAt })
  if (message.type === 'listRooms') return send(ws, { type: 'lobby', rooms: lobbyRooms() })
  if (message.type === 'createRoom') return createRoom(ws, message)
  if (message.type === 'joinRoom' || message.type === 'spectateRoom') {
    const room = rooms.get(message.roomId.toUpperCase())
    if (!room) throw new Error('房间不存在')
    return joinRoom(ws, room, message.type === 'joinRoom' ? 'player' : 'spectator', message.password)
  }
  if (message.type === 'leaveRoom') return detach(ws)
  const room = info.roomId && rooms.get(info.roomId)
  if (!room) throw new Error('请先进入房间')
  if (message.type === 'addBot') {
    if (room.hostId !== info.user.id || info.role !== 'player') throw new Error('只有房主可以添加机器人')
    if (room.status !== 'waiting') throw new Error('只能在开局前添加机器人')
    if (room.players.length >= room.maxPlayers) throw new Error('房间已满')
    if (!(message.personality in PERSONALITIES)) throw new Error('未知的机器人类型')
    const profile = PERSONALITIES[message.personality]
    const sameTypeCount = room.players.filter((member) => member.isBot && member.personality === message.personality).length
    const botNumber = sameTypeCount + 1
    const bot: OnlineUser = {
      id: `bot-${randomBytes(8).toString('hex')}`,
      username: `${profile.name}机器人${botNumber > 1 ? ` ${botNumber}` : ''}`,
      games: 0, wins: 0, profit: 0, createdAt: new Date().toISOString(),
    }
    room.players.push({ user: bot, connected: true, leaving: false, isBot: true, personality: message.personality })
    broadcastRoom(room)
    return broadcastLobby()
  }
  if (message.type === 'removeBot') {
    if (room.hostId !== info.user.id || info.role !== 'player') throw new Error('只有房主可以移除机器人')
    if (room.status !== 'waiting') throw new Error('只能在开局前移除机器人')
    const bot = room.players.find((member) => member.user.id === message.botId && member.isBot)
    if (!bot) throw new Error('机器人不存在')
    room.players = room.players.filter((member) => member !== bot)
    broadcastRoom(room)
    return broadcastLobby()
  }
  if (message.type === 'startGame') {
    if (room.hostId !== info.user.id) throw new Error('只有房主可以开始')
    if (room.status !== 'waiting') throw new Error('牌局已经开始')
    if (room.players.length < 2) throw new Error('至少需要两名玩家')
    room.game = startHand(createGame(room.players.map((member) => ({
      id: member.user.id, name: member.user.username, isHuman: !member.isBot, personality: member.personality,
    }))))
    room.status = 'playing'
    room.savedSettlement = undefined
    room.lastAction = null
    return scheduleTurn(room)
  }
  if (message.type === 'action') {
    if (info.role !== 'player' || !room.game) throw new Error('观战者不能操作')
    const actor = room.game.players.find((player) => player.seat === room.game!.currentPlayerSeat)
    if (actor?.id !== info.user.id) {
      info.invalidActions += 1
      throw new Error('尚未轮到你行动')
    }
    try {
      applyAction(room, actor.seat, message.action)
      info.invalidActions = 0
      return
    } catch (error) {
      info.invalidActions += 1
      if (info.invalidActions >= 5) saveReport({ reporterId: 'system', targetUserId: info.user.id, roomId: room.id, reason: '连续提交非法动作' })
      throw error
    }
  }
  if (message.type === 'report') {
    if (!room.players.some((member) => member.user.id === message.targetUserId)) throw new Error('举报目标不在当前房间')
    const reason = message.reason.trim().slice(0, 300)
    if (reason.length < 4) throw new Error('请填写至少 4 个字的原因')
    saveReport({ reporterId: info.user.id, targetUserId: message.targetUserId, roomId: room.id, reason })
    return send(ws, { type: 'notice', message: '举报已记录，管理员会结合服务端操作日志核查。' })
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/ws', `http://${req.headers.host ?? 'localhost'}`)
  const user = userByToken(url.searchParams.get('token') ?? undefined)
  if (!user) return ws.close(4001, '未登录')
  const info: ConnectionMeta = { user, messageTimes: [], invalidActions: 0 }
  meta.set(ws, info)
  const userSockets = connections.get(user.id) ?? new Set<WebSocket>()
  userSockets.add(ws)
  connections.set(user.id, userSockets)
  send(ws, { type: 'hello', user })
  send(ws, { type: 'lobby', rooms: lobbyRooms() })

  const reconnectRoom = [...rooms.values()].find((room) => room.players.some((member) => member.user.id === user.id && !member.leaving))
  const reconnectSpectatorRoom = [...rooms.values()].find((room) => room.spectators.has(user.id))
  if (reconnectRoom) joinRoom(ws, reconnectRoom, 'player')
  else if (reconnectSpectatorRoom) joinRoom(ws, reconnectSpectatorRoom, 'spectator')
  else send(ws, { type: 'leftRoom' })

  ws.on('message', (raw) => {
    try {
      if (raw.toString().length > 8_192) throw new Error('消息过大')
      handle(ws, JSON.parse(raw.toString()) as ClientMessage)
    } catch (error) {
      send(ws, { type: 'error', message: error instanceof Error ? error.message : '操作失败' })
    }
  })
  ws.on('close', () => {
    userSockets.delete(ws)
    if (userSockets.size === 0) connections.delete(user.id)
    const room = info.roomId ? rooms.get(info.roomId) : undefined
    if (!room || socketsInRoom(user.id, room.id).length > 0) return
    if (info.role === 'spectator') {
      room.spectators.delete(user.id)
      removeVoiceParticipant(room.id, user.id)
      broadcastRoom(room)
      return broadcastLobby()
    }
    const member = room.players.find((candidate) => candidate.user.id === user.id)
    if (!member) return
    member.connected = false
    scheduleDisconnectExpiry(room, member)
    const game = room.game
    if (game && game.currentPlayerSeat === game.players.find((player) => player.id === user.id)?.seat) scheduleTurn(room)
    else broadcastRoom(room)
    broadcastLobby()
  })
})

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`River Ace online server: http://localhost:${PORT}`)
})

