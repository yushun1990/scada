import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  VectorVisualLayer,
  VisualLineBindingAnchor,
} from './visual'

export type Point2D = {
  x: number
  y: number
}

/**
 * 根据图层的变换与指定锚位解析端点的绝对局部坐标
 */
export function resolveLayerAnchorPoint(
  layer: ComponentVisualLayer,
  anchor: VisualLineBindingAnchor,
  otherPoint?: Point2D,
): Point2D {
  const { x, y, width, height, rotation } = layer.transform
  const scaleX = layer.transform.scaleX ?? 1
  const scaleY = layer.transform.scaleY ?? 1
  const effectiveWidth = width * scaleX
  const effectiveHeight = height * scaleY
  const cx = x + effectiveWidth / 2
  const cy = y + effectiveHeight / 2

  let rawX = cx
  let rawY = cy

  switch (anchor) {
    case 'auto':
      if (otherPoint) {
        const dx = otherPoint.x - cx
        const dy = otherPoint.y - cy
        if (Math.abs(dx) >= Math.abs(dy)) {
          rawX = dx >= 0 ? x + effectiveWidth : x
          rawY = cy
        } else {
          rawX = cx
          rawY = dy >= 0 ? y + effectiveHeight : y
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
      rawY = y + effectiveHeight
      break
    case 'left':
      rawX = x
      rawY = cy
      break
    case 'right':
      rawX = x + effectiveWidth
      rawY = cy
      break
  }

  if (!rotation) {
    return { x: Math.round(rawX), y: Math.round(rawY) }
  }

  // 若带旋转角度，围绕中心点进行 2D 旋转变换
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

/**
 * 生成两点间的工业正交折线折点
 */
export function generateOrthogonalPoints(
  start: Point2D,
  end: Point2D,
  startAnchor?: VisualLineBindingAnchor,
  endAnchor?: VisualLineBindingAnchor,
): number[] {
  const dx = end.x - start.x
  const dy = end.y - start.y

  // 如果几乎共线，直接返回两点
  if (Math.abs(dx) < 2 || Math.abs(dy) < 2) {
    return [start.x, start.y, end.x, end.y]
  }

  // 根据起点锚位决定首段折线方向
  if (startAnchor === 'left' || startAnchor === 'right') {
    const midX = start.x + dx / 2
    return [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y]
  }

  if (startAnchor === 'top' || startAnchor === 'bottom') {
    const midY = start.y + dy / 2
    return [start.x, start.y, start.x, midY, end.x, midY, end.x, end.y]
  }

  // 根据终点锚位决定折线方向
  if (endAnchor === 'left' || endAnchor === 'right') {
    const midY = start.y + dy / 2
    return [start.x, start.y, start.x, midY, end.x, midY, end.x, end.y]
  }

  if (endAnchor === 'top' || endAnchor === 'bottom') {
    const midX = start.x + dx / 2
    return [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y]
  }

  // 默认根据长轴优先进行折线
  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = start.x + dx / 2
    return [start.x, start.y, midX, start.y, midX, end.y, end.x, end.y]
  } else {
    const midY = start.y + dy / 2
    return [start.x, start.y, start.x, midY, end.x, midY, end.x, end.y]
  }
}

/**
 * 实时计算线段图层的最新 points 坐标
 */
export function calculateConnectedLinePoints(
  lineLayer: VectorVisualLayer,
  layerMap: ReadonlyMap<string, ComponentVisualLayer>,
): number[] {
  let startPoint: Point2D
  let endPoint: Point2D

  const startBinding = lineLayer.startBinding
  const endBinding = lineLayer.endBinding

  const startTarget = startBinding ? layerMap.get(startBinding.layerId) : undefined
  const endTarget = endBinding ? layerMap.get(endBinding.layerId) : undefined

  const fallbackStartX = lineLayer.points && lineLayer.points.length >= 4
    ? lineLayer.points[0]
    : lineLayer.transform.x
  const fallbackStartY = lineLayer.points && lineLayer.points.length >= 4
    ? lineLayer.points[1]
    : lineLayer.transform.y + (lineLayer.transform.height * (lineLayer.transform.scaleY ?? 1)) / 2
  const fallbackEndX = lineLayer.points && lineLayer.points.length >= 4
    ? lineLayer.points[lineLayer.points.length - 2]
    : lineLayer.transform.x + lineLayer.transform.width * (lineLayer.transform.scaleX ?? 1)
  const fallbackEndY = lineLayer.points && lineLayer.points.length >= 4
    ? lineLayer.points[lineLayer.points.length - 1]
    : lineLayer.transform.y + (lineLayer.transform.height * (lineLayer.transform.scaleY ?? 1)) / 2

  const roughEndCenter = endTarget
    ? {
        x: endTarget.transform.x + (endTarget.transform.width * (endTarget.transform.scaleX ?? 1)) / 2,
        y: endTarget.transform.y + (endTarget.transform.height * (endTarget.transform.scaleY ?? 1)) / 2,
      }
    : { x: fallbackEndX, y: fallbackEndY }

  // 计算起点
  if (startTarget) {
    startPoint = resolveLayerAnchorPoint(startTarget, startBinding!.anchor, roughEndCenter)
  } else {
    startPoint = { x: fallbackStartX, y: fallbackStartY }
  }

  // 计算终点
  if (endTarget) {
    endPoint = resolveLayerAnchorPoint(endTarget, endBinding!.anchor, startPoint)
  } else {
    endPoint = { x: fallbackEndX, y: fallbackEndY }
  }

  // 若设置了正交折线路由
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

/**
 * 当画布上的某个或某些图层位置改变时，自动重算与其相连的所有线段图层
 */
export function recomputeBoundLinesInVisual(
  visual: ComponentVisualDefinition,
): ComponentVisualDefinition {
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
