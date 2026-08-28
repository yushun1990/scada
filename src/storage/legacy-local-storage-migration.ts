import type {
  ComponentRepositoryRecord,
  SceneRepositoryRecord,
} from './repositories'

export const LEGACY_WORKS_STORAGE_KEY = 'scada-editor-lab.works.v1' as const
export const LEGACY_COMPONENTS_V2_STORAGE_KEY = 'scada-editor-lab.components.v2' as const
export const LEGACY_COMPONENTS_V1_STORAGE_KEY = 'scada-editor-lab.components.v1' as const
export const LEGACY_GLOBAL_SCENE_KEYS = [
  'scada-editor-lab.scene.v4',
  'scada-editor-lab.scene.v3',
  'scada-editor-lab.scene.v2',
  'scada-editor-lab.scene.v1',
] as const

const SCENE_STORAGE_PREFIX = 'scada-editor-lab.work.'
const LEGACY_FALLBACK_UPDATED_AT = '1970-01-01T00:00:00.000Z'

export type LegacyStorageReader = {
  getItem(key: string): string | null
}

export type LegacyMigrationNormalizers = {
  normalizeSceneDocument(raw: string): string | null
  normalizeComponentDocument(raw: string): string | null
}

export type LegacyLocalStorageMigrationPlan = {
  scenes: readonly SceneRepositoryRecord[]
  components: readonly ComponentRepositoryRecord[]
  sourceKeys: readonly string[]
  skippedKeys: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function sceneKey(workId: string) {
  return `${SCENE_STORAGE_PREFIX}${workId}.scene.v4`
}

function collectScenes(
  storage: LegacyStorageReader,
  normalizers: LegacyMigrationNormalizers,
  sourceKeys: string[],
  skippedKeys: string[],
): SceneRepositoryRecord[] {
  const worksRaw = storage.getItem(LEGACY_WORKS_STORAGE_KEY)
  const worksValue = worksRaw ? parseJson(worksRaw) : undefined
  const records: SceneRepositoryRecord[] = []
  const ids = new Set<string>()

  if (Array.isArray(worksValue)) {
    sourceKeys.push(LEGACY_WORKS_STORAGE_KEY)

    for (const candidate of worksValue) {
      if (
        !isRecord(candidate) ||
        typeof candidate.id !== 'string' ||
        !candidate.id ||
        typeof candidate.updatedAt !== 'string' ||
        ids.has(candidate.id)
      ) {
        continue
      }

      const key = sceneKey(candidate.id)
      const raw = storage.getItem(key)
      if (!raw) continue
      const document = normalizers.normalizeSceneDocument(raw)
      if (!document) {
        skippedKeys.push(key)
        continue
      }

      ids.add(candidate.id)
      sourceKeys.push(key)
      records.push({
        id: candidate.id,
        document,
        updatedAt: candidate.updatedAt,
      })
    }
  } else if (worksRaw) {
    skippedKeys.push(LEGACY_WORKS_STORAGE_KEY)
  }

  if (records.length > 0) {
    return records.sort((left, right) => left.id.localeCompare(right.id))
  }

  for (const key of LEGACY_GLOBAL_SCENE_KEYS) {
    const raw = storage.getItem(key)
    if (!raw) continue
    const document = normalizers.normalizeSceneDocument(raw)
    if (!document) {
      skippedKeys.push(key)
      continue
    }

    sourceKeys.push(key)
    return [{
      id: 'legacy',
      document,
      updatedAt: LEGACY_FALLBACK_UPDATED_AT,
    }]
  }

  return []
}

function collectComponents(
  storage: LegacyStorageReader,
  normalizers: LegacyMigrationNormalizers,
  sourceKeys: string[],
  skippedKeys: string[],
): ComponentRepositoryRecord[] {
  const currentRaw = storage.getItem(LEGACY_COMPONENTS_V2_STORAGE_KEY)
  const legacyRaw = storage.getItem(LEGACY_COMPONENTS_V1_STORAGE_KEY)
  const selectedKey = currentRaw
    ? LEGACY_COMPONENTS_V2_STORAGE_KEY
    : legacyRaw
      ? LEGACY_COMPONENTS_V1_STORAGE_KEY
      : null
  const selectedRaw = currentRaw ?? legacyRaw

  if (!selectedKey || !selectedRaw) return []

  const value = parseJson(selectedRaw)
  if (!Array.isArray(value)) {
    skippedKeys.push(selectedKey)
    return []
  }

  sourceKeys.push(selectedKey)
  const ids = new Set<string>()
  const records: ComponentRepositoryRecord[] = []

  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      !candidate.id ||
      candidate.builtIn === true ||
      ids.has(candidate.id)
    ) {
      continue
    }

    const raw = JSON.stringify(candidate)
    const document = normalizers.normalizeComponentDocument(raw)
    if (!document) continue

    ids.add(candidate.id)
    records.push({
      id: candidate.id,
      document,
      updatedAt: typeof candidate.updatedAt === 'string'
        ? candidate.updatedAt
        : LEGACY_FALLBACK_UPDATED_AT,
    })
  }

  return records.sort((left, right) => left.id.localeCompare(right.id))
}

export function planLegacyLocalStorageMigration(
  storage: LegacyStorageReader,
  normalizers: LegacyMigrationNormalizers,
): LegacyLocalStorageMigrationPlan {
  const sourceKeys: string[] = []
  const skippedKeys: string[] = []
  const scenes = collectScenes(storage, normalizers, sourceKeys, skippedKeys)
  const components = collectComponents(
    storage,
    normalizers,
    sourceKeys,
    skippedKeys,
  )

  return {
    scenes,
    components,
    sourceKeys: [...new Set(sourceKeys)].sort(),
    skippedKeys: [...new Set(skippedKeys)].sort(),
  }
}
