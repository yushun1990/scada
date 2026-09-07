import { useEffect, useMemo } from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import {
  type ComponentVisualDefinition,
  type ComponentVisualLayer,
  type VisualLayerKind,
  type VisualVectorPrimitive,
} from '../../component-system/visual'
import {
  Button,
  Checkbox,
  IconButton,
  Input,
  NumberInput,
  Pressable,
  Select,
  Textarea,
} from '../../ui'
import { ComponentVisualAssetImportControl } from './ComponentVisualAssetImportControl'
import {
  clearComponentCreateTool,
  isDrawableVisualPrimitive,
  selectComponentCreateTool,
  useComponentCreateTool,
} from './component-create-mode'
import './component-visual-palette.css'
import './component-create-mode.css'

export type ComponentWorkbenchMode = 'editor' | 'preview'
export type ComponentLayerSelectionChange = (
  layerId: string | null,
  toggle?: boolean,
) => void

type ComponentVisualTreeEditorProps = {
  visual: ComponentVisualDefinition
  readOnly: boolean
  componentTitle: string
  selectedLayerIds: readonly string[]
  primaryLayerId: string | null
  onSelectionChange: ComponentLayerSelectionChange
  onChange: (visual: ComponentVisualDefinition) => void
}

type ComponentVisualCanvasProps = {
  visual: ComponentVisualDefinition
  componentTitle: string
  designWidth: number
  designHeight: number
  selectedLayerId: string | null
  mode: ComponentWorkbenchMode
}

type ComponentVisualLayerInspectorProps = {
  visual: ComponentVisualDefinition
  readOnly: boolean
  selectedLayerId: string
  onSelectionChange: ComponentLayerSelectionChange
  onChange: (visual: ComponentVisualDefinition) => void
}

type LayerInspectorContentProps = Omit<ComponentVisualLayerInspectorProps, 'selectedLayerId'> & {
  layer: ComponentVisualLayer
}

type FlatLayer = {
  layer: ComponentVisualLayer
  depth: number
}

type PalettePrimitive = {
  primitive: VisualVectorPrimitive
  label: string
  symbol: string
  width: number
  height: number
  pathData?: string
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

const VECTOR_PRIMITIVE_OPTIONS = VECTOR_PRIMITIVES.map(([value, label]) => ({ value, label }))

const PALETTE_PRIMITIVES: readonly PalettePrimitive[] = [
  { primitive: 'rect', label: '矩形', symbol: '□', width: 96, height: 64 },
  { primitive: 'circle', label: '圆形', symbol: '○', width: 72, height: 72 },
  { primitive: 'ellipse', label: '椭圆', symbol: '⬭', width: 100, height: 64 },
  { primitive: 'line', label: '线段', symbol: '╱', width: 120, height: 8 },
  {
    primitive: 'path',
    label: 'Path',
    symbol: '⌁',
    width: 96,
    height: 64,
    pathData: 'M 8 56 L 48 8 L 88 56 Z',
  },
]

export function layerKindLabel(kind: VisualLayerKind) {
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

function centerLayer(
  visual: ComponentVisualDefinition,
  layer: ComponentVisualLayer,
  width = layer.transform.width,
  height = layer.transform.height,
): ComponentVisualLayer {
  return {
    ...layer,
    transform: {
      ...layer.transform,
      x: Math.max(0, (visual.designSize.width - width) / 2),
      y: Math.max(0, (visual.designSize.height - height) / 2),
      width,
      height,
    },
  } as ComponentVisualLayer
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
    <Input
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
  selectedLayerIds,
  primaryLayerId,
  onSelectionChange,
  onChange,
}: ComponentVisualTreeEditorProps) {
  const createTool = useComponentCreateTool()
  const flattened = useMemo(() => flattenLayers(visual.layers), [visual.layers])
  const selectedLayerIdSet = useMemo(() => new Set(selectedLayerIds), [selectedLayerIds])
  const primaryLayer = visual.layers.find((layer) => layer.id === primaryLayerId) ?? null

  useEffect(() => {
    if (primaryLayerId && !primaryLayer) onSelectionChange(null)
  }, [onSelectionChange, primaryLayer, primaryLayerId])

  useEffect(() => {
    if (readOnly || visual.mode !== 'composite') clearComponentCreateTool()
  }, [readOnly, visual.mode])

  function appendLayer(layer: ComponentVisualLayer) {
    if (readOnly || visual.mode !== 'composite') return

    onChange({ ...visual, layers: [...visual.layers, layer] })
    onSelectionChange(layer.id)
  }

  function addPrimitive(item: PalettePrimitive) {
    if (isDrawableVisualPrimitive(item.primitive)) {
      selectComponentCreateTool({
        kind: 'vector',
        primitive: item.primitive,
        label: item.label,
        defaultWidth: item.width,
        defaultHeight: item.height,
      })
      return
    }

    clearComponentCreateTool()
    const id = nextLayerId('vector', visual.layers)
    const created = createLayer('vector', id, null)
    if (created.kind !== 'vector') return

    const layer = centerLayer(
      visual,
      {
        ...created,
        name: `${item.label} ${id.replace(/\D+/g, '') || ''}`.trim(),
        primitive: item.primitive,
        pathData: item.primitive === 'path' ? item.pathData ?? '' : undefined,
      },
      item.width,
      item.height,
    )
    appendLayer(layer)
  }

  function addText() {
    clearComponentCreateTool()
    const id = nextLayerId('text', visual.layers)
    const created = createLayer('text', id, null)
    if (created.kind !== 'text') return

    appendLayer(centerLayer(
      visual,
      { ...created, name: `文本 ${id.replace(/\D+/g, '') || ''}`.trim(), text: 'Text' },
      120,
      36,
    ))
  }

  function selectNavigatorLayer(layerId: string | null, toggle = false) {
    clearComponentCreateTool()
    onSelectionChange(layerId, toggle)
  }

  return (
    <div className="component-layer-dock">
      <section className="component-authoring-palette" aria-label="添加视觉元素">
        <div className="component-layer-dock-heading">
          <div>
            <strong>添加</strong>
            <span>选择图元或导入资源，直接创建到组件画布</span>
          </div>
        </div>

        {visual.mode === 'composite' ? (
          <>
            <div className="component-palette-section">
              <span className="component-palette-label">基础图元</span>
              <div className="component-palette-grid">
                {PALETTE_PRIMITIVES.map((item) => {
                  const active = createTool?.kind === 'vector'
                    && createTool.primitive === item.primitive

                  return (
                    <Button
                      key={item.primitive}
                      size="small"
                      className={`component-palette-item${active ? ' create-tool-active' : ''}`}
                      disabled={readOnly}
                      aria-pressed={active}
                      onClick={() => addPrimitive(item)}
                    >
                      <span className="component-palette-item-symbol" aria-hidden="true">{item.symbol}</span>
                      <span className="component-palette-item-label">{item.label}</span>
                    </Button>
                  )
                })}
                <Button
                  size="small"
                  className="component-palette-item"
                  disabled={readOnly}
                  onClick={addText}
                >
                  <span className="component-palette-item-symbol" aria-hidden="true">T</span>
                  <span className="component-palette-item-label">文本</span>
                </Button>
              </div>
            </div>

            <div className="component-palette-section component-palette-resource">
              <span className="component-palette-label">资源</span>
              <ComponentVisualAssetImportControl
                visual={visual}
                readOnly={readOnly}
                selectedLayerId={null}
                onSelectionChange={onSelectionChange}
                onChange={onChange}
              />
            </div>

            <p className="component-palette-help">
              矩形、圆形、椭圆和线段会进入画布绘制模式：拖拽创建，单击按默认尺寸创建，Esc 取消。Path、文本按默认尺寸创建；需要组合时先多选同父级图层，再使用画布工具栏“组合”。资源导入始终创建顶层新图层。
            </p>
          </>
        ) : (
          <div className="component-layer-empty">
            Native Renderer 组件为只读实现，不开放视觉元素创建。
          </div>
        )}
      </section>

      <div className="component-layer-dock-heading">
        <div>
          <strong>图层</strong>
          <span>{visual.mode === 'native' ? 'Native Renderer' : `${visual.layers.length} 个内部图层 · Navigator`}</span>
        </div>
      </div>

      <div className="component-layer-tree">
        <Pressable
          className={`component-layer-root${selectedLayerIds.length === 0 ? ' active' : ''}`}
          onClick={() => selectNavigatorLayer(null)}
        >
          <span className="component-layer-root-icon">◆</span>
          <span>
            <strong>{componentTitle}</strong>
            <small>组件根 · 顶层 / Public Contract</small>
          </span>
        </Pressable>

        {visual.mode === 'composite' && flattened.map(({ layer, depth }) => (
          <Pressable
            key={layer.id}
            className={`component-layer-row${selectedLayerIdSet.has(layer.id) ? ' active' : ''}`}
            style={{ paddingLeft: `${12 + depth * 15}px` }}
            onClick={(event) => selectNavigatorLayer(
              layer.id,
              event.shiftKey || event.ctrlKey || event.metaKey,
            )}
          >
            <span className="component-layer-disclosure">{layer.kind === 'group' ? '▾' : '·'}</span>
            <span className="component-layer-kind">{layerKindLabel(layer.kind)}</span>
            <span className="component-layer-name">{layer.name}</span>
            {!layer.visible && <small>隐藏</small>}
          </Pressable>
        ))}

        {visual.mode === 'composite' && flattened.length === 0 && (
          <div className="component-layer-empty">
            从上方“添加”选择基础图元，或导入 SVG / 图片开始构建组件。创建后的结构会显示在这里。
          </div>
        )}

        {visual.mode === 'native' && (
          <div className="component-layer-empty">
            内置组件使用可信 Native Renderer，不反向解析 React / Konva 内部图层。
          </div>
        )}
      </div>

      {visual.mode === 'composite' && (
        <p className="component-layer-navigator-help">
          顶层图层直接挂在组件根下；Group 只表示显式组合，不是必需根容器。图层区只用于定位和选择当前结构，画布负责主要直接操作。
        </p>
      )}
    </div>
  )
}

export function ComponentVisualCanvas({
  visual,
  componentTitle,
  designWidth,
  designHeight,
  selectedLayerId,
  mode,
}: ComponentVisualCanvasProps) {
  const selectedLayer = visual.layers.find((layer) => layer.id === selectedLayerId) ?? null
  const artboardScale = Math.min(
    1,
    520 / Math.max(1, designWidth),
    380 / Math.max(1, designHeight),
  )

  return (
    <>
      <div className="canvas-toolbar component-canvas-toolbar" role="toolbar" aria-label="组件画布工具栏">
        <div className="canvas-toolbar-summary">
          <strong>组件画布</strong>
          <span>{designWidth} × {designHeight}</span>
          <span>{visual.mode === 'native' ? 'Native Visual' : `${visual.layers.length} Layers`}</span>
          {selectedLayer && <span>选中：{selectedLayer.name}</span>}
        </div>
        <span className="component-canvas-phase">
          {mode === 'preview' ? '预览模式 · Composite Renderer 接入 M6.3' : '设计模式 · Renderer 接入 M6.3'}
        </span>
      </div>

      <div className={`component-canvas-stage ${mode}`}>
        <div
          className="component-artboard"
          style={{
            width: `${designWidth * artboardScale}px`,
            height: `${designHeight * artboardScale}px`,
          }}
        >
          <div className="component-artboard-placeholder">
            <strong>{componentTitle}</strong>
            <span>{visual.mode === 'native' ? 'Native Renderer' : 'Composite Visual'}</span>
            {mode === 'preview' ? (
              <small>预览模式已锁定编辑；真实视觉运行预览将在 M6.3 接入这里。</small>
            ) : selectedLayer ? (
              <small>当前图层：{selectedLayer.name} · {layerKindLabel(selectedLayer.kind)}</small>
            ) : (
              <small>当前选择：组件根。左侧选择内部图层后可在右侧编辑它。</small>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export function ComponentVisualLayerInspector(props: ComponentVisualLayerInspectorProps) {
  const layer = props.visual.layers.find((candidate) => candidate.id === props.selectedLayerId)

  if (!layer) {
    return <div className="component-layer-empty">所选图层已不存在，请重新选择。</div>
  }

  return <LayerInspectorContent {...props} layer={layer} />
}

function LayerInspectorContent({
  visual,
  readOnly,
  layer,
  onSelectionChange,
  onChange,
}: LayerInspectorContentProps) {
  const descendantIds = collectDescendantIds(visual.layers, layer.id)
  const parentOptions = visual.layers.filter(
    (candidate) => candidate.kind === 'group' && !descendantIds.has(candidate.id),
  )

  function updateLayers(layers: readonly ComponentVisualLayer[]) {
    onChange({ ...visual, layers })
  }

  function updateLayer(nextLayer: ComponentVisualLayer) {
    updateLayers(replaceLayer(visual.layers, layer.id, nextLayer))
  }

  function renameLayer(nextValue: string) {
    if (readOnly) return

    const nextId = nextValue.trim()
    if (
      !nextId ||
      nextId === layer.id ||
      visual.layers.some((candidate) => candidate.id === nextId)
    ) return

    const previousId = layer.id
    updateLayers(visual.layers.map((candidate) => {
      if (candidate.id === previousId) {
        return { ...candidate, id: nextId } as ComponentVisualLayer
      }
      if (candidate.parentId === previousId) {
        return { ...candidate, parentId: nextId } as ComponentVisualLayer
      }
      return candidate
    }))
    onSelectionChange(nextId)
  }

  function removeLayer() {
    if (readOnly) return

    const deleted = collectDescendantIds(visual.layers, layer.id)
    updateLayers(visual.layers.filter((candidate) => !deleted.has(candidate.id)))
    onSelectionChange(null)
  }

  function moveLayer(direction: -1 | 1) {
    if (readOnly) return

    const siblings = visual.layers.filter((candidate) => candidate.parentId === layer.parentId)
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === layer.id)
    const target = siblings[siblingIndex + direction]
    if (!target) return

    const currentIndex = visual.layers.findIndex((candidate) => candidate.id === layer.id)
    const targetIndex = visual.layers.findIndex((candidate) => candidate.id === target.id)
    const nextLayers = [...visual.layers]
    nextLayers[currentIndex] = target
    nextLayers[targetIndex] = layer
    updateLayers(nextLayers)
  }

  function updateTransform(
    field: keyof ComponentVisualLayer['transform'],
    value: number,
  ) {
    if (!Number.isFinite(value)) return

    updateLayer({
      ...layer,
      transform: { ...layer.transform, [field]: value },
    } as ComponentVisualLayer)
  }

  return (
    <div className="property-section-list component-layer-inspector">
      <CollapsibleInspectorGroup title="图层">
        <div className="component-layer-inspector-title">
          <div>
            <strong>{layer.name}</strong>
            <span>{layerKindLabel(layer.kind)} · {layer.id}</span>
          </div>
          {!readOnly && (
            <div className="component-layer-actions">
              <IconButton aria-label="图层上移" title="上移" size="small" onClick={() => moveLayer(-1)}>↑</IconButton>
              <IconButton aria-label="图层下移" title="下移" size="small" onClick={() => moveLayer(1)}>↓</IconButton>
              <Button variant="danger" size="small" onClick={removeLayer}>删除</Button>
            </div>
          )}
        </div>

        <label className="property-field">
          <span>ID</span>
          <LayerIdInput value={layer.id} disabled={readOnly} onCommit={renameLayer} />
        </label>
        <label className="property-field">
          <span>名称</span>
          <Input
            value={layer.name}
            disabled={readOnly}
            onChange={(event) => updateLayer({ ...layer, name: event.target.value } as ComponentVisualLayer)}
          />
        </label>
        <label className="property-field">
          <span>父级</span>
          <Select
            value={layer.parentId ?? ''}
            disabled={readOnly}
            ariaLabel={`${layer.name} 父级`}
            options={[
              { value: '', label: '组件根（顶层）' },
              ...parentOptions.map((group) => ({ value: group.id, label: group.name })),
            ]}
            onValueChange={(value) => updateLayer({
              ...layer,
              parentId: value || null,
            } as ComponentVisualLayer)}
          />
        </label>
      </CollapsibleInspectorGroup>

      <CollapsibleInspectorGroup title="几何">
        <div className="property-grid component-layer-geometry-grid">
          {([
            ['x', 'X'],
            ['y', 'Y'],
            ['width', 'W'],
            ['height', 'H'],
            ['rotation', '旋转'],
            ['scaleX', 'Scale X'],
            ['scaleY', 'Scale Y'],
          ] as Array<[keyof ComponentVisualLayer['transform'], string]>).map(([field, label]) => (
            <label key={field} className="property-field compact">
              <span>{label}</span>
              <NumberInput
                step={field.startsWith('scale') ? '0.1' : '1'}
                value={layer.transform[field]}
                disabled={readOnly}
                onChange={(event) => updateTransform(field, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
      </CollapsibleInspectorGroup>

      <CollapsibleInspectorGroup title="显示" className="inspector-toggle-group">
        <Checkbox
          className="checkbox-field property-toggle"
          checked={layer.visible}
          disabled={readOnly}
          label="可见"
          onCheckedChange={(checked) => updateLayer({ ...layer, visible: checked } as ComponentVisualLayer)}
        />
        <label className="property-field compact">
          <span>透明度</span>
          <NumberInput
            min="0"
            max="1"
            step="0.05"
            value={layer.opacity}
            disabled={readOnly}
            onChange={(event) => updateLayer({ ...layer, opacity: Number(event.target.value) } as ComponentVisualLayer)}
          />
        </label>
      </CollapsibleInspectorGroup>

      {(layer.kind === 'svg' || layer.kind === 'image') && (
        <CollapsibleInspectorGroup title="资源">
          <ComponentVisualAssetImportControl
            visual={visual}
            readOnly={readOnly}
            selectedLayerId={layer.id}
            requireReplacement
            onSelectionChange={onSelectionChange}
            onChange={onChange}
          />
          <label className="property-field">
            <span>资源引用</span>
            <Input
              value={layer.assetRef}
              disabled={readOnly || (layer.kind === 'svg' && Boolean(layer.document))}
              placeholder={layer.kind === 'svg' ? 'assets/pump-body.svg' : 'assets/vendor-logo.png'}
              onChange={(event) => updateLayer({ ...layer, assetRef: event.target.value })}
            />
          </label>
          {layer.kind === 'svg' && layer.document ? (
            <p className="component-inspector-help">
              托管 SVG 的 document 是唯一内部结构 authority；assetRef 由 canonical serializer 确定性生成，不可独立编辑。
            </p>
          ) : (
            <p className="component-inspector-help">
              旧资源引用保持兼容；通过“替换文件”可转换为自包含的正常本地资源。
            </p>
          )}
        </CollapsibleInspectorGroup>
      )}

      {layer.kind === 'vector' && (
        <CollapsibleInspectorGroup title="矢量图形">
          <label className="property-field">
            <span>图元</span>
            <Select
              value={layer.primitive}
              disabled={readOnly}
              ariaLabel={`${layer.name} 图元类型`}
              options={VECTOR_PRIMITIVE_OPTIONS}
              onValueChange={(value) => updateLayer({
                ...layer,
                primitive: value as VisualVectorPrimitive,
                pathData: value === 'path' ? layer.pathData ?? '' : undefined,
              })}
            />
          </label>
          {layer.primitive === 'path' && (
            <label className="property-field">
              <span>Path Data</span>
              <Textarea
                rows={4}
                value={layer.pathData ?? ''}
                disabled={readOnly}
                onChange={(event) => updateLayer({ ...layer, pathData: event.target.value })}
              />
            </label>
          )}
        </CollapsibleInspectorGroup>
      )}

      {layer.kind === 'text' && (
        <CollapsibleInspectorGroup title="文本">
          <label className="property-field">
            <span>内容</span>
            <Textarea
              rows={4}
              value={layer.text}
              disabled={readOnly}
              onChange={(event) => updateLayer({ ...layer, text: event.target.value })}
            />
          </label>
        </CollapsibleInspectorGroup>
      )}
    </div>
  )
}
