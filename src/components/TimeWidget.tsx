import { useOS } from '../context/OSContext'

export default function TimeWidget() {
  const { time, fontColor, currentFont, weather, refreshWeather } = useOS()
  
  const now = new Date()
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`
  const weekDay = weekDays[now.getDay()]

  return (
    <div className="w-full px-2">
      <div 
        className="rounded-[24px] sm:rounded-[28px] p-4 sm:p-5"
        style={{ 
          background: `${fontColor.value}10`,
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* 大时间 */}
        <div 
          className="text-center select-none"
          style={{
            fontSize: 'clamp(42px, 11vw, 54px)',
            fontWeight: 800,
            fontFamily: currentFont.fontFamily,
            color: fontColor.value,
            lineHeight: 1,
            letterSpacing: '2px',
            textShadow: '0 2px 10px rgba(0,0,0,0.1)',
          }}
        >
          {time}
        </div>
        
        {/* 日期和天气 */}
        <div 
          className="flex items-center justify-center gap-3 sm:gap-4 mt-2"
          style={{ color: fontColor.value, opacity: 0.7 }}
        >
          <span 
            className="text-sm sm:text-base"
            style={{ fontFamily: currentFont.fontFamily }}
          >
            {dateStr} {weekDay}
          </span>
          <span className="text-white/30">|</span>
          <button 
            onClick={() => refreshWeather()}
            className="flex items-center gap-1 text-sm sm:text-base hover:opacity-80 active:scale-95 transition-all"
            style={{ fontFamily: currentFont.fontFamily }}
          >
            <span>{weather.icon}</span>
            <span>{weather.temp} {weather.desc}</span>
            <span className="text-xs opacity-60">({weather.city})</span>
          </button>
        </div>
      </div>
    </div>
  )
}
