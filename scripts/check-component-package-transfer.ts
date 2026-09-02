import assert from 'node:assert/strict'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import {
  COMPONENT_PACKAGE_VERSION,
  type ComponentLibraryEntry,
} from '../src/features/component-library/component-document'
import { planComponentPackageImport } from '../src/features/component-library/component-package-transfer'
import { createDistributableComponentPackage } from '../src/features/component-library/distributable-component-package'
import type { InstalledRemoteComponent } from '../src/features/component-library/remote-component-installation'

function readyEntry(
  id: string,
  componentType: string,
  options: { builtIn?: boolean } = {},
): ComponentLibraryEntry {
  return {
    version: COMPONENT_PACKAGE_VERSION,
    id,
    definition: {
      type: componentType,
      title: `Fixture ${componentType}`,
      category: 'Fixture',
      description: '',
      size: {
        defaultWidth: 96,
        defaultHeight: 72,
        minWidth: 32,
        minHeight: 24,
      },
      attributes: {},
      properties: {},
      actions: {},
      events: {},
      anchors: [],
    },
    visual: createEmptyCompositeVisual(),
    status: 'ready',
    implementationDraft: '',
    updatedAt: '2026-08-30T00:00:00.000Z',
    builtIn: options.builtIn ?? false,
  }
}

const portableSource = readyEntry(
  'portable-source',
  'custom.portable.transfer.fixture',
)
const componentPackage = createDistributableComponentPackage(portableSource)

assert.deepEqual(
  planComponentPackageImport(componentPackage, {
    components: [],
    installedRemoteComponents: [],
  }),
  {
    kind: 'ready',
    componentType: portableSource.definition.type,
    title: portableSource.definition.title,
  },
  'fresh component type is ready for explicit local import',
)

const builtInCollision = planComponentPackageImport(componentPackage, {
  components: [
    readyEntry('builtin-fixture', portableSource.definition.type, { builtIn: true }),
  ],
  installedRemoteComponents: [],
})
assert.equal(builtInCollision.kind, 'collision')
assert.equal(
  builtInCollision.kind === 'collision' ? builtInCollision.collision : null,
  'built-in',
)

const localCollision = planComponentPackageImport(componentPackage, {
  components: [readyEntry('local-existing', portableSource.definition.type)],
  installedRemoteComponents: [],
})
assert.equal(localCollision.kind, 'collision')
assert.equal(
  localCollision.kind === 'collision' ? localCollision.collision : null,
  'local-authored',
)

const remoteEntry = readyEntry(
  'published:portable-revision-1',
  portableSource.definition.type,
)
const installedRemote: InstalledRemoteComponent = {
  schemaVersion: 1,
  source: {
    kind: 'remote-publication',
    componentType: portableSource.definition.type,
    revision: 1,
    revisionId: 'portable-revision-1',
    publishedAt: '2026-08-30T00:00:00.000Z',
  },
  entry: remoteEntry,
  installedAt: '2026-08-30T00:05:00.000Z',
}
const remoteCollision = planComponentPackageImport(componentPackage, {
  components: [],
  installedRemoteComponents: [installedRemote],
})
assert.equal(remoteCollision.kind, 'collision')
assert.equal(
  remoteCollision.kind === 'collision' ? remoteCollision.collision : null,
  'installed-remote',
)
assert.match(
  remoteCollision.kind === 'collision' ? remoteCollision.message : '',
  /revision 1/,
)

const unrelatedInventory = planComponentPackageImport(componentPackage, {
  components: [readyEntry('other-local', 'custom.other.local')],
  installedRemoteComponents: [{
    ...installedRemote,
    source: {
      ...installedRemote.source,
      componentType: 'custom.other.remote',
    },
    entry: {
      ...installedRemote.entry,
      definition: {
        ...installedRemote.entry.definition,
        type: 'custom.other.remote',
      },
    },
  }],
})
assert.equal(unrelatedInventory.kind, 'ready')

console.log(
  'Component package transfer checks passed: portable imports are side-effect-free to plan and deterministically reject built-in, local-authored, and installed-remote type collisions while allowing unrelated inventory.',
)
