import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import { createEmptyCompositeVisual, type ComponentVisualDefinition } from '../src/component-system/visual'
import { reconcileVisualPropertyReferences } from '../src/features/component-library/component-property-references'

const definition: ComponentDefinition = {
  type: 'test.property-references', title: 'Property references', category: 'test',
  size: { defaultWidth: 120, defaultHeight: 80, minWidth: 1, minHeight: 1 },
  attributes: { state: { title: 'Authored state', kind: 'boolean', defaultValue: false } },
  properties: {
    state: { title: 'Legacy display title', kind: 'boolean', defaultValue: false, bindable: true },
    other: { title: 'Other', kind: 'boolean', defaultValue: true },
  },
  actions: {}, events: {}, anchors: [],
}
const timing = { durationMs: 1000, delayMs: 0, iterations: 1, direction: 'normal', easing: 'linear' } as const
const visual: ComponentVisualDefinition = {
  ...createEmptyCompositeVisual(),
  rules: [
    { id: 'condition', enabled: true, propertyKey: 'state', operator: 'equals', compareValue: false, layerId: 'label', target: 'visible', value: true },
    { id: 'property-read', enabled: true, propertyKey: 'other', operator: 'equals', compareValue: true, layerId: 'label', target: 'visible', value: true, valueSource: { namespace: 'property', key: 'state' } },
    { id: 'attribute-read', enabled: true, propertyKey: 'other', operator: 'equals', compareValue: true, layerId: 'label', target: 'visible', value: true, valueSource: { namespace: 'attribute', key: 'state' } },
  ],
  animations: [
    { id: 'activated', kind: 'fade', enabled: true, layerId: 'label', opacityMultiplier: 0.5, timing, activation: { kind: 'property', propertyKey: 'state', operator: 'equals', compareValue: false } },
    { id: 'always', kind: 'fade', enabled: true, layerId: 'label', opacityMultiplier: 0.5, timing, activation: { kind: 'always' } },
  ],
}
const before = structuredClone({ definition, visual })
const renamed: ComponentDefinition = {
  ...definition,
  properties: {
    renamedState: { ...definition.properties.state, title: 'renamedState' },
    other: { ...definition.properties.other },
  },
}
assert.notEqual(renamed.properties.renamedState, definition.properties.state,
  'the compact form copies the entry and synchronizes its title')
const result = reconcileVisualPropertyReferences(definition, renamed, visual, {
  previousKey: 'state', nextKey: 'renamedState',
})
assert.equal(result.rules?.length, 3)
assert.equal(result.rules?.[0].propertyKey, 'renamedState')
assert.deepEqual(result.rules?.[1].valueSource, { namespace: 'property', key: 'renamedState' })
assert.deepEqual(result.rules?.[2].valueSource, { namespace: 'attribute', key: 'state' })
assert.deepEqual(result.animations[0].activation, {
  kind: 'property', propertyKey: 'renamedState', operator: 'equals', compareValue: false,
})
assert.equal(result.animations[1], visual.animations[1], 'always-active animation is unrelated to the key edit')

// Replacing a key without an authored rename intent is deletion plus addition;
// neither matching values nor shared object identity may guess a new target.
const replacement = { ...renamed, properties: { renamedState: definition.properties.state, other: definition.properties.other } }
const deleted = reconcileVisualPropertyReferences(definition, replacement, visual)
assert.deepEqual(deleted.rules?.map((rule) => rule.id), ['attribute-read'])
assert.deepEqual(deleted.animations.map((animation) => animation.id), ['always'])

const changedKind: ComponentDefinition = {
  ...renamed,
  properties: { ...renamed.properties, renamedState: { title: 'renamedState', kind: 'number', defaultValue: 7 } },
}
const kindResult = reconcileVisualPropertyReferences(definition, changedKind, visual, { previousKey: 'state', nextKey: 'renamedState' })
assert.equal(kindResult.rules?.[0].compareValue, 7)
assert.deepEqual(kindResult.animations[0].activation, {
  kind: 'property', propertyKey: 'renamedState', operator: 'equals', compareValue: 7,
})
const numericVisual = structuredClone(visual)
numericVisual.rules = [{ ...visual.rules![0], operator: 'greaterThan', compareValue: 4 }]
numericVisual.animations[0].activation = { kind: 'property', propertyKey: 'state', operator: 'greaterThan', compareValue: 4 }
const repaired = reconcileVisualPropertyReferences(definition, renamed, numericVisual, { previousKey: 'state', nextKey: 'renamedState' })
assert.equal(repaired.rules?.[0].operator, 'equals')
assert.equal(repaired.rules?.[0].compareValue, false)
assert.deepEqual(repaired.animations[0].activation, { kind: 'property', propertyKey: 'renamedState', operator: 'equals', compareValue: false })

for (const rename of [
  { previousKey: 'missing', nextKey: 'renamedState' },
  { previousKey: 'state', nextKey: 'missing' },
  { previousKey: 'state', nextKey: 'other' },
]) {
  assert.throws(() => reconcileVisualPropertyReferences(definition, renamed, visual, rename), /Invalid Component Property rename/)
}
assert.throws(() => reconcileVisualPropertyReferences(definition, definition, visual, { previousKey: 'state', nextKey: 'state' }), /Invalid Component Property rename/)
assert.deepEqual({ definition, visual }, before, 'reconciliation and rejected intents must leave source snapshots unchanged')
console.log('Component Property reference checks passed: explicit copied-entry rename, rule conditions/value sources, Attribute isolation, animation activation, deletion without guessing, kind fallback, invalid-intent rejection and immutable input.')
