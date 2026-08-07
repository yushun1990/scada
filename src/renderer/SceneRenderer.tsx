import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import {
  Circle,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from 'react-konva'
import {
  PUMP_MIN_HEIGHT,
  PUMP_MIN_WIDTH,
} from '../components/PumpNode'
import {
  getNodePortDefinitions,
  getPortDefinition,
  getPortWorldPosition,
  isNodeEffectivelyVisible,
  normalizeConnectionEndpoints,
} from '../components/ports'
import {
  hasDuplicateConnection,
  resolveReconnectedEndpoints,
  type ConnectionEndpointRole,
} from '../scene/connection-commands'
import {
  boundsIntersect,
  computeSnap,
  getNodeBounds,
  getRootNodes,
  getSelectionBounds,
  type AlignmentGuide,
  type Bounds,
  type SnapSettings,
  type TransformUpdates,
} from '../scene/geometry'
import { collectSubtreeIds } from '../scene/hierarchy'
import {
  getConnectionPreviewRoutePoints,
  getConnectionRoutePoints,
} from '../scene/connection-routing'
import {
  isGroupNode,
  type ConnectionEndpoint,
  type SceneConnection,
  type SceneDocument,
  type SceneNode,
} from '../scene/model'
import { SceneNodeRenderer } from './SceneNodeRenderer'
import {
  centerSceneAtScale,
  fillContentToViewport,
  isPointInsideScene,
  scenePointFromViewport,
  type ContentBounds,
  VIEWPORT_ZOOM_FACTOR,
  type ViewportTransform,
} from '../editor/viewport'

export type RendererMode = 'editor' | 'preview'

export type SceneRendererProps = {
  scene: SceneDocument
  mode: RendererMode
  selectedNodeIds: string[]
  selectedConnectionId: string | null
  snapSettings: SnapSettings
  gridVisible: boolean
  onSelectionChange: (nodeIds: string[]) => void
  onConnectionSelectionChange: (connectionId: string | null) => void
  onCreateConnection: (
    source: ConnectionEndpoint,
    target: ConnectionEndpoint,
  ) => void
  onReconnectConnection: (
    connectionId: string,
    role: ConnectionEndpointRole,
    endpoint: ConnectionEndpoint,
  ) => boolean
  onTransformNodes: (updates: TransformUpdates) => void
}

type Point = {
  x: number
  y: number
}

type PanSession = {
  startClientPointer: Point
  startTransform: ViewportTransform
}

type MarqueeState = {
  start: Point
  current: Point
  additive: boolean
}

type MarqueeSession = MarqueeState & {
  active: boolean
}

type DragSession = {
  nodeId: string
  nodeIds: string[]
  affectedNodeIds: Set<string>
  initialBounds: Bounds
  initialTransforms: TransformUpdates
}

type ConnectionSession = {
  source: ConnectionEndpoint
}

type ReconnectCandidate = {
  endpoint: ConnectionEndpoint
  position: Point
  connection: SceneConnection
}

type ReconnectSession = {
  connection: SceneConnection
  role: ConnectionEndpointRole
  handle: Konva.Circle
  candidate: ReconnectCandidate | null
}

type HoveredPort = {
  endpoint: ConnectionEndpoint
  title: string
  direction: 'input' | 'output' | 'bidirectional'
  x: number
  y: number
}

const CORNER_ANCHORS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const

const MARQUEE_THRESHOLD = 4
const GROUP_MIN_SIZE = 48
const RECONNECT_SNAP_RADIUS = 24
const PORT_PREFIX = 'scene-port::'
const CONNECTION_PREFIX = 'scene-connection::'
const CONNECTION_HANDLE_PREFIX = 'scene-connection-handle::'

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function hasSelectionModifier(event: Event) {
  const keyboardEvent = event as MouseEvent
  return Boolean(
    keyboardEvent.shiftKey ||
    keyboardEvent.ctrlKey ||
    keyboardEvent.metaKey,
  )
}

function findSceneNodeId(target: Konva.Node) {
  let current: Konva.Node | null = target

  while (current) {
    if (current.hasName('scene-node')) {
      return current.id()
    }

    current = current.getParent()
  }

  return null
}

function findPortEndpoint(target: Konva.Node): ConnectionEndpoint | null {
  let current: Konva.Node | null = target

  while (current) {
    const id = current.id()

    if (id.startsWith(PORT_PREFIX)) {
      const [, nodeId, anchorId] = id.split('::')

      if (nodeId && anchorId) {
        return { nodeId, anchorId }
      }
    }

    current = current.getParent()
  }

  return null
}

function findConnectionId(target: Konva.Node) {
  let current: Konva.Node | null = target

  while (current) {
    const id = current.id()

    if (id.startsWith(CONNECTION_PREFIX)) {
      return id.slice(CONNECTION_PREFIX.length)
    }

    current = current.getParent()
  }

  return null
}

function findConnectionHandleRole(
  target: Konva.Node,
): ConnectionEndpointRole | null {
  let current: Konva.Node | null = target

  while (current) {
    const id = current.id()

    if (id === `${CONNECTION_HANDLE_PREFIX}source`) {
      return 'source'
    }

    if (id === `${CONNECTION_HANDLE_PREFIX}target`) {
      return 'target'
    }

    current = current.getParent()
  }

  return null
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

function normalizeMarquee(marquee: MarqueeState): Bounds {
  const left = Math.min(marquee.start.x, marquee.current.x)
  const top = Math.min(marquee.start.y, marquee.current.y)
  const right = Math.max(marquee.start.x, marquee.current.x)
  const bottom = Math.max(marquee.start.y, marquee.current.y)

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  }
}

function nextPointerSelection(
  selectedNodeIds: readonly string[],
  nodeId: string,
  additive: boolean,
) {
  const alreadySelected = selectedNodeIds.includes(nodeId)

  if (additive) {
    return alreadySelected
      ? selectedNodeIds.filter((id) => id !== nodeId)
      : [...selectedNodeIds, nodeId]
  }

  if (alreadySelected) {
    return [
      ...selectedNodeIds.filter((id) => id !== nodeId),
      nodeId,
    ]
  }

  return [nodeId]
}

function isDarkBackground(color: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim())

  if (!match) {
    return false
  }

  const value = Number.parseInt(match[1], 16)
  const red = (value >> 16) & 0xff
  const green = (value >> 8) & 0xff
  const blue = value & 0xff
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255

  return luminance < 0.48
}

function isConnectionVisible(scene: SceneDocument, connection: SceneConnection) {
  const sourceNode = scene.nodes.find(
    (node) => node.id === connection.source.nodeId,
  )
  const targetNode = scene.nodes.find(
    (node) => node.id === connection.target.nodeId,
  )

  return Boolean(
    sourceNode &&
      targetNode &&
      isNodeEffectivelyVisible(scene, sourceNode) &&
      isNodeEffectivelyVisible(scene, targetNode),
  )
}

function portKey(endpoint: ConnectionEndpoint) {
  return `${endpoint.nodeId}::${endpoint.anchorId}`
}

function endpointFromPortKey(key: string): ConnectionEndpoint | null {
  const separatorIndex = key.lastIndexOf('::')

  if (separatorIndex <= 0) {
    return null
  }

  return {
    nodeId: key.slice(0, separatorIndex),
    anchorId: key.slice(separatorIndex + 2),
  }
}

function reverseFlattenedPoints(points: number[]) {
  const reversed: number[] = []

  for (let index = points.length - 2; index >= 0; index -= 2) {
    reversed.push(points[index], points[index + 1])
  }

  return reversed
}

function getPreviewTransform(node: SceneNode, group: Konva.Group) {
  const baseWidth = isGroupNode(node)
    ? node.props.designWidth
    : group.width()
  const baseHeight = isGroupNode(node)
    ? node.props.designHeight
    : group.height()

  return {
    x: group.x(),
    y: group.y(),
    width: Math.max(1, baseWidth * Math.abs(group.scaleX())),
    height: Math.max(1, baseHeight * Math.abs(group.scaleY())),
    rotation: group.rotation(),
  }
}

// 「适应」始终以固定画板为基准，而不是以组件内容包围盒为基准。
function getContentBounds(scene: SceneDocument): ContentBounds {
  return {
    width: scene.width,
    height: scene.height,
    centerX: scene.width / 2,
    centerY: scene.height / 2,
  }
}

// 生成覆盖 [start, start+extent] 区间的网格坐标（按 step 对齐）。
function buildGridCoordinates(start: number, extent: number, step: number) {
  const first = Math.floor(start / step) * step
  const last = start + extent
  const count = Math.ceil((last - first) / step) + 1
  return Array.from({ length: count }, (_, index) => first + index * step)
}

export function SceneRenderer({
  scene,
  mode,
  selectedNodeIds,
  selectedConnectionId,
  snapSettings,
  gridVisible,
  onSelectionChange,
  onConnectionSelectionChange,
  onCreateConnection,
  onReconnectConnection,
  onTransformNodes,
}: SceneRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const staticLayerRef = useRef<Konva.Layer>(null)
  const staticViewportGroupRef = useRef<Konva.Group>(null)
  const dynamicViewportGroupRef = useRef<Konva.Group>(null)
  const dynamicLayerRef = useRef<Konva.Layer>(null)
  const connectionPreviewRef = useRef<Konva.Line>(null)
  const verticalGuideRef = useRef<Konva.Line>(null)
  const horizontalGuideRef = useRef<Konva.Line>(null)
  const selectionBoundsRef = useRef<Konva.Rect>(null)
  const selectedSourceHandleRef = useRef<Konva.Circle>(null)
  const selectedTargetHandleRef = useRef<Konva.Circle>(null)
  const nodeRefs = useRef(new Map<string, Konva.Group>())
  const connectionRefs = useRef(new Map<string, Konva.Line>())
  const portRefs = useRef(new Map<string, Konva.Circle>())
  const selectionRectRefs = useRef(new Map<string, Konva.Rect>())
  const pendingSelectionRef = useRef<string[] | null>(null)
  const dragSessionRef = useRef<DragSession | null>(null)
  const dragPreviewRef = useRef<TransformUpdates>({})
  const dragFrameRef = useRef<number | null>(null)
  const pendingDragTargetRef = useRef<Konva.Node | null>(null)
  const transformFrameRef = useRef<number | null>(null)
  const marqueeSessionRef = useRef<MarqueeSession | null>(null)
  const connectionSessionRef = useRef<ConnectionSession | null>(null)
  const connectionFrameRef = useRef<number | null>(null)
  const pendingConnectionPointRef = useRef<Point | null>(null)
  const reconnectSessionRef = useRef<ReconnectSession | null>(null)
  const reconnectFrameRef = useRef<number | null>(null)
  const pendingReconnectHandleRef = useRef<Konva.Circle | null>(null)
  const reconnectCandidateKeyRef = useRef<string | null>(null)
  const hoveredPortNodeIdRef = useRef<string | null>(null)
  const panSessionRef = useRef<PanSession | null>(null)
  const spacePressedRef = useRef(false)
  const viewportInitializedRef = useRef(false)
  const viewportTransformRef = useRef<ViewportTransform>({ x: 0, y: 0, scale: 1 })
  const pointerStatusRef = useRef<HTMLSpanElement>(null)
  const [viewport, setViewport] = useState({ width: 960, height: 640 })
  const [viewportTransform, setViewportTransform] = useState<ViewportTransform>({
    x: 0,
    y: 0,
    scale: 1,
  })
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const [hoveredPort, setHoveredPort] = useState<HoveredPort | null>(null)

  const rootNodes = getRootNodes(scene)
  const contentBounds = getContentBounds(scene)
  const selectedNodes = rootNodes.filter((node) =>
    selectedNodeIds.includes(node.id),
  )
  const primaryNode =
    selectedNodes.find(
      (node) => node.id === selectedNodeIds[selectedNodeIds.length - 1],
    ) ?? null
  const selectedConnection = scene.connections.find(
    (connection) => connection.id === selectedConnectionId,
  ) ?? null

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return
      }

      const nextViewport = {
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(360, Math.floor(entry.contentRect.height)),
      }
      setViewport(nextViewport)

      if (!viewportInitializedRef.current) {
        viewportInitializedRef.current = true
        commitViewportTransform(
          fillContentToViewport(nextViewport, contentBounds),
        )
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || isEditableTarget(event.target)) {
        return
      }

      event.preventDefault()
      spacePressedRef.current = true
      setStageCursor('grab')
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return
      }

      spacePressedRef.current = false
      if (!panSessionRef.current) {
        setStageCursor('default')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  useEffect(() => {
    const cancelTransientInteraction = () => {
      pendingSelectionRef.current = null
      marqueeSessionRef.current = null
      setMarquee(null)
      setHoveredPort(null)
      clearConnectionSession()
      cancelReconnectSession()
      hideGuides()
    }

    window.addEventListener('blur', cancelTransientInteraction)
    return () => window.removeEventListener('blur', cancelTransientInteraction)
  }, [])

  useEffect(() => {
    return () => {
      cancelScheduledDrag()
      cancelScheduledConnectionPreview()
      cancelScheduledReconnect()

      if (transformFrameRef.current !== null) {
        cancelAnimationFrame(transformFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (mode === 'editor') {
      return
    }

    cancelScheduledDrag()
    cancelScheduledConnectionPreview()
    cancelReconnectSession()
    pendingSelectionRef.current = null
    marqueeSessionRef.current = null
    connectionSessionRef.current = null
    dragSessionRef.current = null
    dragPreviewRef.current = {}
    hoveredPortNodeIdRef.current = null
    setMarquee(null)
    setHoveredPort(null)
    hideConnectionPreview()
    hideGuides()
  }, [mode])

  useEffect(() => {
    const session = reconnectSessionRef.current

    if (session && session.connection.id !== selectedConnectionId) {
      cancelReconnectSession()
    }
  }, [selectedConnectionId])

  useEffect(() => {
    setHoveredNodePorts(null)
    const transformer = transformerRef.current

    if (!transformer) {
      return
    }

    const nodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null
    const selectedNode = nodeId
      ? rootNodes.find((node) => node.id === nodeId)
      : null
    const selectedNodeRef = nodeId ? nodeRefs.current.get(nodeId) : undefined

    transformer.nodes(
      mode === 'editor' &&
        selectedNode &&
        !selectedNode.locked &&
        selectedNodeRef
        ? [selectedNodeRef]
        : [],
    )
    drawDynamicLayer()
  }, [mode, selectedNodeIds, scene.nodes])

  function drawDynamicLayer() {
    dynamicLayerRef.current?.batchDraw()
  }

  function setHoveredNodePorts(nodeId: string | null) {
    const nextNodeId =
      mode === 'editor' &&
      nodeId &&
      !selectedNodeIds.includes(nodeId) &&
      !connectionSessionRef.current &&
      !reconnectSessionRef.current
        ? nodeId
        : null

    if (hoveredPortNodeIdRef.current === nextNodeId) {
      return
    }

    hoveredPortNodeIdRef.current = nextNodeId
    const controlScale = 1 / viewportTransformRef.current.scale

    for (const [key, circle] of portRefs.current) {
      const endpoint = endpointFromPortKey(key)
      const node = endpoint
        ? scene.nodes.find((candidate) => candidate.id === endpoint.nodeId)
        : null
      const visible = Boolean(
        endpoint &&
          node &&
          endpoint.nodeId === nextNodeId &&
          isNodeEffectivelyVisible(scene, node),
      )

      circle.visible(visible)
      circle.listening(visible)
      circle.opacity(visible ? 0.82 : 0)
      circle.radius(5 * controlScale)
      circle.fill('#ffffff')
      circle.stroke('#2563eb')
      circle.strokeWidth(1.5 * controlScale)
    }

    if (!nextNodeId) {
      setHoveredPort(null)
    }

    drawDynamicLayer()
  }

  function drawViewportLayers() {
    staticLayerRef.current?.batchDraw()
    dynamicLayerRef.current?.batchDraw()
  }

  function applyViewportTransform(next: ViewportTransform) {
    viewportTransformRef.current = next
    staticViewportGroupRef.current?.setAttrs({
      x: next.x,
      y: next.y,
      scaleX: next.scale,
      scaleY: next.scale,
    })
    dynamicViewportGroupRef.current?.setAttrs({
      x: next.x,
      y: next.y,
      scaleX: next.scale,
      scaleY: next.scale,
    })
    drawViewportLayers()
  }

  function commitViewportTransform(next: ViewportTransform) {
    applyViewportTransform(next)
    setViewportTransform(next)
  }

  function getScenePointer(stage: Konva.Stage) {
    const pointer = stage.getPointerPosition()
    return pointer
      ? scenePointFromViewport(pointer, viewportTransformRef.current)
      : null
  }

  function updatePointerStatus(stage: Konva.Stage) {
    const point = getScenePointer(stage)
    const status = pointerStatusRef.current

    if (!status) {
      return
    }

    status.textContent = point && isPointInsideScene(point, scene)
      ? `X ${Math.round(point.x)}  Y ${Math.round(point.y)}`
      : 'X —  Y —'
  }

  function fitScene() {
    commitViewportTransform(fillContentToViewport(viewport, contentBounds))
  }

  function resetViewport() {
    commitViewportTransform(
      centerSceneAtScale(viewport, { width: scene.width, height: scene.height }, 1),
    )
  }

  function zoomAtViewportPoint(point: Point, requestedScale: number) {
    const current = viewportTransformRef.current
    const scenePoint = scenePointFromViewport(point, current)
    const nextScale = Math.min(8, Math.max(0.1, requestedScale))
    commitViewportTransform({
      x: point.x - scenePoint.x * nextScale,
      y: point.y - scenePoint.y * nextScale,
      scale: nextScale,
    })
  }

  function zoomBy(factor: number) {
    zoomAtViewportPoint(
      { x: viewport.width / 2, y: viewport.height / 2 },
      viewportTransformRef.current.scale * factor,
    )
  }

  function shouldStartPan(nativeEvent: Event) {
    const mouseEvent = nativeEvent as MouseEvent
    return spacePressedRef.current || mouseEvent.button === 1
  }

  function beginPan(nativeEvent: Event) {
    const mouseEvent = nativeEvent as MouseEvent

    if (panSessionRef.current) {
      finishPan()
    }

    nativeEvent.preventDefault()
    cancelPointerInteraction()
    cancelReconnectSession()
    panSessionRef.current = {
      startClientPointer: {
        x: mouseEvent.clientX,
        y: mouseEvent.clientY,
      },
      startTransform: { ...viewportTransformRef.current },
    }
    window.addEventListener('mousemove', handleWindowPanMove)
    window.addEventListener('mouseup', handleWindowPanEnd)
    window.addEventListener('blur', handleWindowPanEnd)
    setStageCursor('grabbing')
    return true
  }

  function updatePan(clientPointer: Point) {
    const session = panSessionRef.current

    if (!session) {
      return false
    }

    applyViewportTransform({
      ...session.startTransform,
      x:
        session.startTransform.x +
        clientPointer.x -
        session.startClientPointer.x,
      y:
        session.startTransform.y +
        clientPointer.y -
        session.startClientPointer.y,
    })
    return true
  }

  function handleWindowPanMove(event: MouseEvent) {
    updatePan({ x: event.clientX, y: event.clientY })
  }

  function handleWindowPanEnd() {
    finishPan()
  }

  function finishPan() {
    if (!panSessionRef.current) {
      return false
    }

    panSessionRef.current = null
    window.removeEventListener('mousemove', handleWindowPanMove)
    window.removeEventListener('mouseup', handleWindowPanEnd)
    window.removeEventListener('blur', handleWindowPanEnd)
    setViewportTransform({ ...viewportTransformRef.current })
    setStageCursor(spacePressedRef.current ? 'grab' : 'default')
    return true
  }

  function setStageCursor(cursor: string) {
    const stage = dynamicLayerRef.current?.getStage()

    if (stage) {
      stage.container().style.cursor = cursor
    }
  }

  function hideGuides() {
    verticalGuideRef.current?.visible(false)
    horizontalGuideRef.current?.visible(false)
    drawDynamicLayer()
  }

  function updateGuides(guides: AlignmentGuide[]) {
    const vertical = guides.find((guide) => guide.orientation === 'vertical')
    const horizontal = guides.find((guide) => guide.orientation === 'horizontal')

    if (verticalGuideRef.current) {
      verticalGuideRef.current.visible(Boolean(vertical))

      if (vertical) {
        verticalGuideRef.current.points([
          vertical.position,
          0,
          vertical.position,
          scene.height,
        ])
        verticalGuideRef.current.stroke(
          vertical.source === 'object' ? '#db2777' : '#0891b2',
        )
        verticalGuideRef.current.dash(
          vertical.source === 'grid' ? [5, 4] : [],
        )
      }
    }

    if (horizontalGuideRef.current) {
      horizontalGuideRef.current.visible(Boolean(horizontal))

      if (horizontal) {
        horizontalGuideRef.current.points([
          0,
          horizontal.position,
          scene.width,
          horizontal.position,
        ])
        horizontalGuideRef.current.stroke(
          horizontal.source === 'object' ? '#db2777' : '#0891b2',
        )
        horizontalGuideRef.current.dash(
          horizontal.source === 'grid' ? [5, 4] : [],
        )
      }
    }
  }

  function refreshConnections(
    overrides: TransformUpdates,
    affectedNodeIds: ReadonlySet<string>,
  ) {
    for (const connection of scene.connections) {
      if (
        !affectedNodeIds.has(connection.source.nodeId) &&
        !affectedNodeIds.has(connection.target.nodeId)
      ) {
        continue
      }

      const line = connectionRefs.current.get(connection.id)

      if (!line) {
        continue
      }

      const points = getConnectionRoutePoints(scene, connection, overrides)
      line.visible(Boolean(points) && isConnectionVisible(scene, connection))

      if (points) {
        line.points(points)
      }
    }
  }

  function refreshSelectedConnectionHandles(overrides: TransformUpdates) {
    if (!selectedConnection || reconnectSessionRef.current) {
      return
    }

    const source = getPortWorldPosition(
      scene,
      selectedConnection.source,
      overrides,
    )
    const target = getPortWorldPosition(
      scene,
      selectedConnection.target,
      overrides,
    )

    if (source) {
      selectedSourceHandleRef.current?.position(source)
    }

    if (target) {
      selectedTargetHandleRef.current?.position(target)
    }
  }

  function refreshPorts(
    overrides: TransformUpdates,
    affectedNodeIds: ReadonlySet<string>,
  ) {
    for (const node of scene.nodes) {
      if (isGroupNode(node) || !affectedNodeIds.has(node.id)) {
        continue
      }

      for (const port of getNodePortDefinitions(node)) {
        const endpoint = { nodeId: node.id, anchorId: port.id }
        const circle = portRefs.current.get(portKey(endpoint))

        if (!circle) {
          continue
        }

        const position = getPortWorldPosition(scene, endpoint, overrides)
        const effectiveVisible = isNodeEffectivelyVisible(scene, node)
        const hoverVisible =
          hoveredPortNodeIdRef.current === node.id &&
          !selectedNodeIds.includes(node.id)
        const connectionVisible = Boolean(connectionSessionRef.current)
        const reconnectVisible = Boolean(reconnectSessionRef.current)
        const visible = Boolean(
          position &&
            effectiveVisible &&
            mode === 'editor' &&
            (hoverVisible || connectionVisible || reconnectVisible),
        )

        circle.visible(visible)
        circle.listening(
          visible && !reconnectVisible && (hoverVisible || connectionVisible),
        )

        if (position) {
          circle.position(position)
        }
      }
    }
  }

  function refreshSelection(overrides: TransformUpdates) {
    if (selectedNodeIds.length <= 1) {
      return
    }

    for (const node of selectedNodes) {
      const rect = selectionRectRefs.current.get(node.id)

      if (!rect) {
        continue
      }

      const bounds = getNodeBounds(scene, node, overrides)
      rect.setAttrs({
        x: bounds.left,
        y: bounds.top,
        width: bounds.width,
        height: bounds.height,
      })
    }

    const bounds = getSelectionBounds(scene, selectedNodeIds, overrides)

    if (bounds && selectionBoundsRef.current) {
      selectionBoundsRef.current.setAttrs({
        x: bounds.left,
        y: bounds.top,
        width: bounds.width,
        height: bounds.height,
      })
    }
  }

  function applyPreview(
    updates: TransformUpdates,
    guides: AlignmentGuide[],
    affectedNodeIds: ReadonlySet<string>,
  ) {
    for (const [nodeId, transform] of Object.entries(updates)) {
      nodeRefs.current.get(nodeId)?.position({
        x: transform.x,
        y: transform.y,
      })
    }

    dragPreviewRef.current = updates
    refreshConnections(updates, affectedNodeIds)
    refreshSelectedConnectionHandles(updates)
    refreshPorts(updates, affectedNodeIds)
    refreshSelection(updates)
    updateGuides(guides)
    drawDynamicLayer()
  }

  function clearMarqueeSession() {
    marqueeSessionRef.current = null
    setMarquee(null)
  }

  function hideConnectionPreview() {
    connectionPreviewRef.current?.visible(false)
    drawDynamicLayer()
  }

  function clearConnectionSession() {
    cancelScheduledConnectionPreview()
    connectionSessionRef.current = null
    hoveredPortNodeIdRef.current = null
    const controlScale = 1 / viewportTransformRef.current.scale

    for (const circle of portRefs.current.values()) {
      circle.visible(false)
      circle.listening(false)
      circle.opacity(0)
      circle.radius(5 * controlScale)
      circle.fill('#ffffff')
      circle.stroke('#2563eb')
      circle.strokeWidth(1.5 * controlScale)
    }

    hideConnectionPreview()
  }

  function cancelPointerInteraction() {
    pendingSelectionRef.current = null
    clearMarqueeSession()
    clearConnectionSession()
  }

  function handleNodePointerDown(target: Konva.Node, nativeEvent: Event) {
    if (mode !== 'editor') {
      return
    }

    clearMarqueeSession()
    setHoveredNodePorts(null)
    const nodeId = findSceneNodeId(target)

    if (!nodeId) {
      pendingSelectionRef.current = null
      return
    }

    const nextSelection = nextPointerSelection(
      selectedNodeIds,
      nodeId,
      hasSelectionModifier(nativeEvent),
    )
    pendingSelectionRef.current = nextSelection
    onConnectionSelectionChange(null)
    onSelectionChange(nextSelection)
  }

  function handleDragStart(target: Konva.Node) {
    if (mode !== 'editor') {
      return
    }

    clearMarqueeSession()
    clearConnectionSession()
    setHoveredNodePorts(null)
    setHoveredPort(null)
    const nodeId = findSceneNodeId(target)

    if (!nodeId) {
      return
    }

    let nodeIds = pendingSelectionRef.current ?? selectedNodeIds

    if (!nodeIds.includes(nodeId)) {
      nodeIds = [nodeId]
      onSelectionChange(nodeIds)
    }

    nodeIds = nodeIds.filter((id) => {
      const node = rootNodes.find((candidate) => candidate.id === id)
      return node && !node.locked
    })

    const initialBounds = getSelectionBounds(scene, nodeIds)

    if (!initialBounds) {
      pendingSelectionRef.current = null
      return
    }

    const initialTransforms: TransformUpdates = {}

    for (const id of nodeIds) {
      const node = rootNodes.find((candidate) => candidate.id === id)

      if (node) {
        initialTransforms[id] = { ...node.transform }
      }
    }

    dragSessionRef.current = {
      nodeId,
      nodeIds,
      affectedNodeIds: collectSubtreeIds(scene, nodeIds),
      initialBounds,
      initialTransforms,
    }
    pendingSelectionRef.current = null
    dragPreviewRef.current = {}
    hideGuides()
  }

  function processDragMove(target: Konva.Node) {
    const session = dragSessionRef.current

    if (!session) {
      return
    }

    const draggedTransform = session.initialTransforms[session.nodeId]

    if (!draggedTransform) {
      return
    }

    const rawDelta = {
      x: target.x() - draggedTransform.x,
      y: target.y() - draggedTransform.y,
    }
    const snapResult = computeSnap(
      scene,
      session.nodeIds,
      session.initialBounds,
      rawDelta,
      { ...snapSettings, threshold: snapSettings.threshold / viewportTransformRef.current.scale },
    )
    const boundedDelta = {
      x: Math.min(
        scene.width - session.initialBounds.right,
        Math.max(-session.initialBounds.left, snapResult.delta.x),
      ),
      y: Math.min(
        scene.height - session.initialBounds.bottom,
        Math.max(-session.initialBounds.top, snapResult.delta.y),
      ),
    }
    const hitArtboardBoundary =
      boundedDelta.x !== snapResult.delta.x ||
      boundedDelta.y !== snapResult.delta.y
    const updates: TransformUpdates = {}

    for (const nodeId of session.nodeIds) {
      const transform = session.initialTransforms[nodeId]

      if (!transform) {
        continue
      }

      updates[nodeId] = {
        ...transform,
        x: transform.x + boundedDelta.x,
        y: transform.y + boundedDelta.y,
      }
    }

    applyPreview(updates, hitArtboardBoundary ? [] : snapResult.guides, session.affectedNodeIds)
  }

  function scheduleDragMove(target: Konva.Node) {
    // Konva changes the draggable node before onDragMove. Resolve snapping and
    // artboard bounds immediately in the same event. Delaying node correction
    // to requestAnimationFrame creates two competing positions and visible flicker.
    processDragMove(target)
  }

  function cancelScheduledDrag() {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }

    pendingDragTargetRef.current = null
  }

  function flushScheduledDrag(target: Konva.Node) {
    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
    }

    pendingDragTargetRef.current = null
    processDragMove(target)
  }

  function handleDragEnd(target: Konva.Node) {
    flushScheduledDrag(target)
    const updates = dragPreviewRef.current

    if (Object.keys(updates).length > 0) {
      onTransformNodes(updates)
    }

    pendingSelectionRef.current = null
    dragSessionRef.current = null
    dragPreviewRef.current = {}
    hideGuides()
  }

  function processTransformPreview() {
    if (selectedNodeIds.length !== 1) {
      return
    }

    const nodeId = selectedNodeIds[0]
    const node = nodeId
      ? rootNodes.find((candidate) => candidate.id === nodeId)
      : null
    const group = nodeId ? nodeRefs.current.get(nodeId) : undefined

    if (!node || !group || node.locked) {
      return
    }

    const updates = { [node.id]: getPreviewTransform(node, group) }
    const affectedNodeIds = collectSubtreeIds(scene, [node.id])
    refreshConnections(updates, affectedNodeIds)
    refreshSelectedConnectionHandles(updates)
    refreshPorts(updates, affectedNodeIds)
    drawDynamicLayer()
  }

  function scheduleTransformPreview() {
    if (transformFrameRef.current !== null) {
      return
    }

    transformFrameRef.current = requestAnimationFrame(() => {
      transformFrameRef.current = null
      processTransformPreview()
    })
  }

  function handleTransformEnd() {
    if (transformFrameRef.current !== null) {
      cancelAnimationFrame(transformFrameRef.current)
      transformFrameRef.current = null
    }

    if (selectedNodeIds.length !== 1) {
      return
    }

    const nodeId = selectedNodeIds[0]
    const node = nodeId
      ? rootNodes.find((candidate) => candidate.id === nodeId)
      : null
    const group = nodeId ? nodeRefs.current.get(nodeId) : undefined

    if (!node || !group || node.locked) {
      return
    }

    const preview = getPreviewTransform(node, group)
    const aspectRatio = node.transform.width / node.transform.height
    const minimumWidth = isGroupNode(node) ? GROUP_MIN_SIZE : PUMP_MIN_WIDTH
    const nextWidth = Math.max(minimumWidth, preview.width)
    const nextHeight = nextWidth / aspectRatio

    if (isGroupNode(node)) {
      group.scaleX(nextWidth / node.props.designWidth)
      group.scaleY(nextHeight / node.props.designHeight)
    } else {
      group.scaleX(1)
      group.scaleY(1)
    }

    onTransformNodes({
      [node.id]: {
        x: group.x(),
        y: group.y(),
        width: nextWidth,
        height: nextHeight,
        rotation: group.rotation(),
      },
    })
  }

  function beginMarqueeCandidate(stage: Konva.Stage, nativeEvent: Event) {
    if (mode !== 'editor') {
      return
    }

    const mouseEvent = nativeEvent as MouseEvent

    if (mouseEvent.button !== undefined && mouseEvent.button !== 0) {
      return
    }

    const pointer = getScenePointer(stage)

    if (!pointer || !isPointInsideScene(pointer, scene)) {
      return
    }

    pendingSelectionRef.current = null
    clearMarqueeSession()
    marqueeSessionRef.current = {
      start: pointer,
      current: pointer,
      additive: hasSelectionModifier(nativeEvent),
      active: false,
    }
  }

  function updateMarquee(stage: Konva.Stage) {
    const session = marqueeSessionRef.current
    const pointer = getScenePointer(stage)

    if (!session || !pointer) {
      return
    }

    const movedEnough =
      Math.abs(pointer.x - session.start.x) >= MARQUEE_THRESHOLD / viewportTransformRef.current.scale ||
      Math.abs(pointer.y - session.start.y) >= MARQUEE_THRESHOLD / viewportTransformRef.current.scale
    const nextSession: MarqueeSession = {
      ...session,
      current: pointer,
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
    pendingSelectionRef.current = null

    if (!session) {
      return
    }

    if (!session.active) {
      if (!session.additive) {
        onSelectionChange([])
        onConnectionSelectionChange(null)
      }
      return
    }

    const bounds = normalizeMarquee(session)
    const matchedIds = rootNodes
      .filter(
        (node) =>
          node.visible &&
          !node.locked &&
          boundsIntersect(bounds, getNodeBounds(scene, node)),
      )
      .map((node) => node.id)

    onConnectionSelectionChange(null)
    onSelectionChange(
      session.additive
        ? Array.from(new Set([...selectedNodeIds, ...matchedIds]))
        : matchedIds,
    )
  }

  function beginConnection(endpoint: ConnectionEndpoint) {
    const point = getPortWorldPosition(scene, endpoint)

    if (!point) {
      return
    }

    pendingSelectionRef.current = null
    clearMarqueeSession()
    setHoveredPort(null)
    hoveredPortNodeIdRef.current = null
    connectionSessionRef.current = { source: endpoint }
    const controlScale = 1 / viewportTransformRef.current.scale

    for (const [key, circle] of portRefs.current) {
      const candidateEndpoint = endpointFromPortKey(key)
      const node = candidateEndpoint
        ? scene.nodes.find((candidate) => candidate.id === candidateEndpoint.nodeId)
        : null
      const visible = Boolean(
        node && isNodeEffectivelyVisible(scene, node),
      )

      circle.visible(visible)
      circle.listening(visible)
      circle.opacity(visible ? 0.55 : 0)
      circle.radius(5 * controlScale)
      circle.fill('#ffffff')
      circle.stroke('#2563eb')
      circle.strokeWidth(1.5 * controlScale)
    }

    const points = getConnectionPreviewRoutePoints(scene, endpoint, point)
    connectionPreviewRef.current?.points(
      points ?? [point.x, point.y, point.x, point.y],
    )
    connectionPreviewRef.current?.visible(true)
    drawDynamicLayer()
    onSelectionChange([])
    onConnectionSelectionChange(null)
  }

  function processConnectionPreview(point: Point) {
    const session = connectionSessionRef.current

    if (!session) {
      return
    }

    const points = getConnectionPreviewRoutePoints(scene, session.source, point)

    if (!points) {
      return
    }

    connectionPreviewRef.current?.points(points)
    drawDynamicLayer()
  }

  function scheduleConnectionPreview(stage: Konva.Stage) {
    const pointer = getScenePointer(stage)

    if (!pointer) {
      return
    }

    pendingConnectionPointRef.current = pointer

    if (connectionFrameRef.current !== null) {
      return
    }

    connectionFrameRef.current = requestAnimationFrame(() => {
      connectionFrameRef.current = null
      const point = pendingConnectionPointRef.current

      if (point) {
        processConnectionPreview(point)
      }
    })
  }

  function cancelScheduledConnectionPreview() {
    if (connectionFrameRef.current !== null) {
      cancelAnimationFrame(connectionFrameRef.current)
      connectionFrameRef.current = null
    }

    pendingConnectionPointRef.current = null
  }

  function finishConnection(target: Konva.Node) {
    const session = connectionSessionRef.current
    const targetEndpoint = findPortEndpoint(target)
    clearConnectionSession()

    if (!session || !targetEndpoint) {
      return
    }

    const normalized = normalizeConnectionEndpoints(
      scene,
      session.source,
      targetEndpoint,
    )

    if (normalized) {
      onCreateConnection(normalized.source, normalized.target)
    }
  }

  function handleStageMouseUp(target: Konva.Node) {
    if (connectionSessionRef.current) {
      finishConnection(target)
      return
    }

    if (marqueeSessionRef.current) {
      finishMarquee()
      return
    }

    if (!dragSessionRef.current) {
      pendingSelectionRef.current = null
    }
  }

  function handlePortEnter(target: Konva.Circle, endpoint: ConnectionEndpoint) {
    const node = scene.nodes.find((candidate) => candidate.id === endpoint.nodeId)
    const port = node ? getPortDefinition(node, endpoint.anchorId) : null
    const position = getPortWorldPosition(scene, endpoint)

    if (!port || !position) {
      return
    }

    const connecting = connectionSessionRef.current
    const validTarget = connecting
      ? Boolean(normalizeConnectionEndpoints(scene, connecting.source, endpoint))
      : false
    const accent = connecting
      ? validTarget
        ? '#16a34a'
        : '#dc2626'
      : '#2563eb'

    target.radius(7 / viewportTransformRef.current.scale)
    target.fill(accent)
    target.stroke('#ffffff')
    target.strokeWidth(2 / viewportTransformRef.current.scale)
    target.opacity(1)
    setStageCursor('crosshair')
    setHoveredPort({
      endpoint,
      title: port.title,
      direction: port.direction,
      x: position.x,
      y: position.y,
    })
    drawDynamicLayer()
  }

  function handlePortLeave(target: Konva.Circle) {
    if (reconnectSessionRef.current) {
      return
    }

    const controlScale = 1 / viewportTransformRef.current.scale
    const hoverVisible = Boolean(hoveredPortNodeIdRef.current)
    target.radius(5 * controlScale)
    target.fill('#ffffff')
    target.stroke('#2563eb')
    target.strokeWidth(1.5 * controlScale)
    target.opacity(connectionSessionRef.current ? 0.55 : hoverVisible ? 0.82 : 0)
    setStageCursor('default')
    setHoveredPort(null)
    drawDynamicLayer()
  }

  function isReconnectEndpointValid(
    session: ReconnectSession,
    endpoint: ConnectionEndpoint,
  ) {
    const resolved = resolveReconnectedEndpoints(
      scene,
      session.connection,
      session.role,
      endpoint,
    )

    return Boolean(
      resolved &&
        !hasDuplicateConnection(
          scene,
          resolved.source,
          resolved.target,
          session.connection.id,
        ),
    )
  }

  function styleReconnectPort(
    session: ReconnectSession,
    endpoint: ConnectionEndpoint,
    circle: Konva.Circle,
  ) {
    const valid = isReconnectEndpointValid(session, endpoint)
    circle.opacity(valid ? 1 : 0.18)
    circle.radius(5 / viewportTransformRef.current.scale)
    circle.fill('#ffffff')
    circle.stroke(valid ? '#16a34a' : '#94a3b8')
    circle.strokeWidth(1.5 / viewportTransformRef.current.scale)
    circle.listening(false)
  }

  function showReconnectPorts(session: ReconnectSession) {
    hoveredPortNodeIdRef.current = null

    for (const [key, circle] of portRefs.current) {
      const endpoint = endpointFromPortKey(key)

      if (!endpoint) {
        continue
      }

      const node = scene.nodes.find(
        (candidate) => candidate.id === endpoint.nodeId,
      )
      circle.visible(
        Boolean(node && isNodeEffectivelyVisible(scene, node)),
      )
      styleReconnectPort(session, endpoint, circle)
    }
  }

  function restorePortPresentation() {
    hoveredPortNodeIdRef.current = null
    const controlScale = 1 / viewportTransformRef.current.scale

    for (const circle of portRefs.current.values()) {
      circle.visible(false)
      circle.listening(false)
      circle.opacity(0)
      circle.radius(5 * controlScale)
      circle.fill('#ffffff')
      circle.stroke('#2563eb')
      circle.strokeWidth(1.5 * controlScale)
    }
  }

  function updateReconnectCandidateHighlight(
    session: ReconnectSession,
    candidate: ReconnectCandidate | null,
  ) {
    const previousKey = reconnectCandidateKeyRef.current

    if (previousKey) {
      const previousCircle = portRefs.current.get(previousKey)
      const previousEndpoint = endpointFromPortKey(previousKey)

      if (previousCircle && previousEndpoint) {
        styleReconnectPort(session, previousEndpoint, previousCircle)
      }
    }

    reconnectCandidateKeyRef.current = candidate
      ? portKey(candidate.endpoint)
      : null

    if (candidate) {
      const circle = portRefs.current.get(portKey(candidate.endpoint))

      if (circle) {
        circle.opacity(1)
        circle.radius(8 / viewportTransformRef.current.scale)
        circle.fill('#16a34a')
        circle.stroke('#ffffff')
        circle.strokeWidth(2 / viewportTransformRef.current.scale)
      }
    }
  }

  function findReconnectCandidate(
    session: ReconnectSession,
    point: Point,
  ): ReconnectCandidate | null {
    let nearest: ReconnectCandidate | null = null
    let nearestDistanceSquared = (RECONNECT_SNAP_RADIUS / viewportTransformRef.current.scale) ** 2

    for (const node of scene.nodes) {
      if (isGroupNode(node) || !isNodeEffectivelyVisible(scene, node)) {
        continue
      }

      for (const port of getNodePortDefinitions(node)) {
        const endpoint = { nodeId: node.id, anchorId: port.id }
        const position = getPortWorldPosition(scene, endpoint)

        if (!position) {
          continue
        }

        const deltaX = point.x - position.x
        const deltaY = point.y - position.y
        const distanceSquared = deltaX * deltaX + deltaY * deltaY

        if (distanceSquared > nearestDistanceSquared) {
          continue
        }

        const resolved = resolveReconnectedEndpoints(
          scene,
          session.connection,
          session.role,
          endpoint,
        )

        if (
          !resolved ||
          hasDuplicateConnection(
            scene,
            resolved.source,
            resolved.target,
            session.connection.id,
          )
        ) {
          continue
        }

        nearestDistanceSquared = distanceSquared
        nearest = {
          endpoint,
          position,
          connection: {
            ...session.connection,
            source: resolved.source,
            target: resolved.target,
          },
        }
      }
    }

    return nearest
  }

  function getFloatingReconnectPoints(
    session: ReconnectSession,
    point: Point,
  ) {
    const fixedEndpoint =
      session.role === 'source'
        ? session.connection.target
        : session.connection.source
    const points = getConnectionPreviewRoutePoints(
      scene,
      fixedEndpoint,
      point,
    )

    if (!points) {
      return null
    }

    return session.role === 'source'
      ? reverseFlattenedPoints(points)
      : points
  }

  function beginReconnect(
    role: ConnectionEndpointRole,
    handle: Konva.Circle,
  ) {
    if (!selectedConnection || mode !== 'editor') {
      return
    }

    clearMarqueeSession()
    clearConnectionSession()
    setHoveredNodePorts(null)
    setHoveredPort(null)
    const session: ReconnectSession = {
      connection: selectedConnection,
      role,
      handle,
      candidate: null,
    }
    reconnectSessionRef.current = session
    reconnectCandidateKeyRef.current = null
    handle.moveToTop()
    connectionRefs.current.get(selectedConnection.id)?.opacity(0.2)
    connectionPreviewRef.current?.stroke('#2563eb')
    connectionPreviewRef.current?.visible(true)
    showReconnectPorts(session)
    setStageCursor('grabbing')
    processReconnectPreview(handle)
  }

  function processReconnectPreview(handle: Konva.Circle) {
    const session = reconnectSessionRef.current

    if (!session) {
      return
    }

    const stage = handle.getStage()
    const pointer = stage ? getScenePointer(stage) ?? handle.position() : handle.position()
    const candidate = findReconnectCandidate(session, pointer)
    const displayPoint = candidate?.position ?? pointer
    const points = candidate
      ? getConnectionRoutePoints(scene, candidate.connection)
      : getFloatingReconnectPoints(session, displayPoint)

    session.candidate = candidate
    handle.position(displayPoint)
    handle.stroke(candidate ? '#16a34a' : '#2563eb')
    handle.strokeWidth(3)
    updateReconnectCandidateHighlight(session, candidate)

    if (points) {
      connectionPreviewRef.current?.points(points)
      connectionPreviewRef.current?.stroke(
        candidate ? '#16a34a' : '#2563eb',
      )
      connectionPreviewRef.current?.visible(true)
    }

    drawDynamicLayer()
  }

  function scheduleReconnectPreview(handle: Konva.Circle) {
    pendingReconnectHandleRef.current = handle

    if (reconnectFrameRef.current !== null) {
      return
    }

    reconnectFrameRef.current = requestAnimationFrame(() => {
      reconnectFrameRef.current = null
      const latestHandle = pendingReconnectHandleRef.current

      if (latestHandle) {
        processReconnectPreview(latestHandle)
      }
    })
  }

  function cancelScheduledReconnect() {
    if (reconnectFrameRef.current !== null) {
      cancelAnimationFrame(reconnectFrameRef.current)
      reconnectFrameRef.current = null
    }

    pendingReconnectHandleRef.current = null
  }

  function flushScheduledReconnect(handle: Konva.Circle) {
    cancelScheduledReconnect()
    processReconnectPreview(handle)
  }

  function restoreConnectionFromSession(session: ReconnectSession) {
    const line = connectionRefs.current.get(session.connection.id)
    const points = getConnectionRoutePoints(scene, session.connection)

    if (line) {
      line.opacity(1)

      if (points) {
        line.points(points)
      }
    }

    const sourcePosition = getPortWorldPosition(
      scene,
      session.connection.source,
    )
    const targetPosition = getPortWorldPosition(
      scene,
      session.connection.target,
    )

    if (sourcePosition) {
      selectedSourceHandleRef.current?.position(sourcePosition)
    }

    if (targetPosition) {
      selectedTargetHandleRef.current?.position(targetPosition)
    }
  }

  function clearReconnectSession(accepted = false) {
    cancelScheduledReconnect()
    const session = reconnectSessionRef.current

    if (!session) {
      return
    }

    if (!accepted) {
      restoreConnectionFromSession(session)
    } else {
      connectionRefs.current.get(session.connection.id)?.opacity(1)
    }

    reconnectSessionRef.current = null
    reconnectCandidateKeyRef.current = null
    restorePortPresentation()
    connectionPreviewRef.current?.visible(false)
    setStageCursor('default')
    drawDynamicLayer()
  }

  function cancelReconnectSession() {
    clearReconnectSession(false)
  }

  function finishReconnect(handle: Konva.Circle) {
    flushScheduledReconnect(handle)
    const session = reconnectSessionRef.current

    if (!session) {
      return
    }

    const candidate = session.candidate
    const accepted = candidate
      ? onReconnectConnection(
          session.connection.id,
          session.role,
          candidate.endpoint,
        )
      : false

    if (accepted && candidate) {
      const line = connectionRefs.current.get(session.connection.id)
      const points = getConnectionRoutePoints(scene, candidate.connection)

      if (line && points) {
        line.points(points)
        line.opacity(1)
      }
    }

    clearReconnectSession(accepted)
  }

  const selectionBounds =
    selectedNodeIds.length > 1
      ? getSelectionBounds(scene, selectedNodeIds)
      : null
  const marqueeBounds = marquee ? normalizeMarquee(marquee) : null
  const transformNode = selectedNodeIds.length === 1 ? primaryNode : null
  const minimumTransformWidth =
    transformNode && isGroupNode(transformNode)
      ? GROUP_MIN_SIZE
      : PUMP_MIN_WIDTH
  const minimumTransformHeight =
    transformNode && isGroupNode(transformNode)
      ? GROUP_MIN_SIZE
      : PUMP_MIN_HEIGHT

  const gridSize = Math.max(4, snapSettings.gridSize)
  // 工作区可以无限平移，但网格只属于固定画板。
  const verticalGridLines = gridVisible
    ? buildGridCoordinates(0, scene.width, gridSize)
    : []
  const horizontalGridLines = gridVisible
    ? buildGridCoordinates(0, scene.height, gridSize)
    : []
  const visualControlScale = 1 / viewportTransform.scale
  const darkBackground = isDarkBackground(scene.background)
  const minorGridStroke = darkBackground
    ? 'rgba(203, 213, 225, 0.16)'
    : 'rgba(100, 116, 139, 0.14)'
  const majorGridStroke = darkBackground
    ? 'rgba(148, 163, 184, 0.28)'
    : 'rgba(71, 85, 105, 0.22)'
  const selectedSourcePosition = selectedConnection
    ? getPortWorldPosition(scene, selectedConnection.source)
    : null
  const selectedTargetPosition = selectedConnection
    ? getPortWorldPosition(scene, selectedConnection.target)
    : null
  const tooltipText = hoveredPort ? hoveredPort.title : ''
  const tooltipWidth = Math.max(88, tooltipText.length * 12 + 18)

  return (
    <div
      ref={containerRef}
      className="konva-host"
    >
      <Stage
        width={viewport.width}
        height={viewport.height}
        onWheel={(event) => {
          const evt = event.evt
          evt.preventDefault()
          const stage = event.target.getStage()
          const current = viewportTransformRef.current

          // Ctrl/Cmd + 滚轮 → 缩放；普通滚轮/触控板 → 平移
          if (evt.ctrlKey || evt.metaKey) {
            const pointer = stage?.getPointerPosition()

            if (!pointer) {
              return
            }

            const factor = evt.deltaY > 0
              ? 1 / VIEWPORT_ZOOM_FACTOR
              : VIEWPORT_ZOOM_FACTOR
            zoomAtViewportPoint(pointer, current.scale * factor)
          } else {
            applyViewportTransform({
              ...current,
              x: current.x - evt.deltaX,
              y: current.y - evt.deltaY,
            })
            setViewportTransform({ ...viewportTransformRef.current })
          }
        }}
        onMouseDown={(event) => {
          if (shouldStartPan(event.evt) && beginPan(event.evt)) {
            return
          }

          const handleRole = findConnectionHandleRole(event.target)

          if (handleRole) {
            pendingSelectionRef.current = null
            clearMarqueeSession()
            clearConnectionSession()
            return
          }

          if (isInsideTransformer(event.target, transformerRef.current)) {
            cancelPointerInteraction()
            return
          }

          const portEndpoint = findPortEndpoint(event.target)

          if (portEndpoint) {
            beginConnection(portEndpoint)
            return
          }

          const connectionId = findConnectionId(event.target)

          if (connectionId) {
            cancelPointerInteraction()
            onSelectionChange([])
            onConnectionSelectionChange(connectionId)
            return
          }

          const nodeId = findSceneNodeId(event.target)

          if (nodeId) {
            handleNodePointerDown(event.target, event.evt)
          } else {
            const stage = event.target.getStage()

            if (stage) {
              beginMarqueeCandidate(stage, event.evt)
            }
          }
        }}
        onTouchStart={(event) => {
          cancelPointerInteraction()
          const nodeId = findSceneNodeId(event.target)

          if (nodeId) {
            handleNodePointerDown(event.target, event.evt)
          } else if (mode === 'editor') {
            onSelectionChange([])
            onConnectionSelectionChange(null)
          }
        }}
        onMouseMove={(event) => {
          const stage = event.target.getStage()

          if (!stage) {
            return
          }

          updatePointerStatus(stage)

          if (
            panSessionRef.current &&
            updatePan({ x: event.evt.clientX, y: event.evt.clientY })
          ) {
            return
          }

          if (
            !connectionSessionRef.current &&
            !reconnectSessionRef.current &&
            !marqueeSessionRef.current &&
            !dragSessionRef.current
          ) {
            const portEndpoint = findPortEndpoint(event.target)
            setHoveredNodePorts(
              portEndpoint?.nodeId ?? findSceneNodeId(event.target),
            )
          }

          if (connectionSessionRef.current) {
            scheduleConnectionPreview(stage)
          } else {
            updateMarquee(stage)
          }
        }}
        onMouseUp={(event) => {
          if (!finishPan()) {
            handleStageMouseUp(event.target)
          }
        }}
        onMouseLeave={() => {
          if (pointerStatusRef.current) {
            pointerStatusRef.current.textContent = 'X —  Y —'
          }
          if (!panSessionRef.current) {
            setStageCursor('default')
          }
          setHoveredNodePorts(null)
          setHoveredPort(null)
          cancelReconnectSession()
          cancelPointerInteraction()
        }}
        onDragStart={(event) => {
          if (!findConnectionHandleRole(event.target)) {
            handleDragStart(event.target)
          }
        }}
        onDragMove={(event) => {
          if (!findConnectionHandleRole(event.target)) {
            scheduleDragMove(event.target)
          }
        }}
        onDragEnd={(event) => {
          if (!findConnectionHandleRole(event.target)) {
            handleDragEnd(event.target)
          }
        }}
      >
        <Layer ref={staticLayerRef} listening={false}>
          <Rect
            x={0}
            y={0}
            width={viewport.width}
            height={viewport.height}
            fill="#d9dee5"
            listening={false}
          />
          <Group
            ref={staticViewportGroupRef}
            x={viewportTransform.x}
            y={viewportTransform.y}
            scaleX={viewportTransform.scale}
            scaleY={viewportTransform.scale}
          >
            <Rect
              x={0}
              y={0}
              width={scene.width}
              height={scene.height}
              fill={scene.background}
              shadowColor="rgba(15, 23, 42, 0.28)"
              shadowBlur={18 * visualControlScale}
              shadowOffsetX={0}
              shadowOffsetY={5 * visualControlScale}
              listening={false}
            />

            {verticalGridLines.map((x) => {
              const isMajor = Math.round(x / gridSize) % 5 === 0
              return (
                <Line
                  key={`grid-x-${x}`}
                  points={[x, 0, x, scene.height]}
                  stroke={isMajor ? majorGridStroke : minorGridStroke}
                  strokeWidth={(isMajor ? 0.8 : 0.6) * visualControlScale}
                  perfectDrawEnabled={false}
                />
              )
            })}

            {horizontalGridLines.map((y) => {
              const isMajor = Math.round(y / gridSize) % 5 === 0
              return (
                <Line
                  key={`grid-y-${y}`}
                  points={[0, y, scene.width, y]}
                  stroke={isMajor ? majorGridStroke : minorGridStroke}
                  strokeWidth={(isMajor ? 0.8 : 0.6) * visualControlScale}
                  perfectDrawEnabled={false}
                />
              )
            })}
          </Group>
        </Layer>

        <Layer ref={dynamicLayerRef} listening={mode === 'editor'}>
          <Group
            ref={dynamicViewportGroupRef}
            x={viewportTransform.x}
            y={viewportTransform.y}
            scaleX={viewportTransform.scale}
            scaleY={viewportTransform.scale}
          >
            {scene.connections.map((connection) => {
              const points = getConnectionRoutePoints(scene, connection)

              if (!points || !isConnectionVisible(scene, connection)) {
                return null
              }

              const selected = selectedConnectionId === connection.id
              const dash =
                connection.style.dash === 'dashed' ? [10, 7] : undefined

              return (
                <Line
                  key={connection.id}
                  ref={(instance) => {
                    if (instance) {
                      connectionRefs.current.set(connection.id, instance)
                    } else {
                      connectionRefs.current.delete(connection.id)
                    }
                  }}
                  id={`${CONNECTION_PREFIX}${connection.id}`}
                  points={points}
                  stroke={selected ? '#2563eb' : connection.style.stroke}
                  strokeWidth={
                    selected
                      ? connection.style.strokeWidth + 2
                      : connection.style.strokeWidth
                  }
                  dash={dash}
                  lineCap="round"
                  lineJoin="round"
                  hitStrokeWidth={18}
                  perfectDrawEnabled={false}
                  listening={mode === 'editor'}
                />
              )
            })}

            {rootNodes.map((node) => (
              <SceneNodeRenderer
                key={node.id}
                ref={(instance) => {
                  if (instance) {
                    nodeRefs.current.set(node.id, instance)
                  } else {
                    nodeRefs.current.delete(node.id)
                  }
                }}
                scene={scene}
                node={node}
                transform={node.transform}
                editorMode={mode === 'editor'}
                selectable
              />
            ))}

            <Transformer
              ref={transformerRef}
              enabledAnchors={[...CORNER_ANCHORS]}
              rotateEnabled
              flipEnabled={false}
              keepRatio
              shiftBehavior="none"
              borderStroke="#2563eb"
              borderStrokeWidth={1.5 * visualControlScale}
              anchorFill="#2563eb"
              anchorStroke="#ffffff"
              anchorSize={9 * visualControlScale}
              rotateAnchorOffset={24 * visualControlScale}
              boundBoxFunc={(oldBox, newBox) => {
                if (
                  Math.abs(newBox.width) < minimumTransformWidth ||
                  Math.abs(newBox.height) < minimumTransformHeight
                ) {
                  return oldBox
                }

                const currentViewport = viewportTransformRef.current
                const sceneLeft =
                  (newBox.x - currentViewport.x) / currentViewport.scale
                const sceneTop =
                  (newBox.y - currentViewport.y) / currentViewport.scale
                const sceneWidth = newBox.width / currentViewport.scale
                const sceneHeight = newBox.height / currentViewport.scale

                if (
                  sceneLeft < 0 ||
                  sceneTop < 0 ||
                  sceneLeft + sceneWidth > scene.width ||
                  sceneTop + sceneHeight > scene.height
                ) {
                  return oldBox
                }

                return newBox
              }}
              onTransform={scheduleTransformPreview}
              onTransformEnd={handleTransformEnd}
            />

            {selectedNodeIds.length > 1 &&
              selectedNodes.map((node) => {
                const bounds = getNodeBounds(scene, node)

                return (
                  <Rect
                    key={node.id}
                    ref={(instance) => {
                      if (instance) {
                        selectionRectRefs.current.set(node.id, instance)
                      } else {
                        selectionRectRefs.current.delete(node.id)
                      }
                    }}
                    x={bounds.left}
                    y={bounds.top}
                    width={bounds.width}
                    height={bounds.height}
                    stroke="#2563eb"
                    strokeWidth={1}
                    dash={[5, 4]}
                    listening={false}
                  />
                )
              })}

            {selectionBounds && (
              <Rect
                ref={selectionBoundsRef}
                x={selectionBounds.left}
                y={selectionBounds.top}
                width={selectionBounds.width}
                height={selectionBounds.height}
                stroke="#0284c7"
                strokeWidth={1.5}
                dash={[9, 5]}
                listening={false}
              />
            )}

            <Line
              ref={verticalGuideRef}
              points={[0, 0, 0, viewport.height]}
              visible={false}
              stroke="#db2777"
              strokeWidth={1}
              perfectDrawEnabled={false}
              listening={false}
            />
            <Line
              ref={horizontalGuideRef}
              points={[0, 0, viewport.width, 0]}
              visible={false}
              stroke="#db2777"
              strokeWidth={1}
              perfectDrawEnabled={false}
              listening={false}
            />

            {marqueeBounds && (
              <Rect
                x={marqueeBounds.left}
                y={marqueeBounds.top}
                width={marqueeBounds.width}
                height={marqueeBounds.height}
                fill="rgba(37, 99, 235, 0.12)"
                stroke="#2563eb"
                strokeWidth={1}
                dash={[6, 4]}
                listening={false}
              />
            )}

            <Line
              ref={connectionPreviewRef}
              points={[0, 0, 0, 0]}
              visible={false}
              stroke="#0f766e"
              strokeWidth={3}
              dash={[8, 6]}
              lineCap="round"
              lineJoin="round"
              perfectDrawEnabled={false}
              listening={false}
            />

            {mode === 'editor' &&
            selectedSourcePosition &&
            selectedTargetPosition && (
              <>
                <Circle
                  ref={selectedSourceHandleRef}
                  id={`${CONNECTION_HANDLE_PREFIX}source`}
                  x={selectedSourcePosition.x}
                  y={selectedSourcePosition.y}
                  radius={7 * visualControlScale}
                  fill="#ffffff"
                  stroke="#2563eb"
                  strokeWidth={2}
                  hitStrokeWidth={12 * visualControlScale}
                  draggable
                  onMouseEnter={() => setStageCursor('grab')}
                  onMouseLeave={() => {
                    if (!reconnectSessionRef.current) {
                      setStageCursor('default')
                    }
                  }}
                  onDragStart={(event) =>
                    beginReconnect('source', event.target as Konva.Circle)
                  }
                  onDragMove={(event) =>
                    scheduleReconnectPreview(event.target as Konva.Circle)
                  }
                  onDragEnd={(event) =>
                    finishReconnect(event.target as Konva.Circle)
                  }
                />
                <Circle
                  ref={selectedTargetHandleRef}
                  id={`${CONNECTION_HANDLE_PREFIX}target`}
                  x={selectedTargetPosition.x}
                  y={selectedTargetPosition.y}
                  radius={7 * visualControlScale}
                  fill="#2563eb"
                  stroke="#ffffff"
                  strokeWidth={2}
                  hitStrokeWidth={12 * visualControlScale}
                  draggable
                  onMouseEnter={() => setStageCursor('grab')}
                  onMouseLeave={() => {
                    if (!reconnectSessionRef.current) {
                      setStageCursor('default')
                    }
                  }}
                  onDragStart={(event) =>
                    beginReconnect('target', event.target as Konva.Circle)
                  }
                  onDragMove={(event) =>
                    scheduleReconnectPreview(event.target as Konva.Circle)
                  }
                  onDragEnd={(event) =>
                    finishReconnect(event.target as Konva.Circle)
                  }
                />
              </>
            )}

            {mode === 'editor' &&
              scene.nodes.filter((node) => !isGroupNode(node)).flatMap((node) => {
                if (!isNodeEffectivelyVisible(scene, node)) {
                  return []
                }

                return getNodePortDefinitions(node).map((port) => {
                  const endpoint = { nodeId: node.id, anchorId: port.id }
                  const position = getPortWorldPosition(scene, endpoint)

                  if (!position) {
                    return null
                  }

                  return (
                    <Circle
                      key={portKey(endpoint)}
                      ref={(instance) => {
                        if (instance) {
                          portRefs.current.set(portKey(endpoint), instance)
                        } else {
                          portRefs.current.delete(portKey(endpoint))
                        }
                      }}
                      id={`${PORT_PREFIX}${node.id}::${port.id}`}
                      x={position.x}
                      y={position.y}
                      radius={5 * visualControlScale}
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth={1.5 * visualControlScale}
                      hitStrokeWidth={10 * visualControlScale}
                      perfectDrawEnabled={false}
                      visible={false}
                      listening={false}
                      opacity={0}
                      onMouseEnter={(event) =>
                        handlePortEnter(event.target as Konva.Circle, endpoint)
                      }
                      onMouseLeave={(event) =>
                        handlePortLeave(event.target as Konva.Circle)
                      }
                    />
                  )
                })
              })}

            {hoveredPort && (
              <Group listening={false}>
                <Rect
                  x={hoveredPort.x + 12}
                  y={hoveredPort.y - 34}
                  width={tooltipWidth}
                  height={26}
                  fill="#0f172a"
                  opacity={0.94}
                  cornerRadius={5}
                />
                <Text
                  x={hoveredPort.x + 20}
                  y={hoveredPort.y - 28}
                  width={tooltipWidth - 16}
                  text={tooltipText}
                  fill="#f8fafc"
                  fontSize={12}
                  listening={false}
                />
              </Group>
            )}
          </Group>
        </Layer>
      </Stage>

      <div className="viewport-controls" aria-label="视口缩放">
        <button type="button" onClick={() => zoomBy(1 / VIEWPORT_ZOOM_FACTOR)} title="缩小">−</button>
        <button type="button" className="zoom-value" onClick={resetViewport} title="恢复 100%">
          {Math.round(viewportTransform.scale * 100)}%
        </button>
        <button type="button" onClick={() => zoomBy(VIEWPORT_ZOOM_FACTOR)} title="放大">+</button>
        <button type="button" onClick={fitScene} title="适应场景">适应</button>
      </div>

      <div className="canvas-status">
        <span className="canvas-status-group">
          <span className="status-mode">
            {mode === 'preview'
              ? '预览'
              : connectionSessionRef.current
                ? '连线'
                : '选择'}
          </span>
          <span className="status-selection">
            {selectedConnectionId ? (
              <>
                <strong>{selectedConnection?.name ?? '连线'}</strong>
                <code>{selectedConnection?.routing ?? 'connection'}</code>
                <span className="status-hint">端点可重连</span>
              </>
            ) : selectedNodeIds.length > 1 ? (
              <>
                <strong>已选 {selectedNodeIds.length} 个对象</strong>
              </>
            ) : primaryNode ? (
              <>
                <strong>{primaryNode.name}</strong>
                <code>{primaryNode.type}</code>
                <span>
                  {Math.round(primaryNode.transform.width)} ×{' '}
                  {Math.round(primaryNode.transform.height)}
                </span>
                <span className="status-hint">
                  @ {Math.round(primaryNode.transform.x)}, {Math.round(primaryNode.transform.y)}
                  {isGroupNode(primaryNode) ? ' · 组合' : ''}
                </span>
              </>
            ) : (
              <span className="status-hint">未选择对象</span>
            )}
          </span>
          <span ref={pointerStatusRef} className="pointer-position">X —  Y —</span>
        </span>
        <span className="canvas-status-group scene-status-summary">
          <span className="zoom-status">{Math.round(viewportTransform.scale * 100)}%</span>
          <strong>{scene.name}</strong>
          <span>{scene.width} × {scene.height}</span>
          <span>{scene.nodes.length} 个组件</span>
          <span>{scene.connections.length} 条连线</span>
        </span>
      </div>
    </div>
  )
}
