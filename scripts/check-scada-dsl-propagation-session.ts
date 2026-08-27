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
import { createScadaDslPropagationSession } from '../src/scene/scada-dsl-propagation-session'

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
    a: {
      title: 'A',
      kind: 'boolean',
      defaultValue: false,
      bindable: true,
    },
    b: {
      title: 'B',
      kind: 'boolean',
      defaultValue: false,
      bindable: true,
    },
  },
  actions: {
    showHigh: { title: 'Show high' },
    showLow: { title: 'Show low' },
    showManual: { title: 'Show manual' },
  },
  events: {
    startRequested: { title: 'Start requested' },
  },
  anchors: [],
}

const catalog = createScadaDslCapabilityCatalog(component, [
  {
    sourceId: 'authoring-device',
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
    actions: {},
  },
])

function compile(source: string) {
  const parsed = parseScadaDsl(source)
  assert.deepEqual(parsed.diagnostics, [])
  assert.ok(parsed.program)
  const lowered = lowerScadaDslProgram(parsed.program!, catalog)
  assert.deepEqual(lowered.diagnostics, [])
  assert.ok(lowered.plan)
  return compileScadaDslRuntime(lowered.plan!)
}

const compiled = compile(`
component.state = if device.running then "running" else "stopped"
component.level = outlet.pressure * 100
component.label = if component.level > 100 then "high" else "low"

if component.label == "high" {
  component.showHigh()
} else {
  component.showLow()
}

if component.manual {
  component.showManual()
} else {
  component.showLow()
}

on component.startRequested {
  device.start(component.level)
}
`)

const sourceValues = new Map<string, ComponentScalarValue>([
  ['pump-02:running', true],
  ['pump-03:running', false],
  ['outlet-01:pressure', 1.25],
])
const baseComponentValues = new Map<string, ComponentScalarValue>([
  ['state', 'stopped'],
  ['level', 0],
  ['label', 'low'],
  ['manual', false],
])

const session = createScadaDslPropagationSession(compiled, {
  primaryDevice: { deviceId: 'pump-02' },
  readSourceValue(sourceId, property) {
    return sourceValues.get(`${sourceId}:${property}`)
  },
  readComponentBaseProperty(property) {
    return baseComponentValues.get(property)
  },
})

// Initial propagation settles all declarative Value Bindings first. Behavior
// therefore observes label=high, never the intermediate authored label=low.
let result = session.initialize()
assert.equal(result.aborted, false)
assert.deepEqual(result.diagnostics, [])
assert.deepEqual(
  result.valueUpdates.map((entry) => [entry.property, entry.value]),
  [
    ['state', 'running'],
    ['level', 125],
    ['label', 'high'],
  ],
)
assert.deepEqual(
  result.componentActions.map((entry) => entry.action),
  ['showHigh', 'showLow'],
)
assert.equal(session.getComponentProperty('level'), 125)
assert.equal(session.getComponentProperty('label'), 'high')

// One external source change propagates level -> label before Behavior runs.
// Only final Property values are exposed to the host.
sourceValues.set('outlet-01:pressure', 0.5)
result = session.sourcePropertyChanged('outlet-01', 'pressure')
assert.deepEqual(
  result.valueUpdates.map((entry) => [entry.property, entry.value]),
  [
    ['level', 50],
    ['label', 'low'],
  ],
)
assert.deepEqual(
  result.componentActions.map((entry) => entry.action),
  ['showLow'],
)
assert.equal(session.getComponentProperty('label'), 'low')

// Repeating the same value reaches a no-change fixed point: no downstream
// propagation and no one-shot Behavior replay.
result = session.sourcePropertyChanged('outlet-01', 'pressure')
assert.deepEqual(result.valueUpdates, [])
assert.deepEqual(result.componentActions, [])

// A host-owned Component Property can seed the same reverse index without the
// session taking ownership of that external Property value.
baseComponentValues.set('manual', true)
result = session.componentPropertyChanged('manual')
assert.deepEqual(result.valueUpdates, [])
assert.deepEqual(
  result.componentActions.map((entry) => entry.action),
  ['showManual'],
)

// Component Event evaluation reads the fully propagated current Property value
// and still returns a host-owned Device Action effect only.
let interaction = session.componentEvent('startRequested')
assert.deepEqual(interaction.diagnostics, [])
assert.deepEqual(interaction.deviceActions, [
  {
    interactionId: 'interaction:5',
    sourceId: 'pump-02',
    action: 'start',
    arguments: [50],
  },
])

// Rebinding changes only Primary Device Context. The compiled DSL/index is
// reused, branch state resets, and declarative state is rebuilt for pump-03.
result = session.rebindPrimaryDevice({ deviceId: 'pump-03' })
assert.equal(session.getPrimaryDevice()?.deviceId, 'pump-03')
assert.deepEqual(
  result.valueUpdates.map((entry) => [entry.property, entry.value]),
  [['state', 'stopped']],
)
interaction = session.componentEvent('startRequested')
assert.equal(interaction.deviceActions[0]?.sourceId, 'pump-03')

// Cycles are structural errors, not a runtime race. Cyclic bindings are
// isolated before propagation while unrelated bindings remain evaluable.
const cyclicCompiled = compile(`
component.a = component.b
component.b = not component.a
component.level = outlet.pressure * 100
`)
const cyclicSession = createScadaDslPropagationSession(cyclicCompiled, {
  readSourceValue(sourceId, property) {
    return sourceValues.get(`${sourceId}:${property}`)
  },
  readComponentBaseProperty(property) {
    return baseComponentValues.get(property)
  },
})
assert.equal(cyclicSession.getStructuralDiagnostics().length, 2)
const cyclicInitial = cyclicSession.initialize()
assert.equal(cyclicInitial.aborted, false)
assert.equal(
  cyclicInitial.diagnostics.filter((diagnostic) => diagnostic.kind === 'cycle').length,
  2,
)
assert.deepEqual(cyclicInitial.valueUpdates, [
  { bindingId: 'value:2', property: 'level', value: 50 },
])

cyclicSession.dispose()
assert.throws(() => cyclicSession.initialize(), /已释放/)
session.dispose()

console.log(
  'SCADA DSL propagation session checks passed: host-owned sessions propagate Value Bindings to a stable fixed point before Behavior evaluation, suppress no-change replay, route Component Property/Event updates through compiled indexes, rebind Primary Device without recompilation, and isolate cyclic Property dependencies before runtime.',
)
