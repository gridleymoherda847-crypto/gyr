import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'

const COMMON_CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '武汉', '西安', '南京', '天津', '苏州']

export default function LocationScreen() {
  const navigate = useNavigate()
  const { locationSettings, setLocationSettings, weather, refreshWeather } = useOS()
  const [customCity, setCustomCity] = useState(locationSettings.manualCity)
  const [loading, setLoading] = useState(false)

  const handleModeChange = async (mode: 'auto' | 'manual') => {
    if (mode === 'auto') {
      setLoading(true)
      try {
        // 请求定位权限
        await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 })
        })
        setLocationSettings({ mode: 'auto' })
      } catch (error) {
        alert('无法获取定位，请检查浏览器权限设置')
      }
      setLoading(false)
    } else {
      setLocationSettings({ mode: 'manual' })
    }
  }

  const handleCitySelect = (city: string) => {
    setCustomCity(city)
    setLocationSettings({ manualCity: city, mode: 'manual' })
  }

  const handleCustomCitySubmit = () => {
    if (customCity.trim()) {
      setLocationSettings({ manualCity: customCity.trim(), mode: 'manual' })
    }
  }

  const handleRefresh = async () => {
    setLoading(true)
    await refreshWeather()
    setLoading(false)
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
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="mt-3 w-full py-2 bg-white/20 rounded-lg text-sm font-medium active:scale-95 disabled:opacity-50"
            >
              {loading ? '刷新中...' : '刷新天气'}
            </button>
          </div>

          {/* 定位方式 */}
          <div className="bg-white/60 backdrop-blur rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">定位方式</h3>
            <div className="space-y-2">
              <button
                onClick={() => handleModeChange('auto')}
                disabled={loading}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                  locationSettings.mode === 'auto' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>📡</span>
                  <span className="font-medium">自动定位</span>
                </div>
                {locationSettings.mode === 'auto' && <span>✓</span>}
              </button>
              
              <button
                onClick={() => handleModeChange('manual')}
                className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
                  locationSettings.mode === 'manual' 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>✏️</span>
                  <span className="font-medium">手动设置</span>
                </div>
                {locationSettings.mode === 'manual' && <span>✓</span>}
              </button>
            </div>
            
            {locationSettings.mode === 'auto' && (
              <p className="text-xs text-gray-500 mt-2">
                需要浏览器授权定位权限，将根据真实位置获取天气
              </p>
            )}
          </div>

          {/* 手动设置城市 */}
          {locationSettings.mode === 'manual' && (
            <div className="bg-white/60 backdrop-blur rounded-2xl p-4 mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">选择城市</h3>
              
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
          )}

          {/* 说明 */}
          <div className="bg-white/40 backdrop-blur rounded-2xl p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">说明</h3>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• 天气数据来自 Open-Meteo（免费API）</li>
              <li>• 自动定位需要浏览器授权</li>
              <li>• 天气每30分钟自动刷新一次</li>
              <li>• 点击主页天气可手动刷新</li>
            </ul>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
