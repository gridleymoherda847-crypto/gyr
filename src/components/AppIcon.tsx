import { useOS, MINIMAL_ICONS } from '../context/OSContext'

type Props = {
  appId: string
  label: string
  icon: string
  gradient: string
  size?: 'normal' | 'dock' | 'mini'
  iconOnly?: boolean
}

export default function AppIcon({ appId, label, icon, gradient, size = 'normal', iconOnly = false }: Props) {
  const { customAppIcons, fontColor, iconTheme } = useOS()
  
  // 根据主题选择图标
  // 优先级：自定义图标 > 主题图标 > 默认图标
  const getIconSrc = () => {
    if (customAppIcons[appId]) return customAppIcons[appId]
    if (iconTheme === 'minimal' && MINIMAL_ICONS[appId]) return MINIMAL_ICONS[appId]
    return icon
  }
  const iconSrc = getIconSrc()
  
  // 桌面排版2（minimal）使用白色背景（但自定义图标不需要底色，避免出现“粉边/彩边”）
  const isMinimal = iconTheme === 'minimal' && !customAppIcons[appId]
  const hasCustom = !!customAppIcons[appId]
  
  const sizeClasses =
    size === 'dock'
      ? 'w-[56px] h-[56px] sm:w-[64px] sm:h-[64px] rounded-[15px] sm:rounded-[17px]'
      : size === 'mini'
        ? 'w-[44px] h-[44px] rounded-[14px]'
        : 'w-[64px] h-[64px] sm:w-[72px] sm:h-[72px] rounded-[17px] sm:rounded-[19px]'

  const IconBox = (
    <div
      className={`relative ${sizeClasses} ${
        hasCustom
          ? 'bg-transparent'
          : (isMinimal ? 'bg-white/90' : `bg-gradient-to-br ${gradient}`)
      } shadow-[0_3px_12px_rgba(0,0,0,0.12)] flex items-center justify-center overflow-hidden`}
    >
      {/* 光泽效果 - 简洁主题用更轻的效果 */}
      {!hasCustom && (
        <div
          className={`absolute inset-0 ${
            isMinimal
              ? 'bg-gradient-to-b from-white/20 via-transparent to-black/3'
              : 'bg-gradient-to-b from-white/30 via-transparent to-black/5'
          }`}
        />
      )}
      
      {/* 图标 */}
      <img 
        src={iconSrc} 
        alt={label} 
        className={`relative z-10 ${
          iconTheme === 'minimal'
            ? (hasCustom ? 'w-[88%] h-[88%] object-cover rounded-xl' : 'w-[88%] h-[88%] object-contain')
            : (isMinimal ? 'w-10 h-10 sm:w-12 sm:h-12 object-contain' : 'w-full h-full object-cover')
        }`}
        loading="lazy"
        decoding="async"
      />
    </div>
  )

  if (iconOnly) return IconBox

  return (
    <div className="flex flex-col items-center gap-1 sm:gap-1.5 press-effect">
      {IconBox}
      <span 
        className="text-[12px] sm:text-[14px] font-medium text-center max-w-[80px] truncate px-2 py-0.5 rounded-full backdrop-blur-sm"
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
