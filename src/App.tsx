import { Suspense, lazy, useState, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { OSProvider, useOS } from './context/OSContext'
import { WeChatProvider, useWeChat } from './context/WeChatContext'
import PhoneShell from './components/PhoneShell'
import ErrorBoundary from './components/ErrorBoundary'
import LockScreen from './components/LockScreen'
import ActivationScreen from './components/ActivationScreen'
import { checkDeviceActivation, getLocalActivationStatus } from './services/redemption'

// 路由按需加载（减少首屏体积，避免移动端黑屏）
const HomeScreen = lazy(() => import('./screens/HomeScreen'))
const AppScreen = lazy(() => import('./screens/AppScreen'))

// Settings
const SettingsScreen = lazy(() => import('./screens/SettingsScreen'))
const ProfileScreen = lazy(() => import('./screens/settings/ProfileScreen'))
const ApiConfigScreen = lazy(() => import('./screens/settings/ApiConfigScreen'))
const WallpaperScreen = lazy(() => import('./screens/settings/WallpaperScreen'))
const FontScreen = lazy(() => import('./screens/settings/FontScreen'))
const ColorScreen = lazy(() => import('./screens/settings/ColorScreen'))
const StickerManagerScreen = lazy(() => import('./screens/settings/StickerManagerScreen'))
const LocationScreen = lazy(() => import('./screens/settings/LocationScreen'))

// Other apps
const DiaryVaultScreen = lazy(() => import('./screens/DiaryVaultScreen'))
const MibiScreen = lazy(() => import('./screens/MibiScreen'))
const SmsScreen = lazy(() => import('./screens/SmsScreen'))
const MusicScreen = lazy(() => import('./screens/MusicScreen'))
const PresetScreen = lazy(() => import('./screens/PresetScreen'))
const DoudizhuScreen = lazy(() => import('./screens/DoudizhuScreen'))
const XScreen = lazy(() => import('./screens/XScreen'))
const ManualScreen = lazy(() => import('./screens/ManualScreen'))

// WeChat
const WeChatScreen = lazy(() => import('./screens/wechat/WeChatScreen'))
const CreateCharacterScreen = lazy(() => import('./screens/wechat/CreateCharacterScreen'))
const ChatScreen = lazy(() => import('./screens/wechat/ChatScreen'))
const ChatSettingsScreen = lazy(() => import('./screens/wechat/ChatSettingsScreen'))
const CoupleSpaceScreen = lazy(() => import('./screens/wechat/CoupleSpaceScreen'))
const WalletScreen = lazy(() => import('./screens/wechat/WalletScreen'))

function PhoneSkeleton() {
  return (
    <div className="h-full w-full flex items-center justify-center bg-gradient-to-b from-pink-50 via-white to-pink-100">
      <div
        className="text-[54px] font-extrabold tracking-wide select-none"
        style={{
          fontFamily: '"Baloo 2", "ZCOOL KuaiLe", "Noto Sans SC", system-ui, -apple-system, Segoe UI, sans-serif',
          background: 'linear-gradient(135deg, #fb7185 0%, #ec4899 55%, #f472b6 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          textShadow: '0 10px 30px rgba(236,72,153,0.18)',
        }}
      >
        Mina
      </div>
    </div>
  )
}

export default function App() {
  return (
    <OSProvider>
      <WeChatProvider>
        <BrowserRouter>
          <InnerApp />
        </BrowserRouter>
      </WeChatProvider>
    </OSProvider>
  )
}

function InnerApp() {
  const { isLocked, isHydrated: osHydrated } = useOS()
  const { isHydrated: wechatHydrated } = useWeChat()
  const hydrated = osHydrated && wechatHydrated
  
  // 激活状态
  const [isActivated, setIsActivated] = useState<boolean | null>(null)
  const [checkingActivation, setCheckingActivation] = useState(true)
  
  // 检查激活状态
  useEffect(() => {
    const checkActivation = async () => {
      // 先检查本地状态（快速）
      const local = getLocalActivationStatus()
      if (!local.isActivated) {
        setIsActivated(false)
        setCheckingActivation(false)
        return
      }
      
      // 后台验证服务器状态
      setIsActivated(true) // 先假设激活，避免闪屏
      setCheckingActivation(false)
      
      // 异步验证服务器
      const serverValid = await checkDeviceActivation()
      if (!serverValid) {
        setIsActivated(false)
      }
    }
    
    checkActivation()
  }, [])
  
  // 激活成功回调
  const handleActivated = () => {
    setIsActivated(true)
  }
  
  // 还在检查激活状态
  if (checkingActivation || !hydrated) {
    return (
      <ErrorBoundary>
        <PhoneShell>
          <PhoneSkeleton />
        </PhoneShell>
      </ErrorBoundary>
    )
  }
  
  // 未激活，显示激活界面
  if (!isActivated) {
    return <ActivationScreen onActivated={handleActivated} />
  }

  return (
    <ErrorBoundary>
      <PhoneShell>
        {isLocked ? (
          <LockScreen />
        ) : (
          <Suspense fallback={<PhoneSkeleton />}>
            <Routes>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/apps/settings" element={<SettingsScreen />} />
              <Route path="/apps/settings/profile" element={<ProfileScreen />} />
              <Route path="/apps/settings/api" element={<ApiConfigScreen />} />
              <Route path="/apps/settings/wallpaper" element={<WallpaperScreen />} />
              <Route path="/apps/settings/font" element={<FontScreen />} />
              <Route path="/apps/settings/color" element={<ColorScreen />} />
              <Route path="/apps/settings/stickers" element={<StickerManagerScreen />} />
              <Route path="/apps/settings/location" element={<LocationScreen />} />
              <Route path="/apps/diary-vault" element={<DiaryVaultScreen />} />
              <Route path="/apps/mibi" element={<MibiScreen />} />
              <Route path="/apps/sms" element={<SmsScreen />} />
              <Route path="/apps/music" element={<MusicScreen />} />
              <Route path="/apps/preset" element={<PresetScreen />} />
              <Route path="/apps/doudizhu" element={<DoudizhuScreen />} />
              <Route path="/apps/x" element={<XScreen />} />
              <Route path="/apps/manual" element={<ManualScreen />} />
              {/* WeChat Routes */}
              <Route path="/apps/wechat" element={<WeChatScreen />} />
              <Route path="/apps/wechat/create-character" element={<CreateCharacterScreen />} />
              <Route path="/apps/wechat/chat/:characterId" element={<ChatScreen />} />
              <Route path="/apps/wechat/chat/:characterId/settings" element={<ChatSettingsScreen />} />
              <Route path="/apps/wechat/couple-space/:characterId" element={<CoupleSpaceScreen />} />
              <Route path="/apps/wechat/wallet" element={<WeChatWalletRoute />} />
              <Route path="/apps/:appId" element={<AppScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        )}
      </PhoneShell>
    </ErrorBoundary>
  )
}

function WeChatWalletRoute() {
  const navigate = useNavigate()
  return <WalletScreen onBack={() => navigate(-1)} />
}
