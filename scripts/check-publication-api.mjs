import assert from 'node:assert/strict'

const baseUrl = process.env.PUBLICATION_API_URL ?? 'http://127.0.0.1:3100'
const token = process.env.SCADA_ADMIN_TOKEN ?? 'ci-publication-token'
const componentType = 'custom.api.fixture'

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.auth === false ? {} : { authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  return { response, body }
}

function publicationBody(requestId, baseRevision, title, valueDefault) {
  return {
    schemaVersion: 1,
    requestId,
    componentType,
    baseRevision,
    package: {
      packageVersion: 1,
      definition: {
        type: componentType,
        title,
        category: 'Fixture',
        description: '',
        size: {
          defaultWidth: 80,
          defaultHeight: 48,
          minWidth: 20,
          minHeight: 16,
        },
        properties: {
          value: {
            title: 'Value',
            kind: 'number',
            defaultValue: valueDefault,
            bindable: true,
          },
        },
        actions: {},
        events: {},
        anchors: [],
      },
      visual: {
        version: 1,
        mode: 'composite',
        designSize: { width: 80, height: 48 },
        layers: [],
        rules: [],
        animations: [],
      },
      implementationDraft: '// inert',
    },
  }
}

const emptyList = await request('/api/component-publications', { auth: false })
assert.equal(emptyList.response.status, 200)
assert.deepEqual(emptyList.body, { items: [] })

const rev1Request = publicationBody('request-rev-1', null, 'API Fixture v1', 1)
const rev1 = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions`,
  { method: 'POST', body: JSON.stringify(rev1Request) },
)
assert.equal(rev1.response.status, 201)
assert.equal(rev1.body.schemaVersion, 1)
assert.equal(rev1.body.componentType, componentType)
assert.equal(rev1.body.revision, 1)
assert.equal(rev1.body.package.definition.title, 'API Fixture v1')
const rev1Id = rev1.body.revisionId

const replay = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions`,
  { method: 'POST', body: JSON.stringify(rev1Request) },
)
assert.equal(replay.response.status, 200)
assert.equal(replay.body.revisionId, rev1Id)
assert.equal(replay.body.revision, 1)

const reusedRequestId = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions`,
  {
    method: 'POST',
    body: JSON.stringify(
      publicationBody('request-rev-1', null, 'Different payload', 999),
    ),
  },
)
assert.equal(reusedRequestId.response.status, 409)
assert.deepEqual(reusedRequestId.body, { error: 'idempotency_conflict' })

const staleBase = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions`,
  {
    method: 'POST',
    body: JSON.stringify(
      publicationBody('request-stale', null, 'Stale write', 2),
    ),
  },
)
assert.equal(staleBase.response.status, 409)
assert.deepEqual(staleBase.body, {
  error: 'publication_conflict',
  currentRevision: 1,
})

const rev2Request = publicationBody('request-rev-2', 1, 'API Fixture v2', 2)
const rev2 = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions`,
  { method: 'POST', body: JSON.stringify(rev2Request) },
)
assert.equal(rev2.response.status, 201)
assert.equal(rev2.body.revision, 2)
assert.notEqual(rev2.body.revisionId, rev1Id)

const latest = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}`,
  { auth: false },
)
assert.equal(latest.response.status, 200)
assert.equal(latest.body.revision, 2)
assert.equal(latest.body.package.definition.title, 'API Fixture v2')

const immutableRev1 = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions/1`,
  { auth: false },
)
assert.equal(immutableRev1.response.status, 200)
assert.equal(immutableRev1.body.revisionId, rev1Id)
assert.equal(immutableRev1.body.package.definition.title, 'API Fixture v1')
assert.equal(
  immutableRev1.body.package.definition.properties.value.defaultValue,
  1,
)

const list = await request('/api/component-publications', { auth: false })
assert.equal(list.response.status, 200)
assert.equal(list.body.items.length, 1)
assert.deepEqual(list.body.items[0], {
  schemaVersion: 1,
  componentType,
  title: 'API Fixture v2',
  latestRevision: 2,
  latestRevisionId: rev2.body.revisionId,
  publishedAt: rev2.body.publishedAt,
})

const badRouteType = await request(
  '/api/component-publications/custom.wrong/revisions',
  { method: 'POST', body: JSON.stringify(publicationBody('request-bad-route', 2, 'Bad', 3)) },
)
assert.equal(badRouteType.response.status, 400)

console.log(
  'Publication API checks passed: revisions are append-only, request retries are idempotent, request-id reuse with different payload is rejected, stale base revisions conflict, latest lookup advances, and older published revisions remain immutable/readable.',
)
