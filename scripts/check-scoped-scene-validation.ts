import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { ComponentDefinition } from '../src/component-system/definition'
import type { ComponentRegistration } from '../src/component-system/registration'
import { ComponentRegistry } from '../src/component-system/registry'
import type { ComponentRenderer } from '../src/component-system/renderer'
import {
  parseSceneDocumentWithRegistry,
  serializeSceneDocumentWithRegistry,
} from '../src/scene/validation-core'

const dummyRenderer = (() => null) as unknown as ComponentRenderer

function definition(
  type: string,
  options: {
    property?: 'number' | 'string' | 'other'
    anchors?: 'left-right' | 'top-bottom'
    action?: boolean
    event?: boolean
  } = {},
): ComponentDefinition {
  const property = options.property ?? 'number'
  const anchors = options.anchors ?? 'left-right'

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
    properties: property === 'other'
      ? {
          other: {
            title: 'Other',
            kind: 'number',
            defaultValue: 0,
            bindable: true,
          },
        }
      : {
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
    anchors: anchors === 'left-right'
      ? [
          {
            id: 'left',
            title: 'Left',
            position: { x: 0, y: 0.5 },
            outward: { x: -1, y: 0 },
          },
          {
            id: 'right',
            title: 'Right',
            position: { x: 1, y: 0.5 },
            outward: { x: 1, y: 0 },
          },
        ]
      : [
          {
            id: 'top',
            title: 'Top',
            position: { x: 0.5, y: 0 },
            outward: { x: 0, y: -1 },
          },
          {
            id: 'bottom',
            title: 'Bottom',
            position: { x: 0.5, y: 1 },
            outward: { x: 0, y: 1 },
          },
        ],
  }
}

function registration(component: ComponentDefinition): ComponentRegistration {
  return {
    definition: component,
    renderer: dummyRenderer,
    createDefaultProps: () => Object.fromEntries(
      Object.entries(component.properties).map(([key, property]) => [
        key,
        property.defaultValue,
      ]),
    ),
  }
}

function node(
  id: string,
  type: string,
  props: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    name: id,
    type,
    parentId: null,
    visible: true,
    locked: false,
    transform: {
      x: id === 'a' ? 10 : 160,
      y: 20,
      width: 80,
      height: 48,
      rotation: 0,
    },
    props,
    bindings: [],
    behaviors: [],
    scadaSemantics: null,
    ...extra,
  }
}

function scene(
  nodes: unknown[],
  connections: unknown[] = [],
  version = 7,
) {
  return JSON.stringify({
    version,
    id: `scene-v${version}`,
    name: 'Scoped registry fixture',
    width: 640,
    height: 360,
    background: '#ffffff',
    nodes,
    connections,
  })
}

// The package-preflight codec must remain a pure data-layer module. This source
// boundary check prevents a future convenience import from silently pulling
// Studio/native renderer assets back into Node/package validation.
const coreSource = readFileSync('src/scene/validation-core.ts', 'utf8')
assert.doesNotMatch(coreSource, /component-system\/builtins/)
assert.doesNotMatch(coreSource, /components\/anchors/)
assert.doesNotMatch(coreSource, /from ['"]\.\/model['"]/)

const propertyType = 'm8.fixture.property'
const propertyNumberRegistry = new ComponentRegistry([
  registration(definition(propertyType, { property: 'number' })),
])
const propertyStringRegistry = new ComponentRegistry([
  registration(definition(propertyType, { property: 'string' })),
])
const propertyScene = scene([
  node('a', propertyType, { value: 42 }),
])

assert.equal(
  parseSceneDocumentWithRegistry(propertyScene, propertyNumberRegistry).nodes[0]?.type,
  propertyType,
)
assert.throws(
  () => parseSceneDocumentWithRegistry(propertyScene, propertyStringRegistry),
  /无效节点/,
  'Component Property validation must use the supplied registry definition',
)
assert.equal(propertyNumberRegistry.get(propertyType)?.definition.properties.value?.kind, 'number')
assert.equal(propertyStringRegistry.get(propertyType)?.definition.properties.value?.kind, 'string')

const anchorType = 'm8.fixture.anchor'
const leftRightRegistry = new ComponentRegistry([
  registration(definition(anchorType, { anchors: 'left-right' })),
])
const topBottomRegistry = new ComponentRegistry([
  registration(definition(anchorType, { anchors: 'top-bottom' })),
])
const anchorScene = scene(
  [
    node('a', anchorType, { value: 1 }),
    node('b', anchorType, { value: 2 }),
  ],
  [
    {
      id: 'connection-1',
      name: 'Connection 1',
      source: { nodeId: 'a', anchorId: 'right' },
      target: { nodeId: 'b', anchorId: 'left' },
      routing: 'orthogonal',
      style: {
        stroke: '#0f766e',
        strokeWidth: 4,
        dash: 'solid',
      },
    },
  ],
)

assert.equal(
  parseSceneDocumentWithRegistry(anchorScene, leftRightRegistry).connections.length,
  1,
)
assert.throws(
  () => parseSceneDocumentWithRegistry(anchorScene, topBottomRegistry),
  /不存在的视觉锚点/,
  'Connection Anchor validation must use the supplied registry',
)
assert.deepEqual(
  leftRightRegistry.get(anchorType)?.definition.anchors.map((anchor) => anchor.id),
  ['left', 'right'],
)
assert.deepEqual(
  topBottomRegistry.get(anchorType)?.definition.anchors.map((anchor) => anchor.id),
  ['top', 'bottom'],
)

const behaviorType = 'm8.fixture.behavior'
const behaviorRegistry = new ComponentRegistry([
  registration(definition(behaviorType, { action: true, event: true })),
])
const behaviorWithoutActionRegistry = new ComponentRegistry([
  registration(definition(behaviorType, { action: false, event: true })),
])
const behaviorScene = scene(
  [
    node('a', behaviorType, { value: 0 }, {
      scadaSemantics: undefined,
      behaviors: [
        {
          id: 'behavior-1',
          trigger: { kind: 'event', event: 'requested' },
          effect: { kind: 'action', targetNodeId: 'b', action: 'run' },
        },
      ],
    }),
    node('b', behaviorType, { value: 0 }, { scadaSemantics: undefined }),
  ],
  [],
  6,
)

assert.equal(
  parseSceneDocumentWithRegistry(behaviorScene, behaviorRegistry).nodes.length,
  2,
)
assert.throws(
  () => parseSceneDocumentWithRegistry(behaviorScene, behaviorWithoutActionRegistry),
  /不存在的 Behavior 目标 Action/,
  'legacy Event -> Action validation must use the supplied target definition',
)
assert.equal(Boolean(behaviorRegistry.get(behaviorType)?.definition.actions.run), true)
assert.equal(Boolean(behaviorWithoutActionRegistry.get(behaviorType)?.definition.actions.run), false)

const semanticType = 'm8.fixture.semantic'
const semanticRegistry = new ComponentRegistry([
  registration(definition(semanticType, { property: 'number' })),
])
const semanticMissingPropertyRegistry = new ComponentRegistry([
  registration(definition(semanticType, { property: 'other' })),
])
const semanticScene = scene([
  node('a', semanticType, {}, {
    scadaSemantics: {
      version: 1,
      valueBindings: [
        {
          id: 'value:value',
          targetProperty: 'value',
          expression: { kind: 'literal', value: 7 },
        },
      ],
      behaviors: [],
      interactions: [],
    },
  }),
])

const parsedSemantic = parseSceneDocumentWithRegistry(semanticScene, semanticRegistry)
assert.equal(parsedSemantic.nodes.length, 1)
assert.throws(
  () => parseSceneDocumentWithRegistry(semanticScene, semanticMissingPropertyRegistry),
  /无效节点/,
  'Scene v7 canonical semantics must be checked against the supplied definition',
)

const normalized = serializeSceneDocumentWithRegistry(
  parsedSemantic,
  semanticRegistry,
)
assert.deepEqual(
  parseSceneDocumentWithRegistry(normalized, semanticRegistry),
  parsedSemantic,
  'scoped serialization must reuse the same scoped parser/migrator',
)

const emptyRegistry = new ComponentRegistry()
assert.throws(
  () => parseSceneDocumentWithRegistry(propertyScene, emptyRegistry),
  /无效节点/,
  'unknown component types fail closed inside an isolated registry',
)
assert.equal(emptyRegistry.list().length, 0, 'validation must not register candidate types as a side effect')
assert.equal(propertyNumberRegistry.has(anchorType), false)
assert.equal(leftRightRegistry.has(propertyType), false)

console.log(
  'Scoped Scene validation checks passed: the pure codec has no Studio/native imports; Property, Anchor, legacy Event/Action and canonical Scene v7 semantics resolve only through the supplied registry; scoped serialization reuses the same boundary; unknown types fail closed; and isolated registries do not cross-contaminate or gain registrations during validation.',
)
