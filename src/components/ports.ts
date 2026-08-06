import {
  PUMP_NODE_TYPE,
  isPumpNode,
  type ConnectionEndpoint,
  type NodeTransform,
  type SceneDocument,
  type SceneNode,
} from '../scene/model'
import { getWorldTransform, type TransformUpdates } from '../scene/geometry'

export type PortDirection = 'input' | 'output' | 'bidirectional'

export type PortDefinition = {
  id: string
  title: string
  direction: PortDirection
  kinds: string[]
  position: {
    x: number
    y: number
  }
  outward: {
    x: number
    y: number
  }
}

const pumpPorts: PortDefinition[] = [
  {
    id: 'inlet',
    title: '进水口',
    direction: 'input',
    kinds: ['water'],
    position: { x: 0.12, y: 0.72 },
    outward: { x: -1, y: 0 },
  },
  {
    id: 'outlet',
    title: '出水口',
    direction: 'output',
    kinds: ['water'],
    position: { x: 0.9, y: 0.46 },
    outward: { x: 1, y: 0 },
  },
]

const portsByType: Record<string, PortDefinition[]> = {
  [PUMP_NODE_TYPE]: pumpPorts,
}

export function getNodePortDefinitions(node: SceneNode) {
  return portsByType[node.type] ?? []
}

export function getPortDefinition(node: SceneNode, portId: string) {
  return getNodePortDefinitions(node).find((port) => port.id === portId) ?? null
}

export function getPortWorldPosition(
  scene: SceneDocument,
  endpoint: ConnectionEndpoint,
  overrides: TransformUpdates = {},
) {
  const node = scene.nodes.find((candidate) => candidate.id === endpoint.nodeId)

  if (!node || !isPumpNode(node)) {
    return null
  }

  const port = getPortDefinition(node, endpoint.portId)
  const transform = getWorldTransform(scene, node.id, overrides)

  if (!port || !transform) {
    return null
  }

  return normalizedPointToWorld(transform, port.position)
}

export function getPortWorldDirection(
  scene: SceneDocument,
  endpoint: ConnectionEndpoint,
  overrides: TransformUpdates = {},
) {
  const node = scene.nodes.find((candidate) => candidate.id === endpoint.nodeId)

  if (!node || !isPumpNode(node)) {
    return null
  }

  const port = getPortDefinition(node, endpoint.portId)
  const transform = getWorldTransform(scene, node.id, overrides)

  if (!port || !transform) {
    return null
  }

  return rotateVector(port.outward, transform.rotation)
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

function directionsCompatible(first: PortDefinition, second: PortDefinition) {
  const firstCanOutput =
    first.direction === 'output' || first.direction === 'bidirectional'
  const firstCanInput =
    first.direction === 'input' || first.direction === 'bidirectional'
  const secondCanOutput =
    second.direction === 'output' || second.direction === 'bidirectional'
  const secondCanInput =
    second.direction === 'input' || second.direction === 'bidirectional'

  return {
    forward: firstCanOutput && secondCanInput,
    reverse: secondCanOutput && firstCanInput,
  }
}

function kindsCompatible(first: PortDefinition, second: PortDefinition) {
  return first.kinds.some((kind) => second.kinds.includes(kind))
}

export function normalizeConnectionEndpoints(
  scene: SceneDocument,
  first: ConnectionEndpoint,
  second: ConnectionEndpoint,
) {
  if (first.nodeId === second.nodeId) {
    return null
  }

  const firstNode = scene.nodes.find((node) => node.id === first.nodeId)
  const secondNode = scene.nodes.find((node) => node.id === second.nodeId)

  if (!firstNode || !secondNode) {
    return null
  }

  const firstPort = getPortDefinition(firstNode, first.portId)
  const secondPort = getPortDefinition(secondNode, second.portId)

  if (!firstPort || !secondPort || !kindsCompatible(firstPort, secondPort)) {
    return null
  }

  const compatibility = directionsCompatible(firstPort, secondPort)

  if (compatibility.forward) {
    return { source: first, target: second }
  }

  if (compatibility.reverse) {
    return { source: second, target: first }
  }

  return null
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
