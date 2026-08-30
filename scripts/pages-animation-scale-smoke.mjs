import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import {
  readPersistedComponent,
  saveAndWait,
  writePersistedComponent,
} from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/').replace(/\/?$/, '/')
const componentUrl = `${baseUrl}#/components/new`
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

function layerRow(name) { return page.locator('.component-layer-row', { hasText: name }).first() }
async function chooseSelectOption(ariaLabel, optionName) {
  await page.getByRole('combobox', { name: ariaLabel }).click()
  await page.getByRole('option', { name: optionName, exact: true }).click()
}
async function readSceneCanvasDataUrl() {
  const canvas = page.locator('.konvajs-content canvas').first()
  await canvas.waitFor()
  return canvas.evaluate((element) => element.toDataURL())
}

async function seedScaleAnimationFixture() {
  const { document: entry } = await readPersistedComponent(page)
  entry.definition.properties = {
    ...entry.definition.properties,
    running: { title: 'Running', kind: 'boolean', defaultValue: false, bindable: true },
  }
  entry.visual.layers = entry.visual.layers.filter((layer) => layer.id !== 'scale-animation-smoke-layer')
  entry.visual.animations = (entry.visual.animations ?? []).filter((animation) => animation.layerId !== 'scale-animation-smoke-layer')
  entry.visual.layers.push({
    id: 'scale-animation-smoke-layer', name: 'Scale Animation Smoke Rect', kind: 'vector', parentId: null,
    transform: { x: 220, y: 150, width: 110, height: 36, rotation: 0, scaleX: 1, scaleY: 1 },
    visible: true, opacity: 1, primitive: 'rect',
    style: { fill: '#7c3aed', stroke: '#4c1d95', strokeWidth: 2 },
  })
  await writePersistedComponent(page, entry)
  return { scaleX: 1, scaleY: 1, x: 220, y: 150 }
}

async function readPersistedScaleState() {
  const { document: entry } = await readPersistedComponent(page)
  const layer = entry?.visual?.layers?.find((candidate) => candidate.id === 'scale-animation-smoke-layer')
  const scale = entry?.visual?.animations?.find((candidate) => candidate.layerId === 'scale-animation-smoke-layer' && candidate.kind === 'scale')
  return {
    x: layer?.transform?.x ?? null, y: layer?.transform?.y ?? null,
    scaleX: layer?.transform?.scaleX ?? null, scaleY: layer?.transform?.scaleY ?? null,
    scale: scale ?? null,
  }
}

try {
  console.log(`Opening deployed Component Editor scale animation smoke: ${componentUrl}`)
  await page.goto(componentUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  const root = page.locator('.component-layer-root')
  await root.click()
  await page.getByRole('button', { name: '添加图层' }).click()
  await layerRow('Group 1').waitFor()
  await page.getByRole('button', { name: '保存' }).click()
  await page.waitForFunction(() => window.location.hash !== '#/components/new')
  const savedUrl = page.url()

  assert.deepEqual(await seedScaleAnimationFixture(), { scaleX: 1, scaleY: 1, x: 220, y: 150 }, 'scale fixture starts from stable persisted geometry')
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await layerRow('Scale Animation Smoke Rect').click()
  await page.getByRole('button', { name: '动画' }).click()
  await page.getByRole('button', { name: '+ 添加 Scale 动画' }).click()
  assert.equal(await page.locator('.component-animation-item').count(), 1, 'scale animation added through real inspector')

  await page.getByLabel('animation1 X 缩放倍率').fill('1.8')
  await page.getByLabel('animation1 Y 缩放倍率').fill('0.6')
  await page.getByLabel('animation1 周期').fill('800')
  await page.getByLabel('animation1 延迟').fill('20')
  await chooseSelectOption('animation1 方向', '交替')
  await chooseSelectOption('animation1 缓动', '缓入缓出')
  await chooseSelectOption('animation1 激活方式', 'Property 条件')
  await page.locator('.component-animation-item .ui-checkbox').nth(1).click()

  await saveAndWait(page)
  const authored = await readPersistedScaleState()
  assert.equal(authored.x, 220); assert.equal(authored.y, 150); assert.equal(authored.scaleX, 1); assert.equal(authored.scaleY, 1)
  assert.equal(authored.scale?.kind, 'scale')
  assert.equal(authored.scale?.scaleXMultiplier, 1.8); assert.equal(authored.scale?.scaleYMultiplier, 0.6)
  assert.equal(authored.scale?.timing?.durationMs, 800); assert.equal(authored.scale?.timing?.delayMs, 20)
  assert.equal(authored.scale?.timing?.iterations, 'infinite'); assert.equal(authored.scale?.timing?.direction, 'alternate')
  assert.equal(authored.scale?.timing?.easing, 'ease-in-out'); assert.equal(authored.scale?.activation?.kind, 'property')
  assert.equal(authored.scale?.activation?.propertyKey, 'running'); assert.equal(authored.scale?.activation?.compareValue, true)

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor(); await root.click()
  const designFrameA = await readSceneCanvasDataUrl(); await page.waitForTimeout(250); const designFrameB = await readSceneCanvasDataUrl()
  assert.equal(designFrameA, designFrameB, 'design mode must remain static with authored scale')
  await page.getByRole('button', { name: '预览' }).click(); await page.waitForTimeout(120)
  const inactiveFrameA = await readSceneCanvasDataUrl(); await page.waitForTimeout(260); const inactiveFrameB = await readSceneCanvasDataUrl()
  assert.equal(inactiveFrameA, inactiveFrameB, 'property=false must keep authored scale inactive')
  await page.locator('.component-preview-values .ui-checkbox').click(); await page.waitForTimeout(120)
  const activeFrameA = await readSceneCanvasDataUrl(); await page.waitForTimeout(300); const activeFrameB = await readSceneCanvasDataUrl()
  assert.notEqual(activeFrameA, activeFrameB, 'property=true must visibly activate authored scale')
  const persistedAfterPreview = await readPersistedScaleState()
  assert.equal(persistedAfterPreview.x, 220); assert.equal(persistedAfterPreview.y, 150)
  assert.equal(persistedAfterPreview.scaleX, 1); assert.equal(persistedAfterPreview.scaleY, 1)
  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages scale animation smoke passed: scale remains persisted through IndexedDB and preview-only runtime overlays.')
  console.log(`Persisted scale test component URL: ${savedUrl}`)
} finally { await browser.close() }
