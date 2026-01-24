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

export async function kvSetJSON<T>(key: string, value: T): Promise<void> {
  await kvSet(key, JSON.stringify(value))
}

