import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { readPersistedScene, writePersistedScene, saveSceneAndWait } from './pages-scene-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const row = (id) => page.locator(`.scene-navigator-row[data-node-id="${id}"]`)
const selected = () => page.getByRole('treeitem', { selected: true })
const nameField = () => page.locator('.property-panel .property-field')
  .filter({ has: page.locator('span', { hasText: /^名称$/ }) }).locator('input').first()

try {
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.locator('.studio-shell.scada-studio-shell').waitFor()
  assert.equal(await page.getByRole('tab', { name: '资源', exact: true }).count(), 0)
  const paletteSearch = page.getByRole('textbox', { name: '搜索场景组件' })
  await paletteSearch.fill('pump.submersible')
  assert.equal(await page.locator('.component-item').count(), 1)
  await paletteSearch.fill('does-not-exist')
  assert.equal(await page.locator('.component-item').count(), 0)
  await page.getByText('没有匹配的组件', { exact: true }).waitFor()
  await paletteSearch.fill('')
  await page.getByRole('combobox', { name: '组件分类' }).click()
  await page.getByRole('option').nth(1).click()
  assert.ok(await page.locator('.component-item').count() > 0)

  const saved = await readPersistedScene(page)
  const original = saved.document.nodes[0]
  const group = (id, parentId) => ({
    id, parentId, type: 'core.group', name: id === 'outer' ? '工艺区域' : '深层组合',
    visible: true, locked: false,
    transform: { x: 20, y: 20, width: 600, height: 400, rotation: 0 },
    props: { designWidth: 600, designHeight: 400 }, bindings: [], behaviors: [],
  })
  const fixture = { ...saved.document, nodes: [
    group('outer', null), group('inner', 'outer'),
    { ...original, id: 'hidden', name: '隐藏泵', parentId: 'inner', visible: false, locked: true },
    { ...original, id: 'visible', name: '可见泵', parentId: 'inner', transform: { ...original.transform, x: 240, y: 160 } },
    { ...original, id: 'other', name: '独立泵', parentId: null },
  ] }
  await writePersistedScene(page, fixture)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  assert.equal(await page.getByRole('treeitem').count(), 5)
  assert.equal(await row('hidden').getAttribute('aria-level'), '3')
  assert.equal(await row('inner').getAttribute('aria-expanded'), 'true')

  // Collapse via keyboard, then find a hidden/locked descendant through real search.
  await row('outer').focus()
  await page.keyboard.press('ArrowLeft')
  assert.equal(await page.getByRole('treeitem').count(), 2)
  const search = page.getByRole('textbox', { name: '搜索场景图层' })
  await search.fill('隐藏泵')
  assert.equal(await page.getByRole('treeitem').count(), 3, 'search retains ancestor context')
  await row('hidden').click()
  assert.equal(await nameField().inputValue(), '隐藏泵', 'tree selection reaches Inspector even for hidden/locked objects')
  assert.equal(await page.locator('.canvas-status .status-selection strong').textContent(), '隐藏泵')
  await search.fill('no-match')
  assert.equal(await page.getByRole('treeitem').count(), 0)
  await page.getByRole('button', { name: '定位所选', exact: true }).click()
  assert.equal(await search.inputValue(), '')
  assert.equal(await row('hidden').evaluate((element) => element === document.activeElement), true)
  assert.equal(await row('outer').getAttribute('aria-expanded'), 'true')
  assert.equal(await page.locator('.document-save-status').getByText('已保存', { exact: true }).count(), 1)

  // State commands commit through the document history; searching never does.
  await page.getByRole('button', { name: '显示所选', exact: true }).click()
  assert.equal(await row('hidden').getByText('隐藏', { exact: true }).count(), 0)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await row('hidden').getByText('隐藏', { exact: true }).waitFor()
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await page.getByRole('button', { name: '解锁所选', exact: true }).click()
  assert.equal(await row('hidden').getByText('锁定', { exact: true }).count(), 0)
  await saveSceneAndWait(page)
  const after = await readPersistedScene(page)
  assert.equal(after.document.nodes.find((node) => node.id === 'hidden').visible, true)
  assert.equal(after.document.nodes.find((node) => node.id === 'hidden').locked, false)
  assert.deepEqual(after.document.nodes.find((node) => node.id === 'hidden').attributes, original.attributes)
  assert.equal('collapsed' in after.document, false)
  assert.equal('search' in after.document, false)

  // Multi-selection, focus movement and expansion use the same transient selection.
  await row('hidden').click()
  await row('visible').click({ modifiers: ['Control'] })
  assert.equal(await selected().count(), 2)
  assert.equal(await page.getByRole('button', { name: '隐藏所选', exact: true }).isDisabled(), true)
  await row('visible').focus()
  await page.keyboard.press('Home')
  assert.equal(await row('outer').evaluate((element) => element === document.activeElement), true)
  await page.keyboard.press('ArrowRight')
  assert.equal(await row('inner').evaluate((element) => element === document.activeElement), true)
  await page.keyboard.press('End')
  assert.equal(await row('other').evaluate((element) => element === document.activeElement), true)
  await page.keyboard.press('Enter')
  assert.equal(await selected().count(), 1)
  assert.equal(await nameField().inputValue(), '独立泵')
  await row('hidden').click()
  await row('other').click({ modifiers: ['Shift'] })
  assert.equal(await selected().count(), 3)

  await page.getByRole('button', { name: '预览', exact: true }).click()
  const beforePreviewSelection = await selected().count()
  assert.equal(await row('outer').isDisabled(), true)
  await row('outer').click({ force: true })
  await row('outer').press('Space')
  assert.equal(await selected().count(), beforePreviewSelection)
  assert.equal(await page.getByRole('button', { name: '隐藏所选', exact: true }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: '锁定所选', exact: true }).isDisabled(), true)
  assert.deepEqual((await readPersistedScene(page)).document, after.document)
  await page.getByRole('button', { name: '设计', exact: true }).click()
  await row('hidden').click()
  await page.waitForFunction(() => [...document.querySelectorAll('.konva-host canvas')].some((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let blue = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] < 65 && pixels[i + 1] > 70 && pixels[i + 1] < 160 && pixels[i + 2] > 200 && pixels[i + 3] > 100) blue++
    }
    return blue > 20
  }))
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/scene-navigator-1366.png', fullPage: true })
  const canvas = await page.locator('.konva-host canvas').first().boundingBox()
  assert.ok(canvas)
  await page.mouse.click(canvas.x + canvas.width * 0.85, canvas.y + canvas.height * 0.7)
  await page.waitForFunction(() => document.querySelectorAll('.scene-navigator-row[aria-selected="true"]').length === 0)
  assert.equal(await selected().count(), 0, 'clearing selection from Canvas synchronizes the tree')
  assert.deepEqual(errors, [])
  console.log('D1 Scene Navigator smoke passed: palette filters, real hierarchy, hidden/locked search, reveal, Inspector selection, keyboard/multiselect, undo/redo, persistence and Preview gates.')
} finally {
  await browser.close()
}
