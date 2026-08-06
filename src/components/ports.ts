import type {
  ConnectionEndpoint,
  SceneDocument,
  SceneNode,
} from '../scene/model'
import type { TransformUpdates } from '../scene/geometry'
import {
  getAnchorDefinition,
  getAnchorWorldDirection,
  getAnchorWorldPosition,
  getNodeAnchorDefinitions,
  isNodeEffectivelyVisible,
  normalizeVisualConnectionEndpoints,
  type VisualAnchorDefinition,
} from './anchors'

export type PortDirection = 'input' | 'output' | 'bidirectional'

export type PortDefinition = VisualAnchorDefinition & {
  direction: PortDirection
  kinds: string[]
}

function toLegacyPort(anchor: VisualAnchorDefinition): PortDefinition {
  const direction: PortDirection =
    anchor.role === 'source'
      ? 'output'
      : anchor.role === 'target'
        ? 'input'
        : 'bidirectional'

  return {
    ...anchor,
    direction,
    kinds: anchor.kinds ?? [],
  }
}

/** @deprecated Use getNodeAnchorDefinitions from anchors.ts. */
export function getNodePortDefinitions(node: SceneNode) {
  return getNodeAnchorDefinitions(node).map(toLegacyPort)
}

/** @deprecated Use getAnchorDefinition from anchors.ts. */
export function getPortDefinition(node: SceneNode, anchorId: string) {
  const anchor = getAnchorDefinition(node, anchorId)
  return anchor ? toLegacyPort(anchor) : null
}

/** @deprecated Use getAnchorWorldPosition from anchors.ts. */
export function getPortWorldPosition(
  scene: SceneDocument,
  endpoint: ConnectionEndpoint,
  overrides: TransformUpdates = {},
) {
  return getAnchorWorldPosition(scene, endpoint, overrides)
}

/** @deprecated Use getAnchorWorldDirection from anchors.ts. */
export function getPortWorldDirection(
  scene: SceneDocument,
  endpoint: ConnectionEndpoint,
  overrides: TransformUpdates = {},
) {
  return getAnchorWorldDirection(scene, endpoint, overrides)
}

/** @deprecated Use normalizeVisualConnectionEndpoints from anchors.ts. */
export function normalizeConnectionEndpoints(
  scene: SceneDocument,
  source: ConnectionEndpoint,
  target: ConnectionEndpoint,
) {
  return normalizeVisualConnectionEndpoints(scene, source, target)
}

export { isNodeEffectivelyVisible }
