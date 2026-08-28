import type { ComponentScalarValue } from '../component-system/definition'
import type {
  ScadaPrimaryDeviceContext,
  ScadaRuntimeValueReader,
} from './scada-behavior-contract'
import type { ScadaDslDependency } from './scada-dsl-analysis'
import type { ScadaDslEvaluationContext } from './scada-dsl-semantics'
import {
  evaluateScadaDslComponentEvent,
  evaluateScadaDslRuntimeTargets,
  getScadaDslComponentEventInteractions,
  getScadaDslComponentPropertyUpdateTargets,
  getScadaDslInitialTargets,
  getScadaDslSourceUpdateTargets,
  type ScadaDslBehaviorBranchState,
  type ScadaDslCompiledRuntime,
  type ScadaDslComponentActionEffect,
  type ScadaDslDeviceActionEffect,
  type ScadaDslRuntimeDiagnostic,
  type ScadaDslRuntimeTargets,
  type ScadaDslValueUpdate,
} from './scada-dsl-runtime'

export type ScadaDslPropagationDiagnostic = ScadaDslRuntimeDiagnostic & {
  kind: 'runtime' | 'cycle' | 'limit'
}

export type ScadaDslPropagationResult = {
  valueUpdates: readonly ScadaDslValueUpdate[]
  componentActions: readonly ScadaDslComponentActionEffect[]
  diagnostics: readonly ScadaDslPropagationDiagnostic[]
  steps: number
  aborted: boolean
}

export type ScadaDslSourcePropertyChange = {
  sourceId: string
  property: string
}

export type ScadaDslPropagationSessionOptions = {
  primaryDevice?: ScadaPrimaryDeviceContext | null
  readSourceValue: ScadaRuntimeValueReader
  readComponentBaseProperty?: (
    property: string,
  ) => ComponentScalarValue | undefined
  maxPropagationSteps?: number
}

export type ScadaDslPropagationSession = {
  initialize(): ScadaDslPropagationResult
  sourcePropertyChanged(sourceId: string, property: string): ScadaDslPropagationResult
  sourcePropertiesChanged(
    changes: readonly ScadaDslSourcePropertyChange[],
  ): ScadaDslPropagationResult
  componentPropertyChanged(property: string): ScadaDslPropagationResult
  componentEvent(event: string): {
    deviceActions: readonly ScadaDslDeviceActionEffect[]
    diagnostics: readonly ScadaDslPropagationDiagnostic[]
  }
  rebindPrimaryDevice(
    primaryDevice: ScadaPrimaryDeviceContext | null,
  ): ScadaDslPropagationResult
  getPrimaryDevice(): ScadaPrimaryDeviceContext | null
  getComponentProperty(property: string): ComponentScalarValue | undefined
  getBehaviorBranches(): ScadaDslBehaviorBranchState
  getStructuralDiagnostics(): readonly ScadaDslPropagationDiagnostic[]
  reset(): void
  dispose(): void
}

const DEFAULT_MAX_PROPAGATION_STEPS = 1024

function dependencyComponentProperty(
  dependency: ScadaDslDependency,
): string | null {
  return dependency.kind === 'component-property'
    ? dependency.property
    : null
}

/**
 * Detect Value Binding cycles before runtime propagation starts.
 *
 * A Value Binding is a graph node. If binding B reads component.a and binding
 * A writes component.a, the graph contains A -> B. Any strongly cyclic path is
 * excluded from propagation so a malformed authored program cannot oscillate
 * the Preview Runtime indefinitely. SCADA derived state is declarative; even a
 * mathematically stable cycle is treated as an authoring error rather than a
 * fixed-point program the user must reason about.
 */
function findCyclicValueBindingIds(compiled: ScadaDslCompiledRuntime) {
  const writersByProperty = new Map<string, string[]>()
  for (const binding of compiled.plan.valueBindings) {
    const writers = writersByProperty.get(binding.targetProperty) ?? []
    writers.push(binding.id)
    writersByProperty.set(binding.targetProperty, writers)
  }

  const edges = new Map<string, Set<string>>()
  for (const entry of compiled.dependencies.valueBindings) {
    const targets = edges.get(entry.id) ?? new Set<string>()
    for (const dependency of entry.triggerDependencies) {
      const property = dependencyComponentProperty(dependency)
      if (!property) continue
      for (const writerId of writersByProperty.get(property) ?? []) {
        const writerTargets = edges.get(writerId) ?? new Set<string>()
        writerTargets.add(entry.id)
        edges.set(writerId, writerTargets)
      }
    }
    edges.set(entry.id, targets)
  }

  const cyclic = new Set<string>()
  const state = new Map<string, 'visiting' | 'done'>()
  const path: string[] = []

  const visit = (id: string) => {
    const current = state.get(id)
    if (current === 'done') return
    if (current === 'visiting') {
      const cycleStart = path.lastIndexOf(id)
      for (const cycleId of path.slice(Math.max(0, cycleStart))) {
        cyclic.add(cycleId)
      }
      cyclic.add(id)
      return
    }

    state.set(id, 'visiting')
    path.push(id)
    for (const next of edges.get(id) ?? []) visit(next)
    path.pop()
    state.set(id, 'done')
  }

  for (const binding of compiled.plan.valueBindings) visit(binding.id)
  return cyclic
}

function cycleDiagnostics(
  compiled: ScadaDslCompiledRuntime,
  cyclicIds: ReadonlySet<string>,
): ScadaDslPropagationDiagnostic[] {
  return [...cyclicIds].map((id) => {
    const binding = compiled.valueBindingsById.get(id)
    return {
      kind: 'cycle' as const,
      ownerId: id,
      message: `Value Binding ${id}（component.${binding?.targetProperty ?? '?'}）存在组件 Property 循环依赖，已从传播链隔离`,
    }
  })
}

function convertRuntimeDiagnostics(
  diagnostics: readonly ScadaDslRuntimeDiagnostic[],
): ScadaDslPropagationDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    kind: 'runtime' as const,
  }))
}

export function createScadaDslPropagationSession(
  compiled: ScadaDslCompiledRuntime,
  options: ScadaDslPropagationSessionOptions,
): ScadaDslPropagationSession {
  let primaryDevice = options.primaryDevice ?? null
  let behaviorBranches: ScadaDslBehaviorBranchState = {}
  let componentValues = new Map<string, ComponentScalarValue>()
  let disposed = false

  const cyclicValueBindingIds = findCyclicValueBindingIds(compiled)
  const structuralDiagnostics = cycleDiagnostics(compiled, cyclicValueBindingIds)
  const maxPropagationSteps = options.maxPropagationSteps
    ?? DEFAULT_MAX_PROPAGATION_STEPS

  if (!Number.isInteger(maxPropagationSteps) || maxPropagationSteps <= 0) {
    throw new Error('maxPropagationSteps 必须是正整数')
  }

  function assertActive() {
    if (disposed) throw new Error('SCADA DSL propagation session 已释放')
  }

  function readComponentProperty(
    values: ReadonlyMap<string, ComponentScalarValue>,
    property: string,
  ) {
    if (values.has(property)) return values.get(property)
    return options.readComponentBaseProperty?.(property)
  }

  function getComponentProperty(property: string) {
    return readComponentProperty(componentValues, property)
  }

  function createContext(
    values: ReadonlyMap<string, ComponentScalarValue>,
  ): ScadaDslEvaluationContext {
    return {
      primaryDevice,
      readSourceValue: options.readSourceValue,
      readComponentProperty: (property) =>
        readComponentProperty(values, property),
    }
  }

  function collectSourceTargets(
    changes: readonly ScadaDslSourcePropertyChange[],
  ): ScadaDslRuntimeTargets {
    const valueBindingIds = new Set<string>()
    const behaviorIds = new Set<string>()

    for (const change of changes) {
      const targets = getScadaDslSourceUpdateTargets(
        compiled,
        change.sourceId,
        change.property,
        primaryDevice,
      )
      for (const binding of targets.valueBindings) {
        valueBindingIds.add(binding.id)
      }
      for (const behavior of targets.behaviors) {
        behaviorIds.add(behavior.id)
      }
    }

    // Preserve authored semantic-plan order rather than source-arrival order.
    return {
      valueBindings: compiled.plan.valueBindings.filter((binding) =>
        valueBindingIds.has(binding.id),
      ),
      behaviors: compiled.plan.behaviors.filter((behavior) =>
        behaviorIds.has(behavior.id),
      ),
    }
  }

  /**
   * One source/component update is propagated as a transaction:
   *
   * 1. stage every affected declarative Property until the acyclic graph is
   *    stable;
   * 2. evaluate affected Behaviors exactly once against that settled state;
   * 3. commit runtime-local Property/branch state and expose only final effects.
   *
   * If the hard propagation limit is exceeded, staged state is discarded and
   * no Property or Action effect escapes to the host.
   *
   * A Value Binding owns only a derived override. When evaluation becomes
   * unresolved, that override is explicitly removed so the effective value can
   * fall back to the host-owned authored/default layer instead of retaining a
   * stale last-known-good DSL value.
   */
  function propagate(seedTargets: ScadaDslRuntimeTargets): ScadaDslPropagationResult {
    assertActive()

    const stagedComponentValues = new Map(componentValues)
    const pendingValueIds: string[] = []
    const queuedValueIds = new Set<string>()
    const affectedBehaviorIds = new Set(
      seedTargets.behaviors.map((behavior) => behavior.id),
    )
    const finalValueUpdates = new Map<string, ScadaDslValueUpdate>()
    const diagnostics: ScadaDslPropagationDiagnostic[] = []
    let steps = 0

    const enqueueValueBinding = (id: string) => {
      if (cyclicValueBindingIds.has(id) || queuedValueIds.has(id)) return
      if (!compiled.valueBindingsById.has(id)) return
      queuedValueIds.add(id)
      pendingValueIds.push(id)
    }

    for (const binding of seedTargets.valueBindings) {
      enqueueValueBinding(binding.id)
    }

    while (pendingValueIds.length > 0) {
      if (steps >= maxPropagationSteps) {
        diagnostics.push({
          kind: 'limit',
          ownerId: 'propagation-session',
          message: `Value Binding 传播超过 ${maxPropagationSteps} 步，已回滚本次传播`,
        })
        return {
          valueUpdates: [],
          componentActions: [],
          diagnostics,
          steps,
          aborted: true,
        }
      }

      const bindingId = pendingValueIds.shift()!
      queuedValueIds.delete(bindingId)
      const binding = compiled.valueBindingsById.get(bindingId)
      if (!binding) continue
      steps += 1

      const evaluation = evaluateScadaDslRuntimeTargets(
        { valueBindings: [binding], behaviors: [] },
        createContext(stagedComponentValues),
        behaviorBranches,
      )
      diagnostics.push(...convertRuntimeDiagnostics(evaluation.diagnostics))

      const update = evaluation.valueUpdates[0]
      if (!update) continue

      const hadDerivedOverride = stagedComponentValues.has(update.property)
      const previousDerivedValue = stagedComponentValues.get(update.property)
      const previousEffectiveValue = readComponentProperty(
        stagedComponentValues,
        update.property,
      )

      if (update.value === undefined) {
        if (!hadDerivedOverride) continue
        stagedComponentValues.delete(update.property)
      } else {
        if (hadDerivedOverride && Object.is(previousDerivedValue, update.value)) {
          continue
        }
        stagedComponentValues.set(update.property, update.value)
      }

      // Host integration needs ownership changes too. A newly established
      // derived override whose value equals the current base still matters, as
      // does releasing an override back to the base layer.
      finalValueUpdates.set(update.property, update)

      const nextEffectiveValue = readComponentProperty(
        stagedComponentValues,
        update.property,
      )
      if (Object.is(previousEffectiveValue, nextEffectiveValue)) continue

      const downstream = getScadaDslComponentPropertyUpdateTargets(
        compiled,
        update.property,
      )
      for (const nextBinding of downstream.valueBindings) {
        enqueueValueBinding(nextBinding.id)
      }
      for (const behavior of downstream.behaviors) {
        affectedBehaviorIds.add(behavior.id)
      }
    }

    let componentActions: readonly ScadaDslComponentActionEffect[] = []
    let nextBehaviorBranches = behaviorBranches

    if (affectedBehaviorIds.size > 0) {
      const behaviors = [...affectedBehaviorIds]
        .map((id) => compiled.behaviorsById.get(id))
        .filter((behavior): behavior is NonNullable<typeof behavior> => Boolean(behavior))
      const evaluation = evaluateScadaDslRuntimeTargets(
        { valueBindings: [], behaviors },
        createContext(stagedComponentValues),
        behaviorBranches,
      )
      nextBehaviorBranches = evaluation.nextBehaviorBranches
      diagnostics.push(...convertRuntimeDiagnostics(evaluation.diagnostics))
      componentActions = evaluation.componentActions
    }

    componentValues = stagedComponentValues
    behaviorBranches = nextBehaviorBranches

    return {
      valueUpdates: [...finalValueUpdates.values()],
      componentActions,
      diagnostics,
      steps,
      aborted: false,
    }
  }

  return {
    initialize() {
      assertActive()
      const result = propagate(getScadaDslInitialTargets(compiled))
      return {
        ...result,
        diagnostics: [...structuralDiagnostics, ...result.diagnostics],
      }
    },

    sourcePropertyChanged(sourceId, property) {
      assertActive()
      return propagate(collectSourceTargets([{ sourceId, property }]))
    },

    sourcePropertiesChanged(changes) {
      assertActive()
      return propagate(collectSourceTargets(changes))
    },

    componentPropertyChanged(property) {
      assertActive()
      return propagate(
        getScadaDslComponentPropertyUpdateTargets(compiled, property),
      )
    },

    componentEvent(event) {
      assertActive()
      if (getScadaDslComponentEventInteractions(compiled, event).length === 0) {
        return { deviceActions: [], diagnostics: [] }
      }
      const evaluation = evaluateScadaDslComponentEvent(
        compiled,
        event,
        createContext(componentValues),
      )
      return {
        deviceActions: evaluation.deviceActions,
        diagnostics: convertRuntimeDiagnostics(evaluation.diagnostics),
      }
    },

    rebindPrimaryDevice(nextPrimaryDevice) {
      assertActive()

      const previousPrimaryDevice = primaryDevice
      const previousBehaviorBranches = behaviorBranches
      const previousComponentValues = componentValues

      // Rebind is a fresh derivation against the next Primary Device. Carrying
      // the old override map into this transaction would let unresolved new
      // source values silently inherit old-device derived state.
      primaryDevice = nextPrimaryDevice
      behaviorBranches = {}
      componentValues = new Map<string, ComponentScalarValue>()

      let result: ScadaDslPropagationResult
      try {
        result = propagate(getScadaDslInitialTargets(compiled))
      } catch (error) {
        primaryDevice = previousPrimaryDevice
        behaviorBranches = previousBehaviorBranches
        componentValues = previousComponentValues
        throw error
      }

      if (result.aborted) {
        primaryDevice = previousPrimaryDevice
        behaviorBranches = previousBehaviorBranches
        componentValues = previousComponentValues
        return result
      }

      const nextComponentValues = componentValues
      const valueUpdates: ScadaDslValueUpdate[] = []

      // Propagation above evaluated the whole fresh program. Expose only the
      // ownership/value delta between the previously committed device state and
      // the new committed device state, including explicit invalidations.
      for (const binding of compiled.plan.valueBindings) {
        const property = binding.targetProperty
        const hadPrevious = previousComponentValues.has(property)
        const hasNext = nextComponentValues.has(property)

        if (hadPrevious && !hasNext) {
          valueUpdates.push({
            bindingId: binding.id,
            property,
            value: undefined,
          })
          continue
        }

        if (!hasNext) continue
        const nextValue = nextComponentValues.get(property)!
        if (
          !hadPrevious ||
          !Object.is(previousComponentValues.get(property), nextValue)
        ) {
          valueUpdates.push({
            bindingId: binding.id,
            property,
            value: nextValue,
          })
        }
      }

      return {
        ...result,
        valueUpdates,
      }
    },

    getPrimaryDevice() {
      assertActive()
      return primaryDevice
    },

    getComponentProperty(property) {
      assertActive()
      return getComponentProperty(property)
    },

    getBehaviorBranches() {
      assertActive()
      return behaviorBranches
    },

    getStructuralDiagnostics() {
      assertActive()
      return structuralDiagnostics
    },

    reset() {
      assertActive()
      componentValues.clear()
      behaviorBranches = {}
    },

    dispose() {
      componentValues.clear()
      behaviorBranches = {}
      disposed = true
    },
  }
}
