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
async function sampleCanvasFrames(count, intervalMs) {
  const frames = []
  for (let index = 0; index < count; index += 1) {
    frames.push(await readSceneCanvasDataUrl())
    if (index < count - 1) await page.waitForTimeout(intervalMs)
  }
  return frames
}

async function seedBlinkAnimationFixture() {
  const { document: entry } = await readPersistedComponent(page)
  entry.definition.properties = {
    ...entry.definition.properties,
    alarm: { title: 'Alarm', kind: 'boolean', defaultValue: false, bindable: true },
  }
  entry.visual.layers = entry.visual.layers.filter((layer) => layer.id !== 'blink-animation-smoke-layer')
  entry.visual.animations = (entry.visual.animations ?? []).filter((animation) => animation.layerId !== 'blink-animation-smoke-layer')
  entry.visual.layers.push({
    id: 'blink-animation-smoke-layer', name: 'Blink Animation Smoke Lamp', kind: 'vector', parentId: null,
    transform: { x: 220, y: 150, width: 110, height: 36, rotation: 0, scaleX: 1, scaleY: 1 },
    visible: true, opacity: 0.9, primitive: 'rect',
    style: { fill: '#dc2626', stroke: '#7f1d1d', strokeWidth: 2 },
  })
  await writePersistedComponent(page, entry)
  return { visible: true, opacity: 0.9, x: 220, y: 150, rotation: 0, scaleX: 1, scaleY: 1 }
}

async function readPersistedBlinkState() {
  const { document: entry } = await readPersistedComponent(page)
  const layer = entry?.visual?.layers?.find((candidate) => candidate.id === 'blink-animation-smoke-layer')
  const blink = entry?.visual?.animations?.find((candidate) => candidate.layerId === 'blink-animation-smoke-layer' && candidate.kind === 'blink')
  return {
    x: layer?.transform?.x ?? null, y: layer?.transform?.y ?? null,
    rotation: layer?.transform?.rotation ?? null, scaleX: layer?.transform?.scaleX ?? null,
    scaleY: layer?.transform?.scaleY ?? null, opacity: layer?.opacity ?? null,
    visible: layer?.visible ?? null, blink: blink ?? null,
  }
}

try {
  console.log(`Opening deployed Component Editor blink animation smoke: ${componentUrl}`)
  await page.goto(componentUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  const root = page.locator('.component-layer-root')
  await root.click(); await page.getByRole('button', { name: '添加图层' }).click(); await layerRow('Group 1').waitFor()
  await page.getByRole('button', { name: '保存' }).click()
  await page.waitForFunction(() => window.location.hash !== '#/components/new')
  const savedUrl = page.url()

  assert.deepEqual(await seedBlinkAnimationFixture(), { visible: true, opacity: 0.9, x: 220, y: 150, rotation: 0, scaleX: 1, scaleY: 1 }, 'blink fixture starts from stable persisted visual state')
  await page.reload({ waitUntil: 'networkidle' }); await page.getByText('Component Editor', { exact: true }).waitFor()
  await layerRow('Blink Animation Smoke Lamp').click(); await page.getByRole('button', { name: '动画' }).click()
  await page.getByRole('button', { name: '+ 添加 Blink 动画' }).click()
  assert.equal(await page.locator('.component-animation-item').count(), 1, 'blink animation added through real inspector')
  await page.getByLabel('animation1 周期').fill('500')
  await page.getByLabel('animation1 延迟').fill('20')
  assert.equal(await page.getByRole('combobox', { name: 'animation1 缓动' }).isDisabled(), true, 'Blink exposes stepped timing by disabling irrelevant easing authoring')
  await chooseSelectOption('animation1 激活方式', 'Property 条件')
  await page.locator('.component-animation-item .ui-checkbox').nth(1).click()

  await saveAndWait(page)
  const authored = await readPersistedBlinkState()
  assert.equal(authored.x, 220); assert.equal(authored.y, 150); assert.equal(authored.rotation, 0)
  assert.equal(authored.scaleX, 1); assert.equal(authored.scaleY, 1); assert.equal(authored.opacity, 0.9); assert.equal(authored.visible, true)
  assert.equal(authored.blink?.kind, 'blink'); assert.equal(authored.blink?.timing?.durationMs, 500); assert.equal(authored.blink?.timing?.delayMs, 20)
  assert.equal(authored.blink?.timing?.iterations, 'infinite'); assert.equal(authored.blink?.timing?.direction, 'normal'); assert.equal(authored.blink?.timing?.easing, 'linear')
  assert.equal(authored.blink?.activation?.kind, 'property'); assert.equal(authored.blink?.activation?.propertyKey, 'alarm'); assert.equal(authored.blink?.activation?.compareValue, true)

  await page.reload({ waitUntil: 'networkidle' }); await page.getByText('Component Editor', { exact: true }).waitFor(); await root.click()
  const designFrames = await sampleCanvasFrames(3, 180)
  assert.equal(new Set(designFrames).size, 1, 'design mode must remain static with authored blink')
  await page.getByRole('button', { name: '预览' }).click(); await page.waitForTimeout(100)
  const inactiveFrames = await sampleCanvasFrames(4, 180)
  assert.equal(new Set(inactiveFrames).size, 1, 'property=false must keep authored blink inactive')
  await page.locator('.component-preview-values .ui-checkbox').click(); await page.waitForTimeout(80)
  const activeFrames = await sampleCanvasFrames(5, 160)
  assert.ok(new Set(activeFrames).size > 1, 'property=true must visibly alternate the authored Blink visibility gate')
  const persistedAfterPreview = await readPersistedBlinkState()
  assert.equal(persistedAfterPreview.x, 220); assert.equal(persistedAfterPreview.y, 150); assert.equal(persistedAfterPreview.rotation, 0)
  assert.equal(persistedAfterPreview.scaleX, 1); assert.equal(persistedAfterPreview.scaleY, 1); assert.equal(persistedAfterPreview.opacity, 0.9); assert.equal(persistedAfterPreview.visible, true)
  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages blink animation smoke passed: blink remains persisted through IndexedDB and preview-only visibility gates.')
  console.log(`Persisted blink test component URL: ${savedUrl}`)
} finally { await browser.close() }
