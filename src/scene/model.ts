import type { PumpState } from '../assets/pump'

export const SCENE_VERSION = 1 as const
export const PUMP_NODE_TYPE = 'pump.submersible' as const
export const PUMP_ASPECT_RATIO = 512 / 720

export type NodeTransform = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export type PumpSceneNode = {
  id: string
  type: typeof PUMP_NODE_TYPE
  name: string
  visible: boolean
  locked: boolean
  transform: NodeTransform
  props: {
    state: PumpState
  }
  bindings: []
  behaviors: []
}

export type SceneNode = PumpSceneNode

export type SceneDocument = {
  version: typeof SCENE_VERSION
  id: string
  name: string
  width: number
  height: number
  background: string
  nodes: SceneNode[]
}

function createId(prefix: string) {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `${prefix}-${suffix}`
}

export function createPumpNode(index: number, offset = 0): PumpSceneNode {
  const width = 256

  return {
    id: createId('pump'),
    type: PUMP_NODE_TYPE,
    name: `潜水泵 ${index}`,
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

export function createDefaultScene(): SceneDocument {
  return {
    version: SCENE_VERSION,
    id: createId('scene'),
    name: 'pump-lab',
    width: 1280,
    height: 720,
    background: '#0b1119',
    nodes: [createPumpNode(1)],
  }
}

export function cloneSceneNode(node: SceneNode, index: number): SceneNode {
  return {
    ...node,
    id: createId('pump'),
    name: `${node.name} 副本 ${index}`,
    transform: {
      ...node.transform,
      x: node.transform.x + 24,
      y: node.transform.y + 24,
    },
    props: {
      ...node.props,
    },
    bindings: [],
    behaviors: [],
  }
}
