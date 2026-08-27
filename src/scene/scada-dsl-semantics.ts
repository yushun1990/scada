import type { ComponentScalarValue } from '../component-system/definition'
import {
  resolveScadaPropertyReference,
  type ScadaPrimaryDeviceContext,
  type ScadaPropertyReference,
  type ScadaRuntimeValueReader,
} from './scada-behavior-contract'
import type {
  ScadaDslBinaryOperator,
  ScadaDslCapabilityCatalog,
  ScadaDslCapabilityItem,
  ScadaDslExpression,
  ScadaDslIfStatement,
  ScadaDslProgram,
  ScadaDslReferenceExpression,
  ScadaDslSpan,
  ScadaDslStatement,
} from './scada-dsl'

export type ScadaDslSemanticReference =
  | {
      kind: 'component-property'
      property: string
    }
  | {
      kind: 'source-property'
      reference: ScadaPropertyReference
    }

export type ScadaDslSemanticExpression =
  | {
      kind: 'literal'
      value: ComponentScalarValue
    }
  | {
      kind: 'reference'
      reference: ScadaDslSemanticReference
    }
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

export type ScadaDslSemanticPlan = {
  valueBindings: readonly ScadaDslValueBindingPlan[]
  behaviors: readonly ScadaDslBehaviorPlan[]
}

export type ScadaDslSemanticDiagnostic = {
  message: string
  span: ScadaDslSpan
}

export type ScadaDslSemanticResult = {
  plan: ScadaDslSemanticPlan | null
  diagnostics: readonly ScadaDslSemanticDiagnostic[]
}

export type ScadaDslLoweringOptions = {
  /**
   * The editor symbol that represents the copy/rebind-safe primary device.
   * References through this symbol lower to `scope: primary-device` instead of
   * capturing the concrete source id that happened to be selected while editing.
   */
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
  if (reference.path.length !== 2) {
    throw new SemanticFailure(
      '第一版 DSL 引用只支持“对象.能力”，例如 device.pressure',
      reference.span,
    )
  }

  const [symbol, member] = reference.path
  const matches = catalog.items.filter(
    (item) => item.symbol === symbol && item.member === member,
  )

  if (matches.length === 0) {
    throw new SemanticFailure(
      `找不到能力 ${symbol}.${member}`,
      reference.span,
    )
  }

  if (matches.length > 1) {
    throw new SemanticFailure(
      `能力 ${symbol}.${member} 存在歧义，请重新选择来源`,
      reference.span,
    )
  }

  return matches[0]!
}

function lowerPropertyReference(
  reference: ScadaDslReferenceExpression,
  catalog: ScadaDslCapabilityCatalog,
  primaryDeviceSymbol: string,
): ScadaDslSemanticReference {
  const capability = findCapability(reference, catalog)

  if (capability.capabilityKind !== 'property') {
    throw new SemanticFailure(
      `${capability.symbol}.${capability.member} 不是 Property`,
      reference.span,
    )
  }

  if (capability.symbol === 'component') {
    return {
      kind: 'component-property',
      property: capability.member,
    }
  }

  if (capability.symbol === primaryDeviceSymbol) {
    return {
      kind: 'source-property',
      reference: {
        scope: 'primary-device',
        property: capability.member,
      },
    }
  }

  return {
    kind: 'source-property',
    reference: {
      scope: 'external',
      sourceId: capability.sourceId,
      property: capability.member,
    },
  }
}

function lowerExpression(
  expression: ScadaDslExpression,
  catalog: ScadaDslCapabilityCatalog,
  primaryDeviceSymbol: string,
): ScadaDslSemanticExpression {
  if (expression.kind === 'literal') {
    return {
      kind: 'literal',
      value: expression.value,
    }
  }

  if (expression.kind === 'reference') {
    return {
      kind: 'reference',
      reference: lowerPropertyReference(
        expression,
        catalog,
        primaryDeviceSymbol,
      ),
    }
  }

  if (expression.kind === 'unary') {
    return {
      kind: 'unary',
      operator: expression.operator,
      operand: lowerExpression(
        expression.operand,
        catalog,
        primaryDeviceSymbol,
      ),
    }
  }

  if (expression.kind === 'binary') {
    return {
      kind: 'binary',
      operator: expression.operator,
      left: lowerExpression(expression.left, catalog, primaryDeviceSymbol),
      right: lowerExpression(expression.right, catalog, primaryDeviceSymbol),
    }
  }

  return {
    kind: 'conditional',
    condition: lowerExpression(
      expression.condition,
      catalog,
      primaryDeviceSymbol,
    ),
    consequent: lowerExpression(
      expression.consequent,
      catalog,
      primaryDeviceSymbol,
    ),
    alternate: lowerExpression(
      expression.alternate,
      catalog,
      primaryDeviceSymbol,
    ),
  }
}

function lowerComponentAction(
  statement: Extract<ScadaDslStatement, { kind: 'call-statement' }>,
  catalog: ScadaDslCapabilityCatalog,
  primaryDeviceSymbol: string,
): ScadaDslComponentActionInvocation {
  const capability = findCapability(statement.call.callee, catalog)

  if (
    capability.symbol !== 'component' ||
    capability.capabilityKind !== 'action'
  ) {
    throw new SemanticFailure(
      '数据驱动 Behavior 只能调用当前组件公开的 Component Action；设备 Action 必须由显式 UI/Event Interaction 触发',
      statement.span,
    )
  }

  return {
    action: capability.member,
    arguments: statement.call.arguments.map((argument) =>
      lowerExpression(argument, catalog, primaryDeviceSymbol),
    ),
  }
}

function lowerActionBlock(
  statements: readonly ScadaDslStatement[],
  catalog: ScadaDslCapabilityCatalog,
  primaryDeviceSymbol: string,
) {
  const actions: ScadaDslComponentActionInvocation[] = []

  for (const statement of statements) {
    if (statement.kind === 'assignment') {
      throw new SemanticFailure(
        '条件块内不要命令式修改 Property；请使用 `component.property = if ... then ... else ...` 表达声明式 Value Binding',
        statement.span,
      )
    }

    if (statement.kind === 'if') {
      throw new SemanticFailure(
        'Behavior 第一版只允许 else-if 分支，不允许在分支内部继续嵌套 if',
        statement.span,
      )
    }

    actions.push(
      lowerComponentAction(statement, catalog, primaryDeviceSymbol),
    )
  }

  return actions
}

function lowerBehavior(
  statement: ScadaDslIfStatement,
  statementIndex: number,
  catalog: ScadaDslCapabilityCatalog,
  primaryDeviceSymbol: string,
): ScadaDslBehaviorPlan {
  const branches: ScadaDslBehaviorBranchPlan[] = []
  let current: ScadaDslIfStatement | null = statement
  let branchIndex = 0

  while (current) {
    branches.push({
      id: `behavior:${statementIndex}:branch:${branchIndex}`,
      condition: lowerExpression(
        current.condition,
        catalog,
        primaryDeviceSymbol,
      ),
      actions: lowerActionBlock(
        current.consequent,
        catalog,
        primaryDeviceSymbol,
      ),
    })
    branchIndex += 1

    const alternate = current.alternate
    if (!alternate) {
      current = null
      continue
    }

    if (alternate.length === 1 && alternate[0]?.kind === 'if') {
      current = alternate[0]
      continue
    }

    branches.push({
      id: `behavior:${statementIndex}:branch:${branchIndex}`,
      condition: null,
      actions: lowerActionBlock(
        alternate,
        catalog,
        primaryDeviceSymbol,
      ),
    })
    current = null
  }

  return {
    id: `behavior:${statementIndex}`,
    branches,
  }
}

function lowerValueBinding(
  statement: Extract<ScadaDslStatement, { kind: 'assignment' }>,
  statementIndex: number,
  catalog: ScadaDslCapabilityCatalog,
  primaryDeviceSymbol: string,
): ScadaDslValueBindingPlan {
  const target = findCapability(statement.target, catalog)

  if (
    target.symbol !== 'component' ||
    target.capabilityKind !== 'property'
  ) {
    throw new SemanticFailure(
      'Value Binding 左侧必须是当前组件公开的 Component Property',
      statement.target.span,
    )
  }

  return {
    id: `value:${statementIndex}`,
    targetProperty: target.member,
    expression: lowerExpression(
      statement.value,
      catalog,
      primaryDeviceSymbol,
    ),
  }
}

export function lowerScadaDslProgram(
  program: ScadaDslProgram,
  catalog: ScadaDslCapabilityCatalog,
  options: ScadaDslLoweringOptions = {},
): ScadaDslSemanticResult {
  const primaryDeviceSymbol = options.primaryDeviceSymbol ?? 'device'
  const valueBindings: ScadaDslValueBindingPlan[] = []
  const behaviors: ScadaDslBehaviorPlan[] = []
  const diagnostics: ScadaDslSemanticDiagnostic[] = []

  for (const [statementIndex, statement] of program.statements.entries()) {
    try {
      if (statement.kind === 'assignment') {
        valueBindings.push(
          lowerValueBinding(
            statement,
            statementIndex,
            catalog,
            primaryDeviceSymbol,
          ),
        )
        continue
      }

      if (statement.kind === 'if') {
        behaviors.push(
          lowerBehavior(
            statement,
            statementIndex,
            catalog,
            primaryDeviceSymbol,
          ),
        )
        continue
      }

      throw new SemanticFailure(
        '顶层 Action 没有明确触发时机；请把 Component Action 放入 if/else Behavior，设备 Action 留给后续显式 Interaction/Event 绑定',
        statement.span,
      )
    } catch (error) {
      if (error instanceof SemanticFailure) {
        diagnostics.push(error.diagnostic)
        continue
      }
      throw error
    }
  }

  if (diagnostics.length > 0) {
    return {
      plan: null,
      diagnostics,
    }
  }

  return {
    plan: {
      valueBindings,
      behaviors,
    },
    diagnostics: [],
  }
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
  if (expression.kind === 'literal') {
    return expression.value
  }

  if (expression.kind === 'reference') {
    if (expression.reference.kind === 'component-property') {
      return context.readComponentProperty(expression.reference.property)
    }

    const resolved = resolveScadaPropertyReference(
      expression.reference.reference,
      context.primaryDevice,
    )

    if (!resolved) {
      return undefined
    }

    return context.readSourceValue(resolved.sourceId, resolved.property)
  }

  if (expression.kind === 'unary') {
    const value = evaluateScadaDslSemanticExpression(
      expression.operand,
      context,
    )

    if (expression.operator === 'not') {
      return typeof value === 'boolean' ? !value : undefined
    }

    return typeof value === 'number'
      ? finiteNumber(-value)
      : undefined
  }

  if (expression.kind === 'conditional') {
    const condition = evaluateScadaDslSemanticExpression(
      expression.condition,
      context,
    )

    if (typeof condition !== 'boolean') {
      return undefined
    }

    return evaluateScadaDslSemanticExpression(
      condition ? expression.consequent : expression.alternate,
      context,
    )
  }

  if (expression.operator === 'and' || expression.operator === 'or') {
    const left = evaluateScadaDslSemanticExpression(expression.left, context)
    if (typeof left !== 'boolean') {
      return undefined
    }

    if (expression.operator === 'and' && !left) {
      return false
    }

    if (expression.operator === 'or' && left) {
      return true
    }

    const right = evaluateScadaDslSemanticExpression(expression.right, context)
    return typeof right === 'boolean' ? right : undefined
  }

  const left = evaluateScadaDslSemanticExpression(expression.left, context)
  const right = evaluateScadaDslSemanticExpression(expression.right, context)

  if (expression.operator === '==' || expression.operator === '!=') {
    if (left === undefined || right === undefined) {
      return undefined
    }
    return expression.operator === '==' ? left === right : left !== right
  }

  if (
    expression.operator === '>' ||
    expression.operator === '>=' ||
    expression.operator === '<' ||
    expression.operator === '<='
  ) {
    if (typeof left !== 'number' || typeof right !== 'number') {
      return undefined
    }

    if (expression.operator === '>') {
      return left > right
    }
    if (expression.operator === '>=') {
      return left >= right
    }
    if (expression.operator === '<') {
      return left < right
    }
    return left <= right
  }

  if (typeof left !== 'number' || typeof right !== 'number') {
    return undefined
  }

  if (expression.operator === '+') {
    return finiteNumber(left + right)
  }
  if (expression.operator === '-') {
    return finiteNumber(left - right)
  }
  if (expression.operator === '*') {
    return finiteNumber(left * right)
  }
  if (expression.operator === '/') {
    return right === 0 ? undefined : finiteNumber(left / right)
  }

  return right === 0 ? undefined : finiteNumber(left % right)
}

export function selectScadaDslBehaviorBranch(
  behavior: ScadaDslBehaviorPlan,
  context: ScadaDslEvaluationContext,
): ScadaDslBehaviorBranchPlan | null {
  for (const branch of behavior.branches) {
    if (branch.condition === null) {
      return branch
    }

    const matched = evaluateScadaDslSemanticExpression(
      branch.condition,
      context,
    )

    if (matched === true) {
      return branch
    }
  }

  return null
}

/**
 * Action-oriented if/else uses branch-entry semantics:
 *
 * - the active branch fires once on initial activation;
 * - repeated telemetry that keeps the same branch active does not replay it;
 * - moving to another branch fires that branch once;
 * - leaving an if-without-else to "no branch" performs no implicit action.
 *
 * Persistent visual truth should still use Value Binding. Component Actions are
 * for branch-entry / transient behavior.
 */
export function shouldFireScadaDslBehaviorBranch(
  previousBranchId: string | null,
  currentBranchId: string | null,
) {
  return currentBranchId !== null && currentBranchId !== previousBranchId
}
