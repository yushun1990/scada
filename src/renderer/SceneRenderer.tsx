import { useEffect, useRef, useState } from 'react'
import type Konva from 'konva'
import { Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import {
  PUMP_MIN_HEIGHT,
  PUMP_MIN_WIDTH,
} from '../components/PumpNode'
import {
  boundsIntersect,
  computeSnap,
  getNodeBounds,
  getSelectionBounds,
  type AlignmentGuide,
  type Bounds,
  type SnapSettings,
  type TransformUpdates,
} from '../scene/geometry'
import type { SceneDocument } from '../scene/model'
import { SceneNodeRenderer } from './SceneNodeRenderer'

export type RendererMode = 'editor' | 'preview'

export type SceneRendererProps = {
  scene: SceneDocument
  mode: RendererMode
  selectedNodeIds: string[]
  snapSettings: SnapSettings
  onSelectionChange: (nodeIds: string[]) => void
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

const CORNER_ANCHORS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const

const MARQUEE_THRESHOLD = 4

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

export function SceneRenderer({
  scene,
  mode,
  selectedNodeIds,
  snapSettings,
  onSelectionChange,
  onTransformNodes,
}: SceneRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const nodeRefs = useRef(new Map<string, Konva.Group>())
  const pendingSelectionRef = useRef<string[] | null>(null)
  const dragSessionRef = useRef<DragSession | null>(null)
  const dragPreviewRef = useRef<TransformUpdates>({})
  const marqueeSessionRef = useRef<MarqueeSession | null>(null)
  const [viewport, setViewport] = useState({ width: 960, height: 640 })
  const [guides, setGuides] = useState<AlignmentGuide[]>([])
  const [dragPreview, setDragPreview] = useState<TransformUpdates>({})
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)

  const selectedNodes = scene.nodes.filter((node) =>
    selectedNodeIds.includes(node.id),
  )
  const primaryNode = selectedNodes.find(
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
      setMarquee(null)
      setGuides([])
    }

    window.addEventListener('blur', cancelTransientInteraction)
    return () => window.removeEventListener('blur', cancelTransientInteraction)
  }, [])

  useEffect(() => {
    if (mode === 'editor') {
      return
    }

    pendingSelectionRef.current = null
    marqueeSessionRef.current = null
    dragSessionRef.current = null
    dragPreviewRef.current = {}
    setMarquee(null)
    setGuides([])
    setDragPreview({})
  }, [mode])

  useEffect(() => {
    const transformer = transformerRef.current

    if (!transformer) {
      return
    }

    const nodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null
    const selectedNode = nodeId
      ? scene.nodes.find((node) => node.id === nodeId)
      : null
    const selectedNodeRef = nodeId
      ? nodeRefs.current.get(nodeId)
      : undefined

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

  function clearMarqueeSession() {
    marqueeSessionRef.current = null
    setMarquee(null)
  }

  function cancelPointerInteraction() {
    pendingSelectionRef.current = null
    clearMarqueeSession()
  }

  function applyPreview(updates: TransformUpdates) {
    for (const [nodeId, transform] of Object.entries(updates)) {
      nodeRefs.current.get(nodeId)?.position({
        x: transform.x,
        y: transform.y,
      })
    }

    dragPreviewRef.current = updates
    setDragPreview(updates)
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
    onSelectionChange(nextSelection)
  }

  function handleDragStart(target: Konva.Node) {
    if (mode !== 'editor') {
      return
    }

    clearMarqueeSession()

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
      const node = scene.nodes.find((candidate) => candidate.id === id)
      return node && !node.locked
    })

    const initialBounds = getSelectionBounds(scene, nodeIds)

    if (!initialBounds) {
      pendingSelectionRef.current = null
      return
    }

    const initialTransforms: TransformUpdates = {}

    for (const id of nodeIds) {
      const node = scene.nodes.find((candidate) => candidate.id === id)

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
    setDragPreview({})
    setGuides([])
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

    applyPreview(updates)
    setGuides(snapResult.guides)
  }

  function handleDragEnd() {
    const updates = dragPreviewRef.current

    if (Object.keys(updates).length > 0) {
      onTransformNodes(updates)
    }

    pendingSelectionRef.current = null
    dragSessionRef.current = null
    dragPreviewRef.current = {}
    setDragPreview({})
    setGuides([])
  }

  function handleTransformEnd() {
    if (selectedNodeIds.length !== 1) {
      return
    }

    const nodeId = selectedNodeIds[0]
    const node = scene.nodes.find((candidate) => candidate.id === nodeId)
    const group = nodeId ? nodeRefs.current.get(nodeId) : undefined

    if (!node || !group || node.locked) {
      return
    }

    const uniformScale = Math.max(
      Math.abs(group.scaleX()),
      Math.abs(group.scaleY()),
    )
    const aspectRatio = node.transform.width / node.transform.height
    const nextWidth = Math.max(PUMP_MIN_WIDTH, group.width() * uniformScale)
    const nextHeight = nextWidth / aspectRatio

    group.scaleX(1)
    group.scaleY(1)

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
      }
      return
    }

    const bounds = normalizeMarquee(session)
    const matchedIds = scene.nodes
      .filter(
        (node) =>
          node.visible &&
          !node.locked &&
          boundsIntersect(bounds, getNodeBounds(node)),
      )
      .map((node) => node.id)

    onSelectionChange(
      session.additive
        ? Array.from(new Set([...selectedNodeIds, ...matchedIds]))
        : matchedIds,
    )
  }

  function handleStageMouseUp() {
    if (marqueeSessionRef.current) {
      finishMarquee()
      return
    }

    if (!dragSessionRef.current) {
      pendingSelectionRef.current = null
    }
  }

  const selectionBounds = selectedNodeIds.length > 1
    ? getSelectionBounds(scene, selectedNodeIds, dragPreview)
    : null
  const marqueeBounds = marquee ? normalizeMarquee(marquee) : null

  return (
    <div
      ref={containerRef}
      className="konva-host"
      style={{
        backgroundImage: snapSettings.gridEnabled
          ? undefined
          : 'none',
        backgroundSize: `${snapSettings.gridSize}px ${snapSettings.gridSize}px`,
      }}
    >
      <Stage
        width={viewport.width}
        height={viewport.height}
        onMouseDown={(event) => {
          if (isInsideTransformer(event.target, transformerRef.current)) {
            cancelPointerInteraction()
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
          }
        }}
        onMouseMove={(event) => {
          const stage = event.target.getStage()

          if (stage) {
            updateMarquee(stage)
          }
        }}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={cancelPointerInteraction}
        onDragStart={(event) => {
          handleDragStart(event.target)
        }}
        onDragMove={(event) => {
          handleDragMove(event.target)
        }}
        onDragEnd={handleDragEnd}
      >
        <Layer listening={false}>
          <Rect
            width={viewport.width}
            height={viewport.height}
            fill={scene.background}
          />
        </Layer>

        <Layer>
          {scene.nodes.map((node) => (
            <SceneNodeRenderer
              key={node.id}
              ref={(instance) => {
                if (instance) {
                  nodeRefs.current.set(node.id, instance)
                } else {
                  nodeRefs.current.delete(node.id)
                }
              }}
              node={node}
              transform={dragPreview[node.id] ?? node.transform}
              editorMode={mode === 'editor'}
            />
          ))}

          <Transformer
            ref={transformerRef}
            enabledAnchors={[...CORNER_ANCHORS]}
            rotateEnabled
            flipEnabled={false}
            keepRatio
            shiftBehavior="none"
            borderStroke="#38bdf8"
            borderStrokeWidth={1.5}
            anchorFill="#38bdf8"
            anchorStroke="#e0f7ff"
            anchorSize={9}
            rotateAnchorOffset={24}
            boundBoxFunc={(oldBox, newBox) => {
              if (
                Math.abs(newBox.width) < PUMP_MIN_WIDTH ||
                Math.abs(newBox.height) < PUMP_MIN_HEIGHT
              ) {
                return oldBox
              }

              return newBox
            }}
            onTransformEnd={handleTransformEnd}
          />
        </Layer>

        <Layer listening={false}>
          {selectedNodeIds.length > 1 &&
            selectedNodes.map((node) => {
              const bounds = getNodeBounds(
                node,
                dragPreview[node.id] ?? node.transform,
              )

              return (
                <Rect
                  key={node.id}
                  x={bounds.left}
                  y={bounds.top}
                  width={bounds.width}
                  height={bounds.height}
                  stroke="#38bdf8"
                  strokeWidth={1}
                  dash={[5, 4]}
                />
              )
            })}

          {selectionBounds && (
            <Rect
              x={selectionBounds.left}
              y={selectionBounds.top}
              width={selectionBounds.width}
              height={selectionBounds.height}
              stroke="#7dd3fc"
              strokeWidth={1.5}
              dash={[9, 5]}
            />
          )}

          {guides.map((guide, index) => (
            <Line
              key={`${guide.orientation}-${guide.position}-${index}`}
              points={
                guide.orientation === 'vertical'
                  ? [guide.position, 0, guide.position, viewport.height]
                  : [0, guide.position, viewport.width, guide.position]
              }
              stroke={guide.source === 'object' ? '#f472b6' : '#22d3ee'}
              strokeWidth={1}
              dash={guide.source === 'grid' ? [5, 4] : undefined}
            />
          ))}

          {marqueeBounds && (
            <Rect
              x={marqueeBounds.left}
              y={marqueeBounds.top}
              width={marqueeBounds.width}
              height={marqueeBounds.height}
              fill="rgba(56, 189, 248, 0.12)"
              stroke="#38bdf8"
              strokeWidth={1}
              dash={[6, 4]}
            />
          )}
        </Layer>
      </Stage>

      <div className="canvas-status">
        <span>{mode === 'editor' ? '编辑模式' : '预览模式'}</span>
        {selectedNodeIds.length > 1 ? (
          <code>{selectedNodeIds.length} selected</code>
        ) : primaryNode ? (
          <code>
            {Math.round(primaryNode.transform.width)} ×{' '}
            {Math.round(primaryNode.transform.height)} /{' '}
            {Math.round(primaryNode.transform.rotation)}°
          </code>
        ) : (
          <code>{scene.nodes.length} nodes</code>
        )}
      </div>
    </div>
  )
}
