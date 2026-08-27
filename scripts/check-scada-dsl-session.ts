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
import { compileScadaDslRuntime } from '../src/scene/scada-dsl-runtime'
import { createScadaDslPropagationSession } from '../src/scene/scada-dsl-session'

const component: ComponentDefinition = {
  type: 'test.propagation',
  title: 'Propagation test',
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
    manual: {
      title: 'Manual',
      kind: 'boolean',
      defaultValue: false,
      bindable: true,
    },
    manualLabel: {
      title: 'Manual label',
      kind: 'string',
      defaultValue: 'auto',
      bindable: true,
    },
  },
  actions: {
    showLow: { title: 'Show low' },
    showHigh: { title: 'Show high' },
  },
  events: {
    startRequested: { title: 'Start requested' },
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
    },
    actions: {
      start: { title: 'Start' },
    },
  },
  {
    sourceId: 'outlet-01',
    title: 'Outlet',
    symbol: 'outlet',
    properties: {
      pressure: { title: 'Pressure', kind: 'number', defaultValue: 0 },
    },
  },
])

const parsed = parseScadaDsl(`
component.state = if device.running then "running" else "stopped"
component.level = outlet.pressure * 100
component.label = if component.level > 100 then "high" else "low"
component.manualLabel = if component.manual then "manual" else "auto"

if outlet.pressure > 1 and component.label == "high" {
  component.showHigh(component.level)
} else {
  component.showLow(component.level)
}

on component.startRequested {
  device.start(component.level)
}
`)
assert.deepEqual(parsed.diagnostics, [])
assert.ok(parsed.program)
const lowered = lowerScadaDslProgram(parsed.program!, catalog)
assert.deepEqual(lowered.diagnostics, [])
assert.ok(lowered.plan)
const compiled = compileScadaDslRuntime(lowered.plan!)

let primaryDevice = { deviceId: 'pump-02' }
const sourceValues = new Map<string, ComponentScalarValue>([
  ['pump-02:running', true],
  ['pump-03:running', false],
  ['outlet-01:pressure', 0.5],
])
const hostComponentValues = new Map<string, ComponentScalarValue>([
  ['state', 'stopped'],
  ['level', 0],
  ['label', 'low'],
  ['manual', false],
  ['manualLabel', 'auto'],
])

const session = createScadaDslPropagationSession(compiled, {
  getPrimaryDevice: () => primaryDevice,
  readSourceValue(sourceId, property) {
    return sourceValues.get(`${sourceId}:${property}`)
  },
  readComponentProperty(property) {
    return hostComponentValues.get(property)
  },
})

// Initialization is a complete propagation transaction. `label` observes the
// staged `level`, not the stale host value, before Behavior is evaluated.
const initial = session.initialize()
assert.equal(initial.committed, true)
assert.deepEqual(initial.diagnostics, [])
assert.deepEqual(
  initial.valueUpdates.map((update) => [update.property, update.value]),
  [
    ['state', 'running'],
    ['level', 50],
  ],
)
assert.deepEqual(initial.componentActions, [
  {
    behaviorId: 'behavior:5',
    branchId: 'behavior:5:branch:1',
    action: 'showLow',
    arguments: [50],
  },
])
assert.equal(session.getDerivedProperty('level'), 50)
assert.equal(session.getDerivedProperty('label'), undefined)

// A source update first settles the full Value Binding chain and only then
// evaluates Behavior. The Behavior must see label=high and must never emit an
// intermediate showLow Action for the same telemetry transaction.
sourceValues.set('outlet-01:pressure', 1.25)
const pressureChanged = session.handleSourceUpdate('outlet-01', 'pressure')
assert.equal(pressureChanged.committed, true)
assert.deepEqual(pressureChanged.diagnostics, [])
assert.deepEqual(
  pressureChanged.valueUpdates.map((update) => [update.property, update.value]),
  [
    ['level', 125],
    ['label', 'high'],
  ],
)
assert.deepEqual(pressureChanged.componentActions, [
  {
    behaviorId: 'behavior:5',
    branchId: 'behavior:5:branch:0',
    action: 'showHigh',
    arguments: [125],
  },
])
assert.equal(session.getDerivedProperty('level'), 125)
assert.equal(session.getDerivedProperty('label'), 'high')

// Repeated telemetry with no effective state change produces no Property write
// and does not replay the active branch Action.
const repeated = session.handleSourceUpdate('outlet-01', 'pressure')
assert.equal(repeated.committed, true)
assert.deepEqual(repeated.valueUpdates, [])
assert.deepEqual(repeated.componentActions, [])

// Component Event arguments read the session's latest committed derived state,
// even if the host has not mirrored the returned Property update yet.
const eventResult = session.handleComponentEvent('startRequested')
assert.deepEqual(eventResult.diagnostics, [])
assert.deepEqual(eventResult.deviceActions, [
  {
    interactionId: 'interaction:6',
    sourceId: 'pump-02',
    action: 'start',
    arguments: [125],
  },
])

// Non-DSL component Properties can still enter the graph from the host. The
// caller updates host state first, then notifies the session by property name.
hostComponentValues.set('manual', true)
const manualChanged = session.handleComponentPropertyUpdate('manual')
assert.equal(manualChanged.committed, true)
assert.deepEqual(manualChanged.valueUpdates, [
  {
    bindingId: 'value:3',
    property: 'manualLabel',
    value: 'manual',
  },
])

// Rebinding changes only runtime context. Resetting runtime-local state and
// initializing again uses pump-03 through the same compiled program.
session.reset()
primaryDevice = { deviceId: 'pump-03' }
const rebound = session.initialize()
assert.equal(rebound.committed, true)
assert.deepEqual(
  rebound.valueUpdates.find((update) => update.property === 'state'),
  { bindingId: 'value:0', property: 'state', value: 'stopped' },
)
assert.deepEqual(session.handleComponentEvent('startRequested').deviceActions, [
  {
    interactionId: 'interaction:6',
    sourceId: 'pump-03',
    action: 'start',
    arguments: [125],
  },
])

// A stable cycle is harmless: if both values are already equal no writes are
// generated and the transaction converges immediately.
const cycleComponent: ComponentDefinition = {
  ...component,
  properties: {
    a: { title: 'A', kind: 'boolean', defaultValue: false, bindable: true },
    b: { title: 'B', kind: 'boolean', defaultValue: false, bindable: true },
  },
  actions: {},
  events: {},
}
const cycleCatalog = createScadaDslCapabilityCatalog(cycleComponent, [])
const stableParsed = parseScadaDsl(`
component.a = component.b
component.b = component.a
`)
assert.ok(stableParsed.program)
const stablePlan = lowerScadaDslProgram(stableParsed.program!, cycleCatalog)
assert.ok(stablePlan.plan)
const stableSession = createScadaDslPropagationSession(
  compileScadaDslRuntime(stablePlan.plan!),
  {
    getPrimaryDevice: () => null,
    readSourceValue: () => undefined,
    readComponentProperty: () => false,
  },
)
const stableResult = stableSession.initialize()
assert.equal(stableResult.committed, true)
assert.deepEqual(stableResult.valueUpdates, [])

// Oscillating cycles are detected transactionally. No partial derived values or
// Actions escape and the previously committed session state remains unchanged.
const oscillatingParsed = parseScadaDsl(`
component.a = not component.b
component.b = component.a
`)
assert.ok(oscillatingParsed.program)
const oscillatingPlan = lowerScadaDslProgram(
  oscillatingParsed.program!,
  cycleCatalog,
)
assert.ok(oscillatingPlan.plan)
const oscillatingSession = createScadaDslPropagationSession(
  compileScadaDslRuntime(oscillatingPlan.plan!),
  {
    getPrimaryDevice: () => null,
    readSourceValue: () => undefined,
    readComponentProperty: () => false,
    maxPropagationSteps: 32,
  },
)
const oscillating = oscillatingSession.initialize()
assert.equal(oscillating.committed, false)
assert.deepEqual(oscillating.valueUpdates, [])
assert.deepEqual(oscillating.componentActions, [])
assert.ok(
  oscillating.diagnostics.some((diagnostic) =>
    diagnostic.message.includes('循环/振荡'),
  ),
)
assert.equal(oscillatingSession.getDerivedProperty('a'), undefined)
assert.equal(oscillatingSession.getDerivedProperty('b'), undefined)

// A monotonic non-converging cycle cannot evade the repeated-transition guard;
// the hard propagation-step limit is the final deterministic safety net.
const numericCycleComponent: ComponentDefinition = {
  ...component,
  properties: {
    a: { title: 'A', kind: 'number', defaultValue: 0, bindable: true },
    b: { title: 'B', kind: 'number', defaultValue: 0, bindable: true },
  },
  actions: {},
  events: {},
}
const numericCatalog = createScadaDslCapabilityCatalog(numericCycleComponent, [])
const numericParsed = parseScadaDsl(`
component.a = component.b + 1
component.b = component.a + 1
`)
assert.ok(numericParsed.program)
const numericPlan = lowerScadaDslProgram(numericParsed.program!, numericCatalog)
assert.ok(numericPlan.plan)
const numericSession = createScadaDslPropagationSession(
  compileScadaDslRuntime(numericPlan.plan!),
  {
    getPrimaryDevice: () => null,
    readSourceValue: () => undefined,
    readComponentProperty: () => 0,
    maxPropagationSteps: 8,
  },
)
const numericCycle = numericSession.initialize()
assert.equal(numericCycle.committed, false)
assert.ok(
  numericCycle.diagnostics.some((diagnostic) =>
    diagnostic.message.includes('超过 8 步'),
  ),
)
assert.deepEqual(numericCycle.valueUpdates, [])

session.dispose()
assert.throws(() => session.initialize(), /dispose/)

console.log(
  'SCADA DSL propagation session checks passed: Value Bindings settle transactionally before Behavior effects, derived Component Properties propagate without host round-trips, repeated telemetry is idempotent, Component Events read committed derived state, primary-device rebinding remains compile-free, stable cycles converge, oscillating/diverging cycles roll back, and disposed sessions reject further work.',
)
