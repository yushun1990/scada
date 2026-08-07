import {
  isGroupNode,
  type ConnectionEndpoint,
  type NodeTransform,
  type SceneDocument,
  type SceneNode,
} from '../scene/model'
import { getWorldTransform, type TransformUpdates } from '../scene/geometry'

export type VisualAnchorRole = 'neutral' | 'source' | 'target' | 'both'

export type VisualAnchorDefinition = {
  id: string
  title: string
  position: {
    x: number
    y: number
  }
  outward: {
    x: number
    y: number
  }
  snapRadius?: number
  role?: VisualAnchorRole
  kinds?: string[]
}

function anchor(
  id: string,
  title: string,
  x: number,
  y: number,
  outwardX: number,
  outwardY: number,
): VisualAnchorDefinition {
  return {
    id,
    title,
    position: { x, y },
    outward: { x: outwardX, y: outwardY },
    snapRadius: 24,
    role: 'neutral',
  }
}

export const DEFAULT_RECT_ANCHORS: readonly VisualAnchorDefinition[] = [
  anchor('top-left', '左上角', 0, 0, -1, -1),
  anchor('top-25', '上边 25%', 0.25, 0, 0, -1),
  anchor('top-center', '上边中心', 0.5, 0, 0, -1),
  anchor('top-75', '上边 75%', 0.75, 0, 0, -1),
  anchor('top-right', '右上角', 1, 0, 1, -1),
  anchor('right-25', '右边 25%', 1, 0.25, 1, 0),
  anchor('right-center', '右边中心', 1, 0.5, 1, 0),
  anchor('right-75', '右边 75%', 1, 0.75, 1, 0),
  anchor('bottom-right', '右下角', 1, 1, 1, 1),
  anchor('bottom-75', '下边 75%', 0.75, 1, 0, 1),
  anchor('bottom-center', '下边中心', 0.5, 1, 0, 1),
  anchor('bottom-25', '下边 25%', 0.25, 1, 0, 1),
  anchor('bottom-left', '左下角', 0, 1, -1, 1),
  anchor('left-75', '左边 75%', 0, 0.75, -1, 0),
  anchor('left-center', '左边中心', 0, 0.5, -1, 0),
  anchor('left-25', '左边 25%', 0, 0.25, -1, 0),
]

const anchorsByType: Record<string, readonly VisualAnchorDefinition[]> = {}

export function getNodeAnchorDefinitions(node: SceneNode) {
  if (isGroupNode(node)) {
    return []
  }

  return anchorsByType[node.type] ?? DEFAULT_RECT_ANCHORS
}

export function getAnchorDefinition(node: SceneNode, anchorId: string) {
  return getNodeAnchorDefinitions(node).find((item) => item.id === anchorId) ?? null
}

export function getAnchorWorldPosition(
  scene: SceneDocument,
  endpoint: ConnectionEndpoint,
  overrides: TransformUpdates = {},
) {
  const node = scene.nodes.find((candidate) => candidate.id === endpoint.nodeId)

  if (!node || isGroupNode(node)) {
    return null
  }

  const anchorDefinition = getAnchorDefinition(node, endpoint.anchorId)
  const transform = getWorldTransform(scene, node.id, overrides)

  if (!anchorDefinition || !transform) {
    return null
  }

  return normalizedPointToWorld(transform, anchorDefinition.position)
}

export function getAnchorWorldDirection(
  scene: SceneDocument,
  endpoint: ConnectionEndpoint,
  overrides: TransformUpdates = {},
) {
  const node = scene.nodes.find((candidate) => candidate.id === endpoint.nodeId)

  if (!node || isGroupNode(node)) {
    return null
  }

  const anchorDefinition = getAnchorDefinition(node, endpoint.anchorId)
  const transform = getWorldTransform(scene, node.id, overrides)

  if (!anchorDefinition || !transform) {
    return null
  }

  return rotateVector(anchorDefinition.outward, transform.rotation)
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

function rotateVector(vector: { x: number; y: number }, rotation: number) {
  const radians = (rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)

  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  }
}

function canActAsSource(role: VisualAnchorRole | undefined) {
  return role === undefined || role === 'neutral' || role === 'source' || role === 'both'
}

function canActAsTarget(role: VisualAnchorRole | undefined) {
  return role === undefined || role === 'neutral' || role === 'target' || role === 'both'
}

function kindsCompatible(
  first: VisualAnchorDefinition,
  second: VisualAnchorDefinition,
) {
  if (!first.kinds?.length || !second.kinds?.length) {
    return true
  }

  return first.kinds.some((kind) => second.kinds?.includes(kind))
}

export function normalizeVisualConnectionEndpoints(
  scene: SceneDocument,
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
) {
  if (
    source.nodeId === target.nodeId &&
    source.anchorId === target.anchorId
  ) {
    return null
  }

  const sourceNode = scene.nodes.find((node) => node.id === source.nodeId)
  const targetNode = scene.nodes.find((node) => node.id === target.nodeId)

  if (!sourceNode || !targetNode) {
    return null
  }

  const sourceAnchor = getAnchorDefinition(sourceNode, source.anchorId)
  const targetAnchor = getAnchorDefinition(targetNode, target.anchorId)

  if (
    !sourceAnchor ||
    !targetAnchor ||
    !canActAsSource(sourceAnchor.role) ||
    !canActAsTarget(targetAnchor.role) ||
    !kindsCompatible(sourceAnchor, targetAnchor)
  ) {
    return null
  }

  return { source, target }
}

export function isNodeEffectivelyVisible(scene: SceneDocument, node: SceneNode) {
  if (!node.visible) {
    return false
  }

  let parentId = node.parentId
  const visited = new Set<string>([node.id])

  while (parentId) {
    if (visited.has(parentId)) {
      return false
    }

    visited.add(parentId)
    const parent = scene.nodes.find((candidate) => candidate.id === parentId)

    if (!parent || !parent.visible) {
      return false
    }

    parentId = parent.parentId
  }

  return true
}
