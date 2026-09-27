import {
  getLineEndpoints as getEndpoints,
  resolveLineEndpointTransform,
  adjustLineThickness,
  projectPointToLineSegments,
  normalizePolylineLayer,
  convertTwoVerticesToLineLayer,
  snapAngleToCardinal,
} from '../src/features/component-library/component-line-geometry'
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

const transformedP2 = resolveLineEndpointTransform(initialP1, { x: 70, y: 90 }, geometry.height)
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

const transformedP1 = resolveLineEndpointTransform({ x: 30, y: 60 }, { x: 70, y: 90 }, geometry.height)
const endpointsAfterP1Drag = getEndpoints(transformedP1)

// P2 must remain strictly stationary
assert.ok(Math.abs(endpointsAfterP1Drag.p2.x - 70) < 1e-6, 'P2.x should not drift after dragging P1')
assert.ok(Math.abs(endpointsAfterP1Drag.p2.y - 90) < 1e-6, 'P2.y should not drift after dragging P1')
// P1 must reach the target position
assert.ok(Math.abs(endpointsAfterP1Drag.p1.x - 30) < 1e-6, 'P1.x should reach target')
assert.ok(Math.abs(endpointsAfterP1Drag.p1.y - 60) < 1e-6, 'P1.y should reach target')

// 4. Vertical Thickness Dragging
// Symmetrically changes strokeWidth and height without moving P1 or P2

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

const restoredTwoPoint = convertTwoVerticesToLineLayer(
  normalized,
  bentVertices[0],
  bentVertices[2],
)
assert.equal(restoredTwoPoint.points, undefined)
assert.equal(restoredTwoPoint.transform.width, 100)
assert.equal(restoredTwoPoint.transform.rotation, 0)

// 11. Cardinal Angle Snapping Math

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
