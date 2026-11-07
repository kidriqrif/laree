import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')

createRoot(root).render(
  <StrictMode>
    <main>
      <h1>Laree</h1>
      <p>Prototype under construction.</p>
    </main>
  </StrictMode>,
)
