import assert from 'node:assert/strict'
import type {
  ComponentDefinition,
  ComponentScalarValue,
} from '../src/component-system/definition'
import {
  createScadaDslCapabilityCatalog,
  parseScadaDsl,
} from '../src/scene/scada-dsl'
import {
  lowerScadaDslProgram,
  type ScadaDslSemanticPlan,
} from '../src/scene/scada-dsl-semantics'
import {
  compileScadaDslRuntime,
  evaluateScadaDslComponentEvent,
  evaluateScadaDslRuntimeTargets,
  getScadaDslComponentPropertyUpdateTargets,
  getScadaDslInitialTargets,
  getScadaDslSourceUpdateTargets,
} from '../src/scene/scada-dsl-runtime'

const component: ComponentDefinition = {
  type: 'test.pump',
  title: 'Pump',
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
      kind: 'select',
      defaultValue: 'stopped',
      bindable: true,
      options: [
        { label: 'Stopped', value: 'stopped' },
        { label: 'Running', value: 'running' },
        { label: 'Fault', value: 'fault' },
      ],
    },
    level: {
      title: 'Level',
      kind: 'number',
      defaultValue: 0,
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
    showFault: { title: 'Show fault' },
    showRunning: { title: 'Show running' },
    showStopped: { title: 'Show stopped' },
  },
  events: {
    startRequested: { title: 'Start requested' },
    stopRequested: { title: 'Stop requested' },
  },
  anchors: [],
}

const catalog = createScadaDslCapabilityCatalog(component, [
  {
    sourceId: 'pump-authoring-placeholder',
    title: 'Pump',
    properties: {
      running: { title: 'Running', kind: 'boolean', defaultValue: false },
      fault: { title: 'Fault', kind: 'boolean', defaultValue: false },
      pressure: { title: 'Pressure', kind: 'number', defaultValue: 0 },
      sample: { title: 'Sample', kind: 'number', defaultValue: 0 },
    },
    actions: {
      start: { title: 'Start' },
      stop: { title: 'Stop' },
    },
  },
])

const parsed = parseScadaDsl(`
if $device.fault {
  $self.state = "fault"
} else if $device.running {
  $self.state = "running"
} else {
  $self.state = "stopped"
}
$self.level = $device.pressure * 100
if $self.level > 100 {
  $self.label = "high"
} else {
  $self.label = "low"
}

if $device.fault {
  $self.showFault($device.sample)
} else if $device.running {
  $self.showRunning()
} else {
  $self.showStopped()
}

on $self.startRequested {
  $device.start($device.sample)
}

on $self.stopRequested {
  $device.stop()
}
`)
assert.deepEqual(parsed.diagnostics, [])
assert.ok(parsed.program)

const lowered = lowerScadaDslProgram(parsed.program!, catalog)
assert.deepEqual(lowered.diagnostics, [])
assert.ok(lowered.plan)

const compiled = compileScadaDslRuntime(lowered.plan!)
assert.equal(compiled.plan.valueBindings.length, 3)
assert.equal(compiled.plan.behaviors.length, 1)
assert.equal(compiled.plan.interactions.length, 2)

const primaryDevice = { deviceId: 'pump-02' }

// A concrete primary-device update routes through relative `$device.*`
// dependencies. The authoring-time placeholder is never captured.
let targets = getScadaDslSourceUpdateTargets(
  compiled,
  'pump-02',
  'fault',
  primaryDevice,
)
assert.deepEqual(targets.valueBindings.map((entry) => entry.targetProperty), ['state'])
assert.deepEqual(targets.behaviors.map((entry) => entry.id), ['behavior:3'])

const wrongPrimaryTargets = getScadaDslSourceUpdateTargets(
  compiled,
  'pump-authoring-placeholder',
  'fault',
  primaryDevice,
)
assert.equal(wrongPrimaryTargets.valueBindings.length, 0)
assert.equal(wrongPrimaryTargets.behaviors.length, 0)

// Action arguments are read-only dependencies. `sample` is not used by a Value
// Binding or Behavior condition, so changing it must not trigger either path.
targets = getScadaDslSourceUpdateTargets(
  compiled,
  'pump-02',
  'sample',
  primaryDevice,
)
assert.equal(targets.valueBindings.length, 0)
assert.equal(targets.behaviors.length, 0)

// `$device.pressure` wakes only the Value Binding that actually depends on it.
targets = getScadaDslSourceUpdateTargets(
  compiled,
  'pump-02',
  'pressure',
  primaryDevice,
)
assert.deepEqual(targets.valueBindings.map((entry) => entry.targetProperty), ['level'])
assert.equal(targets.behaviors.length, 0)

// Component-property dependencies are indexed separately, enabling the host to
// propagate a changed derived Property without rescanning every DSL statement.
const componentTargets = getScadaDslComponentPropertyUpdateTargets(
  compiled,
  'level',
)
assert.deepEqual(
  componentTargets.valueBindings.map((entry) => entry.targetProperty),
  ['label'],
)
assert.equal(componentTargets.behaviors.length, 0)

const sourceValues = new Map<string, ComponentScalarValue>([
  ['pump-02:fault', true],
  ['pump-02:running', true],
  ['pump-02:pressure', 1.25],
  ['pump-02:sample', 0.73],
])
const componentValues = new Map<string, ComponentScalarValue>([
  ['state', 'stopped'],
  ['level', 0],
  ['label', 'low'],
])
const context = {
  primaryDevice,
  readSourceValue(sourceId: string, property: string) {
    return sourceValues.get(`${sourceId}:${property}`)
  },
  readComponentProperty(property: string) {
    return componentValues.get(property)
  },
}

// Initial target evaluation is intentionally one pass. The label reads the
// current component level (0); propagation-session tests own fixed-point settle.
const initial = evaluateScadaDslRuntimeTargets(
  getScadaDslInitialTargets(compiled),
  context,
)
assert.deepEqual(
  initial.valueUpdates.map((entry) => [entry.property, entry.value]),
  [
    ['state', 'fault'],
    ['level', 125],
    ['label', 'low'],
  ],
)
assert.deepEqual(initial.componentActions, [
  {
    behaviorId: 'behavior:3',
    branchId: 'behavior:3:branch:0',
    action: 'showFault',
    arguments: [0.73],
  },
])

// Re-evaluating the same active branch does not replay its one-shot Action.
const faultTargets = getScadaDslSourceUpdateTargets(
  compiled,
  'pump-02',
  'fault',
  primaryDevice,
)
const repeated = evaluateScadaDslRuntimeTargets(
  faultTargets,
  context,
  initial.nextBehaviorBranches,
)
assert.deepEqual(repeated.componentActions, [])
assert.deepEqual(repeated.valueUpdates, [
  { bindingId: 'value:0:state', property: 'state', value: 'fault' },
])

// Moving to the next ordered branch fires that branch exactly once.
sourceValues.set('pump-02:fault', false)
const faultCleared = evaluateScadaDslRuntimeTargets(
  faultTargets,
  context,
  repeated.nextBehaviorBranches,
)
assert.deepEqual(faultCleared.componentActions, [
  {
    behaviorId: 'behavior:3',
    branchId: 'behavior:3:branch:1',
    action: 'showRunning',
    arguments: [],
  },
])
assert.deepEqual(faultCleared.valueUpdates, [
  { bindingId: 'value:0:state', property: 'state', value: 'running' },
])

// The derived level update can be propagated through the component-property
// reverse index without waking unrelated bindings or Behaviors.
const pressureTargets = getScadaDslSourceUpdateTargets(
  compiled,
  'pump-02',
  'pressure',
  primaryDevice,
)
const pressureEvaluation = evaluateScadaDslRuntimeTargets(
  pressureTargets,
  context,
  faultCleared.nextBehaviorBranches,
)
assert.deepEqual(pressureEvaluation.valueUpdates, [
  { bindingId: 'value:1', property: 'level', value: 125 },
])
componentValues.set('level', 125)
const labelEvaluation = evaluateScadaDslRuntimeTargets(
  getScadaDslComponentPropertyUpdateTargets(compiled, 'level'),
  context,
  pressureEvaluation.nextBehaviorBranches,
)
assert.deepEqual(labelEvaluation.valueUpdates, [
  { bindingId: 'value:2:label', property: 'label', value: 'high' },
])

// Component Events are indexed independently from telemetry. Only the matching
// Interaction is resolved, and Action arguments are read at event time.
const startEvent = evaluateScadaDslComponentEvent(
  compiled,
  'startRequested',
  context,
)
assert.deepEqual(startEvent.diagnostics, [])
assert.deepEqual(startEvent.deviceActions, [
  {
    interactionId: 'interaction:4',
    sourceId: 'pump-02',
    action: 'start',
    arguments: [0.73],
  },
])

const stopEvent = evaluateScadaDslComponentEvent(
  compiled,
  'stopRequested',
  context,
)
assert.deepEqual(stopEvent.deviceActions, [
  {
    interactionId: 'interaction:5',
    sourceId: 'pump-02',
    action: 'stop',
    arguments: [],
  },
])

assert.deepEqual(
  evaluateScadaDslComponentEvent(compiled, 'unknownEvent', context).deviceActions,
  [],
)

// Rebinding changes only runtime context. The same compiled relative index now
// routes `$device.*` dependencies to pump-03 without recompiling source text.
const reboundTargets = getScadaDslSourceUpdateTargets(
  compiled,
  'pump-03',
  'fault',
  { deviceId: 'pump-03' },
)
assert.deepEqual(reboundTargets.valueBindings.map((entry) => entry.id), ['value:0:state'])
assert.deepEqual(reboundTargets.behaviors.map((entry) => entry.id), ['behavior:3'])

// Structured persisted semantics retain explicit external-reference support for
// old accepted artifacts even though DSL v1 no longer authors named roots.
const legacyExternalPlan: ScadaDslSemanticPlan = {
  valueBindings: [
    {
      id: 'legacy:value:external',
      targetProperty: 'level',
      expression: {
        kind: 'reference',
        reference: {
          kind: 'source-property',
          reference: {
            scope: 'external',
            sourceId: 'outlet-01',
            property: 'pressure',
          },
        },
      },
    },
  ],
  behaviors: [],
  interactions: [],
}
const legacyExternalRuntime = compileScadaDslRuntime(legacyExternalPlan)
const legacyExternalTargets = getScadaDslSourceUpdateTargets(
  legacyExternalRuntime,
  'outlet-01',
  'pressure',
  primaryDevice,
)
assert.deepEqual(
  legacyExternalTargets.valueBindings.map((entry) => entry.id),
  ['legacy:value:external'],
)

console.log(
  'SCADA DSL v1 runtime checks passed: newly authored $device references compile into a primary-device-relative reverse index, read-only Action arguments do not become triggers, Component Property propagation and Event lookup remain indexed, branch-entry Actions remain idempotent, rebinding requires no recompilation, and structured external references remain executable only as persisted compatibility data.',
)
