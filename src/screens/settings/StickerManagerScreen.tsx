import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageContainer from '../../components/PageContainer'
import AppHeader from '../../components/AppHeader'
import { useWeChat } from '../../context/WeChatContext'
import WeChatDialog from '../wechat/components/WeChatDialog'
import { saveTextAsFile } from '../../utils/saveFile'
import mammoth from 'mammoth'

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

const fileToBase64 = async (file: File): Promise<string> => {
  // 压缩表情包图片（最大 256px，质量 0.8）
  const maxSide = 256
  const quality = 0.8

  const originalDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => resolve((event.target?.result as string) || '')
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })

  // 尝试压缩
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image_load_error'))
      el.src = originalDataUrl
    })

    const w = img.naturalWidth || img.width || 0
    const h = img.naturalHeight || img.height || 0
    if (!w || !h) return originalDataUrl

    const scale = Math.min(1, maxSide / Math.max(w, h))
    const tw = Math.max(1, Math.round(w * scale))
    const th = Math.max(1, Math.round(h * scale))

    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) return originalDataUrl

    ctx.drawImage(img, 0, 0, tw, th)
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    return originalDataUrl
  }
}

const safeName = (name: string) => (name || '').trim().replace(/\s+/g, ' ').slice(0, 30)
const UNCATEGORIZED_NAME = '未分类'

const filenameToKeyword = (fileName: string) => {
  const base = (fileName || '').replace(/\.[^/.]+$/, '')
  const kw = base.trim().replace(/\s+/g, ' ').slice(0, 20)
  return kw || '表情'
}

const extractStickerUrlEntries = (raw: string) => {
  const text = String(raw || '').trim()
  const out: { keyword: string; url: string }[] = []
  if (!text) return out

  // 备注：链接（支持中文/英文冒号），允许中间有空格；支持“整段粘贴没换行”的情况
  const usedRanges: Array<[number, number]> = []
  const pairRegex = /([^:\n\r]{1,80}?)[：:]\s*(https?:\/\/[^\s"'<>]+)/gi
  for (const m of text.matchAll(pairRegex)) {
    const idx = m.index ?? -1
    if (idx < 0) continue
    const keyword = safeName(m[1]) || '表情'
    const url = String(m[2] || '').trim()
    if (!url) continue
    out.push({ keyword, url })
    usedRanges.push([idx, idx + m[0].length])
  }

  // 纯链接：补充解析（避免用户只粘贴一堆 url，或“备注：链接”识别漏掉）
  const isInsideUsedRange = (start: number) => usedRanges.some(([a, b]) => start >= a && start < b)
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi
  for (const m of text.matchAll(urlRegex)) {
    const idx = m.index ?? -1
    if (idx < 0) continue
    if (isInsideUsedRange(idx)) continue
    const url = String(m[0] || '').trim()
    if (!url) continue

    let keyword = '表情'
    try {
      const urlObj = new URL(url)
      const filename = urlObj.pathname.split('/').pop() || ''
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')
      if (nameWithoutExt) keyword = safeName(nameWithoutExt) || '表情'
    } catch {
      // ignore
    }
    out.push({ keyword, url })
  }

  return out
}

const normalizeStickerUrlImportText = (raw: string) => {
  const entries = extractStickerUrlEntries(raw)
  if (entries.length === 0) return String(raw || '')
  // 强制整理成“每行一个：备注：链接”
  return entries.map(e => `${e.keyword}：${e.url}`).join('\n')
}

const docxToText = async (file: File): Promise<string> => {
  const buf = await file.arrayBuffer()
  const res = await mammoth.extractRawText({ arrayBuffer: buf })
  return String(res?.value || '').trim()
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
    removeStickerCategory,
    renameStickerCategory,
  } = useWeChat()

  // 新模型：表情包永远写入“总表情库”（characterId='all'），如果是从某个角色跳转来的导入，则仅增加绑定关系
  const addStickerToLibrary = useCallback((sticker: Omit<any, 'id'>) => {
    const bound = targetCharacterId !== 'all' ? [targetCharacterId] : []
    const incoming = Array.isArray((sticker as any).boundCharacterIds) ? (sticker as any).boundCharacterIds : []
    const mergedBound = Array.from(new Set([...incoming, ...bound].map(x => String(x || '').trim()).filter(Boolean)))
    addSticker({
      ...(sticker as any),
      characterId: 'all',
      boundCharacterIds: mergedBound.length > 0 ? mergedBound : undefined,
    })
  }, [addSticker, targetCharacterId])

  const [newCategoryName, setNewCategoryName] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [importingCategory, setImportingCategory] = useState<string | null>(null)
  const [importPackText, setImportPackText] = useState('')
  const [postImportGuideOpen, setPostImportGuideOpen] = useState(false)
  const [postImportGuideCategory, setPostImportGuideCategory] = useState<string>('')
  const [dialog, setDialog] = useState<{
    open: boolean
    title?: string
    message?: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
    onConfirm?: () => void
  }>({ open: false })
  const [renamingCatId, setRenamingCatId] = useState<string | null>(null)
  const [renameCatValue, setRenameCatValue] = useState('')

  const imgInputRef = useRef<HTMLInputElement>(null)
  const packInputRef = useRef<HTMLInputElement>(null)
  const quickImportRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingImportCategoryRef = useRef<string>('')
  const [quickImportCategory, setQuickImportCategory] = useState('')
  const [showQuickImportModal, setShowQuickImportModal] = useState(false)
  const [showSourcePicker, setShowSourcePicker] = useState<'quick' | 'category' | null>(null)
  const [urlImportInput, setUrlImportInput] = useState('')
  const [urlImportLoading, setUrlImportLoading] = useState(false)

  const hasUncategorized = useMemo(() => {
    return (stickers || []).some((s: any) => !String(s?.category || '').trim())
  }, [stickers])

  const categories = useMemo(() => {
    const base = [...stickerCategories].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    // 把“未分类”的表情也作为一个分类显示（即使用户没手动创建过这个分类）
    if (hasUncategorized && !base.some(c => c.name === UNCATEGORIZED_NAME)) {
      base.unshift({ id: '__uncategorized__', name: UNCATEGORIZED_NAME } as any)
    }
    return base
  }, [stickerCategories, hasUncategorized])

  const stickersByCategory = useMemo(() => {
    const map: Record<string, typeof stickers> = {}
    for (const s of stickers) {
      const cat = String((s as any)?.category || '').trim() || UNCATEGORIZED_NAME
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
    saveTextAsFile(content, filename, 'application/json;charset=utf-8', {
      title: '表情包导出',
      hintText: '导出表情包包（iOS 可选择“存储到文件”）',
    })
      .then((method) => {
        if (method !== 'download') {
          setToast('iOS 浏览器可能不支持直接下载：请在分享菜单选择“存储到文件”。')
          window.setTimeout(() => setToast(null), 2200)
        }
      })
      .catch(() => {})
  }

  // 批量从多个URL导入（支持 "备注：链接" 或 "备注:链接" 格式）
  const importMultipleUrls = async (urls: string, categoryName: string) => {
    const parsed = extractStickerUrlEntries(urls)
    
    if (parsed.length === 0) {
      setToast('未找到有效的图片链接')
      window.setTimeout(() => setToast(null), 2000)
      return
    }
    
    setUrlImportLoading(true)
    const cat = safeName(categoryName) || '链接导入'
    
    // 确保分类存在
    if (!stickerCategories.some(c => c.name === cat)) {
      addStickerCategory(cat)
    }
    
    let count = 0
    
    for (const { keyword, url } of parsed.slice(0, 500)) { // 限制最多500张
      addStickerToLibrary({
        keyword,
        imageUrl: url,
        category: cat,
        description: keyword, // 备注也存到 description
      })
      count++
    }
    
    setUrlImportLoading(false)
    setUrlImportInput('')
    setShowQuickImportModal(false)
    
    if (count > 0) {
      setToast(`已导入 ${count} 张到「${cat}」`)
      setPostImportGuideCategory(cat)
      setPostImportGuideOpen(true)
    }
    window.setTimeout(() => setToast(null), 2200)
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
      addStickerToLibrary({
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
      for (let i = 0; i < list.length; i++) {
        addStickerToLibrary({
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
  
  // 快速导入：支持图片、JSON、文本、DOCX 文件混合
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
    const textFiles: File[] = []
    const docxFiles: File[] = []
    
    // 分类文件
    for (const f of fileList) {
      const ext = f.name.toLowerCase().split('.').pop() || ''
      const type = f.type.toLowerCase()
      
      if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
        imageFiles.push(f)
      } else if (type === 'application/json' || ext === 'json') {
        jsonFiles.push(f)
      } else if (type.startsWith('text/') || ['txt', 'md', 'csv'].includes(ext)) {
        textFiles.push(f)
      } else if (
        ext === 'docx' ||
        type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        docxFiles.push(f)
      }
    }
    
    let importedCount = 0
    
    try {
      // 处理图片文件
      if (imageFiles.length > 0) {
        const imgs = await Promise.all(imageFiles.slice(0, 200).map(fileToBase64))
        for (let i = 0; i < imageFiles.length && i < 200; i++) {
          addStickerToLibrary({
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
          // 有些“json 文件”其实是纯文本（备注：链接），或 JSON 含注释/不规范导致 parse 失败
          let pack: LooseStickerPack | null = null
          try {
            pack = JSON.parse(text)
          } catch {
            pack = null
          }

          // 兜底：如果不是标准 JSON，按“备注：链接”文本导入
          if (!pack) {
            const entries = extractStickerUrlEntries(text)
            if (entries.length > 0) {
              for (const e of entries.slice(0, 800)) {
                addStickerToLibrary({
                  keyword: safeName(e.keyword) || '表情',
                  imageUrl: e.url,
                  category: cat,
                  description: safeName(e.keyword) || '',
                })
                importedCount++
              }
            }
            continue
          }

          const rawStickers: any =
            (pack as any).stickers ||
            (pack as any).images ||
            (pack as any).data ||
            (pack as any).items ||
            (pack as any).list ||
            []

          const normalizeUrl = (u: string) => {
            const url = String(u || '').trim()
            if (!url) return ''
            // 兼容协议相对链接：//xx.com/a.png
            if (url.startsWith('//')) return `https:${url}`
            return url
          }

          const isValidUrl = (u: string) => {
            const url = normalizeUrl(u)
            return url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://')
          }

          const toItem = (s: any) => {
            // 1) 直接是字符串数组：["https://...", "data:image/..."]
            if (typeof s === 'string') {
              return { keyword: '表情', imageUrl: normalizeUrl(s), description: '' }
            }
            // 2) 键值对象：{"生气":"https://..."}
            if (s && typeof s === 'object' && !Array.isArray(s)) {
              const kw = safeName(s.keyword || s.name || s.title || s.key || '') || '表情'
              const url = normalizeUrl(s.imageUrl || s.url || s.image || s.src || s.img || s.cover || '')
              const desc = String(s.description || s.desc || s.note || '').trim()
              return { keyword: kw, imageUrl: url, description: desc }
            }
            return null
          }

          let items: { keyword: string; imageUrl: string; description: string }[] = []

          if (Array.isArray(rawStickers)) {
            items = rawStickers.map(toItem).filter(Boolean) as any
          } else if (rawStickers && typeof rawStickers === 'object') {
            // 3) 对象映射：{ "keyword1": "url1", "keyword2": "url2" }
            items = Object.entries(rawStickers).map(([k, v]) => ({
              keyword: safeName(k) || '表情',
              imageUrl: normalizeUrl(String(v || '')),
              description: '',
            }))
          }

          items = items
            .filter(s => isValidUrl(s.imageUrl))
            .slice(0, 300)

          for (const s of items) {
            addStickerToLibrary({
              keyword: s.keyword,
              imageUrl: s.imageUrl,
              category: cat,
              description: s.description,
            })
            importedCount++
          }
        } catch {
          // 单个 JSON 文件解析失败，继续处理其他
        }
      }

      // 处理文本文件（关键词：链接 / 纯链接）
      for (const tf of textFiles.slice(0, 10)) {
        try {
          const text = await tf.text()
          const entries = extractStickerUrlEntries(text)
          if (entries.length === 0) continue
          for (const e of entries.slice(0, 500)) {
            addStickerToLibrary({
              keyword: safeName(e.keyword) || '表情',
              imageUrl: e.url,
              category: cat,
              description: safeName(e.keyword) || '',
            })
            importedCount++
          }
        } catch {
          // ignore
        }
      }

      // 处理 DOCX 文件：提取纯文本后按“关键词：链接”导入
      for (const df of docxFiles.slice(0, 3)) {
        try {
          const text = await docxToText(df)
          const entries = extractStickerUrlEntries(text)
          if (entries.length === 0) continue
          for (const e of entries.slice(0, 800)) {
            addStickerToLibrary({
              keyword: safeName(e.keyword) || '表情',
              imageUrl: e.url,
              category: cat,
              description: safeName(e.keyword) || '',
            })
            importedCount++
          }
        } catch {
          // ignore
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
                const isVirtualUncategorized = cat.id === '__uncategorized__' && !stickerCategories.some(c => c.name === UNCATEGORIZED_NAME)
                const isOpen = !!expanded[cat.id]
                const list = stickersByCategory[cat.name] || []
                return (
                  <div key={cat.id} className="rounded-2xl border border-white/35 bg-white/70 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpanded(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                      className="w-full px-3 py-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-[#111] truncate">{cat.name}</span>
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
                        {/* 分类：重命名/删除 */}
                        {renamingCatId === cat.id ? (
                          <div className="mb-3 rounded-xl bg-white/70 border border-black/10 p-2.5">
                            <div className="text-[11px] text-gray-600 mb-1">重命名分类</div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                value={renameCatValue}
                                onChange={(e) => setRenameCatValue(e.target.value)}
                                placeholder="输入新名称"
                                className="flex-1 min-w-[160px] px-3 py-2 rounded-xl bg-white/90 border border-black/10 outline-none text-sm text-[#111]"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const next = safeName(renameCatValue)
                                  if (!next) return
                                  if (stickerCategories.some(c => c.name === next)) {
                                    setToast('该分类已存在')
                                    window.setTimeout(() => setToast(null), 1800)
                                    return
                                  }
                                  renameStickerCategory(cat.id, next)
                                  setRenamingCatId(null)
                                  setRenameCatValue('')
                                  setToast('已重命名')
                                  window.setTimeout(() => setToast(null), 1600)
                                }}
                                className="px-3 py-2 rounded-xl bg-[#07C160] text-white text-sm font-medium"
                              >
                                保存
                              </button>
                              <button
                                type="button"
                                onClick={() => { setRenamingCatId(null); setRenameCatValue('') }}
                                className="px-3 py-2 rounded-xl bg-white/80 border border-black/10 text-sm text-gray-700"
                              >
                                取消
                              </button>
                            </div>
                            <div className="mt-2 text-[10px] text-gray-500">改名后需点“保存”才会生效</div>
                          </div>
                        ) : null}

                        <div className="flex flex-wrap gap-2 mb-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              pendingImportCategoryRef.current = cat.name
                              setShowSourcePicker('category')
                            }}
                            className="px-3 py-1.5 rounded-full bg-[#07C160] text-white text-xs font-medium disabled:opacity-50"
                          >
                            添加图片
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const pack = exportPack(cat.name)
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
                              pendingImportCategoryRef.current = cat.name
                              setImportingCategory(cat.name)
                              setImportPackText('')
                            }}
                            className="px-3 py-1.5 rounded-full bg-white/80 border border-black/10 text-xs text-gray-700"
                          >
                            导入
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const pack = exportPack(cat.name)
                              if (!pack) return
                              copyToClipboard(JSON.stringify(pack))
                            }}
                            className="px-3 py-1.5 rounded-full bg-white/80 border border-black/10 text-xs text-gray-700"
                          >
                            复制包
                          </button>
                          {!isVirtualUncategorized && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingCatId(cat.id)
                                  setRenameCatValue(cat.name)
                                }}
                                className="px-3 py-1.5 rounded-full bg-white/80 border border-black/10 text-xs text-gray-700"
                              >
                                重命名
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDialog({
                                    open: true,
                                    title: '删除分类？',
                                    message: `确定删除「${cat.name}」分类吗？\n（不会删除表情图片，仅清空它们的分类标签）`,
                                    confirmText: '删除',
                                    cancelText: '取消',
                                    danger: true,
                                    onConfirm: () => removeStickerCategory(cat.id),
                                  })
                                }}
                                className="px-3 py-1.5 rounded-full bg-white/80 border border-red-200 text-xs text-red-600"
                              >
                                删除分类
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDialog({
                                    open: true,
                                    title: '删除分类和表情？',
                                    message: `确定删除「${cat.name}」分类，并删除该分类下所有表情吗？\n（此操作不可恢复）`,
                                    confirmText: '删除全部',
                                    cancelText: '取消',
                                    danger: true,
                                    onConfirm: () => removeStickerCategory(cat.id, { deleteStickers: true }),
                                  })
                                }}
                                className="px-3 py-1.5 rounded-full bg-red-500 text-white text-xs font-medium"
                              >
                                删除分类+表情
                              </button>
                            </>
                          )}
                        </div>

                        {list.length === 0 ? (
                          <div className="text-sm text-gray-400">这个分类还没有表情包</div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {list.map(s => (
                              <div key={s.id} className="rounded-xl bg-white/80 border border-black/10 p-2">
                                <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-100">
                                  <img src={s.imageUrl} alt="" className="w-full h-full object-cover" />
                                </div>
                                <input
                                  type="text"
                                  value={s.description || ''}
                                  onChange={(e) => updateSticker(s.id, { description: e.target.value })}
                                  placeholder="备注（如：你真可爱）"
                                  className="mt-1 w-full px-1.5 py-1 rounded bg-gray-50 border border-gray-200 outline-none text-[10px] text-gray-600"
                                />
                                {String((s as any).refKey || '').trim() && (
                                  <div className="mt-1 flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-gray-400 font-mono truncate">
                                      引用码：{String((s as any).refKey)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const v = String((s as any).refKey || '').trim()
                                        if (!v) return
                                        navigator.clipboard.writeText(v).then(() => {
                                          setToast('已复制引用码')
                                          window.setTimeout(() => setToast(null), 1400)
                                        }).catch(() => {})
                                      }}
                                      className="text-[10px] text-purple-600 flex-shrink-0"
                                    >
                                      复制
                                    </button>
                                  </div>
                                )}
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

        {/* 隐藏 input：相册选图（accept=image/* 会在手机上弹出相册选择器） */}
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
          accept="application/json,.json,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            let text = ''
            const ext = f.name.toLowerCase().split('.').pop() || ''
            const type = f.type.toLowerCase()
            try {
              if (
                ext === 'docx' ||
                type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              ) {
                text = await docxToText(f)
              } else {
                text = await f.text()
              }
            } catch {
              text = ''
            }
            if (!text.trim()) {
              setToast('导入失败：未能从文件中读取到可用内容（docx 请确认为纯文本链接列表）')
              window.setTimeout(() => setToast(null), 2600)
              e.currentTarget.value = ''
              return
            }
            setImportPackText(text)
            const cat = pendingImportCategoryRef.current
            // docx 更常见是“关键词：链接”文本：优先走链接导入
            const entries = extractStickerUrlEntries(text)
            if (entries.length > 0) {
              await importMultipleUrls(text, cat)
            } else {
              await importPack(text, cat)
            }
            e.currentTarget.value = ''
          }}
        />
        {/* 快速导入 input */}
        <input
          ref={quickImportRef}
          type="file"
          accept="image/*,.json,application/json,.txt,.md,.csv,text/plain,text/markdown,text/csv,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          className="hidden"
          onChange={(e) => {
            handleQuickImport(e.target.files)
            e.currentTarget.value = ''
          }}
        />

        {/* 拍照专用 input（capture=environment 触发相机） */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files
            if (!files || files.length === 0) return
            if (showSourcePicker === 'category') {
              const cat = pendingImportCategoryRef.current
              handleBatchImportImages(cat, files)
            } else {
              handleQuickImport(files)
            }
            e.currentTarget.value = ''
            setShowSourcePicker(null)
          }}
        />
        {/* 文件管理器专用 input（不设 accept=image/* 也不设 capture，强制弹出文件管理器） */}
        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files
            if (!files || files.length === 0) return
            if (showSourcePicker === 'category') {
              // 过滤图片
              const dt = new DataTransfer()
              for (let i = 0; i < files.length; i++) {
                const f = files[i]
                if (f.type.startsWith('image/') || /\.(gif|png|jpe?g|webp|svg|bmp)$/i.test(f.name)) dt.items.add(f)
              }
              if (dt.files.length > 0) {
                const cat = pendingImportCategoryRef.current
                handleBatchImportImages(cat, dt.files)
              } else {
                setToast('未选择到图片文件')
                window.setTimeout(() => setToast(null), 2500)
              }
            } else {
              handleQuickImport(files)
            }
            e.currentTarget.value = ''
            setShowSourcePicker(null)
          }}
        />

        {/* 来源选择弹窗：图片/拍照/文件 三选一 */}
        {showSourcePicker && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40" onClick={() => setShowSourcePicker(null)}>
            <div className="w-full max-w-[420px] rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] animate-[slideUp_0.25s_ease-out]" onClick={e => e.stopPropagation()}>
              <div className="p-4">
                <div className="text-sm font-bold text-gray-800 text-center mb-4">选择导入方式</div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (showSourcePicker === 'category') {
                        imgInputRef.current?.click()
                      } else {
                        // quick import: 用 imgInputRef 选图片
                        imgInputRef.current?.click()
                      }
                      setShowSourcePicker(null)
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-green-50 border border-green-200 active:bg-green-100"
                  >
                    <span className="text-2xl">🖼️</span>
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-800">从相册选择</div>
                      <div className="text-[11px] text-gray-500">选择手机相册里的图片</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      cameraInputRef.current?.click()
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-blue-50 border border-blue-200 active:bg-blue-100"
                  >
                    <span className="text-2xl">📷</span>
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-800">拍照</div>
                      <div className="text-[11px] text-gray-500">用相机拍一张表情包</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click()
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-purple-50 border border-purple-200 active:bg-purple-100"
                  >
                    <span className="text-2xl">📁</span>
                    <div className="text-left">
                      <div className="text-sm font-medium text-gray-800">从文件选择</div>
                      <div className="text-[11px] text-gray-500">从手机文件管理器选择图片/JSON</div>
                    </div>
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSourcePicker(null)}
                className="w-full py-3 text-sm text-gray-500 font-medium border-t border-gray-100 active:bg-gray-50"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 快速导入弹窗 */}
        {showQuickImportModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/35" onClick={() => setShowQuickImportModal(false)} role="presentation" />
            <div className="relative w-full max-w-[360px] max-h-[90vh] overflow-y-auto rounded-[22px] border border-white/35 bg-white/95 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
              <div className="text-[15px] font-semibold text-[#111] text-center">批量导入表情包</div>
              
              {/* 导入到分类 */}
              <div className="mt-3">
                <div className="text-[12px] text-gray-600 mb-1.5 font-medium">导入到分类：</div>
                <input
                  value={quickImportCategory}
                  onChange={(e) => setQuickImportCategory(e.target.value)}
                  placeholder="输入分类名（如：沙雕表情）"
                  className="w-full px-3 py-2 rounded-xl bg-white/80 border border-black/10 outline-none text-sm text-[#111]"
                />
                {categories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {categories.slice(0, 6).map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setQuickImportCategory(cat.name)}
                        className={`px-2 py-1 rounded-lg text-[11px] ${
                          quickImportCategory === cat.name
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* 方式一：链接导入 */}
              <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                <div className="text-[12px] font-semibold text-blue-700 mb-2">方式一：粘贴图片链接</div>
                <textarea
                  value={urlImportInput}
                  onChange={(e) => setUrlImportInput(e.target.value)}
                  onPaste={(e) => {
                    try {
                      const t = e.clipboardData.getData('text')
                      if (!t) return
                      e.preventDefault()
                      setUrlImportInput(normalizeStickerUrlImportText(t))
                    } catch {
                      // ignore
                    }
                  }}
                  placeholder="支持两种格式，每行一个：&#10;&#10;格式1（带备注）：&#10;嘬嘬嘬：https://xxx.png&#10;&#10;格式2（纯链接）：&#10;https://xxx.png"
                  className="w-full h-24 px-3 py-2 rounded-lg bg-white/90 border border-blue-200 outline-none text-[11px] text-[#111] resize-none placeholder:text-gray-400"
                />
                <button
                  type="button"
                  disabled={!urlImportInput.trim() || urlImportLoading || !quickImportCategory.trim()}
                  onClick={() => importMultipleUrls(urlImportInput, quickImportCategory)}
                  className="mt-2 w-full py-2 rounded-full text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)' }}
                >
                  {urlImportLoading ? '导入中...' : '从链接导入'}
                </button>
                <div className="text-[10px] text-blue-500 mt-1.5">支持 PNG、JPG、GIF、WebP 等图片链接</div>
              </div>
              
              {/* 分隔线 */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[11px] text-gray-400">或</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              
              {/* 方式二：文件导入 */}
              <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
                <div className="text-[12px] font-semibold text-purple-700 mb-2">方式二：选择文件</div>
                <div className="text-[11px] text-purple-600 space-y-1">
                  <div>• 图片文件（PNG、JPG、GIF、WebP）</div>
                  <div>• JSON 文件（表情包数据）</div>
                </div>
                <button
                  type="button"
                  disabled={!quickImportCategory.trim()}
                  onClick={() => setShowSourcePicker('quick')}
                  className="mt-2 w-full py-2 rounded-full text-[12px] font-semibold text-white disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}
                >
                  选择文件导入
                </button>
              </div>
              
              {/* 取消按钮 */}
              <button
                type="button"
                onClick={() => {
                  setShowQuickImportModal(false)
                  setUrlImportInput('')
                }}
                className="mt-4 w-full py-2.5 rounded-full border border-black/10 bg-white/70 text-[13px] font-medium text-[#333]"
              >
                取消
              </button>
              
              {/* JSON 格式说明 */}
              <div className="mt-3 p-2.5 bg-gray-50 rounded-xl">
                <div className="text-[10px] font-medium text-gray-600 mb-1">JSON 格式参考：</div>
                <div className="text-[9px] text-gray-400 font-mono">{`{ "stickers": [{ "keyword": "名称", "imageUrl": "链接" }] }`}</div>
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

        <WeChatDialog
          open={dialog.open}
          title={dialog.title || ''}
          message={dialog.message || ''}
          confirmText={dialog.confirmText || '确定'}
          cancelText={dialog.cancelText || '取消'}
          danger={dialog.danger}
          onCancel={() => setDialog({ open: false })}
          onConfirm={() => {
            const cb = dialog.onConfirm
            setDialog({ open: false })
            cb?.()
          }}
        />
      </div>
    </PageContainer>
  )
}

