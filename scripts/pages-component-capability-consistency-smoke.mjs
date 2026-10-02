import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import {
  readPersistedComponent,
  saveAndWait,
} from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

const componentTitle = 'R0 声明式 SVG 主题组件'
const svgSource = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <rect id="body" class="scada-theme-base" x="10" y="10" width="100" height="60" fill="#6b7280"/>
</svg>
`.trim()

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  const palette = page.getByRole('region', { name: '组件创作素材' })
  const resourceSection = palette.locator('.component-palette-disclosure').filter({
    has: page.getByText('其他资源', { exact: true }),
  })
  const fileInput = resourceSection.locator('input[type="file"]')
  await fileInput.setInputFiles({
    name: 'r0-theme.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgSource),
  })
  await resourceSection.locator('.component-palette-resource-item', { hasText: 'r0-theme' }).dblclick()

  const layerRow = page.locator('.component-layer-row', { hasText: 'r0-theme' })
  await layerRow.waitFor()
  await layerRow.click()

  // Layer 行为 tab: imported scada-theme-* classes surface as controlled-sandbox
  // built-in functions (declarative theme capability, never public Actions).
  const layerPanel = page.locator('.component-property-panel')
  await layerPanel.getByRole('tab', { name: '行为', exact: true }).click()
  await layerPanel.getByText(/个函数/).waitFor()
  assert.ok(
    (await layerPanel.locator('.component-method-badge').count()) >= 1,
    'themed SVG layers offer built-in theme functions',
  )
  assert.equal(
    await page.getByRole('button', { name: '+ 添加方法', exact: true }).count(),
    0,
    'layer functions must not expose public Action creation',
  )

  await page.getByRole('button', { name: 'Coding 开发', exact: true }).click()
  await page.locator('.component-definition-title-display').click()
  await page.locator('.component-definition-title-input').fill(componentTitle)
  await page.locator('.component-definition-title-input').press('Enter')

  const definitionPage = page.locator('.component-definition-page')
  await definitionPage.getByRole('tab', { name: '行为', exact: true }).click()
  await definitionPage.getByText(/个组件函数/).waitFor()
  assert.equal(
    await definitionPage.getByRole('button', { name: '+ 新增', exact: true }).count(),
    1,
    'the behaviors tab hosts the private component function list',
  )
  assert.equal(
    await page.getByRole('button', { name: '+ 添加方法', exact: true }).count(),
    0,
    'normal portable authoring must not expose Action creation',
  )
  await definitionPage.getByRole('tab', { name: '事件（未开放）', exact: true }).click()
  assert.equal(
    await page.getByRole('button', { name: '+ 添加事件', exact: true }).count(),
    0,
    'normal portable authoring must not expose Event creation',
  )

  await definitionPage.getByRole('tab', { name: '属性', exact: true }).click()
  assert.equal(await page.locator('.component-status-badge').textContent(), '草稿')
  const saved = await saveAndWait(page)

  assert.equal(saved.document.status, 'draft')
  assert.deepEqual(saved.document.definition.actions, {})
  assert.deepEqual(saved.document.definition.events, {})

  const persisted = (await readPersistedComponent(page)).document
  assert.equal(persisted.status, 'draft')
  assert.deepEqual(persisted.definition.actions, {})
  assert.deepEqual(persisted.definition.events, {})

  assert.deepEqual(pageErrors, [])
  console.log(
    'Component capability browser smoke passed: themed SVG authoring exposes controlled-sandbox layer and component functions, no portable Action/Event creation, and saves a private-contract draft.',
  )
} finally {
  await browser.close()
}
