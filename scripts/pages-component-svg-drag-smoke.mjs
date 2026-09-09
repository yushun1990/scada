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

async function purpleCanvasPixels() {
  return page.evaluate(() => {
    let count = 0
    for (const canvas of document.querySelectorAll('.component-artboard canvas')) {
      const context = canvas.getContext('2d')
      if (!context || canvas.width === 0 || canvas.height === 0) continue
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let index = 0; index < pixels.length; index += 4) {
        const r = pixels[index]
        const g = pixels[index + 1]
        const b = pixels[index + 2]
        const a = pixels[index + 3]
        if (
          a > 80 &&
          Math.abs(r - 124) <= 24 &&
          Math.abs(g - 58) <= 24 &&
          Math.abs(b - 237) <= 24
        ) count += 1
      }
    }
    return count
  })
}

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'load' })
  const fileInput = page.locator('.component-palette-resource-input')
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

  // Resource uploads are authoring-library state, not one-shot file inputs.
  // Reloading before the rest of this test proves the stored resource remains reusable.
  await page.reload({ waitUntil: 'load' })
  await page.locator('.component-palette-resource-item', { hasText: 'drag-highlight' }).waitFor()
  await page.locator('.component-layer-row', { hasText: 'drag-highlight' }).click()

  const rectTreeItem = page.getByRole('treeitem').filter({ hasText: '<rect>' }).first()
  await rectTreeItem.waitFor()
  await rectTreeItem.click()
  await page.waitForTimeout(50)

  const before = await purpleCanvasPixels()
  assert.ok(before > 0, 'selected managed SVG element should have a purple canvas highlight before dragging')

  const artboard = page.locator('.component-artboard')
  const box = await artboard.boundingBox()
  assert.ok(box, 'component artboard must be measurable')

  // Imported 120x80 SVG is centered in the 480x360 design space, so the
  // artboard center is safely inside its child rect and begins a layer drag.
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 70, startY + 45, { steps: 5 })
  await page.waitForTimeout(50)

  const during = await purpleCanvasPixels()
  assert.equal(during, 0, 'managed SVG highlight must not remain behind as a purple dashed ghost while dragging')

  await page.mouse.up()
  await page.waitForTimeout(100)
  const after = await purpleCanvasPixels()
  assert.ok(after > 0, 'managed SVG highlight should return at the committed layer position after drag end')

  assert.deepEqual(errors, [])
  console.log('Component SVG drag browser smoke passed: resource upload persists, double-click places the saved SVG, and internal highlight hides during drag without a stale ghost.')
} finally {
  await browser.close()
}
