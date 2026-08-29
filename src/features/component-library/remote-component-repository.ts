import {
  parseComponentPublicationHead,
  parsePublishedComponentRevision,
  publishedRevisionToLibraryEntry,
  type ComponentPublicationHead,
  type PublishedComponentRevision,
} from './publication-contract'
import {
  serializeComponentLibraryDocument,
  type ComponentLibraryEntry,
} from './component-document'

export type RemoteComponentPublicationSource = {
  kind: 'remote-publication'
  componentType: string
  revision: number
  revisionId: string
  publishedAt: string
}

export type RemoteComponentInstallCandidate = {
  source: RemoteComponentPublicationSource
  entry: ComponentLibraryEntry
}

export interface RemoteComponentRepository {
  listHeads(): Promise<readonly ComponentPublicationHead[]>
  getLatest(componentType: string): Promise<PublishedComponentRevision | null>
  getRevision(
    componentType: string,
    revision: number,
  ): Promise<PublishedComponentRevision | null>
}

export class RemoteComponentRepositoryError extends Error {
  readonly status: number | null
  readonly code: string | null

  constructor(
    message: string,
    options: {
      status?: number | null
      code?: string | null
      cause?: unknown
    } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'RemoteComponentRepositoryError'
    this.status = options.status ?? null
    this.code = options.code ?? null
  }
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

type HttpRemoteComponentRepositoryOptions = {
  fetcher?: FetchLike
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new Error('Remote component repository base URL cannot be empty')
  }
  return trimmed
}

function encodeComponentType(componentType: string) {
  const trimmed = componentType.trim()
  if (!trimmed) {
    throw new Error('Component type cannot be empty')
  }
  return encodeURIComponent(trimmed)
}

async function responseError(response: Response) {
  let code: string | null = null
  try {
    const value: unknown = await response.json()
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).error === 'string'
    ) {
      code = (value as Record<string, unknown>).error as string
    }
  } catch {
    // Preserve the HTTP status even when the server did not return JSON.
  }

  return new RemoteComponentRepositoryError(
    `Remote component repository request failed with HTTP ${response.status}`,
    { status: response.status, code },
  )
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (cause) {
    throw new RemoteComponentRepositoryError(
      'Remote component repository returned invalid JSON',
      { status: response.status, cause },
    )
  }
}

export class HttpRemoteComponentRepository implements RemoteComponentRepository {
  private readonly baseUrl: string
  private readonly fetcher: FetchLike

  constructor(
    baseUrl: string,
    options: HttpRemoteComponentRepositoryOptions = {},
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  }

  async listHeads(): Promise<readonly ComponentPublicationHead[]> {
    const response = await this.fetcher(
      `${this.baseUrl}/api/component-publications`,
      { method: 'GET' },
    )
    if (!response.ok) throw await responseError(response)

    const value = await readJson(response)
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      !Array.isArray((value as Record<string, unknown>).items)
    ) {
      throw new RemoteComponentRepositoryError(
        'Remote component repository returned an invalid publication list',
        { status: response.status },
      )
    }

    const items = (value as { items: unknown[] }).items
    const parsed = items.map(parseComponentPublicationHead)
    if (parsed.some((item) => item === null)) {
      throw new RemoteComponentRepositoryError(
        'Remote component repository returned an invalid publication head',
        { status: response.status },
      )
    }

    return parsed as ComponentPublicationHead[]
  }

  async getLatest(
    componentType: string,
  ): Promise<PublishedComponentRevision | null> {
    return this.readRevision(
      `/api/component-publications/${encodeComponentType(componentType)}`,
    )
  }

  async getRevision(
    componentType: string,
    revision: number,
  ): Promise<PublishedComponentRevision | null> {
    if (!Number.isInteger(revision) || revision <= 0) {
      throw new Error('Remote component revision must be a positive integer')
    }

    return this.readRevision(
      `/api/component-publications/${encodeComponentType(componentType)}/revisions/${revision}`,
    )
  }

  private async readRevision(
    path: string,
  ): Promise<PublishedComponentRevision | null> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: 'GET',
    })
    if (response.status === 404) return null
    if (!response.ok) throw await responseError(response)

    const value = await readJson(response)
    const revision = parsePublishedComponentRevision(value)
    if (!revision) {
      throw new RemoteComponentRepositoryError(
        'Remote component repository returned an invalid published revision',
        { status: response.status },
      )
    }
    return revision
  }
}

/**
 * Convert one already-validated immutable remote revision into an explicit
 * installation candidate. This does not persist or activate anything.
 *
 * Keeping provenance beside (rather than inside) ComponentLibraryEntry avoids
 * pretending remote revision identity is ordinary local authoring metadata.
 */
export function createRemoteComponentInstallCandidate(
  revision: PublishedComponentRevision,
): RemoteComponentInstallCandidate {
  const entry = publishedRevisionToLibraryEntry(revision)

  // Run the accepted local component codec as a second trust boundary before a
  // future install/cache step is allowed to treat the remote artifact as local.
  serializeComponentLibraryDocument(entry)

  return {
    source: {
      kind: 'remote-publication',
      componentType: revision.componentType,
      revision: revision.revision,
      revisionId: revision.revisionId,
      publishedAt: revision.publishedAt,
    },
    entry,
  }
}
