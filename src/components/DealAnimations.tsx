import type { CSSProperties } from 'react'
import type { GameState } from '../game'

type SeatStyle = { left: string; top: string }
type FlightStyle = CSSProperties & { '--target-left': string; '--target-top': string; '--flight-rotation': string }

const CARD_INTERVAL = 105
const FLIGHT_DURATION = 480

function activeDealOrder(game: GameState): number[] {
  const active = game.players.filter((player) => player.holeCards.length === 2)
  const startSeat = active.length === 2 ? game.dealerSeat : game.smallBlindSeat ?? game.dealerSeat
  return [...active]
    .sort((left, right) => {
      const leftDistance = (left.seat - startSeat + game.players.length) % game.players.length
      const rightDistance = (right.seat - startSeat + game.players.length) % game.players.length
      return leftDistance - rightDistance
    })
    .map((player) => player.seat)
}

export function holeCardDelay(game: GameState, seat: number, cardIndex: number): number {
  const order = activeDealOrder(game)
  const position = order.indexOf(seat)
  return Math.max(0, cardIndex * order.length + position) * CARD_INTERVAL
}

export function holeDealDuration(game: GameState): number {
  return activeDealOrder(game).length * 2 * CARD_INTERVAL + FLIGHT_DURATION + 320
}

function flightStyle(target: SeatStyle, delay: number, rotation: number): FlightStyle {
  return {
    '--target-left': target.left,
    '--target-top': target.top,
    '--flight-rotation': `${rotation}deg`,
    animationDelay: `${delay}ms`,
  }
}

const boardTargets = ['40%', '45%', '50%', '55%', '60%']

export function DealAnimations({ game, seatStyles }: { game: GameState; seatStyles: SeatStyle[] }) {
  const order = activeDealOrder(game)
  const streetStart = game.phase === 'FLOP' ? 0 : game.phase === 'TURN' ? 3 : game.phase === 'RIVER' ? 4 : -1
  const streetCount = game.phase === 'FLOP' ? 3 : game.phase === 'TURN' || game.phase === 'RIVER' ? 1 : 0

  return (
    <div className="deal-animation-layer" aria-hidden="true">
      <div className="deck-stack"><span>R</span><span>R</span><span>R</span></div>
      <div key={`holes-${game.handNumber}-${order.join('-')}`}>
        {[0, 1].flatMap((cardIndex) => order.map((seat, position) => {
          const delay = (cardIndex * order.length + position) * CARD_INTERVAL
          return <i key={`${cardIndex}-${seat}`} className="flying-card" style={flightStyle(seatStyles[seat], delay, (seat % 5 - 2) * 5)}>R</i>
        }))}
      </div>
      {streetStart >= 0 && <div key={`board-${game.handNumber}-${game.phase}`}>
        <i className="flying-card burn-card" style={{ animationDelay: '0ms' }}>R</i>
        {Array.from({ length: streetCount }, (_, offset) => {
          const cardIndex = streetStart + offset
          return <i key={cardIndex} className="flying-card board-flight" style={{
            '--target-left': boardTargets[cardIndex], '--target-top': '50%', '--flight-rotation': `${(cardIndex - 2) * 2}deg`,
            animationDelay: `${180 + offset * 150}ms`,
          } as FlightStyle}>R</i>
        })}
      </div>}
    </div>
  )
}
