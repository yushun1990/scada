import assert from 'node:assert/strict'
import {
  COMPONENT_VISUAL_VERSION,
  assertComponentVisualDefinition,
  type ComponentVisualDefinition,
  type VectorVisualLayer,
} from '../src/component-system/visual'
import {
  appendCreatedVectorLayer,
  resolveComponentCreateGeometry,
  type ComponentCreateTool,
} from '../src/features/component-library/component-create-mode'

console.log('--- Checking Line Layer Interaction & Geometry Math ---')

// 1. Verify line geometry resolution and endpoint reconstruction
const lineTool: ComponentCreateTool = {
  kind: 'vector',
  primitive: 'line',
  label: '直线',
  defaultWidth: 120,
  defaultHeight: 8,
}

const pStart = { x: 10, y: 10 }
const pEnd = { x: 40, y: 50 }

const geometry = resolveComponentCreateGeometry(
  lineTool,
  pStart,
  pEnd,
  480,
  360,
)

// Reconstruct endpoints from transform
function getEndpoints(transform: VectorVisualLayer['transform']) {
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

const { p1: initialP1, p2: initialP2 } = getEndpoints({
  ...geometry,
  scaleX: 1,
  scaleY: 1,
})

assert.ok(Math.abs(initialP1.x - 10) < 1e-6, `Expected p1.x=10, got ${initialP1.x}`)
assert.ok(Math.abs(initialP1.y - 10) < 1e-6, `Expected p1.y=10, got ${initialP1.y}`)
assert.ok(Math.abs(initialP2.x - 40) < 1e-6, `Expected p2.x=40, got ${initialP2.x}`)
assert.ok(Math.abs(initialP2.y - 50) < 1e-6, `Expected p2.y=50, got ${initialP2.y}`)

// 2. Dragging End Handle (P2)
// P1 must stay fixed at (10, 10). P2 moves to (70, 90).
function dragEndHandle(
  currentP1: { x: number; y: number },
  targetP2: { x: number; y: number },
  height: number,
) {
  const dx = targetP2.x - currentP1.x
  const dy = targetP2.y - currentP1.y
  const newWidth = Math.max(4, Math.hypot(dx, dy))
  const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
  const newRad = (newRotation * Math.PI) / 180
  const halfH = height / 2

  const newX = currentP1.x + Math.sin(newRad) * halfH
  const newY = currentP1.y - Math.cos(newRad) * halfH

  return {
    x: newX,
    y: newY,
    width: newWidth,
    height,
    rotation: newRotation,
    scaleX: 1,
    scaleY: 1,
  }
}

const transformedP2 = dragEndHandle(initialP1, { x: 70, y: 90 }, geometry.height)
const endpointsAfterP2Drag = getEndpoints(transformedP2)

// P1 must remain strictly stationary
assert.ok(Math.abs(endpointsAfterP2Drag.p1.x - 10) < 1e-6, 'P1.x should not drift after dragging P2')
assert.ok(Math.abs(endpointsAfterP2Drag.p1.y - 10) < 1e-6, 'P1.y should not drift after dragging P2')
// P2 must reach the target position
assert.ok(Math.abs(endpointsAfterP2Drag.p2.x - 70) < 1e-6, 'P2.x should reach target')
assert.ok(Math.abs(endpointsAfterP2Drag.p2.y - 90) < 1e-6, 'P2.y should reach target')
assert.ok(Math.abs(transformedP2.width - 100) < 1e-6, `Expected width=100, got ${transformedP2.width}`)

// 3. Dragging Start Handle (P1)
// P2 must stay fixed at (70, 90). P1 moves to (30, 60).
function dragStartHandle(
  targetP1: { x: number; y: number },
  currentP2: { x: number; y: number },
  height: number,
) {
  const dx = currentP2.x - targetP1.x
  const dy = currentP2.y - targetP1.y
  const newWidth = Math.max(4, Math.hypot(dx, dy))
  const newRotation = (Math.atan2(dy, dx) * 180) / Math.PI
  const newRad = (newRotation * Math.PI) / 180
  const halfH = height / 2

  const newX = targetP1.x + Math.sin(newRad) * halfH
  const newY = targetP1.y - Math.cos(newRad) * halfH

  return {
    x: newX,
    y: newY,
    width: newWidth,
    height,
    rotation: newRotation,
    scaleX: 1,
    scaleY: 1,
  }
}

const transformedP1 = dragStartHandle({ x: 30, y: 60 }, { x: 70, y: 90 }, geometry.height)
const endpointsAfterP1Drag = getEndpoints(transformedP1)

// P2 must remain strictly stationary
assert.ok(Math.abs(endpointsAfterP1Drag.p2.x - 70) < 1e-6, 'P2.x should not drift after dragging P1')
assert.ok(Math.abs(endpointsAfterP1Drag.p2.y - 90) < 1e-6, 'P2.y should not drift after dragging P1')
// P1 must reach the target position
assert.ok(Math.abs(endpointsAfterP1Drag.p1.x - 30) < 1e-6, 'P1.x should reach target')
assert.ok(Math.abs(endpointsAfterP1Drag.p1.y - 60) < 1e-6, 'P1.y should reach target')

// 4. Vertical Thickness Dragging
// Symmetrically changes strokeWidth and height without moving P1 or P2
function adjustLineThickness(
  currentP1: { x: number; y: number },
  transform: VectorVisualLayer['transform'],
  newStrokeWidth: number,
) {
  const nextHeight = Math.max(8, newStrokeWidth * 2)
  const rad = (transform.rotation * Math.PI) / 180
  const sin = Math.sin(rad)
  const cos = Math.cos(rad)

  const newX = currentP1.x + sin * (nextHeight / 2)
  const newY = currentP1.y - cos * (nextHeight / 2)

  return {
    ...transform,
    x: newX,
    y: newY,
    height: nextHeight,
  }
}

const thickened = adjustLineThickness(endpointsAfterP1Drag.p1, transformedP1, 16)
const endpointsAfterThickening = getEndpoints(thickened)

assert.ok(Math.abs(endpointsAfterThickening.p1.x - 30) < 1e-6, 'P1 should not move during vertical stretch')
assert.ok(Math.abs(endpointsAfterThickening.p1.y - 60) < 1e-6, 'P1 should not move during vertical stretch')
assert.ok(Math.abs(endpointsAfterThickening.p2.x - 70) < 1e-6, 'P2 should not move during vertical stretch')
assert.ok(Math.abs(endpointsAfterThickening.p2.y - 90) < 1e-6, 'P2 should not move during vertical stretch')
assert.equal(thickened.height, 32)

// 5. Create mode default style
const emptyVisual: ComponentVisualDefinition = {
  version: COMPONENT_VISUAL_VERSION,
  mode: 'composite',
  designSize: { width: 480, height: 360 },
  layers: [],
  animations: [],
}

const created = appendCreatedVectorLayer(emptyVisual, lineTool, geometry)
assert.equal(created.layerId, 'line_1')
const lineLayer = created.visual.layers[0] as VectorVisualLayer
assert.equal(lineLayer.kind, 'vector')
assert.equal(lineLayer.primitive, 'line')
assert.equal(lineLayer.style?.strokeWidth, 2)
assert.equal(lineLayer.style?.lineCap, 'round')
assert.equal(lineLayer.style?.startMarker, 'none')
assert.equal(lineLayer.style?.endMarker, 'none')
assert.equal(lineLayer.style?.dash, 'solid')

// 6. Style validation
const styledLineLayer: VectorVisualLayer = {
  ...lineLayer,
  style: {
    fill: 'transparent',
    stroke: '#3b82f6',
    strokeWidth: 4,
    lineCap: 'round',
    startMarker: 'arrow',
    endMarker: 'circle',
    dash: 'dashed',
  },
}

const validVisual: ComponentVisualDefinition = {
  ...emptyVisual,
  layers: [styledLineLayer],
}

assertComponentVisualDefinition(validVisual)

// Invalid marker should throw
assert.throws(() => {
  assertComponentVisualDefinition({
    ...emptyVisual,
    layers: [
      {
        ...styledLineLayer,
        style: {
          ...styledLineLayer.style,
          startMarker: 'invalid-marker' as any,
        },
      },
    ],
  })
}, /矢量样式无效/)

// Invalid lineCap should throw
assert.throws(() => {
  assertComponentVisualDefinition({
    ...emptyVisual,
    layers: [
      {
        ...styledLineLayer,
        style: {
          ...styledLineLayer.style,
          lineCap: 'invalid-cap' as any,
        },
      },
    ],
  })
}, /矢量样式无效/)

// 7. Polyline points validation
const polylineVisual: ComponentVisualDefinition = {
  ...emptyVisual,
  layers: [
    {
      ...styledLineLayer,
      id: 'polyline_1',
      points: [0, 0, 50, 20, 100, 0],
    },
  ],
}
assertComponentVisualDefinition(polylineVisual)

// Odd number of coordinates in points must throw
assert.throws(() => {
  assertComponentVisualDefinition({
    ...emptyVisual,
    layers: [
      {
        ...styledLineLayer,
        id: 'bad_points_1',
        points: [0, 0, 50],
      },
    ],
  })
}, /points 必须是偶数个有限数字数组/)

// Fewer than 4 coordinates in points must throw
assert.throws(() => {
  assertComponentVisualDefinition({
    ...emptyVisual,
    layers: [
      {
        ...styledLineLayer,
        id: 'bad_points_2',
        points: [0, 0],
      },
    ],
  })
}, /points 必须是偶数个有限数字数组/)

// Non-finite number in points must throw
assert.throws(() => {
  assertComponentVisualDefinition({
    ...emptyVisual,
    layers: [
      {
        ...styledLineLayer,
        id: 'bad_points_3',
        points: [0, 0, NaN, 20],
      },
    ],
  })
}, /points 必须是偶数个有限数字数组/)

// 8. Geometry: Projection to line segment and vertex insertion
function projectPointToLineSegments(
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

const segVertices = [
  { x: 10, y: 10 },
  { x: 110, y: 10 },
]

// Double click at (60, 14) -> should project onto (60, 10) with dist 4
const proj = projectPointToLineSegments(segVertices, { x: 60, y: 14 })
assert.ok(proj !== null)
assert.equal(proj.segmentIndex, 0)
assert.equal(proj.point.x, 60)
assert.equal(proj.point.y, 10)
assert.equal(proj.distance, 4)

// Insert vertex
const newVertices = [
  ...segVertices.slice(0, proj.segmentIndex + 1),
  proj.point,
  ...segVertices.slice(proj.segmentIndex + 1),
]
assert.equal(newVertices.length, 3)
assert.deepEqual(newVertices, [
  { x: 10, y: 10 },
  { x: 60, y: 10 },
  { x: 110, y: 10 },
])

// 9. Polyline normalization
function normalizePolylineLayer(
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

// Drag intermediate vertex to (60, 50)
const bentVertices = [
  { x: 10, y: 10 },
  { x: 60, y: 50 },
  { x: 110, y: 10 },
]
const normalized = normalizePolylineLayer(styledLineLayer, bentVertices)
assert.equal(normalized.transform.x, 10)
assert.equal(normalized.transform.y, 10)
assert.equal(normalized.transform.width, 100)
assert.equal(normalized.transform.height, 40)
assert.deepEqual(normalized.points, [0, 0, 50, 40, 100, 0])

// 10. Deleting intermediate vertex and converting back to 2-point line
function convertTwoVerticesToLineLayer(
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

const restoredTwoPoint = convertTwoVerticesToLineLayer(
  normalized,
  bentVertices[0],
  bentVertices[2],
)
assert.equal(restoredTwoPoint.points, undefined)
assert.equal(restoredTwoPoint.transform.width, 100)
assert.equal(restoredTwoPoint.transform.rotation, 0)

// 11. Cardinal Angle Snapping Math
function snapAngleToCardinal(
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

// 2 degrees from horizontal: should snap to exact horizontal y=10
const snappedH = snapAngleToCardinal({ x: 0, y: 10 }, { x: 100, y: 13.5 }, 4)
assert.ok(Math.abs(snappedH.y - 10) < 1e-6, 'Should snap to horizontal')

// 43 degrees: should snap to 45 degrees
const snapped45 = snapAngleToCardinal({ x: 0, y: 0 }, { x: 100, y: 93.25 }, 4)
const angle45 = (Math.atan2(snapped45.y, snapped45.x) * 180) / Math.PI
assert.ok(Math.abs(angle45 - 45) < 1e-6, 'Should snap to 45 degrees')

// 60 degrees: outside 4-degree tolerance, should remain unchanged
const unSnapped = snapAngleToCardinal({ x: 0, y: 0 }, { x: 50, y: 86.6 }, 4)
assert.equal(unSnapped.x, 50)
assert.equal(unSnapped.y, 86.6)

console.log('All line layer interaction, polyline geometry, and snap checks passed!')
