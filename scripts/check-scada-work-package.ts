import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { ComponentDefinition } from '../src/component-system/definition'
import type { ComponentRegistration } from '../src/component-system/registration'
import { ComponentRegistry } from '../src/component-system/registry'
import type { ComponentRenderer } from '../src/component-system/renderer'
import { createEmptyCompositeVisual } from '../src/component-system/visual'
import {
  DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
  type DistributableComponentPackage,
} from '../src/features/component-library/distributable-component-package'
import {
  SCADA_WORK_PACKAGE_VERSION,
  createScadaWorkPackage,
  parseScadaWorkPackage,
  parseScadaWorkPackageDocument,
  serializeScadaWorkPackage,
} from '../src/features/scada-works/scada-work-package'
import type { SceneDocument } from '../src/scene/schema'

const dummyRenderer = (() => null) as unknown as ComponentRenderer

function definition(
  type: string,
  options: {
    property?: 'number' | 'string'
    action?: boolean
    event?: boolean
  } = {},
): ComponentDefinition {
  const property = options.property ?? 'number'

  return {
    type,
    title: type,
    category: 'M8 fixture',
    description: '',
    size: {
      defaultWidth: 80,
      defaultHeight: 48,
      minWidth: 20,
      minHeight: 16,
    },
    attributes: {},
    properties: {
      value: property === 'number'
        ? {
            title: 'Value',
            kind: 'number',
            defaultValue: 0,
            bindable: true,
          }
        : {
            title: 'Value',
            kind: 'string',
            defaultValue: '',
            bindable: true,
          },
    },
    actions: options.action
      ? { run: { title: 'Run' } }
      : {},
    events: options.event
      ? { requested: { title: 'Requested' } }
      : {},
    anchors: [],
  }
}

function registration(component: ComponentDefinition): ComponentRegistration {
  return {
    definition: component,
    renderer: dummyRenderer,
    createDefaultProps: () => ({
      value: component.properties.value?.defaultValue ?? 0,
    }),
  }
}

function portableDependency(
  component: ComponentDefinition,
): DistributableComponentPackage {
  return {
    packageVersion: DISTRIBUTABLE_COMPONENT_PACKAGE_VERSION,
    definition: component,
    visual: createEmptyCompositeVisual(),
    implementationDraft: '// inert draft',
  }
}

function node(id: string, type: string, value: number | string) {
  return {
    id,
    name: id,
    type,
    parentId: null,
    visible: true,
    locked: false,
    transform: {
      x: id === 'host' ? 10 : id === 'a' ? 120 : 230,
      y: 20,
      width: 80,
      height: 48,
      rotation: 0,
    },
    props: { value },
    bindings: [],
    behaviors: [],
    scadaSemantics: null,
  }
}

function scene(version: 6 | 7 = 7): SceneDocument {
  const nodes = [
    node('host', 'host.gauge', 1),
    node('b', 'portable.b', 2),
    node('a', 'portable.a', 3),
  ]

  if (version === 6) {
    for (const candidate of nodes) {
      delete (candidate as { scadaSemantics?: null }).scadaSemantics
    }
  }

  return {
    version,
    id: `scene-v${version}`,
    name: 'Portable work fixture',
    width: 640,
    height: 360,
    background: '#ffffff',
    nodes,
    connections: [],
  } as unknown as SceneDocument
}

// The runnable-work codec is a pure artifact boundary. It must not gain a
// convenience dependency on the mutable Studio registry or browser storage.
const codecSource = readFileSync(
  'src/features/scada-works/scada-work-package.ts',
  'utf8',
)
assert.doesNotMatch(codecSource, /component-system\/builtins/)
assert.doesNotMatch(codecSource, /studioComponentRegistry/)
assert.doesNotMatch(codecSource, /storage/)

const hostDefinition = definition('host.gauge')
const hostCapabilities = new ComponentRegistry([
  registration(hostDefinition),
])
const dependencyA = portableDependency(definition('portable.a'))
const dependencyB = portableDependency(definition('portable.b'))

const workPackage = createScadaWorkPackage(
  scene(),
  [dependencyB, dependencyA],
  hostCapabilities,
)

assert.equal(workPackage.packageVersion, SCADA_WORK_PACKAGE_VERSION)
assert.equal(
  workPackage.scene.version,
  8,
  'Work Package v1 owns its envelope version independently while normalizing nested Scene v7 input to Scene v8',
)
assert.ok(
  workPackage.scene.nodes.every((candidate) =>
    candidate.type === 'core.group' || !Object.hasOwn(candidate, 'props'),
  ),
  'canonical Work Package output must not persist legacy component props',
)
assert.deepEqual(
  workPackage.dependencies.map((dependency) => dependency.definition.type),
  ['portable.a', 'portable.b'],
  'dependency order is normalized for deterministic serialization',
)
assert.deepEqual(
  hostCapabilities.list().map((item) => item.definition.type),
  ['host.gauge'],
  'package preflight must not register bundled dependencies into host capabilities',
)

const serialized = serializeScadaWorkPackage(workPackage, hostCapabilities)
const parsedDocument = parseScadaWorkPackageDocument(serialized, hostCapabilities)
assert.ok(parsedDocument)
assert.deepEqual(parsedDocument, workPackage)
assert.equal(
  serializeScadaWorkPackage(parsedDocument, hostCapabilities),
  serialized,
  'normalized work-package serialization is deterministic',
)

const withTransportNoise = parseScadaWorkPackage(
  {
    ...workPackage,
    ignoredTransportExtension: true,
    dependencies: workPackage.dependencies.map((dependency) => ({
      ...dependency,
      ignoredDependencyExtension: true,
    })),
  },
  hostCapabilities,
)
assert.deepEqual(withTransportNoise, workPackage)

assert.equal(
  parseScadaWorkPackage(
    {
      ...workPackage,
      packageVersion: 999,
    },
    hostCapabilities,
  ),
  null,
  'unsupported work-package versions fail closed',
)
assert.equal(
  parseScadaWorkPackageDocument('{broken-json', hostCapabilities),
  null,
)

assert.equal(
  parseScadaWorkPackage(
    {
      ...workPackage,
      dependencies: [dependencyA],
    },
    hostCapabilities,
  ),
  null,
  'a Scene reference without its portable dependency fails closed',
)
assert.equal(
  parseScadaWorkPackage(
    {
      ...workPackage,
      dependencies: [dependencyA, dependencyB, dependencyA],
    },
    hostCapabilities,
  ),
  null,
  'duplicate portable dependency types fail closed',
)
assert.equal(
  parseScadaWorkPackage(
    {
      ...workPackage,
      dependencies: [
        dependencyA,
        dependencyB,
        portableDependency(hostDefinition),
      ],
    },
    hostCapabilities,
  ),
  null,
  'portable dependencies cannot shadow trusted host component capabilities',
)

const sceneWithoutB = scene()
sceneWithoutB.nodes = sceneWithoutB.nodes.filter((candidate) => candidate.id !== 'b')
assert.equal(
  parseScadaWorkPackage(
    {
      packageVersion: SCADA_WORK_PACKAGE_VERSION,
      scene: sceneWithoutB,
      dependencies: [dependencyA, dependencyB],
    },
    hostCapabilities,
  ),
  null,
  'unused bundled dependencies are rejected so the artifact is an exact closure',
)

const actionDependency = portableDependency(
  definition('portable.a', { action: true }),
)
assert.equal(
  parseScadaWorkPackage(
    {
      ...workPackage,
      dependencies: [actionDependency, dependencyB],
    },
    hostCapabilities,
  ),
  null,
  'portable Actions remain non-runnable until an executable contract is accepted',
)

const incompatibleHostCapabilities = new ComponentRegistry([
  registration(definition('host.gauge', { property: 'string' })),
])
assert.equal(
  parseScadaWorkPackage(workPackage, incompatibleHostCapabilities),
  null,
  'Scene validation remains scoped to the supplied host capability contract',
)

const migrated = createScadaWorkPackage(
  scene(6),
  [dependencyA, dependencyB],
  hostCapabilities,
)
assert.equal(
  migrated.scene.version,
  8,
  'legacy Scene documents are migrated through the scoped Scene codec to the canonical Scene v8 authority',
)

console.log(
  'Portable SCADA work package checks passed: the work envelope remains independently versioned at v1 while nested Scene v6/v7 input normalizes to Scene v8 authored Attribute/Property authority; exact portable dependency closure is required, host capabilities cannot be shadowed, unsupported executable dependencies fail closed, Scene migration/validation stays registry-scoped, and preflight does not mutate host registrations.',
)
