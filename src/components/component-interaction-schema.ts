import type {
  ComponentActionDefinition,
  ComponentContractValueDefinition,
  ComponentEventDefinition,
  ComponentValueKind,
} from '../component-system/definition'

export type InteractionSchemaFieldView = Readonly<{
  name: string
  title: string
  description?: string
  type: string
  requirement: string
  nullability: string
  options: readonly Readonly<{ label: string; value: string }>[]
}>

const KIND_LABELS: Record<ComponentValueKind, string> = {
  string: '文本',
  number: '数字',
  boolean: '布尔',
  color: '颜色',
  select: '枚举',
}

function describeField(
  name: string,
  field: ComponentContractValueDefinition & { optional?: boolean },
): InteractionSchemaFieldView {
  return {
    name,
    title: field.title,
    description: field.description,
    type: `${field.kind} · ${KIND_LABELS[field.kind]}`,
    requirement: field.optional === true ? '可选' : '必填',
    nullability: field.nullable === true ? '允许 null' : '不允许 null',
    // Preserve scalar identity: number 1 and string "1" are different contracts.
    options: (field.options ?? []).map((option) => ({
      label: option.label,
      value: JSON.stringify(option.value),
    })),
  }
}

/** Presentation only: preserve declared positional order, without defaults/coercion. */
export function describeActionParameters(
  action: ComponentActionDefinition,
): readonly InteractionSchemaFieldView[] {
  return (action.parameters ?? []).map((parameter) => describeField(parameter.name, parameter))
}

/** Undefined means no payload is accepted; [] means an empty record schema. */
export function describeEventPayload(
  event: ComponentEventDefinition,
): readonly InteractionSchemaFieldView[] | undefined {
  return event.payload === undefined
    ? undefined
    : Object.entries(event.payload).map(([name, field]) => describeField(name, field))
}
