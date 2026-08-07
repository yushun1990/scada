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

export type ComponentActionDefinition = {
  title: string
  description?: string
}

export type ComponentEventDefinition = {
  title: string
  description?: string
}

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

export type ComponentRegistration = {
  definition: ComponentDefinition
  createDefaultProps: () => ComponentProps
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
