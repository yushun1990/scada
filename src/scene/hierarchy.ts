import {
  createGroupNode,
  createSceneId,
  isGroupNode,
  type SceneConnection,
  type SceneDocument,
  type SceneNode,
} from './model'
import {
  getSelectionBounds,
  getWorldTransform,
  worldToLocalTransform,
} from './geometry'

export type GroupResult = {
  scene: SceneDocument
  groupId: string | null
}

export type UngroupResult = {
  scene: SceneDocument
  childIds: string[]
}

function getNodeById(scene: SceneDocument, nodeId: string) {
  return scene.nodes.find((node) => node.id === nodeId) ?? null
}

export function getDirectChildren(
  scene: SceneDocument,
  parentId: string,
) {
  return scene.nodes.filter((node) => node.parentId === parentId)
}

export function collectSubtreeIds(
  scene: SceneDocument,
  rootIds: readonly string[],
) {
  const result = new Set<string>()
  const queue = [...rootIds]

  while (queue.length > 0) {
    const nodeId = queue.shift()

    if (!nodeId || result.has(nodeId)) {
      continue
    }

    result.add(nodeId)

    for (const child of getDirectChildren(scene, nodeId)) {
      queue.push(child.id)
    }
  }

  return result
}

export function deleteSceneNodes(
  scene: SceneDocument,
  rootIds: readonly string[],
): SceneDocument {
  const deletedIds = collectSubtreeIds(scene, rootIds)

  return {
    ...scene,
    nodes: scene.nodes.filter((node) => !deletedIds.has(node.id)),
    connections: scene.connections.filter(
      (connection) =>
        !deletedIds.has(connection.source.nodeId) &&
        !deletedIds.has(connection.target.nodeId),
    ),
  }
}

export function groupSceneNodes(
  scene: SceneDocument,
  nodeIds: readonly string[],
): GroupResult {
  const uniqueIds = Array.from(new Set(nodeIds))
  const selectedNodes = uniqueIds
    .map((nodeId) => getNodeById(scene, nodeId))
    .filter((node): node is SceneNode => Boolean(node))

  if (selectedNodes.length < 2) {
    return { scene, groupId: null }
  }

  const parentId = selectedNodes[0]?.parentId ?? null

  if (selectedNodes.some((node) => node.parentId !== parentId)) {
    return { scene, groupId: null }
  }

  const bounds = getSelectionBounds(scene, selectedNodes.map((node) => node.id))

  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return { scene, groupId: null }
  }

  const groupWorldTransform = {
    x: bounds.left,
    y: bounds.top,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
  }
  const groupLocalTransform = worldToLocalTransform(
    scene,
    parentId,
    groupWorldTransform,
  )
  const groupNode = createGroupNode(
    scene.nodes.filter(isGroupNode).length + 1,
    groupLocalTransform,
    parentId,
  )
  const firstSelectedIndex = Math.min(
    ...selectedNodes.map((selectedNode) =>
      scene.nodes.findIndex((node) => node.id === selectedNode.id),
    ),
  )
  const nodesWithGroup = [...scene.nodes]
  nodesWithGroup.splice(Math.max(0, firstSelectedIndex), 0, groupNode)
  const sceneWithGroup: SceneDocument = {
    ...scene,
    nodes: nodesWithGroup,
  }
  const selectedIdSet = new Set(selectedNodes.map((node) => node.id))
  const nextNodes = sceneWithGroup.nodes.map((node) => {
    if (!selectedIdSet.has(node.id)) {
      return node
    }

    const worldTransform = getWorldTransform(scene, node.id)

    if (!worldTransform) {
      return node
    }

    return {
      ...node,
      parentId: groupNode.id,
      transform: worldToLocalTransform(
        sceneWithGroup,
        groupNode.id,
        worldTransform,
      ),
    }
  })

  return {
    scene: {
      ...sceneWithGroup,
      nodes: nextNodes,
    },
    groupId: groupNode.id,
  }
}

export function ungroupSceneNode(
  scene: SceneDocument,
  groupId: string,
): UngroupResult {
  const group = getNodeById(scene, groupId)

  if (!group || !isGroupNode(group)) {
    return { scene, childIds: [] }
  }

  const children = getDirectChildren(scene, group.id)

  if (children.length === 0) {
    return {
      scene: {
        ...scene,
        nodes: scene.nodes.filter((node) => node.id !== group.id),
      },
      childIds: [],
    }
  }

  const childWorldTransforms = new Map(
    children.map((child) => [
      child.id,
      getWorldTransform(scene, child.id),
    ]),
  )
  const nextNodes = scene.nodes
    .filter((node) => node.id !== group.id)
    .map((node) => {
      const worldTransform = childWorldTransforms.get(node.id)

      if (!worldTransform) {
        return node
      }

      return {
        ...node,
        parentId: group.parentId,
        visible: group.visible && node.visible,
        locked: group.locked || node.locked,
        transform: worldToLocalTransform(
          scene,
          group.parentId,
          worldTransform,
        ),
      }
    })

  return {
    scene: {
      ...scene,
      nodes: nextNodes,
    },
    childIds: children.map((child) => child.id),
  }
}

function cloneInternalConnections(
  scene: SceneDocument,
  subtreeIds: Set<string>,
  idMap: Map<string, string>,
) {
  return scene.connections
    .filter(
      (connection) =>
        subtreeIds.has(connection.source.nodeId) &&
        subtreeIds.has(connection.target.nodeId),
    )
    .map((connection, index) => {
      const sourceNodeId = idMap.get(connection.source.nodeId)
      const targetNodeId = idMap.get(connection.target.nodeId)

      if (!sourceNodeId || !targetNodeId) {
        return null
      }

      return {
        ...connection,
        id: createSceneId('connection'),
        name: `${connection.name} 副本 ${index + 1}`,
        source: {
          ...connection.source,
          nodeId: sourceNodeId,
        },
        target: {
          ...connection.target,
          nodeId: targetNodeId,
        },
        style: { ...connection.style },
      } satisfies SceneConnection
    })
    .filter((connection): connection is SceneConnection => Boolean(connection))
}

export function cloneSceneSubtrees(
  scene: SceneDocument,
  rootIds: readonly string[],
) {
  const uniqueRootIds = Array.from(new Set(rootIds))
  const subtreeIds = collectSubtreeIds(scene, uniqueRootIds)
  const idMap = new Map<string, string>()

  for (const node of scene.nodes) {
    if (subtreeIds.has(node.id)) {
      idMap.set(
        node.id,
        createSceneId(isGroupNode(node) ? 'group' : 'pump'),
      )
    }
  }

  const rootIdSet = new Set(uniqueRootIds)
  const clonedNodes = scene.nodes
    .filter((node) => subtreeIds.has(node.id))
    .map((node) => {
      const clonedId = idMap.get(node.id)

      if (!clonedId) {
        return null
      }

      const isRoot = rootIdSet.has(node.id)
      const clonedParentId = node.parentId && idMap.has(node.parentId)
        ? idMap.get(node.parentId) ?? null
        : null

      return {
        ...node,
        id: clonedId,
        name: isRoot ? `${node.name} 副本` : node.name,
        parentId: clonedParentId,
        transform: {
          ...node.transform,
          x: node.transform.x + (isRoot ? 24 : 0),
          y: node.transform.y + (isRoot ? 24 : 0),
        },
        props: { ...node.props },
        bindings: [],
        behaviors: [],
      } as SceneNode
    })
    .filter((node): node is SceneNode => Boolean(node))
  const clonedConnections = cloneInternalConnections(scene, subtreeIds, idMap)

  return {
    scene: {
      ...scene,
      nodes: [...scene.nodes, ...clonedNodes],
      connections: [...scene.connections, ...clonedConnections],
    },
    rootIds: uniqueRootIds
      .map((nodeId) => idMap.get(nodeId))
      .filter((nodeId): nodeId is string => Boolean(nodeId)),
  }
}
