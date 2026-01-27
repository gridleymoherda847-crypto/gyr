import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS, type TodoItem } from '../context/OSContext'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'
import { compressImageFileToDataUrl } from '../utils/image'

export default function MemoScreen() {
  const navigate = useNavigate()
  const { memo, setMemo } = useOS()
  const [newTodoText, setNewTodoText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    try {
      const base64 = await compressImageFileToDataUrl(file, { maxSide: 600, quality: 0.8 })
      setMemo({ image: base64 })
    } catch (err) {
      console.error('图片上传失败:', err)
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleRemoveImage = () => {
    setMemo({ image: '' })
  }

  const addTodo = () => {
    if (!newTodoText.trim()) return
    const newTodo: TodoItem = {
      id: `todo-${Date.now()}`,
      text: newTodoText.trim(),
      done: false
    }
    setMemo({ todos: [...(memo.todos || []), newTodo] })
    setNewTodoText('')
  }

  const toggleTodo = (id: string) => {
    const updated = (memo.todos || []).map(t => 
      t.id === id ? { ...t, done: !t.done } : t
    )
    setMemo({ todos: updated })
  }

  const removeTodo = (id: string) => {
    const updated = (memo.todos || []).filter(t => t.id !== id)
    setMemo({ todos: updated })
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="待办事项" onBack={() => navigate('/', { replace: true })} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 pb-4">
          {/* 图片区域 - 横向在顶部 */}
          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-2">装饰图片</div>
            {memo.image ? (
              <div className="relative w-full h-24 rounded-xl overflow-hidden bg-gray-100">
                <img 
                  src={memo.image} 
                  alt="装饰图片" 
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/50 text-white text-xs flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-20 rounded-xl border-2 border-dashed border-gray-300 text-gray-400 flex items-center justify-center gap-2 hover:border-gray-500 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path d="M12 4v16m8-8H4"/>
                </svg>
                <span className="text-xs">添加图片</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          {/* 添加新待办 */}
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={newTodoText}
              onChange={e => setNewTodoText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTodo()}
              placeholder="添加新的待办事项..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/80 border border-white/50 outline-none text-sm text-gray-700 placeholder-gray-400"
            />
            <button
              type="button"
              onClick={addTodo}
              className="px-4 py-2.5 rounded-xl bg-gray-800 text-white text-sm font-medium active:scale-95 transition-transform"
            >
              添加
            </button>
          </div>

          {/* 待办列表 */}
          <div className="space-y-2">
            {(!memo.todos || memo.todos.length === 0) ? (
              <div className="text-center text-gray-400 py-8">
                <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
                <div className="text-sm">还没有待办事项</div>
                <div className="text-xs">在上方输入框添加</div>
              </div>
            ) : (
              memo.todos.map(todo => (
                <div 
                  key={todo.id} 
                  className="flex items-center gap-3 bg-white/80 rounded-xl px-4 py-3 border border-white/50"
                >
                  {/* 勾选框 */}
                  <button
                    type="button"
                    onClick={() => toggleTodo(todo.id)}
                    className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      todo.done 
                        ? 'bg-gray-700 border-gray-700' 
                        : 'border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {todo.done && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </button>
                  
                  {/* 文字 */}
                  <span className={`flex-1 text-sm ${todo.done ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {todo.text}
                  </span>
                  
                  {/* 删除按钮 */}
                  <button
                    type="button"
                    onClick={() => removeTodo(todo.id)}
                    className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
