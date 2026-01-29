import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../context/OSContext'
import { useWeChat } from '../context/WeChatContext'
import PageContainer from '../components/PageContainer'

// ============ 类型定义 ============

// 叙事设置配置
type NarrativeConfig = {
  sensoryFirst: boolean      // 感官优先描写
  characterProxy: boolean    // 角色思维代理
  noOOC: boolean             // 保持角色一致性
  immersive: boolean         // 保持沉浸感
  customPrompt: string       // 自定义提示词
}

// 世界书条目
type LorebookEntry = {
  id: string
  name: string               // 条目名称
  keywords: string[]         // 触发关键词
  content: string            // 条目内容
  priority: 'high' | 'medium' | 'low'  // 优先级
  alwaysActive: boolean      // 始终启用
  enabled: boolean           // 是否启用
}

// 世界书
type Lorebook = {
  id: string
  name: string               // 世界书名称
  description: string        // 描述
  isGlobal: boolean          // 是否全局生效（true=所有角色，false=仅绑定的角色）
  characterIds: string[]     // 绑定的角色ID列表（仅isGlobal=false时有效）
  entries: LorebookEntry[]   // 条目列表
  createdAt: number
}

// 高级参数配置
type AdvancedConfig = {
  temperature: number        // 温度 0-2
  topP: number               // Top P 0-1
  maxTokens: number          // 最大回复长度
  frequencyPenalty: number   // 频率惩罚 0-2
  presencePenalty: number    // 存在惩罚 0-2
}

// 完整配置
type WorkshopConfig = {
  narrative: NarrativeConfig
  lorebooks: Lorebook[]
  advanced: AdvancedConfig
}

// ============ 常量 ============

const STORAGE_KEY = 'littlephone_workshop_config'

const DEFAULT_NARRATIVE: NarrativeConfig = {
  sensoryFirst: false,
  characterProxy: true,
  noOOC: true,
  immersive: true,
  customPrompt: '',
}

const DEFAULT_ADVANCED: AdvancedConfig = {
  temperature: 0.8,
  topP: 0.95,
  maxTokens: 1000,
  frequencyPenalty: 0,
  presencePenalty: 0,
}

const DEFAULT_CONFIG: WorkshopConfig = {
  narrative: DEFAULT_NARRATIVE,
  lorebooks: [],
  advanced: DEFAULT_ADVANCED,
}

// ============ 主组件 ============

export default function PresetScreen() {
  const navigate = useNavigate()
  const { fontColor } = useOS()
  const { characters } = useWeChat()
  
  // Tab 状态
  const [activeTab, setActiveTab] = useState<'narrative' | 'lorebook'>('narrative')
  
  // 配置状态
  const [config, setConfig] = useState<WorkshopConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return {
          narrative: { ...DEFAULT_NARRATIVE, ...parsed.narrative },
          lorebooks: parsed.lorebooks || [],
          advanced: { ...DEFAULT_ADVANCED, ...parsed.advanced },
        }
      } catch {
        return DEFAULT_CONFIG
      }
    }
    return DEFAULT_CONFIG
  })
  
  // 世界书编辑状态
  const [editingLorebook, setEditingLorebook] = useState<Lorebook | null>(null)
  const [showLorebookForm, setShowLorebookForm] = useState(false)
  
  // 文件上传
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 保存配置
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    // 生成并保存预设内容（供其他模块读取）
    const content = generatePresetContent(config)
    localStorage.setItem('littlephone_presets_content', content)
  }, [config])
  
  // 更新叙事配置
  const updateNarrative = (updates: Partial<NarrativeConfig>) => {
    setConfig(prev => ({
      ...prev,
      narrative: { ...prev.narrative, ...updates }
    }))
  }
  
  
  // 添加/更新世界书
  const saveLorebook = (lorebook: Lorebook) => {
    setConfig(prev => {
      const existing = prev.lorebooks.findIndex(l => l.id === lorebook.id)
      if (existing >= 0) {
        const updated = [...prev.lorebooks]
        updated[existing] = lorebook
        return { ...prev, lorebooks: updated }
      }
      return { ...prev, lorebooks: [...prev.lorebooks, lorebook] }
    })
    setEditingLorebook(null)
    setShowLorebookForm(false)
  }
  
  // 删除世界书
  const deleteLorebook = (id: string) => {
    setConfig(prev => ({
      ...prev,
      lorebooks: prev.lorebooks.filter(l => l.id !== id)
    }))
  }
  
  // 世界书导入导出
  const lorebookImportRef = useRef<HTMLInputElement>(null)
  
  // 导出所有世界书
  const exportAllLorebooks = () => {
    if (config.lorebooks.length === 0) {
      alert('没有可导出的世界书')
      return
    }
    const data = {
      version: 1,
      type: 'mina_lorebooks',
      lorebooks: config.lorebooks,
      exportedAt: Date.now(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `世界书备份_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  
  // 导出单个世界书
  const exportSingleLorebook = (lorebook: Lorebook) => {
    const data = {
      version: 1,
      type: 'mina_lorebook',
      lorebook: lorebook,
      exportedAt: Date.now(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `世界书_${lorebook.name}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  
  // 导入世界书
  const handleLorebookImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const normalizeImportedLorebook = (lb: any): Lorebook | null => {
      const name = String(lb?.name || '').trim()
      const entriesRaw = Array.isArray(lb?.entries) ? lb.entries : []
      if (!name || entriesRaw.length === 0) return null
      const isGlobal = lb?.isGlobal === false ? false : true
      const characterIds = Array.isArray(lb?.characterIds) ? lb.characterIds.filter((x: any) => typeof x === 'string') : []
      const entries: LorebookEntry[] = entriesRaw
        .map((e2: any) => {
          const ename = String(e2?.name || '').trim()
          const content = String(e2?.content || '').trim()
          if (!ename || !content) return null
          const priorityRaw = String(e2?.priority || 'medium')
          const priority = priorityRaw === 'high' || priorityRaw === 'low' ? (priorityRaw as any) : 'medium'
          return {
            id: String(e2?.id || `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
            name: ename,
            keywords: Array.isArray(e2?.keywords) ? e2.keywords.map((k: any) => String(k || '').trim()).filter(Boolean) : [],
            content,
            priority,
            alwaysActive: e2?.alwaysActive === true,
            // 关键：兼容旧格式，enabled 缺省视为 true
            enabled: e2?.enabled === false ? false : true,
          } as LorebookEntry
        })
        .filter(Boolean) as LorebookEntry[]
      if (entries.length === 0) return null
      return {
        id: String(lb?.id || `lorebook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        name,
        description: String(lb?.description || ''),
        isGlobal,
        characterIds: isGlobal ? [] : characterIds,
        entries,
        createdAt: typeof lb?.createdAt === 'number' ? lb.createdAt : Date.now(),
      }
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string)
        
        // 检查是否是有效的世界书文件
        if (data.type === 'mina_lorebooks' && Array.isArray(data.lorebooks)) {
          // 批量导入
          let importCount = 0
          for (const lb of data.lorebooks) {
            const normalized = normalizeImportedLorebook(lb)
            if (normalized) {
              // 生成新ID避免冲突（导入永远新建）
              const newLorebook: Lorebook = {
                ...normalized,
                id: `lorebook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              }
              setConfig(prev => ({
                ...prev,
                lorebooks: [...prev.lorebooks, newLorebook]
              }))
              importCount++
            }
          }
          alert(`成功导入 ${importCount} 个世界书`)
        } else if (data.type === 'mina_lorebook' && data.lorebook) {
          // 单个导入
          const lb = data.lorebook
          const normalized = normalizeImportedLorebook(lb)
          if (normalized) {
            const newLorebook: Lorebook = {
              ...normalized,
              id: `lorebook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            }
            setConfig(prev => ({
              ...prev,
              lorebooks: [...prev.lorebooks, newLorebook]
            }))
            alert(`成功导入世界书：${normalized.name}`)
          } else {
            alert('世界书格式不正确')
          }
        } else {
          alert('不是有效的世界书文件')
        }
      } catch {
        alert('文件解析失败')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }
  
  // 处理文件上传
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) {
        // 追加到自定义提示词
        updateNarrative({
          customPrompt: config.narrative.customPrompt 
            ? config.narrative.customPrompt + '\n\n' + content 
            : content
        })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }
  
  const tabs = [
    { id: 'narrative' as const, label: '叙事设置', icon: '📝' },
    { id: 'lorebook' as const, label: '世界书', icon: '📚' },
  ]

  return (
    <PageContainer>
      <div className="flex flex-col h-full">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3">
          <button 
            type="button" 
            onClick={() => navigate('/', { replace: true })}
            className="flex items-center gap-0.5"
            style={{ color: fontColor.value }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[13px] font-medium">返回</span>
          </button>
          <span className="font-semibold text-gray-800">🎨 创作工坊</span>
          <div className="w-12" />
        </div>
        
        {/* Tab 切换 */}
        <div className="flex gap-1 mx-4 p-1 bg-gray-100 rounded-xl">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white shadow text-gray-800'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          
          {/* ========== 叙事设置 Tab ========== */}
          {activeTab === 'narrative' && (
            <div className="mt-4 space-y-4">
              
              {/* 叙事风格开关 */}
              <div className="p-4 rounded-2xl bg-white shadow-sm border border-gray-100">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg">🎭</span>
                  <span className="font-semibold text-gray-800">叙事风格</span>
                </div>
                
                <div className="space-y-4">
                  {/* 感官优先描写 */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1 mr-3">
                      <div className="font-medium text-gray-800">感官优先描写</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Show Don't Tell，用感官细节替代抽象形容
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateNarrative({ sensoryFirst: !config.narrative.sensoryFirst })}
                      className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                        config.narrative.sensoryFirst ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full bg-white shadow transition-transform mt-0.5 ${
                        config.narrative.sensoryFirst ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  
                  {/* 角色思维代理 */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1 mr-3">
                      <div className="font-medium text-gray-800">角色思维代理</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        完全接管角色心智，用角色的逻辑思考
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateNarrative({ characterProxy: !config.narrative.characterProxy })}
                      className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                        config.narrative.characterProxy ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full bg-white shadow transition-transform mt-0.5 ${
                        config.narrative.characterProxy ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  
                  {/* 保持角色一致性 */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1 mr-3">
                      <div className="font-medium text-gray-800">保持角色一致性</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        角色始终按照人设行动，不会突然性格改变
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateNarrative({ noOOC: !config.narrative.noOOC })}
                      className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                        config.narrative.noOOC ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full bg-white shadow transition-transform mt-0.5 ${
                        config.narrative.noOOC ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                  
                  {/* 保持沉浸感 */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1 mr-3">
                      <div className="font-medium text-gray-800">保持沉浸感</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        剧情自然结束，不添加多余的总结或说明
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateNarrative({ immersive: !config.narrative.immersive })}
                      className={`w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                        config.narrative.immersive ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full bg-white shadow transition-transform mt-0.5 ${
                        config.narrative.immersive ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>
              </div>
              
              {/* 自定义提示词 */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">✍️</span>
                  <span className="font-semibold text-gray-800">自定义提示词</span>
                </div>
                
                <textarea
                  value={config.narrative.customPrompt}
                  onChange={(e) => updateNarrative({ customPrompt: e.target.value })}
                  placeholder="在这里写入你的自定义指令，会追加到系统提示词中...

例如：
- 角色说话时带有特定口癖
- 特定的世界观设定
- 输出格式要求
- 等等..."
                  rows={8}
                  className="w-full p-3 rounded-xl bg-white border border-purple-200 text-sm text-gray-800 outline-none resize-none focus:border-purple-400 transition-colors"
                />
                
                <div className="flex items-center justify-between mt-3">
                  <div className="text-xs text-gray-500">
                    💡 支持粘贴或上传提示词文件
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.json,.md"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-purple-100 text-purple-700 text-xs font-medium hover:bg-purple-200 transition-colors"
                  >
                    📤 上传文件
                  </button>
                </div>
              </div>
              
              {/* 重置按钮 */}
              <button
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, narrative: DEFAULT_NARRATIVE }))}
                className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 text-sm hover:bg-gray-200 transition-colors"
              >
                重置叙事设置
              </button>
            </div>
          )}
          
          {/* ========== 世界书 Tab ========== */}
          {activeTab === 'lorebook' && (
            <div className="mt-4 space-y-4">
              
              {/* 世界书说明 */}
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                <div className="text-sm text-blue-800">
                  <strong>📚 世界书</strong>是角色共享的设定库。当聊天中出现触发词时，相关条目会自动注入到对话中。
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  优先级：创作设置 {'>'} 世界书 {'>'} 角色人设 {'>'} 上下文
                </div>
              </div>
              
              {/* 世界书列表 */}
              {config.lorebooks.length > 0 ? (
                <div className="space-y-3">
                  {/* 全局世界书 */}
                  {config.lorebooks.filter(l => l.isGlobal).length > 0 && (
                    <div className="mb-2">
                      <div className="text-xs font-medium text-purple-600 mb-2 flex items-center gap-1">
                        <span>🌍</span> 全局世界书
                      </div>
                      <div className="space-y-2">
                        {config.lorebooks.filter(l => l.isGlobal).map((lorebook) => (
                          <div
                            key={lorebook.id}
                            className="p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-blue-50 shadow-sm border border-purple-100"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                                  {lorebook.name}
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-600">全局</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {lorebook.entries.length} 个条目 · 所有角色生效
                                </div>
                                {lorebook.description && (
                                  <div className="text-xs text-gray-400 mt-1 line-clamp-2">
                                    {lorebook.description}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLorebook(lorebook)
                                    setShowLorebookForm(true)
                                  }}
                                  className="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-medium"
                                >
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => exportSingleLorebook(lorebook)}
                                  className="px-2 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-medium"
                                >
                                  导出
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteLorebook(lorebook.id)}
                                  className="px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-medium"
                                >
                                  删除
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* 局部世界书 */}
                  {config.lorebooks.filter(l => !l.isGlobal).length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-green-600 mb-2 flex items-center gap-1">
                        <span>👤</span> 角色专属世界书
                      </div>
                      <div className="space-y-2">
                        {config.lorebooks.filter(l => !l.isGlobal).map((lorebook) => {
                          const boundCharNames = characters
                            .filter(c => lorebook.characterIds.includes(c.id))
                            .map(c => c.name)
                            .slice(0, 3)
                          return (
                            <div
                              key={lorebook.id}
                              className="p-4 rounded-2xl bg-white shadow-sm border border-gray-100"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                                    {lorebook.name}
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-600">局部</span>
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {lorebook.entries.length} 个条目 · 绑定 {lorebook.characterIds.length} 个角色
                                    {boundCharNames.length > 0 && (
                                      <span className="text-gray-400"> ({boundCharNames.join('、')}{lorebook.characterIds.length > 3 ? '...' : ''})</span>
                                    )}
                                  </div>
                                  {lorebook.description && (
                                    <div className="text-xs text-gray-400 mt-1 line-clamp-2">
                                      {lorebook.description}
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingLorebook(lorebook)
                                      setShowLorebookForm(true)
                                    }}
                                    className="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-medium"
                                  >
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => exportSingleLorebook(lorebook)}
                                    className="px-2 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-medium"
                                  >
                                    导出
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteLorebook(lorebook.id)}
                                    className="px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-medium"
                                  >
                                    删除
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 text-center">
                  <div className="text-4xl mb-2">📚</div>
                  <div className="text-gray-500 text-sm">还没有世界书</div>
                  <div className="text-gray-400 text-xs mt-1">创建世界书来丰富你的角色设定</div>
                </div>
              )}
              
              {/* 添加世界书按钮 */}
              <button
                type="button"
                onClick={() => {
                  setEditingLorebook(null)
                  setShowLorebookForm(true)
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl transition-all"
              >
                + 创建新世界书
              </button>
              
              {/* 导入导出按钮 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => lorebookImportRef.current?.click()}
                  className="flex-1 py-2.5 rounded-xl bg-green-100 text-green-700 font-medium text-sm"
                >
                  📥 导入世界书
                </button>
                <button
                  type="button"
                  onClick={exportAllLorebooks}
                  className="flex-1 py-2.5 rounded-xl bg-purple-100 text-purple-700 font-medium text-sm"
                >
                  📤 导出全部
                </button>
              </div>
              <input
                ref={lorebookImportRef}
                type="file"
                accept=".json"
                onChange={handleLorebookImport}
                className="hidden"
              />
            </div>
          )}
          
        </div>
        
        {/* ========== 世界书编辑弹窗 ========== */}
        {showLorebookForm && (
          <LorebookFormModal
            lorebook={editingLorebook}
            characters={characters}
            onSave={saveLorebook}
            onClose={() => {
              setShowLorebookForm(false)
              setEditingLorebook(null)
            }}
          />
        )}
      </div>
    </PageContainer>
  )
}

// ============ 世界书编辑弹窗组件 ============

type LorebookFormModalProps = {
  lorebook: Lorebook | null
  characters: { id: string; name: string }[]
  onSave: (lorebook: Lorebook) => void
  onClose: () => void
}

function LorebookFormModal({ lorebook, characters, onSave, onClose }: LorebookFormModalProps) {
  const [name, setName] = useState(lorebook?.name || '')
  const [description, setDescription] = useState(lorebook?.description || '')
  const [isGlobal, setIsGlobal] = useState(lorebook?.isGlobal ?? true) // 默认全局
  const [characterIds, setCharacterIds] = useState<string[]>(lorebook?.characterIds || [])
  const [entries, setEntries] = useState<LorebookEntry[]>(lorebook?.entries || [])
  const [editingEntry, setEditingEntry] = useState<LorebookEntry | null>(null)
  const [showEntryForm, setShowEntryForm] = useState(false)
  
  const handleSave = () => {
    if (!name.trim()) return
    
    onSave({
      id: lorebook?.id || `lorebook_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      isGlobal,
      characterIds: isGlobal ? [] : characterIds, // 全局时清空角色绑定
      entries,
      createdAt: lorebook?.createdAt || Date.now(),
    })
  }
  
  const toggleCharacter = (charId: string) => {
    setCharacterIds(prev => 
      prev.includes(charId) 
        ? prev.filter(id => id !== charId)
        : [...prev, charId]
    )
  }
  
  const saveEntry = (entry: LorebookEntry) => {
    setEntries(prev => {
      const existing = prev.findIndex(e => e.id === entry.id)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = entry
        return updated
      }
      return [...prev, entry]
    })
    setEditingEntry(null)
    setShowEntryForm(false)
  }
  
  const deleteEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }
  
  return (
    <div className="absolute inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-2xl max-h-[85%] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <button type="button" onClick={onClose} className="text-gray-500 text-sm">
            取消
          </button>
          <span className="font-semibold text-gray-800">
            {lorebook ? '编辑世界书' : '创建世界书'}
          </span>
          <button 
            type="button" 
            onClick={handleSave}
            disabled={!name.trim()}
            className="text-blue-500 font-semibold text-sm disabled:opacity-50"
          >
            保存
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 基本信息 */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">世界书名称 *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：魔法世界设定"
                className="w-full px-3 py-2.5 rounded-xl bg-gray-100 border border-gray-200 text-sm outline-none focus:border-blue-400"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">描述（可选）</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简单描述这个世界书的内容..."
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-gray-100 border border-gray-200 text-sm outline-none resize-none focus:border-blue-400"
              />
            </div>
          </div>
          
          {/* 作用范围 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">作用范围</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsGlobal(true)}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                  isGlobal 
                    ? 'bg-purple-500 text-white shadow-md' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-lg">🌍</span>
                  <span>全局</span>
                  <span className={`text-[10px] ${isGlobal ? 'text-purple-200' : 'text-gray-400'}`}>所有角色生效</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setIsGlobal(false)}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                  !isGlobal 
                    ? 'bg-green-500 text-white shadow-md' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-lg">👤</span>
                  <span>局部</span>
                  <span className={`text-[10px] ${!isGlobal ? 'text-green-200' : 'text-gray-400'}`}>仅指定角色</span>
                </div>
              </button>
            </div>
          </div>
          
          {/* 绑定角色（仅局部时显示） */}
          {!isGlobal && (
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              绑定角色（勾选后该角色会使用此世界书）
            </label>
            {characters.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {characters.map((char) => (
                  <button
                    key={char.id}
                    type="button"
                    onClick={() => toggleCharacter(char.id)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      characterIds.includes(char.id)
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {char.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400">还没有创建角色</div>
            )}
            {characterIds.length === 0 && (
              <div className="text-xs text-orange-500 mt-1">
                ⚠️ 请至少选择一个角色，否则此世界书不会生效
              </div>
            )}
          </div>
          )}
          
          {/* 条目列表 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">条目列表</label>
              <button
                type="button"
                onClick={() => {
                  setEditingEntry(null)
                  setShowEntryForm(true)
                }}
                className="text-blue-500 text-sm font-medium"
              >
                + 添加条目
              </button>
            </div>
            
            {entries.length > 0 ? (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`p-3 rounded-xl border ${
                      entry.enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800 text-sm">{entry.name}</span>
                          {entry.alwaysActive && (
                            <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px]">
                              常驻
                            </span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                            entry.priority === 'high' ? 'bg-red-100 text-red-700' :
                            entry.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {entry.priority === 'high' ? '高' : entry.priority === 'medium' ? '中' : '低'}
                          </span>
                        </div>
                        {entry.keywords.length > 0 && (
                          <div className="text-xs text-gray-400 mt-1">
                            触发词: {entry.keywords.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEntry(entry)
                            setShowEntryForm(true)
                          }}
                          className="p-1 text-gray-400 hover:text-blue-500"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEntry(entry.id)}
                          className="p-1 text-gray-400 hover:text-red-500"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-gray-50 border border-dashed border-gray-200 text-center text-sm text-gray-400">
                还没有条目，点击上方添加
              </div>
            )}
          </div>
        </div>
        
        {/* 条目编辑弹窗 */}
        {showEntryForm && (
          <EntryFormModal
            entry={editingEntry}
            onSave={saveEntry}
            onClose={() => {
              setShowEntryForm(false)
              setEditingEntry(null)
            }}
          />
        )}
      </div>
    </div>
  )
}

// ============ 条目编辑弹窗组件 ============

type EntryFormModalProps = {
  entry: LorebookEntry | null
  onSave: (entry: LorebookEntry) => void
  onClose: () => void
}

function EntryFormModal({ entry, onSave, onClose }: EntryFormModalProps) {
  const [name, setName] = useState(entry?.name || '')
  const [keywords, setKeywords] = useState(entry?.keywords.join(', ') || '')
  const [content, setContent] = useState(entry?.content || '')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>(entry?.priority || 'medium')
  const [alwaysActive, setAlwaysActive] = useState(entry?.alwaysActive || false)
  const [enabled, setEnabled] = useState(entry?.enabled !== false)
  
  const handleSave = () => {
    if (!name.trim() || !content.trim()) return
    
    onSave({
      id: entry?.id || `entry_${Date.now()}`,
      name: name.trim(),
      keywords: keywords.split(',').map(k => k.trim()).filter(k => k),
      content: content.trim(),
      priority,
      alwaysActive,
      enabled,
    })
  }
  
  return (
    <div className="absolute inset-0 z-60 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl max-h-[80%] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <button type="button" onClick={onClose} className="text-gray-500 text-sm">
            取消
          </button>
          <span className="font-semibold text-gray-800">
            {entry ? '编辑条目' : '添加条目'}
          </span>
          <button 
            type="button" 
            onClick={handleSave}
            disabled={!name.trim() || !content.trim()}
            className="text-blue-500 font-semibold text-sm disabled:opacity-50"
          >
            保存
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 条目名称 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">条目名称 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：魔法系统"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-100 border border-gray-200 text-sm outline-none focus:border-blue-400"
            />
          </div>
          
          {/* 触发关键词 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">触发关键词</label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="魔法, 咒语, 法术（用逗号分隔）"
              className="w-full px-3 py-2.5 rounded-xl bg-gray-100 border border-gray-200 text-sm outline-none focus:border-blue-400"
            />
            <div className="text-xs text-gray-400 mt-1">
              当聊天中出现这些词时，条目会被激活
            </div>
          </div>
          
          {/* 条目内容 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">条目内容 *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="详细描述这个设定..."
              rows={6}
              className="w-full px-3 py-2.5 rounded-xl bg-gray-100 border border-gray-200 text-sm outline-none resize-none focus:border-blue-400"
            />
          </div>
          
          {/* 优先级 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">优先级</label>
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    priority === p
                      ? p === 'high' ? 'bg-red-500 text-white' :
                        p === 'medium' ? 'bg-amber-500 text-white' :
                        'bg-gray-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {p === 'high' ? '高' : p === 'medium' ? '中' : '低'}
                </button>
              ))}
            </div>
          </div>
          
          {/* 开关选项 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700">始终激活</div>
                <div className="text-xs text-gray-400">无需触发词，每次对话都会注入</div>
              </div>
              <button
                type="button"
                onClick={() => setAlwaysActive(!alwaysActive)}
                className={`w-12 h-7 rounded-full transition-colors ${
                  alwaysActive ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <div className={`w-6 h-6 rounded-full bg-white shadow transition-transform mt-0.5 ${
                  alwaysActive ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700">启用条目</div>
                <div className="text-xs text-gray-400">关闭后此条目不会生效</div>
              </div>
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={`w-12 h-7 rounded-full transition-colors ${
                  enabled ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <div className={`w-6 h-6 rounded-full bg-white shadow transition-transform mt-0.5 ${
                  enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ 生成预设内容函数 ============

function generatePresetContent(config: WorkshopConfig): string {
  const parts: string[] = []
  
  // 叙事风格指令
  const narrativeRules: string[] = []
  
  if (config.narrative.sensoryFirst) {
    narrativeRules.push('- 感官优先：描写诉诸感官（视觉、听觉、嗅觉、触觉），用具体细节替代抽象形容。')
  }
  
  if (config.narrative.characterProxy) {
    narrativeRules.push('- 角色思维代理：完全接管角色心智，用角色的逻辑思考和行动。')
  }
  
  if (config.narrative.noOOC) {
    narrativeRules.push('- 保持角色一致性：角色始终按照人设行动，不会突然性格改变。')
  }
  
  if (config.narrative.immersive) {
    narrativeRules.push('- 保持沉浸感：剧情自然结束，不添加多余的总结或说明。')
  }
  
  if (narrativeRules.length > 0) {
    parts.push(`【叙事风格】\n${narrativeRules.join('\n')}`)
  }
  
  // 自定义提示词
  if (config.narrative.customPrompt.trim()) {
    parts.push(`【自定义指令】\n${config.narrative.customPrompt.trim()}`)
  }
  
  // 输出格式
  parts.push(`【输出要求】
- 语言：简体中文（除非角色设定为其他语言）
- 风格：自然对话，根据角色性格调整语气
- 直接进入剧情`)
  
  return parts.join('\n\n')
}

// ============ 导出函数 ============

// 获取全局预设内容
export const getGlobalPresets = (): string => {
  const content = localStorage.getItem('littlephone_presets_content')
  return content || ''
}

// 获取世界书配置
export const getLorebooks = (): Lorebook[] => {
  try {
    const saved = localStorage.getItem('littlephone_workshop_config')
    if (saved) {
      const parsed = JSON.parse(saved)
      return parsed.lorebooks || []
    }
  } catch {}
  return []
}

// 获取指定世界书适用的条目（用于群聊绑定世界书）
export const getLorebookEntriesByLorebookId = (lorebookId: string, context: string): string => {
  const lorebooks = getLorebooks()
  const lorebook = lorebooks.find(l => l.id === lorebookId)
  if (!lorebook) return ''

  const entries: Array<{ entry: LorebookEntry; triggeredBy: string | null }> = []

  const lorebookEntries = Array.isArray((lorebook as any).entries) ? (lorebook as any).entries : []
  for (const entryRaw of lorebookEntries) {
    const entry = entryRaw as any as LorebookEntry
    // 关键：兼容旧格式，enabled 缺省视为 true
    if ((entry as any).enabled === false) continue
    const alwaysActive = (entry as any).alwaysActive === true
    const keywords: string[] = Array.isArray((entry as any).keywords) ? (entry as any).keywords : []
    if (alwaysActive) {
      entries.push({ entry, triggeredBy: null })
      continue
    }
    if (keywords.length > 0) {
      const contextLower = (context || '').toLowerCase()
      const matchedKeyword = keywords.find(keyword => contextLower.includes(String(keyword || '').toLowerCase()))
      if (matchedKeyword) entries.push({ entry, triggeredBy: matchedKeyword })
    }
  }

  entries.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 } as const
    const pa: 'high' | 'medium' | 'low' =
      (a.entry as any).priority === 'high' || (a.entry as any).priority === 'low' ? (a.entry as any).priority : 'medium'
    const pb: 'high' | 'medium' | 'low' =
      (b.entry as any).priority === 'high' || (b.entry as any).priority === 'low' ? (b.entry as any).priority : 'medium'
    return priorityOrder[pa] - priorityOrder[pb]
  })

  const limitedEntries = entries.slice(0, 5)
  if (limitedEntries.length === 0) return ''

  const formatEntry = (item: { entry: LorebookEntry; triggeredBy: string | null }) => {
    const e = item.entry
    const triggerHint = item.triggeredBy ? `（因提到"${item.triggeredBy}"触发，请在本次回复中体现）` : ''
    if (e.priority === 'high') return `【重要设定】${e.name}${triggerHint}\n${e.content}`
    return `[${e.name}]${triggerHint}\n${e.content}`
  }

  const triggered = limitedEntries.filter(item => item.triggeredBy !== null)
  const alwaysActive = limitedEntries.filter(item => item.triggeredBy === null)
  const highPriorityTriggered = triggered.filter(item => item.entry.priority === 'high')
  const highPriorityAlways = alwaysActive.filter(item => item.entry.priority === 'high')
  const otherTriggered = triggered.filter(item => item.entry.priority !== 'high')
  const otherAlways = alwaysActive.filter(item => item.entry.priority !== 'high')

  let result = `【群聊绑定世界书：${lorebook.name}】\n`
  if (highPriorityTriggered.length > 0) {
    result += '⚠️ 以下设定被当前对话触发，必须在本次回复中严格体现：\n'
    result += highPriorityTriggered.map(formatEntry).join('\n\n')
    result += '\n\n'
  }
  if (otherTriggered.length > 0) {
    result += '以下设定被当前对话触发，请在回复中体现：\n'
    result += otherTriggered.map(formatEntry).join('\n\n')
    result += '\n\n'
  }
  if (highPriorityAlways.length > 0) {
    result += '以下是核心设定，必须严格遵守：\n'
    result += highPriorityAlways.map(formatEntry).join('\n\n')
    result += '\n\n'
  }
  if (otherAlways.length > 0) {
    result += '补充设定：\n'
    result += otherAlways.map(formatEntry).join('\n\n')
  }

  return result.trim()
}

// 获取角色适用的世界书条目
export const getLorebookEntriesForCharacter = (characterId: string, context: string): string => {
  const lorebooks = getLorebooks()
  // 记录条目及其触发方式
  const entries: Array<{ entry: LorebookEntry; triggeredBy: string | null }> = []
  
  for (const lorebook of lorebooks) {
    const characterIds: string[] = Array.isArray((lorebook as any).characterIds) ? (lorebook as any).characterIds : []
    // 检查是否适用于该角色
    // 1. 全局世界书（isGlobal=true 或旧数据 isGlobal=undefined 且 characterIds 为空）→ 对所有角色生效
    // 2. 局部世界书（isGlobal=false 或旧数据有 characterIds）→ 必须包含该角色ID
    const isGlobal = (lorebook as any).isGlobal === true || ((lorebook as any).isGlobal === undefined && characterIds.length === 0)
    
    if (!isGlobal && !characterIds.includes(characterId)) {
      continue // 局部世界书但没有绑定该角色，跳过
    }
    
    // 全局世界书或已绑定的局部世界书，处理条目
    const lorebookEntries = Array.isArray((lorebook as any).entries) ? (lorebook as any).entries : []
    for (const entryRaw of lorebookEntries) {
      const entry = entryRaw as any as LorebookEntry
      // 关键：兼容旧格式，enabled 缺省视为 true
      if ((entry as any).enabled === false) continue
      
      // 始终激活的条目
      if ((entry as any).alwaysActive === true) {
        entries.push({ entry, triggeredBy: null })
        continue
      }
      
      // 检查触发词
      const keywords: string[] = Array.isArray((entry as any).keywords) ? (entry as any).keywords : []
      if (keywords.length > 0) {
        const contextLower = (context || '').toLowerCase()
        const matchedKeyword = keywords.find((keyword) => contextLower.includes(String(keyword || '').toLowerCase()))
        if (matchedKeyword) {
          entries.push({ entry, triggeredBy: matchedKeyword })
        }
      }
    }
  }
  
  // 按优先级排序（高优先级排前面）
  entries.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 } as const
    const pa: 'high' | 'medium' | 'low' =
      (a.entry as any).priority === 'high' || (a.entry as any).priority === 'low' ? (a.entry as any).priority : 'medium'
    const pb: 'high' | 'medium' | 'low' =
      (b.entry as any).priority === 'high' || (b.entry as any).priority === 'low' ? (b.entry as any).priority : 'medium'
    return priorityOrder[pa] - priorityOrder[pb]
  })
  
  // 限制最多注入 5 个条目
  const limitedEntries = entries.slice(0, 5)
  
  if (limitedEntries.length === 0) return ''
  
  // 根据优先级和触发方式添加标记
  const formatEntry = (item: { entry: LorebookEntry; triggeredBy: string | null }) => {
    const e = item.entry
    const triggerHint = item.triggeredBy ? `（因提到"${item.triggeredBy}"触发，请在本次回复中体现）` : ''
    
    if (e.priority === 'high') {
      return `【重要设定】${e.name}${triggerHint}\n${e.content}`
    } else {
      return `[${e.name}]${triggerHint}\n${e.content}`
    }
  }
  
  // 分离：关键词触发的条目 vs 始终激活的条目
  const triggered = limitedEntries.filter(item => item.triggeredBy !== null)
  const alwaysActive = limitedEntries.filter(item => item.triggeredBy === null)
  
  // 高优先级条目
  const highPriorityTriggered = triggered.filter(item => item.entry.priority === 'high')
  const highPriorityAlways = alwaysActive.filter(item => item.entry.priority === 'high')
  const otherTriggered = triggered.filter(item => item.entry.priority !== 'high')
  const otherAlways = alwaysActive.filter(item => item.entry.priority !== 'high')
  
  let result = '【世界书】\n'
  
  // 高优先级触发的条目放最前面，强调必须立即应用
  if (highPriorityTriggered.length > 0) {
    result += '⚠️ 以下设定被当前对话触发，必须在本次回复中严格体现：\n'
    result += highPriorityTriggered.map(formatEntry).join('\n\n')
    result += '\n\n'
  }
  
  // 其他触发的条目
  if (otherTriggered.length > 0) {
    result += '以下设定被当前对话触发，请在回复中体现：\n'
    result += otherTriggered.map(formatEntry).join('\n\n')
    result += '\n\n'
  }
  
  // 高优先级始终激活的条目
  if (highPriorityAlways.length > 0) {
    result += '以下是核心设定，必须严格遵守：\n'
    result += highPriorityAlways.map(formatEntry).join('\n\n')
    result += '\n\n'
  }
  
  // 其他始终激活的条目
  if (otherAlways.length > 0) {
    result += '补充设定：\n'
    result += otherAlways.map(formatEntry).join('\n\n')
  }
  
  return result.trim()
}

// 获取高级参数
export const getAdvancedConfig = (): { temperature: number; topP: number; maxTokens: number; frequencyPenalty: number; presencePenalty: number } => {
  try {
    const saved = localStorage.getItem('littlephone_workshop_config')
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        temperature: parsed.advanced?.temperature ?? 0.8,
        topP: parsed.advanced?.topP ?? 0.95,
        maxTokens: parsed.advanced?.maxTokens ?? 1000,
        frequencyPenalty: parsed.advanced?.frequencyPenalty ?? 0,
        presencePenalty: parsed.advanced?.presencePenalty ?? 0,
      }
    }
  } catch {}
  return { temperature: 0.8, topP: 0.95, maxTokens: 1000, frequencyPenalty: 0, presencePenalty: 0 }
}
