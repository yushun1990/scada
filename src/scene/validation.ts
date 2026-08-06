import type { PumpState } from '../assets/pump'
import {
  GROUP_NODE_TYPE,
  PUMP_NODE_TYPE,
  SCENE_VERSION,
  isGroupNode,
  type GroupSceneNode,
  type NodeTransform,
  type PumpSceneNode,
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
    version === SCENE_VERSION &&
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
    (sourceVersion !== 1 && sourceVersion !== SCENE_VERSION) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    typeof value.background !== 'string' ||
    !Array.isArray(value.nodes)
  ) {
    throw new Error('场景 JSON 格式无效或版本不受支持')
  }

  const nodes = value.nodes.map((node) => parseSceneNode(node, sourceVersion))

  if (nodes.some((node) => node === null)) {
    throw new Error('场景 JSON 包含无效节点')
  }

  const parsedNodes = nodes as SceneNode[]
  validateHierarchy(parsedNodes)

  return {
    version: SCENE_VERSION,
    id: value.id,
    name: value.name,
    width: value.width,
    height: value.height,
    background: normalizeBackground(value.background),
    nodes: parsedNodes,
  }
}
