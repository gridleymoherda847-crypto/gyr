import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS, FONT_OPTIONS, type FontOption } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'

export default function FontScreen() {
  const navigate = useNavigate()
  const { currentFont, setCurrentFont, fontColor, customFonts, addCustomFont, removeCustomFont, fontSizeTier, setFontSizeTier } = useOS()
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadFontName, setUploadFontName] = useState('')
  const [uploadFontFile, setUploadFontFile] = useState<File | null>(null)
  const [uploadFontUrl, setUploadFontUrl] = useState('')
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file')
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)

  const handleFontSelect = (font: FontOption) => setCurrentFont(font)
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // 检查文件类型
    const validTypes = ['.ttf', '.otf', '.woff', '.woff2']
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
    if (!validTypes.includes(ext)) {
      setUploadError('仅支持 TTF、OTF、WOFF、WOFF2 格式的字体文件')
      return
    }
    
    // 检查文件大小（限制 20MB）
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('字体文件过大，请选择小于 20MB 的文件')
      return
    }
    
    setUploadError('')
    setUploadFontFile(file)
    // 默认使用文件名作为字体名（去掉扩展名）
    if (!uploadFontName) {
      setUploadFontName(file.name.replace(/\.[^/.]+$/, ''))
    }
  }
  
  const handleUploadFont = async () => {
    if (!uploadFontName.trim()) {
      setUploadError('请输入字体名称')
      return
    }
    
    if (uploadMode === 'file') {
      if (!uploadFontFile) {
        setUploadError('请选择字体文件')
        return
      }
      
      try {
        // 读取文件为 base64
        const reader = new FileReader()
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string
          // 生成唯一的 fontFamily 名称
          const fontFamily = `CustomFont_${Date.now()}`
          
          const newFont = addCustomFont({
            name: uploadFontName.trim(),
            fontFamily,
            dataUrl,
          })
          
          // 自动选中新上传的字体
          setCurrentFont({
            id: newFont.id,
            name: newFont.name,
            fontFamily: `"${newFont.fontFamily}", sans-serif`,
            preview: '自定义字体 ABC 123',
          })
          
          // 关闭弹窗并重置状态
          resetUploadDialog()
        }
        reader.onerror = () => {
          setUploadError('读取字体文件失败，请重试')
        }
        reader.readAsDataURL(uploadFontFile)
      } catch {
        setUploadError('上传失败，请重试')
      }
    } else {
      // 链接导入模式
      if (!uploadFontUrl.trim()) {
        setUploadError('请输入字体链接')
        return
      }
      
      const url = uploadFontUrl.trim()
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        setUploadError('请输入有效的 http/https 链接')
        return
      }
      
      setUploading(true)
      setUploadError('')
      
      try {
        // 直接使用 URL 作为字体源
        const fontFamily = `CustomFont_${Date.now()}`
        
        const newFont = addCustomFont({
          name: uploadFontName.trim(),
          fontFamily,
          dataUrl: url, // 直接存储 URL
        })
        
        // 自动选中新上传的字体
        setCurrentFont({
          id: newFont.id,
          name: newFont.name,
          fontFamily: `"${newFont.fontFamily}", sans-serif`,
          preview: '自定义字体 ABC 123',
        })
        
        resetUploadDialog()
      } catch {
        setUploadError('导入失败，请检查链接是否正确')
      } finally {
        setUploading(false)
      }
    }
  }
  
  const resetUploadDialog = () => {
    setShowUploadDialog(false)
    setUploadFontName('')
    setUploadFontFile(null)
    setUploadFontUrl('')
    setUploadMode('file')
    setUploadError('')
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }
  
  const handleDeleteFont = (id: string) => {
    removeCustomFont(id)
    setShowDeleteConfirm(null)
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="字体设置" onBack={() => navigate('/apps/settings')} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-3 sm:space-y-4">
          <p className="text-sm opacity-50 mb-2" style={{ color: fontColor.value }}>选择你喜欢的字体风格</p>

          {/* 字体大小（全局） */}
          <div className="bg-white/60 backdrop-blur rounded-2xl p-3 sm:p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-700">字体大小</div>
              <div className="text-[11px] text-gray-400">应用于大部分页面</div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {([
                { id: 'small', label: '小' },
                { id: 'medium', label: '中' },
                { id: 'large', label: '大' },
                { id: 'xlarge', label: '超大' },
              ] as const).map((opt) => {
                const active = fontSizeTier === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFontSizeTier(opt.id)}
                    className={`py-2 rounded-xl text-sm font-medium transition-all press-effect ${
                      active ? 'bg-black text-white' : 'bg-white/70 text-gray-700 border border-black/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 text-[11px] text-gray-500 leading-relaxed">
              说明：字体大小会影响绝大多数 App 内页面。
              <br />
              不影响：主屏幕（桌面）与桌面内的游戏大厅悬浮窗（避免布局被挤满变丑）。
            </div>
          </div>
          
          {/* 内置字体 */}
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
          
          {/* 自定义字体 */}
          {customFonts.length > 0 && (
            <>
              <div className="text-sm opacity-50 mt-4 mb-2" style={{ color: fontColor.value }}>自定义字体</div>
              {customFonts.map((font) => {
                const isSelected = currentFont.id === font.id
                return (
                  <div key={font.id} className={`w-full p-3 sm:p-4 rounded-2xl text-left transition-all ${isSelected ? 'bg-white/70 border-2 border-pink-300' : 'bg-white/50 border-2 border-transparent'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <button
                        type="button"
                        onClick={() => handleFontSelect({
                          id: font.id,
                          name: font.name,
                          fontFamily: `"${font.fontFamily}", sans-serif`,
                          preview: '自定义字体 ABC 123',
                        })}
                        className="flex-1 text-left"
                      >
                        <span className="font-medium text-sm sm:text-base" style={{ color: fontColor.value }}>{font.name}</span>
                      </button>
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(font.id)}
                          className="w-6 h-6 rounded-full bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFontSelect({
                        id: font.id,
                        name: font.name,
                        fontFamily: `"${font.fontFamily}", sans-serif`,
                        preview: '自定义字体 ABC 123',
                      })}
                      className="w-full text-left"
                    >
                      <div className="text-lg sm:text-xl" style={{ fontFamily: `"${font.fontFamily}", sans-serif`, color: fontColor.value, opacity: 0.8 }}>
                        自定义字体 ABC 123
                      </div>
                    </button>
                  </div>
                )
              })}
            </>
          )}
          
          {/* 上传自定义字体按钮 */}
          <button
            type="button"
            onClick={() => setShowUploadDialog(true)}
            className="w-full p-3 sm:p-4 rounded-2xl bg-white/50 border-2 border-dashed border-gray-300 hover:border-pink-300 hover:bg-white/60 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" style={{ color: fontColor.value, opacity: 0.6 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm" style={{ color: fontColor.value, opacity: 0.6 }}>上传自定义字体</span>
          </button>
          
          {/* 预览效果 */}
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 rounded-2xl bg-white/50 border border-white/30">
            <div className="text-xs opacity-40 mb-3" style={{ color: fontColor.value }}>预览效果</div>
            <div style={{ fontFamily: currentFont.fontFamily, color: fontColor.value }}>
              <div className="text-xl sm:text-2xl">小手机 LittlePhone</div>
              <div className="text-sm sm:text-base opacity-70 mt-1">这是一段示例文字</div>
            </div>
          </div>
          
          {/* 说明 */}
          <div className="text-xs opacity-40 text-center pb-4" style={{ color: fontColor.value }}>
            支持 TTF、OTF、WOFF、WOFF2 格式，文件大小限制 20MB
          </div>
        </div>
      </div>
      
      {/* 上传弹窗 */}
      {showUploadDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[320px] bg-white rounded-2xl overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="text-[15px] font-semibold text-center text-gray-800">导入自定义字体</div>
            </div>
            <div className="p-4 space-y-4">
              {/* 导入模式切换 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setUploadMode('file')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    uploadMode === 'file'
                      ? 'bg-pink-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  📁 文件上传
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('url')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    uploadMode === 'url'
                      ? 'bg-pink-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  🔗 链接导入
                </button>
              </div>
              
              {/* 字体名称输入 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">字体名称</label>
                <input
                  type="text"
                  value={uploadFontName}
                  onChange={(e) => setUploadFontName(e.target.value)}
                  placeholder="例如：我的手写字体"
                  className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm outline-none focus:border-pink-300"
                />
              </div>
              
              {uploadMode === 'file' ? (
                /* 文件选择 */
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">字体文件</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ttf,.otf,.woff,.woff2"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-3 py-3 rounded-xl bg-gray-50 border border-dashed border-gray-300 text-sm text-gray-500 hover:border-pink-300 transition-colors"
                  >
                    {uploadFontFile ? (
                      <span className="text-gray-800">{uploadFontFile.name}</span>
                    ) : (
                      <span>点击选择字体文件</span>
                    )}
                  </button>
                </div>
              ) : (
                /* 链接输入 */
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">字体链接</label>
                  <input
                    type="text"
                    value={uploadFontUrl}
                    onChange={(e) => setUploadFontUrl(e.target.value)}
                    placeholder="https://example.com/font.ttf"
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm outline-none focus:border-pink-300"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">支持 TTF、OTF、WOFF、WOFF2 格式的直链</p>
                </div>
              )}
              
              {/* 错误提示 */}
              {uploadError && (
                <div className="text-xs text-red-500">{uploadError}</div>
              )}
            </div>
            <div className="flex border-t border-gray-100">
              <button
                type="button"
                onClick={resetUploadDialog}
                className="flex-1 py-3 text-gray-600 text-[15px] border-r border-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleUploadFont}
                disabled={uploading}
                className="flex-1 py-3 text-pink-500 font-medium text-[15px] disabled:text-gray-300"
              >
                {uploading ? '导入中...' : '确定'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-[280px] bg-white rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 text-center">
              <div className="text-[15px] font-semibold text-gray-800 mb-2">删除字体</div>
              <div className="text-sm text-gray-500">确定要删除这个自定义字体吗？</div>
            </div>
            <div className="flex border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 py-3 text-gray-600 text-[15px] border-r border-gray-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleDeleteFont(showDeleteConfirm)}
                className="flex-1 py-3 text-red-500 font-medium text-[15px]"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
