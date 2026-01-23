import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOS } from '../../context/OSContext'
import WeChatLayout from './WeChatLayout'
import ChatsTab from './tabs/ChatsTab'
import ContactsTab from './tabs/ContactsTab'
import MomentsTab from './tabs/MomentsTab'
import MeTab from './tabs/MeTab'

type TabType = 'chats' | 'contacts' | 'moments' | 'me'

const ACTIVE_TAB_KEY = 'wechat_active_tab'

export default function WeChatScreen() {
  const navigate = useNavigate()
  const { } = useOS()
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_TAB_KEY) as TabType | null
      return saved || 'chats'
    } catch {
      return 'chats'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, activeTab)
    } catch {
      // ignore
    }
  }, [activeTab])

  const renderTabContent = () => {
    switch (activeTab) {
      case 'chats':
        return <ChatsTab onBack={() => navigate('/', { replace: true })} />
      case 'contacts':
        return <ContactsTab onBack={() => navigate('/', { replace: true })} />
      case 'moments':
        return <MomentsTab onBack={() => navigate('/', { replace: true })} />
      case 'me':
        return <MeTab onBack={() => navigate('/', { replace: true })} />
    }
  }

  // Tab图标 - 简约线条风格
  const TabIcon = ({ type, active }: { type: TabType; active: boolean }) => {
    const color = active ? '#07C160' : '#8C8C8C'
    const strokeWidth = active ? 2 : 1.5
    
    switch (type) {
      case 'chats':
        return (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )
      case 'contacts':
        return (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        )
      case 'moments':
        return (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        )
      case 'me':
        return (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={strokeWidth}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        )
    }
  }

  const tabLabels: Record<TabType, string> = {
    chats: '消息',
    contacts: '通讯录',
    moments: '朋友圈',
    me: '我',
  }

  return (
    <WeChatLayout>
      <div className="flex h-full flex-col overflow-hidden -mt-1">
        {/* 内容区 */}
        <div className="flex-1 overflow-hidden">
          {renderTabContent()}
        </div>

        {/* 底部导航栏 */}
        <div 
          className="flex items-center justify-around py-2 border-t"
          style={{ 
            background: 'rgba(247,247,247,0.95)',
            borderColor: '#E5E5E5'
          }}
        >
          {(['chats', 'contacts', 'moments', 'me'] as TabType[]).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="flex flex-col items-center gap-0.5 px-4 py-1 transition-all"
            >
              <TabIcon type={tab} active={activeTab === tab} />
              <span 
                className="text-[10px]"
                style={{ 
                  color: activeTab === tab ? '#07C160' : '#8C8C8C'
                }}
              >
                {tabLabels[tab]}
              </span>
            </button>
          ))}
        </div>
      </div>
    </WeChatLayout>
  )
}
