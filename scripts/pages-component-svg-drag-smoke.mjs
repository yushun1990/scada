import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

const svgSource = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <rect id="body" x="10" y="10" width="100" height="60" fill="#94a3b8" />
</svg>`

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'load' })
  const fileInput = page.locator('.component-palette-resource-library .component-palette-resource-input')
  await fileInput.setInputFiles({
    name: 'drag-highlight.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgSource),
  })
  await page.getByText('已保存 1 个资源 · 共 1 个', { exact: true }).waitFor()

  const savedResource = page.locator('.component-palette-resource-item', { hasText: 'drag-highlight' })
  await savedResource.waitFor()
  await savedResource.dblclick()
  await page.locator('.component-layer-row', { hasText: 'drag-highlight' }).waitFor()

  // Resource uploads are authoring-library state, while an unsaved component
  // visual is intentionally transient. Reload proves the resource persists,
  // then places that persisted resource again through the normal authoring flow.
  await page.reload({ waitUntil: 'load' })
  const reloadedResource = page.locator('.component-palette-resource-item', { hasText: 'drag-highlight' })
  await reloadedResource.waitFor()
  await reloadedResource.dblclick()

  // The internal-element tree that used to arm the canvas highlight moved into
  // the SVG source editor; layer-level drag commitment is the surviving drag
  // contract, verified through the geometry inspector trailing the selection.
  const svgRow = page.locator('.component-layer-row', { hasText: 'drag-highlight' })
  await svgRow.click()
  await page.locator('.component-layer-row.active').filter({ hasText: 'drag-highlight' }).first().waitFor()
  const geometryInputs = page.locator('.component-layer-geometry-grid input')
  const beforeX = Number(await geometryInputs.nth(0).inputValue())
  const beforeY = Number(await geometryInputs.nth(1).inputValue())

  const artboard = page.locator('.component-artboard')
  const box = await artboard.boundingBox()
  assert.ok(box, 'component artboard must be measurable')

  // Imported 120x80 SVG is centered in the 480x360 design space, so the
  // artboard center is safely inside it and begins a layer drag.
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 70, startY + 45, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(150)

  const afterX = Number(await geometryInputs.nth(0).inputValue())
  const afterY = Number(await geometryInputs.nth(1).inputValue())
  const scale = box.width / 480
  assert.ok(
    Math.abs(afterX - beforeX - 70 / scale) < 2,
    `drag must commit the horizontal layer move (${beforeX} → ${afterX})`,
  )
  assert.ok(
    Math.abs(afterY - beforeY - 45 / scale) < 2,
    `drag must commit the vertical layer move (${beforeY} → ${afterY})`,
  )

  assert.deepEqual(errors, [])
  console.log('Component SVG drag browser smoke passed: resource upload persists, double-click places the saved SVG, and the layer drag commits its position exactly once.')
} finally {
  await browser.close()
}
