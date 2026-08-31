import type { ComponentRegistration } from './registration'

/**
 * Read-only component lookup contract used by validation/runtime boundaries
 * that must not mutate the product-wide live registry.
 *
 * ComponentRegistry satisfies this structurally; isolated candidate registries
 * can therefore be supplied without introducing a second registry system.
 */
export type ComponentRegistryView = Readonly<{
  get(type: string): ComponentRegistration | null
}>
