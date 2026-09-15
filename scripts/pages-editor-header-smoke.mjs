import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

async function boxOf(locator, label) {
  const box = await locator.boundingBox()
  assert.ok(box, `${label} must be measurable`)
  return box
}

function contains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width + 1
    && inner.y + inner.height <= outer.y + outer.height + 1
}

async function assertChrome(label, exitLabel) {
  const toolbar = page.getByRole('toolbar', { name: 'Studio 主工具栏' })
  const [menu, main, save, mode, exit] = await Promise.all([
    boxOf(page.locator('.studio-menu-bar'), `${label} menu`),
    boxOf(toolbar, `${label} toolbar`),
    boxOf(toolbar.getByRole('button', { name: '保存', exact: true }), `${label} save`),
    boxOf(toolbar.locator('.mode-switch'), `${label} mode`),
    boxOf(page.getByRole('button', { name: exitLabel }), `${label} exit`),
  ])
  assert.equal(menu.height, 28)
  assert.equal(main.height, 36)
  assert.ok(contains(menu, exit), `${label}: workspace navigation belongs to the menu row`)
  assert.ok(contains(main, save) && contains(main, mode), `${label}: save and mode must remain visible`)
  assert.ok(save.x + save.width < mode.x, `${label}: save precedes the right-hand mode switch`)
  assert.ok(exit.x > mode.x, `${label}: workspace exit remains at the right edge`)
}

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  await assertChrome('Component', '返回组件库工作台')
  await page.getByRole('button', { name: '返回组件库工作台' }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.waitForURL(/#\/components$/)
  await page.getByRole('heading', { name: '组件库开发', exact: true }).waitFor()

  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.locator('.studio-shell.scada-studio-shell').waitFor()
  await assertChrome('SCADA', '返回 SCADA 作品工作台')
  const fileMenu = page.getByRole('button', { name: '文件', exact: true })
  await fileMenu.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: '导入场景', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '返回 SCADA 作品工作台' }).click()
  await page.waitForURL(/#\/works$/)

  assert.deepEqual(pageErrors, [])
  console.log('Pages editor chrome smoke passed: shared menu navigation, visible save/mode controls, keyboard file menu, and guarded exits survive async editor loading and route switching.')
} finally {
  await browser.close()
}
