import type { ComponentScalarValue } from '../component-system/definition'
import type { ScadaPrimaryDeviceContext } from './scada-behavior-contract'
import {
  evaluateScadaDslSemanticExpression,
  type ScadaDslEvaluationContext,
} from './scada-dsl-semantics'
import {
  evaluateScadaDslComponentEvent,
  evaluateScadaDslRuntimeTargets,
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

export type ScadaDslPropagationSessionOptions = {
  getPrimaryDevice: () => ScadaPrimaryDeviceContext | null
  readSourceValue: (
    sourceId: string,
    property: string,
  ) => ComponentScalarValue | undefined
  readComponentProperty: (
    property: string,
  ) => ComponentScalarValue | undefined
  maxPropagationSteps?: number
}

export type ScadaDslPropagationResult = {
  committed: boolean
  valueUpdates: readonly ScadaDslValueUpdate[]
  componentActions: readonly ScadaDslComponentActionEffect[]
  diagnostics: readonly ScadaDslRuntimeDiagnostic[]
}

export type ScadaDslComponentEventResult = {
  deviceActions: readonly ScadaDslDeviceActionEffect[]
  diagnostics: readonly ScadaDslRuntimeDiagnostic[]
}

const DEFAULT_MAX_PROPAGATION_STEPS = 256

function scalarKey(value: ComponentScalarValue | undefined) {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  return `${typeof value}:${String(value)}`
}

function sameScalar(
  left: ComponentScalarValue | undefined,
  right: ComponentScalarValue | undefined,
) {
  return Object.is(left, right)
}

function mergeTargets(
  output: {
    valueBindingIds: Set<string>
    behaviorIds: Set<string>
  },
  targets: ScadaDslRuntimeTargets,
) {
  for (const binding of targets.valueBindings) {
    output.valueBindingIds.add(binding.id)
  }
  for (const behavior of targets.behaviors) {
    output.behaviorIds.add(behavior.id)
  }
}

/**
 * Host-owned propagation lifecycle for one component instance.
 *
 * Value Bindings are evaluated to a stable staged component state first.
 * Behaviors are evaluated only after that state settles, so Actions never see
 * an intermediate derived-property value. The session owns only runtime state:
 * derived Property values and active Behavior branch ids. Device/renderer side
 * effects remain outside this class.
 */
export class ScadaDslPropagationSession {
  private readonly compiled: ScadaDslCompiledRuntime
  private readonly options: ScadaDslPropagationSessionOptions
  private readonly maxPropagationSteps: number
  private derivedValues = new Map<string, ComponentScalarValue>()
  private behaviorBranches: ScadaDslBehaviorBranchState = {}
  private disposed = false

  constructor(
    compiled: ScadaDslCompiledRuntime,
    options: ScadaDslPropagationSessionOptions,
  ) {
    const maxPropagationSteps =
      options.maxPropagationSteps ?? DEFAULT_MAX_PROPAGATION_STEPS
    if (!Number.isInteger(maxPropagationSteps) || maxPropagationSteps <= 0) {
      throw new Error('maxPropagationSteps 必须是大于 0 的整数')
    }

    this.compiled = compiled
    this.options = options
    this.maxPropagationSteps = maxPropagationSteps
  }

  private assertActive() {
    if (this.disposed) {
      throw new Error('SCADA DSL propagation session 已被 dispose')
    }
  }

  private createContext(
    stagedValues: ReadonlyMap<string, ComponentScalarValue>,
  ): ScadaDslEvaluationContext {
    return {
      primaryDevice: this.options.getPrimaryDevice(),
      readSourceValue: this.options.readSourceValue,
      readComponentProperty: (property) =>
        stagedValues.get(property) ?? this.options.readComponentProperty(property),
    }
  }

  private propagate(initialTargets: ScadaDslRuntimeTargets) {
    this.assertActive()

    const stagedValues = new Map(this.derivedValues)
    const pendingBindingIds: string[] = []
    const pendingBindingSet = new Set<string>()
    const triggeredBehaviorIds = new Set<string>()
    const finalUpdates = new Map<string, ScadaDslValueUpdate>()
    const diagnostics: ScadaDslRuntimeDiagnostic[] = []
    const seenTransitions = new Set<string>()
    let steps = 0

    const enqueueBinding = (id: string) => {
      if (pendingBindingSet.has(id)) return
      pendingBindingSet.add(id)
      pendingBindingIds.push(id)
    }

    const includeTargets = (targets: ScadaDslRuntimeTargets) => {
      for (const binding of targets.valueBindings) enqueueBinding(binding.id)
      for (const behavior of targets.behaviors) {
        triggeredBehaviorIds.add(behavior.id)
      }
    }

    includeTargets(initialTargets)

    while (pendingBindingIds.length > 0) {
      const bindingId = pendingBindingIds.shift()!
      pendingBindingSet.delete(bindingId)
      const binding = this.compiled.valueBindingsById.get(bindingId)
      if (!binding) continue

      steps += 1
      if (steps > this.maxPropagationSteps) {
        diagnostics.push({
          ownerId: bindingId,
          message: `Value Binding 传播超过 ${this.maxPropagationSteps} 步，疑似存在未收敛的循环依赖；本次传播已回滚`,
        })
        return {
          committed: false as const,
          valueUpdates: [] as const,
          componentActions: [] as const,
          diagnostics,
        }
      }

      const context = this.createContext(stagedValues)
      const value = evaluateScadaDslSemanticExpression(binding.expression, context)
      if (value === undefined) {
        diagnostics.push({
          ownerId: binding.id,
          message: `Value Binding ${binding.id} 当前无法求值`,
        })
        continue
      }

      const previous = stagedValues.get(binding.targetProperty) ??
        this.options.readComponentProperty(binding.targetProperty)
      if (sameScalar(previous, value)) continue

      const transitionKey = [
        binding.id,
        binding.targetProperty,
        scalarKey(previous),
        scalarKey(value),
      ].join('\u0000')
      if (seenTransitions.has(transitionKey)) {
        diagnostics.push({
          ownerId: binding.id,
          message: `Value Binding ${binding.id} 重复产生相同状态跃迁，检测到循环/振荡依赖；本次传播已回滚`,
        })
        return {
          committed: false as const,
          valueUpdates: [] as const,
          componentActions: [] as const,
          diagnostics,
        }
      }
      seenTransitions.add(transitionKey)

      stagedValues.set(binding.targetProperty, value)
      finalUpdates.set(binding.targetProperty, {
        bindingId: binding.id,
        property: binding.targetProperty,
        value,
      })

      includeTargets(
        getScadaDslComponentPropertyUpdateTargets(
          this.compiled,
          binding.targetProperty,
        ),
      )
    }

    const behaviorTargets: ScadaDslRuntimeTargets = {
      valueBindings: [],
      behaviors: [...triggeredBehaviorIds]
        .map((id) => this.compiled.behaviorsById.get(id))
        .filter((behavior) => behavior !== undefined),
    }
    const behaviorEvaluation = evaluateScadaDslRuntimeTargets(
      behaviorTargets,
      this.createContext(stagedValues),
      this.behaviorBranches,
    )

    diagnostics.push(...behaviorEvaluation.diagnostics)
    this.derivedValues = stagedValues
    this.behaviorBranches = behaviorEvaluation.nextBehaviorBranches

    return {
      committed: true as const,
      valueUpdates: [...finalUpdates.values()],
      componentActions: behaviorEvaluation.componentActions,
      diagnostics,
    }
  }

  initialize(): ScadaDslPropagationResult {
    return this.propagate(getScadaDslInitialTargets(this.compiled))
  }

  handleSourceUpdate(
    sourceId: string,
    property: string,
  ): ScadaDslPropagationResult {
    this.assertActive()
    return this.propagate(
      getScadaDslSourceUpdateTargets(
        this.compiled,
        sourceId,
        property,
        this.options.getPrimaryDevice(),
      ),
    )
  }

  handleComponentPropertyUpdate(
    property: string,
  ): ScadaDslPropagationResult {
    this.assertActive()
    return this.propagate(
      getScadaDslComponentPropertyUpdateTargets(this.compiled, property),
    )
  }

  handleComponentEvent(event: string): ScadaDslComponentEventResult {
    this.assertActive()
    return evaluateScadaDslComponentEvent(
      this.compiled,
      event,
      this.createContext(this.derivedValues),
    )
  }

  getDerivedProperty(property: string) {
    this.assertActive()
    return this.derivedValues.get(property)
  }

  reset() {
    this.assertActive()
    this.derivedValues.clear()
    this.behaviorBranches = {}
  }

  dispose() {
    this.derivedValues.clear()
    this.behaviorBranches = {}
    this.disposed = true
  }
}

export function createScadaDslPropagationSession(
  compiled: ScadaDslCompiledRuntime,
  options: ScadaDslPropagationSessionOptions,
) {
  return new ScadaDslPropagationSession(compiled, options)
}
