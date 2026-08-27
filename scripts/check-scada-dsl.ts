import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import {
  createScadaDslCapabilityCatalog,
  getScadaDslCompletionItems,
  getScadaDslInsertText,
  parseScadaDsl,
  type ScadaDslIfStatement,
} from '../src/scene/scada-dsl'

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
  },
  actions: {
    showFault: { title: 'Show fault' },
    showRunning: { title: 'Show running' },
    showStopped: { title: 'Show stopped' },
    setLevel: { title: 'Set level' },
  },
  events: {
    startRequested: { title: 'Start requested' },
  },
  anchors: [],
}

const valueProgram = parseScadaDsl(`
component.state = if device.fault then "fault" else if device.running then "running" else "stopped"
component.level = device.pressure * 100
`)
assert.deepEqual(valueProgram.diagnostics, [])
assert.equal(valueProgram.program?.statements.length, 2)
const firstAssignment = valueProgram.program?.statements[0]
assert.equal(firstAssignment?.kind, 'assignment')
if (firstAssignment?.kind === 'assignment') {
  assert.deepEqual(firstAssignment.target.path, ['component', 'state'])
  assert.equal(firstAssignment.value.kind, 'conditional')
  if (firstAssignment.value.kind === 'conditional') {
    assert.equal(firstAssignment.value.alternate.kind, 'conditional')
  }
}

const behaviorProgram = parseScadaDsl(`
if device.fault and device.pressure > 1.2 {
  component.showFault()
} else if device.running {
  component.showRunning()
} else {
  component.showStopped()
}
`)
assert.deepEqual(behaviorProgram.diagnostics, [])
assert.equal(behaviorProgram.program?.statements.length, 1)
const ifStatement = behaviorProgram.program?.statements[0] as ScadaDslIfStatement
assert.equal(ifStatement.kind, 'if')
assert.equal(ifStatement.condition.kind, 'binary')
if (ifStatement.condition.kind === 'binary') {
  assert.equal(ifStatement.condition.operator, 'and')
}
assert.equal(ifStatement.consequent[0]?.kind, 'call-statement')
assert.equal(ifStatement.alternate?.[0]?.kind, 'if')

const directActions = parseScadaDsl(`
device.start()
component.setLevel(device.pressure * 100)
`)
assert.deepEqual(directActions.diagnostics, [])
assert.equal(directActions.program?.statements.length, 2)
const deviceAction = directActions.program?.statements[0]
assert.equal(deviceAction?.kind, 'call-statement')
if (deviceAction?.kind === 'call-statement') {
  assert.deepEqual(deviceAction.call.callee.path, ['device', 'start'])
  assert.deepEqual(deviceAction.call.arguments, [])
}

const comments = parseScadaDsl(`
# label clicks may insert the references below
component.level = device.pressure // ordinary inline comment
`)
assert.deepEqual(comments.diagnostics, [])
assert.equal(comments.program?.statements.length, 1)

const malformed = parseScadaDsl('if device.fault { component.showFault()')
assert.equal(malformed.program, null)
assert.match(malformed.diagnostics[0]?.message ?? '', /缺少 }/)

const unsupportedLoop = parseScadaDsl('while device.running { component.showRunning() }')
assert.equal(unsupportedLoop.program, null)
assert.ok((unsupportedLoop.diagnostics[0]?.message.length ?? 0) > 0)

const bareReference = parseScadaDsl('component.state')
assert.equal(bareReference.program, null)
assert.match(bareReference.diagnostics[0]?.message ?? '', /赋值、Action 调用或 if\/else/)

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
    sourceId: 'pressure-outlet',
    title: 'Outlet pressure',
    symbol: 'outlet',
    properties: {
      pressure: { title: 'Pressure', kind: 'number', defaultValue: 0 },
    },
    actions: {},
  },
])

const componentCompletion = getScadaDslCompletionItems(
  'if device.fault { component.sh',
  'if device.fault { component.sh'.length,
  catalog,
)
assert.equal(componentCompletion.replacement.start, 'if device.fault { component.'.length)
assert.deepEqual(
  componentCompletion.items.map((item) => item.member),
  ['showFault', 'showRunning', 'showStopped'],
)
assert.equal(
  getScadaDslInsertText(componentCompletion.items[0]!),
  'component.showFault()',
)

const deviceCompletion = getScadaDslCompletionItems(
  'component.level = device.pr',
  'component.level = device.pr'.length,
  catalog,
)
assert.deepEqual(deviceCompletion.items.map((item) => item.member), ['pressure'])
assert.equal(getScadaDslInsertText(deviceCompletion.items[0]!), 'device.pressure')

const externalTag = catalog.items.find(
  (item) => item.symbol === 'outlet' && item.member === 'pressure',
)
assert.ok(externalTag)
assert.equal(getScadaDslInsertText(externalTag!), 'outlet.pressure')

const componentEvent = catalog.items.find(
  (item) => item.symbol === 'component' && item.member === 'startRequested',
)
assert.equal(componentEvent?.capabilityKind, 'event')

console.log(
  'SCADA DSL checks passed: the text-first surface supports direct Property assignment, expression if/else, action-oriented if/else blocks, direct Action calls, arithmetic/boolean expressions, parser diagnostics, completion candidates, and click-to-insert capability text without making DSL the persisted behavior model.',
)
