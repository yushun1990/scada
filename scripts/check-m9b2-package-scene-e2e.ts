import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveComponentVisualRules } from '../src/component-system/visualRules'
import { ComponentRegistry } from '../src/component-system/registry'
import {
  parseDistributableComponentPackageDocument,
  serializeDistributableComponentPackage,
} from '../src/features/component-library/distributable-component-package'
import { createStandaloneWorkRuntimeWithHost } from '../src/features/runtime/standalone-work-runtime-core'
import {
  createScadaWorkPackage,
  parseScadaWorkPackageDocument,
  serializeScadaWorkPackage,
} from '../src/features/scada-works/scada-work-package'
import { isGroupNode, type SceneDocument } from '../src/scene/schema'

const packageDocument = readFileSync(
  'public/component-packages/process-valve.scada-component.json',
  'utf8',
)
const dependency = parseDistributableComponentPackageDocument(packageDocument)
assert.ok(dependency)
assert.equal(dependency.packageVersion, 2)
assert.equal(dependency.definition.type, 'starter.process-valve')
assert.equal(dependency.definition.attributes.openColor?.defaultValue, '#22c55e')
assert.equal(dependency.definition.properties.state?.bindable, true)

const canonicalDependency = serializeDistributableComponentPackage(dependency)
assert.deepEqual(
  parseDistributableComponentPackageDocument(canonicalDependency),
  dependency,
  'component package export/import must preserve Attribute and Property authority',
)

const authoredOpenColor = '#7c3aed'
const scene: SceneDocument = {
  version: 8,
  id: 'm9b2-authority-e2e',
  name: 'M9B2 Attribute Property E2E',
  width: 640,
  height: 360,
  background: '#ffffff',
  nodes: [
    {
      id: 'valve-node',
      name: 'Portable valve',
      type: dependency.definition.type,
      parentId: null,
      visible: true,
      locked: false,
      transform: {
        x: 240,
        y: 140,
        width: 120,
        height: 80,
        rotation: 0,
      },
      attributes: {
        openColor: authoredOpenColor,
      },
      propertyFallbacks: {
        state: 'closed',
      },
      bindings: [],
      behaviors: [],
      scadaSemantics: {
        version: 1,
        valueBindings: [
          {
            id: 'value:m9b2-open',
            targetProperty: 'state',
            expression: { kind: 'literal', value: 'open' },
          },
        ],
        behaviors: [],
        interactions: [],
      },
    },
  ],
  connections: [],
}

const hostCapabilities = new ComponentRegistry([])
const workPackage = createScadaWorkPackage(scene, [dependency], hostCapabilities)
assert.equal(workPackage.scene.version, 8)
const packagedNode = workPackage.scene.nodes[0]
assert.ok(packagedNode && !isGroupNode(packagedNode))
assert.deepEqual(packagedNode.attributes, { openColor: authoredOpenColor })
assert.deepEqual(packagedNode.propertyFallbacks, { state: 'closed' })
assert.equal(Object.hasOwn(packagedNode, 'props'), false)

const serializedWork = serializeScadaWorkPackage(workPackage, hostCapabilities)
const parsedWork = parseScadaWorkPackageDocument(serializedWork, hostCapabilities)
assert.ok(parsedWork)
const parsedNode = parsedWork.scene.nodes[0]
assert.ok(parsedNode && !isGroupNode(parsedNode))
assert.deepEqual(
  parsedNode.attributes,
  { openColor: authoredOpenColor },
  'work package export/import must preserve authored Attributes independently',
)
assert.deepEqual(
  parsedNode.propertyFallbacks,
  { state: 'closed' },
  'work package export/import must preserve authored Property fallbacks independently',
)

const standalone = createStandaloneWorkRuntimeWithHost(parsedWork, [])
const release = standalone.acquire()
const attributeSnapshot = standalone.runtime.componentAttributes.getNodeSnapshot('valve-node')
const propertySnapshot = standalone.runtime.componentProps.getNodeSnapshot('valve-node')
assert.equal(Object.isFrozen(attributeSnapshot), true)
assert.equal(Object.isFrozen(propertySnapshot), true)
assert.equal(attributeSnapshot.openColor, authoredOpenColor)
assert.equal(propertySnapshot.state, 'open')
assert.equal(parsedNode.attributes.openColor, authoredOpenColor)
assert.equal(parsedNode.propertyFallbacks.state, 'closed')

const resolvedVisual = resolveComponentVisualRules(dependency.visual, {
  attributes: attributeSnapshot,
  properties: propertySnapshot,
})
const body = resolvedVisual.layers.find((layer) => layer.id === 'body')
const handle = resolvedVisual.layers.find((layer) => layer.id === 'handle')
assert.ok(body?.kind === 'vector')
assert.equal(body.style?.fill, authoredOpenColor)
assert.equal(handle?.transform.rotation, 90)
release()

console.log(
  'M9B2 package/Scene end-to-end checks passed: component package export/import preserves Attribute/Property contract authority, canonical Scene v8 and SCADA work transfer preserve authored Attributes separately from Property fallbacks, standalone runtime derives semantic Property state without mutating authored state, and private visual evaluation renders the instance-authored Attribute color.',
)
