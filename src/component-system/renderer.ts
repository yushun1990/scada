import type { ForwardRefExoticComponent, RefAttributes } from 'react'
import type Konva from 'konva'
import type {
  ComponentAttributeValues,
  ComponentPropertyFallbackValues,
} from './definition'

export type ComponentPoint = {
  x: number
  y: number
}

export type ComponentRendererProps = {
  nodeId?: string
  attributes: Readonly<ComponentAttributeValues>
  properties: Readonly<ComponentPropertyFallbackValues>
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
