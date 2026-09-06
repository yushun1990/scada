import type { ComponentVisualDefinition } from '../../component-system/visual'

export type ComponentLayerOrderCommand =
  | 'bring-to-front'
  | 'bring-forward'
  | 'send-backward'
  | 'send-to-back'

export type ReorderComponentLayersResult = {
  visual: ComponentVisualDefinition
  changed: boolean
}

function resolveSelectedSiblings(
  visual: ComponentVisualDefinition,
  selectedLayerIds: readonly string[],
) {
  if (selectedLayerIds.length === 0) {
    return null
  }

  const selectedIds = new Set(selectedLayerIds)
  const selectedLayers = visual.layers.filter((layer) => selectedIds.has(layer.id))

  if (selectedLayers.length !== selectedIds.size) {
    return null
  }

  const parentId = selectedLayers[0]?.parentId ?? null

  if (selectedLayers.some((layer) => layer.parentId !== parentId)) {
    return null
  }

  return {
    parentId,
    selectedIds,
    siblings: visual.layers.filter((layer) => layer.parentId === parentId),
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length
    && left.every((value, index) => value === right[index])
}

function reorderSiblingIds(
  siblingIds: readonly string[],
  selectedIds: ReadonlySet<string>,
  command: ComponentLayerOrderCommand,
) {
  const next = [...siblingIds]

  if (command === 'bring-to-front') {
    const selected = next.filter((id) => selectedIds.has(id))
    const unselected = next.filter((id) => !selectedIds.has(id))
    return [...unselected, ...selected]
  }

  if (command === 'send-to-back') {
    const selected = next.filter((id) => selectedIds.has(id))
    const unselected = next.filter((id) => !selectedIds.has(id))
    return [...selected, ...unselected]
  }

  if (command === 'bring-forward') {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (selectedIds.has(next[index]) && !selectedIds.has(next[index + 1])) {
        ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      }
    }
    return next
  }

  for (let index = 1; index < next.length; index += 1) {
    if (selectedIds.has(next[index]) && !selectedIds.has(next[index - 1])) {
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    }
  }

  return next
}

export function reorderComponentLayers(
  visual: ComponentVisualDefinition,
  selectedLayerIds: readonly string[],
  command: ComponentLayerOrderCommand,
): ReorderComponentLayersResult {
  const resolved = resolveSelectedSiblings(visual, selectedLayerIds)

  if (!resolved || resolved.siblings.length < 2) {
    return { visual, changed: false }
  }

  const siblingIds = resolved.siblings.map((layer) => layer.id)
  const nextSiblingIds = reorderSiblingIds(
    siblingIds,
    resolved.selectedIds,
    command,
  )

  if (arraysEqual(siblingIds, nextSiblingIds)) {
    return { visual, changed: false }
  }

  const siblingMap = new Map(resolved.siblings.map((layer) => [layer.id, layer]))
  const orderedSiblings = nextSiblingIds.map((id) => siblingMap.get(id))
  let siblingIndex = 0

  const layers = visual.layers.map((layer) => {
    if (layer.parentId !== resolved.parentId) {
      return layer
    }

    const replacement = orderedSiblings[siblingIndex]
    siblingIndex += 1
    return replacement ?? layer
  })

  return {
    changed: true,
    visual: { ...visual, layers },
  }
}

export function canReorderComponentLayers(
  visual: ComponentVisualDefinition,
  selectedLayerIds: readonly string[],
  command: ComponentLayerOrderCommand,
) {
  return reorderComponentLayers(visual, selectedLayerIds, command).changed
}
