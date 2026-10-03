import {
  isComponentPropertyValue,
  type ComponentDefinition,
} from '../../component-system/definition'
import type { ComponentVisualDefinition } from '../../component-system/visual'
import type { VisualRuleOperator } from '../../component-system/visualRules'

/** Explicit editor intent; never persisted into the public contract or package. */
export type ContractKeyRename = Readonly<{ previousKey: string; nextKey: string }>

const NUMERIC_RULE_OPERATORS = new Set<VisualRuleOperator>([
  'greaterThan',
  'greaterOrEqual',
  'lessThan',
  'lessOrEqual',
])

export function reconcileVisualPropertyReferences(
  previousDefinition: ComponentDefinition,
  nextDefinition: ComponentDefinition,
  visual: ComponentVisualDefinition,
  rename?: ContractKeyRename,
): ComponentVisualDefinition {
  if (rename && (
    !Object.hasOwn(previousDefinition.properties, rename.previousKey) ||
    Object.hasOwn(nextDefinition.properties, rename.previousKey) ||
    Object.hasOwn(previousDefinition.properties, rename.nextKey) ||
    !Object.hasOwn(nextDefinition.properties, rename.nextKey)
  )) {
    throw new Error('Invalid Component Property rename')
  }

  function resolveProperty(propertyKey: string) {
    const nextKey = rename?.previousKey === propertyKey ? rename.nextKey : propertyKey
    const property = nextDefinition.properties[nextKey]
    return Object.hasOwn(nextDefinition.properties, nextKey)
      ? { propertyKey: nextKey, property }
      : null
  }

  const rules = (visual.rules ?? []).flatMap((rule) => {
    const resolved = resolveProperty(rule.propertyKey)
    if (!resolved) return []

    let valueSource = rule.valueSource
    if (valueSource?.namespace === 'property') {
      const source = resolveProperty(valueSource.key)
      if (!source) return []
      valueSource = { ...valueSource, key: source.propertyKey }
    }

    const compareValueValid = isComponentPropertyValue(resolved.property, rule.compareValue)
    const operatorValid =
      !NUMERIC_RULE_OPERATORS.has(rule.operator) || resolved.property.kind === 'number'

    return [{
      ...rule,
      ...(valueSource ? { valueSource } : {}),
      propertyKey: resolved.propertyKey,
      operator: operatorValid ? rule.operator : 'equals' as const,
      compareValue: compareValueValid && operatorValid
        ? rule.compareValue
        : resolved.property.defaultValue,
    }]
  })

  const animations = visual.animations.flatMap((animation) => {
    if (animation.activation.kind === 'always') return [animation]

    const resolved = resolveProperty(animation.activation.propertyKey)
    if (!resolved) return []

    const compareValueValid = isComponentPropertyValue(
      resolved.property,
      animation.activation.compareValue,
    )
    const operatorValid =
      !NUMERIC_RULE_OPERATORS.has(animation.activation.operator) ||
      resolved.property.kind === 'number'

    return [{
      ...animation,
      activation: {
        ...animation.activation,
        propertyKey: resolved.propertyKey,
        operator: operatorValid ? animation.activation.operator : 'equals' as const,
        compareValue: compareValueValid && operatorValid
          ? animation.activation.compareValue
          : resolved.property.defaultValue,
      },
    }]
  })

  return { ...visual, rules, animations }
}
