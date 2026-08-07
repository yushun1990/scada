import type { ComponentProps } from '../component-system/definition'
import {
  PUMP_COMPONENT_TYPE,
  builtInComponentRegistry,
  pumpComponentDefinition,
} from '../component-system/builtins'

export const SCENE_VERSION = 4 as const
export const GROUP_NODE_TYPE = 'core.group' as const

/** @deprecated Use ComponentSceneNode and createComponentNode. */
export const PUMP_NODE_TYPE = PUMP_COMPONENT_TYPE
/** @deprecated Component geometry now comes from ComponentDefinition. */
export const PUMP_ASPECT_RATIO =
  pumpComponentDefinition.size.defaultWidth /
  pumpComponentDefinition.size.defaultHeight
/** @deprecated Component geometry now comes from ComponentDefinition. */
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

export type ComponentSceneNode = SceneNodeBase & {
  type: string
  props: ComponentProps
}

/** @deprecated Use ComponentSceneNode. */
export type PumpSceneNode = ComponentSceneNode

export type GroupSceneNode = SceneNodeBase & {
  type: typeof GROUP_NODE_TYPE
  props: {
    designWidth: number
    designHeight: number
  }
}

export type SceneNode = ComponentSceneNode | GroupSceneNode

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

export function isGroupNode(node: SceneNode): node is GroupSceneNode {
  return node.type === GROUP_NODE_TYPE
}

export function isComponentNode(node: SceneNode): node is ComponentSceneNode {
  return !isGroupNode(node)
}

export function createComponentNode(
  componentType: string,
  index: number,
  offset = 0,
): ComponentSceneNode {
  const registration = builtInComponentRegistry.require(componentType)
  const { definition } = registration

  return {
    id: createSceneId('component'),
    type: definition.type,
    name: `${definition.title} ${index}`,
    parentId: null,
    visible: true,
    locked: false,
    transform: {
      x: 220 + offset,
      y: 48 + offset,
      width: definition.size.defaultWidth,
      height: definition.size.defaultHeight,
      rotation: 0,
    },
    props: registration.createDefaultProps(),
    bindings: [],
    behaviors: [],
  }
}

/** @deprecated Use createComponentNode(PUMP_COMPONENT_TYPE, ...). */
export function createPumpNode(index: number, offset = 0): ComponentSceneNode {
  return createComponentNode(PUMP_COMPONENT_TYPE, index, offset)
}

/** @deprecated Compare component node types through the registry. */
export function isPumpNode(node: SceneNode): node is ComponentSceneNode {
  return isComponentNode(node) && node.type === PUMP_COMPONENT_TYPE
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
    nodes: [createComponentNode(PUMP_COMPONENT_TYPE, 1)],
    connections: [],
  }
}
