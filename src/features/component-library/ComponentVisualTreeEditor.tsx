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

  while (ids.has(`${kind}${index}`)) {
    index += 1
  }

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

  if (kind === 'svg') {
    return { ...base, kind, assetRef: '' }
  }

  if (kind === 'image') {
    return { ...base, kind, assetRef: '' }
  }

  if (kind === 'vector') {
    return { ...base, kind, primitive: 'rect' }
  }

  if (kind === 'text') {
    return { ...base, kind, text: 'Text' }
  }

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

    if (!current || ids.has(current)) {
      continue
    }

    ids.add(current)

    for (const layer of layers) {
      if (layer.parentId === current) {
        queue.push(layer.id)
      }
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
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function ComponentVisualTreeEditor({
  visual,
  readOnly,
  onChange,
}: ComponentVisualTreeEditorProps) {
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    visual.layers[0]?.id ?? null,
  )
  const [addKind, setAddKind] = useState<VisualLayerKind>('group')

  useEffect(() => {
    if (
      selectedLayerId &&
      !visual.layers.some((layer) => layer.id === selectedLayerId)
    ) {
      setSelectedLayerId(visual.layers[0]?.id ?? null)
    }
  }, [selectedLayerId, visual.layers])

  const flattened = useMemo(() => flattenLayers(visual.layers), [visual.layers])
  const selectedLayer = visual.layers.find(
    (layer) => layer.id === selectedLayerId,
  ) ?? null
  const selectedDescendantIds = selectedLayer
    ? collectDescendantIds(visual.layers, selectedLayer.id)
    : new Set<string>()
  const parentOptions = visual.layers.filter(
    (layer) =>
      layer.kind === 'group' &&
      (!selectedLayer || !selectedDescendantIds.has(layer.id)),
  )

  function updateLayers(layers: readonly ComponentVisualLayer[]) {
    onChange({ ...visual, layers })
  }

  function updateSelected(nextLayer: ComponentVisualLayer) {
    if (!selectedLayer) return
    updateLayers(replaceLayer(visual.layers, selectedLayer.id, nextLayer))
  }

  function addLayer() {
    if (readOnly || visual.mode !== 'composite') {
      return
    }

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
    const siblingIndex = siblings.findIndex(
      (layer) => layer.id === selectedLayer.id,
    )
    const targetSibling = siblings[siblingIndex + direction]

    if (!targetSibling) return

    const currentIndex = visual.layers.findIndex(
      (layer) => layer.id === selectedLayer.id,
    )
    const targetIndex = visual.layers.findIndex(
      (layer) => layer.id === targetSibling.id,
    )
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
      transform: {
        ...selectedLayer.transform,
        [field]: value,
      },
    } as ComponentVisualLayer)
  }

  if (visual.mode === 'native') {
    return (
      <section className="component-visual-card">
        <div className="component-form-heading">
          <span>PRIVATE VISUAL</span>
          <h1>视觉实现</h1>
          <p>这个内置组件使用可信 Native Renderer。SCADA Workbench 仍然只消费它的公开契约。</p>
        </div>
        <div className="component-readonly-note">
          Native visual 不保存 composite Layer Tree；这里不会反向解析 React / Konva 实现。
        </div>
      </section>
    )
  }

  return (
    <section className="component-visual-card">
      <div className="component-form-heading">
        <span>PRIVATE VISUAL / LAYER TREE</span>
        <h1>视觉图层</h1>
        <p>SVG、位图、矢量图形、文本和 Group 可以混合嵌套。这里的图层全部是组件私有实现，不会直接暴露给 SCADA 组态用户。</p>
      </div>

      <div className="visual-editor-toolbar">
        <select
          value={addKind}
          disabled={readOnly}
          onChange={(event) => setAddKind(event.target.value as VisualLayerKind)}
        >
          {LAYER_KIND_LABELS.map(([kind, label]) => (
            <option key={kind} value={kind}>{label}</option>
          ))}
        </select>
        <button type="button" disabled={readOnly} onClick={addLayer}>+ 添加图层</button>
        <span>同一父级的列表顺序即 z-order</span>
      </div>

      <div className="visual-editor-body">
        <div className="visual-tree-panel">
          {flattened.map(({ layer, depth }) => (
            <button
              key={layer.id}
              type="button"
              className={`visual-tree-row${selectedLayerId === layer.id ? ' active' : ''}`}
              style={{ paddingLeft: `${10 + depth * 16}px` }}
              onClick={() => setSelectedLayerId(layer.id)}
            >
              <span className="visual-layer-kind">{layerKindLabel(layer.kind)}</span>
              <span className="visual-layer-name">{layer.name}</span>
              {!layer.visible && <small>隐藏</small>}
            </button>
          ))}
          {flattened.length === 0 && (
            <div className="visual-tree-empty">
              还没有私有视觉图层。可以从 Group、SVG、位图、矢量图形或文本开始。
            </div>
          )}
        </div>

        <div className="visual-layer-inspector">
          {!selectedLayer && (
            <div className="visual-tree-empty">选择一个图层后编辑它的局部属性。</div>
          )}

          {selectedLayer && (
            <>
              <div className="visual-layer-inspector-head">
                <div>
                  <strong>{selectedLayer.name}</strong>
                  <span>{layerKindLabel(selectedLayer.kind)} · {selectedLayer.id}</span>
                </div>
                {!readOnly && (
                  <div className="visual-layer-actions">
                    <button type="button" onClick={() => moveSelected(-1)}>上移</button>
                    <button type="button" onClick={() => moveSelected(1)}>下移</button>
                    <button type="button" className="danger" onClick={removeSelected}>删除</button>
                  </div>
                )}
              </div>

              <div className="contract-grid contract-grid-three">
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

              <div className="visual-transform-grid">
                {([
                  ['x', 'X'],
                  ['y', 'Y'],
                  ['width', '宽度'],
                  ['height', '高度'],
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

              <div className="visual-state-row">
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
                <label className="contract-block-field">
                  <span>资源引用</span>
                  <input
                    value={selectedLayer.assetRef}
                    disabled={readOnly}
                    placeholder={selectedLayer.kind === 'svg' ? 'assets/pump-body.svg' : 'assets/vendor-logo.png'}
                    onChange={(event) => updateSelected({
                      ...selectedLayer,
                      assetRef: event.target.value,
                    })}
                  />
                  <small>M6.2 先保存 assetRef；真正的资源导入/管理在后续切片接入。</small>
                </label>
              )}

              {selectedLayer.kind === 'vector' && (
                <>
                  <label className="contract-block-field">
                    <span>矢量图元</span>
                    <select
                      value={selectedLayer.primitive}
                      disabled={readOnly}
                      onChange={(event) => updateSelected({
                        ...selectedLayer,
                        primitive: event.target.value as VisualVectorPrimitive,
                      })}
                    >
                      {VECTOR_PRIMITIVES.map(([primitive, label]) => (
                        <option key={primitive} value={primitive}>{label}</option>
                      ))}
                    </select>
                  </label>
                  {selectedLayer.primitive === 'path' && (
                    <label className="contract-block-field">
                      <span>Path data</span>
                      <textarea
                        rows={3}
                        value={selectedLayer.pathData ?? ''}
                        disabled={readOnly}
                        onChange={(event) => updateSelected({
                          ...selectedLayer,
                          pathData: event.target.value,
                        })}
                      />
                    </label>
                  )}
                </>
              )}

              {selectedLayer.kind === 'text' && (
                <label className="contract-block-field">
                  <span>文本内容</span>
                  <textarea
                    rows={3}
                    value={selectedLayer.text}
                    disabled={readOnly}
                    onChange={(event) => updateSelected({
                      ...selectedLayer,
                      text: event.target.value,
                    })}
                  />
                </label>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
