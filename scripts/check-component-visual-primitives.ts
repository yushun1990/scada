import { calculateOriginOffset, resolveConcaveRectRadius, traceConcaveRect, drawVisualScale } from '../src/component-system/visual-primitives'
import { resolveLayerAnchorPoint, generateOrthogonalPoints, calculateConnectedLinePoints, recomputeBoundLinesInVisual } from '../src/component-system/component-line-routing'
import { COMPONENT_VISUAL_VERSION, resolveVisualLineDashArray, resolveVisualVectorStyle, type VectorVisualLayer, type ComponentVisualDefinition } from '../src/component-system/visual'
import assert from 'node:assert/strict'

// 1. 测试 calculateOriginOffset

// 验证罐体自底向上拉伸锚点 (bottom-center)
const tankOffset = calculateOriginOffset('bottom-center', 100, 200)
assert.deepEqual(tankOffset, { offsetX: 50, offsetY: 200 }, 'bottom-center 锚点必须为底部中心 (w/2, h)')

const centerOffset = calculateOriginOffset('center', 100, 200)
assert.deepEqual(centerOffset, { offsetX: 50, offsetY: 100 }, 'center 锚点必须为中心 (w/2, h/2)')

const topLeftOffset = calculateOriginOffset('top-left', 100, 200)
assert.deepEqual(topLeftOffset, { offsetX: 0, offsetY: 0 }, 'top-left 锚点必须为 (0, 0)')

console.log('✔ calculateOriginOffset 锚点计算测试通过')

// 2. 测试 resolveLayerAnchorPoint

const tankLayer: VectorVisualLayer = {
  kind: 'vector', primitive: 'rect', parentId: null, visible: true, opacity: 1,
  id: 'tank_1',
  name: '罐体',
  transform: { x: 100, y: 100, width: 80, height: 160, rotation: 0, scaleX: 1, scaleY: 1 },
}
const valveLayer: VectorVisualLayer = {
  kind: 'vector', primitive: 'rect', parentId: null, visible: true, opacity: 1,
  id: 'valve_1',
  name: '阀门',
  transform: { x: 300, y: 140, width: 40, height: 40, rotation: 0, scaleX: 1, scaleY: 1 },
}

// 固定方位测试
assert.deepEqual(resolveLayerAnchorPoint(tankLayer, 'right'), { x: 180, y: 180 })
assert.deepEqual(resolveLayerAnchorPoint(tankLayer, 'left'), { x: 100, y: 180 })
assert.deepEqual(resolveLayerAnchorPoint(tankLayer, 'top'), { x: 140, y: 100 })
assert.deepEqual(resolveLayerAnchorPoint(tankLayer, 'bottom'), { x: 140, y: 260 })

// 智能 auto 锚位测试：valve 在 tank 右侧，tank 应自动吸附右侧，valve 自动吸附左侧
const valveCenter = { x: 320, y: 160 }
const autoTankAnchor = resolveLayerAnchorPoint(tankLayer, 'auto', valveCenter)
assert.deepEqual(autoTankAnchor, { x: 180, y: 180 }, 'tank 应该自动吸附到右边缘')

const autoValveAnchor = resolveLayerAnchorPoint(valveLayer, 'auto', autoTankAnchor)
assert.deepEqual(autoValveAnchor, { x: 300, y: 160 }, 'valve 应该自动吸附到左边缘')

console.log('✔ resolveLayerAnchorPoint 锚点解析测试通过')

// 3. 测试正交折线生成 generateOrthogonalPoints

const pStart = { x: 180, y: 180 }
const pEnd = { x: 300, y: 160 }
const orthoPoints = generateOrthogonalPoints(pStart, pEnd, 'right', 'left')
// [180, 180, 240, 180, 240, 160, 300, 160] (3 段式工业正交管线)
assert.deepEqual(orthoPoints, [180, 180, 240, 180, 240, 160, 300, 160])

console.log('✔ generateOrthogonalPoints 正交路由算法测试通过')

// 4. 测试图元移动时连线的动态联动与拉伸 (橡皮筋机制)

const pipeLineLayer: VectorVisualLayer = {
  parentId: null, visible: true, opacity: 1,
  id: 'pipe_1',
  name: '物料管线',
  kind: 'vector',
  primitive: 'line',
  transform: { x: 0, y: 0, width: 120, height: 24, rotation: 0, scaleX: 1, scaleY: 1 },
  routeMode: 'orthogonal',
  flowAnimated: true,
  startBinding: { layerId: 'tank_1', anchor: 'right' },
  endBinding: { layerId: 'valve_1', anchor: 'left' },
}

const visualDef: ComponentVisualDefinition = {
  version: COMPONENT_VISUAL_VERSION, animations: [],
  mode: 'composite',
  designSize: { width: 800, height: 600 },
  layers: [tankLayer, valveLayer, pipeLineLayer],
}

// 首次重算连接
const visual1 = recomputeBoundLinesInVisual(visualDef)
const line1 = visual1.layers.find((l) => l.id === 'pipe_1')
assert.ok(line1?.kind === 'vector')
assert.deepEqual(line1.points, [180, 180, 240, 180, 240, 160, 300, 160])

// 模拟用户拖拽罐体向右移动 50px，向下移动 20px
const movedTankLayer = {
  ...tankLayer,
  transform: { ...tankLayer.transform, x: 150, y: 120 },
}
const visual2 = recomputeBoundLinesInVisual({
  ...visual1,
  layers: [movedTankLayer, valveLayer, line1],
})
const line2 = visual2.layers.find((l) => l.id === 'pipe_1')
assert.ok(line2?.kind === 'vector')

// 起点随罐体右侧移动到 (150+80, 120+80) = (230, 200)
// 终点仍为 (300, 160)
// 中间折点 midX = 230 + (300-230)/2 = 265
assert.deepEqual(line2.points, [230, 200, 265, 200, 265, 160, 300, 160])
console.log('✔ recomputeBoundLinesInVisual 移动图元管线智能拉伸测试通过：', line2.points)

// 4. 测试 resolveVisualLineDashArray 动态虚线稀疏计算

assert.equal(resolveVisualLineDashArray('solid', 10), undefined, 'solid 应返回 undefined')

// 细线 (strokeWidth = 2)
const thinDash = resolveVisualLineDashArray('dashed', 2, 'round')
assert.deepEqual(thinDash, [8, 8], '细线虚线计算')
// 物理净留白 = 8 - 2 = 6px > 0，不粘连

// 粗线 (strokeWidth = 10)
const thickDash = resolveVisualLineDashArray('dashed', 10, 'round')
assert.deepEqual(thickDash, [25, 28], '大线宽虚线应自动成比例稀疏')
// 物理净留白 = 28 - 10 = 18px > 0，绝不挤压粘连为实线！
assert.ok(thickDash[1] > 10, '粗线 gapLength 必须大于 strokeWidth 以保证留白')

// 超粗线 (strokeWidth = 30)
const extraThickDash = resolveVisualLineDashArray('dashed', 30, 'round')
assert.deepEqual(extraThickDash, [75, 84], '超粗线虚线稀疏')
assert.ok(extraThickDash[1] - 30 >= 54, '超粗线净留白保证 54px')

// 点线测试 (strokeWidth = 8, round)
const dotted = resolveVisualLineDashArray('dotted', 8, 'round')
assert.deepEqual(dotted, [0.1, 17.6], '圆头点线生成 0.1 长度')
assert.ok(dotted[1] - 8 >= 9.6, '点线圆点间物理留白充足')

console.log('✔ resolveVisualLineDashArray 动态虚线稀疏与线帽延伸补偿测试通过')

assert.strictEqual(recomputeBoundLinesInVisual(visual2), visual2, 'unchanged lines preserve identity')
assert.deepEqual(calculateConnectedLinePoints({
  ...pipeLineLayer, startBinding: undefined, endBinding: undefined, points: [10, 20, 90, 20],
}, new Map()), [10, 20, 90, 20], 'missing bindings use explicit fallback endpoints')
assert.deepEqual(resolveLayerAnchorPoint({
  ...tankLayer, transform: { ...tankLayer.transform, rotation: 90 },
}, 'right'), { x: 140, y: 220 })

// Record production drawing operations, without reconstructing its geometry.
function drawingRecorder() {
  const calls: unknown[][] = []
  return {
    calls,
    context: {
      beginPath: () => calls.push(['begin']),
      moveTo: (x: number, y: number) => calls.push(['move', x, y]),
      lineTo: (x: number, y: number) => calls.push(['line', x, y]),
      arc: (...args: Parameters<CanvasRenderingContext2D['arc']>) => calls.push(['arc', ...args]),
      closePath: () => calls.push(['close']),
    },
    labels: {
      font: '', fillStyle: '', textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'middle' as CanvasTextBaseline,
      save: () => calls.push(['save']),
      restore: () => calls.push(['restore']),
      fillText: (text: string, x: number, y: number) => calls.push(['text', text, x, y]),
    },
    stroke: () => calls.push(['stroke']),
  }
}

const concave = drawingRecorder()
traceConcaveRect(concave.context, 100, 60, resolveConcaveRectRadius(100, 60, -15))
assert.deepEqual(concave.calls, [
  ['begin'], ['move', 15, 0], ['line', 85, 0],
  ['arc', 100, 0, 15, Math.PI, Math.PI / 2, true],
  ['line', 100, 45], ['arc', 100, 60, 15, Math.PI * 1.5, Math.PI, true],
  ['line', 15, 60], ['arc', 0, 60, 15, Math.PI * 2, Math.PI * 1.5, true],
  ['line', 0, 15], ['arc', 0, 0, 15, Math.PI * 0.5, 0, true], ['close'],
])
assert.equal(resolveConcaveRectRadius(100, 60, -50), 30)
assert.equal(resolveConcaveRectRadius(100, 60, 15), 0)
assert.equal(resolveConcaveRectRadius(100, 60, 0), 0)

function scaleDrawing(height: number, overrides: Partial<VectorVisualLayer> = {}) {
  const layer: VectorVisualLayer = {
    ...tankLayer, primitive: 'scale',
    transform: { ...tankLayer.transform, width: 30, height },
    tickLength: 10, subTickLength: 5, showLabels: true, minTickValue: 5,
    style: { fill: 'transparent', stroke: '#64748b', strokeWidth: 2 },
    ...overrides,
  }
  const recorder = drawingRecorder()
  drawVisualScale(recorder.context, recorder.labels, layer, resolveVisualVectorStyle(layer), recorder.stroke)
  return recorder
}

const scale120 = scaleDrawing(120)
const texts = (calls: unknown[][]) => calls.filter(([kind]) => kind === 'text').map(([, text]) => text)
assert.deepEqual(texts(scale120.calls), ['50', '40', '30', '20', '10', '0'])
assert.deepEqual(scale120.calls.slice(0, 7), [
  ['begin'], ['move', 1, 0], ['line', 1, 120],
  ['move', 1, 0], ['line', 11, 0], ['move', 1, 12], ['line', 6, 12],
], 'right axis includes the actual stroke-width inset')
assert.equal(scale120.calls.filter(([kind]) => kind === 'line').length, 12)
assert.deepEqual(texts(scaleDrawing(240).calls), ['100', '90', '80', '70', '60', '50', '40', '30', '20', '10', '0'])
assert.deepEqual(texts(scaleDrawing(48).calls), ['20', '10', '0'])
for (const height of [120, 360]) {
  assert.deepEqual(texts(scaleDrawing(height, { scaleMode: 'fixed', divisions: 4 }).calls), ['40', '30', '20', '10', '0'])
}
assert.deepEqual(scaleDrawing(120, { tickPlacement: 'left' }).calls.slice(1, 5), [
  ['move', 29, 0], ['line', 29, 120], ['move', 29, 0], ['line', 19, 0],
])
assert.deepEqual(scaleDrawing(120, { tickPlacement: 'both' }).calls.slice(1, 5), [
  ['move', 15, 0], ['line', 15, 120], ['move', 10, 0], ['line', 20, 0],
])
assert.deepEqual(texts(scaleDrawing(72, { labelDirection: 'topDown', labelStart: 100, minTickValue: 1 }).calls), ['100', '102', '104', '106'])
const hidden = scaleDrawing(120, { showAxis: false, showLabels: false })
assert.equal(hidden.calls.filter(([kind]) => kind === 'line').length, 11)
assert.deepEqual(texts(hidden.calls), [])
assert.equal(scale120.calls.filter(([kind]) => kind === 'stroke').length, 1)
assert.equal(scale120.calls.at(-1)?.[0], 'restore')
console.log('Component visual primitives passed: production origin/routing/dash/concave/scale drawing and labels.')
