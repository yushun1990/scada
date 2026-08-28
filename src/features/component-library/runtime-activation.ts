import {
  builtInComponentRegistrations,
  studioComponentRegistry,
} from '../../component-system/builtins'
import { createCompositeComponentRegistration } from '../../component-system/composite-registration'
import type { ComponentLibraryEntry } from './component-document'
import {
  createUserComponentActivationController,
  type UserComponentActivationDiagnostic,
  type UserComponentActivationResult,
} from './runtime-activation-core'

export type {
  UserComponentActivationDiagnostic,
  UserComponentActivationResult,
} from './runtime-activation-core'

const controller = createUserComponentActivationController({
  registry: studioComponentRegistry,
  builtInRegistrations: builtInComponentRegistrations,
  createRegistration: (entry: ComponentLibraryEntry) =>
    createCompositeComponentRegistration(entry.definition, entry.visual),
})

/**
 * Replace the complete user-owned portion of the live Studio registry.
 * implementationDraft text is intentionally ignored by the registration path.
 */
export function replaceStudioUserComponentPackages(
  entries: readonly ComponentLibraryEntry[],
): UserComponentActivationResult {
  return controller.replace(entries)
}

export function getActiveUserComponentTypes() {
  return controller.getActiveTypes()
}

// Keep these type imports visibly used by this product binding so declaration
// generation preserves the public diagnostic/result surface.
void (0 as unknown as UserComponentActivationDiagnostic | null)
