import type {
  SvgLayerMethodDefinition,
  SvgLayerMethodParameter,
} from '../component-system/visual'

/**
 * Controlled execution for authored SVG layer methods.
 *
 * Authored implementation source runs inside a lazily-loaded QuickJS-WASM
 * sandbox with memory/stack/timeout limits. The sandbox has no DOM, network
 * or timer access; it can only issue structured host operations through the
 * `__op` bridge below, which is validated fail-closed on the host side.
 */

export type LayerMethodHostOp =
  | { kind: 'setTheme'; state: string }
  | { kind: 'setLayerVisible'; layerId: string; visible: boolean }
  | { kind: 'emit'; eventName: string; payload: unknown }
  | { kind: 'log'; level: string; message: string }

export type LayerMethodSnapshotLayer = {
  id: string
  name: string
  kind: string
  visible: boolean
}

export type LayerMethodRunResult = {
  ok: boolean
  message: string
  elapsedMs: number
  ops: LayerMethodHostOp[]
}

export type LayerMethodExecutionLimits = {
  timeoutMs: number
  memoryLimitBytes: number
  maxStackSizeBytes: number
}

export const LAYER_METHOD_DEFAULT_LIMITS: LayerMethodExecutionLimits = Object.freeze({
  timeoutMs: 50,
  memoryLimitBytes: 16 * 1024 * 1024,
  maxStackSizeBytes: 512 * 1024,
})

const THEME_STATES = new Set([
  'default',
  'running',
  'alarm',
  'warning',
  'standby',
  'offline',
])
const MAX_EMIT_EVENT_NAME_LENGTH = 100
const MAX_LOG_MESSAGE_LENGTH = 2_000

type QuickJSModuleBundle = {
  module: import('quickjs-emscripten-core').QuickJSWASMModule
}

let modulePromise: Promise<QuickJSModuleBundle> | null = null

function loadQuickJSModule(): Promise<QuickJSModuleBundle> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const [{ newQuickJSWASMModuleFromVariant }, variantModule] = await Promise.all([
        import('quickjs-emscripten-core'),
        import('@jitl/quickjs-wasmfile-release-sync'),
      ])
      const module = await newQuickJSWASMModuleFromVariant(variantModule.default)
      return { module }
    })()
    modulePromise.catch(() => {
      // A failed wasm load must not poison later attempts.
      modulePromise = null
    })
  }
  return modulePromise
}

function marshalArguments(
  parameters: readonly SvgLayerMethodParameter[],
  args: Record<string, unknown>,
): { values: unknown[]; error: string | null } {
  const values: unknown[] = []
  for (const parameter of parameters) {
    const raw = args[parameter.name]
    if (raw === undefined || raw === null || raw === '') {
      if (parameter.defaultValue !== undefined) {
        values.push(parameter.defaultValue)
        continue
      }
      if (parameter.kind === 'number') {
        values.push(0)
        continue
      }
      if (parameter.kind === 'boolean') {
        values.push(false)
        continue
      }
      values.push('')
      continue
    }
    if (parameter.kind === 'number') {
      const parsed = Number(raw)
      if (!Number.isFinite(parsed)) {
        return { values: [], error: `参数 ${parameter.name} 需要是有限数字` }
      }
      values.push(parsed)
    } else if (parameter.kind === 'boolean') {
      values.push(raw === true || raw === 'true')
    } else {
      values.push(String(raw))
    }
  }
  return { values, error: null }
}


function describeVmError(
  ctx: import('quickjs-emscripten-core').QuickJSContext,
  handle: import('quickjs-emscripten-core').QuickJSHandle,
): string {
  const dumped = ctx.dump(handle)
  if (dumped && typeof dumped === 'object' && 'message' in dumped) {
    const err = dumped as { message?: unknown; name?: unknown }
    return `${String(err.name ?? 'Error')}: ${String(err.message ?? '')}`
  }
  return String(dumped)
}

function buildPrelude(snapshot: readonly LayerMethodSnapshotLayer[]): string {
  const layerProxies = snapshot
    .map((layer) => {
      const json = JSON.stringify({
        id: layer.id,
        name: layer.name,
        kind: layer.kind,
        _visible: layer.visible !== false,
      })
      return `(() => { const p = ${json}; Object.defineProperty(p, 'show', {
        get() { return p._visible; },
        set(v) { p._visible = Boolean(v); __op('setLayerVisible', p.id, p._visible); },
      }); p.setVisible = (v) => { p.show = v; }; return p; })()`
    })
    .join(',')

  return `
    "use strict";
    const __layerProxies = [${layerProxies}];
    const $self = {
      id: ${JSON.stringify(snapshot.length > 0 ? snapshot[0].id : '')},
      name: ${JSON.stringify(snapshot.length > 0 ? snapshot[0].name : '')},
      kind: 'svg',
      get layers() { return __layerProxies; },
      setTheme(state) { return __op('setTheme', String(state)); },
      applyTheme(state) { return __op('setTheme', String(state)); },
      showOnly(target) {
        for (const layer of __layerProxies) {
          layer.show = (layer.name === target || layer.id === target);
        }
      },
      showLayer(target) {
        const found = __layerProxies.find((l) => l.name === target || l.id === target);
        if (found) found.show = true;
      },
      hideLayer(target) {
        const found = __layerProxies.find((l) => l.name === target || l.id === target);
        if (found) found.show = false;
      },
      findLayer(target) {
        const found = __layerProxies.find((l) => l.name === target || l.id === target);
        return found ? { id: found.id, name: found.name, kind: found.kind, show: found.show } : null;
      },
    };
    globalThis.$self = $self;
    globalThis.$emit = (eventName, payload) => __op('emit', String(eventName), payload);
    globalThis.console = {
      log: (...a) => __op('log', 'log', a.map(String).join(' ')),
      info: (...a) => __op('log', 'info', a.map(String).join(' ')),
      warn: (...a) => __op('log', 'warn', a.map(String).join(' ')),
      error: (...a) => __op('log', 'error', a.map(String).join(' ')),
    };
  `
}

export async function runLayerMethod(options: {
  method: Pick<SvgLayerMethodDefinition, 'name' | 'implementation' | 'parameters'>
  args: Record<string, unknown>
  layers: readonly LayerMethodSnapshotLayer[]
  limits?: Partial<LayerMethodExecutionLimits>
}): Promise<LayerMethodRunResult> {
  const startTime = Date.now()
  const limits = { ...LAYER_METHOD_DEFAULT_LIMITS, ...options.limits }
  const ops: LayerMethodHostOp[] = []
  const layerIds = new Set(options.layers.map((layer) => layer.id))

  const { values: argValues, error: argError } = marshalArguments(
    options.method.parameters ?? [],
    options.args,
  )
  if (argError) {
    return { ok: false, message: argError, elapsedMs: 0, ops }
  }

  let ctx: import('quickjs-emscripten-core').QuickJSContext | null = null
  try {
    const { module } = await loadQuickJSModule()
    ctx = module.newContext()
    ctx.runtime.setMemoryLimit(limits.memoryLimitBytes)
    ctx.runtime.setMaxStackSize(limits.maxStackSizeBytes)
    // Start the execution clock only once the sandbox is ready: first-load
    // wasm compilation must not consume the run budget.
    const deadline = Date.now() + limits.timeoutMs
    ctx.runtime.setInterruptHandler(() => Date.now() > deadline)

    const hostOp = ctx.newFunction('__op', (opHandle, aHandle, bHandle) => {
      const op = ctx!.dump(opHandle) as string
      const a = ctx!.dump(aHandle)
      const b = bHandle ? ctx!.dump(bHandle) : undefined
      switch (op) {
        case 'setTheme': {
          const state = String(a)
          if (!THEME_STATES.has(state)) {
            throw new Error(`不支持的主题状态：${state}`)
          }
          ops.push({ kind: 'setTheme', state })
          return ctx!.undefined
        }
        case 'setLayerVisible': {
          const layerId = String(a)
          if (!layerIds.has(layerId)) {
            throw new Error(`未找到图层：${layerId}`)
          }
          ops.push({ kind: 'setLayerVisible', layerId, visible: Boolean(b) })
          return ctx!.undefined
        }
        case 'emit': {
          const eventName = String(a)
          if (!eventName || eventName.length > MAX_EMIT_EVENT_NAME_LENGTH) {
            throw new Error('事件名称无效')
          }
          ops.push({ kind: 'emit', eventName, payload: b })
          return ctx!.undefined
        }
        case 'log': {
          const level = String(a)
          const message = String(b ?? '').slice(0, MAX_LOG_MESSAGE_LENGTH)
          ops.push({ kind: 'log', level, message })
          return ctx!.undefined
        }
        default:
          throw new Error(`不支持的宿主操作：${op}`)
      }
    })
    ctx.setProp(ctx.global, '__op', hostOp)
    hostOp.dispose()

    const preludeResult = ctx.evalCode(buildPrelude(options.layers))
    if (preludeResult.error) {
      const message = describeVmError(ctx, preludeResult.error)
      preludeResult.dispose()
      return {
        ok: false,
        message: `沙箱初始化失败：${message}`,
        elapsedMs: Date.now() - startTime,
        ops,
      }
    }
    preludeResult.dispose()

    const codeResult = ctx.evalCode(options.method.implementation)
    if (codeResult.error) {
      const message = describeVmError(ctx, codeResult.error)
      codeResult.dispose()
      return {
        ok: false,
        message: `函数源码执行失败：${message}`,
        elapsedMs: Date.now() - startTime,
        ops,
      }
    }
    codeResult.dispose()

    const fnExists = ctx.evalCode(`typeof ${options.method.name} === 'function'`)
    const fnExistsValue = fnExists.error ? false : Boolean(ctx.dump(fnExists.value))
    fnExists.dispose()
    if (!fnExistsValue) {
      return {
        ok: false,
        message: `未在代码中找到方法定义 function ${options.method.name}(...)`,
        elapsedMs: Date.now() - startTime,
        ops,
      }
    }

    const invokeResult = ctx.evalCode(
      `${options.method.name}(...${JSON.stringify(argValues)})`,
    )
    if (invokeResult.error) {
      const message = describeVmError(ctx, invokeResult.error)
      invokeResult.dispose()
      return {
        ok: false,
        message: `运行出错：${message}`,
        elapsedMs: Date.now() - startTime,
        ops,
      }
    }
    const returned = ctx.dump(invokeResult.value)
    invokeResult.dispose()

    const elapsedMs = Date.now() - startTime
    const message =
      returned === undefined || returned === null
        ? '执行完成'
        : typeof returned === 'string'
          ? returned
          : `执行完成，返回 ${JSON.stringify(returned)?.slice(0, 300)}`
    return { ok: true, message, elapsedMs, ops }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - startTime,
      ops,
    }
  } finally {
    try {
      ctx?.dispose()
    } catch {
      // Context disposal is best-effort; limits already bound damage.
    }
  }
}

export function applyLayerMethodOps(
  ops: readonly LayerMethodHostOp[],
): {
  emitEvents: Array<{ eventName: string; payload: unknown }>
  logs: Array<{ level: string; message: string }>
} {
  const emitEvents: Array<{ eventName: string; payload: unknown }> = []
  const logs: Array<{ level: string; message: string }> = []
  for (const op of ops) {
    if (op.kind === 'emit') emitEvents.push({ eventName: op.eventName, payload: op.payload })
    else if (op.kind === 'log') logs.push({ level: op.level, message: op.message })
  }
  return { emitEvents, logs }
}
