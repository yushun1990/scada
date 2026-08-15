import '../../m2.css'
import '../../workbench.css'
import { useEffect, useMemo, useState } from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import {
  createDefaultPropsFromDefinition,
  isComponentPropertyValue,
  type ComponentDefinition,
  type ComponentProps,
} from '../../component-system/definition'
import type { ComponentVisualDefinition } from '../../component-system/visual'
import type { VisualRuleOperator } from '../../component-system/visualRules'
import {
  Button,
  Input,
  NumberInput,
  SegmentedControl,
  Select,
  Tabs,
  Textarea,
  type SegmentedControlItem,
  type StudioTabItem,
} from '../../ui'
import { ComponentContractEditor } from './ComponentContractEditor'
import { ComponentPreviewValues } from './ComponentPreviewValues'
import { ComponentPropertyContractEditor } from './ComponentPropertyContractEditor'
import { ComponentVisualCanvas } from './ComponentVisualCanvas'
import { ComponentVisualRuleEditor } from './ComponentVisualRuleEditor'
import { ComponentVisualStyleInspector } from './ComponentVisualStyleInspector'
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

const INSPECTOR_TABS: Array<StudioTabItem<InspectorTab>> = [
  { value: 'properties', label: '属性' },
  { value: 'actions', label: '方法' },
  { value: 'events', label: '事件' },
]

const MODE_ITEMS: Array<SegmentedControlItem<ComponentWorkbenchMode>> = [
  { value: 'editor', label: '设计' },
  { value: 'preview', label: '预览' },
]

const STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'ready', label: '可用' },
]

const NUMERIC_RULE_OPERATORS = new Set<VisualRuleOperator>([
  'greaterThan',
  'greaterOrEqual',
  'lessThan',
  'lessOrEqual',
])

function normalizePreviewProps(
  definition: ComponentDefinition,
  current: ComponentProps,
): ComponentProps {
  const next: ComponentProps = {}

  for (const [key, property] of Object.entries(definition.properties)) {
    const currentValue = current[key]
    next[key] = isComponentPropertyValue(property, currentValue)
      ? currentValue
      : property.defaultValue
  }

  return next
}

function reconcileVisualRules(
  previousDefinition: ComponentDefinition,
  nextDefinition: ComponentDefinition,
  visual: ComponentVisualDefinition,
): ComponentVisualDefinition {
  if (!visual.rules?.length) return visual

  const nextRules = visual.rules.flatMap((rule) => {
    let propertyKey = rule.propertyKey
    let property = nextDefinition.properties[propertyKey]

    if (!property) {
      const previousProperty = previousDefinition.properties[propertyKey]
      const renamed = previousProperty
        ? Object.entries(nextDefinition.properties).find(
            ([key, candidate]) => key !== propertyKey && candidate === previousProperty,
          )
        : undefined

      if (!renamed) return []
      propertyKey = renamed[0]
      property = renamed[1]
    }

    const compareValueValid = isComponentPropertyValue(property, rule.compareValue)
    const operatorValid = !NUMERIC_RULE_OPERATORS.has(rule.operator) || property.kind === 'number'

    return [{
      ...rule,
      propertyKey,
      operator: operatorValid ? rule.operator : 'equals' as const,
      compareValue: compareValueValid && operatorValid
        ? rule.compareValue
        : property.defaultValue,
    }]
  })

  return { ...visual, rules: nextRules }
}

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
  const [previewProps, setPreviewProps] = useState<ComponentProps>(() =>
    createDefaultPropsFromDefinition(initial.definition),
  )
  const [message, setMessage] = useState('')
  const builtInReadOnly = component.builtIn
  const editingDisabled = builtInReadOnly || mode === 'preview'
  const { definition } = component

  useEffect(() => {
    setPreviewProps((current) => normalizePreviewProps(definition, current))
  }, [definition])

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
      visual: reconcileVisualRules(current.definition, nextDefinition, current.visual),
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
          <span className="brand-mark" aria-hidden="true">C</span>
          <div className="brand-text">
            <strong>Component Editor</strong>
            <span>{definition.title} · {definition.type}</span>
          </div>
        </div>

        <SegmentedControl
          value={mode}
          items={MODE_ITEMS}
          onValueChange={setMode}
          ariaLabel="组件工作模式"
          className="mode-switch"
        />

        <div className="component-header-actions">
          <div className="document-toolbar" role="toolbar" aria-label="组件文档操作">
            <Button variant="primary" disabled={builtInReadOnly} onClick={save}>
              保存
            </Button>
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
            propertyValues={previewProps}
            componentTitle={definition.title}
            designWidth={definition.size.defaultWidth}
            designHeight={definition.size.defaultHeight}
            selectedLayerId={selectedLayerId}
            mode={mode}
            readOnly={builtInReadOnly}
            onSelectionChange={selectLayer}
            onChange={(visual) => updatePackage('visual', visual)}
          />
        </section>

        <aside className="property-panel component-property-panel">
          <section className="semantic-inspector component-semantic-inspector" aria-label="组件配置">
            <Tabs
              value={inspectorTab}
              items={INSPECTOR_TABS}
              onValueChange={setInspectorTab}
              ariaLabel="组件配置检查器"
              className="component-inspector-tabs"
            />

            {inspectorTab === 'properties' && selectedLayerId !== null && (
              <>
                <ComponentVisualLayerInspector
                  visual={component.visual}
                  readOnly={editingDisabled}
                  selectedLayerId={selectedLayerId}
                  onSelectionChange={selectLayer}
                  onChange={(visual) => updatePackage('visual', visual)}
                />
                <ComponentVisualStyleInspector
                  visual={component.visual}
                  readOnly={editingDisabled}
                  selectedLayerId={selectedLayerId}
                  onChange={(visual) => updatePackage('visual', visual)}
                />
                <div className="property-section-list component-rule-inspector">
                  <CollapsibleInspectorGroup title="视觉规则" defaultOpen={false}>
                    <ComponentVisualRuleEditor
                      definition={definition}
                      visual={component.visual}
                      layerId={selectedLayerId}
                      readOnly={editingDisabled}
                      onChange={(visual) => updatePackage('visual', visual)}
                    />
                  </CollapsibleInspectorGroup>
                </div>
              </>
            )}

            {inspectorTab === 'properties' && selectedLayerId === null && (
              <div className="property-section-list component-root-inspector">
                {mode === 'preview' && component.visual.mode === 'composite' && (
                  <CollapsibleInspectorGroup title="预览数据">
                    <ComponentPreviewValues
                      definition={definition}
                      values={previewProps}
                      onChange={setPreviewProps}
                    />
                  </CollapsibleInspectorGroup>
                )}

                <CollapsibleInspectorGroup title="基本信息">
                  {builtInReadOnly && (
                    <div className="component-readonly-note">
                      内置组件是 Registry Definition 的只读视图；Native Renderer / Action Handler 仍由可信应用代码注册。
                    </div>
                  )}
                  <label className="property-field">
                    <span>名称</span>
                    <Input
                      value={definition.title}
                      disabled={editingDisabled}
                      onChange={(event) => updateDefinitionField('title', event.target.value)}
                    />
                  </label>
                  <label className="property-field">
                    <span>类型标识</span>
                    <Input
                      value={definition.type}
                      disabled={editingDisabled}
                      onChange={(event) => updateDefinitionField('type', event.target.value)}
                    />
                  </label>
                  <label className="property-field">
                    <span>分类</span>
                    <Input
                      value={definition.category}
                      disabled={editingDisabled}
                      onChange={(event) => updateDefinitionField('category', event.target.value)}
                    />
                  </label>
                  <label className="property-field">
                    <span>状态</span>
                    <Select
                      value={component.status}
                      disabled={editingDisabled}
                      ariaLabel="组件状态"
                      options={STATUS_OPTIONS}
                      onValueChange={(value) => updatePackage('status', value as ComponentStatus)}
                    />
                  </label>
                  <label className="property-field">
                    <span>说明</span>
                    <Textarea
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
                        <NumberInput
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
                      内部 Layer、Style、Visual Rules、未来 Animation / Script 都属于私有实现；SCADA Workbench 只消费公开 Properties / Actions / Events / Anchors。
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
