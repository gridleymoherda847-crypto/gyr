import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS, type Anniversary } from '../context/OSContext'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'

const EMOJI_OPTIONS = ['❤️', '🎂', '💍', '🎉', '🌹', '⭐', '🏠', '✈️', '🎓', '💼', '🐱', '🐕']

export default function AnniversaryScreen() {
  const navigate = useNavigate()
  const { anniversaries, addAnniversary, updateAnniversary, removeAnniversary } = useOS()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    date: new Date().toISOString().slice(0, 10),
    icon: '❤️',
    type: 'countup' as 'countdown' | 'countup'
  })

  const resetForm = () => {
    setFormData({
      name: '',
      date: new Date().toISOString().slice(0, 10),
      icon: '❤️',
      type: 'countup'
    })
  }

  const openAddDialog = () => {
    resetForm()
    setEditingId(null)
    setShowAddDialog(true)
  }

  const openEditDialog = (anniversary: Anniversary) => {
    setFormData({
      name: anniversary.name,
      date: anniversary.date,
      icon: anniversary.icon,
      type: anniversary.type
    })
    setEditingId(anniversary.id)
    setShowAddDialog(true)
  }

  const handleSave = () => {
    if (!formData.name.trim()) return
    
    if (editingId) {
      updateAnniversary(editingId, formData)
    } else {
      addAnniversary(formData)
    }
    setShowAddDialog(false)
    resetForm()
    setEditingId(null)
  }

  const handleDelete = (id: string) => {
    removeAnniversary(id)
  }

  // 计算天数差（修复时区问题）
  const calcDays = (dateStr: string, type: 'countdown' | 'countup') => {
    // 手动解析日期字符串，避免时区问题
    const [year, month, day] = dateStr.split('-').map(Number)
    const target = new Date(year, month - 1, day, 0, 0, 0, 0)
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    if (type === 'countup') {
      // 正计时：从那天到今天过了多少天
      const diffMs = today.getTime() - target.getTime()
      const diff = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      return diff >= 0 ? diff : 0
    } else {
      // 倒计时：还有多少天到那天（今年或明年）
      const todayYear = today.getFullYear()
      const todayMonth = today.getMonth()
      const todayDate = today.getDate()
      
      // 先尝试今年的这个日期
      let targetThisYear = new Date(todayYear, month - 1, day, 0, 0, 0, 0)
      
      // 如果今年的日期已经过了（严格小于今天），就用明年的
      const targetMonth = targetThisYear.getMonth()
      const targetDate = targetThisYear.getDate()
      
      if (targetMonth < todayMonth || (targetMonth === todayMonth && targetDate < todayDate)) {
        targetThisYear = new Date(todayYear + 1, month - 1, day, 0, 0, 0, 0)
      }
      
      const diffMs = targetThisYear.getTime() - today.getTime()
      return Math.round(diffMs / (1000 * 60 * 60 * 24))
    }
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="纪念日" onBack={() => navigate('/', { replace: true })} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 pb-4">
          {/* 添加按钮 */}
          <button
            type="button"
            onClick={openAddDialog}
            className="w-full mb-4 py-3 rounded-2xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-gray-500 hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-xl">+</span>
            <span>添加纪念日</span>
          </button>

          {/* 纪念日列表 */}
          {anniversaries.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <div className="text-4xl mb-2">📅</div>
              <div>还没有纪念日</div>
              <div className="text-sm">点击上方添加你的第一个纪念日</div>
            </div>
          ) : (
            <div className="space-y-3">
              {anniversaries.map(ann => {
                const days = calcDays(ann.date, ann.type)
                return (
                  <div
                    key={ann.id}
                    className="bg-white/80 rounded-2xl p-4 shadow-sm border border-white/50"
                    onClick={() => openEditDialog(ann)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{ann.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 truncate">{ann.name}</div>
                        <div className="text-xs text-gray-400">{ann.date}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-800">{days}</div>
                        <div className="text-xs text-gray-400">
                          {ann.type === 'countup' ? '天' : '天后'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 添加/编辑弹窗 */}
        {showAddDialog && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div
              className="absolute inset-0 bg-black/35"
              onClick={() => setShowAddDialog(false)}
            />
            <div className="relative w-full max-w-[320px] rounded-[22px] border border-white/35 bg-white/95 p-4 shadow-xl backdrop-blur-xl">
              <div className="text-center font-semibold text-gray-800 mb-4">
                {editingId ? '编辑纪念日' : '添加纪念日'}
              </div>
              
              {/* 名称 */}
              <div className="mb-3">
                <label className="text-xs text-gray-500 mb-1 block">名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="如：在一起、生日"
                  className="w-full px-3 py-2 rounded-xl bg-gray-100 border-none outline-none text-sm"
                />
              </div>

              {/* 日期 */}
              <div className="mb-3">
                <label className="text-xs text-gray-500 mb-1 block">日期</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-gray-100 border-none outline-none text-sm"
                />
              </div>

              {/* 类型 */}
              <div className="mb-3">
                <label className="text-xs text-gray-500 mb-1 block">类型</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, type: 'countup' }))}
                    className={`flex-1 py-2 rounded-xl text-sm transition-colors ${
                      formData.type === 'countup' 
                        ? 'bg-gray-800 text-white' 
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    已经多少天
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, type: 'countdown' }))}
                    className={`flex-1 py-2 rounded-xl text-sm transition-colors ${
                      formData.type === 'countdown' 
                        ? 'bg-gray-800 text-white' 
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    还有多少天
                  </button>
                </div>
              </div>

              {/* 图标选择 */}
              <div className="mb-4">
                <label className="text-xs text-gray-500 mb-1 block">图标</label>
                <div className="grid grid-cols-6 gap-2">
                  {EMOJI_OPTIONS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, icon: emoji }))}
                      className={`text-2xl p-1 rounded-lg transition-colors ${
                        formData.icon === emoji 
                          ? 'bg-gray-100 ring-2 ring-gray-600' 
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* 按钮 */}
              <div className="flex gap-2">
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      handleDelete(editingId)
                      setShowAddDialog(false)
                    }}
                    className="px-4 py-2 rounded-full bg-red-100 text-red-500 text-sm font-medium"
                  >
                    删除
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddDialog(false)}
                  className="flex-1 py-2 rounded-full bg-gray-100 text-gray-600 text-sm font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="flex-1 py-2 rounded-full bg-gray-800 text-white text-sm font-medium"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
