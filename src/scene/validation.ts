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

function isTransform(value: unknown): value is NodeTransform {
  if (!isRecord(value)) {
    return false
  }

  return (
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    isFiniteNumber(value.rotation) &&
    value.width > 0 &&
    value.height > 0
  )
}

function isPumpState(value: unknown): value is PumpState {
  return typeof value === 'string' && pumpStates.has(value as PumpState)
}

function isSceneNode(value: unknown): value is SceneNode {
  if (!isRecord(value) || value.type !== PUMP_NODE_TYPE) {
    return false
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !isTransform(value.transform) ||
    !isRecord(value.props) ||
    !isPumpState(value.props.state)
  ) {
    return false
  }

  return Array.isArray(value.bindings) && Array.isArray(value.behaviors)
}

export function isSceneDocument(value: unknown): value is SceneDocument {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.version === SCENE_VERSION &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height) &&
    value.width > 0 &&
    value.height > 0 &&
    typeof value.background === 'string' &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isSceneNode)
  )
}

export function parseSceneDocument(json: string): SceneDocument {
  const value: unknown = JSON.parse(json)

  if (!isSceneDocument(value)) {
    throw new Error('场景 JSON 格式无效或版本不受支持')
  }

  return value
}
