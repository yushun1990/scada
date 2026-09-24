import assert from 'node:assert/strict'

// 1. 测试 calculateOriginOffset
function calculateOriginOffset(origin = 'top-left', width, height) {
  let ox = 0
  let oy = 0

  if (origin.includes('center')) {
    if (origin === 'top-center' || origin === 'center' || origin === 'bottom-center') {
      ox = width / 2
    }
  }
  if (origin.includes('right')) {
    ox = width
  }
  if (origin.startsWith('center-') || origin === 'center') {
    oy = height / 2
  }
  if (origin.startsWith('bottom-')) {
    oy = height
  }

  return { offsetX: ox, offsetY: oy }
}

// 验证罐体自底向上拉伸锚点 (bottom-center)
const tankOffset = calculateOriginOffset('bottom-center', 100, 200)
assert.deepEqual(tankOffset, { offsetX: 50, offsetY: 200 }, 'bottom-center 锚点必须为底部中心 (w/2, h)')

const centerOffset = calculateOriginOffset('center', 100, 200)
assert.deepEqual(centerOffset, { offsetX: 50, offsetY: 100 }, 'center 锚点必须为中心 (w/2, h/2)')

const topLeftOffset = calculateOriginOffset('top-left', 100, 200)
assert.deepEqual(topLeftOffset, { offsetX: 0, offsetY: 0 }, 'top-left 锚点必须为 (0, 0)')

console.log('✔ calculateOriginOffset 锚点计算测试通过')

// 2. 测试 resolveLayerAnchorPoint
function resolveLayerAnchorPoint(layer, anchor, otherPoint) {
  const { x, y, width, height, rotation } = layer.transform
  const cx = x + width / 2
  const cy = y + height / 2

  let rawX = cx
  let rawY = cy

  switch (anchor) {
    case 'auto':
      if (otherPoint) {
        const dx = otherPoint.x - cx
        const dy = otherPoint.y - cy
        if (Math.abs(dx) >= Math.abs(dy)) {
          rawX = dx >= 0 ? x + width : x
          rawY = cy
        } else {
          rawX = cx
          rawY = dy >= 0 ? y + height : y
        }
      } else {
        rawX = cx
        rawY = cy
      }
      break
    case 'center':
      rawX = cx
      rawY = cy
      break
    case 'top':
      rawX = cx
      rawY = y
      break
    case 'bottom':
      rawX = cx
      rawY = y + height
      break
    case 'left':
      rawX = x
      rawY = cy
      break
    case 'right':
      rawX = x + width
      rawY = cy
      break
  }

  if (!rotation) {
    return { x: Math.round(rawX), y: Math.round(rawY) }
  }

  const rad = (rotation * Math.PI) / 180
  const dx = rawX - cx
  const dy = rawY - cy
  const rotatedX = cx + dx * Math.cos(rad) - dy * Math.sin(rad)
  const rotatedY = cy + dx * Math.sin(rad) + dy * Math.cos(rad)

  return {
    x: Math.round(rotatedX),
    y: Math.round(rotatedY),
  }
}

const tankLayer = {
  id: 'tank_1',
  name: '罐体',
  transform: { x: 100, y: 100, width: 80, height: 160, rotation: 0, scaleX: 1, scaleY: 1 },
}
const valveLayer = {
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
function generateOrthogonalPoints(start, end, startAnchor, endAnchor) {
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (Math.abs(dx) < 2 || Math.abs(dy) < 2) {
    return [start.x, start.y, end.x, end.y]
  }

  if (startAnchor === 'left' || startAnchor === 'right') {
    const midX = start.x + dx / 2
    return [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y]
  }

  if (startAnchor === 'top' || startAnchor === 'bottom') {
    const midY = start.y + dy / 2
    return [start.x, start.y, start.x, midY, end.x, midY, end.x, end.y]
  }

  if (endAnchor === 'left' || endAnchor === 'right') {
    const midY = start.y + dy / 2
    return [start.x, start.y, start.x, midY, end.x, midY, end.x, end.y]
  }

  if (endAnchor === 'top' || endAnchor === 'bottom') {
    const midX = start.x + dx / 2
    return [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y]
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = start.x + dx / 2
    return [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y]
  } else {
    const midY = start.y + dy / 2
    return [start.x, start.y, start.x, midY, end.x, midY, end.x, end.y]
  }
}

const pStart = { x: 180, y: 180 }
const pEnd = { x: 300, y: 160 }
const orthoPoints = generateOrthogonalPoints(pStart, pEnd, 'right', 'left')
// [180, 180, 240, 180, 240, 160, 300, 160] (3 段式工业正交管线)
assert.deepEqual(orthoPoints, [180, 180, 240, 180, 240, 160, 300, 160])

console.log('✔ generateOrthogonalPoints 正交路由算法测试通过')

// 4. 测试图元移动时连线的动态联动与拉伸 (橡皮筋机制)
function calculateConnectedLinePoints(lineLayer, layerMap) {
  let startPoint
  let endPoint

  const startBinding = lineLayer.startBinding
  const endBinding = lineLayer.endBinding

  const startTarget = startBinding ? layerMap.get(startBinding.layerId) : undefined
  const endTarget = endBinding ? layerMap.get(endBinding.layerId) : undefined

  const fallbackStartX = lineLayer.points && lineLayer.points.length >= 4
    ? lineLayer.points[0]
    : lineLayer.transform.x
  const fallbackStartY = lineLayer.points && lineLayer.points.length >= 4
    ? lineLayer.points[1]
    : lineLayer.transform.y + lineLayer.transform.height / 2
  const fallbackEndX = lineLayer.points && lineLayer.points.length >= 4
    ? lineLayer.points[lineLayer.points.length - 2]
    : lineLayer.transform.x + lineLayer.transform.width
  const fallbackEndY = lineLayer.points && lineLayer.points.length >= 4
    ? lineLayer.points[lineLayer.points.length - 1]
    : lineLayer.transform.y + lineLayer.transform.height / 2

  const roughEndCenter = endTarget
    ? { x: endTarget.transform.x + endTarget.transform.width / 2, y: endTarget.transform.y + endTarget.transform.height / 2 }
    : { x: fallbackEndX, y: fallbackEndY }

  if (startTarget) {
    startPoint = resolveLayerAnchorPoint(startTarget, startBinding.anchor, roughEndCenter)
  } else {
    startPoint = { x: fallbackStartX, y: fallbackStartY }
  }

  if (endTarget) {
    endPoint = resolveLayerAnchorPoint(endTarget, endBinding.anchor, startPoint)
  } else {
    endPoint = { x: fallbackEndX, y: fallbackEndY }
  }

  if (lineLayer.routeMode === 'orthogonal') {
    return generateOrthogonalPoints(
      startPoint,
      endPoint,
      startBinding?.anchor,
      endBinding?.anchor,
    )
  }

  return [startPoint.x, startPoint.y, endPoint.x, endPoint.y]
}

function recomputeBoundLinesInVisual(visual) {
  const layerMap = new Map(visual.layers.map((l) => [l.id, l]))
  let hasChanges = false

  const nextLayers = visual.layers.map((layer) => {
    if (layer.kind !== 'vector' || layer.primitive !== 'line') {
      return layer
    }

    if (!layer.startBinding && !layer.endBinding) {
      return layer
    }

    const updatedPoints = calculateConnectedLinePoints(layer, layerMap)
    const currentPoints = layer.points ?? []

    const isSame =
      currentPoints.length === updatedPoints.length &&
      currentPoints.every((val, idx) => Math.abs(val - updatedPoints[idx]) < 0.1)

    if (isSame) {
      return layer
    }

    hasChanges = true
    return {
      ...layer,
      points: updatedPoints,
    }
  })

  return hasChanges ? { ...visual, layers: nextLayers } : visual
}

const pipeLineLayer = {
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

const visualDef = {
  mode: 'composite',
  designSize: { width: 800, height: 600 },
  layers: [tankLayer, valveLayer, pipeLineLayer],
}

// 首次重算连接
const visual1 = recomputeBoundLinesInVisual(visualDef)
const line1 = visual1.layers.find((l) => l.id === 'pipe_1')
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

// 起点随罐体右侧移动到 (150+80, 120+80) = (230, 200)
// 终点仍为 (300, 160)
// 中间折点 midX = 230 + (300-230)/2 = 265
assert.deepEqual(line2.points, [230, 200, 265, 200, 265, 160, 300, 160])
console.log('✔ recomputeBoundLinesInVisual 移动图元管线智能拉伸测试通过：', line2.points)

// 4. 测试 resolveVisualLineDashArray 动态虚线稀疏计算
function resolveVisualLineDashArray(dash, strokeWidth = 1, lineCap = 'round') {
  if (!dash || dash === 'solid') {
    return undefined
  }

  const effectiveWidth = Math.max(1, strokeWidth)
  const isCapExtending = lineCap === 'round' || lineCap === 'square'

  if (dash === 'dashed') {
    const dashLength = Math.max(8, effectiveWidth * 2.5)
    const visibleGap = Math.max(6, effectiveWidth * 1.8)
    const gapLength = isCapExtending ? visibleGap + effectiveWidth : visibleGap

    return [Number(dashLength.toFixed(1)), Number(gapLength.toFixed(1))]
  }

  if (dash === 'dotted') {
    if (isCapExtending) {
      const visibleGap = Math.max(5, effectiveWidth * 1.2)
      const gapLength = visibleGap + effectiveWidth
      return [0.1, Number(gapLength.toFixed(1))]
    }

    const dashLength = Math.max(2, effectiveWidth * 0.8)
    const gapLength = Math.max(5, effectiveWidth * 1.8)
    return [Number(dashLength.toFixed(1)), Number(gapLength.toFixed(1))]
  }

  return undefined
}

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

// 5. 测试内凹圆角矩形 (Concave Inverted Corner Rectangle)
function computeConcaveRectKeypoints(width, height, cornerRadius) {
  const isConcave = cornerRadius < 0
  const r = isConcave
    ? Math.min(Math.abs(cornerRadius), Math.min(width, height) / 2)
    : 0

  if (!isConcave || r <= 0) return null

  return {
    start: [r, 0],
    topEdge: [width - r, 0],
    topRightArcEnd: [width, r],
    rightEdge: [width, height - r],
    bottomRightArcEnd: [width - r, height],
    bottomEdge: [r, height],
    bottomLeftArcEnd: [0, height - r],
    leftEdge: [0, r],
    topLeftArcEnd: [r, 0],
    r,
  }
}

const concave = computeConcaveRectKeypoints(100, 60, -15)
assert.ok(concave, '负数圆角应成功解析为内凹矩形关键点')
assert.deepEqual(concave.start, [15, 0])
assert.deepEqual(concave.topEdge, [85, 0])
assert.deepEqual(concave.topRightArcEnd, [100, 15])
assert.deepEqual(concave.rightEdge, [100, 45])
assert.deepEqual(concave.bottomRightArcEnd, [85, 60])
assert.deepEqual(concave.bottomEdge, [15, 60])
assert.deepEqual(concave.bottomLeftArcEnd, [0, 45])
assert.deepEqual(concave.leftEdge, [0, 15])
assert.deepEqual(concave.topLeftArcEnd, [15, 0])
// 闭合点严格与起始点吻合
assert.deepEqual(concave.topLeftArcEnd, concave.start)

// 超限约束截断测试
const clampedConcave = computeConcaveRectKeypoints(100, 60, -50)
assert.equal(clampedConcave.r, 30, '内凹半径不应超过短边的一半 (60/2 = 30)')

console.log('✔ 内凹圆角矩形 (Concave Inverted Corner) 几何闭合与半径约束测试通过')

// 6. 测试刻度标尺图元 (Scale Primitive) 自适应拉伸与分度算法
function computeScaleTicks({
  height,
  scaleMode = 'auto',
  tickSpacing = 24,
  divisions = 5,
  subDivisions = 2,
  tickLength = 12,
  subTickLength = 6,
  tickPlacement = 'right',
  width = 28,
}) {
  const majorDivisions = scaleMode === 'auto'
    ? Math.max(1, Math.round(height / Math.max(8, tickSpacing)))
    : Math.max(1, divisions)

  const axisX = tickPlacement === 'right' ? 0 : tickPlacement === 'left' ? width : width / 2
  const majorTicks = []
  const subTicks = []

  for (let i = 0; i <= majorDivisions; i++) {
    const y = (height / majorDivisions) * i
    let x1 = axisX
    let x2 = axisX
    if (tickPlacement === 'right') {
      x2 = axisX + tickLength
    } else if (tickPlacement === 'left') {
      x2 = axisX - tickLength
    } else {
      x1 = axisX - tickLength / 2
      x2 = axisX + tickLength / 2
    }
    majorTicks.push({ y, x1, x2 })

    if (subDivisions > 1 && i < majorDivisions) {
      const stepY = height / majorDivisions
      for (let s = 1; s < subDivisions; s++) {
        const subY = y + (stepY / subDivisions) * s
        let sx1 = axisX
        let sx2 = axisX
        if (tickPlacement === 'right') {
          sx2 = axisX + subTickLength
        } else if (tickPlacement === 'left') {
          sx2 = axisX - subTickLength
        } else {
          sx1 = axisX - subTickLength / 2
          sx2 = axisX + subTickLength / 2
        }
        subTicks.push({ y: subY, x1: sx1, x2: sx2 })
      }
    }
  }

  return { majorDivisions, majorTicks, subTicks, axisX }
}

// 6.1 自适应拉伸测试：高度增加自动增加刻度
const scale120 = computeScaleTicks({ height: 120, scaleMode: 'auto', tickSpacing: 24, subDivisions: 2 })
assert.equal(scale120.majorDivisions, 5, '高度 120 / 间距 24 => 5 段主分度')
assert.equal(scale120.majorTicks.length, 6, '5 段主分度包含 6 条主刻度线 (0 到 5)')
assert.equal(scale120.subTicks.length, 5, '5 个主区间各 1 条副刻度线 => 5 条副刻度线')

// 拖拽拉伸到 240 高度
const scale240 = computeScaleTicks({ height: 240, scaleMode: 'auto', tickSpacing: 24, subDivisions: 2 })
assert.equal(scale240.majorDivisions, 10, '高度拉伸到 240 时，主刻度段数自动扩展为 10')
assert.equal(scale240.majorTicks.length, 11, '主刻度线数量自适应增加到 11 条')
assert.equal(scale240.subTicks.length, 10, '副刻度线自适应增加到 10 条')

// 压缩到 48 高度
const scale48 = computeScaleTicks({ height: 48, scaleMode: 'auto', tickSpacing: 24, subDivisions: 2 })
assert.equal(scale48.majorDivisions, 2, '高度压缩到 48 时，主刻度段数自动减少为 2')
assert.equal(scale48.majorTicks.length, 3, '主刻度线自适应减少为 3 条')

// 6.2 固定分度模式测试：拉伸时不改变分度数
const fixedScale120 = computeScaleTicks({ height: 120, scaleMode: 'fixed', divisions: 4 })
const fixedScale360 = computeScaleTicks({ height: 360, scaleMode: 'fixed', divisions: 4 })
assert.equal(fixedScale120.majorDivisions, 4)
assert.equal(fixedScale360.majorDivisions, 4, '固定分度模式下拉伸高度保持 4 分度')

// 6.3 刻度朝向测试 (right, left, both)
const scaleRight = computeScaleTicks({ height: 100, tickPlacement: 'right', tickLength: 10 })
assert.equal(scaleRight.axisX, 0)
assert.equal(scaleRight.majorTicks[0].x2, 10, '向右朝向刻度伸出 x = 10')

const scaleLeft = computeScaleTicks({ height: 100, width: 30, tickPlacement: 'left', tickLength: 10 })
assert.equal(scaleLeft.axisX, 30)
assert.equal(scaleLeft.majorTicks[0].x2, 20, '向左朝向刻度向左伸出 x = 20')

const scaleBoth = computeScaleTicks({ height: 100, width: 30, tickPlacement: 'both', tickLength: 10 })
assert.equal(scaleBoth.axisX, 15)
assert.equal(scaleBoth.majorTicks[0].x1, 10)
assert.equal(scaleBoth.majorTicks[0].x2, 20, '居中双向刻度左右对称伸出')

// 6.4 刻度数字标注测试：无需设定最大值，根据初始值与最小刻度单位值自增
function computeScaleLabels({
  majorDivisions,
  labelStart = 0,
  minTickValue = 1,
  subDivisions = 2,
  labelDirection = 'bottomUp',
}) {
  const majorStepValue = minTickValue * subDivisions
  const labels = []
  for (let i = 0; i <= majorDivisions; i++) {
    const stepIndex = labelDirection === 'bottomUp'
      ? (majorDivisions - i)
      : i
    labels.push(labelStart + stepIndex * majorStepValue)
  }
  return labels
}

// 自底向上 (bottomUp)：底部 i=majorDivisions 为初始值 0，每格增量 10
const labelsBottomUp = computeScaleLabels({ majorDivisions: 5, labelStart: 0, minTickValue: 5, subDivisions: 2, labelDirection: 'bottomUp' })
assert.deepEqual(labelsBottomUp, [50, 40, 30, 20, 10, 0], '自底向上：底部刻度为0，向上依次递增至50')

// 拉伸高度导致 majorDivisions 从 5 自动增至 8：底部依然为 0，顶部自然向上延伸至 80
const labelsStretched = computeScaleLabels({ majorDivisions: 8, labelStart: 0, minTickValue: 5, subDivisions: 2, labelDirection: 'bottomUp' })
assert.deepEqual(labelsStretched, [80, 70, 60, 50, 40, 30, 20, 10, 0], '拉伸高度时底部起始值保持不变，顶部自动新增更多递增数字')

// 自顶向下 (topDown)：顶部 i=0 为初始值 100，向下每格增量 2
const labelsTopDown = computeScaleLabels({ majorDivisions: 3, labelStart: 100, minTickValue: 1, subDivisions: 2, labelDirection: 'topDown' })
assert.deepEqual(labelsTopDown, [100, 102, 104, 106], '自顶向下：顶部为100，向下依次递增')

console.log('✔ 刻度标尺 (Scale Primitive) 自适应拉伸增减刻度与分度朝向计算测试通过')
console.log('✔ 刻度标尺无需最大值、基于初始值与最小刻度单位值(offset)动态标注测试通过')

console.log('\nAll SCADA Visual & Line Routing Verification Checks PASSED!')
