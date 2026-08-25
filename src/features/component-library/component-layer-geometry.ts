import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
} from '../../component-system/visual'
import type {
  GeometryBounds,
  GeometryDeltas,
  GeometryItem,
} from '../../geometry/commands'
import {
  applyComponentLayerMatrix,
  COMPONENT_LAYER_IDENTITY_MATRIX,
  getComponentLayerWorldBounds,
  getComponentLayerWorldMatrix,
  invertComponentLayerMatrix,
} from './component-layer-transform'

function hasSelectedAncestor(
  layer: ComponentVisualLayer,
  byId: ReadonlyMap<string, ComponentVisualLayer>,
  selectedIds: ReadonlySet<string>,
) {
  const visited = new Set<string>()
  let parentId = layer.parentId

  while (parentId && !visited.has(parentId)) {
    if (selectedIds.has(parentId)) {
      return true
    }

    visited.add(parentId)
    parentId = byId.get(parentId)?.parentId ?? null
  }

  return false
}

export function getComponentLayerBounds(
  visual: ComponentVisualDefinition,
  layer: ComponentVisualLayer,
): GeometryBounds {
  return getComponentLayerWorldBounds(visual, layer)
}

export function createComponentLayerGeometryItems(
  visual: ComponentVisualDefinition,
  layerIds: readonly string[],
): GeometryItem[] {
  const selectedIds = new Set(layerIds)
  const byId = new Map(visual.layers.map((layer) => [layer.id, layer]))

  return visual.layers
    .filter((layer) =>
      selectedIds.has(layer.id) &&
      !hasSelectedAncestor(layer, byId, selectedIds),
    )
    .map((layer) => ({
      id: layer.id,
      bounds: getComponentLayerBounds(visual, layer),
    }))
}

export function applyComponentLayerGeometryDeltas(
  visual: ComponentVisualDefinition,
  deltas: GeometryDeltas,
): ComponentVisualDefinition {
  const layers = visual.layers.map((layer) => {
    const delta = deltas[layer.id]

    if (!delta) {
      return layer
    }

    const parentMatrix = layer.parentId
      ? getComponentLayerWorldMatrix(visual, layer.parentId)
      : COMPONENT_LAYER_IDENTITY_MATRIX
    const inverseParent = invertComponentLayerMatrix(parentMatrix)
    const worldMatrix = getComponentLayerWorldMatrix(visual, layer.id)
    const localOrigin = applyComponentLayerMatrix(inverseParent, {
      x: worldMatrix.e + delta.dx,
      y: worldMatrix.f + delta.dy,
    })

    return {
      ...layer,
      transform: {
        ...layer.transform,
        x: localOrigin.x,
        y: localOrigin.y,
      },
    } as ComponentVisualLayer
  })

  return { ...visual, layers }
}
