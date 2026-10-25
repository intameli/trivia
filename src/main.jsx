import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import GameModes from './GameModes.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GameModes />
  </StrictMode>,
)
