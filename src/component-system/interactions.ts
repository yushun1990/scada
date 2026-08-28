import {
  isComponentContractValue,
  type ComponentActionArguments,
  type ComponentActionDefinition,
  type ComponentEventDefinition,
  type ComponentEventPayload,
} from './definition'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getRequiredComponentActionArgumentCount(
  definition: ComponentActionDefinition,
) {
  return (definition.parameters ?? []).filter((parameter) => !parameter.optional)
    .length
}

/**
 * Validate and freeze one Action invocation against the public component
 * contract. Ordered runtime arguments intentionally match ordered DSL Action
 * arguments, so no hidden positional-to-object mapping exists in Preview.
 */
export function normalizeComponentActionArguments(
  definition: ComponentActionDefinition,
  argumentsValue: unknown,
  label = 'Component Action',
): ComponentActionArguments {
  if (!Array.isArray(argumentsValue)) {
    throw new Error(`${label} arguments 必须是数组`)
  }

  const parameters = definition.parameters ?? []
  const requiredCount = getRequiredComponentActionArgumentCount(definition)
  if (
    argumentsValue.length < requiredCount ||
    argumentsValue.length > parameters.length
  ) {
    throw new Error(
      `${label} 参数数量无效：需要 ${requiredCount}..${parameters.length} 个，实际 ${argumentsValue.length} 个`,
    )
  }

  const normalized = argumentsValue.map((value, index) => {
    const parameter = parameters[index]
    if (!parameter || !isComponentContractValue(parameter, value)) {
      throw new Error(
        `${label} 参数 ${parameter?.name ?? String(index + 1)} 与公开契约不兼容`,
      )
    }
    return value
  })

  return Object.freeze(normalized)
}

/**
 * Event payloads are shallow scalar records. Unknown fields are rejected and
 * required/optional semantics are part of the public Event contract.
 */
export function normalizeComponentEventPayload(
  definition: ComponentEventDefinition,
  payload: unknown,
  label = 'Component Event',
): ComponentEventPayload | undefined {
  const schema = definition.payload

  if (!schema) {
    if (payload !== undefined) {
      throw new Error(`${label} 未声明 payload，不能携带 payload`)
    }
    return undefined
  }

  if (payload === undefined) {
    const required = Object.entries(schema).filter(([, field]) => !field.optional)
    if (required.length > 0) {
      throw new Error(
        `${label} 缺少必填 payload 字段：${required.map(([key]) => key).join(', ')}`,
      )
    }
    return Object.freeze({})
  }

  if (!isRecord(payload)) {
    throw new Error(`${label} payload 必须是对象`)
  }

  for (const key of Object.keys(payload)) {
    if (!schema[key]) {
      throw new Error(`${label} payload 包含未声明字段 ${key}`)
    }
  }

  const normalized: Record<string, ComponentEventPayload[string]> = {}
  for (const [key, field] of Object.entries(schema)) {
    if (!Object.hasOwn(payload, key)) {
      if (!field.optional) {
        throw new Error(`${label} payload 缺少必填字段 ${key}`)
      }
      continue
    }

    const value = payload[key]
    if (!isComponentContractValue(field, value)) {
      throw new Error(`${label} payload 字段 ${key} 与公开契约不兼容`)
    }
    normalized[key] = value
  }

  return Object.freeze(normalized)
}
