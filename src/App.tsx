import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { OSProvider, useOS } from './context/OSContext'
import { WeChatProvider } from './context/WeChatContext'
import PhoneShell from './components/PhoneShell'
import ErrorBoundary from './components/ErrorBoundary'
import LockScreen from './components/LockScreen'
import HomeScreen from './screens/HomeScreen'
import AppScreen from './screens/AppScreen'
import SettingsScreen from './screens/SettingsScreen'
import ProfileScreen from './screens/settings/ProfileScreen'
import ApiConfigScreen from './screens/settings/ApiConfigScreen'
import WallpaperScreen from './screens/settings/WallpaperScreen'
import FontScreen from './screens/settings/FontScreen'
import ColorScreen from './screens/settings/ColorScreen'
import StickerManagerScreen from './screens/settings/StickerManagerScreen'
import MibiScreen from './screens/MibiScreen'
import SmsScreen from './screens/SmsScreen'
import MusicScreen from './screens/MusicScreen'
import PresetScreen from './screens/PresetScreen'
// WeChat
import WeChatScreen from './screens/wechat/WeChatScreen'
import CreateCharacterScreen from './screens/wechat/CreateCharacterScreen'
import ChatScreen from './screens/wechat/ChatScreen'
import ChatSettingsScreen from './screens/wechat/ChatSettingsScreen'
import CoupleSpaceScreen from './screens/wechat/CoupleSpaceScreen'
import WalletScreen from './screens/wechat/WalletScreen'
import StarGravityScreen from './screens/wechat/StarGravityScreen'

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
  const { isLocked } = useOS()

  return (
    <ErrorBoundary>
      <PhoneShell>
        {isLocked ? (
          <LockScreen />
        ) : (
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/apps/settings" element={<SettingsScreen />} />
            <Route path="/apps/settings/profile" element={<ProfileScreen />} />
            <Route path="/apps/settings/api" element={<ApiConfigScreen />} />
            <Route path="/apps/settings/wallpaper" element={<WallpaperScreen />} />
            <Route path="/apps/settings/font" element={<FontScreen />} />
            <Route path="/apps/settings/color" element={<ColorScreen />} />
            <Route path="/apps/settings/stickers" element={<StickerManagerScreen />} />
            <Route path="/apps/mibi" element={<MibiScreen />} />
            <Route path="/apps/sms" element={<SmsScreen />} />
            <Route path="/apps/music" element={<MusicScreen />} />
            <Route path="/apps/preset" element={<PresetScreen />} />
            {/* WeChat Routes */}
            <Route path="/apps/wechat" element={<WeChatScreen />} />
            <Route path="/apps/wechat/create-character" element={<CreateCharacterScreen />} />
            <Route path="/apps/wechat/chat/:characterId" element={<ChatScreen />} />
            <Route path="/apps/wechat/chat/:characterId/settings" element={<ChatSettingsScreen />} />
            <Route path="/apps/wechat/couple-space/:characterId" element={<CoupleSpaceScreen />} />
            <Route path="/apps/wechat/wallet" element={<WeChatWalletRoute />} />
            <Route path="/apps/wechat/star-gravity" element={<WeChatStarGravityRoute />} />
            <Route path="/apps/:appId" element={<AppScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </PhoneShell>
    </ErrorBoundary>
  )
}

function WeChatWalletRoute() {
  const navigate = useNavigate()
  return <WalletScreen onBack={() => navigate(-1)} />
}

function WeChatStarGravityRoute() {
  const navigate = useNavigate()
  return <StarGravityScreen onBack={() => navigate(-1)} />
}
