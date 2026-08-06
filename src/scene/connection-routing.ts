import {
  getPortWorldDirection,
  getPortWorldPosition,
} from '../components/ports'
import type {
  ConnectionEndpoint,
  SceneConnection,
  SceneDocument,
} from './model'
import type { TransformUpdates } from './geometry'

export type RoutePoint = {
  x: number
  y: number
}

const DEFAULT_CLEARANCE = 28
const EPSILON = 0.001

function dominantAxis(direction: RoutePoint) {
  return Math.abs(direction.x) >= Math.abs(direction.y)
    ? 'horizontal'
    : 'vertical'
}

function normalizeAxisDirection(direction: RoutePoint): RoutePoint {
  if (dominantAxis(direction) === 'horizontal') {
    return { x: direction.x >= 0 ? 1 : -1, y: 0 }
  }

  return { x: 0, y: direction.y >= 0 ? 1 : -1 }
}

function offsetPoint(
  point: RoutePoint,
  direction: RoutePoint,
  distance: number,
): RoutePoint {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance,
  }
}

function nearlyEqual(first: number, second: number) {
  return Math.abs(first - second) <= EPSILON
}

function removeDuplicateAndCollinearPoints(points: RoutePoint[]) {
  const deduplicated: RoutePoint[] = []

  for (const point of points) {
    const previous = deduplicated[deduplicated.length - 1]

    if (
      previous &&
      nearlyEqual(previous.x, point.x) &&
      nearlyEqual(previous.y, point.y)
    ) {
      continue
    }

    deduplicated.push(point)
  }

  const simplified: RoutePoint[] = []

  for (const point of deduplicated) {
    const first = simplified[simplified.length - 2]
    const second = simplified[simplified.length - 1]

    if (
      first &&
      second &&
      ((nearlyEqual(first.x, second.x) && nearlyEqual(second.x, point.x)) ||
        (nearlyEqual(first.y, second.y) && nearlyEqual(second.y, point.y)))
    ) {
      simplified[simplified.length - 1] = point
      continue
    }

    simplified.push(point)
  }

  return simplified
}

function flattenPoints(points: RoutePoint[]) {
  return points.flatMap((point) => [point.x, point.y])
}

function routeBetweenStubs(
  sourceStub: RoutePoint,
  targetStub: RoutePoint,
  sourceDirection: RoutePoint,
  targetDirection: RoutePoint,
) {
  const sourceAxis = dominantAxis(sourceDirection)
  const targetAxis = dominantAxis(targetDirection)

  if (sourceAxis === 'horizontal' && targetAxis === 'horizontal') {
    const middleX = (sourceStub.x + targetStub.x) / 2

    return [
      sourceStub,
      { x: middleX, y: sourceStub.y },
      { x: middleX, y: targetStub.y },
      targetStub,
    ]
  }

  if (sourceAxis === 'vertical' && targetAxis === 'vertical') {
    const middleY = (sourceStub.y + targetStub.y) / 2

    return [
      sourceStub,
      { x: sourceStub.x, y: middleY },
      { x: targetStub.x, y: middleY },
      targetStub,
    ]
  }

  if (sourceAxis === 'horizontal') {
    return [
      sourceStub,
      { x: targetStub.x, y: sourceStub.y },
      targetStub,
    ]
  }

  return [
    sourceStub,
    { x: sourceStub.x, y: targetStub.y },
    targetStub,
  ]
}

export function getOrthogonalRoutePoints(
  source: RoutePoint,
  target: RoutePoint,
  sourceDirection: RoutePoint,
  targetDirection: RoutePoint,
  clearance = DEFAULT_CLEARANCE,
) {
  const normalizedSourceDirection = normalizeAxisDirection(sourceDirection)
  const normalizedTargetDirection = normalizeAxisDirection(targetDirection)
  const sourceStub = offsetPoint(
    source,
    normalizedSourceDirection,
    clearance,
  )
  const targetStub = offsetPoint(
    target,
    normalizedTargetDirection,
    clearance,
  )
  const middle = routeBetweenStubs(
    sourceStub,
    targetStub,
    normalizedSourceDirection,
    normalizedTargetDirection,
  )

  return removeDuplicateAndCollinearPoints([
    source,
    ...middle,
    target,
  ])
}

export function getConnectionRoutePoints(
  scene: SceneDocument,
  connection: SceneConnection,
  overrides: TransformUpdates = {},
) {
  const source = getPortWorldPosition(scene, connection.source, overrides)
  const target = getPortWorldPosition(scene, connection.target, overrides)

  if (!source || !target) {
    return null
  }

  if (connection.routing === 'straight') {
    return [source.x, source.y, target.x, target.y]
  }

  const sourceDirection = getPortWorldDirection(
    scene,
    connection.source,
    overrides,
  )
  const targetDirection = getPortWorldDirection(
    scene,
    connection.target,
    overrides,
  )

  if (!sourceDirection || !targetDirection) {
    return [source.x, source.y, target.x, target.y]
  }

  return flattenPoints(
    getOrthogonalRoutePoints(
      source,
      target,
      sourceDirection,
      targetDirection,
    ),
  )
}

export function getConnectionPreviewRoutePoints(
  scene: SceneDocument,
  sourceEndpoint: ConnectionEndpoint,
  pointer: RoutePoint,
) {
  const source = getPortWorldPosition(scene, sourceEndpoint)
  const sourceDirection = getPortWorldDirection(scene, sourceEndpoint)

  if (!source || !sourceDirection) {
    return null
  }

  const horizontal = dominantAxis(sourceDirection) === 'horizontal'
  const pointerDirection = horizontal
    ? { x: pointer.x >= source.x ? -1 : 1, y: 0 }
    : { x: 0, y: pointer.y >= source.y ? -1 : 1 }

  return flattenPoints(
    getOrthogonalRoutePoints(
      source,
      pointer,
      sourceDirection,
      pointerDirection,
      20,
    ),
  )
}
