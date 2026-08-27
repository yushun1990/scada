import assert from 'node:assert/strict'
import { decodeControlledScriptHostCall } from '../src/runtime/controlled-script-codec'

assert.deepEqual(
  decodeControlledScriptHostCall(JSON.stringify({ kind: 'property.get', key: 'speed' })),
  { kind: 'property.get', key: 'speed' },
)
assert.deepEqual(
  decodeControlledScriptHostCall(
    JSON.stringify({ kind: 'property.set', key: 'speed', value: 42 }),
  ),
  { kind: 'property.set', key: 'speed', value: 42 },
)
assert.deepEqual(
  decodeControlledScriptHostCall(
    JSON.stringify({
      kind: 'event.emit',
      eventName: 'changed',
      payload: { nested: [1, true, null] },
    }),
  ),
  {
    kind: 'event.emit',
    eventName: 'changed',
    payload: Object.assign(Object.create(null), { nested: [1, true, null] }),
  },
)
assert.deepEqual(
  decodeControlledScriptHostCall(
    JSON.stringify({
      kind: 'visual.contribute',
      controlId: 'spin',
      layerId: 'fan',
      target: 'transform.rotation',
      contribution: 45,
    }),
  ),
  {
    kind: 'visual.contribute',
    controlId: 'spin',
    layerId: 'fan',
    target: 'transform.rotation',
    contribution: 45,
  },
)
assert.deepEqual(
  decodeControlledScriptHostCall(
    JSON.stringify({
      kind: 'diagnostic.log',
      level: 'warn',
      message: 'careful',
      details: { code: 7 },
    }),
  ),
  {
    kind: 'diagnostic.log',
    level: 'warn',
    message: 'careful',
    details: Object.assign(Object.create(null), { code: 7 }),
  },
)

assert.throws(() => decodeControlledScriptHostCall('{'), /JSON 无效/)
assert.throws(() => decodeControlledScriptHostCall('[]'), /必须是 object/)
assert.throws(
  () => decodeControlledScriptHostCall(JSON.stringify({ kind: 'host.escape' })),
  /kind 无效/,
)
assert.throws(
  () => decodeControlledScriptHostCall(JSON.stringify({ kind: 'property.get', key: ' ' })),
  /key 必须是非空 string/,
)
assert.throws(
  () => decodeControlledScriptHostCall(JSON.stringify({ kind: 'property.set', key: 'speed' })),
  /缺少 value/,
)
assert.throws(
  () => decodeControlledScriptHostCall(
    JSON.stringify({
      kind: 'visual.set',
      layerId: 'fan',
      target: '__proto__',
      value: 1,
    }),
  ),
  /visual target 无效/,
)
assert.throws(
  () => decodeControlledScriptHostCall(
    JSON.stringify({
      kind: 'diagnostic.log',
      level: 'fatal',
      message: 'nope',
    }),
  ),
  /diagnostic level 无效/,
)
assert.throws(
  () => decodeControlledScriptHostCall(' '.repeat(256 * 1024 + 1)),
  /大小上限/,
)

console.log('Controlled Script codec checks passed: sandbox JSON calls are normalized and structurally validated before reaching the capability bridge; invalid kinds, targets, fields, levels and oversized messages are rejected.')
