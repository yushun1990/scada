import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { saveAndWait, writePersistedComponent } from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const button = (name) => page.getByRole('button', { name, exact: true })
const row = (name) => page.locator('.component-layer-row').filter({ hasText: name })

async function assertLayout({ compact = false } = {}) {
  const center = await page.locator('.studio-center-workspace').boundingBox()
  const mode = await page.locator('.studio-document-mode').boundingBox()
  const toolbar = await page.getByRole('toolbar', { name: 'Studio 主工具栏' }).boundingBox()
  assert.ok(center && mode && toolbar)
  assert.ok(Math.abs(mode.x + mode.width / 2 - center.x - center.width / 2) <= 1, 'mode belongs above the canvas center')
  assert.equal(toolbar.x, center.x)
  assert.equal(toolbar.width, center.width)
  const groups = page.locator('.studio-main-toolbar-content > [role="group"]')
  assert.equal(await groups.count(), 3)
  for (const group of await groups.all()) {
    const box = await group.boundingBox()
    assert.ok(box && box.x >= toolbar.x && box.x + box.width <= toolbar.x + toolbar.width, 'tools must fit within canvas width')
  }
  assert.equal(await page.locator('.component-arrange-menu').isVisible(), compact)
  assert.equal(await page.locator('.component-geometry-buttons').isVisible(), !compact)
  assert.equal(await page.locator('.studio-main-toolbar .component-group-command').count(), 1)
  assert.equal(await page.locator('.component-layer-navigator .component-group-command').count(), 0)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
}

try {
  await mkdir('artifacts', { recursive: true })
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.component-root-inspector').waitFor()
  await assertLayout()
  assert.equal(await button('当前组件').getAttribute('aria-pressed'), 'true')
  assert.equal(await button('所选图层').isDisabled(), true)
  const basicInfo = page.locator('.component-root-inspector .inspector-group').filter({ has: button('基本信息') })
  const infoBox = await basicInfo.boundingBox()
  assert.ok(infoBox && infoBox.height < 260, `basic fields should fit in a compact group (${infoBox?.height})`)
  const primitive = page.getByRole('region', { name: '组件创作素材' }).getByRole('button', { name: '矩形', exact: true })
  assert.equal(await primitive.locator('svg').count(), 1)
  const face = await primitive.evaluate((el) => ({ border: getComputedStyle(el).borderWidth, background: getComputedStyle(el).backgroundColor }))
  assert.equal(face.border, '0px')
  assert.equal(face.background, 'rgba(0, 0, 0, 0)')
  const accent = await page.locator('.component-studio-shell').evaluate((el) => getComputedStyle(el).getPropertyValue('--ui-color-accent').trim())
  assert.equal(accent, '#137766')

  // Build a fresh isolated display fixture for the actual editor captures.
  const saved = await saveAndWait(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.waitForFunction(() => document.querySelector('.component-artboard')?.getBoundingClientRect().width > 800)
  const whiteCanvas = await page.locator('.component-artboard').boundingBox()
  assert.ok(whiteCanvas.width > 800 && whiteCanvas.height > 600, 'white artboard fills a large workspace beyond the former 720 × 520 cap')
  assert.ok(Math.abs(whiteCanvas.width / whiteCanvas.height - saved.document.visual.designSize.width / saved.document.visual.designSize.height) < 0.01, 'display scaling preserves design proportions')
  await button('收起左侧面板').click()
  await button('收起右侧面板').click()
  await page.waitForFunction((width) => document.querySelector('.component-artboard')?.getBoundingClientRect().width > width + 100, whiteCanvas.width)
  assert.equal(await button('展开左侧面板').isVisible(), true)
  assert.equal(await button('展开右侧面板').isVisible(), true)
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await button('展开左侧面板').isVisible(), true, 'collapsed panel state persists')
  await button('展开左侧面板').click()
  await button('展开右侧面板').click()
  await page.setViewportSize({ width: 1366, height: 768 })
  const layer = (id, name, kind, x, y, width, height, extra) => ({
    id, name, kind, parentId: null, visible: true, opacity: 1,
    transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 }, ...extra,
  })
  const textStyle = (fontSize, fill, fontStyle = 'normal') => ({ fontSize, fill, fontStyle, fontFamily: 'Arial', align: 'left', verticalAlign: 'middle', lineHeight: 1 })
  const fixture = { ...saved.document,
    definition: { ...saved.document.definition, title: '流量指示器', description: '显示设备流量与运行状态', size: { defaultWidth: 320, defaultHeight: 220, minWidth: 160, minHeight: 110 } },
    visual: { ...saved.document.visual, designSize: { width: 320, height: 220 }, layers: [
      layer('panel', '底板', 'vector', 24, 34, 272, 152, { primitive: 'rect', style: { fill: '#f7faf8', stroke: '#b4c7be', strokeWidth: 1 } }),
      layer('stripe', '状态条', 'vector', 24, 34, 4, 152, { primitive: 'rect', style: { fill: '#137766', stroke: 'transparent', strokeWidth: 0 } }),
      layer('name', '设备名称', 'text', 44, 52, 220, 26, { text: '出水流量  /  FT-101', style: textStyle(12, '#64716a') }),
      layer('value', '流量数值', 'text', 44, 88, 148, 44, { text: '128.6', style: textStyle(38, '#26332f', 'bold') }),
      layer('unit', '单位', 'text', 210, 103, 64, 24, { text: 'm³/h', style: textStyle(14, '#64716a') }),
      layer('state', '运行状态', 'text', 44, 147, 212, 20, { text: '●  运行中', style: textStyle(11, '#137766') }),
    ] },
  }
  await writePersistedComponent(page, fixture)
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.component-root-inspector').waitFor()
  await assertLayout()
  await page.screenshot({ path: 'artifacts/component-redesign-overview-1366.png' })

  await row('流量数值').click()
  const entry = page.locator('.component-layer-entry[data-layer-id="value"]')
  assert.equal(await entry.getByRole('button', { name: '上移一层 · 流量数值', exact: true }).isVisible(), true)
  assert.equal(await page.locator('.component-layer-inspector .component-layer-actions').count(), 0)
  await page.screenshot({ path: 'artifacts/component-redesign-layer-1366.png' })
  await page.setViewportSize({ width: 1000, height: 800 })
  await assertLayout({ compact: true })
  await button('对齐与分布').click()
  await page.getByRole('menuitem', { name: '垂直等距分布', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'artifacts/component-redesign-1000.png' })
  await page.setViewportSize({ width: 1366, height: 768 })
  await button('当前组件').click()
  await button('预览').click()
  await page.screenshot({ path: 'artifacts/component-redesign-preview-1366.png' })
  assert.equal(await button('组合选中图层').isDisabled(), true)
  assert.deepEqual(errors, [])
  console.log('Component design smoke passed: centered canvas controls, compact fields, inline layer actions, unframed primitive icons and scoped theme.')
} catch (error) {
  await page.screenshot({ path: 'artifacts/component-redesign-failure.png' }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
