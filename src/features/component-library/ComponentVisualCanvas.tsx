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
import { shouldIgnoreEditorShortcut } from '../../editor/keyboard'
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
  createComponentLayerLocalMatrix,
  decomposeComponentLayerMatrix,
  multiplyComponentLayerMatrices,
} from './component-layer-transform'
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
  canUndo: boolean
  canRedo: boolean
  editToolbarHost: HTMLElement | null
  viewToolbarHost: HTMLElement | null
  onArtboardElementChange: (element: HTMLDivElement | null) => void
  onUndo: () => void
  onRedo: () => void
  onSelectionChange: ComponentLayerSelectionChange
  onSelectionReplace: (layerIds: readonly string[]) => void
  onChange: (visual: ComponentVisualDefinition) => void
}

type CanvasViewport = {
  width: number
  height: number
}

type CanvasPoint = {
  x: number
  y: number
}

type MarqueeState = {
  start: CanvasPoint
  current: CanvasPoint
  additive: boolean
}

type MarqueeSession = MarqueeState & {
  active: boolean
}

type LayerPositionSnapshot = {
  x: number
  y: number
}

type LayerDragSession = {
  draggedLayerId: string
  layerIds: string[]
  initialTransforms: Record<string, LayerPositionSnapshot>
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

const WORKBENCH_ARTBOARD_FIT_GUTTER = 4
const MARQUEE_THRESHOLD = 4

function normalizeMarquee(marquee: MarqueeState) {
  return {
    x: Math.min(marquee.start.x, marquee.current.x),
    y: Math.min(marquee.start.y, marquee.current.y),
    width: Math.abs(marquee.current.x - marquee.start.x),
    height: Math.abs(marquee.current.y - marquee.start.y),
  }
}

function hasSelectionModifier(event: MouseEvent) {
  return Boolean(event.shiftKey || event.ctrlKey || event.metaKey)
}

type ComponentLayerTransform = ComponentVisualDefinition['layers'][number]['transform']

function applyResizeDeltaToLayerTransforms(
  visual: ComponentVisualDefinition,
  layer: ComponentVisualDefinition['layers'][number],
  resizeScaleX: number,
  resizeScaleY: number,
) {
  if (resizeScaleX <= 0 || resizeScaleY <= 0) {
    return null
  }

  const transforms = new Map<string, ComponentLayerTransform>()

  if (layer.kind === 'group') {
    const childScaleMatrix = {
      a: resizeScaleX,
      b: 0,
      c: 0,
      d: resizeScaleY,
      e: 0,
      f: 0,
    }

    for (const child of visual.layers) {
      if (child.parentId !== layer.id) {
        continue
      }

      const nextChildTransform = decomposeComponentLayerMatrix(
        multiplyComponentLayerMatrices(
          childScaleMatrix,
          createComponentLayerLocalMatrix(child),
        ),
        child.transform,
      )

      if (!nextChildTransform) {
        return null
      }

      transforms.set(child.id, nextChildTransform)
    }
  }

  transforms.set(layer.id, {
    ...layer.transform,
    width: layer.transform.width * resizeScaleX,
    height: layer.transform.height * resizeScaleY,
  })

  return transforms
}

function boundsIntersect(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  return !(
    first.x + first.width < second.x ||
    first.x > second.x + second.width ||
    first.y + first.height < second.y ||
    first.y > second.y + second.height
  )
}

function getLayerFallbackBounds(
  layer: ComponentVisualDefinition['layers'][number],
  artboardScale: number,
) {
  const { x, y, width, height, rotation, scaleX, scaleY } = layer.transform
  const radians = (rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const scaledWidth = width * scaleX * artboardScale
  const scaledHeight = height * scaleY * artboardScale
  const points = [
    { x: 0, y: 0 },
    { x: scaledWidth, y: 0 },
    { x: scaledWidth, y: scaledHeight },
    { x: 0, y: scaledHeight },
  ].map((point) => ({
    x: x * artboardScale + point.x * cosine - point.y * sine,
    y: y * artboardScale + point.x * sine + point.y * cosine,
  }))
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)

  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
}

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

function CreateGeometryPreview({
  tool,
  geometry,
  artboardScale,
  selectionColor,
}: {
  tool: ComponentCreateTool
  geometry: ComponentCreateGeometry
  artboardScale: number
  selectionColor: string
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
        stroke={selectionColor}
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
        stroke={selectionColor}
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
      stroke={selectionColor}
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
  canUndo,
  canRedo,
  editToolbarHost,
  viewToolbarHost,
  onArtboardElementChange,
  onUndo,
  onRedo,
  onSelectionChange,
  onSelectionReplace,
  onChange,
}: ComponentVisualCanvasProps) {
  const createTool = useComponentCreateTool()
  const managedSvgSelection = useComponentManagedSvgSelection()
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const verticalGuideRef = useRef<Konva.Line>(null)
  const horizontalGuideRef = useRef<Konva.Line>(null)
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport | null>(null)
  const [gridVisible, setGridVisible] = useState(true)
  const [selectionColor, setSelectionColor] = useState('transparent')
  const [gridSize, setGridSize] = useState(COMPONENT_SNAP_GRID_SIZE)
  const [animationTimeMs, setAnimationTimeMs] = useState(0)
  const [createStart, setCreateStart] = useState<ComponentDesignPoint | null>(null)
  const [createCurrent, setCreateCurrent] = useState<ComponentDesignPoint | null>(null)
  const [createConstrainAspectRatio, setCreateConstrainAspectRatio] = useState(false)
  const [managedSvgHighlightPoints, setManagedSvgHighlightPoints] = useState<number[]>([])
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const marqueeSessionRef = useRef<MarqueeSession | null>(null)
  const pendingLayerSelectionRef = useRef<readonly string[] | null>(null)
  const layerDragSessionRef = useRef<LayerDragSession | null>(null)
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
  // Fit the white artboard to the available workspace without changing design coordinates.
  const artboardScale = canvasViewport
    ? Math.max(0.01, Math.min(
        canvasViewport.width / Math.max(1, visualDesignWidth),
        canvasViewport.height / Math.max(1, visualDesignHeight),
      ))
    : 1
  const artboardWidth = visualDesignWidth * artboardScale
  const artboardHeight = visualDesignHeight * artboardScale
  const isComposite = visual.mode === 'composite'
  const isEditable = isComposite && mode === 'editor' && !readOnly
  const activeCreateTool = isEditable ? createTool : null
  const showDesignGrid = isComposite && mode === 'editor' && gridVisible
  const canTransformSelection = selectedLayerIds.length === 1 && !activeCreateTool && selectedLayer?.parentId === null
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
    const element = canvasHostRef.current

    if (!element) {
      return
    }
    setSelectionColor(getComputedStyle(element).getPropertyValue('--ui-color-accent').trim())

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

  useEffect(() => () => clearMarqueeSession(), [])

  useEffect(() => {
    if (isEditable) return
    setCreateStart(null)
    setCreateCurrent(null)
    setCreateConstrainAspectRatio(false)
    clearComponentCreateTool()
  }, [isEditable])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreEditorShortcut(event)) {
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
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

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

    if (!layerId || !layer || layer.parentId !== null) {
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
      !Number.isFinite(layer.transform.scaleX) ||
      !Number.isFinite(layer.transform.scaleY) ||
      Math.abs(layer.transform.scaleX) < 0.001 ||
      Math.abs(layer.transform.scaleY) < 0.001 ||
      Math.abs(scaleX) < 0.001 ||
      Math.abs(scaleY) < 0.001
    ) {
      return
    }

    const resizeScaleX = scaleX / layer.transform.scaleX
    const resizeScaleY = scaleY / layer.transform.scaleY
    const normalizedTransforms = applyResizeDeltaToLayerTransforms(
      visual,
      layer,
      resizeScaleX,
      resizeScaleY,
    )
    const nextLayerTransform = normalizedTransforms?.get(layerId)

    if (nextLayerTransform) {
      node.scaleX(nextLayerTransform.scaleX)
      node.scaleY(nextLayerTransform.scaleY)
    }

    onChange({
      ...visual,
      layers: visual.layers.map((candidate) => {
        const normalizedTransform = normalizedTransforms?.get(candidate.id)

        if (candidate.id === layerId) {
          return {
            ...candidate,
            transform: {
              ...(nextLayerTransform ?? candidate.transform),
              x: node.x(),
              y: node.y(),
              rotation: node.rotation(),
            },
          }
        }

        return normalizedTransform
          ? { ...candidate, transform: normalizedTransform }
          : candidate
      }),
    })
  }

  function resolveLayerNode(target: Konva.Node) {
    const stage = stageRef.current
    const layerId = getCompositeVisualLayerId(target, 'outermost')

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

  function getMovableLayerIds(layerIds: readonly string[]) {
    const selectedIds = new Set(layerIds)

    return visual.layers
      .filter((layer) =>
        layer.parentId === null &&
        layer.visible &&
        selectedIds.has(layer.id),
      )
      .map((layer) => layer.id)
  }

  function beginLayerDrag(target: Konva.Node) {
    clearSnapGuides()
    setManagedSvgHighlightPoints([])

    if (!isEditable || layerDragSessionRef.current) {
      return
    }

    const draggedLayerId = getCompositeVisualLayerId(target, 'outermost')
    if (!draggedLayerId) {
      return
    }

    const draggedLayer = visual.layers.find((layer) => layer.id === draggedLayerId)

    if (!draggedLayer || draggedLayer.parentId !== null) {
      return
    }

    let selectedIds = pendingLayerSelectionRef.current ?? selectedLayerIds

    if (!selectedIds.includes(draggedLayerId)) {
      selectedIds = [draggedLayerId]
      onSelectionReplace(selectedIds)
    }

    const layerIds = getMovableLayerIds(selectedIds)
    const initialTransforms: Record<string, LayerPositionSnapshot> = {}
    const stage = stageRef.current

    for (const layerId of layerIds) {
      const node = stage ? findLayerNode(stage, layerId) : undefined

      if (!node) {
        continue
      }

      initialTransforms[layerId] = {
        x: node.x(),
        y: node.y(),
      }
    }

    if (!initialTransforms[draggedLayerId]) {
      pendingLayerSelectionRef.current = null
      return
    }

    layerDragSessionRef.current = {
      draggedLayerId,
      layerIds: Object.keys(initialTransforms),
      initialTransforms,
    }

    for (const layerId of Object.keys(initialTransforms)) {
      if (layerId === draggedLayerId) {
        continue
      }

      const node = stage ? findLayerNode(stage, layerId) : undefined
      node?.draggable(false)
    }
    pendingLayerSelectionRef.current = null
  }

  function previewLayerDrag(target: Konva.Node) {
    const session = layerDragSessionRef.current

    if (!session) {
      return
    }

    const draggedTransform = session.initialTransforms[session.draggedLayerId]
    const draggedNode = resolveLayerNode(target)

    if (!draggedTransform || !draggedNode) {
      return
    }

    if (getCompositeVisualLayerId(draggedNode, 'outermost') !== session.draggedLayerId) {
      return
    }

    const delta = {
      x: draggedNode.x() - draggedTransform.x,
      y: draggedNode.y() - draggedTransform.y,
    }
    const stage = stageRef.current

    for (const layerId of session.layerIds) {
      const node = stage ? findLayerNode(stage, layerId) : undefined
      const initial = session.initialTransforms[layerId]

      if (!node || !initial || node === draggedNode) {
        continue
      }

      node.position({
        x: initial.x + delta.x,
        y: initial.y + delta.y,
      })
    }

    if (!isEditable || !snapEnabled) {
      clearSnapGuides()
      return
    }

    const node = resolveLayerNode(target)

    if (!stage || !node) {
      clearSnapGuides()
      return
    }

    renderSnapGuides(
      computeComponentLayerSnap(
        stage,
        node,
        visual,
        artboardScale,
        gridSize,
        session.layerIds,
      ),
    )
  }

  function finishLayerDrag(target: Konva.Node) {
    const session = layerDragSessionRef.current
    const stage = stageRef.current
    const node = resolveLayerNode(target)

    if (!session || !stage || !node) {
      clearSnapGuides()
      layerDragSessionRef.current = null
      return
    }

    if (getCompositeVisualLayerId(node, 'outermost') !== session.draggedLayerId) {
      return
    }

    const draggedTransform = session.initialTransforms[session.draggedLayerId]
    const rawDelta = draggedTransform
      ? {
          x: node.x() - draggedTransform.x,
          y: node.y() - draggedTransform.y,
        }
      : { x: 0, y: 0 }
    let snapCorrection = { x: 0, y: 0 }

    if (isEditable && snapEnabled && draggedTransform) {
      const beforeSnap = { x: node.x(), y: node.y() }
      applyComponentLayerSnap(
        node,
        computeComponentLayerSnap(
          stage,
          node,
          visual,
          artboardScale,
          gridSize,
          session.layerIds,
        ),
      )
      snapCorrection = {
        x: node.x() - beforeSnap.x,
        y: node.y() - beforeSnap.y,
      }
    }

    const updates = new Map<string, LayerPositionSnapshot>()

    for (const layerId of session.layerIds) {
      const initial = session.initialTransforms[layerId]
      const currentNode = findLayerNode(stage, layerId)

      if (!initial || !currentNode) {
        continue
      }

      if (currentNode !== node) {
        currentNode.position({
          x: initial.x + rawDelta.x + snapCorrection.x,
          y: initial.y + rawDelta.y + snapCorrection.y,
        })
      }

      updates.set(layerId, {
        x: currentNode.x(),
        y: currentNode.y(),
      })
    }

    for (const layerId of session.layerIds) {
      findLayerNode(stage, layerId)?.draggable(true)
    }

    if (updates.size > 0) {
      onChange({
        ...visual,
        layers: visual.layers.map((layer) => {
          const transform = updates.get(layer.id)

          return transform
            ? { ...layer, transform: { ...layer.transform, ...transform } }
            : layer
        }),
      })
    }

    clearSnapGuides()
    layerDragSessionRef.current = null
    pendingLayerSelectionRef.current = null
  }

  function handlePointerTarget(target: Konva.Node, toggle = false) {
    if (!isEditable || activeCreateTool || isInsideTransformer(target, transformerRef.current)) {
      return false
    }

    const layerId = getCompositeVisualLayerId(target, 'outermost')

    if (!layerId) {
      return false
    }

    const alreadySelected = selectedLayerIds.includes(layerId)
    const nextSelection = toggle
      ? alreadySelected
        ? selectedLayerIds.filter((id) => id !== layerId)
        : [...selectedLayerIds, layerId]
      : alreadySelected
        ? [...selectedLayerIds.filter((id) => id !== layerId), layerId]
        : [layerId]

    pendingLayerSelectionRef.current = nextSelection
    onSelectionReplace(nextSelection)
    return true
  }

  function getStagePointer() {
    const pointer = stageRef.current?.getPointerPosition()

    return pointer
      ? { x: pointer.x, y: pointer.y }
      : null
  }

  function clearMarqueeSession() {
    marqueeSessionRef.current = null
    setMarquee(null)
  }

  function beginMarqueeCandidate(nativeEvent: MouseEvent) {
    if (!isEditable || activeCreateTool || nativeEvent.button !== 0) {
      return
    }

    const start = getStagePointer()

    if (!start) {
      return
    }

    clearMarqueeSession()
    marqueeSessionRef.current = {
      start,
      current: start,
      additive: hasSelectionModifier(nativeEvent),
      active: false,
    }
  }

  function updateMarquee() {
    const session = marqueeSessionRef.current
    const current = getStagePointer()

    if (!session || !current) {
      return
    }

    const movedEnough =
      Math.abs(current.x - session.start.x) >= MARQUEE_THRESHOLD ||
      Math.abs(current.y - session.start.y) >= MARQUEE_THRESHOLD
    const nextSession: MarqueeSession = {
      ...session,
      current,
      active: session.active || movedEnough,
    }

    marqueeSessionRef.current = nextSession
    setMarquee(
      nextSession.active
        ? {
            start: nextSession.start,
            current: nextSession.current,
            additive: nextSession.additive,
          }
        : null,
    )
  }

  function finishMarquee() {
    const session = marqueeSessionRef.current

    clearMarqueeSession()

    if (!session) {
      return false
    }

    if (!session.active) {
      if (!session.additive) {
        onSelectionReplace([])
      }
      return true
    }

    const selectionBounds = normalizeMarquee(session)
    const stage = stageRef.current
    const matchedIds = stage
      ? visual.layers
          .filter((layer) => layer.parentId === null && layer.visible)
          .filter((layer) => {
            const node = findLayerNode(stage, layer.id)
            if (!node) {
              return false
            }

            const renderedBounds = node.getClientRect({ relativeTo: stage })
            const layerBounds =
              renderedBounds.width > 0 && renderedBounds.height > 0
                ? renderedBounds
                : getLayerFallbackBounds(layer, artboardScale)

            return boundsIntersect(selectionBounds, layerBounds)
          })
          .map((layer) => layer.id)
      : []

    onSelectionReplace(
      session.additive
        ? Array.from(new Set([...selectedLayerIds, ...matchedIds]))
        : matchedIds,
    )
    return true
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
            onClick={onUndo}
          >
            <UndoIcon />
          </ToolbarButton>
          <ToolbarButton
            iconOnly
            className="icon-button component-redo-command"
            title="重做 (Ctrl+Shift+Z)"
            aria-label="重做"
            disabled={!isEditable || !canRedo}
            onClick={onRedo}
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
          ref={onArtboardElementChange}
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
            <>
              {visual.layers.length === 0 && (
                <div className="component-artboard-empty" aria-label="空组件画布">
                  <strong>{mode === 'preview' ? '暂无视觉内容' : '开始设计'}</strong>
                  <span>{mode === 'preview' ? '空组件' : '从左侧添加图元'}</span>
                  <small>
                    {mode === 'preview'
                      ? '当前组件没有可预览的图层。'
                      : '双击图元居中添加，或拖动图元到画布中的位置。'}
                  </small>
                </div>
              )}
              <Stage
                ref={stageRef}
                width={artboardWidth}
                height={artboardHeight}
                listening={isEditable}
                onMouseDown={(event) => {
                  if (activeCreateTool && event.evt.button !== 0) return
                  if (beginCreate(event.evt.shiftKey)) return

                  if (isInsideTransformer(event.target, transformerRef.current)) {
                    return
                  }

                  if (!handlePointerTarget(
                    event.target,
                    event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey,
                  )) {
                    beginMarqueeCandidate(event.evt)
                  }
                }}
                onMouseMove={(event) => {
                  updateCreate(event.evt.shiftKey)
                  updateMarquee()
                }}
                onTouchStart={(event) => {
                  if (beginCreate()) return
                  if (!handlePointerTarget(event.target)) {
                    onSelectionReplace([])
                  }
                }}
                onTouchMove={() => updateCreate()}
                onTouchEnd={() => finishCreate()}
                onMouseUp={(event) => {
                  if (!finishMarquee()) {
                    finishCreate(event.evt.shiftKey)
                    if (!layerDragSessionRef.current) {
                      pendingLayerSelectionRef.current = null
                    }
                  }
                }}
                onMouseLeave={() => clearMarqueeSession()}
                onDragStart={(event) => beginLayerDrag(event.target)}
                onDragMove={(event) => previewLayerDrag(event.target)}
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
                    nonScalingStrokes={isEditable}
                  />
                  {activeCreateTool && createGeometry && (
                    <Group scaleX={artboardScale} scaleY={artboardScale} listening={false}>
                      <CreateGeometryPreview
                        selectionColor={selectionColor}
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
                    ignoreStroke={isEditable}
                    keepRatio={false}
                    anchorSize={7}
                    rotateAnchorOffset={22}
                    borderStroke={selectionColor}
                    anchorStroke={selectionColor}
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
                    stroke={selectionColor}
                    strokeWidth={1}
                    dash={[4, 4]}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                  <Line
                    ref={horizontalGuideRef}
                    visible={false}
                    points={[]}
                    stroke={selectionColor}
                    strokeWidth={1}
                    dash={[4, 4]}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                  {marquee && (
                    <Rect
                      name="component-selection-marquee"
                      {...normalizeMarquee(marquee)}
                      fill="rgba(19, 119, 102, 0.12)"
                      stroke={selectionColor}
                      strokeWidth={1}
                      dash={[5, 4]}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  )}
                </Layer>
              </Stage>
            </>
          ) : (
            <div className="component-artboard-placeholder">
              <strong>{componentTitle}</strong>
              <span>内置组件</span>
              <small>内部图形只读；可在右侧查看配置，或切换到预览。</small>
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
