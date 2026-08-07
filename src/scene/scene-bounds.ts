import {
  getNodeBounds,
  getRootNodes,
  type TransformUpdates,
} from './geometry'
import type { NodeTransform, SceneDocument, SceneNode } from './model'

const BOUNDS_EPSILON = 0.001

function constrainNodeTransform(
  scene: SceneDocument,
  node: SceneNode,
  transform: NodeTransform,
  overrides: TransformUpdates,
): NodeTransform {
  const previewOverrides = {
    ...overrides,
    [node.id]: transform,
  }
  const bounds = getNodeBounds(scene, node, previewOverrides)

  // Do not silently resize a component just to make an invalid transform fit.
  // If its rotated bounds are larger than the artboard, reject that transform.
  if (
    bounds.width > scene.width + BOUNDS_EPSILON ||
    bounds.height > scene.height + BOUNDS_EPSILON
  ) {
    return node.transform
  }

  const shiftX =
    bounds.left < 0
      ? -bounds.left
      : bounds.right > scene.width
        ? scene.width - bounds.right
        : 0
  const shiftY =
    bounds.top < 0
      ? -bounds.top
      : bounds.bottom > scene.height
        ? scene.height - bounds.bottom
        : 0

  if (Math.abs(shiftX) <= BOUNDS_EPSILON && Math.abs(shiftY) <= BOUNDS_EPSILON) {
    return transform
  }

  return {
    ...transform,
    x: transform.x + shiftX,
    y: transform.y + shiftY,
  }
}

export function constrainTransformUpdates(
  scene: SceneDocument,
  updates: TransformUpdates,
): TransformUpdates {
  const constrained: TransformUpdates = { ...updates }

  for (const node of getRootNodes(scene)) {
    const proposed = constrained[node.id]

    if (!proposed) {
      continue
    }

    constrained[node.id] = constrainNodeTransform(
      scene,
      node,
      proposed,
      constrained,
    )
  }

  return constrained
}

export function applyTransformsWithinScene(
  scene: SceneDocument,
  updates: TransformUpdates,
): SceneDocument {
  if (Object.keys(updates).length === 0) {
    return scene
  }

  const constrained = constrainTransformUpdates(scene, updates)

  return {
    ...scene,
    nodes: scene.nodes.map((node) =>
      constrained[node.id]
        ? { ...node, transform: constrained[node.id] }
        : node,
    ),
  }
}

export function constrainSceneNodesToArtboard(
  scene: SceneDocument,
): SceneDocument {
  const updates: TransformUpdates = Object.fromEntries(
    getRootNodes(scene).map((node) => [node.id, node.transform]),
  )

  return applyTransformsWithinScene(scene, updates)
}
