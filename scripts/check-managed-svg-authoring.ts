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
  updateManagedSvgElementPresentation,
} from '../src/component-system/managedSvgAuthoring'

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

console.log(
  'Managed SVG authoring checks passed: two nested targets accept independent controlled presentation edits, retained tag ids stay stable, previous snapshots remain immutable, save/reload preserves values and identities, canonical assetRef follows the authored document, empty values restore inheritance, and invalid/unsafe edits fail closed.',
)
