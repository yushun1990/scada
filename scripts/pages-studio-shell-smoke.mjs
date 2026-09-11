import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

async function shellGeometry() {
  return page.evaluate(() => {
    const box = (selector) => {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    return {
      menu: box('.studio-menu-bar'),
      toolbar: box('.studio-main-toolbar'),
      document: box('.studio-document-bar'),
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
  assert.ok(geometry.menu && geometry.toolbar && geometry.document && geometry.status && geometry.center)
  closeTo(geometry.menu.height, 28)
  closeTo(geometry.toolbar.height, 36)
  closeTo(geometry.document.height, 28)
  closeTo(geometry.status.height, 26)
  assert.ok(geometry.center.width >= 480, `center workspace must remain usable, got ${geometry.center.width}`)
  assert.ok(geometry.bodyScrollWidth <= geometry.bodyClientWidth + 1, 'StudioShell must not create page-level horizontal overflow')
  assert.equal(geometry.visibleCanvasToolbars, 0, 'C2 must expose one Studio toolbar row, not a second canvas toolbar')
  if (panels) {
    assert.ok(geometry.left && geometry.right, 'both side panels must be visible')
  }
  return geometry
}

try {
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.locator('.studio-shell').waitFor()

  let geometry = await assertShellGeometry()
  closeTo(geometry.left.width, 248)
  closeTo(geometry.right.width, 320)
  assert.ok(await page.getByRole('button', { name: '保存', exact: true }).isVisible())
  assert.ok(await page.getByRole('button', { name: '设计', exact: true }).isVisible())
  assert.ok(await page.locator('.studio-right-panel .semantic-inspector').isVisible())

  const nameField = page
    .locator('.studio-right-panel .property-field')
    .filter({ has: page.locator('span', { hasText: /^名称$/ }) })
    .locator('input')
    .first()
  await nameField.waitFor()
  const originalName = await nameField.inputValue()

  // Keyboard resizing is part of the Shell's accessible layout authority.
  const leftResizer = page.locator('.studio-panel-resizer-left')
  const originalLeftWidth = Number(await leftResizer.getAttribute('aria-valuenow'))
  await leftResizer.focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(100)
  const resizedLeftWidth = Number(await leftResizer.getAttribute('aria-valuenow'))
  assert.equal(resizedLeftWidth, originalLeftWidth + 8)
  assert.equal(await nameField.inputValue(), originalName, 'layout resize must not reset selection/document state')

  // Panel visibility is UI preference only and survives reload without dirtying the Scene.
  await page.getByRole('button', { name: '隐藏属性面板' }).click()
  assert.equal(await page.locator('.studio-right-panel:not([hidden])').count(), 0)
  assert.equal(await page.locator('.document-save-status').getByText('已保存', { exact: true }).count(), 1)
  await page.waitForTimeout(250)
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.studio-shell').waitFor()
  const persistedResizerWidth = Number(await page.locator('.studio-panel-resizer-left').getAttribute('aria-valuenow'))
  assert.equal(persistedResizerWidth, resizedLeftWidth, 'left panel width must persist through existing storage meta')
  assert.equal(await page.locator('.studio-right-panel:not([hidden])').count(), 0, 'hidden right panel must persist')
  assert.equal(await page.locator('.document-save-status').getByText('已保存', { exact: true }).count(), 1)

  // View -> reset layout restores the normative desktop defaults.
  await page.getByRole('button', { name: '视图', exact: true }).click()
  await page.getByRole('menuitem', { name: '重置布局', exact: true }).click()
  await page.waitForTimeout(100)
  geometry = await assertShellGeometry()
  closeTo(geometry.left.width, 248)
  closeTo(geometry.right.width, 320)

  // The same row geometry must hold at a normal desktop viewport.
  await page.setViewportSize({ width: 1440, height: 900 })
  geometry = await assertShellGeometry()
  closeTo(geometry.left.width, 248)
  closeTo(geometry.right.width, 320)
  await page.setViewportSize({ width: 1366, height: 768 })
  await assertShellGeometry()

  // The explicit Shell Workspace control must route through the existing B2 guard.
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
  await page.locator('.studio-shell').waitFor()
  assert.equal(await restoredNameField.inputValue(), `${originalName}-C2`)
  await page.locator('.studio-workspace-nav').click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()

  // Component Editor uses the same Shell geometry and receives canvas-owned
  // commands through explicit parent-provided hosts rather than DOM queries.
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell').waitFor()
  geometry = await assertShellGeometry()
  closeTo(geometry.left.width, 248)
  closeTo(geometry.right.width, 320)
  const editHost = page.locator('.component-edit-command-host')
  const viewHost = page.locator('.component-view-command-host')
  await editHost.getByRole('button', { name: '撤销' }).waitFor()
  assert.equal(await editHost.getByRole('button').count(), 4, 'explicit component edit host must receive copy/delete/undo/redo')
  await viewHost.getByRole('button', { name: '显示格线' }).waitFor()
  assert.ok(await viewHost.getByRole('button', { name: '吸附' }).isVisible())
  assert.equal(await page.locator('.component-canvas-toolbar').count(), 0, 'old component canvas toolbar authority must be gone')

  assert.deepEqual(pageErrors, [], `unexpected page errors: ${pageErrors.join('; ')}`)
} finally {
  await browser.close()
}
