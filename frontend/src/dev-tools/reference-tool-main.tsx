import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ReferenceToolApp } from './ReferenceToolApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReferenceToolApp />
  </StrictMode>
)
