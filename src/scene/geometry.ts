import { hasLiveNodeTransform } from './live-preview'
import {
  isGroupNode,
  type NodeTransform,
  type SceneDocument,
  type SceneNode,
} from './model'

export type Bounds = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
}

export type AlignmentGuide = {
  orientation: 'vertical' | 'horizontal'
  position: number
  source: 'grid' | 'object'
}

export type SnapSettings = {
  enabled: boolean
  gridEnabled: boolean
  gridSize: number
  objectEnabled: boolean
  threshold: number
}

export type AlignMode =
  | 'left'
  | 'center-x'
  | 'right'
  | 'top'
  | 'center-y'
  | 'bottom'

export type DistributeMode = 'horizontal' | 'vertical'
export type TransformUpdates = Record<string, NodeTransform>

type Point = { x: number; y: number }

type Matrix = {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const IDENTITY_MATRIX: Matrix = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
}

function createBounds(
  left: number,
  top: number,
  right: number,
  bottom: number,
): Bounds {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  }
}

function multiply(first: Matrix, second: Matrix): Matrix {
  return {
    a: first.a * second.a + first.c * second.b,
    b: first.b * second.a + first.d * second.b,
    c: first.a * second.c + first.c * second.d,
    d: first.b * second.c + first.d * second.d,
    e: first.a * second.e + first.c * second.f + first.e,
    f: first.b * second.e + first.d * second.f + first.f,
  }
}

function invert(matrix: Matrix): Matrix {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c

  if (Math.abs(determinant) < Number.EPSILON) {
    return IDENTITY_MATRIX
  }

  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  }
}

function applyMatrix(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  }
}

function createLocalMatrix(node: SceneNode, transform: NodeTransform): Matrix {
  const radians = (transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const scaleX = isGroupNode(node)
    ? transform.width / node.props.designWidth
    : 1
  const scaleY = isGroupNode(node)
    ? transform.height / node.props.designHeight
    : 1

  return {
    a: cosine * scaleX,
    b: sine * scaleX,
    c: -sine * scaleY,
    d: cosine * scaleY,
    e: transform.x,
    f: transform.y,
  }
}

function getNodeWorldMatrix(
  scene: SceneDocument,
  nodeId: string,
  overrides: TransformUpdates = {},
  visiting = new Set<string>(),
): Matrix {
  const node = scene.nodes.find((candidate) => candidate.id === nodeId)

  if (!node || visiting.has(nodeId)) {
    return IDENTITY_MATRIX
  }

  visiting.add(nodeId)
  const parentMatrix = node.parentId
    ? getNodeWorldMatrix(scene, node.parentId, overrides, visiting)
    : IDENTITY_MATRIX
  visiting.delete(nodeId)

  return multiply(
    parentMatrix,
    createLocalMatrix(node, overrides[node.id] ?? node.transform),
  )
}

function getNodeDesignSize(
  node: SceneNode,
  transform: NodeTransform,
) {
  return isGroupNode(node)
    ? {
        width: node.props.designWidth,
        height: node.props.designHeight,
      }
    : {
        width: transform.width,
        height: transform.height,
      }
}

function normalizeRotation(rotation: number) {
  let next = rotation % 360

  if (next > 180) {
    next -= 360
  } else if (next <= -180) {
    next += 360
  }

  return next
}

export function getWorldTransform(
  scene: SceneDocument,
  nodeId: string,
  overrides: TransformUpdates = {},
): NodeTransform | null {
  const node = scene.nodes.find((candidate) => candidate.id === nodeId)

  if (!node) {
    return null
  }

  const localTransform = overrides[node.id] ?? node.transform
  const matrix = getNodeWorldMatrix(scene, node.id, overrides)
  const designSize = getNodeDesignSize(node, localTransform)
  const scaleX = Math.hypot(matrix.a, matrix.b)
  const scaleY = Math.hypot(matrix.c, matrix.d)

  return {
    x: matrix.e,
    y: matrix.f,
    width: designSize.width * scaleX,
    height: designSize.height * scaleY,
    rotation: normalizeRotation((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI),
  }
}

export function worldToLocalTransform(
  scene: SceneDocument,
  parentId: string | null,
  worldTransform: NodeTransform,
): NodeTransform {
  if (!parentId) {
    return { ...worldTransform }
  }

  const parentMatrix = getNodeWorldMatrix(scene, parentId)
  const inverseParent = invert(parentMatrix)
  const localOrigin = applyMatrix(inverseParent, {
    x: worldTransform.x,
    y: worldTransform.y,
  })
  const parentScaleX = Math.hypot(parentMatrix.a, parentMatrix.b) || 1
  const parentScaleY = Math.hypot(parentMatrix.c, parentMatrix.d) || 1
  const parentRotation =
    (Math.atan2(parentMatrix.b, parentMatrix.a) * 180) / Math.PI

  return {
    x: localOrigin.x,
    y: localOrigin.y,
    width: worldTransform.width / parentScaleX,
    height: worldTransform.height / parentScaleY,
    rotation: normalizeRotation(worldTransform.rotation - parentRotation),
  }
}

export function getNodeBounds(
  scene: SceneDocument,
  node: SceneNode,
  overrides: TransformUpdates = {},
): Bounds {
  const transform = overrides[node.id] ?? node.transform
  const matrix = getNodeWorldMatrix(scene, node.id, overrides)
  const designSize = getNodeDesignSize(node, transform)
  const points = [
    applyMatrix(matrix, { x: 0, y: 0 }),
    applyMatrix(matrix, { x: designSize.width, y: 0 }),
    applyMatrix(matrix, {
      x: designSize.width,
      y: designSize.height,
    }),
    applyMatrix(matrix, { x: 0, y: designSize.height }),
  ]
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)

  return createBounds(
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  )
}

export function getSelectionBounds(
  scene: SceneDocument,
  nodeIds: readonly string[],
  overrides: TransformUpdates = {},
): Bounds | null {
  const idSet = new Set(nodeIds)
  const bounds = scene.nodes
    .filter((node) => idSet.has(node.id))
    .map((node) => getNodeBounds(scene, node, overrides))

  if (bounds.length === 0) {
    return null
  }

  return createBounds(
    Math.min(...bounds.map((item) => item.left)),
    Math.min(...bounds.map((item) => item.top)),
    Math.max(...bounds.map((item) => item.right)),
    Math.max(...bounds.map((item) => item.bottom)),
  )
}

export function getRootNodes(scene: SceneDocument) {
  return scene.nodes.filter((node) => node.parentId === null)
}

export function shiftBounds(bounds: Bounds, dx: number, dy: number): Bounds {
  return createBounds(
    bounds.left + dx,
    bounds.top + dy,
    bounds.right + dx,
    bounds.bottom + dy,
  )
}

export function boundsIntersect(first: Bounds, second: Bounds) {
  return !(
    first.right < second.left ||
    first.left > second.right ||
    first.bottom < second.top ||
    first.top > second.bottom
  )
}

type SnapCandidate = {
  adjustment: number
  position: number
  source: AlignmentGuide['source']
}

function chooseCandidate(
  current: SnapCandidate | null,
  candidate: SnapCandidate,
) {
  if (!current || Math.abs(candidate.adjustment) < Math.abs(current.adjustment)) {
    return candidate
  }

  return current
}

function createAxisAnchors(bounds: Bounds, axis: 'x' | 'y') {
  return axis === 'x'
    ? [bounds.left, bounds.centerX, bounds.right]
    : [bounds.top, bounds.centerY, bounds.bottom]
}

export function computeSnap(
  scene: SceneDocument,
  movingNodeIds: readonly string[],
  initialBounds: Bounds,
  rawDelta: { x: number; y: number },
  settings: SnapSettings,
) {
  if (!settings.enabled || hasLiveNodeTransform(movingNodeIds)) {
    return {
      delta: rawDelta,
      guides: [] as AlignmentGuide[],
    }
  }

  const proposedBounds = shiftBounds(initialBounds, rawDelta.x, rawDelta.y)
  const movingIdSet = new Set(movingNodeIds)
  let xCandidate: SnapCandidate | null = null
  let yCandidate: SnapCandidate | null = null

  if (settings.gridEnabled && settings.gridSize > 0) {
    for (const anchor of createAxisAnchors(proposedBounds, 'x')) {
      const target = Math.round(anchor / settings.gridSize) * settings.gridSize
      const adjustment = target - anchor

      if (Math.abs(adjustment) <= settings.threshold) {
        xCandidate = chooseCandidate(xCandidate, {
          adjustment,
          position: target,
          source: 'grid',
        })
      }
    }

    for (const anchor of createAxisAnchors(proposedBounds, 'y')) {
      const target = Math.round(anchor / settings.gridSize) * settings.gridSize
      const adjustment = target - anchor

      if (Math.abs(adjustment) <= settings.threshold) {
        yCandidate = chooseCandidate(yCandidate, {
          adjustment,
          position: target,
          source: 'grid',
        })
      }
    }
  }

  if (settings.objectEnabled) {
    const targetBounds = getRootNodes(scene)
      .filter((node) => node.visible && !movingIdSet.has(node.id))
      .map((node) => getNodeBounds(scene, node))
    const movingXAnchors = createAxisAnchors(proposedBounds, 'x')
    const movingYAnchors = createAxisAnchors(proposedBounds, 'y')

    for (const bounds of targetBounds) {
      for (const movingAnchor of movingXAnchors) {
        for (const targetAnchor of createAxisAnchors(bounds, 'x')) {
          const adjustment = targetAnchor - movingAnchor

          if (Math.abs(adjustment) <= settings.threshold) {
            xCandidate = chooseCandidate(xCandidate, {
              adjustment,
              position: targetAnchor,
              source: 'object',
            })
          }
        }
      }

      for (const movingAnchor of movingYAnchors) {
        for (const targetAnchor of createAxisAnchors(bounds, 'y')) {
          const adjustment = targetAnchor - movingAnchor

          if (Math.abs(adjustment) <= settings.threshold) {
            yCandidate = chooseCandidate(yCandidate, {
              adjustment,
              position: targetAnchor,
              source: 'object',
            })
          }
        }
      }
    }
  }

  const guides: AlignmentGuide[] = []

  if (xCandidate) {
    guides.push({
      orientation: 'vertical',
      position: xCandidate.position,
      source: xCandidate.source,
    })
  }

  if (yCandidate) {
    guides.push({
      orientation: 'horizontal',
      position: yCandidate.position,
      source: yCandidate.source,
    })
  }

  return {
    delta: {
      x: rawDelta.x + (xCandidate?.adjustment ?? 0),
      y: rawDelta.y + (yCandidate?.adjustment ?? 0),
    },
    guides,
  }
}

function selectedNodes(scene: SceneDocument, nodeIds: readonly string[]) {
  const selectedIdSet = new Set(nodeIds)
  return scene.nodes.filter((node) => selectedIdSet.has(node.id))
}

export function alignNodes(
  scene: SceneDocument,
  nodeIds: readonly string[],
  mode: AlignMode,
): TransformUpdates {
  const nodes = selectedNodes(scene, nodeIds)
  const selectionBounds = getSelectionBounds(scene, nodeIds)

  if (nodes.length < 2 || !selectionBounds) {
    return {}
  }

  const updates: TransformUpdates = {}

  for (const node of nodes) {
    const bounds = getNodeBounds(scene, node)
    const worldTransform = getWorldTransform(scene, node.id)

    if (!worldTransform) {
      continue
    }

    let dx = 0
    let dy = 0

    switch (mode) {
      case 'left':
        dx = selectionBounds.left - bounds.left
        break
      case 'center-x':
        dx = selectionBounds.centerX - bounds.centerX
        break
      case 'right':
        dx = selectionBounds.right - bounds.right
        break
      case 'top':
        dy = selectionBounds.top - bounds.top
        break
      case 'center-y':
        dy = selectionBounds.centerY - bounds.centerY
        break
      case 'bottom':
        dy = selectionBounds.bottom - bounds.bottom
        break
    }

    updates[node.id] = worldToLocalTransform(scene, node.parentId, {
      ...worldTransform,
      x: worldTransform.x + dx,
      y: worldTransform.y + dy,
    })
  }

  return updates
}

export function distributeNodes(
  scene: SceneDocument,
  nodeIds: readonly string[],
  mode: DistributeMode,
): TransformUpdates {
  const nodes = selectedNodes(scene, nodeIds)

  if (nodes.length < 3) {
    return {}
  }

  const records = nodes.map((node) => ({
    node,
    bounds: getNodeBounds(scene, node),
    worldTransform: getWorldTransform(scene, node.id),
  }))

  records.sort((first, second) =>
    mode === 'horizontal'
      ? first.bounds.left - second.bounds.left
      : first.bounds.top - second.bounds.top,
  )

  const first = records[0]
  const last = records[records.length - 1]

  if (!first || !last) {
    return {}
  }

  const totalItemSize = records.reduce(
    (sum, record) =>
      sum + (mode === 'horizontal' ? record.bounds.width : record.bounds.height),
    0,
  )
  const span =
    mode === 'horizontal'
      ? last.bounds.right - first.bounds.left
      : last.bounds.bottom - first.bounds.top
  const gap = (span - totalItemSize) / (records.length - 1)
  let cursor = mode === 'horizontal' ? first.bounds.left : first.bounds.top
  const updates: TransformUpdates = {}

  for (const record of records) {
    if (!record.worldTransform) {
      continue
    }

    const current =
      mode === 'horizontal' ? record.bounds.left : record.bounds.top
    const delta = cursor - current
    const nextWorldTransform = {
      ...record.worldTransform,
      x:
        record.worldTransform.x +
        (mode === 'horizontal' ? delta : 0),
      y:
        record.worldTransform.y +
        (mode === 'vertical' ? delta : 0),
    }

    updates[record.node.id] = worldToLocalTransform(
      scene,
      record.node.parentId,
      nextWorldTransform,
    )
    cursor +=
      (mode === 'horizontal' ? record.bounds.width : record.bounds.height) + gap
  }

  return updates
}
