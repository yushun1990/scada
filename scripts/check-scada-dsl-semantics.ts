import assert from 'node:assert/strict'
import type { ComponentDefinition, ComponentScalarValue } from '../src/component-system/definition'
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
    stopRequested: { title: 'Stop requested' },
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
    actions: {},
  },
  {
    sourceId: 'valve-09',
    title: 'Outlet valve',
    symbol: 'valve',
    properties: {
      opening: { title: 'Opening', kind: 'number', defaultValue: 0 },
    },
    actions: {
      close: { title: 'Close' },
    },
  },
])

const parsed = parseScadaDsl(`
component.state = if device.fault then "fault" else if device.running then "running" else "stopped"
component.level = outlet.pressure * 100

if device.fault and outlet.pressure > 1.2 {
  component.showFault()
}
else if device.running {
  component.showRunning()
}
else {
  component.showStopped()
}

on component.startRequested {
  device.start()
}

on component.stopRequested {
  valve.close()
}
`)
assert.deepEqual(parsed.diagnostics, [])
assert.ok(parsed.program)

const lowered = lowerScadaDslProgram(parsed.program!, catalog)
assert.deepEqual(lowered.diagnostics, [])
assert.ok(lowered.plan)
assert.equal(lowered.plan!.valueBindings.length, 2)
assert.equal(lowered.plan!.behaviors.length, 1)
assert.equal(lowered.plan!.interactions.length, 2)

const stateBinding = lowered.plan!.valueBindings[0]!
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
}

const levelBinding = lowered.plan!.valueBindings[1]!
assert.equal(levelBinding.targetProperty, 'level')
assert.equal(levelBinding.expression.kind, 'binary')
if (levelBinding.expression.kind === 'binary') {
  assert.equal(levelBinding.expression.left.kind, 'reference')
  if (levelBinding.expression.left.kind === 'reference') {
    assert.deepEqual(levelBinding.expression.left.reference, {
      kind: 'source-property',
      reference: {
        scope: 'external',
        sourceId: 'outlet-pressure',
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

const stopInteraction = lowered.plan!.interactions[1]!
assert.equal(stopInteraction.event, 'stopRequested')
assert.deepEqual(stopInteraction.action.target, {
  scope: 'external',
  sourceId: 'valve-09',
  action: 'close',
})

// The primary-device editor symbol must not capture the concrete device that
// happened to be selected while authoring; copy/rebind only swaps the context.
assert.doesNotMatch(JSON.stringify(lowered.plan), /pump-01/)
assert.match(JSON.stringify(lowered.plan), /outlet-pressure/)
assert.match(JSON.stringify(lowered.plan), /valve-09/)

const values = new Map<string, ComponentScalarValue>([
  ['pump-02:fault', true],
  ['pump-02:running', true],
  ['pump-02:pressure', 0.7],
  ['outlet-pressure:pressure', 1.3],
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

// Repeated telemetry may change values while the same ordered branch remains
// active; this must not replay a one-shot Component Action.
values.set('outlet-pressure:pressure', 1.6)
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

values.set('outlet-pressure:pressure', 0.2)
next = selectScadaDslBehaviorBranch(behavior, context)
assert.equal(next?.id, active?.id)
assert.equal(
  shouldFireScadaDslBehaviorBranch(active?.id ?? null, next?.id ?? null),
  false,
)

values.set('pump-02:running', false)
next = selectScadaDslBehaviorBranch(behavior, context)
assert.equal(next?.id, 'behavior:2:branch:2')
assert.equal(
  shouldFireScadaDslBehaviorBranch(active?.id ?? null, next?.id ?? null),
  true,
)

const noElse = parseScadaDsl(`
if device.fault {
  component.pulse()
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

const directDeviceAction = parseScadaDsl('device.start()')
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
if device.fault {
  device.stop()
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
  /设备 Action 必须由显式 UI\/Event Interaction 触发/,
)

const imperativeProperty = parseScadaDsl(`
if device.fault {
  component.state = "fault"
}
`)
assert.ok(imperativeProperty.program)
const imperativePropertyResult = lowerScadaDslProgram(
  imperativeProperty.program!,
  catalog,
)
assert.equal(imperativePropertyResult.plan, null)
assert.match(
  imperativePropertyResult.diagnostics[0]?.message ?? '',
  /声明式 Value Binding/,
)

const invalidTarget = parseScadaDsl('device.pressure = component.level')
assert.ok(invalidTarget.program)
const invalidTargetResult = lowerScadaDslProgram(
  invalidTarget.program!,
  catalog,
)
assert.equal(invalidTargetResult.plan, null)
assert.match(
  invalidTargetResult.diagnostics[0]?.message ?? '',
  /左侧必须是当前组件公开的 Component Property/,
)

const invalidInteractionSource = parseScadaDsl(`
on device.fault {
  device.stop()
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
  /必须是当前组件公开的 Component Event/,
)

const componentActionAsExternal = parseScadaDsl(`
on component.startRequested {
  component.showRunning()
}
`)
assert.ok(componentActionAsExternal.program)
const componentActionAsExternalResult = lowerScadaDslProgram(
  componentActionAsExternal.program!,
  catalog,
)
assert.equal(componentActionAsExternalResult.plan, null)
assert.match(
  componentActionAsExternalResult.diagnostics[0]?.message ?? '',
  /目标必须是主设备或显式外部设备公开的 Action/,
)

const multiActionInteraction = parseScadaDsl(`
on component.startRequested {
  device.start()
  device.stop()
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
  /只绑定一个设备 Action/,
)

console.log(
  'SCADA DSL semantic checks passed: DSL lowers into structured Value/Behavior/Interaction plans, primary-device references remain copy/rebind-safe, ordered if/else fires Component Actions only on branch entry, repeated telemetry does not replay actions, explicit Component Events may invoke one primary/external device Action, and data-driven device automation is rejected.',
)
