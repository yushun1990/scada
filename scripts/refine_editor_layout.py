from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, new: str, label: str) -> str:
    start_index = text.index(start)
    end_index = text.index(end, start_index) + len(end)
    if start_index < 0 or end_index < 0:
        raise RuntimeError(f"{label}: markers not found")
    return text[:start_index] + new + text[end_index:]


app_path = Path("src/App.tsx")
app = app_path.read_text()

app = replace_once(
    app,
    "import { parseSceneDocument } from './scene/validation'",
    "import {\n  applyTransformsAndExpandScene,\n  expandSceneToContainNodes,\n} from './scene/scene-bounds'\nimport { parseSceneDocument } from './scene/validation'",
    "scene bounds import",
)
app = replace_once(
    app,
    "type InspectorTab = 'base' | 'properties' | 'actions' | 'events'",
    "type InspectorTab = 'properties' | 'actions' | 'events'",
    "inspector tab type",
)
app = app.replace("  const [connectionMode, setConnectionMode] = useState(false)\n", "")
app = app.replace("  const [panMode, setPanMode] = useState(false)\n", "")
app = replace_once(
    app,
    "  const [message, setMessage] = useState('M0/M1.1 编辑器工作台与视口导航已启用')",
    "  const [message, setMessage] = useState('编辑器布局与自动连线已启用')",
    "message state",
)
app = replace_once(
    app,
    "  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('base')",
    "  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('properties')",
    "inspector initial tab",
)
app = replace_once(
    app,
    """    setScene((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        updates[node.id]
          ? { ...node, transform: updates[node.id] }
          : node,
      ),
    }))""",
    """    setScene((current) => applyTransformsAndExpandScene(current, updates))""",
    "transform expansion",
)
app = replace_once(
    app,
    "    setScene(result.scene)\n    setSelectedNodeIds(result.rootIds)",
    "    setScene(expandSceneToContainNodes(result.scene))\n    setSelectedNodeIds(result.rootIds)",
    "duplicate expansion",
)
app = app.replace("    setInspectorTab('base')\n", "")
app = app.replace("      setConnectionMode(false)\n", "")
app = app.replace("                setConnectionMode(false)\n", "")

function_start = "  function activateSelectTool() {"
function_end = "  const commonVisible ="
function_start_index = app.index(function_start)
function_end_index = app.index(function_end, function_start_index)
app = app[:function_start_index] + app[function_end_index:]

new_header = '''      <header className="editor-header">
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
      </header>'''
app = replace_between(
    app,
    '      <header className="editor-header">',
    '      </header>',
    new_header,
    "header",
)

new_left_panel = '''        <aside className="component-panel">
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
        </aside>'''
left_start = app.index('        <aside className="component-panel">')
left_end = app.index('        </aside>', left_start) + len('        </aside>')
app = app[:left_start] + new_left_panel + app[left_end:]

canvas_toolbar_start = app.index('          <div className="canvas-toolbar">')
canvas_renderer_start = app.index('          <SceneRenderer', canvas_toolbar_start)
new_canvas_toolbar = '''          <div className="canvas-toolbar">
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
'''
app = app[:canvas_toolbar_start] + new_canvas_toolbar + app[canvas_renderer_start:]
app = app.replace("            connectionMode={connectionMode}\n", "")
app = app.replace("            panMode={panMode}\n", "")

new_property_panel = '''        <aside className="property-panel">
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
        </aside>'''
property_start = app.index('        <aside className="property-panel">')
property_end = app.index('        </aside>\n      </main>', property_start) + len('        </aside>')
app = app[:property_start] + new_property_panel + app[property_end:]

if "connectionMode" in app or "panMode" in app or "activateConnectionTool" in app:
    raise RuntimeError("App still contains removed mode state")

app_path.write_text(app)

renderer_path = Path("src/renderer/SceneRenderer.tsx")
renderer = renderer_path.read_text()
renderer = renderer.replace("  connectionMode: boolean\n", "")
renderer = renderer.replace("  panMode: boolean\n", "")
renderer = renderer.replace("  connectionMode,\n", "")
renderer = renderer.replace("  panMode,\n", "")

connection_effect = '''  useEffect(() => {
    if (connectionMode) {
      return
    }

    cancelScheduledConnectionPreview()
    connectionSessionRef.current = null
    setHoveredPort(null)
    hideConnectionPreview()
  }, [connectionMode])

'''
renderer = renderer.replace(connection_effect, "")
renderer = renderer.replace("        setStageCursor(panMode ? 'grab' : 'default')", "        setStageCursor('default')")
renderer = renderer.replace("  }, [panMode])", "  }, [])")
renderer = renderer.replace(
    "    return panMode || spacePressedRef.current || mouseEvent.button === 1",
    "    return spacePressedRef.current || mouseEvent.button === 1",
)
renderer = renderer.replace(
    "    setStageCursor(panMode || spacePressedRef.current ? 'grab' : 'default')",
    "    setStageCursor(spacePressedRef.current ? 'grab' : 'default')",
)
renderer = renderer.replace(
    "    if (!connectionMode && !reconnectSessionRef.current) {\n      return\n    }\n\n",
    "",
)
renderer = renderer.replace(
    "          (connectionMode || Boolean(reconnectSessionRef.current)),",
    "          (mode === 'editor' || Boolean(reconnectSessionRef.current)),",
)

renderer = replace_once(
    renderer,
    '''  function clearConnectionSession() {
    cancelScheduledConnectionPreview()
    connectionSessionRef.current = null
    hideConnectionPreview()
  }''',
    '''  function clearConnectionSession() {
    cancelScheduledConnectionPreview()
    connectionSessionRef.current = null

    for (const circle of portRefs.current.values()) {
      circle.opacity(0)
    }

    hideConnectionPreview()
  }''',
    "clear connection session",
)
renderer = replace_once(
    renderer,
    '''    connectionSessionRef.current = { source: endpoint }
    const points = getConnectionPreviewRoutePoints(scene, endpoint, point)''',
    '''    connectionSessionRef.current = { source: endpoint }

    for (const circle of portRefs.current.values()) {
      circle.visible(true)
      circle.listening(true)
      circle.opacity(0.55)
    }

    const points = getConnectionPreviewRoutePoints(scene, endpoint, point)''',
    "show connection targets",
)
renderer = replace_once(
    renderer,
    '''    target.radius(9)
    target.strokeWidth(3)
    setStageCursor('crosshair')''',
    '''    target.radius(9 / viewportTransformRef.current.scale)
    target.strokeWidth(3 / viewportTransformRef.current.scale)
    target.opacity(1)
    setStageCursor('crosshair')''',
    "port enter",
)
renderer = replace_once(
    renderer,
    '''    target.radius(7)
    target.strokeWidth(2)
    setStageCursor('default')''',
    '''    target.radius(7 / viewportTransformRef.current.scale)
    target.strokeWidth(2 / viewportTransformRef.current.scale)
    target.opacity(connectionSessionRef.current ? 0.55 : 0)
    setStageCursor('default')''',
    "port leave",
)

restore_start = renderer.index('  function restorePortPresentation() {')
restore_end = renderer.index('  function updateReconnectCandidateHighlight(', restore_start)
new_restore = '''  function restorePortPresentation() {
    for (const [key, circle] of portRefs.current) {
      const endpoint = endpointFromPortKey(key)
      const node = endpoint
        ? scene.nodes.find((candidate) => candidate.id === endpoint.nodeId)
        : null

      circle.visible(
        Boolean(
          mode === 'editor' &&
            node &&
            isNodeEffectivelyVisible(scene, node),
        ),
      )
      circle.listening(mode === 'editor')
      circle.opacity(0)
      circle.radius(7 / viewportTransformRef.current.scale)
      circle.stroke('#ffffff')
      circle.strokeWidth(2 / viewportTransformRef.current.scale)
    }
  }

'''
renderer = renderer[:restore_start] + new_restore + renderer[restore_end:]

renderer = replace_once(
    renderer,
    '''          if (connectionMode && portEndpoint) {
            beginConnection(portEndpoint)
            return
          }''',
    '''          if (portEndpoint) {
            beginConnection(portEndpoint)
            return
          }''',
    "automatic port connection",
)
renderer = renderer.replace("          setStageCursor(panMode ? 'grab' : 'default')", "          setStageCursor('default')")
renderer = renderer.replace("                    visible={connectionMode}\n                    listening={connectionMode}", "                    visible={mode === 'editor'}\n                    listening={mode === 'editor'}\n                    opacity={0}")
renderer = renderer.replace(
    "              : panMode\n                ? '平移'\n                : connectionMode\n                  ? '连线'\n                  : '选择'}",
    "              : connectionSessionRef.current\n                ? '连线'\n                : '选择'}",
)

if "connectionMode" in renderer or "panMode" in renderer:
    raise RuntimeError("Renderer still contains removed mode props")

renderer_path.write_text(renderer)
