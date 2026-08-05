import {
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import type { PumpState } from './assets/pump'
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    scene.nodes[0]?.id ?? null,
  )
  const [message, setMessage] = useState('M2 场景文档已启用')
  const importInputRef = useRef<HTMLInputElement>(null)

  const selectedNode =
    scene.nodes.find((node) => node.id === selectedNodeId) ?? null

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

  function updateNodeTransform(nodeId: string, transform: NodeTransform) {
    updateNode(nodeId, (node) => ({
      ...node,
      transform,
    }))
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
    setSelectedNodeId(node.id)
    setMode('editor')
    setMessage(`已添加 ${node.name}`)
  }

  function duplicateSelectedNode() {
    if (!selectedNode) {
      return
    }

    const copy = cloneSceneNode(selectedNode, scene.nodes.length + 1)
    setScene((current) => ({
      ...current,
      nodes: [...current.nodes, copy],
    }))
    setSelectedNodeId(copy.id)
    setMessage(`已复制 ${selectedNode.name}`)
  }

  function deleteSelectedNode() {
    if (!selectedNode) {
      return
    }

    setScene((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== selectedNode.id),
    }))
    setSelectedNodeId(null)
    setMessage(`已删除 ${selectedNode.name}`)
  }

  function resetSelectedTransform() {
    if (!selectedNodeId) {
      return
    }

    const width = 256
    updateNodeTransform(selectedNodeId, {
      x: 220,
      y: 48,
      width,
      height: width / PUMP_ASPECT_RATIO,
      rotation: 0,
    })
    setMessage('已重置当前组件位置')
  }

  function setSelectedPumpState(state: PumpState) {
    if (!selectedNodeId) {
      return
    }

    updateNode(selectedNodeId, (node) => ({
      ...node,
      props: {
        ...node.props,
        state,
      },
    }))
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
      setSelectedNodeId(restoredScene.nodes[0]?.id ?? null)
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
      setSelectedNodeId(importedScene.nodes[0]?.id ?? null)
      setMode('editor')
      setMessage(`已导入 ${file.name}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '场景导入失败')
    }
  }

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div className="brand-block">
          <strong>SCADA Editor Lab</strong>
          <span>M2 · SceneDocument 与统一渲染器</span>
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
                setSelectedNodeId(null)
              }}
            >
              预览
            </button>
          </div>

          <button
            type="button"
            className="secondary-button"
            disabled={!selectedNode}
            onClick={resetSelectedTransform}
          >
            重置组件
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

          <div className="panel-title section-title">节点操作</div>
          <div className="action-grid">
            <button
              type="button"
              disabled={!selectedNode}
              onClick={duplicateSelectedNode}
            >
              复制
            </button>
            <button
              type="button"
              disabled={!selectedNode}
              onClick={deleteSelectedNode}
            >
              删除
            </button>
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
            <strong>M2 当前能力</strong>
            <span>场景 JSON 是持久化真相</span>
            <span>编辑和预览共用渲染器</span>
            <span>添加、复制和删除节点</span>
            <span>导入、导出和本地恢复</span>
          </div>
        </aside>

        <section className="canvas-area" aria-label="SCADA 编辑画布">
          <div className="canvas-toolbar">
            <span>{scene.name} / {scene.nodes.length} nodes</span>
            <span>所有编辑结果实时写回 SceneDocument</span>
          </div>
          <SceneRenderer
            scene={scene}
            mode={mode}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onTransformNode={updateNodeTransform}
          />
        </section>

        <aside className="property-panel">
          <div className="panel-title">节点属性</div>
          {selectedNode ? (
            <>
              <label className="property-field">
                <span>名称</span>
                <input
                  value={selectedNode.name}
                  onChange={(event) => {
                    const name = event.target.value
                    updateNode(selectedNode.id, (node) => ({ ...node, name }))
                  }}
                />
              </label>

              <div className="panel-title section-title">模拟状态</div>
              <div className="state-list">
                {pumpStates.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`state-button${selectedNode.props.state === item.id ? ' active' : ''}`}
                    aria-pressed={selectedNode.props.state === item.id}
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

              <div className="property-summary">
                <div>
                  <span>节点 ID</span>
                  <code>{selectedNode.id.slice(0, 18)}…</code>
                </div>
                <div>
                  <span>组件类型</span>
                  <code>{selectedNode.type}</code>
                </div>
                <div>
                  <span>运行状态</span>
                  <code>{selectedNode.props.state}</code>
                </div>
                <div>
                  <span>场景版本</span>
                  <code>v{scene.version}</code>
                </div>
              </div>
            </>
          ) : (
            <p className="empty-selection">
              在编辑模式下点击组件以查看和修改属性。
            </p>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App
