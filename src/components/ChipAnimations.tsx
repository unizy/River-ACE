import type { CSSProperties } from 'react'

interface ChipPlayer { id: string; seat: number; chips: number; streetContribution: number }
interface ChipWinner { playerId: string; amount: number }
type ChipStyle = CSSProperties & Record<'--chip-from-left' | '--chip-from-top', string>

const DENOMINATIONS = [
  { value: 1000, className: 'denom-1000' }, { value: 500, className: 'denom-500' },
  { value: 100, className: 'denom-100' }, { value: 50, className: 'denom-50' },
  { value: 20, className: 'denom-20' }, { value: 10, className: 'denom-10' },
  { value: 5, className: 'denom-5' }, { value: 1, className: 'denom-1' },
] as const

function pointBetween(style: CSSProperties, ratio: number) {
  const left = Number.parseFloat(String(style.left ?? 50))
  const top = Number.parseFloat(String(style.top ?? 50))
  return { left: 50 + (left - 50) * ratio, top: 50 + (top - 50) * ratio }
}

export function splitChips(amount: number) {
  let remaining = Math.max(0, Math.round(amount))
  return DENOMINATIONS.map((denomination) => {
    const count = Math.floor(remaining / denomination.value)
    remaining -= count * denomination.value
    return { ...denomination, count }
  }).filter((denomination) => denomination.count > 0)
}

function ChipBank({ amount, label = true }: { amount: number; label?: boolean }) {
  return <div className="chip-bank"><div className="chip-columns">{splitChips(amount).map((denomination) => (
    <span className="chip-column" style={{ height: `${12 + (denomination.count - 1) * 4}px` }} key={denomination.value}>
      {Array.from({ length: denomination.count }, (_, index) => <i className={`chip-token ${denomination.className}`} style={{ bottom: `${index * 4}px`, animationDelay: `${index * 28}ms` }} key={index}>{denomination.value}</i>)}
    </span>
  ))}</div>{label && <b>{amount}</b>}</div>
}

export function BetChipPreview({ amount }: { amount: number }) {
  return <output className="bet-chip-preview" aria-label={`下注到 ${amount}`}><ChipBank amount={amount} /><strong>{amount}</strong></output>
}

export function ChipAnimations({ players, winners, seatStyles, settlement }: {
  players: ChipPlayer[]; winners: ChipWinner[]; seatStyles: CSSProperties[]; settlement: boolean
}) {
  const awards = new Map<string, number>()
  for (const winner of winners) awards.set(winner.playerId, (awards.get(winner.playerId) ?? 0) + winner.amount)
  const densityClass = players.length >= 8 ? 'very-crowded-chip-table' : players.length >= 5 ? 'crowded-chip-table' : ''
  return <div className={`chip-animation-layer ${densityClass}`} aria-hidden="true">
    {players.filter((player) => player.chips > 0).map((player) => {
      const seat = seatStyles[player.seat] ?? { left: '50%', top: '50%' }
      const seatLeft = Number.parseFloat(String(seat.left ?? 50))
      const seatTop = Number.parseFloat(String(seat.top ?? 50))
      const horizontalWeight = Math.abs(seatLeft - 50)
      const verticalWeight = Math.abs(seatTop - 50)
      const sideSeat = horizontalWeight >= verticalWeight * .72
      const diagonalSeat = sideSeat && verticalWeight > horizontalWeight * .42
      const target = pointBetween(seat, sideSeat ? .9 : .8)
      return <div className={`player-chip-bank ${sideSeat ? 'side-chip-bank' : ''} ${diagonalSeat ? 'diagonal-chip-bank' : ''}`} style={{ left: `${target.left}%`, top: `${target.top}%` }} key={`bank:${player.id}`}><ChipBank amount={player.chips} /></div>
    })}
    {!settlement && players.filter((player) => player.streetContribution > 0).map((player) => {
      const seat = seatStyles[player.seat] ?? { left: '50%', top: '50%' }
      const target = pointBetween(seat, .48)
      const style = { left: `${target.left}%`, top: `${target.top}%`, '--chip-from-left': String(seat.left), '--chip-from-top': String(seat.top) } as ChipStyle
      return <div className={`table-chip-bank pushed-chip ${players.length >= 7 ? 'compact-table-bet' : ''}`} style={style} key={`${player.id}:${player.streetContribution}`}><ChipBank amount={player.streetContribution} /></div>
    })}
    {settlement && [...awards].map(([playerId, amount], index) => {
      const player = players.find((candidate) => candidate.id === playerId)
      if (!player) return null
      const target = pointBetween(seatStyles[player.seat] ?? { left: '50%', top: '50%' }, .7)
      const style = { left: `${target.left}%`, top: `${target.top}%`, animationDelay: `${700 + index * 180}ms`, '--chip-from-left': '50%', '--chip-from-top': '53%' } as ChipStyle
      return <div className="table-chip-bank awarded-chip" style={style} key={`award:${playerId}:${amount}`}><ChipBank amount={amount} /></div>
    })}
  </div>
}
