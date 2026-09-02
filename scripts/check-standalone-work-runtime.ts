import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { ComponentRegistration } from '../src/component-system/registration'
import { ComponentRegistry } from '../src/component-system/registry'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import type { DistributableComponentPackage } from '../src/features/component-library/distributable-component-package'
import { createStandaloneWorkRuntimeWithHost } from '../src/features/runtime/standalone-work-runtime-core'
import {
  createScadaWorkPackage,
  parseScadaWorkPackageDocument,
  serializeScadaWorkPackage,
} from '../src/features/scada-works/scada-work-package'
import type { ScadaDeviceActionInvocation } from '../src/runtime/device-action-dispatcher'
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
    properties: {
      state: {
        title: 'State',
        kind: 'string',
        defaultValue: 'closed',
        bindable: true,
      },
      level: {
        title: 'Level',
        kind: 'number',
        defaultValue: 0,
        bindable: true,
      },
    },
    actions: {},
    events: {},
    anchors: [],
  },
  visual: createEmptyCompositeVisual(),
  implementationDraft: '// inert draft must never execute',
}

function portableScene(
  id: string,
  scadaSemantics: SceneDocument['nodes'][number] extends infer _Node
    ? NonNullable<Extract<SceneDocument['nodes'][number], { type: string }>['scadaSemantics']>
    : never,
): SceneDocument {
  return {
    version: 7,
    id,
    name: id,
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
        props: { state: 'closed', level: 0 },
        bindings: [],
        behaviors: [],
        scadaSemantics,
      },
    ],
    connections: [],
  }
}

const canonicalScene = portableScene('standalone-runtime-scene', {
  version: 1,
  valueBindings: [
    {
      id: 'value:standalone-state',
      targetProperty: 'state',
      expression: { kind: 'literal', value: 'open' },
    },
  ],
  behaviors: [],
  interactions: [],
})
const hostCapabilities = new ComponentRegistry([])
const workPackage = createScadaWorkPackage(
  canonicalScene,
  [dependency],
  hostCapabilities,
)

const standalone = createStandaloneWorkRuntimeWithHost(workPackage, [])
assert.equal(standalone.workPackage.scene.version, 7)
assert.ok(standalone.registry.get(componentType))
assert.equal(standalone.semanticProgramCount, 1)
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

const release = standalone.acquire()
assert.equal(standalone.runtime.isRunning, true)
assert.deepEqual(
  standalone.runtime.values.getSnapshot(),
  {},
  'standalone runtime starts without editor mock data sources',
)
assert.deepEqual(
  standalone.runtime.componentProps.getNodeSnapshot('portable-node'),
  { state: 'open', level: 0 },
  'persisted Scene v7 semantics are restored, compiled and attached before the runtime snapshot is consumed',
)
assert.deepEqual(
  canonicalScene.nodes[0]?.props,
  { state: 'closed', level: 0 },
  'canonical semantics derive runtime state without mutating authored Scene props',
)
release()
assert.equal(standalone.runtime.isRunning, false)

const primaryScene = portableScene('standalone-primary-device-scene', {
  version: 1,
  valueBindings: [
    {
      id: 'value:standalone-primary-level',
      targetProperty: 'level',
      expression: {
        kind: 'reference',
        reference: {
          kind: 'source-property',
          reference: { scope: 'primary-device', property: 'level' },
        },
      },
    },
  ],
  behaviors: [],
  interactions: [],
})
const primaryPackage = createScadaWorkPackage(
  primaryScene,
  [dependency],
  hostCapabilities,
)
assert.throws(
  () => createStandaloneWorkRuntimeWithHost(primaryPackage, []),
  /primary-device host capability/,
  'primary-device semantics fail closed when the standalone host cannot resolve the node device',
)

let sourceStopped = false
const primaryRuntime = createStandaloneWorkRuntimeWithHost(
  primaryPackage,
  [],
  {
    dataSources: [
      {
        id: 'fixture-source',
        start(values) {
          values.set('pump-01:level', 42)
          return () => {
            sourceStopped = true
          }
        },
      },
    ],
    resolvePrimaryDevice() {
      return { deviceId: 'pump-01' }
    },
  },
)
const releasePrimary = primaryRuntime.acquire()
assert.deepEqual(
  primaryRuntime.runtime.componentProps.getNodeSnapshot('portable-node'),
  { state: 'closed', level: 42 },
  'explicit RuntimeDataSource + primary-device host capability feed canonical standalone semantics',
)
releasePrimary()
assert.equal(sourceStopped, true, 'standalone session owns RuntimeDataSource disposal')

const trustedType = 'trusted.standalone.interaction-fixture'
const trustedRegistration: ComponentRegistration = {
  definition: {
    type: trustedType,
    title: 'Trusted interaction fixture',
    category: 'M8 fixture',
    description: '',
    size: {
      defaultWidth: 100,
      defaultHeight: 60,
      minWidth: 20,
      minHeight: 20,
    },
    properties: {},
    actions: {},
    events: {
      commandRequested: { title: 'Command requested' },
    },
    anchors: [],
  },
  renderer: (() => null) as unknown as ComponentRegistration['renderer'],
  createDefaultProps: () => ({}),
}
const interactionScene: SceneDocument = {
  version: 7,
  id: 'standalone-interaction-scene',
  name: 'Standalone interaction scene',
  width: 640,
  height: 360,
  background: '#fff',
  nodes: [
    {
      id: 'trusted-node',
      name: 'Trusted node',
      type: trustedType,
      parentId: null,
      visible: true,
      locked: false,
      transform: {
        x: 50,
        y: 50,
        width: 100,
        height: 60,
        rotation: 0,
      },
      props: {},
      bindings: [],
      behaviors: [],
      scadaSemantics: {
        version: 1,
        valueBindings: [],
        behaviors: [],
        interactions: [
          {
            id: 'interaction:standalone-command',
            event: 'commandRequested',
            action: {
              target: {
                scope: 'external',
                sourceId: 'pump-remote',
                action: 'start',
              },
              arguments: [],
            },
          },
        ],
      },
    },
  ],
  connections: [],
}
const trustedCapabilities = new ComponentRegistry([trustedRegistration])
const interactionPackage = createScadaWorkPackage(
  interactionScene,
  [],
  trustedCapabilities,
)
assert.throws(
  () => createStandaloneWorkRuntimeWithHost(
    interactionPackage,
    [trustedRegistration],
  ),
  /device-action dispatcher/,
  'Interaction semantics fail closed before runtime start when the host dispatcher is absent',
)

const deviceActions: ScadaDeviceActionInvocation[] = []
const interactionRuntime = createStandaloneWorkRuntimeWithHost(
  interactionPackage,
  [trustedRegistration],
  {
    deviceActionDispatcher: {
      dispatch(invocation) {
        deviceActions.push(invocation)
      },
    },
  },
)
const releaseInteraction = interactionRuntime.acquire()
interactionRuntime.runtime.emitEvent('trusted-node', 'commandRequested')
assert.deepEqual(deviceActions, [
  {
    interactionId: 'interaction:standalone-command',
    sourceId: 'pump-remote',
    action: 'start',
    arguments: [],
  },
])
releaseInteraction()

const serialized = serializeScadaWorkPackage(workPackage, hostCapabilities)
const parsedPackage = parseScadaWorkPackageDocument(serialized, hostCapabilities)
assert.ok(parsedPackage)
const parsedRuntime = createStandaloneWorkRuntimeWithHost(parsedPackage, [])
assert.ok(parsedRuntime.registry.get(componentType))
assert.equal(parsedRuntime.semanticProgramCount, 1)
assert.equal(
  parseScadaWorkPackageDocument('{broken-json', hostCapabilities),
  null,
  'malformed standalone input fails closed before runtime construction',
)

console.log(
  'Standalone work runtime checks passed: the accepted work artifact builds an isolated host+portable registry, restores/compiles/attaches canonical Scene v7 semantics through one package-owned runtime session, injects RuntimeDataSource/primary-device/device-action capabilities explicitly, fails closed when required host capabilities are absent, owns deterministic disposal, and keeps Studio/mock/browser state outside the generic construction core.',
)
