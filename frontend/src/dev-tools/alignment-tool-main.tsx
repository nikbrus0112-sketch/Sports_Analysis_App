import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AlignmentToolApp } from './AlignmentToolApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AlignmentToolApp />
  </StrictMode>
)
