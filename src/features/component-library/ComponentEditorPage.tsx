import '../../m2.css'
import '../../workbench.css'
import { useEffect, useMemo, useState } from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import { SnapIcon } from '../../components/toolbar-icons'
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
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  type SegmentedControlItem,
  type StudioTabItem,
} from '../../ui'
import { ComponentContractEditor } from './ComponentContractEditor'
import { ComponentGeometryToolbarGroup } from './ComponentGeometryToolbarGroup'
import { ComponentPreviewValues } from './ComponentPreviewValues'
import { ComponentPropertyContractEditor } from './ComponentPropertyContractEditor'
import { COMPONENT_SNAP_GRID_SIZE } from './component-canvas-snap'
import { ComponentVisualAnimationEditor } from './ComponentVisualAnimationEditor'
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
  saveComponentDefinitionAsync,
  type ComponentLibraryEntry,
  type ComponentStatus,
} from './storage'
import './component-editor.css'
import './component-canvas-toolbar.css'

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

function resolveReconciledProperty(
  previousDefinition: ComponentDefinition,
  nextDefinition: ComponentDefinition,
  propertyKey: string,
) {
  const direct = nextDefinition.properties[propertyKey]
  if (direct) {
    return { propertyKey, property: direct }
  }

  const previousProperty = previousDefinition.properties[propertyKey]
  const renamed = previousProperty
    ? Object.entries(nextDefinition.properties).find(
        ([key, candidate]) => key !== propertyKey && candidate === previousProperty,
      )
    : undefined

  return renamed
    ? { propertyKey: renamed[0], property: renamed[1] }
    : null
}

function reconcileVisualPropertyReferences(
  previousDefinition: ComponentDefinition,
  nextDefinition: ComponentDefinition,
  visual: ComponentVisualDefinition,
): ComponentVisualDefinition {
  const rules = (visual.rules ?? []).flatMap((rule) => {
    const resolved = resolveReconciledProperty(
      previousDefinition,
      nextDefinition,
      rule.propertyKey,
    )

    if (!resolved) return []

    const compareValueValid = isComponentPropertyValue(
      resolved.property,
      rule.compareValue,
    )
    const operatorValid =
      !NUMERIC_RULE_OPERATORS.has(rule.operator) ||
      resolved.property.kind === 'number'

    return [{
      ...rule,
      propertyKey: resolved.propertyKey,
      operator: operatorValid ? rule.operator : 'equals' as const,
      compareValue: compareValueValid && operatorValid
        ? rule.compareValue
        : resolved.property.defaultValue,
    }]
  })

  const animations = visual.animations.flatMap((animation) => {
    if (animation.activation.kind === 'always') {
      return [animation]
    }

    const resolved = resolveReconciledProperty(
      previousDefinition,
      nextDefinition,
      animation.activation.propertyKey,
    )

    if (!resolved) return []

    const compareValueValid = isComponentPropertyValue(
      resolved.property,
      animation.activation.compareValue,
    )
    const operatorValid =
      !NUMERIC_RULE_OPERATORS.has(animation.activation.operator) ||
      resolved.property.kind === 'number'

    return [{
      ...animation,
      activation: {
        ...animation.activation,
        propertyKey: resolved.propertyKey,
        operator: operatorValid ? animation.activation.operator : 'equals' as const,
        compareValue: compareValueValid && operatorValid
          ? animation.activation.compareValue
          : resolved.property.defaultValue,
      },
    }]
  })

  return { ...visual, rules, animations }
}

function reconcileVisualLayerReferences(
  previousVisual: ComponentVisualDefinition,
  nextVisual: ComponentVisualDefinition,
): ComponentVisualDefinition {
  const previousIds = new Set(previousVisual.layers.map((layer) => layer.id))
  const nextIds = new Set(nextVisual.layers.map((layer) => layer.id))
  const removedIds = [...previousIds].filter((id) => !nextIds.has(id))
  const addedIds = [...nextIds].filter((id) => !previousIds.has(id))
  const renamedLayer =
    previousVisual.layers.length === nextVisual.layers.length &&
    removedIds.length === 1 &&
    addedIds.length === 1
      ? { from: removedIds[0], to: addedIds[0] }
      : null

  const reconcileLayerId = (layerId: string) => {
    if (nextIds.has(layerId)) return layerId
    if (renamedLayer && layerId === renamedLayer.from) return renamedLayer.to
    return null
  }

  const rules = (nextVisual.rules ?? []).flatMap((rule) => {
    const layerId = reconcileLayerId(rule.layerId)
    return layerId ? [{ ...rule, layerId }] : []
  })
  const animations = nextVisual.animations.flatMap((animation) => {
    const layerId = reconcileLayerId(animation.layerId)
    return layerId ? [{ ...animation, layerId }] : []
  })

  return { ...nextVisual, rules, animations }
}

export function ComponentEditorPage({ componentId }: { componentId: string }) {
  const initial = useMemo(() =>
    componentId === 'new'
      ? createComponentDraft()
      : getComponentDefinition(componentId) ?? createComponentDraft(),
  [componentId])
  const [component, setComponent] = useState<ComponentLibraryEntry>(initial)
  const [mode, setMode] = useState<ComponentWorkbenchMode>('editor')
  const [selectedLayerIds, setSelectedLayerIds] = useState<readonly string[]>([])
  const [primaryLayerId, setPrimaryLayerId] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('properties')
  const [previewProps, setPreviewProps] = useState<ComponentProps>(() =>
    createDefaultPropsFromDefinition(initial.definition),
  )
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [message, setMessage] = useState('')
  const builtInReadOnly = component.builtIn
  const editingDisabled = builtInReadOnly || mode === 'preview'
  const componentCanvasEditable =
    component.visual.mode === 'composite' && mode === 'editor' && !builtInReadOnly
  const snapStatus = !componentCanvasEditable
    ? '当前画布只读'
    : snapEnabled
      ? `松开时吸附 · 网格 ${COMPONENT_SNAP_GRID_SIZE}`
      : `自由定位 · 网格 ${COMPONENT_SNAP_GRID_SIZE}`
  const { definition } = component
  const singleSelectedLayerId =
    selectedLayerIds.length === 1 ? primaryLayerId : null

  useEffect(() => {
    setPreviewProps((current) => normalizePreviewProps(definition, current))
  }, [definition])

  useEffect(() => {
    const availableIds = new Set(component.visual.layers.map((layer) => layer.id))
    const nextSelectedLayerIds = selectedLayerIds.filter((id) => availableIds.has(id))

    if (nextSelectedLayerIds.length === selectedLayerIds.length) {
      return
    }

    setSelectedLayerIds(nextSelectedLayerIds)
    setPrimaryLayerId((current) =>
      current && availableIds.has(current)
        ? current
        : nextSelectedLayerIds[nextSelectedLayerIds.length - 1] ?? null,
    )
  }, [component.visual.layers, selectedLayerIds])

  function updatePackage<K extends keyof ComponentLibraryEntry>(
    key: K,
    value: ComponentLibraryEntry[K],
  ) {
    setComponent((current) => {
      if (key === 'visual') {
        return {
          ...current,
          visual: reconcileVisualLayerReferences(
            current.visual,
            value as ComponentVisualDefinition,
          ),
        }
      }

      return { ...current, [key]: value }
    })
    setMessage('')
  }

  function updateDefinition(nextDefinition: ComponentDefinition) {
    setComponent((current) => ({
      ...current,
      definition: nextDefinition,
      visual: reconcileVisualPropertyReferences(
        current.definition,
        nextDefinition,
        current.visual,
      ),
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

  function replaceLayerSelection(layerIds: readonly string[]) {
    const nextLayerIds = [...layerIds]

    setSelectedLayerIds(nextLayerIds)
    setPrimaryLayerId(nextLayerIds[nextLayerIds.length - 1] ?? null)
    setInspectorTab('properties')
  }

  function selectLayer(layerId: string | null, toggle = false) {
    if (layerId === null) {
      replaceLayerSelection([])
      return
    }

    if (!toggle) {
      replaceLayerSelection([layerId])
      return
    }

    if (selectedLayerIds.includes(layerId)) {
      const nextSelectedLayerIds = selectedLayerIds.filter((id) => id !== layerId)
      setSelectedLayerIds(nextSelectedLayerIds)
      setPrimaryLayerId((current) =>
        current === layerId
          ? nextSelectedLayerIds[nextSelectedLayerIds.length - 1] ?? null
          : current,
      )
    } else {
      setSelectedLayerIds([...selectedLayerIds, layerId])
      setPrimaryLayerId(layerId)
    }

    setInspectorTab('properties')
  }

  async function save() {
    try {
      const saved = await saveComponentDefinitionAsync(component)
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
            <Button
              variant="primary"
              disabled={builtInReadOnly}
              onClick={() => void save()}
            >
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
            selectedLayerIds={selectedLayerIds}
            primaryLayerId={primaryLayerId}
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

          <Toolbar
            className="canvas-toolbar component-canvas-toolbar"
            aria-label="组件画布工具栏"
          >
            <ComponentGeometryToolbarGroup
              visual={component.visual}
              selectedLayerIds={selectedLayerIds}
              disabled={!componentCanvasEditable}
              onChange={(visual) => updatePackage('visual', visual)}
              onSelectionReplace={replaceLayerSelection}
              onApplied={setMessage}
            />
            <ToolbarGroup className="canvas-tool-group">
              <ToolbarButton
                iconOnly
                className={`icon-button toggle-button component-snap-toggle${snapEnabled ? ' active' : ''}`}
                title={snapEnabled ? '关闭吸附' : '开启吸附'}
                aria-label="吸附"
                aria-pressed={snapEnabled}
                disabled={!componentCanvasEditable}
                onClick={() => setSnapEnabled((current) => !current)}
              >
                <SnapIcon />
              </ToolbarButton>
            </ToolbarGroup>
            <span className="component-canvas-phase">{snapStatus}</span>
          </Toolbar>

          <ComponentVisualCanvas
            visual={component.visual}
            propertyValues={previewProps}
            componentTitle={definition.title}
            designWidth={definition.size.defaultWidth}
            designHeight={definition.size.defaultHeight}
            selectedLayerIds={selectedLayerIds}
            primaryLayerId={primaryLayerId}
            mode={mode}
            readOnly={builtInReadOnly}
            snapEnabled={snapEnabled}
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

            {inspectorTab === 'properties' && singleSelectedLayerId !== null && (
              <>
                <ComponentVisualLayerInspector
                  visual={component.visual}
                  readOnly={editingDisabled}
                  selectedLayerId={singleSelectedLayerId}
                  onSelectionChange={selectLayer}
                  onChange={(visual) => updatePackage('visual', visual)}
                />
                <ComponentVisualStyleInspector
                  visual={component.visual}
                  readOnly={editingDisabled}
                  selectedLayerId={singleSelectedLayerId}
                  onChange={(visual) => updatePackage('visual', visual)}
                />
                <div className="property-section-list component-rule-inspector">
                  <CollapsibleInspectorGroup title="视觉规则" defaultOpen={false}>
                    <ComponentVisualRuleEditor
                      definition={definition}
                      visual={component.visual}
                      layerId={singleSelectedLayerId}
                      readOnly={editingDisabled}
                      onChange={(visual) => updatePackage('visual', visual)}
                    />
                  </CollapsibleInspectorGroup>
                </div>
                <div className="property-section-list component-animation-inspector">
                  <CollapsibleInspectorGroup title="动画" defaultOpen={false}>
                    <ComponentVisualAnimationEditor
                      definition={definition}
                      visual={component.visual}
                      layerId={singleSelectedLayerId}
                      readOnly={editingDisabled}
                      onChange={(visual) => updatePackage('visual', visual)}
                    />
                  </CollapsibleInspectorGroup>
                </div>
              </>
            )}

            {inspectorTab === 'properties' && selectedLayerIds.length > 1 && (
              <div className="property-section-list">
                <CollapsibleInspectorGroup title="多选">
                  <div className="selection-summary">
                    已选择 <strong>{selectedLayerIds.length}</strong> 个内部图层。
                  </div>
                  <p className="component-inspector-help">
                    画布工具栏可对选中图层执行组合、对齐与等距分布；主选图层只保留上下文语义，不在多选状态下开放单层 Inspector 编辑。
                  </p>
                </CollapsibleInspectorGroup>
              </div>
            )}

            {inspectorTab === 'properties' && selectedLayerIds.length === 0 && (
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
                      内部 Layer、Style、Visual Rules、Animation / Script 都属于私有实现；SCADA Workbench 只消费公开 Properties / Actions / Events / Anchors。
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
