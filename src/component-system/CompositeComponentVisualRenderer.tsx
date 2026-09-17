import { forwardRef, useEffect, useMemo, useState } from 'react'
import type Konva from 'konva'
import {
  Circle,
  Ellipse,
  Group,
  Image as KonvaImage,
  Line,
  Path,
  Rect,
  Text,
} from 'react-konva'
import { serializeManagedSvgDataUrl } from './managedSvg'
import {
  resolveVisualAssetStyle,
  resolveVisualTextStyle,
  resolveVisualVectorStyle,
  type ComponentVisualDefinition,
  type ComponentVisualLayer,
  type ImageVisualLayer,
  type SvgVisualLayer,
  type TextVisualLayer,
  type VectorVisualLayer,
} from './visual'

export const COMPOSITE_VISUAL_LAYER_NODE_NAME = 'component-visual-layer'
const COMPOSITE_VISUAL_LAYER_NODE_PREFIX = 'component-visual-layer::'

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
  const assetRef = layer.kind === 'svg' && layer.document
    ? serializeManagedSvgDataUrl(layer.document)
    : layer.assetRef
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
  const fill = style.fill || undefined
  const stroke = style.stroke || undefined

  if (layer.primitive === 'rect') {
    return (
      <Rect
        width={width}
        height={height}
        fill={fill}
        stroke={stroke}
        strokeWidth={style.strokeWidth}
        strokeScaleEnabled={!nonScalingStroke}
        listening={listening}
        perfectDrawEnabled={false}
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
        fill={fill}
        stroke={stroke}
        strokeWidth={style.strokeWidth}
        strokeScaleEnabled={!nonScalingStroke}
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
        fill={fill}
        stroke={stroke}
        strokeWidth={style.strokeWidth}
        strokeScaleEnabled={!nonScalingStroke}
        listening={listening}
        perfectDrawEnabled={false}
      />
    )
  }

  if (layer.primitive === 'line') {
    return (
      <Line
        points={[0, height / 2, width, height / 2]}
        stroke={stroke}
        strokeWidth={style.strokeWidth}
        strokeScaleEnabled={!nonScalingStroke}
        listening={listening}
        perfectDrawEnabled={false}
      />
    )
  }

  return (
    <Path
      data={layer.pathData ?? ''}
      fill={fill}
      stroke={stroke}
      strokeWidth={style.strokeWidth}
      strokeScaleEnabled={!nonScalingStroke}
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
      listening={listening}
      perfectDrawEnabled={false}
    />
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
  return (
    <Rect
      width={width}
      height={height}
      fill="#000"
      listening={listening}
      perfectDrawEnabled={false}
      sceneFunc={() => {}}
      hitFunc={(context, shape) => {
        context.beginPath()
        context.rect(0, 0, width, height)
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
  const ownsEditorBoundsHitArea = listening && dragEnabled
  const ownsFullBoundsDragHitArea = draggableLayerId === layer.id

  return (
    <Group
      id={compositeVisualLayerNodeId(layer.id)}
      name={COMPOSITE_VISUAL_LAYER_NODE_NAME}
      x={transform.x}
      y={transform.y}
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
      {ownsEditorBoundsHitArea && (
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
  const dragEnabled = draggableLayerId !== undefined
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
