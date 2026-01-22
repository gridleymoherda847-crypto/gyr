import { Link } from 'react-router-dom'
import { useOS } from '../context/OSContext'

type SettingsItemProps = {
  label: string
  value?: string
  to?: string
  onClick?: () => void
  rightElement?: React.ReactNode
  showArrow?: boolean
}

export function SettingsItem({ 
  label, 
  value, 
  to, 
  onClick,
  rightElement,
  showArrow = true 
}: SettingsItemProps) {
  const { fontColor } = useOS()
  
  const content = (
    <div 
      className="flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-3.5 bg-white/50 hover:bg-white/60 active:bg-white/70 transition-colors first:rounded-t-2xl last:rounded-b-2xl border-b border-white/20 last:border-b-0"
      style={{ color: fontColor.value }}
    >
      <span className="flex-1 text-[14px] sm:text-[15px] font-medium" style={{ color: fontColor.value }}>
        {label}
      </span>
      
      {rightElement ? rightElement : (
        <div className="flex items-center gap-2">
          {value && (
            <span className="text-[13px] sm:text-[14px] max-w-[100px] sm:max-w-[120px] truncate" style={{ color: fontColor.value, opacity: 0.5 }}>
              {value}
            </span>
          )}
          {showArrow && (
            <svg className="w-4 h-4" style={{ color: fontColor.value, opacity: 0.4 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
        </div>
      )}
    </div>
  )

  if (to) return <Link to={to} className="block">{content}</Link>
  if (onClick) return <button type="button" onClick={onClick} className="w-full text-left">{content}</button>
  return content
}

type SettingsGroupProps = {
  title?: string
  children: React.ReactNode
}

export function SettingsGroup({ title, children }: SettingsGroupProps) {
  const { fontColor } = useOS()
  
  return (
    <div className="mb-5 sm:mb-6">
      {title && (
        <div 
          className="text-[12px] sm:text-[13px] font-medium mb-2 px-3 sm:px-4 uppercase tracking-wide"
          style={{ color: fontColor.value, opacity: 0.5 }}
        >
          {title}
        </div>
      )}
      <div className="rounded-2xl overflow-hidden shadow-[0_2px_15px_rgba(0,0,0,0.08)] border border-white/20">
        {children}
      </div>
    </div>
  )
}
