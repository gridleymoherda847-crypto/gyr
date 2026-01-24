import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../context/OSContext'
import { useWeChat } from '../context/WeChatContext'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'
import { SettingsGroup, SettingsItem } from '../components/SettingsGroup'
import { kvClear, kvGet, kvKeys, kvSet } from '../storage/kv'

export default function SettingsScreen() {
  const navigate = useNavigate()
  const { llmConfig, currentFont, fontColor, setLocked } = useOS()
  const { characters, setCharacterTyping } = useWeChat()
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showClearedTip, setShowClearedTip] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [showExportSuccess, setShowExportSuccess] = useState(false)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [showImportSuccess, setShowImportSuccess] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showExportNameDialog, setShowExportNameDialog] = useState(false)
  const [exportFileName, setExportFileName] = useState('')

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // 切换全屏模式
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        // 进入全屏
        await document.documentElement.requestFullscreen()
      } else {
        // 退出全屏
        await document.exitFullscreen()
      }
    } catch (error) {
      console.error('全屏切换失败:', error)
    }
  }

  const handleShutdown = () => {
    setLocked(true)
    navigate('/', { replace: true })
  }

  const handleClearData = () => {
    setShowClearConfirm(true)
  }

  // 打开导出命名弹窗
  const openExportDialog = () => {
    setExportFileName(`LittlePhone_backup_${new Date().toISOString().slice(0, 10)}`)
    setShowExportNameDialog(true)
  }

  // 导出所有数据
  const handleExportData = () => {
    try {
      const doExport = async () => {
        const allData: Record<string, string> = {}

        // IndexedDB(kv) 数据
        const keys = await kvKeys()
        for (const key of keys) {
          const v = await kvGet(key)
          if (typeof v === 'string') allData[key] = v
        }

        // 仍保留 localStorage（少量 UI 状态等）
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key) continue
          if (allData[key] == null) {
            allData[key] = localStorage.getItem(key) || ''
          }
        }
      
        const exportData = {
          version: '2.0.0',
          exportTime: new Date().toISOString(),
          data: allData
        }
        
        const fileName = exportFileName.trim() || `LittlePhone_backup_${new Date().toISOString().slice(0, 10)}`
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${fileName}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        
        setShowExportNameDialog(false)
        setShowExportSuccess(true)
      }
      void doExport()
    } catch (error) {
      console.error('导出失败:', error)
    }
  }

  // 导入数据
  const handleImportData = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const doImport = async () => {
        ;(window as any).__LP_IMPORTING__ = true
        // 先校验文件内容，确认没问题再清空（避免“导入失败=数据全没了”）
        const content = String(e.target?.result ?? '')
        if (!content.trim()) {
          setImportError('文件为空或读取失败')
          return
        }

        let importData: any
        try {
          importData = JSON.parse(content)
        } catch {
          setImportError('文件解析失败，请确保是有效的备份文件')
          return
        }

        if (!importData?.data || typeof importData.data !== 'object') {
          setImportError('文件格式不正确')
          return
        }

        const entries = Object.entries(importData.data).filter(([, v]) => typeof v === 'string') as [string, string][]
        if (entries.length === 0) {
          setImportError('备份文件里没有可导入的数据')
          return
        }

        // 清空现有数据（localStorage + IndexedDB）
        try { localStorage.clear() } catch {}
        await kvClear()

        // 分批写入 IndexedDB（更快，也避免单条 await 太慢导致“像没反应”）
        const CHUNK = 30
        for (let i = 0; i < entries.length; i += CHUNK) {
          const chunk = entries.slice(i, i + CHUNK)
          await Promise.all(chunk.map(async ([key, value]) => {
            // localStorage: 仍保留少量 UI 状态兼容；失败也不阻断
            try { localStorage.setItem(key, value) } catch {}
            // IndexedDB(kv): 关键存储
            await kvSet(key, value)
          }))
        }

        // 校验：至少应能读回关键数据（否则就是写入失败/被覆盖）
        const hasWeChat = !!(await kvGet('wechat_characters'))
        const hasOS = !!(await kvGet('os_llm_config')) || !!(await kvGet('os_current_font_id')) || !!(await kvGet('os_font_color_id'))
        if (!hasWeChat && !hasOS) {
          setImportError('导入失败：写入存储未生效（请重试；若仍失败请换浏览器）')
          return
        }

        setShowImportSuccess(true)
        // 立即重启，确保 Context 重新 hydration 到新数据（用户数据安全第一）
        setTimeout(() => window.location.reload(), 300)
      }

      doImport().catch((error: any) => {
        console.error('导入失败:', error)
        ;(window as any).__LP_IMPORTING__ = false
        const name = String(error?.name || '')
        const msg = String(error?.message || '')
        if (name.includes('Quota') || msg.toLowerCase().includes('quota')) {
          setImportError('导入失败：存储空间不足（请清理浏览器存储或换个浏览器）')
        } else {
          setImportError('导入失败：请确认备份文件正确，并重试')
        }
      })
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

          <SettingsGroup title="显示">
            <SettingsItem
              label="全屏模式"
              value={isFullscreen ? '已开启' : '已关闭'}
              onClick={toggleFullscreen}
              showArrow={false}
            />
          </SettingsGroup>

          <SettingsGroup title="数据管理">
            <SettingsItem
              label="导出数据"
              onClick={openExportDialog}
              showArrow={false}
            />
            <SettingsItem
              label="导入数据"
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
            <SettingsItem label="关机" onClick={handleShutdown} showArrow={false} />
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

        {/* 导出文件命名弹窗 */}
        {showExportNameDialog && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => setShowExportNameDialog(false)}
              role="presentation"
            />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#111]">导出数据</div>
                <div className="mt-2 text-[13px] text-[#666]">
                  请输入备份文件名称
                </div>
              </div>
              <div className="mt-3">
                <input
                  type="text"
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  placeholder="请输入文件名"
                  className="w-full rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-[14px] text-[#333] outline-none focus:border-pink-400"
                />
                <div className="mt-1 text-[11px] text-[#999]">
                  文件将保存为: {exportFileName.trim() || 'LittlePhone_backup'}.json
                </div>
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
                  onClick={handleExportData}
                  className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)' }}
                >
                  导出
                </button>
              </div>
            </div>
          </div>
        )}

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
                  onClick={() => {
                    localStorage.clear()
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

        {/* 导出成功提示 */}
        {showExportSuccess && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => setShowExportSuccess(false)}
              role="presentation"
            />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
              <div className="text-center">
                <div className="text-4xl mb-2">✅</div>
                <div className="text-[15px] font-semibold text-[#111]">导出成功</div>
                <div className="mt-2 text-[13px] text-[#333]">
                  数据已保存到下载文件夹，可以导入到其他设备的小手机中。
                </div>
              </div>
              <div className="mt-4">
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

        {/* 导入成功提示 */}
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
                  数据已导入完成，需要重启小手机才能生效。
                </div>
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
      </div>
    </PageContainer>
  )
}
