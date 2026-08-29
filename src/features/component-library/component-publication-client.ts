import { browserPersistence, ensureBrowserPersistenceReady } from '../../storage/browser-persistence'
import {
  createComponentPublicationRequest,
  parsePublishedComponentRevision,
  type ComponentPublicationRequest,
  type PublishedComponentRevision,
} from './publication-contract'
import type { ComponentLibraryEntry } from './component-document'
import type { RemoteComponentRepository } from './remote-component-repository'

export type ComponentPublicationIdentity = {
  id: string
  displayName: string
}

export type ComponentPublicationSession =
  | { authenticated: false }
  | { authenticated: true; identity: ComponentPublicationIdentity }

export type ComponentPublicationObservation = {
  componentType: string
  revision: number | null
  revisionId: string | null
  observedAt: string
}

export interface ComponentPublicationObservationStore {
  get(componentType: string): Promise<ComponentPublicationObservation | null>
  put(observation: ComponentPublicationObservation): Promise<void>
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export class ComponentPublicationClientError extends Error {
  readonly status: number | null
  readonly code: string | null
  readonly currentRevision: number | null | undefined

  constructor(
    message: string,
    options: {
      status?: number | null
      code?: string | null
      currentRevision?: number | null
      cause?: unknown
    } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ComponentPublicationClientError'
    this.status = options.status ?? null
    this.code = options.code ?? null
    this.currentRevision = options.currentRevision
  }
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) throw new Error('Component publication API base URL cannot be empty')
  return trimmed
}

function encodeComponentType(componentType: string) {
  const trimmed = componentType.trim()
  if (!trimmed) throw new Error('Component type cannot be empty')
  return encodeURIComponent(trimmed)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseIdentity(value: unknown): ComponentPublicationIdentity | null {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || !value.id.trim()
    || typeof value.displayName !== 'string'
    || !value.displayName.trim()
  ) {
    return null
  }
  return { id: value.id, displayName: value.displayName }
}

function parseSession(value: unknown): ComponentPublicationSession | null {
  if (!isRecord(value) || typeof value.authenticated !== 'boolean') return null
  if (!value.authenticated) return { authenticated: false }
  const identity = parseIdentity(value.identity)
  return identity ? { authenticated: true, identity } : null
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (cause) {
    throw new ComponentPublicationClientError(
      'Publication service returned invalid JSON',
      { status: response.status, cause },
    )
  }
}

function parseCurrentRevision(value: unknown) {
  if (!isRecord(value)) return undefined
  if (value.currentRevision === null) return null
  return Number.isInteger(value.currentRevision) && Number(value.currentRevision) > 0
    ? Number(value.currentRevision)
    : undefined
}

async function responseError(response: Response) {
  let value: unknown = null
  try {
    value = await response.json()
  } catch {
    // HTTP status remains authoritative when no JSON error payload exists.
  }
  const code = isRecord(value) && typeof value.error === 'string'
    ? value.error
    : null
  return new ComponentPublicationClientError(
    `Publication service request failed with HTTP ${response.status}`,
    {
      status: response.status,
      code,
      currentRevision: parseCurrentRevision(value),
    },
  )
}

/**
 * Browser-safe publication transport. It deliberately has no token option:
 * credentials are the browser-managed HttpOnly session cookie only.
 */
export class HttpComponentPublicationClient {
  private readonly baseUrl: string
  private readonly fetcher: FetchLike

  constructor(baseUrl: string, options: { fetcher?: FetchLike } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  }

  async getSession(): Promise<ComponentPublicationSession> {
    const response = await this.fetcher(`${this.baseUrl}/api/auth/session`, {
      method: 'GET',
      credentials: 'include',
    })
    if (!response.ok) throw await responseError(response)
    const session = parseSession(await readJson(response))
    if (!session) {
      throw new ComponentPublicationClientError(
        'Publication service returned an invalid session response',
        { status: response.status },
      )
    }
    return session
  }

  async login(username: string, password: string): Promise<ComponentPublicationSession> {
    const response = await this.fetcher(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!response.ok) throw await responseError(response)
    const session = parseSession(await readJson(response))
    if (!session?.authenticated) {
      throw new ComponentPublicationClientError(
        'Publication service did not create an authenticated session',
        { status: response.status },
      )
    }
    return session
  }

  async logout(): Promise<ComponentPublicationSession> {
    const response = await this.fetcher(`${this.baseUrl}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!response.ok) throw await responseError(response)
    const session = parseSession(await readJson(response))
    if (!session || session.authenticated) {
      throw new ComponentPublicationClientError(
        'Publication service returned an invalid logout response',
        { status: response.status },
      )
    }
    return session
  }

  async publish(request: ComponentPublicationRequest): Promise<PublishedComponentRevision> {
    const response = await this.fetcher(
      `${this.baseUrl}/api/component-publications/${encodeComponentType(request.componentType)}/revisions`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      },
    )
    if (!response.ok) throw await responseError(response)

    const revision = parsePublishedComponentRevision(await readJson(response))
    if (!revision) {
      throw new ComponentPublicationClientError(
        'Publication service returned an invalid published revision',
        { status: response.status },
      )
    }
    return revision
  }
}

const PUBLICATION_OBSERVATION_META_PREFIX = 'component-publication-observation-v1:'

function publicationObservationKey(componentType: string) {
  return `${PUBLICATION_OBSERVATION_META_PREFIX}${componentType}`
}

function parsePublicationObservation(value: unknown): ComponentPublicationObservation | null {
  if (
    !isRecord(value)
    || typeof value.componentType !== 'string'
    || !value.componentType.trim()
    || !(value.revision === null || (Number.isInteger(value.revision) && Number(value.revision) > 0))
    || !(value.revisionId === null || (typeof value.revisionId === 'string' && value.revisionId.trim()))
    || typeof value.observedAt !== 'string'
    || !value.observedAt.trim()
  ) {
    return null
  }

  if ((value.revision === null) !== (value.revisionId === null)) return null
  return {
    componentType: value.componentType,
    revision: value.revision as number | null,
    revisionId: value.revisionId as string | null,
    observedAt: value.observedAt,
  }
}

export const browserComponentPublicationObservationStore: ComponentPublicationObservationStore = {
  async get(componentType) {
    await ensureBrowserPersistenceReady()
    return parsePublicationObservation(
      await browserPersistence.getMeta(publicationObservationKey(componentType)),
    )
  },
  async put(observation) {
    await ensureBrowserPersistenceReady()
    await browserPersistence.setMeta(
      publicationObservationKey(observation.componentType),
      { ...observation },
    )
  },
}

export async function loadComponentPublicationObservation(
  componentType: string,
  store: ComponentPublicationObservationStore = browserComponentPublicationObservationStore,
): Promise<ComponentPublicationObservation | null> {
  return store.get(componentType)
}

async function saveComponentPublicationObservation(
  observation: ComponentPublicationObservation,
  store: ComponentPublicationObservationStore,
) {
  await store.put(observation)
  return { ...observation }
}

export async function observeLatestComponentPublication(
  componentType: string,
  repository: RemoteComponentRepository,
  store: ComponentPublicationObservationStore = browserComponentPublicationObservationStore,
): Promise<ComponentPublicationObservation> {
  const latest = await repository.getLatest(componentType)
  return saveComponentPublicationObservation({
    componentType,
    revision: latest?.revision ?? null,
    revisionId: latest?.revisionId ?? null,
    observedAt: new Date().toISOString(),
  }, store)
}

export async function publishComponentExplicitly(
  component: ComponentLibraryEntry,
  options: {
    client: HttpComponentPublicationClient
    remoteRepository: RemoteComponentRepository
    observationStore?: ComponentPublicationObservationStore
    requestId?: string
  },
): Promise<{
  revision: PublishedComponentRevision
  observation: ComponentPublicationObservation
}> {
  const store = options.observationStore ?? browserComponentPublicationObservationStore
  let observation = await loadComponentPublicationObservation(
    component.definition.type,
    store,
  )
  if (!observation) {
    observation = await observeLatestComponentPublication(
      component.definition.type,
      options.remoteRepository,
      store,
    )
  }

  const requestId = options.requestId
    ?? globalThis.crypto?.randomUUID?.()
    ?? `publish-${Date.now()}-${Math.random()}`
  const request = createComponentPublicationRequest(component, {
    requestId,
    baseRevision: observation.revision,
  })

  // A conflict is intentionally allowed to escape without mutating the stored
  // observation. The user must explicitly observe the remote head before a
  // later publish can use a newer baseRevision.
  const revision = await options.client.publish(request)
  const nextObservation = await saveComponentPublicationObservation({
    componentType: revision.componentType,
    revision: revision.revision,
    revisionId: revision.revisionId,
    observedAt: new Date().toISOString(),
  }, store)

  return { revision, observation: nextObservation }
}
