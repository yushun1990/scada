import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import {
  createScadaDslCapabilityCatalog,
  parseScadaDsl,
} from '../src/scene/scada-dsl'
import { lowerScadaDslProgram } from '../src/scene/scada-dsl-semantics'
import { compileScadaDslRuntime } from '../src/scene/scada-dsl-runtime'
import { createScadaDslPropagationSession } from '../src/scene/scada-dsl-propagation-session'

const component: ComponentDefinition = {
  type: 'test.rollback',
  title: 'Rollback test',
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
    a: { title: 'A', kind: 'number', defaultValue: 0, bindable: true },
    b: { title: 'B', kind: 'number', defaultValue: 0, bindable: true },
  },
  actions: {},
  events: {},
  anchors: [],
}

const parsed = parseScadaDsl(`
$self.a = 1
$self.b = 2
`)
assert.deepEqual(parsed.diagnostics, [])
assert.ok(parsed.program)

const lowered = lowerScadaDslProgram(
  parsed.program!,
  createScadaDslCapabilityCatalog(component, []),
)
assert.deepEqual(lowered.diagnostics, [])
assert.ok(lowered.plan)
const compiled = compileScadaDslRuntime(lowered.plan!)

const createSession = (maxPropagationSteps: number) =>
  createScadaDslPropagationSession(compiled, {
    readSourceValue: () => undefined,
    readComponentBaseProperty: () => 0,
    maxPropagationSteps,
  })

// The first binding can stage a=1, but the second binding exceeds the hard
// limit. The transaction must expose no partial Property update and must leave
// committed runtime-local state untouched.
const limited = createSession(1)
const aborted = limited.initialize()
assert.equal(aborted.aborted, true)
assert.deepEqual(aborted.valueUpdates, [])
assert.deepEqual(aborted.componentActions, [])
assert.ok(
  aborted.diagnostics.some((diagnostic) => diagnostic.kind === 'limit'),
)
assert.equal(limited.getComponentProperty('a'), 0)
assert.equal(limited.getComponentProperty('b'), 0)

// With enough budget the exact same compiled program commits atomically.
const sufficient = createSession(2)
const committed = sufficient.initialize()
assert.equal(committed.aborted, false)
assert.deepEqual(committed.diagnostics, [])
assert.deepEqual(committed.valueUpdates, [
  { bindingId: 'value:0', property: 'a', value: 1 },
  { bindingId: 'value:1', property: 'b', value: 2 },
])
assert.equal(sufficient.getComponentProperty('a'), 1)
assert.equal(sufficient.getComponentProperty('b'), 2)

limited.dispose()
sufficient.dispose()

console.log(
  'SCADA DSL v1 propagation rollback checks passed: $self Value Bindings still commit atomically, propagation-step exhaustion rolls back staged Property state and exposes no partial host effects, and sufficient budget commits the same program completely.',
)
