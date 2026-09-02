import assert from 'node:assert/strict'
import type {
  ComponentDefinition,
  ComponentPropertyFallbackValues,
} from '../src/component-system/definition'
import type { ComponentRegistration } from '../src/component-system/registration'
import { ComponentRegistry } from '../src/component-system/registry'
import { assertComponentDefinition } from '../src/component-system/validation'
import type { ScadaDeviceActionInvocation } from '../src/runtime/device-action-dispatcher'
import { PreviewRuntime } from '../src/runtime/preview-runtime'
import { attachPreviewScadaSemantics } from '../src/runtime/preview-scada-semantics'
import { createScadaDslCapabilityCatalog } from '../src/scene/scada-dsl'
import { compileScadaDslSource } from '../src/scene/scada-dsl-compiler'
import type { SceneDocument } from '../src/scene/model'

const definition: ComponentDefinition = {
  type: 'test.typed-interactions',
  title: 'Typed interactions',
  category: 'test',
  description: '',
  size: {
    defaultWidth: 100,
    defaultHeight: 100,
    minWidth: 10,
    minHeight: 10,
  },
  attributes: {},
  properties: {
    level: {
      title: 'Level',
      kind: 'number',
      defaultValue: 0,
      bindable: true,
    },
  },
  actions: {
    record: {
      title: 'Record',
      parameters: [
        { name: 'level', title: 'Level', kind: 'number' },
        {
          name: 'mode',
          title: 'Mode',
          kind: 'select',
          optional: true,
          options: [
            { label: 'Auto', value: 'auto' },
            { label: 'Manual', value: 'manual' },
          ],
        },
      ],
    },
  },
  events: {
    commandRequested: {
      title: 'Command requested',
      payload: {
        level: { title: 'Level', kind: 'number' },
        mode: {
          title: 'Mode',
          kind: 'select',
          optional: true,
          options: [
            { label: 'Fast', value: 'fast' },
            { label: 'Safe', value: 'safe' },
          ],
        },
      },
    },
    tick: {
      title: 'Tick',
    },
  },
  anchors: [],
}

assert.doesNotThrow(() => assertComponentDefinition(definition))

const duplicateParameterDefinition = structuredClone(definition) as unknown as Record<string, unknown>
;(duplicateParameterDefinition.actions as Record<string, any>).record.parameters = [
  { name: 'value', title: 'Value', kind: 'number' },
  { name: 'value', title: 'Value again', kind: 'number' },
]
assert.throws(
  () => assertComponentDefinition(duplicateParameterDefinition),
  /重复参数名 value/,
)

const invalidOptionalOrder = structuredClone(definition) as unknown as Record<string, unknown>
;(invalidOptionalOrder.actions as Record<string, any>).record.parameters = [
  { name: 'optional', title: 'Optional', kind: 'number', optional: true },
  { name: 'required', title: 'Required', kind: 'number' },
]
assert.throws(
  () => assertComponentDefinition(invalidOptionalOrder),
  /必填参数不能位于可选参数之后/,
)

const invalidEventSchema = structuredClone(definition) as unknown as Record<string, unknown>
;(invalidEventSchema.events as Record<string, any>).commandRequested.payload.mode = {
  title: 'Mode',
  kind: 'select',
}
assert.throws(
  () => assertComponentDefinition(invalidEventSchema),
  /至少需要一个选项/,
)

const actionCalls: Array<{
  properties: Readonly<ComponentPropertyFallbackValues>
  argumentsValue: readonly unknown[]
}> = []

const registration: ComponentRegistration = {
  definition,
  renderer: (() => null) as unknown as ComponentRegistration['renderer'],
  createDefaultProps: () => ({ level: 0 }),
  actions: {
    record: ({ properties }, argumentsValue) => {
      actionCalls.push({ properties, argumentsValue })
    },
  },
}

const registry = new ComponentRegistry([registration])
const runtime = new PreviewRuntime([], registry)
const scene: SceneDocument = {
  version: 6,
  id: 'scene-typed-interactions',
  name: 'Typed interactions',
  width: 1280,
  height: 720,
  background: '#fff',
  nodes: [
    {
      id: 'component-1',
      type: definition.type,
      name: 'Component 1',
      parentId: null,
      visible: true,
      locked: false,
      transform: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
      },
      props: { level: 0 },
      bindings: [],
      behaviors: [],
    },
  ],
  connections: [],
}
const releaseRuntime = runtime.acquire(scene)

runtime.invokeAction('component-1', 'record', [7, 'auto'])
assert.deepEqual(actionCalls.at(-1)?.argumentsValue, [7, 'auto'])
assert.equal(Object.isFrozen(actionCalls.at(-1)?.argumentsValue), true)
assert.strictEqual(
  actionCalls.at(-1)?.properties,
  runtime.componentProps.getNodeSnapshot('component-1'),
)
assert.doesNotThrow(() => runtime.invokeAction('component-1', 'record', [7]))
assert.throws(
  () => runtime.invokeAction('component-1', 'record', []),
  /参数数量无效/,
)
assert.throws(
  () => runtime.invokeAction('component-1', 'record', ['bad']),
  /参数 level 与公开契约不兼容/,
)
assert.throws(
  () => runtime.invokeAction('component-1', 'record', [7, 'invalid']),
  /参数 mode 与公开契约不兼容/,
)

let observedPayload: Readonly<Record<string, unknown>> | undefined
const unsubscribeEvents = runtime.subscribeEvents((event) => {
  if (event.eventName === 'commandRequested') observedPayload = event.payload
})
runtime.emitEvent('component-1', 'commandRequested', {
  level: 7,
  mode: 'fast',
})
assert.deepEqual(observedPayload, { level: 7, mode: 'fast' })
assert.equal(Object.isFrozen(observedPayload), true)
assert.throws(
  () => runtime.emitEvent('component-1', 'commandRequested', {}),
  /缺少必填字段 level/,
)
assert.throws(
  () => runtime.emitEvent('component-1', 'commandRequested', { level: 'bad' } as never),
  /字段 level 与公开契约不兼容/,
)
assert.throws(
  () => runtime.emitEvent('component-1', 'commandRequested', { level: 7, extra: true } as never),
  /未声明字段 extra/,
)
assert.throws(
  () => runtime.emitEvent('component-1', 'tick', { value: 1 } as never),
  /未声明 payload/,
)
unsubscribeEvents()
releaseRuntime()

const catalog = createScadaDslCapabilityCatalog(definition, [
  {
    sourceId: 'authoring-device',
    title: 'Primary device',
    properties: {
      level: { title: 'Level', kind: 'number', defaultValue: 0 },
    },
    actions: {
      start: {
        title: 'Start',
        parameters: [
          { name: 'level', title: 'Level', kind: 'number' },
          {
            name: 'mode',
            title: 'Mode',
            kind: 'select',
            options: [
              { label: 'Fast', value: 'fast' },
              { label: 'Safe', value: 'safe' },
            ],
          },
        ],
      },
    },
  },
])

const validSource = `
$self.level = $device.level

if $self.level > 10 {
  $self.record($self.level, "auto")
}

on $self.commandRequested {
  $device.start($self.level, "fast")
}
`
const valid = compileScadaDslSource(validSource, catalog)
assert.deepEqual(valid.diagnostics, [])
assert.ok(valid.compiled)

const wrongComponentArgument = compileScadaDslSource(`
if $device.level > 10 {
  $self.record("bad")
}
`, catalog)
assert.equal(wrongComponentArgument.compiled, null)
assert.ok(
  wrongComponentArgument.diagnostics.some((diagnostic) =>
    diagnostic.message.includes('Action $self.record 参数 1'),
  ),
)

const missingDeviceArgument = compileScadaDslSource(`
on $self.commandRequested {
  $device.start($device.level)
}
`, catalog)
assert.equal(missingDeviceArgument.compiled, null)
assert.ok(
  missingDeviceArgument.diagnostics.some((diagnostic) =>
    diagnostic.message.includes('Action $device.start 参数数量无效'),
  ),
)

const preview = new PreviewRuntime([], registry)
const releasePreview = preview.acquire(scene)
preview.values.set('pump-01:level', 42)
const dispatched: ScadaDeviceActionInvocation[] = []
const attachment = attachPreviewScadaSemantics(
  preview,
  'component-1',
  valid.compiled!,
  {
    primaryDevice: { deviceId: 'pump-01' },
    deviceActionDispatcher: {
      dispatch(invocation) {
        dispatched.push(invocation)
      },
    },
  },
)

assert.deepEqual(actionCalls.at(-1)?.argumentsValue, [42, 'auto'])
assert.strictEqual(
  actionCalls.at(-1)?.properties,
  preview.componentProps.getNodeSnapshot('component-1'),
)
preview.emitEvent('component-1', 'commandRequested', {
  level: 42,
  mode: 'fast',
})
assert.deepEqual(dispatched, [
  {
    interactionId: 'interaction:2',
    sourceId: 'pump-01',
    action: 'start',
    arguments: [42, 'fast'],
  },
])
assert.equal(Object.isFrozen(dispatched[0]), true)
assert.equal(Object.isFrozen(dispatched[0]?.arguments), true)

attachment.dispose()
releasePreview()

console.log(
  'Typed Action/Event contract checks passed: component definitions validate ordered Action parameters and Event payload schemas, DSL v1 $self/$device compilation rejects Action arity/type mismatches, Preview validates runtime invocations/payloads, parameterized Component Actions execute against the settled Renderer snapshot, and Device/Platform Actions cross an explicit typed dispatcher boundary.',
)
