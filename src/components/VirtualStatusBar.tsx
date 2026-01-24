import { useState, useEffect } from 'react'

export default function VirtualStatusBar() {
  const [time, setTime] = useState('')
  const [batteryLevel, setBatteryLevel] = useState(100)
  const [isCharging, setIsCharging] = useState(false)

  // 更新时间
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const hours = now.getHours().toString().padStart(2, '0')
      const minutes = now.getMinutes().toString().padStart(2, '0')
      setTime(`${hours}:${minutes}`)
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // 获取电池信息（如果浏览器支持）
  useEffect(() => {
    const getBattery = async () => {
      try {
        // @ts-ignore - Battery API 不是所有浏览器都支持
        if (navigator.getBattery) {
          // @ts-ignore
          const battery = await navigator.getBattery()
          setBatteryLevel(Math.round(battery.level * 100))
          setIsCharging(battery.charging)
          
          battery.addEventListener('levelchange', () => {
            setBatteryLevel(Math.round(battery.level * 100))
          })
          battery.addEventListener('chargingchange', () => {
            setIsCharging(battery.charging)
          })
        }
      } catch (e) {
        // 不支持电池API，使用默认值
      }
    }
    getBattery()
  }, [])

  return (
    <div className="flex items-center justify-between px-6 py-1 bg-black/90 text-white text-[13px] font-medium">
      {/* 左侧：时间 */}
      <div className="w-16">
        {time}
      </div>

      {/* 中间：灵动岛占位 */}
      <div className="w-28 h-[28px] bg-black rounded-full" />

      {/* 右侧：信号、WiFi、电池 */}
      <div className="w-16 flex items-center justify-end gap-1">
        {/* 信号强度 */}
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
          <rect x="0" y="8" width="3" height="4" rx="0.5" fill="white"/>
          <rect x="4" y="5" width="3" height="7" rx="0.5" fill="white"/>
          <rect x="8" y="2" width="3" height="10" rx="0.5" fill="white"/>
          <rect x="12" y="0" width="3" height="12" rx="0.5" fill="white"/>
        </svg>

        {/* WiFi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path d="M8 9.5C8.82843 9.5 9.5 10.1716 9.5 11C9.5 11.8284 8.82843 12.5 8 12.5C7.17157 12.5 6.5 11.8284 6.5 11C6.5 10.1716 7.17157 9.5 8 9.5Z" fill="white"/>
          <path d="M4.5 7.5C5.5 6.5 6.7 6 8 6C9.3 6 10.5 6.5 11.5 7.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M2 4.5C3.8 2.8 5.8 2 8 2C10.2 2 12.2 2.8 14 4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>

        {/* 电池 */}
        <div className="flex items-center">
          <div className="relative w-[22px] h-[11px] border border-white/80 rounded-[3px]">
            <div 
              className={`absolute left-[1px] top-[1px] bottom-[1px] rounded-[1.5px] ${
                isCharging ? 'bg-green-400' : batteryLevel <= 20 ? 'bg-red-400' : 'bg-white'
              }`}
              style={{ width: `${Math.max(2, (batteryLevel / 100) * 18)}px` }}
            />
            {isCharging && (
              <svg className="absolute inset-0 m-auto w-3 h-3" viewBox="0 0 12 12" fill="none">
                <path d="M7 1L3 7H6L5 11L9 5H6L7 1Z" fill="#000" stroke="#000" strokeWidth="0.5"/>
              </svg>
            )}
          </div>
          <div className="w-[2px] h-[5px] bg-white/80 rounded-r-sm ml-[1px]" />
        </div>
      </div>
    </div>
  )
}
