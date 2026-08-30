import assert from 'node:assert/strict'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import type { ComponentLibraryEntry } from '../src/features/component-library/component-document'
import {
  DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
  createDistributableComponentPackage,
  distributableComponentPackageToLibraryEntry,
  parseDistributableComponentPackage,
  parseDistributableComponentPackageDocument,
  serializeDistributableComponentPackage,
} from '../src/features/component-library/distributable-component-package'
import {
  createComponentPublishedPackage,
  parseComponentPublishedPackage,
} from '../src/features/component-library/publication-contract'

function readyEntry(): ComponentLibraryEntry {
  return {
    version: 1,
    id: 'local-portable-123',
    definition: {
      type: 'custom.portable.fixture',
      title: 'Portable Fixture',
      category: 'Fixture',
      description: 'transport-neutral package fixture',
      size: {
        defaultWidth: 160,
        defaultHeight: 90,
        minWidth: 40,
        minHeight: 24,
      },
      properties: {
        value: {
          title: 'Value',
          kind: 'number',
          defaultValue: 0,
          bindable: true,
        },
      },
      actions: {},
      events: {},
      anchors: [],
    },
    visual: createEmptyCompositeVisual(),
    status: 'ready',
    implementationDraft: '// inert implementation draft',
    updatedAt: '2026-08-30T00:00:00.000Z',
    builtIn: false,
  }
}

const local = readyEntry()
const artifact = createDistributableComponentPackage(local)

assert.equal(
  artifact.packageVersion,
  DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
  'artifact owns an explicit distribution schema version',
)
assert.deepEqual(Object.keys(artifact).sort(), [
  'definition',
  'implementationDraft',
  'packageVersion',
  'visual',
])
assert.equal(artifact.definition.type, local.definition.type)
assert.equal(artifact.implementationDraft, local.implementationDraft)
assert.notEqual(artifact.definition, local.definition, 'definition is cloned across the boundary')
assert.notEqual(artifact.visual, local.visual, 'visual is cloned across the boundary')

assert.equal('id' in artifact, false, 'local repository id must not enter the artifact')
assert.equal('status' in artifact, false, 'local readiness metadata must not enter the artifact')
assert.equal('updatedAt' in artifact, false, 'local timestamp must not enter the artifact')
assert.equal('builtIn' in artifact, false, 'local built-in metadata must not enter the artifact')

const serialized = serializeDistributableComponentPackage(artifact)
const parsedDocument = parseDistributableComponentPackageDocument(serialized)
assert.ok(parsedDocument)
assert.deepEqual(parsedDocument, artifact, 'serialized artifact round-trips exactly')
assert.equal(
  serializeDistributableComponentPackage(parsedDocument),
  serialized,
  'normalized serialization is deterministic',
)

const parsedValue = parseDistributableComponentPackage({
  ...artifact,
  ignoredTransportExtension: true,
})
assert.deepEqual(
  parsedValue,
  artifact,
  'parsing normalizes the known artifact contract instead of preserving transport noise',
)
assert.deepEqual(
  Object.keys(JSON.parse(serializeDistributableComponentPackage(parsedValue!))).sort(),
  ['definition', 'implementationDraft', 'packageVersion', 'visual'],
)

assert.equal(parseDistributableComponentPackageDocument('{broken-json'), null)
assert.equal(
  parseDistributableComponentPackage({
    ...artifact,
    packageVersion: 999,
  }),
  null,
  'unsupported artifact versions fail closed',
)
assert.equal(
  parseDistributableComponentPackage({
    ...artifact,
    definition: {
      ...artifact.definition,
      type: '',
    },
  }),
  null,
  'malformed component definitions fail closed',
)
assert.equal(
  parseDistributableComponentPackage({
    ...artifact,
    visual: {
      ...artifact.visual,
      version: 999,
    },
  }),
  null,
  'malformed visual packages fail closed',
)

assert.throws(
  () => createDistributableComponentPackage({ ...local, status: 'draft' }),
  /Only ready/,
)
assert.throws(
  () => createDistributableComponentPackage({ ...local, builtIn: true }),
  /Built-in/,
)

const imported = distributableComponentPackageToLibraryEntry(artifact, {
  id: 'imported-local-id',
  updatedAt: '2026-08-30T01:00:00.000Z',
})
assert.equal(imported.version, 1)
assert.equal(imported.id, 'imported-local-id')
assert.equal(imported.status, 'ready')
assert.equal(imported.builtIn, false)
assert.equal(imported.updatedAt, '2026-08-30T01:00:00.000Z')
assert.equal(imported.definition.type, artifact.definition.type)
assert.notEqual(imported.definition, artifact.definition)
assert.notEqual(imported.visual, artifact.visual)
assert.throws(
  () => distributableComponentPackageToLibraryEntry(artifact, {
    id: '',
    updatedAt: '2026-08-30T01:00:00.000Z',
  }),
  /local id/,
)

const publicationArtifact = createComponentPublishedPackage(local)
assert.deepEqual(
  publicationArtifact,
  artifact,
  'publication consumes the same transport-neutral artifact contract',
)
assert.deepEqual(
  parseComponentPublishedPackage(publicationArtifact),
  artifact,
  'accepted publication package parsing remains wire-compatible',
)

console.log(
  'Distributable component package checks passed: ready local authoring metadata is stripped at the transport boundary, normalized package JSON round-trips deterministically, malformed/unsupported artifacts fail closed, pure import conversion injects new local identity explicitly, and publication reuses the same artifact codec.',
)
