import assert from 'node:assert/strict'
import type { ComponentDefinition } from '../src/component-system/definition'
import { serializeManagedSvgDataUrl, type ManagedSvgDocument } from '../src/component-system/managedSvg'
import { createEmptyCompositeVisual, type ComponentVisualDefinition } from '../src/component-system/visual'
import {
  COMPONENT_PACKAGE_VERSION,
  parseComponentLibraryDocument,
  serializeComponentLibraryDocument,
} from '../src/features/component-library/component-document'
import { reconcileVisualPropertyReferences } from '../src/features/component-library/component-property-references'

const definition: ComponentDefinition = {
  type: 'test.property-references', title: 'Property references', category: 'test', description: '',
  size: { defaultWidth: 120, defaultHeight: 80, minWidth: 1, minHeight: 1 },
  attributes: { authoredState: { title: 'Authored state', kind: 'boolean', defaultValue: false } },
  properties: {
    state: { title: 'Legacy display title', kind: 'boolean', defaultValue: false, bindable: true },
    other: { title: 'Other', kind: 'boolean', defaultValue: true },
  },
  actions: {}, events: {}, anchors: [],
}
const timing = { durationMs: 1000, delayMs: 0, iterations: 1, direction: 'normal', easing: 'linear' } as const
const visual: ComponentVisualDefinition = {
  ...createEmptyCompositeVisual(),
  layers: [{
    id: 'label', name: 'Label', kind: 'text', text: 'State', parentId: null,
    transform: { x: 0, y: 0, width: 120, height: 80, rotation: 0, scaleX: 1, scaleY: 1 },
    visible: true, opacity: 1,
  }],
  rules: [
    { id: 'condition', enabled: true, propertyKey: 'state', operator: 'equals', compareValue: false, layerId: 'label', target: 'visible', value: true },
    { id: 'property-read', enabled: true, propertyKey: 'other', operator: 'equals', compareValue: true, layerId: 'label', target: 'visible', value: true, valueSource: { namespace: 'property', key: 'state' } },
    { id: 'attribute-read', enabled: true, propertyKey: 'other', operator: 'equals', compareValue: true, layerId: 'label', target: 'visible', value: true, valueSource: { namespace: 'attribute', key: 'authoredState' } },
  ],
  animations: [
    { id: 'activated', kind: 'fade', enabled: true, layerId: 'label', opacityMultiplier: 0.5, timing, activation: { kind: 'property', propertyKey: 'state', operator: 'equals', compareValue: false } },
    { id: 'always', kind: 'fade', enabled: true, layerId: 'label', opacityMultiplier: 0.5, timing, activation: { kind: 'always' } },
  ],
}
function assertSaveable(nextDefinition: ComponentDefinition, nextVisual: ComponentVisualDefinition) {
  const serialized = serializeComponentLibraryDocument({
    version: COMPONENT_PACKAGE_VERSION, id: 'property-references',
    definition: nextDefinition, visual: nextVisual, status: 'draft',
    implementationDraft: '', updatedAt: '2026-10-10T00:00:00.000Z', builtIn: false,
  })
  const reopened = parseComponentLibraryDocument(serialized)
  assert.ok(reopened, 'the complete saved document must reopen')
  assert.equal(serializeComponentLibraryDocument(reopened), serialized)
}
assertSaveable(definition, visual)
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
assert.deepEqual(result.rules?.[2].valueSource, { namespace: 'attribute', key: 'authoredState' })
assert.deepEqual(result.animations[0].activation, {
  kind: 'property', propertyKey: 'renamedState', operator: 'equals', compareValue: false,
})
assert.equal(result.animations[1], visual.animations[1], 'always-active animation is unrelated to the key edit')
assertSaveable(renamed, result)

// Replacing a key without an authored rename intent is deletion plus addition;
// neither matching values nor shared object identity may guess a new target.
const replacement = { ...renamed, properties: { renamedState: definition.properties.state, other: definition.properties.other } }
const deleted = reconcileVisualPropertyReferences(definition, replacement, visual)
assert.deepEqual(deleted.rules?.map((rule) => rule.id), ['attribute-read'])
assert.deepEqual(deleted.animations.map((animation) => animation.id), ['always'])
assertSaveable(replacement, deleted)

const changedKind: ComponentDefinition = {
  ...renamed,
  properties: { ...renamed.properties, renamedState: { title: 'renamedState', kind: 'number', defaultValue: 7 } },
}
const kindResult = reconcileVisualPropertyReferences(definition, changedKind, visual, { previousKey: 'state', nextKey: 'renamedState' })
assert.equal(kindResult.rules?.[0].compareValue, 7)
assert.deepEqual(kindResult.animations[0].activation, {
  kind: 'property', propertyKey: 'renamedState', operator: 'equals', compareValue: 7,
})
assert.deepEqual(kindResult.rules?.map((rule) => rule.id), ['condition', 'attribute-read'],
  'a numeric Property cannot supply the boolean visible target')
assertSaveable(changedKind, kindResult)
const numericVisual = structuredClone(visual)
numericVisual.rules = [{ ...visual.rules![0], operator: 'greaterThan', compareValue: 4 }]
numericVisual.animations[0].activation = { kind: 'property', propertyKey: 'state', operator: 'greaterThan', compareValue: 4 }
const repaired = reconcileVisualPropertyReferences(definition, renamed, numericVisual, { previousKey: 'state', nextKey: 'renamedState' })
assert.equal(repaired.rules?.[0].operator, 'equals')
assert.equal(repaired.rules?.[0].compareValue, false)
assert.deepEqual(repaired.animations[0].activation, { kind: 'property', propertyKey: 'renamedState', operator: 'equals', compareValue: false })
assertSaveable(renamed, repaired)

// PR222-R1: reproduce the reported SVG source through complete-document save,
// including a value-only reference with an unrelated condition Property.
const svgDocument: ManagedSvgDocument = {
  version: 1,
  root: {
    kind: 'element', tagName: 'svg', tagId: 'svg-tag-000001',
    attributes: [{ name: 'viewBox', value: '0 0 120 80' }],
    children: [{
      kind: 'element', tagName: 'rect', tagId: 'svg-tag-000002',
      attributes: [{ name: 'fill', value: '#64748b' }, { name: 'height', value: '80' }, { name: 'width', value: '120' }],
      children: [],
    }],
  },
}
const svgDefinition: ComponentDefinition = {
  ...definition,
  properties: {
    ...definition.properties,
    state: {
      title: 'State', kind: 'select', defaultValue: 'stopped',
      options: [{ label: 'Stopped', value: 'stopped' }, { label: 'Running', value: 'running' }],
    },
  },
}
const svgVisual: ComponentVisualDefinition = {
  ...visual,
  layers: [...visual.layers, {
    ...visual.layers[0], id: 'svg', name: 'SVG', kind: 'svg',
    assetRef: serializeManagedSvgDataUrl(svgDocument), document: svgDocument,
  }],
  rules: [{
    id: 'rule_theme_running_1', enabled: true,
    propertyKey: 'state', operator: 'equals', compareValue: 'running',
    layerId: 'svg', target: 'svg.themeState', value: 'running',
    valueSource: { namespace: 'property', key: 'state' },
  }, {
    id: 'value-only', enabled: true,
    propertyKey: 'other', operator: 'equals', compareValue: true,
    layerId: 'label', target: 'style.fontFamily', value: 'Arial',
    valueSource: { namespace: 'property', key: 'state' },
  }, {
    ...visual.rules![0], id: 'compatible-condition', compareValue: 'running',
  }, visual.rules![2]],
  animations: [{
    ...visual.animations[0],
    activation: { kind: 'property', propertyKey: 'state', operator: 'equals', compareValue: 'running' },
  }],
}
assertSaveable(svgDefinition, svgVisual)
const svgBefore = structuredClone({ definition: svgDefinition, visual: svgVisual })
for (const shouldRename of [false, true]) {
  const nextKey = shouldRename ? 'renamedState' : 'state'
  const booleanDefinition: ComponentDefinition = {
    ...svgDefinition,
    properties: { other: svgDefinition.properties.other, [nextKey]: definition.properties.state },
  }
  const reconciled = reconcileVisualPropertyReferences(svgDefinition, booleanDefinition, svgVisual,
    shouldRename ? { previousKey: 'state', nextKey } : undefined)
  assert.deepEqual(reconciled.rules?.map((rule) => rule.id), ['compatible-condition', 'attribute-read'])
  assert.equal(reconciled.rules?.[0].propertyKey, nextKey)
  assert.equal(reconciled.rules?.[0].compareValue, false)
  assert.deepEqual(reconciled.rules?.[1].valueSource, { namespace: 'attribute', key: 'authoredState' })
  assert.deepEqual(reconciled.animations[0].activation, {
    kind: 'property', propertyKey: nextKey, operator: 'equals', compareValue: false,
  })
  assertSaveable(booleanDefinition, reconciled)
}

// Compatible kind changes must retain source semantics; same-kind default
// edits must still honor target enums, numeric bounds and managed SVG tags.
const stringDefinition: ComponentDefinition = {
  ...svgDefinition,
  properties: { ...svgDefinition.properties, state: { title: 'State', kind: 'string', defaultValue: 'running' } },
}
const compatible = reconcileVisualPropertyReferences(svgDefinition, stringDefinition, svgVisual)
assert.deepEqual(compatible.rules, svgVisual.rules)
assertSaveable(stringDefinition, compatible)
for (const fixture of [
  { target: 'opacity' as const, layerId: 'label', initial: 0.5, next: 2, value: 0.5 },
  { target: 'style.align' as const, layerId: 'label', initial: 'left', next: 'invalid', value: 'left' },
  { target: 'style.fill' as const, layerId: 'svg', svgTagId: 'svg-tag-000002', initial: '#64748b', next: 'url(http://example.com/x)', value: '#64748b' },
]) {
  const sourceDefinition: ComponentDefinition = {
    ...definition,
    properties: {
      ...definition.properties,
      state: typeof fixture.initial === 'number'
        ? { title: 'Source', kind: 'number', defaultValue: fixture.initial }
        : { title: 'Source', kind: 'string', defaultValue: fixture.initial },
    },
  }
  const sourceVisual: ComponentVisualDefinition = {
    ...svgVisual, animations: [],
    rules: [{
      id: 'bounded-source', enabled: true, propertyKey: 'other', operator: 'equals', compareValue: true,
      layerId: fixture.layerId, target: fixture.target, value: fixture.value,
      svgTagId: fixture.svgTagId, valueSource: { namespace: 'property', key: 'state' },
    }],
  }
  assertSaveable(sourceDefinition, sourceVisual)
  const nextDefinition = structuredClone(sourceDefinition)
  nextDefinition.properties.state.defaultValue = fixture.next
  const reconciled = reconcileVisualPropertyReferences(sourceDefinition, nextDefinition, sourceVisual)
  assert.deepEqual(reconciled.rules, [], 'source compatibility uses the actual layer, target and optional SVG tag')
  assertSaveable(nextDefinition, reconciled)
}
assert.deepEqual({ definition: svgDefinition, visual: svgVisual }, svgBefore)

for (const rename of [
  { previousKey: 'missing', nextKey: 'renamedState' },
  { previousKey: 'state', nextKey: 'missing' },
  { previousKey: 'state', nextKey: 'other' },
]) {
  assert.throws(() => reconcileVisualPropertyReferences(definition, renamed, visual, rename), /Invalid Component Property rename/)
}
assert.throws(() => reconcileVisualPropertyReferences(definition, definition, visual, { previousKey: 'state', nextKey: 'state' }), /Invalid Component Property rename/)
assert.deepEqual({ definition, visual }, before, 'reconciliation and rejected intents must leave source snapshots unchanged')
console.log('Component Property reference checks passed: explicit rename, source/target reconciliation, Attribute isolation, animation activation, deletion, kind/default edits, SVG tags, complete-document save/reopen, invalid-intent rejection and immutable input.')
