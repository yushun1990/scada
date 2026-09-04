import assert from 'node:assert/strict'
import {
  assertManagedSvgDocument,
  serializeManagedSvgDataUrl,
  serializeManagedSvgDocument,
  type ManagedSvgAttribute,
  type ManagedSvgDocument,
} from '../src/component-system/managedSvg'
import {
  COMPONENT_VISUAL_VERSION,
  assertComponentVisualDefinition,
  createEmptyCompositeVisual,
  type ComponentVisualDefinition,
} from '../src/component-system/visual'
import { normalizeStoredComponentVisual } from '../src/component-system/visualMigration'
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

function attributes(values: Record<string, string>): ManagedSvgAttribute[] {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({ name, value }))
}

const document: ManagedSvgDocument = {
  version: 1,
  root: {
    kind: 'element',
    tagName: 'svg',
    tagId: 'svg-tag-000001',
    attributes: attributes({ viewBox: '0 0 120 80' }),
    children: [
      {
        kind: 'element',
        tagName: 'g',
        tagId: 'svg-tag-000002',
        attributes: attributes({ id: 'body' }),
        children: [
          {
            kind: 'element',
            tagName: 'rect',
            tagId: 'svg-tag-000003',
            attributes: attributes({
              fill: '#64748b',
              height: '40',
              width: '60',
              x: '10',
              y: '20',
            }),
            children: [],
          },
        ],
      },
      {
        kind: 'element',
        tagName: 'g',
        tagId: 'svg-tag-000004',
        attributes: attributes({ id: 'indicator' }),
        children: [
          {
            kind: 'element',
            tagName: 'circle',
            tagId: 'svg-tag-000005',
            attributes: attributes({ cx: '92', cy: '40', fill: '#ef4444', r: '10' }),
            children: [],
          },
          {
            kind: 'element',
            tagName: 'path',
            tagId: 'svg-tag-000006',
            attributes: attributes({ d: 'M85 40h14', stroke: '#ffffff', 'stroke-width': '2' }),
            children: [],
          },
        ],
      },
    ],
  },
}

assertManagedSvgDocument(document)
const serializedSvg = serializeManagedSvgDocument(document)
const managedAssetRef = serializeManagedSvgDataUrl(document)
assert.ok(serializedSvg.includes('data-scada-tag="svg-tag-000003"'))
assert.ok(serializedSvg.includes('data-scada-tag="svg-tag-000005"'))
assert.ok(serializedSvg.includes('data-scada-tag="svg-tag-000006"'))
assert.equal(
  managedAssetRef,
  serializeManagedSvgDataUrl(document),
  'managed SVG serialization is deterministic',
)
assert.ok(managedAssetRef.startsWith('data:image/svg+xml;charset=utf-8,'))

const emptyVisual = createEmptyCompositeVisual({ width: 240, height: 160 })
const importedSvg: ImportedVisualAsset = {
  kind: 'svg',
  name: 'nested-industrial',
  assetRef: managedAssetRef,
  document,
  intrinsicWidth: 120,
  intrinsicHeight: 80,
}
const created = applyImportedVisualAsset(emptyVisual, importedSvg)
assert.equal(created.replaced, false)
assert.equal(created.layerId, 'svg1')
assert.equal(created.visual.layers.length, 1)
const createdLayer = created.visual.layers[0]
assert.equal(createdLayer?.kind, 'svg')
if (!createdLayer || createdLayer.kind !== 'svg') throw new Error('expected created SVG layer')
assert.deepEqual(createdLayer.document, document)
assert.equal(createdLayer.assetRef, managedAssetRef)
assert.equal(createdLayer.transform.width / createdLayer.transform.height, 120 / 80)
assert.equal(createdLayer.transform.x, 60)
assert.equal(createdLayer.transform.y, 40)
assertComponentVisualDefinition(created.visual)

const movedVisual: ComponentVisualDefinition = {
  ...created.visual,
  layers: created.visual.layers.map((layer) => layer.id === created.layerId
    ? {
        ...layer,
        transform: {
          ...layer.transform,
          x: 31,
          y: 47,
          width: 96,
          height: 64,
          rotation: 12,
          scaleX: 1.25,
          scaleY: 0.8,
        },
      }
    : layer),
}
const replacementDocument: ManagedSvgDocument = {
  ...document,
  root: {
    ...document.root,
    children: document.root.children.map((child) => child.kind === 'element' && child.tagId === 'svg-tag-000004'
      ? {
          ...child,
          children: child.children.map((nested) => nested.kind === 'element' && nested.tagId === 'svg-tag-000005'
            ? {
                ...nested,
                attributes: attributes({ cx: '92', cy: '40', fill: '#22c55e', r: '10' }),
              }
            : nested),
        }
      : child),
  },
}
const replacementAssetRef = serializeManagedSvgDataUrl(replacementDocument)
const replacement = applyImportedVisualAsset(
  movedVisual,
  {
    ...importedSvg,
    name: 'replacement',
    document: replacementDocument,
    assetRef: replacementAssetRef,
  },
  { selectedLayerId: created.layerId, requireReplacement: true },
)
assert.equal(replacement.replaced, true)
const replacementLayer = replacement.visual.layers[0]
assert.equal(replacementLayer?.id, created.layerId)
assert.deepEqual(replacementLayer?.transform, movedVisual.layers[0]?.transform)
assert.equal(replacementLayer?.name, movedVisual.layers[0]?.name)
assert.equal(
  replacementLayer?.kind === 'svg' ? replacementLayer.assetRef : null,
  replacementAssetRef,
)

assert.throws(
  () => applyImportedVisualAsset(
    movedVisual,
    {
      kind: 'image',
      name: 'incompatible',
      assetRef: 'data:image/png;base64,AA==',
      intrinsicWidth: 16,
      intrinsicHeight: 16,
    },
    { selectedLayerId: created.layerId, requireReplacement: true },
  ),
  /不兼容|同类型/,
)
assert.equal(
  movedVisual.layers[0]?.kind === 'svg' ? movedVisual.layers[0].assetRef : null,
  managedAssetRef,
  'failed replacement does not mutate the existing visual',
)

assert.throws(
  () => assertComponentVisualDefinition({
    ...created.visual,
    layers: created.visual.layers.map((layer) => layer.kind === 'svg'
      ? { ...layer, assetRef: 'data:image/svg+xml,not-the-canonical-document' }
      : layer),
  }),
  /assetRef.*document/,
  'managed SVG document and its derived assetRef cannot diverge',
)

const legacyVisual = {
  ...emptyVisual,
  version: 3,
  layers: [
    {
      id: 'legacy-svg',
      name: 'Legacy opaque SVG',
      kind: 'svg',
      parentId: null,
      transform: {
        x: 0,
        y: 0,
        width: 80,
        height: 40,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      assetRef: managedAssetRef,
      style: { fit: 'contain' },
    },
  ],
}
const migratedLegacy = normalizeStoredComponentVisual(legacyVisual, {
  width: 240,
  height: 160,
})
assert.equal((migratedLegacy as { version?: unknown }).version, COMPONENT_VISUAL_VERSION)
assertComponentVisualDefinition(migratedLegacy)
const migratedLegacyLayer = migratedLegacy.layers[0]
assert.equal(migratedLegacyLayer?.kind, 'svg')
assert.equal(
  migratedLegacyLayer?.kind === 'svg' ? migratedLegacyLayer.document : undefined,
  undefined,
  'v3 SVG layers migrate as opaque resources rather than being reparsed',
)

const readyEntry: ComponentLibraryEntry = {
  version: COMPONENT_PACKAGE_VERSION,
  id: 'managed-svg-fixture',
  definition: {
    type: 'custom.managed-svg-fixture',
    title: 'Managed SVG Fixture',
    category: 'Fixture',
    description: 'M6.3P1.1 fixture',
    size: {
      defaultWidth: 240,
      defaultHeight: 160,
      minWidth: 40,
      minHeight: 24,
    },
    attributes: {},
    properties: {},
    actions: {},
    events: {},
    anchors: [],
  },
  visual: created.visual,
  status: 'ready',
  implementationDraft: '',
  updatedAt: '2026-09-04T00:00:00.000Z',
  builtIn: false,
}
const artifact = createDistributableComponentPackage(readyEntry)
assert.equal(artifact.visual.version, COMPONENT_VISUAL_VERSION)
assert.deepEqual(
  parseDistributableComponentPackage(JSON.parse(serializeDistributableComponentPackage(artifact))),
  artifact,
  'managed SVG survives deterministic package round-trip',
)
const packageWithLegacyVisual = {
  ...artifact,
  visual: legacyVisual,
}
const parsedLegacyPackage = parseDistributableComponentPackage(packageWithLegacyVisual)
assert.ok(parsedLegacyPackage)
assert.equal(parsedLegacyPackage.visual.version, COMPONENT_VISUAL_VERSION)
assert.equal(parsedLegacyPackage.visual.layers[0]?.kind, 'svg')
assert.equal(
  parsedLegacyPackage.visual.layers[0]?.kind === 'svg'
    ? parsedLegacyPackage.visual.layers[0].document
    : undefined,
  undefined,
  'package v2 accepts legacy visual v3 only through the shared opaque migration',
)

console.log(
  'Managed SVG asset checks passed: stable private tag identity serializes deterministically, managed document/assetRef authority cannot diverge, local ingest preserves aspect ratio, compatible replacement preserves layer identity/transform, incompatible replacement fails without mutation, visual v3 migrates opaquely to v4, and M8 package round-trip remains self-contained.',
)
