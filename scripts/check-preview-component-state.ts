import assert from 'node:assert/strict'
import type { ComponentProps } from '../src/component-system/definition'
import type { ComponentRegistration } from '../src/component-system/registration'
import { ComponentRegistry } from '../src/component-system/registry'
import { PreviewRuntime } from '../src/runtime/preview-runtime'
import type { SceneDocument } from '../src/scene/model'

let observedActionProps: Readonly<ComponentProps> | null = null
let legacyActionProps: Readonly<ComponentProps> | null = null
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
    attributes: {},
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
    inspect: ({ props }) => {
      observedActionProps = props
    },
    emitPing: ({ emit }) => {
      emit('ping')
    },
    legacyAction: ({ props }) => {
      legacyActionCount += 1
      legacyActionProps = props
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
      attributes: {},
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

// The store owns the effective snapshot. Without an external value the authored
// fallback layer wins over the component default.
assert.equal(
  runtime.componentProps.getNodeSnapshot('component-1').state,
  'authored',
)

// RuntimeValueStore remains external-source state. Legacy Scene v6 binding is a
// compatibility layer that feeds the Component Property store rather than
// becoming Component Property state itself.
runtime.values.set('legacy.state', 'legacy')
const legacySnapshot = runtime.componentProps.getNodeSnapshot('component-1')
assert.equal(legacySnapshot.state, 'legacy')
assert.equal(runtime.values.get('legacy.state'), 'legacy')

// Compiled-derived state has deterministic precedence over the legacy binding.
runtime.componentProps.commitDerivedUpdates('component-1', [
  { property: 'state', value: 'derived' },
])
const derivedSnapshot = runtime.componentProps.getNodeSnapshot('component-1')
assert.equal(derivedSnapshot.state, 'derived')

// An external update changes RuntimeValueStore, but the settled Component
// Property remains derived until that explicit override is released.
runtime.values.set('legacy.state', 'legacy-2')
assert.equal(runtime.values.get('legacy.state'), 'legacy-2')
assert.equal(
  runtime.componentProps.getNodeSnapshot('component-1').state,
  'derived',
)

// Component Action handlers read the exact same immutable snapshot consumed by
// Preview renderers; there is no second independent effective-props calculation.
runtime.invokeAction('component-1', 'inspect')
assert.strictEqual(observedActionProps, derivedSnapshot)
assert.equal(Object.isFrozen(observedActionProps), true)

// Releasing a derived override falls back through the deterministic layering to
// the current legacy v6 binding value.
runtime.componentProps.commitDerivedUpdates('component-1', [
  { property: 'state', value: undefined },
])
const releasedSnapshot = runtime.componentProps.getNodeSnapshot('component-1')
assert.equal(releasedSnapshot.state, 'legacy-2')
runtime.invokeAction('component-1', 'inspect')
assert.strictEqual(observedActionProps, releasedSnapshot)

// Derived commits validate the public component contract and are transactional:
// an invalid value cannot corrupt the previously committed snapshot.
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

// Legacy Scene v6 Event -> Component Action behavior remains compatibility-only
// when no compiled semantics owner has claimed the node.
let eventCount = 0
const unsubscribeEvents = runtime.subscribeEvents(() => {
  eventCount += 1
})
runtime.invokeAction('component-1', 'emitPing')
assert.equal(eventCount, 1)
assert.equal(legacyActionCount, 1)
assert.strictEqual(legacyActionProps, releasedSnapshot)

// Once compiled semantics claims the node, the Component Event is still
// published for the new Interaction path, but legacy automatic behavior dispatch
// is suppressed. This prevents both semantic models from firing in parallel.
const releaseCompiledClaimA = runtime.claimCompiledSemantics('component-1')
const releaseCompiledClaimB = runtime.claimCompiledSemantics('component-1')
runtime.invokeAction('component-1', 'emitPing')
assert.equal(eventCount, 2)
assert.equal(legacyActionCount, 1)

// Claims are reference-counted so nested Preview consumers cannot accidentally
// re-enable the compatibility path while another compiled owner is active.
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
assert.deepEqual(runtime.componentProps.getNodeSnapshot('component-1'), {})

console.log(
  'Preview Component Property state checks passed: Preview owns one deterministic default/authored-fallback/legacy/derived snapshot, authored Attributes stay outside the Property store, RuntimeValueStore stays external, Renderer/Action consumers share the same settled props object, and compiled semantic claims suppress legacy v6 Event -> Component Action dispatch without hiding Component Events.',
)
