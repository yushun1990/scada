import type { ComponentRegistration } from '../registration'
import { ComponentRegistry } from '../registry'
import { pumpComponentRegistration } from './pump'
import { statusIndicatorComponentRegistration } from './status-indicator'

export const builtInComponentRegistrations: readonly ComponentRegistration[] = [
  pumpComponentRegistration,
  statusIndicatorComponentRegistration,
]

/**
 * Product-wide live registry. Built-ins form the immutable baseline while
 * validated user composite registrations may be attached and removed at
 * runtime by the Component Library activation layer.
 */
export const studioComponentRegistry = new ComponentRegistry(
  builtInComponentRegistrations,
)

/**
 * @deprecated Product consumers should prefer studioComponentRegistry.
 * Kept as an object-identity alias while built-in-only call sites migrate.
 */
export const builtInComponentRegistry = studioComponentRegistry

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
