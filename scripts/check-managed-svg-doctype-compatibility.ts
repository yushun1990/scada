import assert from 'node:assert/strict'
import { stripBenignSvgDoctype } from '../src/component-system/managedSvgImportCompatibility'

const userProvidedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="400px" height="400px" style="shape-rendering:geometricPrecision; text-rendering:geometricPrecision; image-rendering:optimizeQuality; fill-rule:evenodd; clip-rule:evenodd" xmlns:xlink="http://www.w3.org/1999/xlink" tag="整体">
<g><path style="opacity:0.993" fill="#FF0000" d="M 179.5,-0.5 C 192.833,-0.5 206.167,-0.5 219.5,-0.5C 304.538,11.9461 361.705,58.6127 391,139.5C 394.818,152.765 397.651,166.099 399.5,179.5C 399.5,192.833 399.5,206.167 399.5,219.5C 387.054,304.538 340.387,361.705 259.5,391C 246.235,394.818 232.901,397.651 219.5,399.5C 206.167,399.5 192.833,399.5 179.5,399.5C 94.4616,387.054 37.295,340.387 8,259.5C 4.18196,246.235 1.34862,232.901 -0.5,219.5C -0.5,206.167 -0.5,192.833 -0.5,179.5C 11.9461,94.4616 58.6127,37.295 139.5,8C 152.765,4.18196 166.099,1.34862 179.5,-0.5 Z M 190.5,62.5 C 253.533,62.0913 298.7,90.0913 326,146.5C 347.388,206.636 335.221,258.803 289.5,303C 246.281,337.462 198.614,345.129 146.5,326C 93.1568,300.85 65.1568,258.683 62.5,199.5C 65.1568,140.317 93.1568,98.1501 146.5,73C 160.787,67.2797 175.454,63.7797 190.5,62.5 Z"/></g>
<g><path style="opacity:0.996" fill="#FF0000" d="M 188.5,86.5 C 237.267,84.2944 274.101,103.961 299,145.5C 320.534,190.592 316.201,232.925 286,272.5C 253.64,307.728 214.14,319.561 167.5,308C 120.972,291.785 94.1387,259.285 87,210.5C 84.3081,161.709 103.808,124.875 145.5,100C 159.158,92.945 173.491,88.445 188.5,86.5 Z"/></g>
</svg>`

// 1. User SVG strips DOCTYPE cleanly and preserves XML root
const withoutXml = userProvidedSvg.replace(/^<\?xml\s[^?]*\?>\s*/i, '')
const strippedUserSvg = stripBenignSvgDoctype(withoutXml)
assert.doesNotMatch(strippedUserSvg, /<!DOCTYPE/i, 'DOCTYPE is stripped')
assert.doesNotMatch(strippedUserSvg, /<!ENTITY/i, 'No entities')
assert.ok(strippedUserSvg.trimStart().startsWith('<svg'), 'Root element starts directly with <svg')
assert.ok(strippedUserSvg.includes('tag="整体"'), 'Attributes are preserved')
assert.ok(strippedUserSvg.includes('M 179.5,-0.5'), 'Path geometry is preserved')

// 2. Multiline DOCTYPE
const multiline = `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"\n  "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg></svg>`
assert.ok(stripBenignSvgDoctype(multiline).includes('<svg></svg>'))

// 3. Simple <!DOCTYPE svg>
assert.ok(stripBenignSvgDoctype(`<!DOCTYPE svg><svg></svg>`).includes('<svg></svg>'))

// 4. SYSTEM DTD
assert.ok(
  stripBenignSvgDoctype(
    `<!DOCTYPE svg SYSTEM "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg></svg>`,
  ).includes('<svg></svg>'),
)

// 5. DOCTYPE with preceding XML comment
const withComment = `<!-- generator: CorelDRAW -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg></svg>`
const commentResult = stripBenignSvgDoctype(withComment)
assert.ok(commentResult.includes('<!-- generator: CorelDRAW -->'))
assert.ok(commentResult.includes('<svg></svg>'))
assert.doesNotMatch(commentResult, /<!DOCTYPE/i)

// 6. Entity attack fails closed
assert.throws(
  () =>
    stripBenignSvgDoctype(
      `<!DOCTYPE svg [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><svg></svg>`,
    ),
  /SVG 不允许 DTD \/ ENTITY/,
)

// 7. Entity declaration without DOCTYPE fails closed
assert.throws(
  () => stripBenignSvgDoctype(`<!ENTITY xxe SYSTEM "file:///etc/passwd"><svg></svg>`),
  /SVG 不允许 DTD \/ ENTITY/,
)

// 8. Non-SVG DOCTYPE fails closed
assert.throws(
  () => stripBenignSvgDoctype(`<!DOCTYPE html><svg></svg>`),
  /SVG 包含不受支持的 DTD 声明/,
)

// 9. Repeated DOCTYPE fails closed
assert.throws(
  () => stripBenignSvgDoctype(`<!DOCTYPE svg><!DOCTYPE svg><svg></svg>`),
  /SVG 不允许重复的 DTD 声明/,
)

// 10. DOCTYPE inside root element fails closed
assert.throws(
  () => stripBenignSvgDoctype(`<svg><!DOCTYPE svg></svg>`),
  /SVG DTD 声明位置无效/,
)

// 11. Foreign markup before DOCTYPE fails closed
assert.throws(
  () => stripBenignSvgDoctype(`<div><!DOCTYPE svg><svg></svg>`),
  /SVG DTD 声明位置无效/,
)

console.log(
  'Managed SVG DOCTYPE compatibility checks passed: standard benign SVG DOCTYPE is stripped automatically during compatibility ingest while custom entities, internal subsets, non-SVG DTDs, and out-of-order declarations remain strictly blocked.',
)
