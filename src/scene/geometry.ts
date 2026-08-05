import type { NodeTransform, SceneDocument, SceneNode } from './model'

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

export function getTransformBounds(transform: NodeTransform): Bounds {
  const radians = (transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const widthX = transform.width * cosine
  const widthY = transform.width * sine
  const heightX = -transform.height * sine
  const heightY = transform.height * cosine

  const points = [
    { x: transform.x, y: transform.y },
    { x: transform.x + widthX, y: transform.y + widthY },
    {
      x: transform.x + widthX + heightX,
      y: transform.y + widthY + heightY,
    },
    { x: transform.x + heightX, y: transform.y + heightY },
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

export function getNodeBounds(
  node: SceneNode,
  transform = node.transform,
): Bounds {
  return getTransformBounds(transform)
}

export function getSelectionBounds(
  scene: SceneDocument,
  nodeIds: readonly string[],
  overrides: TransformUpdates = {},
): Bounds | null {
  const idSet = new Set(nodeIds)
  const bounds = scene.nodes
    .filter((node) => idSet.has(node.id))
    .map((node) => getNodeBounds(node, overrides[node.id] ?? node.transform))

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
  if (!settings.enabled) {
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
    const targetBounds = scene.nodes
      .filter(
        (node) =>
          node.visible &&
          !movingIdSet.has(node.id),
      )
      .map((node) => getNodeBounds(node))

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
    const bounds = getNodeBounds(node)
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

    updates[node.id] = {
      ...node.transform,
      x: node.transform.x + dx,
      y: node.transform.y + dy,
    }
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
    bounds: getNodeBounds(node),
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
    const current =
      mode === 'horizontal' ? record.bounds.left : record.bounds.top
    const delta = cursor - current

    updates[record.node.id] = {
      ...record.node.transform,
      x:
        record.node.transform.x +
        (mode === 'horizontal' ? delta : 0),
      y:
        record.node.transform.y +
        (mode === 'vertical' ? delta : 0),
    }

    cursor +=
      (mode === 'horizontal' ? record.bounds.width : record.bounds.height) + gap
  }

  return updates
}
