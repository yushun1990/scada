import assert from 'node:assert/strict'
import type {
  ComponentDefinition,
  ComponentScalarValue,
} from '../src/component-system/definition'
import {
  createScadaDslCapabilityCatalog,
  parseScadaDsl,
} from '../src/scene/scada-dsl'
import { lowerScadaDslProgram } from '../src/scene/scada-dsl-semantics'
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
    symbol: 'device',
    properties: {
      running: { title: 'Running', kind: 'boolean', defaultValue: false },
      fault: { title: 'Fault', kind: 'boolean', defaultValue: false },
      pressure: { title: 'Pressure', kind: 'number', defaultValue: 0 },
    },
    actions: {
      start: { title: 'Start' },
      stop: { title: 'Stop' },
    },
  },
  {
    sourceId: 'outlet-01',
    title: 'Outlet',
    symbol: 'outlet',
    properties: {
      pressure: { title: 'Pressure', kind: 'number', defaultValue: 0 },
    },
    actions: {
      stop: { title: 'Stop outlet' },
    },
  },
])

const parsed = parseScadaDsl(`
component.state = if device.fault then "fault" else if device.running then "running" else "stopped"
component.level = outlet.pressure * 100
component.label = if component.level > 100 then "high" else "low"

if device.fault {
  component.showFault(device.pressure)
} else if device.running {
  component.showRunning()
} else {
  component.showStopped()
}

on component.startRequested {
  device.start(outlet.pressure)
}

on component.stopRequested {
  outlet.stop(device.pressure)
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

// A concrete primary-device update routes through relative `device.*`
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

// Behavior Action arguments are read-only dependencies. Pressure changes do
// not replay the fault Action just because showFault(device.pressure) reads it.
targets = getScadaDslSourceUpdateTargets(
  compiled,
  'pump-02',
  'pressure',
  primaryDevice,
)
assert.equal(targets.valueBindings.length, 0)
assert.equal(targets.behaviors.length, 0)

// An explicit external source keeps its stable source id and only wakes the
// Value Binding that actually depends on it.
targets = getScadaDslSourceUpdateTargets(
  compiled,
  'outlet-01',
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
  ['pump-02:pressure', 0.73],
  ['outlet-01:pressure', 1.25],
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

// Initial evaluation still exists as an explicit operation; steady-state
// Properties and the initially active Behavior branch can be established once.
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
  { bindingId: 'value:0', property: 'state', value: 'fault' },
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
  { bindingId: 'value:0', property: 'state', value: 'running' },
])

// The derived level update can be propagated through the component-property
// reverse index without waking unrelated Value Bindings or Behaviors.
const outletTargets = getScadaDslSourceUpdateTargets(
  compiled,
  'outlet-01',
  'pressure',
  primaryDevice,
)
const outletEvaluation = evaluateScadaDslRuntimeTargets(
  outletTargets,
  context,
  faultCleared.nextBehaviorBranches,
)
assert.deepEqual(outletEvaluation.valueUpdates, [
  { bindingId: 'value:1', property: 'level', value: 125 },
])
componentValues.set('level', 125)
const labelEvaluation = evaluateScadaDslRuntimeTargets(
  getScadaDslComponentPropertyUpdateTargets(compiled, 'level'),
  context,
  outletEvaluation.nextBehaviorBranches,
)
assert.deepEqual(labelEvaluation.valueUpdates, [
  { bindingId: 'value:2', property: 'label', value: 'high' },
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
    arguments: [1.25],
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
    sourceId: 'outlet-01',
    action: 'stop',
    arguments: [0.73],
  },
])

assert.deepEqual(
  evaluateScadaDslComponentEvent(compiled, 'unknownEvent', context).deviceActions,
  [],
)

// Rebinding only changes runtime context. The same compiled relative index now
// routes device.* dependencies to pump-03 without recompiling the DSL.
const reboundTargets = getScadaDslSourceUpdateTargets(
  compiled,
  'pump-03',
  'fault',
  { deviceId: 'pump-03' },
)
assert.deepEqual(reboundTargets.valueBindings.map((entry) => entry.id), ['value:0'])
assert.deepEqual(reboundTargets.behaviors.map((entry) => entry.id), ['behavior:3'])

console.log(
  'SCADA DSL runtime checks passed: the compiled reverse index routes only affected Value/Behavior plans, read-only Action arguments do not become triggers, Component Property propagation and Component Event lookup are indexed, ordered branch-entry actions remain idempotent, and primary-device rebinding works without recompilation.',
)
