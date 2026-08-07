import { useMemo, useState } from 'react'
import {
  createComponentDraft,
  getComponentDefinition,
  saveComponentDefinition,
  type ComponentDefinition,
  type ComponentStatus,
} from './storage'
import './component-editor.css'

export function ComponentEditorPage({ componentId }: { componentId: string }) {
  const initial = useMemo(() =>
    componentId === 'new'
      ? createComponentDraft()
      : getComponentDefinition(componentId) ?? createComponentDraft(),
  [componentId])
  const [component, setComponent] = useState<ComponentDefinition>(initial)
  const [message, setMessage] = useState('')
  const readOnly = component.builtIn

  function update<K extends keyof ComponentDefinition>(
    key: K,
    value: ComponentDefinition[K],
  ) {
    setComponent((current) => ({ ...current, [key]: value }))
    setMessage('')
  }

  function save() {
    try {
      const saved = saveComponentDefinition(component)
      setComponent(saved)
      setMessage('组件定义已保存')
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
          <span>{component.type}</span>
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
            <span>COMPONENT DEFINITION</span>
            <h1>组件定义</h1>
            <p>这里维护组件的稳定身份和默认几何信息。后续组件注册表直接消费这层定义。</p>
          </div>

          {readOnly && (
            <div className="component-readonly-note">
              内置组件当前只读；它的运行时实现仍由编辑器代码提供，不在这里覆盖。
            </div>
          )}

          <div className="component-form-grid">
            <label>
              <span>名称</span>
              <input
                value={component.name}
                readOnly={readOnly}
                onChange={(event) => update('name', event.target.value)}
              />
            </label>
            <label>
              <span>类型标识</span>
              <input
                value={component.type}
                readOnly={readOnly}
                onChange={(event) => update('type', event.target.value)}
              />
            </label>
            <label>
              <span>分类</span>
              <input
                value={component.category}
                readOnly={readOnly}
                onChange={(event) => update('category', event.target.value)}
              />
            </label>
            <label>
              <span>状态</span>
              <select
                value={component.status}
                disabled={readOnly}
                onChange={(event) => update('status', event.target.value as ComponentStatus)}
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
                value={component.defaultWidth}
                readOnly={readOnly}
                onChange={(event) => update('defaultWidth', Number(event.target.value))}
              />
            </label>
            <label>
              <span>默认高度</span>
              <input
                type="number"
                min="1"
                value={component.defaultHeight}
                readOnly={readOnly}
                onChange={(event) => update('defaultHeight', Number(event.target.value))}
              />
            </label>
          </div>

          <label className="component-form-block">
            <span>说明</span>
            <textarea
              rows={4}
              value={component.description}
              readOnly={readOnly}
              onChange={(event) => update('description', event.target.value)}
            />
          </label>
        </section>

        <section className="component-code-card">
          <div className="component-form-heading">
            <span>RENDER DRAFT</span>
            <h1>组件实现</h1>
            <p>当前先保存实现草稿；真正的编译、预览与运行时注册将在组件运行时阶段接入。</p>
          </div>
          <textarea
            className="component-code-editor"
            spellCheck={false}
            value={component.renderCode}
            readOnly={readOnly}
            onChange={(event) => update('renderCode', event.target.value)}
          />
          {message && <div className="component-editor-message" role="status">{message}</div>}
        </section>
      </main>
    </div>
  )
}
