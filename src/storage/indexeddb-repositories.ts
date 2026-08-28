import type {
  ComponentRepository,
  ComponentRepositoryRecord,
  LocalRepositoryBundle,
  SceneRepository,
  SceneRepositoryRecord,
} from './repositories'

export const LOCAL_DATABASE_NAME = 'scada-editor-lab' as const
export const LOCAL_DATABASE_VERSION = 1 as const

const SCENES_STORE = 'scenes'
const COMPONENTS_STORE = 'components'
const META_STORE = 'meta'

export const LEGACY_MIGRATION_META_KEY = 'legacy-local-storage-migration-v1' as const

type StoreName = typeof SCENES_STORE | typeof COMPONENTS_STORE

type MetaRecord = {
  key: string
  value: unknown
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed')),
      { once: true },
    )
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB transaction aborted')),
      { once: true },
    )
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB transaction failed')),
      { once: true },
    )
  })
}

export function openLocalDatabase(
  factory: IDBFactory = globalThis.indexedDB,
): Promise<IDBDatabase> {
  if (!factory) {
    return Promise.reject(new Error('IndexedDB is not available in this environment'))
  }

  return new Promise((resolve, reject) => {
    const request = factory.open(LOCAL_DATABASE_NAME, LOCAL_DATABASE_VERSION)

    request.addEventListener('upgradeneeded', () => {
      const database = request.result

      if (!database.objectStoreNames.contains(SCENES_STORE)) {
        database.createObjectStore(SCENES_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(COMPONENTS_STORE)) {
        database.createObjectStore(COMPONENTS_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: 'key' })
      }
    })

    request.addEventListener('success', () => {
      const database = request.result
      database.addEventListener('versionchange', () => database.close())
      resolve(database)
    }, { once: true })
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('Failed to open IndexedDB')),
      { once: true },
    )
    request.addEventListener(
      'blocked',
      () => reject(new Error('IndexedDB upgrade is blocked by another open tab')),
      { once: true },
    )
  })
}

class IndexedDbRecordRepository<
  T extends SceneRepositoryRecord | ComponentRepositoryRecord,
> {
  constructor(
    private readonly database: Promise<IDBDatabase>,
    private readonly storeName: StoreName,
  ) {}

  protected async listRecords(): Promise<readonly T[]> {
    const database = await this.database
    const transaction = database.transaction(this.storeName, 'readonly')
    const result = await requestResult(transaction.objectStore(this.storeName).getAll())
    await transactionDone(transaction)
    return (result as T[])
      .map((record) => ({ ...record }))
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  protected async getRecord(id: string): Promise<T | null> {
    const database = await this.database
    const transaction = database.transaction(this.storeName, 'readonly')
    const result = await requestResult(transaction.objectStore(this.storeName).get(id))
    await transactionDone(transaction)
    return result ? { ...(result as T) } : null
  }

  protected async putRecord(record: T) {
    const database = await this.database
    const transaction = database.transaction(this.storeName, 'readwrite')
    transaction.objectStore(this.storeName).put({ ...record })
    await transactionDone(transaction)
  }

  protected async deleteRecord(id: string) {
    const database = await this.database
    const transaction = database.transaction(this.storeName, 'readwrite')
    transaction.objectStore(this.storeName).delete(id)
    await transactionDone(transaction)
  }

  protected async replaceAllRecords(records: readonly T[]) {
    const ids = new Set<string>()
    for (const record of records) {
      if (ids.has(record.id)) {
        throw new Error(`Duplicate repository record id: ${record.id}`)
      }
      ids.add(record.id)
    }

    const database = await this.database
    const transaction = database.transaction(this.storeName, 'readwrite')
    const store = transaction.objectStore(this.storeName)
    store.clear()
    for (const record of records) {
      store.put({ ...record })
    }
    await transactionDone(transaction)
  }

  protected async clearRecords() {
    const database = await this.database
    const transaction = database.transaction(this.storeName, 'readwrite')
    transaction.objectStore(this.storeName).clear()
    await transactionDone(transaction)
  }
}

export class IndexedDbSceneRepository
  extends IndexedDbRecordRepository<SceneRepositoryRecord>
  implements SceneRepository
{
  constructor(database: Promise<IDBDatabase>) {
    super(database, SCENES_STORE)
  }

  list = () => this.listRecords()
  get = (id: string) => this.getRecord(id)
  put = (record: SceneRepositoryRecord) => this.putRecord(record)
  delete = (id: string) => this.deleteRecord(id)
  replaceAll = (records: readonly SceneRepositoryRecord[]) => this.replaceAllRecords(records)
  clear = () => this.clearRecords()
}

export class IndexedDbComponentRepository
  extends IndexedDbRecordRepository<ComponentRepositoryRecord>
  implements ComponentRepository
{
  constructor(database: Promise<IDBDatabase>) {
    super(database, COMPONENTS_STORE)
  }

  list = () => this.listRecords()
  get = (id: string) => this.getRecord(id)
  put = (record: ComponentRepositoryRecord) => this.putRecord(record)
  delete = (id: string) => this.deleteRecord(id)
  replaceAll = (records: readonly ComponentRepositoryRecord[]) => this.replaceAllRecords(records)
  clear = () => this.clearRecords()
}

export type IndexedDbStorageDiagnostics = {
  databaseName: typeof LOCAL_DATABASE_NAME
  databaseVersion: typeof LOCAL_DATABASE_VERSION
  sceneCount: number
  componentCount: number
  legacyMigration: unknown
}

export class IndexedDbLocalStorage {
  readonly database: Promise<IDBDatabase>
  readonly scenes: SceneRepository
  readonly components: ComponentRepository

  constructor(factory: IDBFactory = globalThis.indexedDB) {
    this.database = openLocalDatabase(factory)
    this.scenes = new IndexedDbSceneRepository(this.database)
    this.components = new IndexedDbComponentRepository(this.database)
  }

  get repositories(): LocalRepositoryBundle {
    return { scenes: this.scenes, components: this.components }
  }

  async getMeta(key: string) {
    const database = await this.database
    const transaction = database.transaction(META_STORE, 'readonly')
    const result = await requestResult(transaction.objectStore(META_STORE).get(key))
    await transactionDone(transaction)
    return result ? (result as MetaRecord).value : undefined
  }

  async setMeta(key: string, value: unknown) {
    const database = await this.database
    const transaction = database.transaction(META_STORE, 'readwrite')
    transaction.objectStore(META_STORE).put({ key, value } satisfies MetaRecord)
    await transactionDone(transaction)
  }

  async replaceAll(
    scenes: readonly SceneRepositoryRecord[],
    components: readonly ComponentRepositoryRecord[],
  ) {
    const database = await this.database
    const transaction = database.transaction(
      [SCENES_STORE, COMPONENTS_STORE],
      'readwrite',
    )
    const sceneStore = transaction.objectStore(SCENES_STORE)
    const componentStore = transaction.objectStore(COMPONENTS_STORE)
    sceneStore.clear()
    componentStore.clear()
    for (const record of scenes) sceneStore.put({ ...record })
    for (const record of components) componentStore.put({ ...record })
    await transactionDone(transaction)
  }

  async reset() {
    const database = await this.database
    const transaction = database.transaction(
      [SCENES_STORE, COMPONENTS_STORE, META_STORE],
      'readwrite',
    )
    transaction.objectStore(SCENES_STORE).clear()
    transaction.objectStore(COMPONENTS_STORE).clear()
    transaction.objectStore(META_STORE).clear()
    await transactionDone(transaction)
  }

  async diagnostics(): Promise<IndexedDbStorageDiagnostics> {
    const database = await this.database
    const transaction = database.transaction(
      [SCENES_STORE, COMPONENTS_STORE, META_STORE],
      'readonly',
    )
    const scenes = requestResult(transaction.objectStore(SCENES_STORE).count())
    const components = requestResult(transaction.objectStore(COMPONENTS_STORE).count())
    const migration = requestResult(
      transaction.objectStore(META_STORE).get(LEGACY_MIGRATION_META_KEY),
    )
    const [sceneCount, componentCount, migrationRecord] = await Promise.all([
      scenes,
      components,
      migration,
    ])
    await transactionDone(transaction)

    return {
      databaseName: LOCAL_DATABASE_NAME,
      databaseVersion: LOCAL_DATABASE_VERSION,
      sceneCount,
      componentCount,
      legacyMigration: migrationRecord
        ? (migrationRecord as MetaRecord).value
        : null,
    }
  }
}
