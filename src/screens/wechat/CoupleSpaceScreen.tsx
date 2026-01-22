import { useNavigate, useParams } from 'react-router-dom'
import { useWeChat } from '../../context/WeChatContext'
import WeChatLayout from './WeChatLayout'

export default function CoupleSpaceScreen() {
  const navigate = useNavigate()
  const { characterId } = useParams<{ characterId: string }>()
  const { getCharacter } = useWeChat()
  
  const character = getCharacter(characterId || '')

  const handleBack = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    navigate(-1)
  }

  return (
    <WeChatLayout>
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-2">
        <button 
          type="button" 
          onClick={handleBack}
          onTouchEnd={handleBack}
          className="flex items-center text-pink-600 relative z-10"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="font-semibold text-pink-600">情侣空间</span>
        <div className="w-5" />
      </div>

      {/* 内容 */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="w-full rounded-2xl bg-white/35 backdrop-blur-md border border-white/30 p-6 text-center shadow-[0_12px_30px_rgba(0,0,0,0.10)]">
        <div className="text-xl font-semibold text-pink-600 mb-2">
          {character?.name || ''}的情侣空间
        </div>
        <div className="text-gray-500 text-sm text-center">
          功能开发中...
          <br />
          敬请期待
        </div>
        </div>
      </div>
    </WeChatLayout>
  )
}
