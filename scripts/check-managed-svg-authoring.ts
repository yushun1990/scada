import './check-managed-svg-geometry-authoring'
import assert from 'node:assert/strict'
import {
  assertManagedSvgDocument,
  cloneManagedSvgDocument,
  serializeManagedSvgDataUrl,
  serializeManagedSvgDocument,
  type ManagedSvgAttribute,
  type ManagedSvgDocument,
} from '../src/component-system/managedSvg'
import {
  findManagedSvgElement,
  findManagedSvgElementByAuthorRef,
  getManagedSvgElementAttribute,
  updateManagedSvgElementAuthorRef,
  updateManagedSvgElementPresentation,
} from '../src/component-system/managedSvgAuthoring'
import type { SvgVisualLayer } from '../src/component-system/visual'
import { mapManagedSvgViewportBoundsToLayer } from '../src/features/component-library/component-managed-svg-selection'

function attributes(values: Record<string, string>): ManagedSvgAttribute[] {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({ name, value }))
}

const baseDocument: ManagedSvgDocument = {
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
        attributes: attributes({ id: 'housing' }),
        children: [
          {
            kind: 'element',
            tagName: 'rect',
            tagId: 'svg-tag-000003',
            attributes: attributes({ fill: '#64748b', height: '48', width: '72', x: '8', y: '16' }),
            children: [],
          },
        ],
      },
      {
        kind: 'element',
        tagName: 'g',
        tagId: 'svg-tag-000004',
        attributes: attributes({ id: 'status' }),
        children: [
          {
            kind: 'element',
            tagName: 'circle',
            tagId: 'svg-tag-000005',
            attributes: attributes({ cx: '94', cy: '28', fill: '#ef4444', r: '9' }),
            children: [],
          },
          {
            kind: 'element',
            tagName: 'path',
            tagId: 'svg-tag-000006',
            attributes: attributes({ d: 'M86 52h16', fill: 'none', stroke: '#ffffff', 'stroke-width': '2' }),
            children: [],
          },
        ],
      },
    ],
  },
}

assertManagedSvgDocument(baseDocument)
const baseSerialized = serializeManagedSvgDocument(baseDocument)
const baseAssetRef = serializeManagedSvgDataUrl(baseDocument)

const referenced = updateManagedSvgElementAuthorRef(
  baseDocument,
  'svg-tag-000005',
  ' rotor ',
)
assert.equal(
  findManagedSvgElement(referenced, 'svg-tag-000005')?.authorRef,
  'rotor',
  'authoring helper normalizes surrounding whitespace',
)
assert.equal(
  findManagedSvgElementByAuthorRef(referenced, 'rotor')?.tagId,
  'svg-tag-000005',
  'author reference reverse lookup resolves back to the canonical tagId',
)
assert.equal(
  serializeManagedSvgDocument(referenced),
  baseSerialized,
  'authorRef metadata must not enter canonical SVG/XML serialization',
)
assert.equal(
  serializeManagedSvgDataUrl(referenced),
  baseAssetRef,
  'authorRef-only edits must not change the renderer assetRef bytes',
)

const renamedReference = updateManagedSvgElementAuthorRef(
  referenced,
  'svg-tag-000005',
  'rotorMain',
)
assert.equal(findManagedSvgElementByAuthorRef(renamedReference, 'rotor'), null)
assert.equal(
  findManagedSvgElementByAuthorRef(renamedReference, 'rotorMain')?.tagId,
  'svg-tag-000005',
  'renaming authorRef preserves canonical element identity',
)
assert.equal(
  findManagedSvgElement(renamedReference, 'svg-tag-000005')?.tagId,
  'svg-tag-000005',
)

const clonedReference = cloneManagedSvgDocument(renamedReference)
assert.equal(
  findManagedSvgElement(clonedReference, 'svg-tag-000005')?.authorRef,
  'rotorMain',
  'managed document clone preserves authorRef metadata',
)
const restoredReference = JSON.parse(JSON.stringify(clonedReference)) as ManagedSvgDocument
assertManagedSvgDocument(restoredReference)
assert.equal(
  findManagedSvgElementByAuthorRef(restoredReference, 'rotorMain')?.tagId,
  'svg-tag-000005',
  'save/reload preserves authorRef metadata and canonical tag identity',
)

const removedReference = updateManagedSvgElementAuthorRef(
  restoredReference,
  'svg-tag-000005',
  '',
)
assert.equal(findManagedSvgElement(removedReference, 'svg-tag-000005')?.authorRef, undefined)
assert.equal(
  findManagedSvgElement(removedReference, 'svg-tag-000005')?.tagId,
  'svg-tag-000005',
  'removing a friendly reference does not change canonical tag identity',
)
assert.equal(serializeManagedSvgDocument(removedReference), baseSerialized)

const oneOccupiedReference = updateManagedSvgElementAuthorRef(
  baseDocument,
  'svg-tag-000003',
  'housingBody',
)
assert.throws(
  () => updateManagedSvgElementAuthorRef(oneOccupiedReference, 'svg-tag-000005', 'housingBody'),
  /已被占用|重复/,
  'duplicate author references fail closed within one managed document',
)
assert.throws(
  () => updateManagedSvgElementAuthorRef(baseDocument, 'svg-tag-000005', 'svg-tag-friendly'),
  /authorRef|保留/,
  'canonical svg-tag- identity prefix is reserved from author references',
)
assert.throws(
  () => updateManagedSvgElementAuthorRef(baseDocument, 'svg-tag-000005', 'bad ref'),
  /authorRef|标识符/,
  'invalid author reference grammar fails closed',
)

const invalidDuplicate: ManagedSvgDocument = {
  ...baseDocument,
  root: {
    ...baseDocument.root,
    children: baseDocument.root.children.map((child) =>
      child.kind === 'element'
        ? { ...child, authorRef: 'duplicate' }
        : child,
    ),
  },
}
assert.throws(
  () => assertManagedSvgDocument(invalidDuplicate),
  /authorRef 重复/,
  'core persisted-document validation rejects duplicate author references even outside helpers',
)

const lampAuthored = updateManagedSvgElementPresentation(
  baseDocument,
  'svg-tag-000005',
  'fill',
  '#22c55e',
)
const twoTargetAuthored = updateManagedSvgElementPresentation(
  lampAuthored,
  'svg-tag-000006',
  'fill',
  '#f59e0b',
)

assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(baseDocument, 'svg-tag-000005')!, 'fill'),
  '#ef4444',
  'static authoring must not mutate the previous document snapshot',
)
assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(twoTargetAuthored, 'svg-tag-000005')!, 'fill'),
  '#22c55e',
)
assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(twoTargetAuthored, 'svg-tag-000006')!, 'fill'),
  '#f59e0b',
)

const tagIdsBefore = [
  'svg-tag-000001',
  'svg-tag-000002',
  'svg-tag-000003',
  'svg-tag-000004',
  'svg-tag-000005',
  'svg-tag-000006',
]
assert.deepEqual(
  tagIdsBefore.map((tagId) => findManagedSvgElement(twoTargetAuthored, tagId)?.tagId),
  tagIdsBefore,
  'presentation edits preserve every retained stable tag identity',
)

const restored = JSON.parse(JSON.stringify(twoTargetAuthored)) as ManagedSvgDocument
assertManagedSvgDocument(restored)
assert.deepEqual(
  tagIdsBefore.map((tagId) => findManagedSvgElement(restored, tagId)?.tagId),
  tagIdsBefore,
  'save/reload preserves managed tag identity',
)
assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(restored, 'svg-tag-000005')!, 'fill'),
  '#22c55e',
)
assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(restored, 'svg-tag-000006')!, 'fill'),
  '#f59e0b',
)

const authoredSerialized = serializeManagedSvgDocument(restored)
assert.notEqual(authoredSerialized, baseSerialized)
assert.ok(authoredSerialized.includes('data-scada-tag="svg-tag-000005"'))
assert.ok(authoredSerialized.includes('fill="#22c55e"'))
assert.ok(authoredSerialized.includes('data-scada-tag="svg-tag-000006"'))
assert.ok(authoredSerialized.includes('fill="#f59e0b"'))
assert.equal(
  serializeManagedSvgDataUrl(restored),
  serializeManagedSvgDataUrl(twoTargetAuthored),
  'canonical assetRef is derived deterministically from authored document state',
)

const removedFill = updateManagedSvgElementPresentation(
  restored,
  'svg-tag-000006',
  'fill',
  '',
)
assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(removedFill, 'svg-tag-000006')!, 'fill'),
  null,
  'empty authoring value removes the controlled attribute and returns to SVG inheritance',
)

assert.throws(
  () => updateManagedSvgElementPresentation(restored, 'svg-tag-000005', 'opacity', '1.5'),
  /opacity/,
)
assert.throws(
  () => updateManagedSvgElementPresentation(restored, 'svg-tag-000006', 'stroke-width', '-1'),
  /stroke-width/,
)
assert.throws(
  () => updateManagedSvgElementPresentation(restored, 'svg-tag-000005', 'fill', 'url(http://example.test/a.svg)'),
  /外部资源|url/,
)
assert.throws(
  () => updateManagedSvgElementPresentation(restored, 'missing-tag', 'fill', '#000000'),
  /不存在/,
)

const selectionLayerBase: SvgVisualLayer = {
  id: 'svg-selection',
  name: 'Selection mapping fixture',
  kind: 'svg',
  parentId: null,
  transform: {
    x: 0,
    y: 0,
    width: 240,
    height: 240,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  },
  visible: true,
  opacity: 1,
  assetRef: baseAssetRef,
  document: baseDocument,
  style: { fit: 'contain' },
}
const middleHalf = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }

assert.deepEqual(
  mapManagedSvgViewportBoundsToLayer(selectionLayerBase, middleHalf),
  { x: 60, y: 80, width: 120, height: 80 },
  'contain selection mapping reuses the same intrinsic aspect ratio and centered draw box as VisualAssetLayer',
)
assert.deepEqual(
  mapManagedSvgViewportBoundsToLayer(
    { ...selectionLayerBase, style: { fit: 'stretch' } },
    middleHalf,
  ),
  { x: 60, y: 60, width: 120, height: 120 },
  'stretch selection mapping covers the full layer viewport',
)
assert.deepEqual(
  mapManagedSvgViewportBoundsToLayer(
    {
      ...selectionLayerBase,
      transform: { ...selectionLayerBase.transform, width: 120, height: 120 },
      style: { fit: 'cover' },
    },
    middleHalf,
  ),
  { x: 15, y: 30, width: 90, height: 60 },
  'cover selection mapping applies the same source crop semantics as VisualAssetLayer',
)

console.log(
  'Managed SVG authoring checks passed: stable author references are optional unique metadata over canonical tagId identity, alias-only edits leave serialized SVG/assetRef bytes unchanged, clone/save/reload preserve aliases, rename/remove preserve tag identity, invalid/duplicate/reserved aliases fail closed, controlled presentation authoring remains deterministic and immutable, and Canvas selection bounds reuse the existing asset fit mapping without creating a second renderer target.',
)