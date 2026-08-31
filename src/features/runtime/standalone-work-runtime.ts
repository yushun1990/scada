import { builtInComponentRegistrations } from '../../component-system/builtins'
import { createCompositeComponentRegistration } from '../../component-system/composite-registration'
import { ComponentRegistry } from '../../component-system/registry'
import { PreviewRuntime } from '../../runtime/preview-runtime'
import { parseSceneDocumentWithRegistry } from '../../scene/validation-core'
import {
  parseScadaWorkPackage,
  parseScadaWorkPackageDocument,
  type ScadaWorkPackage,
} from '../scada-works/scada-work-package'

export type StandaloneWorkRuntime = Readonly<{
  workPackage: ScadaWorkPackage
  registry: ComponentRegistry
  runtime: PreviewRuntime
}>

function createHostCapabilities() {
  return new ComponentRegistry(builtInComponentRegistrations)
}

/**
 * Build one isolated runtime directly from the accepted M8 work artifact.
 *
 * Portable dependencies become registrations owned by this runtime instance.
 * Nothing is installed into browser persistence or the mutable Studio registry.
 * The standalone shell intentionally starts with no mock data sources; a real
 * host adapter can be injected only after the concrete transport gate reopens.
 */
export function createStandaloneWorkRuntime(
  candidate: ScadaWorkPackage,
): StandaloneWorkRuntime {
  const hostCapabilities = createHostCapabilities()
  const workPackage = parseScadaWorkPackage(candidate, hostCapabilities)

  if (!workPackage) {
    throw new Error('SCADA work package is invalid or dependency-incomplete')
  }

  const portableRegistrations = workPackage.dependencies.map((dependency) =>
    createCompositeComponentRegistration(
      dependency.definition,
      dependency.visual,
    ),
  )
  const registry = new ComponentRegistry([
    ...builtInComponentRegistrations,
    ...portableRegistrations,
  ])

  // Re-run Scene validation against the actual renderer/action registrations
  // that will own this runtime, not only the validation-only dependency overlay
  // used by the transport-neutral package codec.
  const scene = parseSceneDocumentWithRegistry(
    JSON.stringify(workPackage.scene),
    registry,
  )
  const normalizedWorkPackage: ScadaWorkPackage = {
    ...workPackage,
    scene,
  }

  return {
    workPackage: normalizedWorkPackage,
    registry,
    runtime: new PreviewRuntime([], registry),
  }
}

export function parseStandaloneWorkRuntimeDocument(
  raw: string,
): StandaloneWorkRuntime | null {
  const candidate = parseScadaWorkPackageDocument(raw, createHostCapabilities())
  if (!candidate) return null

  try {
    return createStandaloneWorkRuntime(candidate)
  } catch {
    return null
  }
}
