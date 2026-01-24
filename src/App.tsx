import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { OSProvider, useOS } from './context/OSContext'
import { WeChatProvider, useWeChat } from './context/WeChatContext'
import PhoneShell from './components/PhoneShell'
import ErrorBoundary from './components/ErrorBoundary'
import LockScreen from './components/LockScreen'

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

// WeChat
const WeChatScreen = lazy(() => import('./screens/wechat/WeChatScreen'))
const CreateCharacterScreen = lazy(() => import('./screens/wechat/CreateCharacterScreen'))
const ChatScreen = lazy(() => import('./screens/wechat/ChatScreen'))
const ChatSettingsScreen = lazy(() => import('./screens/wechat/ChatSettingsScreen'))
const CoupleSpaceScreen = lazy(() => import('./screens/wechat/CoupleSpaceScreen'))
const WalletScreen = lazy(() => import('./screens/wechat/WalletScreen'))

function PhoneSkeleton() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="w-full max-w-[360px] px-6">
        <div className="rounded-3xl bg-white/90 border border-black/10 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gray-200 animate-pulse" />
            <div className="flex-1">
              <div className="h-3 w-28 bg-gray-200 rounded-full animate-pulse" />
              <div className="mt-2 h-2 w-40 bg-gray-100 rounded-full animate-pulse" />
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <div className="h-3 w-full bg-gray-100 rounded-full animate-pulse" />
            <div className="h-3 w-5/6 bg-gray-100 rounded-full animate-pulse" />
            <div className="h-3 w-2/3 bg-gray-100 rounded-full animate-pulse" />
          </div>
          <div className="mt-6 text-center text-xs text-gray-500">正在加载…</div>
        </div>
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

  return (
    <ErrorBoundary>
      <PhoneShell>
        {!hydrated ? (
          <PhoneSkeleton />
        ) : isLocked ? (
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
