import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type Konva from 'konva'
import { Ellipse, Group, Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import {
  COMPOSITE_VISUAL_LAYER_NODE_NAME,
  CompositeComponentVisualRenderer,
  compositeVisualLayerNodeId,
  getCompositeVisualLayerId,
} from '../../component-system/CompositeComponentVisualRenderer'
import {
  applyVisualAnimationOverlay,
  evaluateVisualAnimations,
} from '../../component-system/animations'
import type {
  ComponentAttributeValues,
  ComponentPropertyFallbackValues,
} from '../../component-system/definition'
import type { ComponentVisualDefinition } from '../../component-system/visual'
import { resolveComponentVisualRules } from '../../component-system/visualRules'
import {
  CopyIcon,
  GridIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from '../../components/toolbar-icons'
import { NumberInput, ToolbarButton } from '../../ui'
import {
  appendCreatedVectorLayer,
  clearComponentCreateTool,
  resolveComponentCreateGeometry,
  type ComponentCreateGeometry,
  type ComponentCreateTool,
  type ComponentDesignPoint,
  useComponentCreateTool,
} from './component-create-mode'
import {
  applyComponentLayerSnap,
  COMPONENT_SNAP_GRID_SIZE,
  computeComponentLayerSnap,
  type ComponentSnapResult,
} from './component-canvas-snap'
import {
  mapManagedSvgViewportBoundsToLayer,
  measureManagedSvgElementViewportBounds,
  useComponentManagedSvgSelection,
} from './component-managed-svg-selection'
import {
  cloneComponentLayerSubtrees,
  deleteComponentLayers,
} from './component-layer-hierarchy'
import {
  layerKindLabel,
  type ComponentLayerSelectionChange,
  type ComponentWorkbenchMode,
} from './ComponentVisualTreeEditor'
import './component-canvas-snap.css'
import './component-create-mode.css'

type ComponentVisualCanvasProps = {
  visual: ComponentVisualDefinition
  attributeValues?: ComponentAttributeValues
  propertyValues: ComponentPropertyFallbackValues
  componentTitle: string
  designWidth: number
  designHeight: number
  selectedLayerIds: readonly string[]
  primaryLayerId: string | null
  mode: ComponentWorkbenchMode
  readOnly: boolean
  snapEnabled: boolean
  onSelectionChange: ComponentLayerSelectionChange
  onChange: (visual: ComponentVisualDefinition) => void
}

type CanvasViewport = {
  width: number
  height: number
}

const TRANSFORMER_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

const WORKBENCH_ARTBOARD_MAX_WIDTH = 720
const WORKBENCH_ARTBOARD_MAX_HEIGHT = 520
const WORKBENCH_ARTBOARD_FIT_GUTTER = 4
const COMPONENT_VISUAL_HISTORY_LIMIT = 100

function isInsideTransformer(
  target: Konva.Node,
  transformer: Konva.Transformer | null,
) {
  let current: Konva.Node | null = target

  while (current) {
    if (current === transformer) {
      return true
    }

    current = current.getParent()
  }

  return false
}

function findLayerNode(stage: Konva.Stage, layerId: string) {
  const expectedId = compositeVisualLayerNodeId(layerId)

  return stage
    .find(`.${COMPOSITE_VISUAL_LAYER_NODE_NAME}`)
    .find((node) => node.id() === expectedId) as Konva.Group | undefined
}

function measureCanvasViewport(element: HTMLDivElement): CanvasViewport {
  const style = window.getComputedStyle(element)
  const horizontalPadding =
    Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  const verticalPadding =
    Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)

  return {
    width: Math.max(
      1,
      element.clientWidth - horizontalPadding - WORKBENCH_ARTBOARD_FIT_GUTTER,
    ),
    height: Math.max(
      1,
      element.clientHeight - verticalPadding - WORKBENCH_ARTBOARD_FIT_GUTTER,
    ),
  }
}

function isTextEditingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function CreateGeometryPreview({
  tool,
  geometry,
  artboardScale,
}: {
  tool: ComponentCreateTool
  geometry: ComponentCreateGeometry
  artboardScale: number
}) {
  const strokeWidth = 1 / artboardScale
  const dash = [5 / artboardScale, 4 / artboardScale]

  if (tool.primitive === 'line') {
    return (
      <Line
        x={geometry.x}
        y={geometry.y}
        rotation={geometry.rotation}
        points={[0, geometry.height / 2, geometry.width, geometry.height / 2]}
        stroke="#2563eb"
        strokeWidth={strokeWidth}
        dash={dash}
        listening={false}
        perfectDrawEnabled={false}
      />
    )
  }

  if (tool.primitive === 'ellipse') {
    return (
      <Ellipse
        x={geometry.x + geometry.width / 2}
        y={geometry.y + geometry.height / 2}
        radiusX={geometry.width / 2}
        radiusY={geometry.height / 2}
        stroke="#2563eb"
        strokeWidth={strokeWidth}
        dash={dash}
        listening={false}
        perfectDrawEnabled={false}
      />
    )
  }

  return (
    <Rect
      x={geometry.x}
      y={geometry.y}
      width={geometry.width}
      height={geometry.height}
      stroke="#2563eb"
      strokeWidth={strokeWidth}
      dash={dash}
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}

export function ComponentVisualCanvas({
  visual,
  attributeValues = {},
  propertyValues,
  componentTitle,
  designWidth,
  designHeight,
  selectedLayerIds,
  primaryLayerId,
  mode,
  readOnly,
  snapEnabled,
  onSelectionChange,
  onChange,
}: ComponentVisualCanvasProps) {
  const createTool = useComponentCreateTool()
  const managedSvgSelection = useComponentManagedSvgSelection()
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const verticalGuideRef = useRef<Konva.Line>(null)
  const horizontalGuideRef = useRef<Konva.Line>(null)
  const visualRef = useRef(visual)
  const undoStackRef = useRef<ComponentVisualDefinition[]>([])
  const redoStackRef = useRef<ComponentVisualDefinition[]>([])
  const applyingHistoryRef = useRef(false)
  const isEditableRef = useRef(false)
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport | null>(null)
  const [editToolbarHost, setEditToolbarHost] = useState<HTMLElement | null>(null)
  const [viewToolbarHost, setViewToolbarHost] = useState<HTMLElement | null>(null)
  const [gridVisible, setGridVisible] = useState(true)
  const [gridSize, setGridSize] = useState(COMPONENT_SNAP_GRID_SIZE)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [animationTimeMs, setAnimationTimeMs] = useState(0)
  const [createStart, setCreateStart] = useState<ComponentDesignPoint | null>(null)
  const [createCurrent, setCreateCurrent] = useState<ComponentDesignPoint | null>(null)
  const [createConstrainAspectRatio, setCreateConstrainAspectRatio] = useState(false)
  const [managedSvgHighlightPoints, setManagedSvgHighlightPoints] = useState<number[]>([])
  const selectedLayer = visual.layers.find((layer) => layer.id === primaryLayerId) ?? null
  const selectedVisibleLayerIds = useMemo(
    () => selectedLayerIds.filter((layerId) =>
      visual.layers.some((layer) => layer.id === layerId && layer.visible),
    ),
    [selectedLayerIds, visual.layers],
  )
  const activeManagedSvgSelection =
    selectedLayerIds.length === 1 &&
    primaryLayerId !== null &&
    managedSvgSelection?.layerId === primaryLayerId
      ? managedSvgSelection
      : null
  const ruleResolvedVisual = mode === 'preview'
    ? resolveComponentVisualRules(visual, {
        attributes: attributeValues,
        properties: propertyValues,
      })
    : visual
  const renderedVisual = mode === 'preview'
    ? applyVisualAnimationOverlay(
        ruleResolvedVisual,
        evaluateVisualAnimations(ruleResolvedVisual, propertyValues, animationTimeMs),
      )
    : visual
  const visualDesignWidth = visual.designSize.width
  const visualDesignHeight = visual.designSize.height
  const maxArtboardScale = Math.min(
    WORKBENCH_ARTBOARD_MAX_WIDTH / Math.max(1, visualDesignWidth),
    WORKBENCH_ARTBOARD_MAX_HEIGHT / Math.max(1, visualDesignHeight),
  )
  const viewportArtboardScale = canvasViewport
    ? Math.min(
        canvasViewport.width / Math.max(1, visualDesignWidth),
        canvasViewport.height / Math.max(1, visualDesignHeight),
      )
    : Math.min(1, maxArtboardScale)
  const artboardScale = Math.max(
    0.01,
    Math.min(maxArtboardScale, viewportArtboardScale),
  )
  const artboardWidth = visualDesignWidth * artboardScale
  const artboardHeight = visualDesignHeight * artboardScale
  const isComposite = visual.mode === 'composite'
  const isEditable = isComposite && mode === 'editor' && !readOnly
  const activeCreateTool = isEditable ? createTool : null
  const showDesignGrid = isComposite && mode === 'editor' && gridVisible
  const canTransformSelection = selectedLayerIds.length === 1 && !activeCreateTool
  const createGeometry = activeCreateTool && createStart && createCurrent
    ? resolveComponentCreateGeometry(
        activeCreateTool,
        createStart,
        createCurrent,
        visualDesignWidth,
        visualDesignHeight,
        createConstrainAspectRatio,
      )
    : null

  useLayoutEffect(() => {
    isEditableRef.current = isEditable
  }, [isEditable])

  function syncHistoryAvailability() {
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(redoStackRef.current.length > 0)
  }

  useLayoutEffect(() => {
    const element = canvasHostRef.current

    if (!element) {
      return
    }

    const canvasArea = element.closest('.component-canvas-area')
    const toolbar = canvasArea?.querySelector<HTMLElement>('.component-canvas-toolbar')
    const hierarchyGroup = toolbar?.querySelector<HTMLElement>('.component-hierarchy-tool-group')
    const snapButton = toolbar?.querySelector<HTMLElement>('.component-snap-toggle')

    setEditToolbarHost(hierarchyGroup ?? null)
    setViewToolbarHost(snapButton?.closest<HTMLElement>('.canvas-tool-group') ?? null)

    const updateViewport = () => {
      const next = measureCanvasViewport(element)

      setCanvasViewport((current) =>
        current &&
        Math.abs(current.width - next.width) < 0.5 &&
        Math.abs(current.height - next.height) < 0.5
          ? current
          : next,
      )
    }

    updateViewport()

    const observer = new ResizeObserver(updateViewport)
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (mode !== 'preview' || visual.animations.length === 0) {
      setAnimationTimeMs(0)
      return
    }

    let frameId = 0
    let epochMs: number | null = null

    const tick = (nowMs: number) => {
      epochMs ??= nowMs
      setAnimationTimeMs(nowMs - epochMs)
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [mode, visual.animations.length])

  useEffect(() => {
    const previous = visualRef.current

    if (previous === visual) {
      return
    }

    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false
      visualRef.current = visual
      syncHistoryAvailability()
      return
    }

    undoStackRef.current = [
      ...undoStackRef.current.slice(-(COMPONENT_VISUAL_HISTORY_LIMIT - 1)),
      previous,
    ]
    redoStackRef.current = []
    visualRef.current = visual
    syncHistoryAvailability()
  }, [visual])

  useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current

    if (!transformer || !stage) {
      return
    }

    const selectedNodes = isEditable && !activeCreateTool
      ? selectedVisibleLayerIds.flatMap((layerId) => {
          const node = findLayerNode(stage, layerId)
          return node ? [node] : []
        })
      : []

    transformer.nodes(selectedNodes)
    transformer.getLayer()?.batchDraw()
  }, [activeCreateTool, artboardScale, isEditable, selectedVisibleLayerIds, visual.layers])

  useLayoutEffect(() => {
    const clearHighlight = () => {
      setManagedSvgHighlightPoints((current) => current.length === 0 ? current : [])
    }
    const stage = stageRef.current

    if (!stage || !isEditable || !activeManagedSvgSelection) {
      clearHighlight()
      return
    }

    const layer = visual.layers.find(
      (candidate) => candidate.id === activeManagedSvgSelection.layerId,
    )
    if (layer?.kind !== 'svg' || !layer.document || !layer.visible) {
      clearHighlight()
      return
    }

    const viewportBounds = measureManagedSvgElementViewportBounds(
      layer.document,
      activeManagedSvgSelection.tagId,
    )
    if (!viewportBounds) {
      clearHighlight()
      return
    }

    const localBounds = mapManagedSvgViewportBoundsToLayer(layer, viewportBounds)
    const layerNode = findLayerNode(stage, layer.id)
    if (!localBounds || !layerNode) {
      clearHighlight()
      return
    }

    const transform = layerNode.getAbsoluteTransform().copy()
    const corners = [
      transform.point({ x: localBounds.x, y: localBounds.y }),
      transform.point({ x: localBounds.x + localBounds.width, y: localBounds.y }),
      transform.point({
        x: localBounds.x + localBounds.width,
        y: localBounds.y + localBounds.height,
      }),
      transform.point({ x: localBounds.x, y: localBounds.y + localBounds.height }),
    ]

    setManagedSvgHighlightPoints(corners.flatMap((point) => [point.x, point.y]))
  }, [
    activeManagedSvgSelection?.layerId,
    activeManagedSvgSelection?.tagId,
    artboardScale,
    isEditable,
    visual.layers,
  ])

  useEffect(() => {
    if (!isEditable || !snapEnabled) {
      clearSnapGuides()
    }
  }, [isEditable, snapEnabled])

  useEffect(() => {
    if (isEditable) return
    setCreateStart(null)
    setCreateCurrent(null)
    setCreateConstrainAspectRatio(false)
    clearComponentCreateTool()
  }, [isEditable])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTextEditingTarget(event.target)) {
        return
      }

      if (event.key === 'Escape' && createTool) {
        event.preventDefault()
        setCreateStart(null)
        setCreateCurrent(null)
        setCreateConstrainAspectRatio(false)
        clearComponentCreateTool()
        return
      }

      if (event.key === 'Escape' && selectedLayerIds.length > 0) {
        event.preventDefault()
        onSelectionChange(null)
        return
      }

      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const isUndo = modifier && !event.shiftKey && key === 'z'
      const isRedo = modifier && (key === 'y' || (event.shiftKey && key === 'z'))

      if (isUndo && undoStackRef.current.length > 0 && isEditableRef.current) {
        event.preventDefault()
        undoVisual()
      } else if (isRedo && redoStackRef.current.length > 0 && isEditableRef.current) {
        event.preventDefault()
        redoVisual()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  function undoVisual() {
    const previous = undoStackRef.current[undoStackRef.current.length - 1]

    if (!previous || !isEditableRef.current) {
      return
    }

    undoStackRef.current = undoStackRef.current.slice(0, -1)
    redoStackRef.current = [
      ...redoStackRef.current.slice(-(COMPONENT_VISUAL_HISTORY_LIMIT - 1)),
      visualRef.current,
    ]
    applyingHistoryRef.current = true
    onChange(previous)
    syncHistoryAvailability()
  }

  function redoVisual() {
    const next = redoStackRef.current[redoStackRef.current.length - 1]

    if (!next || !isEditableRef.current) {
      return
    }

    redoStackRef.current = redoStackRef.current.slice(0, -1)
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(COMPONENT_VISUAL_HISTORY_LIMIT - 1)),
      visualRef.current,
    ]
    applyingHistoryRef.current = true
    onChange(next)
    syncHistoryAvailability()
  }

  function duplicateSelection() {
    if (!isEditable || selectedLayerIds.length === 0) {
      return
    }

    const result = cloneComponentLayerSubtrees(visual, selectedLayerIds)

    if (result.rootIds.length === 0) {
      return
    }

    onChange(result.visual)
    onSelectionChange(result.rootIds[result.rootIds.length - 1] ?? null)
  }

  function deleteSelection() {
    if (!isEditable || selectedLayerIds.length === 0) {
      return
    }

    const result = deleteComponentLayers(visual, selectedLayerIds)

    if (result.deletedIds.length === 0) {
      return
    }

    onChange(result.visual)
    onSelectionChange(null)
  }

  function commitLayerTransform(node: Konva.Node) {
    if (!isEditable) {
      return
    }

    const layerId = getCompositeVisualLayerId(node)
    const layer = layerId
      ? visual.layers.find((candidate) => candidate.id === layerId)
      : null

    if (!layerId || !layer) {
      return
    }

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    if (
      !Number.isFinite(node.x()) ||
      !Number.isFinite(node.y()) ||
      !Number.isFinite(node.rotation()) ||
      !Number.isFinite(scaleX) ||
      !Number.isFinite(scaleY) ||
      Math.abs(scaleX) < 0.001 ||
      Math.abs(scaleY) < 0.001
    ) {
      return
    }

    onChange({
      ...visual,
      layers: visual.layers.map((candidate) =>
        candidate.id === layerId
          ? {
              ...candidate,
              transform: {
                ...candidate.transform,
                x: node.x(),
                y: node.y(),
                rotation: node.rotation(),
                scaleX,
                scaleY,
              },
            }
          : candidate,
      ),
    })
  }

  function resolveLayerNode(target: Konva.Node) {
    const stage = stageRef.current
    const layerId = getCompositeVisualLayerId(target)

    return stage && layerId ? findLayerNode(stage, layerId) : undefined
  }

  function clearSnapGuides() {
    verticalGuideRef.current?.visible(false)
    horizontalGuideRef.current?.visible(false)
    verticalGuideRef.current?.getLayer()?.batchDraw()
  }

  function renderSnapGuides(result: ComponentSnapResult) {
    const vertical = result.guides.find((guide) => guide.orientation === 'vertical')
    const horizontal = result.guides.find((guide) => guide.orientation === 'horizontal')
    const verticalGuide = verticalGuideRef.current
    const horizontalGuide = horizontalGuideRef.current

    if (verticalGuide) {
      if (vertical) {
        verticalGuide.points([
          vertical.position,
          0,
          vertical.position,
          artboardHeight,
        ])
        verticalGuide.visible(true)
      } else {
        verticalGuide.visible(false)
      }
    }

    if (horizontalGuide) {
      if (horizontal) {
        horizontalGuide.points([
          0,
          horizontal.position,
          artboardWidth,
          horizontal.position,
        ])
        horizontalGuide.visible(true)
      } else {
        horizontalGuide.visible(false)
      }
    }

    verticalGuide?.getLayer()?.batchDraw()
  }

  function previewLayerSnap(target: Konva.Node) {
    if (!isEditable || !snapEnabled) {
      clearSnapGuides()
      return
    }

    const stage = stageRef.current
    const node = resolveLayerNode(target)

    if (!stage || !node) {
      clearSnapGuides()
      return
    }

    renderSnapGuides(
      computeComponentLayerSnap(stage, node, visual, artboardScale, gridSize),
    )
  }

  function finishLayerDrag(target: Konva.Node) {
    const stage = stageRef.current
    const node = resolveLayerNode(target)

    if (!node) {
      clearSnapGuides()
      return
    }

    if (stage && isEditable && snapEnabled) {
      applyComponentLayerSnap(
        node,
        computeComponentLayerSnap(stage, node, visual, artboardScale, gridSize),
      )
    }

    clearSnapGuides()
    commitLayerTransform(node)
  }

  function handlePointerTarget(target: Konva.Node, toggle = false) {
    if (!isEditable || activeCreateTool || isInsideTransformer(target, transformerRef.current)) {
      return
    }

    onSelectionChange(getCompositeVisualLayerId(target), toggle)
  }

  function commitSelectedTransform() {
    if (!canTransformSelection) {
      return
    }

    const transformer = transformerRef.current
    const node = transformer?.nodes()[0]

    if (node) {
      commitLayerTransform(node)
    }
  }

  function pointerDesignPoint() {
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()

    if (!pointer) return null

    const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value))
    const point = {
      x: clamp(pointer.x / artboardScale, visualDesignWidth),
      y: clamp(pointer.y / artboardScale, visualDesignHeight),
    }

    if (!snapEnabled) return point

    return {
      x: clamp(Math.round(point.x / gridSize) * gridSize, visualDesignWidth),
      y: clamp(Math.round(point.y / gridSize) * gridSize, visualDesignHeight),
    }
  }

  function beginCreate(constrainAspectRatio = false) {
    if (!activeCreateTool) return false

    const point = pointerDesignPoint()
    if (!point) return true

    clearSnapGuides()
    onSelectionChange(null)
    setCreateStart(point)
    setCreateCurrent(point)
    setCreateConstrainAspectRatio(constrainAspectRatio)
    return true
  }

  function updateCreate(constrainAspectRatio = false) {
    if (!activeCreateTool || !createStart) return false

    const point = pointerDesignPoint()
    if (point) setCreateCurrent(point)
    setCreateConstrainAspectRatio(constrainAspectRatio)
    return true
  }

  function finishCreate(constrainAspectRatio = false) {
    if (!activeCreateTool || !createStart) return false

    const end = pointerDesignPoint() ?? createCurrent ?? createStart
    const geometry = resolveComponentCreateGeometry(
      activeCreateTool,
      createStart,
      end,
      visualDesignWidth,
      visualDesignHeight,
      constrainAspectRatio,
    )
    const result = appendCreatedVectorLayer(visual, activeCreateTool, geometry)

    setCreateStart(null)
    setCreateCurrent(null)
    setCreateConstrainAspectRatio(false)
    clearComponentCreateTool()

    if (result.layerId) {
      onChange(result.visual)
      onSelectionChange(result.layerId)
    }

    return true
  }

  return (
    <>
      {editToolbarHost && createPortal(
        <>
          <ToolbarButton
            iconOnly
            className="icon-button component-copy-command"
            title="复制选中图层"
            aria-label="复制选中图层"
            disabled={!isEditable || selectedLayerIds.length === 0}
            onClick={duplicateSelection}
          >
            <CopyIcon />
          </ToolbarButton>
          <ToolbarButton
            iconOnly
            className="icon-button component-delete-command"
            title="删除选中图层"
            aria-label="删除选中图层"
            disabled={!isEditable || selectedLayerIds.length === 0}
            onClick={deleteSelection}
          >
            <TrashIcon />
          </ToolbarButton>
          <ToolbarButton
            iconOnly
            className="icon-button component-undo-command"
            title="撤销 (Ctrl+Z)"
            aria-label="撤销"
            disabled={!isEditable || !canUndo}
            onClick={undoVisual}
          >
            <UndoIcon />
          </ToolbarButton>
          <ToolbarButton
            iconOnly
            className="icon-button component-redo-command"
            title="重做 (Ctrl+Shift+Z)"
            aria-label="重做"
            disabled={!isEditable || !canRedo}
            onClick={redoVisual}
          >
            <RedoIcon />
          </ToolbarButton>
        </>,
        editToolbarHost,
      )}

      {viewToolbarHost && createPortal(
        <div className="grid-control" title="网格显示与间距">
          <ToolbarButton
            iconOnly
            className={`icon-button toggle-button component-grid-toggle${gridVisible ? ' active' : ''}`}
            title={gridVisible ? '隐藏格线' : '显示格线'}
            aria-label="显示格线"
            aria-pressed={gridVisible}
            disabled={!isComposite || mode !== 'editor'}
            onClick={() => setGridVisible((current) => !current)}
          >
            <GridIcon />
          </ToolbarButton>
          {gridVisible && (
            <NumberInput
              className="grid-size-input"
              min="4"
              max="128"
              title="网格间距"
              aria-label="网格间距"
              value={gridSize}
              disabled={!isComposite || mode !== 'editor'}
              onChange={(event) => {
                const nextGridSize = Number(event.target.value)

                if (Number.isFinite(nextGridSize) && nextGridSize >= 4 && nextGridSize <= 128) {
                  setGridSize(nextGridSize)
                }
              }}
            />
          )}
        </div>,
        viewToolbarHost,
      )}

      <div ref={canvasHostRef} className={`component-canvas-stage ${mode}`}>
        <div
          className={`component-artboard${showDesignGrid ? ' component-artboard-grid' : ''}${activeCreateTool ? ' component-create-mode' : ''}`}
          style={{
            width: `${artboardWidth}px`,
            height: `${artboardHeight}px`,
            backgroundSize: showDesignGrid
              ? `${gridSize * artboardScale}px ${gridSize * artboardScale}px`
              : undefined,
          }}
        >
          {isComposite ? (
            <Stage
              ref={stageRef}
              width={artboardWidth}
              height={artboardHeight}
              listening={isEditable}
              onMouseDown={(event) => {
                if (activeCreateTool && event.evt.button !== 0) return
                if (beginCreate(event.evt.shiftKey)) return
                handlePointerTarget(
                  event.target,
                  event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey,
                )
              }}
              onMouseMove={(event) => updateCreate(event.evt.shiftKey)}
              onMouseUp={(event) => finishCreate(event.evt.shiftKey)}
              onTouchStart={(event) => {
                if (beginCreate()) return
                handlePointerTarget(event.target)
              }}
              onTouchMove={() => updateCreate()}
              onTouchEnd={() => finishCreate()}
              onDragStart={clearSnapGuides}
              onDragMove={(event) => previewLayerSnap(event.target)}
              onDragEnd={(event) => finishLayerDrag(event.target)}
            >
              <Layer listening={isEditable}>
                <CompositeComponentVisualRenderer
                  visual={renderedVisual}
                  x={0}
                  y={0}
                  width={artboardWidth}
                  height={artboardHeight}
                  rotation={0}
                  visible
                  opacity={1}
                  listening={isEditable}
                  draggableLayerId={isEditable && !activeCreateTool ? primaryLayerId : undefined}
                  frontLayerId={isEditable && !activeCreateTool ? primaryLayerId : null}
                />
                {activeCreateTool && createGeometry && (
                  <Group scaleX={artboardScale} scaleY={artboardScale} listening={false}>
                    <CreateGeometryPreview
                      tool={activeCreateTool}
                      geometry={createGeometry}
                      artboardScale={artboardScale}
                    />
                  </Group>
                )}
                <Transformer
                  ref={transformerRef}
                  visible={isEditable && !activeCreateTool && selectedVisibleLayerIds.length > 0}
                  enabledAnchors={canTransformSelection ? TRANSFORMER_ANCHORS : []}
                  resizeEnabled={canTransformSelection}
                  rotateEnabled={canTransformSelection}
                  flipEnabled={false}
                  keepRatio={false}
                  anchorSize={7}
                  rotateAnchorOffset={22}
                  borderStroke="#2563eb"
                  anchorStroke="#2563eb"
                  anchorFill="#ffffff"
                  borderStrokeWidth={1}
                  anchorStrokeWidth={1}
                  boundBoxFunc={(oldBox, newBox) =>
                    Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4
                      ? oldBox
                      : newBox
                  }
                  onTransformEnd={commitSelectedTransform}
                />
              </Layer>
              <Layer listening={false}>
                {managedSvgHighlightPoints.length === 8 && (
                  <Line
                    points={managedSvgHighlightPoints}
                    closed
                    stroke="#7c3aed"
                    strokeWidth={1.5}
                    dash={[5, 3]}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )}
                <Line
                  ref={verticalGuideRef}
                  visible={false}
                  points={[]}
                  stroke="#2563eb"
                  strokeWidth={1}
                  dash={[4, 4]}
                  listening={false}
                  perfectDrawEnabled={false}
                />
                <Line
                  ref={horizontalGuideRef}
                  visible={false}
                  points={[]}
                  stroke="#2563eb"
                  strokeWidth={1}
                  dash={[4, 4]}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              </Layer>
            </Stage>
          ) : (
            <div className="component-artboard-placeholder">
              <strong>{componentTitle}</strong>
              <span>Native Renderer</span>
              <small>内置组件继续使用可信 Native Renderer，不反向解析其内部图层。</small>
            </div>
          )}
        </div>
      </div>

      <div className="canvas-status component-canvas-status">
        <span className="canvas-status-group">
          <span className="status-mode">{mode === 'preview' ? '预览' : '设计'}</span>
          <span className="status-selection">
            {activeCreateTool ? (
              <>
                <strong className="component-create-mode-hint">绘制{activeCreateTool.label}</strong>
                <code>创建模式</code>
                <span className="status-hint">
                  {activeCreateTool.primitive === 'ellipse'
                    ? '拖拽创建 · Shift 正圆 · 单击默认尺寸 · Esc 取消'
                    : '拖拽创建 · 单击默认尺寸 · Esc 取消'}
                </span>
              </>
            ) : selectedLayerIds.length > 1 ? (
              <>
                <strong>{selectedLayerIds.length} 个图层</strong>
                <code>多选</code>
                {selectedLayer && (
                  <span className="status-hint">主选：{selectedLayer.name}</span>
                )}
              </>
            ) : selectedLayer ? (
              <>
                <strong>{selectedLayer.name}</strong>
                <code>{layerKindLabel(selectedLayer.kind)}</code>
                {activeManagedSvgSelection && (
                  <span className="status-hint">
                    SVG {activeManagedSvgSelection.tagId}
                  </span>
                )}
                <span>
                  {Math.round(selectedLayer.transform.width)} ×{' '}
                  {Math.round(selectedLayer.transform.height)}
                </span>
                <span className="status-hint">
                  @ {Math.round(selectedLayer.transform.x)}, {Math.round(selectedLayer.transform.y)}
                </span>
              </>
            ) : (
              <>
                <strong>未选择图层</strong>
                <span className="status-hint">点击图层或画布元素进行选择</span>
              </>
            )}
          </span>
        </span>
        <span className="canvas-status-group scene-status-summary">
          <strong>{componentTitle}</strong>
          <span>设计空间 {visualDesignWidth} × {visualDesignHeight}</span>
          <span>实例默认 {designWidth} × {designHeight}</span>
          <span>{visual.layers.length} 个图层</span>
          {(visual.rules?.length ?? 0) > 0 && <span>{visual.rules?.length} 条规则</span>}
          {visual.animations.length > 0 && <span>{visual.animations.length} 个动画</span>}
        </span>
      </div>
    </>
  )
}
