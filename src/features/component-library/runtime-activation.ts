import {
  builtInComponentRegistrations,
  studioComponentRegistry,
} from '../../component-system/builtins'
import { createCompositeComponentRegistration } from '../../component-system/composite-registration'
import type { ComponentRegistration } from '../../component-system/registration'
import { ComponentRegistry } from '../../component-system/registry'
import type { ComponentLibraryEntry } from './component-document'

export type UserComponentActivationDiagnostic = {
  packageId: string
  componentType: string
  kind:
    | 'native-visual'
    | 'runtime-contract'
    | 'type-collision'
    | 'invalid-registration'
  message: string
}

export type UserComponentActivationResult = {
  activeTypes: readonly string[]
  diagnostics: readonly UserComponentActivationDiagnostic[]
}

const builtInTypes = new Set(
  builtInComponentRegistrations.map((registration) => registration.definition.type),
)
let activeUserTypes = new Set<string>()

function runtimeContractIsDeclarative(entry: ComponentLibraryEntry) {
  return (
    Object.keys(entry.definition.actions).length === 0 &&
    Object.keys(entry.definition.events).length === 0
  )
}

function collisionTypes(entries: readonly ComponentLibraryEntry[]) {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    counts.set(entry.definition.type, (counts.get(entry.definition.type) ?? 0) + 1)
  }

  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([type]) => type),
  )
}

/**
 * Replace the complete user-owned portion of the live Studio registry.
 *
 * Only ready, declarative composite packages are executable in M6.7A.
 * implementationDraft text is intentionally ignored. Actions/Events remain
 * blocked until an explicit controlled implementation contract is accepted.
 */
export function replaceStudioUserComponentPackages(
  entries: readonly ComponentLibraryEntry[],
): UserComponentActivationResult {
  const readyEntries = entries
    .filter((entry) => !entry.builtIn && entry.status === 'ready')
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
  const duplicateTypes = collisionTypes(readyEntries)
  const diagnostics: UserComponentActivationDiagnostic[] = []
  const registrations: ComponentRegistration[] = []

  for (const entry of readyEntries) {
    const componentType = entry.definition.type

    if (builtInTypes.has(componentType) || duplicateTypes.has(componentType)) {
      diagnostics.push({
        packageId: entry.id,
        componentType,
        kind: 'type-collision',
        message: builtInTypes.has(componentType)
          ? `Component type collides with built-in registration: ${componentType}`
          : `Multiple ready user packages declare component type: ${componentType}`,
      })
      continue
    }

    if (entry.visual.mode !== 'composite') {
      diagnostics.push({
        packageId: entry.id,
        componentType,
        kind: 'native-visual',
        message: `User component ${componentType} requires a trusted native renderer and cannot be locally activated`,
      })
      continue
    }

    if (!runtimeContractIsDeclarative(entry)) {
      diagnostics.push({
        packageId: entry.id,
        componentType,
        kind: 'runtime-contract',
        message: `User component ${componentType} declares Actions/Events but has no accepted executable implementation contract`,
      })
      continue
    }

    try {
      registrations.push(
        createCompositeComponentRegistration(entry.definition, entry.visual),
      )
    } catch (error) {
      diagnostics.push({
        packageId: entry.id,
        componentType,
        kind: 'invalid-registration',
        message: error instanceof Error ? error.message : 'Invalid user component registration',
      })
    }
  }

  // Validate the complete next registry before mutating the live object. This
  // catches any registration-level conflict without leaving a partial install.
  new ComponentRegistry([
    ...builtInComponentRegistrations,
    ...registrations,
  ])

  for (const componentType of activeUserTypes) {
    studioComponentRegistry.unregister(componentType)
  }
  for (const registration of registrations) {
    studioComponentRegistry.register(registration)
  }

  activeUserTypes = new Set(
    registrations.map((registration) => registration.definition.type),
  )

  return {
    activeTypes: [...activeUserTypes].sort((left, right) => left.localeCompare(right)),
    diagnostics,
  }
}

export function getActiveUserComponentTypes() {
  return [...activeUserTypes].sort((left, right) => left.localeCompare(right))
}
