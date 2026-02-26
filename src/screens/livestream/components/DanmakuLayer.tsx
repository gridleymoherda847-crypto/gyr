import { useEffect, useRef } from 'react'

export type DanmakuMessage = {
  id: string
  user: string
  text: string
  color?: string
  isSystem?: boolean
  isGift?: boolean
  level?: number
}

type Props = {
  messages: DanmakuMessage[]
  maxVisible?: number
}

const LEVEL_COLORS = ['', '#A8A8A8', '#7EC8E3', '#90EE90', '#FFD700', '#FF8C00', '#FF4500', '#FF1493', '#9400D3', '#00CED1']

export default function DanmakuLayer({ messages, maxVisible = 30 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages.length])

  const visible = messages.slice(-maxVisible)

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-[3px] overflow-y-hidden"
      style={{ maxHeight: '100%' }}
    >
      {visible.map(msg => (
        <div key={msg.id} className="animate-fadeInUp">
          {msg.isSystem ? (
            <span className="inline-block bg-black/30 backdrop-blur-sm rounded-full px-2 py-0.5 text-[10px] text-white/60">
              {msg.text}
            </span>
          ) : msg.isGift ? (
            <span className="inline-block bg-gradient-to-r from-yellow-400/25 to-orange-400/25 backdrop-blur-sm rounded-full px-2.5 py-0.5 text-[11px]">
              <span className="text-yellow-300 font-medium">{msg.user}</span>
              <span className="text-yellow-200 ml-1">{msg.text}</span>
            </span>
          ) : (
            <span className="inline-block bg-black/30 backdrop-blur-[2px] rounded-[14px] px-2.5 py-[3px] max-w-[85%]">
              {msg.level && msg.level > 0 && (
                <span
                  className="inline-block text-[8px] font-bold mr-1 px-1 py-[1px] rounded-sm"
                  style={{ background: LEVEL_COLORS[Math.min(msg.level, LEVEL_COLORS.length - 1)] + '33', color: LEVEL_COLORS[Math.min(msg.level, LEVEL_COLORS.length - 1)] || '#aaa' }}
                >
                  Lv.{msg.level}
                </span>
              )}
              <span
                className="text-[11px] font-medium mr-1"
                style={{ color: msg.color || '#4A90D9' }}
              >
                {msg.user}
              </span>
              <span className="text-[11px] text-white/90 break-all">{msg.text}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
