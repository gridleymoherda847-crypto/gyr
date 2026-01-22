import { useNavigate } from 'react-router-dom'
import { useOS, COLOR_OPTIONS, type ColorOption } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'

export default function ColorScreen() {
  const navigate = useNavigate()
  const { fontColor, setFontColor, currentFont } = useOS()

  const handleColorSelect = (color: ColorOption) => setFontColor(color)

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="字体颜色" onBack={() => navigate('/apps/settings')} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-4">
          <p className="text-sm opacity-50 mb-2" style={{ color: fontColor.value }}>选择适合壁纸的字体颜色</p>
          
          {/* 颜色网格 */}
          <div className="grid grid-cols-4 gap-3">
            {COLOR_OPTIONS.map((color) => {
              const isSelected = fontColor.id === color.id
              return (
                <button key={color.id} onClick={() => handleColorSelect(color)} className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all press-effect ${isSelected ? 'bg-white/70 ring-2 ring-pink-300' : 'bg-white/50 hover:bg-white/60'}`}>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-white/50 shadow-md" style={{ backgroundColor: color.value }} />
                  <span className="text-[11px] sm:text-xs opacity-70" style={{ color: fontColor.value }}>{color.name}</span>
                </button>
              )
            })}
          </div>
          
          {/* 预览 */}
          <div className="mt-6 p-4 rounded-2xl bg-white/50 border border-white/30">
            <div className="text-xs opacity-40 mb-3" style={{ color: fontColor.value }}>预览效果</div>
            <div style={{ fontFamily: currentFont.fontFamily, color: fontColor.value }}>
              <div className="text-3xl font-bold">12:34</div>
              <div className="text-base mt-1">1月20日 星期一</div>
              <div className="text-sm mt-2 opacity-70">这是一段示例文字</div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
