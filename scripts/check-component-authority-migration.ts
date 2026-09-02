import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import {
  COMPONENT_DEFINITION_SCHEMA_VERSION,
  createDefaultAttributeValues,
  createDefaultPropertyFallbackValues,
  migrateLegacyComponentDefinition,
} from '../src/component-system/versioned-component-definition'

const legacyDefinition: ComponentDefinition = {
  type: 'test.authority-split',
  title: 'Authority split fixture',
  category: 'test',
  description: 'Legacy mixed Property namespace fixture.',
  size: {
    defaultWidth: 100,
    defaultHeight: 100,
    minWidth: 20,
    minHeight: 20,
  },
  properties: {
    runningColor: {
      title: 'Running color',
      kind: 'color',
      defaultValue: '#00c853',
    },
    pressure: {
      title: 'Pressure',
      kind: 'number',
      defaultValue: 0,
      bindable: true,
    },
    state: {
      title: 'State',
      kind: 'select',
      defaultValue: 'stopped',
      options: [
        { label: 'Stopped', value: 'stopped' },
        { label: 'Running', value: 'running' },
      ],
    },
  },
  actions: {},
  events: {},
  anchors: [],
}

const unresolved = migrateLegacyComponentDefinition(legacyDefinition)
assert.equal(unresolved.ok, false)
if (!unresolved.ok) {
  assert.deepEqual(
    unresolved.classifications.map((item) => [item.field, item.kind]),
    [
      ['runningColor', 'ambiguous'],
      ['pressure', 'property'],
      ['state', 'ambiguous'],
    ],
  )
  assert.equal(unresolved.issues.length, 2)
}

const migrated = migrateLegacyComponentDefinition(legacyDefinition, {
  runningColor: 'attribute',
  state: 'property',
})
assert.equal(migrated.ok, true)
if (!migrated.ok) {
  throw new Error(migrated.issues.join('\n'))
}

assert.equal(
  migrated.definition.schemaVersion,
  COMPONENT_DEFINITION_SCHEMA_VERSION,
)
assert.deepEqual(Object.keys(migrated.definition.attributes), ['runningColor'])
assert.deepEqual(Object.keys(migrated.definition.properties), ['pressure', 'state'])
assert.equal('bindable' in migrated.definition.attributes.runningColor!, false)
assert.equal(migrated.definition.properties.pressure?.bindable, true)

assert.deepEqual(createDefaultAttributeValues(migrated.definition), {
  runningColor: '#00c853',
})
assert.deepEqual(createDefaultPropertyFallbackValues(migrated.definition), {
  pressure: 0,
  state: 'stopped',
})

const repeated = migrateLegacyComponentDefinition(legacyDefinition, {
  runningColor: 'attribute',
  state: 'property',
})
assert.equal(repeated.ok, true)
assert.equal(JSON.stringify(repeated), JSON.stringify(migrated))

const contradictory = migrateLegacyComponentDefinition(legacyDefinition, {
  runningColor: 'attribute',
  pressure: 'attribute',
  state: 'property',
})
assert.equal(contradictory.ok, false)
if (!contradictory.ok) {
  assert.ok(
    contradictory.issues.some((issue) =>
      issue.includes('cannot be demoted to Attribute'),
    ),
  )
}

const typoManifest = migrateLegacyComponentDefinition(legacyDefinition, {
  runningColor: 'attribute',
  state: 'property',
  missingField: 'attribute',
})
assert.equal(typoManifest.ok, false)
if (!typoManifest.ok) {
  assert.ok(
    typoManifest.issues.some((issue) => issue.includes('missingField')),
  )
}

console.log(
  'Component authority migration checks passed: bindable runtime fields remain Properties, ambiguous legacy fields fail closed, explicit manifests resolve ambiguity, Attributes drop runtime bindability, and authored Attribute defaults remain separate from Property fallback defaults.',
)
