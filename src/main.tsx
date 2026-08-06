import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import App from './App'
import './styles.css'

// The editor performs explicit layer batch draws during drag. Disabling Konva's
// per-attribute automatic scheduling prevents the same frame from being queued
// repeatedly while ports, connections, guides, and selections are updated.
Konva.autoDrawEnabled = false
Konva.hitOnDragEnabled = false

// Keep the editing canvas predictable on high-DPI desktops. Multiple full-size
// canvas layers otherwise scale their pixel workload by devicePixelRatio².
Konva.pixelRatio = 1

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
