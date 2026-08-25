import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  VisualLayerTransform,
} from '../../component-system/visual'
import type { GeometryBounds } from '../../geometry/commands'

export type ComponentLayerPoint = {
  x: number
  y: number
}

export type ComponentLayerMatrix = {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const COMPONENT_LAYER_IDENTITY_MATRIX: ComponentLayerMatrix = {
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: 0,
  f: 0,
}

export function multiplyComponentLayerMatrices(
  first: ComponentLayerMatrix,
  second: ComponentLayerMatrix,
): ComponentLayerMatrix {
  return {
    a: first.a * second.a + first.c * second.b,
    b: first.b * second.a + first.d * second.b,
    c: first.a * second.c + first.c * second.d,
    d: first.b * second.c + first.d * second.d,
    e: first.a * second.e + first.c * second.f + first.e,
    f: first.b * second.e + first.d * second.f + first.f,
  }
}

export function invertComponentLayerMatrix(
  matrix: ComponentLayerMatrix,
): ComponentLayerMatrix {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c

  if (Math.abs(determinant) < Number.EPSILON) {
    return COMPONENT_LAYER_IDENTITY_MATRIX
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

export function applyComponentLayerMatrix(
  matrix: ComponentLayerMatrix,
  point: ComponentLayerPoint,
): ComponentLayerPoint {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  }
}

export function createComponentLayerLocalMatrix(
  layer: ComponentVisualLayer,
): ComponentLayerMatrix {
  const { transform } = layer
  const radians = (transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)

  return {
    a: cosine * transform.scaleX,
    b: sine * transform.scaleX,
    c: -sine * transform.scaleY,
    d: cosine * transform.scaleY,
    e: transform.x,
    f: transform.y,
  }
}

export function getComponentLayerWorldMatrix(
  visual: ComponentVisualDefinition,
  layerId: string,
  visiting = new Set<string>(),
): ComponentLayerMatrix {
  const layer = visual.layers.find((candidate) => candidate.id === layerId)

  if (!layer || visiting.has(layerId)) {
    return COMPONENT_LAYER_IDENTITY_MATRIX
  }

  visiting.add(layerId)
  const parentMatrix = layer.parentId
    ? getComponentLayerWorldMatrix(visual, layer.parentId, visiting)
    : COMPONENT_LAYER_IDENTITY_MATRIX
  visiting.delete(layerId)

  return multiplyComponentLayerMatrices(
    parentMatrix,
    createComponentLayerLocalMatrix(layer),
  )
}

export function createComponentLayerBounds(
  points: readonly ComponentLayerPoint[],
): GeometryBounds {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const right = Math.max(...xs)
  const bottom = Math.max(...ys)

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

export function getComponentLayerBoundsInParent(
  layer: ComponentVisualLayer,
): GeometryBounds {
  const matrix = createComponentLayerLocalMatrix(layer)
  const { width, height } = layer.transform

  return createComponentLayerBounds([
    applyComponentLayerMatrix(matrix, { x: 0, y: 0 }),
    applyComponentLayerMatrix(matrix, { x: width, y: 0 }),
    applyComponentLayerMatrix(matrix, { x: width, y: height }),
    applyComponentLayerMatrix(matrix, { x: 0, y: height }),
  ])
}

export function getComponentLayerWorldBounds(
  visual: ComponentVisualDefinition,
  layer: ComponentVisualLayer,
): GeometryBounds {
  const matrix = getComponentLayerWorldMatrix(visual, layer.id)
  const { width, height } = layer.transform

  return createComponentLayerBounds([
    applyComponentLayerMatrix(matrix, { x: 0, y: 0 }),
    applyComponentLayerMatrix(matrix, { x: width, y: 0 }),
    applyComponentLayerMatrix(matrix, { x: width, y: height }),
    applyComponentLayerMatrix(matrix, { x: 0, y: height }),
  ])
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

export function decomposeComponentLayerMatrix(
  matrix: ComponentLayerMatrix,
  size: Pick<VisualLayerTransform, 'width' | 'height'>,
): VisualLayerTransform | null {
  const scaleX = Math.hypot(matrix.a, matrix.b)
  const scaleYMagnitude = Math.hypot(matrix.c, matrix.d)

  if (scaleX < Number.EPSILON || scaleYMagnitude < Number.EPSILON) {
    return null
  }

  const dot = matrix.a * matrix.c + matrix.b * matrix.d
  const orthogonalityTolerance = scaleX * scaleYMagnitude * 1e-7

  if (Math.abs(dot) > orthogonalityTolerance) {
    return null
  }

  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  const scaleY = determinant / scaleX

  if (Math.abs(scaleY) < Number.EPSILON) {
    return null
  }

  return {
    x: matrix.e,
    y: matrix.f,
    width: size.width,
    height: size.height,
    rotation: normalizeRotation((Math.atan2(matrix.b, matrix.a) * 180) / Math.PI),
    scaleX,
    scaleY,
  }
}
