import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { OnlineUser, ReplayDetail } from '../src/online/protocol'

interface AccountRecord extends OnlineUser {
  salt: string
  passwordHash: string
  token: string
}

export interface ReportRecord {
  id: string
  reporterId: string
  targetUserId: string
  roomId: string
  reason: string
  createdAt: string
}

interface StoreData {
  accounts: AccountRecord[]
  replays: ReplayDetail[]
  reports: ReportRecord[]
}

const dataPath = resolve(process.env.RIVER_ACE_DATA ?? 'server/data/store.json')
const emptyStore = (): StoreData => ({ accounts: [], replays: [], reports: [] })

function load(): StoreData {
  if (!existsSync(dataPath)) return emptyStore()
  try {
    return { ...emptyStore(), ...JSON.parse(readFileSync(dataPath, 'utf8')) }
  } catch {
    return emptyStore()
  }
}

const data = load()

function persist() {
  mkdirSync(dirname(dataPath), { recursive: true })
  writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8')
}

function publicUser(account: AccountRecord): OnlineUser {
  const { id, username, games, wins, profit, createdAt } = account
  return { id, username, games, wins, profit, createdAt }
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString('hex')
}

export function register(usernameInput: string, password: string): { user: OnlineUser; token: string } {
  const username = usernameInput.trim()
  if (!/^[\p{L}\p{N}_-]{2,16}$/u.test(username)) throw new Error('用户名需为 2～16 个文字、数字、下划线或短横线')
  if (password.length < 6 || password.length > 72) throw new Error('密码长度需为 6～72 位')
  if (data.accounts.some((account) => account.username.toLowerCase() === username.toLowerCase())) throw new Error('用户名已存在')
  const salt = randomBytes(16).toString('hex')
  const token = randomBytes(32).toString('hex')
  const account: AccountRecord = {
    id: randomBytes(12).toString('hex'), username, salt, token,
    passwordHash: hashPassword(password, salt), games: 0, wins: 0, profit: 0,
    createdAt: new Date().toISOString(),
  }
  data.accounts.push(account)
  persist()
  return { user: publicUser(account), token }
}

export function login(usernameInput: string, password: string): { user: OnlineUser; token: string } {
  const account = data.accounts.find((candidate) => candidate.username.toLowerCase() === usernameInput.trim().toLowerCase())
  if (!account) throw new Error('用户名或密码错误')
  const actual = Buffer.from(hashPassword(password, account.salt), 'hex')
  const expected = Buffer.from(account.passwordHash, 'hex')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('用户名或密码错误')
  account.token = randomBytes(32).toString('hex')
  persist()
  return { user: publicUser(account), token: account.token }
}

export function userByToken(token: string | undefined): OnlineUser | null {
  const account = token && data.accounts.find((candidate) => candidate.token === token)
  return account ? publicUser(account) : null
}

export function leaderboard(): OnlineUser[] {
  return data.accounts.map(publicUser).sort((a, b) => b.wins - a.wins || b.profit - a.profit || a.games - b.games).slice(0, 100)
}

export function recordHand(replay: ReplayDetail, participantIds: string[], winnerIds: string[], profits: Record<string, number>) {
  data.replays.unshift(replay)
  data.replays = data.replays.slice(0, 200)
  for (const id of participantIds) {
    const account = data.accounts.find((candidate) => candidate.id === id)
    if (!account) continue
    account.games += 1
    if (winnerIds.includes(id)) account.wins += 1
    account.profit += profits[id] ?? 0
  }
  persist()
}

export function replayList(userId: string): ReplayDetail[] {
  return data.replays.filter((replay) => replay.players.some((player) => player.id === userId)).slice(0, 30)
}

export function replayById(id: string, userId: string): ReplayDetail | null {
  const replay = data.replays.find((candidate) => candidate.id === id)
  return replay?.players.some((player) => player.id === userId) ? replay : null
}

export function saveReport(report: Omit<ReportRecord, 'id' | 'createdAt'>) {
  data.reports.push({ ...report, id: randomBytes(10).toString('hex'), createdAt: new Date().toISOString() })
  persist()
}

