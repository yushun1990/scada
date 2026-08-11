import { useEffect, useState } from 'react'
import { ComponentEditorPage } from './features/component-library/ComponentEditorPage'
import { ScadaEditorPage } from './features/scada-editor/ScadaEditorPage'
import { WorkspacePage } from './features/workspace/WorkspacePage'
import './inspector-compact.css'
import './component-editor-header.css'

type AppRoute =
  | { page: 'workspace' }
  | { page: 'scada'; workId: string }
  | { page: 'component'; componentId: string }

function resolveRoute(): AppRoute {
  const segments = window.location.hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))

  if (segments[0] === 'scada' && segments[1]) {
    return { page: 'scada', workId: segments[1] }
  }

  if (segments[0] === 'components' && segments[1]) {
    return { page: 'component', componentId: segments[1] }
  }

  return { page: 'workspace' }
}

function App() {
  const [route, setRoute] = useState<AppRoute>(resolveRoute)

  useEffect(() => {
    const handleHashChange = () => setRoute(resolveRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (route.page === 'scada') {
    return <ScadaEditorPage key={route.workId} workId={route.workId} />
  }

  if (route.page === 'component') {
    return <ComponentEditorPage key={route.componentId} componentId={route.componentId} />
  }

  return <WorkspacePage />
}

export default App