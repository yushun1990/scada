import type {
  ControlledComponentRuntime,
  ControlledRuntimeDiagnosticLevel,
} from '../component-system/controlledRuntime'
import type { VisualRuntimeTarget } from '../component-system/visualRuntime'

export type ControlledScriptPrimitive = null | boolean | number | string
export type ControlledScriptValue =
  | ControlledScriptPrimitive
  | readonly ControlledScriptValue[]
  | { readonly [key: string]: ControlledScriptValue }

export type ControlledScriptHostCall =
  | { kind: 'property.get'; key: string }
  | { kind: 'property.set'; key: string; value: ControlledScriptValue }
  | { kind: 'property.clear'; key: string }
  | { kind: 'event.emit'; eventName: string; payload?: ControlledScriptValue }
  | { kind: 'action.invoke'; actionName: string; input?: ControlledScriptValue }
  | {
      kind: 'visual.set'
      layerId: string
      target: VisualRuntimeTarget
      value: ControlledScriptValue
    }
  | { kind: 'visual.clear'; layerId: string; target: VisualRuntimeTarget }
  | {
      kind: 'visual.contribute'
      controlId: string
      layerId: string
      target: VisualRuntimeTarget
      contribution: ControlledScriptValue
    }
  | { kind: 'visual.clearContribution'; controlId: string }
  | {
      kind: 'diagnostic.log'
      level: ControlledRuntimeDiagnosticLevel
      message: string
      details?: ControlledScriptValue
    }

export type ControlledScriptHostBridge = Readonly<{
  dispatch: (call: ControlledScriptHostCall) => Promise<ControlledScriptValue>
}>

const MAX_SCRIPT_VALUE_DEPTH = 32
const MAX_SCRIPT_VALUE_NODES = 10_000

type NormalizeState = {
  readonly seen: WeakSet<object>
  nodes: number
}

function normalizeValue(
  value: unknown,
  label: string,
  depth: number,
  state: NormalizeState,
): ControlledScriptValue {
  state.nodes += 1
  if (state.nodes > MAX_SCRIPT_VALUE_NODES) {
    throw new Error(`${label} 超过 Controlled Script value 节点上限`)
  }
  if (depth > MAX_SCRIPT_VALUE_DEPTH) {
    throw new Error(`${label} 超过 Controlled Script value 深度上限`)
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} number 必须是有限值`)
    }
    return value
  }

  if (typeof value !== 'object') {
    throw new Error(`${label} 只能包含 JSON-compatible value`)
  }

  if (state.seen.has(value)) {
    throw new Error(`${label} 不能包含循环引用`)
  }
  state.seen.add(value)

  try {
    if (Array.isArray(value)) {
      return value.map((item, index) =>
        normalizeValue(item, `${label}[${index}]`, depth + 1, state),
      )
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${label} 只能包含 plain object`)
    }

    const normalized: Record<string, ControlledScriptValue> = Object.create(null)
    for (const [key, item] of Object.entries(value)) {
      normalized[key] = normalizeValue(item, `${label}.${key}`, depth + 1, state)
    }
    return normalized
  } finally {
    state.seen.delete(value)
  }
}

export function normalizeControlledScriptValue(
  value: unknown,
  label = 'Controlled Script value',
): ControlledScriptValue {
  return normalizeValue(value, label, 0, {
    seen: new WeakSet<object>(),
    nodes: 0,
  })
}

function scalarFromScriptValue(value: ControlledScriptValue) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  throw new Error('Controlled Script Property value 必须是 scalar')
}

function visualValueFromScriptValue(value: ControlledScriptValue) {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  throw new Error('Controlled Script Visual value 必须是 number 或 boolean')
}

export function createControlledScriptHostBridge(
  runtime: ControlledComponentRuntime,
): ControlledScriptHostBridge {
  return Object.freeze({
    async dispatch(call: ControlledScriptHostCall): Promise<ControlledScriptValue> {
      if (call.kind === 'property.get') {
        return normalizeControlledScriptValue(
          runtime.properties.get(call.key),
          `Property ${call.key}`,
        )
      }

      if (call.kind === 'property.set') {
        runtime.properties.set(call.key, scalarFromScriptValue(call.value))
        return null
      }

      if (call.kind === 'property.clear') {
        runtime.properties.clear(call.key)
        return null
      }

      if (call.kind === 'event.emit') {
        runtime.events.emit(call.eventName, call.payload)
        return null
      }

      if (call.kind === 'action.invoke') {
        const result = await runtime.actions.invoke(call.actionName, call.input)
        return result === undefined
          ? null
          : normalizeControlledScriptValue(result, `Action ${call.actionName} result`)
      }

      if (call.kind === 'visual.set') {
        runtime.visual.set(
          call.layerId,
          call.target,
          visualValueFromScriptValue(call.value),
        )
        return null
      }

      if (call.kind === 'visual.clear') {
        runtime.visual.clear(call.layerId, call.target)
        return null
      }

      if (call.kind === 'visual.contribute') {
        runtime.visual.contribute(
          call.controlId,
          call.layerId,
          call.target,
          visualValueFromScriptValue(call.contribution),
        )
        return null
      }

      if (call.kind === 'visual.clearContribution') {
        runtime.visual.clearContribution(call.controlId)
        return null
      }

      runtime.diagnostics.log(call.level, call.message, call.details)
      return null
    },
  })
}
