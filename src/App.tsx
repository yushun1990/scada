import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ComponentEditorPage } from './features/component-library/ComponentEditorPage'
import { ScadaEditorPage } from './features/scada-editor/ScadaEditorPage'
import { WorkspacePage } from './features/workspace/WorkspacePage'
import { Button, Separator } from './ui'
import './inspector-compact.css'
import './component-editor-header.css'

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
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setToolbar(document.querySelector<HTMLElement>('.editor-header .document-toolbar'))
  }, [module])

  if (!toolbar) {
    return null
  }

  const title = module === 'components' ? '返回组件库工作台' : '返回 SCADA 作品工作台'

  return createPortal(
    <>
      <Separator orientation="vertical" className="ui-workspace-separator" />
      <Button
        variant="accent"
        className="ui-workspace-exit"
        title={title}
        aria-label={title}
        onClick={() => navigateToWorkspace(module)}
      >
        ← 工作台
      </Button>
    </>,
    toolbar,
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
        <StudioWorkspaceExit key={`scada-${route.workId}`} module="works" />
      </>
    )
  }

  if (route.page === 'component') {
    return (
      <>
        <ComponentEditorPage key={route.componentId} componentId={route.componentId} />
        <StudioWorkspaceExit key={`component-${route.componentId}`} module="components" />
      </>
    )
  }

  return <WorkspacePage module={route.module} />
}

export default App
