export type AppMeta = {
  id: string
  name: string
  route: string
  icon: string
  gradient: string
}

// 主屏幕应用 - 先用可爱emoji，你放好图片后会自动替换
export const GRID_APPS: AppMeta[] = [
  { id: 'wechat', name: '微信', route: '/apps/wechat', icon: '/icons/wechat.png', gradient: 'from-pink-100 to-pink-200' },
  { id: 'doudizhu', name: '斗地主', route: '/apps/doudizhu', icon: '/icons/doudizhu.png', gradient: 'from-pink-100 to-pink-200' },
  // 收藏日记（替换淘宝；默认图标在 /public/icons/diary.svg，可在设置里替换）
  { id: 'diaryVault', name: '日记', route: '/apps/diary-vault', icon: '/icons/diary.svg', gradient: 'from-pink-100 to-pink-200' },
  { id: 'forum', name: '论坛', route: '/apps/forum', icon: '/icons/forum.svg', gradient: 'from-pink-100 to-pink-200' },
  { id: 'music', name: '音乐', route: '/apps/music', icon: '/icons/music.png', gradient: 'from-pink-100 to-pink-200' },
]

// Dock 栏应用
export const DOCK_APPS: AppMeta[] = [
  { id: 'settings', name: '设置', route: '/apps/settings', icon: '/icons/settings.png', gradient: 'from-pink-100 to-pink-200' },
  { id: 'mibi', name: '米币', route: '/apps/mibi', icon: '/icons/mibi.png', gradient: 'from-pink-100 to-pink-200' },
  { id: 'preset', name: '破限', route: '/apps/preset', icon: '/icons/sms.png', gradient: 'from-purple-400 to-pink-400' },
]

export const ALL_APPS: AppMeta[] = [...GRID_APPS, ...DOCK_APPS]
export const getAppById = (id: string) => ALL_APPS.find((app) => app.id === id)
