import { useEffect, useState } from 'react'
import { ComponentEditorPage } from '../component-library/ComponentEditorPage'
import { prepareComponentDefinition } from '../component-library/storage'
import { ScadaEditorPage } from '../scada-editor/ScadaEditorPage'
import { prepareScadaScene } from '../scada-works/storage'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

function StorageLoading({ label }: { label: string }) {
  return (
    <div className="workspace-main" role="status" aria-live="polite">
      <div className="workspace-section">
        <p>{label}</p>
      </div>
    </div>
  )
}

function StorageError({ message }: { message: string }) {
  return (
    <div className="workspace-main" role="alert">
      <div className="workspace-section">
        <h1>本地存储加载失败</h1>
        <p>{message}</p>
      </div>
    </div>
  )
}

export function ScadaEditorStorageGate({ workId }: { workId: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    void prepareScadaScene(workId)
      .then(() => {
        if (active) setState({ status: 'ready' })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : '无法读取本地作品',
          })
        }
      })

    return () => {
      active = false
    }
  }, [workId])

  if (state.status === 'loading') {
    return <StorageLoading label="正在加载 SCADA 作品…" />
  }
  if (state.status === 'error') {
    return <StorageError message={state.message} />
  }
  return <ScadaEditorPage workId={workId} />
}

export function ComponentEditorStorageGate({
  componentId,
}: {
  componentId: string
}) {
  const [state, setState] = useState<LoadState>(
    componentId === 'new' ? { status: 'ready' } : { status: 'loading' },
  )

  useEffect(() => {
    if (componentId === 'new') {
      setState({ status: 'ready' })
      return
    }

    let active = true
    setState({ status: 'loading' })
    void prepareComponentDefinition(componentId)
      .then(() => {
        if (active) setState({ status: 'ready' })
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : '无法读取本地组件',
          })
        }
      })

    return () => {
      active = false
    }
  }, [componentId])

  if (state.status === 'loading') {
    return <StorageLoading label="正在加载组件…" />
  }
  if (state.status === 'error') {
    return <StorageError message={state.message} />
  }
  return <ComponentEditorPage componentId={componentId} />
}
