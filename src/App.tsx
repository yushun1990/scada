import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StandaloneRuntimePage } from './features/runtime/StandaloneRuntimePage'
import {
  commitStudioNavigation,
  consumeStudioNavigationBypass,
  getActiveEditorNavigationGuard,
  normalizeStudioHash,
  requestStudioNavigation,
} from './editor/editor-navigation'
import { Button, Separator } from './ui'
import './inspector-compact.css'
import './component-editor-header.css'
import './editor-toolbar-context.css'

const WorkspacePage = lazy(() =>
  import('./features/workspace/WorkspacePage').then((module) => ({
    default: module.WorkspacePage,
  })),
)
const ScadaEditorStorageGate = lazy(() =>
  import('./features/workspace/EditorStorageGate').then((module) => ({
    default: module.ScadaEditorStorageGate,
  })),
)
const ComponentEditorStorageGate = lazy(() =>
  import('./features/workspace/EditorStorageGate').then((module) => ({
    default: module.ComponentEditorStorageGate,
  })),
)
const UiStatesPage = lazy(() =>
  import('./features/ui-states/UiStatesPage').then((module) => ({
    default: module.UiStatesPage,
  })),
)

type WorkspaceModule = 'works' | 'components'

type AppRoute =
  | { page: 'workspace'; module: WorkspaceModule }
  | { page: 'runtime' }
  | { page: 'ui-states' }
  | { page: 'scada'; workId: string }
  | { page: 'component'; componentId: string }

function resolveRoute(): AppRoute {
  const segments = window.location.hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))

  if (segments[0] === '__ui-states') {
    return { page: 'ui-states' }
  }

  if (segments[0] === 'runtime') {
    return { page: 'runtime' }
  }

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
  requestStudioNavigation(module === 'components' ? '#/components' : '#/works')
}

function StudioWorkspaceExit({ module }: { module: WorkspaceModule }) {
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const resolveToolbar = () => {
      const nextToolbar = document.querySelector<HTMLElement>(
        '.editor-header .document-toolbar',
      )
      setToolbar((current) => current === nextToolbar ? current : nextToolbar)
      return nextToolbar !== null
    }

    if (resolveToolbar()) {
      return
    }

    const observer = new MutationObserver(() => {
      if (resolveToolbar()) {
        observer.disconnect()
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
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

function StorageWriteErrorNotice() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    const handleError = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail
      setMessage(
        detail instanceof Error
          ? `本地保存失败：${detail.message}`
          : '本地保存失败，请导出调试快照后重试',
      )
    }
    window.addEventListener('scada-storage-error', handleError)
    return () => window.removeEventListener('scada-storage-error', handleError)
  }, [])

  if (!message) return null

  return (
    <div className="canvas-toast" role="alert" aria-live="assertive">
      {message}
    </div>
  )
}

function StudioRouteFallback() {
  return <div aria-label="正在加载 Studio" />
}

function App() {
  const [route, setRoute] = useState<AppRoute>(resolveRoute)
  const acceptedHashRef = useRef(normalizeStudioHash(window.location.hash))

  useEffect(() => {
    const handleHashChange = () => {
      const nextHash = normalizeStudioHash(window.location.hash)

      if (consumeStudioNavigationBypass(nextHash)) {
        acceptedHashRef.current = nextHash
        setRoute(resolveRoute())
        return
      }

      const guard = getActiveEditorNavigationGuard()
      if (
        nextHash !== acceptedHashRef.current &&
        guard?.shouldBlock()
      ) {
        const previousHash = acceptedHashRef.current
        guard.requestLeave(nextHash)
        // Hash navigation cannot be cancelled after hashchange fires. Restore
        // the accepted editor location as a new current entry instead of
        // rewriting the target entry: the original Back target remains behind
        // it, so Cancel followed by Back reaches the same guarded destination.
        commitStudioNavigation(previousHash)
        return
      }

      acceptedHashRef.current = nextHash
      setRoute(resolveRoute())
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (route.page === 'ui-states') {
    return (
      <Suspense fallback={<StudioRouteFallback />}>
        <UiStatesPage />
      </Suspense>
    )
  }

  if (route.page === 'runtime') {
    return <StandaloneRuntimePage />
  }

  if (route.page === 'scada') {
    return (
      <Suspense fallback={<StudioRouteFallback />}>
        <ScadaEditorStorageGate key={route.workId} workId={route.workId} />
        <StudioWorkspaceExit key={`scada-${route.workId}`} module="works" />
        <StorageWriteErrorNotice />
      </Suspense>
    )
  }

  if (route.page === 'component') {
    return (
      <Suspense fallback={<StudioRouteFallback />}>
        <ComponentEditorStorageGate
          key={route.componentId}
          componentId={route.componentId}
        />
        <StudioWorkspaceExit key={`component-${route.componentId}`} module="components" />
        <StorageWriteErrorNotice />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<StudioRouteFallback />}>
      <WorkspacePage module={route.module} />
      <StorageWriteErrorNotice />
    </Suspense>
  )
}

export default App
