import { useOS } from '../context/OSContext'

type Props = {
  appId: string
  label: string
  icon: string
  gradient: string
  size?: 'normal' | 'dock'
}

export default function AppIcon({ appId, label, icon, gradient, size = 'normal' }: Props) {
  const { customAppIcons, fontColor } = useOS()
  
  const iconSrc = customAppIcons[appId] || icon
  
  const sizeClasses = size === 'dock' 
    ? 'w-12 h-12 sm:w-14 sm:h-14 rounded-[14px] sm:rounded-[16px]' 
    : 'w-14 h-14 sm:w-16 sm:h-16 rounded-[16px] sm:rounded-[18px]'

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-1.5 press-effect">
      <div className={`relative ${sizeClasses} bg-gradient-to-br ${gradient} shadow-[0_3px_12px_rgba(0,0,0,0.12)] flex items-center justify-center overflow-hidden`}>
        {/* 光泽效果 */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-black/5" />
        
        {/* 图标：只显示图片 */}
        <img 
          src={iconSrc} 
          alt={label} 
          className="w-full h-full object-cover relative z-10"
        />
      </div>
      
      <span 
        className="text-[11px] sm:text-[13px] font-medium text-center max-w-[70px] truncate px-2 py-0.5 rounded-full backdrop-blur-sm"
        style={{ 
          color: fontColor.value,
          backgroundColor: 'rgba(255,255,255,0.15)',
          textShadow: '0 1px 2px rgba(0,0,0,0.15)'
        }}
      >
        {label}
      </span>
    </div>
  )
}
