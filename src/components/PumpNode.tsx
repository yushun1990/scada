import { forwardRef } from 'react'
import type Konva from 'konva'
import { Group, Image as KonvaImage } from 'react-konva'
import { pumpStateSources, type PumpState } from '../assets/pump'
import { useCachedImage } from './image-cache'

export const PUMP_DESIGN_WIDTH = 512
export const PUMP_DESIGN_HEIGHT = 720
export const PUMP_ASPECT_RATIO = PUMP_DESIGN_WIDTH / PUMP_DESIGN_HEIGHT
export const PUMP_MIN_WIDTH = 96
export const PUMP_MIN_HEIGHT = PUMP_MIN_WIDTH / PUMP_ASPECT_RATIO

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
    } satisfies Record<PumpState, HTMLCanvasElement | null>

    return (
      <Group
        ref={ref}
        x={x}
        y={y}
        width={width}
        height={height}
        rotation={rotation}
        draggable={draggable}
        onMouseDown={onSelect}
        onTouchStart={onSelect}
        onDragStart={onSelect}
        onDragEnd={(event) => {
          onDragEnd(event.target.x(), event.target.y())
        }}
        onTransformEnd={(event) => {
          const group = event.target as Konva.Group
          const uniformScale = Math.max(
            Math.abs(group.scaleX()),
            Math.abs(group.scaleY()),
          )
          const nextWidth = Math.max(PUMP_MIN_WIDTH, group.width() * uniformScale)
          const nextHeight = nextWidth / PUMP_ASPECT_RATIO

          group.scaleX(1)
          group.scaleY(1)

          onTransformEnd({
            x: group.x(),
            y: group.y(),
            width: nextWidth,
            height: nextHeight,
            rotation: group.rotation(),
          })
        }}
      >
        {(Object.keys(images) as PumpState[]).map((imageState) => {
          const active = state === imageState

          return (
            <KonvaImage
              key={imageState}
              image={images[imageState] ?? undefined}
              width={width}
              height={height}
              opacity={active ? 1 : 0}
              listening={active}
              perfectDrawEnabled={false}
            />
          )
        })}
      </Group>
    )
  },
)
