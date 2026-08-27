import type { ComponentScalarValue } from '../component-system/definition'

export type ScadaPrimaryDeviceContext = {
  deviceId: string
}

export type ScadaPropertyReference =
  | {
      scope: 'primary-device'
      property: string
    }
  | {
      scope: 'external'
      sourceId: string
      property: string
    }

export type ScadaConditionOperand =
  | {
      kind: 'literal'
      value: ComponentScalarValue
    }
  | {
      kind: 'property'
      reference: ScadaPropertyReference
    }

export type ScadaComparisonOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'

export type ScadaConditionClause = {
  id: string
  left: ScadaConditionOperand
  operator: ScadaComparisonOperator
  right: ScadaConditionOperand
}

/**
 * Conditions inside one group are AND-ed together.
 *
 * The UI should present a group as one alternative way for a behavior to match.
 * Groups are intentionally flat so ordinary scene authors do not have to reason
 * about arbitrary nested boolean expression trees.
 */
export type ScadaConditionGroup = {
  id: string
  conditions: readonly ScadaConditionClause[]
}

/**
 * Groups are OR-ed together. This gives the normal UI a simple shape:
 *
 *   group A: A AND B
 *   OR
 *   group B: C AND D
 *
 * without turning the SCADA Workbench into a general rule-language editor.
 */
export type ScadaConditionSet = {
  groups: readonly ScadaConditionGroup[]
}

export type ScadaComponentActionEffect = {
  kind: 'component-action'
  action: string
}

export type ScadaBehaviorBinding = {
  id: string
  enabled: boolean
  edge: 'enter' | 'leave'
  conditions: ScadaConditionSet
  effect: ScadaComponentActionEffect
}

export type ScadaDeviceActionReference =
  | {
      scope: 'primary-device'
      action: string
    }
  | {
      scope: 'external'
      sourceId: string
      action: string
    }

export type ScadaInteractionBinding = {
  id: string
  enabled: boolean
  event: string
  effect: {
    kind: 'device-action'
    target: ScadaDeviceActionReference
  }
}

export type ResolvedScadaPropertyReference = {
  sourceId: string
  property: string
}

export type ResolvedScadaDeviceActionReference = {
  sourceId: string
  action: string
}

export type ScadaRuntimeValueReader = (
  sourceId: string,
  property: string,
) => ComponentScalarValue | undefined

export function resolveScadaPropertyReference(
  reference: ScadaPropertyReference,
  primaryDevice: ScadaPrimaryDeviceContext | null,
): ResolvedScadaPropertyReference | null {
  if (reference.scope === 'external') {
    return {
      sourceId: reference.sourceId,
      property: reference.property,
    }
  }

  if (!primaryDevice) {
    return null
  }

  return {
    sourceId: primaryDevice.deviceId,
    property: reference.property,
  }
}

export function resolveScadaDeviceActionReference(
  reference: ScadaDeviceActionReference,
  primaryDevice: ScadaPrimaryDeviceContext | null,
): ResolvedScadaDeviceActionReference | null {
  if (reference.scope === 'external') {
    return {
      sourceId: reference.sourceId,
      action: reference.action,
    }
  }

  if (!primaryDevice) {
    return null
  }

  return {
    sourceId: primaryDevice.deviceId,
    action: reference.action,
  }
}

function resolveConditionOperand(
  operand: ScadaConditionOperand,
  primaryDevice: ScadaPrimaryDeviceContext | null,
  readValue: ScadaRuntimeValueReader,
): ComponentScalarValue | undefined {
  if (operand.kind === 'literal') {
    return operand.value
  }

  const reference = resolveScadaPropertyReference(
    operand.reference,
    primaryDevice,
  )

  if (!reference) {
    return undefined
  }

  return readValue(reference.sourceId, reference.property)
}

function compareConditionValues(
  left: ComponentScalarValue,
  operator: ScadaComparisonOperator,
  right: ComponentScalarValue,
) {
  if (operator === 'eq') {
    return left === right
  }

  if (operator === 'neq') {
    return left !== right
  }

  if (typeof left !== 'number' || typeof right !== 'number') {
    return false
  }

  if (operator === 'gt') {
    return left > right
  }

  if (operator === 'gte') {
    return left >= right
  }

  if (operator === 'lt') {
    return left < right
  }

  return left <= right
}

export function evaluateScadaConditionClause(
  clause: ScadaConditionClause,
  primaryDevice: ScadaPrimaryDeviceContext | null,
  readValue: ScadaRuntimeValueReader,
) {
  const left = resolveConditionOperand(clause.left, primaryDevice, readValue)
  const right = resolveConditionOperand(clause.right, primaryDevice, readValue)

  if (left === undefined || right === undefined) {
    return false
  }

  return compareConditionValues(left, clause.operator, right)
}

export function evaluateScadaConditionSet(
  conditionSet: ScadaConditionSet,
  primaryDevice: ScadaPrimaryDeviceContext | null,
  readValue: ScadaRuntimeValueReader,
) {
  if (conditionSet.groups.length === 0) {
    return false
  }

  return conditionSet.groups.some((group) =>
    group.conditions.length > 0 &&
    group.conditions.every((condition) =>
      evaluateScadaConditionClause(condition, primaryDevice, readValue),
    ),
  )
}

export function shouldFireScadaBehavior(
  behavior: ScadaBehaviorBinding,
  previousMatched: boolean,
  currentMatched: boolean,
) {
  if (!behavior.enabled) {
    return false
  }

  return behavior.edge === 'enter'
    ? !previousMatched && currentMatched
    : previousMatched && !currentMatched
}
