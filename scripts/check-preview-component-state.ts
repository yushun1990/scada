import assert from 'node:assert/strict'
import type {
  ComponentAttributeValues,
  ComponentPropertyFallbackValues,
} from '../src/component-system/definition'
import type { ComponentRegistration } from '../src/component-system/registration'
import { ComponentRegistry } from '../src/component-system/registry'
import { PreviewRuntime } from '../src/runtime/preview-runtime'
import type { SceneDocument } from '../src/scene/model'

let observedActionAttributes: Readonly<ComponentAttributeValues> | null = null
let observedActionProperties: Readonly<ComponentPropertyFallbackValues> | null = null
let legacyActionProperties: Readonly<ComponentPropertyFallbackValues> | null = null
let legacyActionCount = 0

const registration: ComponentRegistration = {
  definition: {
    type: 'test.preview-state',
    title: 'Preview state test',
    category: 'test',
    description: '',
    size: {
      defaultWidth: 100,
      defaultHeight: 100,
      minWidth: 10,
      minHeight: 10,
    },
    attributes: {
      accentColor: {
        title: 'Accent color',
        kind: 'color',
        defaultValue: '#00ff00',
      },
    },
    properties: {
      state: {
        title: 'State',
        kind: 'string',
        defaultValue: 'default',
        bindable: true,
      },
    },
    actions: {
      inspect: { title: 'Inspect' },
      emitPing: { title: 'Emit ping' },
      legacyAction: { title: 'Legacy action' },
    },
    events: {
      ping: { title: 'Ping' },
    },
    anchors: [],
  },
  renderer: (() => null) as unknown as ComponentRegistration['renderer'],
  createDefaultProps: () => ({ state: 'default' }),
  actions: {
    inspect: ({ attributes, properties }) => {
      observedActionAttributes = attributes
      observedActionProperties = properties
    },
    emitPing: ({ emit }) => {
      emit('ping')
    },
    legacyAction: ({ properties }) => {
      legacyActionCount += 1
      legacyActionProperties = properties
    },
  },
}

const registry = new ComponentRegistry([registration])
const runtime = new PreviewRuntime([], registry)

const scene: SceneDocument = {
  version: 8,
  id: 'scene-preview-state',
  name: 'Preview state ownership',
  width: 1280,
  height: 720,
  background: '#fff',
  nodes: [
    {
      id: 'component-1',
      type: registration.definition.type,
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
      attributes: {
        accentColor: '#7c3aed',
      },
      propertyFallbacks: {
        state: 'authored',
      },
      bindings: [
        {
          id: 'legacy-state-binding',
          property: 'state',
          source: {
            kind: 'runtime-value',
            key: 'legacy.state',
          },
        },
      ],
      behaviors: [
        {
          id: 'legacy-ping-action',
          trigger: {
            kind: 'event',
            event: 'ping',
          },
          effect: {
            kind: 'action',
            targetNodeId: 'component-1',
            action: 'legacyAction',
          },
        },
      ],
      scadaSemantics: null,
    },
  ],
  connections: [],
}

const releaseRuntime = runtime.acquire(scene)
const attributeSnapshot = runtime.componentAttributes.getNodeSnapshot('component-1')
assert.equal(attributeSnapshot.accentColor, '#7c3aed')
assert.equal(Object.isFrozen(attributeSnapshot), true)

assert.equal(
  runtime.componentProps.getNodeSnapshot('component-1').state,
  'authored',
)

runtime.values.set('legacy.state', 'legacy')
const legacySnapshot = runtime.componentProps.getNodeSnapshot('component-1')
assert.equal(legacySnapshot.state, 'legacy')
assert.equal(runtime.values.get('legacy.state'), 'legacy')
assert.strictEqual(
  runtime.componentAttributes.getNodeSnapshot('component-1'),
  attributeSnapshot,
)

runtime.componentProps.commitDerivedUpdates('component-1', [
  { property: 'state', value: 'derived' },
])
const derivedSnapshot = runtime.componentProps.getNodeSnapshot('component-1')
assert.equal(derivedSnapshot.state, 'derived')
assert.strictEqual(
  runtime.componentAttributes.getNodeSnapshot('component-1'),
  attributeSnapshot,
)

runtime.values.set('legacy.state', 'legacy-2')
assert.equal(runtime.values.get('legacy.state'), 'legacy-2')
assert.equal(
  runtime.componentProps.getNodeSnapshot('component-1').state,
  'derived',
)
assert.strictEqual(
  runtime.componentAttributes.getNodeSnapshot('component-1'),
  attributeSnapshot,
)

runtime.invokeAction('component-1', 'inspect')
assert.strictEqual(observedActionAttributes, attributeSnapshot)
assert.strictEqual(observedActionProperties, derivedSnapshot)
assert.equal(Object.isFrozen(observedActionProperties), true)

runtime.componentProps.commitDerivedUpdates('component-1', [
  { property: 'state', value: undefined },
])
const releasedSnapshot = runtime.componentProps.getNodeSnapshot('component-1')
assert.equal(releasedSnapshot.state, 'legacy-2')
runtime.invokeAction('component-1', 'inspect')
assert.strictEqual(observedActionAttributes, attributeSnapshot)
assert.strictEqual(observedActionProperties, releasedSnapshot)

assert.throws(
  () =>
    runtime.componentProps.commitDerivedUpdates('component-1', [
      { property: 'missing', value: 'bad' },
    ]),
  /does not declare property/,
)
assert.strictEqual(
  runtime.componentProps.getNodeSnapshot('component-1'),
  releasedSnapshot,
)
assert.strictEqual(
  runtime.componentAttributes.getNodeSnapshot('component-1'),
  attributeSnapshot,
)

let eventCount = 0
const unsubscribeEvents = runtime.subscribeEvents(() => {
  eventCount += 1
})
runtime.invokeAction('component-1', 'emitPing')
assert.equal(eventCount, 1)
assert.equal(legacyActionCount, 1)
assert.strictEqual(legacyActionProperties, releasedSnapshot)

const releaseCompiledClaimA = runtime.claimCompiledSemantics('component-1')
const releaseCompiledClaimB = runtime.claimCompiledSemantics('component-1')
runtime.invokeAction('component-1', 'emitPing')
assert.equal(eventCount, 2)
assert.equal(legacyActionCount, 1)

releaseCompiledClaimA()
runtime.invokeAction('component-1', 'emitPing')
assert.equal(eventCount, 3)
assert.equal(legacyActionCount, 1)

releaseCompiledClaimB()
runtime.invokeAction('component-1', 'emitPing')
assert.equal(eventCount, 4)
assert.equal(legacyActionCount, 2)

unsubscribeEvents()
releaseRuntime()
assert.equal(runtime.isRunning, false)
assert.deepEqual(runtime.componentAttributes.getNodeSnapshot('component-1'), {})
assert.deepEqual(runtime.componentProps.getNodeSnapshot('component-1'), {})

console.log(
  'Preview Component authority checks passed: authored Attributes and effective Properties are independent immutable host snapshots, runtime/derived Property changes never mutate Attributes, Renderer/Action consumers share the settled authorities, and compiled semantic claims retain legacy behavior isolation.',
)
