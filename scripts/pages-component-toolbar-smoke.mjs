import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const componentUrl = `${baseUrl}#/components/new`
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

async function geometryButtonWidths(geometryGroup) {
  return geometryGroup.locator('button').evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().width),
  )
}

async function assertSharedSeparatorArchitecture(toolbar, groups, label) {
  const styles = await toolbar.evaluate((element) => {
    const rootStyle = getComputedStyle(element)
    const before = getComputedStyle(element, '::before')
    const after = getComputedStyle(element, '::after')
    const groupStyles = Array.from(element.children)
      .filter((child) => child.classList.contains('canvas-tool-group'))
      .map((group) => {
        const style = getComputedStyle(group)
        return {
          borderRightWidth: style.borderRightWidth,
          paddingRight: style.paddingRight,
          order: style.order,
        }
      })

    return {
      gap: rootStyle.gap,
      beforeBackground: before.backgroundImage,
      afterBackground: after.backgroundImage,
      beforeOrder: before.order,
      afterOrder: after.order,
      groupStyles,
    }
  })

  assert.equal(styles.gap, '0px', `${label}: toolbar groups must not use legacy fixed gap`)
  assert.notEqual(styles.beforeBackground, 'none', `${label}: first centered separator must exist`)
  assert.notEqual(styles.afterBackground, 'none', `${label}: second centered separator must exist`)
  assert.equal(styles.beforeOrder, '1', `${label}: first separator must sit between left and geometry zones`)
  assert.equal(styles.afterOrder, '3', `${label}: second separator must sit between geometry and view zones`)
  assert.equal(styles.groupStyles.length, 3, `${label}: toolbar must expose exactly three command groups`)
  assert.deepEqual(
    styles.groupStyles.map((style) => style.order),
    ['0', '2', '4'],
    `${label}: command zones must bracket the two separator spacer slots`,
  )
  for (const [index, style] of styles.groupStyles.entries()) {
    assert.equal(style.borderRightWidth, '0px', `${label}: group ${index + 1} must not own a separator border`)
    assert.equal(style.paddingRight, '0px', `${label}: group ${index + 1} must not offset a separator with trailing padding`)
  }

  const [leftBox, geometryBox, viewBox] = await Promise.all([
    groups.left.boundingBox(),
    groups.geometry.boundingBox(),
    groups.view.boundingBox(),
  ])
  assert.ok(leftBox && geometryBox && viewBox, `${label}: toolbar groups must be measurable`)

  const firstGap = geometryBox.x - (leftBox.x + leftBox.width)
  const secondGap = viewBox.x - (geometryBox.x + geometryBox.width)
  assert.ok(firstGap >= 11, `${label}: first separator spacer must keep a visible centered gap, got ${firstGap}px`)
  assert.ok(secondGap >= 11, `${label}: second separator spacer must keep a visible centered gap, got ${secondGap}px`)
}

async function measureComponentToolbar() {
  const toolbar = page.getByRole('toolbar', { name: '组件画布工具栏' })
  const hierarchyGroup = toolbar.locator('.component-hierarchy-tool-group')
  const geometryGroup = toolbar.locator('.component-geometry-tool-group')
  const viewGroup = toolbar.locator('.canvas-tool-group:has(.component-snap-toggle)')
  const gridControl = toolbar.locator('.grid-control')
  const stage = page.locator('.component-canvas-stage')

  await toolbar.waitFor()
  await hierarchyGroup.waitFor()
  await geometryGroup.waitFor()
  await viewGroup.waitFor()
  await gridControl.waitFor()
  await stage.waitFor()

  const [toolbarBox, hierarchyBox, geometryBox, viewBox, gridBox, stageBox] = await Promise.all([
    toolbar.boundingBox(),
    hierarchyGroup.boundingBox(),
    geometryGroup.boundingBox(),
    viewGroup.boundingBox(),
    gridControl.boundingBox(),
    stage.boundingBox(),
  ])

  assert.ok(toolbarBox, 'component canvas toolbar must be measurable')
  assert.ok(hierarchyBox, 'component hierarchy toolbar group must be measurable')
  assert.ok(geometryBox, 'component geometry toolbar group must be measurable')
  assert.ok(viewBox, 'component view toolbar group must be measurable')
  assert.ok(gridBox, 'component grid control must be measurable')
  assert.ok(stageBox, 'component canvas stage must be measurable')

  return {
    toolbar,
    hierarchyGroup,
    geometryGroup,
    viewGroup,
    gridControl,
    stage,
    toolbarBox,
    hierarchyBox,
    geometryBox,
    viewBox,
    gridBox,
    stageBox,
  }
}

async function assertComponentSingleRowLayout(label) {
  const measured = await measureComponentToolbar()
  const { toolbarBox, hierarchyBox, geometryBox, viewBox, gridBox, stageBox } = measured

  console.log(`${label} geometry: ${JSON.stringify({
    toolbar: toolbarBox,
    hierarchy: hierarchyBox,
    geometry: geometryBox,
    view: viewBox,
    grid: gridBox,
    stage: stageBox,
  })}`)

  assert.ok(
    sameRow([hierarchyBox, geometryBox, viewBox]),
    `${label}: hierarchy, geometry, and view groups must share one toolbar row`,
  )
  assert.ok(contains(toolbarBox, hierarchyBox), `${label}: hierarchy group must stay inside toolbar`)
  assert.ok(contains(toolbarBox, geometryBox), `${label}: geometry group must stay inside toolbar`)
  assert.ok(contains(toolbarBox, viewBox), `${label}: snap/grid group must stay inside toolbar`)
  assert.ok(contains(toolbarBox, gridBox), `${label}: grid control must stay inside toolbar`)
  assert.ok(
    toolbarBox.height <= 50,
    `${label}: toolbar must remain single-row height, got ${toolbarBox.height}px`,
  )
  assert.ok(
    Math.abs(stageBox.y - (toolbarBox.y + toolbarBox.height)) <= 2,
    `${label}: canvas stage must start directly below toolbar`,
  )

  await assertSharedSeparatorArchitecture(
    measured.toolbar,
    {
      left: measured.hierarchyGroup,
      geometry: measured.geometryGroup,
      view: measured.viewGroup,
    },
    label,
  )

  return measured
}

async function measureScadaToolbar() {
  const toolbar = page.getByRole('toolbar', { name: '画布工具栏' })
  const groups = toolbar.locator(':scope > .canvas-tool-group')
  await toolbar.waitFor()
  assert.equal(await groups.count(), 3, 'SCADA toolbar must expose exactly three command groups')

  const leftGroup = groups.nth(0)
  const geometryGroup = groups.nth(1)
  const viewGroup = groups.nth(2)
  const gridControl = viewGroup.locator('.grid-control')
  const sceneSizeControl = viewGroup.locator('.scene-size-control')

  await leftGroup.waitFor()
  await geometryGroup.waitFor()
  await viewGroup.waitFor()
  await gridControl.waitFor()
  await sceneSizeControl.waitFor()

  const [toolbarBox, leftBox, geometryBox, viewBox, gridBox, sceneSizeBox] = await Promise.all([
    toolbar.boundingBox(),
    leftGroup.boundingBox(),
    geometryGroup.boundingBox(),
    viewGroup.boundingBox(),
    gridControl.boundingBox(),
    sceneSizeControl.boundingBox(),
  ])

  assert.ok(toolbarBox, 'SCADA canvas toolbar must be measurable')
  assert.ok(leftBox, 'SCADA edit/history group must be measurable')
  assert.ok(geometryBox, 'SCADA geometry group must be measurable')
  assert.ok(viewBox, 'SCADA view group must be measurable')
  assert.ok(gridBox, 'SCADA grid control must be measurable')
  assert.ok(sceneSizeBox, 'SCADA scene-size control must be measurable')

  return {
    toolbar,
    leftGroup,
    geometryGroup,
    viewGroup,
    gridControl,
    sceneSizeControl,
    toolbarBox,
    leftBox,
    geometryBox,
    viewBox,
    gridBox,
    sceneSizeBox,
  }
}

async function assertScadaSingleRowLayout(label) {
  const measured = await measureScadaToolbar()
  const { toolbarBox, leftBox, geometryBox, viewBox, gridBox, sceneSizeBox } = measured
  const buttonWidths = await geometryButtonWidths(measured.geometryGroup)
  const overflow = await measured.geometryGroup.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))

  console.log(`${label} geometry: ${JSON.stringify({
    toolbar: toolbarBox,
    left: leftBox,
    geometry: geometryBox,
    view: viewBox,
    grid: gridBox,
    sceneSize: sceneSizeBox,
  })}`)
  console.log(`${label} geometry button widths: ${JSON.stringify(buttonWidths)}`)
  console.log(`${label} geometry overflow: ${JSON.stringify(overflow)}`)

  assert.ok(sameRow([leftBox, geometryBox, viewBox]), `${label}: all command groups must share one toolbar row`)
  assert.ok(contains(toolbarBox, leftBox), `${label}: edit/history group must stay visible`)
  assert.ok(contains(toolbarBox, geometryBox), `${label}: geometry strip must stay inside toolbar`)
  assert.ok(contains(toolbarBox, viewBox), `${label}: view/grid group must stay visible`)
  assert.ok(contains(toolbarBox, gridBox), `${label}: grid control must stay visible`)
  assert.ok(contains(toolbarBox, sceneSizeBox), `${label}: scene-size control must stay visible`)
  assert.ok(toolbarBox.height <= 50, `${label}: toolbar must remain single-row height`)
  assert.ok(
    buttonWidths.every((width) => width >= 29),
    `${label}: geometry buttons must keep their normal hit target, got ${buttonWidths.join(', ')}`,
  )

  await assertSharedSeparatorArchitecture(
    measured.toolbar,
    {
      left: measured.leftGroup,
      geometry: measured.geometryGroup,
      view: measured.viewGroup,
    },
    label,
  )

  return { ...measured, overflow }
}

try {
  await mkdir('artifacts', { recursive: true })

  console.log(`Opening deployed Component Editor toolbar layout regression: ${componentUrl}`)
  await page.goto(componentUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const componentToolbar = page.getByRole('toolbar', { name: '组件画布工具栏' })
  await componentToolbar.waitFor()
  await componentToolbar.locator('.component-hierarchy-tool-group').waitFor()
  await componentToolbar.locator('.component-geometry-tool-group').waitFor()
  await componentToolbar.locator('.canvas-tool-group:has(.component-snap-toggle)').waitFor()
  await componentToolbar.locator('.grid-control').waitFor()

  await page.screenshot({ path: 'artifacts/component-toolbar-1200.png', fullPage: true })

  const desktop = await assertComponentSingleRowLayout('Component 1200px desktop')
  const leftAlign = page.getByRole('button', { name: '左对齐' })
  const distributeVertical = page.getByRole('button', { name: '垂直等距分布' })
  const leftAlignBox = await leftAlign.boundingBox()
  const distributeVerticalBox = await distributeVertical.boundingBox()
  const desktopButtonWidths = await geometryButtonWidths(desktop.geometryGroup)

  console.log(`Component 1200px geometry button widths: ${JSON.stringify(desktopButtonWidths)}`)
  assert.ok(leftAlignBox, 'left align command must be measurable')
  assert.ok(distributeVerticalBox, 'vertical distribute command must be measurable')
  assert.ok(
    desktopButtonWidths.every((width) => width >= 29),
    `Component 1200px: geometry buttons must keep their normal hit target, got ${desktopButtonWidths.join(', ')}`,
  )
  assert.ok(
    contains(desktop.toolbarBox, leftAlignBox) && contains(desktop.toolbarBox, distributeVerticalBox),
    'Component 1200px: all geometry commands must be visibly present without toolbar scrolling',
  )

  await page.setViewportSize({ width: 1000, height: 900 })
  await page.waitForTimeout(100)
  await page.screenshot({ path: 'artifacts/component-toolbar-1000.png', fullPage: true })

  const compact = await assertComponentSingleRowLayout('Component 1000px compact desktop')
  const compactButtonWidths = await geometryButtonWidths(compact.geometryGroup)
  const geometryMetrics = await compact.geometryGroup.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  console.log(`Component 1000px geometry button widths: ${JSON.stringify(compactButtonWidths)}`)
  console.log(`Component 1000px geometry overflow: ${JSON.stringify(geometryMetrics)}`)

  assert.ok(
    compactButtonWidths.every((width) => width >= 29),
    `Component 1000px: geometry buttons must not collapse, got ${compactButtonWidths.join(', ')}`,
  )
  assert.ok(
    geometryMetrics.scrollWidth > geometryMetrics.clientWidth + 1,
    `Component 1000px: geometry strip should scroll instead of shrinking buttons (${geometryMetrics.clientWidth}/${geometryMetrics.scrollWidth})`,
  )

  await compact.geometryGroup.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await page.waitForTimeout(50)
  const lastGeometryBox = await distributeVertical.boundingBox()
  const currentGeometryBox = await compact.geometryGroup.boundingBox()

  assert.ok(lastGeometryBox, 'last component geometry command must remain measurable after middle-strip scroll')
  assert.ok(currentGeometryBox, 'component geometry group must remain measurable after middle-strip scroll')
  assert.ok(
    contains(currentGeometryBox, lastGeometryBox),
    'Component 1000px: overflowed geometry commands must remain reachable by scrolling only the middle strip',
  )

  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
    'Component toolbar layout must not create page-level horizontal overflow',
  )

  console.log(`Opening deployed SCADA Editor toolbar layout regression: ${baseUrl}#/works`)
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.getByText('SCADA Editor', { exact: true }).waitFor()

  await page.screenshot({ path: 'artifacts/scada-toolbar-1200.png', fullPage: true })
  await assertScadaSingleRowLayout('SCADA 1200px desktop')

  await page.setViewportSize({ width: 1000, height: 900 })
  await page.waitForTimeout(100)
  await page.screenshot({ path: 'artifacts/scada-toolbar-1000.png', fullPage: true })
  const scadaCompact = await assertScadaSingleRowLayout('SCADA 1000px compact desktop')

  assert.ok(
    scadaCompact.overflow.scrollWidth > scadaCompact.overflow.clientWidth + 1,
    `SCADA 1000px: geometry strip should scroll while view controls stay pinned (${scadaCompact.overflow.clientWidth}/${scadaCompact.overflow.scrollWidth})`,
  )

  const scadaLastGeometry = page.getByRole('button', { name: '垂直等距分布' })
  await scadaCompact.geometryGroup.evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await page.waitForTimeout(50)
  const scadaLastGeometryBox = await scadaLastGeometry.boundingBox()
  const scadaGeometryBox = await scadaCompact.geometryGroup.boundingBox()
  assert.ok(scadaLastGeometryBox && scadaGeometryBox, 'SCADA final geometry command must remain measurable')
  assert.ok(
    contains(scadaGeometryBox, scadaLastGeometryBox),
    'SCADA 1000px: final geometry command must remain reachable by scrolling only the middle strip',
  )

  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
    'SCADA toolbar layout must not create page-level horizontal overflow',
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages shared toolbar smoke passed: Component and SCADA toolbars keep centered inter-group separators, stable outer controls, and middle-only compact overflow.')
} finally {
  await browser.close()
}
