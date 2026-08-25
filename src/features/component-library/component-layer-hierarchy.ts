import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  GroupVisualLayer,
} from '../../component-system/visual'
import {
  createComponentLayerLocalMatrix,
  decomposeComponentLayerMatrix,
  getComponentLayerBoundsInParent,
  multiplyComponentLayerMatrices,
} from './component-layer-transform'

export type GroupComponentLayersResult =
  | {
      status: 'grouped'
      visual: ComponentVisualDefinition
      groupId: string
    }
  | {
      status: 'not-groupable'
    }

export type UngroupComponentLayerResult =
  | {
      status: 'ungrouped'
      visual: ComponentVisualDefinition
      childIds: readonly string[]
    }
  | {
      status: 'not-group'
    }
  | {
      status: 'unsupported-transform'
    }

function getSelectedLayers(
  visual: ComponentVisualDefinition,
  layerIds: readonly string[],
) {
  const selectedIds = new Set(layerIds)

  return visual.layers.filter((layer) => selectedIds.has(layer.id))
}

function getGroupableLayers(
  visual: ComponentVisualDefinition,
  layerIds: readonly string[],
) {
  const uniqueIds = new Set(layerIds)
  const layers = getSelectedLayers(visual, layerIds)

  if (
    layers.length < 2 ||
    layers.length !== uniqueIds.size ||
    layers.some((layer) => layer.parentId !== layers[0]?.parentId)
  ) {
    return null
  }

  return layers
}

function nextGroupIdentity(layers: readonly ComponentVisualLayer[]) {
  const ids = new Set(layers.map((layer) => layer.id))
  let index = 1

  while (ids.has(`group${index}`)) {
    index += 1
  }

  return {
    id: `group${index}`,
    name: `Group ${index}`,
  }
}

function createSelectionBoundsInParent(
  layers: readonly ComponentVisualLayer[],
) {
  const bounds = layers.map(getComponentLayerBoundsInParent)
  const left = Math.min(...bounds.map((item) => item.left))
  const top = Math.min(...bounds.map((item) => item.top))
  const right = Math.max(...bounds.map((item) => item.right))
  const bottom = Math.max(...bounds.map((item) => item.bottom))

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

export function canGroupComponentLayers(
  visual: ComponentVisualDefinition,
  layerIds: readonly string[],
) {
  return Boolean(getGroupableLayers(visual, layerIds))
}

export function canUngroupComponentLayer(
  visual: ComponentVisualDefinition,
  layerIds: readonly string[],
) {
  if (layerIds.length !== 1) {
    return false
  }

  return visual.layers.some(
    (layer) => layer.id === layerIds[0] && layer.kind === 'group',
  )
}

export function groupComponentLayers(
  visual: ComponentVisualDefinition,
  layerIds: readonly string[],
): GroupComponentLayersResult {
  const selectedLayers = getGroupableLayers(visual, layerIds)

  if (!selectedLayers) {
    return { status: 'not-groupable' }
  }

  const selectedIds = new Set(selectedLayers.map((layer) => layer.id))
  const parentId = selectedLayers[0]?.parentId ?? null
  const bounds = createSelectionBoundsInParent(selectedLayers)
  const identity = nextGroupIdentity(visual.layers)
  const group: GroupVisualLayer = {
    id: identity.id,
    name: identity.name,
    kind: 'group',
    parentId,
    transform: {
      x: bounds.left,
      y: bounds.top,
      width: bounds.width,
      height: bounds.height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    visible: true,
    opacity: 1,
  }
  const firstSelectedIndex = visual.layers.findIndex((layer) => selectedIds.has(layer.id))
  const reparentedLayers = visual.layers.map((layer) => {
    if (!selectedIds.has(layer.id)) {
      return layer
    }

    return {
      ...layer,
      parentId: group.id,
      transform: {
        ...layer.transform,
        x: layer.transform.x - group.transform.x,
        y: layer.transform.y - group.transform.y,
      },
    } as ComponentVisualLayer
  })
  const layers = [...reparentedLayers]
  layers.splice(Math.max(0, firstSelectedIndex), 0, group)

  return {
    status: 'grouped',
    visual: { ...visual, layers },
    groupId: group.id,
  }
}

export function ungroupComponentLayer(
  visual: ComponentVisualDefinition,
  groupId: string,
): UngroupComponentLayerResult {
  const group = visual.layers.find(
    (layer): layer is GroupVisualLayer =>
      layer.id === groupId && layer.kind === 'group',
  )

  if (!group) {
    return { status: 'not-group' }
  }

  const children = visual.layers.filter((layer) => layer.parentId === group.id)
  const groupMatrix = createComponentLayerLocalMatrix(group)
  const nextChildTransforms = new Map<string, ComponentVisualLayer['transform']>()

  for (const child of children) {
    const composed = multiplyComponentLayerMatrices(
      groupMatrix,
      createComponentLayerLocalMatrix(child),
    )
    const transform = decomposeComponentLayerMatrix(composed, child.transform)

    if (!transform) {
      return { status: 'unsupported-transform' }
    }

    nextChildTransforms.set(child.id, transform)
  }

  const childIds = children.map((child) => child.id)
  const layers = visual.layers.flatMap((layer) => {
    if (layer.id === group.id) {
      return []
    }

    const transform = nextChildTransforms.get(layer.id)

    if (!transform) {
      return [layer]
    }

    return [{
      ...layer,
      parentId: group.parentId,
      transform,
      visible: group.visible && layer.visible,
      opacity: group.opacity * layer.opacity,
    } as ComponentVisualLayer]
  })

  return {
    status: 'ungrouped',
    visual: { ...visual, layers },
    childIds,
  }
}
