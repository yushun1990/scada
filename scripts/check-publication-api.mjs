import assert from 'node:assert/strict'

const baseUrl = process.env.PUBLICATION_API_URL ?? 'http://127.0.0.1:3100'
const adminToken = process.env.SCADA_ADMIN_TOKEN ?? 'ci-publication-token'
const publishUsername = process.env.SCADA_PUBLISH_USERNAME ?? 'ci-author'
const publishPassword = process.env.SCADA_PUBLISH_PASSWORD ?? 'ci-author-password'
const componentType = 'custom.api.fixture'

async function request(path, options = {}) {
  const headers = {
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(options.admin ? { authorization: `Bearer ${adminToken}` } : {}),
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...options.headers,
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    body: options.body,
    headers,
  })
  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  return { response, body }
}

function publicationBody(
  requestId,
  baseRevision,
  title,
  valueDefault,
  type = componentType,
) {
  return {
    schemaVersion: 1,
    requestId,
    componentType: type,
    baseRevision,
    package: {
      packageVersion: 1,
      definition: {
        type,
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

const health = await request('/health')
assert.equal(health.response.status, 200)
assert.equal(health.body.browserPublicationAuthEnabled, true)

const anonymousSession = await request('/api/auth/session')
assert.equal(anonymousSession.response.status, 200)
assert.deepEqual(anonymousSession.body, { authenticated: false })

const unauthorizedPublish = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions`,
  {
    method: 'POST',
    body: JSON.stringify(publicationBody('unauthorized', null, 'No auth', 0)),
  },
)
assert.equal(unauthorizedPublish.response.status, 401)
assert.deepEqual(unauthorizedPublish.body, { error: 'unauthorized' })

const invalidLogin = await request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username: publishUsername, password: 'wrong-password' }),
})
assert.equal(invalidLogin.response.status, 401)
assert.deepEqual(invalidLogin.body, { error: 'invalid_credentials' })

const login = await request('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username: publishUsername, password: publishPassword }),
})
assert.equal(login.response.status, 200)
assert.deepEqual(login.body, {
  authenticated: true,
  identity: {
    id: `local:${publishUsername}`,
    displayName: publishUsername,
  },
})
const setCookie = login.response.headers.get('set-cookie')
assert.ok(setCookie)
assert.match(setCookie, /^scada_publish_session=/)
assert.match(setCookie, /HttpOnly/)
assert.doesNotMatch(setCookie, new RegExp(publishPassword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
const sessionCookie = setCookie.split(';', 1)[0]

const authenticatedSession = await request('/api/auth/session', {
  cookie: sessionCookie,
})
assert.equal(authenticatedSession.response.status, 200)
assert.deepEqual(authenticatedSession.body, login.body)

const emptyList = await request('/api/component-publications')
assert.equal(emptyList.response.status, 200)
assert.deepEqual(emptyList.body, { items: [] })

const rev1Request = publicationBody('request-rev-1', null, 'API Fixture v1', 1)
const rev1 = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions`,
  {
    method: 'POST',
    cookie: sessionCookie,
    body: JSON.stringify(rev1Request),
  },
)
assert.equal(rev1.response.status, 201)
assert.equal(rev1.body.schemaVersion, 1)
assert.equal(rev1.body.componentType, componentType)
assert.equal(rev1.body.revision, 1)
assert.equal(rev1.body.package.definition.title, 'API Fixture v1')
const rev1Id = rev1.body.revisionId

const replay = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions`,
  {
    method: 'POST',
    cookie: sessionCookie,
    body: JSON.stringify(rev1Request),
  },
)
assert.equal(replay.response.status, 200)
assert.equal(replay.body.revisionId, rev1Id)
assert.equal(replay.body.revision, 1)

const reusedRequestId = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions`,
  {
    method: 'POST',
    cookie: sessionCookie,
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
    cookie: sessionCookie,
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
  {
    method: 'POST',
    cookie: sessionCookie,
    body: JSON.stringify(rev2Request),
  },
)
assert.equal(rev2.response.status, 201)
assert.equal(rev2.body.revision, 2)
assert.notEqual(rev2.body.revisionId, rev1Id)

const latest = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}`,
)
assert.equal(latest.response.status, 200)
assert.equal(latest.body.revision, 2)
assert.equal(latest.body.package.definition.title, 'API Fixture v2')

const immutableRev1 = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions/1`,
)
assert.equal(immutableRev1.response.status, 200)
assert.equal(immutableRev1.body.revisionId, rev1Id)
assert.equal(immutableRev1.body.package.definition.title, 'API Fixture v1')
assert.equal(
  immutableRev1.body.package.definition.properties.value.defaultValue,
  1,
)

const list = await request('/api/component-publications')
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
  {
    method: 'POST',
    cookie: sessionCookie,
    body: JSON.stringify(publicationBody('request-bad-route', 2, 'Bad', 3)),
  },
)
assert.equal(badRouteType.response.status, 400)

const logout = await request('/api/auth/logout', {
  method: 'POST',
  cookie: sessionCookie,
})
assert.equal(logout.response.status, 200)
assert.deepEqual(logout.body, { authenticated: false })
assert.match(logout.response.headers.get('set-cookie') ?? '', /Max-Age=0/)

const expiredSession = await request('/api/auth/session', { cookie: sessionCookie })
assert.deepEqual(expiredSession.body, { authenticated: false })
const afterLogout = await request(
  `/api/component-publications/${encodeURIComponent(componentType)}/revisions`,
  {
    method: 'POST',
    cookie: sessionCookie,
    body: JSON.stringify(publicationBody('request-after-logout', 2, 'After logout', 3)),
  },
)
assert.equal(afterLogout.response.status, 401)

const adminComponentType = 'custom.admin.fixture'
const adminPublication = await request(
  `/api/component-publications/${encodeURIComponent(adminComponentType)}/revisions`,
  {
    method: 'POST',
    admin: true,
    body: JSON.stringify(
      publicationBody('admin-request-1', null, 'Admin fixture', 1, adminComponentType),
    ),
  },
)
assert.equal(adminPublication.response.status, 201)
assert.equal(adminPublication.body.componentType, adminComponentType)
assert.equal(adminPublication.body.revision, 1)

console.log(
  'Publication API checks passed: public reads stay anonymous, browser login creates an opaque HttpOnly database-backed session with explicit identity, session-authenticated writes preserve immutable revision/idempotency/conflict semantics, logout revokes the session, and the admin bearer remains a separate server/CI channel.',
)
