import { VISUAL_RUNTIME_TARGET_DESCRIPTORS, type VisualRuntimeTarget } from '../component-system/visualRuntime'
import type { ControlledRuntimeDiagnosticLevel } from '../component-system/controlledRuntime'
import {
  normalizeControlledScriptValue,
  type ControlledScriptHostCall,
  type ControlledScriptValue,
} from './controlled-script-protocol'

const MAX_HOST_CALL_JSON_CHARS = 256 * 1024
const DIAGNOSTIC_LEVELS = new Set<ControlledRuntimeDiagnosticLevel>([
  'debug',
  'info',
  'warn',
  'error',
])

function asRecord(value: ControlledScriptValue): Record<string, ControlledScriptValue> {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Controlled Script host call 必须是 object')
  }
  return value as Record<string, ControlledScriptValue>
}

function requireString(
  record: Record<string, ControlledScriptValue>,
  key: string,
) {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Controlled Script host call ${key} 必须是非空 string`)
  }
  return value
}

function requireVisualTarget(record: Record<string, ControlledScriptValue>) {
  const target = requireString(record, 'target')
  if (!(target in VISUAL_RUNTIME_TARGET_DESCRIPTORS)) {
    throw new Error(`Controlled Script host call visual target 无效：${target}`)
  }
  return target as VisualRuntimeTarget
}

function optionalValue(
  record: Record<string, ControlledScriptValue>,
  key: string,
): ControlledScriptValue | undefined {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined
}

function requireValue(
  record: Record<string, ControlledScriptValue>,
  key: string,
): ControlledScriptValue {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    throw new Error(`Controlled Script host call 缺少 ${key}`)
  }
  return record[key] as ControlledScriptValue
}

export function decodeControlledScriptHostCall(json: string): ControlledScriptHostCall {
  if (json.length > MAX_HOST_CALL_JSON_CHARS) {
    throw new Error('Controlled Script host call JSON 超过大小上限')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Controlled Script host call JSON 无效')
  }

  const record = asRecord(
    normalizeControlledScriptValue(parsed, 'Controlled Script host call'),
  )
  const kind = requireString(record, 'kind')

  if (kind === 'property.get') {
    return { kind, key: requireString(record, 'key') }
  }
  if (kind === 'property.set') {
    return {
      kind,
      key: requireString(record, 'key'),
      value: requireValue(record, 'value'),
    }
  }
  if (kind === 'property.clear') {
    return { kind, key: requireString(record, 'key') }
  }
  if (kind === 'event.emit') {
    return {
      kind,
      eventName: requireString(record, 'eventName'),
      payload: optionalValue(record, 'payload'),
    }
  }
  if (kind === 'action.invoke') {
    return {
      kind,
      actionName: requireString(record, 'actionName'),
      input: optionalValue(record, 'input'),
    }
  }
  if (kind === 'visual.set') {
    return {
      kind,
      layerId: requireString(record, 'layerId'),
      target: requireVisualTarget(record),
      value: requireValue(record, 'value'),
    }
  }
  if (kind === 'visual.clear') {
    return {
      kind,
      layerId: requireString(record, 'layerId'),
      target: requireVisualTarget(record),
    }
  }
  if (kind === 'visual.contribute') {
    return {
      kind,
      controlId: requireString(record, 'controlId'),
      layerId: requireString(record, 'layerId'),
      target: requireVisualTarget(record),
      contribution: requireValue(record, 'contribution'),
    }
  }
  if (kind === 'visual.clearContribution') {
    return {
      kind,
      controlId: requireString(record, 'controlId'),
    }
  }
  if (kind === 'diagnostic.log') {
    const level = requireString(record, 'level')
    if (!DIAGNOSTIC_LEVELS.has(level as ControlledRuntimeDiagnosticLevel)) {
      throw new Error(`Controlled Script diagnostic level 无效：${level}`)
    }
    return {
      kind,
      level: level as ControlledRuntimeDiagnosticLevel,
      message: requireString(record, 'message'),
      details: optionalValue(record, 'details'),
    }
  }

  throw new Error(`Controlled Script host call kind 无效：${kind}`)
}
