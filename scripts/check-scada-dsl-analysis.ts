import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import {
  createScadaDslCapabilityCatalog,
  parseScadaDsl,
} from '../src/scene/scada-dsl'
import {
  checkScadaDslTypes,
  extractScadaDslDependencies,
} from '../src/scene/scada-dsl-analysis'
import { lowerScadaDslProgram } from '../src/scene/scada-dsl-semantics'

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
    enabled: {
      title: 'Enabled',
      kind: 'boolean',
      defaultValue: false,
      bindable: true,
    },
  },
  actions: {
    showFault: { title: 'Show fault' },
    showRunning: { title: 'Show running' },
    pulse: { title: 'Pulse' },
  },
  events: {
    startRequested: { title: 'Start requested' },
  },
  anchors: [],
}

const catalog = createScadaDslCapabilityCatalog(component, [
  {
    sourceId: 'pump-01',
    title: 'Pump 01',
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
    sourceId: 'outlet-pressure',
    title: 'Outlet pressure',
    symbol: 'outlet',
    properties: {
      pressure: { title: 'Pressure', kind: 'number', defaultValue: 0 },
    },
    actions: {
      reset: { title: 'Reset' },
    },
  },
])

const valid = parseScadaDsl(`
component.state = if device.fault then "fault" else if device.running then "running" else "stopped"
component.level = outlet.pressure * 100
component.enabled = device.running and not device.fault

if device.fault and outlet.pressure > 1.2 {
  component.showFault(device.pressure)
} else if device.running {
  component.showRunning()
} else {
  component.pulse()
}

on component.startRequested {
  device.start(outlet.pressure)
}
`)
assert.deepEqual(valid.diagnostics, [])
assert.ok(valid.program)
assert.deepEqual(checkScadaDslTypes(valid.program!, catalog).diagnostics, [])

const invalidAssignment = parseScadaDsl('component.level = device.running')
assert.ok(invalidAssignment.program)
assert.match(
  checkScadaDslTypes(invalidAssignment.program!, catalog).diagnostics[0]?.message ?? '',
  /不能把 boolean 赋给 component\.level/,
)

const invalidCondition = parseScadaDsl(`
if device.pressure {
  component.pulse()
}
`)
assert.ok(invalidCondition.program)
assert.match(
  checkScadaDslTypes(invalidCondition.program!, catalog).diagnostics[0]?.message ?? '',
  /`if` 条件需要 boolean/,
)

const invalidArithmetic = parseScadaDsl('component.level = device.running + 1')
assert.ok(invalidArithmetic.program)
assert.match(
  checkScadaDslTypes(invalidArithmetic.program!, catalog).diagnostics[0]?.message ?? '',
  /`\+` 左侧需要 number/,
)

const invalidEquality = parseScadaDsl('component.enabled = device.running == 1')
assert.ok(invalidEquality.program)
assert.match(
  checkScadaDslTypes(invalidEquality.program!, catalog).diagnostics[0]?.message ?? '',
  /两侧类型不兼容/,
)

const invalidConditionalBranch = parseScadaDsl(
  'component.level = if device.fault then 1 else "bad"',
)
assert.ok(invalidConditionalBranch.program)
assert.match(
  checkScadaDslTypes(invalidConditionalBranch.program!, catalog).diagnostics[0]?.message ?? '',
  /不能把 number \| string 赋给 component\.level/,
)

const lowered = lowerScadaDslProgram(valid.program!, catalog)
assert.deepEqual(lowered.diagnostics, [])
assert.ok(lowered.plan)
const dependencies = extractScadaDslDependencies(lowered.plan!)

assert.deepEqual(dependencies.valueBindings[0], {
  id: 'value:0',
  triggerDependencies: [
    {
      kind: 'source-property',
      reference: { scope: 'primary-device', property: 'fault' },
    },
    {
      kind: 'source-property',
      reference: { scope: 'primary-device', property: 'running' },
    },
  ],
  readDependencies: [
    {
      kind: 'source-property',
      reference: { scope: 'primary-device', property: 'fault' },
    },
    {
      kind: 'source-property',
      reference: { scope: 'primary-device', property: 'running' },
    },
  ],
})

assert.deepEqual(dependencies.valueBindings[1], {
  id: 'value:1',
  triggerDependencies: [
    {
      kind: 'source-property',
      reference: {
        scope: 'external',
        sourceId: 'outlet-pressure',
        property: 'pressure',
      },
    },
  ],
  readDependencies: [
    {
      kind: 'source-property',
      reference: {
        scope: 'external',
        sourceId: 'outlet-pressure',
        property: 'pressure',
      },
    },
  ],
})

const behaviorDependencies = dependencies.behaviors[0]!
assert.deepEqual(behaviorDependencies.triggerDependencies, [
  {
    kind: 'source-property',
    reference: { scope: 'primary-device', property: 'fault' },
  },
  {
    kind: 'source-property',
    reference: {
      scope: 'external',
      sourceId: 'outlet-pressure',
      property: 'pressure',
    },
  },
  {
    kind: 'source-property',
    reference: { scope: 'primary-device', property: 'running' },
  },
])
assert.deepEqual(behaviorDependencies.readDependencies, [
  {
    kind: 'source-property',
    reference: { scope: 'primary-device', property: 'fault' },
  },
  {
    kind: 'source-property',
    reference: {
      scope: 'external',
      sourceId: 'outlet-pressure',
      property: 'pressure',
    },
  },
  {
    kind: 'source-property',
    reference: { scope: 'primary-device', property: 'pressure' },
  },
  {
    kind: 'source-property',
    reference: { scope: 'primary-device', property: 'running' },
  },
])

assert.deepEqual(dependencies.interactions[0], {
  id: 'interaction:4',
  event: 'startRequested',
  triggerDependencies: [],
  readDependencies: [
    {
      kind: 'source-property',
      reference: {
        scope: 'external',
        sourceId: 'outlet-pressure',
        property: 'pressure',
      },
    },
  ],
})

assert.doesNotMatch(JSON.stringify(dependencies), /pump-01/)

console.log(
  'SCADA DSL analysis checks passed: static typing rejects boolean/number misuse before runtime, select/string and numeric assignments remain explicit, and dependency extraction separates trigger dependencies from read-only Action argument dependencies while preserving primary-device rebinding.',
)
