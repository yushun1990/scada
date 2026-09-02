import assert from 'node:assert/strict'
import {
  createDefaultPropsFromDefinition,
  type ComponentDefinition,
} from '../src/component-system/definition'
import {
  migratePumpPersistedAuthoredState,
  pumpComponentDefinition,
} from '../src/component-system/builtins/pump-contract'
import type { ComponentRegistration } from '../src/component-system/registration'
import { ComponentRegistry } from '../src/component-system/registry'
import type { ComponentRenderer } from '../src/component-system/renderer'
import { parseSceneDocumentWithRegistry } from '../src/scene/validation-core'

const dummyRenderer = (() => null) as unknown as ComponentRenderer

function registration(
  definition: ComponentDefinition,
  migratePersistedAuthoredState?: ComponentRegistration['migratePersistedAuthoredState'],
): ComponentRegistration {
  return {
    definition,
    renderer: dummyRenderer,
    createDefaultProps: () => createDefaultPropsFromDefinition(definition),
    migratePersistedAuthoredState,
  }
}

const registry = new ComponentRegistry([
  registration(pumpComponentDefinition, migratePumpPersistedAuthoredState),
])

function scene(
  version: 7 | 8,
  authoredState: Record<string, unknown>,
) {
  const node = {
    id: 'pump-1',
    type: pumpComponentDefinition.type,
    name: 'Pump 1',
    parentId: null,
    visible: true,
    locked: false,
    transform: {
      x: 10,
      y: 20,
      width: 96,
      height: 135,
      rotation: 0,
    },
    bindings: [],
    behaviors: [],
    ...(version === 7 ? { scadaSemantics: null } : { scadaSemantics: null }),
    ...authoredState,
  }

  return JSON.stringify({
    version,
    id: `pump-scene-v${version}`,
    name: 'Pump migration fixture',
    width: 640,
    height: 360,
    background: '#fff',
    nodes: [node],
    connections: [],
  })
}

// Pre-v8 authored state used one mixed props bag and the legacy Pump contract
// encoded presentation palette names directly in the runtime-facing `state`.
const legacyV7 = parseSceneDocumentWithRegistry(
  scene(7, {
    props: {
      state: 'green',
      removedHistoricalField: 'ignored',
    },
  }),
  registry,
)
const legacyV7Pump = legacyV7.nodes[0]
assert.ok(legacyV7Pump && 'propertyFallbacks' in legacyV7Pump)
assert.equal(legacyV7.version, 8)
if (legacyV7Pump && 'propertyFallbacks' in legacyV7Pump) {
  assert.equal(legacyV7Pump.propertyFallbacks.state, 'running')
  assert.deepEqual(legacyV7Pump.attributes, {
    stoppedColor: '#788581',
    runningColor: '#0f9f20',
    manualColor: '#0369a1',
    warningColor: '#c2410c',
    alarmColor: '#b91c1c',
  })
  assert.equal(
    Object.hasOwn(legacyV7Pump.propertyFallbacks, 'removedHistoricalField'),
    false,
  )
}

// Scene v8 existed before the Pump semantic-value migration. Its separated
// namespace is already canonical, but the component-private persisted-value
// migrator still needs to normalize the historical color-coded state.
const transitionalV8 = parseSceneDocumentWithRegistry(
  scene(8, {
    attributes: {},
    propertyFallbacks: { state: 'red' },
  }),
  registry,
)
const transitionalPump = transitionalV8.nodes[0]
assert.ok(transitionalPump && 'propertyFallbacks' in transitionalPump)
if (transitionalPump && 'propertyFallbacks' in transitionalPump) {
  assert.equal(transitionalPump.propertyFallbacks.state, 'alarm')
  assert.equal(transitionalPump.attributes.runningColor, '#0f9f20')
}

// Current semantic values and authored Attribute overrides pass through without
// reinterpretation.
const currentV8 = parseSceneDocumentWithRegistry(
  scene(8, {
    attributes: { warningColor: '#abcdef' },
    propertyFallbacks: { state: 'warning' },
  }),
  registry,
)
const currentPump = currentV8.nodes[0]
assert.ok(currentPump && 'propertyFallbacks' in currentPump)
if (currentPump && 'propertyFallbacks' in currentPump) {
  assert.equal(currentPump.propertyFallbacks.state, 'warning')
  assert.equal(currentPump.attributes.warningColor, '#abcdef')
  assert.equal(currentPump.attributes.runningColor, '#0f9f20')
}

// The migration hook translates historical data but cannot legalize an unknown
// value. Final current-definition validation remains authoritative.
assert.throws(
  () => parseSceneDocumentWithRegistry(
    scene(8, {
      attributes: {},
      propertyFallbacks: { state: 'purple' },
    }),
    registry,
  ),
  /无效节点/,
)

// Nor may a registration migrator smuggle undeclared authored keys into the
// canonical Scene authority.
const strictDefinition: ComponentDefinition = {
  type: 'test.strict-migrator',
  title: 'Strict migrator',
  category: 'test',
  description: '',
  size: {
    defaultWidth: 80,
    defaultHeight: 40,
    minWidth: 20,
    minHeight: 20,
  },
  attributes: {
    color: { title: 'Color', kind: 'color', defaultValue: '#000000' },
  },
  properties: {
    value: { title: 'Value', kind: 'number', defaultValue: 0, bindable: true },
  },
  actions: {},
  events: {},
  anchors: [],
}
const strictRegistry = new ComponentRegistry([
  registration(strictDefinition, ({ attributes, propertyFallbacks }) => ({
    attributes: { ...attributes, hiddenAuthority: true },
    propertyFallbacks: { ...propertyFallbacks },
  })),
])
const strictScene = JSON.stringify({
  version: 8,
  id: 'strict-scene',
  name: 'Strict scene',
  width: 320,
  height: 180,
  background: '#fff',
  nodes: [
    {
      id: 'strict-1',
      type: strictDefinition.type,
      name: 'Strict 1',
      parentId: null,
      visible: true,
      locked: false,
      transform: { x: 0, y: 0, width: 80, height: 40, rotation: 0 },
      attributes: {},
      propertyFallbacks: {},
      bindings: [],
      behaviors: [],
      scadaSemantics: null,
    },
  ],
  connections: [],
})
assert.throws(
  () => parseSceneDocumentWithRegistry(strictScene, strictRegistry),
  /无效节点/,
)

console.log(
  'Built-in authority migration checks passed: legacy Pump palette-coded Scene v7 and transitional Scene v8 state normalize into semantic Properties plus authored color Attributes, current semantic/Attribute values remain stable, removed legacy fields stay ignored, and registration-private migration cannot bypass current schema validation or introduce hidden authority.',
)
