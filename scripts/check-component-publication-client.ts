import assert from 'node:assert/strict'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import {
  COMPONENT_PACKAGE_VERSION,
  type ComponentLibraryEntry,
} from '../src/features/component-library/component-document'
import {
  ComponentPublicationClientError,
  HttpComponentPublicationClient,
  observeLatestComponentPublication,
  publishComponentExplicitly,
  type ComponentPublicationObservation,
  type ComponentPublicationObservationStore,
} from '../src/features/component-library/component-publication-client'
import type {
  PublishedComponentRevision,
} from '../src/features/component-library/publication-contract'
import type { RemoteComponentRepository } from '../src/features/component-library/remote-component-repository'

const COMPONENT_TYPE = 'custom.browser-publish-fixture'

const component: ComponentLibraryEntry = {
  version: COMPONENT_PACKAGE_VERSION,
  id: 'component-browser-publish-fixture',
  definition: {
    type: COMPONENT_TYPE,
    title: 'Browser Publish Fixture',
    category: 'Fixture',
    description: '',
    size: {
      defaultWidth: 80,
      defaultHeight: 48,
      minWidth: 20,
      minHeight: 16,
    },
    properties: {},
    actions: {},
    events: {},
    anchors: [],
  },
  visual: createEmptyCompositeVisual(),
  status: 'ready',
  implementationDraft: '',
  updatedAt: '2026-08-29T05:00:00.000Z',
  builtIn: false,
}

function publishedRevision(
  revision: number,
  revisionId: string,
  requestId = `request-${revision}`,
): PublishedComponentRevision {
  return {
    schemaVersion: 1,
    revisionId,
    requestId,
    componentType: COMPONENT_TYPE,
    revision,
    package: {
      packageVersion: COMPONENT_PACKAGE_VERSION,
      definition: structuredClone(component.definition),
      visual: structuredClone(component.visual),
      implementationDraft: component.implementationDraft,
    },
    publishedAt: `2026-08-29T05:0${revision}:00.000Z`,
  }
}

const transportCalls: Array<{ url: string; init?: RequestInit }> = []
const transportClient = new HttpComponentPublicationClient('https://api.example.test/', {
  fetcher: async (input, init) => {
    const url = String(input)
    transportCalls.push({ url, init })
    if (url.endsWith('/api/auth/session')) {
      return Response.json({
        authenticated: true,
        identity: { id: 'local:author', displayName: 'author' },
      })
    }
    if (url.endsWith('/api/auth/login')) {
      return Response.json({
        authenticated: true,
        identity: { id: 'local:author', displayName: 'author' },
      })
    }
    if (url.endsWith('/api/auth/logout')) {
      return Response.json({ authenticated: false })
    }
    throw new Error(`Unexpected transport URL: ${url}`)
  },
})

assert.equal((await transportClient.getSession()).authenticated, true)
assert.equal((await transportClient.login('author', 'secret')).authenticated, true)
assert.equal((await transportClient.logout()).authenticated, false)
assert.equal(transportCalls.length, 3)
for (const call of transportCalls) {
  assert.equal(call.init?.credentials, 'include')
  assert.equal(new Headers(call.init?.headers).has('authorization'), false)
}
assert.equal(
  JSON.parse(String(transportCalls[1]?.init?.body)).password,
  'secret',
)

const conflictClient = new HttpComponentPublicationClient('https://api.example.test', {
  fetcher: async () => Response.json(
    { error: 'publication_conflict', currentRevision: 7 },
    { status: 409 },
  ),
})
await assert.rejects(
  () => conflictClient.publish({
    schemaVersion: 1,
    requestId: 'conflict-request',
    componentType: COMPONENT_TYPE,
    baseRevision: 4,
    package: publishedRevision(4, 'rev-4').package,
  }),
  (error: unknown) => {
    assert.ok(error instanceof ComponentPublicationClientError)
    assert.equal(error.code, 'publication_conflict')
    assert.equal(error.currentRevision, 7)
    return true
  },
)

class MemoryObservationStore implements ComponentPublicationObservationStore {
  private readonly values = new Map<string, ComponentPublicationObservation>()

  async get(componentType: string) {
    const value = this.values.get(componentType)
    return value ? { ...value } : null
  }

  async put(observation: ComponentPublicationObservation) {
    this.values.set(observation.componentType, { ...observation })
  }
}

const observationStore = new MemoryObservationStore()
let latestRevision = publishedRevision(3, 'remote-rev-3')
let remoteReads = 0
const remoteRepository: RemoteComponentRepository = {
  listHeads: async () => [],
  getLatest: async () => {
    remoteReads += 1
    return structuredClone(latestRevision)
  },
  getRevision: async () => null,
}

const publicationRequests: unknown[] = []
let publishResultRevision = 4
const publicationClient = new HttpComponentPublicationClient('https://api.example.test', {
  fetcher: async (_input, init) => {
    const request = JSON.parse(String(init?.body))
    publicationRequests.push(request)
    return Response.json(
      publishedRevision(
        publishResultRevision,
        `published-rev-${publishResultRevision}`,
        request.requestId,
      ),
      { status: 201 },
    )
  },
})

const first = await publishComponentExplicitly(component, {
  client: publicationClient,
  remoteRepository,
  observationStore,
  requestId: 'explicit-first',
})
assert.equal(remoteReads, 1)
assert.equal((publicationRequests[0] as any).baseRevision, 3)
assert.equal(first.revision.revision, 4)
assert.equal((await observationStore.get(COMPONENT_TYPE))?.revision, 4)

publishResultRevision = 5
const second = await publishComponentExplicitly(component, {
  client: publicationClient,
  remoteRepository,
  observationStore,
  requestId: 'explicit-second',
})
assert.equal(remoteReads, 1)
assert.equal((publicationRequests[1] as any).baseRevision, 4)
assert.equal(second.revision.revision, 5)
assert.equal((await observationStore.get(COMPONENT_TYPE))?.revision, 5)

const staleObservation: ComponentPublicationObservation = {
  componentType: COMPONENT_TYPE,
  revision: 5,
  revisionId: 'published-rev-5',
  observedAt: '2026-08-29T06:00:00.000Z',
}
await observationStore.put(staleObservation)
const staleClient = new HttpComponentPublicationClient('https://api.example.test', {
  fetcher: async () => Response.json(
    { error: 'publication_conflict', currentRevision: 6 },
    { status: 409 },
  ),
})
await assert.rejects(
  () => publishComponentExplicitly(component, {
    client: staleClient,
    remoteRepository,
    observationStore,
    requestId: 'explicit-conflict',
  }),
  (error: unknown) => {
    assert.ok(error instanceof ComponentPublicationClientError)
    assert.equal(error.currentRevision, 6)
    return true
  },
)
assert.deepEqual(await observationStore.get(COMPONENT_TYPE), staleObservation)

latestRevision = publishedRevision(6, 'remote-rev-6')
const refreshed = await observeLatestComponentPublication(
  COMPONENT_TYPE,
  remoteRepository,
  observationStore,
)
assert.equal(refreshed.revision, 6)
assert.equal((await observationStore.get(COMPONENT_TYPE))?.revision, 6)
assert.equal(remoteReads, 2)

console.log(
  'Component publication client checks passed: browser transport uses cookie credentials without Authorization headers, conflict metadata is explicit, first publish observes a base revision, successful publish advances local observation, later publish reuses the persisted base without hidden latest reads, conflicts do not mutate that base, and only explicit refresh advances it.',
)
