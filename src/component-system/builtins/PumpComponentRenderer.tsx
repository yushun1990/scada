import { forwardRef } from 'react'
import type Konva from 'konva'
import { pumpStatePalettes, type PumpState } from '../../assets/pump'
import { PumpNode } from '../../components/PumpNode'
import type { ComponentRendererProps } from '../renderer'

function resolvePumpState(value: unknown): PumpState {
  return typeof value === 'string' && value in pumpStatePalettes
    ? value as PumpState
    : 'green'
}

export const PumpComponentRenderer = forwardRef<
  Konva.Group,
  ComponentRendererProps
>(function PumpComponentRendererImpl({ props, ...rendererProps }, ref) {
  return (
    <PumpNode
      ref={ref}
      state={resolvePumpState(props.state)}
      {...rendererProps}
    />
  )
})
