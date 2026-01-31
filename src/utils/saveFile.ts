// 统一处理“保存/下载文件”的跨端兼容（尤其是 iOS 的壳浏览器不支持 a.download）
//
// 约定：
// - 非 iOS：优先使用 Blob + a.download
// - iOS：优先使用 Web Share（存储到文件/发微信等）；不支持则打开新标签页让用户手动保存

export function isIOSLike(): boolean {
  try {
    // 复用我们已有的 html class（main.tsx 会给 iOS 加 ios-safe-area）
    if (typeof document !== 'undefined' && document.documentElement?.classList?.contains('ios-safe-area')) return true
  } catch {}

  const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || ''
  const platform = (typeof navigator !== 'undefined' ? (navigator as any).platform : '') || ''
  const maxTouchPoints = (typeof navigator !== 'undefined' ? (navigator as any).maxTouchPoints : 0) || 0

  const isiOSUA = /iP(hone|od|ad)/i.test(ua)
  // iPadOS 13+ 会伪装成 MacIntel
  const isiPadOS = platform === 'MacIntel' && maxTouchPoints > 1
  return isiOSUA || isiPadOS
}

export type SaveMethod = 'download' | 'share' | 'open'

export async function saveBlobAsFile(
  blob: Blob,
  filename: string,
  opts?: { title?: string; hintText?: string }
): Promise<SaveMethod> {
  const name = (filename || 'download').trim() || 'download'
  const nav: any = typeof navigator !== 'undefined' ? navigator : null

  // iOS：优先分享（更符合系统习惯，并且 Via / WebView 也更容易工作）
  if (isIOSLike()) {
    try {
      // iOS 对 application/json 的文件分享/保存兼容性不稳定，统一用 octet-stream 更稳
      const rawType = (blob as any).type || ''
      const safeType = rawType && rawType !== 'application/json' ? rawType : 'application/octet-stream'
      const file = new File([blob], name, { type: safeType })
      if (nav?.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({
          files: [file],
          title: opts?.title || name,
          text: opts?.hintText || '导出文件',
        })
        return 'share'
      }
    } catch {
      // ignore and fallback
    }

    // 最终兜底：打开新页（用户可用系统分享/“存储到文件”）
    const url = URL.createObjectURL(blob)
    try {
      const w = window.open(url, '_blank')
      // 某些壳浏览器会拦截 window.open（返回 null）；这种情况下只能提示用户手动复制/换 Safari
      void w
    } finally {
      // 不能立刻 revoke，否则新页可能拿不到；延迟回收
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }
    return 'open'
  }

  // 其他平台：标准下载
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'download'
}

export async function saveTextAsFile(
  content: string,
  filename: string,
  mime = 'application/json;charset=utf-8',
  opts?: { title?: string; hintText?: string }
): Promise<SaveMethod> {
  const blob = new Blob([content], { type: mime })
  return await saveBlobAsFile(blob, filename, opts)
}

