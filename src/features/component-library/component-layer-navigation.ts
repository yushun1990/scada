import type { ComponentVisualLayer } from '../../component-system/visual'

export type ComponentNavigatorRow = {
  layer: ComponentVisualLayer
  depth: number
  hasChildren: boolean
}

const SEARCH_LABELS: Record<string, string> = {
  group: '组合 组', svg: 'SVG', image: '图片 位图', text: '文本 文字',
  vector: '矢量 图形', rect: '矩形', circle: '圆形', ellipse: '椭圆',
  line: '线段', path: '路径',
}

export function componentLayerAncestorIds(
  layers: readonly ComponentVisualLayer[],
  layerId: string | null,
): string[] {
  const byId = new Map(layers.map((layer) => [layer.id, layer]))
  const ancestors = new Set<string>()
  let parentId = layerId ? byId.get(layerId)?.parentId : null
  while (parentId && !ancestors.has(parentId)) {
    ancestors.add(parentId)
    parentId = byId.get(parentId)?.parentId
  }
  return [...ancestors]
}

/** A transient view of the existing forest; never a layer-order authority. */
export function componentNavigatorRows(
  layers: readonly ComponentVisualLayer[],
  collapsedGroupIds: ReadonlySet<string>,
  search = '',
): ComponentNavigatorRow[] {
  const query = search.trim().toLocaleLowerCase()
  const byParent = new Map<string | null, ComponentVisualLayer[]>()
  for (const layer of layers) {
    const siblings = byParent.get(layer.parentId) ?? []
    siblings.push(layer)
    byParent.set(layer.parentId, siblings)
  }

  function visit(parentId: string | null, depth: number, ancestorMatches = false): ComponentNavigatorRow[] {
    return (byParent.get(parentId) ?? []).flatMap((layer) => {
      const searchable = [layer.name, layer.id, layer.kind, SEARCH_LABELS[layer.kind]]
      if (layer.kind === 'vector') searchable.push(layer.primitive, SEARCH_LABELS[layer.primitive])
      const matches = ancestorMatches || searchable.join(' ').toLocaleLowerCase().includes(query)
      const children = visit(layer.id, depth + 1, Boolean(query) && matches)
      if (query && !matches && children.length === 0) return []

      const row = { layer, depth, hasChildren: byParent.has(layer.id) }
      return [row, ...(query || !collapsedGroupIds.has(layer.id) ? children : [])]
    })
  }
  return visit(null, 0)
}
