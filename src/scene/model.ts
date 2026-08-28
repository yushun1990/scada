import type { ComponentProps } from '../component-system/definition'
import type { PersistedScadaSemantics } from './scada-semantics-persistence'

export const LEGACY_SCENE_VERSION = 6 as const
export const SCENE_VERSION = 7 as const
export const GROUP_NODE_TYPE = 'core.group' as const

export type NodeTransform = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export type RuntimeValueBindingSource = {
  kind: 'runtime-value'
  key: string
}

export type DataBinding = {
  id: string
  property: string
  source: RuntimeValueBindingSource
}

export type EventActionBehavior = {
  id: string
  trigger: {
    kind: 'event'
    event: string
  }
  effect: {
    kind: 'action'
    targetNodeId: string
    action: string
  }
}

export type ComponentBehavior = EventActionBehavior

type SceneNodeBase = {
  id: string
  name: string
  parentId: string | null
  visible: boolean
  locked: boolean
  transform: NodeTransform
}

export type ComponentSceneNode = SceneNodeBase & {
  type: string
  props: ComponentProps
  /** Scene v5 compatibility-only runtime-value bindings. */
  bindings: DataBinding[]
  /** Scene v6 compatibility-only Event -> Component Action behaviors. */
  behaviors: ComponentBehavior[]
  /**
   * Scene v7 canonical SCADA Value/Behavior/Interaction semantics.
   *
   * Optional in the in-memory TypeScript shape so older deterministic fixtures
   * can still construct legacy-v6 documents directly. Serialized Scene v7 JSON
   * always normalizes this field to an explicit object or null.
   */
  scadaSemantics?: PersistedScadaSemantics | null
}

export type GroupSceneNode = SceneNodeBase & {
  type: typeof GROUP_NODE_TYPE
  props: {
    designWidth: number
    designHeight: number
  }
  bindings: []
  behaviors: []
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
  /**
   * v6 remains constructible in-memory only as a compatibility shape. Normal
   * load/save paths migrate and serialize the current v7 schema.
   */
  version: typeof LEGACY_SCENE_VERSION | typeof SCENE_VERSION
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
