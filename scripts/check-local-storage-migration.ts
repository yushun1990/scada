import assert from 'node:assert/strict'
import {
  LEGACY_COMPONENTS_V1_STORAGE_KEY,
  LEGACY_COMPONENTS_V2_STORAGE_KEY,
  LEGACY_WORKS_STORAGE_KEY,
  planLegacyLocalStorageMigration,
  type LegacyStorageReader,
} from '../src/storage/legacy-local-storage-migration'

class MemoryLegacyStorage implements LegacyStorageReader {
  constructor(private readonly values: Record<string, string>) {}
  getItem(key: string) {
    return this.values[key] ?? null
  }
}

const normalizeSceneDocument = (raw: string) => {
  try {
    const value = JSON.parse(raw)
    return typeof value === 'object' && value !== null
      ? JSON.stringify({ ...value, migrated: true })
      : null
  } catch {
    return null
  }
}

const normalizeComponentDocument = (raw: string) => {
  try {
    const value = JSON.parse(raw)
    return typeof value === 'object' && value !== null
      ? JSON.stringify({ ...value, normalized: true })
      : null
  } catch {
    return null
  }
}

const normalizers = { normalizeSceneDocument, normalizeComponentDocument }

const storage = new MemoryLegacyStorage({
  [LEGACY_WORKS_STORAGE_KEY]: JSON.stringify([
    { id: 'work-b', updatedAt: '2026-08-28T02:00:00.000Z' },
    { id: 'work-a', updatedAt: '2026-08-28T01:00:00.000Z' },
    { id: 'missing-scene', updatedAt: '2026-08-28T03:00:00.000Z' },
  ]),
  'scada-editor-lab.work.work-a.scene.v4': JSON.stringify({ version: 6, id: 'a' }),
  'scada-editor-lab.work.work-b.scene.v4': JSON.stringify({ version: 7, id: 'b' }),
  [LEGACY_COMPONENTS_V2_STORAGE_KEY]: JSON.stringify([
    { id: 'component-b', updatedAt: 'b', builtIn: false, version: 1 },
    { id: 'component-a', updatedAt: 'a', builtIn: false, version: 1 },
    { id: 'builtin-ignore', updatedAt: 'x', builtIn: true, version: 1 },
  ]),
  [LEGACY_COMPONENTS_V1_STORAGE_KEY]: JSON.stringify([
    { id: 'legacy-should-not-win', updatedAt: 'old', builtIn: false },
  ]),
})

const plan = planLegacyLocalStorageMigration(storage, normalizers)
assert.deepEqual(plan.scenes.map((record) => record.id), ['work-a', 'work-b'])
assert.deepEqual(plan.components.map((record) => record.id), [
  'component-a',
  'component-b',
])
assert.equal(JSON.parse(plan.scenes[0]!.document).migrated, true)
assert.equal(JSON.parse(plan.components[0]!.document).normalized, true)
assert.ok(plan.sourceKeys.includes(LEGACY_WORKS_STORAGE_KEY))
assert.ok(plan.sourceKeys.includes(LEGACY_COMPONENTS_V2_STORAGE_KEY))
assert.ok(!plan.sourceKeys.includes(LEGACY_COMPONENTS_V1_STORAGE_KEY))

// When there is no usable works index, the newest supported historical global
// scene key is used as the one deterministic legacy work.
const globalFallback = planLegacyLocalStorageMigration(
  new MemoryLegacyStorage({
    [LEGACY_WORKS_STORAGE_KEY]: '{broken',
    'scada-editor-lab.scene.v4': '{broken-scene',
    'scada-editor-lab.scene.v3': JSON.stringify({ version: 3, id: 'legacy-v3' }),
  }),
  normalizers,
)
assert.deepEqual(globalFallback.scenes.map((record) => record.id), ['legacy'])
assert.equal(globalFallback.scenes[0]!.updatedAt, '1970-01-01T00:00:00.000Z')
assert.ok(globalFallback.skippedKeys.includes(LEGACY_WORKS_STORAGE_KEY))
assert.ok(globalFallback.skippedKeys.includes('scada-editor-lab.scene.v4'))
assert.ok(globalFallback.sourceKeys.includes('scada-editor-lab.scene.v3'))

// Invalid individual documents are skipped without poisoning valid neighbors.
const partiallyCorrupt = planLegacyLocalStorageMigration(
  new MemoryLegacyStorage({
    [LEGACY_WORKS_STORAGE_KEY]: JSON.stringify([
      { id: 'good', updatedAt: 'g' },
      { id: 'bad', updatedAt: 'b' },
    ]),
    'scada-editor-lab.work.good.scene.v4': '{}',
    'scada-editor-lab.work.bad.scene.v4': '{bad',
  }),
  normalizers,
)
assert.deepEqual(partiallyCorrupt.scenes.map((record) => record.id), ['good'])
assert.ok(partiallyCorrupt.skippedKeys.includes('scada-editor-lab.work.bad.scene.v4'))

console.log(
  'Legacy localStorage migration checks passed: current work/component keys are planned deterministically, v2 components win over v1, historical scene fallback is ordered, normalizers own domain canonicalization, and corrupt neighbors are isolated.',
)
