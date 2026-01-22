import { useOS } from '../context/OSContext'
import { useNavigate, useLocation } from 'react-router-dom'

export default function BottomHomeBar() {
  const { isLocked, setLocked } = useOS()
  const navigate = useNavigate()
  const location = useLocation()
  
  const handleClick = () => {
    if (isLocked) return
    if (location.pathname === '/') {
      setLocked(true)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="pb-1.5 sm:pb-2 pt-2 sm:pt-3 flex justify-center">
      <div 
        className="h-[4px] sm:h-[5px] w-28 sm:w-[134px] rounded-full bg-current opacity-70 cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
        onClick={handleClick}
      />
    </div>
  )
}
