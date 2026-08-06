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
  nodeId?: string
  state: PumpState
  x: number
  y: number
  width: number
  height: number
  rotation: number
  draggable: boolean
  visible: boolean
  opacity: number
  listening: boolean
}

export const PumpNode = forwardRef<Konva.Group, PumpNodeProps>(
  function PumpNode(
    {
      nodeId,
      state,
      x,
      y,
      width,
      height,
      rotation,
      draggable,
      visible,
      opacity,
      listening,
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
        id={nodeId}
        name={listening ? 'scene-node' : undefined}
        x={x}
        y={y}
        width={width}
        height={height}
        rotation={rotation}
        draggable={draggable}
        visible={visible}
        opacity={opacity}
        listening={listening}
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
              listening={listening && active}
              perfectDrawEnabled={false}
            />
          )
        })}
      </Group>
    )
  },
)
