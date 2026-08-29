import assert from 'node:assert/strict'
import {
  COMPONENT_PUBLICATION_SCHEMA_VERSION,
  normalizePublicationRequest,
  normalizeRevisionParam,
  toPublicationHead,
  toPublishedRevision,
} from '../server/src/publication-contract.js'

const body = {
  schemaVersion: COMPONENT_PUBLICATION_SCHEMA_VERSION,
  requestId: ' request-001 ',
  componentType: 'custom.server.fixture',
  baseRevision: null,
  package: {
    packageVersion: 1,
    definition: {
      type: 'custom.server.fixture',
      title: ' Server Fixture ',
    },
    visual: { mode: 'composite' },
    implementationDraft: '// inert',
  },
}

assert.deepEqual(
  normalizePublicationRequest(body, 'custom.server.fixture'),
  {
    schemaVersion: 1,
    requestId: 'request-001',
    componentType: 'custom.server.fixture',
    baseRevision: null,
    package: body.package,
    title: 'Server Fixture',
  },
)
assert.equal(
  normalizePublicationRequest(body, 'custom.other'),
  null,
  'route type must match the request/package type',
)
assert.equal(
  normalizePublicationRequest({
    ...body,
    componentType: 'custom.other',
  }),
  null,
)
assert.equal(
  normalizePublicationRequest({
    ...body,
    baseRevision: 0,
  }),
  null,
)
assert.equal(
  normalizePublicationRequest({
    ...body,
    package: {
      ...body.package,
      packageVersion: 99,
    },
  }),
  null,
)

assert.equal(normalizeRevisionParam('1'), 1)
assert.equal(normalizeRevisionParam('42'), 42)
assert.equal(normalizeRevisionParam('0'), null)
assert.equal(normalizeRevisionParam('-1'), null)
assert.equal(normalizeRevisionParam('1.5'), null)
assert.equal(normalizeRevisionParam('abc'), null)

assert.deepEqual(
  toPublishedRevision({
    revisionId: 'rev-1',
    requestId: 'req-1',
    componentType: 'custom.server.fixture',
    revision: 3,
    package: body.package,
    publishedAt: '2026-08-29T03:00:00.000Z',
  }),
  {
    schemaVersion: 1,
    revisionId: 'rev-1',
    requestId: 'req-1',
    componentType: 'custom.server.fixture',
    revision: 3,
    package: body.package,
    publishedAt: '2026-08-29T03:00:00.000Z',
  },
)

assert.deepEqual(
  toPublicationHead({
    componentType: 'custom.server.fixture',
    title: 'Server Fixture',
    latestRevision: 3,
    latestRevisionId: 'rev-3',
    publishedAt: '2026-08-29T03:00:00.000Z',
  }),
  {
    schemaVersion: 1,
    componentType: 'custom.server.fixture',
    title: 'Server Fixture',
    latestRevision: 3,
    latestRevisionId: 'rev-3',
    publishedAt: '2026-08-29T03:00:00.000Z',
  },
)

console.log(
  'Server publication contract checks passed: request/package/route types agree, base revisions are explicit, revision params are strict positive integers, and response envelopes match the browser publication schema.',
)
