import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../context/OSContext'
import { useWeChat } from '../context/WeChatContext'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'
import { SettingsGroup, SettingsItem } from '../components/SettingsGroup'
import { exportCurrentBackupJsonText, importLegacyBackupJsonText } from '../storage/legacyBackupImport'
import { kvClear } from '../storage/kv'

export default function SettingsScreen() {
  const navigate = useNavigate()
  const { llmConfig, currentFont, fontColor, setLocked } = useOS()
  const { characters, setCharacterTyping } = useWeChat()
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showClearedTip, setShowClearedTip] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [showExportNameDialog, setShowExportNameDialog] = useState(false)
  const [exportFileName, setExportFileName] = useState('')
  const [showExportSuccess, setShowExportSuccess] = useState(false)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [showImportSuccess, setShowImportSuccess] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<{ written: number; skipped: number } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

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

  const openExportDialog = () => {
    setExportFileName(`Mina_backup_${new Date().toISOString().slice(0, 10)}`)
    setShowExportNameDialog(true)
  }

  const handleExportData = async () => {
    try {
      const json = await exportCurrentBackupJsonText()
      const fileName = exportFileName.trim() || `Mina_backup_${new Date().toISOString().slice(0, 10)}`
      const blob = new Blob([json], { type: 'application/json' })
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
                <div className="text-[15px] font-semibold text-[#111]">导出成功</div>
                <div className="mt-2 text-[13px] text-[#333]">备份文件已保存到下载目录。</div>
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
