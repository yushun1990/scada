import assert from 'node:assert/strict'
import type { ComponentPropertyFallbackValues } from '../src/component-system/definition'
import type { ComponentRegistration } from '../src/component-system/registration'
import { ComponentRegistry } from '../src/component-system/registry'
import type { ScadaDeviceActionInvocation } from '../src/runtime/device-action-dispatcher'
import { PreviewRuntime } from '../src/runtime/preview-runtime'
import { attachPreviewScadaSemantics } from '../src/runtime/preview-scada-semantics'
import {
  createScadaDslCapabilityCatalog,
} from '../src/scene/scada-dsl'
import { compileScadaDslSource } from '../src/scene/scada-dsl-compiler'
import type { ScadaDslPropagationDiagnostic } from '../src/scene/scada-dsl-propagation-session'
import type { SceneDocument } from '../src/scene/model'

const actionSnapshots: Array<{
  action: string
  properties: Readonly<ComponentPropertyFallbackValues>
}> = []
let legacyActionCount = 0

const registration: ComponentRegistration = {
  definition: {
    type: 'test.preview-scada',
    title: 'Preview SCADA integration test',
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
        defaultValue: 7,
        bindable: true,
      },
      label: {
        title: 'Label',
        kind: 'string',
        defaultValue: 'low',
        bindable: true,
      },
    },
    actions: {
      showHigh: { title: 'Show high' },
      showLow: { title: 'Show low' },
      legacyAction: { title: 'Legacy action' },
    },
    events: {
      commandRequested: { title: 'Command requested' },
    },
    anchors: [],
  },
  renderer: (() => null) as unknown as ComponentRegistration['renderer'],
  createDefaultProps: () => ({ level: 7, label: 'low' }),
  actions: {
    showHigh: ({ properties }) => {
      actionSnapshots.push({ action: 'showHigh', properties })
    },
    showLow: ({ properties }) => {
      actionSnapshots.push({ action: 'showLow', properties })
    },
    legacyAction: () => {
      legacyActionCount += 1
    },
  },
}

const registry = new ComponentRegistry([registration])
const catalog = createScadaDslCapabilityCatalog(registration.definition, [
  {
    sourceId: 'authoring-device',
    title: 'Primary device',
    properties: {
      level: { title: 'Level', kind: 'number', defaultValue: 0 },
      alert: { title: 'Alert', kind: 'boolean', defaultValue: false },
    },
    actions: {
      start: { title: 'Start' },
    },
  },
])

function createScene(
  id: string,
  nodeId: string,
  propertyFallbacks: ComponentPropertyFallbackValues = { level: 7, label: 'low' },
): SceneDocument {
  return {
    version: 8,
    id,
    name: id,
    width: 1280,
    height: 720,
    background: '#fff',
    nodes: [
      {
        id: nodeId,
        type: registration.definition.type,
        name: nodeId,
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
        propertyFallbacks,
        bindings: [],
        behaviors: [
          {
            id: `${nodeId}-legacy-command`,
            trigger: {
              kind: 'event',
              event: 'commandRequested',
            },
            effect: {
              kind: 'action',
              targetNodeId: nodeId,
              action: 'legacyAction',
            },
          },
        ],
        scadaSemantics: null,
      },
    ],
    connections: [],
  }
}

const source = `
$self.level = $device.level
if $self.level > 10 {
  $self.label = "high"
} else {
  $self.label = "low"
}

if $self.label == "high" {
  $self.showHigh()
} else {
  $self.showLow()
}

on $self.commandRequested {
  $device.start()
}
`
const compiledResult = compileScadaDslSource(source, catalog)
assert.deepEqual(compiledResult.diagnostics, [])
assert.ok(compiledResult.compiled)

const runtime = new PreviewRuntime([], registry)
const scene = createScene('scene-preview-scada', 'component-1')
const releaseRuntime = runtime.acquire(scene)
runtime.values.set('pump-01:level', 42)

const deviceActions: ScadaDeviceActionInvocation[] = []
const diagnostics: ScadaDslPropagationDiagnostic[] = []
const attachment = attachPreviewScadaSemantics(
  runtime,
  'component-1',
  compiledResult.compiled!,
  {
    primaryDevice: { deviceId: 'pump-01' },
    deviceActionDispatcher: {
      dispatch(effect) {
        deviceActions.push(effect)
      },
    },
    onDiagnostics(nextDiagnostics) {
      diagnostics.push(...nextDiagnostics)
    },
  },
)

// Initial propagation settles the full derived graph before Behavior evaluation.
// The Component Action handler receives the exact immutable snapshot consumed by
// the Preview Renderer path through ComponentPropertyStore.
let renderedSnapshot = runtime.componentProps.getNodeSnapshot('component-1')
assert.deepEqual(renderedSnapshot, { level: 42, label: 'high' })
assert.equal(actionSnapshots.at(-1)?.action, 'showHigh')
assert.strictEqual(actionSnapshots.at(-1)?.properties, renderedSnapshot)

// A concrete source publication routes through the compiled reverse index and
// changes the host-owned rendered snapshot without writing authored Scene
// Property fallbacks.
runtime.values.set('pump-01:level', 5)
renderedSnapshot = runtime.componentProps.getNodeSnapshot('component-1')
assert.deepEqual(renderedSnapshot, { level: 5, label: 'low' })
assert.equal(actionSnapshots.at(-1)?.action, 'showLow')
assert.strictEqual(actionSnapshots.at(-1)?.properties, renderedSnapshot)
assert.deepEqual(
  scene.nodes[0] && 'propertyFallbacks' in scene.nodes[0]
    ? scene.nodes[0].propertyFallbacks
    : null,
  { level: 7, label: 'low' },
)

// While compiled semantics owns the node, the same Component Event is routed
// only into the new Interaction Binding path. The compatibility-only Event ->
// Component Action behavior stays suppressed.
runtime.emitEvent('component-1', 'commandRequested')
assert.equal(legacyActionCount, 0)
assert.deepEqual(deviceActions.at(-1), {
  interactionId: 'interaction:3',
  sourceId: 'pump-01',
  action: 'start',
  arguments: [],
})

// Rebind is applied through the transactional propagation session. With no
// pump-02 value, old pump-01 derived state is explicitly released back to the
// authored/default base instead of leaking across devices.
runtime.values.set('pump-01:level', 42)
assert.equal(runtime.componentProps.getNodeSnapshot('component-1').level, 42)
const rebindMissing = attachment.rebindPrimaryDevice({ deviceId: 'pump-02' })
assert.equal(rebindMissing.aborted, false)
renderedSnapshot = runtime.componentProps.getNodeSnapshot('component-1')
assert.deepEqual(renderedSnapshot, { level: 7, label: 'low' })
assert.equal(attachment.getPrimaryDevice()?.deviceId, 'pump-02')

runtime.values.set('pump-02:level', 18)
renderedSnapshot = runtime.componentProps.getNodeSnapshot('component-1')
assert.deepEqual(renderedSnapshot, { level: 18, label: 'high' })
runtime.emitEvent('component-1', 'commandRequested')
assert.equal(deviceActions.at(-1)?.sourceId, 'pump-02')
assert.equal(legacyActionCount, 0)

// Detaching compiled semantics releases its derived layer and compatibility
// event dispatch becomes active again.
attachment.dispose()
assert.deepEqual(
  runtime.componentProps.getNodeSnapshot('component-1'),
  { level: 7, label: 'low' },
)
runtime.emitEvent('component-1', 'commandRequested')
assert.equal(legacyActionCount, 1)
releaseRuntime()

// Regression for the host's atomicity boundary. Both source keys change in one
// RuntimeValueStore publication. The batch seeds label before level; settling
// would require a third propagation step, so maxPropagationSteps=2 aborts. No
// derived Property or Component Action effect may escape to Preview.
const abortSource = `
if $device.alert or $self.level > 10 {
  $self.label = "high"
} else {
  $self.label = "low"
}
$self.level = $device.level
`
const abortCompiled = compileScadaDslSource(abortSource, catalog)
assert.deepEqual(abortCompiled.diagnostics, [])
assert.ok(abortCompiled.compiled)

const abortRuntime = new PreviewRuntime([], registry)
const abortScene = createScene(
  'scene-preview-scada-abort',
  'component-abort',
  { level: 42, label: 'low' },
)
const releaseAbortRuntime = abortRuntime.acquire(abortScene)
abortRuntime.values.setMany({
  'pump-a:alert': true,
  'pump-a:level': 42,
})
const abortDiagnostics: ScadaDslPropagationDiagnostic[] = []
const abortAttachment = attachPreviewScadaSemantics(
  abortRuntime,
  'component-abort',
  abortCompiled.compiled!,
  {
    primaryDevice: { deviceId: 'pump-a' },
    maxPropagationSteps: 2,
    onDiagnostics(nextDiagnostics) {
      abortDiagnostics.push(...nextDiagnostics)
    },
  },
)
const committedBeforeAbort =
  abortRuntime.componentProps.getNodeSnapshot('component-abort')
assert.deepEqual(committedBeforeAbort, { level: 42, label: 'high' })

abortRuntime.values.setMany({
  'pump-a:alert': false,
  'pump-a:level': 5,
})
assert.strictEqual(
  abortRuntime.componentProps.getNodeSnapshot('component-abort'),
  committedBeforeAbort,
)
assert.ok(abortDiagnostics.some((diagnostic) => diagnostic.kind === 'limit'))

// A forced rebind abort likewise preserves the previous primary device and the
// exact previously committed Preview snapshot.
abortRuntime.values.setMany({
  'pump-b:alert': false,
  'pump-b:level': 5,
})
const abortedRebind = abortAttachment.rebindPrimaryDevice({ deviceId: 'pump-b' })
assert.equal(abortedRebind.aborted, true)
assert.equal(abortAttachment.getPrimaryDevice()?.deviceId, 'pump-a')
assert.strictEqual(
  abortRuntime.componentProps.getNodeSnapshot('component-abort'),
  committedBeforeAbort,
)
assert.deepEqual(abortedRebind.valueUpdates, [])
assert.deepEqual(abortedRebind.componentActions, [])

abortAttachment.dispose()
releaseAbortRuntime()

console.log(
  'Preview SCADA integration checks passed: DSL v1 $self/$device source compiles through Scene v8 Preview, Property fallbacks stay authored and immutable under runtime propagation, Behaviors run only after derived settling, Component Actions share the Renderer snapshot, Interactions emit one host-owned device action, rebind never leaks old-device values, and aborted source/rebind propagation exposes no partial Preview effects.',
)
