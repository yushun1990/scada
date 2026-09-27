import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { saveAndWait, writePersistedComponent } from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

function styleGroup(page, layerInspector, title) {
  // The has() inner locator must be page-rooted; a layerInspector-rooted
  // chain silently matches nothing inside has().
  return layerInspector
    .locator('.inspector-group')
    .filter({ has: page.locator('.inspector-group-title', { hasText: title }) })
}

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  const layerInspector = page.getByRole('complementary', { name: '图层检查器' })
  await layerInspector.waitFor()
  const saved = await saveAndWait(page)
  const rectLayer = {
    id: 'rect-body', name: '主体矩形', kind: 'vector', parentId: null, visible: true, opacity: 1,
    transform: { x: 60, y: 60, width: 120, height: 80, rotation: 0, scaleX: 1, scaleY: 1 },
    primitive: 'rect', style: { fill: '#38bdf8', stroke: '#64748b', strokeWidth: 2 },
  }
  await writePersistedComponent(page, {
    ...saved.document,
    visual: { ...saved.document.visual, layers: [rectLayer] },
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.component-layer-row').filter({ hasText: rectLayer.name }).click()
  assert.match(await layerInspector.textContent(), new RegExp(rectLayer.name))

  // Fill and stroke configure in two independent groups (issue #205).
  const rectTitles = await layerInspector.locator('.inspector-group-title').allTextContents()
  assert.ok(rectTitles.includes('填充'), 'rect layer renders an independent fill group')
  assert.ok(rectTitles.includes('描边'), 'rect layer renders an independent stroke group')
  assert.ok(!rectTitles.includes('填充与描边'), 'the combined fill/stroke group is gone')
  assert.ok(rectTitles.indexOf('填充') < rectTitles.indexOf('描边'), 'fill group renders before stroke group')

  const rectFillGroup = styleGroup(page, layerInspector, '填充')
  const rectStrokeGroup = styleGroup(page, layerInspector, '描边')
  await rectFillGroup.getByText('填充模式').waitFor()
  assert.equal(await rectFillGroup.getByText(/^纯色填充$/).count(), 1, 'fill group owns the fill fields')
  assert.equal(await rectFillGroup.getByText(/^描边宽度$/).count(), 0, 'fill group must not own stroke fields')
  await rectStrokeGroup.getByText(/^描边宽度$/).waitFor()
  assert.equal(await rectStrokeGroup.getByText('填充模式').count(), 0, 'stroke group must not own fill fields')

  assert.deepEqual(errors, [])
  console.log('Inspector style group smoke passed: fill and stroke render as independent inspector groups.')
} finally {
  await browser.close()
}
