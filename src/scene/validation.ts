import type { PumpState } from '../assets/pump'
import { getPortDefinition } from '../components/ports'
import {
  GROUP_NODE_TYPE,
  PUMP_NODE_TYPE,
  SCENE_VERSION,
  isGroupNode,
  type ConnectionEndpoint,
  type ConnectionRouting,
  type GroupSceneNode,
  type NodeTransform,
  type PumpSceneNode,
  type SceneConnection,
  type SceneDocument,
  type SceneNode,
} from './model'

const pumpStates = new Set<PumpState>([
  'gray',
  'green',
  'blue',
  'orange',
  'red',
])

const LEGACY_DEFAULT_BACKGROUND = '#0b1119'
const DEFAULT_EDITOR_BACKGROUND = '#edf1f5'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseTransform(value: unknown): NodeTransform | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    !isFiniteNumber(value.rotation) ||
    value.width <= 0 ||
    value.height <= 0
  ) {
    return null
  }

  return {
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    rotation: value.rotation,
  }
}

function isPumpState(value: unknown): value is PumpState {
  return typeof value === 'string' && pumpStates.has(value as PumpState)
}

function isConnectionRouting(value: unknown): value is ConnectionRouting {
  return value === 'straight' || value === 'orthogonal'
}

function parseBaseNode(value: Record<string, unknown>, version: number) {
  const transform = parseTransform(value.transform)
  const parentId = version === 1
    ? null
    : value.parentId === null || typeof value.parentId === 'string'
      ? value.parentId
      : undefined

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    parentId === undefined ||
    !transform ||
    !Array.isArray(value.bindings) ||
    !Array.isArray(value.behaviors) ||
    (value.visible !== undefined && typeof value.visible !== 'boolean') ||
    (value.locked !== undefined && typeof value.locked !== 'boolean')
  ) {
    return null
  }

  return {
    id: value.id,
    name: value.name,
    parentId,
    visible: value.visible ?? true,
    locked: value.locked ?? false,
    transform,
    bindings: [] as [],
    behaviors: [] as [],
  }
}

function parseSceneNode(value: unknown, version: number): SceneNode | null {
  if (!isRecord(value)) {
    return null
  }

  const base = parseBaseNode(value, version)

  if (!base || !isRecord(value.props)) {
    return null
  }

  if (value.type === PUMP_NODE_TYPE && isPumpState(value.props.state)) {
    return {
      ...base,
      type: PUMP_NODE_TYPE,
      props: {
        state: value.props.state,
      },
    } satisfies PumpSceneNode
  }

  if (
    version >= 2 &&
    value.type === GROUP_NODE_TYPE &&
    isFiniteNumber(value.props.designWidth) &&
    isFiniteNumber(value.props.designHeight) &&
    value.props.designWidth > 0 &&
    value.props.designHeight > 0
  ) {
    return {
      ...base,
      type: GROUP_NODE_TYPE,
      props: {
        designWidth: value.props.designWidth,
        designHeight: value.props.designHeight,
      },
    } satisfies GroupSceneNode
  }

  return null
}

function parseEndpoint(value: unknown): ConnectionEndpoint | null {
  if (
    !isRecord(value) ||
    typeof value.nodeId !== 'string' ||
    typeof value.portId !== 'string'
  ) {
    return null
  }

  return {
    nodeId: value.nodeId,
    portId: value.portId,
  }
}

function parseConnection(value: unknown): SceneConnection | null {
  if (!isRecord(value) || !isRecord(value.style)) {
    return null
  }

  const source = parseEndpoint(value.source)
  const target = parseEndpoint(value.target)

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !source ||
    !target ||
    !isConnectionRouting(value.routing) ||
    typeof value.style.stroke !== 'string' ||
    !isFiniteNumber(value.style.strokeWidth) ||
    value.style.strokeWidth <= 0 ||
    (value.style.dash !== 'solid' && value.style.dash !== 'dashed')
  ) {
    return null
  }

  return {
    id: value.id,
    name: value.name,
    source,
    target,
    routing: value.routing,
    style: {
      stroke: value.style.stroke,
      strokeWidth: value.style.strokeWidth,
      dash: value.style.dash,
    },
  }
}

function validateHierarchy(nodes: SceneNode[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))

  if (nodeMap.size !== nodes.length) {
    throw new Error('场景 JSON 包含重复节点 ID')
  }

  for (const node of nodes) {
    if (!node.parentId) {
      continue
    }

    const parent = nodeMap.get(node.parentId)

    if (!parent || !isGroupNode(parent)) {
      throw new Error('场景 JSON 包含无效分组引用')
    }

    const visited = new Set<string>([node.id])
    let currentParentId: string | null = node.parentId

    while (currentParentId) {
      if (visited.has(currentParentId)) {
        throw new Error('场景 JSON 包含循环分组关系')
      }

      visited.add(currentParentId)
      currentParentId = nodeMap.get(currentParentId)?.parentId ?? null
    }
  }
}

function validateConnections(
  nodes: SceneNode[],
  connections: SceneConnection[],
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const connectionIds = new Set<string>()

  for (const connection of connections) {
    if (connectionIds.has(connection.id)) {
      throw new Error('场景 JSON 包含重复连线 ID')
    }

    connectionIds.add(connection.id)
    const sourceNode = nodeMap.get(connection.source.nodeId)
    const targetNode = nodeMap.get(connection.target.nodeId)

    if (!sourceNode || !targetNode) {
      throw new Error('场景 JSON 包含失效连线端点')
    }

    if (
      !getPortDefinition(sourceNode, connection.source.portId) ||
      !getPortDefinition(targetNode, connection.target.portId)
    ) {
      throw new Error('场景 JSON 包含不存在的组件端口')
    }
  }
}

function normalizeBackground(background: string) {
  return background.toLowerCase() === LEGACY_DEFAULT_BACKGROUND
    ? DEFAULT_EDITOR_BACKGROUND
    : background
}

export function parseSceneDocument(json: string): SceneDocument {
  const value: unknown = JSON.parse(json)

  if (!isRecord(value)) {
    throw new Error('场景 JSON 格式无效或版本不受支持')
  }

  const sourceVersion = value.version

  if (
    (sourceVersion !== 1 && sourceVersion !== 2 && sourceVersion !== SCENE_VERSION) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    typeof value.background !== 'string' ||
    !Array.isArray(value.nodes) ||
    (sourceVersion === SCENE_VERSION && !Array.isArray(value.connections))
  ) {
    throw new Error('场景 JSON 格式无效或版本不受支持')
  }

  const nodes = value.nodes.map((node) => parseSceneNode(node, sourceVersion))

  if (nodes.some((node) => node === null)) {
    throw new Error('场景 JSON 包含无效节点')
  }

  const parsedNodes = nodes as SceneNode[]
  const parsedConnections = sourceVersion === SCENE_VERSION
    ? (value.connections as unknown[]).map(parseConnection)
    : []

  if (parsedConnections.some((connection) => connection === null)) {
    throw new Error('场景 JSON 包含无效连线')
  }

  const connections = parsedConnections as SceneConnection[]
  validateHierarchy(parsedNodes)
  validateConnections(parsedNodes, connections)

  return {
    version: SCENE_VERSION,
    id: value.id,
    name: value.name,
    width: value.width,
    height: value.height,
    background: normalizeBackground(value.background),
    nodes: parsedNodes,
    connections,
  }
}
