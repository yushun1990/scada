from pathlib import Path


def replace_block(text: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError(f"{label}: start marker not found")
    end = text.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f"{label}: end marker not found")
    return text[:start] + replacement + text[end:]


app_path = Path('src/App.tsx')
app = app_path.read_text()

canvas_toolbar = '''          <div className="canvas-toolbar">
            <div className="canvas-tool-strip" role="toolbar" aria-label="视图与网格">
              <div className="canvas-tool-group view-tool-group">
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
          </div>
'''
app = replace_block(
    app,
    '          <div className="canvas-toolbar">',
    '          <SceneRenderer',
    canvas_toolbar,
    'canvas toolbar',
)

inspector = '''        <aside className="property-panel">
          <section className="base-inspector" aria-label="基础操作">
            <div className="inspector-section-header">
              <div>
                <strong>基础</strong>
                <span>
                  {selectedConnection
                    ? '连线操作'
                    : selectedNodes.length > 0
                      ? `${selectedNodes.length} 个对象`
                      : '未选择对象'}
                </span>
              </div>
            </div>

            <div className="base-operation-list">
              <fieldset className="inspector-group">
                <legend>操作</legend>
                <div className="base-command-row" role="toolbar" aria-label="对象操作">
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
              </fieldset>

              <fieldset className="inspector-group">
                <legend>对齐与分布</legend>
                <div className="base-align-grid">
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
              </fieldset>
            </div>
          </section>

          <section className="semantic-inspector" aria-label="对象配置">
            <div className="inspector-tabs" role="tablist" aria-label="对象配置检查器">
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
              <div className="property-section-list">
                <fieldset className="inspector-group">
                  <legend>标识与路径</legend>
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
            )}

            {inspectorTab === 'properties' && !selectedConnection && selectedNodes.length === 0 && (
              <div className="scene-inspector-summary">
                <div><span>场景</span><code>{scene.name}</code></div>
                <div><span>尺寸</span><code>{scene.width} × {scene.height}</code></div>
                <div><span>背景</span><code>{scene.background}</code></div>
                <div><span>扩展</span><code>组件越界时自动向右/向下扩展</code></div>
              </div>
            )}

            {inspectorTab === 'properties' && !selectedConnection && selectedNodes.length > 1 && (
              <div className="property-section-list">
                <fieldset className="inspector-group">
                  <legend>批量属性</legend>
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

                {selectedPumpNodes.length > 0 && (
                  <fieldset className="inspector-group">
                    <legend>组件状态</legend>
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
                  </fieldset>
                )}
              </div>
            )}

            {inspectorTab === 'properties' && !selectedConnection && primaryNode && (
              <div className="property-section-list">
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

                {selectedPumpNodes.length > 0 && (
                  <fieldset className="inspector-group">
                    <legend>组件状态</legend>
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
                  </fieldset>
                )}
              </div>
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
'''
app = replace_block(
    app,
    '        <aside className="property-panel">',
    '      </main>',
    inspector,
    'property panel',
)
app_path.write_text(app)

renderer_path = Path('src/renderer/SceneRenderer.tsx')
renderer = renderer_path.read_text()
status_start = renderer.index('      <div className="canvas-status">')
status_end = renderer.index('    </div>\n  )\n}', status_start)
status = '''      <div className="canvas-status">
        <span className="canvas-status-group">
          <span>
            {mode === 'preview'
              ? '预览'
              : connectionSessionRef.current
                ? '连线'
                : '选择'}
          </span>
          <span ref={pointerStatusRef} className="pointer-position">X —  Y —</span>
          {selectedConnectionId ? (
            <code>{selectedConnection?.routing ?? 'connection'} · 端点可重连</code>
          ) : selectedNodeIds.length > 1 ? (
            <code>{selectedNodeIds.length} 个对象</code>
          ) : primaryNode ? (
            <code>
              {isGroupNode(primaryNode) ? '组合 · ' : ''}
              {Math.round(primaryNode.transform.width)} ×{' '}
              {Math.round(primaryNode.transform.height)} /{' '}
              {Math.round(primaryNode.transform.rotation)}°
            </code>
          ) : null}
        </span>
        <span className="canvas-status-group scene-status-summary">
          <span className="zoom-status">{Math.round(viewportTransform.scale * 100)}%</span>
          <strong>{scene.name}</strong>
          <span>{scene.width} × {scene.height}</span>
          <span>{scene.nodes.length} 个组件</span>
          <span>{scene.connections.length} 条连线</span>
        </span>
      </div>
'''
renderer = renderer[:status_start] + status + renderer[status_end:]
renderer_path.write_text(renderer)

css_path = Path('src/workbench.css')
css = css_path.read_text()
css += '''

/* Inspector hierarchy refinement */
.canvas-toolbar {
  display: flex;
  min-height: 43px;
  padding: 6px 10px;
  justify-content: flex-end;
}

.canvas-tool-strip {
  flex: 0 0 auto;
}

.property-panel {
  display: block;
  overflow-y: auto;
  background: #f8fafc;
}

.base-inspector {
  min-height: 0;
  padding: 13px;
  overflow: visible;
  border-bottom: 1px solid #cbd5e1;
}

.base-operation-list,
.property-section-list {
  display: grid;
  gap: 10px;
}

.base-align-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.base-align-grid button {
  min-height: 29px;
  padding: 0 4px;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  color: #475569;
  background: #ffffff;
  cursor: pointer;
  font-size: 10px;
}

.base-align-grid button:hover:not(:disabled) {
  border-color: #93c5fd;
  color: #1d4ed8;
  background: #eff6ff;
}

.base-align-grid button:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.semantic-inspector {
  display: block;
  min-height: 0;
  padding: 13px;
  overflow: visible;
}

.semantic-inspector .inspector-tabs {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  position: sticky;
  top: 0;
  z-index: 2;
  margin: 0 0 12px;
  background: #eef2f6;
}

.scene-status-summary {
  margin-left: auto;
  white-space: nowrap;
}

.scene-status-summary strong {
  color: #1e293b;
  font-size: 10px;
}

@media (max-width: 1120px) {
  .scene-status-summary span:nth-last-child(-n + 2) {
    display: none;
  }
}
'''
css_path.write_text(css)
