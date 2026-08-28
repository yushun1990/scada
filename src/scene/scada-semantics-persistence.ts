import type { ComponentScalarValue } from '../component-system/definition'
import type {
  ScadaDeviceActionReference,
  ScadaPropertyReference,
} from './scada-behavior-contract'
import type {
  ScadaDslSemanticExpression,
  ScadaDslSemanticPlan,
} from './scada-dsl-semantics'

export const SCADA_SEMANTICS_VERSION = 1 as const

export type PersistedScadaSemanticReference =
  | { kind: 'component-property'; property: string }
  | { kind: 'source-property'; reference: ScadaPropertyReference }

export type PersistedScadaBinaryOperator =
  | 'or'
  | 'and'
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'

export type PersistedScadaExpression =
  | { kind: 'literal'; value: ComponentScalarValue }
  | { kind: 'reference'; reference: PersistedScadaSemanticReference }
  | {
      kind: 'unary'
      operator: 'not' | '-'
      operand: PersistedScadaExpression
    }
  | {
      kind: 'binary'
      operator: PersistedScadaBinaryOperator
      left: PersistedScadaExpression
      right: PersistedScadaExpression
    }
  | {
      kind: 'conditional'
      condition: PersistedScadaExpression
      consequent: PersistedScadaExpression
      alternate: PersistedScadaExpression
    }

export type PersistedScadaComponentAction = {
  action: string
  arguments: readonly PersistedScadaExpression[]
}

export type PersistedScadaValueBinding = {
  id: string
  targetProperty: string
  expression: PersistedScadaExpression
}

export type PersistedScadaBehaviorBranch = {
  id: string
  condition: PersistedScadaExpression | null
  actions: readonly PersistedScadaComponentAction[]
}

export type PersistedScadaBehavior = {
  id: string
  branches: readonly PersistedScadaBehaviorBranch[]
}

export type PersistedScadaDeviceAction = {
  target: ScadaDeviceActionReference
  arguments: readonly PersistedScadaExpression[]
}

export type PersistedScadaInteraction = {
  id: string
  event: string
  action: PersistedScadaDeviceAction
}

export type PersistedScadaSemantics = {
  version: typeof SCADA_SEMANTICS_VERSION
  valueBindings: readonly PersistedScadaValueBinding[]
  behaviors: readonly PersistedScadaBehavior[]
  interactions: readonly PersistedScadaInteraction[]
}

const BINARY_OPERATORS = new Set<PersistedScadaBinaryOperator>([
  'or',
  'and',
  '==',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  '+',
  '-',
  '*',
  '/',
  '%',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isScalar(value: unknown): value is ComponentScalarValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isBinaryOperator(value: unknown): value is PersistedScadaBinaryOperator {
  return (
    typeof value === 'string' &&
    BINARY_OPERATORS.has(value as PersistedScadaBinaryOperator)
  )
}

function clonePropertyReference(reference: ScadaPropertyReference): ScadaPropertyReference {
  return reference.scope === 'primary-device'
    ? { scope: 'primary-device', property: reference.property }
    : {
        scope: 'external',
        sourceId: reference.sourceId,
        property: reference.property,
      }
}

function cloneDeviceActionReference(
  reference: ScadaDeviceActionReference,
): ScadaDeviceActionReference {
  return reference.scope === 'primary-device'
    ? { scope: 'primary-device', action: reference.action }
    : {
        scope: 'external',
        sourceId: reference.sourceId,
        action: reference.action,
      }
}

function cloneExpression(
  expression: ScadaDslSemanticExpression,
): PersistedScadaExpression {
  switch (expression.kind) {
    case 'literal':
      return { kind: 'literal', value: expression.value }
    case 'reference':
      return expression.reference.kind === 'component-property'
        ? {
            kind: 'reference',
            reference: {
              kind: 'component-property',
              property: expression.reference.property,
            },
          }
        : {
            kind: 'reference',
            reference: {
              kind: 'source-property',
              reference: clonePropertyReference(expression.reference.reference),
            },
          }
    case 'unary':
      return {
        kind: 'unary',
        operator: expression.operator,
        operand: cloneExpression(expression.operand),
      }
    case 'binary':
      return {
        kind: 'binary',
        operator: expression.operator,
        left: cloneExpression(expression.left),
        right: cloneExpression(expression.right),
      }
    case 'conditional':
      return {
        kind: 'conditional',
        condition: cloneExpression(expression.condition),
        consequent: cloneExpression(expression.consequent),
        alternate: cloneExpression(expression.alternate),
      }
  }
}

/**
 * IDs in the authored semantic plan are intentionally ephemeral and may still
 * reflect DSL statement positions. Persistence replaces them with a stable
 * identity derived only from canonical semantic content.
 *
 * Two independent 32-bit hashes are combined to reduce accidental collisions.
 * The occurrence suffix only distinguishes semantically identical duplicates;
 * unrelated statement reordering therefore does not change IDs.
 */
function stableHash(value: string) {
  let fnv = 0x811c9dc5
  let djb = 5381

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    fnv ^= code
    fnv = Math.imul(fnv, 0x01000193)
    djb = Math.imul(djb, 33) ^ code
  }

  return `${(fnv >>> 0).toString(16).padStart(8, '0')}${(djb >>> 0).toString(16).padStart(8, '0')}`
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function allocateStableId(
  kind: 'value' | 'behavior' | 'interaction',
  semanticIdentity: unknown,
  occurrences: Map<string, number>,
) {
  const fingerprint = stableHash(canonicalJson(semanticIdentity))
  const occurrenceKey = `${kind}:${fingerprint}`
  const occurrence = occurrences.get(occurrenceKey) ?? 0
  occurrences.set(occurrenceKey, occurrence + 1)
  return occurrence === 0
    ? `${kind}:${fingerprint}`
    : `${kind}:${fingerprint}:${occurrence + 1}`
}

function withoutIdsFromBehavior(
  behavior: ScadaDslSemanticPlan['behaviors'][number],
) {
  return {
    branches: behavior.branches.map((branch) => ({
      condition: branch.condition ? cloneExpression(branch.condition) : null,
      actions: branch.actions.map((action) => ({
        action: action.action,
        arguments: action.arguments.map(cloneExpression),
      })),
    })),
  }
}

export function persistScadaSemanticPlan(
  plan: ScadaDslSemanticPlan,
): PersistedScadaSemantics {
  const occurrences = new Map<string, number>()

  const valueBindings = plan.valueBindings.map((binding) => {
    const expression = cloneExpression(binding.expression)
    return {
      id: allocateStableId(
        'value',
        { targetProperty: binding.targetProperty, expression },
        occurrences,
      ),
      targetProperty: binding.targetProperty,
      expression,
    }
  })

  const behaviors = plan.behaviors.map((behavior) => {
    const semanticIdentity = withoutIdsFromBehavior(behavior)
    const id = allocateStableId('behavior', semanticIdentity, occurrences)
    return {
      id,
      branches: semanticIdentity.branches.map((branch, branchIndex) => ({
        id: `${id}:branch:${branchIndex + 1}`,
        condition: branch.condition,
        actions: branch.actions,
      })),
    }
  })

  const interactions = plan.interactions.map((interaction) => {
    const semanticIdentity = {
      event: interaction.event,
      action: {
        target: cloneDeviceActionReference(interaction.action.target),
        arguments: interaction.action.arguments.map(cloneExpression),
      },
    }
    return {
      id: allocateStableId('interaction', semanticIdentity, occurrences),
      event: semanticIdentity.event,
      action: semanticIdentity.action,
    }
  })

  return {
    version: SCADA_SEMANTICS_VERSION,
    valueBindings,
    behaviors,
    interactions,
  }
}

function parsePropertyReference(value: unknown): ScadaPropertyReference | null {
  if (!isRecord(value) || !nonEmpty(value.scope) || !nonEmpty(value.property)) {
    return null
  }

  if (value.scope === 'primary-device') {
    return { scope: 'primary-device', property: value.property }
  }

  if (value.scope === 'external' && nonEmpty(value.sourceId)) {
    return {
      scope: 'external',
      sourceId: value.sourceId,
      property: value.property,
    }
  }

  return null
}

function parseDeviceActionReference(value: unknown): ScadaDeviceActionReference | null {
  if (!isRecord(value) || !nonEmpty(value.scope) || !nonEmpty(value.action)) {
    return null
  }

  if (value.scope === 'primary-device') {
    return { scope: 'primary-device', action: value.action }
  }

  if (value.scope === 'external' && nonEmpty(value.sourceId)) {
    return {
      scope: 'external',
      sourceId: value.sourceId,
      action: value.action,
    }
  }

  return null
}

function parseExpression(value: unknown): PersistedScadaExpression | null {
  if (!isRecord(value) || !nonEmpty(value.kind)) return null

  if (value.kind === 'literal') {
    return isScalar(value.value)
      ? { kind: 'literal', value: value.value }
      : null
  }

  if (value.kind === 'reference') {
    if (!isRecord(value.reference) || !nonEmpty(value.reference.kind)) return null
    if (
      value.reference.kind === 'component-property' &&
      nonEmpty(value.reference.property)
    ) {
      return {
        kind: 'reference',
        reference: {
          kind: 'component-property',
          property: value.reference.property,
        },
      }
    }
    if (value.reference.kind === 'source-property') {
      const reference = parsePropertyReference(value.reference.reference)
      return reference
        ? {
            kind: 'reference',
            reference: { kind: 'source-property', reference },
          }
        : null
    }
    return null
  }

  if (value.kind === 'unary') {
    if (value.operator !== 'not' && value.operator !== '-') return null
    const operand = parseExpression(value.operand)
    return operand
      ? { kind: 'unary', operator: value.operator, operand }
      : null
  }

  if (value.kind === 'binary') {
    if (!isBinaryOperator(value.operator)) return null
    const left = parseExpression(value.left)
    const right = parseExpression(value.right)
    return left && right
      ? { kind: 'binary', operator: value.operator, left, right }
      : null
  }

  if (value.kind === 'conditional') {
    const condition = parseExpression(value.condition)
    const consequent = parseExpression(value.consequent)
    const alternate = parseExpression(value.alternate)
    return condition && consequent && alternate
      ? { kind: 'conditional', condition, consequent, alternate }
      : null
  }

  return null
}

function parseActionArguments(value: unknown) {
  if (!Array.isArray(value)) return null
  const expressions = value.map(parseExpression)
  return expressions.some((expression) => expression === null)
    ? null
    : (expressions as PersistedScadaExpression[])
}

function collectComponentPropertyReads(
  expression: PersistedScadaExpression,
  output: Set<string>,
) {
  if (expression.kind === 'reference') {
    if (expression.reference.kind === 'component-property') {
      output.add(expression.reference.property)
    }
    return
  }
  if (expression.kind === 'unary') {
    collectComponentPropertyReads(expression.operand, output)
    return
  }
  if (expression.kind === 'binary') {
    collectComponentPropertyReads(expression.left, output)
    collectComponentPropertyReads(expression.right, output)
    return
  }
  if (expression.kind === 'conditional') {
    collectComponentPropertyReads(expression.condition, output)
    collectComponentPropertyReads(expression.consequent, output)
    collectComponentPropertyReads(expression.alternate, output)
  }
}

function validateValueGraph(bindings: readonly PersistedScadaValueBinding[]) {
  const writerByProperty = new Map<string, string>()
  for (const binding of bindings) {
    if (writerByProperty.has(binding.targetProperty)) {
      throw new Error(
        `Persisted SCADA semantics has multiple writers for component.${binding.targetProperty}`,
      )
    }
    writerByProperty.set(binding.targetProperty, binding.id)
  }

  const edges = new Map<string, Set<string>>()
  for (const binding of bindings) edges.set(binding.id, new Set())
  for (const binding of bindings) {
    const reads = new Set<string>()
    collectComponentPropertyReads(binding.expression, reads)
    for (const property of reads) {
      const writer = writerByProperty.get(property)
      if (writer) edges.get(writer)?.add(binding.id)
    }
  }

  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (id: string) => {
    const current = state.get(id)
    if (current === 'visiting') {
      throw new Error('Persisted SCADA semantics contains a Component Property cycle')
    }
    if (current === 'done') return
    state.set(id, 'visiting')
    for (const next of edges.get(id) ?? []) visit(next)
    state.set(id, 'done')
  }
  for (const binding of bindings) visit(binding.id)
}

export function parsePersistedScadaSemantics(
  value: unknown,
): PersistedScadaSemantics {
  if (
    !isRecord(value) ||
    value.version !== SCADA_SEMANTICS_VERSION ||
    !Array.isArray(value.valueBindings) ||
    !Array.isArray(value.behaviors) ||
    !Array.isArray(value.interactions)
  ) {
    throw new Error('Persisted SCADA semantics format/version is invalid')
  }

  const allIds = new Set<string>()
  const claimId = (id: unknown, label: string) => {
    if (!nonEmpty(id) || allIds.has(id)) {
      throw new Error(`Persisted SCADA semantics has invalid/duplicate ${label} ID`)
    }
    allIds.add(id)
    return id
  }

  const valueBindings = value.valueBindings.map((candidate) => {
    if (!isRecord(candidate) || !nonEmpty(candidate.targetProperty)) {
      throw new Error('Persisted SCADA Value Binding is invalid')
    }
    const expression = parseExpression(candidate.expression)
    if (!expression) {
      throw new Error('Persisted SCADA Value Binding expression is invalid')
    }
    return {
      id: claimId(candidate.id, 'Value Binding'),
      targetProperty: candidate.targetProperty,
      expression,
    }
  })

  const behaviors = value.behaviors.map((candidate) => {
    if (!isRecord(candidate) || !Array.isArray(candidate.branches)) {
      throw new Error('Persisted SCADA Behavior is invalid')
    }
    const id = claimId(candidate.id, 'Behavior')
    const branches = candidate.branches.map((branch) => {
      if (!isRecord(branch) || !Array.isArray(branch.actions)) {
        throw new Error('Persisted SCADA Behavior branch is invalid')
      }
      const condition = branch.condition === null
        ? null
        : parseExpression(branch.condition)
      if (branch.condition !== null && !condition) {
        throw new Error('Persisted SCADA Behavior condition is invalid')
      }
      const actions = branch.actions.map((action) => {
        if (!isRecord(action) || !nonEmpty(action.action)) {
          throw new Error('Persisted SCADA Component Action is invalid')
        }
        const args = parseActionArguments(action.arguments)
        if (!args) {
          throw new Error('Persisted SCADA Component Action arguments are invalid')
        }
        return { action: action.action, arguments: args }
      })
      return {
        id: claimId(branch.id, 'Behavior branch'),
        condition,
        actions,
      }
    })
    return { id, branches }
  })

  const interactions = value.interactions.map((candidate) => {
    if (
      !isRecord(candidate) ||
      !nonEmpty(candidate.event) ||
      !isRecord(candidate.action)
    ) {
      throw new Error('Persisted SCADA Interaction is invalid')
    }
    const target = parseDeviceActionReference(candidate.action.target)
    const args = parseActionArguments(candidate.action.arguments)
    if (!target || !args) {
      throw new Error('Persisted SCADA Device Action is invalid')
    }
    return {
      id: claimId(candidate.id, 'Interaction'),
      event: candidate.event,
      action: { target, arguments: args },
    }
  })

  validateValueGraph(valueBindings)
  return {
    version: SCADA_SEMANTICS_VERSION,
    valueBindings,
    behaviors,
    interactions,
  }
}

/**
 * Runtime construction from persisted semantics never reparses DSL text. The
 * stored canonical references and stable IDs become the runtime semantic plan.
 */
export function restoreScadaSemanticPlan(
  persisted: PersistedScadaSemantics,
): ScadaDslSemanticPlan {
  return {
    valueBindings: persisted.valueBindings.map((binding) => ({
      id: binding.id,
      targetProperty: binding.targetProperty,
      expression: binding.expression as ScadaDslSemanticExpression,
    })),
    behaviors: persisted.behaviors.map((behavior) => ({
      id: behavior.id,
      branches: behavior.branches.map((branch) => ({
        id: branch.id,
        condition: branch.condition as ScadaDslSemanticExpression | null,
        actions: branch.actions.map((action) => ({
          action: action.action,
          arguments: action.arguments as readonly ScadaDslSemanticExpression[],
        })),
      })),
    })),
    interactions: persisted.interactions.map((interaction) => ({
      id: interaction.id,
      event: interaction.event,
      action: {
        target: interaction.action.target,
        arguments: interaction.action.arguments as readonly ScadaDslSemanticExpression[],
      },
    })),
  }
}
