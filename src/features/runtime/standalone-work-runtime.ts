import { builtInComponentRegistrations } from '../../component-system/builtins'
import { ComponentRegistry } from '../../component-system/registry'
import { parseScadaWorkPackageDocument } from '../scada-works/scada-work-package'
import {
  createStandaloneWorkRuntimeWithHost,
  type StandaloneWorkRuntime,
} from './standalone-work-runtime-core'

export type { StandaloneWorkRuntime } from './standalone-work-runtime-core'

function createHostCapabilities() {
  return new ComponentRegistry(builtInComponentRegistrations)
}

/** Browser host wiring for the standalone runtime route. */
export function createStandaloneWorkRuntime(
  candidate: StandaloneWorkRuntime['workPackage'],
): StandaloneWorkRuntime {
  return createStandaloneWorkRuntimeWithHost(
    candidate,
    builtInComponentRegistrations,
  )
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
