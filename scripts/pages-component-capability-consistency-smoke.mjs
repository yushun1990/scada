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
const componentType = 'custom.r0.browser-capability'
const svgSource = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <rect id="body" class="scada-theme-base" x="10" y="10" width="100" height="60" fill="#6b7280"/>
</svg>
`.trim()

function fieldInput(label) {
  return page.locator('.property-field').filter({
    has: page.locator('span', { hasText: new RegExp(`^${label}$`) }),
  }).locator('input').first()
}

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
  await page.locator('.component-property-panel')
    .getByRole('tab', { name: '行为', exact: true })
    .click()
  await page.getByRole('button', {
    name: '一键绑定声明式运行状态',
    exact: true,
  }).click()
  await page.getByText(/未生成公开 Action/).waitFor()

  await page.getByRole('button', { name: 'Coding 开发', exact: true }).click()
  await fieldInput('名称').fill(componentTitle)
  await fieldInput('类型标识').fill(componentType)

  const definitionPage = page.locator('.component-definition-page')
  await definitionPage.getByRole('tab', { name: '方法（未开放）', exact: true }).click()
  await definitionPage.getByText(/当前可移植用户组件仅支持 Property 驱动/).waitFor()
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
  await page.getByLabel('组件状态').click()
  await page.getByRole('option', { name: '可用', exact: true }).click()
  const saved = await saveAndWait(page)

  assert.equal(saved.document.status, 'ready')
  assert.deepEqual(saved.document.definition.actions, {})
  assert.deepEqual(saved.document.definition.events, {})
  assert.equal(saved.document.definition.properties.state.kind, 'select')
  assert.equal(saved.document.definition.properties.state.bindable, true)
  assert.deepEqual(
    saved.document.visual.rules
      .filter((rule) => rule.target === 'svg.themeState')
      .map((rule) => rule.compareValue),
    ['running', 'alarm', 'warning', 'standby', 'offline'],
  )

  const persisted = (await readPersistedComponent(page)).document
  assert.equal(persisted.status, 'ready')
  assert.deepEqual(persisted.definition.actions, {})
  assert.deepEqual(persisted.definition.events, {})

  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.locator('.studio-shell.scada-studio-shell').waitFor()
  assert.equal(
    await page.locator('.component-item', { hasText: componentTitle }).count(),
    1,
    'the ready declarative component activates into the normal SCADA palette',
  )

  assert.deepEqual(pageErrors, [])
  console.log(
    'Component capability browser smoke passed: normal SVG authoring binds a Property plus private theme rules, exposes no portable Action/Event creation, saves ready, and activates into the SCADA palette.',
  )
} finally {
  await browser.close()
}
