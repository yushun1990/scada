import assert from 'node:assert/strict'
import {
  serializeManagedSvgDataUrl,
  type ManagedSvgDocument,
} from '../src/component-system/managedSvg'
import { getManagedSvgElementAttribute, findManagedSvgElement } from '../src/component-system/managedSvgAuthoring'
import type { ComponentDefinition } from '../src/component-system/definition'
import {
  assertComponentVisualRules,
  resolveComponentVisualRules,
  type VisualRule,
} from '../src/component-system/visualRules'
import {
  COMPONENT_VISUAL_VERSION,
  type ComponentVisualDefinition,
} from '../src/component-system/visual'
import {
  applyImportedVisualAsset,
  type ImportedVisualAsset,
} from '../src/features/component-library/visual-asset-import'
import {
  createDistributableComponentPackage,
  parseDistributableComponentPackage,
  serializeDistributableComponentPackage,
} from '../src/features/component-library/distributable-component-package'
import {
  COMPONENT_PACKAGE_VERSION,
  type ComponentLibraryEntry,
} from '../src/features/component-library/component-document'

const document: ManagedSvgDocument = {
  version: 1,
  root: {
    kind: 'element',
    tagName: 'svg',
    tagId: 'svg-tag-000001',
    attributes: [{ name: 'viewBox', value: '0 0 120 80' }],
    children: [
      {
        kind: 'element',
        tagName: 'g',
        tagId: 'svg-tag-000002',
        attributes: [{ name: 'id', value: 'housing' }],
        children: [
          {
            kind: 'element',
            tagName: 'rect',
            tagId: 'svg-tag-000003',
            attributes: [
              { name: 'fill', value: '#64748b' },
              { name: 'height', value: '40' },
              { name: 'width', value: '60' },
              { name: 'x', value: '10' },
              { name: 'y', value: '20' },
            ],
            children: [],
          },
        ],
      },
      {
        kind: 'element',
        tagName: 'g',
        tagId: 'svg-tag-000004',
        attributes: [{ name: 'id', value: 'status' }],
        children: [
          {
            kind: 'element',
            tagName: 'circle',
            tagId: 'svg-tag-000005',
            attributes: [
              { name: 'cx', value: '92' },
              { name: 'cy', value: '40' },
              { name: 'fill', value: '#ef4444' },
              { name: 'r', value: '10' },
            ],
            children: [],
          },
          {
            kind: 'element',
            tagName: 'path',
            tagId: 'svg-tag-000006',
            attributes: [
              { name: 'd', value: 'M85 40h14' },
              { name: 'stroke', value: '#ffffff' },
              { name: 'stroke-width', value: '2' },
            ],
            children: [],
          },
        ],
      },
    ],
  },
}

const definition: ComponentDefinition = {
  type: 'custom.svg-rule-fixture',
  title: 'SVG Rule Fixture',
  category: 'Fixture',
  description: 'M6.3P1.3 deterministic fixture',
  size: {
    defaultWidth: 120,
    defaultHeight: 80,
    minWidth: 40,
    minHeight: 24,
  },
  attributes: {
    runningColor: {
      title: 'Running color',
      kind: 'color',
      defaultValue: '#22c55e',
    },
  },
  properties: {
    state: {
      title: 'State',
      kind: 'select',
      defaultValue: 'stopped',
      options: [
        { label: 'Stopped', value: 'stopped' },
        { label: 'Running', value: 'running' },
      ],
      bindable: true,
    },
  },
  actions: {},
  events: {},
  anchors: [],
}

const baseAssetRef = serializeManagedSvgDataUrl(document)
const tagRule: VisualRule = {
  id: 'running-lamp',
  enabled: true,
  propertyKey: 'state',
  operator: 'equals',
  compareValue: 'running',
  layerId: 'svg1',
  svgTagId: 'svg-tag-000005',
  target: 'style.fill',
  value: '#000000',
  valueSource: {
    namespace: 'attribute',
    key: 'runningColor',
  },
}
const layerRule: VisualRule = {
  id: 'running-layer-opacity',
  enabled: true,
  propertyKey: 'state',
  operator: 'equals',
  compareValue: 'running',
  layerId: 'svg1',
  target: 'opacity',
  value: 0.8,
}

const visual: ComponentVisualDefinition = {
  version: COMPONENT_VISUAL_VERSION,
  mode: 'composite',
  designSize: { width: 120, height: 80 },
  layers: [
    {
      id: 'svg1',
      name: 'Managed status SVG',
      kind: 'svg',
      parentId: null,
      transform: {
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      assetRef: baseAssetRef,
      document,
      style: { fit: 'contain' },
    },
  ],
  rules: [tagRule, layerRule],
  animations: [],
}

assertComponentVisualRules(definition, visual)

const stopped = resolveComponentVisualRules(visual, {
  attributes: { runningColor: '#16a34a' },
  properties: { state: 'stopped' },
})
const stoppedLayer = stopped.layers[0]
assert.equal(stoppedLayer?.kind, 'svg')
if (!stoppedLayer || stoppedLayer.kind !== 'svg' || !stoppedLayer.document) {
  throw new Error('expected stopped managed SVG layer')
}
assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(stoppedLayer.document, 'svg-tag-000005')!, 'fill'),
  '#ef4444',
  'unmatched SVG tag rule preserves the authored target value',
)
assert.equal(stoppedLayer.opacity, 1, 'unmatched whole-layer rule preserves authored opacity')

const resolved = resolveComponentVisualRules(visual, {
  attributes: { runningColor: '#16a34a' },
  properties: { state: 'running' },
})
const resolvedLayer = resolved.layers[0]
assert.equal(resolvedLayer?.kind, 'svg')
if (!resolvedLayer || resolvedLayer.kind !== 'svg' || !resolvedLayer.document) {
  throw new Error('expected resolved managed SVG layer')
}
const resolvedLamp = findManagedSvgElement(resolvedLayer.document, 'svg-tag-000005')
const baseLamp = findManagedSvgElement(document, 'svg-tag-000005')
assert.ok(resolvedLamp)
assert.ok(baseLamp)
assert.equal(getManagedSvgElementAttribute(resolvedLamp!, 'fill'), '#16a34a')
assert.equal(getManagedSvgElementAttribute(baseLamp!, 'fill'), '#ef4444')
assert.equal(resolvedLayer.opacity, 0.8)
assert.equal(
  resolvedLayer.assetRef,
  baseAssetRef,
  'runtime SVG tag rules do not rewrite the persisted base assetRef',
)
assert.notEqual(
  serializeManagedSvgDataUrl(resolvedLayer.document),
  resolvedLayer.assetRef,
  'renderer derives the runtime image source from the resolved document snapshot',
)
assert.equal(
  visual.layers[0]?.kind === 'svg' && visual.layers[0].document
    ? getManagedSvgElementAttribute(findManagedSvgElement(visual.layers[0].document, 'svg-tag-000005')!, 'fill')
    : null,
  '#ef4444',
  'runtime resolution does not mutate the authored managed document',
)

assert.throws(
  () => assertComponentVisualRules(definition, {
    ...visual,
    rules: [{ ...tagRule, svgTagId: 'svg-tag-999999' }],
  }),
  /不存在的 SVG Tag/,
)
assert.throws(
  () => assertComponentVisualRules(definition, {
    ...visual,
    rules: [{ ...tagRule, target: 'transform.x', value: 1 }],
  }),
  /target 与视觉目标类型不匹配/,
)
assert.throws(
  () => assertComponentVisualRules(definition, {
    ...visual,
    rules: [{ ...tagRule, valueSource: undefined, value: 'url(http://example.com/x)' }],
  }),
  /target value 无效/,
)

const replacementDocument: ManagedSvgDocument = {
  ...document,
  root: {
    ...document.root,
    children: [],
  },
}
const replacementAsset: ImportedVisualAsset = {
  kind: 'svg',
  name: 'replacement',
  assetRef: serializeManagedSvgDataUrl(replacementDocument),
  document: replacementDocument,
  intrinsicWidth: 120,
  intrinsicHeight: 80,
}
assert.throws(
  () => applyImportedVisualAsset(visual, replacementAsset, {
    selectedLayerId: 'svg1',
    requireReplacement: true,
  }),
  /内部标签 Visual Rule/,
  'full SVG replacement is blocked while private tag rules still target the old document',
)

const entry: ComponentLibraryEntry = {
  version: COMPONENT_PACKAGE_VERSION,
  id: 'svg-rule-fixture',
  definition,
  visual,
  status: 'ready',
  implementationDraft: '',
  updatedAt: '2026-09-04T00:00:00.000Z',
  builtIn: false,
}
const artifact = createDistributableComponentPackage(entry)
const roundTrip = parseDistributableComponentPackage(
  JSON.parse(serializeDistributableComponentPackage(artifact)),
)
assert.ok(roundTrip)
assert.equal(roundTrip.visual.rules?.[0]?.svgTagId, 'svg-tag-000005')
assert.deepEqual(roundTrip.visual.rules?.[0]?.valueSource, {
  namespace: 'attribute',
  key: 'runningColor',
})

console.log(
  'Managed SVG Visual Rule checks passed: Property conditions target stable private svg-tag identities through the existing rule resolver, Attribute/Property value namespaces remain explicit, resolved documents do not mutate authored base SVG/assetRef authority, invalid targets fail closed, structural replacement is fenced, and package v2 round-trip preserves the optional tag address.',
)
