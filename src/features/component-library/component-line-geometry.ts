import type { VectorVisualLayer } from '../../component-system/visual'

// Shared by preview and committed endpoint gestures. Command ownership stays
// in the canvas; transient geometry is deliberately not rounded here.
export function resolveLineEndpointTransform(
  start: { x: number; y: number },
  end: { x: number; y: number },
  height: number,
): VectorVisualLayer['transform'] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const width = Math.max(4, Math.hypot(dx, dy))
  const rotation = (Math.atan2(dy, dx) * 180) / Math.PI
  const rad = (rotation * Math.PI) / 180
  return {
    x: start.x + Math.sin(rad) * (height / 2),
    y: start.y - Math.cos(rad) * (height / 2),
    width,
    height,
    rotation,
    scaleX: 1,
    scaleY: 1,
  }
}

export function adjustLineThickness(
  start: { x: number; y: number },
  transform: VectorVisualLayer['transform'],
  strokeWidth: number,
): VectorVisualLayer['transform'] {
  const height = Math.max(8, strokeWidth * 2)
  const rad = (transform.rotation * Math.PI) / 180
  return {
    ...transform,
    x: start.x + Math.sin(rad) * (height / 2),
    y: start.y - Math.cos(rad) * (height / 2),
    height,
  }
}

export function getLineEndpoints(transform: VectorVisualLayer['transform']) {
  const { x, y, width, height, rotation, scaleX, scaleY } = transform
  const rad = (rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const halfH = height / 2

  const p1 = {
    x: x - sin * halfH * scaleY,
    y: y + cos * halfH * scaleY,
  }

  const p2 = {
    x: x + cos * width * scaleX - sin * halfH * scaleY,
    y: y + sin * width * scaleX + cos * halfH * scaleY,
  }

  return { p1, p2 }
}

export function getLineDesignVertices(layer: VectorVisualLayer): { x: number; y: number }[] {
  if (layer.points && layer.points.length >= 4) {
    const { x, y, rotation, scaleX, scaleY } = layer.transform
    const rad = (rotation * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const result: { x: number; y: number }[] = []
    for (let i = 0; i < layer.points.length; i += 2) {
      const lx = layer.points[i] * scaleX
      const ly = layer.points[i + 1] * scaleY
      result.push({
        x: x + lx * cos - ly * sin,
        y: y + lx * sin + ly * cos,
      })
    }
    return result
  }
  const { p1, p2 } = getLineEndpoints(layer.transform)
  return [p1, p2]
}

export function normalizePolylineLayer(
  layer: VectorVisualLayer,
  vertices: { x: number; y: number }[],
): VectorVisualLayer {
  const xs = vertices.map((v) => v.x)
  const ys = vertices.map((v) => v.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  const strokeWidth = layer.style?.strokeWidth ?? 2
  const width = Math.max(8, maxX - minX)
  const height = Math.max(8, maxY - minY, strokeWidth * 2)

  const points: number[] = []
  for (const v of vertices) {
    points.push(Math.round((v.x - minX) * 100) / 100, Math.round((v.y - minY) * 100) / 100)
  }

  return {
    ...layer,
    transform: {
      ...layer.transform,
      x: Math.round(minX * 100) / 100,
      y: Math.round(minY * 100) / 100,
      width,
      height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    points,
  }
}

export function convertTwoVerticesToLineLayer(
  layer: VectorVisualLayer,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
): VectorVisualLayer {
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const newWidth = Math.max(4, Math.hypot(dx, dy))
  const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
  const newRad = (newRotation * Math.PI) / 180
  const strokeWidth = layer.style?.strokeWidth ?? 2
  const halfH = Math.max(4, strokeWidth)
  const newX = p1.x + Math.sin(newRad) * halfH
  const newY = p1.y - Math.cos(newRad) * halfH

  return {
    ...layer,
    transform: {
      ...layer.transform,
      x: Math.round(newX * 100) / 100,
      y: Math.round(newY * 100) / 100,
      width: Math.round(newWidth * 100) / 100,
      height: halfH * 2,
      rotation: Math.round(newRotation * 100) / 100,
      scaleX: 1,
      scaleY: 1,
    },
    points: undefined,
  }
}

export function projectPointToLineSegments(
  vertices: { x: number; y: number }[],
  click: { x: number; y: number },
) {
  if (vertices.length < 2) return null
  let bestDist = Infinity
  let bestSeg = 0
  let bestPoint = { x: click.x, y: click.y }

  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i]
    const b = vertices[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-6) continue

    const t = Math.max(0, Math.min(1, ((click.x - a.x) * dx + (click.y - a.y) * dy) / lenSq))
    const projX = a.x + t * dx
    const projY = a.y + t * dy
    const dist = Math.hypot(click.x - projX, click.y - projY)

    if (dist < bestDist) {
      bestDist = dist
      bestSeg = i
      bestPoint = {
        x: Math.round(projX * 100) / 100,
        y: Math.round(projY * 100) / 100,
      }
    }
  }

  return {
    segmentIndex: bestSeg,
    point: bestPoint,
    distance: bestDist,
  }
}

export function snapAngleToCardinal(
  fromPoint: { x: number; y: number },
  toPoint: { x: number; y: number },
  toleranceDeg = 4,
): { x: number; y: number } {
  const dx = toPoint.x - fromPoint.x
  const dy = toPoint.y - fromPoint.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1e-3) return toPoint

  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  const cardinals = [0, 45, 90, 135, 180, -45, -90, -135, -180]
  for (const card of cardinals) {
    if (Math.abs(deg - card) <= toleranceDeg) {
      const rad = (card * Math.PI) / 180
      return {
        x: fromPoint.x + Math.cos(rad) * dist,
        y: fromPoint.y + Math.sin(rad) * dist,
      }
    }
  }
  return toPoint
}
