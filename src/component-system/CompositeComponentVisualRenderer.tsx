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
import type {
  ComponentVisualDefinition,
  ComponentVisualLayer,
  ImageVisualLayer,
  SvgVisualLayer,
  TextVisualLayer,
  VectorVisualLayer,
} from './visual'

export type CompositeComponentVisualRendererProps = {
  visual: ComponentVisualDefinition
  designWidth: number
  designHeight: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
  visible: boolean
  opacity: number
  listening: boolean
}

type VisualLayerNodeProps = {
  layer: ComponentVisualLayer
  childrenByParent: ReadonlyMap<string | null, readonly ComponentVisualLayer[]>
  listening: boolean
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

  return (
    <KonvaImage
      image={image}
      width={layer.transform.width}
      height={layer.transform.height}
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
  const fill = '#cbd5e1'
  const stroke = '#64748b'
  const strokeWidth = Math.max(1, Math.min(width, height) * 0.02)

  if (layer.primitive === 'rect') {
    return (
      <Rect
        width={width}
        height={height}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
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
        strokeWidth={strokeWidth}
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
        strokeWidth={strokeWidth}
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
        strokeWidth={strokeWidth}
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
      strokeWidth={strokeWidth}
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

  return (
    <Text
      width={width}
      height={height}
      text={layer.text}
      fill="#334155"
      fontSize={Math.max(10, Math.min(width, height) * 0.22)}
      align="center"
      verticalAlign="middle"
      listening={listening}
      perfectDrawEnabled={false}
    />
  )
}

function VisualLayerNode({
  layer,
  childrenByParent,
  listening,
}: VisualLayerNodeProps) {
  const { transform } = layer
  const children = childrenByParent.get(layer.id) ?? []

  return (
    <Group
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
    >
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
          listening={listening}
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
    designWidth,
    designHeight,
    x,
    y,
    width,
    height,
    rotation,
    visible,
    opacity,
    listening,
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

  const scaleX = width / Math.max(1, designWidth)
  const scaleY = height / Math.max(1, designHeight)
  const rootLayers = childrenByParent.get(null) ?? []

  return (
    <Group
      ref={ref}
      x={x}
      y={y}
      width={designWidth}
      height={designHeight}
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
        />
      ))}
    </Group>
  )
})
