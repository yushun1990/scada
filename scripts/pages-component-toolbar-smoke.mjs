import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } })
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

function centerY(box) {
  return box.y + box.height / 2
}

function sameRow(boxes, tolerance = 2) {
  const centers = boxes.map(centerY)
  return Math.max(...centers) - Math.min(...centers) <= tolerance
}

async function buttonWidths(group) {
  return group.locator('button').evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().width),
  )
}

async function assertC2Boundary(group, label) {
  const style = await group.evaluate((element) => {
    const computed = getComputedStyle(element)
    return {
      borderLeftWidth: computed.borderLeftWidth,
      marginLeft: computed.marginLeft,
      paddingLeft: computed.paddingLeft,
    }
  })
  assert.equal(style.borderLeftWidth, '1px', `${label}: command family must use the C2 left divider`)
  assert.equal(style.marginLeft, '4px', `${label}: divider must retain the C1 spacing token`)
  assert.equal(style.paddingLeft, '4px', `${label}: commands must clear the divider by one C1 spacing token`)
}

async function studioToolbar(height = 36) {
  const toolbar = page.getByRole('toolbar', { name: 'Studio 主工具栏' })
  const content = toolbar.locator('.studio-main-toolbar-content')
  await toolbar.waitFor()
  await content.waitFor()
  const [toolbarBox, contentBox] = await Promise.all([
    toolbar.boundingBox(),
    content.boundingBox(),
  ])
  assert.ok(toolbarBox, 'Studio main toolbar must be measurable')
  assert.ok(contentBox, 'Studio main toolbar content must be measurable')
  assert.equal(toolbarBox.height, height, `Studio main toolbar must remain one ${height}px row`)
  return { toolbar, content, toolbarBox, contentBox }
}

async function measureComponentToolbar(label, compact = false) {
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  const studio = await studioToolbar(36)
  const centerBox = await page.locator('.studio-center-workspace').boundingBox()
  assert.equal(studio.toolbarBox.x, centerBox.x)
  assert.equal(studio.toolbarBox.width, centerBox.width)
  const groups = studio.content.locator(':scope > [role="group"]')
  assert.equal(await groups.count(), 3)
  const boxes = await Promise.all((await groups.all()).map((group) => group.boundingBox()))
  assert.ok(sameRow(boxes), `${label}: all three command families share one row`)
  for (const box of boxes) assert.ok(contains(studio.contentBox, box), `${label}: each group fits the canvas`)
  const groupButton = studio.toolbar.getByRole('button', { name: '组合选中图层', exact: true })
  assert.ok(contains(boxes[0], await groupButton.boundingBox()), 'group/ungroup belongs in the first toolbar group')
  const geometryGroup = groups.nth(1)
  assert.equal(await geometryGroup.locator('.component-arrange-menu').isVisible(), compact)
  assert.equal(await geometryGroup.locator('.component-geometry-buttons').isVisible(), !compact)
  if (compact) {
    await geometryGroup.getByRole('button', { name: '对齐与分布', exact: true }).click()
    await page.getByRole('menuitem', { name: '垂直等距分布', exact: true }).waitFor()
    assert.equal(await page.getByRole('menuitem').count(), 8)
    await page.keyboard.press('Escape')
  } else {
    const buttons = geometryGroup.locator('.component-geometry-buttons button')
    assert.equal(await buttons.count(), 8)
    for (const button of await buttons.all()) {
      const box = await button.boundingBox()
      assert.ok(box.width >= 28 && contains(boxes[1], box), 'alignment buttons remain visible and usable')
    }
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
}

async function measureScadaToolbar(label) {
  const shell = page.locator('.studio-shell.scada-studio-shell')
  await shell.waitFor()
  const studio = await studioToolbar()
  const groups = studio.content.locator(':scope > .canvas-tool-group')
  assert.equal(await groups.count(), 3, `${label}: SCADA must expose exactly three toolbar command families`)

  const editGroup = groups.nth(0)
  const geometryGroup = studio.content.locator(':scope > .scada-geometry-tool-group')
  const viewGroup = studio.content.locator(':scope > .view-tool-group')
  const gridControl = viewGroup.locator('.grid-control')
  const sceneSizeControl = viewGroup.locator('.scene-size-control')

  await geometryGroup.waitFor()
  await viewGroup.waitFor()
  await gridControl.waitFor()
  await sceneSizeControl.waitFor()

  const [editBox, geometryBox, viewBox, gridBox, sceneSizeBox] = await Promise.all([
    editGroup.boundingBox(),
    geometryGroup.boundingBox(),
    viewGroup.boundingBox(),
    gridControl.boundingBox(),
    sceneSizeControl.boundingBox(),
  ])
  assert.ok(editBox && geometryBox && viewBox && gridBox && sceneSizeBox, `${label}: SCADA toolbar groups must be measurable`)
  assert.ok(sameRow([editBox, geometryBox, viewBox]), `${label}: SCADA command families must share one Studio toolbar row`)
  assert.ok(contains(studio.contentBox, editBox), `${label}: edit/history family must remain visible`)
  assert.ok(contains(studio.contentBox, geometryBox), `${label}: geometry strip must remain inside toolbar content`)
  assert.ok(contains(studio.contentBox, viewBox), `${label}: view family must remain visible`)
  assert.ok(contains(studio.contentBox, gridBox), `${label}: grid control must remain visible`)
  assert.ok(contains(studio.contentBox, sceneSizeBox), `${label}: scene-size control must remain visible`)

  await assertC2Boundary(geometryGroup, `${label} geometry`)
  await assertC2Boundary(viewGroup, `${label} view`)

  const widths = await buttonWidths(geometryGroup)
  assert.ok(widths.length > 1, `${label}: SCADA geometry strip must expose its commands`)
  assert.ok(
    widths.every((width) => width >= 28),
    `${label}: SCADA geometry buttons must keep the C1 28px target, got ${widths.join(', ')}`,
  )
  const overflow = await geometryGroup.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))

  console.log(`${label}: ${JSON.stringify({ editBox, geometryBox, viewBox, gridBox, sceneSizeBox, widths, overflow })}`)
  return { ...studio, editGroup, geometryGroup, viewGroup, gridControl, sceneSizeControl, editBox, geometryBox, viewBox, gridBox, sceneSizeBox, widths, overflow }
}

async function assertCompactGeometryReachability(measured, finalCommand, label, requireOverflow = false) {
  if (requireOverflow) {
    assert.ok(
      measured.overflow.scrollWidth > measured.overflow.clientWidth + 1,
      `${label}: middle geometry strip must scroll instead of shrinking outer command families`,
    )
  }
  await measured.geometryGroup.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await page.waitForTimeout(50)
  const [commandBox, geometryBox] = await Promise.all([
    finalCommand.boundingBox(),
    measured.geometryGroup.boundingBox(),
  ])
  assert.ok(commandBox && geometryBox, `${label}: final geometry command must remain measurable`)
  assert.ok(
    contains(geometryBox, commandBox),
    `${label}: final geometry command must be reachable by scrolling only the middle strip`,
  )
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
    `${label}: toolbar must not create page-level horizontal overflow`,
  )
}

try {
  await mkdir('artifacts', { recursive: true })

  console.log(`Opening Component Editor Studio toolbar regression: ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  assert.equal(
    await page.getByRole('toolbar', { name: '组件画布工具栏' }).count(),
    0,
    'C2 must not restore a second Component canvas toolbar',
  )

  await page.screenshot({ path: 'artifacts/component-toolbar-1200.png', fullPage: true })
  await measureComponentToolbar('Component 1200px desktop')
  await page.setViewportSize({ width: 1000, height: 900 })
  await measureComponentToolbar('Component 1000px compact desktop', true)
  await page.screenshot({ path: 'artifacts/component-toolbar-1000.png', fullPage: true })
  // At a phone-sized viewport, panel visibility provides a usable canvas.
  for (const label of ['收起左侧面板', '收起右侧面板']) {
    await page.getByRole('button', { name: label, exact: true }).click()
  }
  await page.setViewportSize({ width: 600, height: 900 })
  await measureComponentToolbar('Component 600px with panels hidden', true)
  await page.getByRole('button', { name: '展开左侧面板', exact: true }).click()
  await page.getByRole('button', { name: '展开右侧面板', exact: true }).click()

  console.log(`Opening SCADA Editor Studio toolbar regression: ${baseUrl}#/works`)
  await page.setViewportSize({ width: 1200, height: 900 })
  // A new component is unsaved: leave through B2's guard before changing routes.
  await page.getByRole('button', { name: '返回组件库工作台', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.getByRole('heading', { name: '组件库开发', exact: true }).waitFor()
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.locator('.studio-shell.scada-studio-shell').waitFor()
  assert.equal(
    await page.getByRole('toolbar', { name: '画布工具栏' }).count(),
    0,
    'C2 must not restore a second SCADA canvas toolbar',
  )

  await page.screenshot({ path: 'artifacts/scada-toolbar-1200.png', fullPage: true })
  const scadaDesktop = await measureScadaToolbar('SCADA 1200px desktop')
  assert.ok(
    scadaDesktop.overflow.scrollWidth <= scadaDesktop.overflow.clientWidth + 1,
    'SCADA 1200px: geometry commands should fit without middle-strip scrolling',
  )
  const scadaLast = scadaDesktop.geometryGroup.getByRole('button', { name: '垂直等距分布' })
  const scadaLastBox = await scadaLast.boundingBox()
  assert.ok(scadaLastBox && contains(scadaDesktop.geometryBox, scadaLastBox), 'SCADA 1200px: final geometry command must be visible')

  await page.setViewportSize({ width: 1000, height: 900 })
  await page.waitForTimeout(100)
  await page.screenshot({ path: 'artifacts/scada-toolbar-1000.png', fullPage: true })
  await measureScadaToolbar('SCADA 1000px compact desktop')
  // Document actions no longer compete with editing commands for toolbar space.
  await page.setViewportSize({ width: 900, height: 900 })
  await page.waitForTimeout(100)
  const scadaCompact = await measureScadaToolbar('SCADA 900px compact desktop')
  await assertCompactGeometryReachability(
    scadaCompact,
    scadaCompact.geometryGroup.getByRole('button', { name: '垂直等距分布' }),
    'SCADA 900px',
  )
  await page.setViewportSize({ width: 600, height: 900 })
  const scadaNarrow = await measureScadaToolbar('SCADA 600px')
  await assertCompactGeometryReachability(
    scadaNarrow,
    scadaNarrow.geometryGroup.getByRole('button', { name: '垂直等距分布' }),
    'SCADA 600px',
    true,
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages Studio toolbar smoke passed: Component and SCADA keep one Studio toolbar, stable outer command families, usable targets, centered Component groups with a compact alignment menu, and SCADA middle-only overflow.')
} finally {
  await browser.close()
}
