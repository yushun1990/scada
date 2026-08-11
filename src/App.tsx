import { useEffect, useState } from 'react'
import { ComponentEditorPage } from './features/component-library/ComponentEditorPage'
import { ScadaEditorPage } from './features/scada-editor/ScadaEditorPage'
import { WorkspacePage } from './features/workspace/WorkspacePage'
import './inspector-compact.css'
import './component-editor-header.css'
import './studio-navigation.css'

type WorkspaceModule = 'works' | 'components'

type AppRoute =
  | { page: 'workspace'; module: WorkspaceModule }
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

  if (segments[0] === 'components') {
    return { page: 'workspace', module: 'components' }
  }

  return { page: 'workspace', module: 'works' }
}

function navigateToWorkspace(module: WorkspaceModule) {
  window.location.hash = module === 'components' ? '#/components' : '#/works'
}

function StudioWorkspaceExit({ module }: { module: WorkspaceModule }) {
  return (
    <div className="studio-workspace-exit-slot">
      <button
        type="button"
        className="studio-workspace-exit"
        onClick={() => navigateToWorkspace(module)}
      >
        工作台
      </button>
    </div>
  )
}

function App() {
  const [route, setRoute] = useState<AppRoute>(resolveRoute)

  useEffect(() => {
    const handleHashChange = () => setRoute(resolveRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (route.page === 'scada') {
    return (
      <>
        <ScadaEditorPage key={route.workId} workId={route.workId} />
        <StudioWorkspaceExit module="works" />
      </>
    )
  }

  if (route.page === 'component') {
    return (
      <>
        <ComponentEditorPage key={route.componentId} componentId={route.componentId} />
        <StudioWorkspaceExit module="components" />
      </>
    )
  }

  return <WorkspacePage module={route.module} />
}

export default App
