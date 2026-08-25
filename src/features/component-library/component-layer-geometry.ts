import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
} from '../../component-system/visual'
import type {
  GeometryBounds,
  GeometryDeltas,
  GeometryItem,
} from '../../geometry/commands'

type Point = {
  x: number
  y: number
}

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

function createLocalMatrix(layer: ComponentVisualLayer): Matrix {
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

function getLayerWorldMatrix(
  visual: ComponentVisualDefinition,
  layerId: string,
  visiting = new Set<string>(),
): Matrix {
  const layer = visual.layers.find((candidate) => candidate.id === layerId)

  if (!layer || visiting.has(layerId)) {
    return IDENTITY_MATRIX
  }

  visiting.add(layerId)
  const parentMatrix = layer.parentId
    ? getLayerWorldMatrix(visual, layer.parentId, visiting)
    : IDENTITY_MATRIX
  visiting.delete(layerId)

  return multiply(parentMatrix, createLocalMatrix(layer))
}

function createBounds(points: readonly Point[]): GeometryBounds {
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

export function getComponentLayerBounds(
  visual: ComponentVisualDefinition,
  layer: ComponentVisualLayer,
): GeometryBounds {
  const matrix = getLayerWorldMatrix(visual, layer.id)
  const { width, height } = layer.transform

  return createBounds([
    applyMatrix(matrix, { x: 0, y: 0 }),
    applyMatrix(matrix, { x: width, y: 0 }),
    applyMatrix(matrix, { x: width, y: height }),
    applyMatrix(matrix, { x: 0, y: height }),
  ])
}

export function createComponentLayerGeometryItems(
  visual: ComponentVisualDefinition,
  layerIds: readonly string[],
): GeometryItem[] {
  const selectedIds = new Set(layerIds)

  return visual.layers
    .filter((layer) => selectedIds.has(layer.id))
    .map((layer) => ({
      id: layer.id,
      bounds: getComponentLayerBounds(visual, layer),
    }))
}

export function applyComponentLayerGeometryDeltas(
  visual: ComponentVisualDefinition,
  deltas: GeometryDeltas,
): ComponentVisualDefinition {
  const layers = visual.layers.map((layer) => {
    const delta = deltas[layer.id]

    if (!delta) {
      return layer
    }

    const parentMatrix = layer.parentId
      ? getLayerWorldMatrix(visual, layer.parentId)
      : IDENTITY_MATRIX
    const inverseParent = invert(parentMatrix)
    const worldMatrix = getLayerWorldMatrix(visual, layer.id)
    const localOrigin = applyMatrix(inverseParent, {
      x: worldMatrix.e + delta.dx,
      y: worldMatrix.f + delta.dy,
    })

    return {
      ...layer,
      transform: {
        ...layer.transform,
        x: localOrigin.x,
        y: localOrigin.y,
      },
    } as ComponentVisualLayer
  })

  return { ...visual, layers }
}
