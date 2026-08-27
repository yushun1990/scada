import assert from 'node:assert/strict'
import {
  createControlledComponentRuntime,
  type ControlledRuntimeDiagnosticEntry,
  type ControlledRuntimeHost,
} from '../src/component-system/controlledRuntime'

const definition = {
  type: 'test.controlled-runtime',
  title: 'Controlled Runtime Test',
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
      defaultValue: 0,
    },
    mode: {
      title: 'Mode',
      kind: 'select',
      defaultValue: 'auto',
      options: [
        { label: 'Auto', value: 'auto' },
        { label: 'Manual', value: 'manual' },
      ],
    },
  },
  actions: {
    reset: { title: 'Reset' },
  },
  events: {
    started: { title: 'Started' },
  },
  anchors: [],
} as const

const visual = {
  version: 3,
  mode: 'composite',
  designSize: { width: 100, height: 100 },
  layers: [
    {
      id: 'fan',
      name: 'Fan',
      kind: 'vector',
      parentId: null,
      transform: {
        x: 10,
        y: 20,
        width: 40,
        height: 40,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      primitive: 'circle',
    },
  ],
  rules: [],
  animations: [],
} as const

const runtimeProperties = new Map<string, string | number | boolean | null>([
  ['running', false],
  ['speed', 25],
  ['mode', 'auto'],
])
const propertyWrites: Array<[string, string | number | boolean | null]> = []
const emittedEvents: Array<[string, unknown]> = []
const invokedActions: Array<[string, unknown]> = []
const absoluteVisualWrites: Array<[string, string, number | boolean]> = []
const visualContributions: Array<[string, string, number | boolean]> = []
const diagnostics: ControlledRuntimeDiagnosticEntry[] = []

const host: ControlledRuntimeHost = {
  readProperty(key) {
    return runtimeProperties.get(key) ?? null
  },
  writeProperty(key, value) {
    runtimeProperties.set(key, value)
    propertyWrites.push([key, value])
  },
  emitEvent(eventName, payload) {
    emittedEvents.push([eventName, payload])
  },
  invokeAction(actionName, input) {
    invokedActions.push([actionName, input])
    return `invoked:${actionName}`
  },
  setVisualValue(layerId, target, value) {
    absoluteVisualWrites.push([layerId, target, value])
  },
  contributeVisualValue(layerId, target, contribution) {
    visualContributions.push([layerId, target, contribution])
  },
  reportDiagnostic(entry) {
    diagnostics.push(entry)
  },
}

const runtime = createControlledComponentRuntime(definition, visual, host)

assert.equal(Object.isFrozen(runtime), true)
assert.equal(Object.isFrozen(runtime.properties), true)
assert.deepEqual(Object.keys(runtime).sort(), [
  'actions',
  'diagnostics',
  'events',
  'properties',
  'visual',
])

assert.equal(runtime.properties.get('speed'), 25)
runtime.properties.set('speed', 60)
assert.equal(runtime.properties.get('speed'), 60)
assert.deepEqual(propertyWrites, [['speed', 60]])
assert.throws(() => runtime.properties.get('missing'), /不存在的 Property/)
assert.throws(() => runtime.properties.set('running', 1), /类型不匹配/)
assert.throws(() => runtime.properties.set('mode', 'invalid'), /类型不匹配/)

runtime.events.emit('started', { source: 'script' })
assert.deepEqual(emittedEvents, [['started', { source: 'script' }]])
assert.throws(() => runtime.events.emit('missing'), /不存在的 Event/)

assert.equal(runtime.actions.invoke('reset', { hard: true }), 'invoked:reset')
assert.deepEqual(invokedActions, [['reset', { hard: true }]])
assert.throws(() => runtime.actions.invoke('missing'), /不存在的 Action/)

runtime.visual.set('fan', 'transform.rotation', 90)
runtime.visual.set('fan', 'transform.scaleX', -1)
runtime.visual.set('fan', 'opacity', 0.5)
runtime.visual.set('fan', 'visible', false)
assert.deepEqual(absoluteVisualWrites, [
  ['fan', 'transform.rotation', 90],
  ['fan', 'transform.scaleX', -1],
  ['fan', 'opacity', 0.5],
  ['fan', 'visible', false],
])

runtime.visual.contribute('fan', 'transform.rotation', 45)
runtime.visual.contribute('fan', 'transform.scaleX', 1.5)
runtime.visual.contribute('fan', 'opacity', 0.75)
runtime.visual.contribute('fan', 'visible', true)
assert.deepEqual(visualContributions, [
  ['fan', 'transform.rotation', 45],
  ['fan', 'transform.scaleX', 1.5],
  ['fan', 'opacity', 0.75],
  ['fan', 'visible', true],
])

assert.throws(() => runtime.visual.set('missing', 'opacity', 0.5), /不存在的 Layer/)
assert.throws(() => runtime.visual.set('fan', 'visible', 1), /boolean value/)
assert.throws(() => runtime.visual.set('fan', 'opacity', 1.2), /0\.\.1/)
assert.throws(() => runtime.visual.set('fan', 'transform.scaleY', 0), /不能为 0/)
assert.throws(() => runtime.visual.contribute('fan', 'visible', 1), /boolean contribution/)
assert.throws(() => runtime.visual.contribute('fan', 'transform.scaleX', -1), /必须大于 0/)
assert.throws(() => runtime.visual.contribute('fan', 'opacity', 1.1), /0\.\.1/)

runtime.diagnostics.log('info', 'component started', { speed: 60 })
assert.deepEqual(diagnostics, [
  { level: 'info', message: 'component started', details: { speed: 60 } },
])
assert.throws(() => runtime.diagnostics.log('debug', '   '), /不能为空/)

console.log('Controlled Runtime contract checks passed: capability-only property/event/action/visual/diagnostic APIs validate declared targets and keep absolute visual writes distinct from transient contributions.')
