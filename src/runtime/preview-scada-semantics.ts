import type { ComponentScalarValue } from '../component-system/definition'
import type { ScadaPrimaryDeviceContext } from '../scene/scada-behavior-contract'
import {
  createScadaDslPropagationSession,
  type ScadaDslPropagationDiagnostic,
  type ScadaDslPropagationResult,
  type ScadaDslSourcePropertyChange,
} from '../scene/scada-dsl-propagation-session'
import type {
  ScadaDslCompiledRuntime,
  ScadaDslDeviceActionEffect,
} from '../scene/scada-dsl-runtime'
import type { PreviewRuntime } from './preview-runtime'
import type { RuntimeValueSnapshot } from './runtime-value-store'

export type PreviewScadaSourceValueKey = (
  sourceId: string,
  property: string,
) => string

export type PreviewScadaDeviceActionDispatcher = (
  effect: ScadaDslDeviceActionEffect,
) => void

export type PreviewScadaSemanticsOptions = {
  primaryDevice?: ScadaPrimaryDeviceContext | null
  sourceValueKey?: PreviewScadaSourceValueKey
  maxPropagationSteps?: number
  dispatchDeviceAction?: PreviewScadaDeviceActionDispatcher
  onDiagnostics?: (
    diagnostics: readonly ScadaDslPropagationDiagnostic[],
  ) => void
}

export type PreviewScadaSemanticsAttachment = {
  getPrimaryDevice(): ScadaPrimaryDeviceContext | null
  rebindPrimaryDevice(
    primaryDevice: ScadaPrimaryDeviceContext | null,
  ): ScadaDslPropagationResult
  componentPropertyChanged(property: string): ScadaDslPropagationResult
  dispose(): void
}

type SourceReference = {
  sourceId: string
  property: string
}

export function createPreviewScadaRuntimeValueKey(
  sourceId: string,
  property: string,
) {
  return `${sourceId}:${property}`
}

function hasOwn(snapshot: RuntimeValueSnapshot, key: string) {
  return Object.hasOwn(snapshot, key)
}

function splitExternalTriggerKey(key: string): SourceReference {
  const separator = key.indexOf('\u0000')
  if (separator < 0) {
    throw new Error(`Invalid compiled external source trigger key: ${key}`)
  }
  return {
    sourceId: key.slice(0, separator),
    property: key.slice(separator + 1),
  }
}

function collectTrackedSourceReferences(
  compiled: ScadaDslCompiledRuntime,
  primaryDevice: ScadaPrimaryDeviceContext | null,
) {
  const references = new Map<string, SourceReference>()

  if (primaryDevice) {
    for (const property of compiled.primarySourceTriggers.keys()) {
      const reference = {
        sourceId: primaryDevice.deviceId,
        property,
      }
      references.set(`${reference.sourceId}\u0000${property}`, reference)
    }
  }

  for (const key of compiled.externalSourceTriggers.keys()) {
    const reference = splitExternalTriggerKey(key)
    references.set(key, reference)
  }

  return [...references.values()]
}

function findChangedSourceProperties(
  compiled: ScadaDslCompiledRuntime,
  primaryDevice: ScadaPrimaryDeviceContext | null,
  previous: RuntimeValueSnapshot,
  next: RuntimeValueSnapshot,
  sourceValueKey: PreviewScadaSourceValueKey,
): ScadaDslSourcePropertyChange[] {
  const changes: ScadaDslSourcePropertyChange[] = []

  for (const reference of collectTrackedSourceReferences(
    compiled,
    primaryDevice,
  )) {
    const key = sourceValueKey(reference.sourceId, reference.property)
    const hadPrevious = hasOwn(previous, key)
    const hasNext = hasOwn(next, key)

    if (
      hadPrevious !== hasNext ||
      (hasNext && !Object.is(previous[key], next[key]))
    ) {
      changes.push(reference)
    }
  }

  return changes
}

/**
 * Narrow M6.5.9C bridge between an already-validated compiled SCADA program and
 * one live Preview component instance.
 *
 * This adapter deliberately does not persist DSL text or semantic plans into
 * Scene v6. It only owns the runtime attachment lifecycle:
 *
 * RuntimeValueStore publication
 *   -> compiled dependency diff
 *   -> one transactional propagation batch
 *   -> ComponentPropertyStore derived commit
 *   -> Component Action effects against the same settled snapshot
 *
 * Component Events are routed through Interaction Bindings while the node is
 * claimed, so legacy Scene v6 Event -> Component Action behavior cannot fire in
 * parallel. Device/Platform Action effects remain host-owned and are forwarded
 * to the narrow dispatcher callback without inventing the typed contract that
 * belongs to M6.5.10.
 */
export function attachPreviewScadaSemantics(
  runtime: PreviewRuntime,
  nodeId: string,
  compiled: ScadaDslCompiledRuntime,
  options: PreviewScadaSemanticsOptions = {},
): PreviewScadaSemanticsAttachment {
  if (!runtime.isRunning) {
    throw new Error('Preview runtime must be running before SCADA semantics attach')
  }

  if (compiled.plan.interactions.length > 0 && !options.dispatchDeviceAction) {
    throw new Error(
      'Compiled SCADA interactions require a Preview device-action dispatcher',
    )
  }

  const sourceValueKey =
    options.sourceValueKey ?? createPreviewScadaRuntimeValueKey
  const releaseCompiledClaim = runtime.claimCompiledSemantics(nodeId)
  let disposed = false
  let previousRuntimeValues = runtime.values.getSnapshot()

  const readSourceValue = (
    sourceId: string,
    property: string,
  ): ComponentScalarValue | undefined => {
    const snapshot = runtime.values.getSnapshot()
    const key = sourceValueKey(sourceId, property)
    return hasOwn(snapshot, key) ? snapshot[key] : undefined
  }

  const session = createScadaDslPropagationSession(compiled, {
    primaryDevice: options.primaryDevice ?? null,
    readSourceValue,
    readComponentBaseProperty(property) {
      return runtime.componentProps.getNodeBaseSnapshot(nodeId)[property]
    },
    maxPropagationSteps: options.maxPropagationSteps,
  })

  const reportDiagnostics = (
    diagnostics: readonly ScadaDslPropagationDiagnostic[],
  ) => {
    if (diagnostics.length > 0) options.onDiagnostics?.(diagnostics)
  }

  const applyPropagationResult = (result: ScadaDslPropagationResult) => {
    reportDiagnostics(result.diagnostics)
    if (result.aborted) return result

    // All derived ownership/value changes become visible as one host commit
    // before any Component Action runs. Action handlers therefore read exactly
    // the same settled snapshot as the Renderer subscription.
    runtime.componentProps.commitDerivedUpdates(nodeId, result.valueUpdates)

    for (const effect of result.componentActions) {
      // M6.5.10 owns the typed Action/Event input contract. Do not guess how a
      // positional DSL argument list maps into today's single unknown input.
      if (effect.arguments.length > 0) {
        reportDiagnostics([
          {
            kind: 'runtime',
            ownerId: effect.behaviorId,
            message:
              '带参数 Component Action 暂不由 Preview bridge 执行；等待 M6.5.10 typed Action contract',
          },
        ])
        continue
      }
      runtime.invokeAction(nodeId, effect.action)
    }

    return result
  }

  const unsubscribeValues = runtime.values.subscribe(() => {
    if (disposed) return

    const nextRuntimeValues = runtime.values.getSnapshot()
    const changes = findChangedSourceProperties(
      compiled,
      session.getPrimaryDevice(),
      previousRuntimeValues,
      nextRuntimeValues,
      sourceValueKey,
    )
    previousRuntimeValues = nextRuntimeValues

    if (changes.length === 0) return
    applyPropagationResult(session.sourcePropertiesChanged(changes))
  })

  const unsubscribeEvents = runtime.subscribeEvents((event) => {
    if (disposed || event.nodeId !== nodeId) return

    const result = session.componentEvent(event.eventName)
    reportDiagnostics(result.diagnostics)
    for (const effect of result.deviceActions) {
      options.dispatchDeviceAction?.(effect)
    }
  })

  const cleanup = (clearDerivedOverrides: boolean) => {
    if (disposed) return
    disposed = true
    unsubscribeValues()
    unsubscribeEvents()
    session.dispose()
    if (clearDerivedOverrides && runtime.isRunning) {
      runtime.componentProps.clearDerivedOverrides(nodeId)
    }
    releaseCompiledClaim()
  }

  try {
    const initial = applyPropagationResult(session.initialize())
    if (initial.aborted) {
      cleanup(true)
      throw new Error('Initial SCADA Preview propagation aborted')
    }
  } catch (error) {
    cleanup(true)
    throw error
  }

  return {
    getPrimaryDevice() {
      if (disposed) throw new Error('Preview SCADA semantics attachment is disposed')
      return session.getPrimaryDevice()
    },

    rebindPrimaryDevice(primaryDevice) {
      if (disposed) throw new Error('Preview SCADA semantics attachment is disposed')
      return applyPropagationResult(session.rebindPrimaryDevice(primaryDevice))
    },

    componentPropertyChanged(property) {
      if (disposed) throw new Error('Preview SCADA semantics attachment is disposed')
      return applyPropagationResult(session.componentPropertyChanged(property))
    },

    dispose() {
      cleanup(true)
    },
  }
}
