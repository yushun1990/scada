import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import { CollapsibleInspectorGroup } from '../../components/CollapsibleInspectorGroup'
import {
  DragHandleIcon,
  EllipseIcon,
  EyeIcon,
  EyeOffIcon,
  GroupIcon,
  ImageIcon,
  LineIcon,
  RectangleIcon,
  TextIcon,
  VectorIcon,
} from '../../components/toolbar-icons'
import {
  type ComponentVisualDefinition,
  type ComponentVisualLayer,
  type VisualLayerKind,
} from '../../component-system/visual'
import {
  IconButton,
  Input,
  NumberInput,
  Pressable,
  Textarea,
} from '../../ui'
import { ComponentAuthoringPalette } from './ComponentAuthoringPalette'
import { ComponentLayerOrderActions } from './ComponentLayerCommands'
import { moveComponentLayersToTarget } from './component-layer-order'
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
  dropTarget: HTMLElement | null
  selectedLayerIds: readonly string[]
  primaryLayerId: string | null
  onSelectionChange: ComponentLayerSelectionChange
  onChange: (visual: ComponentVisualDefinition) => void
  onSelectionReplace: (layerIds: readonly string[]) => void
  onApplied: (message: string) => void
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

type LayerReorderDragState = {
  layerIds: readonly string[]
  pointerId: number
  startY: number
  lastClientY: number
  dropZones: readonly LayerReorderDropZone[]
  sourceTop: number
  sourceBottom: number
  height: number
  offsetX: number
  offsetY: number
  width: number
  active: boolean
  targetLayerId: string | null
  targetPlacement: 'front' | 'back'
}

type LayerReorderDropZone = {
  layerId: string
  top: number
  height: number
}

type LayerReorderDropTarget = {
  targetLayerId: string
  placement: 'front' | 'back'
}

type LayerReorderPointerPreview = Pick<
  LayerReorderDragState,
  'layerIds' | 'offsetX' | 'offsetY' | 'width' | 'height'
> & {
  clientX: number
  clientY: number
}

const LAYER_REORDER_TARGET_CROSSING_RATIO = 0.5

const LAYER_KIND_LABELS: Array<[VisualLayerKind, string]> = [
  ['group', 'Group'],
  ['svg', 'SVG'],
  ['image', '位图'],
  ['vector', '矢量图形'],
  ['text', '文本'],
]

export function layerKindLabel(kind: VisualLayerKind) {
  return LAYER_KIND_LABELS.find(([candidate]) => candidate === kind)?.[1] ?? kind
}

function LayerIcon({ layer }: { layer: ComponentVisualLayer }) {
  if (layer.kind === 'text') return <TextIcon />
  if (layer.kind === 'group') return <GroupIcon />
  if (layer.kind === 'image') return <ImageIcon />
  if (layer.kind === 'vector') {
    if (layer.primitive === 'rect') return <RectangleIcon />
    if (layer.primitive === 'circle' || layer.primitive === 'ellipse') return <EllipseIcon />
    if (layer.primitive === 'line') return <LineIcon />
  }
  return <VectorIcon />
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
  dropTarget,
  selectedLayerIds,
  primaryLayerId,
  onSelectionChange,
  onChange,
  onSelectionReplace,
  onApplied,
}: ComponentVisualTreeEditorProps) {
  const [search, setSearch] = useState('')
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<ReadonlySet<string>>(() => new Set())
  const [navigatorCollapsed, setNavigatorCollapsed] = useState(false)
  const [layerReorderPreview, setLayerReorderPreview] = useState<ComponentVisualDefinition | null>(null)
  const [layerReorderDropTarget, setLayerReorderDropTarget] = useState<LayerReorderDropTarget | null>(null)
  const [layerReorderPointer, setLayerReorderPointer] = useState<LayerReorderPointerPreview | null>(null)
  const navigatorRef = useRef<HTMLDivElement>(null)
  const layerReorderDragRef = useRef<LayerReorderDragState | null>(null)
  const layerReorderPointerRef = useRef<LayerReorderPointerPreview | null>(null)
  const layerReorderPreviewRef = useRef<HTMLDivElement>(null)
  const displayedVisual = layerReorderPreview ?? visual
  const flattened = useMemo(
    // Stored sibling order is back-to-front; display the frontmost layer first.
    () => componentNavigatorRows([...displayedVisual.layers].reverse(), collapsedGroupIds, search),
    [displayedVisual.layers, collapsedGroupIds, search],
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
  }, [ancestorKey, primaryLayerId])

  useEffect(() => {
    if (navigatorCollapsed) return
    const row = Array.from(navigatorRef.current?.querySelectorAll<HTMLElement>('[data-layer-id]') ?? [])
      .find((element) => element.dataset.layerId === primaryLayerId)
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [navigatorCollapsed, primaryLayerId, primaryVisible])

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

  function toggleGroup(layerId: string) {
    setCollapsedGroupIds((current) => {
      const next = new Set(current)
      if (next.has(layerId)) next.delete(layerId)
      else next.add(layerId)
      return next
    })
  }

  function updateLayerVisibility(layerId: string, visible: boolean) {
    if (readOnly) return

    onChange({
      ...visual,
      layers: visual.layers.map((layer) =>
        layer.id === layerId ? { ...layer, visible } : layer,
      ),
    })
  }

  function resolveLayerReorderIds(layerId: string) {
    const draggedLayer = visual.layers.find((layer) => layer.id === layerId)
    if (!draggedLayer) return null

    return selectedLayerIds.includes(layerId)
      ? selectedLayerIds.filter((selectedId) =>
          visual.layers.find((layer) => layer.id === selectedId)?.parentId === draggedLayer.parentId,
        )
      : [layerId]
  }

  function startLayerReorder(event: PointerEvent<HTMLSpanElement>, layerId: string) {
    if (readOnly || event.button !== 0) return

    const layerIds = resolveLayerReorderIds(layerId)
    if (!layerIds) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const entryBounds = event.currentTarget
      .closest<HTMLElement>('[data-layer-id]')
      ?.getBoundingClientRect()
    const draggedLayer = visual.layers.find((layer) => layer.id === layerId)
    const layerEntries = Array.from(
      navigatorRef.current?.querySelectorAll<HTMLElement>('[data-layer-id]') ?? [],
    )
    const movingBounds = layerEntries
      .filter((element) => layerIds.includes(element.dataset.layerId ?? ''))
      .map((element) => element.getBoundingClientRect())
    const sourceTop = movingBounds.length > 0
      ? Math.min(...movingBounds.map((bounds) => bounds.top))
      : entryBounds?.top ?? event.clientY - 14
    const sourceBottom = movingBounds.length > 0
      ? Math.max(...movingBounds.map((bounds) => bounds.bottom))
      : entryBounds?.bottom ?? sourceTop + 28
    const dropZones = layerEntries
      .map((element) => {
        const candidateId = element.dataset.layerId ?? ''
        const candidate = visual.layers.find((layer) => layer.id === candidateId)
        if (!candidate || candidate.parentId !== draggedLayer?.parentId || layerIds.includes(candidateId)) {
          return null
        }

        const bounds = element.getBoundingClientRect()
        return {
          layerId: candidateId,
          top: bounds.top,
          height: bounds.height,
        }
      })
      .filter((zone): zone is LayerReorderDropZone => zone !== null)
    layerReorderPointerRef.current = null
    setLayerReorderDropTarget(null)
    setLayerReorderPreview(null)
    setLayerReorderPointer(null)
    layerReorderDragRef.current = {
      layerIds,
      pointerId: event.pointerId,
      startY: event.clientY,
      lastClientY: event.clientY,
      dropZones,
      sourceTop,
      sourceBottom,
      height: Math.max(1, sourceBottom - sourceTop),
      offsetX: entryBounds ? event.clientX - entryBounds.left : 0,
      offsetY: entryBounds ? event.clientY - entryBounds.top : 14,
      width: entryBounds?.width ?? 240,
      active: false,
      targetLayerId: null,
      targetPlacement: 'back',
    }
  }

  function resolveLayerReorderTarget(
    clientY: number,
    dragState: LayerReorderDragState,
    direction: 'up' | 'down' | null = null,
  ) {
    const { dropZones } = dragState
    if (dropZones.length === 0) return null

    const draggedTop = clientY - dragState.offsetY
    const draggedBottom = draggedTop + dragState.height
    const overlaps = ({ top, height }: LayerReorderDropZone) => (
      draggedTop <= top + height && draggedBottom >= top
    )
    const crossedTargetHalf = ({ top, height }: LayerReorderDropZone) => {
      const midpoint = top + height * LAYER_REORDER_TARGET_CROSSING_RATIO
      return direction === 'down'
        ? draggedBottom >= midpoint
        : direction === 'up'
          ? draggedTop <= midpoint
          : false
    }
    const currentTarget = dragState.targetLayerId
      ? dropZones.find(({ layerId }) => layerId === dragState.targetLayerId)
      : undefined
    const currentTargetResult = currentTarget && overlaps(currentTarget)
      ? {
          targetLayerId: dragState.targetLayerId!,
          placement: dragState.targetPlacement,
        }
      : null

    if (direction === 'down') {
      // Switch at the first pixel of contact. Choosing the lowest overlapping
      // row also lets the dragged layer pass through several rows smoothly.
      const nextEntry = dropZones
        .filter(({ top }) => top >= dragState.sourceBottom)
        .filter(crossedTargetHalf)
        .at(-1)
      if (nextEntry) {
        return {
          targetLayerId: nextEntry.layerId,
          placement: 'back' as const,
        }
      }
      return currentTargetResult
    }

    if (direction === 'up') {
      // Rows are cached in visual order. Walking from the top picks the next
      // row reached by the moving top edge when rows overlap each other.
      const nextEntry = dropZones
        .filter(({ top, height }) => top + height <= dragState.sourceTop)
        .find(crossedTargetHalf)
      if (nextEntry) {
        return {
          targetLayerId: nextEntry.layerId,
          placement: 'front' as const,
        }
      }
      return currentTargetResult
    }

    if (currentTarget) {
      return {
        targetLayerId: dragState.targetLayerId!,
        placement: dragState.targetPlacement,
      }
    }

    return null
  }

  function moveLayerReorderAt(pointerId: number, clientX: number, clientY: number) {
    const dragState = layerReorderDragRef.current
    if (!dragState || dragState.pointerId !== pointerId) return

    const movedEnough = Math.abs(clientY - dragState.startY) >= 4
    const direction = clientY < dragState.lastClientY
      ? 'up'
      : clientY > dragState.lastClientY
        ? 'down'
        : null

    const nextDragState = {
      ...dragState,
      lastClientY: clientY,
      active: dragState.active || movedEnough,
    }
    layerReorderDragRef.current = nextDragState

    if (nextDragState.active) {
      updateLayerReorderPointer(nextDragState, clientX, clientY)
      updateLayerReorderPreview(nextDragState, clientY, direction)
    }
  }

  function updateLayerReorderPointer(
    dragState: LayerReorderDragState,
    clientX: number,
    clientY: number,
  ) {
    const nextPointer: LayerReorderPointerPreview = {
      layerIds: dragState.layerIds,
      clientX,
      clientY,
      offsetX: dragState.offsetX,
      offsetY: dragState.offsetY,
      width: dragState.width,
      height: dragState.height,
    }
    const shouldPublish = layerReorderPointerRef.current === null
    layerReorderPointerRef.current = nextPointer

    const previewElement = layerReorderPreviewRef.current
    if (previewElement) {
      previewElement.style.left = `${Math.round(clientX - dragState.offsetX)}px`
      previewElement.style.top = `${Math.round(clientY - dragState.offsetY)}px`
    } else if (shouldPublish) {
      setLayerReorderPointer(nextPointer)
    }
  }

  function finishLayerReorderAt(pointerId: number, clientY: number) {
    const dragState = layerReorderDragRef.current
    if (!dragState || dragState.pointerId !== pointerId) return

    if (readOnly || !dragState.active) {
      cancelLayerReorder()
      return
    }

    const direction = clientY < dragState.lastClientY
      ? 'up'
      : clientY > dragState.lastClientY
        ? 'down'
        : null
    const target = resolveLayerReorderTarget(clientY, dragState, direction)
    if (!target) {
      cancelLayerReorder()
      return
    }

    commitLayerReorder(dragState, target.targetLayerId, target.placement)
  }

  function finishLayerReorder(event: PointerEvent<HTMLSpanElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    finishLayerReorderAt(event.pointerId, event.clientY)
  }

  useEffect(() => {
    function moveCapturedLayerReorder(event: globalThis.PointerEvent) {
      if (layerReorderDragRef.current?.pointerId !== event.pointerId) return
      event.preventDefault()
      moveLayerReorderAt(event.pointerId, event.clientX, event.clientY)
    }

    function finishCapturedLayerReorder(event: globalThis.PointerEvent) {
      if (layerReorderDragRef.current?.pointerId !== event.pointerId) return
      finishLayerReorderAt(event.pointerId, event.clientY)
    }

    function cancelCapturedLayerReorder(event: globalThis.PointerEvent) {
      if (layerReorderDragRef.current?.pointerId !== event.pointerId) return
      cancelLayerReorder()
    }

    window.addEventListener('pointermove', moveCapturedLayerReorder, { passive: false })
    window.addEventListener('pointerup', finishCapturedLayerReorder)
    window.addEventListener('pointercancel', cancelCapturedLayerReorder)
    return () => {
      window.removeEventListener('pointermove', moveCapturedLayerReorder)
      window.removeEventListener('pointerup', finishCapturedLayerReorder)
      window.removeEventListener('pointercancel', cancelCapturedLayerReorder)
    }
  }, [readOnly, visual])

  function resolveLayerReorderPreview(
    sourceVisual: ComponentVisualDefinition,
    targetLayerId: string | null,
    placement: 'front' | 'back',
    layerIds: readonly string[],
  ) {
    if (!targetLayerId) return
    return moveComponentLayersToTarget(sourceVisual, layerIds, targetLayerId, placement)
  }

  function updateLayerReorderPreview(
    dragState: LayerReorderDragState,
    clientY: number,
    direction: 'up' | 'down' | null,
  ) {
    const target = resolveLayerReorderTarget(clientY, dragState, direction)
    const nextDragState = {
      ...dragState,
      targetLayerId: target?.targetLayerId ?? null,
      targetPlacement: target?.placement ?? dragState.targetPlacement,
    }
    layerReorderDragRef.current = nextDragState

    if (!target) {
      setLayerReorderDropTarget(null)
      setLayerReorderPreview(null)
      return
    }

    setLayerReorderDropTarget(target)

    const sourceVisual = visual
    const result = resolveLayerReorderPreview(
      sourceVisual,
      target.targetLayerId,
      target.placement,
      dragState.layerIds,
    )
    if (!result) return

    if (result.changed) {
      setLayerReorderPreview(result.visual)
    } else {
      setLayerReorderPreview(null)
    }
  }

  function commitLayerReorder(
    dragState: LayerReorderDragState,
    targetLayerId: string,
    placement: 'front' | 'back',
  ) {
    const sourceVisual = visual
    const result = resolveLayerReorderPreview(
      sourceVisual,
      targetLayerId,
      placement,
      dragState.layerIds,
    )
    const finalVisual = result?.changed ? result.visual : sourceVisual
    const changed = finalVisual.layers.some((layer, index) => layer.id !== visual.layers[index]?.id)

    layerReorderDragRef.current = null
    layerReorderPointerRef.current = null
    setLayerReorderDropTarget(null)
    setLayerReorderPreview(null)
    setLayerReorderPointer(null)
    if (!changed) return

    onChange(finalVisual)
    onSelectionReplace(dragState.layerIds)
    onApplied('已调整图层层级')
  }

  function cancelLayerReorder() {
    layerReorderDragRef.current = null
    layerReorderPointerRef.current = null
    setLayerReorderDropTarget(null)
    setLayerReorderPreview(null)
    setLayerReorderPointer(null)
  }

  const renderedLayerReorderPointer = layerReorderPointerRef.current ?? layerReorderPointer
  const draggedLayers = renderedLayerReorderPointer
    ? visual.layers.filter((layer) => renderedLayerReorderPointer.layerIds.includes(layer.id))
    : []

  return (
    <div className="component-layer-dock">
      <ComponentAuthoringPalette
        visual={visual}
        readOnly={readOnly}
        dropTarget={dropTarget}
        onSelectionChange={onSelectionChange}
        onChange={onChange}
      />

      <section
        className={`component-layer-navigator${navigatorCollapsed ? ' collapsed' : ''}`}
        aria-label="图层导航"
      >
        <div className="component-layer-dock-heading">
          <div className="component-layer-heading-actions">
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
            <strong>图层</strong>
          </div>
          <span>{visual.mode === 'native' ? '内置组件' : `${visual.layers.length} 个图层`}</span>
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
              {displayedVisual.mode === 'composite' && flattened.map(({ layer, depth, hasChildren }) => (
                <div
                  key={layer.id}
                  className={`component-layer-entry${renderedLayerReorderPointer?.layerIds.includes(layer.id) ? ' is-dragging' : ''}${layerReorderDropTarget?.targetLayerId === layer.id ? ' is-drop-target' : ''}`}
                  style={{ paddingLeft: `${depth * 14}px` }}
                  data-layer-id={layer.id}
                  data-drop-placement={layerReorderDropTarget?.targetLayerId === layer.id
                    ? layerReorderDropTarget.placement
                    : undefined}
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
                    <span className="component-layer-kind" aria-hidden="true"><LayerIcon layer={layer} /></span>
                    <span className="component-layer-name">{layer.name}</span>
                  </Pressable>
                  <div className="component-layer-state-controls">
                    <IconButton
                      className="component-layer-visibility"
                      size="small"
                      variant="ghost"
                      aria-label={layer.visible ? `隐藏 · ${layer.name}` : `显示 · ${layer.name}`}
                      title={layer.visible ? '隐藏' : '显示'}
                      disabled={readOnly}
                      onClick={() => updateLayerVisibility(layer.id, !layer.visible)}
                    >{layer.visible ? <EyeIcon /> : <EyeOffIcon />}</IconButton>
                  </div>
                  <ComponentLayerOrderActions
                    visual={displayedVisual}
                    layerId={layer.id}
                    layerName={layer.name}
                    selectedLayerIds={selectedLayerIds}
                    disabled={readOnly}
                    onChange={onChange}
                    onSelectionReplace={onSelectionReplace}
                    onApplied={onApplied}
                  />
                  <span
                    className="component-layer-drag-handle"
                    role="button"
                    tabIndex={readOnly ? -1 : 0}
                    aria-label={`拖动调整层级 · ${layer.name}`}
                    title="按住拖动调整层级"
                    onPointerDown={(event) => startLayerReorder(event, layer.id)}
                    onPointerUp={finishLayerReorder}
                    onPointerCancel={cancelLayerReorder}
                  ><DragHandleIcon /></span>
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
                上方图层显示在前 · Ctrl / ⌘ 点击多选
              </p>
            )}

            {renderedLayerReorderPointer && draggedLayers.length > 0 && (
              <div
                ref={layerReorderPreviewRef}
                className="component-layer-drag-preview"
                aria-hidden="true"
                style={{
                  top: `${Math.round(renderedLayerReorderPointer.clientY - renderedLayerReorderPointer.offsetY)}px`,
                  left: `${Math.round(renderedLayerReorderPointer.clientX - renderedLayerReorderPointer.offsetX)}px`,
                  width: `${Math.round(renderedLayerReorderPointer.width)}px`,
                  height: `${Math.round(renderedLayerReorderPointer.height)}px`,
                }}
              >
                <span className="component-layer-kind"><LayerIcon layer={draggedLayers[0]} /></span>
                <span className="component-layer-name">{draggedLayers[0].name}</span>
                {draggedLayers.length > 1 && <small>+ {draggedLayers.length - 1}</small>}
              </div>
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
  const geometryReadOnly = readOnly || layer.parentId !== null

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

  function updateTransform(
    field: keyof ComponentVisualLayer['transform'],
    value: number,
  ) {
    if (geometryReadOnly || !Number.isFinite(value)) return

    updateLayer({
      ...layer,
      transform: { ...layer.transform, [field]: value },
    } as ComponentVisualLayer)
  }

  return (
    <div className="property-section-list component-layer-inspector">
      <CollapsibleInspectorGroup title="图层">

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
      </CollapsibleInspectorGroup>

      <CollapsibleInspectorGroup title="几何">
        {layer.parentId !== null && (
          <p className="component-inspector-help">组合内图层可配置属性与行为；修改位置、尺寸或形状前请先拆分组合。</p>
        )}
        <div className="property-grid component-layer-geometry-grid">
          {([
            ['x', 'X'],
            ['y', 'Y'],
            ['width', 'W'],
            ['height', 'H'],
            ['scaleX', 'Scale X'],
            ['scaleY', 'Scale Y'],
            ['rotation', '旋转'],
          ] as Array<[keyof ComponentVisualLayer['transform'], string]>).map(([field, label]) => (
            <label key={field} className="property-field compact">
              <span>{label}</span>
              <NumberInput
                step={field.startsWith('scale') ? '0.1' : '1'}
                value={layer.transform[field]}
                disabled={geometryReadOnly}
                onChange={(event) => updateTransform(field, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
      </CollapsibleInspectorGroup>

      {(layer.kind === 'svg' || layer.kind === 'image') && (
        <CollapsibleInspectorGroup title="资源">
          <ComponentVisualAssetImportControl
            visual={visual}
            readOnly={geometryReadOnly}
            selectedLayerId={layer.id}
            requireReplacement
            onSelectionChange={onSelectionChange}
            onChange={onChange}
          />
          <label className="property-field">
            <span>资源引用</span>
            <Input
              value={layer.assetRef}
              disabled={geometryReadOnly || (layer.kind === 'svg' && Boolean(layer.document))}
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

      {layer.kind === 'vector' && layer.primitive === 'path' && (
        <CollapsibleInspectorGroup title="Path">
          <label className="property-field">
            <span>Path Data</span>
            <Textarea
              rows={4}
              value={layer.pathData ?? ''}
              disabled={geometryReadOnly}
              onChange={(event) => updateLayer({ ...layer, pathData: event.target.value })}
            />
          </label>
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
