export type ComponentScalarValue = string | number | boolean | null

export type ComponentValueKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'color'
  | 'select'

/** @deprecated Prefer ComponentValueKind for shared scalar contract kinds. */
export type ComponentPropertyKind = ComponentValueKind

export type ComponentValueOption = {
  label: string
  value: string | number
}

/** @deprecated Prefer ComponentValueOption for shared scalar contract options. */
export type ComponentPropertyOption = ComponentValueOption

export type ComponentAttributeDefinition = {
  title: string
  kind: ComponentValueKind
  defaultValue: ComponentScalarValue
  description?: string
  options?: readonly ComponentValueOption[]
}

export type ComponentPropertyDefinition = {
  title: string
  kind: ComponentValueKind
  defaultValue: ComponentScalarValue
  description?: string
  bindable?: boolean
  options?: readonly ComponentValueOption[]
}

/**
 * Scalar public-contract value used by Action parameters and Event payload
 * fields. Unlike Component Properties, these values have no default value, so
 * nullability is explicit instead of inferred from a default.
 */
export type ComponentContractValueDefinition = {
  title: string
  kind: ComponentValueKind
  description?: string
  nullable?: boolean
  options?: readonly ComponentValueOption[]
}

export type ComponentActionParameterDefinition = ComponentContractValueDefinition & {
  name: string
  /** Optional Action parameters must be trailing in parameter order. */
  optional?: boolean
}

export type ComponentActionDefinition = {
  title: string
  description?: string
  /** Ordered parameters map directly to ordered DSL/runtime Action arguments. */
  parameters?: readonly ComponentActionParameterDefinition[]
}

export type ComponentEventPayloadFieldDefinition = ComponentContractValueDefinition & {
  /** Missing fields are rejected unless explicitly optional. */
  optional?: boolean
}

export type ComponentEventDefinition = {
  title: string
  description?: string
  /**
   * Event payloads are named records. When omitted, the Event accepts no
   * payload. A declared payload schema rejects unknown fields.
   */
  payload?: Readonly<Record<string, ComponentEventPayloadFieldDefinition>>
}

export type ComponentActionArguments = readonly ComponentScalarValue[]
export type ComponentEventPayload = Readonly<Record<string, ComponentScalarValue>>

export type VisualAnchorRole = 'neutral' | 'source' | 'target' | 'both'

export type VisualAnchorDefinition = {
  id: string
  title: string
  position: {
    x: number
    y: number
  }
  outward: {
    x: number
    y: number
  }
  snapRadius?: number
  role?: VisualAnchorRole
  kinds?: string[]
}

export type ComponentSizeDefinition = {
  defaultWidth: number
  defaultHeight: number
  minWidth: number
  minHeight: number
}

type ComponentDefinitionBase = {
  type: string
  title: string
  category: string
  description: string
  size: ComponentSizeDefinition
  actions: Readonly<Record<string, ComponentActionDefinition>>
  events: Readonly<Record<string, ComponentEventDefinition>>
  anchors: readonly VisualAnchorDefinition[]
}

/**
 * Current public component contract. Authored configuration and runtime-capable
 * state are structurally separate authorities.
 */
export type ComponentDefinition = ComponentDefinitionBase & {
  attributes: Readonly<Record<string, ComponentAttributeDefinition>>
  properties: Readonly<Record<string, ComponentPropertyDefinition>>
}

/**
 * Pre-M9 component definition shape. This type is migration input only and must
 * not become a second live component authority.
 */
export type LegacyComponentDefinition = ComponentDefinitionBase & {
  properties: Readonly<Record<string, ComponentPropertyDefinition>>
}

export type ComponentAttributeValues = Record<string, ComponentScalarValue>
export type ComponentPropertyFallbackValues = Record<string, ComponentScalarValue>

/**
 * Compatibility name used by the current runtime/renderer until M9B1 splits
 * authored Attributes from effective Properties at runtime. It represents only
 * the Property-side value bag and must not be used for Attributes.
 */
export type ComponentProps = ComponentPropertyFallbackValues

function isComponentScalarForContract(
  kind: ComponentValueKind,
  options: readonly ComponentValueOption[] | undefined,
  allowNull: boolean,
  value: unknown,
): value is ComponentScalarValue {
  if (value === null) return allowNull

  if (kind === 'number') {
    return typeof value === 'number' && Number.isFinite(value)
  }

  if (kind === 'boolean') {
    return typeof value === 'boolean'
  }

  if (kind === 'select') {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return false
    }

    return options?.length
      ? options.some((option) => option.value === value)
      : true
  }

  return typeof value === 'string'
}

export function isComponentContractValue(
  definition: ComponentContractValueDefinition,
  value: unknown,
): value is ComponentScalarValue {
  return isComponentScalarForContract(
    definition.kind,
    definition.options,
    definition.nullable === true,
    value,
  )
}

export function isComponentAttributeValue(
  definition: ComponentAttributeDefinition,
  value: unknown,
): value is ComponentScalarValue {
  return isComponentScalarForContract(
    definition.kind,
    definition.options,
    definition.defaultValue === null,
    value,
  )
}

export function isComponentPropertyValue(
  definition: ComponentPropertyDefinition,
  value: unknown,
): value is ComponentScalarValue {
  return isComponentScalarForContract(
    definition.kind,
    definition.options,
    definition.defaultValue === null,
    value,
  )
}

export function createDefaultAttributeValuesFromDefinition(
  definition: ComponentDefinition,
): ComponentAttributeValues {
  const attributes: ComponentAttributeValues = {}

  for (const [key, attribute] of Object.entries(definition.attributes)) {
    attributes[key] = attribute.defaultValue
  }

  return attributes
}

export function createDefaultPropertyFallbackValuesFromDefinition(
  definition: Pick<ComponentDefinition, 'properties'>,
): ComponentPropertyFallbackValues {
  const properties: ComponentPropertyFallbackValues = {}

  for (const [key, property] of Object.entries(definition.properties)) {
    properties[key] = property.defaultValue
  }

  return properties
}

/**
 * Compatibility helper for the current Property-only runtime value bag.
 * Attributes deliberately do not participate in this result.
 */
export function createDefaultPropsFromDefinition(
  definition: Pick<ComponentDefinition, 'properties'>,
): ComponentProps {
  return createDefaultPropertyFallbackValuesFromDefinition(definition)
}
