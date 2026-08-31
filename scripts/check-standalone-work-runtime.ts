import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  builtInComponentRegistrations,
  studioComponentRegistry,
} from '../src/component-system/builtins'
import { ComponentRegistry } from '../src/component-system/registry'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import type { DistributableComponentPackage } from '../src/features/component-library/distributable-component-package'
import {
  createStandaloneWorkRuntime,
  parseStandaloneWorkRuntimeDocument,
} from '../src/features/runtime/standalone-work-runtime'
import {
  createScadaWorkPackage,
  serializeScadaWorkPackage,
} from '../src/features/scada-works/scada-work-package'
import type { SceneDocument } from '../src/scene/schema'

const coreSource = readFileSync(
  'src/features/runtime/standalone-work-runtime.ts',
  'utf8',
)
assert.doesNotMatch(coreSource, /studioComponentRegistry/)
assert.doesNotMatch(coreSource, /browserPersistence/)
assert.doesNotMatch(coreSource, /replaceStudioUserComponentPackages/)
assert.doesNotMatch(coreSource, /createDefaultPreviewMockSources/)

const componentType = 'portable.standalone.runtime-fixture'
const dependency: DistributableComponentPackage = {
  packageVersion: 1,
  definition: {
    type: componentType,
    title: 'Standalone fixture',
    category: 'M8 fixture',
    description: '',
    size: {
      defaultWidth: 120,
      defaultHeight: 72,
      minWidth: 40,
      minHeight: 24,
    },
    properties: {},
    actions: {},
    events: {},
    anchors: [],
  },
  visual: createEmptyCompositeVisual(),
  implementationDraft: '// inert draft must never execute',
}
const scene: SceneDocument = {
  version: 7,
  id: 'standalone-runtime-scene',
  name: 'Standalone runtime fixture',
  width: 640,
  height: 360,
  background: '#101827',
  nodes: [
    {
      id: 'portable-node',
      name: 'Portable node',
      type: componentType,
      parentId: null,
      visible: true,
      locked: false,
      transform: {
        x: 120,
        y: 80,
        width: 120,
        height: 72,
        rotation: 0,
      },
      props: {},
      bindings: [],
      behaviors: [],
      scadaSemantics: null,
    },
  ],
  connections: [],
}
const hostCapabilities = new ComponentRegistry(builtInComponentRegistrations)
const workPackage = createScadaWorkPackage(
  scene,
  [dependency],
  hostCapabilities,
)
const studioTypesBefore = studioComponentRegistry
  .list()
  .map((registration) => registration.definition.type)
  .sort()

const standalone = createStandaloneWorkRuntime(workPackage)
assert.equal(standalone.workPackage.scene.version, 7)
assert.ok(standalone.registry.get(componentType))
assert.equal(
  standalone.registry.list().length,
  builtInComponentRegistrations.length + 1,
  'standalone registry owns exactly built-ins plus the bundled dependency',
)
assert.equal(
  studioComponentRegistry.has(componentType),
  false,
  'portable dependency is not installed into the live Studio registry',
)
assert.deepEqual(
  studioComponentRegistry
    .list()
    .map((registration) => registration.definition.type)
    .sort(),
  studioTypesBefore,
  'standalone runtime construction does not mutate Studio registrations',
)

const release = standalone.runtime.acquire(standalone.workPackage.scene)
assert.equal(standalone.runtime.isRunning, true)
assert.deepEqual(
  standalone.runtime.values.getSnapshot(),
  {},
  'standalone runtime starts without editor mock data sources',
)
release()
assert.equal(standalone.runtime.isRunning, false)

const serialized = serializeScadaWorkPackage(workPackage, hostCapabilities)
const parsed = parseStandaloneWorkRuntimeDocument(serialized)
assert.ok(parsed)
assert.ok(parsed.registry.get(componentType))
assert.equal(studioComponentRegistry.has(componentType), false)
assert.equal(
  parseStandaloneWorkRuntimeDocument('{broken-json'),
  null,
  'malformed standalone input fails closed',
)

console.log(
  'Standalone work runtime checks passed: the accepted work artifact builds an isolated built-in+portable registry, owns a dedicated no-mock PreviewRuntime, validates against actual runtime registrations, and does not mutate Studio persistence or registrations.',
)
