import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { ComponentDefinition } from '../src/component-system/definition'
import type { ComponentRegistration } from '../src/component-system/registration'
import { ComponentRegistry } from '../src/component-system/registry'
import type { ComponentRenderer } from '../src/component-system/renderer'
import { createEmptyCompositeVisual, createNativeVisual } from '../src/component-system/visual'
import {
  COMPONENT_PACKAGE_VERSION,
  type ComponentLibraryEntry,
} from '../src/features/component-library/component-document'
import {
  createDistributableComponentPackage,
  type DistributableComponentPackage,
} from '../src/features/component-library/distributable-component-package'
import type { InstalledRemoteComponent } from '../src/features/component-library/remote-component-installation'
import {
  createScadaWorkPackage,
} from '../src/features/scada-works/scada-work-package'
import {
  planScadaWorkPackageImport,
  resolveScadaWorkDependencies,
} from '../src/features/scada-works/scada-work-transfer'
import type { SceneDocument } from '../src/scene/schema'

const dummyRenderer = (() => null) as unknown as ComponentRenderer

function definition(type: string, title = type): ComponentDefinition {
  return {
    type,
    title,
    category: 'M8A3 fixture',
    description: '',
    size: {
      defaultWidth: 80,
      defaultHeight: 48,
      minWidth: 20,
      minHeight: 16,
    },
    attributes: {},
    properties: {
      value: {
        title: 'Value',
        kind: 'number',
        defaultValue: 0,
        bindable: true,
      },
    },
    actions: {},
    events: {},
    anchors: [],
  }
}

function registration(component: ComponentDefinition): ComponentRegistration {
  return {
    definition: component,
    renderer: dummyRenderer,
    createDefaultProps: () => ({ value: 0 }),
  }
}

function localEntry(
  type: string,
  options: {
    title?: string
    status?: 'draft' | 'ready'
    builtIn?: boolean
  } = {},
): ComponentLibraryEntry {
  const builtIn = options.builtIn ?? false
  return {
    version: COMPONENT_PACKAGE_VERSION,
    id: `${builtIn ? 'builtin' : 'local'}-${type}`,
    definition: definition(type, options.title ?? type),
    visual: builtIn ? createNativeVisual() : createEmptyCompositeVisual(),
    status: options.status ?? 'ready',
    implementationDraft: '// inert draft',
    updatedAt: '2026-08-31T00:00:00.000Z',
    builtIn,
  }
}

function installedRemote(entry: ComponentLibraryEntry): InstalledRemoteComponent {
  return {
    schemaVersion: 1,
    source: {
      kind: 'remote-publication',
      componentType: entry.definition.type,
      revision: 1,
      revisionId: `revision-${entry.definition.type}`,
      publishedAt: entry.updatedAt,
    },
    entry: {
      ...entry,
      id: `published:revision-${entry.definition.type}`,
    },
    installedAt: '2026-08-31T01:00:00.000Z',
  }
}

function node(id: string, type: string, x: number) {
  return {
    id,
    name: id,
    type,
    parentId: null,
    visible: true,
    locked: false,
    transform: {
      x,
      y: 20,
      width: 80,
      height: 48,
      rotation: 0,
    },
    props: { value: 1 },
    bindings: [],
    behaviors: [],
    scadaSemantics: null,
  }
}

function scene(): SceneDocument {
  return {
    version: 7,
    id: 'm8a3-scene',
    name: 'M8A3 Transfer Fixture',
    width: 640,
    height: 360,
    background: '#ffffff',
    nodes: [
      node('host', 'host.gauge', 10),
      node('local', 'portable.local', 120),
      node('remote', 'portable.remote', 230),
    ],
    connections: [],
  }
}

const transferSource = readFileSync(
  'src/features/scada-works/scada-work-transfer.ts',
  'utf8',
)
assert.doesNotMatch(transferSource, /browserPersistence/)
assert.doesNotMatch(transferSource, /studioComponentRegistry/)
assert.doesNotMatch(transferSource, /window\./)
assert.doesNotMatch(transferSource, /indexeddb/i)

const hostEntry = localEntry('host.gauge', { builtIn: true })
const localDependencyEntry = localEntry('portable.local')
const remoteDependencyEntry = localEntry('portable.remote')
const installedRemoteDependency = installedRemote(remoteDependencyEntry)

const exportInventory = {
  components: [hostEntry, localDependencyEntry],
  installedRemoteComponents: [installedRemoteDependency],
}
const resolvedDependencies = resolveScadaWorkDependencies(scene(), exportInventory)
assert.deepEqual(
  resolvedDependencies.map((dependency) => dependency.definition.type),
  ['portable.local', 'portable.remote'],
  'export resolves exactly the non-host Scene dependency closure',
)

assert.throws(
  () => resolveScadaWorkDependencies(scene(), {
    components: [hostEntry, localDependencyEntry],
    installedRemoteComponents: [],
  }),
  /缺少可分发组件依赖：portable\.remote/,
)
assert.throws(
  () => resolveScadaWorkDependencies(scene(), {
    components: [hostEntry, localDependencyEntry, remoteDependencyEntry],
    installedRemoteComponents: [installedRemoteDependency],
  }),
  /依赖来源不唯一：portable\.remote/,
)
assert.throws(
  () => resolveScadaWorkDependencies(scene(), {
    components: [hostEntry, localEntry('portable.local', { status: 'draft' }), remoteDependencyEntry],
    installedRemoteComponents: [],
  }),
  /依赖组件不可分发：portable\.local/,
)

const hostCapabilities = new ComponentRegistry([
  registration(hostEntry.definition),
])
const workPackage = createScadaWorkPackage(
  scene(),
  resolvedDependencies,
  hostCapabilities,
)

const freshPlan = planScadaWorkPackageImport(workPackage, {
  components: [hostEntry],
  installedRemoteComponents: [],
})
assert.equal(freshPlan.kind, 'ready')
if (freshPlan.kind === 'ready') {
  assert.deepEqual(
    freshPlan.dependenciesToImport.map((dependency) => dependency.definition.type),
    ['portable.local', 'portable.remote'],
  )
  assert.deepEqual(freshPlan.reusedDependencies, [])
}

const sameLocalPackage = localDependencyEntry
const sameInstalledPackage = installedRemoteDependency
const reusePlan = planScadaWorkPackageImport(workPackage, {
  components: [hostEntry, sameLocalPackage],
  installedRemoteComponents: [sameInstalledPackage],
})
assert.equal(reusePlan.kind, 'ready')
if (reusePlan.kind === 'ready') {
  assert.deepEqual(reusePlan.dependenciesToImport, [])
  assert.deepEqual(reusePlan.reusedDependencies, [
    { componentType: 'portable.local', source: 'local-authored' },
    { componentType: 'portable.remote', source: 'installed-remote' },
  ])
}

const conflictingLocal = localEntry('portable.local', {
  title: 'Different Local Definition',
})
const collisionPlan = planScadaWorkPackageImport(workPackage, {
  components: [hostEntry, conflictingLocal],
  installedRemoteComponents: [],
})
assert.deepEqual(collisionPlan, {
  kind: 'collision',
  componentType: 'portable.local',
  message: '作品依赖与本地可编辑组件定义不一致：portable.local',
})

const draftCollisionPlan = planScadaWorkPackageImport(workPackage, {
  components: [hostEntry, localEntry('portable.local', { status: 'draft' })],
  installedRemoteComponents: [],
})
assert.equal(draftCollisionPlan.kind, 'collision')

const ambiguousPlan = planScadaWorkPackageImport(workPackage, {
  components: [hostEntry, sameLocalPackage],
  installedRemoteComponents: [installedRemote(localDependencyEntry)],
})
assert.deepEqual(ambiguousPlan, {
  kind: 'collision',
  componentType: 'portable.local',
  message: '本地存在多个同类型组件来源，无法安全导入作品：portable.local',
})

const localPackage: DistributableComponentPackage =
  createDistributableComponentPackage(localDependencyEntry)
assert.equal(
  localPackage.definition.type,
  resolvedDependencies[0]?.definition.type,
  'reused local definitions are compared through the accepted distributable package codec',
)

console.log(
  'SCADA work transfer planning checks passed: export resolves an exact local/remote dependency closure, missing/ambiguous/non-ready dependencies fail closed, fresh-browser import plans missing dependencies, identical existing packages are safely reused, conflicting same-type packages are rejected before mutation, and the transfer planner stays browser/storage independent.',
)
