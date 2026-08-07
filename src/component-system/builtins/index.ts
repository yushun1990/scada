import { ComponentRegistry } from '../registry'
import { pumpComponentRegistration } from './pump'

export const builtInComponentRegistry = new ComponentRegistry([
  pumpComponentRegistration,
])

export { pumpComponentDefinition, pumpComponentRegistration, PUMP_COMPONENT_TYPE } from './pump'
