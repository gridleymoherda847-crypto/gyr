import { type PropsWithChildren } from 'react'

type Props = PropsWithChildren<{
  className?: string
}>

// 微信统一背景布局 - 贯穿所有微信界面，背景图100%显示
export default function WeChatLayout({ children, className = '' }: Props) {
  return (
    <div 
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{
        backgroundImage: 'url(/icons/wechat-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* 内容 */}
      <div className="relative z-10 h-full w-full">
        {children}
      </div>
    </div>
  )
}
