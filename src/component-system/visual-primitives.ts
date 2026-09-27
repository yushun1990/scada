import type { VectorVisualLayer, VisualAnchorOrigin, VisualVectorStyle } from './visual'

export function calculateOriginOffset(
  origin: VisualAnchorOrigin = 'top-left',
  width: number,
  height: number,
): { offsetX: number; offsetY: number } {
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

export function resolveConcaveRectRadius(width: number, height: number, cornerRadius: number) {
  return cornerRadius < 0 ? Math.min(Math.abs(cornerRadius), Math.min(width, height) / 2) : 0
}

type PathContext = Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'lineTo' | 'arc' | 'closePath'>
type LabelContext = Pick<CanvasRenderingContext2D, 'save' | 'restore' | 'fillText' | 'font' | 'fillStyle' | 'textAlign' | 'textBaseline'>

export function traceConcaveRect(context: PathContext, width: number, height: number, r: number) {
  context.beginPath()
  context.moveTo(r, 0)
  context.lineTo(width - r, 0)
  context.arc(width, 0, r, Math.PI, Math.PI / 2, true)
  context.lineTo(width, height - r)
  context.arc(width, height, r, Math.PI * 1.5, Math.PI, true)
  context.lineTo(r, height)
  context.arc(0, height, r, Math.PI * 2, Math.PI * 1.5, true)
  context.lineTo(0, r)
  context.arc(0, 0, r, Math.PI * 0.5, 0, true)
  context.closePath()
}

// The renderer and deterministic checks consume this same drawing algorithm.
// The sink contains only the Canvas operations used by these two primitives.
export function drawVisualScale(
  context: Pick<PathContext, 'beginPath' | 'moveTo' | 'lineTo'>,
  labelContext: LabelContext,
  layer: VectorVisualLayer,
  style: VisualVectorStyle,
  strokePath: () => void,
) {
  const { width, height } = layer.transform
  const stroke = style.stroke || undefined
  const scaleMode = layer.scaleMode ?? 'auto'
  const tickSpacing = Math.max(8, layer.tickSpacing ?? 24)
  const divisions = Math.max(1, layer.divisions ?? 5)

  // 自动步长模式：根据当前高度实时计算主分度数，拉伸时自动增加/减少刻度线！
  const majorDivisions = scaleMode === 'auto'
    ? Math.max(1, Math.round(height / tickSpacing))
    : divisions

  const subDivs = Math.max(1, layer.subDivisions ?? 2)
  const totalIntervals = majorDivisions * subDivs
  const tickPlacement = layer.tickPlacement ?? 'right'
  const showAxis = layer.showAxis !== false
  const strokeWidth = style.strokeWidth || 1

  const maxTickLength = Math.min(width, Math.max(4, layer.tickLength ?? Math.min(width * 0.75, 12)))
  const minTickLength = Math.min(maxTickLength, Math.max(2, layer.subTickLength ?? maxTickLength * 0.55))

  const showLabels = layer.showLabels === true
  const labelStart = layer.labelStart ?? 0
  const minTickValue = Math.max(0.0001, layer.minTickValue ?? 1)
  const labelDirection = layer.labelDirection ?? 'bottomUp'
  const labelFontSize = layer.labelFontSize ?? 10
  const labelFontFamily = layer.labelFontFamily ?? 'sans-serif'
  const labelColor = layer.labelColor || stroke || '#64748b'
  const labelDecimals = Math.max(0, Math.round(layer.labelDecimals ?? 0))
  // 每个主刻度的数值增量（offset）：最小格数值 × 主刻度副分度数
  const majorStepValue = minTickValue * subDivs

  context.beginPath()

  let axisX = 0
  let majorStart = 0
  let majorEnd = 0
  let minorStart = 0
  let minorEnd = 0

  if (tickPlacement === 'right') {
    axisX = strokeWidth / 2
    majorStart = axisX
    majorEnd = axisX + maxTickLength
    minorStart = axisX
    minorEnd = axisX + minTickLength
  } else if (tickPlacement === 'left') {
    axisX = width - strokeWidth / 2
    majorStart = axisX
    majorEnd = axisX - maxTickLength
    minorStart = axisX
    minorEnd = axisX - minTickLength
  } else {
    axisX = width / 2
    majorStart = axisX - maxTickLength / 2
    majorEnd = axisX + maxTickLength / 2
    minorStart = axisX - minTickLength / 2
    minorEnd = axisX + minTickLength / 2
  }

  if (showAxis) {
    context.moveTo(axisX, 0)
    context.lineTo(axisX, height)
  }

  for (let i = 0; i <= totalIntervals; i++) {
    const y = (i / totalIntervals) * height
    const isMajor = i % subDivs === 0
    const x1 = isMajor ? majorStart : minorStart
    const x2 = isMajor ? majorEnd : minorEnd
    context.moveTo(x1, y)
    context.lineTo(x2, y)
  }

  strokePath()

  // 在 sceneFunc 中绘制数字标注（根据初始值 labelStart、最小格单位值 minTickValue 及方向自增，无需固定最大值）
  if (showLabels) {
    const ctx = labelContext
    ctx.save()
    ctx.font = `${labelFontSize}px ${labelFontFamily}`
    ctx.fillStyle = labelColor
    const labelPad = 4

    for (let i = 0; i <= majorDivisions; i++) {
      const y = (i / majorDivisions) * height
      // bottomUp 时：底部 i=majorDivisions 为起始点，向上递增；topDown 时：顶部 i=0 为起始点，向下递增
      const stepIndex = labelDirection === 'bottomUp'
        ? (majorDivisions - i)
        : i
      const value = labelStart + stepIndex * majorStepValue
      const text = value.toFixed(labelDecimals)

      if (tickPlacement === 'right') {
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, majorEnd + labelPad, y)
      } else if (tickPlacement === 'left') {
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, majorEnd - labelPad, y)
      } else {
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, majorEnd + labelPad, y)
      }
    }
    ctx.restore()
  }
}
