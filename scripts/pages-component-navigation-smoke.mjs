import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { readPersistedComponent, saveAndWait } from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const rows = page.locator('.component-layer-row')
const row = (name) => rows.filter({ has: page.getByText(name, { exact: true }) })
const names = () => rows.locator('.component-layer-name').allTextContents()
const button = (name) => page.getByRole('button', { name, exact: true })
const search = page.getByRole('textbox', { name: '查找图层' })
async function assertNames(expected) {
  await page.waitForFunction((expectedNames) => JSON.stringify(
    [...document.querySelectorAll('.component-layer-name')].map((element) => element.textContent),
  ) === JSON.stringify(expectedNames), expected)
  assert.deepEqual(await names(), expected)
}

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'load' })

  const palette = page.getByRole('region', { name: '组件创作素材' })
  const paletteButton = (name) => palette.getByRole('button', { name, exact: true })
  await paletteButton('矩形').waitFor()

  const paletteHeadings = await palette.locator('.component-palette-summary > span').allTextContents()
  assert.deepEqual(
    paletteHeadings,
    ['基础图元', '组件', '其他资源'],
    'left dock should expose the three authoring source groups without a redundant add header',
  )
  assert.equal(await button('选择').count(), 0, 'the redundant selection button should be removed')
  assert.equal(await button('定位所选').count(), 0, 'the redundant reveal-selection button should be removed')
  assert.equal(
    await page.locator('.component-layer-dock-heading > span').textContent(),
    '0 个图层',
    'layer count should occupy the right-side heading hint position',
  )

  const paletteItems = palette.locator('.component-palette-item')
  assert.equal(await paletteItems.count(), 7, 'basic palette should expose rect, ellipse, polygon, arc, line, scale, and text')
  assert.equal(await paletteButton('Path').count(), 0, 'Path must not masquerade as a basic primitive')
  assert.equal(await paletteButton('圆形').count(), 0, 'Circle must not be a separate authoring tool')
  assert.equal(await paletteButton('椭圆').count(), 0, 'Ellipse must not be a second authoring tool')
  for (const name of ['矩形', '圆/椭圆', '多边形', '圆弧/扇形', '直线', '刻度标尺', '文本']) {
    assert.equal(await paletteButton(name).locator('svg').count(), 1, 'primitives use the shared line icon system')
    assert.equal((await paletteButton(name).textContent())?.trim(), '', 'primitive buttons stay icon-only')
  }

  await paletteButton('矩形').click()
  assert.equal(await paletteButton('矩形').getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('Escape')
  assert.equal(await paletteButton('矩形').getAttribute('aria-pressed'), 'false')
  assert.equal(await rows.count(), 0, 'leaving draw mode must not create a layer')

  await button('折叠图层').click()
  await button('展开图层').waitFor()
  assert.equal(await page.locator('.component-layer-tree').count(), 0, 'Navigator body should collapse independently')
  await button('展开图层').click()
  await button('折叠图层').waitFor()

  for (let index = 1; index <= 3; index += 1) {
    await paletteButton('文本').dblclick()
    await row(`txt_${index}`).waitFor()
  }
  assert.equal(
    await page.locator('.component-layer-dock-heading > span').textContent(),
    '3 个图层',
    'layer count should track authored layers',
  )
  await row('txt_1').click()
  await row('txt_2').click({ modifiers: ['Control'] })
  await button('组合选中图层').click()
  await button('折叠 grp_1').click()
  await assertNames(['txt_3', 'grp_1'])
  assert.equal(await row('grp_1').getAttribute('aria-pressed'), 'true', 'collapse must preserve selection')

  await search.fill('txt_2')
  await assertNames(['grp_1', 'txt_2'])
  assert.equal(await button('折叠 grp_1').isDisabled(), true, 'search temporarily reveals matching descendants')
  await search.press('Escape')
  await assertNames(['txt_3', 'grp_1'])
  assert.equal(await row('grp_1').getAttribute('aria-pressed'), 'true', 'Escape in search only clears the query')

  await search.fill('txt_2')
  await row('txt_2').click()
  await search.fill('no matching layer')
  await assertNames([])
  await search.press('Escape')
  await assertNames(['txt_3', 'grp_1', 'txt_2', 'txt_1'])
  assert.equal(await row('txt_2').getAttribute('aria-pressed'), 'true')

  await button('Coding 开发').click()
  await page.locator('.component-root-inspector').waitFor()
  assert.equal(await page.locator('.component-layer-row.active').count(), 1, 'switching central work page preserves layer selection')
  await row('txt_2').click()
  await row('txt_2').press('Escape')
  await button('图形化设计').click()
  assert.equal(await page.locator('.component-layer-row.active').count(), 0)

  // Both history stacks are populated so Preview cannot pass by having nothing to undo.
  await button('撤销').click()
  await assertNames(['txt_3', 'txt_2', 'txt_1'])
  assert.equal(await button('重做').isEnabled(), true)
  await button('预览').click()
  assert.equal(await button('撤销').isDisabled(), true)
  assert.equal(await button('重做').isDisabled(), true)
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+Shift+z')
  // Native input undo may restore transient Navigator search history; clear it before
  // asserting the persisted visual history did not move while Preview was active.
  await search.fill('')
  await assertNames(['txt_3', 'txt_2', 'txt_1'])
  await button('设计').click()
  await button('重做').click()
  await assertNames(['txt_3', 'grp_1', 'txt_2', 'txt_1'])

  await saveAndWait(page)
  const baseline = (await readPersistedComponent(page)).document.visual
  await button('折叠 grp_1').click()
  await search.fill('txt_1')
  await saveAndWait(page)
  assert.deepEqual((await readPersistedComponent(page)).document.visual, baseline, 'navigation must not enter persisted visual state')
  await page.reload({ waitUntil: 'load' })
  await assertNames(['txt_3', 'grp_1', 'txt_2', 'txt_1'])
  assert.equal(await search.inputValue(), '', 'search is transient')

  // A long list must scroll independently while creation and search remain reachable.
  for (let index = 4; index <= 20; index += 1) {
    await paletteButton('文本').dblclick()
    await row(`txt_${index}`).waitFor()
  }
  await page.setViewportSize({ width: 1000, height: 700 })
  await row('txt_1').click()
  const tree = page.locator('.component-layer-tree')
  const paletteBox = await palette.boundingBox()
  const scroll = await tree.evaluate((element) => ({
    top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight,
  }))
  assert.ok(scroll.total > scroll.height && scroll.top > 0, 'the Navigator owns long-list scrolling')
  const lastBox = await row('txt_1').boundingBox()
  const treeBox = await tree.boundingBox()
  assert.ok(lastBox && treeBox && lastBox.y + lastBox.height <= treeBox.y + treeBox.height + 1)
  assert.ok(paletteBox && paletteBox.y >= 0, 'revealing a layer must not scroll the Palette away')
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/component-navigation-1000.png' })
  assert.deepEqual(errors, [])
  console.log('Component navigation browser smoke passed: reorganized collapsible Palette, double-click placement, collapse/search/reveal, selection/settings, Preview history lock, transient persistence, and independent scrolling.')
} finally {
  await browser.close()
}
