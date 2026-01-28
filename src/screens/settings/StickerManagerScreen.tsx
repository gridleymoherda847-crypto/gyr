import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageContainer from '../../components/PageContainer'
import AppHeader from '../../components/AppHeader'
import { useWeChat } from '../../context/WeChatContext'
import WeChatDialog from '../wechat/components/WeChatDialog'

type StickerPackV1 = {
  schemaVersion: 1
  categoryName: string
  exportedAt: number
  stickers: { keyword: string; imageUrl: string; description?: string }[]
}

// 支持更多宽松的 JSON 格式
type LooseStickerPack = {
  schemaVersion?: number
  categoryName?: string
  category?: string
  name?: string
  exportedAt?: number
  stickers?: { keyword?: string; name?: string; imageUrl?: string; url?: string; image?: string; description?: string; desc?: string }[]
  images?: { keyword?: string; name?: string; imageUrl?: string; url?: string; image?: string; description?: string; desc?: string }[]
  data?: { keyword?: string; name?: string; imageUrl?: string; url?: string; image?: string; description?: string; desc?: string }[]
}

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve((event.target?.result as string) || '')
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })

const safeName = (name: string) => (name || '').trim().replace(/\s+/g, ' ').slice(0, 30)

const filenameToKeyword = (fileName: string) => {
  const base = (fileName || '').replace(/\.[^/.]+$/, '')
  const kw = base.trim().replace(/\s+/g, ' ').slice(0, 20)
  return kw || '表情'
}

export default function StickerManagerScreen() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const targetCharacterId = searchParams.get('target') || 'all'

  const {
    characters,
    stickers,
    stickerCategories,
    addSticker,
    removeSticker,
    updateSticker,
    addStickerCategory,
  } = useWeChat()

  const [newCategoryName, setNewCategoryName] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [importingCategory, setImportingCategory] = useState<string | null>(null)
  const [importPackText, setImportPackText] = useState('')
  const [postImportGuideOpen, setPostImportGuideOpen] = useState(false)
  const [postImportGuideCategory, setPostImportGuideCategory] = useState<string>('')

  const imgInputRef = useRef<HTMLInputElement>(null)
  const packInputRef = useRef<HTMLInputElement>(null)
  const quickImportRef = useRef<HTMLInputElement>(null)
  const pendingImportCategoryRef = useRef<string>('')
  const [quickImportCategory, setQuickImportCategory] = useState('')
  const [showQuickImportModal, setShowQuickImportModal] = useState(false)

  const categories = useMemo(() => {
    const names = stickerCategories.map(c => c.name)
    return names.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [stickerCategories])

  const stickersByCategory = useMemo(() => {
    const map: Record<string, typeof stickers> = {}
    for (const s of stickers) {
      const cat = (s.category || '').trim()
      if (!cat) continue
      if (!map[cat]) map[cat] = []
      map[cat].push(s)
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.keyword || '').localeCompare(b.keyword || '', 'zh-CN'))
    }
    return map
  }, [stickers])

  const targetLabel = useMemo(() => {
    if (targetCharacterId === 'all') return '公共库'
    const c = characters.find(x => x.id === targetCharacterId)
    return c ? `角色：${c.name}` : '指定角色'
  }, [characters, targetCharacterId])

  const exportPack = (categoryName: string): StickerPackV1 | null => {
    const cat = safeName(categoryName)
    if (!cat) return null
    const list = (stickersByCategory[cat] || []).map(s => ({
      keyword: s.keyword,
      imageUrl: s.imageUrl,
      description: s.description,
    })).filter(x => !!x.keyword && !!x.imageUrl)
    return { schemaVersion: 1, categoryName: cat, exportedAt: Date.now(), stickers: list }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setToast('已复制到剪贴板')
      window.setTimeout(() => setToast(null), 1600)
    } catch {
      setToast('复制失败：请手动复制')
      window.setTimeout(() => setToast(null), 2000)
    }
  }

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const importPack = async (raw: string, forcedCategory?: string) => {
    const txt = (raw || '').trim()
    if (!txt) return
    
    let pack: LooseStickerPack
    try {
      pack = JSON.parse(txt)
    } catch (e) {
      setToast('导入失败：不是有效的 JSON 格式。请检查文件内容。')
      window.setTimeout(() => setToast(null), 3000)
      return
    }
    
    if (!pack || typeof pack !== 'object') {
      setToast('导入失败：JSON 内容为空或格式错误')
      window.setTimeout(() => setToast(null), 2500)
      return
    }
    
    // 尝试从多种字段名获取表情数组
    const rawStickers = pack.stickers || pack.images || pack.data || []
    if (!Array.isArray(rawStickers) || rawStickers.length === 0) {
      setToast('导入失败：未找到表情数据。JSON 需要包含 stickers/images/data 数组。')
      window.setTimeout(() => setToast(null), 3000)
      return
    }
    
    // 尝试从多种字段名获取分类名
    const packCatName = pack.categoryName || pack.category || pack.name || ''
    const catName = safeName(forcedCategory || packCatName) || '导入表情'
    
    // 确保分类存在
    if (!stickerCategories.some(c => c.name === catName)) {
      addStickerCategory(catName)
    }

    // 导入：写入到目标（默认 all，或从 query 传入角色）
    const targetId = targetCharacterId
    
    // 支持多种字段名
    const items = rawStickers
      .map(s => {
        const keyword = safeName(s.keyword || s.name || '') || '表情'
        const imageUrl = s.imageUrl || s.url || s.image || ''
        const description = s.description || s.desc || ''
        return { keyword, imageUrl, description }
      })
      .filter(s => {
        // 支持 base64 和网络 URL
        return s.imageUrl.startsWith('data:image/') || 
               s.imageUrl.startsWith('http://') || 
               s.imageUrl.startsWith('https://')
      })
      .slice(0, 300)

    if (items.length === 0) {
      setToast('导入失败：没有找到有效的图片数据（需要 base64 或 http 链接）')
      window.setTimeout(() => setToast(null), 3000)
      return
    }

    for (const s of items) {
      addSticker({
        characterId: targetId,
        keyword: s.keyword,
        imageUrl: s.imageUrl,
        category: catName,
        description: s.description,
      })
    }

    setToast(`已导入：${catName}（${items.length}张）`)
    window.setTimeout(() => setToast(null), 2200)
    setPostImportGuideCategory(catName)
    setPostImportGuideOpen(true)
  }

  const handleBatchImportImages = async (categoryName: string, files: FileList | null) => {
    if (!files || files.length === 0) return
    const cat = safeName(categoryName)
    if (!cat) {
      setToast('请先选择/创建一个分类')
      window.setTimeout(() => setToast(null), 2000)
      return
    }
    setBusy(true)
    try {
      const list = Array.from(files).slice(0, 120)
      const imgs = await Promise.all(list.map(fileToBase64))
      const targetId = targetCharacterId
      for (let i = 0; i < list.length; i++) {
        addSticker({
          characterId: targetId,
          keyword: filenameToKeyword(list[i].name),
          imageUrl: imgs[i],
          category: cat,
        })
      }
      setToast(`已导入 ${list.length} 张到「${cat}」`)
      window.setTimeout(() => setToast(null), 2000)
      setPostImportGuideCategory(cat)
      setPostImportGuideOpen(true)
    } catch (e: any) {
      setToast(e?.message || '导入失败')
      window.setTimeout(() => setToast(null), 2200)
    } finally {
      setBusy(false)
    }
  }

  const onCreateCategory = () => {
    const name = safeName(newCategoryName)
    if (!name) return
    if (stickerCategories.some(c => c.name === name)) {
      setExpanded(prev => ({ ...prev, [name]: true }))
      setNewCategoryName('')
      return
    }
    addStickerCategory(name)
    setExpanded(prev => ({ ...prev, [name]: true }))
    setNewCategoryName('')
  }
  
  // 快速导入：支持图片和 JSON 文件混合
  const handleQuickImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    
    const cat = safeName(quickImportCategory) || '快速导入'
    
    // 确保分类存在
    if (!stickerCategories.some(c => c.name === cat)) {
      addStickerCategory(cat)
    }
    
    setBusy(true)
    setShowQuickImportModal(false)
    
    const fileList = Array.from(files)
    const imageFiles: File[] = []
    const jsonFiles: File[] = []
    
    // 分类文件
    for (const f of fileList) {
      const ext = f.name.toLowerCase().split('.').pop() || ''
      const type = f.type.toLowerCase()
      
      if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
        imageFiles.push(f)
      } else if (type === 'application/json' || ext === 'json') {
        jsonFiles.push(f)
      }
    }
    
    let importedCount = 0
    const targetId = targetCharacterId
    
    try {
      // 处理图片文件
      if (imageFiles.length > 0) {
        const imgs = await Promise.all(imageFiles.slice(0, 200).map(fileToBase64))
        for (let i = 0; i < imageFiles.length && i < 200; i++) {
          addSticker({
            characterId: targetId,
            keyword: filenameToKeyword(imageFiles[i].name),
            imageUrl: imgs[i],
            category: cat,
          })
          importedCount++
        }
      }
      
      // 处理 JSON 文件
      for (const jf of jsonFiles.slice(0, 10)) {
        try {
          const text = await jf.text()
          const pack: LooseStickerPack = JSON.parse(text)
          const rawStickers = pack.stickers || pack.images || pack.data || []
          
          if (Array.isArray(rawStickers)) {
            const items = rawStickers
              .map(s => ({
                keyword: safeName(s.keyword || s.name || '') || '表情',
                imageUrl: s.imageUrl || s.url || s.image || '',
                description: s.description || s.desc || '',
              }))
              .filter(s => s.imageUrl.startsWith('data:image/') || s.imageUrl.startsWith('http'))
              .slice(0, 300)
            
            for (const s of items) {
              addSticker({
                characterId: targetId,
                keyword: s.keyword,
                imageUrl: s.imageUrl,
                category: cat,
                description: s.description,
              })
              importedCount++
            }
          }
        } catch {
          // 单个 JSON 文件解析失败，继续处理其他
        }
      }
      
      if (importedCount > 0) {
        setToast(`已导入 ${importedCount} 张到「${cat}」`)
        setPostImportGuideCategory(cat)
        setPostImportGuideOpen(true)
      } else {
        setToast('没有找到可导入的内容')
      }
    } catch (e: any) {
      setToast(e?.message || '导入失败')
    } finally {
      setBusy(false)
      window.setTimeout(() => setToast(null), 2500)
    }
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="表情包管理" onBack={() => navigate('/apps/settings')} />

        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4">
          {targetCharacterId !== 'all' && (
            <div className="mb-3 rounded-2xl border border-white/35 bg-white/70 px-3 py-2 text-[12px] text-gray-700">
              当前从聊天设置跳转：导入会写入 <span className="font-medium">{targetLabel}</span>
            </div>
          )}

          {/* 快速导入入口 */}
          <div className="rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-purple-700">批量导入</div>
                <div className="text-[11px] text-purple-500 mt-0.5">支持图片 + JSON 文件混合导入</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuickImportCategory('')
                  setShowQuickImportModal(true)
                }}
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-purple-500 text-white text-sm font-medium disabled:opacity-50"
              >
                开始导入
              </button>
            </div>
          </div>
          
          {/* 新建分类 */}
          <div className="rounded-2xl border border-white/35 bg-white/70 p-3 mt-3">
            <div className="text-sm font-semibold text-[#111]">分类</div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="新建分类名（如：开心）"
                className="flex-1 px-3 py-2 rounded-xl bg-white/80 border border-black/10 outline-none text-sm text-[#111]"
              />
              <button
                type="button"
                onClick={onCreateCategory}
                className="px-4 py-2 rounded-xl bg-[#07C160] text-white text-sm font-medium disabled:opacity-50"
                disabled={!newCategoryName.trim()}
              >
                新建
              </button>
            </div>
          </div>

          {/* 分类列表：折叠/展开 */}
          <div className="mt-3 space-y-2">
            {categories.length === 0 ? (
              <div className="text-sm text-gray-400 px-1">暂无分类，先新建一个。</div>
            ) : (
              categories.map((cat) => {
                const isOpen = !!expanded[cat]
                const list = stickersByCategory[cat] || []
                return (
                  <div key={cat} className="rounded-2xl border border-white/35 bg-white/70 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }))}
                      className="w-full px-3 py-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-[#111] truncate">{cat}</span>
                        <span className="text-[11px] text-gray-500">{list.length} 张</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500">{isOpen ? '收起' : '展开'}</span>
                        <svg className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3">
                        <div className="flex flex-wrap gap-2 mb-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              pendingImportCategoryRef.current = cat
                              imgInputRef.current?.click()
                            }}
                            className="px-3 py-1.5 rounded-full bg-[#07C160] text-white text-xs font-medium disabled:opacity-50"
                          >
                            添加图片
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const pack = exportPack(cat)
                              if (!pack) return
                              const filename = `stickers_${safeName(pack.categoryName) || 'category'}_${Date.now()}.json`
                              downloadText(filename, JSON.stringify(pack, null, 2))
                              setToast('已下载分类包')
                              window.setTimeout(() => setToast(null), 1800)
                            }}
                            className="px-3 py-1.5 rounded-full bg-white/80 border border-black/10 text-xs text-gray-700"
                          >
                            导出
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              pendingImportCategoryRef.current = cat
                              setImportingCategory(cat)
                              setImportPackText('')
                            }}
                            className="px-3 py-1.5 rounded-full bg-white/80 border border-black/10 text-xs text-gray-700"
                          >
                            导入
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const pack = exportPack(cat)
                              if (!pack) return
                              copyToClipboard(JSON.stringify(pack))
                            }}
                            className="px-3 py-1.5 rounded-full bg-white/80 border border-black/10 text-xs text-gray-700"
                          >
                            复制包
                          </button>
                        </div>

                        {list.length === 0 ? (
                          <div className="text-sm text-gray-400">这个分类还没有表情包</div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {list.slice(0, 60).map(s => (
                              <div key={s.id} className="rounded-xl bg-white/80 border border-black/10 p-2">
                                <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-100">
                                  <img src={s.imageUrl} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="mt-1 text-[11px] text-gray-600 truncate" title={s.keyword}>
                                  {s.keyword || '表情'}
                                </div>
                                <input
                                  type="text"
                                  value={s.description || ''}
                                  onChange={(e) => updateSticker(s.id, { description: e.target.value })}
                                  placeholder="备注（如：你真可爱）"
                                  className="mt-1 w-full px-1.5 py-1 rounded bg-gray-50 border border-gray-200 outline-none text-[10px] text-gray-600"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeSticker(s.id)}
                                  className="mt-1 w-full text-[11px] text-red-500"
                                >
                                  删除
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 隐藏 input：按分类导入 */}
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const cat = pendingImportCategoryRef.current
            handleBatchImportImages(cat, e.target.files)
            e.currentTarget.value = ''
          }}
        />
        <input
          ref={packInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const text = await f.text()
            setImportPackText(text)
            const cat = pendingImportCategoryRef.current
            await importPack(text, cat)
            e.currentTarget.value = ''
          }}
        />
        {/* 快速导入 input */}
        <input
          ref={quickImportRef}
          type="file"
          accept="image/*,.json,application/json"
          multiple
          className="hidden"
          onChange={(e) => {
            handleQuickImport(e.target.files)
            e.currentTarget.value = ''
          }}
        />

        {/* 快速导入弹窗 */}
        {showQuickImportModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div className="absolute inset-0 bg-black/35" onClick={() => setShowQuickImportModal(false)} role="presentation" />
            <div className="relative w-full max-w-[340px] rounded-[22px] border border-white/35 bg-white/90 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
              <div className="text-[15px] font-semibold text-[#111] text-center">批量导入表情包</div>
              <div className="mt-3 text-[12px] text-gray-600">
                <div className="p-3 bg-purple-50 rounded-xl space-y-1.5">
                  <div className="font-medium text-purple-700">支持的文件格式：</div>
                  <div className="text-purple-600">• 图片文件（PNG、JPG、GIF、WebP）</div>
                  <div className="text-purple-600">• JSON 文件（表情包数据）</div>
                  <div className="text-[11px] text-purple-500 mt-2">可以一次选择多个文件，图片和 JSON 混合都行</div>
                </div>
              </div>
              <div className="mt-3">
                <div className="text-[12px] text-gray-600 mb-1.5">导入到分类：</div>
                <div className="flex gap-2">
                  <input
                    value={quickImportCategory}
                    onChange={(e) => setQuickImportCategory(e.target.value)}
                    placeholder="输入分类名（如：沙雕表情）"
                    className="flex-1 px-3 py-2 rounded-xl bg-white/80 border border-black/10 outline-none text-sm text-[#111]"
                  />
                </div>
                {categories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {categories.slice(0, 6).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setQuickImportCategory(cat)}
                        className={`px-2 py-1 rounded-lg text-[11px] ${
                          quickImportCategory === cat
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickImportModal(false)}
                  className="flex-1 rounded-full border border-black/10 bg-white/70 px-4 py-2.5 text-[13px] font-medium text-[#333]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => quickImportRef.current?.click()}
                  className="flex-1 rounded-full px-4 py-2.5 text-[13px] font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
                >
                  选择文件
                </button>
              </div>
              
              {/* JSON 格式说明 */}
              <div className="mt-4 p-3 bg-gray-50 rounded-xl">
                <div className="text-[11px] font-medium text-gray-700 mb-1">JSON 格式说明：</div>
                <div className="text-[10px] text-gray-500 font-mono whitespace-pre-wrap">{`{
  "categoryName": "分类名",
  "stickers": [
    { "keyword": "关键词", "imageUrl": "图片base64或URL" }
  ]
}`}</div>
                <div className="text-[10px] text-gray-400 mt-1">* 也支持 images/data 字段名，以及 url/image 等</div>
              </div>
            </div>
          </div>
        )}
        
        {/* 导入弹窗（按分类） */}
        {importingCategory && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-6">
            <div className="absolute inset-0 bg-black/35" onClick={() => setImportingCategory(null)} role="presentation" />
            <div className="relative w-full max-w-[340px] rounded-[22px] border border-white/35 bg-white/85 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
              <div className="text-[15px] font-semibold text-[#111] text-center">导入到「{importingCategory}」</div>
              <div className="mt-2 text-[12px] text-gray-600 text-center">粘贴 JSON 或选择文件导入</div>
              <textarea
                value={importPackText}
                onChange={(e) => setImportPackText(e.target.value)}
                placeholder="粘贴分类包 JSON…"
                className="mt-3 w-full h-32 px-3 py-2 rounded-xl bg-white/80 border border-black/10 outline-none text-xs text-[#111] resize-none"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    pendingImportCategoryRef.current = importingCategory
                    packInputRef.current?.click()
                  }}
                  className="flex-1 rounded-full border border-black/10 bg-white/70 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
                >
                  选择文件
                </button>
                <button
                  type="button"
                  disabled={!importPackText.trim() || busy}
                  onClick={async () => {
                    await importPack(importPackText, importingCategory)
                    setImportingCategory(null)
                  }}
                  className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #34d399 0%, #07C160 100%)' }}
                >
                  导入
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="pointer-events-none absolute bottom-16 left-0 right-0 flex justify-center">
            <div className="px-3 py-2 rounded-full bg-black/70 text-white text-xs">
              {toast}
            </div>
          </div>
        )}

        <WeChatDialog
          open={postImportGuideOpen}
          title="已成功导入表情包"
          message={
            targetCharacterId === 'all'
              ? `已导入到「公共库 / ${postImportGuideCategory || '分类'}」。\n想让某个角色使用：去该角色「消息设置」→「表情包管理」里点“添加到本角色”。`
              : `已导入到「${targetLabel} / ${postImportGuideCategory || '分类'}」。\n想继续调整：去该角色「消息设置」→「表情包管理」。`
          }
          confirmText="去设置"
          cancelText="稍后自己去设置"
          onCancel={() => setPostImportGuideOpen(false)}
          onConfirm={() => {
            setPostImportGuideOpen(false)
            if (targetCharacterId !== 'all') {
              navigate(`/apps/wechat/chat/${encodeURIComponent(targetCharacterId)}/settings?panel=stickers`)
              return
            }
            navigate('/apps/wechat')
          }}
        />
      </div>
    </PageContainer>
  )
}

