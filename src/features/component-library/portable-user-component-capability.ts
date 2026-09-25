import type { ComponentDefinition } from '../../component-system/definition'

export type PortableUserComponentCapability = Readonly<{
  activatable: boolean
  actionKeys: readonly string[]
  eventKeys: readonly string[]
}>

/**
 * Describe the currently accepted portable user-component runtime contract.
 *
 * Public Action/Event declarations remain part of the renderer-independent
 * component vocabulary for trusted registrations, but portable user packages
 * have no accepted implementation/emission authority yet. Keeping this check
 * in one production module prevents authoring, distribution and activation
 * from inventing different capability rules.
 */
export function inspectPortableUserComponentCapability(
  definition: ComponentDefinition,
): PortableUserComponentCapability {
  const actionKeys = Object.keys(definition.actions).sort()
  const eventKeys = Object.keys(definition.events).sort()

  return {
    activatable: actionKeys.length === 0 && eventKeys.length === 0,
    actionKeys,
    eventKeys,
  }
}

export function portableUserComponentCapabilityMessage(
  capability: PortableUserComponentCapability,
) {
  const declarations = [
    capability.actionKeys.length > 0
      ? `Actions: ${capability.actionKeys.join(', ')}`
      : null,
    capability.eventKeys.length > 0
      ? `Events: ${capability.eventKeys.join(', ')}`
      : null,
  ].filter((value): value is string => value !== null)

  return declarations.length > 0
    ? `可移植用户组件尚无已接受的 Action/Event 运行契约（${declarations.join('; ')}）`
    : ''
}

export function assertPortableUserComponentActivatable(
  definition: ComponentDefinition,
) {
  const capability = inspectPortableUserComponentCapability(definition)
  if (!capability.activatable) {
    throw new Error(portableUserComponentCapabilityMessage(capability))
  }
}
