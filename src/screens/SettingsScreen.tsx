import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../context/OSContext'
import { useWeChat } from '../context/WeChatContext'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'
import { SettingsGroup, SettingsItem } from '../components/SettingsGroup'

export default function SettingsScreen() {
  const navigate = useNavigate()
  const { llmConfig, currentFont, fontColor, setLocked } = useOS()
  const { characters, setCharacterTyping } = useWeChat()
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showClearedTip, setShowClearedTip] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)

  const handleShutdown = () => {
    setLocked(true)
    navigate('/', { replace: true })
  }

  const handleClearData = () => {
    setShowClearConfirm(true)
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
