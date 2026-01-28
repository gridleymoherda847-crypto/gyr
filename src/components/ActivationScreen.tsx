/**
 * 激活界面 - 用户输入兑换码激活小手机
 */

import { useState } from 'react'
import { verifyRedemptionCode, migrateToNewDevice } from '../services/redemption'

type ActivationScreenProps = {
  onActivated: () => void
}

export default function ActivationScreen({ onActivated }: ActivationScreenProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showMigration, setShowMigration] = useState(false)
  const [migrationCode, setMigrationCode] = useState('')
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!code.trim()) {
      setError('请输入兑换码')
      return
    }
    
    setLoading(true)
    setError('')
    
    const result = await verifyRedemptionCode(code)
    
    setLoading(false)
    
    if (result.success) {
      onActivated()
    } else if (result.needMigration) {
      setMigrationCode(code)
      setShowMigration(true)
    } else {
      setError(result.message)
    }
  }
  
  const handleMigrate = async () => {
    setLoading(true)
    setError('')
    
    const result = await migrateToNewDevice(migrationCode)
    
    setLoading(false)
    
    if (result.success) {
      onActivated()
    } else {
      setError(result.message)
      setShowMigration(false)
    }
  }
  
  const handleCancelMigration = () => {
    setShowMigration(false)
    setError('')
    setCode('')
  }
  
  // 迁移确认弹窗
  if (showMigration) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-100 via-white to-purple-100 p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-6 space-y-5">
          <div className="text-center">
            <div className="text-5xl mb-4">📱</div>
            <h2 className="text-xl font-bold text-gray-800">更换绑定设备</h2>
            <p className="text-sm text-gray-500 mt-2">
              此兑换码已在其他设备激活。是否将绑定转移到当前设备？
            </p>
          </div>
          
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div className="text-sm text-amber-800">
                <strong>注意：</strong>这只会转移激活码的绑定关系，原设备将无法继续使用此兑换码。
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-200">
            <div className="flex items-start gap-3">
              <span className="text-xl">💾</span>
              <div className="text-sm text-blue-800">
                <strong>数据不会自动迁移！</strong>
                <br />聊天记录等数据存储在浏览器本地。如需迁移数据，请在原设备「设置 → 导出数据」，再到新设备「设置 → 导入数据」。
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={handleCancelMigration}
              disabled={loading}
              className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-600 font-medium hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleMigrate}
              disabled={loading}
              className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium shadow-lg disabled:opacity-50"
            >
              {loading ? '处理中...' : '确认换绑'}
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-100 via-white to-purple-100 p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-6 space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div
            className="text-5xl font-extrabold tracking-wide select-none inline-block"
            style={{
              fontFamily: '"Baloo 2", "ZCOOL KuaiLe", "Noto Sans SC", system-ui, sans-serif',
              background: 'linear-gradient(135deg, #fb7185 0%, #ec4899 55%, #f472b6 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Mina
          </div>
          <p className="text-gray-500 mt-2">请输入兑换码激活小手机</p>
        </div>
        
        {/* 输入表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="例如：MINA-XXXX-XXXX"
              className="w-full px-4 py-3.5 rounded-2xl bg-gray-50 border border-gray-200 text-center text-lg font-mono tracking-widest focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all"
              disabled={loading}
              autoComplete="off"
              autoCapitalize="characters"
            />
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-center">
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-500 text-white font-semibold shadow-lg shadow-pink-500/25 disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                验证中...
              </span>
            ) : (
              '激活'
            )}
          </button>
        </form>
        
        {/* 底部说明 */}
        <div className="text-center text-xs text-gray-400 space-y-1">
          <p>兑换码由开发者提供</p>
          <p>一个兑换码只能绑定一个设备</p>
        </div>
      </div>
    </div>
  )
}
