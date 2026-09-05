import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(
  new URL('../src/component-system/managedSvg.ts', import.meta.url),
  'utf8',
)

const convertStart = source.indexOf('const convertElement = (element: Element): ManagedSvgElement => {')
assert.notEqual(convertStart, -1, 'managed SVG parser convertElement must exist')

const documentStart = source.indexOf('const document: ManagedSvgDocument = {', convertStart)
assert.notEqual(documentStart, -1, 'managed SVG parser document construction must exist')

const convertBlock = source.slice(convertStart, documentStart)
const allocation = convertBlock.indexOf('const tagId = nextManagedTagId(tagIndex)')
const firstRecursiveChild = convertBlock.indexOf('children.push(convertElement(child as Element))')

assert.notEqual(allocation, -1, 'managed SVG parser must capture each preorder tag id immediately')
assert.notEqual(firstRecursiveChild, -1, 'managed SVG parser must recurse through child elements')
assert.ok(
  allocation < firstRecursiveChild,
  'managed SVG parser must capture the current tag id before recursing into children',
)
assert.ok(
  convertBlock.includes('\n      tagId,\n'),
  'managed SVG parser must return the captured preorder tag id',
)
assert.ok(
  !convertBlock.includes('tagId: nextManagedTagId(tagIndex)'),
  'managed SVG parser must not derive a parent tag id after child recursion',
)

console.log('Managed SVG parser authority passed: stable private tag IDs are captured in preorder before child recursion.')
