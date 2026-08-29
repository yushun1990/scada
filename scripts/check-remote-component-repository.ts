import assert from 'node:assert/strict'
import {
  HttpRemoteComponentRepository,
  RemoteComponentRepositoryError,
  createRemoteComponentInstallCandidate,
} from '../src/features/component-library/remote-component-repository'

const componentType = 'custom.remote/fixture'
const encodedType = encodeURIComponent(componentType)

const publishedRevision = {
  schemaVersion: 1 as const,
  revisionId: 'remote-revision-2',
  requestId: 'remote-request-2',
  componentType,
  revision: 2,
  package: {
    packageVersion: 1 as const,
    definition: {
      type: componentType,
      title: 'Remote Fixture',
      category: 'Fixture',
      description: '',
      size: {
        defaultWidth: 100,
        defaultHeight: 60,
        minWidth: 20,
        minHeight: 20,
      },
      properties: {},
      actions: {},
      events: {},
      anchors: [],
    },
    visual: {
      version: 1 as const,
      mode: 'composite' as const,
      designSize: { width: 100, height: 60 },
      layers: [],
      rules: [],
      animations: [],
    },
    implementationDraft: '// inert remote content',
  },
  publishedAt: '2026-08-29T04:00:00.000Z',
}

const calls: Array<{ url: string; init?: RequestInit }> = []
const responses = new Map<string, Response>([
  [
    'https://components.example.test/api/component-publications',
    Response.json({
      items: [
        {
          schemaVersion: 1,
          componentType,
          title: 'Remote Fixture',
          latestRevision: 2,
          latestRevisionId: 'remote-revision-2',
          publishedAt: publishedRevision.publishedAt,
        },
      ],
    }),
  ],
  [
    `https://components.example.test/api/component-publications/${encodedType}`,
    Response.json(publishedRevision),
  ],
  [
    `https://components.example.test/api/component-publications/${encodedType}/revisions/2`,
    Response.json(publishedRevision),
  ],
  [
    `https://components.example.test/api/component-publications/${encodedType}/revisions/1`,
    Response.json({ error: 'component_publication_revision_not_found' }, { status: 404 }),
  ],
])

const fetcher = async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url
  calls.push({ url, init })
  const response = responses.get(url)
  if (!response) {
    return Response.json({ error: 'unexpected_test_url' }, { status: 500 })
  }
  return response.clone()
}

const repository = new HttpRemoteComponentRepository(
  ' https://components.example.test/// ',
  { fetcher },
)
assert.equal(calls.length, 0, 'repository construction must not perform remote I/O')

const heads = await repository.listHeads()
assert.equal(heads.length, 1)
assert.equal(heads[0].componentType, componentType)
assert.equal(heads[0].latestRevision, 2)

const latest = await repository.getLatest(componentType)
assert.ok(latest)
assert.equal(latest.revisionId, publishedRevision.revisionId)
assert.equal(latest.revision, 2)

const specific = await repository.getRevision(componentType, 2)
assert.ok(specific)
assert.equal(specific.revisionId, publishedRevision.revisionId)

const missing = await repository.getRevision(componentType, 1)
assert.equal(missing, null, '404 is a normal missing-revision result')

for (const call of calls) {
  const headers = new Headers(call.init?.headers)
  assert.equal(
    headers.has('authorization'),
    false,
    'public remote reads must not invent or attach publication credentials',
  )
  assert.equal(call.init?.method, 'GET')
}
assert.ok(
  calls.some((call) => call.url.includes(encodedType)),
  'component types must be encoded as one URL path segment',
)

const candidate = createRemoteComponentInstallCandidate(latest)
assert.deepEqual(candidate.source, {
  kind: 'remote-publication',
  componentType,
  revision: 2,
  revisionId: 'remote-revision-2',
  publishedAt: publishedRevision.publishedAt,
})
assert.equal(candidate.entry.id, 'published:remote-revision-2')
assert.equal(candidate.entry.status, 'ready')
assert.equal(candidate.entry.builtIn, false)
assert.equal(candidate.entry.definition.type, componentType)

await assert.rejects(
  repository.getRevision(componentType, 0),
  /positive integer/,
)

const malformed = new HttpRemoteComponentRepository(
  'https://malformed.example.test',
  {
    fetcher: async () => Response.json({ items: [{ nope: true }] }),
  },
)
await assert.rejects(
  malformed.listHeads(),
  (error: unknown) =>
    error instanceof RemoteComponentRepositoryError &&
    error.status === 200 &&
    /invalid publication head/.test(error.message),
)

const failing = new HttpRemoteComponentRepository(
  'https://failing.example.test',
  {
    fetcher: async () => Response.json(
      { error: 'service_unavailable' },
      { status: 503 },
    ),
  },
)
await assert.rejects(
  failing.listHeads(),
  (error: unknown) =>
    error instanceof RemoteComponentRepositoryError &&
    error.status === 503 &&
    error.code === 'service_unavailable',
)

console.log(
  'Remote component repository checks passed: public reads are credential-free and opt-in, response envelopes are strictly validated, component types are URL-safe, 404 remains a normal miss, repository failures are explicit, and immutable revisions cross a separate provenance-preserving install boundary before any future persistence/activation step.',
)
