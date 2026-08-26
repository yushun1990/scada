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

export type CloneComponentLayerSubtreesResult = {
  visual: ComponentVisualDefinition
  rootIds: readonly string[]
}

export type DeleteComponentLayersResult = {
  visual: ComponentVisualDefinition
  deletedIds: readonly string[]
}

function getSelectedLayers(
  visual: ComponentVisualDefinition,
  layerIds: readonly string[],
) {
  const selectedIds = new Set(layerIds)

  return visual.layers.filter((layer) => selectedIds.has(layer.id))
}

function getLayerMap(layers: readonly ComponentVisualLayer[]) {
  return new Map(layers.map((layer) => [layer.id, layer]))
}

function collectSubtreeIds(
  layers: readonly ComponentVisualLayer[],
  rootId: string,
) {
  const ids = new Set<string>()
  const queue = [rootId]

  while (queue.length > 0) {
    const current = queue.shift()

    if (!current || ids.has(current)) {
      continue
    }

    ids.add(current)

    for (const layer of layers) {
      if (layer.parentId === current) {
        queue.push(layer.id)
      }
    }
  }

  return ids
}

function getOutermostSelectedLayers(
  visual: ComponentVisualDefinition,
  layerIds: readonly string[],
) {
  const selectedIds = new Set(layerIds)
  const layerMap = getLayerMap(visual.layers)

  return getSelectedLayers(visual, layerIds).filter((layer) => {
    let parentId = layer.parentId

    while (parentId) {
      if (selectedIds.has(parentId)) {
        return false
      }

      parentId = layerMap.get(parentId)?.parentId ?? null
    }

    return true
  })
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

function nextLayerCopyId(
  layer: ComponentVisualLayer,
  usedIds: Set<string>,
) {
  let index = 1

  while (usedIds.has(`${layer.kind}${index}`)) {
    index += 1
  }

  const id = `${layer.kind}${index}`
  usedIds.add(id)
  return id
}

function nextReferenceCopyId(referenceId: string, usedIds: Set<string>) {
  let index = 1
  let id = `${referenceId}-copy`

  while (usedIds.has(id)) {
    index += 1
    id = `${referenceId}-copy${index}`
  }

  usedIds.add(id)
  return id
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

export function cloneComponentLayerSubtrees(
  visual: ComponentVisualDefinition,
  layerIds: readonly string[],
  offset = 12,
): CloneComponentLayerSubtreesResult {
  const roots = getOutermostSelectedLayers(visual, layerIds)

  if (roots.length === 0) {
    return { visual, rootIds: [] }
  }

  const sourceIds = new Set<string>()

  for (const root of roots) {
    for (const id of collectSubtreeIds(visual.layers, root.id)) {
      sourceIds.add(id)
    }
  }

  const sourceLayers = visual.layers.filter((layer) => sourceIds.has(layer.id))
  const rootIds = new Set(roots.map((layer) => layer.id))
  const usedLayerIds = new Set(visual.layers.map((layer) => layer.id))
  const idMap = new Map<string, string>()

  for (const layer of sourceLayers) {
    idMap.set(layer.id, nextLayerCopyId(layer, usedLayerIds))
  }

  const clonedLayers = sourceLayers.map((layer) => {
    const root = rootIds.has(layer.id)

    return {
      ...layer,
      id: idMap.get(layer.id) ?? layer.id,
      name: root ? `${layer.name} 副本` : layer.name,
      parentId: layer.parentId ? idMap.get(layer.parentId) ?? layer.parentId : null,
      transform: {
        ...layer.transform,
        x: layer.transform.x + (root ? offset : 0),
        y: layer.transform.y + (root ? offset : 0),
      },
    } as ComponentVisualLayer
  })

  const existingRules = visual.rules ?? []
  const usedRuleIds = new Set(existingRules.map((rule) => rule.id))
  const clonedRules = existingRules.flatMap((rule) => {
    const layerId = idMap.get(rule.layerId)

    if (!layerId) {
      return []
    }

    return [{
      ...rule,
      id: nextReferenceCopyId(rule.id, usedRuleIds),
      layerId,
    }]
  })
  const usedAnimationIds = new Set(visual.animations.map((animation) => animation.id))
  const clonedAnimations = visual.animations.flatMap((animation) => {
    const layerId = idMap.get(animation.layerId)

    if (!layerId) {
      return []
    }

    return [{
      ...animation,
      id: nextReferenceCopyId(animation.id, usedAnimationIds),
      layerId,
      timing: { ...animation.timing },
      activation: { ...animation.activation },
    }]
  })

  return {
    visual: {
      ...visual,
      layers: [...visual.layers, ...clonedLayers],
      rules: [...existingRules, ...clonedRules],
      animations: [...visual.animations, ...clonedAnimations],
    },
    rootIds: roots.map((layer) => idMap.get(layer.id) ?? layer.id),
  }
}

export function deleteComponentLayers(
  visual: ComponentVisualDefinition,
  layerIds: readonly string[],
): DeleteComponentLayersResult {
  const roots = getOutermostSelectedLayers(visual, layerIds)

  if (roots.length === 0) {
    return { visual, deletedIds: [] }
  }

  const deletedIds = new Set<string>()

  for (const root of roots) {
    for (const id of collectSubtreeIds(visual.layers, root.id)) {
      deletedIds.add(id)
    }
  }

  return {
    visual: {
      ...visual,
      layers: visual.layers.filter((layer) => !deletedIds.has(layer.id)),
      rules: (visual.rules ?? []).filter((rule) => !deletedIds.has(rule.layerId)),
      animations: visual.animations.filter((animation) => !deletedIds.has(animation.layerId)),
    },
    deletedIds: [...deletedIds],
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
    visual: {
      ...visual,
      layers,
      rules: (visual.rules ?? []).filter((rule) => rule.layerId !== group.id),
      animations: visual.animations.filter((animation) => animation.layerId !== group.id),
    },
    childIds,
  }
}
