import {
  parseComponentLibraryDocument,
  serializeComponentLibraryDocument,
} from '../features/component-library/component-document'
import {
  parseInstalledRemoteComponentDocument,
  serializeInstalledRemoteComponent,
} from '../features/component-library/remote-component-installation'
import {
  parseSceneDocument,
  serializeSceneDocument,
} from '../scene/validation'
import {
  DEBUG_SNAPSHOT_SCHEMA_VERSION,
  exportLocalDebugSnapshot,
  parseLocalDebugSnapshot,
  type LocalDebugSnapshot,
} from './debug-snapshot'
import {
  IndexedDbLocalStorage,
  LEGACY_MIGRATION_META_KEY,
  type IndexedDbStorageDiagnostics,
} from './indexeddb-repositories'
import {
  planLegacyLocalStorageMigration,
  type LegacyLocalStorageMigrationPlan,
} from './legacy-local-storage-migration'
import type {
  ComponentRepositoryRecord,
  InstalledRemoteComponentRepositoryRecord,
  SceneRepositoryRecord,
} from './repositories'

export type LegacyMigrationStatus = {
  status: 'migrated' | 'no-legacy-data' | 'skipped-existing-indexeddb-data' | 'reset'
  migratedAt: string
  sceneCount: number
  componentCount: number
  sourceKeys: readonly string[]
  skippedKeys: readonly string[]
}

export type BrowserStorageDiagnostics = IndexedDbStorageDiagnostics & {
  ready: true
}

export const browserPersistence = new IndexedDbLocalStorage()

function normalizeSceneDocument(raw: string) {
  try {
    return serializeSceneDocument(parseSceneDocument(raw))
  } catch {
    return null
  }
}

function normalizeComponentDocument(raw: string) {
  const component = parseComponentLibraryDocument(raw)
  if (!component) return null

  try {
    return serializeComponentLibraryDocument(component)
  } catch {
    return null
  }
}

function migrationStatus(
  status: LegacyMigrationStatus['status'],
  plan: LegacyLocalStorageMigrationPlan,
): LegacyMigrationStatus {
  return {
    status,
    migratedAt: new Date().toISOString(),
    sceneCount: plan.scenes.length,
    componentCount: plan.components.length,
    sourceKeys: [...plan.sourceKeys],
    skippedKeys: [...plan.skippedKeys],
  }
}

let readyPromise: Promise<void> | null = null

export function ensureBrowserPersistenceReady() {
  if (readyPromise) return readyPromise

  readyPromise = (async () => {
    const existingMigration = await browserPersistence.getMeta(
      LEGACY_MIGRATION_META_KEY,
    )
    if (existingMigration !== undefined) return

    const diagnostics = await browserPersistence.diagnostics()
    if (
      diagnostics.sceneCount > 0 ||
      diagnostics.componentCount > 0 ||
      diagnostics.installedRemoteComponentCount > 0
    ) {
      await browserPersistence.setMeta(
        LEGACY_MIGRATION_META_KEY,
        {
          status: 'skipped-existing-indexeddb-data',
          migratedAt: new Date().toISOString(),
          sceneCount: diagnostics.sceneCount,
          componentCount: diagnostics.componentCount,
          sourceKeys: [],
          skippedKeys: [],
        } satisfies LegacyMigrationStatus,
      )
      return
    }

    const plan = planLegacyLocalStorageMigration(window.localStorage, {
      normalizeSceneDocument,
      normalizeComponentDocument,
    })

    await browserPersistence.replaceAll(plan.scenes, plan.components, [])
    await browserPersistence.setMeta(
      LEGACY_MIGRATION_META_KEY,
      migrationStatus(
        plan.scenes.length > 0 || plan.components.length > 0
          ? 'migrated'
          : 'no-legacy-data',
        plan,
      ),
    )
  })().catch((error) => {
    readyPromise = null
    throw error
  })

  return readyPromise
}

export async function getBrowserStorageDiagnostics(): Promise<BrowserStorageDiagnostics> {
  await ensureBrowserPersistenceReady()
  return {
    ...(await browserPersistence.diagnostics()),
    ready: true,
  }
}

export async function exportBrowserDebugSnapshot(): Promise<LocalDebugSnapshot> {
  await ensureBrowserPersistenceReady()
  return exportLocalDebugSnapshot(browserPersistence.repositories)
}

function toSceneRecord(
  record: LocalDebugSnapshot['scenes'][number],
): SceneRepositoryRecord {
  const document = normalizeSceneDocument(JSON.stringify(record.document))
  if (!document) {
    throw new Error(`Debug snapshot scene ${record.id} is invalid`)
  }
  return { id: record.id, updatedAt: record.updatedAt, document }
}

function toComponentRecord(
  record: LocalDebugSnapshot['components'][number],
): ComponentRepositoryRecord {
  const document = normalizeComponentDocument(JSON.stringify(record.document))
  if (!document) {
    throw new Error(`Debug snapshot component ${record.id} is invalid`)
  }
  return { id: record.id, updatedAt: record.updatedAt, document }
}

function toInstalledRemoteComponentRecord(
  record: LocalDebugSnapshot['installedRemoteComponents'][number],
): InstalledRemoteComponentRepositoryRecord {
  const installed = parseInstalledRemoteComponentDocument(
    JSON.stringify(record.document),
  )
  if (!installed || installed.source.componentType !== record.id) {
    throw new Error(`Debug snapshot installed remote component ${record.id} is invalid`)
  }

  return {
    id: record.id,
    updatedAt: record.updatedAt,
    document: serializeInstalledRemoteComponent(installed),
  }
}

export async function importBrowserDebugSnapshot(value: unknown) {
  await ensureBrowserPersistenceReady()
  const snapshot = parseLocalDebugSnapshot(value)
  if (snapshot.schemaVersion !== DEBUG_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error('Unsupported debug snapshot schema')
  }

  const scenes = snapshot.scenes.map(toSceneRecord)
  const components = snapshot.components.map(toComponentRecord)
  const installedRemoteComponents = snapshot.installedRemoteComponents.map(
    toInstalledRemoteComponentRecord,
  )
  await browserPersistence.replaceAll(
    scenes,
    components,
    installedRemoteComponents,
  )
}

export async function resetBrowserPersistence() {
  await ensureBrowserPersistenceReady()
  await browserPersistence.reset()
  await browserPersistence.setMeta(
    LEGACY_MIGRATION_META_KEY,
    {
      status: 'reset',
      migratedAt: new Date().toISOString(),
      sceneCount: 0,
      componentCount: 0,
      sourceKeys: [],
      skippedKeys: [],
    } satisfies LegacyMigrationStatus,
  )
}
