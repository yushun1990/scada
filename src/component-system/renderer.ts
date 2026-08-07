import type { ForwardRefExoticComponent, RefAttributes } from 'react'
import type Konva from 'konva'
import type { ComponentProps } from './definition'

export type ComponentPoint = {
  x: number
  y: number
}

export type ComponentRendererProps = {
  nodeId?: string
  props: ComponentProps
  x: number
  y: number
  width: number
  height: number
  rotation: number
  draggable: boolean
  dragBoundFunc?: (position: ComponentPoint) => ComponentPoint
  visible: boolean
  opacity: number
  listening: boolean
}

export type ComponentRenderer = ForwardRefExoticComponent<
  ComponentRendererProps & RefAttributes<Konva.Group>
>
