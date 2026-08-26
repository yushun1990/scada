import assert from 'node:assert/strict'
import { chromium, firefox } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const componentUrl = `${baseUrl}#/components/new`
const browserName = process.env.SCADA_BROWSER ?? 'chromium'
const browserType = browserName === 'firefox' ? firefox : chromium
const browser = await browserType.launch({ headless: true })
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

async function readGeometry(name) {
  await layerRow(name).click()
  const inputs = page.locator('.component-layer-geometry-grid input')
  return {
    x: Number(await inputs.nth(0).inputValue()),
    y: Number(await inputs.nth(1).inputValue()),
  }
}

try {
  console.log(`Opening deployed Component Editor empty-layer hit regression in ${browserName}: ${componentUrl}`)
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

  const stage = page.locator('.component-artboard .konvajs-content').first()
  const box = await stage.boundingBox()
  assert.ok(box, 'component Konva stage must be measurable')

  const scaleX = box.width / 480
  const scaleY = box.height / 360
  const centerX = box.x + (48 + 64) * scaleX
  const centerY = box.y + (48 + 64) * scaleY

  // This is the user-reported path: start from the component root / no internal
  // selection, then click the empty layer directly on canvas. The empty layer
  // must be discoverable by its geometry even though it draws no pixels.
  await root.click()
  assert.equal(
    await layerRow('Group 2').evaluate((node) => node.classList.contains('active')),
    false,
    'empty overlay must start unselected',
  )

  await page.mouse.click(centerX, centerY)

  assert.equal(
    await layerRow('Group 2').evaluate((node) => node.classList.contains('active')),
    true,
    'clicking an unselected empty overlay Group on canvas must select that Group',
  )
  assert.equal(
    await layerRow('Group 1').evaluate((node) => node.classList.contains('active')),
    false,
    'bottom Group must not steal the first canvas click through the empty overlay Group',
  )
  assert.equal(
    await page.locator('.component-canvas-status .status-selection').getByText('组件根', { exact: true }).count(),
    0,
    'first canvas click on the empty Group must not fall back to component root',
  )

  // A second click while selected must still stay on the empty Group.
  await page.mouse.click(centerX, centerY)
  assert.equal(
    await layerRow('Group 2').evaluate((node) => node.classList.contains('active')),
    true,
    'clicking inside the selected empty overlay Group must keep that Group selected',
  )

  // Drag from the same blank area. This verifies the Konva hit target itself,
  // not only React selection state: only the empty overlay Group may move.
  const bottomBefore = await readGeometry('Group 1')
  const overlayBefore = await readGeometry('Group 2')
  await layerRow('Group 2').click()
  const snapButton = page.getByRole('button', { name: '吸附' })
  if ((await snapButton.getAttribute('aria-pressed')) === 'true') {
    await snapButton.click()
  }

  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.move(centerX + 24 * scaleX, centerY + 16 * scaleY, { steps: 4 })
  await page.mouse.up()

  const bottomAfter = await readGeometry('Group 1')
  const overlayAfter = await readGeometry('Group 2')
  assert.equal(bottomAfter.x, bottomBefore.x, 'dragging selected empty overlay must not move bottom Group x')
  assert.equal(bottomAfter.y, bottomBefore.y, 'dragging selected empty overlay must not move bottom Group y')
  assert.ok(
    Math.abs(overlayAfter.x - overlayBefore.x) > 1 || Math.abs(overlayAfter.y - overlayBefore.y) > 1,
    'dragging selected empty overlay from blank area must move the overlay Group',
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(`Pages hit-test smoke passed in ${browserName}: unselected empty Group is canvas-selectable and owns subsequent drag.`)
} finally {
  await browser.close()
}
