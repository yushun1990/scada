import { createCompositeComponentRegistration } from '../../component-system/composite-registration'
import type { ComponentRegistration } from '../../component-system/registration'
import { ComponentRegistry } from '../../component-system/registry'
import { PreviewRuntime } from '../../runtime/preview-runtime'
import { parseSceneDocumentWithRegistry } from '../../scene/validation-core'
import {
  parseScadaWorkPackage,
  type ScadaWorkPackage,
} from '../scada-works/scada-work-package'

export type StandaloneWorkRuntime = Readonly<{
  workPackage: ScadaWorkPackage
  registry: ComponentRegistry
  runtime: PreviewRuntime
}>

/**
 * Build one isolated runtime directly from the accepted M8 work artifact.
 *
 * Host/native registrations are explicit input. Portable dependencies become
 * registrations owned by this runtime instance. The core has no dependency on
 * Studio persistence, the mutable Studio registry, or editor mock data.
 */
export function createStandaloneWorkRuntimeWithHost(
  candidate: ScadaWorkPackage,
  hostRegistrations: readonly ComponentRegistration[],
): StandaloneWorkRuntime {
  const hostCapabilities = new ComponentRegistry(hostRegistrations)
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
    ...hostRegistrations,
    ...portableRegistrations,
  ])

  // Re-run Scene validation against the actual renderer/action registrations
  // that will own this runtime, rather than only the codec's validation overlay.
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
