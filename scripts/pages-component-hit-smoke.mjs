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

function assertClose(actual, expected, message, tolerance = 0.001) {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${message}: expected ${expected} ± ${tolerance}, received ${actual}`,
  )
}

try {
  console.log(`Opening deployed Component Editor pointer regression in ${browserName}: ${componentUrl}`)
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

  // A separate empty Group gives the modifier-click and snap lifecycle tests a
  // non-overlapping target while still exercising empty-layer canvas hit areas.
  await root.click()
  await addLayer.click()
  await layerRow('Group 3').waitFor()
  await setGeometry('Group 3', 240, 48, 96, 96)

  const stage = page.locator('.component-artboard .konvajs-content').first()
  const box = await stage.boundingBox()
  assert.ok(box, 'component Konva stage must be measurable')

  const scaleX = box.width / 480
  const scaleY = box.height / 360
  const canvasPoint = (x, y) => ({
    x: box.x + x * scaleX,
    y: box.y + y * scaleY,
  })
  const overlayCenter = canvasPoint(48 + 64, 48 + 64)

  // This is the user-reported path: start from the component root / no internal
  // selection, then click the empty layer directly on canvas. The empty layer
  // must be discoverable by its geometry even though it draws no pixels.
  await root.click()
  assert.equal(
    await layerRow('Group 2').evaluate((node) => node.classList.contains('active')),
    false,
    'empty overlay must start unselected',
  )

  await page.mouse.click(overlayCenter.x, overlayCenter.y)

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
  await page.mouse.click(overlayCenter.x, overlayCenter.y)
  assert.equal(
    await layerRow('Group 2').evaluate((node) => node.classList.contains('active')),
    true,
    'clicking inside the selected empty overlay Group must keep that Group selected',
  )

  // Drag from the same blank area with snapping disabled. This verifies the
  // Konva hit target itself, not only React selection state: only the empty
  // overlay Group may move.
  const bottomBefore = await readGeometry('Group 1')
  const overlayBefore = await readGeometry('Group 2')
  await layerRow('Group 2').click()
  const snapButton = page.getByRole('button', { name: '吸附' })
  if ((await snapButton.getAttribute('aria-pressed')) === 'true') {
    await snapButton.click()
  }

  await page.mouse.move(overlayCenter.x, overlayCenter.y)
  await page.mouse.down()
  await page.mouse.move(overlayCenter.x + 24 * scaleX, overlayCenter.y + 16 * scaleY, { steps: 4 })
  await page.mouse.up()

  const bottomAfter = await readGeometry('Group 1')
  const overlayAfter = await readGeometry('Group 2')
  assert.equal(bottomAfter.x, bottomBefore.x, 'dragging selected empty overlay must not move bottom Group x')
  assert.equal(bottomAfter.y, bottomBefore.y, 'dragging selected empty overlay must not move bottom Group y')
  assert.ok(
    Math.abs(overlayAfter.x - overlayBefore.x) > 1 || Math.abs(overlayAfter.y - overlayBefore.y) > 1,
    'dragging selected empty overlay from blank area must move the overlay Group',
  )

  // Canvas modifier-click and Layer Tree must be two views of the same
  // selection state. Start with no internal selection, click Group 2, then
  // Ctrl-click Group 3 directly on the canvas.
  const group2Center = canvasPoint(overlayAfter.x + 64, overlayAfter.y + 64)
  const group3Before = await readGeometry('Group 3')
  const group3Center = canvasPoint(group3Before.x + 48, group3Before.y + 48)
  await root.click()
  await page.mouse.click(group2Center.x, group2Center.y)
  await page.keyboard.down('Control')
  await page.mouse.click(group3Center.x, group3Center.y)
  await page.keyboard.up('Control')

  assert.equal(
    await page.locator('.component-layer-row.active').count(),
    2,
    'canvas Ctrl-click must create a two-layer shared selection',
  )
  assert.equal(
    await layerRow('Group 2').evaluate((node) => node.classList.contains('active')),
    true,
    'canvas selection must be reflected by Group 2 in the Layer Tree',
  )
  assert.equal(
    await layerRow('Group 3').evaluate((node) => node.classList.contains('active')),
    true,
    'canvas modifier selection must be reflected by Group 3 in the Layer Tree',
  )
  await page.locator('.component-canvas-status .status-selection').getByText('2 个图层', { exact: true }).waitFor()

  // With snapping enabled, the authored geometry remains unchanged throughout
  // dragmove and is committed once on pointer release. The raw pointer target
  // puts Group 3 at (262, 190), both within the release-snap threshold of the
  // 24-unit grid, so dragend must persist on the (264, 192) grid point. Browser
  // pointer coordinates are pixel-quantized, so the persisted design-space
  // coordinate may differ from that grid point by a small fraction of a unit.
  await layerRow('Group 3').click()
  if ((await snapButton.getAttribute('aria-pressed')) !== 'true') {
    await snapButton.click()
  }
  const gridInput = page.getByRole('spinbutton', { name: '网格间距' })
  await gridInput.fill('24')

  const geometryInputs = page.locator('.component-layer-geometry-grid input')
  const dragStart = canvasPoint(group3Before.x + 48, group3Before.y + 48)
  const dragEnd = canvasPoint(262 + 48, 190 + 48)
  await page.mouse.move(dragStart.x, dragStart.y)
  await page.mouse.down()
  await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 6 })

  assertClose(
    Number(await geometryInputs.nth(0).inputValue()),
    group3Before.x,
    'dragmove must not persist x before pointer release',
  )
  assertClose(
    Number(await geometryInputs.nth(1).inputValue()),
    group3Before.y,
    'dragmove must not persist y before pointer release',
  )

  await page.mouse.up()
  assertClose(Number(await geometryInputs.nth(0).inputValue()), 264, 'dragend snaps Group 3 x once', 0.25)
  assertClose(Number(await geometryInputs.nth(1).inputValue()), 192, 'dragend snaps Group 3 y once', 0.25)

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(`Pages pointer smoke passed in ${browserName}: empty-layer hit, canvas modifier selection and release-only snap are stable.`)
} finally {
  await browser.close()
}
