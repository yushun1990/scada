export type SceneRepositoryRecord = {
  id: string
  document: string
  updatedAt: string
}

export type ComponentRepositoryRecord = {
  id: string
  document: string
  updatedAt: string
}

export interface SceneRepository {
  list(): Promise<readonly SceneRepositoryRecord[]>
  get(id: string): Promise<SceneRepositoryRecord | null>
  put(record: SceneRepositoryRecord): Promise<void>
  delete(id: string): Promise<void>
  replaceAll(records: readonly SceneRepositoryRecord[]): Promise<void>
  clear(): Promise<void>
}

export interface ComponentRepository {
  list(): Promise<readonly ComponentRepositoryRecord[]>
  get(id: string): Promise<ComponentRepositoryRecord | null>
  put(record: ComponentRepositoryRecord): Promise<void>
  delete(id: string): Promise<void>
  replaceAll(records: readonly ComponentRepositoryRecord[]): Promise<void>
  clear(): Promise<void>
}

export type LocalRepositoryBundle = {
  scenes: SceneRepository
  components: ComponentRepository
}

export function assertRepositoryRecord(
  value: unknown,
  label: string,
): asserts value is SceneRepositoryRecord | ComponentRepositoryRecord {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>).id !== 'string' ||
    !(value as Record<string, unknown>).id ||
    typeof (value as Record<string, unknown>).document !== 'string' ||
    typeof (value as Record<string, unknown>).updatedAt !== 'string'
  ) {
    throw new Error(`${label} repository record is invalid`)
  }
}
