import type { ComponentScalarValue } from '../component-system/definition'
import {
  resolveScadaDeviceActionReference,
  type ScadaPrimaryDeviceContext,
} from './scada-behavior-contract'
import {
  extractScadaDslDependencies,
  type ScadaDslDependency,
  type ScadaDslDependencyIndex,
} from './scada-dsl-analysis'
import {
  evaluateScadaDslSemanticExpression,
  selectScadaDslBehaviorBranch,
  shouldFireScadaDslBehaviorBranch,
  type ScadaDslBehaviorPlan,
  type ScadaDslEvaluationContext,
  type ScadaDslInteractionPlan,
  type ScadaDslSemanticExpression,
  type ScadaDslSemanticPlan,
  type ScadaDslValueBindingPlan,
} from './scada-dsl-semantics'

export type ScadaDslRuntimeTargets = {
  valueBindings: readonly ScadaDslValueBindingPlan[]
  behaviors: readonly ScadaDslBehaviorPlan[]
}

type MutableRuntimeTargetIds = {
  valueBindingIds: Set<string>
  behaviorIds: Set<string>
}

type RuntimeTargetIds = {
  valueBindingIds: readonly string[]
  behaviorIds: readonly string[]
}

export type ScadaDslCompiledRuntime = {
  plan: ScadaDslSemanticPlan
  dependencies: ScadaDslDependencyIndex
  primarySourceTriggers: ReadonlyMap<string, RuntimeTargetIds>
  externalSourceTriggers: ReadonlyMap<string, RuntimeTargetIds>
  componentPropertyTriggers: ReadonlyMap<string, RuntimeTargetIds>
  interactionsByEvent: ReadonlyMap<string, readonly ScadaDslInteractionPlan[]>
  valueBindingsById: ReadonlyMap<string, ScadaDslValueBindingPlan>
  behaviorsById: ReadonlyMap<string, ScadaDslBehaviorPlan>
}

function createMutableTargetIds(): MutableRuntimeTargetIds {
  return {
    valueBindingIds: new Set<string>(),
    behaviorIds: new Set<string>(),
  }
}

function addTargetId(
  map: Map<string, MutableRuntimeTargetIds>,
  key: string,
  kind: 'value-binding' | 'behavior',
  id: string,
) {
  let entry = map.get(key)
  if (!entry) {
    entry = createMutableTargetIds()
    map.set(key, entry)
  }

  if (kind === 'value-binding') {
    entry.valueBindingIds.add(id)
  } else {
    entry.behaviorIds.add(id)
  }
}

function addDependencyTrigger(
  maps: {
    primary: Map<string, MutableRuntimeTargetIds>
    external: Map<string, MutableRuntimeTargetIds>
    component: Map<string, MutableRuntimeTargetIds>
  },
  dependency: ScadaDslDependency,
  kind: 'value-binding' | 'behavior',
  id: string,
) {
  if (dependency.kind === 'component-property') {
    addTargetId(maps.component, dependency.property, kind, id)
    return
  }

  const reference = dependency.reference
  if (reference.scope === 'primary-device') {
    addTargetId(maps.primary, reference.property, kind, id)
    return
  }

  addTargetId(
    maps.external,
    `${reference.sourceId}\u0000${reference.property}`,
    kind,
    id,
  )
}

function freezeTargetMap(
  source: Map<string, MutableRuntimeTargetIds>,
): ReadonlyMap<string, RuntimeTargetIds> {
  const output = new Map<string, RuntimeTargetIds>()
  for (const [key, value] of source) {
    output.set(key, {
      valueBindingIds: [...value.valueBindingIds],
      behaviorIds: [...value.behaviorIds],
    })
  }
  return output
}

export function compileScadaDslRuntime(
  plan: ScadaDslSemanticPlan,
): ScadaDslCompiledRuntime {
  const dependencies = extractScadaDslDependencies(plan)
  const primary = new Map<string, MutableRuntimeTargetIds>()
  const external = new Map<string, MutableRuntimeTargetIds>()
  const component = new Map<string, MutableRuntimeTargetIds>()

  for (const entry of dependencies.valueBindings) {
    for (const dependency of entry.triggerDependencies) {
      addDependencyTrigger(
        { primary, external, component },
        dependency,
        'value-binding',
        entry.id,
      )
    }
  }

  for (const entry of dependencies.behaviors) {
    for (const dependency of entry.triggerDependencies) {
      addDependencyTrigger(
        { primary, external, component },
        dependency,
        'behavior',
        entry.id,
      )
    }
  }

  const interactionsByEvent = new Map<string, ScadaDslInteractionPlan[]>()
  for (const interaction of plan.interactions) {
    const entries = interactionsByEvent.get(interaction.event) ?? []
    entries.push(interaction)
    interactionsByEvent.set(interaction.event, entries)
  }

  return {
    plan,
    dependencies,
    primarySourceTriggers: freezeTargetMap(primary),
    externalSourceTriggers: freezeTargetMap(external),
    componentPropertyTriggers: freezeTargetMap(component),
    interactionsByEvent,
    valueBindingsById: new Map(
      plan.valueBindings.map((binding) => [binding.id, binding]),
    ),
    behaviorsById: new Map(
      plan.behaviors.map((behavior) => [behavior.id, behavior]),
    ),
  }
}

function collectTargets(
  compiled: ScadaDslCompiledRuntime,
  entries: readonly (RuntimeTargetIds | undefined)[],
): ScadaDslRuntimeTargets {
  const valueIds = new Set<string>()
  const behaviorIds = new Set<string>()

  for (const entry of entries) {
    if (!entry) continue
    for (const id of entry.valueBindingIds) valueIds.add(id)
    for (const id of entry.behaviorIds) behaviorIds.add(id)
  }

  return {
    valueBindings: [...valueIds]
      .map((id) => compiled.valueBindingsById.get(id))
      .filter((binding): binding is ScadaDslValueBindingPlan => Boolean(binding)),
    behaviors: [...behaviorIds]
      .map((id) => compiled.behaviorsById.get(id))
      .filter((behavior): behavior is ScadaDslBehaviorPlan => Boolean(behavior)),
  }
}

/**
 * Route one concrete source update through the relative runtime index.
 *
 * Primary-device references are matched only when the changed source is the
 * component instance's current primary device. External references remain
 * stable and continue to match their authored source id after copy/rebind.
 */
export function getScadaDslSourceUpdateTargets(
  compiled: ScadaDslCompiledRuntime,
  sourceId: string,
  property: string,
  primaryDevice: ScadaPrimaryDeviceContext | null,
): ScadaDslRuntimeTargets {
  const external = compiled.externalSourceTriggers.get(
    `${sourceId}\u0000${property}`,
  )
  const primary = primaryDevice?.deviceId === sourceId
    ? compiled.primarySourceTriggers.get(property)
    : undefined

  return collectTargets(compiled, [external, primary])
}

export function getScadaDslComponentPropertyUpdateTargets(
  compiled: ScadaDslCompiledRuntime,
  property: string,
): ScadaDslRuntimeTargets {
  return collectTargets(compiled, [compiled.componentPropertyTriggers.get(property)])
}

export function getScadaDslInitialTargets(
  compiled: ScadaDslCompiledRuntime,
): ScadaDslRuntimeTargets {
  return {
    valueBindings: compiled.plan.valueBindings,
    behaviors: compiled.plan.behaviors,
  }
}

export function getScadaDslComponentEventInteractions(
  compiled: ScadaDslCompiledRuntime,
  event: string,
): readonly ScadaDslInteractionPlan[] {
  return compiled.interactionsByEvent.get(event) ?? []
}

export type ScadaDslBehaviorBranchState = Readonly<Record<string, string | null>>

export type ScadaDslValueUpdate = {
  bindingId: string
  property: string
  value: ComponentScalarValue
}

export type ScadaDslComponentActionEffect = {
  behaviorId: string
  branchId: string
  action: string
  arguments: readonly ComponentScalarValue[]
}

export type ScadaDslDeviceActionEffect = {
  interactionId: string
  sourceId: string
  action: string
  arguments: readonly ComponentScalarValue[]
}

export type ScadaDslRuntimeDiagnostic = {
  ownerId: string
  message: string
}

export type ScadaDslRuntimeEvaluation = {
  valueUpdates: readonly ScadaDslValueUpdate[]
  componentActions: readonly ScadaDslComponentActionEffect[]
  nextBehaviorBranches: ScadaDslBehaviorBranchState
  diagnostics: readonly ScadaDslRuntimeDiagnostic[]
}

function evaluateArguments(
  ownerId: string,
  expressions: readonly ScadaDslSemanticExpression[],
  context: ScadaDslEvaluationContext,
  diagnostics: ScadaDslRuntimeDiagnostic[],
): readonly ComponentScalarValue[] | null {
  const values: ComponentScalarValue[] = []

  for (const expression of expressions) {
    const value = evaluateScadaDslSemanticExpression(expression, context)
    if (value === undefined) {
      diagnostics.push({
        ownerId,
        message: 'Action 参数当前无法求值，本次 Action 不执行',
      })
      return null
    }
    values.push(value)
  }

  return values
}

/**
 * Evaluate only the plans selected by the compiled trigger index.
 *
 * This function is side-effect free. The host applies returned Property
 * updates and Component Action effects, which keeps renderer/device access out
 * of the DSL runtime core.
 */
export function evaluateScadaDslRuntimeTargets(
  targets: ScadaDslRuntimeTargets,
  context: ScadaDslEvaluationContext,
  previousBehaviorBranches: ScadaDslBehaviorBranchState = {},
): ScadaDslRuntimeEvaluation {
  const valueUpdates: ScadaDslValueUpdate[] = []
  const componentActions: ScadaDslComponentActionEffect[] = []
  const diagnostics: ScadaDslRuntimeDiagnostic[] = []
  const nextBehaviorBranches: Record<string, string | null> = {
    ...previousBehaviorBranches,
  }

  for (const binding of targets.valueBindings) {
    const value = evaluateScadaDslSemanticExpression(binding.expression, context)
    if (value === undefined) {
      diagnostics.push({
        ownerId: binding.id,
        message: `Value Binding ${binding.id} 当前无法求值`,
      })
      continue
    }

    valueUpdates.push({
      bindingId: binding.id,
      property: binding.targetProperty,
      value,
    })
  }

  for (const behavior of targets.behaviors) {
    const previousBranchId = previousBehaviorBranches[behavior.id] ?? null
    const branch = selectScadaDslBehaviorBranch(behavior, context)
    const currentBranchId = branch?.id ?? null
    nextBehaviorBranches[behavior.id] = currentBranchId

    if (!branch || !shouldFireScadaDslBehaviorBranch(
      previousBranchId,
      currentBranchId,
    )) {
      continue
    }

    for (const action of branch.actions) {
      const args = evaluateArguments(
        behavior.id,
        action.arguments,
        context,
        diagnostics,
      )
      if (!args) continue

      componentActions.push({
        behaviorId: behavior.id,
        branchId: branch.id,
        action: action.action,
        arguments: args,
      })
    }
  }

  return {
    valueUpdates,
    componentActions,
    nextBehaviorBranches,
    diagnostics,
  }
}

export type ScadaDslInteractionEvaluation = {
  deviceActions: readonly ScadaDslDeviceActionEffect[]
  diagnostics: readonly ScadaDslRuntimeDiagnostic[]
}

/**
 * Resolve exactly the Interaction bindings for one Component Event. Device
 * side effects remain host-owned; this function only prepares validated,
 * concrete device Action effects for the host to dispatch.
 */
export function evaluateScadaDslComponentEvent(
  compiled: ScadaDslCompiledRuntime,
  event: string,
  context: ScadaDslEvaluationContext,
): ScadaDslInteractionEvaluation {
  const deviceActions: ScadaDslDeviceActionEffect[] = []
  const diagnostics: ScadaDslRuntimeDiagnostic[] = []

  for (const interaction of getScadaDslComponentEventInteractions(compiled, event)) {
    const target = resolveScadaDeviceActionReference(
      interaction.action.target,
      context.primaryDevice,
    )
    if (!target) {
      diagnostics.push({
        ownerId: interaction.id,
        message: 'Interaction 需要 Primary Device，但当前组件实例尚未绑定设备',
      })
      continue
    }

    const args = evaluateArguments(
      interaction.id,
      interaction.action.arguments,
      context,
      diagnostics,
    )
    if (!args) continue

    deviceActions.push({
      interactionId: interaction.id,
      sourceId: target.sourceId,
      action: target.action,
      arguments: args,
    })
  }

  return { deviceActions, diagnostics }
}
