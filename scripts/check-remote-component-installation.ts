import assert from 'node:assert/strict'
import type { ComponentRegistration } from '../src/component-system/registration'
import type { ComponentRenderer } from '../src/component-system/renderer'
import { ComponentRegistry } from '../src/component-system/registry'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import {
  COMPONENT_PACKAGE_VERSION,
  cloneComponentLibraryEntry,
} from '../src/features/component-library/component-document'
import type { PublishedComponentRevision } from '../src/features/component-library/publication-contract'
import {
  createInstalledRemoteComponent,
  loadInstalledRemoteComponents,
  parseInstalledRemoteComponentDocument,
  persistRemoteComponentInstallation,
  removeRemoteComponentInstallation,
  selectInstalledRemoteActivationEntries,
  serializeInstalledRemoteComponent,
} from '../src/features/component-library/remote-component-installation'
import {
  createRemoteComponentInstallCandidate,
} from '../src/features/component-library/remote-component-repository'
import { createUserComponentActivationController } from '../src/features/component-library/runtime-activation-core'
import { upgradeLocalDatabaseSchema } from '../src/storage/indexeddb-repositories'
import { MemoryInstalledRemoteComponentRepository } from '../src/storage/memory-repositories'

const COMPONENT_TYPE = 'vendor.remote-valve'

function revision(
  revisionNumber: number,
  revisionId: string,
  publishedAt: string,
): PublishedComponentRevision {
  return {
    schemaVersion: 1,
    revisionId,
    requestId: `request-${revisionNumber}`,
    componentType: COMPONENT_TYPE,
    revision: revisionNumber,
    publishedAt,
    package: {
      packageVersion: COMPONENT_PACKAGE_VERSION,
      definition: {
        type: COMPONENT_TYPE,
        title: `Remote Valve r${revisionNumber}`,
        category: 'Remote fixtures',
        description: '',
        size: {
          defaultWidth: 96,
          defaultHeight: 72,
          minWidth: 32,
          minHeight: 24,
        },
        properties: {},
        actions: {},
        events: {},
        anchors: [],
      },
      visual: createEmptyCompositeVisual(),
      implementationDraft: '',
    },
  }
}

const revision1 = revision(1, 'revision-id-1', '2026-08-29T01:00:00.000Z')
const revision2 = revision(2, 'revision-id-2', '2026-08-29T02:00:00.000Z')
const candidate1 = createRemoteComponentInstallCandidate(revision1)
const candidate2 = createRemoteComponentInstallCandidate(revision2)

// Provenance is durable and validated independently of editable local package identity.
const installation = createInstalledRemoteComponent(
  candidate1,
  '2026-08-29T03:00:00.000Z',
)
assert.equal(installation.source.componentType, COMPONENT_TYPE)
assert.equal(installation.source.revision, 1)
assert.equal(installation.source.revisionId, 'revision-id-1')
assert.equal(installation.entry.id, 'published:revision-id-1')
assert.equal(installation.entry.status, 'ready')
assert.deepEqual(
  parseInstalledRemoteComponentDocument(
    serializeInstalledRemoteComponent(installation),
  ),
  installation,
)

const tampered = JSON.parse(serializeInstalledRemoteComponent(installation))
tampered.source.revisionId = 'different-revision-id'
assert.equal(
  parseInstalledRemoteComponentDocument(JSON.stringify(tampered)),
  null,
)

// Explicit install is idempotent for the exact immutable revision.
const repository = new MemoryInstalledRemoteComponentRepository()
const firstInstall = await persistRemoteComponentInstallation(
  repository,
  candidate1,
  '2026-08-29T03:00:00.000Z',
)
assert.equal(firstInstall.changed, true)
const repeatedInstall = await persistRemoteComponentInstallation(
  repository,
  candidate1,
  '2026-08-29T04:00:00.000Z',
)
assert.equal(repeatedInstall.changed, false)
assert.equal(repeatedInstall.installed.installedAt, '2026-08-29T03:00:00.000Z')
assert.equal((await repository.list()).length, 1)

// Installing another immutable revision explicitly replaces the one cache slot
// for that component type. Reinstalling an older revision is an intentional rollback.
const update = await persistRemoteComponentInstallation(
  repository,
  candidate2,
  '2026-08-29T05:00:00.000Z',
)
assert.equal(update.changed, true)
assert.equal(update.installed.source.revision, 2)
assert.equal((await repository.list()).length, 1)

const rollback = await persistRemoteComponentInstallation(
  repository,
  candidate1,
  '2026-08-29T06:00:00.000Z',
)
assert.equal(rollback.changed, true)
assert.equal(rollback.installed.source.revision, 1)
assert.equal((await repository.list()).length, 1)

// Simulate a later offline startup: only the local repository is consulted,
// then the package enters the same generic M6.7A activation controller.
const hydrated = await loadInstalledRemoteComponents(repository)
assert.deepEqual(hydrated.invalidRecordIds, [])
assert.equal(hydrated.installed.length, 1)
assert.equal(hydrated.installed[0]?.source.revision, 1)
const offlineResolution = selectInstalledRemoteActivationEntries(
  [],
  hydrated.installed,
)
assert.deepEqual(offlineResolution.conflicts, [])
assert.equal(offlineResolution.entries.length, 1)

const registry = new ComponentRegistry()
const dummyRenderer = (() => null) as unknown as ComponentRenderer
const controller = createUserComponentActivationController({
  registry,
  builtInRegistrations: [],
  createRegistration: (entry): ComponentRegistration => ({
    definition: entry.definition,
    renderer: dummyRenderer,
    createDefaultProps: () => ({}),
  }),
})
const activation = controller.replace(offlineResolution.entries)
assert.deepEqual(activation.activeTypes, [COMPONENT_TYPE])
assert.equal(registry.has(COMPONENT_TYPE), true)

// Imported/historical local-vs-remote collisions are deterministic: editable
// local authoring wins, and the installed artifact is retained but not activated.
const localAuthored = cloneComponentLibraryEntry(candidate1.entry)
localAuthored.id = 'local-authored-valve'
localAuthored.status = 'ready'
const collision = selectInstalledRemoteActivationEntries(
  [localAuthored],
  hydrated.installed,
)
assert.deepEqual(collision.entries, [])
assert.equal(collision.conflicts.length, 1)
assert.equal(collision.conflicts[0]?.componentType, COMPONENT_TYPE)
assert.match(collision.conflicts[0]?.message ?? '', /shadowed by local authored/)

// Corrupt installed rows fail closed without poisoning neighboring valid rows.
await repository.put({
  id: 'broken.remote',
  document: '{nope',
  updatedAt: '2026-08-29T07:00:00.000Z',
})
const withCorruption = await loadInstalledRemoteComponents(repository)
assert.equal(withCorruption.installed.length, 1)
assert.deepEqual(withCorruption.invalidRecordIds, ['broken.remote'])

assert.equal(await removeRemoteComponentInstallation(repository, COMPONENT_TYPE), true)
assert.equal(await removeRemoteComponentInstallation(repository, COMPONENT_TYPE), false)
assert.equal((await repository.get(COMPONENT_TYPE)), null)

// IndexedDB v1 -> v2 migration is additive: existing authoring stores remain,
// and only the dedicated installed-remote store is created.
const existingStores = new Set(['scenes', 'components', 'meta'])
const createdStores: Array<{ name: string; keyPath: string }> = []
upgradeLocalDatabaseSchema({
  objectStoreNames: {
    contains: (name: string) => existingStores.has(name),
  },
  createObjectStore: (name: string, options?: IDBObjectStoreParameters) => {
    createdStores.push({ name, keyPath: String(options?.keyPath ?? '') })
    existingStores.add(name)
    return {} as IDBObjectStore
  },
} as unknown as IDBDatabase)
assert.deepEqual(createdStores, [
  { name: 'installedRemoteComponents', keyPath: 'id' },
])

console.log(
  'Remote component installation checks passed: provenance codec, idempotent explicit install, update/rollback replacement, uninstall, v1->v2 storage migration, deterministic authored collision handling, corrupt-row isolation, and offline M6.7A activation are stable.',
)
