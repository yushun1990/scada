import assert from 'node:assert/strict'
import {
  assertManagedSvgDocument,
  serializeManagedSvgDataUrl,
  serializeManagedSvgDocument,
  type ManagedSvgAttribute,
  type ManagedSvgDocument,
} from '../src/component-system/managedSvg'
import {
  findManagedSvgElement,
  getManagedSvgElementAttribute,
  getManagedSvgGeometryFields,
  updateManagedSvgElementGeometry,
} from '../src/component-system/managedSvgAuthoring'

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
    tagId: 'svg-tag-100001',
    attributes: attributes({ viewBox: '0 0 200 120' }),
    children: [
      {
        kind: 'element',
        tagName: 'rect',
        tagId: 'svg-tag-100002',
        authorRef: 'body',
        attributes: attributes({ height: '30', width: '60', x: '10', y: '12' }),
        children: [],
      },
      {
        kind: 'element',
        tagName: 'circle',
        tagId: 'svg-tag-100003',
        attributes: attributes({ cx: '90', cy: '24', r: '8' }),
        children: [],
      },
      {
        kind: 'element',
        tagName: 'ellipse',
        tagId: 'svg-tag-100004',
        attributes: attributes({ cx: '120', cy: '24', rx: '12', ry: '6' }),
        children: [],
      },
      {
        kind: 'element',
        tagName: 'line',
        tagId: 'svg-tag-100005',
        attributes: attributes({ x1: '0', x2: '20', y1: '60', y2: '60' }),
        children: [],
      },
      {
        kind: 'element',
        tagName: 'polyline',
        tagId: 'svg-tag-100006',
        attributes: attributes({ points: '0,80 20,100 40,80' }),
        children: [],
      },
      {
        kind: 'element',
        tagName: 'polygon',
        tagId: 'svg-tag-100007',
        attributes: attributes({ points: '80,80 100,100 120,80' }),
        children: [],
      },
    ],
  },
}

assertManagedSvgDocument(document)
const originalSerialized = serializeManagedSvgDocument(document)

assert.deepEqual(
  getManagedSvgGeometryFields(findManagedSvgElement(document, 'svg-tag-100002')!),
  ['x', 'y', 'width', 'height', 'rx', 'ry'],
)
assert.deepEqual(
  getManagedSvgGeometryFields(findManagedSvgElement(document, 'svg-tag-100003')!),
  ['cx', 'cy', 'r'],
)
assert.deepEqual(
  getManagedSvgGeometryFields(findManagedSvgElement(document, 'svg-tag-100004')!),
  ['cx', 'cy', 'rx', 'ry'],
)
assert.deepEqual(
  getManagedSvgGeometryFields(findManagedSvgElement(document, 'svg-tag-100005')!),
  ['x1', 'y1', 'x2', 'y2'],
)
assert.deepEqual(
  getManagedSvgGeometryFields(findManagedSvgElement(document, 'svg-tag-100006')!),
  ['points'],
)
assert.deepEqual(getManagedSvgGeometryFields(document.root), [])

const moved = updateManagedSvgElementGeometry(document, 'svg-tag-100002', 'x', ' -4.500 ')
const sized = updateManagedSvgElementGeometry(moved, 'svg-tag-100002', 'width', '96.00')
const lineEdited = updateManagedSvgElementGeometry(sized, 'svg-tag-100005', 'x1', '1e2')
const pointsEdited = updateManagedSvgElementGeometry(
  lineEdited,
  'svg-tag-100006',
  'points',
  '0,0  10 20, 30,40',
)

assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(pointsEdited, 'svg-tag-100002')!, 'x'),
  '-4.5',
)
assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(pointsEdited, 'svg-tag-100002')!, 'width'),
  '96',
)
assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(pointsEdited, 'svg-tag-100005')!, 'x1'),
  '100',
)
assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(pointsEdited, 'svg-tag-100006')!, 'points'),
  '0,0 10,20 30,40',
)
assert.equal(
  findManagedSvgElement(pointsEdited, 'svg-tag-100002')?.tagId,
  'svg-tag-100002',
)
assert.equal(
  findManagedSvgElement(pointsEdited, 'svg-tag-100002')?.authorRef,
  'body',
  'geometry editing preserves authorRef on the same canonical tag identity',
)
assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(document, 'svg-tag-100002')!, 'x'),
  '10',
  'previous managed document snapshot remains immutable',
)

const removedRadius = updateManagedSvgElementGeometry(pointsEdited, 'svg-tag-100003', 'r', '')
assert.equal(
  getManagedSvgElementAttribute(findManagedSvgElement(removedRadius, 'svg-tag-100003')!, 'r'),
  null,
  'empty typed geometry input removes the controlled SVG attribute',
)

assert.throws(
  () => updateManagedSvgElementGeometry(document, 'svg-tag-100002', 'width', '-1'),
  /width|负数/,
)
assert.throws(
  () => updateManagedSvgElementGeometry(document, 'svg-tag-100003', 'r', '-0.5'),
  /r|负数/,
)
assert.throws(
  () => updateManagedSvgElementGeometry(document, 'svg-tag-100002', 'x', '12px'),
  /x|无单位/,
)
assert.throws(
  () => updateManagedSvgElementGeometry(document, 'svg-tag-100005', 'x1', 'Infinity'),
  /x1|有限|无单位/,
)
assert.throws(
  () => updateManagedSvgElementGeometry(document, 'svg-tag-100003', 'width', '12'),
  /不支持几何字段/,
  'wrong tag/field combinations fail closed',
)
assert.throws(
  () => updateManagedSvgElementGeometry(document, 'svg-tag-100006', 'points', '0,0 10'),
  /坐标对/,
)
assert.throws(
  () => updateManagedSvgElementGeometry(document, 'svg-tag-100007', 'points', '0,0 nope,1'),
  /points|坐标/,
)
assert.throws(
  () => updateManagedSvgElementGeometry(document, 'svg-tag-100007', 'points', '0,,1'),
  /points|坐标/,
)
const oversizedPoints = Array.from({ length: 513 }, (_, index) => `${index},${index}`).join(' ')
assert.throws(
  () => updateManagedSvgElementGeometry(document, 'svg-tag-100007', 'points', oversizedPoints),
  /最多接受 512/,
)
assert.throws(
  () => updateManagedSvgElementGeometry(document, 'missing-tag', 'x', '1'),
  /不存在/,
)

const editedSerialized = serializeManagedSvgDocument(pointsEdited)
assert.notEqual(editedSerialized, originalSerialized)
assert.ok(editedSerialized.includes('data-scada-tag="svg-tag-100002"'))
assert.ok(editedSerialized.includes('x="-4.5"'))
assert.ok(editedSerialized.includes('width="96"'))
assert.ok(editedSerialized.includes('points="0,0 10,20 30,40"'))

const restored = JSON.parse(JSON.stringify(pointsEdited)) as ManagedSvgDocument
assertManagedSvgDocument(restored)
assert.equal(
  serializeManagedSvgDataUrl(restored),
  serializeManagedSvgDataUrl(pointsEdited),
  'typed geometry canonical asset bytes survive save/reload deterministically',
)
assert.equal(findManagedSvgElement(restored, 'svg-tag-100002')?.authorRef, 'body')

console.log(
  'Managed SVG typed geometry checks passed: authorized field sets are tag-scoped, unitless finite numbers and bounded points normalize deterministically, invalid/wrong-tag input fails closed, immutable edits preserve tagId/authorRef, and canonical SVG/assetRef bytes update through the existing managed document authority.',
)
