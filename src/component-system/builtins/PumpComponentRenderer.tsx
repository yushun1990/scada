import { forwardRef } from 'react'
import type Konva from 'konva'
import type { PumpState } from '../../assets/pump'
import { PumpNode } from '../../components/PumpNode'
import type { ComponentRendererProps } from '../renderer'
import type { PumpSemanticState } from './pump'

const PUMP_PALETTE_BY_SEMANTIC_STATE: Readonly<Record<PumpSemanticState, PumpState>> = {
  stopped: 'gray',
  running: 'green',
  manual: 'blue',
  warning: 'orange',
  alarm: 'red',
}

function resolvePumpPalette(value: unknown): PumpState {
  return typeof value === 'string' && value in PUMP_PALETTE_BY_SEMANTIC_STATE
    ? PUMP_PALETTE_BY_SEMANTIC_STATE[value as PumpSemanticState]
    : 'green'
}

export const PumpComponentRenderer = forwardRef<
  Konva.Group,
  ComponentRendererProps
>(function PumpComponentRendererImpl({ props, ...rendererProps }, ref) {
  return (
    <PumpNode
      ref={ref}
      state={resolvePumpPalette(props.state)}
      {...rendererProps}
    />
  )
})
