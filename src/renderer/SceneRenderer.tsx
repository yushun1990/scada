import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Circle, Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import {
  PUMP_MIN_HEIGHT,
  PUMP_MIN_WIDTH,
} from '../components/PumpNode'
import {
  getNodePortDefinitions,
  getPortWorldPosition,
  isNodeEffectivelyVisible,
  normalizeConnectionEndpoints,
} from '../components/ports'
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
import {
  isGroupNode,
  isPumpNode,
  type ConnectionEndpoint,
  type SceneConnection,
  type SceneDocument,
} from '../scene/model'
import { SceneNodeRenderer } from './SceneNodeRenderer'

export type RendererMode = 'editor' | 'preview'

export type SceneRendererProps = {
  scene: SceneDocument
  mode: RendererMode
  selectedNodeIds: string[]
  selectedConnectionId: string | null
  connectionMode: boolean
  snapSettings: SnapSettings
  gridVisible: boolean
  onSelectionChange: (nodeIds: string[]) => void
  onConnectionSelectionChange: (connectionId: string | null) => void
  onCreateConnection: (
    source: ConnectionEndpoint,
    target: ConnectionEndpoint,
  ) => void
  onTransformNodes: (updates: TransformUpdates) => void
}

type Point = {
  x: number
  y: number
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
  initialBounds: Bounds
  initialTransforms: TransformUpdates
}

type ConnectionSession = {
  source: ConnectionEndpoint
  current: Point
}

const CORNER_ANCHORS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const

const MARQUEE_THRESHOLD = 4
const GROUP_MIN_SIZE = 48
const PORT_PREFIX = 'scene-port::'
const CONNECTION_PREFIX = 'scene-connection::'

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
      const [, nodeId, portId] = id.split('::')

      if (nodeId && portId) {
        return { nodeId, portId }
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

function getConnectionPoints(
  scene: SceneDocument,
  connection: SceneConnection,
  overrides: TransformUpdates = {},
) {
  const source = getPortWorldPosition(scene, connection.source, overrides)
  const target = getPortWorldPosition(scene, connection.target, overrides)

  if (!source || !target) {
    return null
  }

  return [source.x, source.y, target.x, target.y]
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
  return `${endpoint.nodeId}::${endpoint.portId}`
}

export function SceneRenderer({
  scene,
  mode,
  selectedNodeIds,
  selectedConnectionId,
  connectionMode,
  snapSettings,
  gridVisible,
  onSelectionChange,
  onConnectionSelectionChange,
  onCreateConnection,
  onTransformNodes,
}: SceneRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const nodeLayerRef = useRef<Konva.Layer>(null)
  const connectionLayerRef = useRef<Konva.Layer>(null)
  const overlayLayerRef = useRef<Konva.Layer>(null)
  const portLayerRef = useRef<Konva.Layer>(null)
  const connectionPreviewRef = useRef<Konva.Line>(null)
  const verticalGuideRef = useRef<Konva.Line>(null)
  const horizontalGuideRef = useRef<Konva.Line>(null)
  const selectionBoundsRef = useRef<Konva.Rect>(null)
  const nodeRefs = useRef(new Map<string, Konva.Group>())
  const connectionRefs = useRef(new Map<string, Konva.Line>())
  const portRefs = useRef(new Map<string, Konva.Circle>())
  const selectionRectRefs = useRef(new Map<string, Konva.Rect>())
  const pendingSelectionRef = useRef<string[] | null>(null)
  const dragSessionRef = useRef<DragSession | null>(null)
  const dragPreviewRef = useRef<TransformUpdates>({})
  const marqueeSessionRef = useRef<MarqueeSession | null>(null)
  const connectionSessionRef = useRef<ConnectionSession | null>(null)
  const [viewport, setViewport] = useState({ width: 960, height: 640 })
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)

  const rootNodes = getRootNodes(scene)
  const selectedNodes = rootNodes.filter((node) =>
    selectedNodeIds.includes(node.id),
  )
  const primaryNode =
    selectedNodes.find(
      (node) => node.id === selectedNodeIds[selectedNodeIds.length - 1],
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

      setViewport({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(360, Math.floor(entry.contentRect.height)),
      })
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const cancelTransientInteraction = () => {
      pendingSelectionRef.current = null
      marqueeSessionRef.current = null
      connectionSessionRef.current = null
      setMarquee(null)
      hideConnectionPreview()
      hideGuides()
    }

    window.addEventListener('blur', cancelTransientInteraction)
    return () => window.removeEventListener('blur', cancelTransientInteraction)
  })

  useEffect(() => {
    if (mode === 'editor') {
      return
    }

    pendingSelectionRef.current = null
    marqueeSessionRef.current = null
    connectionSessionRef.current = null
    dragSessionRef.current = null
    dragPreviewRef.current = {}
    setMarquee(null)
    hideConnectionPreview()
    hideGuides()
  }, [mode])

  useEffect(() => {
    if (connectionMode) {
      return
    }

    connectionSessionRef.current = null
    hideConnectionPreview()
  }, [connectionMode])

  useEffect(() => {
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
    transformer.getLayer()?.batchDraw()
  }, [mode, selectedNodeIds, scene.nodes])

  function hideGuides() {
    verticalGuideRef.current?.visible(false)
    horizontalGuideRef.current?.visible(false)
    overlayLayerRef.current?.batchDraw()
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
          viewport.height,
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
          viewport.width,
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

  function refreshConnections(overrides: TransformUpdates) {
    for (const connection of scene.connections) {
      const line = connectionRefs.current.get(connection.id)

      if (!line) {
        continue
      }

      const points = getConnectionPoints(scene, connection, overrides)
      const visible = Boolean(
        points && isConnectionVisible(scene, connection),
      )
      line.visible(visible)

      if (points) {
        line.points(points)
      }
    }

    connectionLayerRef.current?.batchDraw()
  }

  function refreshPorts(overrides: TransformUpdates) {
    if (!connectionMode) {
      return
    }

    for (const node of scene.nodes.filter(isPumpNode)) {
      for (const port of getNodePortDefinitions(node)) {
        const circle = portRefs.current.get(
          portKey({ nodeId: node.id, portId: port.id }),
        )

        if (!circle) {
          continue
        }

        const position = getPortWorldPosition(
          scene,
          { nodeId: node.id, portId: port.id },
          overrides,
        )
        circle.visible(Boolean(position) && isNodeEffectivelyVisible(scene, node))

        if (position) {
          circle.position(position)
        }
      }
    }

    portLayerRef.current?.batchDraw()
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

  function refreshDragDecorations(
    overrides: TransformUpdates,
    guides: AlignmentGuide[],
  ) {
    refreshConnections(overrides)
    refreshPorts(overrides)
    refreshSelection(overrides)
    updateGuides(guides)
    overlayLayerRef.current?.batchDraw()
  }

  function clearMarqueeSession() {
    marqueeSessionRef.current = null
    setMarquee(null)
  }

  function hideConnectionPreview() {
    connectionPreviewRef.current?.visible(false)
    overlayLayerRef.current?.batchDraw()
  }

  function clearConnectionSession() {
    connectionSessionRef.current = null
    hideConnectionPreview()
  }

  function cancelPointerInteraction() {
    pendingSelectionRef.current = null
    clearMarqueeSession()
    clearConnectionSession()
  }

  function applyPreview(
    updates: TransformUpdates,
    guides: AlignmentGuide[],
  ) {
    for (const [nodeId, transform] of Object.entries(updates)) {
      nodeRefs.current.get(nodeId)?.position({
        x: transform.x,
        y: transform.y,
      })
    }

    dragPreviewRef.current = updates
    refreshDragDecorations(updates, guides)
    nodeLayerRef.current?.batchDraw()
  }

  function handleNodePointerDown(target: Konva.Node, nativeEvent: Event) {
    if (mode !== 'editor') {
      return
    }

    clearMarqueeSession()
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
      initialBounds,
      initialTransforms,
    }
    pendingSelectionRef.current = null
    dragPreviewRef.current = {}
    hideGuides()
  }

  function handleDragMove(target: Konva.Node) {
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
      snapSettings,
    )
    const updates: TransformUpdates = {}

    for (const nodeId of session.nodeIds) {
      const transform = session.initialTransforms[nodeId]

      if (!transform) {
        continue
      }

      updates[nodeId] = {
        ...transform,
        x: transform.x + snapResult.delta.x,
        y: transform.y + snapResult.delta.y,
      }
    }

    applyPreview(updates, snapResult.guides)
  }

  function handleDragEnd() {
    const updates = dragPreviewRef.current

    if (Object.keys(updates).length > 0) {
      onTransformNodes(updates)
    }

    pendingSelectionRef.current = null
    dragSessionRef.current = null
    dragPreviewRef.current = {}
    hideGuides()
  }

  function handleTransformEnd() {
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

    const aspectRatio = node.transform.width / node.transform.height
    const minimumWidth = isGroupNode(node) ? GROUP_MIN_SIZE : PUMP_MIN_WIDTH
    const baseWidth = isGroupNode(node)
      ? node.props.designWidth
      : group.width()
    const uniformScale = Math.max(
      Math.abs(group.scaleX()),
      Math.abs(group.scaleY()),
    )
    const nextWidth = Math.max(minimumWidth, baseWidth * uniformScale)
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

    const pointer = stage.getPointerPosition()

    if (!pointer) {
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
    const pointer = stage.getPointerPosition()

    if (!session || !pointer) {
      return
    }

    const movedEnough =
      Math.abs(pointer.x - session.start.x) >= MARQUEE_THRESHOLD ||
      Math.abs(pointer.y - session.start.y) >= MARQUEE_THRESHOLD
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
    const session = { source: endpoint, current: point }
    connectionSessionRef.current = session
    connectionPreviewRef.current?.points([
      point.x,
      point.y,
      point.x,
      point.y,
    ])
    connectionPreviewRef.current?.visible(true)
    overlayLayerRef.current?.batchDraw()
    onSelectionChange([])
    onConnectionSelectionChange(null)
  }

  function updateConnectionPreview(stage: Konva.Stage) {
    const session = connectionSessionRef.current
    const pointer = stage.getPointerPosition()

    if (!session || !pointer) {
      return
    }

    session.current = pointer
    const source = getPortWorldPosition(scene, session.source)

    if (!source) {
      return
    }

    connectionPreviewRef.current?.points([
      source.x,
      source.y,
      pointer.x,
      pointer.y,
    ])
    overlayLayerRef.current?.batchDraw()
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
  const verticalGridLines = gridVisible
    ? Array.from(
        { length: Math.ceil(viewport.width / gridSize) + 1 },
        (_, index) => index * gridSize,
      )
    : []
  const horizontalGridLines = gridVisible
    ? Array.from(
        { length: Math.ceil(viewport.height / gridSize) + 1 },
        (_, index) => index * gridSize,
      )
    : []
  const darkBackground = isDarkBackground(scene.background)
  const minorGridStroke = darkBackground
    ? 'rgba(203, 213, 225, 0.16)'
    : 'rgba(100, 116, 139, 0.14)'
  const majorGridStroke = darkBackground
    ? 'rgba(148, 163, 184, 0.28)'
    : 'rgba(71, 85, 105, 0.22)'

  return (
    <div
      ref={containerRef}
      className="konva-host"
      style={{ backgroundColor: scene.background }}
    >
      <Stage
        width={viewport.width}
        height={viewport.height}
        onMouseDown={(event) => {
          if (isInsideTransformer(event.target, transformerRef.current)) {
            cancelPointerInteraction()
            return
          }

          const portEndpoint = findPortEndpoint(event.target)

          if (connectionMode && portEndpoint) {
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

          if (connectionSessionRef.current) {
            updateConnectionPreview(stage)
          } else {
            updateMarquee(stage)
          }
        }}
        onMouseUp={(event) => handleStageMouseUp(event.target)}
        onMouseLeave={cancelPointerInteraction}
        onDragStart={(event) => handleDragStart(event.target)}
        onDragMove={(event) => handleDragMove(event.target)}
        onDragEnd={handleDragEnd}
      >
        <Layer listening={false}>
          <Rect
            width={viewport.width}
            height={viewport.height}
            fill={scene.background}
          />

          {verticalGridLines.map((x, index) => (
            <Line
              key={`grid-x-${x}`}
              points={[x, 0, x, viewport.height]}
              stroke={index % 5 === 0 ? majorGridStroke : minorGridStroke}
              strokeWidth={index % 5 === 0 ? 0.8 : 0.6}
              perfectDrawEnabled={false}
            />
          ))}

          {horizontalGridLines.map((y, index) => (
            <Line
              key={`grid-y-${y}`}
              points={[0, y, viewport.width, y]}
              stroke={index % 5 === 0 ? majorGridStroke : minorGridStroke}
              strokeWidth={index % 5 === 0 ? 0.8 : 0.6}
              perfectDrawEnabled={false}
            />
          ))}
        </Layer>

        <Layer ref={connectionLayerRef} listening={mode === 'editor'}>
          {scene.connections.map((connection) => {
            const points = getConnectionPoints(scene, connection)

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
              />
            )
          })}
        </Layer>

        <Layer ref={nodeLayerRef}>
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
            borderStrokeWidth={1.5}
            anchorFill="#2563eb"
            anchorStroke="#ffffff"
            anchorSize={9}
            rotateAnchorOffset={24}
            boundBoxFunc={(oldBox, newBox) => {
              if (
                Math.abs(newBox.width) < minimumTransformWidth ||
                Math.abs(newBox.height) < minimumTransformHeight
              ) {
                return oldBox
              }

              return newBox
            }}
            onTransformEnd={handleTransformEnd}
          />
        </Layer>

        <Layer ref={overlayLayerRef} listening={false}>
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
            />
          )}

          <Line
            ref={verticalGuideRef}
            points={[0, 0, 0, viewport.height]}
            visible={false}
            stroke="#db2777"
            strokeWidth={1}
            perfectDrawEnabled={false}
          />
          <Line
            ref={horizontalGuideRef}
            points={[0, 0, viewport.width, 0]}
            visible={false}
            stroke="#db2777"
            strokeWidth={1}
            perfectDrawEnabled={false}
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
            perfectDrawEnabled={false}
          />
        </Layer>

        <Layer
          ref={portLayerRef}
          listening={mode === 'editor' && connectionMode}
        >
          {mode === 'editor' &&
            connectionMode &&
            scene.nodes.filter(isPumpNode).flatMap((node) => {
              if (!isNodeEffectivelyVisible(scene, node)) {
                return []
              }

              return getNodePortDefinitions(node).map((port) => {
                const endpoint = { nodeId: node.id, portId: port.id }
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
                    radius={7}
                    fill={
                      port.direction === 'input' ? '#f59e0b' : '#0f766e'
                    }
                    stroke="#ffffff"
                    strokeWidth={2}
                    shadowColor="rgba(15, 23, 42, 0.28)"
                    shadowBlur={4}
                    hitStrokeWidth={10}
                  />
                )
              })
            })}
        </Layer>
      </Stage>

      <div className="canvas-status">
        <span>
          {mode === 'editor'
            ? connectionMode
              ? '连线模式'
              : '编辑模式'
            : '预览模式'}
        </span>
        {selectedConnectionId ? (
          <code>connection selected</code>
        ) : selectedNodeIds.length > 1 ? (
          <code>{selectedNodeIds.length} selected</code>
        ) : primaryNode ? (
          <code>
            {isGroupNode(primaryNode) ? 'group · ' : ''}
            {Math.round(primaryNode.transform.width)} ×{' '}
            {Math.round(primaryNode.transform.height)} /{' '}
            {Math.round(primaryNode.transform.rotation)}°
          </code>
        ) : (
          <code>{scene.connections.length} connections</code>
        )}
      </div>
    </div>
  )
}
