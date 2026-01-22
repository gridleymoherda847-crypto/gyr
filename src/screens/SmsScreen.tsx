import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../context/OSContext'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'

export default function SmsScreen() {
  const navigate = useNavigate()
  const { chatLog, addChatMessage, characters, fontColor } = useOS()
  const [inputText, setInputText] = useState('')

  const smsMessages = chatLog.filter(msg => msg.app === '短信' || msg.app === '系统')

  const quickSend = (text: string) => {
    addChatMessage({ senderId: 'user', senderName: '我', text, app: '短信' })
  }

  const handleSend = () => {
    if (inputText.trim()) {
      quickSend(inputText.trim())
      setInputText('')
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="短信" onBack={() => navigate('/')} />
        
        <div className="flex-1 overflow-y-auto hide-scrollbar -mx-3 sm:-mx-4 px-3 sm:px-4 space-y-3 sm:space-y-4">
          {/* 联系人列表 */}
          <div className="space-y-2">
            {characters.map((char) => (
              <div key={char.id} className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white/50 hover:bg-white/60 transition-colors cursor-pointer press-effect border border-white/30">
                <img src={char.avatar} alt={char.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm sm:text-base" style={{ color: fontColor.value }}>{char.name}</span>
                    <span className="text-[10px] sm:text-xs opacity-40" style={{ color: fontColor.value }}>{formatTime(Date.now() - Math.random() * 3600000)}</span>
                  </div>
                  <div className="text-xs sm:text-sm opacity-50 truncate" style={{ color: fontColor.value }}>{char.prompt.slice(0, 20)}...</div>
                </div>
              </div>
            ))}
          </div>

          {/* 消息列表 */}
          {smsMessages.length > 0 && (
            <div className="space-y-2 sm:space-y-3 mt-3 sm:mt-4">
              <div className="text-[10px] sm:text-xs opacity-40 text-center" style={{ color: fontColor.value }}>最近消息</div>
              {smsMessages.slice(-5).map((msg) => (
                <div key={msg.id} className={`flex ${msg.senderId === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-xs sm:text-sm ${
                    msg.senderId === 'user' ? 'bg-gradient-to-r from-pink-500 to-rose-400 text-white rounded-br-sm' : 'bg-white/60 rounded-bl-sm border border-white/30'
                  }`} style={{ color: msg.senderId === 'user' ? '#fff' : fontColor.value }}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 快捷回复 */}
          <div className="space-y-2">
            <div className="text-[10px] sm:text-xs opacity-40" style={{ color: fontColor.value }}>快捷回复</div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {['我到了✨', '稍后~', '喝水💧', '好的！', '晚安🌙'].map((t) => (
                <button key={t} className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-white/50 hover:bg-white/60 text-[11px] sm:text-sm font-medium transition-colors press-effect border border-white/30" onClick={() => quickSend(t)} style={{ color: fontColor.value }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 底部输入框 */}
        <div className="mt-2 sm:mt-3 flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入消息..."
            className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-white/50 border border-white/30 placeholder:opacity-40 focus:border-white/50 transition-colors text-xs sm:text-sm"
            style={{ color: fontColor.value }}
          />
          <button onClick={handleSend} disabled={!inputText.trim()} className="px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-pink-500 to-rose-400 text-white font-medium disabled:opacity-50 transition-opacity press-effect text-xs sm:text-sm">
            发送
          </button>
        </div>
      </div>
    </PageContainer>
  )
}
