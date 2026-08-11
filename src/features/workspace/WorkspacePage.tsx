import { useEffect, useState } from 'react'
import { Button } from '../../ui'
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

export function WorkspacePage({ module }: WorkspacePageProps) {
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
    navigate(`#/scada/${encodeURIComponent(workId)}`)
  }

  function createWork() {
    const work = createScadaWork()
    setWorks(listScadaWorks())
    openWork(work.id)
  }

  function openComponent(componentId: string) {
    navigate(`#/components/${encodeURIComponent(componentId)}`)
  }

  function createComponent() {
    navigate('#/components/new')
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
            className={module === 'works' ? 'active' : ''}
            onClick={() => navigate('#/works')}
          >
            <span className="workspace-nav-icon">▦</span>
            <span>
              <strong>SCADA 作品</strong>
              <small>设计、预览与管理场景</small>
            </span>
          </button>
          <button
            type="button"
            className={module === 'components' ? 'active' : ''}
            onClick={() => navigate('#/components')}
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
        {module === 'works' ? (
          <section className="workspace-section">
            <header className="workspace-section-header">
              <div>
                <span className="workspace-eyebrow">SCADA WORKS</span>
                <h1>SCADA 作品</h1>
                <p>每个作品拥有独立场景存储，默认在当前页面进入编辑器；需要并行编辑时可由浏览器另开标签页。</p>
              </div>
              <Button variant="primary" className="workspace-primary-button" onClick={createWork}>
                + 新建作品
              </Button>
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
                    <Button
                      variant="ghost"
                      size="small"
                      className="workspace-card-action"
                      onClick={() => openWork(work.id)}
                    >
                      编辑
                    </Button>
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
              <Button variant="primary" className="workspace-primary-button" onClick={createComponent}>
                + 新建组件
              </Button>
            </header>

            <div className="component-table" role="table" aria-label="组件列表">
              <div className="component-table-row component-table-head" role="row">
                <span>组件</span>
                <span>类型</span>
                <span>分类</span>
                <span>状态</span>
                <span>操作</span>
              </div>
              {components.map((component) => {
                const { definition } = component

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
                    <Button
                      variant="ghost"
                      size="small"
                      className="component-edit-button"
                      onClick={() => openComponent(component.id)}
                    >
                      {component.builtIn ? '查看' : '编辑'}
                    </Button>
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
