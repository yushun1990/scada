import assert from 'node:assert/strict'
import {
  assertControlledScriptInvocation,
  assertControlledScriptSource,
  DEFAULT_CONTROLLED_SCRIPT_LIMITS,
  resolveControlledScriptLimits,
  type ControlledScriptEngine,
  type ControlledScriptInvocation,
} from '../src/runtime/controlled-script-engine'
import type {
  ControlledScriptHostBridge,
  ControlledScriptValue,
} from '../src/runtime/controlled-script-protocol'

assert.deepEqual(DEFAULT_CONTROLLED_SCRIPT_LIMITS, {
  timeoutMs: 50,
  memoryLimitBytes: 16 * 1024 * 1024,
  maxStackSizeBytes: 512 * 1024,
})
assert.equal(Object.isFrozen(DEFAULT_CONTROLLED_SCRIPT_LIMITS), true)
assert.deepEqual(resolveControlledScriptLimits({ timeoutMs: 100 }), {
  timeoutMs: 100,
  memoryLimitBytes: 16 * 1024 * 1024,
  maxStackSizeBytes: 512 * 1024,
})
assert.throws(() => resolveControlledScriptLimits({ timeoutMs: 0 }), /正安全整数/)
assert.throws(() => resolveControlledScriptLimits({ memoryLimitBytes: 512 * 1024 }), /不能小于 1 MiB/)
assert.throws(
  () => resolveControlledScriptLimits({ memoryLimitBytes: 2 * 1024 * 1024, maxStackSizeBytes: 3 * 1024 * 1024 }),
  /不能大于 memoryLimitBytes/,
)

assert.doesNotThrow(() => assertControlledScriptSource('function onInit() {}'))
assert.throws(() => assertControlledScriptSource('   '), /不能为空/)

const invocations: ControlledScriptInvocation[] = [
  { kind: 'init' },
  { kind: 'propertyChanged', key: 'speed', value: 20, previousValue: 10 },
  { kind: 'action', actionName: 'reset', input: { hard: true } },
]
for (const invocation of invocations) {
  assert.doesNotThrow(() => assertControlledScriptInvocation(invocation))
}
assert.throws(
  () => assertControlledScriptInvocation({ kind: 'propertyChanged', key: ' ', value: 1, previousValue: 0 }),
  /key 不能为空/,
)
assert.throws(
  () => assertControlledScriptInvocation({ kind: 'action', actionName: ' ' }),
  /actionName 不能为空/,
)

const bridgeCalls: unknown[] = []
const bridge: ControlledScriptHostBridge = Object.freeze({
  async dispatch(call) {
    bridgeCalls.push(call)
    return null
  },
})
const lifecycle: string[] = []
let disposed = false

const fakeEngine: ControlledScriptEngine = Object.freeze({
  async load(source, suppliedBridge, limits) {
    assertControlledScriptSource(source)
    const resolvedLimits = resolveControlledScriptLimits(limits)
    assert.equal(resolvedLimits.timeoutMs, 75)
    assert.equal(suppliedBridge, bridge)

    return Object.freeze({
      async invoke(invocation): Promise<ControlledScriptValue> {
        if (disposed) throw new Error('fake script disposed')
        assertControlledScriptInvocation(invocation)
        lifecycle.push(invocation.kind)
        if (invocation.kind === 'init') {
          await suppliedBridge.dispatch({
            kind: 'diagnostic.log',
            level: 'info',
            message: 'init',
          })
          return null
        }
        if (invocation.kind === 'propertyChanged') {
          return invocation.value
        }
        return invocation.input ?? null
      },
      async dispose() {
        if (disposed) return
        lifecycle.push('dispose')
        disposed = true
      },
    })
  },
})

const instance = await fakeEngine.load('function onInit() {}', bridge, { timeoutMs: 75 })
assert.equal(await instance.invoke({ kind: 'init' }), null)
assert.equal(
  await instance.invoke({
    kind: 'propertyChanged',
    key: 'speed',
    value: 30,
    previousValue: 20,
  }),
  30,
)
assert.equal(
  JSON.stringify(await instance.invoke({ kind: 'action', actionName: 'reset', input: { hard: true } })),
  JSON.stringify({ hard: true }),
)
await instance.dispose()
await instance.dispose()
assert.deepEqual(lifecycle, ['init', 'propertyChanged', 'action', 'dispose'])
assert.equal(bridgeCalls.length, 1)
await assert.rejects(instance.invoke({ kind: 'init' }), /disposed/)

console.log('Controlled Script engine contract checks passed: engine adapters share a bounded load/invoke/dispose lifecycle, execution limits are validated independently of any JS engine, and init/property/action are the only first-slice host invocations.')
