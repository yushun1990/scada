import {
  alignBottom as alignGeometryBottom,
  alignCenterX as alignGeometryCenterX,
  alignCenterY as alignGeometryCenterY,
  alignLeft as alignGeometryLeft,
  alignRight as alignGeometryRight,
  alignTop as alignGeometryTop,
  distributeHorizontal as distributeGeometryHorizontal,
  distributeVertical as distributeGeometryVertical,
  type GeometryBounds,
  type GeometryDeltas,
  type GeometryItem,
} from '../geometry/commands'
import { hasLiveNodeTransform } from './live-preview'
import {
  isGroupNode,
  type NodeTransform,
  type SceneDocument,
  type SceneNode,
} from './model'

export type Bounds = GeometryBounds

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

function createGeometryItems(
  scene: SceneDocument,
  nodes: readonly SceneNode[],
): GeometryItem[] {
  return nodes.map((node) => ({
    id: node.id,
    bounds: getNodeBounds(scene, node),
  }))
}

function applyGeometryDeltas(
  scene: SceneDocument,
  nodes: readonly SceneNode[],
  deltas: GeometryDeltas,
): TransformUpdates {
  const updates: TransformUpdates = {}

  for (const node of nodes) {
    const delta = deltas[node.id]
    const worldTransform = getWorldTransform(scene, node.id)

    if (!delta || !worldTransform) {
      continue
    }

    updates[node.id] = worldToLocalTransform(scene, node.parentId, {
      ...worldTransform,
      x: worldTransform.x + delta.dx,
      y: worldTransform.y + delta.dy,
    })
  }

  return updates
}

export function alignNodes(
  scene: SceneDocument,
  nodeIds: readonly string[],
  mode: AlignMode,
): TransformUpdates {
  const nodes = selectedNodes(scene, nodeIds)

  if (nodes.length < 2) {
    return {}
  }

  const items = createGeometryItems(scene, nodes)
  let deltas: GeometryDeltas

  switch (mode) {
    case 'left':
      deltas = alignGeometryLeft(items)
      break
    case 'center-x':
      deltas = alignGeometryCenterX(items)
      break
    case 'right':
      deltas = alignGeometryRight(items)
      break
    case 'top':
      deltas = alignGeometryTop(items)
      break
    case 'center-y':
      deltas = alignGeometryCenterY(items)
      break
    case 'bottom':
      deltas = alignGeometryBottom(items)
      break
  }

  return applyGeometryDeltas(scene, nodes, deltas)
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

  const items = createGeometryItems(scene, nodes)
  const deltas = mode === 'horizontal'
    ? distributeGeometryHorizontal(items)
    : distributeGeometryVertical(items)

  return applyGeometryDeltas(scene, nodes, deltas)
}
