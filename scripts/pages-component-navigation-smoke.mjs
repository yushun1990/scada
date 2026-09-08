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
const row = (name) => rows.filter({ hasText: name })
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

  const palette = page.getByRole('region', { name: '添加视觉元素' })
  const paletteItems = palette.locator('.component-palette-item')
  assert.equal(await paletteItems.count(), 4, 'basic palette should expose rect, circle/ellipse, line, and text only')
  assert.equal(await button('Path').count(), 0, 'Path must not masquerade as a basic primitive')
  assert.equal(await button('圆形').count(), 0, 'Circle must not be a separate authoring tool')
  assert.equal(await button('椭圆').count(), 0, 'Ellipse must not be a second authoring tool')
  assert.equal((await button('矩形').textContent())?.trim(), '□', 'primitive buttons should be icon-only')
  assert.equal((await button('圆/椭圆').textContent())?.trim(), '○', 'circle/ellipse should share one icon-only tool')
  assert.equal((await button('线段').textContent())?.trim(), '╱', 'line button should be icon-only')
  assert.equal((await button('文本').textContent())?.trim(), 'T', 'text button should be icon-only')

  await button('矩形').click()
  assert.equal(await button('矩形').getAttribute('aria-pressed'), 'true')
  await button('选择').click()
  assert.equal(await button('选择').getAttribute('aria-pressed'), 'true')
  assert.equal(await rows.count(), 0, 'leaving draw mode must not create a layer')

  for (let index = 1; index <= 3; index += 1) {
    await button('文本').click()
    await row(`文本 ${index}`).waitFor()
  }
  await row('文本 1').click()
  await row('文本 2').click({ modifiers: ['Control'] })
  await button('组合选中图层').click()
  await button('折叠 Group 1').click()
  await assertNames(['Group 1', '文本 3'])
  assert.equal(await row('Group 1').getAttribute('aria-pressed'), 'true', 'collapse must preserve selection')

  await search.fill('文本 2')
  await assertNames(['Group 1', '文本 2'])
  assert.equal(await button('折叠 Group 1').isDisabled(), true, 'search temporarily reveals matching descendants')
  await search.press('Escape')
  await assertNames(['Group 1', '文本 3'])
  assert.equal(await row('Group 1').getAttribute('aria-pressed'), 'true', 'Escape in search only clears the query')

  await search.fill('文本 2')
  await row('文本 2').click()
  await search.fill('no matching layer')
  await assertNames([])
  await button('定位所选').click()
  await assertNames(['Group 1', '文本 1', '文本 2', '文本 3'])
  assert.equal(await row('文本 2').getAttribute('aria-pressed'), 'true')

  await button('组件设置').click()
  assert.equal(await page.locator('.component-layer-row.active').count(), 0)
  await page.locator('.component-root-inspector').waitFor()
  await row('文本 2').click()
  await row('文本 2').press('Escape')
  await page.locator('.component-root-inspector').waitFor()
  assert.equal(await page.locator('.component-layer-row.active').count(), 0)

  // Both history stacks are populated so Preview cannot pass by having nothing to undo.
  await button('撤销').click()
  await assertNames(['文本 1', '文本 2', '文本 3'])
  assert.equal(await button('重做').isEnabled(), true)
  await button('预览').click()
  assert.equal(await button('撤销').isDisabled(), true)
  assert.equal(await button('重做').isDisabled(), true)
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+Shift+z')
  // Native input undo may restore transient Navigator search history; clear it before
  // asserting the persisted visual history did not move while Preview was active.
  await search.fill('')
  await assertNames(['文本 1', '文本 2', '文本 3'])
  await button('设计').click()
  await button('重做').click()
  await assertNames(['Group 1', '文本 1', '文本 2', '文本 3'])

  await saveAndWait(page)
  const baseline = (await readPersistedComponent(page)).document.visual
  await button('折叠 Group 1').click()
  await search.fill('文本 1')
  await saveAndWait(page)
  assert.deepEqual((await readPersistedComponent(page)).document.visual, baseline, 'navigation must not enter persisted visual state')
  await page.reload({ waitUntil: 'load' })
  await assertNames(['Group 1', '文本 1', '文本 2', '文本 3'])
  assert.equal(await search.inputValue(), '', 'search is transient')

  // A long list must scroll independently while creation and search remain reachable.
  for (let index = 4; index <= 20; index += 1) {
    await button('文本').click()
    await row(`文本 ${index}`).waitFor()
  }
  await page.setViewportSize({ width: 1000, height: 700 })
  await button('定位所选').click()
  const tree = page.locator('.component-layer-tree')
  const paletteBox = await palette.boundingBox()
  const scroll = await tree.evaluate((element) => ({
    top: element.scrollTop, height: element.clientHeight, total: element.scrollHeight,
  }))
  assert.ok(scroll.total > scroll.height && scroll.top > 0, 'the Navigator owns long-list scrolling')
  const lastBox = await row('文本 20').boundingBox()
  const treeBox = await tree.boundingBox()
  assert.ok(lastBox && treeBox && lastBox.y + lastBox.height <= treeBox.y + treeBox.height + 1)
  assert.ok(paletteBox && paletteBox.y >= 0, 'revealing a layer must not scroll the Palette away')
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/component-navigation-1000.png' })
  assert.deepEqual(errors, [])
  console.log('Component navigation browser smoke passed: icon-only primitive palette, collapse/search/reveal, selection/settings, Preview history lock, transient persistence, and independent scrolling.')
} finally {
  await browser.close()
}
