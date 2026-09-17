import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readPersistedComponent, saveAndWait, writePersistedComponent } from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const button = (name) => page.getByRole('button', { name, exact: true })
const tab = (name) => page.getByRole('tab', { name, exact: true })

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  const layerInspector = page.getByRole('complementary', { name: '图层检查器' })
  await layerInspector.waitFor()
  assert.match(await layerInspector.textContent(), /未选择/)
  const panel = page.locator('.studio-right-panel > .property-panel')
  await panel.evaluate((element) => { element.scrollTop = element.scrollHeight })
  const panelBox = await panel.boundingBox()
  const inspectorHeader = await page.locator('.component-layer-inspector-header').boundingBox()
  assert.ok(inspectorHeader.y >= panelBox.y && inspectorHeader.y < panelBox.y + 60, 'layer context stays at hand while browsing the inspector')
  await panel.evaluate((element) => { element.scrollTop = 0 })
  const saved = await saveAndWait(page)
  const layer = {
    id: 'indicator', name: '状态指示灯', kind: 'vector', parentId: null, visible: true, opacity: 1,
    transform: { x: 60, y: 60, width: 100, height: 80, rotation: 0, scaleX: 1, scaleY: 1 },
    primitive: 'rect', style: { fill: '#137766', stroke: '#137766', strokeWidth: 0 },
  }
  await writePersistedComponent(page, { ...saved.document, visual: { ...saved.document.visual, layers: [layer] } })
  await page.reload({ waitUntil: 'networkidle' })
  const row = page.locator('.component-layer-row').filter({ hasText: layer.name })
  await row.click()
  assert.match(await layerInspector.textContent(), new RegExp(layer.name))
  assert.equal(await tab('方法').count(), 0, 'layer scope must not present the component contract as a layer method')
  const opacity = page.locator('.component-layer-inspector .property-field').filter({ hasText: '透明度' }).locator('input')
  await opacity.fill('0.7')
  await opacity.press('Tab')
  await tab('行为').click()
  await button('视觉规则').waitFor()
  await button('动画').waitFor()

  await button('Coding 开发').click()
  await page.locator('.component-root-inspector').waitFor()
  assert.equal(await row.getAttribute('aria-pressed'), 'true', 'scope switching keeps the selected layer')
  await tab('方法').click()
  await button('+ 添加方法').click()
  await button('图形化设计').click()
  await button('Coding 开发').click()
  assert.equal(await tab('行为').getAttribute('aria-selected'), 'true', 'layer tab is remembered')
  assert.equal(await button('+ 添加方法').count(), 0)
  assert.equal(await tab('方法').getAttribute('aria-selected'), 'true', 'component tab is remembered')
  await tab('事件').click()
  await button('+ 添加事件').click()
  await saveAndWait(page)
  const persisted = (await readPersistedComponent(page)).document
  assert.equal(Object.keys(persisted.definition.actions).length, Object.keys(saved.document.definition.actions).length + 1)
  assert.equal(Object.keys(persisted.definition.events).length, Object.keys(saved.document.definition.events).length + 1)
  assert.deepEqual(persisted.visual.layers, [{ ...layer, opacity: 0.7 }], 'component contracts and layer properties persist to their own objects')

  await button('预览').click()
  assert.equal(await button('+ 添加事件').count(), 0, 'preview cannot add public events')
  await button('图形化设计').click()
  await tab('属性').click()
  assert.equal(await opacity.isDisabled(), true, 'preview also gates layer editing')
  assert.deepEqual(errors, [])
  console.log('Inspector scope smoke passed: preserved selection, separate remembered tabs, correct contract/property persistence and preview gates.')
} finally {
  await browser.close()
}
