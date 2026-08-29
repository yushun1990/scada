import assert from 'node:assert/strict'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import type { ComponentLibraryEntry } from '../src/features/component-library/component-document'
import {
  COMPONENT_PUBLICATION_SCHEMA_VERSION,
  createComponentPublicationRequest,
  createComponentPublishedPackage,
  parseComponentPublicationHead,
  parseComponentPublicationRequest,
  parsePublishedComponentRevision,
  publishedRevisionToLibraryEntry,
} from '../src/features/component-library/publication-contract'

function readyEntry(): ComponentLibraryEntry {
  return {
    version: 1,
    id: 'local-component-123',
    definition: {
      type: 'custom.publication.fixture',
      title: 'Publication Fixture',
      category: 'Fixture',
      description: 'publication contract fixture',
      size: {
        defaultWidth: 120,
        defaultHeight: 80,
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
    implementationDraft: '// inert publication payload',
    updatedAt: '2026-08-29T00:00:00.000Z',
    builtIn: false,
  }
}

const local = readyEntry()
const publishedPackage = createComponentPublishedPackage(local)
assert.deepEqual(Object.keys(publishedPackage).sort(), [
  'definition',
  'implementationDraft',
  'packageVersion',
  'visual',
])
assert.equal(publishedPackage.definition.type, local.definition.type)
assert.notEqual(publishedPackage.definition, local.definition)
assert.notEqual(publishedPackage.visual, local.visual)

const request = createComponentPublicationRequest(local, {
  requestId: 'request-001',
  baseRevision: null,
})
assert.equal(request.schemaVersion, COMPONENT_PUBLICATION_SCHEMA_VERSION)
assert.equal(request.componentType, local.definition.type)
assert.equal(request.baseRevision, null)
assert.deepEqual(parseComponentPublicationRequest(request), request)

const secondRequest = createComponentPublicationRequest(local, {
  requestId: 'request-002',
  baseRevision: 3,
})
assert.equal(secondRequest.baseRevision, 3)

assert.throws(
  () => createComponentPublishedPackage({ ...local, status: 'draft' }),
  /Only ready/,
)
assert.throws(
  () => createComponentPublicationRequest(local, {
    requestId: '',
    baseRevision: null,
  }),
  /requestId/,
)
assert.throws(
  () => createComponentPublicationRequest(local, {
    requestId: 'bad-base',
    baseRevision: 0,
  }),
  /baseRevision/,
)

assert.equal(
  parseComponentPublicationRequest({
    ...request,
    componentType: 'custom.other',
  }),
  null,
  'wire componentType must match package definition.type',
)
assert.equal(
  parseComponentPublicationRequest({
    ...request,
    baseRevision: -1,
  }),
  null,
)

const revision = parsePublishedComponentRevision({
  schemaVersion: 1,
  revisionId: 'revision-uuid-001',
  requestId: request.requestId,
  componentType: request.componentType,
  revision: 1,
  package: request.package,
  publishedAt: '2026-08-29T01:00:00.000Z',
})
assert.ok(revision)
assert.equal(revision.revision, 1)

const activationEntry = publishedRevisionToLibraryEntry(revision)
assert.equal(activationEntry.id, 'published:revision-uuid-001')
assert.equal(activationEntry.status, 'ready')
assert.equal(activationEntry.builtIn, false)
assert.equal(activationEntry.updatedAt, revision.publishedAt)
assert.equal(activationEntry.definition.type, revision.componentType)
assert.notEqual(activationEntry.definition, revision.package.definition)
assert.notEqual(activationEntry.visual, revision.package.visual)

assert.equal(
  parsePublishedComponentRevision({
    ...revision,
    revision: 0,
  }),
  null,
)
assert.equal(
  parsePublishedComponentRevision({
    ...revision,
    componentType: 'custom.mismatch',
  }),
  null,
)

assert.deepEqual(
  parseComponentPublicationHead({
    schemaVersion: 1,
    componentType: revision.componentType,
    title: revision.package.definition.title,
    latestRevision: 7,
    latestRevisionId: 'revision-uuid-007',
    publishedAt: '2026-08-29T02:00:00.000Z',
  }),
  {
    schemaVersion: 1,
    componentType: revision.componentType,
    title: revision.package.definition.title,
    latestRevision: 7,
    latestRevisionId: 'revision-uuid-007',
    publishedAt: '2026-08-29T02:00:00.000Z',
  },
)

console.log(
  'Component publication contract checks passed: local authoring metadata is excluded from distributable packages, ready-only publication requests carry explicit base revisions, published revisions are immutable envelopes, and retrieved revisions convert back into ready activation candidates through the existing package model.',
)
