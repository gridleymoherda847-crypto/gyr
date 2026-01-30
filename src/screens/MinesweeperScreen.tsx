import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useWeChat } from '../context/WeChatContext'

// 难度配置（针对手机屏幕优化）
const DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10, name: '初级' },
  medium: { rows: 14, cols: 14, mines: 40, name: '中级' },
  hard: { rows: 18, cols: 14, mines: 60, name: '高级' },
}

type Difficulty = keyof typeof DIFFICULTIES
type CellState = 'hidden' | 'revealed' | 'flagged'
type GameState = 'playing' | 'won' | 'lost'

interface Cell {
  isMine: boolean
  adjacentMines: number
  state: CellState
}

// 生成游戏板
function generateBoard(rows: number, cols: number, mines: number, firstClickRow: number, firstClickCol: number): Cell[][] {
  const board: Cell[][] = Array(rows).fill(null).map(() =>
    Array(cols).fill(null).map(() => ({
      isMine: false,
      adjacentMines: 0,
      state: 'hidden' as CellState,
    }))
  )

  // 放置地雷（避开第一次点击的位置及周围）
  let placed = 0
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows)
    const c = Math.floor(Math.random() * cols)
    // 避开第一次点击的3x3区域
    if (Math.abs(r - firstClickRow) <= 1 && Math.abs(c - firstClickCol) <= 1) continue
    if (!board[r][c].isMine) {
      board[r][c].isMine = true
      placed++
    }
  }

  // 计算每格周围的地雷数
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c].isMine) continue
      let count = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].isMine) {
            count++
          }
        }
      }
      board[r][c].adjacentMines = count
    }
  }

  return board
}

// 递归展开空白格
function revealCell(board: Cell[][], row: number, col: number, rows: number, cols: number): Cell[][] {
  const newBoard = board.map(r => r.map(c => ({ ...c })))
  
  const reveal = (r: number, c: number) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return
    if (newBoard[r][c].state !== 'hidden') return
    
    newBoard[r][c].state = 'revealed'
    
    // 如果是空白格（周围没有地雷），递归展开
    if (newBoard[r][c].adjacentMines === 0 && !newBoard[r][c].isMine) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          reveal(r + dr, c + dc)
        }
      }
    }
  }
  
  reveal(row, col)
  return newBoard
}

// 检查是否胜利
function checkWin(board: Cell[][]): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (!cell.isMine && cell.state !== 'revealed') return false
    }
  }
  return true
}

// 数字颜色
const NUMBER_COLORS: Record<number, string> = {
  1: '#2563eb', // 蓝
  2: '#16a34a', // 绿
  3: '#dc2626', // 红
  4: '#7c3aed', // 紫
  5: '#b91c1c', // 深红
  6: '#0891b2', // 青
  7: '#1f2937', // 黑
  8: '#6b7280', // 灰
}

// 分享弹窗
function ShareDialog({ 
  result,
  onClose 
}: { 
  result: { won: boolean; difficulty: string; time: number; rows: number; cols: number; mines: number }
  onClose: () => void 
}) {
  const navigate = useNavigate()
  const { characters, addMessage } = useWeChat()
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)
  const [shared, setShared] = useState(false)
  
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return m > 0 ? `${m}分${sec}秒` : `${sec}秒`
  }
  
  const handleShare = () => {
    if (!selectedCharacter) return
    
    addMessage({
      characterId: selectedCharacter,
      content: JSON.stringify({
        type: 'minesweeper_result',
        won: result.won,
        difficulty: result.difficulty,
        time: result.time,
        rows: result.rows,
        cols: result.cols,
        mines: result.mines,
      }),
      isUser: true,
      type: 'minesweeper_share'
    })
    
    setShared(true)
    setTimeout(() => {
      onClose()
      navigate(`/apps/wechat/chat/${selectedCharacter}`)
    }, 1000)
  }
  
  return createPortal(
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-xl w-[86vw] max-w-[320px] overflow-hidden shadow-2xl">
        <div className="px-3 pt-3 pb-2">
          <h3 className="text-center font-bold text-sm">📤 分享战绩</h3>
        </div>

        {shared ? (
          <div className="flex-1 flex flex-col items-center justify-center py-6">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-green-600 font-medium text-sm">分享成功！</p>
          </div>
        ) : (
          <>
            <div className="px-3 pb-2">
              {/* 战报卡片预览 */}
              <div className={`rounded-lg p-3 mb-3 text-white ${result.won ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-gray-500 to-gray-600'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs opacity-80">💣 扫雷</span>
                  <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{result.difficulty}</span>
                </div>
                <div className="text-center py-2">
                  <div className="text-3xl mb-1">{result.won ? '🏆' : '💥'}</div>
                  <div className="text-lg font-bold">{result.won ? '胜利！' : '踩雷了...'}</div>
                  <div className="text-xs opacity-80 mt-1">
                    {result.rows}×{result.cols} · {result.mines}颗雷 · {formatTime(result.time)}
                  </div>
                </div>
              </div>
              
              {/* 选择好友 */}
              <p className="text-xs text-gray-500 mb-2">选择要分享的好友：</p>
              <div className="grid grid-cols-4 gap-2 max-h-[150px] overflow-y-auto">
                {characters.map(char => (
                  <button
                    key={char.id}
                    type="button"
                    onClick={() => setSelectedCharacter(char.id)}
                    className={`flex flex-col items-center p-1.5 rounded-lg ${
                      selectedCharacter === char.id 
                        ? 'bg-pink-100 ring-2 ring-pink-400' 
                        : 'bg-gray-50'
                    }`}
                  >
                    <img src={char.avatar} alt={char.name} className="w-10 h-10 rounded-full object-cover" />
                    <span className="text-[10px] text-gray-600 mt-1 truncate w-full text-center">{char.name}</span>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="px-3 py-2 border-t flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg bg-gray-200 text-gray-700 font-medium text-sm">
                取消
              </button>
              <button
                type="button"
                onClick={handleShare}
                disabled={!selectedCharacter}
                className={`flex-1 py-2 rounded-lg text-white font-medium text-sm ${selectedCharacter ? 'bg-gradient-to-r from-pink-500 to-rose-500' : 'bg-gray-300'}`}
              >
                发送
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export default function MinesweeperScreen() {
  const navigate = useNavigate()
  
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [board, setBoard] = useState<Cell[][] | null>(null)
  const [gameState, setGameState] = useState<GameState>('playing')
  const [flagCount, setFlagCount] = useState(0)
  const [time, setTime] = useState(0)
  const [timerActive, setTimerActive] = useState(false)
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [longPressTimer, setLongPressTimer] = useState<number | null>(null)
  const [flagMode, setFlagMode] = useState(false) // 插旗模式

  const config = DIFFICULTIES[difficulty]

  // 计时器
  useEffect(() => {
    if (!timerActive) return
    const interval = setInterval(() => setTime(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [timerActive])

  // 开始新游戏
  const startGame = useCallback(() => {
    setBoard(null)
    setGameState('playing')
    setFlagCount(0)
    setTime(0)
    setTimerActive(false)
    setFlagMode(false)
  }, [])

  // 点击格子（不用 useCallback，确保每次都能获取最新的 flagMode）
  const handleClick = (row: number, col: number) => {
    if (gameState !== 'playing') return
    
    // 插旗模式
    if (flagMode && board) {
      const cell = board[row][col]
      if (cell.state === 'revealed') return
      
      const newBoard = board.map(r => r.map(c => ({ ...c })))
      if (cell.state === 'hidden') {
        newBoard[row][col].state = 'flagged'
        setFlagCount(f => f + 1)
      } else {
        newBoard[row][col].state = 'hidden'
        setFlagCount(f => f - 1)
      }
      setBoard(newBoard)
      return
    }
    
    if (!board) {
      // 第一次点击，生成棋盘
      const newBoard = generateBoard(config.rows, config.cols, config.mines, row, col)
      const revealed = revealCell(newBoard, row, col, config.rows, config.cols)
      setBoard(revealed)
      setTimerActive(true)
      return
    }
    
    const cell = board[row][col]
    if (cell.state !== 'hidden') return
    
    if (cell.isMine) {
      // 踩雷
      const newBoard = board.map(r => r.map(c => ({ ...c })))
      newBoard[row][col].state = 'revealed'
      // 显示所有地雷
      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
          if (newBoard[r][c].isMine) newBoard[r][c].state = 'revealed'
        }
      }
      setBoard(newBoard)
      setGameState('lost')
      setTimerActive(false)
    } else {
      const newBoard = revealCell(board, row, col, config.rows, config.cols)
      setBoard(newBoard)
      if (checkWin(newBoard)) {
        setGameState('won')
        setTimerActive(false)
      }
    }
  }

  // 右键/长按标记旗帜
  const handleFlag = useCallback((row: number, col: number, e?: React.MouseEvent) => {
    e?.preventDefault()
    if (gameState !== 'playing' || !board) return
    
    const cell = board[row][col]
    if (cell.state === 'revealed') return
    
    const newBoard = board.map(r => r.map(c => ({ ...c })))
    if (cell.state === 'hidden') {
      newBoard[row][col].state = 'flagged'
      setFlagCount(f => f + 1)
    } else {
      newBoard[row][col].state = 'hidden'
      setFlagCount(f => f - 1)
    }
    setBoard(newBoard)
  }, [board, gameState])

  // 长按处理
  const handleTouchStart = (row: number, col: number) => {
    const timer = window.setTimeout(() => {
      handleFlag(row, col)
    }, 500)
    setLongPressTimer(timer)
  }

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
  }

  // 根据难度计算格子尺寸（手机屏幕适配，稍大一点方便点击）
  const cellSize = difficulty === 'easy' ? 32 : 24

  // 格子渲染
  const renderCell = (cell: Cell, row: number, col: number) => {
    let content = ''
    let bgColor = 'bg-gray-300'
    let textColor = ''
    
    if (cell.state === 'revealed') {
      bgColor = 'bg-gray-100'
      if (cell.isMine) {
        content = '💣'
        bgColor = gameState === 'lost' ? 'bg-red-400' : 'bg-gray-100'
      } else if (cell.adjacentMines > 0) {
        content = String(cell.adjacentMines)
        textColor = NUMBER_COLORS[cell.adjacentMines] || '#000'
      }
    } else if (cell.state === 'flagged') {
      content = '🚩'
    }
    
    const fontSize = cellSize <= 18 ? 10 : cellSize <= 22 ? 12 : 14
    
    return (
      <button
        key={`${row}-${col}`}
        type="button"
        className={`${bgColor} border border-gray-400 flex items-center justify-center font-bold select-none active:scale-95 transition-transform`}
        style={{ 
          width: cellSize, 
          height: cellSize, 
          fontSize,
          color: textColor,
          lineHeight: 1,
        }}
        onClick={() => handleClick(row, col)}
        onContextMenu={(e) => handleFlag(row, col, e)}
        onTouchStart={() => handleTouchStart(row, col)}
        onTouchEnd={handleTouchEnd}
        disabled={gameState !== 'playing' && cell.state === 'hidden'}
      >
        {content}
      </button>
    )
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-gray-100 to-gray-200">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/90 backdrop-blur border-b border-gray-200">
        <button type="button" onClick={() => navigate('/')} className="text-gray-500">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="font-bold text-gray-800 text-lg">💣 扫雷</span>
        <div className="w-6" />
      </div>

      {/* 难度选择 */}
      <div className="flex justify-center gap-2 p-3">
        {(Object.keys(DIFFICULTIES) as Difficulty[]).map(d => (
          <button
            key={d}
            type="button"
            onClick={() => { setDifficulty(d); startGame() }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              difficulty === d 
                ? 'bg-blue-500 text-white' 
                : 'bg-white text-gray-600 border border-gray-300'
            }`}
          >
            {DIFFICULTIES[d].name}
          </button>
        ))}
      </div>

      {/* 状态栏 */}
      <div className="flex justify-between items-center px-4 py-2 bg-gray-800 text-white mx-4 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-base">🚩</span>
          <span className="font-mono text-base">{config.mines - flagCount}</span>
        </div>
        
        {/* 插旗模式按钮 */}
        <button
          type="button"
          onClick={() => setFlagMode(!flagMode)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            flagMode 
              ? 'bg-red-500 text-white ring-2 ring-red-300' 
              : 'bg-gray-600 text-gray-300'
          }`}
        >
          {flagMode ? '🚩 插旗中' : '🚩 插旗'}
        </button>
        
        <button
          type="button"
          onClick={startGame}
          className="text-2xl active:scale-90 transition-transform"
        >
          {gameState === 'won' ? '😎' : gameState === 'lost' ? '😵' : '🙂'}
        </button>
        <div className="flex items-center gap-1">
          <span className="text-base">⏱️</span>
          <span className="font-mono text-base">{formatTime(time)}</span>
        </div>
      </div>

      {/* 游戏区域 */}
      <div className="flex-1 flex items-center justify-center p-2 overflow-auto">
        <div className="overflow-auto max-w-full max-h-full">
          {!board ? (
            <div className="text-center">
              <div className="text-5xl mb-3">💣</div>
              <p className="text-gray-600 mb-3 text-sm">点击任意格子开始游戏</p>
              <div 
                className="inline-grid gap-px bg-gray-400 p-px rounded"
                style={{ gridTemplateColumns: `repeat(${config.cols}, ${cellSize}px)` }}
              >
                {Array(config.rows).fill(null).map((_, r) =>
                  Array(config.cols).fill(null).map((_, c) => (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      className="bg-gray-300 border border-gray-400 active:bg-gray-400"
                      style={{ width: cellSize, height: cellSize }}
                      onClick={() => handleClick(r, c)}
                    />
                  ))
                )}
              </div>
            </div>
          ) : (
            <div 
              className="inline-grid gap-px bg-gray-400 p-px rounded"
              style={{ gridTemplateColumns: `repeat(${config.cols}, ${cellSize}px)` }}
            >
              {board.map((row, r) => row.map((cell, c) => renderCell(cell, r, c)))}
            </div>
          )}
        </div>
      </div>

      {/* 结果弹窗 */}
      {gameState !== 'playing' && (
        <div className="p-4 bg-white border-t border-gray-200">
          <div className={`text-center p-4 rounded-xl ${gameState === 'won' ? 'bg-green-100' : 'bg-red-100'}`}>
            <div className="text-4xl mb-2">{gameState === 'won' ? '🎉' : '💥'}</div>
            <div className={`text-xl font-bold ${gameState === 'won' ? 'text-green-600' : 'text-red-600'}`}>
              {gameState === 'won' ? '恭喜通关！' : '踩雷了！'}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {config.name} · {config.rows}×{config.cols} · {formatTime(time)}
            </div>
          </div>
          <div className="flex gap-3 mt-3">
            <button
              type="button"
              onClick={() => setShowShareDialog(true)}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-400 to-emerald-500 text-white font-medium active:scale-[0.98]"
            >
              📤 分享战绩
            </button>
            <button
              type="button"
              onClick={startGame}
              className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-medium active:scale-[0.98]"
            >
              🔄 再来一局
            </button>
          </div>
        </div>
      )}

      {/* 分享弹窗 */}
      {showShareDialog && (
        <ShareDialog
          result={{
            won: gameState === 'won',
            difficulty: config.name,
            time,
            rows: config.rows,
            cols: config.cols,
            mines: config.mines,
          }}
          onClose={() => setShowShareDialog(false)}
        />
      )}

      {/* 底部提示 */}
      <div className="px-4 py-2 bg-white/80 border-t border-gray-100 text-center text-xs text-gray-400">
        点击翻开 · 点「插旗」按钮切换插旗模式
      </div>
    </div>
  )
}
