import assert from 'node:assert/strict'
import {
  createControlledScriptHostBridge,
  normalizeControlledScriptValue,
} from '../src/runtime/controlled-script-protocol'
import { ControlledRuntimeSession } from '../src/runtime/controlled-runtime-session'

const definition = {
  type: 'test.script-protocol',
  title: 'Script Protocol Test',
  category: 'test',
  description: '',
  size: {
    defaultWidth: 100,
    defaultHeight: 100,
    minWidth: 10,
    minHeight: 10,
  },
  properties: {
    running: {
      title: 'Running',
      kind: 'boolean',
      defaultValue: false,
    },
    speed: {
      title: 'Speed',
      kind: 'number',
      defaultValue: 10,
    },
  },
  actions: {
    inspect: { title: 'Inspect' },
  },
  events: {
    changed: { title: 'Changed' },
  },
  anchors: [],
} as const

const visual = {
  version: 3,
  mode: 'composite',
  designSize: { width: 100, height: 100 },
  layers: [
    {
      id: 'body',
      name: 'Body',
      kind: 'vector',
      parentId: null,
      transform: {
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      primitive: 'rect',
    },
  ],
  rules: [],
  animations: [],
} as const

const emitted: Array<[string, unknown]> = []
const diagnostics: Array<{ level: string; message: string; details?: unknown }> = []
const session = new ControlledRuntimeSession(
  definition,
  visual,
  () => ({ running: false, speed: 10 }),
  {
    emitEvent(name, payload) {
      emitted.push([name, payload])
    },
    async invokeAction(name, input) {
      return { name, input, ok: true }
    },
    reportDiagnostic(entry) {
      diagnostics.push(entry)
    },
  },
)
const bridge = createControlledScriptHostBridge(session.runtime)

assert.equal(await bridge.dispatch({ kind: 'property.get', key: 'speed' }), 10)
assert.equal(
  await bridge.dispatch({ kind: 'property.set', key: 'speed', value: 42 }),
  null,
)
assert.equal(session.getEffectiveProperties().speed, 42)
await bridge.dispatch({ kind: 'property.clear', key: 'speed' })
assert.equal(session.getEffectiveProperties().speed, 10)
assert.throws(
  () => bridge.dispatch({ kind: 'property.set', key: 'speed', value: { nested: true } }),
  /Property value 必须是 scalar/,
)

const eventPayload = normalizeControlledScriptValue({
  source: 'sandbox',
  values: [1, true, null],
})
await bridge.dispatch({
  kind: 'event.emit',
  eventName: 'changed',
  payload: eventPayload,
})
assert.equal(emitted.length, 1)
assert.equal(JSON.stringify(emitted[0]?.[1]), JSON.stringify(eventPayload))

const actionResult = await bridge.dispatch({
  kind: 'action.invoke',
  actionName: 'inspect',
  input: { speed: 10 },
})
assert.equal(
  JSON.stringify(actionResult),
  JSON.stringify({ name: 'inspect', input: { speed: 10 }, ok: true }),
)

await bridge.dispatch({
  kind: 'visual.set',
  layerId: 'body',
  target: 'opacity',
  value: 0.5,
})
assert.equal(session.getVisualAbsoluteState().body?.opacity, 0.5)
await bridge.dispatch({
  kind: 'visual.contribute',
  controlId: 'spin',
  layerId: 'body',
  target: 'transform.rotation',
  contribution: 45,
})
assert.equal(session.getVisualContributionOverlay().body?.['transform.rotation'], 45)
await bridge.dispatch({ kind: 'visual.clearContribution', controlId: 'spin' })
assert.deepEqual(session.getVisualContributionOverlay(), {})
await bridge.dispatch({
  kind: 'visual.clear',
  layerId: 'body',
  target: 'opacity',
})
assert.deepEqual(session.getVisualAbsoluteState(), {})
assert.throws(
  () => bridge.dispatch({
    kind: 'visual.set',
    layerId: 'body',
    target: 'opacity',
    value: [0.5],
  }),
  /Visual value 必须是 number 或 boolean/,
)

await bridge.dispatch({
  kind: 'diagnostic.log',
  level: 'info',
  message: 'sandbox diagnostic',
  details: { code: 7 },
})
assert.equal(diagnostics.length, 1)
assert.equal(JSON.stringify(diagnostics[0]?.details), JSON.stringify({ code: 7 }))

const normalized = normalizeControlledScriptValue({
  nested: { values: [1, 'two', false, null] },
})
assert.equal(
  JSON.stringify(normalized),
  JSON.stringify({ nested: { values: [1, 'two', false, null] } }),
)
assert.equal(Object.getPrototypeOf(normalized), null)

assert.throws(() => normalizeControlledScriptValue(Number.NaN), /有限值/)
assert.throws(() => normalizeControlledScriptValue(() => 1), /JSON-compatible/)
assert.throws(() => normalizeControlledScriptValue(new Date()), /plain object/)

const cyclic: Record<string, unknown> = {}
cyclic.self = cyclic
assert.throws(() => normalizeControlledScriptValue(cyclic), /循环引用/)

let tooDeep: unknown = 1
for (let index = 0; index < 40; index += 1) {
  tooDeep = [tooDeep]
}
assert.throws(() => normalizeControlledScriptValue(tooDeep), /深度上限/)

session.dispose()

console.log('Controlled Script protocol checks passed: sandbox-bound values are finite JSON-compatible data, synchronous Property/Visual/Event calls fail synchronously, async Action results are normalized, and cyclic/prototype-rich values are rejected.')
