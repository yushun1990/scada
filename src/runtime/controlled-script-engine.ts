import type {
  ControlledScriptHostBridge,
  ControlledScriptValue,
} from './controlled-script-protocol'

export type ControlledScriptInvocation =
  | { kind: 'init' }
  | {
      kind: 'propertyChanged'
      key: string
      value: ControlledScriptValue
      previousValue: ControlledScriptValue
    }
  | {
      kind: 'action'
      actionName: string
      input?: ControlledScriptValue
    }

export type ControlledScriptExecutionLimits = Readonly<{
  timeoutMs: number
  memoryLimitBytes: number
  maxStackSizeBytes: number
}>

export const DEFAULT_CONTROLLED_SCRIPT_LIMITS: ControlledScriptExecutionLimits = Object.freeze({
  timeoutMs: 50,
  memoryLimitBytes: 16 * 1024 * 1024,
  maxStackSizeBytes: 512 * 1024,
})

export type ControlledScriptInstance = Readonly<{
  invoke: (invocation: ControlledScriptInvocation) => Promise<ControlledScriptValue>
  dispose: () => Promise<void>
}>

export type ControlledScriptEngine = Readonly<{
  load: (
    source: string,
    bridge: ControlledScriptHostBridge,
    limits?: Partial<ControlledScriptExecutionLimits>,
  ) => Promise<ControlledScriptInstance>
}>

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} 必须是正安全整数`)
  }
}

export function resolveControlledScriptLimits(
  limits: Partial<ControlledScriptExecutionLimits> = {},
): ControlledScriptExecutionLimits {
  const resolved = {
    ...DEFAULT_CONTROLLED_SCRIPT_LIMITS,
    ...limits,
  }

  assertPositiveInteger(resolved.timeoutMs, 'Controlled Script timeoutMs')
  assertPositiveInteger(resolved.memoryLimitBytes, 'Controlled Script memoryLimitBytes')
  assertPositiveInteger(resolved.maxStackSizeBytes, 'Controlled Script maxStackSizeBytes')

  if (resolved.memoryLimitBytes < 1024 * 1024) {
    throw new Error('Controlled Script memoryLimitBytes 不能小于 1 MiB')
  }

  if (resolved.maxStackSizeBytes > resolved.memoryLimitBytes) {
    throw new Error('Controlled Script maxStackSizeBytes 不能大于 memoryLimitBytes')
  }

  return Object.freeze(resolved)
}

export function assertControlledScriptSource(source: string) {
  if (!source.trim()) {
    throw new Error('Controlled Script source 不能为空')
  }
}

export function assertControlledScriptInvocation(
  invocation: ControlledScriptInvocation,
) {
  if (invocation.kind === 'init') return

  if (invocation.kind === 'propertyChanged') {
    if (!invocation.key.trim()) {
      throw new Error('Controlled Script propertyChanged key 不能为空')
    }
    return
  }

  if (!invocation.actionName.trim()) {
    throw new Error('Controlled Script actionName 不能为空')
  }
}
