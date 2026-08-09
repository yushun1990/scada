import {
  createDefaultPropsFromDefinition,
  isComponentPropertyValue,
  type ComponentDefinition,
  type ComponentProps,
} from '../component-system/definition'
import type { DataBinding } from '../scene/model'
import type { RuntimeValueSnapshot } from './runtime-value-store'

export function resolveEffectiveComponentProps(
  definition: ComponentDefinition,
  authoredProps: Readonly<ComponentProps>,
  bindings: readonly DataBinding[],
  runtimeValues: RuntimeValueSnapshot,
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

  return effectiveProps
}
