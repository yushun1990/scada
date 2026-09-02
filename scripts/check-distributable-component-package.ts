import assert from 'node:assert/strict'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import {
  COMPONENT_PACKAGE_VERSION,
  type ComponentLibraryEntry,
} from '../src/features/component-library/component-document'
import {
  DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
  LEGACY_DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
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

const SELF_CONTAINED_SVG_DATA_URL =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%3E%3Crect%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22%2300ff00%22%2F%3E%3C%2Fsvg%3E'

function readyEntry(): ComponentLibraryEntry {
  return {
    version: COMPONENT_PACKAGE_VERSION,
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
      attributes: {},
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

function readyEntryWithImage(assetRef: string): ComponentLibraryEntry {
  const entry = readyEntry()

  return {
    ...entry,
    visual: {
      ...entry.visual,
      layers: [
        {
          id: 'portable-image',
          name: 'Portable image',
          kind: 'image',
          parentId: null,
          transform: {
            x: 0,
            y: 0,
            width: 32,
            height: 32,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
          visible: true,
          opacity: 1,
          assetRef,
          style: { fit: 'contain' },
        },
      ],
    },
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

// V1 is migration input only. A legacy definition containing only bindable
// runtime fields has provable Property authority and normalizes to V2.
const {
  attributes: _legacyAttributes,
  ...legacyDefinition
} = artifact.definition
const migratedVersionOne = parseDistributableComponentPackage({
  packageVersion: LEGACY_DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
  definition: legacyDefinition,
  visual: artifact.visual,
  implementationDraft: artifact.implementationDraft,
})
assert.ok(migratedVersionOne)
assert.equal(
  migratedVersionOne.packageVersion,
  DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
)
assert.deepEqual(migratedVersionOne.definition.attributes, {})
assert.deepEqual(
  migratedVersionOne.definition.properties,
  artifact.definition.properties,
)

// A non-bindable V1 field has no encoded authored/runtime authority. It must not
// be silently treated as either an Attribute or a Property by the transport codec.
assert.equal(
  parseDistributableComponentPackage({
    packageVersion: LEGACY_DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
    definition: {
      ...legacyDefinition,
      properties: {
        visualColor: {
          title: 'Visual color',
          kind: 'color',
          defaultValue: '#00ff00',
        },
      },
    },
    visual: artifact.visual,
    implementationDraft: artifact.implementationDraft,
  }),
  null,
  'ambiguous V1 field authority must fail closed',
)

const selfContainedImageArtifact = createDistributableComponentPackage(
  readyEntryWithImage(SELF_CONTAINED_SVG_DATA_URL),
)
assert.equal(
  selfContainedImageArtifact.visual.layers[0]?.kind,
  'image',
  'portable packages may carry image-bearing visuals',
)
assert.equal(
  selfContainedImageArtifact.visual.layers[0]?.kind === 'image'
    ? selfContainedImageArtifact.visual.layers[0].assetRef
    : null,
  SELF_CONTAINED_SVG_DATA_URL,
  'self-contained data:image resources survive package creation',
)
assert.deepEqual(
  parseDistributableComponentPackageDocument(
    serializeDistributableComponentPackage(selfContainedImageArtifact),
  ),
  selfContainedImageArtifact,
  'self-contained visual resources round-trip through the transport artifact',
)

const rejectedPortableAssetRefs = [
  '',
  'assets/vendor-logo.png',
  '/assets/vendor-logo.png',
  'https://example.com/vendor-logo.png',
  'http://example.com/vendor-logo.png',
  'blob:https://example.com/runtime-only-resource',
  'data:text/plain,not-an-image',
  ' data:image/png;base64,AA==',
]

for (const assetRef of rejectedPortableAssetRefs) {
  assert.throws(
    () => createDistributableComponentPackage(readyEntryWithImage(assetRef)),
    /self-contained data:image/,
    `distribution must reject non-self-contained assetRef ${JSON.stringify(assetRef)}`,
  )

  assert.equal(
    parseDistributableComponentPackage({
      ...selfContainedImageArtifact,
      visual: {
        ...selfContainedImageArtifact.visual,
        layers: selfContainedImageArtifact.visual.layers.map((layer) =>
          layer.kind === 'image' ? { ...layer, assetRef } : layer,
        ),
      },
    }),
    null,
    `portable parsing must fail closed for assetRef ${JSON.stringify(assetRef)}`,
  )
}

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
assert.equal(imported.version, COMPONENT_PACKAGE_VERSION)
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
  'Distributable component package checks passed: V2 owns first-class Attribute/Property authority, safe V1 bindable fields migrate deterministically, ambiguous V1 fields fail closed, self-contained data:image resources round-trip, malformed/unsupported artifacts are rejected, local identity remains out of transport, and publication reuses the same artifact codec.',
)
