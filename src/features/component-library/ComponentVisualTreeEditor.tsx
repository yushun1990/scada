import { useEffect, useMemo, useState } from 'react'
import {
  type ComponentVisualDefinition,
  type ComponentVisualLayer,
  type VisualLayerKind,
  type VisualVectorPrimitive,
} from '../../component-system/visual'

type ComponentVisualTreeEditorProps = {
  visual: ComponentVisualDefinition
  readOnly: boolean
  componentTitle: string
  designWidth: number
  designHeight: number
  onChange: (visual: ComponentVisualDefinition) => void
}

type FlatLayer = {
  layer: ComponentVisualLayer
  depth: number
}

const LAYER_KIND_LABELS: Array<[VisualLayerKind, string]> = [
  ['group', 'Group'],
  ['svg', 'SVG'],
  ['image', '位图'],
  ['vector', '矢量图形'],
  ['text', '文本'],
]

const VECTOR_PRIMITIVES: Array<[VisualVectorPrimitive, string]> = [
  ['rect', '矩形'],
  ['circle', '圆形'],
  ['ellipse', '椭圆'],
  ['line', '线'],
  ['path', 'Path'],
]

function layerKindLabel(kind: VisualLayerKind) {
  return LAYER_KIND_LABELS.find(([candidate]) => candidate === kind)?.[1] ?? kind
}

function nextLayerId(kind: VisualLayerKind, layers: readonly ComponentVisualLayer[]) {
  const ids = new Set(layers.map((layer) => layer.id))
  let index = 1
  while (ids.has(`${kind}${index}`)) index += 1
  return `${kind}${index}`
}

function createLayer(
  kind: VisualLayerKind,
  id: string,
  parentId: string | null,
): ComponentVisualLayer {
  const base = {
    id,
    name: `${layerKindLabel(kind)} ${id.replace(/\D+/g, '') || ''}`.trim(),
    kind,
    parentId,
    transform: {
      x: 0,
      y: 0,
      width: 64,
      height: 64,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    visible: true,
    opacity: 1,
  }

  if (kind === 'svg') return { ...base, kind, assetRef: '' }
  if (kind === 'image') return { ...base, kind, assetRef: '' }
  if (kind === 'vector') return { ...base, kind, primitive: 'rect' }
  if (kind === 'text') return { ...base, kind, text: 'Text' }
  return { ...base, kind: 'group' }
}

function flattenLayers(layers: readonly ComponentVisualLayer[]) {
  const byParent = new Map<string | null, ComponentVisualLayer[]>()

  for (const layer of layers) {
    const siblings = byParent.get(layer.parentId) ?? []
    siblings.push(layer)
    byParent.set(layer.parentId, siblings)
  }

  const result: FlatLayer[] = []
  const visit = (parentId: string | null, depth: number) => {
    for (const layer of byParent.get(parentId) ?? []) {
      result.push({ layer, depth })
      visit(layer.id, depth + 1)
    }
  }

  visit(null, 0)
  return result
}

function collectDescendantIds(
  layers: readonly ComponentVisualLayer[],
  rootId: string,
) {
  const ids = new Set<string>()
  const queue = [rootId]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || ids.has(current)) continue

    ids.add(current)
    for (const layer of layers) {
      if (layer.parentId === current) queue.push(layer.id)
    }
  }

  return ids
}

function replaceLayer(
  layers: readonly ComponentVisualLayer[],
  layerId: string,
  nextLayer: ComponentVisualLayer,
) {
  return layers.map((layer) => layer.id === layerId ? nextLayer : layer)
}

function LayerIdInput({
  value,
  disabled,
  onCommit,
}: {
  value: string
  disabled: boolean
  onCommit: (nextId: string) => void
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      disabled={disabled}
      onBlur={(event) => onCommit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

export function ComponentVisualTreeEditor({
  visual,
  readOnly,
  componentTitle,
  designWidth,
  designHeight,
  onChange,
}: ComponentVisualTreeEditorProps) {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    visual.layers[0]?.id ?? null,
  )
  const [addKind, setAddKind] = useState<VisualLayerKind>('group')

  useEffect(() => {
    if (selectedLayerId && !visual.layers.some((layer) => layer.id === selectedLayerId)) {
      setSelectedLayerId(visual.layers[0]?.id ?? null)
    }
  }, [selectedLayerId, visual.layers])

  const flattened = useMemo(() => flattenLayers(visual.layers), [visual.layers])
  const selectedLayer = visual.layers.find((layer) => layer.id === selectedLayerId) ?? null
  const selectedDescendantIds = selectedLayer
    ? collectDescendantIds(visual.layers, selectedLayer.id)
    : new Set<string>()
  const parentOptions = visual.layers.filter(
    (layer) =>
      layer.kind === 'group' &&
      (!selectedLayer || !selectedDescendantIds.has(layer.id)),
  )
  const artboardScale = Math.min(
    1,
    420 / Math.max(1, designWidth),
    320 / Math.max(1, designHeight),
  )

  function updateLayers(layers: readonly ComponentVisualLayer[]) {
    onChange({ ...visual, layers })
  }

  function updateSelected(nextLayer: ComponentVisualLayer) {
    if (!selectedLayer) return
    updateLayers(replaceLayer(visual.layers, selectedLayer.id, nextLayer))
  }

  function addLayer() {
    if (readOnly || visual.mode !== 'composite') return

    const id = nextLayerId(addKind, visual.layers)
    const parentId = selectedLayer?.kind === 'group'
      ? selectedLayer.id
      : selectedLayer?.parentId ?? null
    const layer = createLayer(addKind, id, parentId)

    updateLayers([...visual.layers, layer])
    setSelectedLayerId(id)
  }

  function removeSelected() {
    if (!selectedLayer || readOnly) return

    const deleted = collectDescendantIds(visual.layers, selectedLayer.id)
    const nextLayers = visual.layers.filter((layer) => !deleted.has(layer.id))
    updateLayers(nextLayers)
    setSelectedLayerId(
      nextLayers.find((layer) => layer.parentId === selectedLayer.parentId)?.id ??
      nextLayers[0]?.id ??
      null,
    )
  }

  function renameSelected(nextValue: string) {
    if (!selectedLayer || readOnly) return

    const nextId = nextValue.trim()
    if (
      !nextId ||
      nextId === selectedLayer.id ||
      visual.layers.some((layer) => layer.id === nextId)
    ) {
      return
    }

    const previousId = selectedLayer.id
    const nextLayers = visual.layers.map((layer) => {
      if (layer.id === previousId) {
        return { ...layer, id: nextId } as ComponentVisualLayer
      }
      if (layer.parentId === previousId) {
        return { ...layer, parentId: nextId } as ComponentVisualLayer
      }
      return layer
    })

    updateLayers(nextLayers)
    setSelectedLayerId(nextId)
  }

  function moveSelected(direction: -1 | 1) {
    if (!selectedLayer || readOnly) return

    const siblings = visual.layers.filter(
      (layer) => layer.parentId === selectedLayer.parentId,
    )
    const siblingIndex = siblings.findIndex((layer) => layer.id === selectedLayer.id)
    const targetSibling = siblings[siblingIndex + direction]
    if (!targetSibling) return

    const currentIndex = visual.layers.findIndex((layer) => layer.id === selectedLayer.id)
    const targetIndex = visual.layers.findIndex((layer) => layer.id === targetSibling.id)
    const nextLayers = [...visual.layers]
    nextLayers[currentIndex] = targetSibling
    nextLayers[targetIndex] = selectedLayer
    updateLayers(nextLayers)
  }

  function updateTransform(
    field: keyof ComponentVisualLayer['transform'],
    value: number,
  ) {
    if (!selectedLayer || !Number.isFinite(value)) return

    updateSelected({
      ...selectedLayer,
      transform: { ...selectedLayer.transform, [field]: value },
    } as ComponentVisualLayer)
  }

  if (visual.mode === 'native') {
    return (
      <section className="component-workspace-card native-visual-card">
        <div className="component-form-heading">
          <span>PRIVATE VISUAL / NATIVE</span>
          <h1>Native 视觉实现</h1>
          <p>这个内置组件由可信 Renderer 实现。Workbench 只展示公开契约，不反向解析 React / Konva 内部结构。</p>
        </div>
        <div className="component-readonly-note">
          Native component 不保存 Composite Layer Tree。
        </div>
      </section>
    )
  }

  return (
    <section className="component-visual-workbench" aria-label="组件视觉设计">
      <aside className="visual-layers-pane">
        <div className="workbench-pane-heading">
          <div>
            <strong>Layers</strong>
            <span>{visual.layers.length} 个图层</span>
          </div>
        </div>

        <div className="visual-add-row">
          <select
            aria-label="新增图层类型"
            value={addKind}
            disabled={readOnly}
            onChange={(event) => setAddKind(event.target.value as VisualLayerKind)}
          >
            {LAYER_KIND_LABELS.map(([kind, label]) => (
              <option key={kind} value={kind}>{label}</option>
            ))}
          </select>
          <button type="button" disabled={readOnly} onClick={addLayer}>＋</button>
        </div>

        <div className="visual-tree-panel">
          {flattened.map(({ layer, depth }) => (
            <button
              key={layer.id}
              type="button"
              className={`visual-tree-row${selectedLayerId === layer.id ? ' active' : ''}`}
              style={{ paddingLeft: `${10 + depth * 15}px` }}
              onClick={() => setSelectedLayerId(layer.id)}
            >
              <span className="visual-layer-disclosure">
                {layer.kind === 'group' ? '▾' : '·'}
              </span>
              <span className="visual-layer-kind">{layerKindLabel(layer.kind)}</span>
              <span className="visual-layer-name">{layer.name}</span>
              {!layer.visible && <small>隐藏</small>}
            </button>
          ))}
          {flattened.length === 0 && (
            <div className="visual-tree-empty">
              从 Group、SVG、位图、矢量图形或文本开始构建组件。
            </div>
          )}
        </div>

        <div className="visual-layers-help">
          选中 Group 后新增图层会自动成为它的子层；同级顺序即 z-order。
        </div>
      </aside>

      <div className="visual-canvas-pane">
        <div className="visual-canvas-toolbar">
          <div>
            <strong>组件画布</strong>
            <span>{designWidth} × {designHeight}</span>
          </div>
          <span className="visual-canvas-badge">Renderer 接入 M6.3</span>
        </div>

        <div className="visual-canvas-stage">
          <div
            className="visual-canvas-artboard"
            style={{
              width: `${designWidth * artboardScale}px`,
              height: `${designHeight * artboardScale}px`,
            }}
          >
            <div className="visual-canvas-placeholder">
              <strong>{componentTitle}</strong>
              <span>Composite Visual</span>
              {selectedLayer ? (
                <small>当前图层：{selectedLayer.name} · {layerKindLabel(selectedLayer.kind)}</small>
              ) : (
                <small>从左侧选择或添加一个图层</small>
              )}
            </div>
          </div>
        </div>

        <div className="visual-canvas-footer">
          这一刀先固定 Workbench 的空间模型；真实 SVG / 位图 / Vector / Text 渲染将在 M6.3 接入同一画布。
        </div>
      </div>

      <aside className="visual-inspector-pane">
        <div className="workbench-pane-heading">
          <div>
            <strong>Inspector</strong>
            <span>{selectedLayer ? `${layerKindLabel(selectedLayer.kind)} · ${selectedLayer.id}` : '未选择图层'}</span>
          </div>
        </div>

        {!selectedLayer && (
          <div className="visual-tree-empty">选择左侧图层后，在这里编辑它的局部属性。</div>
        )}

        {selectedLayer && (
          <div className="visual-layer-inspector">
            <div className="visual-layer-inspector-head">
              <div>
                <strong>{selectedLayer.name}</strong>
                <span>{selectedLayer.id}</span>
              </div>
              {!readOnly && (
                <div className="visual-layer-actions">
                  <button type="button" onClick={() => moveSelected(-1)}>↑</button>
                  <button type="button" onClick={() => moveSelected(1)}>↓</button>
                  <button type="button" className="danger" onClick={removeSelected}>删除</button>
                </div>
              )}
            </div>

            <div className="visual-inspector-section">
              <h3>标识与层级</h3>
              <label>
                <span>ID</span>
                <LayerIdInput
                  value={selectedLayer.id}
                  disabled={readOnly}
                  onCommit={renameSelected}
                />
              </label>
              <label>
                <span>名称</span>
                <input
                  value={selectedLayer.name}
                  disabled={readOnly}
                  onChange={(event) => updateSelected({
                    ...selectedLayer,
                    name: event.target.value,
                  } as ComponentVisualLayer)}
                />
              </label>
              <label>
                <span>父级</span>
                <select
                  value={selectedLayer.parentId ?? ''}
                  disabled={readOnly}
                  onChange={(event) => updateSelected({
                    ...selectedLayer,
                    parentId: event.target.value || null,
                  } as ComponentVisualLayer)}
                >
                  <option value="">Visual Root</option>
                  {parentOptions.map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="visual-inspector-section">
              <h3>几何</h3>
              <div className="visual-transform-grid">
                {([
                  ['x', 'X'],
                  ['y', 'Y'],
                  ['width', '宽'],
                  ['height', '高'],
                  ['rotation', '旋转'],
                  ['scaleX', 'Scale X'],
                  ['scaleY', 'Scale Y'],
                ] as Array<[keyof ComponentVisualLayer['transform'], string]>).map(([field, label]) => (
                  <label key={field}>
                    <span>{label}</span>
                    <input
                      type="number"
                      step={field.startsWith('scale') ? '0.1' : '1'}
                      value={selectedLayer.transform[field]}
                      disabled={readOnly}
                      onChange={(event) => updateTransform(field, Number(event.target.value))}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="visual-inspector-section">
              <h3>显示</h3>
              <label className="contract-checkbox">
                <input
                  type="checkbox"
                  checked={selectedLayer.visible}
                  disabled={readOnly}
                  onChange={(event) => updateSelected({
                    ...selectedLayer,
                    visible: event.target.checked,
                  } as ComponentVisualLayer)}
                />
                <span>可见</span>
              </label>
              <label>
                <span>透明度</span>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedLayer.opacity}
                  disabled={readOnly}
                  onChange={(event) => updateSelected({
                    ...selectedLayer,
                    opacity: Number(event.target.value),
                  } as ComponentVisualLayer)}
                />
              </label>
            </div>

            {(selectedLayer.kind === 'svg' || selectedLayer.kind === 'image') && (
              <div className="visual-inspector-section">
                <h3>资源</h3>
                <label>
                  <span>资源引用</span>
                  <input
                    value={selectedLayer.assetRef}
                    disabled={readOnly}
                    placeholder={selectedLayer.kind === 'svg'
                      ? 'assets/pump-body.svg'
                      : 'assets/vendor-logo.png'}
                    onChange={(event) => updateSelected({
                      ...selectedLayer,
                      assetRef: event.target.value,
                    })}
                  />
                </label>
                <small>当前只保存 assetRef；资源上传/管理将在后续切片接入。</small>
              </div>
            )}

            {selectedLayer.kind === 'vector' && (
              <div className="visual-inspector-section">
                <h3>矢量图形</h3>
                <label>
                  <span>图元</span>
                  <select
                    value={selectedLayer.primitive}
                    disabled={readOnly}
                    onChange={(event) => updateSelected({
                      ...selectedLayer,
                      primitive: event.target.value as VisualVectorPrimitive,
                      pathData: event.target.value === 'path'
                        ? selectedLayer.pathData ?? ''
                        : undefined,
                    })}
                  >
                    {VECTOR_PRIMITIVES.map(([primitive, label]) => (
                      <option key={primitive} value={primitive}>{label}</option>
                    ))}
                  </select>
                </label>
                {selectedLayer.primitive === 'path' && (
                  <label>
                    <span>Path Data</span>
                    <textarea
                      rows={4}
                      value={selectedLayer.pathData ?? ''}
                      disabled={readOnly}
                      onChange={(event) => updateSelected({
                        ...selectedLayer,
                        pathData: event.target.value,
                      })}
                    />
                  </label>
                )}
              </div>
            )}

            {selectedLayer.kind === 'text' && (
              <div className="visual-inspector-section">
                <h3>文本</h3>
                <label>
                  <span>内容</span>
                  <textarea
                    rows={4}
                    value={selectedLayer.text}
                    disabled={readOnly}
                    onChange={(event) => updateSelected({
                      ...selectedLayer,
                      text: event.target.value,
                    })}
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </aside>
    </section>
  )
}
