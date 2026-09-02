import {
  isComponentAttributeValue,
  isComponentPropertyValue,
  type ComponentAttributeDefinition,
  type ComponentDefinition,
  type ComponentPropertyDefinition,
  type ComponentValueKind,
  type ComponentValueOption,
  type VisualAnchorRole,
} from './definition'

const VALUE_KINDS = new Set<ComponentValueKind>([
  'string',
  'number',
  'boolean',
  'color',
  'select',
])
const ANCHOR_ROLES = new Set<VisualAnchorRole>([
  'neutral',
  'source',
  'target',
  'both',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function assertText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label}不能为空`)
  }
}

function assertOptionalText(value: unknown, label: string) {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`${label}必须是字符串`)
  }
}

function assertValueKind(value: unknown, label: string): ComponentValueKind {
  if (
    typeof value !== 'string' ||
    !VALUE_KINDS.has(value as ComponentValueKind)
  ) {
    throw new Error(`${label}的类型无效`)
  }
  return value as ComponentValueKind
}

function parseOptions(
  kind: ComponentValueKind,
  value: unknown,
  label: string,
): readonly ComponentValueOption[] | undefined {
  if (value === undefined) {
    if (kind === 'select') {
      throw new Error(`Select ${label} 至少需要一个选项`)
    }
    return undefined
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} 的 options 必须是数组`)
  }

  const optionValues = new Set<string>()
  const parsed = value.map((option, index) => {
    if (
      !isRecord(option) ||
      typeof option.label !== 'string' ||
      !option.label.trim() ||
      (typeof option.value !== 'string' && typeof option.value !== 'number')
    ) {
      throw new Error(`${label} 的第 ${index + 1} 个选项无效`)
    }

    const identity = `${typeof option.value}:${String(option.value)}`
    if (optionValues.has(identity)) {
      throw new Error(`${label} 包含重复选项值 ${String(option.value)}`)
    }
    optionValues.add(identity)
    return {
      label: option.label,
      value: option.value,
    }
  })

  if (kind === 'select' && parsed.length === 0) {
    throw new Error(`Select ${label} 至少需要一个选项`)
  }
  if (kind !== 'select' && parsed.length > 0) {
    throw new Error(`只有 Select ${label} 可以定义 options`)
  }
  return parsed
}

function assertAttribute(
  componentType: string,
  key: string,
  value: unknown,
) {
  assertText(key, `组件 ${componentType} 的 Attribute key`)

  if (!isRecord(value)) {
    throw new Error(`组件 ${componentType} 的 Attribute ${key} 定义无效`)
  }

  assertText(value.title, `Attribute ${key} 标题`)
  const kind = assertValueKind(value.kind, `Attribute ${key} `)
  assertOptionalText(value.description, `Attribute ${key} 说明`)

  if (value.bindable !== undefined) {
    throw new Error(`Attribute ${key} 不能定义 bindable`)
  }

  const options = parseOptions(kind, value.options, `Attribute ${key}`)
  const attribute = {
    title: value.title,
    kind,
    defaultValue: value.defaultValue,
    description: value.description,
    options,
  } as ComponentAttributeDefinition

  if (!isComponentAttributeValue(attribute, value.defaultValue)) {
    throw new Error(`Attribute ${key} 的默认值与类型不兼容`)
  }
}

function assertProperty(
  componentType: string,
  key: string,
  value: unknown,
) {
  assertText(key, `组件 ${componentType} 的 Property key`)

  if (!isRecord(value)) {
    throw new Error(`组件 ${componentType} 的 Property ${key} 定义无效`)
  }

  assertText(value.title, `Property ${key} 标题`)
  const kind = assertValueKind(value.kind, `Property ${key} `)
  assertOptionalText(value.description, `Property ${key} 说明`)

  if (value.bindable !== undefined && typeof value.bindable !== 'boolean') {
    throw new Error(`Property ${key} 的 bindable 必须是布尔值`)
  }

  const options = parseOptions(kind, value.options, `Property ${key}`)
  const property = {
    title: value.title,
    kind,
    defaultValue: value.defaultValue,
    description: value.description,
    bindable: value.bindable,
    options,
  } as ComponentPropertyDefinition

  if (!isComponentPropertyValue(property, value.defaultValue)) {
    throw new Error(`Property ${key} 的默认值与类型不兼容`)
  }
}

function assertContractValueDefinition(
  value: Record<string, unknown>,
  label: string,
) {
  assertText(value.title, `${label} 标题`)
  const kind = assertValueKind(value.kind, `${label} `)
  assertOptionalText(value.description, `${label} 说明`)

  if (value.nullable !== undefined && typeof value.nullable !== 'boolean') {
    throw new Error(`${label} 的 nullable 必须是布尔值`)
  }

  return parseOptions(kind, value.options, label)
}

function assertActionDefinition(key: string, definition: unknown) {
  if (!isRecord(definition)) {
    throw new Error(`Action ${key} 定义无效`)
  }

  assertText(definition.title, `Action ${key} 标题`)
  assertOptionalText(definition.description, `Action ${key} 说明`)

  if (definition.parameters === undefined) return
  if (!Array.isArray(definition.parameters)) {
    throw new Error(`Action ${key} 的 parameters 必须是数组`)
  }

  const names = new Set<string>()
  let sawOptional = false
  definition.parameters.forEach((parameter, index) => {
    if (!isRecord(parameter)) {
      throw new Error(`Action ${key} 的第 ${index + 1} 个参数定义无效`)
    }

    assertText(parameter.name, `Action ${key} 参数 ${index + 1} 名称`)
    const name = parameter.name as string
    if (names.has(name)) {
      throw new Error(`Action ${key} 包含重复参数名 ${name}`)
    }
    names.add(name)

    assertContractValueDefinition(parameter, `Action ${key} 参数 ${name}`)
    if (parameter.optional !== undefined && typeof parameter.optional !== 'boolean') {
      throw new Error(`Action ${key} 参数 ${name} 的 optional 必须是布尔值`)
    }

    const optional = parameter.optional === true
    if (sawOptional && !optional) {
      throw new Error(`Action ${key} 的必填参数不能位于可选参数之后`)
    }
    sawOptional = sawOptional || optional
  })
}

function assertEventDefinition(key: string, definition: unknown) {
  if (!isRecord(definition)) {
    throw new Error(`Event ${key} 定义无效`)
  }

  assertText(definition.title, `Event ${key} 标题`)
  assertOptionalText(definition.description, `Event ${key} 说明`)

  if (definition.payload === undefined) return
  if (!isRecord(definition.payload)) {
    throw new Error(`Event ${key} 的 payload 必须是对象`)
  }

  for (const [fieldName, field] of Object.entries(definition.payload)) {
    assertText(fieldName, `Event ${key} payload 字段名`)
    if (!isRecord(field)) {
      throw new Error(`Event ${key} payload 字段 ${fieldName} 定义无效`)
    }
    assertContractValueDefinition(field, `Event ${key} payload 字段 ${fieldName}`)
    if (field.optional !== undefined && typeof field.optional !== 'boolean') {
      throw new Error(
        `Event ${key} payload 字段 ${fieldName} 的 optional 必须是布尔值`,
      )
    }
  }
}

function assertInteractionMap(
  componentType: string,
  label: 'Action' | 'Event',
  value: unknown,
) {
  if (!isRecord(value)) {
    throw new Error(`组件 ${componentType} 的 ${label} 定义必须是对象`)
  }

  for (const [key, definition] of Object.entries(value)) {
    assertText(key, `${label} key`)
    if (label === 'Action') assertActionDefinition(key, definition)
    else assertEventDefinition(key, definition)
  }
}

function assertAnchors(componentType: string, value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error(`组件 ${componentType} 的 anchors 必须是数组`)
  }

  const ids = new Set<string>()

  value.forEach((anchor, index) => {
    if (!isRecord(anchor)) {
      throw new Error(`组件 ${componentType} 的第 ${index + 1} 个 Anchor 无效`)
    }

    assertText(anchor.id, `Anchor ${index + 1} ID`)
    assertText(anchor.title, `Anchor ${String(anchor.id)} 标题`)

    if (ids.has(anchor.id as string)) {
      throw new Error(`组件 ${componentType} 包含重复 Anchor ${String(anchor.id)}`)
    }

    ids.add(anchor.id as string)

    if (!isRecord(anchor.position) || !isRecord(anchor.outward)) {
      throw new Error(`Anchor ${String(anchor.id)} 缺少位置或方向`)
    }

    if (
      !isFiniteNumber(anchor.position.x) ||
      !isFiniteNumber(anchor.position.y) ||
      anchor.position.x < 0 ||
      anchor.position.x > 1 ||
      anchor.position.y < 0 ||
      anchor.position.y > 1
    ) {
      throw new Error(`Anchor ${String(anchor.id)} 的 position 必须位于 0..1`)
    }

    if (
      !isFiniteNumber(anchor.outward.x) ||
      !isFiniteNumber(anchor.outward.y)
    ) {
      throw new Error(`Anchor ${String(anchor.id)} 的 outward 无效`)
    }

    if (
      anchor.snapRadius !== undefined &&
      (!isFiniteNumber(anchor.snapRadius) || anchor.snapRadius <= 0)
    ) {
      throw new Error(`Anchor ${String(anchor.id)} 的 snapRadius 必须大于 0`)
    }

    if (
      anchor.role !== undefined &&
      (typeof anchor.role !== 'string' ||
        !ANCHOR_ROLES.has(anchor.role as VisualAnchorRole))
    ) {
      throw new Error(`Anchor ${String(anchor.id)} 的 role 无效`)
    }

    if (
      anchor.kinds !== undefined &&
      (!Array.isArray(anchor.kinds) ||
        anchor.kinds.some((kind) => typeof kind !== 'string' || !kind.trim()))
    ) {
      throw new Error(`Anchor ${String(anchor.id)} 的 kinds 无效`)
    }
  })
}

export function assertComponentDefinition(
  value: unknown,
): asserts value is ComponentDefinition {
  if (!isRecord(value)) {
    throw new Error('ComponentDefinition 必须是对象')
  }

  assertText(value.type, '组件类型')
  assertText(value.title, '组件名称')
  assertText(value.category, '组件分类')

  if (typeof value.description !== 'string') {
    throw new Error('组件说明必须是字符串')
  }

  if (!isRecord(value.size)) {
    throw new Error(`组件 ${value.type} 缺少 size 定义`)
  }

  const size = value.size
  const sizeFields = [
    ['defaultWidth', size.defaultWidth],
    ['defaultHeight', size.defaultHeight],
    ['minWidth', size.minWidth],
    ['minHeight', size.minHeight],
  ] as const

  for (const [field, candidate] of sizeFields) {
    if (!isFiniteNumber(candidate) || candidate <= 0) {
      throw new Error(`组件 ${value.type} 的 ${field} 必须大于 0`)
    }
  }

  if (
    (size.minWidth as number) > (size.defaultWidth as number) ||
    (size.minHeight as number) > (size.defaultHeight as number)
  ) {
    throw new Error(`组件 ${value.type} 的最小尺寸不能大于默认尺寸`)
  }

  if (!isRecord(value.attributes)) {
    throw new Error(`组件 ${value.type} 的 attributes 必须是对象`)
  }

  for (const [key, attribute] of Object.entries(value.attributes)) {
    assertAttribute(value.type as string, key, attribute)
  }

  if (!isRecord(value.properties)) {
    throw new Error(`组件 ${value.type} 的 properties 必须是对象`)
  }

  for (const [key, property] of Object.entries(value.properties)) {
    assertProperty(value.type as string, key, property)
  }

  const overlappingKeys = Object.keys(value.attributes).filter((key) =>
    Object.hasOwn(value.properties, key),
  )
  if (overlappingKeys.length > 0) {
    throw new Error(
      `组件 ${value.type} 的 Attribute / Property 名称不能重叠: ${overlappingKeys.join(', ')}`,
    )
  }

  assertInteractionMap(value.type as string, 'Action', value.actions)
  assertInteractionMap(value.type as string, 'Event', value.events)
  assertAnchors(value.type as string, value.anchors)
}
