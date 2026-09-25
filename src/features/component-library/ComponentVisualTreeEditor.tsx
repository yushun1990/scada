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
  type VisualAnchorOrigin,
  type VisualLayerKind,
} from '../../component-system/visual'
import { recomputeBoundLinesInVisual } from '../../component-system/component-line-routing'
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
  startX: number
  startY: number
  lastClientX: number
  lastClientY: number
  dropZones: readonly LayerReorderDropZone[]
  sourceLeft: number
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
  sourceLeft: number
  startX: number
  tilt: number
}

const LAYER_KIND_LABELS: Array<[VisualLayerKind, string]> = [
  ['group', 'Group'],
  ['svg', 'SVG'],
  ['image', '位图'],
  ['vector', '矢量图形'],
  ['text', '文本'],
]

function ScaleIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v18" />
      <path d="M6 5h8" />
      <path d="M6 9h5" />
      <path d="M6 13h8" />
      <path d="M6 17h5" />
      <path d="M6 21h8" />
    </svg>
  )
}

export function layerKindLabel(kind: VisualLayerKind) {
  return LAYER_KIND_LABELS.find(([candidate]) => candidate === kind)?.[1] ?? kind
}

export function LayerIcon({ layer }: { layer: ComponentVisualLayer }) {
  if (layer.kind === 'text') return <TextIcon />
  if (layer.kind === 'group') return <GroupIcon />
  if (layer.kind === 'image') return <ImageIcon />
  if (layer.kind === 'vector') {
    if (layer.primitive === 'rect') return <RectangleIcon />
    if (layer.primitive === 'circle' || layer.primitive === 'ellipse') return <EllipseIcon />
    if (layer.primitive === 'line') return <LineIcon />
    if (layer.primitive === 'scale') return <ScaleIcon />
  }
  return <VectorIcon />
}

export function layerKindBadgeText(layer: ComponentVisualLayer): string {
  if (layer.kind === 'vector') {
    if (layer.primitive === 'rect') return 'RECT'
    if (layer.primitive === 'circle' || layer.primitive === 'ellipse') return 'CIRC'
    if (layer.primitive === 'line') return 'LINE'
    if (layer.primitive === 'scale') return 'SCALE'
    if (layer.primitive === 'polygon') return 'POLY'
    if (layer.primitive === 'arc') return 'ARC'
    return 'PATH'
  }
  if (layer.kind === 'text') return 'TXT'
  if (layer.kind === 'group') return 'GRP'
  if (layer.kind === 'image') return 'IMG'
  if (layer.kind === 'svg') return 'SVG'
  return 'LAYER'
}

function replaceLayer(
  layers: readonly ComponentVisualLayer[],
  layerId: string,
  nextLayer: ComponentVisualLayer,
) {
  return layers.map((layer) => layer.id === layerId ? nextLayer : layer)
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
  const [layerReorderDropTarget, setLayerReorderDropTarget] = useState<LayerReorderDropTarget | null>(null)
  const [layerReorderPointer, setLayerReorderPointer] = useState<LayerReorderPointerPreview | null>(null)
  const navigatorRef = useRef<HTMLDivElement>(null)
  const layerReorderDragRef = useRef<LayerReorderDragState | null>(null)
  const layerReorderPointerRef = useRef<LayerReorderPointerPreview | null>(null)
  const layerReorderPreviewRef = useRef<HTMLDivElement>(null)
  const flattened = useMemo(
    // Stored sibling order is back-to-front; display the frontmost layer first.
    () => componentNavigatorRows([...visual.layers].reverse(), collapsedGroupIds, search),
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
    setLayerReorderPointer(null)
    layerReorderDragRef.current = {
      layerIds,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      dropZones,
      sourceLeft: entryBounds?.left ?? 0,
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
  ): LayerReorderDropTarget | null {
    const { dropZones } = dragState
    if (dropZones.length === 0) return null

    const cursorY = clientY

    if (cursorY < dropZones[0].top + dropZones[0].height / 2) {
      return {
        targetLayerId: dropZones[0].layerId,
        placement: 'front',
      }
    }

    const lastZone = dropZones[dropZones.length - 1]
    if (cursorY >= lastZone.top + lastZone.height / 2) {
      return {
        targetLayerId: lastZone.layerId,
        placement: 'back',
      }
    }

    for (const zone of dropZones) {
      if (cursorY >= zone.top && cursorY < zone.top + zone.height) {
        const isTopHalf = cursorY < zone.top + zone.height / 2
        return {
          targetLayerId: zone.layerId,
          placement: isTopHalf ? 'front' : 'back',
        }
      }
    }

    let closestZone = dropZones[0]
    let minDistance = Math.abs(cursorY - (closestZone.top + closestZone.height / 2))
    for (let i = 1; i < dropZones.length; i++) {
      const zone = dropZones[i]
      const dist = Math.abs(cursorY - (zone.top + zone.height / 2))
      if (dist < minDistance) {
        minDistance = dist
        closestZone = zone
      }
    }

    const isTopHalf = cursorY < closestZone.top + closestZone.height / 2
    return {
      targetLayerId: closestZone.layerId,
      placement: isTopHalf ? 'front' : 'back',
    }
  }

  function moveLayerReorderAt(pointerId: number, clientX: number, clientY: number) {
    const dragState = layerReorderDragRef.current
    if (!dragState || dragState.pointerId !== pointerId) return

    const movedEnough = Math.abs(clientY - dragState.startY) >= 3 || Math.abs(clientX - dragState.startX) >= 3

    const nextDragState = {
      ...dragState,
      lastClientX: clientX,
      lastClientY: clientY,
      active: dragState.active || movedEnough,
    }
    layerReorderDragRef.current = nextDragState

    if (nextDragState.active) {
      const container = navigatorRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        const scrollThreshold = 28
        if (clientY < rect.top + scrollThreshold && container.scrollTop > 0) {
          const factor = Math.min(1, (rect.top + scrollThreshold - clientY) / scrollThreshold)
          container.scrollTop -= Math.round(6 * factor)
        } else if (clientY > rect.bottom - scrollThreshold && container.scrollTop < container.scrollHeight - container.clientHeight) {
          const factor = Math.min(1, (clientY - (rect.bottom - scrollThreshold)) / scrollThreshold)
          container.scrollTop += Math.round(6 * factor)
        }
      }

      updateLayerReorderPointer(nextDragState, clientX, clientY)
      updateLayerReorderPreview(nextDragState, clientY)
    }
  }

  function updateLayerReorderPointer(
    dragState: LayerReorderDragState,
    clientX: number,
    clientY: number,
  ) {
    const deltaX = clientX - dragState.startX
    const dampedDeltaX = Math.tanh(deltaX / 70) * 16
    const currentLeft = Math.round(dragState.sourceLeft + dampedDeltaX)
    const currentTop = Math.round(clientY - dragState.offsetY)
    const tilt = Math.max(-2.5, Math.min(2.5, -0.8 + deltaX * 0.035))

    const nextPointer: LayerReorderPointerPreview = {
      layerIds: dragState.layerIds,
      clientX,
      clientY,
      sourceLeft: dragState.sourceLeft,
      startX: dragState.startX,
      offsetX: dragState.offsetX,
      offsetY: dragState.offsetY,
      width: dragState.width,
      height: dragState.height,
      tilt,
    }
    const shouldPublish = layerReorderPointerRef.current === null
    layerReorderPointerRef.current = nextPointer

    const previewElement = layerReorderPreviewRef.current
    if (previewElement) {
      previewElement.style.left = `${currentLeft}px`
      previewElement.style.top = `${currentTop}px`
      previewElement.style.transform = `rotate(${tilt.toFixed(2)}deg) scale(1.025)`
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

    const target = resolveLayerReorderTarget(clientY, dragState)
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

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && layerReorderDragRef.current?.active) {
        cancelLayerReorder()
      }
    }

    window.addEventListener('pointermove', moveCapturedLayerReorder, { passive: false })
    window.addEventListener('pointerup', finishCapturedLayerReorder)
    window.addEventListener('pointercancel', cancelCapturedLayerReorder)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointermove', moveCapturedLayerReorder)
      window.removeEventListener('pointerup', finishCapturedLayerReorder)
      window.removeEventListener('pointercancel', cancelCapturedLayerReorder)
      window.removeEventListener('keydown', handleKeyDown)
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
  ) {
    const target = resolveLayerReorderTarget(clientY, dragState)
    const nextDragState = {
      ...dragState,
      targetLayerId: target?.targetLayerId ?? null,
      targetPlacement: target?.placement ?? dragState.targetPlacement,
    }
    layerReorderDragRef.current = nextDragState

    if (!target) {
      setLayerReorderDropTarget(null)
      return
    }

    const sourceVisual = visual
    const result = resolveLayerReorderPreview(
      sourceVisual,
      target.targetLayerId,
      target.placement,
      dragState.layerIds,
    )

    if (result && result.changed) {
      setLayerReorderDropTarget(target)
    } else {
      setLayerReorderDropTarget(null)
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
    const changed = Boolean(result?.changed)

    layerReorderDragRef.current = null
    layerReorderPointerRef.current = null
    setLayerReorderDropTarget(null)
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
              {visual.mode === 'composite' && flattened.map(({ layer, depth, hasChildren }) => (
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
                    visual={visual}
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
                  left: `${Math.round(renderedLayerReorderPointer.sourceLeft + Math.tanh((renderedLayerReorderPointer.clientX - renderedLayerReorderPointer.startX) / 70) * 16)}px`,
                  width: `${Math.round(renderedLayerReorderPointer.width)}px`,
                  height: `${Math.round(renderedLayerReorderPointer.height)}px`,
                  transform: `rotate(${renderedLayerReorderPointer.tilt.toFixed(2)}deg) scale(1.025)`,
                }}
              >
                <span className="component-layer-drag-preview-handle" aria-hidden="true">
                  <DragHandleIcon />
                </span>
                <span className="component-layer-kind" aria-hidden="true">
                  <LayerIcon layer={draggedLayers[0]} />
                </span>
                <span className="component-layer-name">{draggedLayers[0].name}</span>
                {draggedLayers.length > 1 && (
                  <span className="component-layer-drag-badge">+{draggedLayers.length - 1}</span>
                )}
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

const PIVOT_POINTS: readonly { origin: VisualAnchorOrigin; label: string }[] = [
  { origin: 'top-left', label: 'Top-Left (左上角)' },
  { origin: 'top-center', label: 'Top-Center (顶部居中)' },
  { origin: 'top-right', label: 'Top-Right (右上角)' },
  { origin: 'center-left', label: 'Center-Left (左侧居中)' },
  { origin: 'center', label: 'Center (几何中心)' },
  { origin: 'center-right', label: 'Center-Right (右侧居中)' },
  { origin: 'bottom-left', label: 'Bottom-Left (左下角)' },
  { origin: 'bottom-center', label: 'Bottom-Center (底部居中，自底向上生长)' },
  { origin: 'bottom-right', label: 'Bottom-Right (右下角)' },
]

function LayerInspectorContent({
  visual,
  readOnly,
  layer,
  onSelectionChange,
  onChange,
}: LayerInspectorContentProps) {
  const geometryReadOnly = readOnly || layer.parentId !== null

  function updateLayers(layers: readonly ComponentVisualLayer[]) {
    onChange(recomputeBoundLinesInVisual({ ...visual, layers }))
  }

  function updateLayer(nextLayer: ComponentVisualLayer) {
    updateLayers(replaceLayer(visual.layers, layer.id, nextLayer))
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
    <div className="component-layer-inspector">
      <CollapsibleInspectorGroup title="几何">
        {layer.parentId !== null && (
          <p className="component-inspector-help">组合内图层可配置属性与行为；修改位置、尺寸或形状前请先拆分组合。</p>
        )}
        <div className="component-layer-geometry">
          <div className="property-grid component-layer-geometry-grid">
            <label className="property-field compact">
              <span>X</span>
              <NumberInput
                step="1"
                value={layer.transform.x}
                disabled={geometryReadOnly}
                onChange={(event) => updateTransform('x', Number(event.target.value))}
              />
            </label>
            <label className="property-field compact">
              <span>Y</span>
              <NumberInput
                step="1"
                value={layer.transform.y}
                disabled={geometryReadOnly}
                onChange={(event) => updateTransform('y', Number(event.target.value))}
              />
            </label>
            <label className="property-field compact">
              <span>W</span>
              <NumberInput
                min="1"
                step="1"
                value={layer.transform.width}
                disabled={geometryReadOnly}
                onChange={(event) => updateTransform('width', Number(event.target.value))}
              />
            </label>
            <label className="property-field compact">
              <span>H</span>
              <NumberInput
                min="1"
                step="1"
                value={layer.transform.height}
                disabled={geometryReadOnly}
                onChange={(event) => updateTransform('height', Number(event.target.value))}
              />
            </label>
            <label className="property-field compact">
              <span>Sx</span>
              <NumberInput
                step="0.1"
                value={layer.transform.scaleX}
                disabled={geometryReadOnly}
                onChange={(event) => updateTransform('scaleX', Number(event.target.value))}
              />
            </label>
            <label className="property-field compact">
              <span>Sy</span>
              <NumberInput
                step="0.1"
                value={layer.transform.scaleY}
                disabled={geometryReadOnly}
                onChange={(event) => updateTransform('scaleY', Number(event.target.value))}
              />
            </label>
            <label className="property-field compact">
              <span>R</span>
              <NumberInput
                step="1"
                value={layer.transform.rotation}
                disabled={geometryReadOnly}
                onChange={(event) => updateTransform('rotation', Number(event.target.value))}
              />
            </label>
            <div className="property-field compact component-pivot-field">
              <span title="变换参考原点 (Transform Origin)">O</span>
              <div
                className="component-pivot-matrix"
                role="radiogroup"
                aria-label={`${layer.name} 变换参考原点 (Transform Origin)`}
              >
                {PIVOT_POINTS.map(({ origin, label }) => {
                  const isSelected = (layer.origin ?? 'top-left') === origin
                  return (
                    <Pressable
                      key={origin}
                      type="button"
                      disabled={geometryReadOnly}
                      className={`component-pivot-cell ${isSelected ? 'is-active' : ''}`}
                      title={label}
                      aria-label={label}
                      aria-checked={isSelected}
                      role="radio"
                      onClick={() =>
                        updateLayer({
                          ...layer,
                          origin,
                        })
                      }
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </CollapsibleInspectorGroup>


      {layer.kind === 'image' && (
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
              disabled={geometryReadOnly}
              placeholder="assets/vendor-logo.png"
              onChange={(event) => updateLayer({ ...layer, assetRef: event.target.value })}
            />
          </label>
          <p className="component-inspector-help">
            旧资源引用保持兼容；通过“替换文件”可转换为自包含的正常本地资源。
          </p>
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
    </div>
  )
}
