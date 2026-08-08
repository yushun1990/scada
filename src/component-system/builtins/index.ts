import { ComponentRegistry } from '../registry'
import { pumpComponentRegistration } from './pump'
import { statusIndicatorComponentRegistration } from './status-indicator'

export const builtInComponentRegistry = new ComponentRegistry([
  pumpComponentRegistration,
  statusIndicatorComponentRegistration,
])

export {
  pumpComponentDefinition,
  pumpComponentRegistration,
  PUMP_COMPONENT_TYPE,
} from './pump'
export {
  statusIndicatorComponentDefinition,
  statusIndicatorComponentRegistration,
  STATUS_INDICATOR_COMPONENT_TYPE,
} from './status-indicator'
