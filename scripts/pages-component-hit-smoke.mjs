import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const componentUrl = `${baseUrl}#/components/new`
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []

page.on('pageerror', (error) => pageErrors.push(error.message))

function layerRow(name) {
  return page.locator('.component-layer-row', { hasText: name }).first()
}

async function setGeometry(name, x, y, width, height) {
  await layerRow(name).click()
  const inputs = page.locator('.component-layer-geometry-grid input')
  assert.equal(await inputs.count(), 7, `geometry inspector missing for ${name}`)
  await inputs.nth(0).fill(String(x))
  await inputs.nth(1).fill(String(y))
  await inputs.nth(2).fill(String(width))
  await inputs.nth(3).fill(String(height))
}

try {
  console.log(`Opening deployed Component Editor empty-overlay hit regression: ${componentUrl}`)
  await page.goto(componentUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const root = page.locator('.component-layer-root')
  const addLayer = page.getByRole('button', { name: '添加图层' })
  const kindSelect = page.locator('[aria-label="新增图层类型"]')

  // Bottom Group with a visible vector child.
  await root.click()
  await addLayer.click()
  await layerRow('Group 1').waitFor()
  await setGeometry('Group 1', 48, 48, 128, 128)

  await kindSelect.click()
  await page.getByRole('option', { name: '矢量图形', exact: true }).click()
  await addLayer.click()
  await layerRow('矢量图形 1').waitFor()
  await setGeometry('矢量图形 1', 0, 0, 128, 128)

  // Empty sibling Group placed exactly over the visible bottom Group.
  await root.click()
  await kindSelect.click()
  await page.getByRole('option', { name: 'Group', exact: true }).click()
  await addLayer.click()
  await layerRow('Group 2').waitFor()
  await setGeometry('Group 2', 48, 48, 128, 128)

  // Select the empty overlay from the Layer Tree, then click the blank area in
  // its visible selection box. The click must remain on Group 2 instead of
  // falling through to Group 1 / its vector content.
  await layerRow('Group 2').click()
  assert.equal(await layerRow('Group 2').evaluate((node) => node.classList.contains('active')), true)

  const stage = page.locator('.component-artboard .konvajs-content').first()
  const box = await stage.boundingBox()
  assert.ok(box, 'component Konva stage must be measurable')

  const scaleX = box.width / 480
  const scaleY = box.height / 360
  await page.mouse.click(
    box.x + (48 + 64) * scaleX,
    box.y + (48 + 64) * scaleY,
  )

  assert.equal(
    await layerRow('Group 2').evaluate((node) => node.classList.contains('active')),
    true,
    'clicking inside the selected empty overlay Group must keep that Group selected',
  )
  assert.equal(
    await layerRow('Group 1').evaluate((node) => node.classList.contains('active')),
    false,
    'bottom Group must not steal clicks through the selected empty overlay Group',
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages hit-test smoke passed: empty selected overlay Group blocks click-through to bottom Group.')
} finally {
  await browser.close()
}
