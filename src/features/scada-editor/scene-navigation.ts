import type { SceneNode } from '../../scene/schema'

export type SceneNavigatorRow = {
  node: SceneNode
  depth: number
  hasChildren: boolean
  position: number
  siblingCount: number
  hiddenByParent: boolean
  lockedByParent: boolean
}

export function sceneNodeAncestorIds(nodes: readonly SceneNode[], nodeId: string) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const ancestors = new Set<string>()
  let parentId = byId.get(nodeId)?.parentId
  while (parentId && !ancestors.has(parentId)) {
    ancestors.add(parentId)
    parentId = byId.get(parentId)?.parentId
  }
  return [...ancestors]
}

/** A transient view of Scene order and hierarchy; never persisted as a second tree. */
export function sceneNavigatorRows(
  nodes: readonly SceneNode[],
  collapsed: ReadonlySet<string>,
  search = '',
): SceneNavigatorRow[] {
  const query = search.trim().toLocaleLowerCase()
  const byParent = new Map<string | null, SceneNode[]>()
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId) ?? []
    siblings.push(node)
    byParent.set(node.parentId, siblings)
  }
  function visit(parentId: string | null, depth: number, ancestorMatches = false,
    hiddenByParent = false, lockedByParent = false): SceneNavigatorRow[] {
    const siblings = byParent.get(parentId) ?? []
    const branches = siblings.map((node) => {
      const matches = ancestorMatches || [node.name, node.type, node.id,
        node.type === 'core.group' ? '组合' : '',
        !node.visible || hiddenByParent ? '隐藏' : '',
        node.locked || lockedByParent ? '锁定' : '',
      ].join(' ').toLocaleLowerCase().includes(query)
      const children = visit(node.id, depth + 1, Boolean(query) && matches,
        hiddenByParent || !node.visible, lockedByParent || node.locked)
      if (query && !matches && !children.length) return null
      return { node, children }
    }).filter((branch) => branch !== null)
    return branches.flatMap(({ node, children }, index) => [{
      node, depth, hasChildren: byParent.has(node.id), position: index + 1,
      siblingCount: branches.length, hiddenByParent, lockedByParent,
    }, ...(query || !collapsed.has(node.id) ? children : [])])
  }
  return visit(null, 0)
}
