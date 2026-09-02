import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import { createScadaDslCapabilityCatalog } from '../src/scene/scada-dsl'
import { compileScadaDslSource } from '../src/scene/scada-dsl-compiler'
import { compileScadaDslRuntime } from '../src/scene/scada-dsl-runtime'
import {
  parsePersistedScadaSemantics,
  persistScadaSemanticPlan,
  restoreScadaSemanticPlan,
  type PersistedScadaSemantics,
} from '../src/scene/scada-semantics-persistence'

const component: ComponentDefinition = {
  type: 'test.persisted-scada',
  title: 'Persisted SCADA',
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
      defaultValue: 'off',
      bindable: true,
      options: [
        { label: 'Off', value: 'off' },
        { label: 'On', value: 'on' },
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
    showOn: { title: 'Show on' },
    showOff: { title: 'Show off' },
  },
  events: {
    startRequested: { title: 'Start requested' },
  },
  anchors: [],
}

const catalog = createScadaDslCapabilityCatalog(component, [
  {
    sourceId: 'authoring-primary',
    title: 'Primary device',
    properties: {
      running: { title: 'Running', kind: 'boolean', defaultValue: false },
      level: { title: 'Level', kind: 'number', defaultValue: 0 },
    },
    actions: {
      start: { title: 'Start' },
    },
  },
])

const sourceA = `
if $device.running {
  $self.state = "on"
} else {
  $self.state = "off"
}
$self.level = $device.level

if $self.state == "on" {
  $self.showOn()
} else {
  $self.showOff()
}

on $self.startRequested {
  $device.start()
}
`

const sourceB = `
on $self.startRequested {
  $device.start()
}

if $self.state == "on" {
  $self.showOn()
} else {
  $self.showOff()
}

$self.level = $device.level
if $device.running {
  $self.state = "on"
} else {
  $self.state = "off"
}
`

const compiledA = compileScadaDslSource(sourceA, catalog)
const compiledB = compileScadaDslSource(sourceB, catalog)
assert.deepEqual(compiledA.diagnostics, [])
assert.deepEqual(compiledB.diagnostics, [])
assert.ok(compiledA.plan)
assert.ok(compiledB.plan)

// Lowering IDs are intentionally authoring-session IDs and move with statement
// position. Persistence must not copy those positional IDs into the Scene.
assert.notDeepEqual(
  compiledA.plan!.valueBindings.map((binding) => binding.id),
  compiledB.plan!.valueBindings.map((binding) => binding.id),
)
assert.notEqual(
  compiledA.plan!.interactions[0]?.id,
  compiledB.plan!.interactions[0]?.id,
)

const persistedA = persistScadaSemanticPlan(compiledA.plan!)
const persistedB = persistScadaSemanticPlan(compiledB.plan!)

function valueIdsByTarget(semantics: PersistedScadaSemantics) {
  return Object.fromEntries(
    semantics.valueBindings.map((binding) => [binding.targetProperty, binding.id]),
  )
}

function behaviorIdsByActions(semantics: PersistedScadaSemantics) {
  return Object.fromEntries(
    semantics.behaviors.map((behavior) => [
      behavior.branches
        .flatMap((branch) => branch.actions.map((action) => action.action))
        .join('|'),
      behavior.id,
    ]),
  )
}

function interactionIdsByEvent(semantics: PersistedScadaSemantics) {
  return Object.fromEntries(
    semantics.interactions.map((interaction) => [interaction.event, interaction.id]),
  )
}

// Unrelated statement reordering does not change the persisted identity of an
// unchanged semantic item.
assert.deepEqual(valueIdsByTarget(persistedA), valueIdsByTarget(persistedB))
assert.deepEqual(behaviorIdsByActions(persistedA), behaviorIdsByActions(persistedB))
assert.deepEqual(
  interactionIdsByEvent(persistedA),
  interactionIdsByEvent(persistedB),
)

// Readable DSL roots are not persistence references. `$device` resolves to the
// canonical primary-device scope; the authoring-time source id is not stored.
const serialized = JSON.stringify(persistedA)
assert.doesNotMatch(serialized, /authoring-primary/)
assert.doesNotMatch(serialized, /\$self|\$device/)
assert.match(serialized, /"scope":"primary-device"/)

// Persisted semantics round-trip as data and restore directly into an
// executable compiled runtime without reparsing DSL text.
const parsed = parsePersistedScadaSemantics(JSON.parse(serialized))
assert.deepEqual(parsed, persistedA)
const restoredPlan = restoreScadaSemanticPlan(parsed)
const restoredRuntime = compileScadaDslRuntime(restoredPlan)
assert.deepEqual(
  restoredRuntime.plan.valueBindings.map((binding) => binding.id),
  persistedA.valueBindings.map((binding) => binding.id),
)
assert.deepEqual(
  [...restoredRuntime.interactionsByEvent.keys()],
  ['startRequested'],
)

// Corrupt persisted data cannot reintroduce ambiguous declarative ownership.
const duplicateWriter = structuredClone(persistedA) as any
duplicateWriter.valueBindings.push({
  ...structuredClone(duplicateWriter.valueBindings[0]),
  id: 'value:corrupt-duplicate',
})
assert.throws(
  () => parsePersistedScadaSemantics(duplicateWriter),
  /multiple writers/,
)

// Nor can persisted JSON bypass the Component Property cycle rule.
const cyclic: PersistedScadaSemantics = {
  version: 1,
  valueBindings: [
    {
      id: 'value:a',
      targetProperty: 'a',
      expression: {
        kind: 'reference',
        reference: { kind: 'component-property', property: 'b' },
      },
    },
    {
      id: 'value:b',
      targetProperty: 'b',
      expression: {
        kind: 'reference',
        reference: { kind: 'component-property', property: 'a' },
      },
    },
  ],
  behaviors: [],
  interactions: [],
}
assert.throws(
  () => parsePersistedScadaSemantics(cyclic),
  /Component Property cycle/,
)

// IDs are part of the persisted contract and must remain globally unique
// across Value/Behavior/Interaction/branch records.
const duplicateId = structuredClone(persistedA) as any
duplicateId.interactions[0].id = duplicateId.valueBindings[0].id
assert.throws(
  () => parsePersistedScadaSemantics(duplicateId),
  /invalid\/duplicate Interaction ID/,
)

console.log(
  'SCADA semantic persistence checks passed: DSL v1 $self/$device authoring lowers to canonical structured references, persisted IDs are independent of statement position, JSON round-trips without DSL reparsing, restored plans compile directly, and corrupt duplicate-writer/cycle/ID data is rejected.',
)
