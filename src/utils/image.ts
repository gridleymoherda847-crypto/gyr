export async function compressImageFileToDataUrl(
  file: File,
  options?: {
    maxSide?: number
    mimeType?: 'image/jpeg' | 'image/webp'
    quality?: number
  }
): Promise<string> {
  const maxSide = Math.max(320, Math.min(4096, options?.maxSide ?? 1280))
  const mimeType = options?.mimeType ?? 'image/jpeg'
  const quality = Math.max(0.5, Math.min(0.95, options?.quality ?? 0.86))

  // 优先使用成熟库（更稳的质量/尺寸控制，兼容 iOS）
  try {
    const mod: any = await import('browser-image-compression')
    const imageCompression = mod?.default || mod
    if (typeof imageCompression === 'function') {
      const compressed: File = await imageCompression(file, {
        maxWidthOrHeight: maxSide,
        useWebWorker: true,
        fileType: mimeType,
        initialQuality: quality,
      })
      // browser-image-compression 提供的工具方法
      const toDataUrl = imageCompression.getDataUrlFromFile || imageCompression.getDataUrlFromBlob
      if (typeof toDataUrl === 'function') {
        const dataUrl: string = await toDataUrl(compressed)
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) return dataUrl
      }
    }
  } catch {
    // 回退到 canvas 方案
  }

  const originalDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_error'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })

  // 用 Image + canvas 压缩（避免 blob: URL 刷新失效、也避免 localStorage 超限）
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

  try {
    return canvas.toDataURL(mimeType, quality)
  } catch {
    return originalDataUrl
  }
}

export async function compressDataUrlToDataUrl(
  dataUrl: string,
  options?: {
    maxSide?: number
    mimeType?: 'image/jpeg' | 'image/webp'
    quality?: number
  }
): Promise<string> {
  const src = String(dataUrl || '').trim()
  if (!src.startsWith('data:image/')) return src
  const maxSide = Math.max(160, Math.min(2048, options?.maxSide ?? 320))
  const mimeType = options?.mimeType ?? 'image/webp'
  const quality = Math.max(0.35, Math.min(0.92, options?.quality ?? 0.55))
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('image_load_error'))
    el.src = src
  })
  const w = img.naturalWidth || img.width || 0
  const h = img.naturalHeight || img.height || 0
  if (!w || !h) return src
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) return src
  ctx.drawImage(img, 0, 0, tw, th)
  try {
    return canvas.toDataURL(mimeType, quality)
  } catch {
    return src
  }
}