import { useNavigate } from 'react-router-dom'
import { useOS, FONT_OPTIONS, type FontOption } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'

export default function FontScreen() {
  const navigate = useNavigate()
  const { currentFont, setCurrentFont, fontColor, fontScale, setFontScale } = useOS()

  const handleFontSelect = (font: FontOption) => setCurrentFont(font)

  const sizeOptions = [
    { id: 's', name: '小', scale: 0.9 },
    { id: 'm', name: '标准', scale: 1.0 },
    { id: 'l', name: '大', scale: 1.1 },
    { id: 'xl', name: '超大', scale: 1.2 },
  ] as const

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="字体设置" onBack={() => navigate('/apps/settings')} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-3 sm:space-y-4">
          <div className="p-3 sm:p-4 rounded-2xl bg-white/50 border border-white/30">
            <div className="text-sm font-medium mb-1" style={{ color: fontColor.value }}>字体大小</div>
            <div className="text-xs opacity-50 mb-3" style={{ color: fontColor.value }}>
              调整整个小手机的字体大小（全局生效）
            </div>
            <div className="grid grid-cols-4 gap-2">
              {sizeOptions.map((opt) => {
                const selected = Math.abs((fontScale || 1) - opt.scale) < 0.02
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFontScale(opt.scale)}
                    className={`rounded-2xl px-3 py-2 text-center transition-all border ${
                      selected ? 'bg-white/80 border-pink-300' : 'bg-white/60 border-transparent hover:bg-white/70'
                    }`}
                  >
                    <div className="text-[13px] font-semibold" style={{ color: fontColor.value }}>{opt.name}</div>
                    <div className="text-[11px] opacity-60" style={{ color: fontColor.value }}>{Math.round(opt.scale * 100)}%</div>
                  </button>
                )
              })}
            </div>

            <div className="mt-3 p-3 rounded-2xl bg-white/60 border border-white/30">
              <div className="text-xs opacity-40 mb-2" style={{ color: fontColor.value }}>预览</div>
              <div style={{ fontFamily: currentFont.fontFamily, color: fontColor.value, fontSize: `${Math.round(16 * (fontScale || 1))}px` }}>
                <div className="text-lg font-semibold">小手机 LittlePhone</div>
                <div className="text-sm opacity-70 mt-1">这是全局字体大小预览</div>
                <div className="text-xs opacity-60 mt-1">“点一下就变大/变小”，不容易误触</div>
              </div>
            </div>
          </div>

          <p className="text-sm opacity-50 mb-2" style={{ color: fontColor.value }}>选择你喜欢的字体风格</p>
          
          {FONT_OPTIONS.map((font) => {
            const isSelected = currentFont.id === font.id
            return (
              <button key={font.id} onClick={() => handleFontSelect(font)} className={`w-full p-3 sm:p-4 rounded-2xl text-left transition-all press-effect ${isSelected ? 'bg-white/70 border-2 border-pink-300' : 'bg-white/50 border-2 border-transparent hover:bg-white/60'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm sm:text-base" style={{ color: fontColor.value }}>{font.name}</span>
                  {isSelected && <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></span>}
                </div>
                <div className="text-lg sm:text-xl" style={{ fontFamily: font.fontFamily, color: fontColor.value, opacity: 0.8 }}>{font.preview}</div>
              </button>
            )
          })}
          
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 rounded-2xl bg-white/50 border border-white/30">
            <div className="text-xs opacity-40 mb-3" style={{ color: fontColor.value }}>预览效果</div>
            <div style={{ fontFamily: currentFont.fontFamily, color: fontColor.value }}>
              <div className="text-xl sm:text-2xl">小手机 LittlePhone</div>
              <div className="text-sm sm:text-base opacity-70 mt-1">这是一段示例文字</div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
