import { forwardRef } from 'react'
import type Konva from 'konva'
import { Group, Image as KonvaImage } from 'react-konva'
import { pumpStateSources, type PumpState } from '../assets/pump'
import { pumpComponentDefinition } from '../component-system/builtins'
import { useCachedImage } from './image-cache'

export const PUMP_DESIGN_WIDTH = 512
export const PUMP_DESIGN_HEIGHT = 720
export const PUMP_ASPECT_RATIO = PUMP_DESIGN_WIDTH / PUMP_DESIGN_HEIGHT
export const PUMP_MIN_WIDTH = pumpComponentDefinition.size.minWidth
export const PUMP_MIN_HEIGHT = pumpComponentDefinition.size.minHeight

type Point = {
  x: number
  y: number
}

export type PumpNodeProps = {
  nodeId?: string
  state: PumpState
  x: number
  y: number
  width: number
  height: number
  rotation: number
  draggable: boolean
  dragBoundFunc?: (position: Point) => Point
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
      dragBoundFunc,
      visible,
      opacity,
      listening,
    },
    ref,
  ) {
    const image = useCachedImage(pumpStateSources[state])

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
        dragBoundFunc={dragBoundFunc}
        visible={visible}
        opacity={opacity}
        listening={listening}
      >
        <KonvaImage
          image={image ?? undefined}
          width={width}
          height={height}
          listening={listening}
          perfectDrawEnabled={false}
        />
      </Group>
    )
  },
)
