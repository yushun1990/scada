import {
  checkScadaDslTypes,
  extractScadaDslDependencies,
  type ScadaDslDependency,
} from './scada-dsl-analysis'
import {
  parseScadaDsl,
  type ScadaDslCapabilityCatalog,
  type ScadaDslProgram,
  type ScadaDslSpan,
} from './scada-dsl'
import {
  lowerScadaDslProgram,
  type ScadaDslSemanticPlan,
} from './scada-dsl-semantics'
import {
  compileScadaDslRuntime,
  validateScadaDslRuntimePlan,
  type ScadaDslCompiledRuntime,
} from './scada-dsl-runtime'

export type ScadaDslCompileDiagnosticPhase =
  | 'parse'
  | 'type'
  | 'semantic'
  | 'structure'

export type ScadaDslCompileDiagnostic = {
  phase: ScadaDslCompileDiagnosticPhase
  message: string
  span?: ScadaDslSpan
  ownerId?: string
}

export type ScadaDslCompileOptions = {
  primaryDeviceSymbol?: string
}

export type ScadaDslCompileResult = {
  program: ScadaDslProgram | null
  plan: ScadaDslSemanticPlan | null
  compiled: ScadaDslCompiledRuntime | null
  diagnostics: readonly ScadaDslCompileDiagnostic[]
}

function dependencyComponentProperty(
  dependency: ScadaDslDependency,
): string | null {
  return dependency.kind === 'component-property'
    ? dependency.property
    : null
}

function findCyclicValueBindingIds(plan: ScadaDslSemanticPlan) {
  const dependencies = extractScadaDslDependencies(plan)
  const writerByProperty = new Map<string, string>()
  for (const binding of plan.valueBindings) {
    writerByProperty.set(binding.targetProperty, binding.id)
  }

  const edges = new Map<string, Set<string>>()
  for (const binding of plan.valueBindings) {
    edges.set(binding.id, new Set<string>())
  }

  for (const entry of dependencies.valueBindings) {
    for (const dependency of entry.triggerDependencies) {
      const property = dependencyComponentProperty(dependency)
      if (!property) continue
      const writerId = writerByProperty.get(property)
      if (!writerId) continue
      edges.get(writerId)?.add(entry.id)
    }
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

  for (const binding of plan.valueBindings) visit(binding.id)
  return cyclic
}

function validateStructure(
  plan: ScadaDslSemanticPlan,
): readonly ScadaDslCompileDiagnostic[] {
  const duplicateWriters = validateScadaDslRuntimePlan(plan)
  if (duplicateWriters.length > 0) {
    return duplicateWriters.map((diagnostic) => ({
      phase: 'structure' as const,
      ownerId: diagnostic.ownerId,
      message: diagnostic.message,
    }))
  }

  const cyclicIds = findCyclicValueBindingIds(plan)
  return plan.valueBindings
    .filter((binding) => cyclicIds.has(binding.id))
    .map((binding) => ({
      phase: 'structure' as const,
      ownerId: binding.id,
      message: `Value Binding ${binding.id}（component.${binding.targetProperty}）存在组件 Property 循环依赖`,
    }))
}

/**
 * The supported construction path from authored DSL text to executable runtime.
 *
 * Runtime construction occurs only after parsing, static type analysis,
 * semantic lowering and structural validation have all succeeded. Callers that
 * already hold an internal semantic plan may still use compileScadaDslRuntime,
 * which independently enforces the critical single-writer invariant.
 */
export function compileScadaDslSource(
  source: string,
  catalog: ScadaDslCapabilityCatalog,
  options: ScadaDslCompileOptions = {},
): ScadaDslCompileResult {
  const parsed = parseScadaDsl(source)
  if (!parsed.program) {
    return {
      program: null,
      plan: null,
      compiled: null,
      diagnostics: parsed.diagnostics.map((diagnostic) => ({
        phase: 'parse' as const,
        message: diagnostic.message,
        span: diagnostic.span,
      })),
    }
  }

  const typeResult = checkScadaDslTypes(parsed.program, catalog, options)
  const lowered = lowerScadaDslProgram(parsed.program, catalog, options)
  const diagnostics: ScadaDslCompileDiagnostic[] = [
    ...typeResult.diagnostics.map((diagnostic) => ({
      phase: 'type' as const,
      message: diagnostic.message,
      span: diagnostic.span,
    })),
    ...lowered.diagnostics.map((diagnostic) => ({
      phase: 'semantic' as const,
      message: diagnostic.message,
      span: diagnostic.span,
    })),
  ]

  if (!lowered.plan || diagnostics.length > 0) {
    return {
      program: parsed.program,
      plan: lowered.plan,
      compiled: null,
      diagnostics,
    }
  }

  const structuralDiagnostics = validateStructure(lowered.plan)
  if (structuralDiagnostics.length > 0) {
    return {
      program: parsed.program,
      plan: lowered.plan,
      compiled: null,
      diagnostics: structuralDiagnostics,
    }
  }

  return {
    program: parsed.program,
    plan: lowered.plan,
    compiled: compileScadaDslRuntime(lowered.plan),
    diagnostics: [],
  }
}
