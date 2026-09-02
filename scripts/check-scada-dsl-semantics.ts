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
  evaluateScadaDslSemanticExpression,
  lowerScadaDslProgram,
  selectScadaDslBehaviorBranch,
  shouldFireScadaDslBehaviorBranch,
  type ScadaDslEvaluationContext,
} from '../src/scene/scada-dsl-semantics'

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
      state: { title: 'State', kind: 'number', defaultValue: 0 },
      mode: { title: 'Mode', kind: 'string', defaultValue: 'manual' },
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

if $device.fault and $device.pressure > 1.2 {
  $self.showFault()
} else if $device.running {
  $self.showRunning()
} else {
  $self.showStopped()
}

on $self.startRequested {
  $device.start()
}
`)
assert.deepEqual(parsed.diagnostics, [])
assert.ok(parsed.program)

const lowered = lowerScadaDslProgram(parsed.program!, catalog)
assert.deepEqual(lowered.diagnostics, [])
assert.ok(lowered.plan)
assert.equal(lowered.plan!.valueBindings.length, 2)
assert.equal(lowered.plan!.behaviors.length, 1)
assert.equal(lowered.plan!.interactions.length, 1)

const stateBinding = lowered.plan!.valueBindings[0]!
assert.equal(stateBinding.id, 'value:0:state')
assert.equal(stateBinding.targetProperty, 'state')
assert.equal(stateBinding.expression.kind, 'conditional')
if (stateBinding.expression.kind === 'conditional') {
  assert.equal(stateBinding.expression.condition.kind, 'reference')
  if (stateBinding.expression.condition.kind === 'reference') {
    assert.deepEqual(stateBinding.expression.condition.reference, {
      kind: 'source-property',
      reference: {
        scope: 'primary-device',
        property: 'fault',
      },
    })
  }
  assert.equal(stateBinding.expression.alternate.kind, 'conditional')
}

const levelBinding = lowered.plan!.valueBindings[1]!
assert.equal(levelBinding.id, 'value:1')
assert.equal(levelBinding.targetProperty, 'level')
assert.equal(levelBinding.expression.kind, 'binary')
if (levelBinding.expression.kind === 'binary') {
  assert.equal(levelBinding.expression.left.kind, 'reference')
  if (levelBinding.expression.left.kind === 'reference') {
    assert.deepEqual(levelBinding.expression.left.reference, {
      kind: 'source-property',
      reference: {
        scope: 'primary-device',
        property: 'pressure',
      },
    })
  }
}

const startInteraction = lowered.plan!.interactions[0]!
assert.equal(startInteraction.event, 'startRequested')
assert.deepEqual(startInteraction.action.target, {
  scope: 'primary-device',
  action: 'start',
})

// `$device` is a relative binding. The concrete device selected while authoring
// must never leak into the structured semantic plan.
assert.doesNotMatch(JSON.stringify(lowered.plan), /authoring-device/)

const values = new Map<string, ComponentScalarValue>([
  ['pump-02:fault', true],
  ['pump-02:running', true],
  ['pump-02:pressure', 1.3],
  ['pump-02:mode', 'auto'],
  ['pump-02:state', 1],
])
const componentValues = new Map<string, ComponentScalarValue>([
  ['state', 'stopped'],
  ['level', 0],
])

const context: ScadaDslEvaluationContext = {
  primaryDevice: { deviceId: 'pump-02' },
  readSourceValue(sourceId, property) {
    return values.get(`${sourceId}:${property}`)
  },
  readComponentProperty(property) {
    return componentValues.get(property)
  },
}

assert.equal(
  evaluateScadaDslSemanticExpression(stateBinding.expression, context),
  'fault',
)
assert.equal(
  evaluateScadaDslSemanticExpression(levelBinding.expression, context),
  130,
)

const behavior = lowered.plan!.behaviors[0]!
assert.equal(behavior.branches.length, 3)
assert.deepEqual(
  behavior.branches.map((branch) => branch.actions.map((action) => action.action)),
  [['showFault'], ['showRunning'], ['showStopped']],
)

let active = selectScadaDslBehaviorBranch(behavior, context)
assert.equal(active?.id, 'behavior:2:branch:0')
assert.equal(shouldFireScadaDslBehaviorBranch(null, active?.id ?? null), true)
assert.equal(
  shouldFireScadaDslBehaviorBranch(active?.id ?? null, active?.id ?? null),
  false,
)

// Repeated telemetry inside one active branch must not replay one-shot actions.
values.set('pump-02:pressure', 1.6)
let next = selectScadaDslBehaviorBranch(behavior, context)
assert.equal(next?.id, active?.id)
assert.equal(
  shouldFireScadaDslBehaviorBranch(active?.id ?? null, next?.id ?? null),
  false,
)

values.set('pump-02:fault', false)
next = selectScadaDslBehaviorBranch(behavior, context)
assert.equal(next?.id, 'behavior:2:branch:1')
assert.equal(
  shouldFireScadaDslBehaviorBranch(active?.id ?? null, next?.id ?? null),
  true,
)
active = next

values.set('pump-02:running', false)
next = selectScadaDslBehaviorBranch(behavior, context)
assert.equal(next?.id, 'behavior:2:branch:2')
assert.equal(
  shouldFireScadaDslBehaviorBranch(active?.id ?? null, next?.id ?? null),
  true,
)

const declarativeCase = parseScadaDsl(`
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
assert.deepEqual(declarativeCase.diagnostics, [])
assert.ok(declarativeCase.program)
const declarativeCaseResult = lowerScadaDslProgram(declarativeCase.program!, catalog)
assert.deepEqual(declarativeCaseResult.diagnostics, [])
assert.ok(declarativeCaseResult.plan)
assert.equal(declarativeCaseResult.plan!.valueBindings.length, 2)
assert.equal(declarativeCaseResult.plan!.behaviors.length, 0)
const caseState = declarativeCaseResult.plan!.valueBindings.find(
  (binding) => binding.targetProperty === 'state',
)!
const caseLevel = declarativeCaseResult.plan!.valueBindings.find(
  (binding) => binding.targetProperty === 'level',
)!
assert.equal(
  evaluateScadaDslSemanticExpression(caseState.expression, context),
  'running',
)
assert.equal(
  evaluateScadaDslSemanticExpression(caseLevel.expression, context),
  100,
)
values.set('pump-02:mode', 'manual')
assert.equal(
  evaluateScadaDslSemanticExpression(caseState.expression, context),
  'stopped',
)
assert.equal(
  evaluateScadaDslSemanticExpression(caseLevel.expression, context),
  0,
)

const behaviorCase = parseScadaDsl(`
case $device.state {
  0: $self.showStopped()
  1: $self.showRunning()
  _: $self.showFault()
}
`)
assert.deepEqual(behaviorCase.diagnostics, [])
assert.ok(behaviorCase.program)
const behaviorCaseResult = lowerScadaDslProgram(behaviorCase.program!, catalog)
assert.deepEqual(behaviorCaseResult.diagnostics, [])
assert.ok(behaviorCaseResult.plan)
assert.equal(behaviorCaseResult.plan!.behaviors.length, 1)
const caseBehavior = behaviorCaseResult.plan!.behaviors[0]!
assert.deepEqual(
  caseBehavior.branches.map((branch) => branch.actions[0]?.action),
  ['showStopped', 'showRunning', 'showFault'],
)
values.set('pump-02:state', 1)
assert.equal(
  selectScadaDslBehaviorBranch(caseBehavior, context)?.actions[0]?.action,
  'showRunning',
)
values.set('pump-02:state', 99)
assert.equal(
  selectScadaDslBehaviorBranch(caseBehavior, context)?.actions[0]?.action,
  'showFault',
)

const noElse = parseScadaDsl(`
if $device.fault {
  $self.pulse()
}
`)
assert.ok(noElse.program)
const noElsePlan = lowerScadaDslProgram(noElse.program!, catalog)
assert.ok(noElsePlan.plan)
const noElseBehavior = noElsePlan.plan!.behaviors[0]!
values.set('pump-02:fault', true)
const entered = selectScadaDslBehaviorBranch(noElseBehavior, context)
assert.ok(entered)
values.set('pump-02:fault', false)
const left = selectScadaDslBehaviorBranch(noElseBehavior, context)
assert.equal(left, null)
assert.equal(
  shouldFireScadaDslBehaviorBranch(entered?.id ?? null, left?.id ?? null),
  false,
)

const nonExhaustiveAssignment = parseScadaDsl(`
if $device.fault {
  $self.state = "fault"
}
`)
assert.ok(nonExhaustiveAssignment.program)
const nonExhaustiveAssignmentResult = lowerScadaDslProgram(
  nonExhaustiveAssignment.program!,
  catalog,
)
assert.equal(nonExhaustiveAssignmentResult.plan, null)
assert.match(
  nonExhaustiveAssignmentResult.diagnostics[0]?.message ?? '',
  /必须有 else/,
)

const incompleteCaseAssignment = parseScadaDsl(`
case $device.mode {
  "auto": {
    $self.state = "running"
    $self.level = 100
  }
  _: $self.state = "stopped"
}
`)
assert.ok(incompleteCaseAssignment.program)
const incompleteCaseAssignmentResult = lowerScadaDslProgram(
  incompleteCaseAssignment.program!,
  catalog,
)
assert.equal(incompleteCaseAssignmentResult.plan, null)
assert.match(
  incompleteCaseAssignmentResult.diagnostics[0]?.message ?? '',
  /同一组 \$self Properties/,
)

const mixedControl = parseScadaDsl(`
if $device.fault {
  $self.state = "fault"
} else {
  $self.showStopped()
}
`)
assert.ok(mixedControl.program)
const mixedControlResult = lowerScadaDslProgram(mixedControl.program!, catalog)
assert.equal(mixedControlResult.plan, null)
assert.match(
  mixedControlResult.diagnostics[0]?.message ?? '',
  /不能混合声明式 Property 赋值与命令式 Component Action/,
)

const directDeviceAction = parseScadaDsl('$device.start()')
assert.ok(directDeviceAction.program)
const directDeviceActionResult = lowerScadaDslProgram(
  directDeviceAction.program!,
  catalog,
)
assert.equal(directDeviceActionResult.plan, null)
assert.match(
  directDeviceActionResult.diagnostics[0]?.message ?? '',
  /没有明确触发时机/,
)

const deviceAutomation = parseScadaDsl(`
if $device.fault {
  $device.stop()
}
`)
assert.ok(deviceAutomation.program)
const deviceAutomationResult = lowerScadaDslProgram(
  deviceAutomation.program!,
  catalog,
)
assert.equal(deviceAutomationResult.plan, null)
assert.match(
  deviceAutomationResult.diagnostics[0]?.message ?? '',
  /\$device Action 必须由 on/,
)

const invalidTarget = parseScadaDsl('$device.pressure = $self.level')
assert.ok(invalidTarget.program)
const invalidTargetResult = lowerScadaDslProgram(
  invalidTarget.program!,
  catalog,
)
assert.equal(invalidTargetResult.plan, null)
assert.match(
  invalidTargetResult.diagnostics[0]?.message ?? '',
  /左侧必须是 \$self 的公开 Property/,
)

const attributeTarget = parseScadaDsl('$self.runningColor = $device.mode')
assert.ok(attributeTarget.program)
const attributeTargetResult = lowerScadaDslProgram(attributeTarget.program!, catalog)
assert.equal(attributeTargetResult.plan, null)
assert.match(
  attributeTargetResult.diagnostics[0]?.message ?? '',
  /找不到能力 \$self\.runningColor/,
)

const invalidInteractionSource = parseScadaDsl(`
on $device.fault {
  $device.stop()
}
`)
assert.ok(invalidInteractionSource.program)
const invalidInteractionSourceResult = lowerScadaDslProgram(
  invalidInteractionSource.program!,
  catalog,
)
assert.equal(invalidInteractionSourceResult.plan, null)
assert.match(
  invalidInteractionSourceResult.diagnostics[0]?.message ?? '',
  /必须是 \$self 的公开 Component Event/,
)

const componentActionAsDevice = parseScadaDsl(`
on $self.startRequested {
  $self.showRunning()
}
`)
assert.ok(componentActionAsDevice.program)
const componentActionAsDeviceResult = lowerScadaDslProgram(
  componentActionAsDevice.program!,
  catalog,
)
assert.equal(componentActionAsDeviceResult.plan, null)
assert.match(
  componentActionAsDeviceResult.diagnostics[0]?.message ?? '',
  /目标必须是 \$device 的公开 Action/,
)

const multiActionInteraction = parseScadaDsl(`
on $self.startRequested {
  $device.start()
  $device.stop()
}
`)
assert.ok(multiActionInteraction.program)
const multiActionInteractionResult = lowerScadaDslProgram(
  multiActionInteraction.program!,
  catalog,
)
assert.equal(multiActionInteractionResult.plan, null)
assert.match(
  multiActionInteractionResult.diagnostics[0]?.message ?? '',
  /只绑定一个 \$device Action/,
)

console.log(
  'SCADA DSL v1 semantic checks passed: $self/$device lower to stable component/primary-device references, braced if and case can produce exhaustive declarative Value Bindings, action-only if/case preserve branch-entry Behavior semantics, Component Events invoke only the bound $device Action, Attributes and device-side assignments fail closed, and no concrete authoring device id leaks into persisted semantics.',
)
