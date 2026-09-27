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

// The right-panel geometry inspector trails the Navigator selection by one
// React render; wait until the clicked row is active and the input values
// settle before touching them, otherwise fills and readbacks can land on the
// previously selected layer.
async function waitForInspectorSelection(name) {
  await page.locator('.component-layer-row.active').filter({ hasText: name }).first().waitFor()
  const inputs = page.locator('.component-layer-geometry-grid input')
  let previous = await inputs.nth(0).inputValue()
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.waitForTimeout(60)
    const current = await inputs.nth(0).inputValue()
    if (current === previous) return
    previous = current
  }
}

async function setGeometry(name, x, y, width, height) {
  await layerRow(name).click()
  await waitForInspectorSelection(name)
  const inputs = page.locator('.component-layer-geometry-grid input')
  assert.equal(await inputs.count(), 7, `geometry inspector missing for ${name}`)
  await inputs.nth(0).fill(String(x))
  await inputs.nth(1).fill(String(y))
  await inputs.nth(2).fill(String(width))
  await inputs.nth(3).fill(String(height))
}

async function readGeometry(name) {
  await layerRow(name).click()
  await waitForInspectorSelection(name)
  const inputs = page.locator('.component-layer-geometry-grid input')
  return {
    x: Number(await inputs.nth(0).inputValue()),
    y: Number(await inputs.nth(1).inputValue()),
  }
}

async function selectTogether(names) {
  assert.ok(names.length >= 2, 'group fixture needs at least two layers')
  await layerRow(names[0]).click()
  await page.keyboard.down('Control')
  for (const name of names.slice(1)) {
    await layerRow(name).click()
  }
  await page.keyboard.up('Control')
}

async function groupLayers(names, groupName) {
  await selectTogether(names)
  const groupButton = page.getByRole('button', { name: '组合选中图层', exact: true })
  assert.equal(await groupButton.isEnabled(), true, `group command must enable for ${names.join(', ')}`)
  await groupButton.click()
  await layerRow(groupName).waitFor()
}

async function deleteLayer(name) {
  await layerRow(name).click()
  await page.getByRole('toolbar', { name: 'Studio 主工具栏' })
    .getByRole('button', { name: '删除选中图层', exact: true }).click()
  await layerRow(name).waitFor({ state: 'detached' })
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
  await page.locator('.studio-shell.component-studio-shell').waitFor()

  const addText = page.locator('.component-palette-item[aria-label="文本"]')

  async function addTextFixtureLayer() {
    const beforeNames = new Set(
      (await page.locator('.component-layer-name').allTextContents())
        .map((name) => name.trim()),
    )

    await addText.dblclick()
    await page.waitForFunction((existingNames) => {
      const before = new Set(existingNames)
      return [...document.querySelectorAll('.component-layer-name')].some((node) => {
        const name = node.textContent?.trim() ?? ''
        return name.startsWith('txt_') && !before.has(name)
      })
    }, [...beforeNames])

    const createdName = (await page.locator('.component-layer-name').allTextContents())
      .map((name) => name.trim())
      .find((name) => name.startsWith('txt_') && !beforeNames.has(name))

    assert.ok(createdName, 'text creation must expose a new Navigator layer name')
    return createdName
  }

  assert.equal(
    await page.locator('.component-layer-root').count(),
    0,
    'Navigator must not render a synthetic component-root row',
  )
  assert.equal(
    await page.getByRole('button', { name: '组', exact: true }).count(),
    0,
    'Palette must not expose standalone empty Group creation',
  )

  // Groups are now explicit hierarchy results rather than Palette primitives.
  // Build the visible bottom Group from two top-level Text layers through the
  // real Canvas group command. Layer names are captured from the Navigator
  // because deleted primitive ids may be reused by later fixture creation.
  const bottomFixtureA = await addTextFixtureLayer()
  await setGeometry(bottomFixtureA, 48, 48, 128, 128)
  const bottomFixtureB = await addTextFixtureLayer()
  await setGeometry(bottomFixtureB, 48, 48, 128, 128)
  await groupLayers([bottomFixtureA, bottomFixtureB], 'grp_1')
  await setGeometry('grp_1', 48, 48, 128, 128)

  // Empty sibling Group placed exactly over the visible bottom Group. Empty
  // Groups remain a valid persisted/legacy structure, but the fixture reaches
  // that state by explicitly grouping and then deleting the children.
  const overlayFixtureA = await addTextFixtureLayer()
  await setGeometry(overlayFixtureA, 48, 48, 128, 128)
  const overlayFixtureB = await addTextFixtureLayer()
  await setGeometry(overlayFixtureB, 48, 48, 128, 128)
  await groupLayers([overlayFixtureA, overlayFixtureB], 'grp_2')
  await setGeometry('grp_2', 48, 48, 128, 128)
  await deleteLayer(overlayFixtureA)
  await deleteLayer(overlayFixtureB)

  // A separate empty Group gives the modifier-click and snap lifecycle tests a
  // non-overlapping target while still exercising empty-layer canvas hit areas.
  // Deleted primitive ids may be allocated again, so always capture live names.
  const modifierFixtureA = await addTextFixtureLayer()
  await setGeometry(modifierFixtureA, 240, 48, 96, 96)
  const modifierFixtureB = await addTextFixtureLayer()
  await setGeometry(modifierFixtureB, 240, 48, 96, 96)
  await groupLayers([modifierFixtureA, modifierFixtureB], 'grp_3')
  await setGeometry('grp_3', 240, 48, 96, 96)
  await deleteLayer(modifierFixtureA)
  await deleteLayer(modifierFixtureB)

  const stage = page.locator('.component-artboard .konvajs-content').first()
  const box = await stage.boundingBox()
  assert.ok(box, 'component Konva stage must be measurable')

  const scaleX = box.width / 480
  const scaleY = box.height / 360
  const canvasPoint = (x, y) => ({
    x: box.x + x * scaleX,
    y: box.y + y * scaleY,
  })
  const clearLayerSelection = async () => {
    const blankPoint = canvasPoint(440, 320)
    await page.mouse.click(blankPoint.x, blankPoint.y)
    assert.equal(
      await page.locator('.component-layer-row.active').count(),
      0,
      'blank canvas click must clear Navigator layer selection',
    )
    await page.locator('.component-canvas-status .status-selection')
      .getByText('未选择图层', { exact: true })
      .waitFor()
  }
  const overlayCenter = canvasPoint(48 + 64, 48 + 64)

  // This is the user-reported path: start with no internal layer selection,
  // then click the empty layer directly on canvas. The empty layer must be
  // discoverable by its geometry even though it draws no pixels.
  await clearLayerSelection()
  assert.equal(
    await layerRow('grp_2').evaluate((node) => node.classList.contains('active')),
    false,
    'empty overlay must start unselected',
  )

  await page.mouse.click(overlayCenter.x, overlayCenter.y)

  assert.equal(
    await layerRow('grp_2').evaluate((node) => node.classList.contains('active')),
    true,
    'clicking an unselected empty overlay Group on canvas must select that Group',
  )
  assert.equal(
    await layerRow('grp_1').evaluate((node) => node.classList.contains('active')),
    false,
    'bottom Group must not steal the first canvas click through the empty overlay Group',
  )
  assert.equal(
    await page.locator('.component-canvas-status .status-selection').getByText('未选择图层', { exact: true }).count(),
    0,
    'first canvas click on the empty Group must leave the no-layer selection state',
  )

  // A second click while selected must still stay on the empty Group.
  await page.mouse.click(overlayCenter.x, overlayCenter.y)
  assert.equal(
    await layerRow('grp_2').evaluate((node) => node.classList.contains('active')),
    true,
    'clicking inside the selected empty overlay Group must keep that Group selected',
  )

  // Drag from the same blank area with snapping disabled. This verifies the
  // Konva hit target itself, not only React selection state: only the empty
  // overlay Group may move.
  const bottomBefore = await readGeometry('grp_1')
  const overlayBefore = await readGeometry('grp_2')
  await layerRow('grp_2').click()
  const snapButton = page.getByRole('button', { name: '吸附' })
  if ((await snapButton.getAttribute('aria-pressed')) === 'true') {
    await snapButton.click()
  }

  await page.mouse.move(overlayCenter.x, overlayCenter.y)
  await page.mouse.down()
  await page.mouse.move(overlayCenter.x + 24 * scaleX, overlayCenter.y + 16 * scaleY, { steps: 4 })
  await page.mouse.up()

  const bottomAfter = await readGeometry('grp_1')
  const overlayAfter = await readGeometry('grp_2')
  assert.equal(bottomAfter.x, bottomBefore.x, 'dragging selected empty overlay must not move bottom Group x')
  assert.equal(bottomAfter.y, bottomBefore.y, 'dragging selected empty overlay must not move bottom Group y')
  assert.ok(
    Math.abs(overlayAfter.x - overlayBefore.x) > 1 || Math.abs(overlayAfter.y - overlayBefore.y) > 1,
    'dragging selected empty overlay from blank area must move the overlay Group',
  )

  // Canvas modifier-click and Navigator must be two views of the same
  // selection state. Start with no internal selection, click Group 2, then
  // Ctrl-click Group 3 directly on the canvas.
  const group2Center = canvasPoint(overlayAfter.x + 64, overlayAfter.y + 64)
  const group3Before = await readGeometry('grp_3')
  const group3Center = canvasPoint(group3Before.x + 48, group3Before.y + 48)
  await clearLayerSelection()
  await page.mouse.click(group2Center.x, group2Center.y)
  await page.locator('.component-layer-row.active').filter({ hasText: 'grp_2' }).first().waitFor()
  await page.keyboard.down('Control')
  await page.mouse.click(group3Center.x, group3Center.y)
  await page.keyboard.up('Control')

  // Selection state settles asynchronously after the canvas click; wait for
  // both rows before counting instead of asserting an immediate snapshot.
  await page.locator('.component-layer-row.active').filter({ hasText: 'grp_3' }).first().waitFor()
  assert.equal(
    await page.locator('.component-layer-row.active').count(),
    2,
    'canvas Ctrl-click must create a two-layer shared selection',
  )
  assert.equal(
    await layerRow('grp_2').evaluate((node) => node.classList.contains('active')),
    true,
    'canvas selection must be reflected by Group 2 in the Navigator',
  )
  assert.equal(
    await layerRow('grp_3').evaluate((node) => node.classList.contains('active')),
    true,
    'canvas modifier selection must be reflected by Group 3 in the Navigator',
  )
  await page.locator('.component-canvas-status .status-selection').getByText('2 个图层', { exact: true }).waitFor()

  // With snapping enabled, the authored geometry remains unchanged throughout
  // dragmove and is committed once on pointer release. The raw pointer target
  // puts Group 3 at (286, 214), both within the release-snap threshold of the
  // 24-unit grid. This destination is away from sibling edges, so object snap
  // cannot legitimately win over the grid after a fractional-scale free drag.
  // Release must persist on the (288, 216) grid point.
  await layerRow('grp_3').click()
  if ((await snapButton.getAttribute('aria-pressed')) !== 'true') {
    await snapButton.click()
  }
  const gridInput = page.getByRole('spinbutton', { name: '网格间距' })
  await gridInput.fill('24')

  const geometryInputs = page.locator('.component-layer-geometry-grid input')
  const dragStart = canvasPoint(group3Before.x + 48, group3Before.y + 48)
  const dragEnd = canvasPoint(286 + 48, 214 + 48)
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
  // The snap commit lands asynchronously after pointer release; wait for the
  // geometry input to leave the pre-drag value before asserting the snap.
  await page.waitForFunction((previousX) => {
    const input = document.querySelectorAll('.component-layer-geometry-grid input')[0]
    return input instanceof HTMLInputElement && Number(input.value) !== previousX
  }, group3Before.x)
  assertClose(Number(await geometryInputs.nth(0).inputValue()), 288, 'dragend snaps Group 3 x once')
  assertClose(Number(await geometryInputs.nth(1).inputValue()), 216, 'dragend snaps Group 3 y once')

  // Loose-bounds selected layers must not steal clicks from lower layers. The
  // seeded smart-storage-tank sample carries exactly this authored shape: its
  // outlet-pipe polyline renders through absolute points while its transform
  // box spans (0,0)-(290,250) across nearly the whole 320x280 artboard, and
  // the pipe paints above most other layers. Selecting it on canvas must not
  // block clicks on the layers beneath that box, and the pipe must remain
  // draggable by its own ink.
  // The fixture above is an unsaved component: leave through B2's guard
  // before changing routes, exactly like the toolbar smoke.
  await page.getByRole('button', { name: '返回组件库工作台', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.getByRole('heading', { name: '组件库开发', exact: true }).waitFor()
  await page.goto(`${baseUrl}#/components/component-smart-storage-tank`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  const tankStage = page.locator('.component-artboard .konvajs-content').first()
  const tankBox = await tankStage.boundingBox()
  assert.ok(tankBox, 'sample tank stage must be measurable')
  const tankScaleX = tankBox.width / 320
  const tankScaleY = tankBox.height / 280
  const tankPoint = (x, y) => ({
    x: tankBox.x + x * tankScaleX,
    y: tankBox.y + y * tankScaleY,
  })

  const pipePoint = tankPoint(220, 195)
  await page.mouse.click(pipePoint.x, pipePoint.y)
  await page.locator('.component-layer-row.active').filter({ hasText: '出料管线' }).first().waitFor()

  const legPoint = tankPoint(52, 240)
  await page.mouse.click(legPoint.x, legPoint.y)
  await page.locator('.component-layer-row.active').filter({ hasText: '左侧支腿' }).first().waitFor()

  const bodyPoint = tankPoint(90, 60)
  await page.mouse.click(bodyPoint.x, bodyPoint.y)
  await page.locator('.component-layer-row.active').filter({ hasText: '金属罐体外壳' }).first().waitFor()

  // Drag the selected pipe by ink on its first segment, away from the line
  // overlay's vertex and thickness handles; the whole layer must move.
  await page.mouse.click(pipePoint.x, pipePoint.y)
  await page.locator('.component-layer-row.active').filter({ hasText: '出料管线' }).first().waitFor()
  const dragFrom = tankPoint(165, 195)
  await page.mouse.move(dragFrom.x, dragFrom.y)
  await page.mouse.down()
  await page.mouse.move(dragFrom.x + 24 * tankScaleX, dragFrom.y + 16 * tankScaleY, { steps: 4 })
  await page.mouse.up()
  await waitForInspectorSelection('出料管线')
  const pipeX = Number(await page.locator('.component-layer-geometry-grid input').nth(0).inputValue())
  assert.ok(
    pipeX > 0,
    `dragging the selected pipe by its own ink must move the layer, got x=${pipeX}`,
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(`Pages pointer smoke passed in ${browserName}: visual-forest Navigator, explicit Group authoring, blank-canvas selection clearing, empty-layer hit, canvas modifier selection, release-only snap and loose-bounds selection pass-through are stable.`)
} finally {
  await browser.close()
}
