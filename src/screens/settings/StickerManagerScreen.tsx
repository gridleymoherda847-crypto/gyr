import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageContainer from '../../components/PageContainer'
import AppHeader from '../../components/AppHeader'
import { useWeChat } from '../../context/WeChatContext'

type StickerPackV1 = {
  schemaVersion: 1
  categoryName: string
  exportedAt: number
  stickers: { keyword: string; imageUrl: string }[]
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
    addStickerCategory,
  } = useWeChat()

  const [newCategoryName, setNewCategoryName] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [importingCategory, setImportingCategory] = useState<string | null>(null)
  const [importPackText, setImportPackText] = useState('')

  const imgInputRef = useRef<HTMLInputElement>(null)
  const packInputRef = useRef<HTMLInputElement>(null)
  const pendingImportCategoryRef = useRef<string>('')

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
    if (targetCharacterId === 'all') return '所有角色'
    const c = characters.find(x => x.id === targetCharacterId)
    return c ? `角色：${c.name}` : '指定角色'
  }, [characters, targetCharacterId])

  const exportPack = (categoryName: string): StickerPackV1 | null => {
    const cat = safeName(categoryName)
    if (!cat) return null
    const list = (stickersByCategory[cat] || []).map(s => ({
      keyword: s.keyword,
      imageUrl: s.imageUrl,
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
    let pack: StickerPackV1
    try {
      pack = JSON.parse(txt)
    } catch {
      setToast('导入失败：不是有效 JSON')
      window.setTimeout(() => setToast(null), 2200)
      return
    }
    if (!pack || pack.schemaVersion !== 1 || !pack.categoryName || !Array.isArray(pack.stickers)) {
      setToast('导入失败：包格式不正确')
      window.setTimeout(() => setToast(null), 2200)
      return
    }
    const catName = safeName(forcedCategory || pack.categoryName)
    if (!catName) return

    // 确保分类存在
    if (!stickerCategories.some(c => c.name === catName)) {
      addStickerCategory(catName)
    }

    // 导入：写入到目标（默认 all，或从 query 传入角色）
    const targetId = targetCharacterId
    const items = pack.stickers
      .filter(s => typeof s.keyword === 'string' && typeof s.imageUrl === 'string')
      .map(s => ({ keyword: safeName(s.keyword) || '表情', imageUrl: s.imageUrl }))
      .filter(s => s.imageUrl.startsWith('data:image/'))
      .slice(0, 300)

    for (const s of items) {
      addSticker({
        characterId: targetId,
        keyword: s.keyword,
        imageUrl: s.imageUrl,
        category: catName,
      })
    }

    setToast(`已导入：${catName}（${items.length}张）`)
    window.setTimeout(() => setToast(null), 2200)
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

          {/* 新建分类 */}
          <div className="rounded-2xl border border-white/35 bg-white/70 p-3">
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
      </div>
    </PageContainer>
  )
}

