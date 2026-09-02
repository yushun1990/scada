import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import {
  createScadaDslCapabilityCatalog,
  getScadaDslCompletionItems,
  getScadaDslInsertText,
  parseScadaDsl,
  type ScadaDslCaseStatement,
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
  attributes: {
    runningColor: {
      title: 'Running color',
      kind: 'color',
      defaultValue: '#00c853',
    },
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
if $device.fault {
  $self.state = "fault"
} else if $device.running {
  $self.state = "running"
} else {
  $self.state = "stopped"
}
$self.level = $device.pressure * 100
`)
assert.deepEqual(valueProgram.diagnostics, [])
assert.equal(valueProgram.program?.statements.length, 2)
const firstStatement = valueProgram.program?.statements[0]
assert.equal(firstStatement?.kind, 'if')
if (firstStatement?.kind === 'if') {
  assert.deepEqual(firstStatement.condition, {
    kind: 'reference',
    path: ['$device', 'fault'],
    span: firstStatement.condition.span,
  })
  assert.equal(firstStatement.consequent[0]?.kind, 'assignment')
  assert.equal(firstStatement.alternate?.[0]?.kind, 'if')
}
const directAssignment = valueProgram.program?.statements[1]
assert.equal(directAssignment?.kind, 'assignment')
if (directAssignment?.kind === 'assignment') {
  assert.deepEqual(directAssignment.target.path, ['$self', 'level'])
}

const behaviorProgram = parseScadaDsl(`
if $device.fault and $device.pressure > 1.2 {
  $self.showFault()
} else if $device.running {
  $self.showRunning()
} else {
  $self.showStopped()
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

const caseProgram = parseScadaDsl(`
case $device.state {
  0: $self.state = "stopped"
  1: $self.state = "running"
  2: $self.state = "fault"
  _: $self.state = "stopped"
}
`)
assert.deepEqual(caseProgram.diagnostics, [])
assert.equal(caseProgram.program?.statements.length, 1)
const caseStatement = caseProgram.program?.statements[0] as ScadaDslCaseStatement
assert.equal(caseStatement.kind, 'case')
assert.deepEqual(caseStatement.expression.path, ['$device', 'state'])
assert.equal(caseStatement.arms.length, 4)
assert.equal(caseStatement.arms.at(-1)?.pattern.kind, 'wildcard')
assert.equal(caseStatement.arms[0]?.body[0]?.kind, 'assignment')

const multiStatementCase = parseScadaDsl(`
case $device.mode {
  "auto": {
    $self.state = "running"
    $self.level = 100
  }
  _: {
    $self.state = "stopped"
    $self.level = 0
  }
}
`)
assert.deepEqual(multiStatementCase.diagnostics, [])

const fallbackNotLast = parseScadaDsl(`
case $device.state {
  _: $self.state = "stopped"
  1: $self.state = "running"
}
`)
assert.equal(fallbackNotLast.program, null)
assert.match(fallbackNotLast.diagnostics[0]?.message ?? '', /最后一个 arm/)

const interactionProgram = parseScadaDsl(`
on $self.startRequested {
  $device.start()
}
`)
assert.deepEqual(interactionProgram.diagnostics, [])
assert.equal(interactionProgram.program?.statements.length, 1)
const onStatement = interactionProgram.program?.statements[0]
assert.equal(onStatement?.kind, 'on')
if (onStatement?.kind === 'on') {
  assert.deepEqual(onStatement.event.path, ['$self', 'startRequested'])
  assert.equal(onStatement.body.length, 1)
  assert.equal(onStatement.body[0]?.kind, 'call-statement')
}

const directActions = parseScadaDsl(`
$device.start()
$self.setLevel($device.pressure * 100)
`)
assert.deepEqual(directActions.diagnostics, [])
assert.equal(directActions.program?.statements.length, 2)
const deviceAction = directActions.program?.statements[0]
assert.equal(deviceAction?.kind, 'call-statement')
if (deviceAction?.kind === 'call-statement') {
  assert.deepEqual(deviceAction.call.callee.path, ['$device', 'start'])
  assert.deepEqual(deviceAction.call.arguments, [])
}

const comments = parseScadaDsl(`
# label clicks may insert the references below
$self.level = $device.pressure // ordinary inline comment
`)
assert.deepEqual(comments.diagnostics, [])
assert.equal(comments.program?.statements.length, 1)

const malformed = parseScadaDsl('if $device.fault { $self.showFault()')
assert.equal(malformed.program, null)
assert.match(malformed.diagnostics[0]?.message ?? '', /缺少 }/)

const unsupportedLoop = parseScadaDsl('while $device.running { $self.showRunning() }')
assert.equal(unsupportedLoop.program, null)
assert.match(unsupportedLoop.diagnostics[0]?.message ?? '', /只允许 \$self 与 \$device/)

const legacyRoot = parseScadaDsl('component.state = device.state')
assert.equal(legacyRoot.program, null)
assert.match(legacyRoot.diagnostics[0]?.message ?? '', /只允许 \$self 与 \$device/)

const arbitraryRoot = parseScadaDsl('$outlet.pressure = $device.pressure')
assert.equal(arbitraryRoot.program, null)
assert.match(arbitraryRoot.diagnostics[0]?.message ?? '', /只允许 \$self 与 \$device/)

const expressionIf = parseScadaDsl(
  '$self.state = if $device.fault then "fault" else "stopped"',
)
assert.equal(expressionIf.program, null)
assert.ok((expressionIf.diagnostics[0]?.message.length ?? 0) > 0)

const bareReference = parseScadaDsl('$self.state')
assert.equal(bareReference.program, null)
assert.match(bareReference.diagnostics[0]?.message ?? '', /赋值、Action 调用、if、case 或 on Event/)

const catalog = createScadaDslCapabilityCatalog(component, [
  {
    sourceId: 'pump-01',
    title: 'Pump 01',
    symbol: 'legacy-device-name-is-ignored',
    properties: {
      running: { title: 'Running', kind: 'boolean', defaultValue: false },
      fault: { title: 'Fault', kind: 'boolean', defaultValue: false },
      pressure: { title: 'Pressure', kind: 'number', defaultValue: 0 },
      state: { title: 'State', kind: 'number', defaultValue: 0 },
      mode: { title: 'Mode', kind: 'string', defaultValue: 'auto' },
    },
    actions: {
      start: { title: 'Start' },
      stop: { title: 'Stop' },
    },
  },
])

assert.throws(
  () => createScadaDslCapabilityCatalog(component, [
    {
      sourceId: 'pump-01',
      title: 'Pump 01',
      properties: {},
      actions: {},
    },
    {
      sourceId: 'pump-02',
      title: 'Pump 02',
      properties: {},
      actions: {},
    },
  ]),
  /只允许一个绑定设备/,
)

const selfCompletion = getScadaDslCompletionItems(
  'if $device.fault { $self.sh',
  'if $device.fault { $self.sh'.length,
  catalog,
)
assert.equal(selfCompletion.replacement.start, 'if $device.fault { $self.'.length)
assert.deepEqual(
  selfCompletion.items.map((item) => item.member),
  ['showFault', 'showRunning', 'showStopped'],
)
assert.equal(
  getScadaDslInsertText(selfCompletion.items[0]!),
  '$self.showFault()',
)

const deviceCompletion = getScadaDslCompletionItems(
  '$self.level = $device.pr',
  '$self.level = $device.pr'.length,
  catalog,
)
assert.deepEqual(deviceCompletion.items.map((item) => item.member), ['pressure'])
assert.equal(getScadaDslInsertText(deviceCompletion.items[0]!), '$device.pressure')

const rootCompletion = getScadaDslCompletionItems('$', 1, catalog)
assert.deepEqual(
  [...new Set(rootCompletion.items.map((item) => item.symbol))],
  ['$self', '$device'],
)

const componentEvent = catalog.items.find(
  (item) => item.symbol === '$self' && item.member === 'startRequested',
)
assert.equal(componentEvent?.capabilityKind, 'event')
assert.equal(getScadaDslInsertText(componentEvent!), '$self.startRequested')

assert.equal(
  catalog.items.some((item) => item.member === 'runningColor'),
  false,
  'Attributes are not Scene DSL capabilities',
)

console.log(
  'SCADA DSL v1 checks passed: only $self/$device roots are accepted, one-device capability discovery ignores legacy source symbols, statement-if requires braces, case supports scalar arms with final _ fallback, expression-if/arbitrary roots are rejected, Attributes stay outside Scene DSL capabilities, and completion/click-to-insert emits the frozen v1 surface.',
)
