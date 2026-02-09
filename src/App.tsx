import { Suspense, lazy, useState, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { OSProvider, useOS } from './context/OSContext'
import { WeChatProvider, useWeChat } from './context/WeChatContext'
import PhoneShell from './components/PhoneShell'
import ErrorBoundary from './components/ErrorBoundary'
import ActivationScreen from './components/ActivationScreen'
import { checkDeviceActivationDetailed, getLocalActivationStatus, recoverActivationFromKv } from './services/redemption'

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
const IconManagerScreen = lazy(() => import('./screens/settings/IconManagerScreen'))

// Other apps
const DiaryVaultScreen = lazy(() => import('./screens/DiaryVaultScreen'))
const MibiScreen = lazy(() => import('./screens/MibiScreen'))
const SmsScreen = lazy(() => import('./screens/SmsScreen'))
const MusicScreen = lazy(() => import('./screens/MusicScreen'))
const PresetScreen = lazy(() => import('./screens/PresetScreen'))
const DoudizhuScreen = lazy(() => import('./screens/DoudizhuScreen'))
const ScratchCardScreen = lazy(() => import('./screens/ScratchCardScreen'))
const MinesweeperScreen = lazy(() => import('./screens/MinesweeperScreen'))
const LiaoliaoYishengScreen = lazy(() => import('./screens/LiaoliaoYishengScreen'))
const XScreen = lazy(() => import('./screens/XScreen'))
const ManualScreen = lazy(() => import('./screens/ManualScreen'))
const AnniversaryScreen = lazy(() => import('./screens/AnniversaryScreen'))
const MemoScreen = lazy(() => import('./screens/MemoScreen'))

// WeChat
const WeChatScreen = lazy(() => import('./screens/wechat/WeChatScreen'))
const CreateCharacterScreen = lazy(() => import('./screens/wechat/CreateCharacterScreen'))
const ChatScreen = lazy(() => import('./screens/wechat/ChatScreen'))
const ChatSettingsScreen = lazy(() => import('./screens/wechat/ChatSettingsScreen'))
const CoupleSpaceScreen = lazy(() => import('./screens/wechat/CoupleSpaceScreen'))
const WalletScreen = lazy(() => import('./screens/wechat/WalletScreen'))
const FundScreen = lazy(() => import('./screens/wechat/FundScreen'))
const GroupChatScreen = lazy(() => import('./screens/wechat/GroupChatScreen'))

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
  const { isHydrated: osHydrated } = useOS()
  const { isHydrated: wechatHydrated } = useWeChat()
  const hydrated = osHydrated && wechatHydrated
  
  // 激活状态
  const [isActivated, setIsActivated] = useState<boolean | null>(null)
  const [checkingActivation, setCheckingActivation] = useState(true)
  const [activationReason, setActivationReason] = useState<string>('')
  
  // 检查激活状态
  useEffect(() => {
    let cancelled = false
    let intervalId: number | null = null
    const firstNetworkFailAtRef = { current: 0 }

    const stopInterval = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId)
        intervalId = null
      }
    }

    const computeReason = (kind: 'mismatch' | 'no_local' | 'network_grace_timeout' | 'server') => {
      // 若本地激活已被清空：通常表示兑换码已迁移到其他设备
      const local = getLocalActivationStatus()
      if (kind === 'mismatch' || kind === 'no_local' || !local.isActivated) return '兑换码已在其他设备激活，当前设备已失效。'
      if (kind === 'network_grace_timeout') {
        if (navigator && 'onLine' in navigator && navigator.onLine === false) return '需要联网验证激活（离线超过5分钟）。'
        return '需要联网验证激活（网络异常超过5分钟）。'
      }
      if (kind === 'server') return '需要联网验证激活（服务异常）。'
      return '需要联网验证激活（验证失败）。'
    }

    const revalidate = async () => {
      const res = await checkDeviceActivationDetailed()
      if (cancelled) return
      if (res.ok) {
        firstNetworkFailAtRef.current = 0
        return
      }

      // 明确换绑/本地失效：立刻踢下线
      if (res.reason === 'mismatch' || res.reason === 'code_missing' || res.reason === 'no_local') {
        setActivationReason(computeReason(res.reason === 'mismatch' ? 'mismatch' : 'no_local'))
        setIsActivated(false)
        stopInterval()
        return
      }

      // 网络/服务异常：给 5 分钟宽限（避免正常玩家网络抖动被立刻踢）
      const now = Date.now()
      const failStart = firstNetworkFailAtRef.current || now
      if (!firstNetworkFailAtRef.current) firstNetworkFailAtRef.current = now
      const elapsed = now - failStart
      if (elapsed > 5 * 60 * 1000) {
        setActivationReason(computeReason('network_grace_timeout'))
        setIsActivated(false)
        stopInterval()
      }
    }

    const checkActivation = async () => {
      // 先检查本地状态（快速）
      let local = getLocalActivationStatus()
      if (!local.isActivated) {
        // 某些浏览器/内置 WebView 会在关闭后清 localStorage，但 IndexedDB 还在：尝试自动恢复，避免反复输入兑换码
        const recovered = await recoverActivationFromKv()
        local = getLocalActivationStatus()
        if (!recovered || !local.isActivated) {
          setIsActivated(false)
          setCheckingActivation(false)
          return
        }
      }
      
      // 后台验证服务器状态
      setIsActivated(true) // 先假设激活，避免闪屏
      setCheckingActivation(false)
      
      // 异步验证服务器
      await revalidate()
      if (cancelled) return

      // 每 2 分钟复查一次（保证“换绑后不刷新也会被踢”）
      if (intervalId == null) {
        intervalId = window.setInterval(() => { void revalidate() }, 120000)
      }
    }
    
    checkActivation()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void revalidate()
    }
    const onFocus = () => { void revalidate() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      stopInterval()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  
  // 激活成功回调
  const handleActivated = () => {
    setActivationReason('')
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
    return <ActivationScreen onActivated={handleActivated} reason={activationReason} />
  }

  return (
    <ErrorBoundary>
      <PhoneShell>
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
            <Route path="/apps/settings/icons" element={<IconManagerScreen />} />
            <Route path="/apps/diary-vault" element={<DiaryVaultScreen />} />
            <Route path="/apps/mibi" element={<MibiScreen />} />
            <Route path="/apps/sms" element={<SmsScreen />} />
            <Route path="/apps/music" element={<MusicScreen />} />
            <Route path="/apps/preset" element={<PresetScreen />} />
            <Route path="/apps/doudizhu" element={<DoudizhuScreen />} />
            <Route path="/apps/scratch-card" element={<ScratchCardScreen />} />
            <Route path="/apps/minesweeper" element={<MinesweeperScreen />} />
            <Route path="/apps/liaoliao-yisheng" element={<LiaoliaoYishengScreen />} />
            <Route path="/apps/x" element={<XScreen />} />
            <Route path="/apps/manual" element={<ManualScreen />} />
            <Route path="/apps/anniversary" element={<AnniversaryScreen />} />
            <Route path="/apps/memo" element={<MemoScreen />} />
            {/* WeChat Routes */}
            <Route path="/apps/wechat" element={<WeChatScreen />} />
            <Route path="/apps/wechat/create-character" element={<CreateCharacterScreen />} />
            <Route path="/apps/wechat/chat/:characterId" element={<ChatScreen />} />
            <Route path="/apps/wechat/chat/:characterId/settings" element={<ChatSettingsScreen />} />
            <Route path="/apps/wechat/couple-space/:characterId" element={<CoupleSpaceScreen />} />
            <Route path="/apps/wechat/group/:groupId" element={<GroupChatScreen />} />
            <Route path="/apps/wechat/wallet" element={<WeChatWalletRoute />} />
            <Route path="/apps/wechat/fund" element={<WeChatFundRoute />} />
            <Route path="/apps/:appId" element={<AppScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </PhoneShell>
    </ErrorBoundary>
  )
}

function WeChatWalletRoute() {
  const navigate = useNavigate()
  return <WalletScreen onBack={() => navigate('/apps/wechat', { replace: true })} />
}

function WeChatFundRoute() {
  const navigate = useNavigate()
  return <FundScreen onBack={() => navigate('/apps/wechat', { replace: true })} />
}
