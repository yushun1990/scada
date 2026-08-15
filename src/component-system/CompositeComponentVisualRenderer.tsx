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

export function getCompositeVisualLayerId(target: Konva.Node) {
  let current: Konva.Node | null = target

  while (current) {
    const id = current.id()

    if (
      current.hasName(COMPOSITE_VISUAL_LAYER_NODE_NAME) &&
      id.startsWith(COMPOSITE_VISUAL_LAYER_NODE_PREFIX)
    ) {
      return id.slice(COMPOSITE_VISUAL_LAYER_NODE_PREFIX.length)
    }

    current = current.getParent()
  }

  return null
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
  draggableLayerId?: string | null
  frontLayerId?: string | null
}

type VisualLayerNodeProps = {
  layer: ComponentVisualLayer
  childrenByParent: ReadonlyMap<string | null, readonly ComponentVisualLayer[]>
  frontBranchIds: ReadonlySet<string>
  listening: boolean
  draggableLayerId: string | null
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
  const image = useVisualAsset(layer.assetRef)

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
}: {
  layer: VectorVisualLayer
  listening: boolean
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

function moveFrontBranchLast(
  layers: readonly ComponentVisualLayer[],
  frontBranchIds: ReadonlySet<string>,
) {
  const frontIndex = layers.findIndex((layer) => frontBranchIds.has(layer.id))

  if (frontIndex < 0 || frontIndex === layers.length - 1) {
    return layers
  }

  return [
    ...layers.slice(0, frontIndex),
    ...layers.slice(frontIndex + 1),
    layers[frontIndex],
  ]
}

function VisualLayerNode({
  layer,
  childrenByParent,
  frontBranchIds,
  listening,
  draggableLayerId,
}: VisualLayerNodeProps) {
  const { transform } = layer
  const children = moveFrontBranchLast(
    childrenByParent.get(layer.id) ?? [],
    frontBranchIds,
  )
  const draggable = listening && draggableLayerId === layer.id

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
      {draggable && (
        <Rect
          width={transform.width}
          height={transform.height}
          fill="rgba(0, 0, 0, 0.001)"
          listening={listening}
          perfectDrawEnabled={false}
        />
      )}
      {(layer.kind === 'svg' || layer.kind === 'image') && (
        <VisualAssetLayer layer={layer} listening={listening} />
      )}
      {layer.kind === 'vector' && (
        <VisualVectorLayer layer={layer} listening={listening} />
      )}
      {layer.kind === 'text' && (
        <VisualTextLayer layer={layer} listening={listening} />
      )}
      {children.map((child) => (
        <VisualLayerNode
          key={child.id}
          layer={child}
          childrenByParent={childrenByParent}
          frontBranchIds={frontBranchIds}
          listening={listening}
          draggableLayerId={draggableLayerId}
        />
      ))}
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
    draggableLayerId = null,
    frontLayerId = null,
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

  const frontBranchIds = useMemo(() => {
    const result = new Set<string>()

    if (!frontLayerId) {
      return result
    }

    const layerMap = new Map(visual.layers.map((layer) => [layer.id, layer]))
    let layerId: string | null = frontLayerId

    while (layerId) {
      const layer = layerMap.get(layerId)

      if (!layer || result.has(layer.id)) {
        break
      }

      result.add(layer.id)
      layerId = layer.parentId
    }

    return result
  }, [frontLayerId, visual.layers])

  if (visual.mode !== 'composite') {
    return null
  }

  const scaleX = width / Math.max(1, visual.designSize.width)
  const scaleY = height / Math.max(1, visual.designSize.height)
  const rootLayers = moveFrontBranchLast(
    childrenByParent.get(null) ?? [],
    frontBranchIds,
  )

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
          frontBranchIds={frontBranchIds}
          listening={listening}
          draggableLayerId={draggableLayerId}
        />
      ))}
    </Group>
  )
})
