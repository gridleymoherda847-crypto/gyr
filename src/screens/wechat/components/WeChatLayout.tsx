import type { PropsWithChildren } from 'react'

type Props = PropsWithChildren<{
  className?: string
}>

// 微信全局背景布局组件
export default function WeChatLayout({ children, className = '' }: Props) {
  return (
    <div 
      className={`flex h-full flex-col overflow-hidden -mt-1 relative ${className}`}
      style={{
        backgroundImage: 'url(/icons/wechat-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* 背景遮罩 - 透明度20% */}
      <div className="absolute inset-0 bg-white/80" />
      
      {/* 内容 */}
      <div className="relative z-10 flex flex-col h-full">
        {children}
      </div>
    </div>
  )
}
