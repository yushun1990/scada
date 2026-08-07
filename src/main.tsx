import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import App from './App'
import './styles.css'
import './editor-chrome.css'

// A SCADA editor favors stable interaction cost over retina-level canvas
// backing stores. This prevents every full-size layer from scaling its pixel
// workload by devicePixelRatio² on high-DPI desktops.
Konva.pixelRatio = 1
Konva.hitOnDragEnabled = false

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
