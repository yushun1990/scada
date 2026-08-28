export type ComponentScalarValue = string | number | boolean | null

export type ComponentPropertyKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'color'
  | 'select'

export type ComponentPropertyOption = {
  label: string
  value: string | number
}

export type ComponentPropertyDefinition = {
  title: string
  kind: ComponentPropertyKind
  defaultValue: ComponentScalarValue
  description?: string
  bindable?: boolean
  options?: readonly ComponentPropertyOption[]
}

/**
 * Scalar public-contract value used by Action parameters and Event payload
 * fields. Unlike Component Properties, these values have no default value, so
 * nullability is explicit instead of inferred from a default.
 */
export type ComponentContractValueDefinition = {
  title: string
  kind: ComponentPropertyKind
  description?: string
  nullable?: boolean
  options?: readonly ComponentPropertyOption[]
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

export type ComponentDefinition = {
  type: string
  title: string
  category: string
  description: string
  size: ComponentSizeDefinition
  properties: Readonly<Record<string, ComponentPropertyDefinition>>
  actions: Readonly<Record<string, ComponentActionDefinition>>
  events: Readonly<Record<string, ComponentEventDefinition>>
  anchors: readonly VisualAnchorDefinition[]
}

export type ComponentProps = Record<string, ComponentScalarValue>

function isComponentScalarForContract(
  kind: ComponentPropertyKind,
  options: readonly ComponentPropertyOption[] | undefined,
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

export function createDefaultPropsFromDefinition(
  definition: ComponentDefinition,
): ComponentProps {
  const props: ComponentProps = {}

  for (const [key, property] of Object.entries(definition.properties)) {
    props[key] = property.defaultValue
  }

  return props
}
