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
  const header = page.locator('.studio-document-header')
  const [document, main, save, mode, exit, identity] = await Promise.all([
    boxOf(header, `${label} document header`),
    boxOf(toolbar, `${label} toolbar`),
    boxOf(header.getByRole('button', { name: '保存', exact: true }), `${label} save`),
    boxOf(header.locator('.mode-switch'), `${label} mode`),
    boxOf(page.getByRole('button', { name: exitLabel }), `${label} exit`),
    boxOf(header.locator('.studio-document-identity'), `${label} identity`),
  ])
  const component = await page.locator('.component-studio-shell').count() > 0
  assert.equal(document.height, 44)
  assert.equal(main.height, 36)
  const accent = await header.evaluate((el) => getComputedStyle(el).getPropertyValue('--ui-color-accent').trim())
  assert.equal(accent, component ? '#137766' : '#1769aa', 'component theme is removed when leaving its route')
  assert.ok(contains(document, exit), `${label}: workspace navigation belongs to the document header`)
  assert.ok(contains(document, save) && contains(document, mode), `${label}: save and mode must remain visible`)
  assert.ok(component ? mode.x + mode.width < save.x : save.x + save.width < mode.x, `${label}: mode and save have independent lanes`)
  assert.ok(exit.x + exit.width <= identity.x, `${label}: return precedes the document identity`)
  assert.ok(identity.x + identity.width <= save.x, `${label}: long names must not overlap actions`)
  assert.equal(await page.locator('.studio-menu-bar, .studio-document-bar').count(), 0)
  assert.equal(await page.getByRole('button', { name: '保存', exact: true }).count(), 1)
  assert.equal(await page.getByRole('button', { name: exitLabel }).count(), 1)
  assert.equal(await page.locator('.document-save-status').count(), 1)
  for (const name of ['编辑', '视图', '插入', '排列', '运行']) {
    assert.equal(await header.getByRole('button', { name, exact: true }).count(), 0, `no duplicated ${name} menu`)
  }
  assert.equal(await toolbar.getByRole('button', { name: '保存', exact: true }).count(), 0)
  assert.equal(await toolbar.locator('.mode-switch').count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true)
}

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  await assertChrome('Component', '返回组件库工作台')
  if (await page.getByRole('button', { name: '当前组件', exact: true }).count()) {
    await page.getByRole('button', { name: '当前组件', exact: true }).click()
  }
  const componentName = page.locator('.component-root-inspector .property-field')
    .filter({ has: page.locator('span', { hasText: /^名称$/ }) }).locator('input').first()
  const longName = '用于检查长名称省略与操作可达性的组件'.repeat(6)
  await componentName.fill(longName)
  await componentName.press('Tab')
  for (const width of [1000, 600]) {
    await page.setViewportSize({ width, height: 900 })
    await assertChrome(`Component ${width}px long title`, '返回组件库工作台')
    assert.ok((await page.locator('.studio-document-identity').getAttribute('title')).includes(longName))
  }
  await page.setViewportSize({ width: 1400, height: 900 })
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
  await page.getByRole('menuitem', { name: '导入场景结构（高级）', exact: true }).waitFor()
  assert.deepEqual(await page.getByRole('menuitem').allTextContents(), ['导入场景结构（高级）', '导出场景结构（高级）'])
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '返回 SCADA 作品工作台' }).click()
  await page.waitForURL(/#\/works$/)

  assert.deepEqual(pageErrors, [])
  console.log('Pages editor chrome smoke passed: document header, unique command entry points, keyboard file menu and guarded exits survive route switching.')
} finally {
  await browser.close()
}
