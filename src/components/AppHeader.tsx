import { useNavigate } from 'react-router-dom'
import { useOS } from '../context/OSContext'

type Props = {
  title: string
  onBack?: () => void
  showBack?: boolean
  rightElement?: React.ReactNode
}

export default function AppHeader({ title, onBack, showBack = true, rightElement }: Props) {
  const navigate = useNavigate()
  const { fontColor } = useOS()

  const handleBack = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (onBack) onBack()
    else navigate(-1)
  }

  return (
    <div className="flex items-center justify-between mb-3 sm:mb-4 min-h-[40px] sm:min-h-[44px]">
      <div className="w-14 sm:w-16">
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            onTouchEnd={handleBack}
            className="flex items-center gap-0.5 sm:gap-1 transition-opacity hover:opacity-70 press-effect relative z-10"
            style={{ color: fontColor.value }}
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[14px] sm:text-[15px] font-medium">返回</span>
          </button>
        )}
      </div>
      
      <h1 
        className="text-base sm:text-lg font-bold text-center flex-1"
        style={{ color: fontColor.value }}
      >
        {title}
      </h1>
      
      <div className="w-14 sm:w-16 flex justify-end">{rightElement}</div>
    </div>
  )
}
