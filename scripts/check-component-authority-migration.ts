import assert from 'node:assert/strict'
import type { LegacyComponentDefinition } from '../src/component-system/definition'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import {
  COMPONENT_DEFINITION_SCHEMA_VERSION,
  createDefaultAttributeValues,
  createDefaultPropertyFallbackValues,
  migrateLegacyComponentDefinition,
} from '../src/component-system/versioned-component-definition'
import {
  COMPONENT_PACKAGE_VERSION,
  LEGACY_COMPONENT_PACKAGE_VERSION,
  parseComponentLibraryDocument,
  serializeComponentLibraryDocument,
} from '../src/features/component-library/component-document'

const legacyDefinition: LegacyComponentDefinition = {
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

// Local editable document v1 is migration input only. A bindable-only legacy
// definition has provable Property authority and hydrates as a current v2 entry.
const safeLegacyDocument = JSON.stringify({
  version: LEGACY_COMPONENT_PACKAGE_VERSION,
  id: 'legacy-local-safe',
  definition: {
    ...legacyDefinition,
    properties: {
      pressure: legacyDefinition.properties.pressure,
    },
  },
  visual: createEmptyCompositeVisual(),
  status: 'ready',
  implementationDraft: '',
  updatedAt: '2026-09-02T00:00:00.000Z',
  builtIn: false,
})
const migratedLocal = parseComponentLibraryDocument(safeLegacyDocument)
assert.ok(migratedLocal)
assert.equal(migratedLocal.version, COMPONENT_PACKAGE_VERSION)
assert.deepEqual(migratedLocal.definition.attributes, {})
assert.deepEqual(Object.keys(migratedLocal.definition.properties), ['pressure'])
assert.equal(migratedLocal.definition.properties.pressure?.bindable, true)

const canonicalLocal = serializeComponentLibraryDocument(migratedLocal)
assert.equal(JSON.parse(canonicalLocal).version, COMPONENT_PACKAGE_VERSION)
assert.deepEqual(parseComponentLibraryDocument(canonicalLocal), migratedLocal)

// A v1 local document with a non-bindable field cannot encode whether the field
// is authored configuration or runtime state, so hydration fails closed instead
// of silently changing its authority.
const ambiguousLegacyDocument = JSON.stringify({
  version: LEGACY_COMPONENT_PACKAGE_VERSION,
  id: 'legacy-local-ambiguous',
  definition: {
    ...legacyDefinition,
    properties: {
      runningColor: legacyDefinition.properties.runningColor,
    },
  },
  visual: createEmptyCompositeVisual(),
  status: 'ready',
  implementationDraft: '',
  updatedAt: '2026-09-02T00:00:00.000Z',
  builtIn: false,
})
assert.equal(parseComponentLibraryDocument(ambiguousLegacyDocument), null)

console.log(
  'Component authority migration checks passed: bindable runtime fields remain Properties, ambiguous legacy fields fail closed, explicit manifests resolve ambiguity, Attributes drop runtime bindability, authored Attribute defaults remain separate from Property fallback defaults, and local component documents normalize safe v1 data into v2 without guessing ambiguous authority.',
)
