import { useNavigate, useParams } from 'react-router-dom'
import { getAppById } from '../data/apps'
import { useOS } from '../context/OSContext'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'

export default function AppScreen() {
  const navigate = useNavigate()
  const { appId } = useParams()
  const { fontColor } = useOS()
  const app = appId ? getAppById(appId) : undefined

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title={app?.name ?? '应用'} onBack={() => navigate('/', { replace: true })} />

        <div className="flex flex-1 flex-col items-center justify-center gap-3 sm:gap-4 text-center">
          {app?.icon && (
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shadow-lg animate-bounce-gentle">
              <img src={app.icon} alt={app.name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="text-lg sm:text-xl font-bold" style={{ color: fontColor.value }}>{app?.name ?? '未知 App'}</div>
          <p className="max-w-[240px] sm:max-w-[260px] text-xs sm:text-sm leading-relaxed opacity-60" style={{ color: fontColor.value }}>
            {app ? '这里是空白占位页，后续可接入真实功能 ✨' : '未找到该 App'}
          </p>
          
          <div className="mt-6 sm:mt-8 flex gap-3 sm:gap-4">
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-pink-400/60 animate-float" />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-purple-400/60 animate-float" style={{ animationDelay: '0.2s' }} />
            <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-cyan-400/60 animate-float" style={{ animationDelay: '0.4s' }} />
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
