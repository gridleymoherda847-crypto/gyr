import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageContainer from '../components/PageContainer'
import AppHeader from '../components/AppHeader'
import { useWeChat, type MyDiary } from '../context/WeChatContext'
import WeChatDialog from './wechat/components/WeChatDialog'

type TabType = 'my' | 'favorites'

// 心情选项
const MOOD_OPTIONS = ['😊 开心', '😢 难过', '😡 生气', '😌 平静', '🥰 幸福', '😰 焦虑', '🤔 思考', '😴 疲惫']

// 天气选项
const WEATHER_OPTIONS = ['☀️ 晴', '⛅ 多云', '🌧️ 雨', '❄️ 雪', '🌫️ 雾', '🌙 夜晚']

export default function DiaryVaultScreen() {
  const navigate = useNavigate()
  const {
    favoriteDiaries,
    removeFavoriteDiary,
    characters,
    addMessage,
    myDiaries,
    addMyDiary,
    updateMyDiary,
    deleteMyDiary,
    getCurrentPersona,
  } = useWeChat()

  const [tab, setTab] = useState<TabType>('my')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareDiaryId, setShareDiaryId] = useState<string | null>(null)
  const [shareType, setShareType] = useState<'my' | 'favorite'>('favorite') // 分享类型
  const [toast, setToast] = useState<string | null>(null)
  const [shareResult, setShareResult] = useState<{ open: boolean; targetId: string | null }>({ open: false, targetId: null })

  // 我的日记相关状态
  const [editOpen, setEditOpen] = useState(false)
  const [editDiary, setEditDiary] = useState<MyDiary | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editMood, setEditMood] = useState('')
  const [editWeather, setEditWeather] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // 日期选择器相关
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())

  // 日期日记列表（点击日历某天时显示）
  const [dateDiariesOpen, setDateDiariesOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  
  // 收藏日记翻译显示状态
  const [showFavoriteTranslated, setShowFavoriteTranslated] = useState(false)

  const selected = useMemo(() => favoriteDiaries.find(d => d.id === selectedId) || null, [favoriteDiaries, selectedId])
  const selectedMyDiary = useMemo(() => myDiaries.find(d => d.id === selectedId) || null, [myDiaries, selectedId])

  // 收藏日记列表（按时间排序）
  const favoriteList = useMemo(() => {
    return [...favoriteDiaries].sort((a, b) => (b.diaryAt || b.createdAt) - (a.diaryAt || a.createdAt))
  }, [favoriteDiaries])

  // 我的日记列表（按日期和创建时间排序）
  const myDiaryList = useMemo(() => {
    return [...myDiaries].sort((a, b) => {
      // 先按日期倒序
      const dateCompare = b.date.localeCompare(a.date)
      if (dateCompare !== 0) return dateCompare
      // 同一天按创建时间倒序
      return b.createdAt - a.createdAt
    })
  }, [myDiaries])

  // 选中日期的日记列表
  const dateDiaries = useMemo(() => {
    if (!selectedDate) return []
    return myDiaries
      .filter(d => d.date === selectedDate)
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [myDiaries, selectedDate])

  // 有日记的日期集合
  const diaryDates = useMemo(() => {
    return new Set(myDiaries.map(d => d.date))
  }, [myDiaries])

  const formatTs = (ts: number) =>
    new Date(ts).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  const formatDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-')
    return `${y}年${m}月${d}日`
  }

  const getTodayStr = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  // 打开新建日记（一天可以写多篇）
  const openNewDiary = (date?: string) => {
    const targetDate = date || getTodayStr()
    setEditDiary(null)
    setEditDate(targetDate)
    setEditTitle('')
    setEditContent('')
    setEditMood('')
    setEditWeather('')
    setEditOpen(true)
  }

  // 打开编辑已有日记
  const openEditDiary = (diary: MyDiary) => {
    setEditDiary(diary)
    setEditDate(diary.date)
    setEditTitle(diary.title)
    setEditContent(diary.content)
    setEditMood(diary.mood || '')
    setEditWeather(diary.weather || '')
    setEditOpen(true)
  }

  // 打开某天的日记列表
  const openDateDiaries = (date: string) => {
    setSelectedDate(date)
    setDateDiariesOpen(true)
  }

  // 保存日记
  const saveDiary = () => {
    if (!editContent.trim()) {
      setToast('请输入日记内容')
      setTimeout(() => setToast(null), 1600)
      return
    }
    const title = editTitle.trim() || `${formatDate(editDate)}的日记`
    if (editDiary) {
      updateMyDiary(editDiary.id, {
        date: editDate,
        title,
        content: editContent.trim(),
        mood: editMood || undefined,
        weather: editWeather || undefined,
      })
      setToast('日记已更新')
    } else {
      addMyDiary({
        date: editDate,
        title,
        content: editContent.trim(),
        mood: editMood || undefined,
        weather: editWeather || undefined,
      })
      setToast('日记已保存')
    }
    setTimeout(() => setToast(null), 1600)
    setEditOpen(false)
  }

  // 删除日记确认
  const confirmDelete = (id: string) => {
    setDeleteTargetId(id)
    setDeleteConfirmOpen(true)
  }

  const doDelete = () => {
    if (deleteTargetId) {
      if (tab === 'my') {
        deleteMyDiary(deleteTargetId)
      } else {
        removeFavoriteDiary(deleteTargetId)
      }
      setToast('已删除')
      setTimeout(() => setToast(null), 1600)
    }
    setDeleteConfirmOpen(false)
    setDeleteTargetId(null)
    setSelectedId(null)
  }

  // 分享日记（支持我的日记和收藏日记）
  const shareTo = (diaryId: string, targetCharacterId: string) => {
    if (shareType === 'favorite') {
      // 分享收藏日记
      const d = favoriteDiaries.find(x => x.id === diaryId)
      if (!d) return
      addMessage({
        characterId: targetCharacterId,
        isUser: true,
        type: 'diary',
        content: '日记',
        diaryAuthorId: d.characterId,
        diaryAuthorName: d.characterName,
        diaryAt: d.diaryAt,
        diaryTitle: d.title,
        diaryExcerpt: (d.content || '').replace(/\s+/g, ' ').slice(0, 40),
        diaryContent: d.content,
        diaryNote: d.note,
      })
    } else {
      // 分享我的日记
      const d = myDiaries.find(x => x.id === diaryId)
      if (!d) return
      const persona = getCurrentPersona()
      const authorName = persona?.name || '我'
      addMessage({
        characterId: targetCharacterId,
        isUser: true,
        type: 'diary',
        content: '日记',
        diaryAuthorId: 'me',
        diaryAuthorName: authorName,
        diaryAt: new Date(d.date).getTime(),
        diaryTitle: d.title,
        diaryExcerpt: (d.content || '').replace(/\s+/g, ' ').slice(0, 40),
        diaryContent: d.content,
        diaryNote: d.mood ? `心情：${d.mood}` : undefined,
      })
    }
    setShareOpen(false)
    setShareDiaryId(null)
    setShareResult({ open: true, targetId: targetCharacterId })
  }

  // 生成日历
  const renderCalendar = () => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const firstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay()
    const days: (number | null)[] = []
    
    // 填充月初空白
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null)
    }
    // 填充日期
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i)
    }

    const weekDays = ['日', '一', '二', '三', '四', '五', '六']
    const todayStr = getTodayStr()

    return (
      <div className="absolute inset-0 z-50 flex flex-col bg-[#F7F4EE]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 bg-white/70 backdrop-blur">
          <button type="button" onClick={() => setCalendarOpen(false)} className="text-gray-700 text-sm">返回</button>
          <div className="text-sm font-semibold text-[#111]">选择日期</div>
          <div className="w-10" />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* 年月选择 */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              type="button"
              onClick={() => {
                if (calendarMonth === 0) {
                  setCalendarYear(y => y - 1)
                  setCalendarMonth(11)
                } else {
                  setCalendarMonth(m => m - 1)
                }
              }}
              className="w-8 h-8 rounded-full bg-white/70 border border-black/10 flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-lg font-semibold text-[#111]">
              {calendarYear}年{calendarMonth + 1}月
            </div>
            <button
              type="button"
              onClick={() => {
                if (calendarMonth === 11) {
                  setCalendarYear(y => y + 1)
                  setCalendarMonth(0)
                } else {
                  setCalendarMonth(m => m + 1)
                }
              }}
              className="w-8 h-8 rounded-full bg-white/70 border border-black/10 flex items-center justify-center"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 星期标题 */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map(d => (
              <div key={d} className="text-center text-xs text-gray-500 py-1">{d}</div>
            ))}
          </div>

          {/* 日期格子 */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="aspect-square" />
              }
              const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const hasDiary = diaryDates.has(dateStr)
              const isToday = dateStr === todayStr

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => {
                    setCalendarOpen(false)
                    if (hasDiary) {
                      // 有日记则显示当天日记列表
                      openDateDiaries(dateStr)
                    } else {
                      // 没有日记则新建
                      openNewDiary(dateStr)
                    }
                  }}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center relative transition ${
                    isToday ? 'bg-pink-100 border-2 border-pink-400' : 'bg-white/70 border border-black/10'
                  } ${hasDiary ? 'ring-2 ring-pink-300' : ''}`}
                >
                  <span className={`text-sm ${isToday ? 'font-bold text-pink-600' : 'text-[#111]'}`}>{day}</span>
                  {hasDiary && (
                    <div className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-pink-500" />
                  )}
                </button>
              )
            })}
          </div>

          {/* 快捷按钮 */}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                const now = new Date()
                setCalendarYear(now.getFullYear())
                setCalendarMonth(now.getMonth())
              }}
              className="flex-1 py-2 rounded-xl bg-white/70 border border-black/10 text-sm text-gray-700"
            >
              回到今天
            </button>
            <button
              type="button"
              onClick={() => {
                setCalendarOpen(false)
                openNewDiary(getTodayStr())
              }}
              className="flex-1 py-2 rounded-xl bg-pink-500 text-sm text-white"
            >
              写今天的日记
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 渲染我的日记详情
  const renderMyDiaryDetail = () => {
    if (!selectedMyDiary) return null
    return (
      <div className="absolute inset-0 z-50 flex flex-col bg-[#F7F4EE]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 bg-white/70 backdrop-blur">
          <button type="button" onClick={() => setSelectedId(null)} className="text-gray-700 text-sm">返回</button>
          <div className="text-sm font-semibold text-[#111] truncate">{formatDate(selectedMyDiary.date)}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShareDiaryId(selectedMyDiary.id)
                setShareType('my')
                setShareOpen(true)
              }}
              className="px-3 py-1.5 rounded-full bg-white/70 border border-black/10 text-[12px] text-gray-700"
            >
              分享
            </button>
            <button
              type="button"
              onClick={() => openEditDiary(selectedMyDiary)}
              className="px-3 py-1.5 rounded-full bg-white/70 border border-black/10 text-[12px] text-gray-700"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => confirmDelete(selectedMyDiary.id)}
              className="px-3 py-1.5 rounded-full bg-white/70 border border-black/10 text-[12px] text-red-500"
            >
              删除
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-[22px] bg-white/75 border border-black/10 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-black/5">
              <div className="text-[13px] font-semibold text-[#111]">{selectedMyDiary.title}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] text-gray-500">{formatDate(selectedMyDiary.date)}</span>
                {selectedMyDiary.mood && <span className="text-[11px]">{selectedMyDiary.mood}</span>}
                {selectedMyDiary.weather && <span className="text-[11px]">{selectedMyDiary.weather}</span>}
              </div>
            </div>
            <div
              className="px-4 py-4 text-[13px] leading-relaxed text-[#111] whitespace-pre-wrap"
              style={{
                backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)',
                backgroundSize: '100% 26px',
              }}
            >
              {selectedMyDiary.content}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 渲染某天的日记列表
  const renderDateDiaries = () => {
    if (!dateDiariesOpen) return null
    return (
      <div className="absolute inset-0 z-50 flex flex-col bg-[#F7F4EE]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 bg-white/70 backdrop-blur">
          <button type="button" onClick={() => setDateDiariesOpen(false)} className="text-gray-700 text-sm">返回</button>
          <div className="text-sm font-semibold text-[#111]">{formatDate(selectedDate)}</div>
          <button
            type="button"
            onClick={() => {
              setDateDiariesOpen(false)
              openNewDiary(selectedDate)
            }}
            className="text-pink-500 text-sm font-medium"
          >
            + 新增
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {dateDiaries.length === 0 ? (
            <div className="mt-10 text-center">
              <div className="text-4xl mb-3">📝</div>
              <div className="text-sm text-gray-400">这天还没有日记</div>
              <button
                type="button"
                onClick={() => {
                  setDateDiariesOpen(false)
                  openNewDiary(selectedDate)
                }}
                className="mt-4 px-6 py-2 rounded-xl bg-pink-500 text-white text-sm"
              >
                写一篇
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {dateDiaries.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDateDiariesOpen(false)
                    setSelectedId(d.id)
                  }}
                  className="w-full text-left rounded-2xl bg-white/70 border border-black/10 px-4 py-3 active:scale-[0.99] transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-[#111] truncate">{d.title}</span>
                        {d.mood && <span className="text-[12px]">{d.mood.split(' ')[0]}</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {new Date(d.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-[12px] text-gray-600 mt-1 line-clamp-2">{d.content}</div>
                    </div>
                    {d.weather && (
                      <div className="text-lg flex-shrink-0">{d.weather.split(' ')[0]}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="日记本" onBack={() => navigate('/', { replace: true })} />

        {/* Tab 切换 */}
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setTab('my')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'my' ? 'bg-pink-500 text-white' : 'bg-white/70 text-gray-600 border border-black/10'
            }`}
          >
            我的日记
          </button>
          <button
            type="button"
            onClick={() => setTab('favorites')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium transition ${
              tab === 'favorites' ? 'bg-pink-500 text-white' : 'bg-white/70 text-gray-600 border border-black/10'
            }`}
          >
            收藏日记
          </button>
        </div>

        {/* 我的日记 Tab */}
        {tab === 'my' && (
          <>
            {/* 操作按钮 */}
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => openNewDiary()}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-400 to-pink-500 text-white text-sm font-medium shadow-sm"
              >
                + 写日记
              </button>
              <button
                type="button"
                onClick={() => setCalendarOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-white/70 border border-black/10 text-gray-700 text-sm"
              >
                📅 日历
              </button>
            </div>

            <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4">
              {myDiaryList.length === 0 ? (
                <div className="mt-10 text-center">
                  <div className="text-4xl mb-3">📔</div>
                  <div className="text-sm text-gray-400">还没有写过日记</div>
                  <div className="text-xs text-gray-400 mt-1">点击上方"写日记"开始记录生活</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {myDiaryList.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedId(d.id)}
                      className="w-full text-left rounded-2xl bg-white/70 border border-black/10 px-4 py-3 active:scale-[0.99] transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-[#111] truncate">{d.title}</span>
                            {d.mood && <span className="text-[12px]">{d.mood.split(' ')[0]}</span>}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">{formatDate(d.date)}</div>
                          <div className="text-[12px] text-gray-600 mt-1 line-clamp-2">{d.content}</div>
                        </div>
                        {d.weather && (
                          <div className="text-lg flex-shrink-0">{d.weather.split(' ')[0]}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* 收藏日记 Tab */}
        {tab === 'favorites' && (
          <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4">
            {favoriteList.length === 0 ? (
              <div className="mt-10 text-center">
                <div className="text-4xl mb-3">💝</div>
                <div className="text-sm text-gray-400">还没有收藏日记</div>
                <div className="text-xs text-gray-400 mt-1">在聊天中收藏TA的日记会显示在这里</div>
              </div>
            ) : (
              <div className="space-y-2 mt-2">
                {favoriteList.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className="w-full text-left rounded-2xl bg-white/70 border border-black/10 px-4 py-3 active:scale-[0.99] transition"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-[#111] truncate">{d.characterName}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5 truncate">{d.title}</div>
                        {!!d.note && <div className="text-[11px] text-gray-400 mt-0.5 truncate">备注：{d.note}</div>}
                      </div>
                      <div className="text-[11px] text-gray-400 flex-shrink-0">{formatTs(d.diaryAt || d.createdAt)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 我的日记详情 */}
        {tab === 'my' && selectedMyDiary && renderMyDiaryDetail()}

        {/* 收藏日记详情 */}
        {tab === 'favorites' && selected && (
          <div className="absolute inset-0 z-50 flex flex-col bg-[#F7F4EE]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 bg-white/70 backdrop-blur">
              <button type="button" onClick={() => { setSelectedId(null); setShowFavoriteTranslated(false) }} className="text-gray-700 text-sm">返回</button>
              <div className="text-sm font-semibold text-[#111] truncate">{selected.characterName} 的日记</div>
              <div className="flex items-center gap-2">
                {/* 翻译按钮（仅有翻译时显示） */}
                {selected.contentZh && (
                  <button
                    type="button"
                    onClick={() => setShowFavoriteTranslated(!showFavoriteTranslated)}
                    className={`px-2 py-1 rounded text-[11px] ${showFavoriteTranslated ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}
                  >
                    {showFavoriteTranslated ? '原文' : '翻译'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShareDiaryId(selected.id)
                    setShareType('favorite')
                    setShareOpen(true)
                  }}
                  className="px-3 py-1.5 rounded-full bg-white/70 border border-black/10 text-[12px] text-gray-700"
                >
                  分享
                </button>
                <button
                  type="button"
                  onClick={() => confirmDelete(selected.id)}
                  className="px-3 py-1.5 rounded-full bg-white/70 border border-black/10 text-[12px] text-red-500"
                >
                  删除
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="rounded-[22px] bg-white/75 border border-black/10 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-black/5">
                  <div className="text-[13px] font-semibold text-[#111]">{selected.title}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{formatTs(selected.diaryAt)}</div>
                  {!!selected.note && <div className="text-[11px] text-gray-500 mt-1">备注：{selected.note}</div>}
                </div>
                <div
                  className="px-4 py-4 text-[13px] leading-relaxed text-[#111] whitespace-pre-wrap"
                  style={{
                    backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)',
                    backgroundSize: '100% 26px',
                  }}
                >
                  {showFavoriteTranslated && selected.contentZh ? selected.contentZh : selected.content}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 日历视图 */}
        {calendarOpen && renderCalendar()}

        {/* 某天的日记列表 */}
        {renderDateDiaries()}

        {/* 编辑日记弹窗 */}
        {editOpen && (
          <div className="absolute inset-0 z-[60] flex flex-col bg-[#F7F4EE]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/10 bg-white/70 backdrop-blur">
              <button type="button" onClick={() => setEditOpen(false)} className="text-gray-700 text-sm">取消</button>
              <div className="text-sm font-semibold text-[#111]">{editDiary ? '编辑日记' : '写日记'}</div>
              <button type="button" onClick={saveDiary} className="text-pink-500 text-sm font-medium">保存</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {/* 日期 */}
              <div className="mb-4">
                <label className="text-[12px] text-gray-500 mb-1 block">日期</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white/70 border border-black/10 text-sm"
                />
              </div>

              {/* 标题 */}
              <div className="mb-4">
                <label className="text-[12px] text-gray-500 mb-1 block">标题（可选）</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder={`${formatDate(editDate)}的日记`}
                  className="w-full px-3 py-2 rounded-xl bg-white/70 border border-black/10 text-sm"
                />
              </div>

              {/* 心情 */}
              <div className="mb-4">
                <label className="text-[12px] text-gray-500 mb-1 block">心情</label>
                <div className="flex flex-wrap gap-2">
                  {MOOD_OPTIONS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEditMood(editMood === m ? '' : m)}
                      className={`px-3 py-1.5 rounded-full text-xs transition ${
                        editMood === m ? 'bg-pink-500 text-white' : 'bg-white/70 border border-black/10 text-gray-700'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* 天气 */}
              <div className="mb-4">
                <label className="text-[12px] text-gray-500 mb-1 block">天气</label>
                <div className="flex flex-wrap gap-2">
                  {WEATHER_OPTIONS.map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setEditWeather(editWeather === w ? '' : w)}
                      className={`px-3 py-1.5 rounded-full text-xs transition ${
                        editWeather === w ? 'bg-pink-500 text-white' : 'bg-white/70 border border-black/10 text-gray-700'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* 内容 */}
              <div className="mb-4">
                <label className="text-[12px] text-gray-500 mb-1 block">内容</label>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  placeholder="今天发生了什么..."
                  rows={10}
                  className="w-full px-3 py-3 rounded-xl bg-white/70 border border-black/10 text-sm resize-none"
                  style={{
                    backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)',
                    backgroundSize: '100% 26px',
                    lineHeight: '26px',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* 分享弹窗 */}
        {shareOpen && shareDiaryId && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/35" onClick={() => setShareOpen(false)} role="presentation" />
            <div className="relative w-full max-w-[320px] rounded-2xl bg-white/90 border border-white/30 shadow-xl overflow-hidden backdrop-blur">
              <div className="px-4 py-3 border-b border-black/5 text-center text-sm font-semibold">分享给谁</div>
              <div className="max-h-[60vh] overflow-y-auto p-2">
                {characters.length === 0 ? (
                  <div className="text-center text-sm text-gray-400 py-8">暂无好友</div>
                ) : (
                  <div className="space-y-1">
                    {characters.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => shareTo(shareDiaryId, c.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 active:bg-gray-100"
                      >
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                          {c.avatar ? (
                            <img src={c.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white">
                              {c.name[0]}
                            </div>
                          )}
                        </div>
                        <div className="text-left min-w-0">
                          <div className="text-[13px] font-medium text-[#111] truncate">{c.name}</div>
                          <div className="text-[11px] text-gray-500 truncate">发送到聊天</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-black/5">
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  className="w-full py-2 rounded-xl bg-gray-100 text-sm text-gray-700"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 删除确认弹窗 */}
        <WeChatDialog
          open={deleteConfirmOpen}
          title="确认删除"
          message="删除后无法恢复，确定要删除这篇日记吗？"
          confirmText="删除"
          cancelText="取消"
          onCancel={() => {
            setDeleteConfirmOpen(false)
            setDeleteTargetId(null)
          }}
          onConfirm={doDelete}
        />

        {toast && (
          <div className="pointer-events-none absolute bottom-16 left-0 right-0 flex justify-center z-[70]">
            <div className="px-3 py-2 rounded-full bg-black/70 text-white text-xs">
              {toast}
            </div>
          </div>
        )}

        <WeChatDialog
          open={shareResult.open}
          title="已分享"
          message="已把日记文件分享出去啦。要现在去聊天看看吗？"
          confirmText="去聊天"
          cancelText="稍后再去"
          onCancel={() => setShareResult({ open: false, targetId: null })}
          onConfirm={() => {
            const id = shareResult.targetId
            setShareResult({ open: false, targetId: null })
            if (id) navigate(`/apps/wechat/chat/${encodeURIComponent(id)}`)
          }}
        />
      </div>
    </PageContainer>
  )
}
