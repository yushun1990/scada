import type { ComponentScalarValue } from '../component-system/definition'
import {
  resolveScadaPropertyReference,
  type ScadaDeviceActionReference,
  type ScadaPrimaryDeviceContext,
  type ScadaPropertyReference,
  type ScadaRuntimeValueReader,
} from './scada-behavior-contract'
import type {
  ScadaDslBinaryOperator,
  ScadaDslCapabilityCatalog,
  ScadaDslCaseStatement,
  ScadaDslExpression,
  ScadaDslIfStatement,
  ScadaDslOnStatement,
  ScadaDslProgram,
  ScadaDslReferenceExpression,
  ScadaDslSpan,
  ScadaDslStatement,
} from './scada-dsl'

export type ScadaDslSemanticReference =
  | { kind: 'component-property'; property: string }
  | { kind: 'source-property'; reference: ScadaPropertyReference }

export type ScadaDslSemanticExpression =
  | { kind: 'literal'; value: ComponentScalarValue }
  | { kind: 'reference'; reference: ScadaDslSemanticReference }
  | {
      kind: 'unary'
      operator: 'not' | '-'
      operand: ScadaDslSemanticExpression
    }
  | {
      kind: 'binary'
      operator: ScadaDslBinaryOperator
      left: ScadaDslSemanticExpression
      right: ScadaDslSemanticExpression
    }
  | {
      kind: 'conditional'
      condition: ScadaDslSemanticExpression
      consequent: ScadaDslSemanticExpression
      alternate: ScadaDslSemanticExpression
    }

export type ScadaDslValueBindingPlan = {
  id: string
  targetProperty: string
  expression: ScadaDslSemanticExpression
}

export type ScadaDslComponentActionInvocation = {
  action: string
  arguments: readonly ScadaDslSemanticExpression[]
}

export type ScadaDslBehaviorBranchPlan = {
  id: string
  condition: ScadaDslSemanticExpression | null
  actions: readonly ScadaDslComponentActionInvocation[]
}

export type ScadaDslBehaviorPlan = {
  id: string
  branches: readonly ScadaDslBehaviorBranchPlan[]
}

export type ScadaDslDeviceActionInvocation = {
  target: ScadaDeviceActionReference
  arguments: readonly ScadaDslSemanticExpression[]
}

export type ScadaDslInteractionPlan = {
  id: string
  event: string
  action: ScadaDslDeviceActionInvocation
}

export type ScadaDslSemanticPlan = {
  valueBindings: readonly ScadaDslValueBindingPlan[]
  behaviors: readonly ScadaDslBehaviorPlan[]
  interactions: readonly ScadaDslInteractionPlan[]
}

export type ScadaDslSemanticDiagnostic = {
  message: string
  span: ScadaDslSpan
}

export type ScadaDslSemanticResult = {
  plan: ScadaDslSemanticPlan | null
  diagnostics: readonly ScadaDslSemanticDiagnostic[]
}

/**
 * Kept as a source-compatible shell during M9. DSL v1 has fixed `$self` and
 * `$device` roots; options cannot rename them.
 */
export type ScadaDslLoweringOptions = {
  primaryDeviceSymbol?: string
}

class SemanticFailure extends Error {
  readonly diagnostic: ScadaDslSemanticDiagnostic

  constructor(message: string, span: ScadaDslSpan) {
    super(message)
    this.diagnostic = { message, span }
  }
}

function findCapability(
  reference: ScadaDslReferenceExpression,
  catalog: ScadaDslCapabilityCatalog,
) {
  const [symbol, member] = reference.path
  const matches = catalog.items.filter(
    (item) => item.symbol === symbol && item.member === member,
  )

  if (matches.length === 0) {
    throw new SemanticFailure(`找不到能力 ${symbol}.${member}`, reference.span)
  }

  if (matches.length > 1) {
    throw new SemanticFailure(
      `能力 ${symbol}.${member} 存在歧义`,
      reference.span,
    )
  }

  return matches[0]!
}

function lowerPropertyReference(
  reference: ScadaDslReferenceExpression,
  catalog: ScadaDslCapabilityCatalog,
): ScadaDslSemanticReference {
  const capability = findCapability(reference, catalog)

  if (capability.capabilityKind !== 'property') {
    throw new SemanticFailure(
      `${capability.symbol}.${capability.member} 不是 Property`,
      reference.span,
    )
  }

  if (capability.symbol === '$self') {
    return { kind: 'component-property', property: capability.member }
  }

  if (capability.symbol === '$device') {
    return {
      kind: 'source-property',
      reference: { scope: 'primary-device', property: capability.member },
    }
  }

  throw new SemanticFailure(
    'SCADA DSL v1 只允许 $self 与 $device 两个运行时根',
    reference.span,
  )
}

function lowerExpression(
  expression: ScadaDslExpression,
  catalog: ScadaDslCapabilityCatalog,
): ScadaDslSemanticExpression {
  switch (expression.kind) {
    case 'literal':
      return { kind: 'literal', value: expression.value }
    case 'reference':
      return {
        kind: 'reference',
        reference: lowerPropertyReference(expression, catalog),
      }
    case 'unary':
      return {
        kind: 'unary',
        operator: expression.operator,
        operand: lowerExpression(expression.operand, catalog),
      }
    case 'binary':
      return {
        kind: 'binary',
        operator: expression.operator,
        left: lowerExpression(expression.left, catalog),
        right: lowerExpression(expression.right, catalog),
      }
  }
}

function lowerComponentAction(
  statement: Extract<ScadaDslStatement, { kind: 'call-statement' }>,
  catalog: ScadaDslCapabilityCatalog,
): ScadaDslComponentActionInvocation {
  const capability = findCapability(statement.call.callee, catalog)

  if (
    capability.symbol !== '$self' ||
    capability.capabilityKind !== 'action'
  ) {
    throw new SemanticFailure(
      '数据驱动 Behavior 只能调用 $self 的 Component Action；$device Action 必须由 on $self.<Event> Interaction 触发',
      statement.span,
    )
  }

  return {
    action: capability.member,
    arguments: statement.call.arguments.map((argument) =>
      lowerExpression(argument, catalog),
    ),
  }
}

function lowerValueBinding(
  statement: Extract<ScadaDslStatement, { kind: 'assignment' }>,
  statementIndex: number,
  catalog: ScadaDslCapabilityCatalog,
): ScadaDslValueBindingPlan {
  const target = findCapability(statement.target, catalog)

  if (target.symbol !== '$self' || target.capabilityKind !== 'property') {
    throw new SemanticFailure(
      'Value Binding 左侧必须是 $self 的公开 Property',
      statement.target.span,
    )
  }

  return {
    id: `value:${statementIndex}`,
    targetProperty: target.member,
    expression: lowerExpression(statement.value, catalog),
  }
}

type ControlBranch = {
  condition: ScadaDslExpression | null
  body: readonly ScadaDslStatement[]
  span: ScadaDslSpan
}

function flattenIfBranches(statement: ScadaDslIfStatement): ControlBranch[] {
  const branches: ControlBranch[] = []
  let current: ScadaDslIfStatement | null = statement

  while (current) {
    branches.push({
      condition: current.condition,
      body: current.consequent,
      span: current.span,
    })

    const alternate: readonly ScadaDslStatement[] | null = current.alternate
    if (alternate === null) {
      current = null
    } else if (alternate.length === 1 && alternate[0]?.kind === 'if') {
      current = alternate[0]
    } else {
      branches.push({
        condition: null,
        body: alternate,
        span: current.span,
      })
      current = null
    }
  }

  return branches
}

function caseCondition(
  statement: ScadaDslCaseStatement,
  value: ComponentScalarValue,
  span: ScadaDslSpan,
): ScadaDslExpression {
  return {
    kind: 'binary',
    operator: '==',
    left: statement.expression,
    right: { kind: 'literal', value, span },
    span: { start: statement.expression.span.start, end: span.end },
  }
}

function flattenCaseBranches(statement: ScadaDslCaseStatement): ControlBranch[] {
  return statement.arms.map((arm) => ({
    condition: arm.pattern.kind === 'wildcard'
      ? null
      : caseCondition(statement, arm.pattern.value, arm.pattern.span),
    body: arm.body,
    span: arm.span,
  }))
}

function classifyControlBranches(branches: readonly ControlBranch[]) {
  let sawAssignment = false
  let sawAction = false

  for (const branch of branches) {
    for (const statement of branch.body) {
      if (statement.kind === 'assignment') sawAssignment = true
      else if (statement.kind === 'call-statement') sawAction = true
      else {
        throw new SemanticFailure(
          'if/case 分支第一版只允许 Property 赋值或 Component Action 调用；不要嵌套 if/case/on',
          statement.span,
        )
      }
    }
  }

  if (sawAssignment && sawAction) {
    throw new SemanticFailure(
      '同一个 if/case 不能混合声明式 Property 赋值与命令式 Component Action',
      branches[0]?.span ?? { start: 0, end: 1 },
    )
  }

  return sawAssignment ? 'assignment' as const : 'behavior' as const
}

function branchAssignments(
  branch: ControlBranch,
  catalog: ScadaDslCapabilityCatalog,
) {
  const assignments = new Map<string, Extract<ScadaDslStatement, { kind: 'assignment' }>>()

  for (const statement of branch.body) {
    if (statement.kind !== 'assignment') {
      throw new SemanticFailure('声明式控制分支只能包含 Property 赋值', statement.span)
    }
    const target = findCapability(statement.target, catalog)
    if (target.symbol !== '$self' || target.capabilityKind !== 'property') {
      throw new SemanticFailure(
        'if/case 声明式赋值只能写入 $self 的公开 Property',
        statement.target.span,
      )
    }
    if (assignments.has(target.member)) {
      throw new SemanticFailure(
        `同一个分支不能重复写入 $self.${target.member}`,
        statement.target.span,
      )
    }
    assignments.set(target.member, statement)
  }

  return assignments
}

function sameKeys(left: Map<string, unknown>, right: Map<string, unknown>) {
  if (left.size !== right.size) return false
  for (const key of left.keys()) if (!right.has(key)) return false
  return true
}

function lowerDeclarativeControl(
  branches: readonly ControlBranch[],
  statementIndex: number,
  catalog: ScadaDslCapabilityCatalog,
): ScadaDslValueBindingPlan[] {
  if (branches.length === 0 || branches.at(-1)?.condition !== null) {
    throw new SemanticFailure(
      '包含 Property 赋值的 if 必须有 else；case 必须有最终 _ fallback，避免产生未定义的半赋值状态',
      branches[0]?.span ?? { start: 0, end: 1 },
    )
  }

  const assignmentMaps = branches.map((branch) => branchAssignments(branch, catalog))
  const expected = assignmentMaps[0]!
  if (expected.size === 0) {
    throw new SemanticFailure(
      '声明式 if/case 至少需要一个 $self Property 赋值',
      branches[0]!.span,
    )
  }

  for (let index = 1; index < assignmentMaps.length; index += 1) {
    if (!sameKeys(expected, assignmentMaps[index]!)) {
      throw new SemanticFailure(
        '声明式 if/case 的每个分支必须完整写入同一组 $self Properties',
        branches[index]!.span,
      )
    }
  }

  return [...expected.keys()].map((property) => {
    const fallbackStatement = assignmentMaps.at(-1)!.get(property)!
    let expression = lowerExpression(fallbackStatement.value, catalog)

    for (let index = branches.length - 2; index >= 0; index -= 1) {
      const condition = branches[index]!.condition
      if (!condition) {
        throw new SemanticFailure('fallback 分支只能出现在控制结构末尾', branches[index]!.span)
      }
      const assignment = assignmentMaps[index]!.get(property)!
      expression = {
        kind: 'conditional',
        condition: lowerExpression(condition, catalog),
        consequent: lowerExpression(assignment.value, catalog),
        alternate: expression,
      }
    }

    return {
      id: `value:${statementIndex}:${property}`,
      targetProperty: property,
      expression,
    }
  })
}

function lowerBehaviorControl(
  branches: readonly ControlBranch[],
  statementIndex: number,
  catalog: ScadaDslCapabilityCatalog,
): ScadaDslBehaviorPlan {
  return {
    id: `behavior:${statementIndex}`,
    branches: branches.map((branch, branchIndex) => ({
      id: `behavior:${statementIndex}:branch:${branchIndex}`,
      condition: branch.condition ? lowerExpression(branch.condition, catalog) : null,
      actions: branch.body.map((statement) => {
        if (statement.kind !== 'call-statement') {
          throw new SemanticFailure(
            'Behavior 分支只能调用 $self Component Action',
            statement.span,
          )
        }
        return lowerComponentAction(statement, catalog)
      }),
    })),
  }
}

function lowerControl(
  branches: readonly ControlBranch[],
  statementIndex: number,
  catalog: ScadaDslCapabilityCatalog,
) {
  const mode = classifyControlBranches(branches)
  return mode === 'assignment'
    ? { valueBindings: lowerDeclarativeControl(branches, statementIndex, catalog), behavior: null }
    : { valueBindings: [] as ScadaDslValueBindingPlan[], behavior: lowerBehaviorControl(branches, statementIndex, catalog) }
}

function lowerInteraction(
  statement: ScadaDslOnStatement,
  statementIndex: number,
  catalog: ScadaDslCapabilityCatalog,
): ScadaDslInteractionPlan {
  const event = findCapability(statement.event, catalog)
  if (event.symbol !== '$self' || event.capabilityKind !== 'event') {
    throw new SemanticFailure(
      'on 的触发源必须是 $self 的公开 Component Event',
      statement.event.span,
    )
  }

  if (statement.body.length !== 1 || statement.body[0]?.kind !== 'call-statement') {
    throw new SemanticFailure(
      'Interaction 第一版每个 on Event 只绑定一个 $device Action；需要多个独立动作时请写多个 on 块',
      statement.span,
    )
  }

  const call = statement.body[0]
  const action = findCapability(call.call.callee, catalog)
  if (action.capabilityKind !== 'action' || action.symbol !== '$device') {
    throw new SemanticFailure(
      'on $self.<Event> 的目标必须是 $device 的公开 Action',
      call.span,
    )
  }

  const target: ScadaDeviceActionReference = {
    scope: 'primary-device',
    action: action.member,
  }

  return {
    id: `interaction:${statementIndex}`,
    event: event.member,
    action: {
      target,
      arguments: call.call.arguments.map((argument) =>
        lowerExpression(argument, catalog),
      ),
    },
  }
}

export function lowerScadaDslProgram(
  program: ScadaDslProgram,
  catalog: ScadaDslCapabilityCatalog,
  _options: ScadaDslLoweringOptions = {},
): ScadaDslSemanticResult {
  const valueBindings: ScadaDslValueBindingPlan[] = []
  const behaviors: ScadaDslBehaviorPlan[] = []
  const interactions: ScadaDslInteractionPlan[] = []
  const diagnostics: ScadaDslSemanticDiagnostic[] = []

  for (const [statementIndex, statement] of program.statements.entries()) {
    try {
      if (statement.kind === 'assignment') {
        valueBindings.push(lowerValueBinding(statement, statementIndex, catalog))
      } else if (statement.kind === 'if') {
        const lowered = lowerControl(
          flattenIfBranches(statement),
          statementIndex,
          catalog,
        )
        valueBindings.push(...lowered.valueBindings)
        if (lowered.behavior) behaviors.push(lowered.behavior)
      } else if (statement.kind === 'case') {
        const lowered = lowerControl(
          flattenCaseBranches(statement),
          statementIndex,
          catalog,
        )
        valueBindings.push(...lowered.valueBindings)
        if (lowered.behavior) behaviors.push(lowered.behavior)
      } else if (statement.kind === 'on') {
        interactions.push(lowerInteraction(statement, statementIndex, catalog))
      } else {
        throw new SemanticFailure(
          '顶层 Action 没有明确触发时机；$self Action 请放入 if/case，$device Action 请放入 on $self.<Event>',
          statement.span,
        )
      }
    } catch (error) {
      if (error instanceof SemanticFailure) diagnostics.push(error.diagnostic)
      else throw error
    }
  }

  return diagnostics.length > 0
    ? { plan: null, diagnostics }
    : { plan: { valueBindings, behaviors, interactions }, diagnostics: [] }
}

export type ScadaDslEvaluationContext = {
  primaryDevice: ScadaPrimaryDeviceContext | null
  readSourceValue: ScadaRuntimeValueReader
  readComponentProperty: (
    property: string,
  ) => ComponentScalarValue | undefined
}

function finiteNumber(value: number) {
  return Number.isFinite(value) ? value : undefined
}

export function evaluateScadaDslSemanticExpression(
  expression: ScadaDslSemanticExpression,
  context: ScadaDslEvaluationContext,
): ComponentScalarValue | undefined {
  if (expression.kind === 'literal') return expression.value

  if (expression.kind === 'reference') {
    if (expression.reference.kind === 'component-property') {
      return context.readComponentProperty(expression.reference.property)
    }

    const resolved = resolveScadaPropertyReference(
      expression.reference.reference,
      context.primaryDevice,
    )
    return resolved
      ? context.readSourceValue(resolved.sourceId, resolved.property)
      : undefined
  }

  if (expression.kind === 'unary') {
    const value = evaluateScadaDslSemanticExpression(expression.operand, context)
    if (expression.operator === 'not') {
      return typeof value === 'boolean' ? !value : undefined
    }
    return typeof value === 'number' ? finiteNumber(-value) : undefined
  }

  if (expression.kind === 'conditional') {
    const condition = evaluateScadaDslSemanticExpression(
      expression.condition,
      context,
    )
    if (typeof condition !== 'boolean') return undefined
    return evaluateScadaDslSemanticExpression(
      condition ? expression.consequent : expression.alternate,
      context,
    )
  }

  if (expression.operator === 'and' || expression.operator === 'or') {
    const left = evaluateScadaDslSemanticExpression(expression.left, context)
    if (typeof left !== 'boolean') return undefined
    if (expression.operator === 'and' && !left) return false
    if (expression.operator === 'or' && left) return true
    const right = evaluateScadaDslSemanticExpression(expression.right, context)
    return typeof right === 'boolean' ? right : undefined
  }

  const left = evaluateScadaDslSemanticExpression(expression.left, context)
  const right = evaluateScadaDslSemanticExpression(expression.right, context)

  if (expression.operator === '==' || expression.operator === '!=') {
    if (left === undefined || right === undefined) return undefined
    return expression.operator === '==' ? left === right : left !== right
  }

  if (
    expression.operator === '>' ||
    expression.operator === '>=' ||
    expression.operator === '<' ||
    expression.operator === '<='
  ) {
    if (typeof left !== 'number' || typeof right !== 'number') return undefined
    if (expression.operator === '>') return left > right
    if (expression.operator === '>=') return left >= right
    if (expression.operator === '<') return left < right
    return left <= right
  }

  if (typeof left !== 'number' || typeof right !== 'number') return undefined
  if (expression.operator === '+') return finiteNumber(left + right)
  if (expression.operator === '-') return finiteNumber(left - right)
  if (expression.operator === '*') return finiteNumber(left * right)
  if (right === 0) return undefined
  if (expression.operator === '/') return finiteNumber(left / right)
  return finiteNumber(left % right)
}

export function selectScadaDslBehaviorBranch(
  behavior: ScadaDslBehaviorPlan,
  context: ScadaDslEvaluationContext,
): ScadaDslBehaviorBranchPlan | null {
  for (const branch of behavior.branches) {
    if (branch.condition === null) return branch
    if (evaluateScadaDslSemanticExpression(branch.condition, context) === true) {
      return branch
    }
  }
  return null
}

/**
 * Action-oriented if/case uses branch-entry semantics: the active branch fires
 * once on initial activation, repeated telemetry in the same branch does not
 * replay it, and moving to another branch fires that branch once.
 */
export function shouldFireScadaDslBehaviorBranch(
  previousBranchId: string | null,
  currentBranchId: string | null,
) {
  return currentBranchId !== null && currentBranchId !== previousBranchId
}
