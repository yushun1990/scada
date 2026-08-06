import './m2.css'
import './workbench.css'
import {
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import type { PumpState } from './assets/pump'
import {
  hasDuplicateConnection,
  reconnectSceneConnection,
  type ConnectionEndpointRole,
} from './scene/connection-commands'
import {
  alignNodes,
  distributeNodes,
  getRootNodes,
  type AlignMode,
  type DistributeMode,
  type SnapSettings,
  type TransformUpdates,
} from './scene/geometry'
import {
  cloneSceneSubtrees,
  collectSubtreeIds,
  deleteSceneNodes,
  groupSceneNodes,
  ungroupSceneNode,
} from './scene/hierarchy'
import {
  createDefaultScene,
  createPumpNode,
  createSceneConnection,
  isGroupNode,
  isPumpNode,
  PUMP_ASPECT_RATIO,
  type ConnectionEndpoint,
  type ConnectionRouting,
  type NodeTransform,
  type PumpSceneNode,
  type SceneConnection,
  type SceneDocument,
  type SceneNode,
} from './scene/model'
import {
  applyTransformsAndExpandScene,
  expandSceneToContainNodes,
} from './scene/scene-bounds'
import { parseSceneDocument } from './scene/validation'
import {
  SceneRenderer,
  type RendererMode,
} from './renderer/SceneRenderer'

const STORAGE_KEY = 'scada-editor-lab.scene.v4'
const LEGACY_STORAGE_KEYS = [
  'scada-editor-lab.scene.v3',
  'scada-editor-lab.scene.v2',
  'scada-editor-lab.scene.v1',
]

type InspectorTab = 'properties' | 'actions' | 'events'
type LeftDockTab = 'components' | 'layers' | 'assets'

const pumpStates: Array<{
  id: PumpState
  name: string
  description: string
  swatch: string
}> = [
  { id: 'gray', name: '停止', description: '设备未运行', swatch: '#b8c4c0' },
  { id: 'green', name: '运行', description: '设备运行正常', swatch: '#35e625' },
  { id: 'blue', name: '手动', description: '人工控制状态', swatch: '#0788d4' },
  { id: 'orange', name: '警告', description: '需要关注', swatch: '#f47a08' },
  { id: 'red', name: '报警', description: '设备故障或报警', swatch: '#e80e17' },
]

const alignButtons: Array<{ mode: AlignMode; label: string; title: string }> = [
  { mode: 'left', label: '左', title: '左对齐' },
  { mode: 'center-x', label: '中X', title: '水平居中' },
  { mode: 'right', label: '右', title: '右对齐' },
  { mode: 'top', label: '上', title: '顶对齐' },
  { mode: 'center-y', label: '中Y', title: '垂直居中' },
  { mode: 'bottom', label: '下', title: '底对齐' },
]

function getInitialSelectedIds(scene: SceneDocument) {
  const firstRoot = getRootNodes(scene)[0]
  return firstRoot ? [firstRoot.id] : []
}

function getSavedScene() {
  const current = window.localStorage.getItem(STORAGE_KEY)

  if (current) {
    return current
  }

  for (const key of LEGACY_STORAGE_KEYS) {
    const legacy = window.localStorage.getItem(key)

    if (legacy) {
      return legacy
    }
  }

  return null
}

function loadInitialScene() {
  const savedScene = getSavedScene()

  if (!savedScene) {
    return createDefaultScene()
  }

  try {
    return parseSceneDocument(savedScene)
  } catch {
    return createDefaultScene()
  }
}

function App() {
  const [mode, setMode] = useState<RendererMode>('editor')
  const [scene, setScene] = useState(loadInitialScene)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(
    getInitialSelectedIds(scene),
  )
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null)
  const [leftDockTab, setLeftDockTab] = useState<LeftDockTab>('components')
  const [message, setMessage] = useState('编辑器布局与自动连线已启用')
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

  const rootNodes = getRootNodes(scene)
  const selectedNodes = selectedNodeIds
    .map((nodeId) => rootNodes.find((node) => node.id === nodeId))
    .filter((node): node is SceneNode => Boolean(node))
  const primaryNode = selectedNodes[selectedNodes.length - 1] ?? null
  const selectedConnection = scene.connections.find(
    (connection) => connection.id === selectedConnectionId,
  ) ?? null

  const selectedSubtreeIds = collectSubtreeIds(scene, selectedNodeIds)
  const selectedPumpNodes = scene.nodes.filter(
    (node): node is PumpSceneNode =>
      selectedSubtreeIds.has(node.id) && isPumpNode(node),
  )
  const selectedGroupCount = selectedNodes.filter(isGroupNode).length

  const canGroup =
    selectedNodes.length >= 2 &&
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

  function updateNodeTransforms(updates: TransformUpdates) {
    if (Object.keys(updates).length === 0) {
      return
    }

    setScene((current) => applyTransformsAndExpandScene(current, updates))
  }

  function updateNodeTransform(nodeId: string, transform: NodeTransform) {
    updateNodeTransforms({ [nodeId]: transform })
  }

  function addPump() {
    const node = createPumpNode(
      scene.nodes.filter(isPumpNode).length + 1,
      Math.min(rootNodes.length * 18, 120),
    )

    setScene((current) => ({
      ...current,
      nodes: [...current.nodes, node],
    }))
    setSelectedNodeIds([node.id])
    setSelectedConnectionId(null)
    setMode('editor')
    setMessage(`已添加 ${node.name}`)
  }

  function duplicateSelectedNodes() {
    if (selectedNodes.length === 0) {
      return
    }

    const result = cloneSceneSubtrees(scene, selectedNodeIds)
    setScene(expandSceneToContainNodes(result.scene))
    setSelectedNodeIds(result.rootIds)
    setSelectedConnectionId(null)
    setMessage(`已复制 ${result.rootIds.length} 个根节点及其内部连线`)
  }

  function deleteSelection() {
    if (selectedConnection) {
      setScene((current) => ({
        ...current,
        connections: current.connections.filter(
          (connection) => connection.id !== selectedConnection.id,
        ),
      }))
      setSelectedConnectionId(null)
      setMessage(`已删除连线 ${selectedConnection.name}`)
      return
    }

    if (selectedNodes.length === 0) {
      return
    }

    setScene(deleteSceneNodes(scene, selectedNodeIds))
    setSelectedNodeIds([])
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

    setScene(result.scene)
    setSelectedNodeIds([result.groupId])
    setSelectedConnectionId(null)
    setMessage('已组合节点，现有连线端点保持附着')
  }

  function ungroupSelectedNode() {
    if (!primaryNode || !isGroupNode(primaryNode)) {
      return
    }

    const result = ungroupSceneNode(scene, primaryNode.id)
    setScene(result.scene)
    setSelectedNodeIds(result.childIds)
    setSelectedConnectionId(null)
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

    setScene((current) => ({
      ...current,
      connections: [...current.connections, connection],
    }))
    setSelectedNodeIds([])
    setSelectedConnectionId(connection.id)
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
      setScene(result.scene)
      setSelectedConnectionId(connectionId)
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

  function resetSelectedTransforms() {
    if (selectedNodes.length === 0) {
      return
    }

    const updates: TransformUpdates = {}

    selectedNodes.forEach((node, index) => {
      const width = isPumpNode(node) ? 256 : node.transform.width
      const height = isPumpNode(node)
        ? width / PUMP_ASPECT_RATIO
        : node.transform.height

      updates[node.id] = {
        x: 160 + index * 36,
        y: 48 + index * 28,
        width,
        height,
        rotation: 0,
      }
    })

    updateNodeTransforms(updates)
    setMessage('已重置选中节点，连线端点同步更新')
  }

  function setSelectedPumpState(state: PumpState) {
    if (selectedPumpNodes.length === 0) {
      return
    }

    const selectedIdSet = new Set(selectedPumpNodes.map((node) => node.id))
    setScene((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        selectedIdSet.has(node.id) && isPumpNode(node)
          ? {
              ...node,
              props: {
                ...node.props,
                state,
              },
            }
          : node,
      ),
    }))
    setMessage(`已批量更新 ${selectedPumpNodes.length} 个水泵状态`)
  }

  function updateSelectedBaseProperty(
    property: 'visible' | 'locked',
    value: boolean,
  ) {
    const selectedIdSet = new Set(selectedNodeIds)
    setScene((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        selectedIdSet.has(node.id)
          ? { ...node, [property]: value }
          : node,
      ),
    }))
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

  function saveScene() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scene))
    setMessage('v4 场景已保存到浏览器')
  }

  function restoreScene() {
    const savedScene = getSavedScene()

    if (!savedScene) {
      setMessage('浏览器中没有已保存场景')
      return
    }

    try {
      const restoredScene = parseSceneDocument(savedScene)
      setScene(restoredScene)
      setSelectedNodeIds(getInitialSelectedIds(restoredScene))
      setSelectedConnectionId(null)
      setMessage('已恢复浏览器场景')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '场景恢复失败')
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

    if (!file) {
      return
    }

    try {
      const importedScene = parseSceneDocument(await file.text())
      setScene(importedScene)
      setSelectedNodeIds(getInitialSelectedIds(importedScene))
      setSelectedConnectionId(null)
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

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div className="brand-block">
          <strong>SCADA Editor</strong>
          <span>通用组态编辑器</span>
        </div>

        <span className="header-message">{message}</span>

        <div className="document-toolbar" role="toolbar" aria-label="场景文档操作">
          <button type="button" onClick={saveScene}>保存</button>
          <button type="button" onClick={restoreScene}>恢复</button>
          <button type="button" onClick={() => importInputRef.current?.click()}>导入</button>
          <button type="button" onClick={exportScene}>导出</button>
          <input
            ref={importInputRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importScene(event)
            }}
          />
        </div>

        <div className="mode-switch" role="group" aria-label="工作模式">
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
            onClick={() => {
              setMode('preview')
              setSelectedNodeIds([])
              setSelectedConnectionId(null)
            }}
          >
            预览
          </button>
        </div>
      </header>

      <main className="editor-main">
        <aside className="component-panel">
          <div className="dock-tabs" role="tablist" aria-label="左侧工作区">
            {([
              ['components', '组件'],
              ['layers', '图层'],
              ['assets', '资源'],
            ] as Array<[LeftDockTab, string]>).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                className={leftDockTab === tab ? 'active' : ''}
                onClick={() => setLeftDockTab(tab)}
              >
                {label}
              </button>
            ))}
          </div>

          {leftDockTab === 'components' && (
            <div className="dock-content">
              <div className="panel-title">基础组件</div>
              <button
                className="component-item active"
                type="button"
                onClick={addPump}
              >
                <span className="component-icon">P</span>
                <span>
                  <strong>添加潜水泵</strong>
                  <small>pump.submersible</small>
                </span>
              </button>
              <p className="panel-description component-dock-help">
                后续组件注册表、搜索、分类和拖放入口统一放在这里。
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
          <div className="canvas-toolbar">
            <div className="canvas-toolbar-summary">
              <strong>{scene.name}</strong>
              <span>{scene.width} × {scene.height}</span>
              <span>{scene.nodes.length} 个组件</span>
              <span>{scene.connections.length} 条连线</span>
            </div>

            <div className="canvas-tool-strip" role="toolbar" aria-label="绘图工具">
              <div className="canvas-tool-group" aria-label="对齐">
                {alignButtons.map((item) => (
                  <button
                    key={item.mode}
                    type="button"
                    title={item.title}
                    disabled={selectedNodes.length < 2}
                    onClick={() => applyAlignment(item.mode)}
                  >
                    {item.label}
                  </button>
                ))}
                <button
                  type="button"
                  title="水平均匀分布"
                  disabled={selectedNodes.length < 3}
                  onClick={() => applyDistribution('horizontal')}
                >
                  水平分布
                </button>
                <button
                  type="button"
                  title="垂直均匀分布"
                  disabled={selectedNodes.length < 3}
                  onClick={() => applyDistribution('vertical')}
                >
                  垂直分布
                </button>
              </div>

              <div className="canvas-tool-group view-tool-group" aria-label="视图与网格">
                <label className="canvas-toggle">
                  <input
                    type="checkbox"
                    checked={gridVisible}
                    onChange={(event) => setGridVisible(event.target.checked)}
                  />
                  <span>格线</span>
                </label>
                <label className="canvas-toggle">
                  <input
                    type="checkbox"
                    checked={snapSettings.gridEnabled}
                    onChange={(event) => {
                      setSnapSettings((current) => ({
                        ...current,
                        gridEnabled: event.target.checked,
                      }))
                    }}
                  />
                  <span>网格吸附</span>
                </label>
                <label className="canvas-grid-size">
                  <span>间距</span>
                  <input
                    type="number"
                    min="4"
                    max="128"
                    value={snapSettings.gridSize}
                    onChange={(event) => {
                      const gridSize = Number(event.target.value)

                      if (Number.isFinite(gridSize) && gridSize > 0) {
                        setSnapSettings((current) => ({ ...current, gridSize }))
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <span className="canvas-toolbar-hint">
              靠近组件锚点后直接拖动即可连线 · Space 或中键平移
            </span>
          </div>
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
          <section className="base-inspector" aria-label="基础设置">
            <div className="inspector-section-header">
              <div>
                <strong>基础</strong>
                <span>
                  {selectedConnection
                    ? '连线几何与样式'
                    : selectedNodes.length > 0
                      ? `${selectedNodes.length} 个对象`
                      : '场景信息'}
                </span>
              </div>

              <div className="base-command-row" role="toolbar" aria-label="选择操作">
                <button
                  type="button"
                  disabled={selectedNodes.length === 0}
                  onClick={duplicateSelectedNodes}
                >
                  复制
                </button>
                <button
                  type="button"
                  disabled={!hasSelection}
                  onClick={deleteSelection}
                >
                  删除
                </button>
                <button
                  type="button"
                  disabled={selectedNodes.length === 0}
                  onClick={resetSelectedTransforms}
                >
                  重置
                </button>
                <button type="button" disabled={!canGroup} onClick={groupSelectedNodes}>
                  组合
                </button>
                <button type="button" disabled={!canUngroup} onClick={ungroupSelectedNode}>
                  拆分
                </button>
              </div>
            </div>

            {selectedConnection ? (
              <div className="base-group-list">
                <fieldset className="inspector-group">
                  <legend>连线</legend>
                  <label className="property-field">
                    <span>名称</span>
                    <input
                      value={selectedConnection.name}
                      onChange={(event) => {
                        const name = event.target.value
                        updateConnection(selectedConnection.id, (connection) => ({
                          ...connection,
                          name,
                        }))
                      }}
                    />
                  </label>
                  <label className="property-field">
                    <span>路由</span>
                    <select
                      value={selectedConnection.routing}
                      onChange={(event) => {
                        const routing = event.target.value as ConnectionRouting
                        updateConnection(selectedConnection.id, (connection) => ({
                          ...connection,
                          routing,
                        }))
                      }}
                    >
                      <option value="orthogonal">正交折线</option>
                      <option value="straight">直线</option>
                    </select>
                  </label>
                </fieldset>

                <fieldset className="inspector-group">
                  <legend>样式</legend>
                  <div className="property-grid">
                    <label className="property-field compact">
                      <span>颜色</span>
                      <input
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
                      />
                    </label>
                    <label className="property-field compact">
                      <span>线宽</span>
                      <input
                        type="number"
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
                      />
                    </label>
                  </div>
                  <label className="property-field">
                    <span>线型</span>
                    <select
                      value={selectedConnection.style.dash}
                      onChange={(event) => {
                        const dash = event.target.value as 'solid' | 'dashed'
                        updateConnection(selectedConnection.id, (connection) => ({
                          ...connection,
                          style: { ...connection.style, dash },
                        }))
                      }}
                    >
                      <option value="solid">实线</option>
                      <option value="dashed">虚线</option>
                    </select>
                  </label>
                </fieldset>

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
              </div>
            ) : selectedNodes.length === 0 ? (
              <div className="scene-inspector-summary">
                <div><span>场景</span><code>{scene.name}</code></div>
                <div><span>尺寸</span><code>{scene.width} × {scene.height}</code></div>
                <div><span>背景</span><code>{scene.background}</code></div>
                <div><span>扩展</span><code>组件越界时自动向右/向下扩展</code></div>
              </div>
            ) : selectedNodes.length > 1 ? (
              <div className="base-group-list">
                <fieldset className="inspector-group">
                  <legend>选择</legend>
                  <div className="selection-summary">
                    已选择 <strong>{selectedNodes.length}</strong> 个根节点。
                  </div>
                  <label className="checkbox-field property-toggle">
                    <input
                      type="checkbox"
                      checked={commonVisible}
                      onChange={(event) =>
                        updateSelectedBaseProperty('visible', event.target.checked)
                      }
                    />
                    <span>全部可见</span>
                  </label>
                  <label className="checkbox-field property-toggle">
                    <input
                      type="checkbox"
                      checked={commonLocked}
                      onChange={(event) =>
                        updateSelectedBaseProperty('locked', event.target.checked)
                      }
                    />
                    <span>全部锁定</span>
                  </label>
                </fieldset>
              </div>
            ) : primaryNode ? (
              <div className="base-group-list">
                <fieldset className="inspector-group">
                  <legend>标识</legend>
                  <label className="property-field">
                    <span>名称</span>
                    <input
                      value={primaryNode.name}
                      onChange={(event) => {
                        const name = event.target.value
                        updateNode(primaryNode.id, (node) => ({ ...node, name }))
                      }}
                    />
                  </label>
                  <div className="property-summary compact-summary">
                    <div><span>类型</span><code>{primaryNode.type}</code></div>
                    <div><span>父级</span><code>{primaryNode.parentId ?? 'scene-root'}</code></div>
                  </div>
                </fieldset>

                <fieldset className="inspector-group">
                  <legend>几何</legend>
                  <div className="property-grid">
                    {(['x', 'y', 'width', 'height', 'rotation'] as const).map(
                      (field) => (
                        <label key={field} className="property-field compact">
                          <span>{field.toUpperCase()}</span>
                          <input
                            type="number"
                            value={Math.round(primaryNode.transform[field] * 100) / 100}
                            onChange={(event) =>
                              updatePrimaryTransformField(field, Number(event.target.value))
                            }
                          />
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>

                <fieldset className="inspector-group inspector-toggle-group">
                  <legend>显示</legend>
                  <label className="checkbox-field property-toggle">
                    <input
                      type="checkbox"
                      checked={primaryNode.visible}
                      onChange={(event) =>
                        updateSelectedBaseProperty('visible', event.target.checked)
                      }
                    />
                    <span>可见</span>
                  </label>
                  <label className="checkbox-field property-toggle">
                    <input
                      type="checkbox"
                      checked={primaryNode.locked}
                      onChange={(event) =>
                        updateSelectedBaseProperty('locked', event.target.checked)
                      }
                    />
                    <span>锁定</span>
                  </label>
                </fieldset>
              </div>
            ) : null}
          </section>

          <section className="semantic-inspector" aria-label="组件语义">
            <div className="inspector-tabs" role="tablist" aria-label="组件语义检查器">
              {([
                ['properties', '属性'],
                ['actions', '方法'],
                ['events', '事件'],
              ] as Array<[InspectorTab, string]>).map(([tab, label]) => (
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

            {inspectorTab === 'properties' && selectedConnection && (
              <div className="inspector-placeholder">
                <strong>连线没有组件属性</strong>
                <span>连线几何和样式统一在上方“基础”区域编辑。</span>
              </div>
            )}

            {inspectorTab === 'properties' && !selectedConnection && (
              <>
                <div className="panel-title">组件公共属性</div>
                {selectedPumpNodes.length === 0 ? (
                  <div className="inspector-placeholder">
                    <strong>当前选择没有可编辑的公共属性</strong>
                    <span>后续由组件注册表计算不同组件类型之间的公共属性交集。</span>
                  </div>
                ) : (
                  <>
                    <div className="property-scope">
                      当前范围包含 <strong>{selectedPumpNodes.length}</strong> 个水泵。
                      {selectedGroupCount > 0 && (
                        <span>修改会递归应用到组合内的真实子组件。</span>
                      )}
                    </div>
                    <div className="state-list">
                      {pumpStates.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`state-button${selectedPumpNodes.every((node) => node.props.state === item.id) ? ' active' : ''}`}
                          onClick={() => setSelectedPumpState(item.id)}
                        >
                          <span
                            className="state-swatch"
                            style={{ backgroundColor: item.swatch }}
                            aria-hidden="true"
                          />
                          <span>
                            <strong>{item.name}</strong>
                            <small>{item.description}</small>
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {inspectorTab === 'actions' && (
              <div className="inspector-placeholder">
                <strong>方法定义入口</strong>
                <span>组件注册表接入后，在这里调用 start、stop、reset 等方法。</span>
              </div>
            )}

            {inspectorTab === 'events' && (
              <div className="inspector-placeholder">
                <strong>事件定义入口</strong>
                <span>后续在这里显示语义事件和 Event → Method 行为连接。</span>
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  )
}

export default App
