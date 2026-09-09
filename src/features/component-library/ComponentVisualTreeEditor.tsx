import { useEffect, useMemo, useRef, useState } from 'react'
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
import { ComponentAuthoringPalette } from './ComponentAuthoringPalette'
import { ComponentVisualAssetImportControl } from './ComponentVisualAssetImportControl'
import { componentLayerAncestorIds, componentNavigatorRows } from './component-layer-navigation'
import { clearComponentCreateTool } from './component-create-mode'
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

export function layerKindLabel(kind: VisualLayerKind) {
  return LAYER_KIND_LABELS.find(([candidate]) => candidate === kind)?.[1] ?? kind
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
  selectedLayerIds,
  primaryLayerId,
  onSelectionChange,
  onChange,
}: ComponentVisualTreeEditorProps) {
  const [search, setSearch] = useState('')
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<string>>(() => new Set())
  const [navigatorCollapsed, setNavigatorCollapsed] = useState(false)
  const [revealRequest, setRevealRequest] = useState(0)
  const navigatorRef = useRef<HTMLDivElement>(null)
  const flattened = useMemo(
    () => componentNavigatorRows(visual.layers, collapsedGroupIds, search),
    [visual.layers, collapsedGroupIds, search],
  )
  const ancestorKey = JSON.stringify(componentLayerAncestorIds(visual.layers, primaryLayerId))
  const primaryVisible = flattened.some(({ layer }) => layer.id === primaryLayerId)
  const selectedLayerIdSet = useMemo(() => new Set(selectedLayerIds), [selectedLayerIds])
  const primaryLayer = visual.layers.find((layer) => layer.id === primaryLayerId) ?? null

  // Canvas selection reveals its ancestors without changing persisted hierarchy.
  useEffect(() => {
    const ancestors = new Set<string>(JSON.parse(ancestorKey))
    setCollapsedGroupIds((current) => {
      if (![...current].some((id) => ancestors.has(id))) return current
      return new Set([...current].filter((id) => !ancestors.has(id)))
    })
  }, [ancestorKey, primaryLayerId, revealRequest])

  useEffect(() => {
    if (navigatorCollapsed) return
    const row = Array.from(navigatorRef.current?.querySelectorAll<HTMLElement>('[data-layer-id]') ?? [])
      .find((element) => element.dataset.layerId === primaryLayerId)
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [navigatorCollapsed, primaryLayerId, primaryVisible, revealRequest])

  useEffect(() => {
    if (primaryLayerId && !primaryLayer) onSelectionChange(null)
  }, [onSelectionChange, primaryLayer, primaryLayerId])

  useEffect(() => {
    if (readOnly || visual.mode !== 'composite') clearComponentCreateTool()
  }, [readOnly, visual.mode])

  function selectNavigatorLayer(layerId: string | null, toggle = false) {
    clearComponentCreateTool()
    onSelectionChange(layerId, toggle)
  }

  function revealSelection() {
    setNavigatorCollapsed(false)
    setSearch('')
    setRevealRequest((current) => current + 1)
  }

  function toggleGroup(layerId: string) {
    setCollapsedGroupIds((current) => {
      const next = new Set(current)
      if (next.has(layerId)) next.delete(layerId)
      else next.add(layerId)
      return next
    })
  }

  return (
    <div className="component-layer-dock">
      <ComponentAuthoringPalette
        visual={visual}
        readOnly={readOnly}
        onSelectionChange={onSelectionChange}
        onChange={onChange}
      />

      <section
        className={`component-layer-navigator${navigatorCollapsed ? ' collapsed' : ''}`}
        aria-label="图层导航"
      >
        <div className="component-layer-dock-heading">
          <div>
            <strong>图层</strong>
            <span>{visual.mode === 'native' ? '内置组件' : `${visual.layers.length} 个图层${selectedLayerIds.length ? ` · 已选 ${selectedLayerIds.length}` : ''}`}</span>
          </div>
          <div className="component-layer-heading-actions">
            <Button size="small" variant="ghost" disabled={!primaryLayer} onClick={revealSelection}>
              定位所选
            </Button>
            <IconButton
              size="small"
              variant="ghost"
              aria-label={navigatorCollapsed ? '展开图层' : '折叠图层'}
              aria-expanded={!navigatorCollapsed}
              title={navigatorCollapsed ? '展开图层' : '折叠图层'}
              onClick={() => setNavigatorCollapsed((current) => !current)}
            >
              <span aria-hidden="true">{navigatorCollapsed ? '›' : '⌄'}</span>
            </IconButton>
          </div>
        </div>

        {!navigatorCollapsed && (
          <>
            {visual.mode === 'composite' && visual.layers.length > 0 && (
              <div className="component-layer-search">
                <Input
                  aria-label="查找图层"
                  placeholder="查找名称、类型或 ID"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      event.stopPropagation()
                      setSearch('')
                    }
                  }}
                />
                {search && <IconButton aria-label="清除图层查找" size="small" onClick={() => setSearch('')}>×</IconButton>}
              </div>
            )}

            <div className="component-layer-tree" ref={navigatorRef}>
              {visual.mode === 'composite' && flattened.map(({ layer, depth, hasChildren }) => (
                <div
                  key={layer.id}
                  className="component-layer-entry"
                  style={{ paddingLeft: `${depth * 14}px` }}
                  data-layer-id={layer.id}
                >
                  {hasChildren ? (
                    <IconButton
                      className="component-layer-disclosure"
                      size="small"
                      aria-label={`${collapsedGroupIds.has(layer.id) && !search.trim() ? '展开' : '折叠'} ${layer.name}`}
                      aria-expanded={Boolean(search.trim()) || !collapsedGroupIds.has(layer.id)}
                      disabled={Boolean(search.trim())}
                      title={search.trim() ? '查找时展开匹配的图层，清除查找后可折叠' : undefined}
                      onClick={() => toggleGroup(layer.id)}
                    ><span aria-hidden="true">{collapsedGroupIds.has(layer.id) && !search.trim() ? '›' : '⌄'}</span></IconButton>
                  ) : <span className="component-layer-disclosure-placeholder" />}
                  <Pressable
                    className={`component-layer-row${selectedLayerIdSet.has(layer.id) ? ' active' : ''}`}
                    aria-pressed={selectedLayerIdSet.has(layer.id)}
                    title={`${layer.name} · ${layerKindLabel(layer.kind)} · ${layer.id}`}
                    onClick={(event) => selectNavigatorLayer(
                      layer.id,
                      event.shiftKey || event.ctrlKey || event.metaKey,
                    )}
                  >
                    <span className="component-layer-kind">{layerKindLabel(layer.kind)}</span>
                    <span className="component-layer-name">{layer.name}</span>
                    {!layer.visible && <small>隐藏</small>}
                  </Pressable>
                </div>
              ))}

              {visual.mode === 'composite' && flattened.length === 0 && (
                <div className="component-layer-empty">
                  {visual.layers.length === 0
                    ? '从基础图元、组件或其他资源添加内容，开始设计组件。'
                    : '没有匹配的图层。试试其他名称，或清除查找。'}
                </div>
              )}

              {visual.mode === 'native' && (
                <div className="component-layer-empty">
                  内置组件的内部图形不在这里编辑。
                </div>
              )}
            </div>

            {visual.mode === 'composite' && (
              <p className="component-layer-navigator-help">
                Shift / Ctrl / ⌘ 点击多选，使用画布工具栏组合。点击空白画布取消选择。
              </p>
            )}
          </>
        )}
      </section>
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
              <small>当前未选择图层。左侧选择图层后可在右侧编辑它。</small>
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
              { value: '', label: '顶层' },
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
              选中 SVG 内部元素可编辑它的外观和几何属性，资源内容会自动更新。更换整张图请使用“替换文件”。
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
