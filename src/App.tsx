import './m2.css'
import {
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import type { PumpState } from './assets/pump'
import {
  alignNodes,
  distributeNodes,
  type AlignMode,
  type DistributeMode,
  type SnapSettings,
  type TransformUpdates,
} from './scene/geometry'
import {
  cloneSceneNode,
  createDefaultScene,
  createPumpNode,
  PUMP_ASPECT_RATIO,
  type NodeTransform,
  type SceneNode,
} from './scene/model'
import { parseSceneDocument } from './scene/validation'
import {
  SceneRenderer,
  type RendererMode,
} from './renderer/SceneRenderer'

const STORAGE_KEY = 'scada-editor-lab.scene.v1'

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

function loadInitialScene() {
  const savedScene = window.localStorage.getItem(STORAGE_KEY)

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
    scene.nodes[0] ? [scene.nodes[0].id] : [],
  )
  const [message, setMessage] = useState('M2.1 多选与吸附已启用')
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('base')
  const [snapSettings, setSnapSettings] = useState<SnapSettings>({
    enabled: true,
    gridEnabled: true,
    gridSize: 24,
    objectEnabled: true,
    threshold: 7,
  })
  const importInputRef = useRef<HTMLInputElement>(null)

  const selectedNodes = selectedNodeIds
    .map((nodeId) => scene.nodes.find((node) => node.id === nodeId))
    .filter((node): node is SceneNode => Boolean(node))
  const primaryNode = selectedNodes[selectedNodes.length - 1] ?? null

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
      scene.nodes.length + 1,
      Math.min(scene.nodes.length * 18, 120),
    )

    setScene((current) => ({
      ...current,
      nodes: [...current.nodes, node],
    }))
    setSelectedNodeIds([node.id])
    setMode('editor')
    setInspectorTab('base')
    setMessage(`已添加 ${node.name}`)
  }

  function duplicateSelectedNodes() {
    if (selectedNodes.length === 0) {
      return
    }

    const copies = selectedNodes.map((node, index) =>
      cloneSceneNode(node, scene.nodes.length + index + 1),
    )

    setScene((current) => ({
      ...current,
      nodes: [...current.nodes, ...copies],
    }))
    setSelectedNodeIds(copies.map((node) => node.id))
    setMessage(`已复制 ${copies.length} 个组件`)
  }

  function deleteSelectedNodes() {
    if (selectedNodes.length === 0) {
      return
    }

    const selectedIdSet = new Set(selectedNodeIds)
    setScene((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !selectedIdSet.has(node.id)),
    }))
    setSelectedNodeIds([])
    setMessage(`已删除 ${selectedNodes.length} 个组件`)
  }

  function resetSelectedTransforms() {
    if (selectedNodes.length === 0) {
      return
    }

    const width = 256
    const updates: TransformUpdates = {}

    selectedNodes.forEach((node, index) => {
      updates[node.id] = {
        x: 160 + index * 36,
        y: 48 + index * 28,
        width,
        height: width / PUMP_ASPECT_RATIO,
        rotation: 0,
      }
    })

    updateNodeTransforms(updates)
    setMessage('已重置选中组件')
  }

  function setSelectedPumpState(state: PumpState) {
    if (selectedNodes.length === 0) {
      return
    }

    const selectedIdSet = new Set(selectedNodeIds)
    setScene((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        selectedIdSet.has(node.id)
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
    let nextTransform: NodeTransform = {
      ...transform,
      [field]: value,
    }

    if (field === 'width') {
      const width = Math.max(1, value)
      nextTransform = {
        ...nextTransform,
        width,
        height: width / PUMP_ASPECT_RATIO,
      }
    }

    if (field === 'height') {
      const height = Math.max(1, value)
      nextTransform = {
        ...nextTransform,
        width: height * PUMP_ASPECT_RATIO,
        height,
      }
    }

    updateNodeTransform(primaryNode.id, nextTransform)
  }

  function applyAlignment(alignMode: AlignMode) {
    const updates = alignNodes(scene, selectedNodeIds, alignMode)
    updateNodeTransforms(updates)

    if (Object.keys(updates).length > 0) {
      setMessage('已完成组件对齐')
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
    setMessage('场景已保存到浏览器')
  }

  function restoreScene() {
    const savedScene = window.localStorage.getItem(STORAGE_KEY)

    if (!savedScene) {
      setMessage('浏览器中没有已保存场景')
      return
    }

    try {
      const restoredScene = parseSceneDocument(savedScene)
      setScene(restoredScene)
      setSelectedNodeIds(restoredScene.nodes[0] ? [restoredScene.nodes[0].id] : [])
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
      setSelectedNodeIds(importedScene.nodes[0] ? [importedScene.nodes[0].id] : [])
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
          <strong>SCADA Editor Lab</strong>
          <span>M2.1 · 多选、吸附、对齐与排列</span>
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
                setSelectedNodeIds([])
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
              disabled={selectedNodes.length === 0}
              onClick={deleteSelectedNodes}
            >
              删除
            </button>
          </div>

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

          <div className="panel-title section-title">吸附</div>
          <div className="snap-settings">
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={snapSettings.enabled}
                onChange={(event) => {
                  setSnapSettings((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }}
              />
              <span>启用吸附</span>
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
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={snapSettings.objectEnabled}
                onChange={(event) => {
                  setSnapSettings((current) => ({
                    ...current,
                    objectEnabled: event.target.checked,
                  }))
                }}
              />
              <span>组件吸附</span>
            </label>
            <label className="inline-number">
              <span>网格</span>
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
            <strong>M2.1 操作提示</strong>
            <span>Shift/Ctrl 点击增加或移除选择</span>
            <span>在空白处拖动进行框选</span>
            <span>拖动任一选中组件可整体移动</span>
            <span>粉色线为组件吸附，蓝色线为网格吸附</span>
          </div>
        </aside>

        <section className="canvas-area" aria-label="SCADA 编辑画布">
          <div className="canvas-toolbar">
            <span>{scene.name} / {scene.nodes.length} nodes</span>
            <span>
              {selectedNodes.length} selected · grid {snapSettings.gridSize}px
            </span>
          </div>
          <SceneRenderer
            scene={scene}
            mode={mode}
            selectedNodeIds={selectedNodeIds}
            snapSettings={snapSettings}
            onSelectionChange={setSelectedNodeIds}
            onTransformNodes={updateNodeTransforms}
          />
        </section>

        <aside className="property-panel">
          <div className="inspector-tabs" role="tablist">
            {(
              [
                ['base', '基础'],
                ['properties', '属性'],
                ['actions', '动作'],
                ['events', '事件'],
              ] as Array<[InspectorTab, string]>
            ).map(([tab, label]) => (
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

          {selectedNodes.length === 0 ? (
            <p className="empty-selection">
              点击组件，或在空白区域拖动框选组件。
            </p>
          ) : inspectorTab === 'base' ? (
            <>
              <div className="panel-title">基础属性</div>
              {selectedNodes.length > 1 ? (
                <div className="selection-summary">
                  已选择 <strong>{selectedNodes.length}</strong> 个组件。位置和尺寸字段仅在单选时显示。
                </div>
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
                    {(
                      [
                        ['x', 'X'],
                        ['y', 'Y'],
                        ['width', '宽'],
                        ['height', '高'],
                        ['rotation', '旋转'],
                      ] as Array<[keyof NodeTransform, string]>
                    ).map(([field, label]) => (
                      <label key={field} className="property-field compact">
                        <span>{label}</span>
                        <input
                          type="number"
                          value={Number(primaryNode.transform[field].toFixed(2))}
                          onChange={(event) => {
                            updatePrimaryTransformField(
                              field,
                              Number(event.target.value),
                            )
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </>
              ) : null}

              <label className="checkbox-field property-toggle">
                <input
                  type="checkbox"
                  checked={commonVisible}
                  onChange={(event) => {
                    updateSelectedBaseProperty('visible', event.target.checked)
                  }}
                />
                <span>可见</span>
              </label>
              <label className="checkbox-field property-toggle">
                <input
                  type="checkbox"
                  checked={commonLocked}
                  onChange={(event) => {
                    updateSelectedBaseProperty('locked', event.target.checked)
                  }}
                />
                <span>锁定</span>
              </label>

              {selectedNodes.length > 1 && (
                <>
                  <div className="panel-title section-title">对齐与排列</div>
                  <div className="arrange-grid">
                    {alignButtons.map((item) => (
                      <button
                        key={item.mode}
                        type="button"
                        onClick={() => applyAlignment(item.mode)}
                      >
                        {item.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={selectedNodes.length < 3}
                      onClick={() => applyDistribution('horizontal')}
                    >
                      水平分布
                    </button>
                    <button
                      type="button"
                      disabled={selectedNodes.length < 3}
                      onClick={() => applyDistribution('vertical')}
                    >
                      垂直分布
                    </button>
                  </div>
                </>
              )}
            </>
          ) : inspectorTab === 'properties' ? (
            <>
              <div className="panel-title">组件属性</div>
              <p className="panel-description">
                当前水泵的 state 是首个组件属性。M3 将由组件定义自动生成这里的编辑器。
              </p>
              <div className="state-list">
                {pumpStates.map((item) => {
                  const allActive = selectedNodes.every(
                    (node) => node.props.state === item.id,
                  )

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`state-button${allActive ? ' active' : ''}`}
                      aria-pressed={allActive}
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
                  )
                })}
              </div>
            </>
          ) : inspectorTab === 'actions' ? (
            <div className="inspector-placeholder">
              <strong>Action</strong>
              <span>M3 将从组件定义发现动作，并允许模拟调用。</span>
            </div>
          ) : (
            <div className="inspector-placeholder">
              <strong>Event</strong>
              <span>M3 将从组件定义发现事件，并记录模拟事件。</span>
            </div>
          )}

          {primaryNode && (
            <div className="property-summary">
              <div>
                <span>主节点</span>
                <code>{primaryNode.id.slice(0, 18)}…</code>
              </div>
              <div>
                <span>选择数量</span>
                <code>{selectedNodes.length}</code>
              </div>
              <div>
                <span>场景版本</span>
                <code>v{scene.version}</code>
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App
