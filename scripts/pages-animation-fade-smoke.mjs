import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const componentUrl = `${baseUrl}#/components/new`
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []

page.on('pageerror', (error) => pageErrors.push(error.message))

function layerRow(name) {
  return page.locator('.component-layer-row', { hasText: name }).first()
}

async function chooseSelectOption(ariaLabel, optionName) {
  await page.getByRole('combobox', { name: ariaLabel }).click()
  await page.getByRole('option', { name: optionName, exact: true }).click()
}

async function readSceneCanvasDataUrl() {
  const canvas = page.locator('.konvajs-content canvas').first()
  await canvas.waitFor()
  return canvas.evaluate((element) => element.toDataURL())
}

async function seedFadeAnimationFixture() {
  return page.evaluate(() => {
    const componentId = decodeURIComponent(
      window.location.hash.replace(/^#\/components\//, '').split('/')[0],
    )
    if (!componentId || componentId === 'new') {
      throw new Error(`Persisted component id missing from ${window.location.hash}`)
    }

    const key = 'scada-editor-lab.components.v2'
    const raw = window.localStorage.getItem(key)
    const entries = raw ? JSON.parse(raw) : []
    const entry = entries.find((candidate) => candidate.id === componentId)
    if (!entry) throw new Error(`Persisted component ${componentId} missing`)

    entry.definition.properties = {
      ...entry.definition.properties,
      running: {
        title: 'Running',
        kind: 'boolean',
        defaultValue: false,
        bindable: true,
      },
    }

    entry.visual.layers = entry.visual.layers.filter(
      (layer) => layer.id !== 'fade-animation-smoke-layer',
    )
    entry.visual.animations = (entry.visual.animations ?? []).filter(
      (animation) => animation.layerId !== 'fade-animation-smoke-layer',
    )
    entry.visual.layers.push({
      id: 'fade-animation-smoke-layer',
      name: 'Fade Animation Smoke Rect',
      kind: 'vector',
      parentId: null,
      transform: {
        x: 220,
        y: 150,
        width: 110,
        height: 36,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 0.8,
      primitive: 'rect',
      style: {
        fill: '#0891b2',
        stroke: '#164e63',
        strokeWidth: 2,
      },
    })

    window.localStorage.setItem(key, JSON.stringify(entries))
    return { opacity: 0.8, x: 220, y: 150, rotation: 0, scaleX: 1, scaleY: 1 }
  })
}

async function readPersistedFadeState() {
  return page.evaluate(() => {
    const componentId = decodeURIComponent(
      window.location.hash.replace(/^#\/components\//, '').split('/')[0],
    )
    const raw = window.localStorage.getItem('scada-editor-lab.components.v2')
    const entries = raw ? JSON.parse(raw) : []
    const entry = entries.find((candidate) => candidate.id === componentId)
    const layer = entry?.visual?.layers?.find(
      (candidate) => candidate.id === 'fade-animation-smoke-layer',
    )
    const fade = entry?.visual?.animations?.find(
      (candidate) => candidate.layerId === 'fade-animation-smoke-layer' && candidate.kind === 'fade',
    )

    return {
      x: layer?.transform?.x ?? null,
      y: layer?.transform?.y ?? null,
      rotation: layer?.transform?.rotation ?? null,
      scaleX: layer?.transform?.scaleX ?? null,
      scaleY: layer?.transform?.scaleY ?? null,
      opacity: layer?.opacity ?? null,
      fade: fade ?? null,
    }
  })
}

try {
  console.log(`Opening deployed Component Editor fade animation smoke: ${componentUrl}`)
  await page.goto(componentUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const root = page.locator('.component-layer-root')
  await root.click()
  await page.getByRole('button', { name: '添加图层' }).click()
  await layerRow('Group 1').waitFor()
  await page.getByRole('button', { name: '保存' }).click()
  await page.waitForFunction(() => window.location.hash !== '#/components/new')
  const savedUrl = page.url()

  assert.deepEqual(
    await seedFadeAnimationFixture(),
    { opacity: 0.8, x: 220, y: 150, rotation: 0, scaleX: 1, scaleY: 1 },
    'fade fixture starts from stable persisted visual state',
  )

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await layerRow('Fade Animation Smoke Rect').click()
  await page.getByRole('button', { name: '动画' }).click()
  await page.getByRole('button', { name: '+ 添加 Fade 动画' }).click()
  assert.equal(
    await page.locator('.component-animation-item').count(),
    1,
    'fade animation added through real inspector',
  )

  await page.getByLabel('animation1 透明倍率').fill('0.1')
  await page.getByLabel('animation1 周期').fill('800')
  await page.getByLabel('animation1 延迟').fill('20')
  await chooseSelectOption('animation1 方向', '交替')
  await chooseSelectOption('animation1 缓动', '缓入缓出')
  await chooseSelectOption('animation1 激活方式', 'Property 条件')
  await page.locator('.component-animation-item .ui-checkbox').nth(1).click()

  await page.getByRole('button', { name: '保存' }).click()
  const authored = await readPersistedFadeState()
  assert.equal(authored.x, 220, 'fade authoring must not mutate base x')
  assert.equal(authored.y, 150, 'fade authoring must not mutate base y')
  assert.equal(authored.rotation, 0, 'fade authoring must not mutate base rotation')
  assert.equal(authored.scaleX, 1, 'fade authoring must not mutate base scaleX')
  assert.equal(authored.scaleY, 1, 'fade authoring must not mutate base scaleY')
  assert.equal(authored.opacity, 0.8, 'fade authoring must not mutate base opacity')
  assert.equal(authored.fade?.kind, 'fade', 'inspector persists fade kind')
  assert.equal(authored.fade?.opacityMultiplier, 0.1, 'inspector persists fade opacity multiplier')
  assert.equal(authored.fade?.timing?.durationMs, 800, 'inspector persists fade duration')
  assert.equal(authored.fade?.timing?.delayMs, 20, 'inspector persists fade delay')
  assert.equal(authored.fade?.timing?.iterations, 'infinite', 'fade keeps infinite iterations')
  assert.equal(authored.fade?.timing?.direction, 'alternate', 'inspector persists fade direction')
  assert.equal(authored.fade?.timing?.easing, 'ease-in-out', 'inspector persists fade easing')
  assert.equal(authored.fade?.activation?.kind, 'property', 'inspector persists fade property activation')
  assert.equal(authored.fade?.activation?.propertyKey, 'running', 'fade targets public property')
  assert.equal(authored.fade?.activation?.compareValue, true, 'fade persists property compare value')

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await root.click()

  const designFrameA = await readSceneCanvasDataUrl()
  await page.waitForTimeout(250)
  const designFrameB = await readSceneCanvasDataUrl()
  assert.equal(designFrameA, designFrameB, 'design mode must remain static with authored fade')

  await page.getByRole('button', { name: '预览' }).click()
  await page.waitForTimeout(120)
  const inactiveFrameA = await readSceneCanvasDataUrl()
  await page.waitForTimeout(260)
  const inactiveFrameB = await readSceneCanvasDataUrl()
  assert.equal(inactiveFrameA, inactiveFrameB, 'property=false must keep authored fade inactive')

  await page.locator('.component-preview-values .ui-checkbox').click()
  await page.waitForTimeout(120)
  const activeFrameA = await readSceneCanvasDataUrl()
  await page.waitForTimeout(300)
  const activeFrameB = await readSceneCanvasDataUrl()
  assert.notEqual(activeFrameA, activeFrameB, 'property=true must visibly activate authored fade')

  const persistedAfterPreview = await readPersistedFadeState()
  assert.equal(persistedAfterPreview.x, 220, 'fade preview frames must not persist x')
  assert.equal(persistedAfterPreview.y, 150, 'fade preview frames must not persist y')
  assert.equal(persistedAfterPreview.rotation, 0, 'fade preview frames must not persist rotation')
  assert.equal(persistedAfterPreview.scaleX, 1, 'fade preview frames must not persist scaleX')
  assert.equal(persistedAfterPreview.scaleY, 1, 'fade preview frames must not persist scaleY')
  assert.equal(persistedAfterPreview.opacity, 0.8, 'fade preview frames must not persist opacity')

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages fade animation smoke passed: fade is authored, persisted, property-gated and previewed through transient multiplicative opacity overlays without visual-state mutation.')
  console.log(`Persisted fade test component URL: ${savedUrl}`)
} finally {
  await browser.close()
}
