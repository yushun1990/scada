import type Konva from 'konva'
import {
  COMPOSITE_VISUAL_LAYER_NODE_NAME,
  compositeVisualLayerNodeId,
  getCompositeVisualLayerId,
} from '../../component-system/CompositeComponentVisualRenderer'
import type { ComponentVisualDefinition } from '../../component-system/visual'

export const COMPONENT_SNAP_GRID_SIZE = 24
export const COMPONENT_SNAP_THRESHOLD_PX = 7

type SnapSource = 'grid' | 'object'

export type ComponentSnapGuide = {
  orientation: 'vertical' | 'horizontal'
  position: number
  source: SnapSource
}

export type ComponentSnapResult = {
  adjustment: {
    x: number
    y: number
  }
  guides: ComponentSnapGuide[]
}

type SnapCandidate = {
  adjustment: number
  position: number
  source: SnapSource
}

type RectLike = {
  x: number
  y: number
  width: number
  height: number
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

function createAxisAnchors(rect: RectLike, axis: 'x' | 'y') {
  return axis === 'x'
    ? [rect.x, rect.x + rect.width / 2, rect.x + rect.width]
    : [rect.y, rect.y + rect.height / 2, rect.y + rect.height]
}

function findLayerNode(stage: Konva.Stage, layerId: string) {
  const expectedId = compositeVisualLayerNodeId(layerId)

  return stage
    .find(`.${COMPOSITE_VISUAL_LAYER_NODE_NAME}`)
    .find((node) => node.id() === expectedId) as Konva.Group | undefined
}

function createGridCandidate(
  value: number,
  gridSizePx: number,
): SnapCandidate | null {
  const target = Math.round(value / gridSizePx) * gridSizePx
  const adjustment = target - value

  if (Math.abs(adjustment) > COMPONENT_SNAP_THRESHOLD_PX) {
    return null
  }

  return {
    adjustment,
    position: target,
    source: 'grid',
  }
}

export function computeComponentLayerSnap(
  stage: Konva.Stage,
  node: Konva.Node,
  visual: ComponentVisualDefinition,
  artboardScale: number,
  gridSize = COMPONENT_SNAP_GRID_SIZE,
): ComponentSnapResult {
  const movingLayerId = getCompositeVisualLayerId(node)
  const movingLayer = movingLayerId
    ? visual.layers.find((layer) => layer.id === movingLayerId)
    : null

  if (!movingLayer || artboardScale <= 0) {
    return {
      adjustment: { x: 0, y: 0 },
      guides: [],
    }
  }

  const gridSizePx = Math.max(1, gridSize) * artboardScale
  const origin = node.getAbsolutePosition()
  let xCandidate = createGridCandidate(origin.x, gridSizePx)
  let yCandidate = createGridCandidate(origin.y, gridSizePx)
  const movingBounds = node.getClientRect({ relativeTo: stage })
  const movingXAnchors = createAxisAnchors(movingBounds, 'x')
  const movingYAnchors = createAxisAnchors(movingBounds, 'y')

  for (const sibling of visual.layers) {
    if (
      sibling.id === movingLayer.id ||
      sibling.parentId !== movingLayer.parentId ||
      !sibling.visible
    ) {
      continue
    }

    const siblingNode = findLayerNode(stage, sibling.id)

    if (!siblingNode) {
      continue
    }

    const siblingBounds = siblingNode.getClientRect({ relativeTo: stage })

    for (const movingAnchor of movingXAnchors) {
      for (const targetAnchor of createAxisAnchors(siblingBounds, 'x')) {
        const adjustment = targetAnchor - movingAnchor

        if (Math.abs(adjustment) <= COMPONENT_SNAP_THRESHOLD_PX) {
          xCandidate = chooseCandidate(xCandidate, {
            adjustment,
            position: targetAnchor,
            source: 'object',
          })
        }
      }
    }

    for (const movingAnchor of movingYAnchors) {
      for (const targetAnchor of createAxisAnchors(siblingBounds, 'y')) {
        const adjustment = targetAnchor - movingAnchor

        if (Math.abs(adjustment) <= COMPONENT_SNAP_THRESHOLD_PX) {
          yCandidate = chooseCandidate(yCandidate, {
            adjustment,
            position: targetAnchor,
            source: 'object',
          })
        }
      }
    }
  }

  const guides: ComponentSnapGuide[] = []

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
    adjustment: {
      x: xCandidate?.adjustment ?? 0,
      y: yCandidate?.adjustment ?? 0,
    },
    guides,
  }
}

export function applyComponentLayerSnap(
  node: Konva.Node,
  result: ComponentSnapResult,
) {
  if (
    Math.abs(result.adjustment.x) < 0.001 &&
    Math.abs(result.adjustment.y) < 0.001
  ) {
    return
  }

  const parent = node.getParent()

  if (!parent) {
    return
  }

  const absolutePosition = node.getAbsolutePosition()
  const parentInverse = parent.getAbsoluteTransform().copy().invert()
  const localPosition = parentInverse.point({
    x: absolutePosition.x + result.adjustment.x,
    y: absolutePosition.y + result.adjustment.y,
  })

  node.position(localPosition)
}
