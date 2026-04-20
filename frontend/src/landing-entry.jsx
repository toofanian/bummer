import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './landing.css'
import LandingPage from './LandingPage.jsx'

createRoot(document.getElementById('landing-root')).render(
  <StrictMode>
    <LandingPage />
  </StrictMode>,
)
