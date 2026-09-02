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
    enabled: {
      title: 'Enabled',
      kind: 'boolean',
      defaultValue: false,
      bindable: true,
    },
  },
  actions: {
    showFault: {
      title: 'Show fault',
      parameters: [
        { name: 'pressure', title: 'Pressure', kind: 'number' },
      ],
    },
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
    sourceId: 'authoring-device',
    title: 'Primary device',
    properties: {
      running: { title: 'Running', kind: 'boolean', defaultValue: false },
      fault: { title: 'Fault', kind: 'boolean', defaultValue: false },
      pressure: { title: 'Pressure', kind: 'number', defaultValue: 0 },
      mode: { title: 'Mode', kind: 'string', defaultValue: 'auto' },
    },
    actions: {
      start: {
        title: 'Start',
        parameters: [
          { name: 'pressure', title: 'Pressure', kind: 'number' },
        ],
      },
      stop: { title: 'Stop' },
    },
  },
])

const valid = parseScadaDsl(`
if $device.fault {
  $self.state = "fault"
} else if $device.running {
  $self.state = "running"
} else {
  $self.state = "stopped"
}
$self.level = $device.pressure * 100
$self.enabled = $device.running and not $device.fault

if $device.fault and $device.pressure > 1.2 {
  $self.showFault($device.pressure)
} else if $device.running {
  $self.showRunning()
} else {
  $self.pulse()
}

on $self.startRequested {
  $device.start($device.pressure)
}
`)
assert.deepEqual(valid.diagnostics, [])
assert.ok(valid.program)
assert.deepEqual(checkScadaDslTypes(valid.program!, catalog).diagnostics, [])

const invalidAssignment = parseScadaDsl('$self.level = $device.running')
assert.ok(invalidAssignment.program)
assert.match(
  checkScadaDslTypes(invalidAssignment.program!, catalog).diagnostics[0]?.message ?? '',
  /不能把 boolean 赋给 \$self\.level/,
)

const invalidCondition = parseScadaDsl(`
if $device.pressure {
  $self.pulse()
}
`)
assert.ok(invalidCondition.program)
assert.match(
  checkScadaDslTypes(invalidCondition.program!, catalog).diagnostics[0]?.message ?? '',
  /`if` 条件需要 boolean/,
)

const invalidArithmetic = parseScadaDsl('$self.level = $device.running + 1')
assert.ok(invalidArithmetic.program)
assert.match(
  checkScadaDslTypes(invalidArithmetic.program!, catalog).diagnostics[0]?.message ?? '',
  /`\+` 左侧需要 number/,
)

const invalidEquality = parseScadaDsl('$self.enabled = $device.running == 1')
assert.ok(invalidEquality.program)
assert.match(
  checkScadaDslTypes(invalidEquality.program!, catalog).diagnostics[0]?.message ?? '',
  /两侧类型不兼容/,
)

const invalidBranchAssignment = parseScadaDsl(`
if $device.fault {
  $self.level = 1
} else {
  $self.level = "bad"
}
`)
assert.ok(invalidBranchAssignment.program)
assert.match(
  checkScadaDslTypes(invalidBranchAssignment.program!, catalog).diagnostics[0]?.message ?? '',
  /不能把 string 赋给 \$self\.level/,
)

const invalidCasePattern = parseScadaDsl(`
case $device.mode {
  1: $self.state = "running"
  _: $self.state = "stopped"
}
`)
assert.ok(invalidCasePattern.program)
assert.match(
  checkScadaDslTypes(invalidCasePattern.program!, catalog).diagnostics[0]?.message ?? '',
  /case arm 字面量类型 number.*string 不兼容/,
)

const invalidActionType = parseScadaDsl(`
if $device.fault {
  $self.showFault("bad")
}
`)
assert.ok(invalidActionType.program)
assert.match(
  checkScadaDslTypes(invalidActionType.program!, catalog).diagnostics[0]?.message ?? '',
  /Action \$self\.showFault 参数 1.*需要 number.*实际可能是 string/,
)

const invalidActionArity = parseScadaDsl(`
on $self.startRequested {
  $device.start()
}
`)
assert.ok(invalidActionArity.program)
assert.match(
  checkScadaDslTypes(invalidActionArity.program!, catalog).diagnostics[0]?.message ?? '',
  /Action \$device\.start 参数数量无效/,
)

const lowered = lowerScadaDslProgram(valid.program!, catalog)
assert.deepEqual(lowered.diagnostics, [])
assert.ok(lowered.plan)
const dependencies = extractScadaDslDependencies(lowered.plan!)

assert.deepEqual(dependencies.valueBindings[0], {
  id: 'value:0:state',
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
      reference: { scope: 'primary-device', property: 'pressure' },
    },
  ],
  readDependencies: [
    {
      kind: 'source-property',
      reference: { scope: 'primary-device', property: 'pressure' },
    },
  ],
})

assert.deepEqual(dependencies.valueBindings[2], {
  id: 'value:2',
  triggerDependencies: [
    {
      kind: 'source-property',
      reference: { scope: 'primary-device', property: 'running' },
    },
    {
      kind: 'source-property',
      reference: { scope: 'primary-device', property: 'fault' },
    },
  ],
  readDependencies: [
    {
      kind: 'source-property',
      reference: { scope: 'primary-device', property: 'running' },
    },
    {
      kind: 'source-property',
      reference: { scope: 'primary-device', property: 'fault' },
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
    reference: { scope: 'primary-device', property: 'pressure' },
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
      reference: { scope: 'primary-device', property: 'pressure' },
    },
  ],
})

assert.doesNotMatch(JSON.stringify(dependencies), /authoring-device/)
assert.doesNotMatch(JSON.stringify(dependencies), /source:external/)

console.log(
  'SCADA DSL v1 analysis checks passed: static typing covers $self Property assignments, braced branch assignments, case pattern compatibility and typed Action arguments; dependency extraction preserves read-vs-trigger ownership while all newly authored device references remain primary-device-relative and contain no concrete authoring source id.',
)
