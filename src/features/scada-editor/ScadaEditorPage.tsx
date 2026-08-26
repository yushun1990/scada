import '../../m2.css'
import '../../workbench.css'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { loadScadaScene, saveScadaScene } from '../scada-works/storage'
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
  Toolbar,
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

export function ScadaEditorPage({ workId }: { workId: string }) {
  const [mode, setMode] = useState<RendererMode>('editor')
  const {
    scene,
    selectedNodeIds,
    selectedConnectionId,
    setScene,
    setSelectedNodeIds,
    setSelectedConnectionId,
    commit,
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
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
  }, [undo, redo])

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
    setScene((current) => ({
      ...current,
      connections: current.connections.map((connection) =>
        connection.id === connectionId ? updater(connection) : connection,
      ),
    }))
  }

  const commitScene = useCallback(() => {
    commit()
  }, [commit])

  function updateNodeTransforms(updates: TransformUpdates) {
    if (Object.keys(updates).length === 0) {
      return
    }

    commit((current) => applyTransformsWithinScene(current, updates))
  }

  function updateNodeTransform(nodeId: string, transform: NodeTransform) {
    updateNodeTransforms({ [nodeId]: transform })
  }

  function addComponent(componentType: string) {
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
    setMode('editor')
    setMessage(`已添加 ${registration.definition.title}`)
  }

  function duplicateSelectedNodes() {
    if (selectedNodes.length === 0) {
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
    if (!canGroup) {
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
    if (!primaryNode || !isGroupNode(primaryNode)) {
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

  function updatePrimaryComponentProperty(
    key: string,
    value: string | number | boolean | null,
    commitImmediately: boolean,
  ) {
    if (!primaryNode || isGroupNode(primaryNode)) {
      return
    }

    const updateScene = (current: SceneDocument): SceneDocument => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === primaryNode.id && !isGroupNode(node)
          ? {
              ...node,
              props: {
                ...node.props,
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
      mode !== 'editor' ||
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
    if (!primaryNode || !Number.isFinite(value)) {
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
    const updates = alignNodes(scene, selectedNodeIds, alignMode)
    updateNodeTransforms(updates)

    if (Object.keys(updates).length > 0) {
      setMessage('已完成节点对齐')
    }
  }

  function applyDistribution(distributionMode: DistributeMode) {
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

  function saveScene() {
    saveScadaScene(workId, scene)
    setMessage('场景已保存')
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

    if (!file) {
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

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">◆</span>
          <div className="brand-text">
            <strong>SCADA Editor</strong>
            <span>通用组态编辑器</span>
          </div>
        </div>

        <div className="header-actions">
          <div className="document-toolbar" role="toolbar" aria-label="场景文档操作">
            <Button variant="secondary" onClick={() => importInputRef.current?.click()}>导入</Button>
            <Button variant="secondary" onClick={exportScene}>导出</Button>
            <Button variant="primary" onClick={saveScene}>保存</Button>
            <Input
              ref={importInputRef}
              className="hidden-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                void importScene(event)
              }}
            />
          </div>

          <SegmentedControl
            value={mode}
            items={MODE_ITEMS}
            onValueChange={setMode}
            ariaLabel="工作模式"
            className="mode-switch"
          />
        </div>
      </header>

      <main className="editor-main">
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

        <section className="canvas-area" aria-label="SCADA 编辑画布">
          <Toolbar className="canvas-toolbar" aria-label="画布工具栏">
            <ToolbarGroup className="canvas-tool-group">
              <ToolbarButton
                iconOnly
                className="icon-button"
                title="复制选中对象"
                aria-label="复制选中对象"
                disabled={selectedNodes.length === 0}
                onClick={duplicateSelectedNodes}
              >
                <CopyIcon />
              </ToolbarButton>
              <ToolbarButton
                iconOnly
                className="icon-button"
                title="删除选中对象"
                aria-label="删除选中对象"
                disabled={!hasSelection}
                onClick={deleteSelection}
              >
                <TrashIcon />
              </ToolbarButton>
              <ToolbarButton
                iconOnly
                className="icon-button"
                title={hierarchyTitle}
                aria-label={hierarchyTitle}
                disabled={!hierarchyEnabled}
                onClick={hierarchyMode === 'ungroup' ? ungroupSelectedNode : groupSelectedNodes}
              >
                {hierarchyMode === 'ungroup' ? <UngroupIcon /> : <GroupIcon />}
              </ToolbarButton>
              <ToolbarButton
                iconOnly
                className="icon-button"
                title="撤销 (Ctrl+Z)"
                aria-label="撤销"
                disabled={!canUndo}
                onClick={undo}
              >
                <UndoIcon />
              </ToolbarButton>
              <ToolbarButton
                iconOnly
                className="icon-button"
                title="重做 (Ctrl+Shift+Z)"
                aria-label="重做"
                disabled={!canRedo}
                onClick={redo}
              >
                <RedoIcon />
              </ToolbarButton>
            </ToolbarGroup>

            <ToolbarGroup className="canvas-tool-group">
              {alignButtons.map((item) => {
                const Icon = item.icon
                return (
                  <ToolbarButton
                    key={item.mode}
                    iconOnly
                    className="icon-button"
                    title={item.title}
                    aria-label={item.title}
                    disabled={selectedNodes.length < 2}
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
                disabled={selectedNodes.length < 3}
                onClick={() => applyDistribution('horizontal')}
              >
                <DistributeHorizontalIcon />
              </ToolbarButton>
              <ToolbarButton
                iconOnly
                className="icon-button"
                title="垂直等距分布"
                aria-label="垂直等距分布"
                disabled={selectedNodes.length < 3}
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
                  triggerLabel={sceneSizeTriggerLabel}
                  options={sceneSizeOptions}
                  onValueChange={changeSceneSize}
                />
              </div>
            </ToolbarGroup>
          </Toolbar>

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
                    checked={commonVisible}
                    label="全部可见"
                    onCheckedChange={(checked) => updateSelectedBaseProperty('visible', checked)}
                  />
                  <Checkbox
                    className="checkbox-field property-toggle"
                    checked={commonLocked}
                    label="全部锁定"
                    onCheckedChange={(checked) => updateSelectedBaseProperty('locked', checked)}
                  />
                </CollapsibleInspectorGroup>
              </div>
            )}

            {inspectorTab === 'properties' && !selectedConnection && primaryNode && (
              <div className="property-section-list">
                <CollapsibleInspectorGroup title="标识">
                  <label className="property-field">
                    <span>名称</span>
                    <Input
                      value={primaryNode.name}
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
                    values={primaryNode.props}
                    bindings={primaryNode.bindings}
                    runtimeSources={DEFAULT_PREVIEW_RUNTIME_VALUE_SOURCES}
                    onChange={updatePrimaryComponentProperty}
                    onBindingChange={updatePrimaryComponentBinding}
                    onCommit={commitScene}
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
                    checked={primaryNode.visible}
                    label="可见"
                    onCheckedChange={(checked) => updateSelectedBaseProperty('visible', checked)}
                  />
                  <Checkbox
                    className="checkbox-field property-toggle"
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
      </main>
    </div>
  )
}

export default ScadaEditorPage
