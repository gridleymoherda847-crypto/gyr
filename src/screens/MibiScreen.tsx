import { useNavigate } from 'react-router-dom'
import { useOS } from '../context/OSContext'
import AppHeader from '../components/AppHeader'
import PageContainer from '../components/PageContainer'

export default function MibiScreen() {
  const navigate = useNavigate()
  const { fontColor } = useOS()

  return (
    <PageContainer>
      <div className="flex h-full flex-col px-3 sm:px-4 pt-2 pb-2 animate-fade-in">
        <AppHeader title="米币" onBack={() => navigate('/', { replace: true })} />
        
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center opacity-40" style={{ color: fontColor.value }}>
            <div className="text-4xl mb-3">🪙</div>
            <p className="text-sm">敬请期待</p>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
