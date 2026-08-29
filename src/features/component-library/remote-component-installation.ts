import type {
  InstalledRemoteComponentRepository,
  InstalledRemoteComponentRepositoryRecord,
} from '../../storage/repositories'
import {
  cloneComponentLibraryEntry,
  parseComponentLibraryDocument,
  serializeComponentLibraryDocument,
  type ComponentLibraryEntry,
} from './component-document'
import type {
  RemoteComponentInstallCandidate,
  RemoteComponentPublicationSource,
} from './remote-component-repository'

export const INSTALLED_REMOTE_COMPONENT_SCHEMA_VERSION = 1 as const

export type InstalledRemoteComponent = {
  schemaVersion: typeof INSTALLED_REMOTE_COMPONENT_SCHEMA_VERSION
  source: RemoteComponentPublicationSource
  entry: ComponentLibraryEntry
  installedAt: string
}

export type InstalledRemoteActivationConflict = {
  packageId: string
  componentType: string
  message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function cloneSource(
  source: RemoteComponentPublicationSource,
): RemoteComponentPublicationSource {
  return { ...source }
}

export function cloneInstalledRemoteComponent(
  installed: InstalledRemoteComponent,
): InstalledRemoteComponent {
  return {
    schemaVersion: INSTALLED_REMOTE_COMPONENT_SCHEMA_VERSION,
    source: cloneSource(installed.source),
    entry: cloneComponentLibraryEntry(installed.entry),
    installedAt: installed.installedAt,
  }
}

function validateInstalledRemoteComponent(
  installed: InstalledRemoteComponent,
): InstalledRemoteComponent {
  const { source, entry } = installed

  if (
    installed.schemaVersion !== INSTALLED_REMOTE_COMPONENT_SCHEMA_VERSION ||
    source.kind !== 'remote-publication' ||
    !isNonEmptyString(source.componentType) ||
    !isPositiveInteger(source.revision) ||
    !isNonEmptyString(source.revisionId) ||
    !isNonEmptyString(source.publishedAt) ||
    !isNonEmptyString(installed.installedAt)
  ) {
    throw new Error('Installed remote component metadata is invalid')
  }

  // Re-run the accepted local package codec. Installed remote artifacts remain
  // immutable distribution data, not trusted editable authoring documents.
  serializeComponentLibraryDocument(entry)

  if (
    entry.builtIn ||
    entry.status !== 'ready' ||
    entry.definition.type !== source.componentType ||
    entry.id !== `published:${source.revisionId}` ||
    entry.updatedAt !== source.publishedAt
  ) {
    throw new Error('Installed remote component provenance does not match its package')
  }

  return cloneInstalledRemoteComponent(installed)
}

export function createInstalledRemoteComponent(
  candidate: RemoteComponentInstallCandidate,
  installedAt = new Date().toISOString(),
): InstalledRemoteComponent {
  return validateInstalledRemoteComponent({
    schemaVersion: INSTALLED_REMOTE_COMPONENT_SCHEMA_VERSION,
    source: cloneSource(candidate.source),
    entry: cloneComponentLibraryEntry(candidate.entry),
    installedAt,
  })
}

export function serializeInstalledRemoteComponent(
  installed: InstalledRemoteComponent,
): string {
  return JSON.stringify(validateInstalledRemoteComponent(installed))
}

export function parseInstalledRemoteComponentDocument(
  raw: string,
): InstalledRemoteComponent | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  if (
    !isRecord(value) ||
    value.schemaVersion !== INSTALLED_REMOTE_COMPONENT_SCHEMA_VERSION ||
    !isRecord(value.source) ||
    value.source.kind !== 'remote-publication' ||
    !isNonEmptyString(value.source.componentType) ||
    !isPositiveInteger(value.source.revision) ||
    !isNonEmptyString(value.source.revisionId) ||
    !isNonEmptyString(value.source.publishedAt) ||
    !isNonEmptyString(value.installedAt)
  ) {
    return null
  }

  const entry = parseComponentLibraryDocument(JSON.stringify(value.entry))
  if (!entry) return null

  try {
    return validateInstalledRemoteComponent({
      schemaVersion: INSTALLED_REMOTE_COMPONENT_SCHEMA_VERSION,
      source: {
        kind: 'remote-publication',
        componentType: value.source.componentType,
        revision: value.source.revision,
        revisionId: value.source.revisionId,
        publishedAt: value.source.publishedAt,
      },
      entry,
      installedAt: value.installedAt,
    })
  } catch {
    return null
  }
}

export function installedRemoteComponentToRepositoryRecord(
  installed: InstalledRemoteComponent,
): InstalledRemoteComponentRepositoryRecord {
  const normalized = validateInstalledRemoteComponent(installed)
  return {
    // One installed revision per component type. An explicit install of another
    // immutable revision replaces this cache slot, including an intentional rollback.
    id: normalized.source.componentType,
    document: serializeInstalledRemoteComponent(normalized),
    updatedAt: normalized.installedAt,
  }
}

export async function persistRemoteComponentInstallation(
  repository: InstalledRemoteComponentRepository,
  candidate: RemoteComponentInstallCandidate,
  installedAt = new Date().toISOString(),
): Promise<{ installed: InstalledRemoteComponent; changed: boolean }> {
  const componentType = candidate.source.componentType
  const existingRecord = await repository.get(componentType)
  const existing = existingRecord
    ? parseInstalledRemoteComponentDocument(existingRecord.document)
    : null

  if (
    existing &&
    existing.source.revision === candidate.source.revision &&
    existing.source.revisionId === candidate.source.revisionId &&
    serializeComponentLibraryDocument(existing.entry) ===
      serializeComponentLibraryDocument(candidate.entry)
  ) {
    return { installed: cloneInstalledRemoteComponent(existing), changed: false }
  }

  const installed = createInstalledRemoteComponent(candidate, installedAt)
  await repository.put(installedRemoteComponentToRepositoryRecord(installed))
  return { installed: cloneInstalledRemoteComponent(installed), changed: true }
}

export async function removeRemoteComponentInstallation(
  repository: InstalledRemoteComponentRepository,
  componentType: string,
): Promise<boolean> {
  const normalizedType = componentType.trim()
  if (!normalizedType) throw new Error('Installed component type cannot be empty')

  const existing = await repository.get(normalizedType)
  if (!existing) return false
  await repository.delete(normalizedType)
  return true
}

export async function loadInstalledRemoteComponents(
  repository: InstalledRemoteComponentRepository,
): Promise<{
  installed: readonly InstalledRemoteComponent[]
  invalidRecordIds: readonly string[]
}> {
  const installed: InstalledRemoteComponent[] = []
  const invalidRecordIds: string[] = []

  for (const record of await repository.list()) {
    const parsed = parseInstalledRemoteComponentDocument(record.document)
    if (!parsed || parsed.source.componentType !== record.id) {
      invalidRecordIds.push(record.id)
      continue
    }
    installed.push(parsed)
  }

  installed.sort((left, right) =>
    left.source.componentType.localeCompare(right.source.componentType),
  )
  invalidRecordIds.sort((left, right) => left.localeCompare(right))
  return { installed, invalidRecordIds }
}

/**
 * Resolve historical/imported collisions deterministically without pretending
 * an installed immutable revision is the same thing as an editable local package.
 * Normal install/save operations reject these collisions before they are created.
 */
export function selectInstalledRemoteActivationEntries(
  localEntries: readonly ComponentLibraryEntry[],
  installed: readonly InstalledRemoteComponent[],
): {
  entries: readonly ComponentLibraryEntry[]
  conflicts: readonly InstalledRemoteActivationConflict[]
} {
  const localTypes = new Set(localEntries.map((entry) => entry.definition.type))
  const entries: ComponentLibraryEntry[] = []
  const conflicts: InstalledRemoteActivationConflict[] = []

  for (const artifact of installed
    .slice()
    .sort((left, right) =>
      left.source.componentType.localeCompare(right.source.componentType),
    )) {
    const componentType = artifact.source.componentType
    if (localTypes.has(componentType)) {
      conflicts.push({
        packageId: artifact.entry.id,
        componentType,
        message: `Installed remote component is shadowed by local authored package: ${componentType}`,
      })
      continue
    }
    entries.push(cloneComponentLibraryEntry(artifact.entry))
  }

  return { entries, conflicts }
}
