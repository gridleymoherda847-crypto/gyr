export type GiftDef = {
  id: string
  name: string
  icon: string
  price: number
  animation: 'float' | 'explode' | 'fullscreen'
}

export const GIFT_LIST: GiftDef[] = [
  { id: 'heart', name: '小心心', icon: '❤️', price: 1, animation: 'float' },
  { id: 'rose', name: '玫瑰', icon: '🌹', price: 5, animation: 'float' },
  { id: 'candy', name: '棒棒糖', icon: '🍭', price: 10, animation: 'float' },
  { id: 'beer', name: '啤酒', icon: '🍺', price: 20, animation: 'float' },
  { id: 'cake', name: '蛋糕', icon: '🎂', price: 50, animation: 'explode' },
  { id: 'firework', name: '烟花', icon: '🎆', price: 100, animation: 'explode' },
  { id: 'rocket', name: '火箭', icon: '🚀', price: 500, animation: 'fullscreen' },
  { id: 'crown', name: '皇冠', icon: '👑', price: 1000, animation: 'fullscreen' },
]

type Props = {
  coins: number
  onSend: (gift: GiftDef) => void
  onClose: () => void
}

export default function GiftPanel({ coins, onSend, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-lg rounded-t-2xl pb-6 pt-3 px-3 animate-slideUp"
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部 */}
        <div className="flex items-center justify-between px-2 mb-3">
          <span className="text-white/60 text-xs">选择礼物</span>
          <span className="flex items-center gap-1 text-yellow-400 text-xs font-medium">
            🪙 {coins}
          </span>
        </div>

        {/* 礼物网格 */}
        <div className="grid grid-cols-4 gap-2">
          {GIFT_LIST.map(gift => {
            const canAfford = coins >= gift.price
            return (
              <button
                key={gift.id}
                type="button"
                onClick={() => canAfford && onSend(gift)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl transition-all ${
                  canAfford
                    ? 'bg-white/10 active:bg-white/20 active:scale-95'
                    : 'bg-white/5 opacity-40'
                }`}
              >
                <span className="text-3xl">{gift.icon}</span>
                <span className="text-white text-[10px] font-medium">{gift.name}</span>
                <span className="text-yellow-400 text-[10px]">🪙{gift.price}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
