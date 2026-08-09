import type { ComponentScalarValue } from '../component-system/definition'

export type RuntimeValue = ComponentScalarValue
export type RuntimeValueSnapshot = Readonly<Record<string, RuntimeValue>>
export type RuntimeValueStoreListener = () => void

function assertRuntimeValueKey(key: string) {
  if (key.trim().length === 0) {
    throw new Error('Runtime value key must not be empty')
  }
}

function freezeSnapshot(
  values: Readonly<Record<string, RuntimeValue>>,
): RuntimeValueSnapshot {
  return Object.freeze({ ...values })
}

/**
 * Runtime-only scalar value storage.
 *
 * The store deliberately has no dependency on SceneDocument or editor history.
 * It publishes immutable snapshots so Preview can consume it through
 * useSyncExternalStore without turning runtime updates into authored scene edits.
 */
export class RuntimeValueStore {
  private snapshot: RuntimeValueSnapshot
  private readonly listeners = new Set<RuntimeValueStoreListener>()

  constructor(initialValues: Readonly<Record<string, RuntimeValue>> = {}) {
    for (const key of Object.keys(initialValues)) {
      assertRuntimeValueKey(key)
    }

    this.snapshot = freezeSnapshot(initialValues)
  }

  getSnapshot = (): RuntimeValueSnapshot => this.snapshot

  subscribe = (listener: RuntimeValueStoreListener) => {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  has(key: string) {
    return Object.hasOwn(this.snapshot, key)
  }

  get(key: string): RuntimeValue | undefined {
    return this.snapshot[key]
  }

  set(key: string, value: RuntimeValue) {
    assertRuntimeValueKey(key)

    if (this.has(key) && Object.is(this.snapshot[key], value)) {
      return false
    }

    this.publish({
      ...this.snapshot,
      [key]: value,
    })
    return true
  }

  setMany(values: Readonly<Record<string, RuntimeValue>>) {
    const entries = Object.entries(values)

    for (const [key] of entries) {
      assertRuntimeValueKey(key)
    }

    const changed = entries.some(
      ([key, value]) => !this.has(key) || !Object.is(this.snapshot[key], value),
    )

    if (!changed) {
      return false
    }

    this.publish({
      ...this.snapshot,
      ...values,
    })
    return true
  }

  delete(key: string) {
    if (!this.has(key)) {
      return false
    }

    const next = { ...this.snapshot }
    delete next[key]
    this.publish(next)
    return true
  }

  clear() {
    if (Object.keys(this.snapshot).length === 0) {
      return false
    }

    this.publish({})
    return true
  }

  private publish(values: Readonly<Record<string, RuntimeValue>>) {
    this.snapshot = freezeSnapshot(values)

    for (const listener of this.listeners) {
      listener()
    }
  }
}
