import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ComponentRegistry } from '../src/component-system/registry'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import type { DistributableComponentPackage } from '../src/features/component-library/distributable-component-package'
import { createStandaloneWorkRuntimeWithHost } from '../src/features/runtime/standalone-work-runtime-core'
import {
  createScadaWorkPackage,
  parseScadaWorkPackageDocument,
  serializeScadaWorkPackage,
} from '../src/features/scada-works/scada-work-package'
import type { SceneDocument } from '../src/scene/schema'

const coreSource = readFileSync(
  'src/features/runtime/standalone-work-runtime-core.ts',
  'utf8',
)
const browserWrapperSource = readFileSync(
  'src/features/runtime/standalone-work-runtime.ts',
  'utf8',
)
for (const source of [coreSource, browserWrapperSource]) {
  assert.doesNotMatch(source, /studioComponentRegistry/)
  assert.doesNotMatch(source, /browserPersistence/)
  assert.doesNotMatch(source, /replaceStudioUserComponentPackages/)
  assert.doesNotMatch(source, /createDefaultPreviewMockSources/)
}
assert.doesNotMatch(
  coreSource,
  /component-system\/builtins/,
  'generic runtime construction core must keep browser/native host registrations injectable',
)

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
const hostCapabilities = new ComponentRegistry([])
const workPackage = createScadaWorkPackage(
  scene,
  [dependency],
  hostCapabilities,
)

const standalone = createStandaloneWorkRuntimeWithHost(workPackage, [])
assert.equal(standalone.workPackage.scene.version, 7)
assert.ok(standalone.registry.get(componentType))
assert.equal(
  standalone.registry.list().length,
  1,
  'standalone registry owns only the explicitly supplied host slice plus bundled dependencies',
)
assert.equal(
  hostCapabilities.has(componentType),
  false,
  'portable dependency is not registered into the host capability view',
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
const parsedPackage = parseScadaWorkPackageDocument(serialized, hostCapabilities)
assert.ok(parsedPackage)
const parsedRuntime = createStandaloneWorkRuntimeWithHost(parsedPackage, [])
assert.ok(parsedRuntime.registry.get(componentType))
assert.equal(
  parseScadaWorkPackageDocument('{broken-json', hostCapabilities),
  null,
  'malformed standalone input fails closed before runtime construction',
)

console.log(
  'Standalone work runtime checks passed: the accepted work artifact builds an isolated host+portable registry, owns a dedicated no-mock PreviewRuntime, validates against actual runtime registrations, and keeps host/browser state outside the generic construction core.',
)
