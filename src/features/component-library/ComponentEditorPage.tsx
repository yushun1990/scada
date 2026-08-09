import { useMemo, useState } from 'react'
import type { ComponentDefinition } from '../../component-system/definition'
import { ComponentContractEditor } from './ComponentContractEditor'
import { ComponentVisualTreeEditor } from './ComponentVisualTreeEditor'
import {
  createComponentDraft,
  getComponentDefinition,
  saveComponentDefinition,
  type ComponentLibraryEntry,
  type ComponentStatus,
} from './storage'
import './component-editor.css'

export function ComponentEditorPage({ componentId }: { componentId: string }) {
  const initial = useMemo(() =>
    componentId === 'new'
      ? createComponentDraft()
      : getComponentDefinition(componentId) ?? createComponentDraft(),
  [componentId])
  const [component, setComponent] = useState<ComponentLibraryEntry>(initial)
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
    setComponent((current) => ({
      ...current,
      definition: nextDefinition,
    }))
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
      size: {
        ...definition.size,
        [key]: value,
      },
    })
  }

  function save() {
    try {
      const saved = saveComponentDefinition(component)
      setComponent(saved)
      setMessage('组件 Package 已保存')
      window.location.hash = `#/components/${encodeURIComponent(saved.id)}`
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '组件保存失败')
    }
  }

  return (
    <div className="component-editor-shell">
      <header className="component-editor-header">
        <button type="button" className="component-back-button" onClick={() => { window.location.hash = '#/' }}>
          ← 返回工作台
        </button>
        <div>
          <strong>{readOnly ? '查看内置组件' : componentId === 'new' ? '新建组件' : '编辑组件'}</strong>
          <span>{definition.type}</span>
        </div>
        <button
          type="button"
          className="component-save-button"
          disabled={readOnly}
          onClick={save}
        >
          保存组件
        </button>
      </header>

      <main className="component-editor-main">
        <section className="component-form-card">
          <div className="component-form-heading">
            <span>PACKAGE / DEFINITION</span>
            <h1>组件定义</h1>
            <p>这里维护可序列化的 ComponentDefinition。SCADA Workbench、Runtime 和未来用户组件注册路径都应消费这一份公开契约。</p>
          </div>

          {readOnly && (
            <div className="component-readonly-note">
              内置组件为真实 Registry Definition 的只读视图；Native Renderer / Action Handler 仍由可信应用代码注册。
            </div>
          )}

          <div className="component-definition-summary">
            <span>Package v{component.version}</span>
            <span>{Object.keys(definition.properties).length} Properties</span>
            <span>{Object.keys(definition.actions).length} Actions</span>
            <span>{Object.keys(definition.events).length} Events</span>
            <span>{definition.anchors.length} Anchors</span>
            <span>{component.visual.mode === 'native' ? 'Native Visual' : `${component.visual.layers.length} Layers`}</span>
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
                onChange={(event) => updatePackage('status', event.target.value as ComponentStatus)}
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
        </section>

        <ComponentContractEditor
          definition={definition}
          readOnly={readOnly}
          onChange={updateDefinition}
        />

        <ComponentVisualTreeEditor
          visual={component.visual}
          readOnly={readOnly}
          onChange={(visual) => updatePackage('visual', visual)}
        />

        <section className="component-code-card">
          <div className="component-form-heading">
            <span>PRIVATE IMPLEMENTATION DRAFT</span>
            <h1>实现草稿</h1>
            <p>这里暂时只保存文本，不执行代码。Visual Layer 已有独立结构；后续 Rules / Animation / Controlled Script 会继续进入明确的私有实现模型和受控 Runtime API。</p>
          </div>
          <textarea
            className="component-code-editor"
            spellCheck={false}
            value={component.implementationDraft}
            readOnly={readOnly}
            onChange={(event) => updatePackage('implementationDraft', event.target.value)}
          />
          {message && <div className="component-editor-message" role="status">{message}</div>}
        </section>
      </main>
    </div>
  )
}
