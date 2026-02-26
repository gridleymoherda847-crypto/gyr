import { useEffect, useState } from 'react'
import type { GiftDef } from './GiftPanel'

export type GiftEvent = {
  id: string
  gift: GiftDef
  sender: string
  timestamp: number
}

type Props = {
  events: GiftEvent[]
}

function FloatingGift({ event }: { event: GiftEvent }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2500)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  return (
    <div className="absolute left-3 animate-giftFloat pointer-events-none" style={{ bottom: '30%', zIndex: 9998 }}>
      <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm rounded-full pl-2 pr-3 py-1.5">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold">
          {event.sender[0]}
        </div>
        <div className="flex flex-col">
          <span className="text-white text-[10px] font-medium">{event.sender}</span>
          <span className="text-white/70 text-[9px]">送出 {event.gift.name}</span>
        </div>
        <span className="text-2xl ml-1 animate-bounce">{event.gift.icon}</span>
      </div>
    </div>
  )
}

function FullscreenGift({ event }: { event: GiftEvent }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 3000)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-giftFullscreen" style={{ zIndex: 9998 }}>
      <div className="flex flex-col items-center gap-2">
        <span className="text-7xl animate-pulse">{event.gift.icon}</span>
        <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-1.5">
          <span className="text-white text-sm font-bold">
            {event.sender} 送出 {event.gift.name}!
          </span>
        </div>
      </div>
    </div>
  )
}

export default function GiftAnimation({ events }: Props) {
  const recentEvents = events.slice(-5)

  return (
    <>
      {recentEvents.map(ev => {
        if (ev.gift.animation === 'fullscreen') {
          return <FullscreenGift key={ev.id} event={ev} />
        }
        return <FloatingGift key={ev.id} event={ev} />
      })}
    </>
  )
}
