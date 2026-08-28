import type {
  ComponentRepository,
  ComponentRepositoryRecord,
  LocalRepositoryBundle,
  SceneRepository,
  SceneRepositoryRecord,
} from './repositories'

function cloneRecord<T extends SceneRepositoryRecord | ComponentRepositoryRecord>(
  record: T,
): T {
  return { ...record }
}

function assertUniqueRecords<T extends SceneRepositoryRecord | ComponentRepositoryRecord>(
  records: readonly T[],
) {
  const ids = new Set<string>()

  for (const record of records) {
    if (ids.has(record.id)) {
      throw new Error(`Duplicate repository record id: ${record.id}`)
    }
    ids.add(record.id)
  }
}

class MemoryRecordRepository<
  T extends SceneRepositoryRecord | ComponentRepositoryRecord,
> {
  private records = new Map<string, T>()

  constructor(initial: readonly T[] = []) {
    this.replaceAllSync(initial)
  }

  protected async listRecords() {
    return [...this.records.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(cloneRecord)
  }

  protected async getRecord(id: string) {
    const record = this.records.get(id)
    return record ? cloneRecord(record) : null
  }

  protected async putRecord(record: T) {
    this.records.set(record.id, cloneRecord(record))
  }

  protected async deleteRecord(id: string) {
    this.records.delete(id)
  }

  protected async replaceAllRecords(records: readonly T[]) {
    this.replaceAllSync(records)
  }

  protected async clearRecords() {
    this.records.clear()
  }

  private replaceAllSync(records: readonly T[]) {
    assertUniqueRecords(records)
    const next = new Map<string, T>()
    for (const record of records) {
      next.set(record.id, cloneRecord(record))
    }
    this.records = next
  }
}

export class MemorySceneRepository
  extends MemoryRecordRepository<SceneRepositoryRecord>
  implements SceneRepository
{
  list = () => this.listRecords()
  get = (id: string) => this.getRecord(id)
  put = (record: SceneRepositoryRecord) => this.putRecord(record)
  delete = (id: string) => this.deleteRecord(id)
  replaceAll = (records: readonly SceneRepositoryRecord[]) =>
    this.replaceAllRecords(records)
  clear = () => this.clearRecords()
}

export class MemoryComponentRepository
  extends MemoryRecordRepository<ComponentRepositoryRecord>
  implements ComponentRepository
{
  list = () => this.listRecords()
  get = (id: string) => this.getRecord(id)
  put = (record: ComponentRepositoryRecord) => this.putRecord(record)
  delete = (id: string) => this.deleteRecord(id)
  replaceAll = (records: readonly ComponentRepositoryRecord[]) =>
    this.replaceAllRecords(records)
  clear = () => this.clearRecords()
}

export function createMemoryRepositoryBundle(
  initial: {
    scenes?: readonly SceneRepositoryRecord[]
    components?: readonly ComponentRepositoryRecord[]
  } = {},
): LocalRepositoryBundle {
  return {
    scenes: new MemorySceneRepository(initial.scenes),
    components: new MemoryComponentRepository(initial.components),
  }
}
