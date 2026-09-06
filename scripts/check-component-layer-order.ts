import assert from 'node:assert/strict'
import {
  COMPONENT_VISUAL_VERSION,
  type ComponentVisualDefinition,
  type GroupVisualLayer,
} from '../src/component-system/visual'
import {
  canReorderComponentLayers,
  reorderComponentLayers,
} from '../src/features/component-library/component-layer-order'

function group(id: string, parentId: string | null = null): GroupVisualLayer {
  return {
    id,
    name: id,
    kind: 'group',
    parentId,
    transform: {
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    visible: true,
    opacity: 1,
  }
}

function visual(layers: GroupVisualLayer[]): ComponentVisualDefinition {
  return {
    version: COMPONENT_VISUAL_VERSION,
    mode: 'composite',
    designSize: { width: 480, height: 360 },
    layers,
    animations: [],
  }
}

function ids(value: ComponentVisualDefinition) {
  return value.layers.map((layer) => layer.id)
}

const roots = visual([group('a'), group('b'), group('c'), group('d')])

const forward = reorderComponentLayers(roots, ['b'], 'bring-forward')
assert.equal(forward.changed, true)
assert.deepEqual(ids(forward.visual), ['a', 'c', 'b', 'd'])

const backward = reorderComponentLayers(roots, ['c'], 'send-backward')
assert.equal(backward.changed, true)
assert.deepEqual(ids(backward.visual), ['a', 'c', 'b', 'd'])

const front = reorderComponentLayers(roots, ['a'], 'bring-to-front')
assert.equal(front.changed, true)
assert.deepEqual(ids(front.visual), ['b', 'c', 'd', 'a'])

const back = reorderComponentLayers(roots, ['d'], 'send-to-back')
assert.equal(back.changed, true)
assert.deepEqual(ids(back.visual), ['d', 'a', 'b', 'c'])

const multiForward = reorderComponentLayers(roots, ['a', 'b'], 'bring-forward')
assert.equal(multiForward.changed, true)
assert.deepEqual(ids(multiForward.visual), ['c', 'a', 'b', 'd'])

const multiBackward = reorderComponentLayers(roots, ['c', 'd'], 'send-backward')
assert.equal(multiBackward.changed, true)
assert.deepEqual(ids(multiBackward.visual), ['a', 'c', 'd', 'b'])

const multiFront = reorderComponentLayers(roots, ['a', 'c'], 'bring-to-front')
assert.equal(multiFront.changed, true)
assert.deepEqual(ids(multiFront.visual), ['b', 'd', 'a', 'c'])

const multiBack = reorderComponentLayers(roots, ['b', 'd'], 'send-to-back')
assert.equal(multiBack.changed, true)
assert.deepEqual(ids(multiBack.visual), ['b', 'd', 'a', 'c'])

const alreadyFront = reorderComponentLayers(roots, ['d'], 'bring-to-front')
assert.equal(alreadyFront.changed, false)
assert.equal(alreadyFront.visual, roots)
assert.equal(canReorderComponentLayers(roots, ['d'], 'bring-to-front'), false)
assert.equal(canReorderComponentLayers(roots, ['a'], 'bring-forward'), true)

const nested = visual([
  group('root-a'),
  group('parent'),
  group('child-a', 'parent'),
  group('root-b'),
  group('child-b', 'parent'),
  group('root-c'),
])
const nestedFront = reorderComponentLayers(nested, ['child-a'], 'bring-to-front')
assert.equal(nestedFront.changed, true)
assert.deepEqual(
  ids(nestedFront.visual),
  ['root-a', 'parent', 'child-b', 'root-b', 'child-a', 'root-c'],
)
assert.deepEqual(
  nestedFront.visual.layers
    .filter((layer) => layer.parentId === null)
    .map((layer) => layer.id),
  ['root-a', 'parent', 'root-b', 'root-c'],
  'reordering children must not disturb root sibling order',
)

const mixedParents = reorderComponentLayers(
  nested,
  ['root-a', 'child-a'],
  'bring-to-front',
)
assert.equal(mixedParents.changed, false)
assert.equal(mixedParents.visual, nested)

console.log('component layer-order checks passed')
