import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { Button, Input, Pressable } from '../../ui'
import {
  exportBrowserDebugSnapshot,
  getBrowserStorageDiagnostics,
  importBrowserDebugSnapshot,
  resetBrowserPersistence,
} from '../../storage/browser-persistence'
import {
  createDistributableComponentPackage,
  parseDistributableComponentPackageDocument,
  serializeDistributableComponentPackage,
} from '../component-library/distributable-component-package'
import {
  importDistributableComponentPackage,
  inspectDistributableComponentImport,
  listComponentDefinitions,
  type ComponentLibraryEntry,
} from '../component-library/storage'
import {
  createScadaWork,
  exportScadaWorkPackageDocument,
  importScadaWorkPackage,
  inspectScadaWorkPackageImportDocument,
  listScadaWorks,
  type ScadaWorkSummary,
} from '../scada-works/storage'
import './workspace.css'

type WorkspaceModule = 'works' | 'components'

type WorkspacePageProps = {
  module: WorkspaceModule
}

function formatUpdatedAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '未知时间'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function navigate(path: string) {
  window.location.hash = path
}

function portableComponentFileName(componentType: string) {
  const safeType = componentType
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'component'
  return `${safeType}.scada-component.json`
}

function portableWorkFileName(name: string) {
  const safeName = name
    .trim()
    .replace(/[^a-zA-Z0-9._\u4e00-\u9fff-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'scada-work'
  return `${safeName}.scada-work.json`
}

function downloadTextFile(contents: string, fileName: string) {
  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

export function WorkspacePage({ module }: WorkspacePageProps) {
  const [works, setWorks] = useState<ScadaWorkSummary[]>([])
  const [components, setComponents] = useState<ComponentLibraryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const snapshotInputRef = useRef<HTMLInputElement>(null)
  const componentPackageInputRef = useRef<HTMLInputElement>(null)
  const workPackageInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const [nextWorks, nextComponents] = await Promise.all([
        listScadaWorks(),
        listComponentDefinitions(),
      ])
      setWorks(nextWorks)
      setComponents(nextComponents)
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '本地数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const handleFocus = () => void refresh()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [refresh])

  function openWork(workId: string) {
    navigate(`#/scada/${encodeURIComponent(workId)}`)
  }

  async function createWork() {
    try {
      const work = await createScadaWork()
      await refresh()
      openWork(work.id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建作品失败')
    }
  }

  async function exportWorkPackage(work: ScadaWorkSummary) {
    try {
      const exported = await exportScadaWorkPackageDocument(work.id)
      downloadTextFile(
        exported.document,
        portableWorkFileName(exported.workPackage.scene.name),
      )
      setMessage(`已导出作品 ${exported.workPackage.scene.name}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '作品导出失败')
    }
  }

  async function importWorkPackage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const inspected = await inspectScadaWorkPackageImportDocument(await file.text())
      if (inspected.plan.kind === 'collision') {
        setMessage(inspected.plan.message)
        return
      }

      const importedCount = inspected.plan.dependenciesToImport.length
      const reusedCount = inspected.plan.reusedDependencies.length
      const confirmed = window.confirm(
        `确认导入作品“${inspected.plan.sceneName}”？\n\n组件依赖：${inspected.workPackage.dependencies.length} 个\n新增本地依赖：${importedCount} 个\n复用已有依赖：${reusedCount} 个\n\n确认后会一次性保存作品与缺失依赖。`,
      )
      if (!confirmed) {
        setMessage(`已取消导入 ${file.name}`)
        return
      }

      const imported = await importScadaWorkPackage(inspected.workPackage)
      await refresh()
      setMessage(`已导入作品 ${imported.name}`)
      openWork(imported.id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '作品导入失败')
    }
  }

  function openComponent(componentId: string) {
    navigate(`#/components/${encodeURIComponent(componentId)}`)
  }

  function createComponent() {
    navigate('#/components/new')
  }

  function exportComponentPackage(component: ComponentLibraryEntry) {
    try {
      const componentPackage = createDistributableComponentPackage(component)
      downloadTextFile(
        serializeDistributableComponentPackage(componentPackage),
        portableComponentFileName(component.definition.type),
      )
      setMessage(`已导出组件 ${component.definition.title}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '组件导出失败')
    }
  }

  async function importComponentPackage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const componentPackage = parseDistributableComponentPackageDocument(
        await file.text(),
      )
      if (!componentPackage) {
        throw new Error('组件包无效或版本不受支持')
      }

      const plan = await inspectDistributableComponentImport(componentPackage)
      if (plan.kind === 'collision') {
        setMessage(plan.message)
        return
      }

      const confirmed = window.confirm(
        `确认导入组件“${plan.title}”？\n\n类型：${plan.componentType}\n\n导入后会作为新的本地可编辑组件保存并进入正常运行时激活流程。`,
      )
      if (!confirmed) {
        setMessage(`已取消导入 ${file.name}`)
        return
      }

      const imported = await importDistributableComponentPackage(componentPackage)
      await refresh()
      setMessage(`已导入组件 ${imported.definition.title}`)
      openComponent(imported.id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '组件导入失败')
    }
  }

  async function exportDebugSnapshot() {
    try {
      const snapshot = await exportBrowserDebugSnapshot()
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `scada-debug-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setMessage('本地调试快照已导出')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '调试快照导出失败')
    }
  }

  async function importDebugSnapshot(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      await importBrowserDebugSnapshot(JSON.parse(await file.text()))
      await refresh()
      setMessage(`已导入调试快照 ${file.name}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '调试快照导入失败')
    }
  }

  async function showStorageDiagnostics() {
    try {
      const diagnostics = await getBrowserStorageDiagnostics()
      const migration = diagnostics.legacyMigration as { status?: unknown } | null
      setMessage(
        `IndexedDB v${diagnostics.databaseVersion} · ${diagnostics.sceneCount} scenes · ${diagnostics.componentCount} components · migration ${String(migration?.status ?? 'unknown')}`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '存储诊断失败')
    }
  }

  async function resetStorage() {
    if (!window.confirm('确认清空本地 SCADA 作品与自定义组件？此操作不可撤销。')) {
      return
    }

    try {
      await resetBrowserPersistence()
      await refresh()
      setMessage('本地数据库已重置')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '本地数据库重置失败')
    }
  }

  const storageTools = (
    <div className="workspace-storage-tools" aria-label="本地存储工具">
      <Button variant="secondary" size="small" onClick={() => void showStorageDiagnostics()}>
        存储诊断
      </Button>
      <Button variant="secondary" size="small" onClick={() => void exportDebugSnapshot()}>
        导出调试快照
      </Button>
      <Button
        variant="secondary"
        size="small"
        onClick={() => snapshotInputRef.current?.click()}
      >
        导入调试快照
      </Button>
      <Button variant="ghost" size="small" onClick={() => void resetStorage()}>
        重置本地数据
      </Button>
      <Input
        ref={snapshotInputRef}
        className="hidden-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void importDebugSnapshot(event)}
      />
    </div>
  )

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          <span className="workspace-brand-mark" aria-hidden="true">◆</span>
          <div>
            <strong>SCADA Studio</strong>
            <span>工程工作台</span>
          </div>
        </div>

        <nav className="workspace-nav" aria-label="主模块">
          <Pressable
            className={`workspace-nav-item${module === 'works' ? ' active' : ''}`}
            onClick={() => navigate('#/works')}
          >
            <span className="workspace-nav-icon">▦</span>
            <span>
              <strong>SCADA 作品</strong>
              <small>设计、预览与管理场景</small>
            </span>
          </Pressable>
          <Pressable
            className={`workspace-nav-item${module === 'components' ? ' active' : ''}`}
            onClick={() => navigate('#/components')}
          >
            <span className="workspace-nav-icon">◇</span>
            <span>
              <strong>组件库开发</strong>
              <small>开发与维护可复用组件</small>
            </span>
          </Pressable>
        </nav>

        {storageTools}
      </aside>

      <main className="workspace-main">
        {message && <div className="workspace-message" role="status">{message}</div>}
        {module === 'works' ? (
          <section className="workspace-section">
            <header className="workspace-section-header">
              <div>
                <span className="workspace-eyebrow">SCADA WORKS</span>
                <h1>SCADA 作品</h1>
                <p>每个作品拥有独立场景存储；作品包会显式携带运行所需的可移植组件依赖。</p>
              </div>
              <div className="workspace-header-actions">
                <Button
                  variant="secondary"
                  disabled={loading}
                  onClick={() => workPackageInputRef.current?.click()}
                >
                  导入作品
                </Button>
                <Button
                  variant="primary"
                  className="workspace-primary-button"
                  disabled={loading}
                  onClick={() => void createWork()}
                >
                  + 新建作品
                </Button>
                <Input
                  ref={workPackageInputRef}
                  className="hidden-input"
                  type="file"
                  accept="application/json,.json,.scada-work.json"
                  aria-label="选择 SCADA 作品包文件"
                  onChange={(event) => void importWorkPackage(event)}
                />
              </div>
            </header>

            <div className="workspace-card-grid" aria-busy={loading}>
              {works.map((work) => (
                <article className="workspace-card" key={work.id}>
                  <div className="work-preview" aria-hidden="true">
                    <span>{work.width} × {work.height}</span>
                    <div className="work-preview-canvas">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <div className="workspace-card-body">
                    <div className="workspace-card-title-row">
                      <h2>{work.name}</h2>
                      <span className="workspace-badge">SCADA</span>
                    </div>
                    <div className="workspace-card-meta">
                      <span>{work.nodeCount} 个组件</span>
                      <span>{work.connectionCount} 条连线</span>
                      <span>更新 {formatUpdatedAt(work.updatedAt)}</span>
                    </div>
                    <div className="work-card-actions">
                      <Button
                        variant="ghost"
                        size="small"
                        className="workspace-card-action"
                        aria-label={`导出作品 ${work.name}`}
                        onClick={() => void exportWorkPackage(work)}
                      >
                        导出
                      </Button>
                      <Button
                        variant="ghost"
                        size="small"
                        className="workspace-card-action"
                        onClick={() => openWork(work.id)}
                      >
                        编辑
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="workspace-section">
            <header className="workspace-section-header">
              <div>
                <span className="workspace-eyebrow">COMPONENT LIBRARY</span>
                <h1>组件库开发</h1>
                <p>组件开发工作台维护可复用组件的公开契约与私有实现，SCADA 组态只消费被明确暴露的能力。</p>
              </div>
              <div className="workspace-header-actions">
                <Button
                  variant="secondary"
                  disabled={loading}
                  onClick={() => componentPackageInputRef.current?.click()}
                >
                  导入组件
                </Button>
                <Button
                  variant="primary"
                  className="workspace-primary-button"
                  disabled={loading}
                  onClick={createComponent}
                >
                  + 新建组件
                </Button>
                <Input
                  ref={componentPackageInputRef}
                  className="hidden-input"
                  type="file"
                  accept="application/json,.json,.scada-component.json"
                  aria-label="选择组件包文件"
                  onChange={(event) => void importComponentPackage(event)}
                />
              </div>
            </header>

            <div className="component-table" role="table" aria-label="组件列表" aria-busy={loading}>
              <div className="component-table-row component-table-head" role="row">
                <span>组件</span>
                <span>类型</span>
                <span>分类</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              {components.map((component) => {
                const { definition } = component
                const canExport = !component.builtIn && component.status === 'ready'

                return (
                  <div className="component-table-row" role="row" key={component.id}>
                    <div className="component-name-cell">
                      <span className="component-avatar">{definition.title.slice(0, 1).toUpperCase()}</span>
                      <span>
                        <strong>{definition.title}</strong>
                        <small>{definition.size.defaultWidth} × {definition.size.defaultHeight}</small>
                      </span>
                    </div>
                    <code>{definition.type}</code>
                    <span>{definition.category}</span>
                    <span>
                      <span className={`workspace-badge ${component.status}`}>
                        {component.builtIn ? '内置' : component.status === 'ready' ? '可用' : '草稿'}
                      </span>
                    </span>
                    <div className="component-row-actions">
                      {canExport && (
                        <Button
                          variant="ghost"
                          size="small"
                          className="component-export-button"
                          aria-label={`导出组件 ${definition.title}`}
                          onClick={() => exportComponentPackage(component)}
                        >
                          导出
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="small"
                        className="component-edit-button"
                        onClick={() => openComponent(component.id)}
                      >
                        {component.builtIn ? '查看' : '编辑'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
