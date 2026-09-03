import { forwardRef } from 'react'
import type Konva from 'konva'
import { PumpNode } from '../../components/PumpNode'
import type { ComponentRendererProps } from '../renderer'
import { resolvePumpPresentationColor } from './pump-contract'

export const PumpComponentRenderer = forwardRef<
  Konva.Group,
  ComponentRendererProps
>(function PumpComponentRendererImpl({ properties, attributes, ...rendererProps }, ref) {
  return (
    <PumpNode
      ref={ref}
      state="gray"
      tintColor={resolvePumpPresentationColor(properties.state, attributes)}
      {...rendererProps}
    />
  )
})
