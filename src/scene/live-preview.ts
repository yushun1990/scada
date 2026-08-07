import type { TransformUpdates } from './geometry'
import type { NodeTransform } from './model'

const liveTransforms = new Map<string, NodeTransform>()

export function setLiveNodeTransform(
  nodeId: string,
  transform: NodeTransform,
) {
  liveTransforms.set(nodeId, { ...transform })
}

export function clearLiveNodeTransform(nodeId: string) {
  liveTransforms.delete(nodeId)
}

export function withLiveTransformOverrides(
  overrides: TransformUpdates = {},
): TransformUpdates {
  if (liveTransforms.size === 0) {
    return overrides
  }

  const next: TransformUpdates = { ...overrides }

  for (const [nodeId, transform] of liveTransforms) {
    next[nodeId] = transform
  }

  return next
}
