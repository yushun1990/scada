import {
  assertRepositoryRecord,
  type ComponentRepositoryRecord,
  type LocalRepositoryBundle,
  type SceneRepositoryRecord,
} from './repositories'

export const DEBUG_SNAPSHOT_SCHEMA_VERSION = 1 as const

export type DebugSnapshotRecord = {
  id: string
  updatedAt: string
  document: unknown
}

export type LocalDebugSnapshot = {
  schemaVersion: typeof DEBUG_SNAPSHOT_SCHEMA_VERSION
  scenes: readonly DebugSnapshotRecord[]
  components: readonly DebugSnapshotRecord[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertJsonValue(value: unknown, label: string): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} contains a non-finite number`)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      assertJsonValue(entry, `${label}[${index}]`)
    }
    return
  }

  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertJsonValue(entry, `${label}.${key}`)
    }
    return
  }

  throw new Error(`${label} contains a non-JSON value`)
}

function parseSnapshotRecords(value: unknown, label: string): DebugSnapshotRecord[] {
  if (!Array.isArray(value)) {
    throw new Error(`Debug snapshot ${label} must be an array`)
  }

  const ids = new Set<string>()

  return value.map((candidate, index) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      !candidate.id ||
      typeof candidate.updatedAt !== 'string' ||
      !Object.hasOwn(candidate, 'document')
    ) {
      throw new Error(`Debug snapshot ${label}[${index}] is invalid`)
    }

    if (ids.has(candidate.id)) {
      throw new Error(`Debug snapshot ${label} has duplicate id: ${candidate.id}`)
    }
    ids.add(candidate.id)
    assertJsonValue(candidate.document, `Debug snapshot ${label}[${index}].document`)

    return {
      id: candidate.id,
      updatedAt: candidate.updatedAt,
      document: structuredClone(candidate.document),
    }
  })
}

export function parseLocalDebugSnapshot(value: unknown): LocalDebugSnapshot {
  if (!isRecord(value) || value.schemaVersion !== DEBUG_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error('Debug snapshot schema version is unsupported')
  }

  return {
    schemaVersion: DEBUG_SNAPSHOT_SCHEMA_VERSION,
    scenes: parseSnapshotRecords(value.scenes, 'scenes'),
    components: parseSnapshotRecords(value.components, 'components'),
  }
}

function repositoryRecordToSnapshotRecord(
  record: SceneRepositoryRecord | ComponentRepositoryRecord,
): DebugSnapshotRecord {
  assertRepositoryRecord(record, 'Debug snapshot export')

  let document: unknown
  try {
    document = JSON.parse(record.document)
  } catch {
    throw new Error(`Repository record ${record.id} does not contain valid JSON`)
  }
  assertJsonValue(document, `Repository record ${record.id}`)

  return {
    id: record.id,
    updatedAt: record.updatedAt,
    document,
  }
}

function snapshotRecordToRepositoryRecord(
  record: DebugSnapshotRecord,
): SceneRepositoryRecord | ComponentRepositoryRecord {
  return {
    id: record.id,
    updatedAt: record.updatedAt,
    document: JSON.stringify(record.document),
  }
}

export async function exportLocalDebugSnapshot(
  repositories: LocalRepositoryBundle,
): Promise<LocalDebugSnapshot> {
  const [scenes, components] = await Promise.all([
    repositories.scenes.list(),
    repositories.components.list(),
  ])

  return {
    schemaVersion: DEBUG_SNAPSHOT_SCHEMA_VERSION,
    scenes: scenes
      .map(repositoryRecordToSnapshotRecord)
      .sort((left, right) => left.id.localeCompare(right.id)),
    components: components
      .map(repositoryRecordToSnapshotRecord)
      .sort((left, right) => left.id.localeCompare(right.id)),
  }
}

export async function importLocalDebugSnapshot(
  repositories: LocalRepositoryBundle,
  value: unknown,
) {
  const snapshot = parseLocalDebugSnapshot(value)
  const scenes = snapshot.scenes.map(snapshotRecordToRepositoryRecord)
  const components = snapshot.components.map(snapshotRecordToRepositoryRecord)

  // Validation is complete before either repository is mutated. IndexedDB will
  // later provide one physical transaction for these logical replacements.
  await repositories.scenes.replaceAll(scenes as SceneRepositoryRecord[])
  await repositories.components.replaceAll(components as ComponentRepositoryRecord[])
}

export async function resetLocalRepositories(repositories: LocalRepositoryBundle) {
  await Promise.all([
    repositories.scenes.clear(),
    repositories.components.clear(),
  ])
}
