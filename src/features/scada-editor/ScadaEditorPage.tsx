import '../../m2.css'
import '../../workbench.css'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { loadScadaScene, saveScadaSceneAsync } from '../scada-works/storage'
import { builtInComponentRegistry } from '../../component-system/builtins'
import {
  DEFAULT_PREVIEW_RUNTIME_VALUE_SOURCES,
  previewRuntime,
} from '../../runtime'
import { ComponentPropertiesInspector } from './ComponentPropertiesInspector'
import {
  ComponentInteractionsInspector,
  type BehaviorActionTarget,
} from './ComponentInteractionsInspector'
import {
  hasDuplicateConnection,
  reconnectSceneConnection,
  type ConnectionEndpointRole,
} from '../../scene/connection-commands'
import {
  alignNodes,
  distributeNodes,
  getRootNodes,
  type AlignMode,
  type DistributeMode,
  type SnapSettings,
  type TransformUpdates,
} from '../../scene/geometry'
import {
  cloneSceneSubtrees,
  deleteSceneNodes,
  groupSceneNodes,
  ungroupSceneNode,
} from '../../scene/hierarchy'
import {
  createComponentNode,
  createSceneConnection,
  createSceneId,
  isGroupNode,
  type ConnectionEndpoint,
  type ConnectionRouting,
  type NodeTransform,
  type SceneConnection,
  type SceneDocument,
  type SceneNode,
} from '../../scene/model'
import {
  applyTransformsWithinScene,
  constrainSceneNodesToArtboard,
} from '../../scene/scene-bounds'
import {
  getSceneSizePresetId,
  resizeSceneToPreset,
  SCENE_SIZE_PRESETS,
} from '../../scene/scene-size'
import { parseSceneDocument } from '../../scene/validation'
import { useSceneHistory } from '../../scene/use-scene-history'
import { isTextEditingTarget, shouldIgnoreEditorShortcut } from '../../editor/keyboard'
import { EditorLeaveDialog } from '../../editor/EditorLeaveDialog'
import { StudioShell, type StudioMenuDefinition } from '../../editor/StudioShell'
import { useEditorLeaveProtection } from '../../editor/use-editor-leave-protection'
import { useEditorSaveState } from '../../editor/use-editor-save-state'
import {
  SceneRenderer,
  type RendererMode,
} from '../../renderer/SceneRenderer'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import {
  AlignBottomIcon,
  AlignCenterXIcon,
  AlignCenterYIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  CopyIcon,
  DistributeHorizontalIcon,
  DistributeVerticalIcon,
  GridIcon,
  GroupIcon,
  RedoIcon,
  SnapIcon,
  TrashIcon,
  UndoIcon,
  UngroupIcon,
} from '../../components/toolbar-icons'
import {
  Button,
  Checkbox,
  Input,
  NumberInput,
  Pressable,
  SegmentedControl,
  Select,
  Tabs,
  ToolbarButton,
  ToolbarGroup,
  type SegmentedControlItem,
  type StudioTabItem,
} from '../../ui'

type InspectorTab = 'properties' | 'actions' | 'events'
type LeftDockTab = 'components' | 'layers' | 'assets'

const alignButtons: Array<{ mode: AlignMode; title: string; icon: typeof CopyIcon }> = [
  { mode: 'left', title: '左对齐', icon: AlignLeftIcon },
  { mode: 'center-x', title: '水平居中', icon: AlignCenterXIcon },
  { mode: 'right', title: '右对齐', icon: AlignRightIcon },
  { mode: 'top', title: '顶对齐', icon: AlignTopIcon },
  { mode: 'center-y', title: '垂直居中', icon: AlignCenterYIcon },
  { mode: 'bottom', title: '底对齐', icon: AlignBottomIcon },
]

const MODE_ITEMS: Array<SegmentedControlItem<RendererMode>> = [
  { value: 'editor', label: '设计' },
  { value: 'preview', label: '预览' },
]

const LEFT_DOCK_TABS: Array<StudioTabItem<LeftDockTab>> = [
  { value: 'components', label: '组件' },
  { value: 'layers', label: '图层' },
  { value: 'assets', label: '资源' },
]

const INSPECTOR_TABS: Array<StudioTabItem<InspectorTab>> = [
  { value: 'properties', label: '属性' },
  { value: 'actions', label: '方法' },
  { value: 'events', label: '事件' },
]

const CONNECTION_ROUTING_OPTIONS = [
  { value: 'orthogonal', label: '正交折线' },
  { value: 'straight', label: '直线' },
]

const CONNECTION_DASH_OPTIONS = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
]

function getInitialSelectedIds(scene: SceneDocument) {
  const firstRoot = getRootNodes(scene)[0]
  return firstRoot ? [firstRoot.id] : []
}

export function ScadaEditorPage({
  workId,
  onNavigateWorkspace,
}: {
  workId: string
  onNavigateWorkspace: () => void
}) {
  const [mode, setMode] = useState<RendererMode>('editor')
  const designEditingEnabled = mode === 'editor'
  const {
    scene,
    selectedNodeIds,
    selectedConnectionId,
    setScene,
    setSelectedNodeIds,
    setSelectedConnectionId,
    commit,
    cancelPending,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetHistory,
  } = useSceneHistory(() => {
    const initialScene = loadScadaScene(workId)
    return {
      scene: initialScene,
      selectedNodeIds: getInitialSelectedIds(initialScene),
      selectedConnectionId: null,
    }
  })
  const [leftDockTab, setLeftDockTab] = useState<LeftDockTab>('components')
  const [message, setMessage] = useState('')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('properties')
  const [gridVisible, setGridVisible] = useState(true)
  const [snapSettings, setSnapSettings] = useState<SnapSettings>({
    enabled: true,
    gridEnabled: true,
    gridSize: 24,
    objectEnabled: true,
    threshold: 7,
  })
  const importInputRef = useRef<HTMLInputElement>(null)
  const persistScene = useCallback(
    (document: SceneDocument) => saveScadaSceneAsync(workId, document),
    [workId],
  )
  const saveState = useEditorSaveState({
    document: scene,
    initiallySaved: true,
    saveDocument: persistScene,
  })
  const leaveProtection = useEditorLeaveProtection({
    isDirtyNow: saveState.isDirtyNow,
    isSavingNow: saveState.isSavingNow,
    save: saveState.save,
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        !event.isComposing &&
        isTextEditingTarget(event.target)
      ) {
        event.preventDefault()
        cancelPending()
        if (event.target instanceof HTMLElement) {
          event.target.blur()
        }
        return
      }

      if (shouldIgnoreEditorShortcut(event) || !designEditingEnabled) {
        return
      }

      const isUndo =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z'
      const isRedo =
        (event.ctrlKey || event.metaKey) &&
        (event.key.toLowerCase() === 'y' ||
          (event.shiftKey && event.key.toLowerCase() === 'z'))

      if (isUndo) {
        event.preventDefault()
        undo()
      } else if (isRedo) {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cancelPending, designEditingEnabled, undo, redo])

  useEffect(() => {
    if (mode !== 'preview') {
      return
    }

    return previewRuntime.subscribeEvents((event) => {
      const sourceNode = scene.nodes.find((node) => node.id === event.nodeId)
      const eventTitle =
        builtInComponentRegistry
          .get(event.componentType)
          ?.definition.events[event.eventName]?.title ?? event.eventName
      setMessage(`${sourceNode?.name ?? event.nodeId} · ${eventTitle}`)
    })
  }, [mode, scene.nodes])

  const rootNodes = getRootNodes(scene)
  const selectedNodes = selectedNodeIds
    .map((nodeId) => scene.nodes.find((node) => node.id === nodeId))
    .filter((node): node is SceneNode => Boolean(node))
  const primaryNode = selectedNodes[selectedNodes.length - 1] ?? null
  const selectedConnection = scene.connections.find(
    (connection) => connection.id === selectedConnectionId,
  ) ?? null
  const primaryComponentRegistration =
    primaryNode && !isGroupNode(primaryNode)
      ? builtInComponentRegistry.get(primaryNode.type)
      : null

  const canGroup =
    selectedNodeIds.length >= 2 &&
    selectedNodes.length === selectedNodeIds.length &&
    selectedNodes.every(
      (node) => node.parentId === selectedNodes[0]?.parentId,
    )
  const canUngroup =
    selectedNodes.length === 1 &&
    Boolean(primaryNode && isGroupNode(primaryNode))
  const hasSelection = selectedNodes.length > 0 || Boolean(selectedConnection)

  function selectNodes(nodeIds: string[]) {
    setSelectedNodeIds(nodeIds)

    if (nodeIds.length > 0) {
      setSelectedConnectionId(null)
    }
  }

  function selectConnection(connectionId: string | null) {
    setSelectedConnectionId(connectionId)

    if (connectionId) {
      setSelectedNodeIds([])
    }
  }

  function updateNode(
    nodeId: string,
    updater: (node: SceneNode) => SceneNode,
  ) {
    if (!designEditingEnabled) return

    setScene((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId ? updater(node) : node,
      ),
    }))
  }

  function updateConnection(
    connectionId: string,
    updater: (connection: SceneConnection) => SceneConnection,
  ) {
    if (!designEditingEnabled) return

    setScene((current) => ({
      ...current,
      connections: current.connections.map((connection) =>
        connection.id === connectionId ? updater(connection) : connection,
      ),
    }))
  }

  const commitScene = useCallback(() => {
    if (!designEditingEnabled) return
    commit()
  }, [commit, designEditingEnabled])

  function updateNodeTransforms(updates: TransformUpdates) {
    if (!designEditingEnabled || Object.keys(updates).length === 0) {
      return
    }

    commit((current) => applyTransformsWithinScene(current, updates))
  }

  function updateNodeTransform(nodeId: string, transform: NodeTransform) {
    updateNodeTransforms({ [nodeId]: transform })
  }

  function addComponent(componentType: string) {
    if (!designEditingEnabled) return

    const registration = builtInComponentRegistry.require(componentType)
    const existingCount = scene.nodes.filter(
      (node) => !isGroupNode(node) && node.type === componentType,
    ).length
    const node = createComponentNode(
      componentType,
      existingCount + 1,
      Math.min(rootNodes.length * 18, 120),
    )

    commit(
      (current) => ({
        ...current,
        nodes: [...current.nodes, node],
      }),
      { selectedNodeIds: [node.id], selectedConnectionId: null },
    )
    setMessage(`已添加 ${registration.definition.title}`)
  }

  function duplicateSelectedNodes() {
    if (!designEditingEnabled || selectedNodes.length === 0) {
      return
    }

    const result = cloneSceneSubtrees(scene, selectedNodeIds)
    commit(constrainSceneNodesToArtboard(result.scene), {
      selectedNodeIds: result.rootIds,
      selectedConnectionId: null,
    })
    setMessage(`已复制 ${result.rootIds.length} 个根节点及其内部连线`)
  }

  function deleteSelection() {
    if (!designEditingEnabled) return

    if (selectedConnection) {
      commit(
        (current) => ({
          ...current,
          connections: current.connections.filter(
            (connection) => connection.id !== selectedConnection.id,
          ),
        }),
        { selectedConnectionId: null },
      )
      setMessage(`已删除连线 ${selectedConnection.name}`)
      return
    }

    if (selectedNodes.length === 0) {
      return
    }

    commit(deleteSceneNodes(scene, selectedNodeIds), { selectedNodeIds: [] })
    setMessage(`已删除 ${selectedNodes.length} 个选中节点及关联连线`)
  }

  function groupSelectedNodes() {
    if (!designEditingEnabled || !canGroup) {
      return
    }

    const result = groupSceneNodes(scene, selectedNodeIds)

    if (!result.groupId) {
      setMessage('当前选择无法组合')
      return
    }

    commit(result.scene, {
      selectedNodeIds: [result.groupId],
      selectedConnectionId: null,
    })
    setMessage('已组合节点，现有连线端点保持附着')
  }

  function ungroupSelectedNode() {
    if (!designEditingEnabled || !primaryNode || !isGroupNode(primaryNode)) {
      return
    }

    const result = ungroupSceneNode(scene, primaryNode.id)
    commit(result.scene, {
      selectedNodeIds: result.childIds,
      selectedConnectionId: null,
    })
    setMessage(`已拆分组合，连线仍引用原始子组件锚点`)
  }

  function createConnection(
    source: ConnectionEndpoint,
    target: ConnectionEndpoint,
  ) {
    if (!designEditingEnabled) return

    if (hasDuplicateConnection(scene, source, target)) {
      setMessage('这两个锚点之间已经存在连接')
      return
    }

    const connection = createSceneConnection(
      scene.connections.length + 1,
      source,
      target,
    )

    commit(
      (current) => ({
        ...current,
        connections: [...current.connections, connection],
      }),
      { selectedNodeIds: [], selectedConnectionId: connection.id },
    )
    setMessage(`已创建 ${connection.name}`)
  }

  function reconnectConnection(
    connectionId: string,
    role: ConnectionEndpointRole,
    endpoint: ConnectionEndpoint,
  ) {
    if (!designEditingEnabled) return false

    const result = reconnectSceneConnection(
      scene,
      connectionId,
      role,
      endpoint,
    )

    if (result.status === 'updated') {
      commit(result.scene, { selectedConnectionId: connectionId })
      setMessage(role === 'source' ? '已重新连接起点' : '已重新连接终点')
      return true
    }

    if (result.status === 'unchanged') {
      setMessage('端点位置未改变')
      return true
    }

    if (result.status === 'duplicate') {
      setMessage('目标锚点之间已经存在另一条连接')
      return false
    }

    if (result.status === 'incompatible') {
      setMessage('目标视觉锚点不可连接')
      return false
    }

    setMessage('待重连的连线已不存在')
    return false
  }

  function updateSelectedBaseProperty(
    property: 'visible' | 'locked',
    value: boolean,
  ) {
    if (!designEditingEnabled) return

    const selectedIdSet = new Set(selectedNodeIds)
    commit((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        selectedIdSet.has(node.id)
          ? { ...node, [property]: value }
          : node,
      ),
    }))
  }

  function updatePrimaryComponentAttribute(
    key: string,
    value: string | number | boolean | null,
    commitImmediately: boolean,
  ) {
    if (!designEditingEnabled || !primaryNode || isGroupNode(primaryNode)) {
      return
    }

    const updateScene = (current: SceneDocument): SceneDocument => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === primaryNode.id && !isGroupNode(node)
          ? {
              ...node,
              attributes: {
                ...node.attributes,
                [key]: value,
              },
            }
          : node,
      ),
    })

    if (commitImmediately) {
      commit(updateScene)
    } else {
      setScene(updateScene)
    }
  }

  function updatePrimaryComponentProperty(
    key: string,
    value: string | number | boolean | null,
    commitImmediately: boolean,
  ) {
    if (!designEditingEnabled || !primaryNode || isGroupNode(primaryNode)) {
      return
    }

    const updateScene = (current: SceneDocument): SceneDocument => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === primaryNode.id && !isGroupNode(node)
          ? {
              ...node,
              propertyFallbacks: {
                ...node.propertyFallbacks,
                [key]: value,
              },
            }
          : node,
      ),
    })

    if (commitImmediately) {
      commit(updateScene)
    } else {
      setScene(updateScene)
    }
  }

  function updatePrimaryComponentBinding(
    key: string,
    runtimeKey: string | null,
  ) {
    if (
      !designEditingEnabled ||
      !primaryNode ||
      isGroupNode(primaryNode) ||
      !primaryComponentRegistration?.definition.properties[key]?.bindable
    ) {
      return
    }

    const existingBinding = primaryNode.bindings.find(
      (binding) => binding.property === key,
    )

    if ((existingBinding?.source.key ?? null) === runtimeKey) {
      return
    }

    const bindingId = existingBinding?.id ?? createSceneId('binding')

    commit((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== primaryNode.id || isGroupNode(node)) {
          return node
        }

        const bindings = node.bindings.filter(
          (binding) => binding.property !== key,
        )

        if (runtimeKey) {
          bindings.push({
            id: bindingId,
            property: key,
            source: {
              kind: 'runtime-value',
              key: runtimeKey,
            },
          })
        }

        return {
          ...node,
          bindings,
        }
      }),
    }))

    setMessage(
      runtimeKey
        ? `已绑定 ${key} → ${runtimeKey}`
        : `已取消 ${key} 的数据绑定`,
    )
  }

  function invokePrimaryAction(actionName: string) {
    if (!primaryNode || isGroupNode(primaryNode) || mode !== 'preview') {
      return
    }

    try {
      const result = previewRuntime.invokeAction(primaryNode.id, actionName)
      void Promise.resolve(result).catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : '方法执行失败')
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '方法执行失败')
    }
  }

  function updatePrimaryEventActionBehavior(
    eventName: string,
    target: BehaviorActionTarget | null,
  ) {
    if (
      !designEditingEnabled ||
      !primaryNode ||
      isGroupNode(primaryNode) ||
      !primaryComponentRegistration?.definition.events[eventName]
    ) {
      return
    }

    if (target) {
      const targetNode = scene.nodes.find((node) => node.id === target.nodeId)
      const targetRegistration =
        targetNode && !isGroupNode(targetNode)
          ? builtInComponentRegistry.get(targetNode.type)
          : null

      if (!targetRegistration?.definition.actions[target.action]) {
        setMessage('目标组件方法不存在')
        return
      }
    }

    const existingBehavior = primaryNode.behaviors.find(
      (behavior) => behavior.trigger.event === eventName,
    )
    const behaviorId = existingBehavior?.id ?? createSceneId('behavior')

    commit((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        if (node.id !== primaryNode.id || isGroupNode(node)) {
          return node
        }

        const behaviors = node.behaviors.filter(
          (behavior) => behavior.trigger.event !== eventName,
        )

        if (target) {
          behaviors.push({
            id: behaviorId,
            trigger: {
              kind: 'event',
              event: eventName,
            },
            effect: {
              kind: 'action',
              targetNodeId: target.nodeId,
              action: target.action,
            },
          })
        }

        return {
          ...node,
          behaviors,
        }
      }),
    }))

    setMessage(
      target
        ? `已配置 ${eventName} → ${target.action}`
        : `已取消 ${eventName} 的行为`,
    )
  }

  function updatePrimaryTransformField(
    field: keyof NodeTransform,
    value: number,
  ) {
    if (!designEditingEnabled || !primaryNode || !Number.isFinite(value)) {
      return
    }

    const transform = primaryNode.transform
    const aspectRatio = transform.width / transform.height
    let nextTransform: NodeTransform = {
      ...transform,
      [field]: value,
    }

    if (field === 'width') {
      const width = Math.max(1, value)
      nextTransform = {
        ...nextTransform,
        width,
        height: width / aspectRatio,
      }
    }

    if (field === 'height') {
      const height = Math.max(1, value)
      nextTransform = {
        ...nextTransform,
        width: height * aspectRatio,
        height,
      }
    }

    updateNodeTransform(primaryNode.id, nextTransform)
  }

  function applyAlignment(alignMode: AlignMode) {
    if (!designEditingEnabled) return

    const updates = alignNodes(scene, selectedNodeIds, alignMode)
    updateNodeTransforms(updates)

    if (Object.keys(updates).length > 0) {
      setMessage('已完成节点对齐')
    }
  }

  function applyDistribution(distributionMode: DistributeMode) {
    if (!designEditingEnabled) return

    const updates = distributeNodes(scene, selectedNodeIds, distributionMode)
    updateNodeTransforms(updates)

    if (Object.keys(updates).length > 0) {
      setMessage(
        distributionMode === 'horizontal'
          ? '已水平等距分布'
          : '已垂直等距分布',
      )
    }
  }

  function changeSceneSize(presetId: string) {
    if (!designEditingEnabled) return

    const preset = SCENE_SIZE_PRESETS.find((item) => item.id === presetId)

    if (!preset) {
      return
    }

    const resized = resizeSceneToPreset(scene, preset)

    if (!resized) {
      setMessage('当前组件超出目标尺寸，无法缩小画板')
      return
    }

    commit(resized)
    setMessage(`画板已切换为 ${preset.width} × ${preset.height}`)
  }

  async function saveScene() {
    const outcome = await saveState.save()
    if (outcome.ok) {
      setMessage(
        outcome.currentAtCompletion
          ? '场景已保存'
          : '已保存当前快照，仍有未保存修改',
      )
    } else {
      setMessage(outcome.error.message || '场景保存失败')
    }
  }

  function exportScene() {
    const blob = new Blob([JSON.stringify(scene, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${scene.name}.scene.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage('场景 JSON 已导出')
  }

  async function importScene(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!designEditingEnabled || !file) {
      return
    }

    try {
      const importedScene = parseSceneDocument(await file.text())
      resetHistory({
        scene: importedScene,
        selectedNodeIds: getInitialSelectedIds(importedScene),
        selectedConnectionId: null,
      })
      setMode('editor')
      setMessage(`已导入 ${file.name}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '场景导入失败')
    }
  }

  const commonVisible =
    selectedNodes.length > 0 && selectedNodes.every((node) => node.visible)
  const commonLocked =
    selectedNodes.length > 0 && selectedNodes.every((node) => node.locked)
  const sceneSizePresetId = getSceneSizePresetId(scene) ?? ''
  const sceneSizeTriggerLabel = sceneSizePresetId === 'uhd'
    ? '4K'
    : sceneSizePresetId
      ? sceneSizePresetId.toUpperCase()
      : '自定义'
  const sceneSizeOptions = [
    ...(!sceneSizePresetId
      ? [{ value: '', label: `自定义 · ${scene.width} × ${scene.height}` }]
      : []),
    ...SCENE_SIZE_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
  ]
  const hierarchyMode = canUngroup ? 'ungroup' : 'group'
  const hierarchyTitle = hierarchyMode === 'ungroup'
    ? '拆分组合'
    : '组合选中对象'
  const hierarchyEnabled = canUngroup || canGroup

  const menus: StudioMenuDefinition[] = [
    {
      id: 'file',
      label: '文件',
      commands: [
        {
          id: 'save',
          label: saveState.saving ? '保存中…' : '保存',
          disabled: saveState.saving || (!saveState.dirty && saveState.status !== 'error'),
          onSelect: () => void saveScene(),
        },
        {
          id: 'import',
          label: '导入场景',
          disabled: !designEditingEnabled,
          onSelect: () => importInputRef.current?.click(),
        },
        { id: 'export', label: '导出场景', onSelect: exportScene },
        {
          id: 'workspace',
          label: '返回工作台',
          separatorBefore: true,
          onSelect: onNavigateWorkspace,
        },
      ],
    },
    {
      id: 'edit',
      label: '编辑',
      commands: [
        { id: 'undo', label: '撤销', shortcut: 'Ctrl+Z', disabled: !designEditingEnabled || !canUndo, onSelect: undo },
        { id: 'redo', label: '重做', shortcut: 'Ctrl+Shift+Z', disabled: !designEditingEnabled || !canRedo, onSelect: redo },
        { id: 'duplicate', label: '复制选中对象', disabled: !designEditingEnabled || selectedNodes.length === 0, separatorBefore: true, onSelect: duplicateSelectedNodes },
        { id: 'delete', label: '删除选中对象', disabled: !designEditingEnabled || !hasSelection, destructive: true, onSelect: deleteSelection },
      ],
    },
    {
      id: 'view',
      label: '视图',
      commands: [
        { id: 'grid', label: gridVisible ? '隐藏格线' : '显示格线', onSelect: () => setGridVisible((current) => !current) },
        { id: 'snap', label: snapSettings.gridEnabled ? '关闭网格吸附' : '开启网格吸附', onSelect: () => setSnapSettings((current) => ({ ...current, gridEnabled: !current.gridEnabled })) },
      ],
    },
    {
      id: 'insert',
      label: '插入',
      commands: builtInComponentRegistry.list().map(({ definition }) => ({
        id: `insert-${definition.type}`,
        label: definition.title,
        disabled: !designEditingEnabled,
        onSelect: () => addComponent(definition.type),
      })),
    },
    {
      id: 'arrange',
      label: '排列',
      commands: [
        { id: hierarchyMode, label: hierarchyTitle, disabled: !designEditingEnabled || !hierarchyEnabled, onSelect: hierarchyMode === 'ungroup' ? ungroupSelectedNode : groupSelectedNodes },
        ...alignButtons.map((item) => ({
          id: `align-${item.mode}`,
          label: item.title,
          disabled: !designEditingEnabled || selectedNodes.length < 2,
          onSelect: () => applyAlignment(item.mode),
        })),
        { id: 'distribute-horizontal', label: '水平等距分布', disabled: !designEditingEnabled || selectedNodes.length < 3, onSelect: () => applyDistribution('horizontal') },
        { id: 'distribute-vertical', label: '垂直等距分布', disabled: !designEditingEnabled || selectedNodes.length < 3, onSelect: () => applyDistribution('vertical') },
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
        className="scada-studio-shell"
        documentTitle={scene.name}
        documentType="SCADA Work"
        dirty={saveState.dirty}
        menus={menus}
        workspaceNavigationLabel="返回 SCADA 作品工作台"
        onNavigateWorkspace={onNavigateWorkspace}
        mainToolbar={(
          <>
            <Button
              variant="primary"
              disabled={saveState.saving || (!saveState.dirty && saveState.status !== 'error')}
              onClick={() => void saveScene()}
            >
              {saveState.saving ? '保存中…' : '保存'}
            </Button>
            <span className={`document-save-status ${saveState.status}`}>
              {saveState.saving
                ? saveState.changedWhileSaving ? '保存中 · 有新修改' : '保存中…'
                : saveState.status === 'error' ? '保存失败'
                : saveState.dirty ? '未保存' : '已保存'}
            </span>
            <ToolbarGroup className="canvas-tool-group">
              <ToolbarButton
                iconOnly
                className="icon-button"
                title="复制选中对象"
                aria-label="复制选中对象"
                disabled={!designEditingEnabled || selectedNodes.length === 0}
                onClick={duplicateSelectedNodes}
              >
                <CopyIcon />
              </ToolbarButton>
              <ToolbarButton
                iconOnly
                className="icon-button"
                title="删除选中对象"
                aria-label="删除选中对象"
                disabled={!designEditingEnabled || !hasSelection}
                onClick={deleteSelection}
              >
                <TrashIcon />
              </ToolbarButton>
              <ToolbarButton
                iconOnly
                className="icon-button"
                title={hierarchyTitle}
                aria-label={hierarchyTitle}
                disabled={!designEditingEnabled || !hierarchyEnabled}
                onClick={hierarchyMode === 'ungroup' ? ungroupSelectedNode : groupSelectedNodes}
              >
                {hierarchyMode === 'ungroup' ? <UngroupIcon /> : <GroupIcon />}
              </ToolbarButton>
              <ToolbarButton
                iconOnly
                className="icon-button"
                title="撤销 (Ctrl+Z)"
                aria-label="撤销"
                disabled={!designEditingEnabled || !canUndo}
                onClick={undo}
              >
                <UndoIcon />
              </ToolbarButton>
              <ToolbarButton
                iconOnly
                className="icon-button"
                title="重做 (Ctrl+Shift+Z)"
                aria-label="重做"
                disabled={!designEditingEnabled || !canRedo}
                onClick={redo}
              >
                <RedoIcon />
              </ToolbarButton>
            </ToolbarGroup>

            <ToolbarGroup className="canvas-tool-group scada-geometry-tool-group">
              {alignButtons.map((item) => {
                const Icon = item.icon
                return (
                  <ToolbarButton
                    key={item.mode}
                    iconOnly
                    className="icon-button"
                    title={item.title}
                    aria-label={item.title}
                    disabled={!designEditingEnabled || selectedNodes.length < 2}
                    onClick={() => applyAlignment(item.mode)}
                  >
                    <Icon />
                  </ToolbarButton>
                )
              })}
              <ToolbarButton
                iconOnly
                className="icon-button"
                title="水平等距分布"
                aria-label="水平等距分布"
                disabled={!designEditingEnabled || selectedNodes.length < 3}
                onClick={() => applyDistribution('horizontal')}
              >
                <DistributeHorizontalIcon />
              </ToolbarButton>
              <ToolbarButton
                iconOnly
                className="icon-button"
                title="垂直等距分布"
                aria-label="垂直等距分布"
                disabled={!designEditingEnabled || selectedNodes.length < 3}
                onClick={() => applyDistribution('vertical')}
              >
                <DistributeVerticalIcon />
              </ToolbarButton>
            </ToolbarGroup>

            <ToolbarGroup className="canvas-tool-group view-tool-group">
              <ToolbarButton
                iconOnly
                className={`icon-button toggle-button${snapSettings.gridEnabled ? ' active' : ''}`}
                title={snapSettings.gridEnabled ? '关闭吸附' : '开启吸附'}
                aria-label="吸附到网格"
                aria-pressed={snapSettings.gridEnabled}
                onClick={() =>
                  setSnapSettings((current) => ({
                    ...current,
                    gridEnabled: !current.gridEnabled,
                  }))
                }
              >
                <SnapIcon />
              </ToolbarButton>
              <div className="grid-control" title="网格显示与间距">
                <ToolbarButton
                  iconOnly
                  className={`icon-button toggle-button${gridVisible ? ' active' : ''}`}
                  title={gridVisible ? '隐藏格线' : '显示格线'}
                  aria-label="显示格线"
                  aria-pressed={gridVisible}
                  onClick={() => setGridVisible((current) => !current)}
                >
                  <GridIcon />
                </ToolbarButton>
                {gridVisible && (
                  <NumberInput
                    className="grid-size-input"
                    min="4"
                    max="128"
                    title="网格间距"
                    aria-label="网格间距"
                    value={snapSettings.gridSize}
                    onChange={(event) => {
                      const gridSize = Number(event.target.value)

                      if (Number.isFinite(gridSize) && gridSize > 0) {
                        setSnapSettings((current) => ({ ...current, gridSize }))
                      }
                    }}
                  />
                )}
              </div>
              <div className="scene-size-control" title="固定画板尺寸">
                <Select
                  ariaLabel="画板尺寸"
                  value={sceneSizePresetId}
                  disabled={!designEditingEnabled}
                  triggerLabel={sceneSizeTriggerLabel}
                  options={sceneSizeOptions}
                  onValueChange={changeSceneSize}
                />
              </div>
            </ToolbarGroup>
            <Input
              ref={importInputRef}
              className="hidden-input"
              type="file"
              accept="application/json,.json"
              disabled={!designEditingEnabled}
              onChange={(event) => void importScene(event)}
            />
          </>
        )}
        modeControl={(
          <SegmentedControl
            value={mode}
            items={MODE_ITEMS}
            onValueChange={setMode}
            ariaLabel="工作模式"
            className="mode-switch"
          />
        )}
        leftPanel={(
        <aside className="component-panel">
          <Tabs
            value={leftDockTab}
            items={LEFT_DOCK_TABS}
            onValueChange={setLeftDockTab}
            ariaLabel="左侧工作区"
            className="dock-tabs"
          />

          {leftDockTab === 'components' && (
            <div className="dock-content">
              <div className="panel-title">基础组件</div>
              {builtInComponentRegistry.list().map(({ definition }) => (
                <Pressable
                  key={definition.type}
                  className="component-item"
                  disabled={!designEditingEnabled}
                  onClick={() => addComponent(definition.type)}
                >
                  <span className="component-icon">
                    {definition.title.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{definition.title}</strong>
                    <small>{definition.type}</small>
                  </span>
                </Pressable>
              ))}
              <p className="panel-description component-dock-help">
                组件面板直接来自 ComponentRegistry；新增内置注册项无需修改编辑器页面。
              </p>
            </div>
          )}

          {leftDockTab === 'layers' && (
            <div className="dock-placeholder">
              <strong>图层树</strong>
              <span>用于层级、排序、锁定、显隐和进入组合编辑。</span>
            </div>
          )}

          {leftDockTab === 'assets' && (
            <div className="dock-placeholder">
              <strong>资源库</strong>
              <span>用于项目图片、SVG 和其他可复用资源。</span>
            </div>
          )}
        </aside>
        )}
        center={(
        <section className="canvas-area" aria-label="SCADA 编辑画布">
          {message && (
            <div className="canvas-toast" role="status" aria-live="polite">
              {message}
            </div>
          )}

          <SceneRenderer
            scene={scene}
            mode={mode}
            selectedNodeIds={selectedNodeIds}
            selectedConnectionId={selectedConnectionId}
            snapSettings={snapSettings}
            gridVisible={gridVisible}
            onSelectionChange={selectNodes}
            onConnectionSelectionChange={selectConnection}
            onCreateConnection={createConnection}
            onReconnectConnection={reconnectConnection}
            onTransformNodes={updateNodeTransforms}
          />
        </section>
        )}
        rightPanel={(
        <aside className="property-panel">
          <section className="semantic-inspector" aria-label="对象配置">
            <Tabs
              value={inspectorTab}
              items={INSPECTOR_TABS}
              onValueChange={setInspectorTab}
              ariaLabel="对象配置检查器"
              className="inspector-tabs"
            />

            {inspectorTab === 'properties' && selectedConnection && (
              <div className="property-section-list">
                <CollapsibleInspectorGroup title="标识与路径">
                  <label className="property-field">
                    <span>名称</span>
                    <Input
                      value={selectedConnection.name}
                      disabled={!designEditingEnabled}
                      onChange={(event) => {
                        const name = event.target.value
                        updateConnection(selectedConnection.id, (connection) => ({
                          ...connection,
                          name,
                        }))
                      }}
                      onBlur={commitScene}
                    />
                  </label>
                  <label className="property-field">
                    <span>路由</span>
                    <Select
                      value={selectedConnection.routing}
                      disabled={!designEditingEnabled}
                      ariaLabel="连线路由"
                      options={CONNECTION_ROUTING_OPTIONS}
                      onValueChange={(value) => {
                        const routing = value as ConnectionRouting
                        updateConnection(selectedConnection.id, (connection) => ({
                          ...connection,
                          routing,
                        }))
                        commitScene()
                      }}
                    />
                  </label>
                </CollapsibleInspectorGroup>

                <CollapsibleInspectorGroup title="样式">
                  <div className="property-grid">
                    <label className="property-field compact">
                      <span>颜色</span>
                      <Input
                        className="color-input"
                        type="color"
                        value={selectedConnection.style.stroke}
                        disabled={!designEditingEnabled}
                        onChange={(event) => {
                          const stroke = event.target.value
                          updateConnection(selectedConnection.id, (connection) => ({
                            ...connection,
                            style: { ...connection.style, stroke },
                          }))
                        }}
                        onBlur={commitScene}
                      />
                    </label>
                    <label className="property-field compact">
                      <span>线宽</span>
                      <NumberInput
                        min="1"
                        max="24"
                        value={selectedConnection.style.strokeWidth}
                        disabled={!designEditingEnabled}
                        onChange={(event) => {
                          const strokeWidth = Number(event.target.value)

                          if (Number.isFinite(strokeWidth) && strokeWidth > 0) {
                            updateConnection(selectedConnection.id, (connection) => ({
                              ...connection,
                              style: { ...connection.style, strokeWidth },
                            }))
                          }
                        }}
                        onBlur={commitScene}
                      />
                    </label>
                  </div>
                  <label className="property-field">
                    <span>线型</span>
                    <Select
                      value={selectedConnection.style.dash}
                      disabled={!designEditingEnabled}
                      ariaLabel="连线路由"
                      options={CONNECTION_DASH_OPTIONS}
                      onValueChange={(value) => {
                        const dash = value as 'solid' | 'dashed'
                        updateConnection(selectedConnection.id, (connection) => ({
                          ...connection,
                          style: { ...connection.style, dash },
                        }))
                        commitScene()
                      }}
                    />
                  </label>
                </CollapsibleInspectorGroup>

                <CollapsibleInspectorGroup title="端点">
                  <div className="property-summary compact-summary">
                    <div>
                      <span>起点</span>
                      <code>{selectedConnection.source.nodeId} / {selectedConnection.source.anchorId}</code>
                    </div>
                    <div>
                      <span>终点</span>
                      <code>{selectedConnection.target.nodeId} / {selectedConnection.target.anchorId}</code>
                    </div>
                  </div>
                </CollapsibleInspectorGroup>
              </div>
            )}

            {inspectorTab === 'properties' && !selectedConnection && selectedNodes.length === 0 && (
              <div className="property-section-list">
                <CollapsibleInspectorGroup title="场景">
                  <div className="scene-inspector-summary">
                    <div><span>名称</span><code>{scene.name}</code></div>
                    <div><span>尺寸</span><code>{scene.width} × {scene.height}</code></div>
                    <div><span>背景</span><code>{scene.background}</code></div>
                    <div><span>边界</span><code>固定画板 · 组件不可越界</code></div>
                  </div>
                </CollapsibleInspectorGroup>
              </div>
            )}

            {inspectorTab === 'properties' && !selectedConnection && selectedNodes.length > 1 && (
              <div className="property-section-list">
                <CollapsibleInspectorGroup title="批量属性" className="inspector-toggle-group">
                  <div className="selection-summary">
                    已选择 <strong>{selectedNodes.length}</strong> 个节点。
                  </div>
                  <Checkbox
                    className="checkbox-field property-toggle"
                    disabled={!designEditingEnabled}
                    checked={commonVisible}
                    label="全部可见"
                    onCheckedChange={(checked) => updateSelectedBaseProperty('visible', checked)}
                  />
                  <Checkbox
                    className="checkbox-field property-toggle"
                    disabled={!designEditingEnabled}
                    checked={commonLocked}
                    label="全部锁定"
                    onCheckedChange={(checked) => updateSelectedBaseProperty('locked', checked)}
                  />
                </CollapsibleInspectorGroup>
              </div>
            )}

            {inspectorTab === 'properties' &&
              !selectedConnection &&
              selectedNodes.length === 1 &&
              primaryNode && (
              <div className="property-section-list">
                <CollapsibleInspectorGroup title="标识">
                  <label className="property-field">
                    <span>名称</span>
                    <Input
                      value={primaryNode.name}
                      disabled={!designEditingEnabled}
                      onChange={(event) => {
                        const name = event.target.value
                        updateNode(primaryNode.id, (node) => ({ ...node, name }))
                      }}
                      onBlur={commitScene}
                    />
                  </label>
                  <div className="property-summary compact-summary">
                    <div><span>类型</span><code>{primaryNode.type}</code></div>
                    <div><span>父级</span><code>{primaryNode.parentId ?? 'scene-root'}</code></div>
                  </div>
                </CollapsibleInspectorGroup>

                {primaryComponentRegistration && !isGroupNode(primaryNode) && (
                  <ComponentPropertiesInspector
                    definition={primaryComponentRegistration.definition}
                    attributes={primaryNode.attributes}
                    propertyFallbacks={primaryNode.propertyFallbacks}
                    bindings={primaryNode.bindings}
                    runtimeSources={DEFAULT_PREVIEW_RUNTIME_VALUE_SOURCES}
                    readOnly={!designEditingEnabled}
                    onAttributeChange={updatePrimaryComponentAttribute}
                    onPropertyChange={updatePrimaryComponentProperty}
                    onBindingChange={updatePrimaryComponentBinding}
                  />
                )}

                <CollapsibleInspectorGroup title="几何">
                  <div className="property-grid">
                    {(['x', 'y', 'width', 'height', 'rotation'] as const).map(
                      (field) => (
                        <label key={field} className="property-field compact">
                          <span>{field.toUpperCase()}</span>
                          <NumberInput
                            value={Math.round(primaryNode.transform[field] * 100) / 100}
                            disabled={!designEditingEnabled}
                            onChange={(event) =>
                              updatePrimaryTransformField(field, Number(event.target.value))
                            }
                          />
                        </label>
                      ),
                    )}
                  </div>
                </CollapsibleInspectorGroup>

                <CollapsibleInspectorGroup title="显示" className="inspector-toggle-group">
                  <Checkbox
                    className="checkbox-field property-toggle"
                    disabled={!designEditingEnabled}
                    checked={primaryNode.visible}
                    label="可见"
                    onCheckedChange={(checked) => updateSelectedBaseProperty('visible', checked)}
                  />
                  <Checkbox
                    className="checkbox-field property-toggle"
                    disabled={!designEditingEnabled}
                    checked={primaryNode.locked}
                    label="锁定"
                    onCheckedChange={(checked) => updateSelectedBaseProperty('locked', checked)}
                  />
                </CollapsibleInspectorGroup>
              </div>
            )}

            {(inspectorTab === 'actions' || inspectorTab === 'events') &&
              !selectedConnection &&
              selectedNodes.length === 1 &&
              primaryNode &&
              !isGroupNode(primaryNode) &&
              primaryComponentRegistration && (
                <ComponentInteractionsInspector
                  tab={inspectorTab}
                  scene={scene}
                  node={primaryNode}
                  definition={primaryComponentRegistration.definition}
                  previewActive={mode === 'preview'}
                  onInvokeAction={invokePrimaryAction}
                  onBehaviorChange={updatePrimaryEventActionBehavior}
                />
              )}

            {(inspectorTab === 'actions' || inspectorTab === 'events') &&
              (selectedConnection ||
                selectedNodes.length !== 1 ||
                !primaryNode ||
                isGroupNode(primaryNode) ||
                !primaryComponentRegistration) && (
                <div className="inspector-placeholder">
                  <strong>请选择一个组件</strong>
                  <span>方法和事件只针对单个组件的公开契约。</span>
                </div>
              )}
          </section>
        </aside>
        )}
        status={(
          <>
            <span className="studio-status-cluster studio-status-mode">
              <strong>{mode === 'preview' ? '预览' : '设计'}</strong>
              <span>{selectedConnection ? selectedConnection.name : selectedNodes.length > 1 ? `已选 ${selectedNodes.length} 个对象` : primaryNode?.name ?? '未选择对象'}</span>
            </span>
            <span className="studio-status-cluster">
              <span>{saveState.status === 'error' ? '保存失败' : saveState.dirty ? '未保存' : '已保存'}</span>
              <code>{scene.width} × {scene.height}</code>
              <span>{scene.nodes.length} 个组件 · {scene.connections.length} 条连线</span>
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
