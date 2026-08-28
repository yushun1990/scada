import {
  createDefaultPropsFromDefinition,
  isComponentPropertyValue,
  type ComponentDefinition,
  type ComponentProps,
} from '../component-system/definition'
import type { DataBinding } from '../scene/model'
import type { RuntimeValueSnapshot } from './runtime-value-store'

/**
 * Resolve one deterministic effective Component Property snapshot.
 *
 * Layer order:
 *
 *   defaults
 *     < authored Scene props
 *     < legacy Scene v6 runtime-value bindings
 *     < compiled-DSL derived overrides
 *
 * The legacy binding layer remains a compatibility input only. New compiled
 * semantics do not write into RuntimeValueStore and instead provide explicit
 * derived overrides through the final layer.
 */
export function resolveEffectiveComponentProps(
  definition: ComponentDefinition,
  authoredProps: Readonly<ComponentProps>,
  bindings: readonly DataBinding[],
  runtimeValues: RuntimeValueSnapshot,
  derivedOverrides: Readonly<ComponentProps> = {},
): ComponentProps {
  const effectiveProps: ComponentProps = {
    ...createDefaultPropsFromDefinition(definition),
    ...authoredProps,
  }

  for (const binding of bindings) {
    const property = definition.properties[binding.property]

    if (!property?.bindable) {
      continue
    }

    if (!Object.hasOwn(runtimeValues, binding.source.key)) {
      continue
    }

    const runtimeValue = runtimeValues[binding.source.key]

    if (!isComponentPropertyValue(property, runtimeValue)) {
      continue
    }

    effectiveProps[binding.property] = runtimeValue
  }

  for (const [propertyName, value] of Object.entries(derivedOverrides)) {
    const property = definition.properties[propertyName]
    if (!property || !isComponentPropertyValue(property, value)) continue
    effectiveProps[propertyName] = value
  }

  return effectiveProps
}
