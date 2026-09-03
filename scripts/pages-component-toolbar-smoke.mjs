import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const componentUrl = `${baseUrl}#/components/new`
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 900, height: 1000 } })
const page = await context.newPage()
const pageErrors = []

page.on('pageerror', (error) => pageErrors.push(error.message))

function contains(outer, inner, tolerance = 1) {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  )
}

try {
  console.log(`Opening deployed Component Editor toolbar visibility regression: ${componentUrl}`)
  await page.goto(componentUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const toolbar = page.getByRole('toolbar', { name: '组件画布工具栏' })
  const geometryGroup = toolbar.locator('.component-geometry-tool-group')
  const gridControl = toolbar.locator('.grid-control')

  await toolbar.waitFor()
  await geometryGroup.waitFor()
  await gridControl.waitFor()
  await page.getByRole('button', { name: '左对齐' }).waitFor()
  await page.getByRole('button', { name: '显示格线' }).waitFor()

  const toolbarBox = await toolbar.boundingBox()
  const geometryBox = await geometryGroup.boundingBox()
  const gridBox = await gridControl.boundingBox()

  assert.ok(toolbarBox, 'component canvas toolbar must be measurable')
  assert.ok(geometryBox, 'component geometry toolbar group must be measurable')
  assert.ok(gridBox, 'component grid control must be measurable')
  assert.ok(
    contains(toolbarBox, geometryBox),
    `geometry toolbar group must stay inside the visible toolbar area: toolbar=${JSON.stringify(toolbarBox)} geometry=${JSON.stringify(geometryBox)}`,
  )
  assert.ok(
    contains(toolbarBox, gridBox),
    `grid control must stay inside the visible toolbar area: toolbar=${JSON.stringify(toolbarBox)} grid=${JSON.stringify(gridBox)}`,
  )
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
    'component toolbar wrapping must not create page-level horizontal overflow',
  )
  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)

  console.log('Pages component toolbar smoke passed: alignment and grid controls remain visibly reachable in a constrained Component Workbench.')
} finally {
  await browser.close()
}
