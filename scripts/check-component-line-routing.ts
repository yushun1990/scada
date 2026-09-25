import assert from 'node:assert/strict'
import {
  calculateConnectedLinePoints,
  generateOrthogonalPoints,
  recomputeBoundLinesInVisual,
  resolveLayerAnchorPoint,
  type Point2D,
} from '../src/component-system/component-line-routing'
import {
  COMPONENT_VISUAL_VERSION,
  type ComponentVisualDefinition,
  type ComponentVisualLayer,
  type VectorVisualLayer,
} from '../src/component-system/visual'

console.log('--- Testing Component Line Routing & Geometry ---')

// 1. resolveLayerAnchorPoint
const mockBox: ComponentVisualLayer = {
  id: 'box1',
  name: 'Box 1',
  kind: 'vector',
  primitive: 'rect',
  transform: {
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  },
}

// Center anchor: cx = 100 + 100 = 200, cy = 100 + 50 = 150
assert.deepEqual(resolveLayerAnchorPoint(mockBox, 'center'), { x: 200, y: 150 })
// Top anchor: cx = 200, y = 100
assert.deepEqual(resolveLayerAnchorPoint(mockBox, 'top'), { x: 200, y: 100 })
// Bottom anchor: cx = 200, y = 200
assert.deepEqual(resolveLayerAnchorPoint(mockBox, 'bottom'), { x: 200, y: 200 })
// Left anchor: x = 100, cy = 150
assert.deepEqual(resolveLayerAnchorPoint(mockBox, 'left'), { x: 100, y: 150 })
// Right anchor: x = 300, cy = 150
assert.deepEqual(resolveLayerAnchorPoint(mockBox, 'right'), { x: 300, y: 150 })

// Auto anchor without otherPoint -> center
assert.deepEqual(resolveLayerAnchorPoint(mockBox, 'auto'), { x: 200, y: 150 })
// Auto anchor with otherPoint to the right (dx=200, dy=0) -> right edge
assert.deepEqual(resolveLayerAnchorPoint(mockBox, 'auto', { x: 400, y: 150 }), { x: 300, y: 150 })
// Auto anchor with otherPoint to the left (dx=-200, dy=0) -> left edge
assert.deepEqual(resolveLayerAnchorPoint(mockBox, 'auto', { x: 0, y: 150 }), { x: 100, y: 150 })
// Auto anchor with otherPoint below (dx=0, dy=200) -> bottom edge
assert.deepEqual(resolveLayerAnchorPoint(mockBox, 'auto', { x: 200, y: 350 }), { x: 200, y: 200 })
// Auto anchor with otherPoint above (dx=0, dy=-200) -> top edge
assert.deepEqual(resolveLayerAnchorPoint(mockBox, 'auto', { x: 200, y: -50 }), { x: 200, y: 100 })

// Rotation: 90 degrees around center (cx=200, cy=150)
const rotatedBox: ComponentVisualLayer = {
  ...mockBox,
  transform: {
    ...mockBox.transform,
    rotation: 90,
  },
}
// Unrotated right was (300, 150), dx = 100, dy = 0.
// Rotated 90 deg: x = cx - dy = 200, y = cy + dx = 250.
const rotatedRight = resolveLayerAnchorPoint(rotatedBox, 'right')
assert.equal(rotatedRight.x, 200)
assert.equal(rotatedRight.y, 250)

// Scaled box: scaleX = 1.5, scaleY = 2 (effective width = 300, effective height = 200)
// cx = 100 + 150 = 250, cy = 100 + 100 = 200
const scaledBox: ComponentVisualLayer = {
  ...mockBox,
  transform: {
    ...mockBox.transform,
    scaleX: 1.5,
    scaleY: 2,
  },
}
assert.deepEqual(resolveLayerAnchorPoint(scaledBox, 'center'), { x: 250, y: 200 })
assert.deepEqual(resolveLayerAnchorPoint(scaledBox, 'top'), { x: 250, y: 100 })
assert.deepEqual(resolveLayerAnchorPoint(scaledBox, 'bottom'), { x: 250, y: 300 })
assert.deepEqual(resolveLayerAnchorPoint(scaledBox, 'left'), { x: 100, y: 200 })
assert.deepEqual(resolveLayerAnchorPoint(scaledBox, 'right'), { x: 400, y: 200 })
assert.deepEqual(resolveLayerAnchorPoint(scaledBox, 'auto', { x: 600, y: 200 }), { x: 400, y: 200 })

console.log('✔ resolveLayerAnchorPoint tests passed')

// 2. generateOrthogonalPoints
const start: Point2D = { x: 0, y: 0 }
const endHorizontal: Point2D = { x: 100, y: 40 }
const endVertical: Point2D = { x: 40, y: 100 }
const collinear: Point2D = { x: 100, y: 0.5 }

// Collinear check (< 2px diff in y)
assert.deepEqual(
  generateOrthogonalPoints(start, collinear),
  [0, 0, 100, 0.5],
  'Collinear points should return straight line',
)

// Default horizontal-dominant (dx=100 > dy=40)
assert.deepEqual(
  generateOrthogonalPoints(start, endHorizontal),
  [0, 0, 50, 0, 50, 40, 100, 40],
  'Default horizontal routing splits along X',
)

// Default vertical-dominant (dy=100 > dx=40)
assert.deepEqual(
  generateOrthogonalPoints(start, endVertical),
  [0, 0, 0, 50, 40, 50, 40, 100],
  'Default vertical routing splits along Y',
)

// startAnchor = 'left' / 'right' enforces X split
assert.deepEqual(
  generateOrthogonalPoints(start, endVertical, 'right'),
  [0, 0, 20, 0, 20, 100, 40, 100],
  'startAnchor right enforces X split',
)

// startAnchor = 'top' / 'bottom' enforces Y split
assert.deepEqual(
  generateOrthogonalPoints(start, endHorizontal, 'bottom'),
  [0, 0, 0, 20, 100, 20, 100, 40],
  'startAnchor bottom enforces Y split',
)

// endAnchor = 'left' / 'right' enforces Y first segment
assert.deepEqual(
  generateOrthogonalPoints(start, endHorizontal, undefined, 'left'),
  [0, 0, 0, 20, 100, 20, 100, 40],
  'endAnchor left enforces Y split',
)

// endAnchor = 'top' / 'bottom' enforces X first segment
assert.deepEqual(
  generateOrthogonalPoints(start, endVertical, undefined, 'top'),
  [0, 0, 20, 0, 20, 100, 40, 100],
  'endAnchor top enforces X split',
)

console.log('✔ generateOrthogonalPoints tests passed')

// 3. calculateConnectedLinePoints
const targetA: ComponentVisualLayer = {
  id: 'nodeA',
  name: 'Node A',
  kind: 'vector',
  primitive: 'rect',
  transform: { x: 50, y: 50, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1 },
}

const targetB: ComponentVisualLayer = {
  id: 'nodeB',
  name: 'Node B',
  kind: 'vector',
  primitive: 'rect',
  transform: { x: 300, y: 50, width: 100, height: 100, rotation: 0, scaleX: 1, scaleY: 1 },
}

const layerMap = new Map<string, ComponentVisualLayer>([
  [targetA.id, targetA],
  [targetB.id, targetB],
])

const boundLineStraight: VectorVisualLayer = {
  id: 'line1',
  name: 'Line 1',
  kind: 'vector',
  primitive: 'line',
  transform: { x: 0, y: 0, width: 100, height: 10, rotation: 0, scaleX: 1, scaleY: 1 },
  startBinding: { layerId: 'nodeA', anchor: 'right' },
  endBinding: { layerId: 'nodeB', anchor: 'left' },
  routeMode: 'straight',
}

// targetA right is (150, 100), targetB left is (300, 100)
const straightPoints = calculateConnectedLinePoints(boundLineStraight, layerMap)
assert.deepEqual(straightPoints, [150, 100, 300, 100], 'Straight line connects A.right to B.left')

// Orthogonal route mode
const boundLineOrthogonal: VectorVisualLayer = {
  ...boundLineStraight,
  id: 'line2',
  routeMode: 'orthogonal',
}
// Both on y=100 (collinear horizontally) -> [150, 100, 300, 100]
const orthogonalCollinear = calculateConnectedLinePoints(boundLineOrthogonal, layerMap)
assert.deepEqual(orthogonalCollinear, [150, 100, 300, 100])

// If targetB moves down to y=200, targetB left is (300, 250)
const movedTargetB: ComponentVisualLayer = {
  ...targetB,
  transform: { ...targetB.transform, y: 200 },
}
const movedLayerMap = new Map<string, ComponentVisualLayer>([
  [targetA.id, targetA],
  [movedTargetB.id, movedTargetB],
])
// start: (150, 100), end: (300, 250), startAnchor='right'
// midX = 150 + (300-150)/2 = 225
const orthogonalBent = calculateConnectedLinePoints(boundLineOrthogonal, movedLayerMap)
assert.deepEqual(orthogonalBent, [150, 100, 225, 100, 225, 250, 300, 250])

console.log('✔ calculateConnectedLinePoints tests passed')

// 4. recomputeBoundLinesInVisual
const visual: ComponentVisualDefinition = {
  version: COMPONENT_VISUAL_VERSION,
  mode: 'composite',
  designSize: { width: 800, height: 600 },
  layers: [targetA, movedTargetB, boundLineOrthogonal],
  rules: [],
  animations: [],
}

const recomputed = recomputeBoundLinesInVisual(visual)
assert.notEqual(recomputed, visual, 'Visual should be updated when bound lines change')
const updatedLine = recomputed.layers.find((l) => l.id === 'line2') as VectorVisualLayer
assert.deepEqual(updatedLine.points, [150, 100, 225, 100, 225, 250, 300, 250])

// Idempotent check: recomputing without changes returns exact same visual reference
const idempotent = recomputeBoundLinesInVisual(recomputed)
assert.equal(idempotent, recomputed, 'Recomputing when unchanged must return identical reference')

console.log('✔ recomputeBoundLinesInVisual tests passed')
console.log('All Component Line Routing unit tests PASSED successfully!')
