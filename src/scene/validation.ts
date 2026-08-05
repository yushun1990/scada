import {
  PUMP_NODE_TYPE,
  SCENE_VERSION,
  type NodeTransform,
  type SceneDocument,
  type SceneNode,
} from './model'
import type { PumpState } from '../assets/pump'

const pumpStates = new Set<PumpState>([
  'gray',
  'green',
  'blue',
  'orange',
  'red',
])

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

function parseSceneNode(value: unknown): SceneNode | null {
  if (!isRecord(value) || value.type !== PUMP_NODE_TYPE) {
    return null
  }

  const transform = parseTransform(value.transform)

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !transform ||
    !isRecord(value.props) ||
    !isPumpState(value.props.state) ||
    !Array.isArray(value.bindings) ||
    !Array.isArray(value.behaviors) ||
    (value.visible !== undefined && typeof value.visible !== 'boolean') ||
    (value.locked !== undefined && typeof value.locked !== 'boolean')
  ) {
    return null
  }

  return {
    id: value.id,
    type: PUMP_NODE_TYPE,
    name: value.name,
    visible: value.visible ?? true,
    locked: value.locked ?? false,
    transform,
    props: {
      state: value.props.state,
    },
    bindings: [],
    behaviors: [],
  }
}

export function parseSceneDocument(json: string): SceneDocument {
  const value: unknown = JSON.parse(json)

  if (
    !isRecord(value) ||
    value.version !== SCENE_VERSION ||
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

  const nodes = value.nodes.map(parseSceneNode)

  if (nodes.some((node) => node === null)) {
    throw new Error('场景 JSON 包含无效节点')
  }

  return {
    version: SCENE_VERSION,
    id: value.id,
    name: value.name,
    width: value.width,
    height: value.height,
    background: value.background,
    nodes: nodes as SceneNode[],
  }
}
