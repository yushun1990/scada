import type { ComponentDefinition } from '../../component-system/definition'
import type { ComponentRegistration } from '../../component-system/registration'
import type { ComponentRegistryView } from '../../component-system/registry-view'
import type { ComponentRenderer } from '../../component-system/renderer'
import {
  parseDistributableComponentPackage,
  type DistributableComponentPackage,
} from '../component-library/distributable-component-package'
import {
  isComponentNode,
  type SceneDocument,
} from '../../scene/schema'
import { parseSceneDocumentWithRegistry } from '../../scene/validation-core'

/**
 * Version of the transport-neutral runnable-work artifact.
 *
 * This version is intentionally independent from Scene v7 and the portable
 * component package version. Those nested contracts may evolve separately.
 */
export const SCADA_WORK_PACKAGE_VERSION = 1 as const

export type ScadaWorkPackage = {
  packageVersion: typeof SCADA_WORK_PACKAGE_VERSION
  scene: SceneDocument
  dependencies: DistributableComponentPackage[]
}

const validationOnlyRenderer = (() => null) as unknown as ComponentRenderer

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createValidationRegistration(
  definition: ComponentDefinition,
): ComponentRegistration {
  return {
    definition,
    renderer: validationOnlyRenderer,
    createDefaultProps: () => Object.fromEntries(
      Object.entries(definition.properties).map(([key, property]) => [
        key,
        property.defaultValue,
      ]),
    ),
  }
}

function dependencyIsRunnable(componentPackage: DistributableComponentPackage) {
  return (
    componentPackage.visual.mode === 'composite'
    && Object.keys(componentPackage.definition.actions).length === 0
    && Object.keys(componentPackage.definition.events).length === 0
  )
}

function createScopedPackageRegistry(
  hostCapabilities: ComponentRegistryView,
  dependencies: readonly DistributableComponentPackage[],
): ComponentRegistryView {
  const registrations = new Map(
    dependencies.map((dependency) => [
      dependency.definition.type,
      createValidationRegistration(dependency.definition),
    ]),
  )

  return {
    get(type: string) {
      return registrations.get(type) ?? hostCapabilities.get(type)
    },
  }
}

function normalizeDependencies(
  value: unknown[],
  hostCapabilities: ComponentRegistryView,
) {
  const dependencies: DistributableComponentPackage[] = []
  const dependencyTypes = new Set<string>()

  for (const candidate of value) {
    const dependency = parseDistributableComponentPackage(candidate)
    if (!dependency || !dependencyIsRunnable(dependency)) return null

    const componentType = dependency.definition.type
    if (
      dependencyTypes.has(componentType)
      || hostCapabilities.get(componentType)
    ) {
      return null
    }

    dependencyTypes.add(componentType)
    dependencies.push(dependency)
  }

  return dependencies.sort((left, right) =>
    left.definition.type.localeCompare(right.definition.type),
  )
}

/**
 * Parse one dependency-complete runnable-work artifact against an explicit set
 * of host component capabilities.
 *
 * The host capability view should contain trusted native/built-in components
 * only. Portable user dependencies are carried by the artifact itself and are
 * validated in an isolated overlay without registering anything globally.
 */
export function parseScadaWorkPackage(
  value: unknown,
  hostCapabilities: ComponentRegistryView,
): ScadaWorkPackage | null {
  if (
    !isRecord(value)
    || value.packageVersion !== SCADA_WORK_PACKAGE_VERSION
    || !isRecord(value.scene)
    || !Array.isArray(value.dependencies)
  ) {
    return null
  }

  const dependencies = normalizeDependencies(value.dependencies, hostCapabilities)
  if (!dependencies) return null

  const dependencyTypes = new Set(
    dependencies.map((dependency) => dependency.definition.type),
  )
  const scopedRegistry = createScopedPackageRegistry(
    hostCapabilities,
    dependencies,
  )

  let scene: SceneDocument
  try {
    scene = parseSceneDocumentWithRegistry(
      JSON.stringify(value.scene),
      scopedRegistry,
    )
  } catch {
    return null
  }

  const referencedTypes = new Set(
    scene.nodes
      .filter(isComponentNode)
      .map((node) => node.type),
  )

  for (const componentType of referencedTypes) {
    if (!hostCapabilities.get(componentType) && !dependencyTypes.has(componentType)) {
      return null
    }
  }

  for (const dependencyType of dependencyTypes) {
    if (!referencedTypes.has(dependencyType)) {
      return null
    }
  }

  return {
    packageVersion: SCADA_WORK_PACKAGE_VERSION,
    scene,
    dependencies,
  }
}

export function createScadaWorkPackage(
  scene: SceneDocument,
  dependencies: readonly DistributableComponentPackage[],
  hostCapabilities: ComponentRegistryView,
): ScadaWorkPackage {
  const normalized = parseScadaWorkPackage(
    {
      packageVersion: SCADA_WORK_PACKAGE_VERSION,
      scene,
      dependencies,
    },
    hostCapabilities,
  )

  if (!normalized) {
    throw new Error('SCADA work package is invalid or dependency-incomplete')
  }

  return normalized
}

export function serializeScadaWorkPackage(
  workPackage: ScadaWorkPackage,
  hostCapabilities: ComponentRegistryView,
) {
  const normalized = parseScadaWorkPackage(workPackage, hostCapabilities)
  if (!normalized) {
    throw new Error('SCADA work package is invalid or dependency-incomplete')
  }

  return JSON.stringify(normalized, null, 2)
}

export function parseScadaWorkPackageDocument(
  raw: string,
  hostCapabilities: ComponentRegistryView,
): ScadaWorkPackage | null {
  try {
    return parseScadaWorkPackage(JSON.parse(raw), hostCapabilities)
  } catch {
    return null
  }
}
