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

try {
  console.log(`Opening deployed Component Editor hit-test regression: ${componentUrl}`)
  await page.goto(componentUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const root = page.locator('.component-layer-root')
  const addLayer = page.getByRole('button', { name: '添加图层' })

  await root.click()
  await addLayer.click()
  await layerRow('Group 1').waitFor()

  const kindSelect = page.locator('[aria-label="新增图层类型"]')
  await kindSelect.click()
  await page.getByRole('option', { name: '矢量图形', exact: true }).click()
  await addLayer.click()
  await layerRow('矢量图形 1').waitFor()

  // Selecting the empty Group from the Layer Tree must make its full geometry
  // box the editor hit owner. Its visible child must not immediately steal the
  // selection when the user clicks back inside that selected Group box.
  await layerRow('Group 1').click()
  assert.equal(await layerRow('Group 1').evaluate((node) => node.classList.contains('active')), true)

  const stage = page.locator('.component-artboard .konvajs-content').first()
  const box = await stage.boundingBox()
  assert.ok(box, 'component Konva stage must be measurable')

  const designWidth = 480
  const designHeight = 360
  const scaleX = box.width / designWidth
  const scaleY = box.height / designHeight

  await page.mouse.click(
    box.x + 32 * scaleX,
    box.y + 32 * scaleY,
  )

  assert.equal(
    await layerRow('Group 1').evaluate((node) => node.classList.contains('active')),
    true,
    'clicking inside the selected empty Group bounds must keep the Group selected',
  )
  assert.equal(
    await layerRow('矢量图形 1').evaluate((node) => node.classList.contains('active')),
    false,
    'child visual must not steal the selected Group full-bounds hit area',
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages hit-test smoke passed: selected Group owns its full editor bounds over child content.')
} finally {
  await browser.close()
}
