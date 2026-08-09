import { useMemo, useState } from 'react'
import type { ComponentDefinition } from '../../component-system/definition'
import {
  ComponentContractEditor,
  type ComponentContractTab,
} from './ComponentContractEditor'
import { ComponentVisualTreeEditor } from './ComponentVisualTreeEditor'
import {
  createComponentDraft,
  getComponentDefinition,
  saveComponentDefinition,
  type ComponentLibraryEntry,
  type ComponentStatus,
} from './storage'
import './component-editor.css'

type WorkbenchTab = 'visual' | 'component' | ComponentContractTab

const WORKBENCH_TABS: Array<[WorkbenchTab, string]> = [
  ['visual', '设计'],
  ['component', '组件'],
  ['properties', '属性'],
  ['actions', '方法'],
  ['events', '事件'],
  ['anchors', '锚点'],
]

export function ComponentEditorPage({ componentId }: { componentId: string }) {
  const initial = useMemo(() =>
    componentId === 'new'
      ? createComponentDraft()
      : getComponentDefinition(componentId) ?? createComponentDraft(),
  [componentId])
  const [component, setComponent] = useState<ComponentLibraryEntry>(initial)
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('visual')
  const [message, setMessage] = useState('')
  const readOnly = component.builtIn
  const { definition } = component

  function updatePackage<K extends keyof ComponentLibraryEntry>(
    key: K,
    value: ComponentLibraryEntry[K],
  ) {
    setComponent((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  function updateDefinition(nextDefinition: ComponentDefinition) {
    setComponent((current) => ({ ...current, definition: nextDefinition }))
    setMessage('')
  }

  function updateDefinitionField<K extends keyof ComponentDefinition>(
    key: K,
    value: ComponentDefinition[K],
  ) {
    updateDefinition({ ...definition, [key]: value })
  }

  function updateSize(
    key: keyof ComponentDefinition['size'],
    value: number,
  ) {
    updateDefinition({
      ...definition,
      size: { ...definition.size, [key]: value },
    })
  }

  function save() {
    try {
      const saved = saveComponentDefinition(component)
      setComponent(saved)
      setMessage('已保存')
      window.location.hash = `#/components/${encodeURIComponent(saved.id)}`
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '组件保存失败')
    }
  }

  const tabCounts: Partial<Record<WorkbenchTab, number>> = {
    properties: Object.keys(definition.properties).length,
    actions: Object.keys(definition.actions).length,
    events: Object.keys(definition.events).length,
    anchors: definition.anchors.length,
    visual: component.visual.layers.length,
  }

  return (
    <div className="component-editor-shell">
      <header className="component-editor-header">
        <button
          type="button"
          className="component-back-button"
          onClick={() => { window.location.hash = '#/' }}
        >
          ← 组件库
        </button>

        <div className="component-header-title">
          <strong>{definition.title}</strong>
          <span>{definition.type}</span>
        </div>

        <div className="component-header-actions">
          {message && <span className="component-editor-message" role="status">{message}</span>}
          <span className={`component-status-pill ${component.status}`}>
            {readOnly ? '内置' : component.status === 'ready' ? '可用' : '草稿'}
          </span>
          <button
            type="button"
            className="component-save-button"
            disabled={readOnly}
            onClick={save}
          >
            保存组件
          </button>
        </div>
      </header>

      <nav className="component-workbench-nav" aria-label="组件开发工作区">
        {WORKBENCH_TABS.map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {label}
            {tabCounts[tab] !== undefined && <small>{tabCounts[tab]}</small>}
          </button>
        ))}
        <span className="component-workbench-boundary">
          {activeTab === 'visual' ? 'Private Implementation' : 'Public Contract'}
        </span>
      </nav>

      <main className={`component-editor-main ${activeTab === 'visual' ? 'visual-mode' : ''}`}>
        {activeTab === 'visual' && (
          <ComponentVisualTreeEditor
            visual={component.visual}
            readOnly={readOnly}
            componentTitle={definition.title}
            designWidth={definition.size.defaultWidth}
            designHeight={definition.size.defaultHeight}
            onChange={(visual) => updatePackage('visual', visual)}
          />
        )}

        {activeTab === 'component' && (
          <section className="component-workspace-card component-form-card">
            <div className="component-form-heading">
              <span>PACKAGE / DEFINITION</span>
              <h1>组件基本信息</h1>
              <p>这里维护组件稳定身份与尺寸。Properties / Actions / Events / Anchors 分别在独立工作区维护。</p>
            </div>

            {readOnly && (
              <div className="component-readonly-note">
                内置组件是 Registry Definition 的只读视图；Native Renderer / Action Handler 仍由可信应用代码注册。
              </div>
            )}

            <div className="component-definition-summary">
              <span>Package v{component.version}</span>
              <span>{component.visual.mode === 'native' ? 'Native Visual' : `${component.visual.layers.length} Layers`}</span>
              <span>{Object.keys(definition.properties).length} Properties</span>
              <span>{Object.keys(definition.actions).length} Actions</span>
              <span>{Object.keys(definition.events).length} Events</span>
              <span>{definition.anchors.length} Anchors</span>
            </div>

            <div className="component-form-grid">
              <label>
                <span>名称</span>
                <input
                  value={definition.title}
                  readOnly={readOnly}
                  onChange={(event) => updateDefinitionField('title', event.target.value)}
                />
              </label>
              <label>
                <span>类型标识</span>
                <input
                  value={definition.type}
                  readOnly={readOnly}
                  onChange={(event) => updateDefinitionField('type', event.target.value)}
                />
              </label>
              <label>
                <span>分类</span>
                <input
                  value={definition.category}
                  readOnly={readOnly}
                  onChange={(event) => updateDefinitionField('category', event.target.value)}
                />
              </label>
              <label>
                <span>状态</span>
                <select
                  value={component.status}
                  disabled={readOnly}
                  onChange={(event) => updatePackage(
                    'status',
                    event.target.value as ComponentStatus,
                  )}
                >
                  <option value="draft">草稿</option>
                  <option value="ready">可用</option>
                </select>
              </label>
              <label>
                <span>默认宽度</span>
                <input
                  type="number"
                  min="1"
                  value={definition.size.defaultWidth}
                  readOnly={readOnly}
                  onChange={(event) => updateSize('defaultWidth', Number(event.target.value))}
                />
              </label>
              <label>
                <span>默认高度</span>
                <input
                  type="number"
                  min="1"
                  value={definition.size.defaultHeight}
                  readOnly={readOnly}
                  onChange={(event) => updateSize('defaultHeight', Number(event.target.value))}
                />
              </label>
              <label>
                <span>最小宽度</span>
                <input
                  type="number"
                  min="1"
                  value={definition.size.minWidth}
                  readOnly={readOnly}
                  onChange={(event) => updateSize('minWidth', Number(event.target.value))}
                />
              </label>
              <label>
                <span>最小高度</span>
                <input
                  type="number"
                  min="1"
                  value={definition.size.minHeight}
                  readOnly={readOnly}
                  onChange={(event) => updateSize('minHeight', Number(event.target.value))}
                />
              </label>
            </div>

            <label className="component-form-block">
              <span>说明</span>
              <textarea
                rows={4}
                value={definition.description}
                readOnly={readOnly}
                onChange={(event) => updateDefinitionField('description', event.target.value)}
              />
            </label>

            <div className="component-implementation-note">
              <strong>实现代码入口暂不展示</strong>
              <span>
                旧 implementationDraft 仍保留在 Package 中用于兼容，但不会在主界面误导组件开发流程；M6.5 将由正式 Controlled Script 工作区替代。
              </span>
            </div>
          </section>
        )}

        {(activeTab === 'properties' ||
          activeTab === 'actions' ||
          activeTab === 'events' ||
          activeTab === 'anchors') && (
          <ComponentContractEditor
            definition={definition}
            readOnly={readOnly}
            tab={activeTab}
            onChange={updateDefinition}
          />
        )}
      </main>
    </div>
  )
}
