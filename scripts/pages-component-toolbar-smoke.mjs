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

async function measureToolbar() {
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

async function assertSingleRowLayout(label) {
  const measured = await measureToolbar()
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

  return measured
}

try {
  console.log(`Opening deployed Component Editor toolbar layout regression: ${componentUrl}`)
  await page.goto(componentUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await mkdir('artifacts', { recursive: true })

  const toolbar = page.getByRole('toolbar', { name: '组件画布工具栏' })
  await toolbar.waitFor()
  await toolbar.locator('.component-hierarchy-tool-group').waitFor()
  await toolbar.locator('.component-geometry-tool-group').waitFor()
  await toolbar.locator('.canvas-tool-group:has(.component-snap-toggle)').waitFor()
  await toolbar.locator('.grid-control').waitFor()

  // Capture the deployed page before geometry assertions so a failed audit still
  // leaves visual evidence in the workflow artifact.
  await page.screenshot({ path: 'artifacts/component-toolbar-1200.png', fullPage: true })

  const desktop = await assertSingleRowLayout('1200px desktop')
  const leftAlign = page.getByRole('button', { name: '左对齐' })
  const distributeVertical = page.getByRole('button', { name: '垂直等距分布' })
  const leftAlignBox = await leftAlign.boundingBox()
  const distributeVerticalBox = await distributeVertical.boundingBox()

  assert.ok(leftAlignBox, 'left align command must be measurable')
  assert.ok(distributeVerticalBox, 'vertical distribute command must be measurable')
  assert.ok(
    contains(desktop.toolbarBox, leftAlignBox) && contains(desktop.toolbarBox, distributeVerticalBox),
    '1200px desktop: all geometry commands must be visibly present without toolbar scrolling',
  )

  await page.setViewportSize({ width: 1000, height: 900 })
  await page.waitForTimeout(100)
  await page.screenshot({ path: 'artifacts/component-toolbar-1000.png', fullPage: true })

  const compact = await assertSingleRowLayout('1000px compact desktop')
  const geometryMetrics = await compact.geometryGroup.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  console.log(`1000px geometry overflow: ${JSON.stringify(geometryMetrics)}`)

  if (geometryMetrics.scrollWidth > geometryMetrics.clientWidth + 1) {
    await compact.geometryGroup.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await page.waitForTimeout(50)
    const lastGeometryBox = await distributeVertical.boundingBox()
    const currentGeometryBox = await compact.geometryGroup.boundingBox()

    assert.ok(lastGeometryBox, 'last geometry command must remain measurable after middle-strip scroll')
    assert.ok(currentGeometryBox, 'geometry group must remain measurable after middle-strip scroll')
    assert.ok(
      contains(currentGeometryBox, lastGeometryBox),
      '1000px compact desktop: overflowed geometry commands must remain reachable by scrolling only the middle strip',
    )
  }

  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    true,
    'component toolbar layout must not create page-level horizontal overflow',
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages component toolbar smoke passed: toolbar remains single-row and constrained geometry commands stay reachable.')
} finally {
  await browser.close()
}
