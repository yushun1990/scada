import type { PumpState } from '../assets/pump'
import {
  PUMP_COMPONENT_TYPE,
  pumpComponentDefinition,
} from '../component-system/builtins'

export const SCENE_VERSION = 4 as const
export const PUMP_NODE_TYPE = PUMP_COMPONENT_TYPE
export const GROUP_NODE_TYPE = 'core.group' as const
export const PUMP_ASPECT_RATIO =
  pumpComponentDefinition.size.defaultWidth /
  pumpComponentDefinition.size.defaultHeight
export const PUMP_DEFAULT_WIDTH = pumpComponentDefinition.size.defaultWidth

export type NodeTransform = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

type SceneNodeBase = {
  id: string
  name: string
  parentId: string | null
  visible: boolean
  locked: boolean
  transform: NodeTransform
  bindings: []
  behaviors: []
}

export type PumpSceneNode = SceneNodeBase & {
  type: typeof PUMP_NODE_TYPE
  props: {
    state: PumpState
  }
}

export type GroupSceneNode = SceneNodeBase & {
  type: typeof GROUP_NODE_TYPE
  props: {
    designWidth: number
    designHeight: number
  }
}

export type SceneNode = PumpSceneNode | GroupSceneNode

export type ConnectionEndpoint = {
  nodeId: string
  anchorId: string
}

export type ConnectionRouting = 'straight' | 'orthogonal'

export type SceneConnection = {
  id: string
  name: string
  source: ConnectionEndpoint
  target: ConnectionEndpoint
  routing: ConnectionRouting
  style: {
    stroke: string
    strokeWidth: number
    dash: 'solid' | 'dashed'
  }
}

export type SceneDocument = {
  version: typeof SCENE_VERSION
  id: string
  name: string
  width: number
  height: number
  background: string
  nodes: SceneNode[]
  connections: SceneConnection[]
}

export function createSceneId(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `${prefix}-${suffix}`
}

export function isPumpNode(node: SceneNode): node is PumpSceneNode {
  return node.type === PUMP_NODE_TYPE
}

export function isGroupNode(node: SceneNode): node is GroupSceneNode {
  return node.type === GROUP_NODE_TYPE
}

export function createPumpNode(index: number, offset = 0): PumpSceneNode {
  const width = PUMP_DEFAULT_WIDTH

  return {
    id: createSceneId('pump'),
    type: PUMP_NODE_TYPE,
    name: `潜水泵 ${index}`,
    parentId: null,
    visible: true,
    locked: false,
    transform: {
      x: 220 + offset,
      y: 48 + offset,
      width,
      height: width / PUMP_ASPECT_RATIO,
      rotation: 0,
    },
    props: {
      state: 'green',
    },
    bindings: [],
    behaviors: [],
  }
}

export function createGroupNode(
  index: number,
  transform: NodeTransform,
  parentId: string | null = null,
): GroupSceneNode {
  return {
    id: createSceneId('group'),
    type: GROUP_NODE_TYPE,
    name: `组合 ${index}`,
    parentId,
    visible: true,
    locked: false,
    transform,
    props: {
      designWidth: transform.width,
      designHeight: transform.height,
    },
    bindings: [],
    behaviors: [],
  }
}

export function createSceneConnection(
  index: number,
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
): SceneConnection {
  return {
    id: createSceneId('connection'),
    name: `连接 ${index}`,
    source,
    target,
    routing: 'orthogonal',
    style: {
      stroke: '#0f766e',
      strokeWidth: 4,
      dash: 'solid',
    },
  }
}

export function createDefaultScene(): SceneDocument {
  return {
    version: SCENE_VERSION,
    id: createSceneId('scene'),
    name: 'scada-lab',
    width: 1280,
    height: 720,
    background: '#edf1f5',
    nodes: [createPumpNode(1)],
    connections: [],
  }
}
