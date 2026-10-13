import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildWinnerExplanations, createGame, evaluateBestHand, formatCard, getLegalActions, performAction, startNextHand,
  type Card, type GameState, type LegalActionType, type PlayerAction,
} from './game'
import { createBotView, decideBotAction, PERSONALITIES, PERSONALITY_ORDER } from './ai'
import { useGameSound, type SoundName } from './hooks/useGameSound'
import { useGameMusic } from './hooks/useGameMusic'
import { usePwaInstall } from './hooks/usePwaInstall'
import { DealAnimations, holeCardDelay, holeDealDuration } from './components/DealAnimations'
import { OnlineApp } from './online/OnlineApp'
import {
  clearHandHistory, clearStatistics, createSavedHand, historyAsText, loadHandHistory,
  loadSettings, loadStatistics, prependHand, recordSettledHand, saveSettings, saveStatistics,
  type GameSettings,
} from './storage'

const PHASE_LABELS: Record<GameState['phase'], string> = {
  WAITING: '等待开始', POSTING_BLINDS: '收取盲注', DEALING: '发底牌',
  PREFLOP: '翻牌前', FLOP: '翻牌', TURN: '转牌', RIVER: '河牌',
  SHOWDOWN: '摊牌', SETTLEMENT: '结算',
}

const ACTION_LABELS: Record<LegalActionType, string> = {
  fold: '弃牌', check: '过牌', call: '跟注', bet: '下注', raise: '加注', allIn: '全下',
}

const SPEED_DELAYS = { slow: 950, normal: 520, fast: 180 }

function setupGame(settings: GameSettings): GameState {
  const players = Array.from({ length: settings.playerCount }, (_, index) => ({
    id: index === 0 ? 'hero' : `bot-${index}`,
    name: index === 0 ? '你' : `${PERSONALITIES[PERSONALITY_ORDER[(index - 1) % 4]].name} ${index}`,
    isHuman: index === 0,
    personality: index === 0 ? undefined : PERSONALITY_ORDER[(index - 1) % 4],
  }))
  return startNextHand(createGame(players, { startingChips: settings.startingChips }))
}

function PlayingCard({ card, hidden = false, delay = 0, className = '' }: { card?: Card; hidden?: boolean; delay?: number; className?: string }) {
  if (hidden || !card) return <span className={`card card-back dealt ${className}`} style={{ animationDelay: `${delay}ms` }}>R</span>
  const red = card.suit === 'hearts' || card.suit === 'diamonds'
  return <span className={`card dealt ${red ? 'red' : ''} ${className}`} style={{ animationDelay: `${delay}ms` }}>{formatCard(card)}</span>
}

function actionHint(game: GameState): string {
  const legal = getLegalActions(game)
  if (legal.actions.length === 0) return '等待其他玩家行动'
  if (legal.toCall > 0) {
    return legal.minRaiseTo
      ? `跟注需要 ${legal.toCall}，如加注至少到 ${legal.minRaiseTo}`
      : `跟注需要 ${legal.toCall}；当前不可再次加注`
  }
  if (legal.minBet) return `当前无人下注，可以过牌或至少下注 ${legal.minBet}`
  return '无需投入筹码，可以过牌'
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function SinglePlayerApp({ onOpenOnline, settings, setSettings, playSound }: { onOpenOnline: () => void; settings: GameSettings; setSettings: (value: GameSettings) => void; playSound: (name: SoundName) => void }) {
  const [draftSettings, setDraftSettings] = useState(settings)
  const [game, setGame] = useState(() => setupGame(settings))
  const [raiseTo, setRaiseTo] = useState(20)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sideTab, setSideTab] = useState<'hand' | 'history' | 'stats'>('hand')
  const [statistics, setStatistics] = useState(() => loadStatistics())
  const [history, setHistory] = useState(() => loadHandHistory())
  const [aiReason, setAiReason] = useState('')
  const [completedHoleDealKey, setCompletedHoleDealKey] = useState('')
  const [completedBoardDealKey, setCompletedBoardDealKey] = useState('')
  const processedSettlement = useRef('')
  const previousBoardCount = useRef(0)
  const { canInstall, install } = usePwaInstall()

  const currentPlayer = game.players.find((player) => player.seat === game.currentPlayerSeat)
  const hero = game.players.find((player) => player.id === 'hero')!
  const legal = getLegalActions(game)
  const pot = game.players.reduce((sum, player) => sum + player.totalContribution, 0)
  const showdown = game.phase === 'SETTLEMENT'
  const handVisualKey = `${game.handNumber}:${game.players.flatMap((player) => player.holeCards.map(formatCard)).join('-')}`
  const boardVisualKey = `${game.handNumber}:${game.communityCards.length}`
  const holeDealing = completedHoleDealKey !== handVisualKey
  const boardDealing = game.communityCards.length > 0 && completedBoardDealKey !== boardVisualKey
  const isDealing = holeDealing || boardDealing
  const winnerExplanations = useMemo(() => showdown ? buildWinnerExplanations(game) : [], [game, showdown])
  const bestFiveCardKeys = useMemo(() => new Set(winnerExplanations.flatMap((result) => result.bestCards.map(formatCard))), [winnerExplanations])
  const minAggression = legal.minBet ?? legal.minRaiseTo
  const heroHand = !hero.folded && hero.holeCards.length + game.communityCards.length >= 5
    ? evaluateBestHand([...hero.holeCards, ...game.communityCards])
    : null

  useEffect(() => {
    const minimum = legal.minBet ?? legal.minRaiseTo
    if (minimum !== null) setRaiseTo(minimum)
  }, [game.currentPlayerSeat, legal.minBet, legal.minRaiseTo])

  useEffect(() => {
    if (game.communityCards.length > previousBoardCount.current) playSound('deal')
    previousBoardCount.current = game.communityCards.length
  }, [game.communityCards.length, playSound])

  useEffect(() => {
    const dealKey = handVisualKey
    playSound('deal')
    const timer = window.setTimeout(() => setCompletedHoleDealKey(dealKey), holeDealDuration(game))
    return () => window.clearTimeout(timer)
  }, [handVisualKey, playSound])

  useEffect(() => {
    const currentCount = game.communityCards.length
    if (currentCount === 0) return
    const dealKey = boardVisualKey
    const duration = currentCount === 3 ? 1100 : 760
    const timer = window.setTimeout(() => setCompletedBoardDealKey(dealKey), duration)
    return () => window.clearTimeout(timer)
  }, [boardVisualKey, game.communityCards.length])

  useEffect(() => {
    if (!currentPlayer || currentPlayer.isHuman || game.phase === 'SETTLEMENT' || isDealing) {
      setAiReason('')
      return
    }
    setAiReason(`${PERSONALITIES[currentPlayer.personality ?? 'balanced'].name}正在分析牌面…`)
    const expectedSeat = currentPlayer.seat
    const expectedActionCount = game.actionHistory.length
    const timer = window.setTimeout(() => {
      const view = createBotView(game)
      const decision = decideBotAction(view, settings.aiDifficulty)
      setAiReason(`${PERSONALITIES[view.personality].name}：${decision.reason}`)
      playSound(decision.action.type)
      setGame((state) => {
        if (state.currentPlayerSeat !== expectedSeat || state.actionHistory.length !== expectedActionCount) return state
        return performAction(state, expectedSeat, decision.action)
      })
    }, SPEED_DELAYS[settings.aiSpeed])
    return () => window.clearTimeout(timer)
  }, [currentPlayer?.id, game.phase, game.actionHistory.length, isDealing, playSound, settings.aiDifficulty, settings.aiSpeed])

  useEffect(() => {
    if (game.phase !== 'SETTLEMENT') return
    const signature = `${game.handNumber}:${game.actionHistory.join('|')}`
    if (processedSettlement.current === signature) return
    processedSettlement.current = signature
    setStatistics((previous) => {
      const next = recordSettledHand(previous, game)
      saveStatistics(next)
      return next
    })
    setHistory((previous) => prependHand(createSavedHand(game), previous))
    playSound('win')
  }, [game, playSound])

  useEffect(() => {
    if (game.phase !== 'SETTLEMENT' || hero.chips === 0 || !settings.autoNextHand) return
    const timer = window.setTimeout(() => {
      previousBoardCount.current = 0
      setGame((state) => startNextHand(state))
    }, settings.aiSpeed === 'fast' ? 3800 : settings.aiSpeed === 'slow' ? 7500 : 6000)
    return () => window.clearTimeout(timer)
  }, [game.phase, game.handNumber, hero.chips, settings.autoNextHand, settings.aiSpeed])

  const seatStyles = useMemo(() => game.players.map((player) => {
    const angle = (-90 + (360 * player.seat) / game.players.length) * Math.PI / 180
    return { left: `${50 + Math.cos(angle) * 43}%`, top: `${50 + Math.sin(angle) * 40}%` }
  }), [game.players])

  const act = (type: LegalActionType) => {
    const action: PlayerAction = type === 'bet' || type === 'raise'
      ? { type, amount: Math.min(raiseTo, legal.maxTo) }
      : { type } as PlayerAction
    playSound(type)
    setGame((state) => performAction(state, hero.seat, action))
  }

  const reset = (nextSettings = settings) => {
    processedSettlement.current = ''
    previousBoardCount.current = 0
    setGame(setupGame(nextSettings))
  }

  const applySettings = () => {
    saveSettings(draftSettings)
    setSettings(draftSettings)
    setSettingsOpen(false)
    reset(draftSettings)
  }

  const toggleSound = () => {
    const next = { ...settings, soundEnabled: !settings.soundEnabled }
    setSettings(next)
    setDraftSettings(next)
    saveSettings(next)
  }

  const toggleMusic = () => {
    const next = { ...settings, musicEnabled: !settings.musicEnabled }
    setSettings(next)
    setDraftSettings(next)
    saveSettings(next)
  }

  // 音量滑杆即时生效并保存，便于边拖动边试听。
  const applyVolume = (key: 'soundVolume' | 'musicVolume', value: number) => {
    setSettings({ ...settings, [key]: value })
    setDraftSettings({ ...draftSettings, [key]: value })
    saveSettings({ ...settings, [key]: value })
  }

  const quickTarget = (fraction: number) => {
    if (minAggression === null) return
    const raw = game.currentBet === 0 ? pot * fraction : game.currentBet + pot * fraction
    const rounded = Math.round(raw / game.config.bigBlind) * game.config.bigBlind
    setRaiseTo(Math.min(legal.maxTo, Math.max(minAggression, rounded)))
  }

  return (
    <main className="app-shell">
      <header>
        <div>
          <p className="eyebrow">NO-LIMIT TEXAS HOLD'EM</p>
          <h1>River Ace</h1>
        </div>
        <div className="game-controls">
          <span className="blind-label">盲注 {game.config.smallBlind}/{game.config.bigBlind}</span>
          {canInstall && <button className="secondary install-button" onClick={install}>安装应用</button>}
          <button className="icon-button" aria-label={settings.soundEnabled ? '关闭音效' : '开启音效'} onClick={toggleSound}>
            {settings.soundEnabled ? '♪' : '静音'}
          </button>
          <button className="icon-button" aria-label={settings.musicEnabled ? '关闭背景音乐' : '开启背景音乐'} title="背景音乐" style={{ opacity: settings.musicEnabled ? 1 : 0.4 }} onClick={toggleMusic}>
            ♫
          </button>
          <button className="secondary online-entry" onClick={onOpenOnline}>在线多人</button>
          <button className="secondary" onClick={() => reset()}>新牌局</button>
          <button className="secondary" onClick={() => { setDraftSettings(settings); setSettingsOpen(true) }}>设置</button>
        </div>
      </header>

      <section className="content-grid">
        <div className="table-wrap">
          <div className="poker-table">
            <DealAnimations game={game} seatStyles={seatStyles} />
            <div className="felt-mark">RIVER<br />ACE</div>
            <div className="board">
              <span className="phase">{PHASE_LABELS[game.phase]}</span>
              <div className="community">
                {Array.from({ length: 5 }, (_, index) => (
                  game.communityCards[index]
                    ? <PlayingCard key={`${game.handNumber}-${index}`} card={game.communityCards[index]}
                      className={showdown && bestFiveCardKeys.has(formatCard(game.communityCards[index])) ? 'best-five-card' : ''}
                      delay={(game.phase === 'FLOP' && index < 3) || (game.phase === 'TURN' && index === 3) || (game.phase === 'RIVER' && index === 4) ? 520 + (index < 3 ? index * 150 : 0) : 0} />
                    : <span className="card empty" key={index} />
                ))}
              </div>
              <strong className="pot-total">底池 {pot}</strong>
              {game.pots.length > 1 && <small>{game.pots.map((sidePot, index) => `${index === 0 ? '主池' : `边池 ${index}`} ${sidePot.amount}`).join(' · ')}</small>}
            </div>

            {game.players.map((player, index) => {
              const isCurrent = player.seat === game.currentPlayerSeat
              const winner = game.winners.find((record) => record.playerId === player.id)
              const reveal = player.isHuman || (showdown && !player.folded)
              return (
                <article key={player.id}
                  className={`seat ${isCurrent ? 'current' : ''} ${player.folded ? 'folded' : ''} ${winner ? 'winner' : ''}`}
                  style={seatStyles[index]}>
                  <div className="hole-cards">
                    {player.holeCards.map((card, cardIndex) => (
                      <PlayingCard key={`${game.handNumber}-${cardIndex}-${reveal}`} card={card} hidden={!reveal}
                        className={`${winner ? 'winner-hole-card' : ''} ${showdown && bestFiveCardKeys.has(formatCard(card)) ? 'best-five-card' : ''}`}
                        delay={showdown && !player.isHuman ? cardIndex * 160 : holeCardDelay(game, player.seat, cardIndex) + 400} />
                    ))}
                  </div>
                  <div className="seat-name"><strong>{player.name}</strong><span>{player.chips}</span></div>
                  <div className="badges">
                    {player.seat === game.dealerSeat && <b>D</b>}
                    {player.seat === game.smallBlindSeat && <b>SB</b>}
                    {player.seat === game.bigBlindSeat && <b>BB</b>}
                    {player.allIn && <em>全下</em>}
                    {player.folded && <em>弃牌</em>}
                    {player.streetContribution > 0 && <i key={player.streetContribution} className="chip-bet">{player.streetContribution}</i>}
                  </div>
                  {winner && <span className="win-amount">+{winner.amount}</span>}
                </article>
              )
            })}

          </div>

          <div className="action-panel">
            {isDealing ? (
              <div className="waiting-message"><span>{holeDealing ? '正在依次发出底牌…' : '正在发出公共牌…'}</span><small>发牌完成后开始行动</small></div>
            ) : showdown && winnerExplanations.length > 0 ? (
              <div className="settlement-summary" role="status">
                <div className="settlement-results">
                  {winnerExplanations.map((result) => <article key={result.playerId}>
                    <span className="result-kicker">{result.potNames.join('、') || '本局结果'}</span>
                    <div className="result-heading"><strong>{result.playerName}</strong><b>+{result.amount}</b><h3>{result.categoryName}</h3></div>
                    <p>{result.description}</p>
                    <small>{result.reason}</small>
                  </article>)}
                </div>
                <div className="settlement-footer">
                  {bestFiveCardKeys.size > 0 && <span><i />牌桌上抬高并描金的牌组成最佳五张</span>}
                  {hero.chips === 0
                    ? <b>筹码已用尽。点击“新牌局”重新开始。</b>
                    : !settings.autoNextHand
                      ? <button onClick={() => setGame((state) => startNextHand(state))}>开始下一局</button>
                      : <b>下一局即将开始…</b>}
                </div>
              </div>
            ) : hero.chips === 0 && game.phase === 'SETTLEMENT' ? (
              <div className="bust-message">筹码已用尽。点击“新牌局”重新开始。</div>
            ) : currentPlayer?.isHuman ? (
              <>
                <div className="action-hint"><strong>{heroHand ? `当前牌型：${heroHand.categoryName}` : '轮到你行动'}</strong><span>{actionHint(game)}</span></div>
                <div className="action-summary">
                  <span>跟注 <strong>{legal.toCall}</strong></span><span>本局投入 <strong>{hero.totalContribution}</strong></span><span>可用筹码 <strong>{hero.chips}</strong></span>
                </div>
                {minAggression !== null && (
                  <div className="raise-wrap">
                    <div className="raise-control">
                      <input aria-label="下注金额" type="range" min={minAggression} max={legal.maxTo}
                        step={game.config.smallBlind} value={Math.min(raiseTo, legal.maxTo)} onChange={(event) => setRaiseTo(Number(event.target.value))} />
                      <output>{Math.min(raiseTo, legal.maxTo)}</output>
                    </div>
                    <div className="quick-bets">
                      <button onClick={() => setRaiseTo(minAggression)}>最小</button><button onClick={() => quickTarget(.5)}>半池</button>
                      <button onClick={() => quickTarget(1)}>满池</button><button onClick={() => setRaiseTo(legal.maxTo)}>全下</button>
                    </div>
                  </div>
                )}
                <div className="action-buttons">
                  {legal.actions.map((type) => (
                    <button key={type} className={type === 'fold' ? 'danger' : type === 'allIn' ? 'gold' : ''} onClick={() => act(type)}>
                      {type === 'call' ? `跟注 ${Math.min(legal.toCall, hero.chips)}`
                        : type === 'bet' || type === 'raise' ? `${ACTION_LABELS[type]}到 ${Math.min(raiseTo, legal.maxTo)}`
                          : type === 'allIn' ? `全下 ${hero.chips}` : ACTION_LABELS[type]}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="waiting-message">
                {game.phase === 'SETTLEMENT' ? <>
                  <span>{game.winners.map((winner) => game.players.find((player) => player.id === winner.playerId)?.name).join('、')} 赢得底池</span>
                  {!settings.autoNextHand && hero.chips > 0 && <button onClick={() => setGame((state) => startNextHand(state))}>开始下一局</button>}
                  {settings.autoNextHand && hero.chips > 0 && <small>下一局即将开始…</small>}
                </> : <><span>{currentPlayer?.name ?? '牌局'} 正在行动…</span><small>{aiReason}</small></>}
              </div>
            )}
          </div>
        </div>

        <aside className="history">
          <div className="side-tabs">
            <button className={sideTab === 'hand' ? 'active' : ''} onClick={() => setSideTab('hand')}>本局</button>
            <button className={sideTab === 'history' ? 'active' : ''} onClick={() => setSideTab('history')}>历史</button>
            <button className={sideTab === 'stats' ? 'active' : ''} onClick={() => setSideTab('stats')}>统计</button>
          </div>
          {sideTab === 'hand' && <><div className="history-title"><h2>对局记录</h2><span>第 {game.handNumber} 局</span></div>
            <ol>{[...game.actionHistory].reverse().map((entry, index) => <li key={`${entry}-${index}`}>{entry}</li>)}</ol></>}
          {sideTab === 'history' && <div className="saved-hands">
            <div className="history-title"><h2>最近牌局</h2><span>{history.length}/50</span></div>
            {history.length === 0 ? <p className="empty-copy">完成一局后会保存在这里。</p> : history.slice(0, 12).map((hand) => (
              <article key={hand.id}><strong>{hand.winnerNames.join('、')}</strong><span>底池 {hand.pot}</span>
                <small className={hand.heroProfit >= 0 ? 'profit' : 'loss'}>{hand.heroProfit >= 0 ? '+' : ''}{hand.heroProfit}</small></article>
            ))}
            <div className="data-actions"><button disabled={!history.length} onClick={() => downloadText('river-ace-history.txt', historyAsText(history))}>导出</button>
              <button disabled={!history.length} onClick={() => setHistory(clearHandHistory())}>清空</button></div>
          </div>}
          {sideTab === 'stats' && <div className="stats-panel">
            <div className="history-title"><h2>生涯统计</h2><span>本机</span></div>
            <dl>
              <div><dt>总局数</dt><dd>{statistics.handsPlayed}</dd></div><div><dt>胜利</dt><dd>{statistics.handsWon}</dd></div>
              <div><dt>胜率</dt><dd>{statistics.handsPlayed ? Math.round(statistics.handsWon / statistics.handsPlayed * 100) : 0}%</dd></div>
              <div><dt>摊牌</dt><dd>{statistics.showdowns}</dd></div><div><dt>最大底池</dt><dd>{statistics.biggestPot}</dd></div>
              <div><dt>总盈亏</dt><dd className={statistics.totalProfit >= 0 ? 'profit' : 'loss'}>{statistics.totalProfit >= 0 ? '+' : ''}{statistics.totalProfit}</dd></div>
            </dl><div className="data-actions"><button onClick={() => setStatistics(clearStatistics())}>清空统计</button></div>
          </div>}
        </aside>
      </section>

      {settingsOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}>
        <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="modal-title"><div><p className="eyebrow">TABLE PREFERENCES</p><h2 id="settings-title">游戏设置</h2></div>
            <button aria-label="关闭设置" onClick={() => setSettingsOpen(false)}>×</button></div>
          <div className="setting-grid">
            <label>牌桌人数<select value={draftSettings.playerCount} onChange={(event) => setDraftSettings({ ...draftSettings, playerCount: Number(event.target.value) })}>
              {Array.from({ length: 9 }, (_, index) => index + 2).map((count) => <option key={count} value={count}>{count} 人</option>)}</select></label>
            <label>初始筹码<select value={draftSettings.startingChips} onChange={(event) => setDraftSettings({ ...draftSettings, startingChips: Number(event.target.value) })}>
              <option value={1000}>1000</option><option value={2000}>2000</option><option value={5000}>5000</option></select></label>
            <label>电脑难度<select value={draftSettings.aiDifficulty} onChange={(event) => setDraftSettings({ ...draftSettings, aiDifficulty: event.target.value as GameSettings['aiDifficulty'] })}>
              <option value="easy">休闲</option><option value="normal">标准</option><option value="hard">认真</option></select></label>
            <label>行动速度<select value={draftSettings.aiSpeed} onChange={(event) => setDraftSettings({ ...draftSettings, aiSpeed: event.target.value as GameSettings['aiSpeed'] })}>
              <option value="slow">从容</option><option value="normal">标准</option><option value="fast">快速</option></select></label>
            <label>音效音量 {Math.round(draftSettings.soundVolume * 100)}%<input type="range" min="0" max="1" step="0.05" value={draftSettings.soundVolume} onChange={(event) => applyVolume('soundVolume', Number(event.target.value))} /></label>
            <label>音乐音量 {Math.round(draftSettings.musicVolume * 100)}%<input type="range" min="0" max="1" step="0.05" value={draftSettings.musicVolume} onChange={(event) => applyVolume('musicVolume', Number(event.target.value))} /></label>
          </div>
          <label className="switch-row"><span><strong>音效</strong><small>行动、发牌与获胜提示音</small></span>
            <input type="checkbox" checked={draftSettings.soundEnabled} onChange={(event) => setDraftSettings({ ...draftSettings, soundEnabled: event.target.checked })} /></label>
          <label className="switch-row"><span><strong>背景音乐</strong><small>循环播放的轻音乐，首次点击后开始</small></span>
            <input type="checkbox" checked={draftSettings.musicEnabled} onChange={(event) => setDraftSettings({ ...draftSettings, musicEnabled: event.target.checked })} /></label>
          <label className="switch-row"><span><strong>自动开始下一局</strong><small>结算展示后继续游戏</small></span>
            <input type="checkbox" checked={draftSettings.autoNextHand} onChange={(event) => setDraftSettings({ ...draftSettings, autoNextHand: event.target.checked })} /></label>
          <div className="personality-list">{PERSONALITY_ORDER.map((id) => <div key={id}><strong>{PERSONALITIES[id].name}</strong><span>{PERSONALITIES[id].description}</span></div>)}</div>
          <button className="apply-settings" onClick={applySettings}>应用并开始新牌桌</button>
        </section>
      </div>}
    </main>
  )
}

export default function App() {
  const [mode, setMode] = useState<'single' | 'online'>(() => new URLSearchParams(window.location.search).has('room') ? 'online' : 'single')
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings())
  const playSound = useGameSound(settings.soundEnabled, settings.soundVolume)
  useGameMusic(settings.musicEnabled, settings.musicVolume)
  const toggleMusic = () => {
    const next = { ...settings, musicEnabled: !settings.musicEnabled }
    setSettings(next)
    saveSettings(next)
  }
  return mode === 'online'
    ? <OnlineApp playSound={playSound} music={{ enabled: settings.musicEnabled, toggle: toggleMusic }} onBack={() => setMode('single')} />
    : <SinglePlayerApp settings={settings} setSettings={setSettings} playSound={playSound} onOpenOnline={() => setMode('online')} />
}
