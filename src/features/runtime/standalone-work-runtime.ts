import { builtInComponentRegistrations } from '../../component-system/builtins'
import { ComponentRegistry } from '../../component-system/registry'
import { parseScadaWorkPackageDocument } from '../scada-works/scada-work-package'
import {
  createStandaloneWorkRuntimeWithHost,
  type StandaloneRuntimeHostOptions,
  type StandaloneWorkRuntime,
} from './standalone-work-runtime-core'

export type {
  StandaloneRuntimeHostOptions,
  StandaloneWorkRuntime,
} from './standalone-work-runtime-core'

function createHostCapabilities() {
  return new ComponentRegistry(builtInComponentRegistrations)
}

/** Browser host wiring for the standalone runtime route. */
export function createStandaloneWorkRuntime(
  candidate: StandaloneWorkRuntime['workPackage'],
  options: StandaloneRuntimeHostOptions = {},
): StandaloneWorkRuntime {
  return createStandaloneWorkRuntimeWithHost(
    candidate,
    builtInComponentRegistrations,
    options,
  )
}

export function parseStandaloneWorkRuntimeDocument(
  raw: string,
  options: StandaloneRuntimeHostOptions = {},
): StandaloneWorkRuntime | null {
  const candidate = parseScadaWorkPackageDocument(raw, createHostCapabilities())
  if (!candidate) return null

  try {
    return createStandaloneWorkRuntime(candidate, options)
  } catch {
    return null
  }
}
