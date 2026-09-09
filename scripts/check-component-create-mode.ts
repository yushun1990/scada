import './check-component-layer-order'
import assert from 'node:assert/strict'
import {
  appendCreatedVectorLayer,
  resolveComponentCreateGeometry,
  type ComponentCreateTool,
} from '../src/features/component-library/component-create-mode'
import {
  COMPONENT_VISUAL_VERSION,
  type ComponentVisualDefinition,
} from '../src/component-system/visual'

const rectTool: ComponentCreateTool = {
  kind: 'vector',
  primitive: 'rect',
  label: '矩形',
  defaultWidth: 96,
  defaultHeight: 64,
}

const ellipseTool: ComponentCreateTool = {
  kind: 'vector',
  primitive: 'ellipse',
  label: '圆/椭圆',
  defaultWidth: 72,
  defaultHeight: 72,
}

const lineTool: ComponentCreateTool = {
  kind: 'vector',
  primitive: 'line',
  label: '线段',
  defaultWidth: 120,
  defaultHeight: 8,
}

const clickRect = resolveComponentCreateGeometry(
  rectTool,
  { x: 50, y: 50 },
  { x: 50, y: 50 },
  480,
  360,
)
assert.deepEqual(clickRect, {
  x: 2,
  y: 18,
  width: 96,
  height: 64,
  rotation: 0,
})

const edgeClick = resolveComponentCreateGeometry(
  rectTool,
  { x: 4, y: 4 },
  { x: 4, y: 4 },
  480,
  360,
)
assert.equal(edgeClick.x, 0)
assert.equal(edgeClick.y, 0)
assert.equal(edgeClick.width, 96)
assert.equal(edgeClick.height, 64)

const clickEllipse = resolveComponentCreateGeometry(
  ellipseTool,
  { x: 100, y: 100 },
  { x: 100, y: 100 },
  480,
  360,
)
assert.equal(clickEllipse.width, 72)
assert.equal(clickEllipse.height, 72)

const ellipse = resolveComponentCreateGeometry(
  ellipseTool,
  { x: 10, y: 20 },
  { x: 70, y: 50 },
  480,
  360,
)
assert.equal(ellipse.x, 10)
assert.equal(ellipse.y, 20)
assert.equal(ellipse.width, 60)
assert.equal(ellipse.height, 30)
assert.equal(ellipse.rotation, 0)

const constrainedCircle = resolveComponentCreateGeometry(
  ellipseTool,
  { x: 10, y: 20 },
  { x: 70, y: 50 },
  480,
  360,
  true,
)
assert.equal(constrainedCircle.x, 10)
assert.equal(constrainedCircle.y, 20)
assert.equal(constrainedCircle.width, 60)
assert.equal(constrainedCircle.height, 60)
assert.equal(constrainedCircle.rotation, 0)

const reverseConstrainedCircle = resolveComponentCreateGeometry(
  ellipseTool,
  { x: 100, y: 100 },
  { x: 60, y: 70 },
  480,
  360,
  true,
)
assert.equal(reverseConstrainedCircle.x, 60)
assert.equal(reverseConstrainedCircle.y, 60)
assert.equal(reverseConstrainedCircle.width, 40)
assert.equal(reverseConstrainedCircle.height, 40)

const line = resolveComponentCreateGeometry(
  lineTool,
  { x: 10, y: 10 },
  { x: 40, y: 50 },
  480,
  360,
)
assert.ok(Math.abs(line.width - 50) < 1e-9)
assert.ok(Math.abs(line.rotation - 53.13010235415598) < 1e-9)
assert.equal(line.height, 8)

const emptyVisual: ComponentVisualDefinition = {
  version: COMPONENT_VISUAL_VERSION,
  mode: 'composite',
  designSize: { width: 480, height: 360 },
  layers: [],
  animations: [],
}

const first = appendCreatedVectorLayer(emptyVisual, rectTool, clickRect)
assert.equal(first.layerId, 'vector1')
assert.equal(first.visual.layers.length, 1)
const firstLayer = first.visual.layers[0]
assert.equal(firstLayer?.kind, 'vector')
assert.equal(firstLayer?.name, '矩形 1')
if (firstLayer?.kind === 'vector') {
  assert.equal(firstLayer.primitive, 'rect')
  assert.deepEqual(firstLayer.transform, {
    ...clickRect,
    scaleX: 1,
    scaleY: 1,
  })
}

const second = appendCreatedVectorLayer(first.visual, ellipseTool, ellipse)
assert.equal(second.layerId, 'vector2')
assert.equal(second.visual.layers.length, 2)
const secondLayer = second.visual.layers[1]
assert.equal(secondLayer?.kind, 'vector')
if (secondLayer?.kind === 'vector') {
  assert.equal(secondLayer.primitive, 'ellipse')
}

const nativeVisual: ComponentVisualDefinition = {
  ...emptyVisual,
  mode: 'native',
}
const blocked = appendCreatedVectorLayer(nativeVisual, rectTool, clickRect)
assert.equal(blocked.layerId, null)
assert.equal(blocked.visual, nativeVisual)

console.log('component create-mode checks passed')
