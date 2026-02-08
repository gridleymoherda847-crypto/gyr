import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../context/OSContext'
import { useWeChat } from '../context/WeChatContext'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'
import { SettingsGroup, SettingsItem } from '../components/SettingsGroup'
import { exportCurrentBackupJsonText, importLegacyBackupJsonText } from '../storage/legacyBackupImport'
import { kvClear } from '../storage/kv'
import { saveBlobAsFile } from '../utils/saveFile'

export default function SettingsScreen() {
  const navigate = useNavigate()
  const { llmConfig, currentFont, fontColor, iconTheme, setIconTheme, decorImage, setDecorImage } = useOS()
  const { characters, setCharacterTyping } = useWeChat()
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showClearedTip, setShowClearedTip] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [showExportNameDialog, setShowExportNameDialog] = useState(false)
  const [exportFileName, setExportFileName] = useState('')
  const [showExportSuccess, setShowExportSuccess] = useState(false)
  const [exportSuccessMessage, setExportSuccessMessage] = useState('备份文件已保存到下载目录。')
  const [exportMethod, setExportMethod] = useState<'download' | 'share' | 'open'>('download')
  const [exportedJsonText, setExportedJsonText] = useState<string>('')
  const [exportCopied, setExportCopied] = useState(false)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [showImportSuccess, setShowImportSuccess] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<{ written: number; skipped: number } | null>(null)
  const [importing, setImporting] = useState(false)
  const [showThemeTip, setShowThemeTip] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const discImageInputRef = useRef<HTMLInputElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showScreenFit, setShowScreenFit] = useState(false)
  const [screenPaddingTop, setScreenPaddingTop] = useState(() => {
    return parseInt(localStorage.getItem('mina_screen_padding_top') || '0')
  })
  const [screenPaddingBottom, setScreenPaddingBottom] = useState(() => {
    return parseInt(localStorage.getItem('mina_screen_padding_bottom') || '0')
  })
  const [screenPaddingLeft, setScreenPaddingLeft] = useState(() => {
    return parseInt(localStorage.getItem('mina_screen_padding_left') || '0')
  })
  const [screenPaddingRight, setScreenPaddingRight] = useState(() => {
    return parseInt(localStorage.getItem('mina_screen_padding_right') || '0')
  })
  const [hideStatusBar, setHideStatusBar] = useState(() => {
    return localStorage.getItem('mina_hide_status_bar') === 'true'
  })
  const [fullscreenUnsupported, setFullscreenUnsupported] = useState(false)

  // 检测是否支持全屏 API
  const getFullscreenElement = () => {
    return document.fullscreenElement || (document as any).webkitFullscreenElement
  }
  
  const requestFullscreen = async (el: HTMLElement) => {
    if (el.requestFullscreen) {
      return el.requestFullscreen()
    } else if ((el as any).webkitRequestFullscreen) {
      return (el as any).webkitRequestFullscreen()
    }
    throw new Error('Fullscreen API not supported')
  }
  
  const exitFullscreen = async () => {
    if (document.exitFullscreen) {
      return document.exitFullscreen()
    } else if ((document as any).webkitExitFullscreen) {
      return (document as any).webkitExitFullscreen()
    }
    throw new Error('Fullscreen API not supported')
  }

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!getFullscreenElement())
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [])

  // 检测是否是 iOS 设备
  const isIOS = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  }
  
  // 检测是否已经是 PWA 模式（从主屏幕启动）
  const isStandalone = () => {
    return (window.navigator as any).standalone === true || 
           window.matchMedia('(display-mode: standalone)').matches
  }

  // 切换全屏模式
  const toggleFullscreen = async () => {
    // iOS 设备且不是 PWA 模式，显示引导
    if (isIOS() && !isStandalone()) {
      setFullscreenUnsupported(true)
      return
    }
    
    try {
      if (!getFullscreenElement()) {
        // 进入全屏
        await requestFullscreen(document.documentElement)
      } else {
        // 退出全屏
        await exitFullscreen()
      }
    } catch (error) {
      console.error('全屏切换失败:', error)
      // 其他不支持全屏的情况，也显示引导
      setFullscreenUnsupported(true)
    }
  }

  const handleClearData = () => {
    setShowClearConfirm(true)
  }

  const openExportDialog = () => {
    setExportFileName(`Mina_backup_${new Date().toISOString().slice(0, 10)}`)
    setShowExportNameDialog(true)
  }

  const handleExportData = async () => {
    try {
      const json = await exportCurrentBackupJsonText()
      const fileName = exportFileName.trim() || `Mina_backup_${new Date().toISOString().slice(0, 10)}`
      const blob = new Blob([json], { type: 'application/json' })
      const method = await saveBlobAsFile(blob, `${fileName}.json`, {
        title: '小手机备份',
        hintText: '导出备份文件（iOS 可选择“存储到文件”）',
      })
      setExportMethod(method)
      setExportedJsonText(json)
      setExportCopied(false)
      setShowExportNameDialog(false)
      setExportSuccessMessage(
        method === 'download'
          ? '备份文件已保存到下载目录。'
          : 'iOS 上部分浏览器会提示“下载失败”，这是系统限制。\n已尝试打开/弹出分享：请在分享菜单选择“存储到文件”。\n如果仍失败，可点击下方“复制备份文本”保存到备忘录/文件（建议用 Safari 打开）。'
      )
      setShowExportSuccess(true)
    } catch (e) {
      console.error('导出失败:', e)
    }
  }

  // 全新导入（旧备份 -> 迁移 -> 写入 IndexedDB）
  const handleImportData = (file: File) => {
    setImportError(null)
    setImportSummary(null)
    setImporting(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const content = String(e.target?.result ?? '')
        // 导入严格要求：只写入硬盘，不触碰 Context；完成后强制刷新页面重新初始化
        ;(window as any).__LP_IMPORTING__ = true
        const res = await importLegacyBackupJsonText(content)
        if (!res || typeof res.written !== 'number' || res.written <= 0) {
          throw new Error('导入失败：未写入任何数据（请确认备份文件正确）')
        }
        setImportSummary({ written: res.written, skipped: res.skipped.length })
        setShowImportSuccess(true)
        setTimeout(() => window.location.reload(), 400)
      } catch (err: any) {
        console.error('导入失败:', err)
        setImportError(String(err?.message || '导入失败：请确认备份文件正确，并重试'))
        ;(window as any).__LP_IMPORTING__ = false
      } finally {
        setImporting(false)
      }
    }
    reader.onerror = () => {
      setImporting(false)
      setImportError('文件读取失败')
    }
    reader.readAsText(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setShowImportConfirm(true)
    }
  }

  const confirmImport = () => {
    const file = fileInputRef.current?.files?.[0]
    if (file) {
      handleImportData(file)
    }
    setShowImportConfirm(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="设置" onBack={() => navigate('/', { replace: true })} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4">
          <SettingsGroup title="AI 模型">
            <SettingsItem label="API 配置" value={llmConfig.selectedModel || '未配置'} to="/apps/settings/api" />
          </SettingsGroup>

          <SettingsGroup title="个性化">
            <SettingsItem label="壁纸设置" to="/apps/settings/wallpaper" />
            <SettingsItem label="字体设置" value={currentFont.name} to="/apps/settings/font" />
            <SettingsItem label="字体颜色" value={fontColor.name} to="/apps/settings/color" />
            <SettingsItem label="表情包管理" to="/apps/settings/stickers" />
            <SettingsItem label="位置与天气" to="/apps/settings/location" />
          </SettingsGroup>
          
          <SettingsGroup title="主题">
            <div className="rounded-2xl border border-white/35 bg-white/70 overflow-hidden">
              <div className="px-4 py-3">
                <div className="text-sm font-medium text-gray-800 mb-3">主题与图标</div>
                <div className="grid grid-cols-2 gap-3">
                  {/* 美化图标 */}
                  <button
                    type="button"
                    onClick={() => {
                      setIconTheme('custom')
                      setShowThemeTip(true)
                    }}
                    className={`rounded-xl p-3 border-2 transition-all ${
                      iconTheme === 'custom' ? 'border-pink-400 bg-pink-50' : 'border-gray-200 bg-white/50'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-1">🎀</div>
                      <div className="text-xs font-medium text-gray-700">美化图标</div>
                      <div className="text-[10px] text-gray-400">使用作者的精美图标</div>
                    </div>
                  </button>

                  {/* 简约图标 */}
                  <button
                    type="button"
                    onClick={() => {
                      setIconTheme('minimal')
                      setShowThemeTip(true)
                    }}
                    className={`rounded-xl p-3 border-2 transition-all ${
                      iconTheme === 'minimal' ? 'border-gray-800 bg-gray-50' : 'border-gray-200 bg-white/50'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-1">◯</div>
                      <div className="text-xs font-medium text-gray-700">简约图标</div>
                      <div className="text-[10px] text-gray-400">线条风格，自定义百搭</div>
                    </div>
                  </button>

                  {/* 第二行：美化图标下只显示“图标管理”占一行；简约图标下显示“唱片封面 + 图标管理”两格 */}
                  {iconTheme === 'minimal' ? (
                    <>
                      {/* 唱片封面 */}
                      <button
                        type="button"
                        onClick={() => discImageInputRef.current?.click()}
                        className="rounded-xl p-3 border-2 border-gray-800 bg-gray-50 transition-all"
                        title="唱片封面（简约图标下生效）"
                      >
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 border border-gray-200 mb-2">
                            {decorImage ? (
                              <img src={decorImage} alt="唱片封面" className="w-full h-full object-cover" />
                            ) : (
                              <svg viewBox="0 0 100 100" className="w-full h-full">
                                <circle cx="50" cy="50" r="48" fill="white" stroke="#333" strokeWidth="1.5"/>
                                <circle cx="50" cy="50" r="38" fill="none" stroke="#333" strokeWidth="0.5" strokeDasharray="3 3"/>
                                <circle cx="50" cy="50" r="18" fill="none" stroke="#333" strokeWidth="1"/>
                                <circle cx="50" cy="50" r="8" fill="#333"/>
                              </svg>
                            )}
                          </div>
                          <div className="text-xs font-medium text-gray-700">唱片封面</div>
                          <div className="text-[10px] text-gray-400">点击上传/更换</div>
                          {decorImage && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setDecorImage('')
                              }}
                              className="mt-2 px-2.5 py-1 rounded-lg bg-red-50 text-[10px] text-red-500 hover:bg-red-100 transition-colors"
                            >
                              恢复默认
                            </button>
                          )}
                        </div>
                      </button>

                      {/* 图标管理 */}
                      <button
                        type="button"
                        onClick={() => navigate('/apps/settings/icons')}
                        className="rounded-xl p-3 border-2 border-gray-200 bg-white/50 hover:bg-white/60 transition-all"
                      >
                        <div className="text-center">
                          <div className="text-2xl mb-1">🧩</div>
                          <div className="text-xs font-medium text-gray-700">图标管理</div>
                          <div className="text-[10px] text-gray-400">自定义应用图标</div>
                        </div>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate('/apps/settings/icons')}
                      className="col-span-2 rounded-xl p-3 border-2 border-gray-200 bg-white/50 hover:bg-white/60 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-left">
                          <div className="text-xs font-medium text-gray-700">图标管理</div>
                          <div className="text-[10px] text-gray-400">自定义应用图标</div>
                        </div>
                        <div className="text-2xl">🧩</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
              
              <input
                ref={discImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    const result = reader.result as string
                    setDecorImage(result)
                  }
                  reader.readAsDataURL(file)
                  if (discImageInputRef.current) discImageInputRef.current.value = ''
                }}
              />
            </div>
          </SettingsGroup>

          <SettingsGroup title="显示">
            <SettingsItem
              label="全屏模式"
              value={isFullscreen ? '已开启' : '点击开启'}
              onClick={toggleFullscreen}
              showArrow={false}
            />
            <SettingsItem
              label="屏幕适配"
              value="调整边距"
              onClick={() => setShowScreenFit(true)}
              showArrow={false}
            />
          </SettingsGroup>
          
          {/* iOS 全屏引导弹窗 */}
          {fullscreenUnsupported && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
              <div className="bg-white rounded-2xl w-full max-w-[320px] overflow-hidden shadow-2xl">
                {/* 头部 */}
                <div className="bg-gradient-to-r from-blue-500 to-purple-500 px-5 py-4 text-white text-center">
                  <div className="text-2xl mb-1">📱</div>
                  <div className="text-lg font-bold">iOS 全屏体验指南</div>
                </div>
                
                {/* 步骤说明 */}
                <div className="p-5 space-y-4">
                  <div className="text-sm text-gray-600 text-center mb-3">
                    iOS Safari 不支持网页全屏，请按以下步骤操作：
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">点击底部分享按钮</div>
                      <div className="text-xs text-gray-500 mt-0.5">Safari 底部中间的 <span className="inline-block px-1 bg-gray-100 rounded">⬆️</span> 图标</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">选择「添加到主屏幕」</div>
                      <div className="text-xs text-gray-500 mt-0.5">向下滑动找到这个选项</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
                    <div>
                      <div className="text-sm font-medium text-gray-800">从主屏幕图标打开</div>
                      <div className="text-xs text-gray-500 mt-0.5">这样就能获得沉浸式全屏体验啦~</div>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-3 bg-amber-50 rounded-xl text-xs text-amber-700">
                    <span className="font-medium">💡 提示：</span> 必须使用 Safari 浏览器，其他浏览器不支持此功能
                  </div>
                </div>
                
                {/* 关闭按钮 */}
                <div className="px-5 pb-5">
                  <button
                    type="button"
                    onClick={() => setFullscreenUnsupported(false)}
                    className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-medium active:scale-[0.98]"
                  >
                    我知道了
                  </button>
                </div>
              </div>
            </div>
          )}

          <SettingsGroup title="数据管理">
            <SettingsItem
              label="导出数据"
              onClick={openExportDialog}
              showArrow={false}
            />
            <SettingsItem
              label="导入旧备份（迁移）"
              onClick={() => fileInputRef.current?.click()}
              showArrow={false}
            />
          </SettingsGroup>

          <SettingsGroup title="系统">
            <SettingsItem
              label="重启小手机"
              onClick={() => setShowRestartConfirm(true)}
              showArrow={false}
            />
            <SettingsItem
              label="清空所有数据"
              onClick={handleClearData}
              showArrow={false}
            />
          </SettingsGroup>
          
          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="hidden"
          />

          <SettingsGroup title="关于">
            <SettingsItem label="LittlePhone" value="v1.0.0" showArrow={false} />
          </SettingsGroup>
        </div>

        {/* 清空数据确认弹窗 */}
        {showClearConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => setShowClearConfirm(false)}
              role="presentation"
            />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#111]">清空全部数据？</div>
                <div className="mt-2 text-[13px] text-[#333]">
                  将清空所有软件的自定义内容（不可恢复）。
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try { localStorage.clear() } catch {}
                    try { await kvClear() } catch {}
                    setShowClearConfirm(false)
                    setShowClearedTip(true)
                  }}
                  className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #fb7185 0%, #ef4444 100%)' }}
                >
                  清空
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 清空完成提示 */}
        {showClearedTip && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => setShowClearedTip(false)}
              role="presentation"
            />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#111]">已清空完成</div>
                <div className="mt-2 text-[13px] text-[#333]">
                  为了生效，建议重启小手机。
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowClearedTip(false)}
                  className="flex-1 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
                >
                  稍后
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #34d399 0%, #07C160 100%)' }}
                >
                  立即重启
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 导入中提示（防止用户重复点） */}
        {importing && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div className="absolute inset-0 bg-black/35" role="presentation" />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/85 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#111]">正在导入…</div>
                <div className="mt-2 text-[13px] text-[#666]">请不要退出页面</div>
              </div>
            </div>
          </div>
        )}

        {/* 导出文件命名弹窗 */}
        {showExportNameDialog && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div className="absolute inset-0 bg-black/35" onClick={() => setShowExportNameDialog(false)} role="presentation" />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/85 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#111]">导出数据</div>
                <div className="mt-2 text-[13px] text-[#666]">请输入备份文件名称</div>
              </div>
              <div className="mt-3">
                <input
                  type="text"
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  placeholder="请输入文件名"
                  className="w-full rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-[14px] text-[#333] outline-none focus:border-pink-400"
                />
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowExportNameDialog(false)}
                  className="flex-1 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportData()}
                  className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #fb7185 0%, #ec4899 100%)' }}
                >
                  导出
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 导出成功提示 */}
        {showExportSuccess && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div className="absolute inset-0 bg-black/35" onClick={() => setShowExportSuccess(false)} role="presentation" />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/85 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="text-center">
                <div className="text-4xl mb-2">✅</div>
                <div className="text-[15px] font-semibold text-[#111]">{exportMethod === 'download' ? '导出成功' : '备份已生成'}</div>
                <div className="mt-2 text-[13px] text-[#333]">{exportSuccessMessage}</div>
              </div>
              <div className="mt-4 space-y-2">
                {exportMethod !== 'download' && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(exportedJsonText || '')
                        setExportCopied(true)
                      } catch {
                        // ignore
                        setExportCopied(false)
                      }
                    }}
                    className="w-full rounded-full border border-black/10 bg-white/70 px-4 py-2 text-[13px] font-semibold text-[#333] active:scale-[0.98]"
                  >
                    {exportCopied ? '已复制备份文本' : '复制备份文本'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowExportSuccess(false)}
                  className="w-full rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #34d399 0%, #07C160 100%)' }}
                >
                  好的
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 导入确认弹窗 */}
        {showImportConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => { setShowImportConfirm(false); if (fileInputRef.current) fileInputRef.current.value = '' }}
              role="presentation"
            />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="text-center">
                <div className="text-4xl mb-2">⚠️</div>
                <div className="text-[15px] font-semibold text-[#111]">确认导入？</div>
                <div className="mt-2 text-[13px] text-[#333]">
                  导入将覆盖当前所有数据（聊天记录、角色设置等），此操作不可撤销！
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowImportConfirm(false); if (fileInputRef.current) fileInputRef.current.value = '' }}
                  className="flex-1 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmImport}
                  className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' }}
                >
                  确认导入
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 导入成功提示（导入完成后由用户手动点击重启） */}
        {showImportSuccess && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => setShowImportSuccess(false)}
              role="presentation"
            />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="text-center">
                <div className="text-4xl mb-2">✅</div>
                <div className="text-[15px] font-semibold text-[#111]">导入成功</div>
                <div className="mt-2 text-[13px] text-[#333]">
                  旧备份已迁移导入完成，需要重启小手机才能生效。
                </div>
                {importSummary && (
                  <div className="mt-2 text-[12px] text-[#666]">
                    写入 {importSummary.written} 项，跳过 {importSummary.skipped} 项（已删除/不需要的功能会跳过）
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportSuccess(false)}
                  className="flex-1 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
                >
                  稍后
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #34d399 0%, #07C160 100%)' }}
                >
                  立即重启
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 导入错误提示 */}
        {importError && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => setImportError(null)}
              role="presentation"
            />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="text-center">
                <div className="text-4xl mb-2">❌</div>
                <div className="text-[15px] font-semibold text-[#111]">导入失败</div>
                <div className="mt-2 text-[13px] text-[#333]">
                  {importError}
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setImportError(null)}
                  className="w-full rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #fb7185 0%, #ef4444 100%)' }}
                >
                  知道了
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 主题切换提示 */}
        {showThemeTip && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => setShowThemeTip(false)}
              role="presentation"
            />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/85 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="text-center">
                <div className="text-4xl mb-2">✨</div>
                <div className="text-[15px] font-semibold text-[#111]">图标风格已切换</div>
                <div className="mt-2 text-[13px] text-[#333] leading-relaxed">
                  快回到主页看看新图标吧~
                  <br />
                  <span className="text-pink-500">搭配好看的壁纸效果更佳哦！</span>
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowThemeTip(false)
                    navigate('/', { replace: true })
                  }}
                  className="w-full rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #fb7185 0%, #ec4899 100%)' }}
                >
                  去看看
                </button>
                <button
                  type="button"
                  onClick={() => setShowThemeTip(false)}
                  className="w-full mt-2 text-[13px] text-gray-500"
                >
                  稍后再看
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 重启确认弹窗 */}
        {showRestartConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => setShowRestartConfirm(false)}
              role="presentation"
            />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#111]">重启小手机？</div>
                <div className="mt-2 text-[13px] text-[#333]">
                  将停止所有正在进行的操作（包括消息生成、一起听歌等），并刷新页面。
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRestartConfirm(false)}
                  className="flex-1 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // 清除所有角色的"正在输入"状态
                    characters.forEach(c => {
                      if (c.isTyping) {
                        setCharacterTyping(c.id, false)
                      }
                    })
                    // 刷新页面
                    window.location.reload()
                  }}
                  className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #34d399 0%, #07C160 100%)' }}
                >
                  重启
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* 屏幕适配对话框 */}
        {showScreenFit && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => setShowScreenFit(false)}
              role="presentation"
            />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/90 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] max-h-[80vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[15px] font-semibold text-[#111]">📱 屏幕适配</div>
                  <div className="mt-1 text-[12px] text-[#666]">
                    调整边距和状态栏显示
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem('mina_screen_padding_top', String(screenPaddingTop))
                    localStorage.setItem('mina_screen_padding_bottom', String(screenPaddingBottom))
                    localStorage.setItem('mina_screen_padding_left', String(screenPaddingLeft))
                    localStorage.setItem('mina_screen_padding_right', String(screenPaddingRight))
                    localStorage.setItem('mina_hide_status_bar', String(hideStatusBar))
                    document.documentElement.style.setProperty('--screen-padding-top', `${screenPaddingTop}px`)
                    document.documentElement.style.setProperty('--screen-padding-bottom', `${screenPaddingBottom}px`)
                    document.documentElement.style.setProperty('--screen-padding-left', `${screenPaddingLeft}px`)
                    document.documentElement.style.setProperty('--screen-padding-right', `${screenPaddingRight}px`)
                    setShowScreenFit(false)
                    window.location.reload()
                  }}
                  className="rounded-full px-4 py-1.5 text-[13px] font-semibold text-white active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #34d399 0%, #07C160 100%)' }}
                >
                  保存
                </button>
              </div>
              
              <div className="space-y-4">
                {/* 隐藏状态栏 */}
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div>
                    <span className="text-sm text-[#333]">隐藏顶部状态栏</span>
                    <p className="text-xs text-[#999]">隐藏时间、WiFi、电量显示</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHideStatusBar(!hideStatusBar)}
                    className={`w-12 h-7 rounded-full transition-colors ${hideStatusBar ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform mx-1 ${hideStatusBar ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                
                {/* 顶部边距 */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#333]">顶部边距</span>
                    <span className="text-[#666] font-mono">{screenPaddingTop > 0 ? '+' : ''}{screenPaddingTop}px</span>
                  </div>
                  <input
                    type="range"
                    min="-30"
                    max="60"
                    value={screenPaddingTop}
                    onChange={(e) => setScreenPaddingTop(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[#999]">
                    <span>上移</span>
                    <span>下移</span>
                  </div>
                </div>
                
                {/* 底部边距 */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#333]">底部边距</span>
                    <span className="text-[#666] font-mono">{screenPaddingBottom > 0 ? '+' : ''}{screenPaddingBottom}px</span>
                  </div>
                  <input
                    type="range"
                    min="-30"
                    max="60"
                    value={screenPaddingBottom}
                    onChange={(e) => setScreenPaddingBottom(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[#999]">
                    <span>下移</span>
                    <span>上移</span>
                  </div>
                </div>
                
                {/* 左侧边距 */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#333]">左侧边距</span>
                    <span className="text-[#666] font-mono">{screenPaddingLeft > 0 ? '+' : ''}{screenPaddingLeft}px</span>
                  </div>
                  <input
                    type="range"
                    min="-20"
                    max="40"
                    value={screenPaddingLeft}
                    onChange={(e) => setScreenPaddingLeft(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[#999]">
                    <span>左移</span>
                    <span>右移</span>
                  </div>
                </div>
                
                {/* 右侧边距 */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#333]">右侧边距</span>
                    <span className="text-[#666] font-mono">{screenPaddingRight > 0 ? '+' : ''}{screenPaddingRight}px</span>
                  </div>
                  <input
                    type="range"
                    min="-20"
                    max="40"
                    value={screenPaddingRight}
                    onChange={(e) => setScreenPaddingRight(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-[#999]">
                    <span>右移</span>
                    <span>左移</span>
                  </div>
                </div>
                
                <div className="text-xs text-[#999] text-center bg-gray-50 rounded-lg p-2">
                  提示：如果按钮/内容被截断，可调整对应边距
                </div>
              </div>
              
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setScreenPaddingTop(0)
                    setScreenPaddingBottom(0)
                    setScreenPaddingLeft(0)
                    setScreenPaddingRight(0)
                    setHideStatusBar(false)
                  }}
                  className="rounded-full border border-black/10 bg-white/60 px-6 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
                >
                  重置为默认
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
