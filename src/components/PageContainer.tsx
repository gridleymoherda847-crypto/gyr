import type { PropsWithChildren } from 'react'

// 页面容器 - 添加半透明遮罩降低壁纸存在感
export default function PageContainer({ children }: PropsWithChildren) {
  return (
    <div className="relative h-full w-full">
      {/* 雾化遮罩层 */}
      {/* 移动端禁用全屏 backdrop blur（GPU 开销极高，影响聊天滑动）；仅桌面端保留 */}
      <div className="absolute inset-0 bg-white/70 md:bg-white/60 md:backdrop-blur-sm" />
      
      {/* 内容 */}
      <div className="relative z-10 h-full">
        {children}
      </div>
    </div>
  )
}
