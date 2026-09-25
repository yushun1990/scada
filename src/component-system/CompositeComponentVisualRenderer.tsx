import { forwardRef, useEffect, useMemo, useState } from 'react'
import type Konva from 'konva'
import {
  Arc,
  Circle,
  Ellipse,
  Group,
  Image as KonvaImage,
  Line,
  Path,
  Rect,
  RegularPolygon,
  Shape,
  Text,
} from 'react-konva'
import { serializeManagedSvgCanvasDataUrl } from './managedSvg'
import {
  resolveVisualAssetStyle,
  resolveVisualLineDashArray,
  resolveVisualTextStyle,
  resolveVisualVectorStyle,
  type ComponentVisualDefinition,
  type ComponentVisualLayer,
  type ImageVisualLayer,
  type SvgVisualLayer,
  type TextVisualLayer,
  type VectorVisualLayer,
  type VisualAnchorOrigin,
  type VisualShadow,
  type VisualVectorStyle,
} from './visual'

export { resolveVisualLineDashArray }

export const COMPOSITE_VISUAL_LAYER_NODE_NAME = 'component-visual-layer'
const COMPOSITE_VISUAL_LAYER_NODE_PREFIX = 'component-visual-layer::'

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

export function resolveKonvaFill(style: VisualVectorStyle, width: number, height: number) {
  if (style.gradient && style.gradient.stops && style.gradient.stops.length > 0) {
    const { type, angle = 90, stops } = style.gradient
    const colorStops = stops.flatMap((s) => [s.offset, s.color])

    if (type === 'linear') {
      const rad = (angle * Math.PI) / 180
      const cx = width / 2
      const cy = height / 2
      const length = Math.hypot(width, height) / 2
      const dx = Math.cos(rad) * length
      const dy = Math.sin(rad) * length

      return {
        fillLinearGradientStartPoint: { x: cx - dx, y: cy - dy },
        fillLinearGradientEndPoint: { x: cx + dx, y: cy + dy },
        fillLinearGradientColorStops: colorStops,
        fillPriority: 'linear-gradient' as const,
      }
    }

    if (type === 'radial') {
      const cx = width / 2
      const cy = height / 2
      const radius = Math.max(1, Math.min(width, height) / 2)

      return {
        fillRadialGradientStartPoint: { x: cx, y: cy },
        fillRadialGradientStartRadius: 0,
        fillRadialGradientEndPoint: { x: cx, y: cy },
        fillRadialGradientEndRadius: radius,
        fillRadialGradientColorStops: colorStops,
        fillPriority: 'radial-gradient' as const,
      }
    }
  }

  return {
    fill: style.fill || undefined,
    fillPriority: 'color' as const,
  }
}

export function resolveKonvaShadow(shadow?: VisualShadow) {
  if (!shadow || (shadow.blur <= 0 && shadow.offsetX === 0 && shadow.offsetY === 0)) {
    return {}
  }

  return {
    shadowColor: shadow.color,
    shadowBlur: shadow.blur,
    shadowOffset: { x: shadow.offsetX, y: shadow.offsetY },
    shadowOpacity: shadow.opacity ?? 1,
    shadowEnabled: true,
    shadowForStrokeEnabled: true,
  }
}

export function compositeVisualLayerNodeId(layerId: string) {
  return `${COMPOSITE_VISUAL_LAYER_NODE_PREFIX}${layerId}`
}

export function getCompositeVisualLayerId(target: Konva.Node, scope: 'closest' | 'outermost' = 'closest') {
  let current: Konva.Node | null = target
  let layerId: string | null = null

  while (current) {
    const id = current.id()

    if (
      current.hasName(COMPOSITE_VISUAL_LAYER_NODE_NAME) &&
      id.startsWith(COMPOSITE_VISUAL_LAYER_NODE_PREFIX)
    ) {
      layerId = id.slice(COMPOSITE_VISUAL_LAYER_NODE_PREFIX.length)
      if (scope === 'closest') return layerId
    }

    current = current.getParent()
  }

  return layerId
}

export type CompositeComponentVisualRendererProps = {
  visual: ComponentVisualDefinition
  x: number
  y: number
  width: number
  height: number
  rotation: number
  visible: boolean
  opacity: number
  listening: boolean
  // Supplying this prop opts internal layers into editor dragging. A null value
  // means no layer currently owns the full-bounds drag hit area yet.
  draggableLayerId?: string | null
  dragEnabled?: boolean
  nonScalingStrokes?: boolean
}

type VisualLayerNodeProps = {
  layer: ComponentVisualLayer
  childrenByParent: ReadonlyMap<string | null, readonly ComponentVisualLayer[]>
  listening: boolean
  dragEnabled: boolean
  draggableLayerId: string | null
  nonScalingStrokes: boolean
}

function useVisualAsset(assetRef: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!assetRef.trim()) {
      setImage(null)
      return
    }

    const nextImage = new window.Image()

    const handleLoad = () => setImage(nextImage)
    const handleError = () => setImage(null)

    nextImage.addEventListener('load', handleLoad)
    nextImage.addEventListener('error', handleError)
    nextImage.src = assetRef

    return () => {
      nextImage.removeEventListener('load', handleLoad)
      nextImage.removeEventListener('error', handleError)
    }
  }, [assetRef])

  return image
}

function VisualAssetLayer({
  layer,
  listening,
}: {
  layer: SvgVisualLayer | ImageVisualLayer
  listening: boolean
}) {
  const assetRef = useMemo(() => {
    if (layer.kind === 'svg') {
      if (layer.document) {
        return serializeManagedSvgCanvasDataUrl(layer.document)
      }
      if (layer.assetRef.startsWith('data:image/svg+xml')) {
        try {
          const commaIndex = layer.assetRef.indexOf(',')
          if (commaIndex > 0) {
            const header = layer.assetRef.slice(0, commaIndex)
            const rawSvg = decodeURIComponent(layer.assetRef.slice(commaIndex + 1))
            const rootMatch = rawSvg.match(/<svg\b([^>]*)>/i)
            if (rootMatch) {
              const attrs = rootMatch[1]
              const vbMatch = attrs.match(/\bviewBox=["']([^"']+)["']/i)
              const wMatch = attrs.match(/\bwidth=["']([^"']+)["']/i)
              const hMatch = attrs.match(/\bheight=["']([^"']+)["']/i)
              let w = 0
              let h = 0
              if (vbMatch) {
                const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number)
                if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
                  w = parts[2]
                  h = parts[3]
                }
              }
              if (w <= 0 || h <= 0) {
                w = parseFloat(wMatch?.[1] || '') || 0
                h = parseFloat(hMatch?.[1] || '') || 0
              }
              if (w > 0 && h > 0) {
                const maxDim = Math.max(w, h)
                const scale = Math.min(8, Math.max(2, Math.ceil(2048 / maxDim)))
                const targetW = Math.round(w * scale)
                const targetH = Math.round(h * scale)
                let enhancedRoot = rootMatch[0]
                if (vbMatch) {
                  enhancedRoot = enhancedRoot.replace(/\bwidth=["'][^"']*["']/i, `width="${targetW}"`)
                  enhancedRoot = enhancedRoot.replace(/\bheight=["'][^"']*["']/i, `height="${targetH}"`)
                } else {
                  enhancedRoot = enhancedRoot.replace('<svg', `<svg viewBox="0 0 ${w} ${h}"`)
                  enhancedRoot = enhancedRoot.replace(/\bwidth=["'][^"']*["']/i, `width="${targetW}"`)
                  enhancedRoot = enhancedRoot.replace(/\bheight=["'][^"']*["']/i, `height="${targetH}"`)
                }
                const enhancedSvg = rawSvg.replace(rootMatch[0], enhancedRoot)
                return `${header},${encodeURIComponent(enhancedSvg)}`
              }
            }
          }
        } catch {
          // Fallback to raw assetRef
        }
      }
    }
    return layer.assetRef
  }, [layer])
  const image = useVisualAsset(assetRef)

  if (!image) {
    return null
  }

  const { width, height } = layer.transform
  const style = resolveVisualAssetStyle(layer)
  const imageWidth = Math.max(1, image.naturalWidth || image.width)
  const imageHeight = Math.max(1, image.naturalHeight || image.height)

  if (style.fit === 'contain') {
    const scale = Math.min(width / imageWidth, height / imageHeight)
    const drawWidth = imageWidth * scale
    const drawHeight = imageHeight * scale

    return (
      <KonvaImage
        image={image}
        x={(width - drawWidth) / 2}
        y={(height - drawHeight) / 2}
        width={drawWidth}
        height={drawHeight}
        listening={listening}
        perfectDrawEnabled={false}
      />
    )
  }

  if (style.fit === 'cover') {
    const imageRatio = imageWidth / imageHeight
    const targetRatio = width / height
    let cropX = 0
    let cropY = 0
    let cropWidth = imageWidth
    let cropHeight = imageHeight

    if (imageRatio > targetRatio) {
      cropWidth = imageHeight * targetRatio
      cropX = (imageWidth - cropWidth) / 2
    } else {
      cropHeight = imageWidth / targetRatio
      cropY = (imageHeight - cropHeight) / 2
    }

    return (
      <KonvaImage
        image={image}
        width={width}
        height={height}
        cropX={cropX}
        cropY={cropY}
        cropWidth={cropWidth}
        cropHeight={cropHeight}
        listening={listening}
        perfectDrawEnabled={false}
      />
    )
  }

  return (
    <KonvaImage
      image={image}
      width={width}
      height={height}
      listening={listening}
      perfectDrawEnabled={false}
    />
  )
}

function VisualVectorLayer({
  layer,
  listening,
  nonScalingStroke,
}: {
  layer: VectorVisualLayer
  listening: boolean
  nonScalingStroke: boolean
}) {
  const { width, height } = layer.transform
  const style = resolveVisualVectorStyle(layer)
  const stroke = style.stroke || undefined
  const fillProps = resolveKonvaFill(style, width, height)
  const shadowProps = resolveKonvaShadow(style.shadow)
  const dash = resolveVisualLineDashArray(style.dash, style.strokeWidth, style.lineCap)

  if (layer.primitive === 'rect') {
    const cornerRadius = style.cornerRadius ?? 0
    const isConcave = cornerRadius < 0
    const r = isConcave
      ? Math.min(Math.abs(cornerRadius), Math.min(width, height) / 2)
      : 0

    return (
      <Rect
        width={width}
        height={height}
        {...fillProps}
        stroke={stroke}
        strokeWidth={style.strokeWidth}
        strokeScaleEnabled={!nonScalingStroke}
        lineCap={style.lineCap}
        cornerRadius={isConcave ? 0 : cornerRadius}
        dash={dash}
        {...shadowProps}
        listening={listening}
        perfectDrawEnabled={false}
        sceneFunc={
          isConcave && r > 0
            ? (context, shape) => {
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
                context.fillStrokeShape(shape)
              }
            : undefined
        }
      />
    )
  }

  if (layer.primitive === 'circle') {
    const radius = Math.min(width, height) / 2
    return (
      <Circle
        x={width / 2}
        y={height / 2}
        radius={radius}
        {...fillProps}
        stroke={stroke}
        strokeWidth={style.strokeWidth}
        strokeScaleEnabled={!nonScalingStroke}
        lineCap={style.lineCap}
        dash={dash}
        {...shadowProps}
        listening={listening}
        perfectDrawEnabled={false}
      />
    )
  }

  if (layer.primitive === 'ellipse') {
    return (
      <Ellipse
        x={width / 2}
        y={height / 2}
        radiusX={width / 2}
        radiusY={height / 2}
        {...fillProps}
        stroke={stroke}
        strokeWidth={style.strokeWidth}
        strokeScaleEnabled={!nonScalingStroke}
        lineCap={style.lineCap}
        dash={dash}
        {...shadowProps}
        listening={listening}
        perfectDrawEnabled={false}
      />
    )
  }

  if (layer.primitive === 'polygon') {
    const radius = Math.min(width, height) / 2
    const sides = layer.sides ?? 3

    return (
      <RegularPolygon
        x={width / 2}
        y={height / 2}
        sides={sides}
        radius={radius}
        {...fillProps}
        stroke={stroke}
        strokeWidth={style.strokeWidth}
        strokeScaleEnabled={!nonScalingStroke}
        lineCap={style.lineCap}
        dash={dash}
        {...shadowProps}
        listening={listening}
        perfectDrawEnabled={false}
      />
    )
  }

  if (layer.primitive === 'arc') {
    const outerRadius = Math.min(width, height) / 2
    const innerRadius = outerRadius * (layer.innerRadiusRatio ?? 0)
    const angle = layer.angle ?? 270

    return (
      <Arc
        x={width / 2}
        y={height / 2}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        angle={angle}
        {...fillProps}
        stroke={stroke}
        strokeWidth={style.strokeWidth}
        strokeScaleEnabled={!nonScalingStroke}
        lineCap={style.lineCap}
        dash={dash}
        {...shadowProps}
        listening={listening}
        perfectDrawEnabled={false}
      />
    )
  }

  if (layer.primitive === 'scale') {
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

    return (
      <Shape
        sceneFunc={(context, shape) => {
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

          context.fillStrokeShape(shape)

          // 在 sceneFunc 中绘制数字标注（根据初始值 labelStart、最小格单位值 minTickValue 及方向自增，无需固定最大值）
          if (showLabels) {
            const ctx = context._context as CanvasRenderingContext2D
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
        }}
        hitFunc={(context, shape) => {
          context.beginPath()
          context.rect(0, 0, width, height)
          context.closePath()
          context.fillStrokeShape(shape)
        }}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeScaleEnabled={!nonScalingStroke}
        lineCap={style.lineCap ?? 'butt'}
        {...shadowProps}
        listening={listening}
        perfectDrawEnabled={false}
      />
    )
  }

  if (layer.primitive === 'line') {
    const strokeWidth = style.strokeWidth
    const lineCap = style.lineCap ?? 'round'
    const lineDash = resolveVisualLineDashArray(style.dash, strokeWidth, lineCap)
    const arrowLength = Math.max(8, strokeWidth * 3.2)
    const arrowWidth = Math.max(6, strokeWidth * 2.4)
    const markerRadius = Math.max(2.5, strokeWidth * 1.4)
    const hitTolerance = Math.max(strokeWidth, 24)

    const hasPoints = Boolean(layer.points && layer.points.length >= 4)
    const linePoints: readonly number[] = hasPoints
      ? (layer.points as readonly number[])
      : [0, height / 2, width, height / 2]

    const p0 = { x: linePoints[0], y: linePoints[1] }
    const p1 = { x: linePoints[2], y: linePoints[3] }
    const pn2 = { x: linePoints[linePoints.length - 4], y: linePoints[linePoints.length - 3] }
    const pn1 = { x: linePoints[linePoints.length - 2], y: linePoints[linePoints.length - 1] }

    const startRot = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI
    const endRot = (Math.atan2(pn2.y - pn1.y, pn2.x - pn1.x) * 180) / Math.PI

    return (
      <Group listening={listening}>
        <Line
          points={[...linePoints]}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineCap={lineCap}
          lineJoin="round"
          dash={lineDash}
          strokeScaleEnabled={!nonScalingStroke}
          {...shadowProps}
          listening={listening}
          hitStrokeWidth={hitTolerance}
          perfectDrawEnabled={false}
        />
        {style.startMarker && style.startMarker !== 'none' && (
          <Group x={p0.x} y={p0.y} rotation={startRot}>
            {style.startMarker === 'arrow' && (
              <Line
                points={[
                  0,
                  0,
                  arrowLength,
                  -arrowWidth / 2,
                  arrowLength * 0.8,
                  0,
                  arrowLength,
                  arrowWidth / 2,
                ]}
                fill={stroke}
                stroke={stroke}
                strokeWidth={Math.max(1, strokeWidth * 0.3)}
                closed
                {...shadowProps}
                listening={listening}
                perfectDrawEnabled={false}
              />
            )}
            {style.startMarker === 'circle' && (
              <Circle
                x={0}
                y={0}
                radius={markerRadius}
                fill={stroke}
                {...shadowProps}
                listening={listening}
                perfectDrawEnabled={false}
              />
            )}
            {style.startMarker === 'square' && (
              <Rect
                x={-markerRadius}
                y={-markerRadius}
                width={markerRadius * 2}
                height={markerRadius * 2}
                fill={stroke}
                {...shadowProps}
                listening={listening}
                perfectDrawEnabled={false}
              />
            )}
          </Group>
        )}
        {style.endMarker && style.endMarker !== 'none' && (
          <Group x={pn1.x} y={pn1.y} rotation={endRot}>
            {style.endMarker === 'arrow' && (
              <Line
                points={[
                  0,
                  0,
                  arrowLength,
                  -arrowWidth / 2,
                  arrowLength * 0.8,
                  0,
                  arrowLength,
                  arrowWidth / 2,
                ]}
                fill={stroke}
                stroke={stroke}
                strokeWidth={Math.max(1, strokeWidth * 0.3)}
                closed
                {...shadowProps}
                listening={listening}
                perfectDrawEnabled={false}
              />
            )}
            {style.endMarker === 'circle' && (
              <Circle
                x={0}
                y={0}
                radius={markerRadius}
                fill={stroke}
                {...shadowProps}
                listening={listening}
                perfectDrawEnabled={false}
              />
            )}
            {style.endMarker === 'square' && (
              <Rect
                x={-markerRadius}
                y={-markerRadius}
                width={markerRadius * 2}
                height={markerRadius * 2}
                fill={stroke}
                {...shadowProps}
                listening={listening}
                perfectDrawEnabled={false}
              />
            )}
          </Group>
        )}
      </Group>
    )
  }

  return (
    <Path
      data={layer.pathData ?? ''}
      {...fillProps}
      stroke={stroke}
      strokeWidth={style.strokeWidth}
      strokeScaleEnabled={!nonScalingStroke}
      lineCap={style.lineCap}
      dash={dash}
      {...shadowProps}
      listening={listening}
      perfectDrawEnabled={false}
    />
  )
}

function VisualTextLayer({
  layer,
  listening,
}: {
  layer: TextVisualLayer
  listening: boolean
}) {
  const { width, height } = layer.transform
  const style = resolveVisualTextStyle(layer)
  const shadowProps = resolveKonvaShadow(style.shadow)
  const hasBackground = Boolean(style.backgroundColor && style.backgroundColor !== 'transparent')
  const hasBorder = Boolean(
    style.borderVisible &&
    style.borderWidth !== undefined &&
    style.borderWidth > 0 &&
    style.borderColor &&
    style.borderColor !== 'transparent',
  )

  if (!hasBackground && !hasBorder) {
    return (
      <Text
        width={width}
        height={height}
        text={layer.text}
        fill={style.fill || undefined}
        fontFamily={style.fontFamily}
        fontSize={style.fontSize}
        fontStyle={style.fontStyle}
        align={style.align}
        verticalAlign={style.verticalAlign}
        lineHeight={style.lineHeight}
        {...shadowProps}
        listening={listening}
        perfectDrawEnabled={false}
      />
    )
  }

  return (
    <Group width={width} height={height} listening={listening}>
      <Rect
        width={width}
        height={height}
        fill={hasBackground ? style.backgroundColor : undefined}
        stroke={hasBorder ? style.borderColor : undefined}
        strokeWidth={hasBorder ? style.borderWidth : 0}
        {...shadowProps}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Text
        width={width}
        height={height}
        text={layer.text}
        fill={style.fill || undefined}
        fontFamily={style.fontFamily}
        fontSize={style.fontSize}
        fontStyle={style.fontStyle}
        align={style.align}
        verticalAlign={style.verticalAlign}
        lineHeight={style.lineHeight}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}

function LayerBoundsHitArea({
  width,
  height,
  listening,
}: {
  width: number
  height: number
  listening: boolean
}) {
  const effectiveHeight = Math.max(height, 24)
  const yOffset = (height - effectiveHeight) / 2

  return (
    <Rect
      y={yOffset}
      width={width}
      height={effectiveHeight}
      fill="#000"
      listening={listening}
      perfectDrawEnabled={false}
      sceneFunc={() => {}}
      hitFunc={(context, shape) => {
        context.beginPath()
        context.rect(0, yOffset, width, effectiveHeight)
        context.closePath()
        context.fillStrokeShape(shape)
      }}
    />
  )
}

function VisualLayerNode({
  layer,
  childrenByParent,
  listening,
  dragEnabled,
  draggableLayerId,
  nonScalingStrokes,
}: VisualLayerNodeProps) {
  const { transform } = layer
  const children = childrenByParent.get(layer.id) ?? []
  // A grouped layer remains configurable through the tree, but its geometry
  // belongs to the group until the author explicitly ungroups it.
  const draggable = listening && dragEnabled && layer.parentId === null
  const ownsFullBoundsDragHitArea = draggableLayerId === layer.id
  // An empty group draws no pixels of its own; keep it selectable on canvas
  // through its bounds while filled layers stay hit-precise to their shapes.
  const ownsEmptyGroupBoundsHitArea = listening && dragEnabled && layer.kind === 'group' && children.length === 0

  const { offsetX, offsetY } = calculateOriginOffset(
    layer.origin,
    transform.width,
    transform.height,
  )

  return (
    <Group
      id={compositeVisualLayerNodeId(layer.id)}
      name={COMPOSITE_VISUAL_LAYER_NODE_NAME}
      x={transform.x + offsetX}
      y={transform.y + offsetY}
      offsetX={offsetX}
      offsetY={offsetY}
      width={transform.width}
      height={transform.height}
      rotation={transform.rotation}
      scaleX={transform.scaleX}
      scaleY={transform.scaleY}
      visible={layer.visible}
      opacity={layer.opacity}
      listening={listening}
      draggable={draggable}
    >
      {ownsEmptyGroupBoundsHitArea && (
        <LayerBoundsHitArea
          width={transform.width}
          height={transform.height}
          listening={listening}
        />
      )}
      {(layer.kind === 'svg' || layer.kind === 'image') && (
        <VisualAssetLayer layer={layer} listening={listening} />
      )}
      {layer.kind === 'vector' && (
        <VisualVectorLayer
          layer={layer}
          listening={listening}
          nonScalingStroke={nonScalingStrokes}
        />
      )}
      {layer.kind === 'text' && (
        <VisualTextLayer layer={layer} listening={listening} />
      )}
      {children.map((child) => (
        <VisualLayerNode
          key={child.id}
          layer={child}
          childrenByParent={childrenByParent}
          listening={listening}
          dragEnabled={dragEnabled}
          draggableLayerId={draggableLayerId}
          nonScalingStrokes={nonScalingStrokes}
        />
      ))}
      {ownsFullBoundsDragHitArea && (
        <LayerBoundsHitArea
          width={transform.width}
          height={transform.height}
          listening={listening}
        />
      )}
    </Group>
  )
}

export const CompositeComponentVisualRenderer = forwardRef<
  Konva.Group,
  CompositeComponentVisualRendererProps
>(function CompositeComponentVisualRendererImpl(
  {
    visual,
    x,
    y,
    width,
    height,
    rotation,
    visible,
    opacity,
    listening,
    draggableLayerId,
    dragEnabled: dragEnabledProp,
    nonScalingStrokes = false,
  },
  ref,
) {
  const childrenByParent = useMemo(() => {
    const result = new Map<string | null, ComponentVisualLayer[]>()

    for (const layer of visual.layers) {
      const siblings = result.get(layer.parentId) ?? []
      siblings.push(layer)
      result.set(layer.parentId, siblings)
    }

    return result
  }, [visual.layers])

  if (visual.mode !== 'composite') {
    return null
  }

  const scaleX = width / Math.max(1, visual.designSize.width)
  const scaleY = height / Math.max(1, visual.designSize.height)
  const dragEnabled = dragEnabledProp ?? (draggableLayerId !== undefined)
  const activeDraggableLayerId = draggableLayerId ?? null
  // Keep the persisted sibling order authoritative. Selection is rendered by
  // the transformer and must not change the paint order of visual layers.
  const rootLayers = childrenByParent.get(null) ?? []

  return (
    <Group
      ref={ref}
      x={x}
      y={y}
      width={visual.designSize.width}
      height={visual.designSize.height}
      rotation={rotation}
      scaleX={scaleX}
      scaleY={scaleY}
      visible={visible}
      opacity={opacity}
      listening={listening}
    >
      {rootLayers.map((layer) => (
        <VisualLayerNode
          key={layer.id}
          layer={layer}
          childrenByParent={childrenByParent}
          listening={listening}
          dragEnabled={dragEnabled}
          draggableLayerId={activeDraggableLayerId}
          nonScalingStrokes={nonScalingStrokes}
        />
      ))}
    </Group>
  )
})
