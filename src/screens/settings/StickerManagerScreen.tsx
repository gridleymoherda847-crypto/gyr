import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageContainer from '../../components/PageContainer'
import AppHeader from '../../components/AppHeader'
import { SettingsGroup, SettingsItem } from '../../components/SettingsGroup'
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

  const [selectedCategoryName, setSelectedCategoryName] = useState<string>(stickerCategories[0]?.name || '')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [importPackText, setImportPackText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const imgInputRef = useRef<HTMLInputElement>(null)
  const packInputRef = useRef<HTMLInputElement>(null)

  const categories = useMemo(() => {
    const names = stickerCategories.map(c => c.name)
    return names.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [stickerCategories])

  const selectedCategoryStickers = useMemo(() => {
    if (!selectedCategoryName) return []
    return stickers
      .filter(s => s.category === selectedCategoryName)
      .sort((a, b) => (a.keyword || '').localeCompare(b.keyword || '', 'zh-CN'))
  }, [stickers, selectedCategoryName])

  const targetLabel = useMemo(() => {
    if (targetCharacterId === 'all') return '所有角色'
    const c = characters.find(x => x.id === targetCharacterId)
    return c ? `角色：${c.name}` : '指定角色'
  }, [characters, targetCharacterId])

  const exportPack = (): StickerPackV1 | null => {
    const cat = safeName(selectedCategoryName)
    if (!cat) return null
    const list = selectedCategoryStickers.map(s => ({
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

  const importPack = async (raw: string) => {
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
    const catName = safeName(pack.categoryName)
    if (!catName) return

    // 确保分类存在
    if (!stickerCategories.some(c => c.name === catName)) {
      addStickerCategory(catName)
    }
    setSelectedCategoryName(catName)

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

    setToast(`已导入：${catName}（${items.length}张）→ ${targetId === 'all' ? '所有角色' : '该角色'}`)
    window.setTimeout(() => setToast(null), 2200)
  }

  const handleBatchImportImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const cat = safeName(selectedCategoryName)
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
      setToast(`已导入 ${list.length} 张 → ${targetLabel}`)
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
      setSelectedCategoryName(name)
      setNewCategoryName('')
      return
    }
    addStickerCategory(name)
    setSelectedCategoryName(name)
    setNewCategoryName('')
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="表情包管理" onBack={() => navigate('/apps/settings')} />

        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4">
          <SettingsGroup title="目标">
            <SettingsItem label="导入到" value={targetLabel} showArrow={false} />
            {targetCharacterId !== 'all' && (
              <div className="px-1 pb-2 text-[11px] text-gray-500">
                这是从聊天设置跳转过来的：导入会写入该角色专用表情包。
              </div>
            )}
          </SettingsGroup>

          <SettingsGroup title="分类">
            <div className="px-1 pb-2 text-[11px] text-gray-500">
              先选一个分类，再批量导入图片；也可以导出/分享整个分类。
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.length === 0 ? (
                <div className="text-sm text-gray-400">暂无分类</div>
              ) : (
                categories.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSelectedCategoryName(name)}
                    className={`px-3 py-1.5 rounded-full text-xs border ${
                      selectedCategoryName === name ? 'bg-[#07C160] text-white border-[#07C160]' : 'bg-white/70 text-gray-700 border-black/10'
                    }`}
                  >
                    {name}
                  </button>
                ))
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="新建分类名（如：开心）"
                className="flex-1 px-3 py-2 rounded-xl bg-white/70 border border-black/10 outline-none text-sm text-[#111]"
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
          </SettingsGroup>

          <SettingsGroup title="批量导入">
            <SettingsItem
              label="批量导入图片"
              value={selectedCategoryName ? `分类：${selectedCategoryName}` : '请先选分类'}
              onClick={() => imgInputRef.current?.click()}
              showArrow={false}
            />
            <input
              ref={imgInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleBatchImportImages(e.target.files)
                e.currentTarget.value = ''
              }}
            />

            <SettingsItem
              label="导入分类包（JSON）"
              value="粘贴或选择文件"
              onClick={() => packInputRef.current?.click()}
              showArrow={false}
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
                await importPack(text)
                e.currentTarget.value = ''
              }}
            />

            <textarea
              value={importPackText}
              onChange={(e) => setImportPackText(e.target.value)}
              placeholder="把别人分享给你的分类包 JSON 粘贴到这里，然后点“导入”"
              className="mt-2 w-full h-32 px-3 py-2 rounded-xl bg-white/70 border border-black/10 outline-none text-xs text-[#111] resize-none"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => importPack(importPackText)}
                className="flex-1 px-4 py-2 rounded-xl bg-[#07C160] text-white text-sm font-medium disabled:opacity-50"
                disabled={!importPackText.trim() || busy}
              >
                导入
              </button>
              <button
                type="button"
                onClick={() => setImportPackText('')}
                className="px-4 py-2 rounded-xl bg-white/70 border border-black/10 text-sm text-gray-700"
              >
                清空
              </button>
            </div>
          </SettingsGroup>

          <SettingsGroup title="导出分享">
            <SettingsItem
              label="导出当前分类包"
              value={selectedCategoryName ? `${selectedCategoryStickers.length} 张` : '未选择分类'}
              showArrow={false}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const pack = exportPack()
                  if (!pack) return
                  const text = JSON.stringify(pack)
                  copyToClipboard(text)
                }}
                className="flex-1 px-4 py-2 rounded-xl bg-white/70 border border-black/10 text-sm text-gray-700"
                disabled={!selectedCategoryName}
              >
                复制JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  const pack = exportPack()
                  if (!pack) return
                  const filename = `stickers_${safeName(pack.categoryName) || 'category'}_${Date.now()}.json`
                  downloadText(filename, JSON.stringify(pack, null, 2))
                  setToast('已下载分类包')
                  window.setTimeout(() => setToast(null), 1800)
                }}
                className="flex-1 px-4 py-2 rounded-xl bg-[#111]/90 text-white text-sm font-medium disabled:opacity-50"
                disabled={!selectedCategoryName}
              >
                下载JSON
              </button>
            </div>
          </SettingsGroup>

          <SettingsGroup title="当前分类内容">
            <div className="px-1 pb-2 text-[11px] text-gray-500">
              说明：当前实现是“关键词触发表情”。你发消息包含关键字，就会被渲染为表情图片。
            </div>
            {selectedCategoryName ? (
              selectedCategoryStickers.length === 0 ? (
                <div className="text-sm text-gray-400">这个分类还没有表情包</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {selectedCategoryStickers.slice(0, 60).map(s => (
                    <div key={s.id} className="rounded-xl bg-white/70 border border-black/10 p-2">
                      <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-100">
                        <img src={s.imageUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="mt-1 text-[11px] text-gray-700 truncate" title={s.keyword}>
                        {s.keyword}
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
              )
            ) : (
              <div className="text-sm text-gray-400">请先选择一个分类</div>
            )}
          </SettingsGroup>
        </div>

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

