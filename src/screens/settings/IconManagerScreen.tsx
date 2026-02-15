import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MINIMAL_ICONS, useOS } from '../../context/OSContext'
import { ALL_APPS } from '../../data/apps'

export default function IconManagerScreen() {
  const navigate = useNavigate()
  const { customAppIconsLayout1, customAppIconsLayout2, setCustomAppIconForLayout, iconTheme } = useOS()
  const [editingLayout, setEditingLayout] = useState<'layout1' | 'layout2'>(() => (iconTheme === 'minimal' ? 'layout2' : 'layout1'))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const currentAppRef = useRef<string | null>(null)

  const currentMap = useMemo(() => {
    return editingLayout === 'layout2' ? customAppIconsLayout2 : customAppIconsLayout1
  }, [editingLayout, customAppIconsLayout1, customAppIconsLayout2])

  // 压缩图片
  const compressImage = (file: File, maxSize: number = 128): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('无法创建 canvas'))
            return
          }
          
          // 计算缩放尺寸（保持正方形）
          const size = Math.min(img.width, img.height)
          const sx = (img.width - size) / 2
          const sy = (img.height - size) / 2
          
          canvas.width = maxSize
          canvas.height = maxSize
          
          // 裁剪为正方形并缩放
          ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize)
          
          // 转为 base64（使用 webp 格式，更小）
          let quality = 0.8
          let result = canvas.toDataURL('image/webp', quality)
          
          // 如果太大，降低质量
          while (result.length > 50000 && quality > 0.3) {
            quality -= 0.1
            result = canvas.toDataURL('image/webp', quality)
          }
          
          resolve(result)
        }
        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = e.target?.result as string
      }
      reader.onerror = () => reject(new Error('文件读取失败'))
      reader.readAsDataURL(file)
    })
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentAppRef.current) return
    
    try {
      const compressed = await compressImage(file)
      setCustomAppIconForLayout(editingLayout, currentAppRef.current, compressed)
    } catch (err) {
      console.error('图标压缩失败:', err)
    }
    
    // 清空 input
    e.target.value = ''
    currentAppRef.current = null
  }

  const handleSelectIcon = (appId: string) => {
    currentAppRef.current = appId
    fileInputRef.current?.click()
  }

  const handleResetIcon = (appId: string) => {
    setCustomAppIconForLayout(editingLayout, appId, '')
  }

  const handleResetAll = () => {
    ALL_APPS.forEach(app => setCustomAppIconForLayout(editingLayout, app.id, ''))
  }

  // 获取当前显示的图标
  const getDisplayIcon = (appId: string, defaultIcon: string) => {
    if (currentMap[appId]) return currentMap[appId]
    if (editingLayout === 'layout2' && MINIMAL_ICONS[appId]) return MINIMAL_ICONS[appId]
    return defaultIcon
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-gray-500"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="font-semibold text-gray-800">App图标美化</span>
        <button
          type="button"
          onClick={handleResetAll}
          className="text-sm text-gray-500"
        >
          重置全部
        </button>
      </div>

      {/* 排版选择 */}
      <div className="px-4 pt-3">
        <div className="rounded-full bg-black/5 p-1 flex gap-1">
          <button
            type="button"
            onClick={() => setEditingLayout('layout1')}
            className={`flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
              editingLayout === 'layout1' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            桌面排版1
          </button>
          <button
            type="button"
            onClick={() => setEditingLayout('layout2')}
            className={`flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all ${
              editingLayout === 'layout2' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
            }`}
          >
            桌面排版2
          </button>
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 提示 */}
      <div className="px-4 py-3 bg-yellow-50 border-b border-yellow-100">
        <div className="text-xs text-yellow-700 flex items-start gap-2">
          <span>💡</span>
          <span>当前在编辑：{editingLayout === 'layout2' ? '桌面排版2' : '桌面排版1'}。点击图标可更换，建议使用正方形图片。图片会自动压缩。</span>
        </div>
      </div>

      {/* 当前桌面排版提示 */}
      {iconTheme === 'minimal' && (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
          <div className="text-xs text-blue-700">
            当前正在使用桌面排版2；此处可分别为排版1/2设置不同的自定义图标
          </div>
        </div>
      )}

      {/* 图标列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-4 gap-4">
          {ALL_APPS.map(app => {
            const isCustom = !!currentMap[app.id]
            const iconSrc = getDisplayIcon(app.id, app.icon)
            
            return (
              <div key={app.id} className="flex flex-col items-center">
                {/* 图标 */}
                <button
                  type="button"
                  onClick={() => handleSelectIcon(app.id)}
                  className="relative w-14 h-14 rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-100 active:scale-95 transition-transform"
                >
                  <img
                    src={iconSrc}
                    alt={app.name}
                    className="w-full h-full object-cover"
                  />
                  {/* 已自定义标记 */}
                  {isCustom && (
                    <div className="absolute top-0 right-0 w-4 h-4 bg-green-500 rounded-bl-lg flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {/* 编辑图标 */}
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <svg className="w-5 h-5 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                </button>
                
                {/* 名称 */}
                <span className="mt-1.5 text-xs text-gray-600 truncate w-full text-center">
                  {app.name}
                </span>
                
                {/* 重置按钮 */}
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => handleResetIcon(app.id)}
                    className="mt-1 text-[10px] text-red-400 active:text-red-500"
                  >
                    重置
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 底部说明 */}
      <div className="px-4 py-3 bg-white border-t border-gray-100">
        <div className="text-xs text-gray-400 text-center">
          支持 JPG、PNG、WebP 等常见图片格式
        </div>
      </div>
    </div>
  )
}
