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

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  const layerInspector = page.getByRole('complementary', { name: '图层检查器' })
  await layerInspector.waitFor()
  assert.match(await layerInspector.textContent(), /未选择/)
  const panel = page.locator('.studio-right-panel > .property-panel')
  await panel.evaluate((element) => { element.scrollTop = element.scrollHeight })
  const panelBox = await panel.boundingBox()
  const inspectorHeader = await page.locator('.component-layer-header-empty').boundingBox()
  assert.ok(inspectorHeader.y >= panelBox.y && inspectorHeader.y < panelBox.y + 60, 'layer context stays at hand while browsing the inspector')
  await panel.evaluate((element) => { element.scrollTop = 0 })
  const saved = await saveAndWait(page)
  const layer = {
    id: 'indicator', name: '状态指示灯', kind: 'vector', parentId: null, visible: true, opacity: 1,
    transform: { x: 60, y: 60, width: 100, height: 80, rotation: 0, scaleX: 1, scaleY: 1 },
    primitive: 'rect', style: { fill: '#137766', stroke: '#137766', strokeWidth: 0 },
  }
  await writePersistedComponent(page, {
    ...saved.document,
    definition: {
      ...saved.document.definition,
      actions: { legacyAction: { title: 'Legacy action' } },
      events: { legacyEvent: { title: 'Legacy event' } },
    },
    status: 'draft',
    visual: { ...saved.document.visual, layers: [layer] },
  })
  await page.reload({ waitUntil: 'networkidle' })
  const row = page.locator('.component-layer-row').filter({ hasText: layer.name })
  await row.click()
  assert.match(await layerInspector.textContent(), new RegExp(layer.name))

  // Layer scope owns its own tab set: portable layer behavior is declarative
  // and must not leak public Action/Event authoring affordances.
  const layerPanel = page.locator('.component-property-panel')
  const layerTab = (name) => layerPanel.getByRole('tab', { name, exact: true })
  await layerTab('行为').click()
  await layerPanel.getByText(/当前图层没有可配置的声明式行为/).waitFor()
  assert.equal(await button('+ 添加方法').count(), 0, 'layer scope must not present the component contract as a layer method')

  await layerTab('属性').click()
  const width = layerPanel
    .locator('.property-field')
    .filter({ has: page.locator('span', { hasText: /^W$/ }) })
    .locator('input')
    .first()
  await width.fill('120')
  await width.press('Tab')

  await button('Coding 开发').click()
  const definitionPage = page.locator('.component-definition-page')
  const definitionTab = (name) => definitionPage.getByRole('tab', { name, exact: true })
  await page.locator('.component-root-inspector').waitFor()
  assert.equal(await row.getAttribute('aria-pressed'), 'true', 'scope switching keeps the selected layer')
  await definitionTab('方法（未开放）').click()
  await definitionPage.getByText(/当前可移植用户组件仅支持 Property 驱动/).waitFor()
  assert.equal(await button('+ 添加方法').count(), 0)
  await definitionPage.getByRole('button', { name: '删除', exact: true }).click()
  await button('图形化设计').click()
  assert.equal(await layerTab('属性').getAttribute('aria-selected'), 'true', 'layer tab is remembered')
  assert.equal(await button('+ 添加方法').count(), 0)
  await button('Coding 开发').click()
  assert.equal(await definitionTab('方法（未开放）').getAttribute('aria-selected'), 'true', 'component tab is remembered')
  await definitionTab('事件（未开放）').click()
  assert.equal(await button('+ 添加事件').count(), 0)
  await definitionPage.getByRole('button', { name: '删除', exact: true }).click()
  await saveAndWait(page)
  const persisted = (await readPersistedComponent(page)).document
  assert.deepEqual(persisted.definition.actions, {})
  assert.deepEqual(persisted.definition.events, {})
  assert.deepEqual(
    persisted.visual.layers,
    [{ ...layer, transform: { ...layer.transform, width: 120 } }],
    'component contracts and layer properties persist to their own objects',
  )

  await button('预览').click()
  assert.equal(await button('+ 添加事件').count(), 0, 'portable preview cannot add public events')
  await button('图形化设计').click()
  await layerTab('属性').click()
  assert.equal(await width.isDisabled(), true, 'preview also gates layer editing')
  assert.deepEqual(errors, [])
  console.log('Inspector scope smoke passed: preserved selection, separate remembered tabs, correct contract/property persistence and preview gates.')
} finally {
  await browser.close()
}
