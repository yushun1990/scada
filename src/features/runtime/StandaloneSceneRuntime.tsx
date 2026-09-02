import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Group, Layer, Line, Rect, Stage } from 'react-konva'
import type { ComponentRegistry } from '../../component-system/registry'
import type {
  ComponentAttributeValues,
  ComponentPropertyFallbackValues,
} from '../../component-system/definition'
import { fillContentToViewport } from '../../editor/viewport'
import type { PreviewRuntime } from '../../runtime/preview-runtime'
import { getWorldTransform } from '../../scene/geometry'
import { getOrthogonalRoutePoints } from '../../scene/connection-routing'
import {
  isGroupNode,
  type ComponentSceneNode,
  type ConnectionEndpoint,
  type NodeTransform,
  type SceneConnection,
  type SceneDocument,
  type SceneNode,
} from '../../scene/schema'

const EMPTY_COMPONENT_ATTRIBUTES: Readonly<ComponentAttributeValues> = Object.freeze({})
const EMPTY_COMPONENT_PROPERTIES: Readonly<ComponentPropertyFallbackValues> = Object.freeze({})

function rotateVector(vector: { x: number; y: number }, rotation: number) {
  const radians = (rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  }
}

function normalizedPointToWorld(
  transform: NodeTransform,
  point: { x: number; y: number },
) {
  const radians = (transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const localX = point.x * transform.width
  const localY = point.y * transform.height
  return {
    x: transform.x + localX * cosine - localY * sine,
    y: transform.y + localX * sine + localY * cosine,
  }
}

function resolveEndpoint(
  scene: SceneDocument,
  registry: ComponentRegistry,
  endpoint: ConnectionEndpoint,
) {
  const node = scene.nodes.find((candidate) => candidate.id === endpoint.nodeId)
  if (!node || isGroupNode(node)) return null

  const anchor = registry
    .get(node.type)
    ?.definition.anchors.find((candidate) => candidate.id === endpoint.anchorId)
  const transform = getWorldTransform(scene, node.id)
  if (!anchor || !transform) return null

  return {
    point: normalizedPointToWorld(transform, anchor.position),
    direction: rotateVector(anchor.outward, transform.rotation),
  }
}

function connectionPoints(
  scene: SceneDocument,
  registry: ComponentRegistry,
  connection: SceneConnection,
) {
  const source = resolveEndpoint(scene, registry, connection.source)
  const target = resolveEndpoint(scene, registry, connection.target)
  if (!source || !target) return null

  if (connection.routing === 'straight') {
    return [source.point.x, source.point.y, target.point.x, target.point.y]
  }

  return getOrthogonalRoutePoints(
    source.point,
    target.point,
    source.direction,
    target.direction,
  ).flatMap((point) => [point.x, point.y])
}

function nodeEffectivelyVisible(scene: SceneDocument, node: SceneNode) {
  if (!node.visible) return false

  let parentId = node.parentId
  const visited = new Set([node.id])
  while (parentId) {
    if (visited.has(parentId)) return false
    visited.add(parentId)
    const parent = scene.nodes.find((candidate) => candidate.id === parentId)
    if (!parent?.visible) return false
    parentId = parent.parentId
  }
  return true
}

function RuntimeComponentNode({
  node,
  registry,
  runtime,
  visible,
}: {
  node: ComponentSceneNode
  registry: ComponentRegistry
  runtime: PreviewRuntime
  visible: boolean
}) {
  const registration = registry.get(node.type)
  const ComponentRenderer = registration?.renderer
  const runtimeAttributes = useSyncExternalStore(
    runtime.componentAttributes.subscribe,
    () => runtime.componentAttributes.getNodeSnapshot(node.id),
    () => EMPTY_COMPONENT_ATTRIBUTES,
  )
  const runtimeProperties = useSyncExternalStore(
    runtime.componentProps.subscribe,
    () => runtime.componentProps.getNodeSnapshot(node.id),
    () => EMPTY_COMPONENT_PROPERTIES,
  )
  const attributes = runtime.isRunning ? runtimeAttributes : node.attributes
  const properties = runtime.isRunning ? runtimeProperties : node.propertyFallbacks

  if (!ComponentRenderer) return null

  return (
    <ComponentRenderer
      attributes={attributes}
      properties={properties}
      x={node.transform.x}
      y={node.transform.y}
      width={node.transform.width}
      height={node.transform.height}
      rotation={node.transform.rotation}
      draggable={false}
      visible={visible}
      opacity={1}
      listening
    />
  )
}

function RuntimeNode({
  scene,
  node,
  registry,
  runtime,
  parentVisible = true,
}: {
  scene: SceneDocument
  node: SceneNode
  registry: ComponentRegistry
  runtime: PreviewRuntime
  parentVisible?: boolean
}) {
  const effectiveVisible = parentVisible && node.visible

  if (!isGroupNode(node)) {
    return (
      <RuntimeComponentNode
        node={node}
        registry={registry}
        runtime={runtime}
        visible={effectiveVisible}
      />
    )
  }

  const children = scene.nodes.filter((candidate) => candidate.parentId === node.id)
  const scaleX = node.transform.width / node.props.designWidth
  const scaleY = node.transform.height / node.props.designHeight

  return (
    <Group
      x={node.transform.x}
      y={node.transform.y}
      width={node.props.designWidth}
      height={node.props.designHeight}
      rotation={node.transform.rotation}
      scaleX={scaleX}
      scaleY={scaleY}
      visible={effectiveVisible}
      listening
    >
      {children.map((child) => (
        <RuntimeNode
          key={child.id}
          scene={scene}
          node={child}
          registry={registry}
          runtime={runtime}
          parentVisible={effectiveVisible}
        />
      ))}
    </Group>
  )
}

export function StandaloneSceneRuntime({
  scene,
  registry,
  runtime,
  acquireRuntime,
}: {
  scene: SceneDocument
  registry: ComponentRegistry
  runtime: PreviewRuntime
  acquireRuntime: () => () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 960, height: 640 })

  useEffect(() => acquireRuntime(), [acquireRuntime])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setViewport({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(240, Math.floor(entry.contentRect.height)),
      })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const transform = fillContentToViewport(viewport, {
    width: scene.width,
    height: scene.height,
    centerX: scene.width / 2,
    centerY: scene.height / 2,
  })
  const rootNodes = scene.nodes.filter((node) => node.parentId === null)

  return (
    <div className="standalone-runtime-canvas" ref={containerRef}>
      <Stage width={viewport.width} height={viewport.height} listening>
        <Layer listening>
          <Group
            x={transform.x}
            y={transform.y}
            scaleX={transform.scale}
            scaleY={transform.scale}
            listening
          >
            <Rect
              x={0}
              y={0}
              width={scene.width}
              height={scene.height}
              fill={scene.background}
              listening={false}
            />

            {scene.connections.map((connection) => {
              const points = connectionPoints(scene, registry, connection)
              if (!points) return null
              const sourceNode = scene.nodes.find(
                (node) => node.id === connection.source.nodeId,
              )
              const targetNode = scene.nodes.find(
                (node) => node.id === connection.target.nodeId,
              )
              if (
                !sourceNode ||
                !targetNode ||
                !nodeEffectivelyVisible(scene, sourceNode) ||
                !nodeEffectivelyVisible(scene, targetNode)
              ) {
                return null
              }

              return (
                <Line
                  key={connection.id}
                  points={points}
                  stroke={connection.style.stroke}
                  strokeWidth={connection.style.strokeWidth}
                  dash={connection.style.dash === 'dashed' ? [10, 8] : undefined}
                  lineCap="round"
                  lineJoin="round"
                  listening={false}
                />
              )
            })}

            {rootNodes.map((node) => (
              <RuntimeNode
                key={node.id}
                scene={scene}
                node={node}
                registry={registry}
                runtime={runtime}
              />
            ))}
          </Group>
        </Layer>
      </Stage>
    </div>
  )
}