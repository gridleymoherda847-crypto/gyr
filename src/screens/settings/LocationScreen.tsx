import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'

const COMMON_CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '武汉', '西安', '南京', '天津', '苏州']

export default function LocationScreen() {
  const navigate = useNavigate()
  const { locationSettings, setLocationSettings, weather } = useOS()
  const [customCity, setCustomCity] = useState(locationSettings.manualCity)
  const [manualTemp, setManualTemp] = useState(() => String(locationSettings.manualTempC ?? 18))
  const [manualType, setManualType] = useState(locationSettings.manualWeatherType || 'sunny')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setCustomCity(locationSettings.manualCity)
    setManualTemp(String(locationSettings.manualTempC ?? 18))
    setManualType(locationSettings.manualWeatherType || 'sunny')
  }, [locationSettings.manualCity])

  const handleCitySelect = (city: string) => {
    setCustomCity(city)
    setLocationSettings({ manualCity: city, mode: 'manual' })
  }

  const handleCustomCitySubmit = () => {
    if (customCity.trim()) {
      setLocationSettings({ manualCity: customCity.trim(), mode: 'manual' })
    }
  }
  
  const handleSave = () => {
    const t = manualTemp.trim()
    const num = t === '' ? 18 : Math.max(-80, Math.min(80, Number(t)))
    setLocationSettings({
      manualCity: String(customCity || '').trim() || locationSettings.manualCity,
      manualWeatherType: manualType as any,
      manualTempC: Number.isFinite(num) ? num : 18,
      mode: 'manual',
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="位置与天气" onBack={() => navigate('/apps/settings')} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4">
          {/* 当前天气 */}
          <div className="bg-gradient-to-br from-blue-400 to-purple-500 rounded-2xl p-4 mb-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold">{weather.temp}</div>
                <div className="text-sm opacity-80">{weather.desc}</div>
                <div className="text-xs opacity-60 mt-1">📍 {weather.city}</div>
              </div>
              <div className="text-5xl">{weather.icon}</div>
            </div>
            <div className="mt-3 text-xs opacity-80">这里的天气为手动设置，不会自动请求定位或刷新覆盖。</div>
          </div>

          {/* 手动设置城市 */}
          <div className="bg-white/60 backdrop-blur rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">选择城市（仅手动定位）</h3>
            
            {/* 自定义输入 */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={customCity}
                onChange={(e) => setCustomCity(e.target.value)}
                placeholder="输入城市名称"
                className="flex-1 px-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                onClick={handleCustomCitySubmit}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium active:scale-95"
              >
                确定
              </button>
            </div>
            
            {/* 常用城市 */}
            <div className="flex flex-wrap gap-2">
              {COMMON_CITIES.map(city => (
                <button
                  key={city}
                  onClick={() => handleCitySelect(city)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                    locationSettings.manualCity === city
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>

          {/* 手动设置天气 */}
          <div className="bg-white/60 backdrop-blur rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">自定义天气</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">天气</div>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 text-sm outline-none"
                >
                  <option value="sunny">晴</option>
                  <option value="cloudy">多云</option>
                  <option value="rain">下雨</option>
                  <option value="snow">下雪</option>
                  <option value="fog">有雾</option>
                  <option value="storm">雷雨</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">温度（°C）</div>
                <input
                  type="number"
                  value={manualTemp}
                  onChange={(e) => setManualTemp(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-100 text-sm outline-none"
                  min={-80}
                  max={80}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSave}
              className="mt-3 w-full py-2 rounded-lg bg-blue-500 text-white text-sm font-medium active:scale-95"
            >
              {saved ? '已保存' : '保存'}
            </button>
          </div>

          {/* 说明 */}
          <div className="bg-white/40 backdrop-blur rounded-2xl p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">说明</h3>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• 位置与天气均为手动设置（支持国内/国外任意城市）</li>
              <li>• 不会请求自动定位权限</li>
            </ul>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
