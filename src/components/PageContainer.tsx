import type { PropsWithChildren } from 'react'

// 页面容器 - 添加半透明遮罩降低壁纸存在感
export default function PageContainer({ children }: PropsWithChildren) {
  return (
    <div className="relative h-full w-full">
      {/* 雾化遮罩层 */}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-sm" />
      
      {/* 内容 */}
      <div className="relative z-10 h-full">
        {children}
      </div>
    </div>
  )
}
