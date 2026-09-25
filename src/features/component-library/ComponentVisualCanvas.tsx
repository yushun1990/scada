import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type Konva from 'konva'
import { Arc, Circle, Ellipse, Group, Layer, Line, Rect, RegularPolygon, Stage, Text, Transformer } from 'react-konva'
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
import {
  resolveVisualVectorStyle,
  type ComponentVisualDefinition,
  type VectorVisualLayer,
} from '../../component-system/visual'
import { calculateOriginOffset } from '../../component-system/CompositeComponentVisualRenderer'
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
  const container = element.closest<HTMLDivElement>('.component-workspace')
  const style = window.getComputedStyle(element)
  const horizontalPadding =
    Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
  const verticalPadding =
    Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)

  const effectiveWidth = element.clientWidth < 200 && container
    ? Math.max(container.clientWidth - 112, 1)
    : element.clientWidth

  return {
    width: Math.max(
      1,
      effectiveWidth - horizontalPadding - WORKBENCH_ARTBOARD_FIT_GUTTER,
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

  if (tool.primitive === 'polygon') {
    return (
      <RegularPolygon
        x={geometry.x + geometry.width / 2}
        y={geometry.y + geometry.height / 2}
        sides={tool.initialSides ?? 3}
        radius={Math.min(geometry.width, geometry.height) / 2}
        stroke={selectionColor}
        strokeWidth={strokeWidth}
        dash={dash}
        listening={false}
        perfectDrawEnabled={false}
      />
    )
  }

  if (tool.primitive === 'arc') {
    const outerRadius = Math.min(geometry.width, geometry.height) / 2
    const innerRadius = outerRadius * (tool.initialInnerRadiusRatio ?? 0)
    return (
      <Arc
        x={geometry.x + geometry.width / 2}
        y={geometry.y + geometry.height / 2}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        angle={tool.initialAngle ?? 270}
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
      cornerRadius={tool.initialStyle?.cornerRadius}
      stroke={selectionColor}
      strokeWidth={strokeWidth}
      dash={dash}
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}

const LINE_OVERLAY_NODE_NAME = 'line-interaction-overlay'

function isInsideLineOverlay(target: Konva.Node | null) {
  let current: Konva.Node | null = target
  while (current) {
    if (current.hasName(LINE_OVERLAY_NODE_NAME)) return true
    current = current.getParent()
  }
  return false
}

function getLineEndpoints(transform: VectorVisualLayer['transform']) {
  const { x, y, width, height, rotation, scaleX, scaleY } = transform
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const halfH = height / 2

  const p1 = {
    x: x - sin * halfH * scaleY,
    y: y + cos * halfH * scaleY,
  }

  const p2 = {
    x: x + cos * width * scaleX - sin * halfH * scaleY,
    y: y + sin * width * scaleX + cos * halfH * scaleY,
  }

  return { p1, p2 }
}

function getLineDesignVertices(layer: VectorVisualLayer): { x: number; y: number }[] {
  if (layer.points && layer.points.length >= 4) {
    const { x, y, rotation, scaleX, scaleY } = layer.transform
    const rad = (rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const result: { x: number; y: number }[] = []
    for (let i = 0; i < layer.points.length; i += 2) {
      const lx = layer.points[i] * scaleX
      const ly = layer.points[i + 1] * scaleY
      result.push({
        x: x + lx * cos - ly * sin,
        y: y + lx * sin + ly * cos,
      })
    }
    return result
  }
  const { p1, p2 } = getLineEndpoints(layer.transform)
  return [p1, p2]
}

function normalizePolylineLayer(
  layer: VectorVisualLayer,
  vertices: { x: number; y: number }[],
): VectorVisualLayer {
  const xs = vertices.map((v) => v.x)
  const ys = vertices.map((v) => v.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const strokeWidth = layer.style?.strokeWidth ?? 2
  const width = Math.max(8, maxX - minX)
  const height = Math.max(8, maxY - minY, strokeWidth * 2)

  const points: number[] = []
  for (const v of vertices) {
    points.push(Math.round((v.x - minX) * 100) / 100, Math.round((v.y - minY) * 100) / 100)
  }

  return {
    ...layer,
    transform: {
      ...layer.transform,
      x: Math.round(minX * 100) / 100,
      y: Math.round(minY * 100) / 100,
      width,
      height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    points,
  }
}

function convertTwoVerticesToLineLayer(
  layer: VectorVisualLayer,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): VectorVisualLayer {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const newWidth = Math.max(4, Math.hypot(dx, dy))
  const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
  const newRad = (newRotation * Math.PI) / 180
  const strokeWidth = layer.style?.strokeWidth ?? 2
  const halfH = Math.max(4, strokeWidth)
  const newX = p1.x + Math.sin(newRad) * halfH
  const newY = p1.y - Math.cos(newRad) * halfH

  return {
    ...layer,
    transform: {
      ...layer.transform,
      x: Math.round(newX * 100) / 100,
      y: Math.round(newY * 100) / 100,
      width: Math.round(newWidth * 100) / 100,
      height: halfH * 2,
      rotation: Math.round(newRotation * 100) / 100,
      scaleX: 1,
      scaleY: 1,
    },
    points: undefined,
  }
}

function projectPointToLineSegments(
  vertices: { x: number; y: number }[],
  click: { x: number; y: number },
) {
  if (vertices.length < 2) return null
  let bestDist = Infinity
  let bestSeg = 0
  let bestPoint = { x: click.x, y: click.y }

  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i]
    const b = vertices[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-6) continue

    const t = Math.max(0, Math.min(1, ((click.x - a.x) * dx + (click.y - a.y) * dy) / lenSq))
    const projX = a.x + t * dx
    const projY = a.y + t * dy
    const dist = Math.hypot(click.x - projX, click.y - projY)

    if (dist < bestDist) {
      bestDist = dist
      bestSeg = i
      bestPoint = {
        x: Math.round(projX * 100) / 100,
        y: Math.round(projY * 100) / 100,
      }
    }
  }

  return {
    segmentIndex: bestSeg,
    point: bestPoint,
    distance: bestDist,
  }
}

function snapAngleToCardinal(
  fromPoint: { x: number; y: number },
  toPoint: { x: number; y: number },
  toleranceDeg = 4,
): { x: number; y: number } {
  const dx = toPoint.x - fromPoint.x
  const dy = toPoint.y - fromPoint.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-3) return toPoint

  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  const cardinals = [0, 45, 90, 135, 180, -45, -90, -135, -180]
  for (const card of cardinals) {
    if (Math.abs(deg - card) <= toleranceDeg) {
      const rad = (card * Math.PI) / 180
      return {
        x: fromPoint.x + Math.cos(rad) * dist,
        y: fromPoint.y + Math.sin(rad) * dist,
      }
    }
  }
  return toPoint
}

type LineInteractionOverlayProps = {
  layer: VectorVisualLayer
  artboardScale: number
  selectionColor: string
  gridSize: number
  snapEnabled: boolean
  onPreviewChange: (previewLayer: VectorVisualLayer | null) => void
  onCommit: (committedLayer: VectorVisualLayer) => void
}

function LineInteractionOverlay({
  layer,
  artboardScale,
  selectionColor,
  gridSize,
  snapEnabled,
  onPreviewChange,
  onCommit,
}: LineInteractionOverlayProps) {
  const [thicknessDragging, setThicknessDragging] = useState<number | null>(null)

  const isPolyline = Boolean(layer.points && layer.points.length >= 4)
  const vertices = useMemo(() => getLineDesignVertices(layer), [layer])

  const strokeWidth = layer.style?.strokeWidth ?? 2
  const handleDist = Math.max(14 / artboardScale, strokeWidth / 2 + 10 / artboardScale)
  const anchorRadius = 6 / artboardScale
  const strokeW = 1.5 / artboardScale
  const squareSize = 8 / artboardScale

  // Find longest segment for thickness handle
  let longestSegIdx = 0
  let maxSegLen = 0
  for (let i = 0; i < vertices.length - 1; i++) {
    const d = Math.hypot(vertices[i + 1].x - vertices[i].x, vertices[i + 1].y - vertices[i].y)
    if (d > maxSegLen) {
      maxSegLen = d
      longestSegIdx = i
    }
  }
  const sa = vertices[longestSegIdx] ?? { x: 0, y: 0 }
  const sb = vertices[longestSegIdx + 1] ?? { x: 10, y: 0 }
  const segMid = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 }
  const segLen = Math.max(1, maxSegLen)
  const segNormal = {
    x: -(sb.y - sa.y) / segLen,
    y: (sb.x - sa.x) / segLen,
  }

  const pTop = {
    x: segMid.x + segNormal.x * handleDist,
    y: segMid.y + segNormal.y * handleDist,
  }
  const pBottom = {
    x: segMid.x - segNormal.x * handleDist,
    y: segMid.y - segNormal.y * handleDist,
  }

  // Flatten vertices for dashed guide
  const guidePoints = useMemo(() => vertices.flatMap((v) => [v.x, v.y]), [vertices])

  // 2-point line specific handles
  const p1 = vertices[0] ?? { x: 0, y: 0 }
  const p2 = vertices[1] ?? { x: 0, y: 0 }
  const halfH = layer.transform.height / 2

  function handleEndDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    const stage = e.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    let curX = pointer.x / artboardScale
    let curY = pointer.y / artboardScale

    if (e.evt.shiftKey) {
      const dx = curX - p1.x
      const dy = curY - p1.y
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const snappedAngle = Math.round(angle / 15) * 15
      const snappedRad = (snappedAngle * Math.PI) / 180
      const dist = Math.hypot(dx, dy)
      curX = p1.x + Math.cos(snappedRad) * dist
      curY = p1.y + Math.sin(snappedRad) * dist
    }

    const dx = curX - p1.x
    const dy = curY - p1.y
    const newWidth = Math.max(4, Math.hypot(dx, dy))
    const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
    const newRad = (newRotation * Math.PI) / 180

    const newX = p1.x + Math.sin(newRad) * halfH
    const newY = p1.y - Math.cos(newRad) * halfH

    const nextLayer: VectorVisualLayer = {
      ...layer,
      transform: {
        ...layer.transform,
        x: newX,
        y: newY,
        width: newWidth,
        rotation: newRotation,
        scaleX: 1,
        scaleY: 1,
      },
    }
    onPreviewChange(nextLayer)
  }

  function handleEndDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    e.target.position({ x: 0, y: 0 })
    const stage = e.target.getStage()
    if (!stage) {
      onPreviewChange(null)
      return
    }
    const pointer = stage.getPointerPosition()
    if (!pointer) {
      onPreviewChange(null)
      return
    }

    let curX = pointer.x / artboardScale
    let curY = pointer.y / artboardScale

    if (snapEnabled) {
      const cardinalSnapped = snapAngleToCardinal(p1, { x: curX, y: curY }, 4)
      if (cardinalSnapped.x !== curX || cardinalSnapped.y !== curY) {
        curX = cardinalSnapped.x
        curY = cardinalSnapped.y
      } else {
        curX = Math.round(curX / gridSize) * gridSize
        curY = Math.round(curY / gridSize) * gridSize
      }
    }

    if (e.evt.shiftKey) {
      const dx = curX - p1.x
      const dy = curY - p1.y
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const snappedAngle = Math.round(angle / 15) * 15
      const snappedRad = (snappedAngle * Math.PI) / 180
      const dist = Math.hypot(dx, dy)
      curX = p1.x + Math.cos(snappedRad) * dist
      curY = p1.y + Math.sin(snappedRad) * dist
    }

    const dx = curX - p1.x
    const dy = curY - p1.y
    const newWidth = Math.max(4, Math.hypot(dx, dy))
    const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
    const newRad = (newRotation * Math.PI) / 180

    const newX = p1.x + Math.sin(newRad) * halfH
    const newY = p1.y - Math.cos(newRad) * halfH

    const nextLayer: VectorVisualLayer = {
      ...layer,
      transform: {
        ...layer.transform,
        x: newX,
        y: newY,
        width: newWidth,
        rotation: newRotation,
        scaleX: 1,
        scaleY: 1,
      },
    }
    onPreviewChange(null)
    onCommit(nextLayer)
  }

  function handleStartDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    const stage = e.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    let curX = pointer.x / artboardScale
    let curY = pointer.y / artboardScale

    if (e.evt.shiftKey) {
      const dx = p2.x - curX
      const dy = p2.y - curY
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const snappedAngle = Math.round(angle / 15) * 15
      const snappedRad = (snappedAngle * Math.PI) / 180
      const dist = Math.hypot(dx, dy)
      curX = p2.x - Math.cos(snappedRad) * dist
      curY = p2.y - Math.sin(snappedRad) * dist
    }

    const dx = p2.x - curX
    const dy = p2.y - curY
    const newWidth = Math.max(4, Math.hypot(dx, dy))
    const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
    const newRad = (newRotation * Math.PI) / 180

    const newX = curX + Math.sin(newRad) * halfH
    const newY = curY - Math.cos(newRad) * halfH

    const nextLayer: VectorVisualLayer = {
      ...layer,
      transform: {
        ...layer.transform,
        x: newX,
        y: newY,
        width: newWidth,
        rotation: newRotation,
        scaleX: 1,
        scaleY: 1,
      },
    }
    onPreviewChange(nextLayer)
  }

  function handleStartDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    e.target.position({ x: 0, y: 0 })
    const stage = e.target.getStage()
    if (!stage) {
      onPreviewChange(null)
      return
    }
    const pointer = stage.getPointerPosition()
    if (!pointer) {
      onPreviewChange(null)
      return
    }

    let curX = pointer.x / artboardScale
    let curY = pointer.y / artboardScale

    if (snapEnabled) {
      const cardinalSnapped = snapAngleToCardinal(p2, { x: curX, y: curY }, 4)
      if (cardinalSnapped.x !== curX || cardinalSnapped.y !== curY) {
        curX = cardinalSnapped.x
        curY = cardinalSnapped.y
      } else {
        curX = Math.round(curX / gridSize) * gridSize
        curY = Math.round(curY / gridSize) * gridSize
      }
    }

    if (e.evt.shiftKey) {
      const dx = p2.x - curX
      const dy = p2.y - curY
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI
      const snappedAngle = Math.round(angle / 15) * 15
      const snappedRad = (snappedAngle * Math.PI) / 180
      const dist = Math.hypot(dx, dy)
      curX = p2.x - Math.cos(snappedRad) * dist
      curY = p2.y - Math.sin(snappedRad) * dist
    }

    const dx = p2.x - curX
    const dy = p2.y - curY
    const newWidth = Math.max(4, Math.hypot(dx, dy))
    const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
    const newRad = (newRotation * Math.PI) / 180

    const newX = curX + Math.sin(newRad) * halfH
    const newY = curY - Math.cos(newRad) * halfH

    const nextLayer: VectorVisualLayer = {
      ...layer,
      transform: {
        ...layer.transform,
        x: newX,
        y: newY,
        width: newWidth,
        rotation: newRotation,
        scaleX: 1,
        scaleY: 1,
      },
    }
    onPreviewChange(null)
    onCommit(nextLayer)
  }

  function handleVertexDragMove(index: number, e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    const stage = e.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const curX = pointer.x / artboardScale
    const curY = pointer.y / artboardScale

    const nextVertices = vertices.map((v, i) => (i === index ? { x: curX, y: curY } : v))
    const preview = normalizePolylineLayer(layer, nextVertices)
    onPreviewChange(preview)
  }

  function handleVertexDragEnd(index: number, e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    e.target.position({ x: 0, y: 0 })
    const stage = e.target.getStage()
    if (!stage) {
      onPreviewChange(null)
      return
    }
    const pointer = stage.getPointerPosition()
    if (!pointer) {
      onPreviewChange(null)
      return
    }

    let curX = pointer.x / artboardScale
    let curY = pointer.y / artboardScale

    if (snapEnabled) {
      curX = Math.round(curX / gridSize) * gridSize
      curY = Math.round(curY / gridSize) * gridSize
    }

    const nextVertices = vertices.map((v, i) => (i === index ? { x: curX, y: curY } : v))
    const committed = normalizePolylineLayer(layer, nextVertices)
    onPreviewChange(null)
    onCommit(committed)
  }

  function handleVertexDblClick(index: number) {
    if (vertices.length <= 2) return
    if (index === 0 || index === vertices.length - 1) return
    const nextVertices = vertices.filter((_, i) => i !== index)
    if (nextVertices.length === 2) {
      const converted = convertTwoVerticesToLineLayer(layer, nextVertices[0], nextVertices[1])
      onCommit(converted)
    } else {
      const normalized = normalizePolylineLayer(layer, nextVertices)
      onCommit(normalized)
    }
  }

  function handleThicknessDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    const stage = e.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const curX = pointer.x / artboardScale
    const curY = pointer.y / artboardScale

    const vx = curX - segMid.x
    const vy = curY - segMid.y
    const perpDist = Math.abs(vx * segNormal.x + vy * segNormal.y)
    let nextStrokeWidth = Math.max(1, Math.round(perpDist * 2))

    if (e.evt.shiftKey) {
      nextStrokeWidth = Math.max(1, Math.round(nextStrokeWidth / 2) * 2)
    }

    setThicknessDragging(nextStrokeWidth)

    if (isPolyline) {
      const nextLayer: VectorVisualLayer = {
        ...layer,
        style: {
          ...resolveVisualVectorStyle(layer),
          strokeWidth: nextStrokeWidth,
        },
      }
      onPreviewChange(nextLayer)
    } else {
      const nextHeight = Math.max(8, nextStrokeWidth * 2)
      const rad = (layer.transform.rotation * Math.PI) / 180
      const nextX = p1.x + Math.sin(rad) * (nextHeight / 2)
      const nextY = p1.y - Math.cos(rad) * (nextHeight / 2)

      const nextLayer: VectorVisualLayer = {
        ...layer,
        transform: {
          ...layer.transform,
          x: nextX,
          y: nextY,
          height: nextHeight,
        },
        style: {
          ...resolveVisualVectorStyle(layer),
          strokeWidth: nextStrokeWidth,
        },
      }
      onPreviewChange(nextLayer)
    }
  }

  function handleThicknessDragEnd(e: Konva.KonvaEventObject<DragEvent>) {
    e.cancelBubble = true
    e.target.position({ x: 0, y: 0 })
    setThicknessDragging(null)
    const stage = e.target.getStage()
    if (!stage) {
      onPreviewChange(null)
      return
    }
    const pointer = stage.getPointerPosition()
    if (!pointer) {
      onPreviewChange(null)
      return
    }

    const curX = pointer.x / artboardScale
    const curY = pointer.y / artboardScale

    const vx = curX - segMid.x
    const vy = curY - segMid.y
    const perpDist = Math.abs(vx * segNormal.x + vy * segNormal.y)
    let nextStrokeWidth = Math.max(1, Math.round(perpDist * 2))

    if (e.evt.shiftKey) {
      nextStrokeWidth = Math.max(1, Math.round(nextStrokeWidth / 2) * 2)
    }

    if (isPolyline) {
      const nextLayer: VectorVisualLayer = {
        ...layer,
        style: {
          ...resolveVisualVectorStyle(layer),
          strokeWidth: nextStrokeWidth,
        },
      }
      onPreviewChange(null)
      onCommit(nextLayer)
    } else {
      const nextHeight = Math.max(8, nextStrokeWidth * 2)
      const rad = (layer.transform.rotation * Math.PI) / 180
      const nextX = p1.x + Math.sin(rad) * (nextHeight / 2)
      const nextY = p1.y - Math.cos(rad) * (nextHeight / 2)

      const nextLayer: VectorVisualLayer = {
        ...layer,
        transform: {
          ...layer.transform,
          x: nextX,
          y: nextY,
          height: nextHeight,
        },
        style: {
          ...resolveVisualVectorStyle(layer),
          strokeWidth: nextStrokeWidth,
        },
      }
      onPreviewChange(null)
      onCommit(nextLayer)
    }
  }

  return (
    <Group name={LINE_OVERLAY_NODE_NAME}>
      {/* Dashed guide between endpoints / vertices */}
      <Line
        points={guidePoints}
        stroke={selectionColor}
        strokeWidth={1 / artboardScale}
        dash={[4 / artboardScale, 4 / artboardScale]}
        listening={false}
      />
      {/* Dashed perpendicular guide across midpoint for thickness */}
      <Line
        points={[pTop.x, pTop.y, pBottom.x, pBottom.y]}
        stroke={selectionColor}
        strokeWidth={1 / artboardScale}
        opacity={0.6}
        dash={[2 / artboardScale, 2 / artboardScale]}
        listening={false}
      />

      {/* Handles */}
      {isPolyline ? (
        vertices.map((v, index) => (
          <Group key={index} x={v.x} y={v.y}>
            <Circle
              x={0}
              y={0}
              radius={anchorRadius}
              fill="#ffffff"
              stroke={selectionColor}
              strokeWidth={strokeW}
              hitStrokeWidth={18 / artboardScale}
              draggable
              onDragStart={(e) => {
                e.cancelBubble = true
              }}
              onDragMove={(e) => handleVertexDragMove(index, e)}
              onDragEnd={(e) => handleVertexDragEnd(index, e)}
              onDblClick={(e) => {
                e.cancelBubble = true
                handleVertexDblClick(index)
              }}
              onDblTap={(e) => {
                e.cancelBubble = true
                handleVertexDblClick(index)
              }}
              onMouseEnter={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'crosshair'
              }}
              onMouseLeave={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'default'
              }}
            />
          </Group>
        ))
      ) : (
        <>
          {/* P1 Start Handle */}
          <Group x={p1.x} y={p1.y}>
            <Circle
              x={0}
              y={0}
              radius={anchorRadius}
              fill="#ffffff"
              stroke={selectionColor}
              strokeWidth={strokeW}
              hitStrokeWidth={18 / artboardScale}
              draggable
              onDragStart={(e) => {
                e.cancelBubble = true
              }}
              onDragMove={handleStartDragMove}
              onDragEnd={handleStartDragEnd}
              onMouseEnter={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'crosshair'
              }}
              onMouseLeave={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'default'
              }}
            />
          </Group>
          {/* P2 End Handle */}
          <Group x={p2.x} y={p2.y}>
            <Circle
              x={0}
              y={0}
              radius={anchorRadius}
              fill="#ffffff"
              stroke={selectionColor}
              strokeWidth={strokeW}
              hitStrokeWidth={18 / artboardScale}
              draggable
              onDragStart={(e) => {
                e.cancelBubble = true
              }}
              onDragMove={handleEndDragMove}
              onDragEnd={handleEndDragEnd}
              onMouseEnter={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'crosshair'
              }}
              onMouseLeave={(e) => {
                const st = e.target.getStage()
                if (st) st.container().style.cursor = 'default'
              }}
            />
          </Group>
        </>
      )}

      {/* Top Thickness Handle */}
      <Group x={pTop.x} y={pTop.y}>
        <Rect
          x={-squareSize / 2}
          y={-squareSize / 2}
          width={squareSize}
          height={squareSize}
          fill="#ffffff"
          stroke={selectionColor}
          strokeWidth={strokeW}
          hitStrokeWidth={18 / artboardScale}
          draggable
          onDragStart={(e) => {
            e.cancelBubble = true
          }}
          onDragMove={handleThicknessDragMove}
          onDragEnd={handleThicknessDragEnd}
          onMouseEnter={(e) => {
            const st = e.target.getStage()
            if (st) st.container().style.cursor = 'ns-resize'
          }}
          onMouseLeave={(e) => {
            const st = e.target.getStage()
            if (st) st.container().style.cursor = 'default'
          }}
        />
      </Group>
      {/* Bottom Thickness Handle */}
      <Group x={pBottom.x} y={pBottom.y}>
        <Rect
          x={-squareSize / 2}
          y={-squareSize / 2}
          width={squareSize}
          height={squareSize}
          fill="#ffffff"
          stroke={selectionColor}
          strokeWidth={strokeW}
          hitStrokeWidth={18 / artboardScale}
          draggable
          onDragStart={(e) => {
            e.cancelBubble = true
          }}
          onDragMove={handleThicknessDragMove}
          onDragEnd={handleThicknessDragEnd}
          onMouseEnter={(e) => {
            const st = e.target.getStage()
            if (st) st.container().style.cursor = 'ns-resize'
          }}
          onMouseLeave={(e) => {
            const st = e.target.getStage()
            if (st) st.container().style.cursor = 'default'
          }}
        />
      </Group>
      {/* Live Width Badge */}
      {thicknessDragging !== null && (
        <Group x={segMid.x} y={segMid.y - handleDist - 16 / artboardScale} listening={false}>
          <Rect
            x={-24 / artboardScale}
            y={-10 / artboardScale}
            width={48 / artboardScale}
            height={20 / artboardScale}
            cornerRadius={4 / artboardScale}
            fill="#1e293b"
            opacity={0.9}
          />
          <Text
            text={`${thicknessDragging}px`}
            x={-24 / artboardScale}
            y={-5 / artboardScale}
            width={48 / artboardScale}
            align="center"
            fontSize={11 / artboardScale}
            fill="#ffffff"
          />
        </Group>
      )}
    </Group>
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
  const lineOverlayGroupRef = useRef<Konva.Group>(null)
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
  const selectedLineLayer = useMemo(() => {
    if (selectedVisibleLayerIds.length !== 1) return null
    const layer = visual.layers.find((candidate) => candidate.id === selectedVisibleLayerIds[0])
    return layer && layer.kind === 'vector' && layer.primitive === 'line' ? layer : null
  }, [selectedVisibleLayerIds, visual.layers])
  const isSingleLineSelected = Boolean(selectedLineLayer)

  const [linePreviewLayer, setLinePreviewLayer] = useState<VectorVisualLayer | null>(null)

  const visualWithLinePreview = useMemo(() => {
    if (!linePreviewLayer) return visual
    return {
      ...visual,
      layers: visual.layers.map((layer) =>
        layer.id === linePreviewLayer.id ? linePreviewLayer : layer,
      ),
    }
  }, [visual, linePreviewLayer])

  const activeManagedSvgSelection =
    selectedLayerIds.length === 1 &&
    primaryLayerId !== null &&
    managedSvgSelection?.layerId === primaryLayerId
      ? managedSvgSelection
      : null
  const ruleResolvedVisual = mode === 'preview'
    ? resolveComponentVisualRules(visualWithLinePreview, {
        attributes: attributeValues,
        properties: propertyValues,
      })
    : visualWithLinePreview
  const renderedVisual = mode === 'preview'
    ? applyVisualAnimationOverlay(
        ruleResolvedVisual,
        evaluateVisualAnimations(ruleResolvedVisual, propertyValues, animationTimeMs),
      )
    : visualWithLinePreview
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
  const canTransformSelection =
    selectedLayerIds.length === 1 &&
    !activeCreateTool &&
    selectedLayer?.parentId === null &&
    !isSingleLineSelected
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
      if (element.clientWidth < 200) {
        return
      }

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

    const selectedNodes = isEditable && !activeCreateTool && !isSingleLineSelected
      ? selectedVisibleLayerIds.flatMap((layerId) => {
          const node = findLayerNode(stage, layerId)
          return node ? [node] : []
        })
      : []

    transformer.nodes(selectedNodes)
    transformer.getLayer()?.batchDraw()
  }, [activeCreateTool, artboardScale, isEditable, isSingleLineSelected, selectedVisibleLayerIds, visual.layers])

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

    const nextVisual: ComponentVisualDefinition = {
      ...visual,
      layers: visual.layers.map((candidate) => {
        const normalizedTransform = normalizedTransforms?.get(candidate.id)

        if (candidate.id === layerId) {
          const nextWidth = nextLayerTransform?.width ?? candidate.transform.width
          const nextHeight = nextLayerTransform?.height ?? candidate.transform.height
          const { offsetX, offsetY } = calculateOriginOffset(
            candidate.origin,
            nextWidth,
            nextHeight,
          )
          const updatedTransform = {
            ...(nextLayerTransform ?? candidate.transform),
            x: node.x() - offsetX,
            y: node.y() - offsetY,
            rotation: node.rotation(),
          }

          if (candidate.kind === 'vector') {
            const currentStrokeWidth = candidate.style?.strokeWidth ?? 2
            const nextStrokeWidth =
              candidate.primitive === 'line' && Math.abs(resizeScaleY - 1) > 0.01
                ? Math.max(1, Math.round(currentStrokeWidth * resizeScaleY * 10) / 10)
                : candidate.style?.strokeWidth

            return {
              ...candidate,
              transform: updatedTransform,
              ...(nextStrokeWidth !== undefined
                ? { style: { ...resolveVisualVectorStyle(candidate), strokeWidth: nextStrokeWidth } }
                : {}),
            }
          }

          return {
            ...candidate,
            transform: updatedTransform,
          }
        }

        return normalizedTransform
          ? { ...candidate, transform: normalizedTransform }
          : candidate
      }),
    }

    onChange(nextVisual)
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

    if (lineOverlayGroupRef.current) {
      lineOverlayGroupRef.current.position({ x: 0, y: 0 })
    }

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

    if (lineOverlayGroupRef.current && session.draggedLayerId === selectedLineLayer?.id) {
      lineOverlayGroupRef.current.position({
        x: delta.x * artboardScale,
        y: delta.y * artboardScale,
      })
    }

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
    if (lineOverlayGroupRef.current) {
      lineOverlayGroupRef.current.position({ x: 0, y: 0 })
    }

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

      const targetLayer = visual.layers.find((l) => l.id === layerId)
      const { offsetX, offsetY } = calculateOriginOffset(
        targetLayer?.origin,
        targetLayer?.transform.width ?? 0,
        targetLayer?.transform.height ?? 0,
      )

      updates.set(layerId, {
        x: currentNode.x() - offsetX,
        y: currentNode.y() - offsetY,
      })
    }

    for (const layerId of session.layerIds) {
      findLayerNode(stage, layerId)?.draggable(true)
    }

    if (updates.size > 0) {
      const nextVisual: ComponentVisualDefinition = {
        ...visual,
        layers: visual.layers.map((layer) => {
          const transform = updates.get(layer.id)

          return transform
            ? { ...layer, transform: { ...layer.transform, ...transform } }
            : layer
        }),
      }
      onChange(nextVisual)
    }

    clearSnapGuides()
    layerDragSessionRef.current = null
    pendingLayerSelectionRef.current = null
  }

  function handlePointerTarget(target: Konva.Node, toggle = false) {
    if (
      !isEditable ||
      activeCreateTool ||
      isInsideTransformer(target, transformerRef.current) ||
      isInsideLineOverlay(target)
    ) {
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

  function handleCanvasDblClick(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!isEditable || activeCreateTool) return
    const stage = stageRef.current
    if (!stage) return

    let targetLayer: VectorVisualLayer | null = null
    const layerId = getCompositeVisualLayerId(event.target, 'closest')
    if (layerId) {
      const candidate = visual.layers.find((l) => l.id === layerId)
      if (candidate && candidate.kind === 'vector' && candidate.primitive === 'line') {
        targetLayer = candidate
      }
    } else if (isInsideLineOverlay(event.target) && selectedLineLayer) {
      targetLayer = selectedLineLayer
    }

    if (!targetLayer) return

    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const clickDesign = {
      x: pointer.x / artboardScale,
      y: pointer.y / artboardScale,
    }

    const vertices = getLineDesignVertices(targetLayer)
    const projection = projectPointToLineSegments(vertices, clickDesign)
    if (!projection || projection.distance > 30 / artboardScale) {
      return
    }

    const newVertices = [
      ...vertices.slice(0, projection.segmentIndex + 1),
      projection.point,
      ...vertices.slice(projection.segmentIndex + 1),
    ]

    const normalized = normalizePolylineLayer(targetLayer, newVertices)
    onChange({
      ...visual,
      layers: visual.layers.map((l) => (l.id === normalized.id ? normalized : l)),
    })
    onSelectionReplace([normalized.id])
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
                pixelRatio={typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1}
                listening={isEditable}
                onMouseDown={(event) => {
                  if (activeCreateTool && event.evt.button !== 0) return
                  if (beginCreate(event.evt.shiftKey)) return

                  if (
                    isInsideTransformer(event.target, transformerRef.current) ||
                    isInsideLineOverlay(event.target)
                  ) {
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
                onDblClick={(event) => handleCanvasDblClick(event)}
                onDblTap={(event) => handleCanvasDblClick(event)}
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
                    dragEnabled={isEditable && !activeCreateTool}
                    // Stroke-width compensation is a viewing property of the
                    // fitted artboard: keep it on in preview so switching
                    // 设计/预览 never changes apparent stroke weight.
                    nonScalingStrokes={isComposite}
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
                    visible={
                      isEditable &&
                      !activeCreateTool &&
                      selectedVisibleLayerIds.length > 0 &&
                      !isSingleLineSelected
                    }
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
                  {isEditable && !activeCreateTool && isSingleLineSelected && selectedLineLayer && (
                    <Group ref={lineOverlayGroupRef} scaleX={artboardScale} scaleY={artboardScale}>
                      <LineInteractionOverlay
                        layer={
                          linePreviewLayer && linePreviewLayer.id === selectedLineLayer.id
                            ? linePreviewLayer
                            : selectedLineLayer
                        }
                        artboardScale={artboardScale}
                        selectionColor={selectionColor}
                        gridSize={gridSize}
                        snapEnabled={snapEnabled}
                        onPreviewChange={setLinePreviewLayer}
                        onCommit={(committedLayer) => {
                          setLinePreviewLayer(null)
                          onChange({
                            ...visual,
                            layers: visual.layers.map((l) =>
                              l.id === committedLayer.id ? committedLayer : l,
                            ),
                          })
                        }}
                      />
                    </Group>
                  )}
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
