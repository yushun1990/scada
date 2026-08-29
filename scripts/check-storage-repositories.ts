import assert from 'node:assert/strict'
import {
  createMemoryRepositoryBundle,
  MemorySceneRepository,
} from '../src/storage/memory-repositories'
import {
  exportLocalDebugSnapshot,
  importLocalDebugSnapshot,
  parseLocalDebugSnapshot,
  resetLocalRepositories,
} from '../src/storage/debug-snapshot'

const repositories = createMemoryRepositoryBundle({
  scenes: [
    {
      id: 'scene-b',
      updatedAt: '2026-08-28T02:00:00.000Z',
      document: JSON.stringify({ version: 7, id: 'scene-b' }),
    },
    {
      id: 'scene-a',
      updatedAt: '2026-08-28T01:00:00.000Z',
      document: JSON.stringify({ version: 7, id: 'scene-a' }),
    },
  ],
  components: [
    {
      id: 'component-z',
      updatedAt: '2026-08-28T03:00:00.000Z',
      document: JSON.stringify({ version: 1, id: 'component-z' }),
    },
  ],
  installedRemoteComponents: [
    {
      id: 'vendor.remote-valve',
      updatedAt: '2026-08-29T01:00:00.000Z',
      document: JSON.stringify({
        schemaVersion: 1,
        componentType: 'vendor.remote-valve',
        revision: 3,
      }),
    },
  ],
})

// Repository reads are deterministic and isolated from caller mutation.
const firstList = await repositories.scenes.list()
assert.deepEqual(firstList.map((record) => record.id), ['scene-a', 'scene-b'])
const isolated = await repositories.scenes.get('scene-a')
assert.ok(isolated)
isolated.document = 'mutated by caller'
assert.match((await repositories.scenes.get('scene-a'))!.document, /scene-a/)

// replaceAll validates the complete replacement before mutating existing state.
await assert.rejects(
  () => repositories.scenes.replaceAll([
    {
      id: 'duplicate',
      updatedAt: 'a',
      document: '{}',
    },
    {
      id: 'duplicate',
      updatedAt: 'b',
      document: '{}',
    },
  ]),
  /Duplicate repository record id/,
)
assert.deepEqual(
  (await repositories.scenes.list()).map((record) => record.id),
  ['scene-a', 'scene-b'],
)

// Debug snapshots are portable JSON data, not nested JSON strings, and are
// sorted deterministically independent of repository insertion order.
const snapshot = await exportLocalDebugSnapshot(repositories)
assert.equal(snapshot.schemaVersion, 2)
assert.deepEqual(snapshot.scenes.map((record) => record.id), ['scene-a', 'scene-b'])
assert.deepEqual(snapshot.scenes[0]?.document, { version: 7, id: 'scene-a' })
assert.deepEqual(snapshot.components[0]?.document, {
  version: 1,
  id: 'component-z',
})
assert.deepEqual(snapshot.installedRemoteComponents[0]?.document, {
  schemaVersion: 1,
  componentType: 'vendor.remote-valve',
  revision: 3,
})
assert.deepEqual(parseLocalDebugSnapshot(structuredClone(snapshot)), snapshot)

// Snapshot v1 remains importable and deterministically migrates to an empty
// installed-remote slice rather than making old support bundles unusable.
const legacySnapshot = {
  schemaVersion: 1,
  scenes: structuredClone(snapshot.scenes),
  components: structuredClone(snapshot.components),
}
const migratedLegacySnapshot = parseLocalDebugSnapshot(legacySnapshot)
assert.equal(migratedLegacySnapshot.schemaVersion, 2)
assert.deepEqual(migratedLegacySnapshot.installedRemoteComponents, [])

// Import uses the same repository interfaces as production storage will use.
const restored = createMemoryRepositoryBundle()
await importLocalDebugSnapshot(restored, structuredClone(snapshot))
assert.deepEqual(await exportLocalDebugSnapshot(restored), snapshot)

// Malformed/duplicate snapshot data is rejected before repository mutation.
const beforeRejectedImport = await exportLocalDebugSnapshot(restored)
const duplicateSnapshot = structuredClone(snapshot) as any
duplicateSnapshot.scenes.push(structuredClone(duplicateSnapshot.scenes[0]))
await assert.rejects(
  () => importLocalDebugSnapshot(restored, duplicateSnapshot),
  /duplicate id/,
)
assert.deepEqual(await exportLocalDebugSnapshot(restored), beforeRejectedImport)

assert.throws(
  () => parseLocalDebugSnapshot({
    schemaVersion: 99,
    scenes: [],
    components: [],
    installedRemoteComponents: [],
  }),
  /schema version is unsupported/,
)

assert.throws(
  () => parseLocalDebugSnapshot({
    schemaVersion: 2,
    scenes: [{ id: 'x', updatedAt: '', document: { invalid: undefined } }],
    components: [],
    installedRemoteComponents: [],
  }),
  /non-JSON value/,
)

// A repository containing corrupt raw JSON cannot silently emit an unusable
// support snapshot.
const corrupt = createMemoryRepositoryBundle({
  scenes: [{ id: 'broken', updatedAt: '', document: '{nope' }],
})
await assert.rejects(
  () => exportLocalDebugSnapshot(corrupt),
  /does not contain valid JSON/,
)

await resetLocalRepositories(restored)
assert.deepEqual(await restored.scenes.list(), [])
assert.deepEqual(await restored.components.list(), [])
assert.deepEqual(await restored.installedRemoteComponents.list(), [])

// Individual repositories can be used independently by focused unit tests.
const standalone = new MemorySceneRepository()
await standalone.put({ id: 'one', updatedAt: 'now', document: '{}' })
assert.equal((await standalone.get('one'))?.id, 'one')
await standalone.delete('one')
assert.equal(await standalone.get('one'), null)

console.log(
  'Storage repository checks passed: async Scene/Component/installed-remote contracts, deterministic isolated Memory repositories, v2 portable debug snapshot export/import/reset with v1 compatibility, pre-mutation snapshot validation, and corrupt JSON rejection are stable.',
)
