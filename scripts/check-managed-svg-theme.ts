import assert from 'node:assert/strict'
import type { ManagedSvgDocument } from '../src/component-system/managedSvg'
import {
  applyThemeToManagedSvgDocument,
  hasManagedSvgThemeClasses,
  hslToHex,
  parseCssColorToRgb,
  rgbToHsl,
} from '../src/component-system/managedSvgTheme'

console.log('--- Testing Managed SVG Theme & Color Parsing ---')

// 1. parseCssColorToRgb: Hex
assert.deepEqual(parseCssColorToRgb('#fff'), { r: 255, g: 255, b: 255 })
assert.deepEqual(parseCssColorToRgb('#000'), { r: 0, g: 0, b: 0 })
assert.deepEqual(parseCssColorToRgb('#ff0000'), { r: 255, g: 0, b: 0 })
assert.deepEqual(parseCssColorToRgb('#00ff00'), { r: 0, g: 255, b: 0 })
assert.deepEqual(parseCssColorToRgb('#0000ff'), { r: 0, g: 0, b: 255 })
assert.deepEqual(parseCssColorToRgb('#123456'), { r: 18, g: 52, b: 86 })
// Hex with alpha (3+1 and 6+2)
assert.deepEqual(parseCssColorToRgb('#ff000080'), { r: 255, g: 0, b: 0 })
assert.deepEqual(parseCssColorToRgb('#f00a'), { r: 255, g: 0, b: 0 })

console.log('✔ Hex color parsing passed')

// 2. parseCssColorToRgb: rgb() / rgba()
// Comma-separated integers
assert.deepEqual(parseCssColorToRgb('rgb(255, 128, 0)'), { r: 255, g: 128, b: 0 })
assert.deepEqual(parseCssColorToRgb('rgba(255, 128, 0, 0.5)'), { r: 255, g: 128, b: 0 })
// Decimals
assert.deepEqual(parseCssColorToRgb('rgb(100.4, 200.6, 50.1)'), { r: 100, g: 201, b: 50 })
// Percentages
assert.deepEqual(parseCssColorToRgb('rgb(100%, 50%, 0%)'), { r: 255, g: 128, b: 0 })
assert.deepEqual(parseCssColorToRgb('rgba(100%, 0%, 0%, 80%)'), { r: 255, g: 0, b: 0 })
// Modern CSS Color 4 space & slash syntax
assert.deepEqual(parseCssColorToRgb('rgb(255 128 0)'), { r: 255, g: 128, b: 0 })
assert.deepEqual(parseCssColorToRgb('rgb(255 128 0 / 0.5)'), { r: 255, g: 128, b: 0 })
assert.deepEqual(parseCssColorToRgb('rgba(100% 50% 0% / 50%)'), { r: 255, g: 128, b: 0 })

console.log('✔ RGB/RGBA color parsing passed')

// 3. parseCssColorToRgb: hsl() / hsla()
// Comma-separated
assert.deepEqual(parseCssColorToRgb('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0 })
assert.deepEqual(parseCssColorToRgb('hsl(120, 100%, 50%)'), { r: 0, g: 255, b: 0 })
assert.deepEqual(parseCssColorToRgb('hsl(240, 100%, 50%)'), { r: 0, g: 0, b: 255 })
assert.deepEqual(parseCssColorToRgb('hsla(120, 100%, 50%, 0.8)'), { r: 0, g: 255, b: 0 })
// Angle units: deg, turn, rad, grad
assert.deepEqual(parseCssColorToRgb('hsl(120deg, 100%, 50%)'), { r: 0, g: 255, b: 0 })
assert.deepEqual(parseCssColorToRgb('hsl(0.5turn, 100%, 50%)'), { r: 0, g: 255, b: 255 }) // 180 deg = cyan
assert.deepEqual(parseCssColorToRgb('hsl(200grad, 100%, 50%)'), { r: 0, g: 255, b: 255 }) // 200 grad = 180 deg = cyan
// Modern space & slash syntax
assert.deepEqual(parseCssColorToRgb('hsl(120deg 100% 50%)'), { r: 0, g: 255, b: 0 })
assert.deepEqual(parseCssColorToRgb('hsl(120 100% 50% / 0.5)'), { r: 0, g: 255, b: 0 })

console.log('✔ HSL/HSLA color parsing passed')

// 4. parseCssColorToRgb: CSS Named Colors
assert.deepEqual(parseCssColorToRgb('red'), { r: 255, g: 0, b: 0 })
assert.deepEqual(parseCssColorToRgb('green'), { r: 0, g: 128, b: 0 })
assert.deepEqual(parseCssColorToRgb('blue'), { r: 0, g: 0, b: 255 })
assert.deepEqual(parseCssColorToRgb('black'), { r: 0, g: 0, b: 0 })
assert.deepEqual(parseCssColorToRgb('white'), { r: 255, g: 255, b: 255 })
assert.deepEqual(parseCssColorToRgb('rebeccapurple'), { r: 102, g: 51, b: 153 })
assert.deepEqual(parseCssColorToRgb('crimson'), { r: 220, g: 20, b: 60 })
assert.deepEqual(parseCssColorToRgb('dodgerblue'), { r: 30, g: 144, b: 255 })
assert.deepEqual(parseCssColorToRgb('chartreuse'), { r: 127, g: 255, b: 0 })
assert.deepEqual(parseCssColorToRgb('transparent'), { r: 0, g: 0, b: 0 })

// Invalid inputs
assert.equal(parseCssColorToRgb(''), null)
assert.equal(parseCssColorToRgb('not-a-color'), null)
assert.equal(parseCssColorToRgb('url(#grad1)'), null)
assert.equal(parseCssColorToRgb('#12'), null)
assert.equal(parseCssColorToRgb('#12345'), null)

console.log('✔ CSS Named Colors & invalid input checks passed')

// 5. rgbToHsl and hslToHex round-trips
const redHsl = rgbToHsl(255, 0, 0)
assert.equal(redHsl.h, 0)
assert.equal(redHsl.s, 1)
assert.equal(redHsl.l, 0.5)
assert.equal(hslToHex(redHsl.h, redHsl.s, redHsl.l), '#ff0000')

const greenHsl = rgbToHsl(0, 255, 0)
assert.equal(greenHsl.h, 120)
assert.equal(greenHsl.s, 1)
assert.equal(greenHsl.l, 0.5)
assert.equal(hslToHex(greenHsl.h, greenHsl.s, greenHsl.l), '#00ff00')

console.log('✔ rgbToHsl and hslToHex round-trips passed')

// 6. hasManagedSvgThemeClasses & applyThemeToManagedSvgDocument
const docWithoutThemes: ManagedSvgDocument = {
  version: 1,
  root: {
    kind: 'element',
    tagName: 'svg',
    tagId: 'svg-tag-000001',
    attributes: [{ name: 'viewBox', value: '0 0 100 100' }],
    children: [
      {
        kind: 'element',
        tagName: 'rect',
        tagId: 'svg-tag-000002',
        attributes: [
          { name: 'fill', value: '#ff0000' },
          { name: 'width', value: '100' },
          { name: 'height', value: '100' },
        ],
        children: [],
      },
    ],
  },
}
assert.equal(hasManagedSvgThemeClasses(docWithoutThemes), false)

const docWithThemes: ManagedSvgDocument = {
  version: 1,
  root: {
    kind: 'element',
    tagName: 'svg',
    tagId: 'svg-tag-000001',
    attributes: [{ name: 'viewBox', value: '0 0 100 100' }],
    children: [
      {
        kind: 'element',
        tagName: 'path',
        tagId: 'svg-tag-000002',
        attributes: [
          { name: 'class', value: 'scada-theme-pipe' },
          { name: 'fill', value: '#3b82f6' },
        ],
        children: [],
      },
    ],
  },
}
assert.equal(hasManagedSvgThemeClasses(docWithThemes), true)

// Apply running preset
const runningDoc = applyThemeToManagedSvgDocument(docWithThemes, 'running')
const runningPath = runningDoc.root.children[0]
assert.ok(runningPath && runningPath.kind === 'element')
const runningFill = runningPath.attributes.find((a) => a.name === 'fill')?.value
assert.ok(runningFill, 'Fill should be updated')
assert.notEqual(runningFill, '#3b82f6', 'Fill should change from original blue to running green theme')

// Apply custom CSS named color theme
const crimsonDoc = applyThemeToManagedSvgDocument(docWithThemes, 'crimson')
const crimsonPath = crimsonDoc.root.children[0]
assert.ok(crimsonPath && crimsonPath.kind === 'element')
const crimsonFill = crimsonPath.attributes.find((a) => a.name === 'fill')?.value
assert.ok(crimsonFill, 'Custom named color theme should apply')

// Apply reset / default restores original fill
const resetDoc = applyThemeToManagedSvgDocument(runningDoc, 'default')
const resetPath = resetDoc.root.children[0]
assert.ok(resetPath && resetPath.kind === 'element')
const resetFill = resetPath.attributes.find((a) => a.name === 'fill')?.value
assert.equal(resetFill, '#3b82f6', 'Default/reset should restore original fill')

console.log('✔ applyThemeToManagedSvgDocument tests passed')
console.log('All Managed SVG Theme & Color unit tests PASSED successfully!')
