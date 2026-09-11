import '../../m2.css'
import '../../workbench.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { isTextEditingTarget, shouldIgnoreEditorShortcut } from '../../editor/keyboard'
import { commitStudioNavigation } from '../../editor/editor-navigation'
import { EditorLeaveDialog } from '../../editor/EditorLeaveDialog'
import { StudioShell, type StudioMenuDefinition } from '../../editor/StudioShell'
import { useDocumentHistory } from '../../editor/use-document-history'
import { useEditorLeaveProtection } from '../../editor/use-editor-leave-protection'
import { useEditorSaveState } from '../../editor/use-editor-save-state'
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
import { ComponentAttributeContractEditor } from './ComponentAttributeContractEditor'
import { ComponentContractEditor } from './ComponentContractEditor'
import { ComponentGeometryToolbarGroup } from './ComponentGeometryToolbarGroup'
import { ComponentPreviewValues } from './ComponentPreviewValues'
import { ComponentPropertyContractEditor } from './ComponentPropertyContractEditor'
import { ComponentPublicationPanel } from './ComponentPublicationPanel'
import {
  ComponentPublicationClientError,
  HttpComponentPublicationClient,
  loadComponentPublicationObservation,
  observeLatestComponentPublication,
  publishComponentExplicitly,
  type ComponentPublicationObservation,
  type ComponentPublicationSession,
} from './component-publication-client'
import { COMPONENT_SNAP_GRID_SIZE } from './component-canvas-snap'
import { clearComponentCreateTool } from './component-create-mode'
import { HttpRemoteComponentRepository } from './remote-component-repository'
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

function publicationErrorMessage(
  error: unknown,
  observation: ComponentPublicationObservation | null,
) {
  if (
    error instanceof ComponentPublicationClientError
    && error.code === 'publication_conflict'
  ) {
    const base = observation?.revision === null || observation === null
      ? '无 revision'
      : `revision ${observation.revision}`
    const current = error.currentRevision === null
      ? '无 revision'
      : error.currentRevision === undefined
        ? '未知'
        : `revision ${error.currentRevision}`
    return `发布冲突：本地仍以 ${base} 为 baseRevision，远端当前为 ${current}。不会自动覆盖或重试；请先显式刷新远端状态。`
  }

  if (error instanceof ComponentPublicationClientError && error.code === 'unauthorized') {
    return '发布会话已失效，请重新登录发布服务'
  }

  return error instanceof Error ? error.message : '组件发布失败'
}

export function ComponentEditorPage({
  componentId,
  onNavigateWorkspace,
}: {
  componentId: string
  onNavigateWorkspace: () => void
}) {
  const initial = useMemo(() =>
    componentId === 'new'
      ? createComponentDraft()
      : getComponentDefinition(componentId) ?? createComponentDraft(),
  [componentId])
  const publicationBaseUrl = import.meta.env.VITE_PUBLICATION_API_URL?.trim() ?? ''
  const publicationClient = useMemo(
    () => publicationBaseUrl
      ? new HttpComponentPublicationClient(publicationBaseUrl)
      : null,
    [publicationBaseUrl],
  )
  const remotePublicationRepository = useMemo(
    () => publicationBaseUrl
      ? new HttpRemoteComponentRepository(publicationBaseUrl)
      : null,
    [publicationBaseUrl],
  )
  const {
    document: component,
    mutate: mutateComponent,
    beginTransaction,
    commitTransaction,
    cancelTransaction,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useDocumentHistory<ComponentLibraryEntry>(() => initial)
  const persistComponent = useCallback(
    (document: ComponentLibraryEntry) => saveComponentDefinitionAsync(document),
    [],
  )
  const saveState = useEditorSaveState({
    document: component,
    initiallySaved: componentId !== 'new',
    saveDocument: persistComponent,
  })
  const leaveProtection = useEditorLeaveProtection({
    isDirtyNow: saveState.isDirtyNow,
    isSavingNow: saveState.isSavingNow,
    save: saveState.save,
  })
  const [mode, setMode] = useState<ComponentWorkbenchMode>('editor')
  const [selectedLayerIds, setSelectedLayerIds] = useState<readonly string[]>([])
  const [primaryLayerId, setPrimaryLayerId] = useState<string | null>(null)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('properties')
  const [previewProps, setPreviewProps] = useState<ComponentProps>(() =>
    createDefaultPropsFromDefinition(initial.definition),
  )
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [message, setMessage] = useState('')
  const [publicationSession, setPublicationSession] =
    useState<ComponentPublicationSession | null>(null)
  const [publicationObservation, setPublicationObservation] =
    useState<ComponentPublicationObservation | null>(null)
  const [publicationUsername, setPublicationUsername] = useState('')
  const [publicationPassword, setPublicationPassword] = useState('')
  const [publicationBusy, setPublicationBusy] = useState(false)
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
  const publicationReady = !builtInReadOnly && component.status === 'ready'
  const canPublish = Boolean(
    publicationClient
    && remotePublicationRepository
    && publicationSession?.authenticated
    && publicationReady
    && !publicationBusy,
  )
  const singleSelectedLayerId =
    selectedLayerIds.length === 1 ? primaryLayerId : null
  const inspectorContextLabel = inspectorTab !== 'properties' || selectedLayerIds.length === 0
    ? definition.title
    : selectedLayerIds.length > 1
      ? `已选 ${selectedLayerIds.length} 个图层`
      : component.visual.layers.find((layer) => layer.id === singleSelectedLayerId)?.name

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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        !event.isComposing &&
        isTextEditingTarget(event.target)
      ) {
        event.preventDefault()
        cancelTransaction()
        if (event.target instanceof HTMLElement) {
          event.target.blur()
        }
        return
      }

      if (editingDisabled || shouldIgnoreEditorShortcut(event)) {
        return
      }

      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const isUndo = modifier && !event.shiftKey && key === 'z'
      const isRedo = modifier && (key === 'y' || (event.shiftKey && key === 'z'))

      if (isUndo && canUndo) {
        event.preventDefault()
        undo()
      } else if (isRedo && canRedo) {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cancelTransaction, canRedo, canUndo, editingDisabled, redo, undo])

  useEffect(() => {
    if (!publicationClient) {
      setPublicationSession({ authenticated: false })
      return
    }

    let active = true
    void publicationClient.getSession()
      .then((session) => {
        if (active) setPublicationSession(session)
      })
      .catch((error) => {
        if (!active) return
        setPublicationSession({ authenticated: false })
        setMessage(publicationErrorMessage(error, publicationObservation))
      })

    return () => {
      active = false
    }
  }, [publicationClient])

  useEffect(() => {
    if (!publicationBaseUrl || builtInReadOnly) {
      setPublicationObservation(null)
      return
    }

    let active = true
    void loadComponentPublicationObservation(definition.type)
      .then((observation) => {
        if (active) setPublicationObservation(observation)
      })
      .catch((error) => {
        if (active) setMessage(publicationErrorMessage(error, publicationObservation))
      })

    return () => {
      active = false
    }
  }, [publicationBaseUrl, builtInReadOnly, definition.type])

  function updatePackage<K extends keyof ComponentLibraryEntry>(
    key: K,
    value: ComponentLibraryEntry[K],
  ) {
    mutateComponent((current) => {
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
    mutateComponent((current) => ({
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
    const outcome = await saveState.save()
    if (!outcome.ok) {
      setMessage(outcome.error.message || '组件保存失败')
      return
    }

    setMessage(
      outcome.currentAtCompletion
        ? '组件已保存'
        : '已保存当前快照，仍有未保存修改',
    )
    if (componentId === 'new' && outcome.currentAtCompletion) {
      commitStudioNavigation(
        `#/components/${encodeURIComponent(outcome.result.id)}`,
      )
    }
  }

  async function loginPublication() {
    if (!publicationClient) return
    setPublicationBusy(true)
    try {
      const session = await publicationClient.login(
        publicationUsername,
        publicationPassword,
      )
      setPublicationSession(session)
      setPublicationPassword('')
      setMessage(`已登录发布服务：${session.authenticated ? session.identity.displayName : ''}`)
    } catch (error) {
      setMessage(publicationErrorMessage(error, publicationObservation))
    } finally {
      setPublicationBusy(false)
    }
  }

  async function logoutPublication() {
    if (!publicationClient) return
    setPublicationBusy(true)
    try {
      const session = await publicationClient.logout()
      setPublicationSession(session)
      setPublicationPassword('')
      setMessage('已退出发布服务')
    } catch (error) {
      setMessage(publicationErrorMessage(error, publicationObservation))
    } finally {
      setPublicationBusy(false)
    }
  }

  async function refreshPublicationObservation() {
    if (!remotePublicationRepository) return
    setPublicationBusy(true)
    try {
      const observation = await observeLatestComponentPublication(
        definition.type,
        remotePublicationRepository,
      )
      setPublicationObservation(observation)
      setMessage(
        observation.revision === null
          ? '已刷新远端状态：当前尚无已发布 revision'
          : `已刷新远端状态：revision ${observation.revision}`,
      )
    } catch (error) {
      setMessage(publicationErrorMessage(error, publicationObservation))
    } finally {
      setPublicationBusy(false)
    }
  }

  async function publishRemote() {
    if (!publicationClient || !remotePublicationRepository || !canPublish) return
    setPublicationBusy(true)
    try {
      const result = await publishComponentExplicitly(component, {
        client: publicationClient,
        remoteRepository: remotePublicationRepository,
      })
      setPublicationObservation(result.observation)
      setMessage(`组件已发布：revision ${result.revision.revision}`)
    } catch (error) {
      if (
        error instanceof ComponentPublicationClientError
        && error.code === 'unauthorized'
      ) {
        setPublicationSession({ authenticated: false })
      }
      setMessage(publicationErrorMessage(error, publicationObservation))
    } finally {
      setPublicationBusy(false)
    }
  }

  const menus: StudioMenuDefinition[] = [
    {
      id: 'file',
      label: '文件',
      commands: [
        {
          id: 'save',
          label: saveState.saving ? '保存中…' : '保存',
          disabled: builtInReadOnly || saveState.saving || (!saveState.dirty && saveState.status !== 'error'),
          onSelect: () => void save(),
        },
        { id: 'publish', label: publicationBusy ? '处理中…' : '发布', disabled: !canPublish, onSelect: () => void publishRemote() },
        { id: 'workspace', label: '返回工作台', separatorBefore: true, onSelect: onNavigateWorkspace },
      ],
    },
    {
      id: 'edit',
      label: '编辑',
      commands: [
        { id: 'undo', label: '撤销', shortcut: 'Ctrl+Z', disabled: editingDisabled || !canUndo, onSelect: undo },
        { id: 'redo', label: '重做', shortcut: 'Ctrl+Shift+Z', disabled: editingDisabled || !canRedo, onSelect: redo },
      ],
    },
    {
      id: 'view',
      label: '视图',
      commands: [
        { id: 'snap', label: snapEnabled ? '关闭吸附' : '开启吸附', disabled: !componentCanvasEditable, onSelect: () => setSnapEnabled((current) => !current) },
      ],
    },
    {
      id: 'run',
      label: '运行',
      commands: [
        { id: 'design', label: '设计模式', disabled: mode === 'editor', onSelect: () => setMode('editor') },
        { id: 'preview', label: '预览模式', disabled: mode === 'preview', onSelect: () => setMode('preview') },
      ],
    },
  ]

  return (
    <>
      <StudioShell
        className="component-studio-shell"
        documentTitle={definition.title}
        documentType={`Component · ${definition.type}`}
        dirty={saveState.dirty}
        menus={menus}
        workspaceNavigationLabel="返回组件库工作台"
        onNavigateWorkspace={onNavigateWorkspace}
        onFocusCapture={(event) => {
          if (!editingDisabled && isTextEditingTarget(event.target)) beginTransaction()
        }}
        onBlurCapture={(event) => {
          if (!editingDisabled && isTextEditingTarget(event.target)) commitTransaction()
        }}
        mainToolbar={(
          <>
            <Button
              variant="primary"
              disabled={builtInReadOnly || saveState.saving || (!saveState.dirty && saveState.status !== 'error')}
              onClick={() => void save()}
            >
              {saveState.saving ? '保存中…' : '保存'}
            </Button>
            <span className={`document-save-status ${saveState.status}`}>
              {saveState.saving
                ? saveState.changedWhileSaving ? '保存中 · 有新修改' : '保存中…'
                : saveState.status === 'error' ? '保存失败'
                : saveState.dirty ? '未保存' : '已保存'}
            </span>
            <Button disabled={!canPublish} onClick={() => void publishRemote()}>
              {publicationBusy ? '处理中…' : '发布'}
            </Button>
            <Button variant="secondary" disabled={editingDisabled || !canUndo} onClick={undo}>撤销</Button>
            <Button variant="secondary" disabled={editingDisabled || !canRedo} onClick={redo}>重做</Button>
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
          </>
        )}
        modeControl={(
          <SegmentedControl
            value={mode}
            items={MODE_ITEMS}
            onValueChange={setMode}
            ariaLabel="组件工作模式"
            className="mode-switch"
          />
        )}
        leftPanel={(
        <aside className="component-panel component-layer-panel" aria-label="组件内部图层">
          <ComponentVisualTreeEditor
            visual={component.visual}
            readOnly={editingDisabled}
            selectedLayerIds={selectedLayerIds}
            primaryLayerId={primaryLayerId}
            onSelectionChange={selectLayer}
            onChange={(visual) => updatePackage('visual', visual)}
          />
        </aside>
        )}
        center={(
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
            selectedLayerIds={selectedLayerIds}
            primaryLayerId={primaryLayerId}
            mode={mode}
            readOnly={builtInReadOnly}
            snapEnabled={snapEnabled}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            onSelectionChange={selectLayer}
            onChange={(visual) => updatePackage('visual', visual)}
          />
        </section>
        )}
        rightPanel={(
        <aside className="property-panel component-property-panel">
          <section className="semantic-inspector component-semantic-inspector" aria-label="组件配置">
            <div className="component-inspector-context">
              <Button
                variant="ghost"
                size="small"
                aria-pressed={selectedLayerIds.length === 0 && inspectorTab === 'properties'}
                title="编辑组件名称、尺寸、公开配置和运行属性"
                onClick={() => {
                  clearComponentCreateTool()
                  selectLayer(null)
                }}
              >组件设置</Button>
              <span title={inspectorContextLabel}>{inspectorContextLabel}</span>
            </div>
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
                    使用画布工具栏组合、对齐或等距分布。选择单个图层可编辑它的外观与行为。
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

                {!builtInReadOnly && (
                  <CollapsibleInspectorGroup title="远端发布" defaultOpen={false}>
                    <ComponentPublicationPanel
                      configured={Boolean(publicationBaseUrl)}
                      session={publicationSession}
                      observation={publicationObservation}
                      username={publicationUsername}
                      password={publicationPassword}
                      busy={publicationBusy}
                      publishReady={publicationReady}
                      onUsernameChange={setPublicationUsername}
                      onPasswordChange={setPublicationPassword}
                      onLogin={() => void loginPublication()}
                      onLogout={() => void logoutPublication()}
                      onRefreshObservation={() => void refreshPublicationObservation()}
                    />
                  </CollapsibleInspectorGroup>
                )}

                <CollapsibleInspectorGroup title="基本信息">
                  {builtInReadOnly && (
                    <div className="component-readonly-note">
                      内置组件可查看配置与预览，不能在这里修改内部图形。
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

                <CollapsibleInspectorGroup title="公开配置 · Attributes" className="component-root-public-attributes">
                  <p className="component-inspector-help">
                    放入组态画布后可配置的固定参数，例如运行色、报警色和显示精度。
                  </p>
                  <ComponentAttributeContractEditor
                    definition={definition}
                    readOnly={editingDisabled}
                    onChange={updateDefinition}
                  />
                </CollapsibleInspectorGroup>

                <CollapsibleInspectorGroup title="运行属性 · Properties" className="component-root-public-properties">
                  <p className="component-inspector-help">
                    可绑定设备数据的运行值，例如开关状态、温度和液位。未绑定时使用配置的默认值。
                  </p>
                  <ComponentPropertyContractEditor
                    definition={definition}
                    readOnly={editingDisabled}
                    onChange={updateDefinition}
                  />
                </CollapsibleInspectorGroup>

                <CollapsibleInspectorGroup title="连接锚点" className="component-anchor-group">
                  <p className="component-inspector-help">
                    设置管线或导线可以连接到组件的哪些位置。
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
                      内部 Layer、Style、Visual Rules、Animation / Script 都属于私有实现；SCADA Workbench 只消费公开 Attributes / Properties / Actions / Events / Anchors。
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
        )}
        status={(
          <>
            <span className="studio-status-cluster">
              <strong>{mode === 'preview' ? '预览' : '设计'}</strong>
              <span>{selectedLayerIds.length > 1 ? `已选 ${selectedLayerIds.length} 个图层` : inspectorContextLabel}</span>
            </span>
            <span className="studio-status-cluster">
              <span>{saveState.status === 'error' ? '保存失败' : saveState.dirty ? '未保存' : '已保存'}</span>
              <code>{definition.size.defaultWidth} × {definition.size.defaultHeight}</code>
              <span>{snapStatus}</span>
            </span>
          </>
        )}
      />

      <EditorLeaveDialog
        open={leaveProtection.pendingTargetHash !== null}
        saveStatus={saveState.status}
        saving={saveState.saving}
        busy={leaveProtection.leavingBusy}
        errorMessage={saveState.error?.message}
        onSaveAndLeave={() => void leaveProtection.saveAndLeave()}
        onDiscardAndLeave={leaveProtection.discardAndLeave}
        onCancel={leaveProtection.cancelLeave}
      />
    </>
  )
}
