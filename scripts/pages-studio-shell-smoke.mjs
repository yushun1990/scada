import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

async function waitForStudioShell(selector = '.studio-shell') {
  try {
    await page.locator(selector).waitFor({ timeout: 8000 })
  } catch (error) {
    const diagnostic = {
      selector,
      url: page.url(),
      hash: await page.evaluate(() => window.location.hash).catch(() => '<unavailable>'),
      body: (await page.locator('body').innerText().catch(() => '<unavailable>')).slice(0, 2400),
      pageErrors: [...pageErrors],
    }
    throw new Error(
      `StudioShell did not render: ${JSON.stringify(diagnostic)}\n${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function shellGeometry() {
  return page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    return {
      canvasToolbar: !!document.querySelector('.studio-shell-canvas-toolbar'),
      canvas: box('.studio-canvas-content'),
      header: box('.studio-document-header'),
      toolbar: box('.studio-main-toolbar'),
      toolbarNavigation: box('.component-workpage-navigation'),
      status: box('.studio-status-bar'),
      left: box('.studio-left-panel:not([hidden])'),
      center: box('.studio-center-workspace'),
      right: box('.studio-right-panel:not([hidden])'),
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.documentElement.clientWidth,
      visibleCanvasToolbars: [...document.querySelectorAll('.canvas-toolbar')]
        .filter((element) => element instanceof HTMLElement && element.getBoundingClientRect().height > 1)
        .length,
    }
  })
}

function closeTo(actual, expected, tolerance = 1) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} to be within ${tolerance}px of ${expected}`)
}

async function assertShellGeometry({ panels = true } = {}) {
  const geometry = await shellGeometry()
  assert.ok(geometry.header && geometry.toolbar && geometry.status && geometry.center)
  closeTo(geometry.header.height, 44)
  closeTo(geometry.toolbar.height, 36)
  closeTo(geometry.status.height, 26)
  assert.ok(geometry.center.width >= 480, `center workspace must remain usable, got ${geometry.center.width}`)
  assert.ok(geometry.bodyScrollWidth <= geometry.bodyClientWidth + 1, 'StudioShell must not create page-level horizontal overflow')
  assert.equal(geometry.visibleCanvasToolbars, 0, 'C2 must expose one Studio toolbar row, not a second canvas toolbar')
  closeTo(geometry.toolbar.y, geometry.header.y + geometry.header.height)
  if (geometry.canvasToolbar) {
    closeTo(geometry.center.y, geometry.header.y + geometry.header.height)
    closeTo(geometry.canvas.y, geometry.toolbar.y + geometry.toolbar.height)
    closeTo(geometry.toolbar.x, geometry.center.x)
    // The component studio reserves a trailing navigation slot inside the
    // toolbar row for the work-page switch; the toolbar plus that slot must
    // still account for the full center workspace width.
    closeTo(
      geometry.toolbar.width + (geometry.toolbarNavigation ? geometry.toolbarNavigation.width : 0),
      geometry.center.width,
    )
  } else {
    closeTo(geometry.center.y, geometry.toolbar.y + geometry.toolbar.height)
  }
  closeTo(geometry.center.y + geometry.center.height, geometry.status.y)
  closeTo(geometry.center.x, geometry.left ? geometry.left.width + 6 : 24)
  closeTo(
    geometry.center.x + geometry.center.width,
    geometry.bodyClientWidth - (geometry.right ? geometry.right.width + 6 : 24),
  )
  if (panels) {
    assert.ok(geometry.left && geometry.right, 'both side panels must be visible')
  }
  return geometry
}

async function waitForShellGeometrySettled() {
  // Panel and toolbar geometry eases over ~360ms (--component-workspace-motion);
  // sample until two consecutive reads agree before asserting exact boxes.
  let previous = JSON.stringify(await shellGeometry())
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.waitForTimeout(100)
    const current = JSON.stringify(await shellGeometry())
    if (current === previous) return
    previous = current
  }
}

async function assertPanelVisibilityLayout() {
  for (const action of ['收起左侧面板', '收起右侧面板', '展开左侧面板', '展开右侧面板']) {
    await page.getByRole('button', { name: action, exact: true }).click()
    assert.equal(await page.locator('.studio-panel-toggle:focus').count(), 1, 'collapse keeps a reachable keyboard focus')
    await waitForShellGeometrySettled()
    await assertShellGeometry({ panels: false })
  }
  await waitForShellGeometrySettled()
  await assertShellGeometry()
}

try {
  await mkdir('artifacts', { recursive: true })
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await waitForStudioShell('.studio-shell.scada-studio-shell')

  assert.equal(await page.getByRole('button', { name: '布局', exact: true }).count(), 0, 'panel controls belong at the sidebar edges')
  let geometry = await assertShellGeometry()
  closeTo(geometry.left.width, 360)
  closeTo(geometry.right.width, 360)
  assert.ok(await page.getByRole('button', { name: '保存', exact: true }).isVisible())
  assert.ok(await page.getByRole('button', { name: '设计', exact: true }).isVisible())
  assert.ok(await page.locator('.studio-right-panel .semantic-inspector').isVisible())
  await assertPanelVisibilityLayout()
  await page.screenshot({ path: 'artifacts/studio-shell-scada-1366.png', fullPage: true })

  const nameField = page
    .locator('.studio-right-panel .property-field')
    .filter({ has: page.locator('span', { hasText: /^名称$/ }) })
    .locator('input')
    .first()
  await nameField.waitFor()
  const originalName = await nameField.inputValue()

  const leftResizer = page.locator('.studio-panel-resizer-left')
  const originalLeftWidth = Number(await leftResizer.getAttribute('aria-valuenow'))
  await leftResizer.focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(100)
  const resizedLeftWidth = Number(await leftResizer.getAttribute('aria-valuenow'))
  assert.equal(resizedLeftWidth, originalLeftWidth + 8)
  assert.equal(await nameField.inputValue(), originalName, 'layout resize must not reset selection/document state')

  await page.getByRole('button', { name: '收起右侧面板', exact: true }).click()
  assert.equal(await page.locator('.studio-right-panel:not([hidden])').count(), 0)
  assert.equal(await page.locator('.document-save-status').getByText('已保存', { exact: true }).count(), 1)
  await page.waitForTimeout(250)
  await page.reload({ waitUntil: 'networkidle' })
  await waitForStudioShell('.studio-shell.scada-studio-shell')
  const persistedResizerWidth = Number(await page.locator('.studio-panel-resizer-left').getAttribute('aria-valuenow'))
  assert.equal(persistedResizerWidth, resizedLeftWidth, 'left panel width must persist through existing storage meta')
  assert.equal(await page.locator('.studio-right-panel:not([hidden])').count(), 0, 'hidden right panel must persist')
  await assertShellGeometry({ panels: false })
  assert.equal(await page.locator('.document-save-status').getByText('已保存', { exact: true }).count(), 1)

  await page.getByRole('button', { name: '展开右侧面板', exact: true }).click()
  await page.locator('.studio-panel-resizer-left').press('Enter')
  await waitForShellGeometrySettled()
  geometry = await assertShellGeometry()
  closeTo(geometry.left.width, 360)
  closeTo(geometry.right.width, 360)

  await page.setViewportSize({ width: 1440, height: 900 })
  geometry = await assertShellGeometry()
  closeTo(geometry.left.width, 360)
  closeTo(geometry.right.width, 360)
  await page.setViewportSize({ width: 1366, height: 768 })
  await assertShellGeometry()

  const restoredNameField = page
    .locator('.studio-right-panel .property-field')
    .filter({ has: page.locator('span', { hasText: /^名称$/ }) })
    .locator('input')
    .first()
  await restoredNameField.fill(`${originalName}-C2`)
  await restoredNameField.press('Tab')
  await page.locator('.document-save-status').getByText('未保存', { exact: true }).waitFor()
  await page.locator('.studio-workspace-nav').click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await waitForStudioShell('.studio-shell.scada-studio-shell')
  assert.equal(await restoredNameField.inputValue(), `${originalName}-C2`)
  await page.locator('.studio-workspace-nav').click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()

  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await waitForStudioShell('.studio-shell.component-studio-shell')
  geometry = await assertShellGeometry()
  closeTo(geometry.left.width, 360)
  closeTo(geometry.right.width, 360)
  const editHost = page.locator('.component-edit-command-host')
  const viewHost = page.locator('.component-view-command-host')
  await editHost.getByRole('button', { name: '撤销' }).waitFor()
  assert.equal(await editHost.getByRole('button').count(), 4, 'explicit component edit host must receive copy/delete/undo/redo')
  await viewHost.getByRole('button', { name: '显示格线' }).waitFor()
  assert.ok(await viewHost.getByRole('button', { name: '吸附' }).isVisible())
  assert.equal(await page.locator('.component-canvas-toolbar').count(), 0, 'old component canvas toolbar authority must be gone')
  await assertPanelVisibilityLayout()
  await page.screenshot({ path: 'artifacts/studio-shell-component-1366.png', fullPage: true })

  assert.deepEqual(pageErrors, [], `unexpected page errors: ${pageErrors.join('; ')}`)
} finally {
  await browser.close()
}
