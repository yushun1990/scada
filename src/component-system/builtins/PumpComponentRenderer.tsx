import { forwardRef } from 'react'
import type Konva from 'konva'
import { PumpNode } from '../../components/PumpNode'
import type { ComponentAttributeValues } from '../definition'
import type { ComponentRendererProps } from '../renderer'
import {
  pumpComponentDefinition,
  type PumpSemanticState,
} from './pump-contract'

const PUMP_COLOR_ATTRIBUTE_BY_STATE: Readonly<Record<PumpSemanticState, string>> = {
  stopped: 'stoppedColor',
  running: 'runningColor',
  manual: 'manualColor',
  warning: 'warningColor',
  alarm: 'alarmColor',
}

function resolvePumpSemanticState(value: unknown): PumpSemanticState {
  return typeof value === 'string' && value in PUMP_COLOR_ATTRIBUTE_BY_STATE
    ? value as PumpSemanticState
    : 'running'
}

export function resolvePumpPresentationColor(
  stateValue: unknown,
  attributes: Readonly<ComponentAttributeValues>,
) {
  const state = resolvePumpSemanticState(stateValue)
  const attributeKey = PUMP_COLOR_ATTRIBUTE_BY_STATE[state]
  const authored = attributes[attributeKey]
  if (typeof authored === 'string') return authored

  const fallback = pumpComponentDefinition.attributes[attributeKey]?.defaultValue
  return typeof fallback === 'string' ? fallback : '#788581'
}

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
