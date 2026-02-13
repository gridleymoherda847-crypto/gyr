import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

export type TakeoutOption = { id: string; name: string; priceDelta?: number }
export type TakeoutOptionGroup = {
  id: string
  name: string
  required?: boolean
  options: TakeoutOption[]
  defaultOptionId?: string
}

export type TakeoutProduct = {
  id: string
  name: string
  desc?: string
  price: number
  imageEmoji?: string
  imageUrl?: string
  optionGroups?: TakeoutOptionGroup[]
}

export type TakeoutCategory = { id: string; name: string; products: TakeoutProduct[] }

export type TakeoutStore = {
  id: string
  name: string
  logoEmoji: string
  logoUrl?: string
  rating: number
  monthlySales: number
  deliveryMin: number
  deliveryMax: number
  deliveryFee: number
  minOrder: number
  categories: TakeoutCategory[]
}

export type TakeoutOrderLine = {
  storeId: string
  storeName: string
  productId: string
  name: string
  basePrice: number
  qty: number
  options: { groupId: string; groupName: string; optionId: string; optionName: string; priceDelta: number }[]
}

export type TakeoutOrder = {
  id: string
  createdAt: number
  storeId: string
  storeName: string
  deliverTo: 'user' | 'character'
  deliverToName: string
  deliverAddress: string
  lines: TakeoutOrderLine[]
  total: number
  paidBy: 'user' | 'character' | null
  etaMinutes: number
  deliverAt: number
  status: 'draft' | 'awaiting_pay' | 'awaiting_user_pay' | 'delivering' | 'delivered' | 'rejected'
}

const fmtMoney = (n: number) => `¥${n.toFixed(2)}`
const TAKEOUT_CUSTOM_STORES_KEY = 'wechat_takeout_custom_stores_v1'
const TAKEOUT_PINNED_STORES_KEY = 'wechat_takeout_pinned_store_ids_v1'

const fileToCompressedDataUrl = (file: File, maxEdge = 960, quality = 0.82): Promise<string> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error('read-failed'))
    fr.onload = () => {
      const src = String(fr.result || '')
      const img = new Image()
      img.onerror = () => reject(new Error('decode-failed'))
      img.onload = () => {
        const w0 = img.width || 1
        const h0 = img.height || 1
        const scale = Math.min(1, maxEdge / Math.max(w0, h0))
        const w = Math.max(1, Math.round(w0 * scale))
        const h = Math.max(1, Math.round(h0 * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(src); return }
        ctx.drawImage(img, 0, 0, w, h)
        const out = canvas.toDataURL('image/jpeg', quality)
        resolve(out || src)
      }
      img.src = src
    }
    fr.readAsDataURL(file)
  })

// 轻量“真实感”数据：多店铺 + 少量商品/规格
const STORES: TakeoutStore[] = [
  {
    id: 's_burger',
    name: '好吃汉堡店（旗舰店）',
    logoEmoji: '🍔',
    rating: 4.7,
    monthlySales: 2384,
    deliveryMin: 28,
    deliveryMax: 45,
    deliveryFee: 3,
    minOrder: 20,
    categories: [
      {
        id: 'c_hot',
        name: '热销',
        products: [
          {
            id: 'b1',
            name: '芝士牛肉堡',
            desc: '双层牛肉｜芝士加倍',
            price: 19.9,
            imageEmoji: '🧀',
            optionGroups: [
              {
                id: 'spicy',
                name: '辣度',
                required: true,
                defaultOptionId: 'sp0',
                options: [
                  { id: 'sp0', name: '不辣' },
                  { id: 'sp1', name: '微辣' },
                  { id: 'sp2', name: '中辣' },
                  { id: 'sp3', name: '重辣' },
                ],
              },
              {
                id: 'sauce',
                name: '酱料',
                required: true,
                defaultOptionId: 'sa0',
                options: [
                  { id: 'sa0', name: '经典酱' },
                  { id: 'sa1', name: '黑椒酱' },
                  { id: 'sa2', name: '蜂蜜芥末' },
                ],
              },
            ],
          },
          { id: 'b2', name: '炸鸡腿（2只）', desc: '外酥里嫩', price: 15.9, imageEmoji: '🍗' },
          { id: 'b3', name: '薯条（大份）', desc: '加番茄酱', price: 9.9, imageEmoji: '🍟' },
          { id: 'b4', name: '劲爆鸡米花', desc: '香辣酥脆', price: 12.0, imageEmoji: '🍿' },
          { id: 'b5', name: '奥尔良鸡翅(2只)', desc: '经典口味', price: 11.0, imageEmoji: '🍗' },
        ],
      },
      {
        id: 'c_set',
        name: '套餐',
        products: [
          { id: 'bs1', name: '牛肉堡套餐', desc: '汉堡+薯条+可乐', price: 29.9, imageEmoji: '🥤' },
          { id: 'bs2', name: '鸡腿堡套餐', desc: '汉堡+鸡块+可乐', price: 32.9, imageEmoji: '🍗' },
          { id: 'bs3', name: '单人满足餐', desc: '汉堡+鸡翅+蛋挞+可乐', price: 39.9, imageEmoji: '🍱' },
          { id: 'bs4', name: '双人狂欢餐', desc: '2汉堡+大薯+6鸡块+2可乐', price: 68.0, imageEmoji: '👫' },
        ],
      },
      {
        id: 'c_drink',
        name: '饮品小食',
        products: [
          { id: 'bd1', name: '冰镇可乐', desc: '500ml', price: 6.0, imageEmoji: '🥤' },
          { id: 'bd2', name: '热奶茶', desc: '暖心暖胃', price: 8.0, imageEmoji: '☕' },
          { id: 'bd3', name: '葡式蛋挞', desc: '奶香浓郁', price: 5.0, imageEmoji: '🥧' },
          { id: 'bd4', name: '红豆派', desc: '酥脆香甜', price: 6.5, imageEmoji: '🥐' },
        ],
      },
    ],
  },
  {
    id: 's_rice',
    name: '黄焖鸡米饭（人民路店）',
    logoEmoji: '🍚',
    rating: 4.6,
    monthlySales: 3421,
    deliveryMin: 25,
    deliveryMax: 40,
    deliveryFee: 2,
    minOrder: 18,
    categories: [
      {
        id: 'c_hot',
        name: '招牌',
        products: [
          {
            id: 'r1',
            name: '黄焖鸡米饭',
            desc: '大份｜配青菜',
            price: 23.9,
            imageEmoji: '🐔',
            optionGroups: [
              {
                id: 'spicy',
                name: '辣度',
                required: true,
                defaultOptionId: 'sp1',
                options: [
                  { id: 'sp0', name: '不辣' },
                  { id: 'sp1', name: '微辣' },
                  { id: 'sp2', name: '中辣' },
                  { id: 'sp3', name: '重辣' },
                ],
              },
              {
                id: 'addon',
                name: '加料',
                required: true,
                defaultOptionId: 'ad0',
                options: [
                  { id: 'ad0', name: '不加料' },
                  { id: 'ad1', name: '加蛋 +2', priceDelta: 2 },
                  { id: 'ad2', name: '加肉 +5', priceDelta: 5 },
                  { id: 'ad3', name: '加金针菇 +3', priceDelta: 3 },
                  { id: 'ad4', name: '加豆皮 +2', priceDelta: 2 },
                ],
              },
            ],
          },
          {
            id: 'r2',
            name: '香辣鸡翅（4只）',
            desc: '配蘸料',
            price: 16.9,
            imageEmoji: '🍗',
            optionGroups: [
              {
                id: 'spicy',
                name: '辣度',
                required: true,
                defaultOptionId: 'sp2',
                options: [
                  { id: 'sp0', name: '不辣' },
                  { id: 'sp1', name: '微辣' },
                  { id: 'sp2', name: '中辣' },
                  { id: 'sp3', name: '重辣' },
                ],
              },
            ],
          },
          { id: 'r5', name: '黄焖排骨饭', desc: '肉质鲜嫩', price: 28.9, imageEmoji: '🍖' },
          { id: 'r6', name: '黄焖酥肉饭', desc: '香酥入味', price: 25.9, imageEmoji: '🥩' },
        ],
      },
      {
        id: 'c_other',
        name: '小吃饮料',
        products: [
          { id: 'r3', name: '酸梅汤', desc: '冰的更爽', price: 5.9, imageEmoji: '🧃' },
          { id: 'r4', name: '卤蛋', desc: '1个', price: 2.5, imageEmoji: '🥚' },
          { id: 'r7', name: '凉拌黄瓜', desc: '清爽解腻', price: 8.0, imageEmoji: '🥒' },
          { id: 'r8', name: '虎皮青椒', desc: '下饭神器', price: 10.0, imageEmoji: '🫑' },
          { id: 'r9', name: '米饭(加购)', desc: '香软泰米', price: 2.0, imageEmoji: '🍚' },
        ],
      },
    ],
  },
  {
    id: 's_tea',
    name: '奶茶研究所（大学城店）',
    logoEmoji: '🧋',
    rating: 4.8,
    monthlySales: 5120,
    deliveryMin: 20,
    deliveryMax: 35,
    deliveryFee: 2,
    minOrder: 15,
    categories: [
      {
        id: 'c_hot',
        name: '人气必点',
        products: [
          {
            id: 't1',
            name: '珍珠奶茶（大杯）',
            desc: '香浓红茶｜Q弹珍珠',
            price: 18.9,
            imageEmoji: '🧋',
            optionGroups: [
              {
                id: 'ice',
                name: '冰量',
                required: true,
                defaultOptionId: 'i1',
                options: [
                  { id: 'i0', name: '热' },
                  { id: 'i1', name: '正常冰' },
                  { id: 'i2', name: '少冰' },
                  { id: 'i3', name: '去冰' },
                ],
              },
              {
                id: 'sugar',
                name: '甜度',
                required: true,
                defaultOptionId: 'su2',
                options: [
                  { id: 'su0', name: '无糖' },
                  { id: 'su1', name: '三分糖' },
                  { id: 'su2', name: '半糖' },
                  { id: 'su3', name: '七分糖' },
                  { id: 'su4', name: '全糖' },
                ],
              },
              {
                id: 'addon',
                name: '加料',
                required: true,
                defaultOptionId: 'ad0',
                options: [
                  { id: 'ad0', name: '不加料' },
                  { id: 'ad1', name: '加珍珠 +2', priceDelta: 2 },
                  { id: 'ad2', name: '加椰果 +2', priceDelta: 2 },
                  { id: 'ad3', name: '加奶盖 +3', priceDelta: 3 },
                  { id: 'ad4', name: '加红豆 +2', priceDelta: 2 },
                ],
              },
            ],
          },
          {
            id: 't2',
            name: '芋泥波波（大杯）',
            desc: '芋泥香浓｜波波更Q',
            price: 21.9,
            imageEmoji: '🥤',
            optionGroups: [
              {
                id: 'ice',
                name: '冰量',
                required: true,
                defaultOptionId: 'i2',
                options: [
                  { id: 'i0', name: '热' },
                  { id: 'i1', name: '正常冰' },
                  { id: 'i2', name: '少冰' },
                  { id: 'i3', name: '去冰' },
                ],
              },
              {
                id: 'sugar',
                name: '甜度',
                required: true,
                defaultOptionId: 'su2',
                options: [
                  { id: 'su0', name: '无糖' },
                  { id: 'su1', name: '三分糖' },
                  { id: 'su2', name: '半糖' },
                  { id: 'su3', name: '七分糖' },
                  { id: 'su4', name: '全糖' },
                ],
              },
            ],
          },
          { id: 't3', name: '杨枝甘露', desc: '满口芒果肉', price: 23.0, imageEmoji: '🥭' },
          { id: 't4', name: '多肉葡萄', desc: '芝士奶盖', price: 25.0, imageEmoji: '🍇' },
          { id: 't5', name: '幽兰拿铁', desc: '碧根果碎', price: 18.0, imageEmoji: '🍂' },
        ],
      },
      {
        id: 'c_coffee',
        name: '咖啡系列',
        products: [
          {
            id: 'c1',
            name: '拿铁（中杯）',
            desc: '现磨｜奶香',
            price: 16.9,
            imageEmoji: '☕',
            optionGroups: [
              {
                id: 'ice',
                name: '温度',
                required: true,
                defaultOptionId: 'i1',
                options: [
                  { id: 'i0', name: '热' },
                  { id: 'i1', name: '冰' },
                ],
              },
              {
                id: 'sugar',
                name: '甜度',
                required: true,
                defaultOptionId: 'su1',
                options: [
                  { id: 'su0', name: '无糖' },
                  { id: 'su1', name: '少糖' },
                  { id: 'su2', name: '正常糖' },
                ],
              },
            ],
          },
          { id: 'c2', name: '美式咖啡', desc: '经典提神', price: 12.0, imageEmoji: '☕' },
          { id: 'c3', name: '生椰拿铁', desc: '人气爆款', price: 18.0, imageEmoji: '🥥' },
          { id: 'c4', name: '卡布奇诺', desc: '绵密奶泡', price: 17.0, imageEmoji: '🥛' },
        ],
      },
    ],
  },
  {
    id: 's_noodle',
    name: '兰州牛肉面（总店）',
    logoEmoji: '🍜',
    rating: 4.7,
    monthlySales: 6203,
    deliveryMin: 22,
    deliveryMax: 38,
    deliveryFee: 2,
    minOrder: 18,
    categories: [
      {
        id: 'c_hot',
        name: '招牌面食',
        products: [
          {
            id: 'n1',
            name: '兰州牛肉面',
            desc: '加肉可选｜大碗更满足',
            price: 19.9,
            imageEmoji: '🍜',
            optionGroups: [
              {
                id: 'spicy',
                name: '辣度',
                required: true,
                defaultOptionId: 'sp1',
                options: [
                  { id: 'sp0', name: '不辣' },
                  { id: 'sp1', name: '微辣' },
                  { id: 'sp2', name: '中辣' },
                  { id: 'sp3', name: '重辣' },
                ],
              },
              {
                id: 'addon',
                name: '加料',
                required: true,
                defaultOptionId: 'ad0',
                options: [
                  { id: 'ad0', name: '不加料' },
                  { id: 'ad1', name: '加肉 +6', priceDelta: 6 },
                  { id: 'ad2', name: '加蛋 +2', priceDelta: 2 },
                ],
              },
            ],
          },
          { id: 'n2', name: '酸辣粉', desc: '红薯粉｜酸辣开胃', price: 16.9, imageEmoji: '🌶️' },
          { id: 'n3', name: '凉皮', desc: '麻酱｜黄瓜丝', price: 12.9, imageEmoji: '🥗' },
        ],
      },
      {
        id: 'c_side',
        name: '小食饮品',
        products: [
          { id: 'n4', name: '牛肉小串（6串）', desc: '孜然｜微辣', price: 14.9, imageEmoji: '🍢' },
          { id: 'n5', name: '冰红茶', desc: '大瓶', price: 6.0, imageEmoji: '🧃' },
        ],
      },
    ],
  },
  {
    id: 's_pizza',
    name: '披萨工坊（中心城店）',
    logoEmoji: '🍕',
    rating: 4.6,
    monthlySales: 1850,
    deliveryMin: 30,
    deliveryMax: 55,
    deliveryFee: 4,
    minOrder: 35,
    categories: [
      {
        id: 'c_hot',
        name: '热销披萨',
        products: [
          {
            id: 'p1',
            name: '芝士火腿披萨',
            desc: '拉丝芝士｜经典',
            price: 39.9,
            imageEmoji: '🧀',
            optionGroups: [
              {
                id: 'size',
                name: '尺寸',
                required: true,
                defaultOptionId: 'sz1',
                options: [
                  { id: 'sz1', name: '7寸' },
                  { id: 'sz2', name: '9寸 +10', priceDelta: 10 },
                ],
              },
            ],
          },
          { id: 'p2', name: '奥尔良鸡翅（6只）', desc: '外焦里嫩', price: 22.9, imageEmoji: '🍗' },
          { id: 'p3', name: '可乐（大瓶）', desc: '冰镇', price: 8.0, imageEmoji: '🥤' },
        ],
      },
      {
        id: 'c_snack',
        name: '小吃',
        products: [
          { id: 'p4', name: '薯角（大份）', desc: '现炸', price: 12.9, imageEmoji: '🥔' },
          { id: 'p5', name: '玉米杯', desc: '黄油香', price: 9.9, imageEmoji: '🌽' },
        ],
      },
    ],
  },
  {
    id: 's_sushi',
    name: '寿司屋（海港城店）',
    logoEmoji: '🍣',
    rating: 4.8,
    monthlySales: 1320,
    deliveryMin: 26,
    deliveryMax: 45,
    deliveryFee: 3,
    minOrder: 30,
    categories: [
      {
        id: 'c_hot',
        name: '招牌拼盘',
        products: [
          { id: 'su1', name: '寿司拼盘（12贯）', desc: '三文鱼/金枪鱼/鳗鱼', price: 49.0, imageEmoji: '🍣' },
          { id: 'su2', name: '三文鱼刺身（10片）', desc: '新鲜厚切', price: 55.0, imageEmoji: '🐟' },
        ],
      },
      {
        id: 'c_side',
        name: '小食',
        products: [
          { id: 'su3', name: '味噌汤', desc: '热', price: 6.9, imageEmoji: '🥣' },
          { id: 'su4', name: '可乐饼', desc: '土豆可乐饼', price: 12.9, imageEmoji: '🥔' },
        ],
      },
    ],
  },
  {
    id: 's_bbq',
    name: '深夜烧烤（夜市店）',
    logoEmoji: '🍢',
    rating: 4.5,
    monthlySales: 4096,
    deliveryMin: 35,
    deliveryMax: 60,
    deliveryFee: 3,
    minOrder: 40,
    categories: [
      {
        id: 'c_hot',
        name: '热销',
        products: [
          {
            id: 'bb1',
            name: '羊肉串（10串）',
            desc: '孜然香',
            price: 39.0,
            imageEmoji: '🍢',
            optionGroups: [
              {
                id: 'spicy',
                name: '辣度',
                required: true,
                defaultOptionId: 'sp2',
                options: [
                  { id: 'sp0', name: '不辣' },
                  { id: 'sp1', name: '微辣' },
                  { id: 'sp2', name: '中辣' },
                  { id: 'sp3', name: '重辣' },
                ],
              },
            ],
          },
          { id: 'bb2', name: '烤鸡翅（6只）', desc: '外焦里嫩', price: 28.0, imageEmoji: '🍗' },
          { id: 'bb3', name: '烤茄子', desc: '蒜蓉', price: 12.0, imageEmoji: '🍆' },
        ],
      },
      {
        id: 'c_drink',
        name: '饮品',
        products: [
          { id: 'bb4', name: '冰啤（无酒精）', desc: '冰镇', price: 8.0, imageEmoji: '🍺' },
          { id: 'bb5', name: '冰可乐', desc: '大瓶', price: 8.0, imageEmoji: '🥤' },
        ],
      },
    ],
  },
  {
    id: 's_salad',
    name: '轻食沙拉（健康店）',
    logoEmoji: '🥗',
    rating: 4.7,
    monthlySales: 1750,
    deliveryMin: 20,
    deliveryMax: 35,
    deliveryFee: 2,
    minOrder: 20,
    categories: [
      {
        id: 'c_hot',
        name: '低脂主食',
        products: [
          {
            id: 'sa1',
            name: '鸡胸沙拉',
            desc: '低脂｜高蛋白',
            price: 24.9,
            imageEmoji: '🥗',
            optionGroups: [
              {
                id: 'sauce',
                name: '酱汁',
                required: true,
                defaultOptionId: 'sc1',
                options: [
                  { id: 'sc1', name: '油醋汁' },
                  { id: 'sc2', name: '千岛酱' },
                  { id: 'sc3', name: '日式芝麻' },
                ],
              },
            ],
          },
          { id: 'sa2', name: '牛油果全麦三明治', desc: '饱腹', price: 22.9, imageEmoji: '🥪' },
          { id: 'sa3', name: '气泡水', desc: '无糖', price: 7.9, imageEmoji: '🫧' },
        ],
      },
    ],
  },
  {
    id: 's_dessert',
    name: '甜品站（步行街店）',
    logoEmoji: '🍰',
    rating: 4.7,
    monthlySales: 2890,
    deliveryMin: 18,
    deliveryMax: 30,
    deliveryFee: 2,
    minOrder: 15,
    categories: [
      {
        id: 'c_hot',
        name: '爆款',
        products: [
          { id: 'd1', name: '草莓奶油蛋糕', desc: '甜而不腻', price: 26.9, imageEmoji: '🍰' },
          { id: 'd2', name: '芒果班戟（2个）', desc: '香甜芒果', price: 21.9, imageEmoji: '🥞' },
          { id: 'd3', name: '杨枝甘露', desc: '冰爽', price: 18.9, imageEmoji: '🥭' },
        ],
      },
    ],
  },
  {
    id: 's_hotpot',
    name: '麻辣烫小馆（东门店）',
    logoEmoji: '🍲',
    rating: 4.6,
    monthlySales: 5100,
    deliveryMin: 25,
    deliveryMax: 45,
    deliveryFee: 2,
    minOrder: 25,
    categories: [
      {
        id: 'c_hot',
        name: '经典',
        products: [
          {
            id: 'h1',
            name: '麻辣烫（自选）',
            desc: '荤素搭配',
            price: 26.5,
            imageEmoji: '🍲',
            optionGroups: [
              {
                id: 'spicy',
                name: '辣度',
                required: true,
                defaultOptionId: 'sp2',
                options: [
                  { id: 'sp0', name: '不辣' },
                  { id: 'sp1', name: '微辣' },
                  { id: 'sp2', name: '中辣' },
                  { id: 'sp3', name: '重辣' },
                ],
              },
              {
                id: 'soup',
                name: '汤底',
                required: true,
                defaultOptionId: 'so1',
                options: [
                  { id: 'so1', name: '麻辣汤底' },
                  { id: 'so2', name: '番茄汤底' },
                  { id: 'so3', name: '骨汤' },
                ],
              },
            ],
          },
          { id: 'h2', name: '金针菇', desc: '加料', price: 6.0, imageEmoji: '🍄' },
          { id: 'h3', name: '肥牛卷', desc: '加料', price: 12.0, imageEmoji: '🥩' },
        ],
      },
    ],
  },
  // 下面继续补足到 20+ 家店（每家少量商品，保证性能）
  {
    id: 's_bento',
    name: '便当小铺（CBD店）',
    logoEmoji: '🍱',
    rating: 4.6,
    monthlySales: 1430,
    deliveryMin: 25,
    deliveryMax: 40,
    deliveryFee: 2,
    minOrder: 22,
    categories: [
      { id: 'c_hot', name: '便当', products: [{ id: 'be1', name: '照烧鸡腿便当', desc: '双拼可选', price: 25.9, imageEmoji: '🍱' }, { id: 'be2', name: '牛肉饭', desc: '加蛋更香', price: 23.9, imageEmoji: '🥩' }] },
      { id: 'c_side', name: '小吃', products: [{ id: 'be3', name: '可乐', desc: '冰', price: 6.0, imageEmoji: '🥤' }] },
    ],
  },
  {
    id: 's_kfc',
    name: '炸鸡研究院（万达店）',
    logoEmoji: '🍗',
    rating: 4.6,
    monthlySales: 3980,
    deliveryMin: 24,
    deliveryMax: 38,
    deliveryFee: 3,
    minOrder: 25,
    categories: [
      { id: 'c_hot', name: '热销', products: [{ id: 'fc1', name: '炸鸡桶', desc: '多人分享', price: 49.9, imageEmoji: '🍗' }, { id: 'fc2', name: '鸡米花', desc: '大份', price: 19.9, imageEmoji: '🍗' }, { id: 'fc3', name: '薯条', desc: '大份', price: 12.9, imageEmoji: '🍟' }] },
    ],
  },
  {
    id: 's_icecream',
    name: '冰淇淋工厂（甜品店）',
    logoEmoji: '🍦',
    rating: 4.7,
    monthlySales: 2210,
    deliveryMin: 18,
    deliveryMax: 30,
    deliveryFee: 2,
    minOrder: 15,
    categories: [
      { id: 'c_hot', name: '冰品', products: [{ id: 'ic1', name: '香草冰淇淋', desc: '经典', price: 9.9, imageEmoji: '🍦' }, { id: 'ic2', name: '巧克力圣代', desc: '加坚果', price: 15.9, imageEmoji: '🍫' }] },
    ],
  },
  {
    id: 's_breakfast',
    name: '早餐加盟（早点铺）',
    logoEmoji: '🥟',
    rating: 4.6,
    monthlySales: 5600,
    deliveryMin: 15,
    deliveryMax: 25,
    deliveryFee: 1,
    minOrder: 12,
    categories: [
      { id: 'c_hot', name: '早点', products: [{ id: 'br1', name: '豆浆', desc: '热', price: 4.0, imageEmoji: '🥛' }, { id: 'br2', name: '油条（2根）', desc: '现炸', price: 5.0, imageEmoji: '🥖' }, { id: 'br3', name: '小笼包（8个）', desc: '热', price: 12.9, imageEmoji: '🥟' }] },
    ],
  },
  {
    id: 's_fruit',
    name: '水果铺（新鲜直达）',
    logoEmoji: '🍉',
    rating: 4.8,
    monthlySales: 3300,
    deliveryMin: 20,
    deliveryMax: 35,
    deliveryFee: 2,
    minOrder: 20,
    categories: [
      { id: 'c_hot', name: '当季', products: [{ id: 'fr1', name: '西瓜（半个）', desc: '冰镇', price: 19.9, imageEmoji: '🍉' }, { id: 'fr2', name: '草莓（250g）', desc: '新鲜', price: 24.9, imageEmoji: '🍓' }] },
    ],
  },
  {
    id: 's_cafe2',
    name: '咖啡日常（写字楼店）',
    logoEmoji: '☕',
    rating: 4.7,
    monthlySales: 4100,
    deliveryMin: 18,
    deliveryMax: 30,
    deliveryFee: 2,
    minOrder: 15,
    categories: [
      { id: 'c_hot', name: '咖啡', products: [{ id: 'cf1', name: '美式（中杯）', desc: '提神', price: 14.9, imageEmoji: '☕', optionGroups: [{ id: 'ice', name: '温度', required: true, defaultOptionId: 'i1', options: [{ id: 'i0', name: '热' }, { id: 'i1', name: '冰' }] }, { id: 'sugar', name: '甜度', required: true, defaultOptionId: 'su0', options: [{ id: 'su0', name: '无糖' }, { id: 'su1', name: '少糖' }] }] }, { id: 'cf2', name: '生椰拿铁（中杯）', desc: '香浓', price: 19.9, imageEmoji: '🥥' }] },
    ],
  },
  {
    id: 's_friedrice',
    name: '炒饭王中王（老街店）',
    logoEmoji: '🍳',
    rating: 4.5,
    monthlySales: 4700,
    deliveryMin: 20,
    deliveryMax: 35,
    deliveryFee: 2,
    minOrder: 18,
    categories: [
      { id: 'c_hot', name: '炒饭', products: [{ id: 'frc1', name: '蛋炒饭', desc: '加火腿', price: 14.9, imageEmoji: '🍳' }, { id: 'frc2', name: '扬州炒饭', desc: '经典', price: 16.9, imageEmoji: '🍤' }] },
    ],
  },
  {
    id: 's_dumpling',
    name: '饺子馆（社区店）',
    logoEmoji: '🥟',
    rating: 4.6,
    monthlySales: 2600,
    deliveryMin: 22,
    deliveryMax: 38,
    deliveryFee: 2,
    minOrder: 18,
    categories: [
      { id: 'c_hot', name: '饺子', products: [{ id: 'j1', name: '猪肉白菜饺子（20只）', desc: '现包', price: 26.9, imageEmoji: '🥟' }, { id: 'j2', name: '韭菜鸡蛋饺子（20只）', desc: '现包', price: 26.9, imageEmoji: '🥟' }] },
    ],
  },
  {
    id: 's_ramen',
    name: '日式拉面（樱花店）',
    logoEmoji: '🍜',
    rating: 4.7,
    monthlySales: 980,
    deliveryMin: 30,
    deliveryMax: 50,
    deliveryFee: 3,
    minOrder: 30,
    categories: [
      { id: 'c_hot', name: '拉面', products: [{ id: 'ra1', name: '豚骨拉面', desc: '浓汤', price: 32.0, imageEmoji: '🍜' }, { id: 'ra2', name: '味增拉面', desc: '香浓', price: 29.0, imageEmoji: '🍜' }] },
    ],
  },
  {
    id: 's_kebab',
    name: '烤肉饭（清真店）',
    logoEmoji: '🥙',
    rating: 4.6,
    monthlySales: 2100,
    deliveryMin: 25,
    deliveryMax: 40,
    deliveryFee: 2,
    minOrder: 20,
    categories: [
      { id: 'c_hot', name: '主食', products: [{ id: 'kb1', name: '烤肉饭', desc: '双拼可选', price: 22.9, imageEmoji: '🥙', optionGroups: [{ id: 'spicy', name: '辣度', required: true, defaultOptionId: 'sp1', options: [{ id: 'sp0', name: '不辣' }, { id: 'sp1', name: '微辣' }, { id: 'sp2', name: '中辣' }] }] }, { id: 'kb2', name: '酸奶', desc: '冰', price: 6.9, imageEmoji: '🥛' }] },
    ],
  },
  {
    id: 's_curry',
    name: '咖喱屋（南城店）',
    logoEmoji: '🍛',
    rating: 4.6,
    monthlySales: 1200,
    deliveryMin: 28,
    deliveryMax: 45,
    deliveryFee: 3,
    minOrder: 25,
    categories: [
      { id: 'c_hot', name: '咖喱', products: [{ id: 'cu1', name: '鸡排咖喱饭', desc: '香浓', price: 27.9, imageEmoji: '🍛', optionGroups: [{ id: 'spicy', name: '辣度', required: true, defaultOptionId: 'sp1', options: [{ id: 'sp0', name: '不辣' }, { id: 'sp1', name: '微辣' }, { id: 'sp2', name: '中辣' }] }] }, { id: 'cu2', name: '蛋包饭', desc: '日式', price: 25.9, imageEmoji: '🍳' }] },
    ],
  },
  {
    id: 's_bakery',
    name: '面包房（烘焙店）',
    logoEmoji: '🥐',
    rating: 4.7,
    monthlySales: 1900,
    deliveryMin: 18,
    deliveryMax: 30,
    deliveryFee: 2,
    minOrder: 15,
    categories: [
      { id: 'c_hot', name: '烘焙', products: [{ id: 'ba1', name: '黄油可颂', desc: '酥脆', price: 8.9, imageEmoji: '🥐' }, { id: 'ba2', name: '芝士蛋糕', desc: '细腻', price: 16.9, imageEmoji: '🍰' }] },
    ],
  },
  {
    id: 's_seafood',
    name: '海鲜粥铺（海边店）',
    logoEmoji: '🦐',
    rating: 4.6,
    monthlySales: 1100,
    deliveryMin: 25,
    deliveryMax: 45,
    deliveryFee: 3,
    minOrder: 25,
    categories: [
      { id: 'c_hot', name: '粥', products: [{ id: 'sf1', name: '海鲜粥', desc: '虾/贝', price: 28.9, imageEmoji: '🦐' }, { id: 'sf2', name: '皮蛋瘦肉粥', desc: '经典', price: 18.9, imageEmoji: '🥣' }] },
    ],
  },
  {
    id: 's_steak',
    name: '牛排馆（西餐店）',
    logoEmoji: '🥩',
    rating: 4.6,
    monthlySales: 640,
    deliveryMin: 40,
    deliveryMax: 70,
    deliveryFee: 5,
    minOrder: 60,
    categories: [
      { id: 'c_hot', name: '主菜', products: [{ id: 'st1', name: '黑椒牛排', desc: '七分熟', price: 69.0, imageEmoji: '🥩' }, { id: 'st2', name: '意面', desc: '番茄', price: 32.0, imageEmoji: '🍝' }] },
    ],
  },
  {
    id: 's_vegan',
    name: '素食馆（清爽店）',
    logoEmoji: '🥬',
    rating: 4.7,
    monthlySales: 900,
    deliveryMin: 20,
    deliveryMax: 35,
    deliveryFee: 2,
    minOrder: 20,
    categories: [
      { id: 'c_hot', name: '素食', products: [{ id: 'vg1', name: '菌菇盖饭', desc: '清淡', price: 22.9, imageEmoji: '🍄' }, { id: 'vg2', name: '素面', desc: '清汤', price: 18.9, imageEmoji: '🍜' }] },
    ],
  },
  {
    id: 's_chickenrice',
    name: '海南鸡饭（东南亚店）',
    logoEmoji: '🐔',
    rating: 4.7,
    monthlySales: 1300,
    deliveryMin: 25,
    deliveryMax: 40,
    deliveryFee: 2,
    minOrder: 25,
    categories: [
      { id: 'c_hot', name: '主食', products: [{ id: 'hc1', name: '海南鸡饭', desc: '香嫩', price: 28.9, imageEmoji: '🐔' }, { id: 'hc2', name: '冬阴功汤', desc: '酸辣', price: 18.9, imageEmoji: '🍲', optionGroups: [{ id: 'spicy', name: '辣度', required: true, defaultOptionId: 'sp1', options: [{ id: 'sp0', name: '不辣' }, { id: 'sp1', name: '微辣' }, { id: 'sp2', name: '中辣' }] }] }] },
    ],
  },
]

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const sanitizePrice = (n: any) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.round(v * 100) / 100)
}

const normalizeCustomStore = (raw: any, idx: number): TakeoutStore | null => {
  const name = String(raw?.name || '').trim()
  if (!name) return null
  const categoriesRaw = Array.isArray(raw?.categories) ? raw.categories : []
  const categories: TakeoutCategory[] = categoriesRaw
    .map((cat: any, cIdx: number) => {
      const catName = String(cat?.name || '').trim()
      if (!catName) return null
      const productsRaw = Array.isArray(cat?.products) ? cat.products : []
      const products: TakeoutProduct[] = productsRaw
        .map((p: any, pIdx: number) => {
          const pName = String(p?.name || '').trim()
          const price = sanitizePrice(p?.price)
          if (!pName || price <= 0) return null
          return {
            id: String(p?.id || `cp_${Date.now()}_${idx}_${cIdx}_${pIdx}`),
            name: pName,
            desc: String(p?.desc || '').trim(),
            price,
            imageEmoji: String(p?.imageEmoji || '').trim() || '🍽️',
            imageUrl: String(p?.imageUrl || '').trim() || undefined,
            optionGroups: [],
          }
        })
        .filter(Boolean) as TakeoutProduct[]
      if (products.length === 0) return null
      return {
        id: String(cat?.id || `cc_${Date.now()}_${idx}_${cIdx}`),
        name: catName,
        products,
      }
    })
    .filter(Boolean) as TakeoutCategory[]
  if (categories.length === 0) return null
  return {
    id: String(raw?.id || `cs_${Date.now()}_${idx}`),
    name,
    logoEmoji: String(raw?.logoEmoji || '').trim() || '🏪',
    logoUrl: String(raw?.logoUrl || '').trim() || undefined,
    rating: Math.min(5, Math.max(3.8, Number(raw?.rating || 4.8))),
    monthlySales: Math.max(0, Number(raw?.monthlySales || 0) || 0),
    deliveryMin: Math.max(5, Number(raw?.deliveryMin || 18) || 18),
    deliveryMax: Math.max(10, Number(raw?.deliveryMax || 45) || 45),
    deliveryFee: Math.max(0, sanitizePrice(raw?.deliveryFee || 0)),
    minOrder: Math.max(0, sanitizePrice(raw?.minOrder || 0)),
    categories,
  }
}

const encodeSelections = (sel: Record<string, string>) => {
  const keys = Object.keys(sel).sort()
  return keys.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(sel[k])}`).join('&')
}

const decodeSelections = (s: string) => {
  const out: Record<string, string> = {}
  const parts = (s || '').split('&').map((x) => x.trim()).filter(Boolean)
  for (const p of parts) {
    const idx = p.indexOf('=')
    if (idx < 0) continue
    const k = decodeURIComponent(p.slice(0, idx))
    const v = decodeURIComponent(p.slice(idx + 1))
    out[k] = v
  }
  return out
}

const makeCartKey = (storeId: string, productId: string, selections: Record<string, string>) => {
  const encoded = encodeSelections(selections)
  return `${storeId}|${productId}|${encoded}`
}

const parseCartKey = (key: string) => {
  const [storeId, productId, encoded = ''] = String(key || '').split('|')
  return { storeId, productId, selections: decodeSelections(encoded) }
}

export const formatTakeoutOrderText = (order: Pick<TakeoutOrder, 'storeName' | 'lines' | 'total' | 'deliverToName' | 'deliverAddress'>) => {
  const list = order.lines
    .map((l) => {
      const opt = l.options.length > 0 ? `（${l.options.map((o) => o.optionName).join(' / ')}）` : ''
      return `${l.name}${opt} ×${l.qty}`
    })
    .join('、')
  const deliver = order.deliverAddress ? `${order.deliverToName} · ${order.deliverAddress}` : order.deliverToName
  return `店铺：${order.storeName}\n送达：${deliver}\n商品：${list}\n合计：${fmtMoney(order.total)}`
}

export const formatTakeoutBillText = (o: Pick<TakeoutOrder, 'id' | 'storeName' | 'total' | 'createdAt'>) => {
  const t = new Date(o.createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const when = `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`
  return `店铺：${o.storeName}\n实付：${fmtMoney(o.total)}\n支付方式：微信支付\n时间：${when}\n订单号：${o.id.slice(0, 18)}`
}

const formatTakeoutShareText = (o: TakeoutOrder, characterName: string) => {
  const paidByText =
    o.paidBy === 'character'
      ? `${characterName}代付`
      : o.paidBy === 'user'
        ? '我支付'
        : '待支付'
  const statusText =
    o.status === 'awaiting_pay'
      ? '待代付'
      : o.status === 'awaiting_user_pay'
        ? '待我代付'
      : o.status === 'rejected'
        ? '已取消'
        : o.status === 'delivered'
          ? '配送完成'
          : o.status === 'delivering'
            ? '配送中'
            : '—'
  const locationText = o.deliverTo === 'character' ? `${characterName}的位置` : '当前位置'
  const t = new Date(o.createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  const when = `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`
  return (
    `${formatTakeoutOrderText(o)}\n` +
    `配送位置：${locationText}\n` +
    `付款：${paidByText}\n` +
    `状态：${statusText}\n` +
    `时间：${when}\n` +
    `订单号：${String(o.id || '').slice(0, 18)}`
  )
}

type Props = {
  character: { id: string; name: string; relationship?: string }
  selfName: string
  hasApiConfig: boolean
  callLLM: (messages: any[], model?: any, options?: any) => Promise<string>
  onBack: () => void
  onDone: () => void
  onInfo: (title: string, message: string) => void
  takeoutCart: Record<string, number>
  setTakeoutCart: (next: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void
  takeoutOrder: TakeoutOrder | null
  setTakeoutOrder: (next: TakeoutOrder | null | ((prev: TakeoutOrder | null) => TakeoutOrder | null)) => void
  takeoutNow: number
  takeoutHistory: TakeoutOrder[]
  setTakeoutHistory: (next: TakeoutOrder[] | ((prev: TakeoutOrder[]) => TakeoutOrder[])) => void
  walletBalance: number
  updateWalletBalance: (amount: number) => void
  addWalletBill: (bill: {
    type: 'transfer_in' | 'transfer_out' | 'shopping' | 'dice_init' | 'fund_buy' | 'fund_sell'
    amount: number
    description: string
    relatedCharacterId?: string
  }) => void
  pushUserCard: (body: string) => void
}

export default function TakeoutPanel(props: Props) {
  const {
    character,
    selfName,
    hasApiConfig,
    onBack,
    onDone,
    onInfo,
    takeoutCart,
    setTakeoutCart,
    takeoutOrder,
    setTakeoutOrder,
    takeoutNow,
    takeoutHistory,
    setTakeoutHistory,
    walletBalance,
    updateWalletBalance,
    addWalletBill,
    pushUserCard,
  } = props

  const [activeStoreId, setActiveStoreId] = useState<string | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)

  // 送达位置：当前位置 / TA的位置（按角色记忆）
  const [locOpen, setLocOpen] = useState(false)
  const [deliverTo, setDeliverTo] = useState<'user' | 'character'>('user')
  const [characterAddress, setCharacterAddress] = useState('')

  const [specOpen, setSpecOpen] = useState(false)
  const [specProduct, setSpecProduct] = useState<TakeoutProduct | null>(null)
  const [specStore, setSpecStore] = useState<TakeoutStore | null>(null)
  const [specSel, setSpecSel] = useState<Record<string, string>>({})
  const [selfPayConfirmOpen, setSelfPayConfirmOpen] = useState(false)
  const [selfPayPendingBase, setSelfPayPendingBase] = useState<Omit<TakeoutOrder, 'etaMinutes' | 'deliverAt' | 'status'> | null>(null)
  const [customStores, setCustomStores] = useState<TakeoutStore[]>([])
  const [pinnedStoreIds, setPinnedStoreIds] = useState<string[]>([])
  const [storesHydrated, setStoresHydrated] = useState(false)
  const [createStoreOpen, setCreateStoreOpen] = useState(false)
  const [storeDraftName, setStoreDraftName] = useState('')
  const [storeDraftLogoUrl, setStoreDraftLogoUrl] = useState('')
  const [storeDraftCategories, setStoreDraftCategories] = useState<
    Array<{
      id: string
      name: string
      products: Array<{ id: string; name: string; desc?: string; price: number; imageUrl?: string }>
    }>
  >([])

  const canPortal = typeof document !== 'undefined' && !!document.body

  const allStores = useMemo(() => {
    const merged = [...STORES, ...customStores]
    const pinned = new Set(pinnedStoreIds)
    return merged.slice().sort((a, b) => {
      const ap = pinned.has(a.id) ? 1 : 0
      const bp = pinned.has(b.id) ? 1 : 0
      if (ap !== bp) return bp - ap
      return a.name.localeCompare(b.name, 'zh-CN')
    })
  }, [customStores, pinnedStoreIds])

  useEffect(() => {
    try {
      const t = localStorage.getItem(`lp_takeout_deliver_to_${character.id}`)
      const a = localStorage.getItem(`lp_takeout_character_addr_${character.id}`)
      if (t === 'character' || t === 'user') setDeliverTo(t)
      if (typeof a === 'string') setCharacterAddress(a)
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id])

  useEffect(() => {
    try {
      localStorage.setItem(`lp_takeout_deliver_to_${character.id}`, deliverTo)
      localStorage.setItem(`lp_takeout_character_addr_${character.id}`, characterAddress)
    } catch {
      // ignore
    }
  }, [character.id, deliverTo, characterAddress])

  useEffect(() => {
    try {
      const rawStores = safeParse<any[]>(localStorage.getItem(TAKEOUT_CUSTOM_STORES_KEY), [])
      const parsed = rawStores
        .map((s, idx) => normalizeCustomStore(s, idx))
        .filter(Boolean) as TakeoutStore[]
      setCustomStores(parsed)
      const pin = safeParse<string[]>(localStorage.getItem(TAKEOUT_PINNED_STORES_KEY), [])
      setPinnedStoreIds(Array.isArray(pin) ? pin.filter(Boolean) : [])
    } catch {
      setCustomStores([])
      setPinnedStoreIds([])
    } finally {
      setStoresHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!storesHydrated) return
    try {
      localStorage.setItem(TAKEOUT_CUSTOM_STORES_KEY, JSON.stringify(customStores))
    } catch {
      // ignore
    }
  }, [customStores, storesHydrated])

  useEffect(() => {
    if (!storesHydrated) return
    try {
      localStorage.setItem(TAKEOUT_PINNED_STORES_KEY, JSON.stringify(pinnedStoreIds))
    } catch {
      // ignore
    }
  }, [pinnedStoreIds, storesHydrated])

  const resetStoreDraft = () => {
    setStoreDraftName('')
    setStoreDraftLogoUrl('')
    setStoreDraftCategories([
      {
        id: `dc_${Date.now()}_0`,
        name: '推荐',
        products: [{ id: `dp_${Date.now()}_0`, name: '', price: 0, desc: '', imageUrl: '' }],
      },
    ])
  }

  const togglePinnedStore = (storeId: string) => {
    setPinnedStoreIds((prev) => {
      const set = new Set(Array.isArray(prev) ? prev : [])
      if (set.has(storeId)) set.delete(storeId)
      else set.add(storeId)
      return Array.from(set)
    })
  }

  const saveCustomStore = () => {
    const name = String(storeDraftName || '').trim()
    if (!name) {
      onInfo('请填写店铺名', '店铺名称不能为空。')
      return
    }
    const normalizedCategories: TakeoutCategory[] = storeDraftCategories
      .map((cat, cIdx) => {
        const catName = String(cat?.name || '').trim()
        if (!catName) return null
        const products: TakeoutProduct[] = (Array.isArray(cat?.products) ? cat.products : [])
          .map((p, pIdx) => {
            const pName = String(p?.name || '').trim()
            const price = sanitizePrice(p?.price)
            if (!pName || price <= 0) return null
            return {
              id: p?.id || `cp_${Date.now()}_${cIdx}_${pIdx}`,
              name: pName,
              desc: String(p?.desc || '').trim(),
              price,
              imageEmoji: '🛍️',
              imageUrl: String(p?.imageUrl || '').trim() || undefined,
              optionGroups: [],
            }
          })
          .filter(Boolean) as TakeoutProduct[]
        if (products.length === 0) return null
        return {
          id: cat.id || `cc_${Date.now()}_${cIdx}`,
          name: catName,
          products,
        }
      })
      .filter(Boolean) as TakeoutCategory[]
    if (normalizedCategories.length === 0) {
      onInfo('请添加商品', '至少添加一个有效商品（名称 + 价格）。')
      return
    }
    const id = `custom_store_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const next: TakeoutStore = {
      id,
      name,
      logoEmoji: '🏪',
      logoUrl: String(storeDraftLogoUrl || '').trim() || undefined,
      rating: 4.9,
      monthlySales: 0,
      deliveryMin: 15,
      deliveryMax: 45,
      deliveryFee: 0,
      minOrder: 0,
      categories: normalizedCategories,
    }
    setCustomStores((prev) => [next, ...(Array.isArray(prev) ? prev : [])])
    setPinnedStoreIds((prev) => Array.from(new Set([id, ...(Array.isArray(prev) ? prev : [])])))
    setCreateStoreOpen(false)
    resetStoreDraft()
    onInfo('创建成功', '店铺已保存到其他店铺列表，你可以直接点单或分享。')
  }

  const cartStoreId = useMemo(() => {
    const keys = Object.keys(takeoutCart || {})
    for (const k of keys) {
      const qty = Math.max(0, Number(takeoutCart[k] || 0) || 0)
      if (qty <= 0) continue
      const parsed = parseCartKey(k)
      if (parsed.storeId) return parsed.storeId
    }
    return null
  }, [takeoutCart, allStores])

  const store = useMemo(() => {
    return activeStoreId ? allStores.find((s) => s.id === activeStoreId) || null : null
  }, [activeStoreId, allStores])

  useEffect(() => {
    if (!store) return
    if (!activeCategoryId) setActiveCategoryId(store.categories[0]?.id || null)
  }, [store?.id])

  const isDelivering = takeoutOrder?.status === 'delivering'
  const remainingMs = isDelivering && takeoutOrder ? Math.max(0, takeoutOrder.deliverAt - takeoutNow) : 0
  const remainingMin = Math.floor(remainingMs / 60000)
  const remainingSec = Math.floor((remainingMs % 60000) / 1000)

  const cartLines = useMemo(() => {
    const out: TakeoutOrderLine[] = []
    const entries = Object.entries(takeoutCart || {})
    for (const [key, qty0] of entries) {
      const qty = Math.max(0, Number(qty0 || 0) || 0)
      if (qty <= 0) continue
      const { storeId, productId, selections } = parseCartKey(key)
      const st = allStores.find((s) => s.id === storeId)
      if (!st) continue
      const prod =
        st.categories.flatMap((c) => c.products).find((p) => p.id === productId) || null
      if (!prod) continue

      const optionGroups = prod.optionGroups || []
      const opts: TakeoutOrderLine['options'] = []
      for (const g of optionGroups) {
        const picked = selections[g.id] || g.defaultOptionId || ''
        if (!picked) continue
        const o = g.options.find((x) => x.id === picked)
        if (!o) continue
        opts.push({
          groupId: g.id,
          groupName: g.name,
          optionId: o.id,
          optionName: o.name,
          priceDelta: Number(o.priceDelta || 0) || 0,
        })
      }

      out.push({
        storeId: st.id,
        storeName: st.name,
        productId: prod.id,
        name: prod.name,
        basePrice: prod.price,
        qty,
        options: opts,
      })
    }
    return out
  }, [takeoutCart])

  const cartTotal = useMemo(() => {
    return cartLines.reduce((sum, l) => {
      const optDelta = l.options.reduce((s, o) => s + (Number(o.priceDelta || 0) || 0), 0)
      return sum + (l.basePrice + optDelta) * l.qty
    }, 0)
  }, [cartLines])

  const cartCount = useMemo(() => cartLines.reduce((s, l) => s + l.qty, 0), [cartLines])

  const clearAll = () => {
    setTakeoutCart({})
    setTakeoutOrder(null)
  }

  const upsertHistory = (o: TakeoutOrder) => {
    if (!o?.id) return
    setTakeoutHistory((prev) => {
      const list = Array.isArray(prev) ? prev : []
      const idx = list.findIndex((x) => x?.id === o.id)
      const next =
        idx >= 0
          ? [...list.slice(0, idx), { ...list[idx], ...o }, ...list.slice(idx + 1)]
          : [o, ...list]
      const sigOf = (it: any) => {
        const createdAt = Number(it?.createdAt || 0) || 0
        const bucket = Math.floor(createdAt / 2000)
        const total = Number(it?.total || 0) || 0
        const lines = Array.isArray(it?.lines) ? it.lines : []
        const linesSig = lines
          .map((l: any) => {
            const opts = Array.isArray(l?.options) ? l.options : []
            const optSig = opts
              .map((o: any) => `${String(o?.groupId || '')}=${String(o?.optionId || '')}`)
              .sort()
              .join(',')
            return `${String(l?.storeId || '')}:${String(l?.productId || '')}:${Number(l?.qty || 0) || 0}:${optSig}`
          })
          .sort()
          .join('|')
        return `${String(it?.storeId || '')}#${bucket}#${total.toFixed(2)}#${String(it?.deliverTo || '')}#${linesSig}`
      }
      const seenId = new Set<string>()
      const seenSig = new Set<string>()
      const uniq: TakeoutOrder[] = []
      for (const it of next) {
        const id = String((it as any)?.id || '').trim()
        if (!id) continue
        if (seenId.has(id)) continue
        const sig = sigOf(it)
        if (seenSig.has(sig)) continue
        seenId.add(id)
        seenSig.add(sig)
        uniq.push(it)
      }
      return uniq.slice(0, 30)
    })
  }

  const fmtWhen = (ts: number) => {
    const d = new Date(ts)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const cartFromOrder = (o: TakeoutOrder) => {
    const next: Record<string, number> = {}
    for (const l of o.lines || []) {
      const sel: Record<string, string> = {}
      for (const op of l.options || []) {
        if (!op?.groupId || !op?.optionId) continue
        sel[op.groupId] = op.optionId
      }
      const key = makeCartKey(l.storeId, l.productId, sel)
      next[key] = Math.max(0, Number(l.qty || 0) || 0)
    }
    return next
  }

  const renderHistoryModal = () => {
    if (!historyOpen) return null
    const now = Date.now()
    const list = (Array.isArray(takeoutHistory) ? takeoutHistory : [])
      .map((o) => {
        if (!o) return o
        if (o.status === 'delivering' && o.deliverAt && now >= o.deliverAt) {
          return { ...o, status: 'delivered' as const }
        }
        return o
      })
      .filter(Boolean)
      // 兜底去重：避免同一订单出现两条
      .filter((o, idx, arr) => arr.findIndex((x) => x?.id === o?.id) === idx) as TakeoutOrder[]

    return (
      <div className="fixed inset-0 z-[10050] flex items-end justify-center">
        <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setHistoryOpen(false)} />
        <div className="relative w-full max-w-md bg-white rounded-t-2xl p-4 pb-6">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-semibold text-gray-900">历史订单</div>
            <button type="button" onClick={() => setHistoryOpen(false)} className="text-gray-400">
              ✕
            </button>
          </div>

          <div className="mt-3 max-h-[55vh] overflow-y-auto pr-1 space-y-2">
            {list.length === 0 && <div className="text-center text-[12px] text-gray-500 py-10">暂无历史订单</div>}
            {list.map((o) => {
              const stText =
                o.status === 'awaiting_pay'
                  ? '待代付'
                  : o.status === 'awaiting_user_pay'
                    ? '待我代付'
                  : o.status === 'rejected'
                    ? '已取消'
                    : o.status === 'delivered'
                      ? '配送完成'
                      : o.status === 'delivering'
                        ? '配送中'
                        : '—'
              const stColor =
                o.status === 'delivering'
                  ? 'text-[#07C160]'
                  : o.status === 'delivered'
                    ? 'text-[#10b981]'
                    : o.status === 'awaiting_pay'
                      ? 'text-[#f59e0b]'
                      : o.status === 'awaiting_user_pay'
                        ? 'text-[#3b82f6]'
                      : o.status === 'rejected'
                        ? 'text-red-500'
                        : 'text-gray-500'
              return (
                <div key={o.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-gray-900 truncate">{o.storeName || '（未知店铺）'}</div>
                      <div className="mt-0.5 text-[11px] text-gray-500">{fmtWhen(o.createdAt)}</div>
                    </div>
                    <div className={`text-[12px] font-semibold ${stColor}`}>{stText}</div>
                  </div>
                  <div className="mt-2 text-[11px] text-gray-600 whitespace-pre-wrap">
                    {formatTakeoutOrderText({
                      storeName: o.storeName,
                      lines: o.lines,
                      total: o.total,
                      deliverToName: o.deliverToName,
                      deliverAddress: o.deliverAddress,
                    })}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    付款：{o.paidBy === 'character' ? `${character.name}代付` : o.paidBy === 'user' ? '我支付' : '待支付'}
                  </div>

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTakeoutOrder(o)
                        setHistoryOpen(false)
                      }}
                      className="flex-1 py-2 rounded-lg bg-white border border-gray-200 text-gray-800 text-[12px] font-semibold active:scale-[0.99]"
                    >
                      查看配送
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTakeoutCart(cartFromOrder(o))
                        setTakeoutOrder(null)
                        setActiveStoreId(o.storeId || null)
                        setActiveCategoryId(null)
                        setHistoryOpen(false)
                      }}
                      className="flex-1 py-2 rounded-lg bg-black text-white text-[12px] font-semibold active:scale-[0.99]"
                    >
                      再来一单
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        pushUserCard(`[外卖订单分享]\n${formatTakeoutShareText(o, character.name)}`)
                        setHistoryOpen(false)
                        onDone()
                      }}
                      className="flex-1 py-2 rounded-lg bg-[#07C160] text-white text-[12px] font-semibold active:scale-[0.99]"
                    >
                      分享
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const ensureStore = (nextStoreId: string) => {
    if (!cartStoreId || cartStoreId === nextStoreId) return true
    // 美团实际是每次只能一家店；这里也锁定单店，避免“跨店购物车”让逻辑膨胀
    onInfo('购物车来自其它店铺', '一次下单只能选择一家店铺，我已帮你清空购物车并切换店铺。')
    setTakeoutCart({})
    return true
  }

  const openSpec = (st: TakeoutStore, prod: TakeoutProduct) => {
    if (!ensureStore(st.id)) return
    const optionGroups = prod.optionGroups || []
    const init: Record<string, string> = {}
    for (const g of optionGroups) {
      const def = g.defaultOptionId || g.options[0]?.id || ''
      if (def) init[g.id] = def
    }
    setSpecStore(st)
    setSpecProduct(prod)
    setSpecSel(init)
    setSpecOpen(true)
  }

  const addToCart = (st: TakeoutStore, prod: TakeoutProduct, sel: Record<string, string>) => {
    const optionGroups = prod.optionGroups || []
    // required 校验
    for (const g of optionGroups) {
      if (g.required) {
        const v = sel[g.id] || ''
        if (!v) {
          onInfo('请选择规格', `请先选择「${g.name}」`)
          return
        }
      }
    }
    const key = makeCartKey(st.id, prod.id, sel)
    setTakeoutCart((prev) => ({ ...prev, [key]: (Number(prev[key] || 0) || 0) + 1 }))
  }

  const decCartKey = (key: string) => {
    setTakeoutCart((prev) => {
      const next = { ...(prev || {}) }
      const n = Math.max(0, (Number(next[key] || 0) || 0) - 1)
      if (n <= 0) delete next[key]
      else next[key] = n
      return next
    })
  }

  const incCartKey = (key: string) => {
    setTakeoutCart((prev) => ({ ...(prev || {}), [key]: (Number(prev[key] || 0) || 0) + 1 }))
  }

  const startDelivery = (orderBase: Omit<TakeoutOrder, 'etaMinutes' | 'deliverAt' | 'status'>) => {
    const eta = 15 + Math.floor(Math.random() * 26) // 15~40
    const deliverAt = Date.now() + eta * 60 * 1000
    const next: TakeoutOrder = { ...orderBase, etaMinutes: eta, deliverAt, status: 'delivering' }
    setTakeoutOrder(next)
    return next
  }

  const makeBaseOrder = () => {
    if (cartLines.length === 0) return null
    const stId = cartLines[0]?.storeId
    const stName = cartLines[0]?.storeName
    if (!stId || !stName) return null

    const me = String(selfName || '我').trim() || '我'
    const deliverToName = deliverTo === 'character' ? character.name : me
    const deliverAddress = deliverTo === 'character' ? `${character.name}的位置` : `${me}当前位置`
    const base: Omit<TakeoutOrder, 'etaMinutes' | 'deliverAt' | 'status'> = {
      id: `to_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: Date.now(),
      storeId: stId,
      storeName: stName,
      deliverTo,
      deliverToName,
      deliverAddress,
      lines: cartLines,
      total: cartTotal,
      paidBy: null,
    }
    return base
  }

  // 配送页（如果已有配送中的订单：优先展示）
  if (takeoutOrder && (takeoutOrder.status === 'delivering' || takeoutOrder.status === 'delivered')) {
    const statusText =
      takeoutOrder.status === 'delivered' ? '订单已送达' : '骑手配送中'

    const etaText =
      takeoutOrder.status === 'delivering'
        ? `预计 ${remainingMin}分${String(remainingSec).padStart(2, '0')}秒`
        : `预计 ${takeoutOrder.etaMinutes} 分钟`

    return (
      <div className="bg-white/90 rounded-xl overflow-hidden flex flex-col h-[78vh]">
        <div className="px-3 py-2 flex items-center justify-between bg-gradient-to-r from-[#FFD21E] to-[#FFB020]">
          <button type="button" onClick={onBack} className="text-black/70 active:scale-95">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-sm font-semibold text-black/85">外卖配送</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setHistoryOpen(true)} className="text-[12px] text-black/70">
              历史
            </button>
            <button type="button" onClick={clearAll} className="text-[12px] text-black/70">
              清空
            </button>
          </div>
        </div>

        <div className="p-3 space-y-3 overflow-hidden flex-1 flex flex-col">
          <div className="rounded-xl bg-white border border-black/5 p-3">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-gray-900">{statusText}</div>
              <div className="text-[12px] text-gray-600">{etaText}</div>
            </div>
            <div className="mt-2 text-[12px] text-gray-700 whitespace-pre-wrap">
              {formatTakeoutOrderText(takeoutOrder)}
            </div>
            <div className="mt-2 text-[11px] text-gray-500">
              付款：{takeoutOrder.paidBy === 'character' ? `${character.name}已代付` : '我已支付'}
            </div>
          </div>

          <div
            className="flex-1 overflow-hidden rounded-xl border border-gray-100 bg-gradient-to-br from-[#fff7cc] via-[#fef3c7] to-[#ffedd5] relative"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0, rgba(0,0,0,0.06) 1px, rgba(255,255,255,0) 1px, rgba(255,255,255,0) 18px), ' +
                'repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0, rgba(0,0,0,0.06) 1px, rgba(255,255,255,0) 1px, rgba(255,255,255,0) 18px), ' +
                'radial-gradient(circle at 25% 35%, rgba(255,255,255,0.9), transparent 55%), radial-gradient(circle at 75% 60%, rgba(255,255,255,0.7), transparent 60%)',
            }}
          >
            <div className="absolute inset-0">
              <div className="absolute left-6 top-10 w-2.5 h-2.5 rounded-full bg-green-600 ring-4 ring-green-200" />
              <div className="absolute right-10 bottom-12 w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-red-200" />
              <div className="absolute left-8 top-12 right-12 bottom-14 border-2 border-dashed border-black/15 rounded-3xl" />
              <div className="absolute left-10 top-16 text-[10px] text-black/55">商家</div>
              <div className="absolute right-10 bottom-16 text-[10px] text-black/55">你</div>
              {takeoutOrder.status === 'delivering' && (
                <div
                  className="absolute w-7 h-7 rounded-full bg-white/80 border border-black/10 flex items-center justify-center text-[12px] shadow-sm"
                  style={{
                    left: `${28 + Math.min(62, Math.max(0, (1 - remainingMs / (takeoutOrder.etaMinutes * 60 * 1000)) * 62))}%`,
                    top: `${28 + Math.min(52, Math.max(0, (1 - remainingMs / (takeoutOrder.etaMinutes * 60 * 1000)) * 52))}%`,
                  }}
                >
                  🛵
                </div>
              )}
            </div>
            <div className="absolute bottom-2 left-2 right-2 rounded-xl bg-white/80 border border-white/60 px-3 py-2 text-[12px] text-gray-700">
              {takeoutOrder.status === 'delivering'
                ? `配送中… ${remainingMin}分${String(remainingSec).padStart(2, '0')}秒`
                : takeoutOrder.status === 'delivered'
                  ? '已送达'
                  : '已取消'}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTakeoutOrder(null)}
              className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-800 text-sm font-medium active:scale-[0.99]"
            >
              返回点单
            </button>
            <button
              type="button"
              onClick={() => {
                clearAll()
                setActiveStoreId(null)
                setActiveCategoryId(null)
              }}
              className="flex-1 py-2 rounded-lg bg-black text-white text-sm font-medium active:scale-[0.99]"
            >
              再来一单
            </button>
          </div>
        </div>
        {createStoreOpen && (
          <div className="fixed inset-0 z-[12000] flex items-end justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              onClick={() => setCreateStoreOpen(false)}
            />
            <div className="relative w-full max-w-md bg-white rounded-t-2xl p-4 pb-6 max-h-[86vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="text-[15px] font-semibold text-gray-900">创建店铺</div>
                <button type="button" onClick={() => setCreateStoreOpen(false)} className="text-gray-400">✕</button>
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-[12px] text-gray-600 mb-1">店铺名称</div>
                  <input
                    value={storeDraftName}
                    onChange={(e) => setStoreDraftName(e.target.value)}
                    placeholder="例如：晚风美妆店 / 深夜零食铺"
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-[13px] outline-none"
                  />
                </div>
                <div>
                  <div className="text-[12px] text-gray-600 mb-1">店铺图片</div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      void (async () => {
                        try {
                          const url = await fileToCompressedDataUrl(file)
                          setStoreDraftLogoUrl(String(url || ''))
                        } catch {
                          onInfo('图片读取失败', '店铺图片处理失败，请重试。')
                        }
                      })()
                    }}
                    className="block w-full text-[12px]"
                  />
                  {storeDraftLogoUrl ? <img src={storeDraftLogoUrl} alt="" className="mt-2 w-14 h-14 rounded-lg object-cover border border-gray-100" /> : null}
                </div>

                <div className="pt-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[12px] text-gray-700 font-semibold">商品分类</div>
                    <button
                      type="button"
                      onClick={() =>
                        setStoreDraftCategories((prev) => [
                          ...prev,
                          { id: `dc_${Date.now()}_${prev.length}`, name: '', products: [{ id: `dp_${Date.now()}_0`, name: '', price: 0, desc: '', imageUrl: '' }] },
                        ])
                      }
                      className="px-2.5 py-1 rounded-full bg-gray-100 text-[11px] text-gray-700"
                    >
                      + 分类
                    </button>
                  </div>

                  <div className="space-y-2">
                    {storeDraftCategories.map((cat, cIdx) => (
                      <div key={cat.id} className="rounded-xl border border-gray-100 bg-gray-50 p-2.5">
                        <div className="flex items-center gap-2">
                          <input
                            value={cat.name}
                            onChange={(e) =>
                              setStoreDraftCategories((prev) => prev.map((x, i) => (i === cIdx ? { ...x, name: e.target.value } : x)))
                            }
                            placeholder="分类名，例如：主食 / 饮品 / 美妆"
                            className="flex-1 px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-[12px] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setStoreDraftCategories((prev) => prev.filter((_, i) => i !== cIdx))}
                            className="px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] text-gray-500"
                          >
                            删除
                          </button>
                        </div>

                        <div className="mt-2 space-y-2">
                          {cat.products.map((p, pIdx) => (
                            <div key={p.id} className="rounded-lg bg-white border border-gray-100 p-2">
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  value={p.name}
                                  onChange={(e) =>
                                    setStoreDraftCategories((prev) =>
                                      prev.map((x, i) =>
                                        i === cIdx
                                          ? {
                                              ...x,
                                              products: x.products.map((it, j) => (j === pIdx ? { ...it, name: e.target.value } : it)),
                                            }
                                          : x
                                      )
                                    )
                                  }
                                  placeholder="商品名"
                                  className="px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[12px] outline-none"
                                />
                                <input
                                  value={String(p.price || '')}
                                  onChange={(e) =>
                                    setStoreDraftCategories((prev) =>
                                      prev.map((x, i) =>
                                        i === cIdx
                                          ? {
                                              ...x,
                                              products: x.products.map((it, j) => (j === pIdx ? { ...it, price: Number(e.target.value) || 0 } : it)),
                                            }
                                          : x
                                      )
                                    )
                                  }
                                  placeholder="价格"
                                  className="px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[12px] outline-none"
                                />
                              </div>
                              <input
                                value={p.desc || ''}
                                onChange={(e) =>
                                  setStoreDraftCategories((prev) =>
                                    prev.map((x, i) =>
                                      i === cIdx
                                        ? {
                                            ...x,
                                            products: x.products.map((it, j) => (j === pIdx ? { ...it, desc: e.target.value } : it)),
                                          }
                                        : x
                                    )
                                  )
                                }
                                placeholder="商品描述（可选）"
                                className="mt-2 w-full px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[12px] outline-none"
                              />
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (!file) return
                                    void (async () => {
                                      try {
                                        const url = await fileToCompressedDataUrl(file)
                                        setStoreDraftCategories((prev) =>
                                          prev.map((x, i) =>
                                            i === cIdx
                                              ? {
                                                  ...x,
                                                  products: x.products.map((it, j) => (j === pIdx ? { ...it, imageUrl: String(url || '') } : it)),
                                                }
                                              : x
                                          )
                                        )
                                      } catch {
                                        onInfo('图片读取失败', '商品图片处理失败，请重试。')
                                      }
                                    })()
                                  }}
                                  className="block w-full text-[11px]"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStoreDraftCategories((prev) =>
                                      prev.map((x, i) =>
                                        i === cIdx ? { ...x, products: x.products.filter((_, j) => j !== pIdx) } : x
                                      )
                                    )
                                  }
                                  className="px-2 py-1 rounded-lg bg-gray-100 text-[11px] text-gray-500"
                                >
                                  删商品
                                </button>
                              </div>
                              {p.imageUrl ? <img src={p.imageUrl} alt="" className="mt-2 w-12 h-12 rounded-md object-cover border border-gray-100" /> : null}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              setStoreDraftCategories((prev) =>
                                prev.map((x, i) =>
                                  i === cIdx
                                    ? {
                                        ...x,
                                        products: [
                                          ...x.products,
                                          { id: `dp_${Date.now()}_${x.products.length}`, name: '', price: 0, desc: '', imageUrl: '' },
                                        ],
                                      }
                                    : x
                                )
                              )
                            }
                            className="w-full py-1.5 rounded-lg bg-gray-100 text-[11px] text-gray-700"
                          >
                            + 商品
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreateStoreOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={saveCustomStore}
                  className="flex-1 py-2.5 rounded-xl bg-[#07C160] text-white text-sm"
                >
                  保存店铺
                </button>
              </div>
            </div>
          </div>
        )}
        {renderHistoryModal()}
      </div>
    )
  }

  const formatTakeoutPayRequestText = (o: Omit<TakeoutOrder, 'etaMinutes' | 'deliverAt' | 'status'>) => {
    const goods = (o.lines || [])
      .map((l) => {
        const opt = (l.options || []).length > 0 ? `（${(l.options || []).map((x) => x.optionName).join(' / ')}）` : ''
        return `${l.name}${opt} ×${l.qty}`
      })
      .join('、')
    const locationText = o.deliverTo === 'character' ? `${character.name}的位置` : `${selfName || '我'}当前位置`
    return (
      `店铺：${o.storeName}\n` +
      `商品：${goods}\n` +
      `合计：${fmtMoney(o.total)}\n` +
      `收货人：${o.deliverToName}\n` +
      `配送位置：${locationText}\n` +
      `配送地址：${o.deliverAddress}\n` +
      `付款人：${character.name}（代付中）`
    )
  }

  // 店铺列表页
  if (!store) {
    const filtered = allStores.filter((s) => {
      const k = keyword.trim()
      if (!k) return true
      return s.name.includes(k)
    })
    return (
      <div className="bg-white/90 rounded-xl overflow-hidden flex flex-col h-[78vh]">
        <div className="px-3 py-2 flex items-center justify-between bg-gradient-to-r from-[#FFD21E] to-[#FFB020]">
          <button type="button" onClick={onBack} className="text-black/70 active:scale-95">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-sm font-semibold text-black/85">袋鼠外卖</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setHistoryOpen(true)} className="text-[12px] text-black/70">
              历史
            </button>
            <button type="button" onClick={clearAll} className="text-[12px] text-black/70">
              清空
            </button>
          </div>
        </div>

        <div className="p-3 space-y-2 overflow-hidden flex-1 flex flex-col">
          <div className="rounded-xl bg-white/70 border border-black/5 p-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索店铺"
                  className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-[13px] outline-none"
                />
              </div>
            </div>

          </div>

          <div className="rounded-xl bg-gradient-to-r from-[#fff7cc] to-[#ffe8b8] border border-black/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] font-semibold text-gray-900">今日推荐</div>
              <button
                type="button"
                onClick={() => {}}
                className="px-2.5 py-1 rounded-full bg-white border border-black/10 text-[11px] text-gray-700"
                style={{ display: 'none' }}
              >
                + 添加店铺
              </button>
            </div>
            <div className="text-[12px] text-gray-700 mt-1">点你想吃的，马上送到。</div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {filtered.map((s) => {
              const pinned = pinnedStoreIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    ensureStore(s.id)
                    setActiveStoreId(s.id)
                    setActiveCategoryId(s.categories[0]?.id || null)
                  }}
                  className="w-full text-left rounded-xl bg-white border border-gray-100 p-3 active:scale-[0.995]"
                >
                  <div className="flex gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#FFF7CC] overflow-hidden flex items-center justify-center text-2xl border border-black/5">
                      {s.logoUrl ? <img src={s.logoUrl} alt="" className="w-full h-full object-cover" /> : s.logoEmoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-semibold text-gray-900 truncate">{s.name}</div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              togglePinnedStore(s.id)
                            }}
                            className={`px-2 py-0.5 rounded-full text-[10px] border ${
                              pinned ? 'bg-[#fff4ce] border-[#f5d66a] text-[#9a6b00]' : 'bg-white border-gray-200 text-gray-500'
                            }`}
                          >
                            {pinned ? '已置顶' : '置顶'}
                          </button>
                          <div className="text-[11px] text-gray-500">{s.rating.toFixed(1)}分</div>
                        </div>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        月售 {s.monthlySales} ｜ {s.deliveryMin}-{s.deliveryMax} 分钟 ｜ 配送 {fmtMoney(s.deliveryFee)}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">起送 {fmtMoney(s.minOrder)}</div>
                    </div>
                  </div>
                </button>
              )
            })}
            {filtered.length === 0 && <div className="text-center text-[12px] text-gray-500 py-10">没有找到店铺</div>}
            <button
              type="button"
              onClick={() => {
                resetStoreDraft()
                setCreateStoreOpen(true)
              }}
              className="w-full py-2.5 rounded-xl bg-white border border-dashed border-black/20 text-[12px] text-gray-700"
            >
              + 添加店铺
            </button>
          </div>

          {cartCount > 0 && (
            <div className="rounded-xl bg-black text-white p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center relative">
                  🛒
                  <div className="absolute -top-1 -right-1 text-[10px] bg-[#07C160] text-white rounded-full px-1.5 py-0.5">
                    {cartCount}
                  </div>
                </div>
                <div className="text-[12px]">
                  <div className="font-semibold">{fmtMoney(cartTotal)}</div>
                  <div className="text-white/70">已选商品</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const stId = cartStoreId
                  const st = allStores.find((x) => x.id === stId)
                  if (st) {
                    setActiveStoreId(st.id)
                    setActiveCategoryId(st.categories[0]?.id || null)
                  } else {
                    onInfo('购物车', '当前购物车店铺信息异常，已帮你清空。')
                    setTakeoutCart({})
                  }
                }}
                className="text-[12px] font-semibold bg-white/10 px-3 py-2 rounded-lg active:scale-[0.99]"
              >
                去结算
              </button>
            </div>
          )}
        </div>
        {createStoreOpen && (
          <div className="fixed inset-0 z-[12000] flex items-end justify-center">
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              onClick={() => setCreateStoreOpen(false)}
            />
            <div className="relative w-full max-w-md bg-white rounded-t-2xl p-4 pb-6 max-h-[86vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="text-[15px] font-semibold text-gray-900">创建店铺</div>
                <button type="button" onClick={() => setCreateStoreOpen(false)} className="text-gray-400">✕</button>
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-[12px] text-gray-600 mb-1">店铺名称</div>
                  <input
                    value={storeDraftName}
                    onChange={(e) => setStoreDraftName(e.target.value)}
                    placeholder="例如：晚风美妆店 / 深夜零食铺"
                    className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 text-[13px] outline-none"
                  />
                </div>
                <div>
                  <div className="text-[12px] text-gray-600 mb-1">店铺图片</div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      void (async () => {
                        try {
                          const url = await fileToCompressedDataUrl(file)
                          setStoreDraftLogoUrl(String(url || ''))
                        } catch {
                          onInfo('图片读取失败', '店铺图片处理失败，请重试。')
                        }
                      })()
                    }}
                    className="block w-full text-[12px]"
                  />
                  {storeDraftLogoUrl ? <img src={storeDraftLogoUrl} alt="" className="mt-2 w-14 h-14 rounded-lg object-cover border border-gray-100" /> : null}
                </div>
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[12px] text-gray-700 font-semibold">商品分类</div>
                    <button
                      type="button"
                      onClick={() =>
                        setStoreDraftCategories((prev) => [
                          ...prev,
                          { id: `dc_${Date.now()}_${prev.length}`, name: '', products: [{ id: `dp_${Date.now()}_0`, name: '', price: 0, desc: '', imageUrl: '' }] },
                        ])
                      }
                      className="px-2.5 py-1 rounded-full bg-gray-100 text-[11px] text-gray-700"
                    >
                      + 分类
                    </button>
                  </div>
                  <div className="space-y-2">
                    {storeDraftCategories.map((cat, cIdx) => (
                      <div key={cat.id} className="rounded-xl border border-gray-100 bg-gray-50 p-2.5">
                        <div className="flex items-center gap-2">
                          <input
                            value={cat.name}
                            onChange={(e) => setStoreDraftCategories((prev) => prev.map((x, i) => (i === cIdx ? { ...x, name: e.target.value } : x)))}
                            placeholder="分类名"
                            className="flex-1 px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-[12px] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setStoreDraftCategories((prev) => prev.filter((_, i) => i !== cIdx))}
                            className="px-2 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] text-gray-500"
                          >
                            删除
                          </button>
                        </div>
                        <div className="mt-2 space-y-2">
                          {cat.products.map((p, pIdx) => (
                            <div key={p.id} className="rounded-lg bg-white border border-gray-100 p-2">
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  value={p.name}
                                  onChange={(e) => setStoreDraftCategories((prev) => prev.map((x, i) => i === cIdx ? { ...x, products: x.products.map((it, j) => j === pIdx ? { ...it, name: e.target.value } : it) } : x))}
                                  placeholder="商品名"
                                  className="px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[12px] outline-none"
                                />
                                <input
                                  value={String(p.price || '')}
                                  onChange={(e) => setStoreDraftCategories((prev) => prev.map((x, i) => i === cIdx ? { ...x, products: x.products.map((it, j) => j === pIdx ? { ...it, price: Number(e.target.value) || 0 } : it) } : x))}
                                  placeholder="价格"
                                  className="px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[12px] outline-none"
                                />
                              </div>
                              <input
                                value={p.desc || ''}
                                onChange={(e) => setStoreDraftCategories((prev) => prev.map((x, i) => i === cIdx ? { ...x, products: x.products.map((it, j) => j === pIdx ? { ...it, desc: e.target.value } : it) } : x))}
                                placeholder="商品描述（可选）"
                                className="mt-2 w-full px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[12px] outline-none"
                              />
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (!file) return
                                    void (async () => {
                                      try {
                                        const url = await fileToCompressedDataUrl(file)
                                        setStoreDraftCategories((prev) => prev.map((x, i) => i === cIdx ? { ...x, products: x.products.map((it, j) => j === pIdx ? { ...it, imageUrl: String(url || '') } : it) } : x))
                                      } catch {
                                        onInfo('图片读取失败', '商品图片处理失败，请重试。')
                                      }
                                    })()
                                  }}
                                  className="block w-full text-[11px]"
                                />
                                <button
                                  type="button"
                                  onClick={() => setStoreDraftCategories((prev) => prev.map((x, i) => i === cIdx ? { ...x, products: x.products.filter((_, j) => j !== pIdx) } : x))}
                                  className="px-2 py-1 rounded-lg bg-gray-100 text-[11px] text-gray-500"
                                >
                                  删商品
                                </button>
                              </div>
                              {p.imageUrl ? <img src={p.imageUrl} alt="" className="mt-2 w-12 h-12 rounded-md object-cover border border-gray-100" /> : null}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => setStoreDraftCategories((prev) => prev.map((x, i) => i === cIdx ? { ...x, products: [...x.products, { id: `dp_${Date.now()}_${x.products.length}`, name: '', price: 0, desc: '', imageUrl: '' }] } : x))}
                            className="w-full py-1.5 rounded-lg bg-gray-100 text-[11px] text-gray-700"
                          >
                            + 商品
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setCreateStoreOpen(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm">
                  取消
                </button>
                <button type="button" onClick={saveCustomStore} className="flex-1 py-2.5 rounded-xl bg-[#07C160] text-white text-sm">
                  保存店铺
                </button>
              </div>
            </div>
          </div>
        )}
        {renderHistoryModal()}
      </div>
    )
  }

  // 店铺详情页
  const cats = store.categories || []
  const activeCat = cats.find((c) => c.id === activeCategoryId) || cats[0] || null
  const allProducts = cats.flatMap((c) => c.products.map((p) => ({ cat: c, p })))
  const cartKeysForStore = Object.keys(takeoutCart || {}).filter((k) => parseCartKey(k).storeId === store.id)

  return (
    <div className="bg-white/90 rounded-xl overflow-hidden flex flex-col h-[78vh]">
      <div className="px-3 py-2 flex items-center justify-between bg-gradient-to-r from-[#FFD21E] to-[#FFB020]">
        <button
          type="button"
          onClick={() => {
            setActiveStoreId(null)
            setActiveCategoryId(null)
          }}
          className="text-black/70 active:scale-95"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-black/85 truncate">{store.name}</div>
          <div className="text-[11px] text-black/65 truncate">
            {store.rating.toFixed(1)}分｜月售{store.monthlySales}｜{store.deliveryMin}-{store.deliveryMax}分钟
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setHistoryOpen(true)} className="text-[12px] text-black/70">
            历史
          </button>
          <button type="button" onClick={clearAll} className="text-[12px] text-black/70">
            清空
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="w-24 bg-gray-50 border-r border-gray-100 overflow-y-auto">
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCategoryId(c.id)}
              className={`w-full text-left px-3 py-3 text-[12px] ${c.id === activeCategoryId ? 'bg-white font-semibold text-gray-900' : 'text-gray-600'}`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activeCat ? (
            <>
              <div className="text-[12px] font-semibold text-gray-900">{activeCat.name}</div>
              {activeCat.products.map((prod) => {
                const hasSpec = (prod.optionGroups || []).length > 0
                // 快速显示该商品在购物车中的数量（不区分规格）
                const qty = cartLines
                  .filter((l) => l.storeId === store.id && l.productId === prod.id)
                  .reduce((s, l) => s + l.qty, 0)
                return (
                  <div key={prod.id} className="rounded-xl bg-white border border-gray-100 p-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => (hasSpec ? openSpec(store, prod) : addToCart(store, prod, {}))}
                      className="flex items-center gap-3 min-w-0 text-left"
                    >
                      <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center text-2xl">
                        {prod.imageUrl ? <img src={prod.imageUrl} alt="" className="w-full h-full object-cover" /> : (prod.imageEmoji || '🍽️')}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-gray-900 truncate">{prod.name}</div>
                        <div className="text-[11px] text-gray-500 truncate">{prod.desc || ''}</div>
                        <div className="mt-1 text-[12px] text-gray-900 font-semibold">{fmtMoney(prod.price)}</div>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {hasSpec ? (
                        <button
                          type="button"
                          onClick={() => openSpec(store, prod)}
                          className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-800 text-[12px] font-semibold active:scale-[0.99]"
                        >
                          选规格
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              // 无规格商品：只有一个 key
                              const key = makeCartKey(store.id, prod.id, {})
                              decCartKey(key)
                            }}
                            className={`w-8 h-8 rounded-full border flex items-center justify-center ${qty > 0 ? 'border-gray-300 text-gray-700 bg-white' : 'border-gray-200 text-gray-300 bg-white/60'}`}
                            disabled={qty <= 0}
                          >
                            -
                          </button>
                          <div className="w-6 text-center text-[12px] text-gray-700">{qty}</div>
                          <button
                            type="button"
                            onClick={() => addToCart(store, prod, {})}
                            className="w-8 h-8 rounded-full bg-[#FFD21E] text-black flex items-center justify-center font-bold active:scale-[0.99]"
                          >
                            +
                          </button>
                        </>
                      )}
                      {hasSpec && qty > 0 && <div className="text-[12px] text-gray-600">×{qty}</div>}
                    </div>
                  </div>
                )
              })}
            </>
          ) : (
            <div className="text-center text-[12px] text-gray-500 py-10">暂无分类</div>
          )}
        </div>
      </div>

      {/* 底部购物车栏 */}
      <div className="p-3 border-t border-gray-100 bg-white">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (cartLines.length === 0) return
              // 展开购物车：用规格弹窗复用一个“购物车明细”视图（轻量，不再引入更多状态）
              setSpecOpen(true)
              setSpecStore(store)
              setSpecProduct(null)
              setSpecSel({})
            }}
            className="flex items-center gap-2"
            disabled={cartLines.length === 0}
          >
            <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center relative">
              🛒
              {cartCount > 0 && (
                <div className="absolute -top-1 -right-1 text-[10px] bg-[#07C160] text-white rounded-full px-1.5 py-0.5">
                  {cartCount}
                </div>
              )}
            </div>
            <div className="text-left">
              <div className="text-[12px] font-semibold text-gray-900">{fmtMoney(cartTotal)}</div>
              <div className="text-[11px] text-gray-500">起送 {fmtMoney(store.minOrder)}｜配送 {fmtMoney(store.deliveryFee)}</div>
            </div>
          </button>

          {cartTotal < store.minOrder ? (
            <div className="px-3 py-2 rounded-lg bg-gray-100 text-gray-500 text-[12px] font-semibold">
              还差 {fmtMoney(store.minOrder - cartTotal)} 起送
            </div>
          ) : (
            <button
              type="button"
              onClick={async () => {
                const base = makeBaseOrder()
                if (!base) return

                // 结算：先进入“待支付”状态（用于 UI 复用），然后走两种支付
                setTakeoutOrder({ ...base, etaMinutes: 0, deliverAt: 0, status: 'draft', paidBy: null } as any)
                // 直接弹“支付选择”用 specOpen（购物车明细）里的按钮
                setSpecOpen(true)
                setSpecStore(store)
                setSpecProduct(null)
                setSpecSel({ __checkout__: '1' })
              }}
              className="px-4 py-2 rounded-lg bg-[#FFD21E] text-black text-[13px] font-semibold active:scale-[0.99]"
            >
              去结算
            </button>
          )}
        </div>
      </div>

      {/* 规格 / 购物车 / 结算 弹窗 */}
      {specOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setSpecOpen(false)
              setSpecProduct(null)
              setSpecStore(null)
              setSpecSel({})
            }}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-4 pb-6">
            {specProduct ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-gray-900 truncate">{specProduct.name}</div>
                    <div className="text-[12px] text-gray-500 mt-0.5 truncate">{specProduct.desc || ''}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSpecOpen(false)
                      setSpecProduct(null)
                      setSpecStore(null)
                      setSpecSel({})
                    }}
                    className="text-gray-400"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-3 space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                  {(specProduct.optionGroups || []).map((g) => (
                    <div key={g.id}>
                      <div className="text-[12px] font-semibold text-gray-900 mb-2">
                        {g.name}
                        {g.required ? <span className="text-red-500 ml-1">*</span> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {g.options.map((o) => {
                          const active = specSel[g.id] === o.id
                          return (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => setSpecSel((prev) => ({ ...prev, [g.id]: o.id }))}
                              className={`px-3 py-2 rounded-lg text-[12px] border ${
                                active ? 'border-black bg-black text-white' : 'border-gray-200 bg-gray-50 text-gray-700'
                              }`}
                            >
                              {o.name}
                              {o.priceDelta ? <span className={active ? 'text-white/80' : 'text-gray-500'}> +{fmtMoney(o.priceDelta)}</span> : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[13px] font-semibold text-gray-900">{fmtMoney(specProduct.price)}</div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!specStore || !specProduct) return
                      addToCart(specStore, specProduct, specSel)
                      setSpecOpen(false)
                      setSpecProduct(null)
                      setSpecStore(null)
                      setSpecSel({})
                    }}
                    className="px-4 py-2 rounded-lg bg-[#FFD21E] text-black text-[13px] font-semibold active:scale-[0.99]"
                  >
                    加入购物车
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-[14px] font-semibold text-gray-900">
                    {specSel.__checkout__ ? '确认下单' : '购物车'}
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={clearAll} className="text-[12px] text-gray-500">
                      清空
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSpecOpen(false)
                        setSpecProduct(null)
                        setSpecStore(null)
                        setSpecSel({})
                      }}
                      className="text-gray-400"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {specSel.__checkout__ && (
                  <div className="mt-3 rounded-xl bg-gray-50 border border-gray-100 p-3">
                    <div className="text-[12px] font-semibold text-gray-900">送达地址</div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDeliverTo('user')}
                        className={`flex-1 rounded-lg border px-3 py-2 text-center text-[12px] transition-colors ${
                          deliverTo === 'user'
                            ? 'border-black bg-black text-white'
                            : 'border-gray-200 bg-white text-gray-800'
                        }`}
                      >
                        送到我这边
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeliverTo('character')}
                        className={`flex-1 rounded-lg border px-3 py-2 text-center text-[12px] transition-colors ${
                          deliverTo === 'character'
                            ? 'border-black bg-black text-white'
                            : 'border-gray-200 bg-white text-gray-800'
                        }`}
                      >
                        送到 {character.name} 的地址
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-3 max-h-[45vh] overflow-y-auto pr-1 space-y-2">
                  {cartKeysForStore.length === 0 && <div className="text-center text-[12px] text-gray-500 py-10">购物车空空</div>}
                  {cartKeysForStore.map((key) => {
                    const qty = Math.max(0, Number(takeoutCart[key] || 0) || 0)
                    if (qty <= 0) return null
                    const { productId, selections } = parseCartKey(key)
                    const prod = allProducts.find((x) => x.p.id === productId)?.p || null
                    if (!prod) return null
                    const optGroups = prod.optionGroups || []
                    const optNames = optGroups
                      .map((g) => {
                        const picked = selections[g.id] || g.defaultOptionId || ''
                        const o = g.options.find((x) => x.id === picked)
                        return o ? o.name : ''
                      })
                      .filter(Boolean)
                      .join(' / ')
                    return (
                      <div key={key} className="rounded-xl bg-gray-50 border border-gray-100 p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-gray-900 truncate">{prod.name}</div>
                          <div className="text-[11px] text-gray-500 truncate">{optNames || prod.desc || ''}</div>
                          <div className="text-[12px] text-gray-900 mt-1">{fmtMoney(prod.price)}</div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => decCartKey(key)}
                            className="w-8 h-8 rounded-full border border-gray-300 bg-white text-gray-700 flex items-center justify-center"
                          >
                            -
                          </button>
                          <div className="w-6 text-center text-[12px] text-gray-700">{qty}</div>
                          <button
                            type="button"
                            onClick={() => incCartKey(key)}
                            className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] text-gray-600">合计</div>
                    <div className="text-[14px] font-semibold text-gray-900">{fmtMoney(cartTotal)}</div>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">配送时间：15~40分钟（随机倒计时）</div>

                  {specSel.__checkout__ ? (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={cartLines.length === 0}
                        onClick={() => {
                          const base = makeBaseOrder()
                          if (!base) return
                          setSelfPayPendingBase(base)
                          setSelfPayConfirmOpen(true)
                        }}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold ${cartLines.length === 0 ? 'bg-gray-200 text-gray-400' : 'bg-black text-white'}`}
                      >
                        自己支付
                      </button>
                      <button
                        type="button"
                        disabled={cartLines.length === 0}
                        onClick={() => {
                          if (!hasApiConfig) {
                            onInfo('需要先配置API', '外卖代付需要API来判断TA是否愿意代付。请先去设置里配置API。')
                            return
                          }
                          const base = makeBaseOrder()
                          if (!base) return
                          const next = { ...base, etaMinutes: 0, deliverAt: 0, status: 'awaiting_pay', paidBy: null } as any
                          setTakeoutOrder(next)
                          upsertHistory(next)
                          pushUserCard(
                            `[外卖代付请求]\n` +
                              `${formatTakeoutPayRequestText(base)}\n` +
                              `代付对象：${character.name}\n` +
                              `订单号：${String(base.id || '').slice(0, 18)}\n` +
                              `下单说明：这是我请你吃的，不是在向你要钱。`
                          )
                          setSpecOpen(false)
                          setSpecSel({})
                          onDone()
                        }}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold ${cartLines.length === 0 ? 'bg-gray-200 text-gray-400' : 'bg-[#07C160] text-white'}`}
                      >
                        发给TA代付
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSpecOpen(false)
                          setSpecProduct(null)
                          setSpecStore(null)
                          setSpecSel({})
                        }}
                        className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-800 text-sm font-semibold"
                      >
                        继续加购
                      </button>
                      <button
                        type="button"
                        disabled={cartTotal < store.minOrder || cartLines.length === 0}
                        onClick={() => setSpecSel({ __checkout__: '1' })}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold ${
                          cartTotal < store.minOrder || cartLines.length === 0 ? 'bg-gray-200 text-gray-400' : 'bg-[#FFD21E] text-black'
                        }`}
                      >
                        去结算
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 自己支付确认（小手机内弹窗，不使用浏览器 confirm） */}
      {selfPayConfirmOpen && selfPayPendingBase && (
        <div className="fixed inset-0 z-[21000] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={() => {
              setSelfPayConfirmOpen(false)
              setSelfPayPendingBase(null)
            }}
            aria-label="关闭自己支付确认"
          />
          <div className="relative w-full max-w-[320px] rounded-2xl bg-white p-4 shadow-2xl">
            <div className="text-[16px] font-semibold text-gray-900 text-center">确认支付</div>
            <div className="mt-3 text-[14px] text-gray-700 text-center">
              确认自己支付 {fmtMoney(selfPayPendingBase.total)} 吗？
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelfPayConfirmOpen(false)
                  setSelfPayPendingBase(null)
                }}
                className="h-10 rounded-xl bg-gray-100 text-gray-700 text-sm"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selfPayPendingBase) return
                  const amount = Number(selfPayPendingBase.total || 0) || 0
                  if (amount <= 0) {
                    onInfo('金额异常', '支付金额异常，请稍后重试。')
                    return
                  }
                  if (walletBalance < amount) {
                    onInfo('余额不足', `钱包余额不足，无法支付 ¥${amount.toFixed(2)}。请先在“我-钱包”里充值或收款。`)
                    return
                  }
                  const o = startDelivery({ ...selfPayPendingBase, paidBy: 'user' })
                  upsertHistory(o)
                  updateWalletBalance(-amount)
                  addWalletBill({
                    type: 'shopping',
                    amount,
                    description: `外卖自付（${selfPayPendingBase.storeName}）`,
                    relatedCharacterId: character.id,
                  })
                  // 自己支付：不自动发送任何外卖卡片到聊天，直接进入配送页
                  setSpecOpen(false)
                  setSpecSel({})
                  setSelfPayConfirmOpen(false)
                  setSelfPayPendingBase(null)
                }}
                className="h-10 rounded-xl bg-[#4D7BEB] text-white text-sm"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 送达位置选择（用 Portal，避免移动端被裁剪/盖住） */}
      {locOpen && canPortal
        ? createPortal(
            <div className="fixed inset-0 z-[20000] flex items-end justify-center">
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                onClick={() => setLocOpen(false)}
                aria-label="关闭位置选择"
              />
              <div className="relative w-full max-w-md bg-white rounded-t-2xl p-4 pb-6">
                <div className="flex items-center justify-between">
                  <div className="text-[14px] font-semibold text-gray-900">送达位置</div>
                  <button type="button" onClick={() => setLocOpen(false)} className="text-gray-400">
                    ✕
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => setDeliverTo('user')}
                    className={`w-full rounded-xl border p-3 text-left ${deliverTo === 'user' ? 'border-black bg-black text-white' : 'border-gray-200 bg-gray-50 text-gray-800'}`}
                  >
                    <div className="text-[13px] font-semibold">当前位置</div>
                    <div className={`text-[11px] mt-0.5 ${deliverTo === 'user' ? 'text-white/80' : 'text-gray-500'}`}>默认送到你这边</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliverTo('character')}
                    className={`w-full rounded-xl border p-3 text-left ${deliverTo === 'character' ? 'border-black bg-black text-white' : 'border-gray-200 bg-gray-50 text-gray-800'}`}
                  >
                    <div className="text-[13px] font-semibold">{character.name}的位置</div>
                    <div className={`text-[11px] mt-0.5 ${deliverTo === 'character' ? 'text-white/80' : 'text-gray-500'}`}>送到TA那边（你给TA点外卖）</div>
                  </button>

                  {deliverTo === 'character' && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <div className="text-[12px] font-semibold text-gray-900">填写TA的位置</div>
                      <input
                        value={characterAddress}
                        onChange={(e) => setCharacterAddress(e.target.value)}
                        placeholder="例如：XX小区 3栋 1201"
                        className="mt-2 w-full px-3 py-2 rounded-lg bg-white border border-gray-200 text-[13px] outline-none"
                      />
                      <div className="text-[11px] text-gray-500 mt-2">此位置会按当前角色记住。</div>
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setLocOpen(false)}
                    className="w-full py-2.5 rounded-xl bg-[#FFD21E] text-black text-[13px] font-semibold active:scale-[0.99]"
                  >
                    确定
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {renderHistoryModal()}
    </div>
  )
}

