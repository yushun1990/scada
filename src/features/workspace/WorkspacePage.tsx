import { useEffect, useState } from 'react'
import {
  createScadaWork,
  listScadaWorks,
  type ScadaWorkSummary,
} from '../scada-works/storage'
import {
  listComponentDefinitions,
  type ComponentLibraryEntry,
} from '../component-library/storage'
import './workspace.css'

type WorkspaceModule = 'works' | 'components'

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

function buildHashUrl(path: string) {
  return `${window.location.href.split('#')[0]}#${path}`
}

export function WorkspacePage() {
  const [activeModule, setActiveModule] = useState<WorkspaceModule>('works')
  const [works, setWorks] = useState<ScadaWorkSummary[]>(() => listScadaWorks())
  const [components, setComponents] = useState<ComponentLibraryEntry[]>(() =>
    listComponentDefinitions(),
  )

  useEffect(() => {
    const refresh = () => {
      setWorks(listScadaWorks())
      setComponents(listComponentDefinitions())
    }

    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  function openWork(workId: string) {
    window.open(buildHashUrl(`/scada/${encodeURIComponent(workId)}`), '_blank', 'noopener,noreferrer')
  }

  function createWork() {
    const work = createScadaWork()
    setWorks(listScadaWorks())
    openWork(work.id)
  }

  function openComponent(componentId: string) {
    window.location.hash = `#/components/${encodeURIComponent(componentId)}`
  }

  function createComponent() {
    window.location.hash = '#/components/new'
  }

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
          <button
            type="button"
            className={activeModule === 'works' ? 'active' : ''}
            onClick={() => setActiveModule('works')}
          >
            <span className="workspace-nav-icon">▦</span>
            <span>
              <strong>SCADA 作品</strong>
              <small>设计、预览与管理场景</small>
            </span>
          </button>
          <button
            type="button"
            className={activeModule === 'components' ? 'active' : ''}
            onClick={() => setActiveModule('components')}
          >
            <span className="workspace-nav-icon">◇</span>
            <span>
              <strong>组件库开发</strong>
              <small>开发与维护可复用组件</small>
            </span>
          </button>
        </nav>
      </aside>

      <main className="workspace-main">
        {activeModule === 'works' ? (
          <section className="workspace-section">
            <header className="workspace-section-header">
              <div>
                <span className="workspace-eyebrow">SCADA WORKS</span>
                <h1>SCADA 作品</h1>
                <p>每个作品拥有独立场景存储，编辑器会在新的浏览器标签页中打开。</p>
              </div>
              <button className="workspace-primary-button" type="button" onClick={createWork}>
                + 新建作品
              </button>
            </header>

            <div className="workspace-card-grid">
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
                    <button
                      type="button"
                      className="workspace-card-action"
                      onClick={() => openWork(work.id)}
                    >
                      新标签页编辑 ↗
                    </button>
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
                <p>组件定义与 SCADA 作品解耦，集中维护类型、尺寸、说明和渲染实现草稿。</p>
              </div>
              <button className="workspace-primary-button" type="button" onClick={createComponent}>
                + 新建组件
              </button>
            </header>

            <div className="component-table" role="table" aria-label="组件列表">
              <div className="component-table-row component-table-head" role="row">
                <span>组件</span>
                <span>类型</span>
                <span>分类</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              {components.map((component) => (
                <div className="component-table-row" role="row" key={component.id}>
                  <div className="component-name-cell">
                    <span className="component-avatar">{component.name.slice(0, 1).toUpperCase()}</span>
                    <span>
                      <strong>{component.name}</strong>
                      <small>{component.defaultWidth} × {component.defaultHeight}</small>
                    </span>
                  </div>
                  <code>{component.type}</code>
                  <span>{component.category}</span>
                  <span>
                    <span className={`workspace-badge ${component.status}`}>
                      {component.builtIn ? '内置' : component.status === 'ready' ? '可用' : '草稿'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="component-edit-button"
                    onClick={() => openComponent(component.id)}
                  >
                    {component.builtIn ? '查看' : '编辑'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
