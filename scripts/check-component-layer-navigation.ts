import assert from 'node:assert/strict'
import type { ComponentVisualLayer } from '../src/component-system/visual'
import {
  componentLayerAncestorIds,
  componentNavigatorRows,
} from '../src/features/component-library/component-layer-navigation'

function layer(id: string, parentId: string | null, kind: 'group' | 'text', name = id): ComponentVisualLayer {
  const base = {
    id, parentId, name, visible: true, opacity: 1,
    transform: { x: 0, y: 0, width: 64, height: 64, rotation: 0, scaleX: 1, scaleY: 1 },
  }
  return kind === 'group' ? { ...base, kind } : { ...base, kind, text: name }
}

// The backing array need not store children next to their parent.
const layers = [
  layer('label', 'nested', 'text', '运行标签'),
  layer('housing', null, 'group', 'Housing'),
  layer('nested', 'housing', 'group', '仪表'),
  layer('outside', null, 'text', '独立标签'),
  layer('empty', null, 'group', '空组合'),
]
const before = JSON.stringify(layers)
const collapsed = new Set(['housing', 'nested'])
const ids = (search = '', folded: ReadonlySet<string> = collapsed) =>
  componentNavigatorRows(layers, folded, search).map(({ layer }) => layer.id)

assert.deepEqual(ids(), ['housing', 'outside', 'empty'])
assert.deepEqual(ids('', new Set()), ['housing', 'nested', 'label', 'outside', 'empty'])
assert.deepEqual(ids('运行'), ['housing', 'nested', 'label'], 'a deep match reveals its full ancestor path')
assert.deepEqual(ids(' HOUSING '), ['housing', 'nested', 'label'], 'matching a group includes its contents')
assert.deepEqual(ids('文本'), ['housing', 'nested', 'label', 'outside'], 'Chinese type search works across the forest')
assert.deepEqual(ids('LABEL'), ['housing', 'nested', 'label'], 'canonical id search is case insensitive')
assert.deepEqual(ids('不存在'), [])
assert.deepEqual(ids(' '), ['housing', 'outside', 'empty'], 'clearing search restores the collapse state')
assert.deepEqual(componentLayerAncestorIds(layers, 'label'), ['nested', 'housing'])
assert.deepEqual(componentLayerAncestorIds(layers, 'outside'), [])
assert.deepEqual(componentLayerAncestorIds(layers, null), [])
assert.deepEqual(componentLayerAncestorIds(layers, 'removed'), [])
assert.deepEqual(componentNavigatorRows([], new Set()), [])
assert.equal(componentNavigatorRows(layers, new Set()).find(({ layer }) => layer.id === 'empty')?.hasChildren, false)
assert.equal(componentNavigatorRows(layers, new Set())[2].depth, 2)
assert.equal(JSON.stringify(layers), before, 'navigation never mutates layer order, transforms, or hierarchy')
assert.deepEqual([...collapsed], ['housing', 'nested'], 'search never rewrites collapse preferences')
console.log('Component layer navigation checks passed: forest order, nested search, collapse, ancestor reveal and immutable authoring data.')
