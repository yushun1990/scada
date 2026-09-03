import type {
  ComponentActionArguments,
  ComponentAttributeValues,
  ComponentDefinition,
  ComponentEventPayload,
  ComponentPropertyFallbackValues,
  ComponentProps,
} from './definition'
import type { ComponentRenderer } from './renderer'

export type ComponentActionHandlerContext = {
  nodeId: string
  componentType: string
  attributes: Readonly<ComponentAttributeValues>
  properties: Readonly<ComponentPropertyFallbackValues>
  emit: (eventName: string, payload?: ComponentEventPayload) => void
}

export type ComponentActionHandler = (
  context: ComponentActionHandlerContext,
  argumentsValue: ComponentActionArguments,
) => unknown | Promise<unknown>

/**
 * Component-private compatibility input used only while the Scene codec
 * normalizes persisted authored state through the current public contract.
 *
 * The hook is deliberately registration-owned rather than part of the public
 * ComponentDefinition. It may translate historical authored values after a
 * component contract evolves, but it cannot create runtime authority or bypass
 * the final Attribute / Property schema validation.
 */
export type ComponentPersistedAuthoredState = Readonly<{
  sceneVersion: number
  attributes: Readonly<Record<string, unknown>>
  propertyFallbacks: Readonly<Record<string, unknown>>
}>

export type ComponentPersistedAuthoredStateMigrationResult = Readonly<{
  attributes: Record<string, unknown>
  propertyFallbacks: Record<string, unknown>
}>

export type ComponentPersistedAuthoredStateMigrator = (
  state: ComponentPersistedAuthoredState,
) => ComponentPersistedAuthoredStateMigrationResult

export type ComponentRegistration = {
  definition: ComponentDefinition
  renderer: ComponentRenderer
  /** @deprecated Property-only compatibility factory; rename after M9 runtime migration settles. */
  createDefaultProps: () => ComponentProps
  actions?: Readonly<Record<string, ComponentActionHandler>>
  migratePersistedAuthoredState?: ComponentPersistedAuthoredStateMigrator
}
