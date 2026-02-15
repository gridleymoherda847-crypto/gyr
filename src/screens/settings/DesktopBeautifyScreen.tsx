import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS, COLOR_OPTIONS } from '../../context/OSContext'
import AppHeader from '../../components/AppHeader'
import PageContainer from '../../components/PageContainer'
import { SettingsItem } from '../../components/SettingsGroup'
import { saveBlobAsFile } from '../../utils/saveFile'
import { compressImageFileToDataUrl } from '../../utils/image'
import { kvGetJSONDeep, kvSetJSON } from '../../storage/kv'

type DesktopBeautifyPresetV1 = {
  version: 'desktop_beautify_v1'
  id: string
  name: string
  createdAt: number
  lastUsedAt?: number
  source?: 'import' | 'export' | 'save'
  data: {
    wallpaper: string
    iconTheme: 'custom' | 'minimal'
    decorImage: string
    customAppIcons: Record<string, string>
    currentFontId: string
    fontColorId: string
    fontSizeTier: 'small' | 'medium' | 'large' | 'xlarge'
    customFonts: Array<{ name: string; fontFamily: string; dataUrl: string }>
    homeAvatar?: string
    signature?: string
    memoDecorImage?: string
  }
}

const BEAUTY_PRESETS_KEY = 'mina_desktop_beautify_presets_v1'

const layoutName = (theme: 'custom' | 'minimal') => theme === 'custom' ? '桌面排版1' : '桌面排版2'

export default function DesktopBeautifyScreen() {
  const navigate = useNavigate()
  const {
    wallpaper,
    setWallpaper,
    currentFont,
    setCurrentFont,
    fontColor,
    setFontColor,
    fontSizeTier,
    setFontSizeTier,
    customFonts,
    addCustomFont,
    getAllFontOptions,
    customAppIconsLayout1,
    customAppIconsLayout2,
    setCustomAppIconForLayout,
    iconTheme,
    setIconTheme,
    decorImage,
    decorImageLayout1,
    decorImageLayout2,
    setDecorImageForLayout,
    currentSong,
    homeAvatar,
    setHomeAvatar,
    signature,
    setSignature,
    memo,
    setMemo,
  } = useOS()

  const [beautyImportError, setBeautyImportError] = useState<string | null>(null)
  const beautyFileInputRef = useRef<HTMLInputElement>(null)

  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [showStorageDialog, setShowStorageDialog] = useState(false)
  const [saveName, setSaveName] = useState('')

  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportName, setExportName] = useState('')

  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyMode, setHistoryMode] = useState<'import' | 'export'>('export')

  const [showCoverReplaceConfirm, setShowCoverReplaceConfirm] = useState(false)
  const [pendingDiscFile, setPendingDiscFile] = useState<File | null>(null)
  const [coverCompressing, setCoverCompressing] = useState(false)
  const [previewLayout, setPreviewLayout] = useState<'layout1' | 'layout2' | null>(null)
  const discImageInputRef = useRef<HTMLInputElement>(null)

  const nowText = () => new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[/:]/g, '-').replace(/\s+/g, '_')

  const normalizePresets = (raw: any): DesktopBeautifyPresetV1[] => {
    try {
      if (!Array.isArray(raw)) return []
      const now = Date.now()
      return raw
        .filter((x) => x && (x as any).version === 'desktop_beautify_v1' && typeof (x as any).id === 'string')
        .map((x: any) => {
          const name = String(x?.name || '')
          const source: 'import' | 'export' | 'save' =
            (x?.source === 'import' || x?.source === 'export' || x?.source === 'save')
              ? x.source
              : (/导入/.test(name) ? 'import' : (/储存|保存/.test(name) ? 'save' : 'export'))
          const createdAt = (typeof x?.createdAt === 'number') ? x.createdAt : now
          const lastUsedAt = (typeof x?.lastUsedAt === 'number') ? x.lastUsedAt : createdAt
          return { ...x, source, createdAt, lastUsedAt } as DesktopBeautifyPresetV1
        })
        .slice(-30)
    } catch {
      return []
    }
  }

  const readPresetsFromLocalStorage = (): DesktopBeautifyPresetV1[] => {
    try {
      const raw = localStorage.getItem(BEAUTY_PRESETS_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return normalizePresets(parsed)
    } catch {
      return []
    }
  }

  // Safari 上 localStorage 容量/权限更苛刻：历史可能写不进去或刷新就丢。
  // 这里改为 IndexedDB(kv) 为主、localStorage 为兜底，并在首次进入时做一次迁移。
  const [beautyPresets, setBeautyPresets] = useState<DesktopBeautifyPresetV1[]>(() => readPresetsFromLocalStorage())
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const fromKv = await kvGetJSONDeep<any>(BEAUTY_PRESETS_KEY, null as any)
      const kvList = normalizePresets(fromKv)
      if (cancelled) return
      if (kvList.length > 0) {
        setBeautyPresets(kvList)
        return
      }
      const localList = readPresetsFromLocalStorage()
      if (localList.length > 0) {
        setBeautyPresets(localList)
        // 迁移到 kv（后续读写都以 kv 为准）
        void kvSetJSON(BEAUTY_PRESETS_KEY, localList.slice(-30))
      }
    }
    void run()
    return () => { cancelled = true }
  }, [])

  const saveBeautyPresets = (next: DesktopBeautifyPresetV1[]) => {
    const cut = next.slice(-30)
    try {
      localStorage.setItem(BEAUTY_PRESETS_KEY, JSON.stringify(cut))
    } catch {
      // ignore
    }
    // 主存储：IndexedDB(kv)，避免 Safari localStorage 导致“历史不显示/刷新丢失”
    void kvSetJSON(BEAUTY_PRESETS_KEY, cut)
    setBeautyPresets(cut)
  }

  const buildBeautyPreset = (name: string, source: 'import' | 'export' | 'save'): DesktopBeautifyPresetV1 => {
    const id = `beauty_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return {
      version: 'desktop_beautify_v1',
      id,
      name: String(name || '').trim() || `桌面美化_${new Date().toLocaleDateString('zh-CN')}`,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      source,
      data: {
        wallpaper: String(wallpaper || ''),
        iconTheme: (iconTheme === 'minimal' ? 'minimal' : 'custom'),
        decorImage: String(decorImage || ''),
        customAppIcons: (iconTheme === 'minimal'
          ? (customAppIconsLayout2 && typeof customAppIconsLayout2 === 'object' ? (customAppIconsLayout2 as any) : {})
          : (customAppIconsLayout1 && typeof customAppIconsLayout1 === 'object' ? (customAppIconsLayout1 as any) : {})),
        currentFontId: String(currentFont?.id || ''),
        fontColorId: String(fontColor?.id || ''),
        fontSizeTier: (fontSizeTier === 'small' || fontSizeTier === 'medium' || fontSizeTier === 'large' || fontSizeTier === 'xlarge') ? fontSizeTier : 'medium',
        customFonts: Array.isArray(customFonts)
          ? customFonts.map((f: any) => ({
            name: String(f?.name || ''),
            fontFamily: String(f?.fontFamily || ''),
            dataUrl: String(f?.dataUrl || ''),
          })).filter((f: any) => !!f.name && !!f.fontFamily && !!f.dataUrl).slice(0, 50)
          : [],
        homeAvatar: String(homeAvatar || ''),
        signature: String(signature || ''),
        memoDecorImage: String((memo as any)?.image || ''),
      },
    }
  }

  const applyBeautyPreset = (preset: DesktopBeautifyPresetV1) => {
    const p = preset?.data
    if (!p) return

    // 1) wallpaper / layout / cover
    if (typeof p.wallpaper === 'string' && p.wallpaper.trim()) setWallpaper(p.wallpaper)
    if (p.iconTheme === 'minimal' || p.iconTheme === 'custom') setIconTheme(p.iconTheme)
    const layout: 'layout1' | 'layout2' = p.iconTheme === 'minimal' ? 'layout2' : 'layout1'
    if (typeof p.decorImage === 'string') setDecorImageForLayout(layout, p.decorImage)

    // 2) custom icons (按该 preset 的排版写入对应那一份，不影响另一份)
    try {
      const existing = layout === 'layout2' ? (customAppIconsLayout2 || {}) : (customAppIconsLayout1 || {})
      Object.keys(existing).forEach((appId) => setCustomAppIconForLayout(layout, appId, ''))
    } catch { /* ignore */ }
    try {
      Object.entries(p.customAppIcons || {}).forEach(([appId, url]) => {
        if (!appId) return
        setCustomAppIconForLayout(layout, appId, String(url || ''))
      })
    } catch { /* ignore */ }

    // 3) fonts: add missing custom fonts
    try {
      const existingFamilies = new Set((customFonts || []).map((f: any) => String(f?.fontFamily || '')).filter(Boolean))
      for (const f of (p.customFonts || [])) {
        const fam = String((f as any)?.fontFamily || '').trim()
        if (!fam || existingFamilies.has(fam)) continue
        const nm = String((f as any)?.name || '').trim() || '自定义字体'
        const dataUrl = String((f as any)?.dataUrl || '').trim()
        if (!dataUrl) continue
        const added = addCustomFont({ name: nm, fontFamily: fam, dataUrl })
        existingFamilies.add(String(added?.fontFamily || fam))
      }
    } catch { /* ignore */ }

    // 4) font size tier
    if (p.fontSizeTier === 'small' || p.fontSizeTier === 'medium' || p.fontSizeTier === 'large' || p.fontSizeTier === 'xlarge') {
      setFontSizeTier(p.fontSizeTier)
    }

    // 5) font color
    try {
      const c = COLOR_OPTIONS.find((x) => x.id === p.fontColorId) || COLOR_OPTIONS[0]
      if (c) setFontColor(c as any)
    } catch { /* ignore */ }

    // 6) current font
    try {
      const all = getAllFontOptions()
      const hit = all.find((x) => x.id === p.currentFontId)
      if (hit) setCurrentFont(hit as any)
    } catch { /* ignore */ }

    // 7) home avatar / signature / memo decor image
    try {
      if (typeof (p as any).homeAvatar === 'string') setHomeAvatar(String((p as any).homeAvatar || ''))
    } catch { /* ignore */ }
    try {
      if (typeof (p as any).signature === 'string') setSignature(String((p as any).signature || ''))
    } catch { /* ignore */ }
    try {
      if (typeof (p as any).memoDecorImage === 'string') setMemo({ image: String((p as any).memoDecorImage || '') })
    } catch { /* ignore */ }

    // 8) mark last used
    try {
      const now = Date.now()
      const next = (beautyPresets || []).map((x) => x.id === preset.id ? ({ ...x, lastUsedAt: now }) : x)
      saveBeautyPresets(next)
    } catch { /* ignore */ }
  }

  const counts = useMemo(() => {
    const imp = (beautyPresets || []).filter((x) => x.source === 'import').length
    const exp = (beautyPresets || []).filter((x) => x.source === 'export').length
    const save = (beautyPresets || []).filter((x) => x.source === 'save').length
    return { imp, exp, save }
  }, [beautyPresets])

  const activeLayout: 'layout1' | 'layout2' = iconTheme === 'minimal' ? 'layout2' : 'layout1'
  const activeDecorImage = activeLayout === 'layout2' ? decorImageLayout2 : decorImageLayout1

  const saveAsStoragePreset = (preset: DesktopBeautifyPresetV1) => {
    const copied: DesktopBeautifyPresetV1 = {
      ...preset,
      id: `beauty_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: 'save',
      name: `${preset.name || '未命名'}（储存）`,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    }
    const next = [...(beautyPresets || []), copied]
    saveBeautyPresets(next)
  }

  const storageList = useMemo(() => {
    return (beautyPresets || [])
      .filter((x) => x.source === 'save')
      .slice()
      .sort((a, b) => ((b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0)))
  }, [beautyPresets])

  const openHistory = (mode: 'import' | 'export') => {
    setHistoryMode(mode)
    setHistoryOpen(true)
  }

  const historyList = useMemo(() => {
    const sorted = (arr: DesktopBeautifyPresetV1[]) =>
      arr
        .slice()
        .sort((a, b) => ((b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0)))
    if (historyMode === 'import') return sorted((beautyPresets || []).filter((x) => x.source === 'import'))
    return sorted((beautyPresets || []).filter((x) => x.source === 'export'))
  }, [beautyPresets, historyMode])

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="桌面美化" onBack={() => navigate('/apps/settings')} />

        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-4 sm:space-y-5">
          {/* 操作区 */}
          <div className="rounded-2xl border border-white/35 bg-white/20 backdrop-blur-md p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-gray-800">保存 / 导入 / 导出</div>
                <div className="text-[11px] text-gray-500 mt-0.5 truncate">当前：{layoutName(iconTheme === 'minimal' ? 'minimal' : 'custom')}（导入会自动切换到对应排版）</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSaveName(`桌面美化_${new Date().toLocaleDateString('zh-CN')}`)
                    setShowStorageDialog(true)
                  }}
                  className="px-3 py-1.5 rounded-full bg-white/70 border border-black/10 text-[12px] font-medium text-gray-700 active:scale-[0.98]"
                >
                  储存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBeautyImportError(null)
                    beautyFileInputRef.current?.click()
                  }}
                  className="px-3 py-1.5 rounded-full bg-white/70 border border-black/10 text-[12px] font-medium text-gray-700 active:scale-[0.98]"
                >
                  导入
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportName(`桌面美化_${new Date().toLocaleDateString('zh-CN')}`)
                    setShowExportDialog(true)
                  }}
                  className="px-3 py-1.5 rounded-full bg-white/70 border border-black/10 text-[12px] font-medium text-gray-700 active:scale-[0.98]"
                >
                  导出
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openHistory('import')}
                className="rounded-xl border border-black/10 bg-white/50 px-3 py-2 text-left active:scale-[0.99]"
              >
                <div className="text-[12px] font-semibold text-gray-800">导入历史</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{counts.imp} 条</div>
              </button>
              <button
                type="button"
                onClick={() => openHistory('export')}
                className="rounded-xl border border-black/10 bg-white/50 px-3 py-2 text-left active:scale-[0.99]"
              >
                <div className="text-[12px] font-semibold text-gray-800">导出历史</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{counts.exp} 条</div>
              </button>
            </div>
            <div className="mt-2 text-[11px] text-gray-500">储存历史：{counts.save} 条（点击“储存”查看）</div>

            {beautyImportError && <div className="mt-2 text-[11px] text-red-500">{beautyImportError}</div>}

            <input
              ref={beautyFileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = async (ev) => {
                  try {
                    const text = String(ev.target?.result || '').trim()
                    const parsed = JSON.parse(text)
                    const preset: DesktopBeautifyPresetV1 =
                      (parsed && parsed.version === 'desktop_beautify_v1') ? parsed :
                        (parsed && parsed.data && parsed.data.version === 'desktop_beautify_v1') ? parsed.data :
                          null as any
                    if (!preset || preset.version !== 'desktop_beautify_v1' || !preset.data) {
                      throw new Error('不是有效的桌面美化文件（desktop_beautify_v1）')
                    }
                    const now = Date.now()
                    const normalized: DesktopBeautifyPresetV1 = {
                      ...preset,
                      id: preset.id || `beauty_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                      name: String(preset.name || '').trim() || '导入的桌面美化',
                      createdAt: (typeof preset.createdAt === 'number') ? preset.createdAt : now,
                      lastUsedAt: now,
                      source: 'import',
                    }
                    const next = (beautyPresets || []).filter((x) => x.id !== normalized.id)
                    next.push(normalized)
                    saveBeautyPresets(next)
                    applyBeautyPreset(normalized) // 内部会自动切换排版
                    setBeautyImportError(null)
                  } catch (err: any) {
                    setBeautyImportError(String(err?.message || '导入失败：文件格式不正确'))
                  }
                }
                reader.onerror = () => setBeautyImportError('读取文件失败，请重试')
                reader.readAsText(file)
                if (beautyFileInputRef.current) beautyFileInputRef.current.value = ''
              }}
            />
          </div>

          {/* 快捷跳转：壁纸/字体（按需求放到桌面排版上方） */}
          <div className="rounded-2xl border border-white/30 bg-white/10 backdrop-blur-md overflow-hidden">
            <SettingsItem label="壁纸设置" to="/apps/settings/wallpaper" />
            <div className="h-px bg-white/25" />
            <SettingsItem
              label="字体设置"
              value={`${currentFont?.name || ''} · ${fontColor?.name || ''}`}
              to="/apps/settings/font"
            />
          </div>

          {/* 排版选择 + 快捷入口 */}
          <div className="rounded-2xl border border-white/30 bg-white/10 backdrop-blur-md p-3">
            <div className="text-sm font-medium text-gray-800 mb-3">桌面排版</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIconTheme('custom')}
                className={`rounded-2xl p-3 border-2 transition-all active:scale-[0.99] min-h-[250px] ${
                  iconTheme === 'custom' ? 'border-pink-400 bg-transparent' : 'border-white/40 bg-transparent'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-1">①</div>
                  <div className="text-[12px] font-semibold text-gray-800 whitespace-nowrap">桌面排版1（简约排版）</div>
                  <div className="mt-2 w-full h-40 rounded-lg overflow-hidden border border-pink-200 bg-white/70 flex items-center justify-center relative">
                    <img
                      src="/layout-refs/layout1-reference.png"
                      alt="桌面排版1参考图"
                      className="w-full h-full object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setPreviewLayout('layout1')
                      }}
                      className="absolute inset-0 m-auto w-[108px] h-8 rounded-full bg-black/45 text-white text-[12px] backdrop-blur-sm"
                    >
                      点击预览介绍
                    </button>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIconTheme('minimal')}
                className={`rounded-2xl p-3 border-2 transition-all active:scale-[0.99] min-h-[250px] ${
                  iconTheme === 'minimal' ? 'border-gray-800 bg-transparent' : 'border-white/40 bg-transparent'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-1">②</div>
                  <div className="text-[12px] font-semibold text-gray-800 whitespace-nowrap">桌面排版2（极简线条）</div>
                  <div className="mt-2 w-full h-40 rounded-lg overflow-hidden border border-gray-300 bg-white/70 flex items-center justify-center relative">
                    <img
                      src="/layout-refs/layout2-reference.png"
                      alt="桌面排版2参考图"
                      className="w-full h-full object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setPreviewLayout('layout2')
                      }}
                      className="absolute inset-0 m-auto w-[108px] h-8 rounded-full bg-black/45 text-white text-[12px] backdrop-blur-sm"
                    >
                      点击预览介绍
                    </button>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => discImageInputRef.current?.click()}
                className="rounded-2xl p-3 border-2 border-gray-800 bg-transparent transition-all active:scale-[0.99]"
                title="唱片封面（会统一替换音乐App与聊天音乐卡片）"
              >
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-black/5 border border-white/30 mb-2">
                    {activeDecorImage ? (
                      <img src={activeDecorImage} alt="唱片封面" className="w-full h-full object-cover" />
                    ) : iconTheme === 'minimal' ? (
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        <circle cx="50" cy="50" r="48" fill="white" stroke="#333" strokeWidth="1.5"/>
                        <circle cx="50" cy="50" r="38" fill="none" stroke="#333" strokeWidth="0.5" strokeDasharray="3 3"/>
                        <circle cx="50" cy="50" r="18" fill="none" stroke="#333" strokeWidth="1"/>
                        <circle cx="50" cy="50" r="8" fill="#333"/>
                      </svg>
                    ) : (
                      <img src={currentSong?.cover || '/icons/music-cover.png'} alt="默认唱片封面" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="text-[12px] font-semibold text-gray-800">唱片封面</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">点击上传/更换</div>
                  {activeDecorImage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDecorImageForLayout(activeLayout, '')
                      }}
                      className="mt-2 px-2.5 py-1 rounded-lg bg-red-50 text-[10px] text-red-500 hover:bg-red-100 transition-colors"
                    >
                      恢复默认
                    </button>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigate('/apps/settings/icons')}
                className="rounded-2xl p-3 border-2 border-white/40 bg-transparent hover:bg-white/10 transition-all active:scale-[0.99]"
              >
                <div className="text-center">
                  <div className="text-2xl mb-1">🧩</div>
                  <div className="text-[12px] font-semibold text-gray-800">App图标美化</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">为不同排版设置不同图标</div>
                </div>
              </button>
            </div>
          </div>

          <input
            ref={discImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setPendingDiscFile(file)
              setShowCoverReplaceConfirm(true)
              if (discImageInputRef.current) discImageInputRef.current.value = ''
            }}
          />

        </div>
      </div>

      {/* 唱片封面替换确认 */}
      {showCoverReplaceConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl w-full max-w-[340px] overflow-hidden shadow-2xl">
            <div className="px-5 pt-5">
              <div className="text-[16px] font-semibold text-gray-900 text-center">确认替换唱片封面</div>
              <div className="mt-3 text-[13px] leading-6 text-gray-600">
                上传后会替换「当前桌面排版」的音乐封面：
                <br />
                - 音乐 App 列表封面
                <br />
                - 聊天里的音乐卡片封面
              </div>
            </div>
            <div className="px-5 pb-5 pt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCoverReplaceConfirm(false)
                  setPendingDiscFile(null)
                }}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                disabled={coverCompressing}
                onClick={async () => {
                  const file = pendingDiscFile
                  if (!file) {
                    setShowCoverReplaceConfirm(false)
                    return
                  }
                  setCoverCompressing(true)
                  try {
                    // 强压缩：减小内存占用，降低主页/音乐页解码卡顿
                    const result = await compressImageFileToDataUrl(file, {
                      maxSide: 320,
                      mimeType: 'image/webp',
                      quality: 0.5,
                    })
                    const layoutNow: 'layout1' | 'layout2' = iconTheme === 'minimal' ? 'layout2' : 'layout1'
                    setDecorImageForLayout(layoutNow, String(result || ''))
                    setPendingDiscFile(null)
                    setShowCoverReplaceConfirm(false)
                  } catch {
                    setPendingDiscFile(null)
                    setShowCoverReplaceConfirm(false)
                  } finally {
                    setCoverCompressing(false)
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-pink-500 text-white text-sm disabled:opacity-60"
              >
                {coverCompressing ? '压缩中…' : '确认替换'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 排版参考图预览 */}
      {previewLayout && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/65" onClick={() => setPreviewLayout(null)} role="presentation" />
          <div className="relative w-full max-w-[420px] rounded-2xl overflow-hidden bg-white shadow-2xl">
            <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800">
                {previewLayout === 'layout1' ? '桌面排版1 预览介绍' : '桌面排版2 预览介绍'}
              </div>
              <button type="button" onClick={() => setPreviewLayout(null)} className="text-xs text-gray-500">关闭</button>
            </div>
            <div className="p-3 bg-gray-50">
              <img
                src={previewLayout === 'layout1' ? '/layout-refs/layout1-reference.png' : '/layout-refs/layout2-reference.png'}
                alt="排版预览图"
                className="w-full h-auto rounded-xl border border-black/10"
                decoding="async"
              />
            </div>
          </div>
        </div>
      )}

      {/* 储存弹窗：独立储存历史 + 储存当前 */} 
      {showStorageDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/35" onClick={() => setShowStorageDialog(false)} role="presentation" />
          <div className="relative w-full max-w-[380px] rounded-[22px] border border-white/35 bg-white/90 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] max-h-[82vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-semibold text-[#111]">储存历史</div>
              <button type="button" onClick={() => setShowStorageDialog(false)} className="text-[13px] text-gray-500">关闭</button>
            </div>
            <button
              type="button"
              onClick={() => {
                setSaveName(`桌面美化_${new Date().toLocaleDateString('zh-CN')}`)
                setShowSaveDialog(true)
              }}
              className="mt-3 w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #fb7185 0%, #ec4899 100%)' }}
            >
              储存当前桌面美化
            </button>
            <div className="mt-3 space-y-2">
              {storageList.length === 0 ? (
                <div className="text-[13px] text-gray-500">暂无储存记录。</div>
              ) : (
                storageList.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-black/10 bg-white/70 overflow-hidden">
                    <div className="px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-semibold text-gray-800 truncate flex-1">{p.name || '未命名'}</div>
                        <div className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 text-gray-500 flex-shrink-0">
                          {layoutName(p.data?.iconTheme === 'minimal' ? 'minimal' : 'custom')}
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {new Date((p.lastUsedAt || p.createdAt || Date.now())).toLocaleString('zh-CN', { hour12: false })}
                      </div>
                    </div>
                    <div className="h-px bg-black/5" />
                    <div className="px-3 py-2 flex items-center justify-between gap-2">
                      <button type="button" onClick={() => applyBeautyPreset(p)} className="text-[12px] text-green-600">点击使用</button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' })
                            const safeName = (p.name || '桌面美化').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50)
                            await saveBlobAsFile(blob, `mina_desktop_${safeName}_${nowText()}.json`, {
                              title: '桌面美化',
                              hintText: '导出桌面美化文件（可分享给朋友导入）',
                            })
                          } catch {
                            // ignore
                          }
                        }}
                        className="text-[12px] text-blue-600"
                      >
                        导出这套
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = (beautyPresets || []).filter((x) => x.id !== p.id)
                          saveBeautyPresets(next)
                        }}
                        className="text-[12px] text-red-500"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 储存命名 */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/35" onClick={() => setShowSaveDialog(false)} role="presentation" />
          <div className="relative w-full max-w-[360px] rounded-[22px] border border-white/35 bg-white/90 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
            <div className="text-center">
              <div className="text-[15px] font-semibold text-[#111]">储存到本地</div>
              <div className="text-[12px] text-gray-500 mt-1">不会生成文件，仅保存在本机历史里</div>
            </div>
            <div className="mt-3">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="例如：粉色奶油风 / 极简黑白"
                className="w-full rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-[14px] text-[#333] outline-none focus:border-pink-400"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    const preset = buildBeautyPreset(saveName, 'save')
                    const next = [...(beautyPresets || []).filter((x) => x.id !== preset.id), preset]
                    saveBeautyPresets(next)
                  } finally {
                    setShowSaveDialog(false)
                  }
                }}
                className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #fb7185 0%, #ec4899 100%)' }}
              >
                储存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导出命名 */}
      {showExportDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/35" onClick={() => setShowExportDialog(false)} role="presentation" />
          <div className="relative w-full max-w-[360px] rounded-[22px] border border-white/35 bg-white/90 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
            <div className="text-center">
              <div className="text-[15px] font-semibold text-[#111]">导出桌面美化</div>
              <div className="text-[12px] text-gray-500 mt-1">会生成一个 JSON 文件，可分享给朋友导入</div>
            </div>
            <div className="mt-3">
              <input
                type="text"
                value={exportName}
                onChange={(e) => setExportName(e.target.value)}
                placeholder="例如：粉色奶油风 / 极简黑白"
                className="w-full rounded-lg border border-black/10 bg-white/60 px-3 py-2 text-[14px] text-[#333] outline-none focus:border-pink-400"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowExportDialog(false)}
                className="flex-1 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-[13px] font-medium text-[#333] active:scale-[0.98]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const preset = buildBeautyPreset(exportName, 'export')
                    const next = [...(beautyPresets || []).filter((x) => x.id !== preset.id), preset]
                    saveBeautyPresets(next)

                    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' })
                    const safeName = (preset.name || '桌面美化').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50)
                    await saveBlobAsFile(blob, `mina_desktop_${safeName}_${nowText()}.json`, {
                      title: '桌面美化',
                      hintText: '导出桌面美化文件（可分享给朋友导入）',
                    })
                    setShowExportDialog(false)
                  } catch {
                    setShowExportDialog(false)
                  }
                }}
                className="flex-1 rounded-full px-4 py-2 text-[13px] font-semibold text-white active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #34d399 0%, #07C160 100%)' }}
              >
                导出
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 历史列表（不再分 tab；由入口决定显示哪一类） */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/35" onClick={() => setHistoryOpen(false)} role="presentation" />
          <div className="relative w-full max-w-[360px] rounded-[22px] border border-white/35 bg-white/90 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-semibold text-[#111]">{historyMode === 'import' ? '导入历史' : '导出历史'}</div>
              <button type="button" onClick={() => setHistoryOpen(false)} className="text-[13px] text-gray-500">关闭</button>
            </div>
            <div className="mt-3 space-y-2">
              {historyList.length === 0 ? (
                <div className="text-[13px] text-gray-500">
                  {historyMode === 'import' ? '暂无导入历史。可以导入别人分享的桌面美化文件。' : '暂无导出历史。先储存或导出一套自己的桌面美化。'}
                </div>
              ) : (
                historyList.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-black/10 bg-white/70 overflow-hidden">
                    <div className="w-full text-left px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-semibold text-gray-800 truncate flex-1">{p.name || '未命名'}</div>
                        <div className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 text-gray-500 flex-shrink-0">
                          {layoutName(p.data?.iconTheme === 'minimal' ? 'minimal' : 'custom')}
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {p.lastUsedAt
                          ? `最近使用：${new Date(p.lastUsedAt).toLocaleString('zh-CN', { hour12: false })}`
                          : (p.createdAt ? new Date(p.createdAt).toLocaleString('zh-CN', { hour12: false }) : '')}
                      </div>
                    </div>
                    <div className="h-px bg-black/5" />
                    <div className="px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          applyBeautyPreset(p)
                          setHistoryOpen(false)
                        }}
                        className="text-[12px] text-green-600"
                      >
                        点击使用
                      </button>
                      <button
                        type="button"
                        onClick={() => saveAsStoragePreset(p)}
                        className="text-[12px] text-emerald-600"
                      >
                        保存到储存
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' })
                            const safeName = (p.name || '桌面美化').replace(/[\\/:*?"<>|]/g, '_').slice(0, 50)
                            await saveBlobAsFile(blob, `mina_desktop_${safeName}_${nowText()}.json`, {
                              title: '桌面美化',
                              hintText: '导出桌面美化文件（可分享给朋友导入）',
                            })
                          } catch {
                            // ignore
                          }
                        }}
                        className="text-[12px] text-blue-600"
                      >
                        导出这套
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = (beautyPresets || []).filter((x) => x.id !== p.id)
                          saveBeautyPresets(next)
                        }}
                        className="text-[12px] text-red-500"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

