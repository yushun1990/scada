import { useState } from 'react'
import type { PumpState } from './assets/pump'
import { PumpStage, type EditorMode } from './editor/PumpStage'

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

function App() {
  const [mode, setMode] = useState<EditorMode>('editor')
  const [pumpState, setPumpState] = useState<PumpState>('green')
  const [resetToken, setResetToken] = useState(0)

  return (
    <div className="editor-shell">
      <header className="editor-header">
        <div className="brand-block">
          <strong>SCADA Editor Lab</strong>
          <span>M1 · Konva 多状态图片组件</span>
        </div>

        <div className="header-actions">
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
              onClick={() => setMode('preview')}
            >
              预览
            </button>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => setResetToken((value) => value + 1)}
          >
            重置位置
          </button>
        </div>
      </header>

      <main className="editor-main">
        <aside className="component-panel">
          <div className="panel-title">组件</div>
          <button className="component-item active" type="button">
            <span className="component-icon">P</span>
            <span>
              <strong>潜水泵</strong>
              <small>Konva Image Group</small>
            </span>
          </button>

          <div className="milestone-card">
            <strong>M1 验证范围</strong>
            <span>Group 整体选择</span>
            <span>拖动、缩放、旋转</span>
            <span>五种状态图片切换</span>
            <span>编辑与预览隔离</span>
          </div>
        </aside>

        <section className="canvas-area" aria-label="SCADA 编辑画布">
          <div className="canvas-toolbar">
            <span>设备场景 / pump-lab</span>
            <span>拖动组件，使用控制点缩放或旋转</span>
          </div>
          <PumpStage mode={mode} pumpState={pumpState} resetToken={resetToken} />
        </section>

        <aside className="property-panel">
          <div className="panel-title">模拟状态</div>
          <p className="panel-description">
            当前使用五个图片源作为同一个组件的互斥状态层。切换状态不会改变组件的位置和变换。
          </p>

          <div className="state-list">
            {pumpStates.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`state-button${pumpState === item.id ? ' active' : ''}`}
                aria-pressed={pumpState === item.id}
                onClick={() => setPumpState(item.id)}
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
              <span>组件类型</span>
              <code>pump.submersible</code>
            </div>
            <div>
              <span>运行状态</span>
              <code>{pumpState}</code>
            </div>
            <div>
              <span>资源策略</span>
              <code>cached image layers</code>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default App
