import { Link } from 'react-router-dom'
import AppIcon from '../components/AppIcon'
import TimeWidget from '../components/TimeWidget'
import MusicWidget from '../components/MusicWidget'
import { GRID_APPS, DOCK_APPS } from '../data/apps'

export default function HomeScreen() {
  return (
    <div className="relative flex h-full flex-col px-3 sm:px-4 pt-2 pb-1 animate-fade-in">
      {/* 顶部时间组件 */}
      <div className="mb-4 sm:mb-5">
        <TimeWidget />
      </div>

      {/* 中间内容区 */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* 应用网格 - 居中偏左一点 */}
        <div className="flex justify-center">
          <div className="grid grid-cols-4 gap-x-6 gap-y-5 sm:gap-x-7 sm:gap-y-6">
            {GRID_APPS.map((app, index) => (
              <Link
                key={app.id}
                to={app.route}
                className="press-effect animate-scale-in flex justify-center"
                style={{ animationDelay: `${index * 40}ms` }}
              >
                <AppIcon 
                  appId={app.id}
                  label={app.name} 
                  icon={app.icon} 
                  gradient={app.gradient}
                />
              </Link>
            ))}
          </div>
        </div>
        
        {/* 音乐播放器小组件 - 往下移，往左移 */}
        <div className="flex justify-end pr-6 mt-2">
          <MusicWidget />
        </div>
      </div>

      {/* 底部 Dock 栏 */}
      <div className="mt-3 sm:mt-4 pb-1">
        <div className="mx-2 sm:mx-3 rounded-[22px] sm:rounded-[26px] bg-white/15 backdrop-blur-xl border border-white/20 px-5 sm:px-6 py-2 sm:py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-around">
            {DOCK_APPS.map((app, index) => (
              <Link
                key={app.id}
                to={app.route}
                className="press-effect animate-scale-in"
                style={{ animationDelay: `${(GRID_APPS.length + index) * 40}ms` }}
              >
                <AppIcon 
                  appId={app.id}
                  label={app.name} 
                  icon={app.icon} 
                  gradient={app.gradient}
                  size="dock"
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
