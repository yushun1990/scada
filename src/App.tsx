import './m2.css'
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

type InspectorTab = 'base' | 'properties' | 'actions' | 'events'

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
  const [connectionMode, setConnectionMode] = useState(false)
  const [message, setMessage] = useState('M2.3A 通用视觉锚点迁移已启用')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('base')
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
      setInspectorTab('base')
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

    setScene((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        updates[node.id]
          ? { ...node, transform: updates[node.id] }
          : node,
      ),
    }))
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
    setInspectorTab('base')
    setMessage(`已添加 ${node.name}`)
  }

  function duplicateSelectedNodes() {
    if (selectedNodes.length === 0) {
      return
    }

    const result = cloneSceneSubtrees(scene, selectedNodeIds)
    setScene(result.scene)
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
    setInspectorTab('base')
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
    setInspectorTab('base')
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
    setInspectorTab('base')
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
    setMessage('v3 场景已保存到浏览器')
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
      setConnectionMode(false)
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
          <strong>SCADA Editor Lab</strong>
          <span>M2.3 · 端口与可视连线</span>
        </div>

        <div className="header-actions">
          <span className="header-message">{message}</span>
          <div className="mode-switch" role="group" aria-label="编辑器模式">
            <button
              type="button"
              className={mode === 'editor' ? 'active' : ''}
              onClick={() => setMode('editor')}
            >
              编辑
            </button>
            <button
              type="button"
              className={mode === 'preview' ? 'active' : ''}
              onClick={() => {
                setMode('preview')
                setConnectionMode(false)
                setSelectedNodeIds([])
                setSelectedConnectionId(null)
              }}
            >
              预览
            </button>
          </div>

          <button
            type="button"
            className="secondary-button"
            disabled={selectedNodes.length === 0}
            onClick={resetSelectedTransforms}
          >
            重置选中
          </button>
        </div>
      </header>

      <main className="editor-main">
        <aside className="component-panel">
          <div className="panel-title">组件</div>
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

          <div className="panel-title section-title">选择操作</div>
          <div className="action-grid">
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
              disabled={!canGroup}
              onClick={groupSelectedNodes}
            >
              组合
            </button>
            <button
              type="button"
              disabled={!canUngroup}
              onClick={ungroupSelectedNode}
            >
              拆分
            </button>
          </div>

          <div className="panel-title section-title">连线</div>
          <button
            type="button"
            className={`connection-mode-button${connectionMode ? ' active' : ''}`}
            onClick={() => {
              setMode('editor')
              setConnectionMode((current) => !current)
            }}
          >
            {connectionMode ? '退出连线模式' : '进入连线模式'}
          </button>
          <div className="connection-legend">
            <span><i className="port-dot output" />中性视觉锚点</span>
          </div>
          <p className="panel-description connection-help">
            连线模式会显示图片四周的通用锚点；选中已有连线后，可拖动两端控制点重新连接。
          </p>

          <div className="panel-title section-title">对齐</div>
          <div className="arrange-grid">
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

          <div className="panel-title section-title">视图与网格</div>
          <div className="snap-settings">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={gridVisible}
                onChange={(event) => setGridVisible(event.target.checked)}
              />
              <span>显示格线</span>
            </label>
            <label className="checkbox-field">
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
            <label className="inline-number">
              <span>网格尺寸</span>
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
            <p className="panel-description">
              组件边缘与中心线吸附始终开启。
            </p>
          </div>

          <div className="panel-title section-title">场景文档</div>
          <div className="document-actions">
            <button type="button" onClick={saveScene}>保存浏览器</button>
            <button type="button" onClick={restoreScene}>恢复浏览器</button>
            <button type="button" onClick={exportScene}>导出 JSON</button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
            >
              导入 JSON
            </button>
          </div>
          <input
            ref={importInputRef}
            className="hidden-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importScene(event)
            }}
          />

          <div className="milestone-card">
            <strong>M2.3A 当前切片</strong>
            <span>每个普通图片节点提供 17 个中性锚点</span>
            <span>连线选择、删除与样式设置</span>
            <span>起点和终点拖拽重连</span>
            <span>组合和变换后端点自动跟随</span>
          </div>
        </aside>

        <section className="canvas-area" aria-label="SCADA 编辑画布">
          <div className="canvas-toolbar">
            <span>
              {scene.name} / {rootNodes.length} root / {scene.nodes.length} nodes / {scene.connections.length} connections
            </span>
            <span>
              {connectionMode
                ? '拖动任意视觉锚点建立连接 · 不限制输入输出语义'
                : selectedConnection
                ? '拖动连线两端控制点可重连 · 绿色表示可放置锚点'
                : '组件吸附始终开启 · Shift/Ctrl 多选 · 空白拖动框选'}
            </span>
          </div>
          <SceneRenderer
            scene={scene}
            mode={mode}
            selectedNodeIds={selectedNodeIds}
            selectedConnectionId={selectedConnectionId}
            connectionMode={connectionMode}
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
          <div className="inspector-tabs" role="tablist" aria-label="节点检查器">
            {([
              ['base', '基础'],
              ['properties', '属性'],
              ['actions', '动作'],
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

          {inspectorTab === 'base' && selectedConnection && (
            <>
              <div className="panel-title">连线属性</div>
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
              <label className="property-field">
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
              <label className="property-field">
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
              <div className="property-summary">
                <div>
                  <span>起点</span>
                  <code>{selectedConnection.source.nodeId} / {selectedConnection.source.anchorId}</code>
                </div>
                <div>
                  <span>终点</span>
                  <code>{selectedConnection.target.nodeId} / {selectedConnection.target.anchorId}</code>
                </div>
                <div>
                <span>端点编辑</span>
                  <code>拖动蓝色控制点</code>
                </div>
              </div>
            </>
          )}

          {inspectorTab === 'base' && !selectedConnection && (
            <>
              <div className="panel-title">基础属性</div>
              {selectedNodes.length === 0 ? (
                <p className="empty-selection">请选择组件、组合或连线。</p>
              ) : selectedNodes.length > 1 ? (
                <>
                  <div className="selection-summary">
                    已选择 <strong>{selectedNodes.length}</strong> 个根节点。
                    可执行对齐、排列或组合。
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
                </>
              ) : primaryNode ? (
                <>
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

                  <div className="property-grid">
                    {(['x', 'y', 'width', 'height', 'rotation'] as const).map(
                      (field) => (
                        <label key={field} className="property-field compact">
                          <span>{field.toUpperCase()}</span>
                          <input
                            type="number"
                            value={Math.round(primaryNode.transform[field] * 100) / 100}
                            onChange={(event) =>
                              updatePrimaryTransformField(
                                field,
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                      ),
                    )}
                  </div>

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

                  <div className="property-summary">
                    <div>
                      <span>节点类型</span>
                      <code>{primaryNode.type}</code>
                    </div>
                    <div>
                      <span>父节点</span>
                      <code>{primaryNode.parentId ?? 'scene-root'}</code>
                    </div>
                    <div>
                      <span>场景版本</span>
                      <code>v{scene.version}</code>
                    </div>
                  </div>
                </>
              ) : null}
            </>
          )}

          {inspectorTab === 'properties' && selectedConnection && (
            <div className="inspector-placeholder">
              <strong>可视连线不是组件 Property</strong>
              <span>颜色、线宽和路由属于场景几何样式，在“基础”页编辑。</span>
            </div>
          )}

          {inspectorTab === 'properties' && !selectedConnection && (
            <>
              <div className="panel-title">组件公共属性</div>
              {selectedPumpNodes.length === 0 ? (
                <div className="inspector-placeholder">
                  <strong>当前选择范围没有兼容的水泵属性</strong>
                  <span>后续组件注册表会计算不同类型之间的公共属性交集。</span>
                </div>
              ) : (
                <>
                  <div className="property-scope">
                    当前选择范围包含 <strong>{selectedPumpNodes.length}</strong> 个水泵。
                    {selectedGroupCount > 0 && (
                      <span>修改将递归应用到组合内的真实子组件。</span>
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
              <strong>Action 定义入口</strong>
              <span>M3 接入组件注册表后，可在这里手动调用 start、stop、reset 等动作。</span>
            </div>
          )}

          {inspectorTab === 'events' && (
            <div className="inspector-placeholder">
              <strong>Event 定义入口</strong>
              <span>M3/M4 将在这里显示语义事件和 Event → Action 行为连接。</span>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App
