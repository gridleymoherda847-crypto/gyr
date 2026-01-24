import localforage from 'localforage'

// 全局 KV 存储（IndexedDB），用于替代 localStorage 的同步阻塞
const store = localforage.createInstance({
  name: 'LittlePhone',
  storeName: 'kv',
})

export async function kvGet(key: string): Promise<string | null> {
  const v = await store.getItem<string>(key)
  return typeof v === 'string' ? v : v == null ? null : String(v)
}

export async function kvSet(key: string, value: string): Promise<void> {
  await store.setItem(key, value)
}

export async function kvRemove(key: string): Promise<void> {
  await store.removeItem(key)
}

export async function kvClear(): Promise<void> {
  await store.clear()
}

export async function kvKeys(): Promise<string[]> {
  return await store.keys()
}

export async function kvGetJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await kvGet(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

// 兼容旧备份：有些值会被“二次 JSON 序列化”
// 例如：raw 是 "\"[{...}]\""，第一次 parse 得到字符串 "[{...}]"，需要再 parse 一次才是真正数组/对象
export async function kvGetJSONDeep<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await kvGet(key)
    if (!raw) return fallback
    let v: any = JSON.parse(raw)
    if (typeof v === 'string') {
      const s = v.trim()
      if (
        (s.startsWith('{') && s.endsWith('}')) ||
        (s.startsWith('[') && s.endsWith(']')) ||
        (s.startsWith('"') && s.endsWith('"')) ||
        (/^-?\d+(\.\d+)?$/.test(s))
      ) {
        try {
          v = JSON.parse(s)
        } catch {
          // keep as string
        }
      }
    }
    return v as T
  } catch {
    return fallback
  }
}

export async function kvSetJSON<T>(key: string, value: T): Promise<void> {
  await kvSet(key, JSON.stringify(value))
}

