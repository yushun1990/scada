import {
  getNodeBounds,
  getRootNodes,
  type TransformUpdates,
} from './geometry'
import type { SceneDocument } from './model'

export const SCENE_EXPANSION_PADDING = 48
export const SCENE_EXPANSION_STEP = 128

function expandDimension(current: number, required: number) {
  if (required <= current) {
    return current
  }

  return Math.ceil(required / SCENE_EXPANSION_STEP) * SCENE_EXPANSION_STEP
}

export function expandSceneToContainNodes(
  scene: SceneDocument,
): SceneDocument {
  const rootNodes = getRootNodes(scene)

  if (rootNodes.length === 0) {
    return scene
  }

  const bounds = rootNodes.map((node) => getNodeBounds(scene, node))
  const requiredWidth =
    Math.max(...bounds.map((item) => item.right)) + SCENE_EXPANSION_PADDING
  const requiredHeight =
    Math.max(...bounds.map((item) => item.bottom)) + SCENE_EXPANSION_PADDING
  const width = expandDimension(scene.width, requiredWidth)
  const height = expandDimension(scene.height, requiredHeight)

  if (width === scene.width && height === scene.height) {
    return scene
  }

  return {
    ...scene,
    width,
    height,
  }
}

export function applyTransformsAndExpandScene(
  scene: SceneDocument,
  updates: TransformUpdates,
): SceneDocument {
  if (Object.keys(updates).length === 0) {
    return scene
  }

  return expandSceneToContainNodes({
    ...scene,
    nodes: scene.nodes.map((node) =>
      updates[node.id]
        ? { ...node, transform: updates[node.id] }
        : node,
    ),
  })
}
