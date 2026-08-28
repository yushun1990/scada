import type {
  ComponentContractValueDefinition,
  ComponentPropertyDefinition,
  ComponentScalarValue,
} from '../component-system/definition'
import type { ScadaPropertyReference } from './scada-behavior-contract'
import type {
  ScadaDslCapabilityCatalog,
  ScadaDslCapabilityItem,
  ScadaDslExpression,
  ScadaDslProgram,
  ScadaDslReferenceExpression,
  ScadaDslSpan,
  ScadaDslStatement,
} from './scada-dsl'
import type {
  ScadaDslSemanticExpression,
  ScadaDslSemanticPlan,
  ScadaDslSemanticReference,
} from './scada-dsl-semantics'

export type ScadaDslStaticType = 'number' | 'boolean' | 'string' | 'null'

export type ScadaDslTypeDiagnostic = {
  message: string
  span: ScadaDslSpan
}

export type ScadaDslTypeCheckResult = {
  diagnostics: readonly ScadaDslTypeDiagnostic[]
}

export type ScadaDslTypeCheckOptions = {
  primaryDeviceSymbol?: string
}

type InferredType = {
  types: readonly ScadaDslStaticType[]
  valid: boolean
}

const TYPE_ORDER: readonly ScadaDslStaticType[] = [
  'number',
  'boolean',
  'string',
  'null',
]

function scalarType(value: ComponentScalarValue): ScadaDslStaticType {
  if (value === null) return 'null'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

function uniqueTypes(types: readonly ScadaDslStaticType[]) {
  const wanted = new Set(types)
  return TYPE_ORDER.filter((type) => wanted.has(type))
}

function propertyTypes(
  property: ComponentPropertyDefinition,
): readonly ScadaDslStaticType[] {
  const types: ScadaDslStaticType[] = []

  if (property.kind === 'number') types.push('number')
  else if (property.kind === 'boolean') types.push('boolean')
  else if (property.kind === 'string' || property.kind === 'color') {
    types.push('string')
  } else if (property.options?.length) {
    for (const option of property.options) {
      types.push(typeof option.value === 'number' ? 'number' : 'string')
    }
  } else if (property.defaultValue !== null) {
    types.push(scalarType(property.defaultValue))
  } else {
    // A select without options/default is unresolved at authoring time. Keep
    // both scalar select families rather than inventing coercion semantics.
    types.push('string', 'number')
  }

  if (property.defaultValue === null) {
    types.push('null')
  }

  return uniqueTypes(types)
}

function contractValueTypes(
  definition: ComponentContractValueDefinition,
): readonly ScadaDslStaticType[] {
  const types: ScadaDslStaticType[] = []

  if (definition.kind === 'number') types.push('number')
  else if (definition.kind === 'boolean') types.push('boolean')
  else if (definition.kind === 'string' || definition.kind === 'color') {
    types.push('string')
  } else if (definition.options?.length) {
    for (const option of definition.options) {
      types.push(typeof option.value === 'number' ? 'number' : 'string')
    }
  } else {
    // An unbounded select may accept either supported scalar select family.
    types.push('string', 'number')
  }

  if (definition.nullable) types.push('null')
  return uniqueTypes(types)
}

function formatTypes(types: readonly ScadaDslStaticType[]) {
  return types.join(' | ')
}

function findCapability(
  reference: ScadaDslReferenceExpression,
  catalog: ScadaDslCapabilityCatalog,
): ScadaDslCapabilityItem | null {
  if (reference.path.length !== 2) return null
  const [symbol, member] = reference.path
  const matches = catalog.items.filter(
    (item) => item.symbol === symbol && item.member === member,
  )
  return matches.length === 1 ? matches[0]! : null
}

function inferReferenceType(
  reference: ScadaDslReferenceExpression,
  catalog: ScadaDslCapabilityCatalog,
): InferredType {
  const capability = findCapability(reference, catalog)
  if (!capability || capability.capabilityKind !== 'property' || !capability.property) {
    // Semantic lowering owns the detailed unknown/ambiguous/not-a-property
    // diagnostic. Avoid duplicating a less useful type error here.
    return { types: [], valid: false }
  }

  return { types: propertyTypes(capability.property), valid: true }
}

function requireExactType(
  inferred: InferredType,
  expected: ScadaDslStaticType,
  span: ScadaDslSpan,
  diagnostics: ScadaDslTypeDiagnostic[],
  context: string,
) {
  if (!inferred.valid) return false
  if (inferred.types.length === 1 && inferred.types[0] === expected) return true

  diagnostics.push({
    message: `${context}需要 ${expected}，实际可能是 ${formatTypes(inferred.types)}`,
    span,
  })
  return false
}

function typesOverlap(
  left: readonly ScadaDslStaticType[],
  right: readonly ScadaDslStaticType[],
) {
  return left.some((type) => right.includes(type))
}

function isAssignable(
  source: readonly ScadaDslStaticType[],
  target: readonly ScadaDslStaticType[],
) {
  return source.every((type) => target.includes(type))
}

function inferExpressionType(
  expression: ScadaDslExpression,
  catalog: ScadaDslCapabilityCatalog,
  diagnostics: ScadaDslTypeDiagnostic[],
): InferredType {
  if (expression.kind === 'literal') {
    return { types: [scalarType(expression.value)], valid: true }
  }

  if (expression.kind === 'reference') {
    return inferReferenceType(expression, catalog)
  }

  if (expression.kind === 'unary') {
    const operand = inferExpressionType(expression.operand, catalog, diagnostics)
    if (expression.operator === 'not') {
      const valid = requireExactType(
        operand,
        'boolean',
        expression.operand.span,
        diagnostics,
        '`not` ',
      )
      return { types: ['boolean'], valid }
    }

    const valid = requireExactType(
      operand,
      'number',
      expression.operand.span,
      diagnostics,
      '一元 `-` ',
    )
    return { types: ['number'], valid }
  }

  if (expression.kind === 'conditional') {
    const condition = inferExpressionType(
      expression.condition,
      catalog,
      diagnostics,
    )
    const conditionValid = requireExactType(
      condition,
      'boolean',
      expression.condition.span,
      diagnostics,
      '`if` 条件',
    )
    const consequent = inferExpressionType(
      expression.consequent,
      catalog,
      diagnostics,
    )
    const alternate = inferExpressionType(
      expression.alternate,
      catalog,
      diagnostics,
    )

    return {
      types: uniqueTypes([...consequent.types, ...alternate.types]),
      valid: conditionValid && consequent.valid && alternate.valid,
    }
  }

  const left = inferExpressionType(expression.left, catalog, diagnostics)
  const right = inferExpressionType(expression.right, catalog, diagnostics)

  if (expression.operator === 'and' || expression.operator === 'or') {
    const leftValid = requireExactType(
      left,
      'boolean',
      expression.left.span,
      diagnostics,
      `\`${expression.operator}\` 左侧`,
    )
    const rightValid = requireExactType(
      right,
      'boolean',
      expression.right.span,
      diagnostics,
      `\`${expression.operator}\` 右侧`,
    )
    return { types: ['boolean'], valid: leftValid && rightValid }
  }

  if (
    expression.operator === '+' ||
    expression.operator === '-' ||
    expression.operator === '*' ||
    expression.operator === '/' ||
    expression.operator === '%'
  ) {
    const leftValid = requireExactType(
      left,
      'number',
      expression.left.span,
      diagnostics,
      `\`${expression.operator}\` 左侧`,
    )
    const rightValid = requireExactType(
      right,
      'number',
      expression.right.span,
      diagnostics,
      `\`${expression.operator}\` 右侧`,
    )
    return { types: ['number'], valid: leftValid && rightValid }
  }

  if (
    expression.operator === '>' ||
    expression.operator === '>=' ||
    expression.operator === '<' ||
    expression.operator === '<='
  ) {
    const leftValid = requireExactType(
      left,
      'number',
      expression.left.span,
      diagnostics,
      `\`${expression.operator}\` 左侧`,
    )
    const rightValid = requireExactType(
      right,
      'number',
      expression.right.span,
      diagnostics,
      `\`${expression.operator}\` 右侧`,
    )
    return { types: ['boolean'], valid: leftValid && rightValid }
  }

  if (left.valid && right.valid && !typesOverlap(left.types, right.types)) {
    diagnostics.push({
      message: `\`${expression.operator}\` 两侧类型不兼容：${formatTypes(left.types)} 与 ${formatTypes(right.types)}`,
      span: expression.span,
    })
    return { types: ['boolean'], valid: false }
  }

  return {
    types: ['boolean'],
    valid: left.valid && right.valid,
  }
}

function requiredActionArgumentCount(
  parameters: readonly { optional?: boolean }[],
) {
  let count = 0
  parameters.forEach((parameter, index) => {
    if (!parameter.optional) count = index + 1
  })
  return count
}

function checkActionArguments(
  statement: Extract<ScadaDslStatement, { kind: 'call-statement' }>,
  catalog: ScadaDslCapabilityCatalog,
  diagnostics: ScadaDslTypeDiagnostic[],
) {
  const inferredArguments = statement.call.arguments.map((argument) =>
    inferExpressionType(argument, catalog, diagnostics),
  )
  const capability = findCapability(statement.call.callee, catalog)
  if (
    !capability ||
    capability.capabilityKind !== 'action' ||
    !capability.action
  ) {
    // Semantic lowering owns unknown/not-an-Action diagnostics.
    return
  }

  const parameters = capability.action.parameters ?? []
  const minimum = requiredActionArgumentCount(parameters)
  const maximum = parameters.length
  if (
    statement.call.arguments.length < minimum ||
    statement.call.arguments.length > maximum
  ) {
    diagnostics.push({
      message: `Action ${statement.call.callee.path.join('.')} 参数数量无效：需要 ${minimum}..${maximum} 个，实际 ${statement.call.arguments.length} 个`,
      span: statement.call.span,
    })
  }

  const comparableCount = Math.min(
    statement.call.arguments.length,
    parameters.length,
  )
  for (let index = 0; index < comparableCount; index += 1) {
    const inferred = inferredArguments[index]!
    const parameter = parameters[index]!
    if (!inferred.valid) continue

    const accepted = contractValueTypes(parameter)
    if (!isAssignable(inferred.types, accepted)) {
      diagnostics.push({
        message: `Action ${statement.call.callee.path.join('.')} 参数 ${index + 1}（${parameter.name}）需要 ${formatTypes(accepted)}，实际可能是 ${formatTypes(inferred.types)}`,
        span: statement.call.arguments[index]!.span,
      })
    }
  }
}

function checkStatement(
  statement: ScadaDslStatement,
  catalog: ScadaDslCapabilityCatalog,
  diagnostics: ScadaDslTypeDiagnostic[],
) {
  if (statement.kind === 'assignment') {
    const target = findCapability(statement.target, catalog)
    const source = inferExpressionType(statement.value, catalog, diagnostics)

    if (
      target?.symbol === 'component' &&
      target.capabilityKind === 'property' &&
      target.property &&
      source.valid
    ) {
      const accepted = propertyTypes(target.property)
      if (!isAssignable(source.types, accepted)) {
        diagnostics.push({
          message: `不能把 ${formatTypes(source.types)} 赋给 component.${target.member}（需要 ${formatTypes(accepted)}）`,
          span: statement.value.span,
        })
      }
    }
    return
  }

  if (statement.kind === 'call-statement') {
    checkActionArguments(statement, catalog, diagnostics)
    return
  }

  if (statement.kind === 'if') {
    const condition = inferExpressionType(statement.condition, catalog, diagnostics)
    requireExactType(
      condition,
      'boolean',
      statement.condition.span,
      diagnostics,
      '`if` 条件',
    )
    for (const child of statement.consequent) {
      checkStatement(child, catalog, diagnostics)
    }
    for (const child of statement.alternate ?? []) {
      checkStatement(child, catalog, diagnostics)
    }
    return
  }

  for (const child of statement.body) {
    checkStatement(child, catalog, diagnostics)
  }
}

export function checkScadaDslTypes(
  program: ScadaDslProgram,
  catalog: ScadaDslCapabilityCatalog,
  _options: ScadaDslTypeCheckOptions = {},
): ScadaDslTypeCheckResult {
  const diagnostics: ScadaDslTypeDiagnostic[] = []
  for (const statement of program.statements) {
    checkStatement(statement, catalog, diagnostics)
  }
  return { diagnostics }
}

export type ScadaDslDependency = ScadaDslSemanticReference

export type ScadaDslValueDependencyEntry = {
  id: string
  triggerDependencies: readonly ScadaDslDependency[]
  readDependencies: readonly ScadaDslDependency[]
}

export type ScadaDslBehaviorDependencyEntry = {
  id: string
  triggerDependencies: readonly ScadaDslDependency[]
  readDependencies: readonly ScadaDslDependency[]
}

export type ScadaDslInteractionDependencyEntry = {
  id: string
  event: string
  triggerDependencies: readonly []
  readDependencies: readonly ScadaDslDependency[]
}

export type ScadaDslDependencyIndex = {
  valueBindings: readonly ScadaDslValueDependencyEntry[]
  behaviors: readonly ScadaDslBehaviorDependencyEntry[]
  interactions: readonly ScadaDslInteractionDependencyEntry[]
}

function dependencyKey(dependency: ScadaDslDependency) {
  if (dependency.kind === 'component-property') {
    return `component:${dependency.property}`
  }

  const reference: ScadaPropertyReference = dependency.reference
  return reference.scope === 'primary-device'
    ? `source:primary:${reference.property}`
    : `source:external:${reference.sourceId}:${reference.property}`
}

function collectExpressionDependencies(
  expression: ScadaDslSemanticExpression,
  output: Map<string, ScadaDslDependency>,
) {
  if (expression.kind === 'literal') return

  if (expression.kind === 'reference') {
    output.set(dependencyKey(expression.reference), expression.reference)
    return
  }

  if (expression.kind === 'unary') {
    collectExpressionDependencies(expression.operand, output)
    return
  }

  if (expression.kind === 'conditional') {
    collectExpressionDependencies(expression.condition, output)
    collectExpressionDependencies(expression.consequent, output)
    collectExpressionDependencies(expression.alternate, output)
    return
  }

  collectExpressionDependencies(expression.left, output)
  collectExpressionDependencies(expression.right, output)
}

function toDependencies(map: Map<string, ScadaDslDependency>) {
  return [...map.values()]
}

export function extractScadaDslDependencies(
  plan: ScadaDslSemanticPlan,
): ScadaDslDependencyIndex {
  return {
    valueBindings: plan.valueBindings.map((binding) => {
      const read = new Map<string, ScadaDslDependency>()
      collectExpressionDependencies(binding.expression, read)
      const dependencies = toDependencies(read)
      return {
        id: binding.id,
        triggerDependencies: dependencies,
        readDependencies: dependencies,
      }
    }),
    behaviors: plan.behaviors.map((behavior) => {
      const trigger = new Map<string, ScadaDslDependency>()
      const read = new Map<string, ScadaDslDependency>()

      for (const branch of behavior.branches) {
        if (branch.condition) {
          collectExpressionDependencies(branch.condition, trigger)
          collectExpressionDependencies(branch.condition, read)
        }
        for (const action of branch.actions) {
          for (const argument of action.arguments) {
            collectExpressionDependencies(argument, read)
          }
        }
      }

      return {
        id: behavior.id,
        triggerDependencies: toDependencies(trigger),
        readDependencies: toDependencies(read),
      }
    }),
    interactions: plan.interactions.map((interaction) => {
      const read = new Map<string, ScadaDslDependency>()
      for (const argument of interaction.action.arguments) {
        collectExpressionDependencies(argument, read)
      }
      return {
        id: interaction.id,
        event: interaction.event,
        triggerDependencies: [] as const,
        readDependencies: toDependencies(read),
      }
    }),
  }
}
