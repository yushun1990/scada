import { forwardRef, useEffect, useState } from 'react'
import type Konva from 'konva'
import { Group, Image as KonvaImage } from 'react-konva'
import { pumpStateSources, type PumpState } from '../assets/pump'
import { useCachedImage } from './image-cache'

export const PUMP_DESIGN_WIDTH = 512
export const PUMP_DESIGN_HEIGHT = 720
export const PUMP_ASPECT_RATIO = PUMP_DESIGN_WIDTH / PUMP_DESIGN_HEIGHT

type Point = {
  x: number
  y: number
}

export type PumpNodeProps = {
  nodeId?: string
  state: PumpState
  /** Optional authored presentation tint. When present, the neutral asset is tinted. */
  tintColor?: string
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
      tintColor,
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
    const image = useCachedImage(
      tintColor ? pumpStateSources.gray : pumpStateSources[state],
    )
    const [tintedImage, setTintedImage] = useState<HTMLCanvasElement | null>(null)

    useEffect(() => {
      if (!image || !tintColor) {
        setTintedImage(null)
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || image.width
      canvas.height = image.naturalHeight || image.height
      const context = canvas.getContext('2d')
      if (!context) {
        setTintedImage(null)
        return
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      context.save()
      context.globalCompositeOperation = 'source-atop'
      context.globalAlpha = 0.72
      context.fillStyle = tintColor
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.restore()
      setTintedImage(canvas)
    }, [image, tintColor])

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
          image={tintedImage ?? image ?? undefined}
          width={width}
          height={height}
          listening={listening}
          perfectDrawEnabled={false}
        />
      </Group>
    )
  },
)
