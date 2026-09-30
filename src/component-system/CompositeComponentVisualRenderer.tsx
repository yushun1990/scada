import { calculateOriginOffset, resolveConcaveRectRadius, traceConcaveRect, drawVisualScale } from './visual-primitives'
import { forwardRef, memo, useEffect, useMemo, useState } from 'react'
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
import { computeSvgCanvasRasterScale, serializeManagedSvgCanvasDataUrl } from './managedSvg'
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
  type VisualShadow,
  type VisualVectorStyle,
} from './visual'

export { resolveVisualLineDashArray, calculateOriginOffset }

export const COMPOSITE_VISUAL_LAYER_NODE_NAME = 'component-visual-layer'
const COMPOSITE_VISUAL_LAYER_NODE_PREFIX = 'component-visual-layer::'

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
  // Supplying this prop opts internal root layers into editor dragging.
  dragEnabled?: boolean
  nonScalingStrokes?: boolean
}

type VisualLayerNodeProps = {
  layer: ComponentVisualLayer
  childrenByParent: ReadonlyMap<string | null, readonly ComponentVisualLayer[]>
  listening: boolean
  dragEnabled: boolean
  nonScalingStrokes: boolean
}

type VisualAssetImageEntry = {
  image: HTMLImageElement
  ready: boolean
  failed: boolean
  listeners: Set<() => void>
}

// Decoded visual assets are shared across every instance that renders the same
// data URL: without this cache each placed instance builds and decodes its own
// copy of the (potentially multi-megabyte) raster.
const visualAssetImageCache = new Map<string, VisualAssetImageEntry>()
const VISUAL_ASSET_IMAGE_CACHE_LIMIT = 24

function acquireVisualAssetImage(source: string): VisualAssetImageEntry {
  const existing = visualAssetImageCache.get(source)

  if (existing) {
    visualAssetImageCache.delete(source)
    visualAssetImageCache.set(source, existing)
    return existing
  }

  const entry: VisualAssetImageEntry = {
    image: new window.Image(),
    ready: false,
    failed: false,
    listeners: new Set(),
  }

  entry.image.decoding = 'async'
  entry.image.addEventListener('load', () => {
    entry.ready = true
    for (const listener of entry.listeners) listener()
  })
  entry.image.addEventListener('error', () => {
    entry.failed = true
    for (const listener of entry.listeners) listener()
  })
  entry.image.src = source
  // Force full rasterization at load time so the first draw — often the first
  // drag frame — does not pay the decode/rasterization stall.
  void entry.image.decode?.().catch(() => {
    // Load failures surface through the error listener above.
  })
  visualAssetImageCache.set(source, entry)

  // Evict oldest settled entries; in-flight entries keep their slot until
  // they settle. Evicted images stay alive while any consumer still renders
  // them — only the cache reference is dropped.
  for (const [key, candidate] of visualAssetImageCache) {
    if (visualAssetImageCache.size <= VISUAL_ASSET_IMAGE_CACHE_LIMIT) {
      break
    }

    if (candidate.ready || candidate.failed) {
      visualAssetImageCache.delete(key)
    }
  }

  return entry
}

function peekLoadedVisualAssetImage(source: string): HTMLImageElement | null {
  const entry = visualAssetImageCache.get(source)
  return entry?.ready ? entry.image : null
}

// Display-resolution rasters: the decoded asset (an oversized SVG raster or a
// large photo) is drawn ONCE into a canvas sized for its on-canvas display
// size. Every subsequent frame blits that canvas near 1:1 instead of
// downscaling a multi-megapixel source per draw — which is what made drags
// sluggish for every layer sharing the canvas with such an asset.
const displayRasterCache = new Map<string, HTMLCanvasElement>()
const DISPLAY_RASTER_CACHE_LIMIT = 12
const DISPLAY_RASTER_MAX_PIXELS = 2_500_000

function acquireDisplayRaster(
  source: string,
  image: HTMLImageElement,
  sourceRect: { x: number; y: number; width: number; height: number },
  drawWidth: number,
  drawHeight: number,
): HTMLCanvasElement | HTMLImageElement {
  if (!(drawWidth > 0) || !(drawHeight > 0) || !(sourceRect.width > 0) || !(sourceRect.height > 0)) {
    return image
  }

  const key = `${source}\u0000${sourceRect.x},${sourceRect.y},${sourceRect.width},${sourceRect.height}\u0000${drawWidth.toFixed(2)}x${drawHeight.toFixed(2)}`
  const cached = displayRasterCache.get(key)

  if (cached) {
    displayRasterCache.delete(key)
    displayRasterCache.set(key, cached)
    return cached
  }

  // Supersample beyond the device pixel ratio so viewport zoom stays sharp;
  // cap the total pixels so huge layers cannot balloon the buffer.
  const devicePixelRatio =
    typeof window !== 'undefined' && window.devicePixelRatio
      ? window.devicePixelRatio
      : 1
  let pixelScale = Math.min(3, Math.max(1.5, devicePixelRatio))
  const rawPixels = drawWidth * pixelScale * drawHeight * pixelScale

  if (rawPixels > DISPLAY_RASTER_MAX_PIXELS) {
    pixelScale *= Math.sqrt(DISPLAY_RASTER_MAX_PIXELS / rawPixels)
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(drawWidth * pixelScale))
  canvas.height = Math.max(1, Math.round(drawHeight * pixelScale))

  const context = canvas.getContext('2d')

  if (!context) {
    return image
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    sourceRect.x,
    sourceRect.y,
    sourceRect.width,
    sourceRect.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  displayRasterCache.set(key, canvas)

  while (displayRasterCache.size > DISPLAY_RASTER_CACHE_LIMIT) {
    const oldestKey = displayRasterCache.keys().next().value

    if (oldestKey === undefined) {
      break
    }

    displayRasterCache.delete(oldestKey)
  }

  return canvas
}

function useVisualAsset(assetRef: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(() =>
    assetRef.trim() ? peekLoadedVisualAssetImage(assetRef) : null,
  )

  useEffect(() => {
    const source = assetRef.trim()

    if (!source) {
      setImage(null)
      return
    }

    const entry = acquireVisualAssetImage(source)

    if (entry.ready) {
      setImage(entry.image)
      return
    }

    if (entry.failed) {
      setImage(null)
      return
    }

    const notify = () => setImage(entry.ready ? entry.image : null)
    entry.listeners.add(notify)

    return () => {
      entry.listeners.delete(notify)
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
                const scale = computeSvgCanvasRasterScale(w, h)
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

  // Resolve the exact source crop and on-canvas draw size per fit style, then
  // rasterize once at display resolution. This must run on the same code path
  // whether or not the decoded image is available yet: the early return below
  // has to come AFTER every hook, or the hook count changes between renders.
  const { width, height } = layer.transform
  const style = resolveVisualAssetStyle(layer)
  const imageWidth = image ? Math.max(1, image.naturalWidth || image.width) : 0
  const imageHeight = image ? Math.max(1, image.naturalHeight || image.height) : 0
  const sourceRect = { x: 0, y: 0, width: imageWidth, height: imageHeight }
  let drawWidth = width
  let drawHeight = height

  if (style.fit === 'contain') {
    const scale = Math.min(width / Math.max(1, imageWidth), height / Math.max(1, imageHeight))
    drawWidth = imageWidth * scale
    drawHeight = imageHeight * scale
  } else if (style.fit === 'cover') {
    const imageRatio = imageWidth / imageHeight
    const targetRatio = width / height

    if (imageRatio > targetRatio) {
      sourceRect.width = imageHeight * targetRatio
      sourceRect.x = (imageWidth - sourceRect.width) / 2
    } else {
      sourceRect.height = imageWidth / targetRatio
      sourceRect.y = (imageHeight - sourceRect.height) / 2
    }
  }

  const raster = useMemo(
    () =>
      image
        ? acquireDisplayRaster(assetRef, image, sourceRect, drawWidth, drawHeight)
        : null,
    [
      assetRef,
      image,
      imageWidth,
      imageHeight,
      sourceRect.x,
      sourceRect.y,
      sourceRect.width,
      sourceRect.height,
      drawWidth,
      drawHeight,
    ],
  )

  if (!image || !raster) {
    return null
  }

  if (style.fit === 'contain') {
    return (
      <KonvaImage
        image={raster}
        x={(width - drawWidth) / 2}
        y={(height - drawHeight) / 2}
        width={drawWidth}
        height={drawHeight}
        listening={listening}
        perfectDrawEnabled={false}
      />
    )
  }

  return (
    <KonvaImage
      image={raster}
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
    const r = resolveConcaveRectRadius(width, height, cornerRadius)

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
                traceConcaveRect(context, width, height, r)
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
    const strokeWidth = style.strokeWidth || 1

    return (
      <Shape
        sceneFunc={(context, shape) => {
          drawVisualScale(context, context._context, layer, style, () => context.fillStrokeShape(shape))
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

// Layer identity is stable across re-renders (rule resolution is
// copy-on-write), so memoizing per layer keeps pointer-selection and drag
// commits from re-rendering the visual subtree of every untouched layer.
const VisualLayerNode = memo(function VisualLayerNode({
  layer,
  childrenByParent,
  listening,
  dragEnabled,
  nonScalingStrokes,
}: VisualLayerNodeProps) {
  const { transform } = layer
  const children = childrenByParent.get(layer.id) ?? []
  // A grouped layer remains configurable through the tree, but its geometry
  // belongs to the group until the author explicitly ungroups it.
  const draggable = listening && dragEnabled && layer.parentId === null
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
          nonScalingStrokes={nonScalingStrokes}
        />
      ))}
    </Group>
  )
})

export const CompositeComponentVisualRenderer = memo(
  forwardRef<
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
  const dragEnabled = dragEnabledProp ?? false
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
          nonScalingStrokes={nonScalingStrokes}
        />
      ))}
    </Group>
  )
}),
)
