import '../../m2.css'
import '../../workbench.css'
import { useMemo, useState } from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import type { ComponentDefinition } from '../../component-system/definition'
import { ComponentContractEditor } from './ComponentContractEditor'
import { ComponentPropertyContractEditor } from './ComponentPropertyContractEditor'
import { ComponentVisualCanvas } from './ComponentVisualCanvas'
import {
  ComponentVisualLayerInspector,
  ComponentVisualTreeEditor,
  type ComponentWorkbenchMode,
} from './ComponentVisualTreeEditor'
import {
  createComponentDraft,
  getComponentDefinition,
  saveComponentDefinition,
  type ComponentLibraryEntry,
  type ComponentStatus,
} from './storage'
import './component-editor.css'

type InspectorTab = 'properties' | 'actions' | 'events'

const INSPECTOR_TABS: Array<[InspectorTab, string]> = [
  ['properties', '属性'],
  ['actions', '方法'],
  ['events', '事件'],
]

export function ComponentEditorPage({ componentId }: { componentId: string }) {
  const initial = useMemo(() =>
    componentId === 'new'
      ? createComponentDraft()
      : getComponentDefinition(componentId) ?? createComponentDraft(),
  [componentId])
  const [component, setComponent] = useState<ComponentLibraryEntry>(initial)
  const [mode, setMode] = useState<ComponentWorkbenchMode>('editor')
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('properties')
  const [message, setMessage] = useState('')
  const builtInReadOnly = component.builtIn
  const editingDisabled = builtInReadOnly || mode === 'preview'
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

  function selectLayer(layerId: string | null) {
    setSelectedLayerId(layerId)
    setInspectorTab('properties')
  }

  function save() {
    try {
      const saved = saveComponentDefinition(component)
      setComponent(saved)
      setMessage('组件已保存')
      window.location.hash = `#/components/${encodeURIComponent(saved.id)}`
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '组件保存失败')
    }
  }

  return (
    <div className="editor-shell component-editor-shell">
      <header className="editor-header component-editor-header">
        <div className="brand-block component-brand-block">
          <button
            type="button"
            className="component-back-button"
            aria-label="返回工作区"
            title="返回工作区"
            onClick={() => { window.location.hash = '#/' }}
          >
            ←
          </button>
          <span className="brand-mark" aria-hidden="true">C</span>
          <div className="brand-text">
            <strong>Component Editor</strong>
            <span>{definition.title} · {definition.type}</span>
          </div>
        </div>

        <div className="mode-switch" role="group" aria-label="组件工作模式">
          <button
            type="button"
            className={mode === 'editor' ? 'active' : ''}
            onClick={() => setMode('editor')}
          >
            设计
          </button>
          <button
            type="button"
            className={mode === 'preview' ? 'active' : ''}
            onClick={() => setMode('preview')}
          >
            预览
          </button>
        </div>

        <div className="component-header-actions">
          <span className={`component-status-pill ${component.status}`}>
            {builtInReadOnly ? '内置' : component.status === 'ready' ? '可用' : '草稿'}
          </span>
          <div className="document-toolbar" role="toolbar" aria-label="组件文档操作">
            <button type="button" disabled={builtInReadOnly} onClick={save}>保存</button>
          </div>
        </div>
      </header>

      <main className="editor-main component-editor-main">
        <aside className="component-panel component-layer-panel" aria-label="组件内部图层">
          <ComponentVisualTreeEditor
            visual={component.visual}
            readOnly={editingDisabled}
            componentTitle={definition.title}
            selectedLayerId={selectedLayerId}
            onSelectionChange={selectLayer}
            onChange={(visual) => updatePackage('visual', visual)}
          />
        </aside>

        <section className="canvas-area component-canvas-area" aria-label="组件设计画布">
          {message && (
            <div className="canvas-toast component-canvas-toast" role="status" aria-live="polite">
              {message}
            </div>
          )}
          <ComponentVisualCanvas
            visual={component.visual}
            componentTitle={definition.title}
            designWidth={definition.size.defaultWidth}
            designHeight={definition.size.defaultHeight}
            selectedLayerId={selectedLayerId}
            mode={mode}
          />
        </section>

        <aside className="property-panel component-property-panel">
          <section className="semantic-inspector component-semantic-inspector" aria-label="组件配置">
            <div
              className="inspector-tabs"
              role="tablist"
              aria-label="组件配置检查器"
              style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
            >
              {INSPECTOR_TABS.map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  className={inspectorTab === tab ? 'active' : ''}
                  onClick={() => setInspectorTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>

            {inspectorTab === 'properties' && selectedLayerId !== null && (
              <ComponentVisualLayerInspector
                visual={component.visual}
                readOnly={editingDisabled}
                selectedLayerId={selectedLayerId}
                onSelectionChange={selectLayer}
                onChange={(visual) => updatePackage('visual', visual)}
              />
            )}

            {inspectorTab === 'properties' && selectedLayerId === null && (
              <div className="property-section-list component-root-inspector">
                <CollapsibleInspectorGroup title="基本信息">
                  {builtInReadOnly && (
                    <div className="component-readonly-note">
                      内置组件是 Registry Definition 的只读视图；Native Renderer / Action Handler 仍由可信应用代码注册。
                    </div>
                  )}
                  <label className="property-field">
                    <span>名称</span>
                    <input
                      value={definition.title}
                      disabled={editingDisabled}
                      onChange={(event) => updateDefinitionField('title', event.target.value)}
                    />
                  </label>
                  <label className="property-field">
                    <span>类型标识</span>
                    <input
                      value={definition.type}
                      disabled={editingDisabled}
                      onChange={(event) => updateDefinitionField('type', event.target.value)}
                    />
                  </label>
                  <label className="property-field">
                    <span>分类</span>
                    <input
                      value={definition.category}
                      disabled={editingDisabled}
                      onChange={(event) => updateDefinitionField('category', event.target.value)}
                    />
                  </label>
                  <label className="property-field">
                    <span>状态</span>
                    <select
                      value={component.status}
                      disabled={editingDisabled}
                      onChange={(event) => updatePackage(
                        'status',
                        event.target.value as ComponentStatus,
                      )}
                    >
                      <option value="draft">草稿</option>
                      <option value="ready">可用</option>
                    </select>
                  </label>
                  <label className="property-field">
                    <span>说明</span>
                    <textarea
                      rows={4}
                      value={definition.description}
                      disabled={editingDisabled}
                      onChange={(event) => updateDefinitionField('description', event.target.value)}
                    />
                  </label>
                </CollapsibleInspectorGroup>

                <CollapsibleInspectorGroup title="尺寸">
                  <div className="property-grid">
                    {([
                      ['defaultWidth', '默认宽'],
                      ['defaultHeight', '默认高'],
                      ['minWidth', '最小宽'],
                      ['minHeight', '最小高'],
                    ] as Array<[keyof ComponentDefinition['size'], string]>).map(([field, label]) => (
                      <label key={field} className="property-field compact">
                        <span>{label}</span>
                        <input
                          type="number"
                          min="1"
                          value={definition.size[field]}
                          disabled={editingDisabled}
                          onChange={(event) => updateSize(field, Number(event.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                </CollapsibleInspectorGroup>

                <CollapsibleInspectorGroup title="公开属性" className="component-root-public-properties">
                  <p className="component-inspector-help">
                    这些 Property 是 SCADA Workbench 可配置或可绑定的公开数据入口；内部 Layer 状态不会直接暴露到这里。
                  </p>
                  <ComponentPropertyContractEditor
                    definition={definition}
                    readOnly={editingDisabled}
                    onChange={updateDefinition}
                  />
                </CollapsibleInspectorGroup>

                <CollapsibleInspectorGroup title="连接锚点" className="component-anchor-group">
                  <p className="component-inspector-help">
                    锚点属于组件公开几何接口，用于组态画布连线附着，不承担运行时数据语义。
                  </p>
                  <div className="component-anchor-editor">
                    <ComponentContractEditor
                      definition={definition}
                      readOnly={editingDisabled}
                      tab="anchors"
                      onChange={updateDefinition}
                    />
                  </div>
                </CollapsibleInspectorGroup>

                <CollapsibleInspectorGroup title="实现边界" defaultOpen={false}>
                  <div className="component-implementation-note">
                    <strong>{component.visual.mode === 'native' ? 'Native Renderer' : 'Composite Visual'}</strong>
                    <span>
                      内部 Layer、未来 Rules / Animation / Script 都属于私有实现；SCADA Workbench 只消费公开 Properties / Actions / Events / Anchors。
                    </span>
                  </div>
                </CollapsibleInspectorGroup>
              </div>
            )}

            {inspectorTab === 'actions' && (
              <ComponentContractEditor
                definition={definition}
                readOnly={editingDisabled}
                tab="actions"
                onChange={updateDefinition}
              />
            )}

            {inspectorTab === 'events' && (
              <ComponentContractEditor
                definition={definition}
                readOnly={editingDisabled}
                tab="events"
                onChange={updateDefinition}
              />
            )}
          </section>
        </aside>
      </main>
    </div>
  )
}
