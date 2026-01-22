import { useOS } from '../context/OSContext'

const SignalIcon = () => (
  <svg viewBox="0 0 18 18" className="h-3 w-3 sm:h-[14px] sm:w-[14px]" fill="currentColor">
    <path d="M1 14h2v3H1v-3Zm4-4h2v7H5v-7Zm4-4h2v11H9V6Zm4-4h2v15h-2V2Z" />
  </svg>
)

const WifiIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 sm:h-[16px] sm:w-[16px]" fill="currentColor">
    <path d="M12 18c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1zm-4.24-2.83a.996.996 0 0 0 0 1.41c.39.39 1.02.39 1.41 0 .79-.79 1.83-1.18 2.83-1.18s2.04.39 2.83 1.18c.39.39 1.02.39 1.41 0a.996.996 0 0 0 0-1.41 5.958 5.958 0 0 0-8.48 0zm-2.83-2.83a.996.996 0 0 0 0 1.41c.39.39 1.02.39 1.41 0a7.476 7.476 0 0 1 10.59 0c.39.39 1.02.39 1.41 0a.996.996 0 0 0 0-1.41c-3.51-3.51-9.2-3.51-12.71 0z"/>
  </svg>
)

const BatteryIcon = ({ level = 85 }: { level?: number }) => (
  <div className="flex items-center gap-0.5">
    <div className="relative w-5 sm:w-[22px] h-2.5 sm:h-[11px] border border-current rounded-[2px] sm:rounded-[3px] flex items-center p-[1px] sm:p-[1.5px]">
      <div className="h-full bg-current rounded-[1px] sm:rounded-[1.5px] transition-all" style={{ width: `${level}%` }} />
    </div>
    <div className="w-[1px] sm:w-[1.5px] h-[3px] sm:h-[4px] bg-current rounded-r-sm" />
  </div>
)

export default function StatusBar() {
  const { time, fontColor } = useOS()

  return (
    <div className="flex items-center justify-between" style={{ color: fontColor.value }}>
      <span className="text-[13px] sm:text-[15px] font-semibold tracking-tight w-10 sm:w-12">{time}</span>
      <div className="flex items-center gap-1 sm:gap-1.5">
        <SignalIcon />
        <WifiIcon />
        <BatteryIcon level={88} />
      </div>
    </div>
  )
}
