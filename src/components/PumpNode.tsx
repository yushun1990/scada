import { forwardRef } from 'react'
import type Konva from 'konva'
import { Group, Image as KonvaImage } from 'react-konva'
import { pumpStateSources, type PumpState } from '../assets/pump'
import { useCachedImage } from './image-cache'

export const PUMP_DESIGN_WIDTH = 512
export const PUMP_DESIGN_HEIGHT = 720

export type PumpNodeProps = {
  state: PumpState
  x: number
  y: number
  width: number
  height: number
  rotation: number
  draggable: boolean
  onSelect: () => void
  onDragEnd: (x: number, y: number) => void
  onTransformEnd: (value: {
    x: number
    y: number
    width: number
    height: number
    rotation: number
  }) => void
}

export const PumpNode = forwardRef<Konva.Group, PumpNodeProps>(
  function PumpNode(
    {
      state,
      x,
      y,
      width,
      height,
      rotation,
      draggable,
      onSelect,
      onDragEnd,
      onTransformEnd,
    },
    ref,
  ) {
    const gray = useCachedImage(pumpStateSources.gray)
    const green = useCachedImage(pumpStateSources.green)
    const blue = useCachedImage(pumpStateSources.blue)
    const orange = useCachedImage(pumpStateSources.orange)
    const red = useCachedImage(pumpStateSources.red)

    const images = {
      gray,
      green,
      blue,
      orange,
      red,
    } satisfies Record<PumpState, HTMLImageElement | null>

    return (
      <Group
        ref={ref}
        x={x}
        y={y}
        width={width}
        height={height}
        rotation={rotation}
        draggable={draggable}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(event) => {
          onDragEnd(event.target.x(), event.target.y())
        }}
        onTransformEnd={(event) => {
          const group = event.target as Konva.Group
          const scaleX = group.scaleX()
          const scaleY = group.scaleY()

          group.scaleX(1)
          group.scaleY(1)

          onTransformEnd({
            x: group.x(),
            y: group.y(),
            width: Math.max(96, group.width() * scaleX),
            height: Math.max(128, group.height() * scaleY),
            rotation: group.rotation(),
          })
        }}
      >
        {(Object.keys(images) as PumpState[]).map((imageState) => (
          <KonvaImage
            key={imageState}
            image={images[imageState] ?? undefined}
            width={width}
            height={height}
            opacity={state === imageState ? 1 : 0}
            listening={false}
            perfectDrawEnabled={false}
          />
        ))}
      </Group>
    )
  },
)
