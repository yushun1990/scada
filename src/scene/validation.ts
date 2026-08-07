import type {
  ComponentDefinition,
  ComponentProps,
  ComponentScalarValue,
} from '../component-system/definition'
import { builtInComponentRegistry } from '../component-system/builtins'
import { getAnchorDefinition } from '../components/anchors'
import {
  GROUP_NODE_TYPE,
  SCENE_VERSION,
  isGroupNode,
  type ComponentSceneNode,
  type ConnectionEndpoint,
  type ConnectionRouting,
  type GroupSceneNode,
  type NodeTransform,
  type SceneConnection,
  type SceneDocument,
  type SceneNode,
} from './model'

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

function isComponentPropertyValue(
  definition: ComponentDefinition['properties'][string],
  value: unknown,
): value is ComponentScalarValue {
  if (value === null) {
    return definition.defaultValue === null
  }

  if (definition.kind === 'number') {
    return isFiniteNumber(value)
  }

  if (definition.kind === 'boolean') {
    return typeof value === 'boolean'
  }

  if (definition.kind === 'select') {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return false
    }

    return definition.options?.length
      ? definition.options.some((option) => option.value === value)
      : true
  }

  return typeof value === 'string'
}

function parseComponentProps(
  definition: ComponentDefinition,
  value: Record<string, unknown>,
): ComponentProps | null {
  const props: ComponentProps = {}

  for (const [key, property] of Object.entries(definition.properties)) {
    const candidate = key in value ? value[key] : property.defaultValue

    if (!isComponentPropertyValue(property, candidate)) {
      return null
    }

    props[key] = candidate
  }

  return props
}

function parseSceneNode(value: unknown, version: number): SceneNode | null {
  if (!isRecord(value)) {
    return null
  }

  const base = parseBaseNode(value, version)

  if (!base || !isRecord(value.props)) {
    return null
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

  if (typeof value.type !== 'string') {
    return null
  }

  const registration = builtInComponentRegistry.get(value.type)

  if (!registration) {
    return null
  }

  const props = parseComponentProps(registration.definition, value.props)

  if (!props) {
    return null
  }

  return {
    ...base,
    type: registration.definition.type,
    props,
  } satisfies ComponentSceneNode
}

function migrateLegacyPortId(portId: string) {
  if (portId === 'inlet') {
    return 'left-75'
  }

  if (portId === 'outlet') {
    return 'right-center'
  }

  return portId
}

function parseEndpoint(value: unknown, version: number): ConnectionEndpoint | null {
  if (!isRecord(value) || typeof value.nodeId !== 'string') {
    return null
  }

  if (version >= 4 && typeof value.anchorId === 'string') {
    return {
      nodeId: value.nodeId,
      anchorId: value.anchorId,
    }
  }

  if (version === 3 && typeof value.portId === 'string') {
    return {
      nodeId: value.nodeId,
      anchorId: migrateLegacyPortId(value.portId),
    }
  }

  return null
}

function parseConnection(value: unknown, version: number): SceneConnection | null {
  if (!isRecord(value) || !isRecord(value.style)) {
    return null
  }

  const source = parseEndpoint(value.source, version)
  const target = parseEndpoint(value.target, version)

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
      !getAnchorDefinition(sourceNode, connection.source.anchorId) ||
      !getAnchorDefinition(targetNode, connection.target.anchorId)
    ) {
      throw new Error('场景 JSON 包含不存在的视觉锚点')
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
  const supportedVersion =
    sourceVersion === 1 ||
    sourceVersion === 2 ||
    sourceVersion === 3 ||
    sourceVersion === SCENE_VERSION

  if (
    !supportedVersion ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    typeof value.background !== 'string' ||
    !Array.isArray(value.nodes) ||
    (sourceVersion >= 3 && !Array.isArray(value.connections))
  ) {
    throw new Error('场景 JSON 格式无效或版本不受支持')
  }

  const nodes = value.nodes.map((node) => parseSceneNode(node, sourceVersion))

  if (nodes.some((node) => node === null)) {
    throw new Error('场景 JSON 包含无效节点')
  }

  const parsedNodes = nodes as SceneNode[]
  const parsedConnections = sourceVersion >= 3
    ? (value.connections as unknown[]).map((connection) =>
        parseConnection(connection, sourceVersion),
      )
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
