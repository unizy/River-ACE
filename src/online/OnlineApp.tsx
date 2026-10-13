import { useEffect, useMemo, useRef, useState } from 'react'
import { PERSONALITIES, PERSONALITY_ORDER } from '../ai'
import { buildWinnerExplanations, formatCard, type BotPersonality, type Card, type GameState, type LegalActionType, type PlayerAction } from '../game'
import type { ClientMessage, LobbyRoom, OnlineUser, ReplayDetail, ReplaySummary, RoomView, ServerMessage } from './protocol'
import { VoiceControls } from '../voice/VoiceControls'
import { useRoomVoice } from '../voice/useRoomVoice'
import { QuickMessageControls } from './QuickMessageControls'
import { QUICK_MESSAGE_AUDIO_ROOT, QUICK_MESSAGE_BY_ID, type QuickMessageId } from './quickMessages'
import './online.css'

const TOKEN_KEY = 'river-ace-online-token'

function CardView({ card, hidden, highlighted, winner }: { card?: Card; hidden?: boolean; highlighted?: boolean; winner?: boolean }) {
  if (hidden || !card) return <span className={`card card-back ${winner ? 'winner-hole-card' : ''}`}>R</span>
  const red = card.suit === 'hearts' || card.suit === 'diamonds'
  return <span className={`card ${red ? 'red' : ''} ${highlighted ? 'best-five-card' : ''} ${winner ? 'winner-hole-card' : ''}`}>{formatCard(card)}</span>
}

function apiHeaders(token?: string) {
  return { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }
}

export function OnlineApp({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '')
  const [user, setUser] = useState<OnlineUser | null>(null)
  const [connected, setConnected] = useState(false)
  const [rooms, setRooms] = useState<LobbyRoom[]>([])
  const [room, setRoom] = useState<RoomView | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [lobbyTab, setLobbyTab] = useState<'rooms' | 'ranking' | 'replays'>('rooms')
  const [leaderboard, setLeaderboard] = useState<OnlineUser[]>([])
  const [replays, setReplays] = useState<ReplaySummary[]>([])
  const [replay, setReplay] = useState<ReplayDetail | null>(null)
  const [roomName, setRoomName] = useState('好友牌桌')
  const [roomPassword, setRoomPassword] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [joinCode, setJoinCode] = useState(() => new URLSearchParams(window.location.search).get('room') ?? '')
  const [joinPassword, setJoinPassword] = useState('')
  const [raiseTo, setRaiseTo] = useState(20)
  const [remaining, setRemaining] = useState(0)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState('')
  const [reportReason, setReportReason] = useState('')
  const [quickMessages, setQuickMessages] = useState<Record<string, { messageId: QuickMessageId; sentAt: number }>>({})
  const socketRef = useRef<WebSocket | null>(null)
  const quickMessageTimers = useRef(new Map<string, number>())

  const send = (message: ClientMessage) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return setError('连接尚未恢复，请稍后重试')
    socketRef.current.send(JSON.stringify(message))
  }

  useEffect(() => {
    if (!token) return
    let stopped = false
    let retryTimer: number | undefined
    const connect = () => {
      const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const configured = import.meta.env.VITE_WS_URL as string | undefined
      const url = configured ?? `${scheme}//${window.location.host}/ws`
      const socket = new WebSocket(`${url}?token=${encodeURIComponent(token)}`)
      socketRef.current = socket
      socket.onopen = () => { setConnected(true); setError('') }
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage
        if (message.type === 'hello') setUser(message.user)
        else if (message.type === 'lobby') setRooms(message.rooms)
        else if (message.type === 'room') setRoom(message.room)
        else if (message.type === 'leftRoom') setRoom(null)
        else if (message.type === 'error') setError(message.message)
        else if (message.type === 'notice') { setNotice(message.message); setReportOpen(false); setReportReason('') }
        else if (message.type === 'quickMessage') {
          const quickMessage = QUICK_MESSAGE_BY_ID[message.messageId]
          setQuickMessages((previous) => ({ ...previous, [message.userId]: { messageId: message.messageId, sentAt: message.sentAt } }))
          const previousTimer = quickMessageTimers.current.get(message.userId)
          if (previousTimer) window.clearTimeout(previousTimer)
          quickMessageTimers.current.set(message.userId, window.setTimeout(() => {
            setQuickMessages((previous) => {
              if (previous[message.userId]?.sentAt !== message.sentAt) return previous
              const next = { ...previous }
              delete next[message.userId]
              return next
            })
            quickMessageTimers.current.delete(message.userId)
          }, 4_000))
          void new Audio(`${QUICK_MESSAGE_AUDIO_ROOT}/${quickMessage.audioFile}`).play().catch(() => undefined)
        }
      }
      socket.onclose = (event) => {
        if (socketRef.current === socket) socketRef.current = null
        setConnected(false)
        if (event.code === 4001) {
          localStorage.removeItem(TOKEN_KEY)
          setToken('')
          setUser(null)
          setError('登录已失效，请重新登录')
        } else if (!stopped) retryTimer = window.setTimeout(connect, 1500)
      }
    }
    connect()
    return () => {
      stopped = true
      if (retryTimer) window.clearTimeout(retryTimer)
      socketRef.current?.close()
      socketRef.current = null
      for (const timer of quickMessageTimers.current.values()) window.clearTimeout(timer)
      quickMessageTimers.current.clear()
    }
  }, [token])

  useEffect(() => {
    if (!room?.actionDeadline) return setRemaining(0)
    const update = () => setRemaining(Math.max(0, room.actionDeadline! - Date.now()))
    update()
    const timer = window.setInterval(update, 200)
    return () => window.clearInterval(timer)
  }, [room?.actionDeadline])

  useEffect(() => {
    const legal = room?.legalActions
    const minimum = legal?.minBet ?? legal?.minRaiseTo
    if (minimum !== null && minimum !== undefined) setRaiseTo(minimum)
  }, [room?.game?.currentPlayerSeat, room?.legalActions?.minBet, room?.legalActions?.minRaiseTo])

  useEffect(() => {
    if (!token || lobbyTab === 'rooms') return
    const path = lobbyTab === 'ranking' ? '/api/leaderboard' : '/api/replays'
    fetch(path, { headers: apiHeaders(token) }).then(async (response) => {
      const value = await response.json()
      if (!response.ok) throw new Error(value.error ?? '加载失败')
      if (lobbyTab === 'ranking') setLeaderboard(value)
      else setReplays(value)
    }).catch((reason) => setError(reason.message))
  }, [lobbyTab, token])

  const authenticate = async () => {
    setError('')
    try {
      const response = await fetch(`/api/${authMode}`, { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ username, password }) })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error ?? '登录失败')
      localStorage.setItem(TOKEN_KEY, value.token)
      setToken(value.token)
      setUser(value.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败')
    }
  }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken('')
    setUser(null)
    setRoom(null)
  }

  const openReplay = async (id: string) => {
    try {
      const response = await fetch(`/api/replays/${id}`, { headers: apiHeaders(token) })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error ?? '加载失败')
      setReplay(value)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加载失败')
    }
  }

  if (!token || !user) return (
    <main className="online-shell auth-shell">
      <section className="online-auth">
        <button className="text-button" onClick={onBack}>← 返回单机版</button>
        <p className="eyebrow">RIVER ACE ONLINE</p>
        <h1>{authMode === 'login' ? '登录在线牌桌' : '创建玩家账号'}</h1>
        <p>所有洗牌、筹码和合法动作均由服务器验证。仅使用虚拟筹码。</p>
        <label>用户名<input value={username} maxLength={16} autoComplete="username" onChange={(event) => setUsername(event.target.value)} /></label>
        <label>密码<input type="password" value={password} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <div className="online-alert error">{error}</div>}
        <button className="primary-wide" onClick={authenticate}>{authMode === 'login' ? '登录' : '注册并登录'}</button>
        <button className="text-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
          {authMode === 'login' ? '没有账号？立即注册' : '已有账号？返回登录'}
        </button>
      </section>
    </main>
  )

  if (room) return <OnlineRoom room={room} user={user} token={token} remaining={remaining} raiseTo={raiseTo} setRaiseTo={setRaiseTo}
    send={send} connected={connected} error={error} notice={notice} onBack={() => send({ type: 'leaveRoom' })}
    reportOpen={reportOpen} setReportOpen={setReportOpen} reportTarget={reportTarget} setReportTarget={setReportTarget}
    reportReason={reportReason} setReportReason={setReportReason} quickMessages={quickMessages} />

  return (
    <main className="online-shell">
      <header className="online-header">
        <div><p className="eyebrow">RIVER ACE ONLINE</p><h1>好友房大厅</h1></div>
        <div className="online-account"><span className={connected ? 'online-dot connected' : 'online-dot'} />
          <strong>{user.username}</strong><small>{connected ? '已连接' : '重连中'}</small>
          <button onClick={onBack}>单机版</button><button onClick={logout}>退出</button></div>
      </header>
      {(error || notice) && <div className={`online-alert ${error ? 'error' : ''}`}>{error || notice}</div>}
      <nav className="online-tabs">
        <button className={lobbyTab === 'rooms' ? 'active' : ''} onClick={() => setLobbyTab('rooms')}>好友房</button>
        <button className={lobbyTab === 'ranking' ? 'active' : ''} onClick={() => setLobbyTab('ranking')}>排行榜</button>
        <button className={lobbyTab === 'replays' ? 'active' : ''} onClick={() => setLobbyTab('replays')}>我的回放</button>
      </nav>
      {lobbyTab === 'rooms' && <section className="lobby-grid">
        <div className="online-panel">
          <h2>创建好友房</h2>
          <label>房间名称<input value={roomName} maxLength={24} onChange={(event) => setRoomName(event.target.value)} /></label>
          <label>房间密码（可选）<input type="password" value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} /></label>
          <label>人数<select value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))}>{Array.from({ length: 9 }, (_, index) => index + 2).map((count) => <option key={count}>{count}</option>)}</select></label>
          <button className="primary-wide" onClick={() => send({ type: 'createRoom', name: roomName, password: roomPassword, maxPlayers })}>创建房间</button>
          <hr />
          <h2>通过邀请码加入</h2>
          <label>房间码<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /></label>
          <label>密码<input type="password" value={joinPassword} onChange={(event) => setJoinPassword(event.target.value)} /></label>
          <div className="split-buttons"><button onClick={() => send({ type: 'joinRoom', roomId: joinCode, password: joinPassword })}>加入牌局</button>
            <button onClick={() => send({ type: 'spectateRoom', roomId: joinCode, password: joinPassword })}>观战</button></div>
        </div>
        <div className="online-panel room-browser"><div className="panel-title"><h2>当前房间</h2><button onClick={() => send({ type: 'listRooms' })}>刷新</button></div>
          {rooms.length === 0 ? <p className="empty-copy">暂无房间，创建一个并把邀请链接发给朋友。</p> : rooms.map((candidate) => <article key={candidate.id}>
            <div><strong>{candidate.name}</strong><small>{candidate.hostName} · {candidate.id} {candidate.hasPassword ? '🔒' : ''}</small></div>
            <span>{candidate.playerCount}/{candidate.maxPlayers} 人 · {candidate.spectatorCount} 观战</span>
            <em>{candidate.status === 'playing' ? '进行中' : '等待中'}</em>
            <button onClick={() => { setJoinCode(candidate.id); candidate.status === 'playing' ? send({ type: 'spectateRoom', roomId: candidate.id, password: joinPassword }) : send({ type: 'joinRoom', roomId: candidate.id, password: joinPassword }) }}>
              {candidate.status === 'playing' ? '观战' : '加入'}
            </button>
          </article>)}</div>
      </section>}
      {lobbyTab === 'ranking' && <section className="online-panel ranking"><h2>在线排行榜</h2>
        <div className="ranking-head"><span>排名 / 玩家</span><span>胜场</span><span>局数</span><span>总盈亏</span></div>
        {leaderboard.map((entry, index) => <div key={entry.id}><strong>{index + 1}. {entry.username}</strong><span>{entry.wins}</span><span>{entry.games}</span><span className={entry.profit >= 0 ? 'profit' : 'loss'}>{entry.profit >= 0 ? '+' : ''}{entry.profit}</span></div>)}</section>}
      {lobbyTab === 'replays' && <section className="online-panel replay-list"><h2>服务器牌局记录</h2>
        {replays.length === 0 ? <p className="empty-copy">完成在线牌局后会显示在这里。</p> : replays.map((entry) => <button key={entry.id} onClick={() => openReplay(entry.id)}>
          <strong>{entry.roomName} · 第 {entry.handNumber} 局</strong><span>{entry.winnerNames.join('、')} 赢得 {entry.pot}</span><small>{new Date(entry.completedAt).toLocaleString()}</small>
        </button>)}</section>}
      {replay && <ReplayDialog replay={replay} onClose={() => setReplay(null)} />}
    </main>
  )
}

interface OnlineRoomProps {
  room: RoomView; user: OnlineUser; token: string; remaining: number; raiseTo: number; setRaiseTo: (value: number) => void
  send: (message: ClientMessage) => void; connected: boolean; error: string; notice: string; onBack: () => void
  reportOpen: boolean; setReportOpen: (value: boolean) => void; reportTarget: string; setReportTarget: (value: string) => void
  reportReason: string; setReportReason: (value: string) => void
  quickMessages: Record<string, { messageId: QuickMessageId; sentAt: number }>
}

function OnlineRoom(props: OnlineRoomProps) {
  const { room, user, remaining, raiseTo, setRaiseTo, send } = props
  const [botPersonality, setBotPersonality] = useState<BotPersonality>('balanced')
  const voice = useRoomVoice(room.id, props.token, room.viewerRole === 'player')
  const game = room.game
  const legal = room.legalActions
  const current = game?.players.find((player) => player.seat === game.currentPlayerSeat)
  const winnerIds = new Set(game?.winners.map((winner) => winner.playerId) ?? [])
  const bestKeys = new Set(game?.winners.flatMap((winner) => winner.hand?.cards.map(formatCard) ?? []) ?? [])
  const explanations = useMemo(() => {
    if (!game || game.phase !== 'SETTLEMENT') return []
    try { return buildWinnerExplanations(game as unknown as GameState) } catch { return [] }
  }, [game])
  const seatStyles = useMemo(() => (game?.players ?? room.players).map((player) => {
    const count = game?.players.length ?? room.players.length
    const angle = (-90 + 360 * player.seat / count) * Math.PI / 180
    return { left: `${50 + Math.cos(angle) * 43}%`, top: `${50 + Math.sin(angle) * 40}%` }
  }), [game?.players, room.players])
  const minAmount = legal?.minBet ?? legal?.minRaiseTo
  const act = (type: LegalActionType) => {
    const action: PlayerAction = type === 'bet' || type === 'raise' ? { type, amount: Math.min(raiseTo, legal!.maxTo) } : { type } as PlayerAction
    send({ type: 'action', action })
  }
  const invite = `${window.location.origin}${window.location.pathname}?room=${room.id}`

  return <main className="online-shell online-game-shell">
    <header className="online-header compact"><div><p className="eyebrow">好友房 {room.id}</p><h1>{room.name}</h1></div>
      <div className="room-controls"><span className={props.connected ? 'online-dot connected' : 'online-dot'} />
        <span>{room.viewerRole === 'spectator' ? `观战中 · ${room.spectators} 人` : user.username}</span>
        <button onClick={() => navigator.clipboard.writeText(invite).then(() => undefined)}>复制邀请链接</button>
        <button onClick={props.onBack}>离开房间</button></div></header>
    <VoiceControls voice={voice} canPublish={room.viewerRole === 'player'} />
    <QuickMessageControls disabled={!props.connected || room.viewerRole !== 'player'} onSend={(messageId) => send({ type: 'quickMessage', messageId })} />
    {(props.error || props.notice) && <div className={`online-alert ${props.error ? 'error' : ''}`}>{props.error || props.notice}</div>}
    {room.status === 'waiting' || !game ? <section className="waiting-room online-panel">
      <div><p className="eyebrow">WAITING ROOM</p><h2>等待玩家加入</h2><p>邀请链接：<code>{invite}</code></p></div>
      <div className="waiting-seats">{Array.from({ length: room.maxPlayers }, (_, seat) => {
        const player = room.players[seat]
        return <article key={seat} className={`${player ? 'occupied' : ''} ${player && voice.speakingIds.has(player.id) ? 'speaking' : ''}`}><b>{seat + 1}</b><strong>{player ? `${player.isBot ? '🤖 ' : ''}${player.name}` : '空座位'}</strong>
          {player && props.quickMessages[player.id] && <span className="quick-message-bubble waiting-bubble" key={props.quickMessages[player.id].sentAt}>{QUICK_MESSAGE_BY_ID[props.quickMessages[player.id].messageId].text}</span>}
          <small>{player ? (player.isBot ? PERSONALITIES[player.personality ?? 'balanced'].description : player.connected ? '在线' : '断线') : '等待加入'}</small>
          {player?.isBot && room.hostId === user.id && <button className="remove-bot" onClick={() => send({ type: 'removeBot', botId: player.id })}>移除</button>}</article>
      })}</div>
      {room.hostId === user.id && room.viewerRole === 'player' ? <><div className="bot-controls"><label>机器人风格<select value={botPersonality} onChange={(event) => setBotPersonality(event.target.value as BotPersonality)}>
        {PERSONALITY_ORDER.map((personality) => <option key={personality} value={personality}>{PERSONALITIES[personality].name} · {PERSONALITIES[personality].description}</option>)}</select></label>
        <button disabled={room.players.length >= room.maxPlayers} onClick={() => send({ type: 'addBot', personality: botPersonality })}>添加机器人</button></div>
        <button className="primary-wide" disabled={room.players.length < 2} onClick={() => send({ type: 'startGame' })}>开始牌局（{room.players.length}/{room.maxPlayers}）</button></>
        : <p className="waiting-copy">等待房主开始牌局…</p>}
    </section> : <section className="online-game-grid">
      <div className="table-wrap"><div className="poker-table online-table">
        <div className="felt-mark">RIVER<br />ACE</div>
        <div className="board"><span className="phase">{game.phase === 'SETTLEMENT' ? '结算' : game.phase}</span>
          <div className="community">{Array.from({ length: 5 }, (_, index) => game.communityCards[index]
            ? <CardView key={index} card={game.communityCards[index]} highlighted={bestKeys.has(formatCard(game.communityCards[index]))} />
            : <span className="card empty" key={index} />)}</div>
          <strong>底池 {game.players.reduce((sum, player) => sum + player.totalContribution, 0)}</strong></div>
        {game.players.map((player, index) => <article key={player.id} className={`seat ${player.seat === game.currentPlayerSeat ? 'current' : ''} ${player.folded ? 'folded' : ''} ${winnerIds.has(player.id) ? 'winner' : ''} ${voice.speakingIds.has(player.id) ? 'speaking' : ''}`} style={seatStyles[index]}>
          {props.quickMessages[player.id] && <span className="quick-message-bubble" key={props.quickMessages[player.id].sentAt}>{QUICK_MESSAGE_BY_ID[props.quickMessages[player.id].messageId].text}</span>}
          <div className="hole-cards">{player.hasCards ? [0, 1].map((cardIndex) => <CardView key={cardIndex} card={player.holeCards[cardIndex]}
            hidden={!player.holeCards[cardIndex]} winner={winnerIds.has(player.id)} highlighted={player.holeCards[cardIndex] ? bestKeys.has(formatCard(player.holeCards[cardIndex])) : false} />) : null}</div>
          <div className="seat-name"><strong>{player.isBot ? '🤖 ' : ''}{player.name}{player.id === user.id ? '（你）' : ''}</strong><span>{player.chips}</span></div>
          <div className="badges">{player.seat === game.dealerSeat && <b>D</b>}{player.seat === game.smallBlindSeat && <b>SB</b>}{player.seat === game.bigBlindSeat && <b>BB</b>}
            {!player.connected && <em>断线</em>}{player.allIn && <em>全下</em>}{player.folded && <em>弃牌</em>}{player.streetContribution > 0 && <i>{player.streetContribution}</i>}</div>
        </article>)}</div>
        <div className="action-panel online-actions">{game.phase === 'SETTLEMENT' ? <div className="settlement-summary">
          <div className="settlement-results">{explanations.map((result) => <article key={result.playerId}><span className="result-kicker">{result.potNames.join('、')}</span>
            <div className="result-heading"><strong>{result.playerName}</strong><b>+{result.amount}</b><h3>{result.categoryName}</h3></div><p>{result.description}</p><small>{result.reason}</small></article>)}</div>
          <div className="settlement-footer"><span><i />抬高并描金的牌组成最佳五张</span><b>下一局将在数秒后自动开始</b></div></div>
          : room.viewerRole === 'spectator' ? <div className="waiting-message"><span>正在观战</span><small>{current?.name ?? '玩家'} 行动中</small></div>
            : legal?.actions.length ? <><div className="online-turn"><strong>轮到你行动</strong><span>{Math.ceil(remaining / 1000)} 秒</span><progress max={25_000} value={remaining} /></div>
              {minAmount !== null && minAmount !== undefined && <div className="raise-control"><input aria-label="下注金额" type="range" min={minAmount} max={legal.maxTo} step={10} value={Math.min(raiseTo, legal.maxTo)} onChange={(event) => setRaiseTo(Number(event.target.value))} /><output>{Math.min(raiseTo, legal.maxTo)}</output></div>}
              <div className="action-buttons">{legal.actions.map((type) => <button key={type} className={type === 'fold' ? 'danger' : type === 'allIn' ? 'gold' : ''} onClick={() => act(type)}>
                {type === 'call' ? `跟注 ${Math.min(legal.toCall, game.players.find((player) => player.id === user.id)?.chips ?? 0)}` : type === 'bet' || type === 'raise' ? `${type === 'bet' ? '下注' : '加注'}到 ${Math.min(raiseTo, legal.maxTo)}` : ({ fold: '弃牌', check: '过牌', allIn: '全下' } as Record<string, string>)[type]}</button>)}</div></>
              : <div className="waiting-message"><span>{current?.name ?? '牌局'} 正在行动</span><small>{Math.ceil(remaining / 1000)} 秒 · 断线后会自动过牌或弃牌</small></div>}</div>
      </div>
      <aside className="history online-history"><div className="history-title"><h2>服务端记录</h2><span>第 {game.handNumber} 局</span></div><ol>{[...game.actionHistory].reverse().map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ol>
        <div className="online-moderation"><button onClick={() => props.setReportOpen(!props.reportOpen)}>举报玩家</button></div></aside>
    </section>}
    {props.reportOpen && <div className="modal-backdrop"><section className="settings-modal report-dialog"><div className="modal-title"><h2>举报玩家</h2><button onClick={() => props.setReportOpen(false)}>×</button></div>
      <label>玩家<select value={props.reportTarget} onChange={(event) => props.setReportTarget(event.target.value)}><option value="">请选择</option>{room.players.filter((player) => player.id !== user.id && !player.isBot).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
      <label>原因<textarea value={props.reportReason} maxLength={300} onChange={(event) => props.setReportReason(event.target.value)} placeholder="请描述可疑行为，服务端会结合动作日志核查" /></label>
      <button className="primary-wide" onClick={() => send({ type: 'report', targetUserId: props.reportTarget, reason: props.reportReason })}>提交举报</button></section></div>}
  </main>
}

function ReplayDialog({ replay, onClose }: { replay: ReplayDetail; onClose: () => void }) {
  const [cursor, setCursor] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    if (cursor >= replay.actionHistory.length) { setPlaying(false); return }
    const timer = window.setTimeout(() => setCursor((value) => value + 1), 650)
    return () => window.clearTimeout(timer)
  }, [cursor, playing, replay.actionHistory.length])
  return <div className="modal-backdrop"><section className="settings-modal replay-dialog"><div className="modal-title"><div><p className="eyebrow">SERVER REPLAY</p><h2>{replay.roomName} · 第 {replay.handNumber} 局</h2></div><button onClick={onClose}>×</button></div>
    <div className="replay-board">{replay.communityCards.map((card) => <CardView key={formatCard(card)} card={card} />)}</div>
    <p><strong>{replay.winnerNames.join('、')}</strong> 赢得底池 {replay.pot}</p>
    <div className="replay-players">{replay.players.map((player) => <article key={player.id}><strong>{player.name}</strong><span>{player.holeCards.length ? player.holeCards.map(formatCard).join(' ') : player.folded ? '已弃牌（底牌保密）' : '—'}</span><small>投入 {player.contribution}</small></article>)}</div>
    <div className="replay-controls"><button onClick={() => { if (cursor >= replay.actionHistory.length) setCursor(0); setPlaying(!playing) }}>{playing ? '暂停' : cursor ? '继续' : '播放回放'}</button>
      <button onClick={() => { setPlaying(false); setCursor(0) }}>重新开始</button><span>{cursor}/{replay.actionHistory.length}</span>
      <input aria-label="回放进度" type="range" min="0" max={replay.actionHistory.length} value={cursor} onChange={(event) => { setPlaying(false); setCursor(Number(event.target.value)) }} /></div>
    <ol className="replay-log">{replay.actionHistory.slice(0, cursor).map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ol>
  </section></div>
}

