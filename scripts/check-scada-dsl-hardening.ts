import assert from 'node:assert/strict'
import type {
  ComponentDefinition,
  ComponentScalarValue,
} from '../src/component-system/definition'
import {
  createScadaDslCapabilityCatalog,
  parseScadaDsl,
} from '../src/scene/scada-dsl'
import { compileScadaDslSource } from '../src/scene/scada-dsl-compiler'
import { createScadaDslPropagationSession } from '../src/scene/scada-dsl-propagation-session'
import { compileScadaDslRuntime } from '../src/scene/scada-dsl-runtime'
import { lowerScadaDslProgram } from '../src/scene/scada-dsl-semantics'

const component: ComponentDefinition = {
  type: 'test.hardening',
  title: 'Hardening test',
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
    level: {
      title: 'Level',
      kind: 'number',
      defaultValue: 7,
      bindable: true,
    },
    label: {
      title: 'Label',
      kind: 'string',
      defaultValue: 'low',
      bindable: true,
    },
    a: {
      title: 'A',
      kind: 'number',
      defaultValue: 0,
      bindable: true,
    },
    b: {
      title: 'B',
      kind: 'number',
      defaultValue: 0,
      bindable: true,
    },
  },
  actions: {
    showHigh: { title: 'Show high' },
    showLow: { title: 'Show low' },
  },
  events: {},
  anchors: [],
}

const catalog = createScadaDslCapabilityCatalog(component, [
  {
    sourceId: 'authoring-device',
    title: 'Primary device',
    properties: {
      level: { title: 'Level', kind: 'number', defaultValue: 0 },
    },
    actions: {},
  },
])

const validSource = `
$self.level = $device.level
if $self.level > 10 {
  $self.label = "high"
} else {
  $self.label = "low"
}

if $self.label == "high" {
  $self.showHigh()
} else {
  $self.showLow()
}
`

// The public compiler path performs the whole parse -> type analysis ->
// semantic lowering -> structural validation chain before runtime creation.
const validated = compileScadaDslSource(validSource, catalog)
assert.deepEqual(validated.diagnostics, [])
assert.ok(validated.program)
assert.ok(validated.plan)
assert.ok(validated.compiled)

// Declarative ownership is deterministic: two Value Bindings may not target
// the same Component Property. The validated compiler reports the structure
// error, and the lower-level runtime compiler independently refuses the same
// ambiguous semantic plan so internal callers cannot bypass the hard gate.
const duplicateSource = `
$self.level = $device.level
$self.level = $device.level + 1
`
const duplicate = compileScadaDslSource(duplicateSource, catalog)
assert.equal(duplicate.compiled, null)
assert.ok(
  duplicate.diagnostics.some(
    (diagnostic) =>
      diagnostic.phase === 'structure' &&
      diagnostic.message.includes('多个 Value Binding writer'),
  ),
)

const duplicateParsed = parseScadaDsl(duplicateSource)
assert.ok(duplicateParsed.program)
const duplicateLowered = lowerScadaDslProgram(duplicateParsed.program!, catalog)
assert.ok(duplicateLowered.plan)
assert.throws(
  () => compileScadaDslRuntime(duplicateLowered.plan!),
  /多个 Value Binding writer/,
)

// Cyclic derived Property graphs are also rejected by the validated source
// compiler before an executable runtime is constructed.
const cyclic = compileScadaDslSource(`
$self.a = $self.b
$self.b = $self.a
`, catalog)
assert.equal(cyclic.compiled, null)
assert.equal(
  cyclic.diagnostics.filter(
    (diagnostic) =>
      diagnostic.phase === 'structure' &&
      diagnostic.message.includes('循环依赖'),
  ).length,
  2,
)

const sourceValues = new Map<string, ComponentScalarValue>([
  ['pump-01:level', 42],
])
const baseValues = new Map<string, ComponentScalarValue>([
  ['level', 7],
  ['label', 'low'],
  ['a', 0],
  ['b', 0],
])

const createSession = () =>
  createScadaDslPropagationSession(validated.compiled!, {
    primaryDevice: { deviceId: 'pump-01' },
    readSourceValue(sourceId, property) {
      return sourceValues.get(`${sourceId}:${property}`)
    },
    readComponentBaseProperty(property) {
      return baseValues.get(property)
    },
  })

// Missing source data explicitly relinquishes the derived override. The
// effective Property falls back to the host base layer, downstream derivation
// settles against that fallback, and Behavior observes only the settled state.
const invalidationSession = createSession()
let result = invalidationSession.initialize()
assert.equal(result.aborted, false)
assert.equal(invalidationSession.getComponentProperty('level'), 42)
assert.equal(invalidationSession.getComponentProperty('label'), 'high')
assert.deepEqual(
  result.componentActions.map((effect) => effect.action),
  ['showHigh'],
)

sourceValues.delete('pump-01:level')
result = invalidationSession.sourcePropertyChanged('pump-01', 'level')
assert.equal(result.aborted, false)
assert.deepEqual(
  result.valueUpdates.map((update) => [update.property, update.value]),
  [
    ['level', undefined],
    ['label', 'low'],
  ],
)
assert.ok(
  result.diagnostics.some((diagnostic) =>
    diagnostic.message.includes('已释放 component.level 的派生覆盖'),
  ),
)
assert.equal(invalidationSession.getComponentProperty('level'), 7)
assert.equal(invalidationSession.getComponentProperty('label'), 'low')
assert.deepEqual(
  result.componentActions.map((effect) => effect.action),
  ['showLow'],
)
invalidationSession.dispose()

// Rebind derives from a fresh override map. If the new Primary Device lacks a
// required value, old-device derived values are invalidated rather than leaked.
sourceValues.set('pump-01:level', 42)
const rebindSession = createSession()
result = rebindSession.initialize()
assert.equal(result.aborted, false)
assert.equal(rebindSession.getComponentProperty('level'), 42)

result = rebindSession.rebindPrimaryDevice({ deviceId: 'pump-02' })
assert.equal(result.aborted, false)
assert.equal(rebindSession.getPrimaryDevice()?.deviceId, 'pump-02')
assert.deepEqual(
  result.valueUpdates.map((update) => [update.property, update.value]),
  [
    ['level', undefined],
    ['label', 'low'],
  ],
)
assert.equal(rebindSession.getComponentProperty('level'), 7)
assert.equal(rebindSession.getComponentProperty('label'), 'low')
rebindSession.dispose()

// Rebind itself is transactional. This ordering is intentional: on pump-01,
// label reads base/derived level=42 before the level writer establishes the
// same effective value, so initialization settles in exactly two steps. On
// pump-02, the level changes to 5 and schedules label for a third step, forcing
// an abort under maxPropagationSteps=2. The prior Primary Device, derived
// values and Behavior branch state must all survive unchanged.
const rollbackSource = `
if $self.level > 10 {
  $self.label = "high"
} else {
  $self.label = "low"
}
$self.level = $device.level

if $self.label == "high" {
  $self.showHigh()
} else {
  $self.showLow()
}
`
const rollbackCompiled = compileScadaDslSource(rollbackSource, catalog)
assert.deepEqual(rollbackCompiled.diagnostics, [])
assert.ok(rollbackCompiled.compiled)
sourceValues.set('pump-01:level', 42)
sourceValues.set('pump-02:level', 5)

const rollbackSession = createScadaDslPropagationSession(
  rollbackCompiled.compiled!,
  {
    primaryDevice: { deviceId: 'pump-01' },
    readSourceValue(sourceId, property) {
      return sourceValues.get(`${sourceId}:${property}`)
    },
    readComponentBaseProperty(property) {
      if (property === 'level') return 42
      return baseValues.get(property)
    },
    maxPropagationSteps: 2,
  },
)

const beforeRebind = rollbackSession.initialize()
assert.equal(beforeRebind.aborted, false)
assert.equal(beforeRebind.steps, 2)
assert.equal(rollbackSession.getComponentProperty('level'), 42)
assert.equal(rollbackSession.getComponentProperty('label'), 'high')
const beforeBranches = rollbackSession.getBehaviorBranches()

const abortedRebind = rollbackSession.rebindPrimaryDevice({ deviceId: 'pump-02' })
assert.equal(abortedRebind.aborted, true)
assert.deepEqual(abortedRebind.valueUpdates, [])
assert.deepEqual(abortedRebind.componentActions, [])
assert.ok(
  abortedRebind.diagnostics.some((diagnostic) => diagnostic.kind === 'limit'),
)
assert.equal(rollbackSession.getPrimaryDevice()?.deviceId, 'pump-01')
assert.equal(rollbackSession.getComponentProperty('level'), 42)
assert.equal(rollbackSession.getComponentProperty('label'), 'high')
assert.deepEqual(rollbackSession.getBehaviorBranches(), beforeBranches)
rollbackSession.dispose()

console.log(
  'SCADA DSL v1 semantic hardening checks passed: validated $self/$device compilation rejects duplicate writers/cycles, unresolved bindings release derived overrides, primary-device rebind rebuilds derived state without leakage, and aborted rebind restores the complete previously committed runtime state.',
)
