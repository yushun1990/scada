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

async function seedMoveAnimationFixture() {
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
      (layer) => layer.id !== 'move-animation-smoke-layer',
    )
    entry.visual.animations = (entry.visual.animations ?? []).filter(
      (animation) => animation.layerId !== 'move-animation-smoke-layer',
    )
    entry.visual.layers.push({
      id: 'move-animation-smoke-layer',
      name: 'Move Animation Smoke Rect',
      kind: 'vector',
      parentId: null,
      transform: {
        x: 160,
        y: 120,
        width: 100,
        height: 30,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      visible: true,
      opacity: 1,
      primitive: 'rect',
      style: {
        fill: '#0f766e',
        stroke: '#134e4a',
        strokeWidth: 2,
      },
    })

    window.localStorage.setItem(key, JSON.stringify(entries))
    return { x: 160, y: 120, rotation: 0 }
  })
}

async function readPersistedMoveState() {
  return page.evaluate(() => {
    const componentId = decodeURIComponent(
      window.location.hash.replace(/^#\/components\//, '').split('/')[0],
    )
    const raw = window.localStorage.getItem('scada-editor-lab.components.v2')
    const entries = raw ? JSON.parse(raw) : []
    const entry = entries.find((candidate) => candidate.id === componentId)
    const layer = entry?.visual?.layers?.find(
      (candidate) => candidate.id === 'move-animation-smoke-layer',
    )
    const move = entry?.visual?.animations?.find(
      (candidate) => candidate.layerId === 'move-animation-smoke-layer' && candidate.kind === 'move',
    )

    return {
      x: layer?.transform?.x ?? null,
      y: layer?.transform?.y ?? null,
      rotation: layer?.transform?.rotation ?? null,
      move: move ?? null,
    }
  })
}

try {
  console.log(`Opening deployed Component Editor move animation smoke: ${componentUrl}`)
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
    await seedMoveAnimationFixture(),
    { x: 160, y: 120, rotation: 0 },
    'move fixture starts from stable persisted geometry',
  )

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await layerRow('Move Animation Smoke Rect').click()
  await page.getByRole('button', { name: '动画' }).click()
  await page.getByRole('button', { name: '+ 添加 Move 动画' }).click()
  assert.equal(
    await page.locator('.component-animation-item').count(),
    1,
    'move animation added through real inspector',
  )

  await page.getByLabel('animation1 每轮 X 位移').fill('120')
  await page.getByLabel('animation1 每轮 Y 位移').fill('40')
  await page.getByLabel('animation1 周期').fill('900')
  await page.getByLabel('animation1 延迟').fill('30')
  await chooseSelectOption('animation1 方向', '交替')
  await chooseSelectOption('animation1 缓动', '缓入缓出')
  await chooseSelectOption('animation1 激活方式', 'Property 条件')
  await page.locator('.component-animation-item .ui-checkbox').nth(1).click()

  await page.getByRole('button', { name: '保存' }).click()
  const authored = await readPersistedMoveState()
  assert.equal(authored.x, 160, 'move authoring must not mutate base x')
  assert.equal(authored.y, 120, 'move authoring must not mutate base y')
  assert.equal(authored.rotation, 0, 'move authoring must not mutate base rotation')
  assert.equal(authored.move?.kind, 'move', 'inspector persists move kind')
  assert.equal(authored.move?.deltaXPerIteration, 120, 'inspector persists move x delta')
  assert.equal(authored.move?.deltaYPerIteration, 40, 'inspector persists move y delta')
  assert.equal(authored.move?.timing?.durationMs, 900, 'inspector persists move duration')
  assert.equal(authored.move?.timing?.delayMs, 30, 'inspector persists move delay')
  assert.equal(authored.move?.timing?.iterations, 'infinite', 'move keeps infinite iterations')
  assert.equal(authored.move?.timing?.direction, 'alternate', 'inspector persists move direction')
  assert.equal(authored.move?.timing?.easing, 'ease-in-out', 'inspector persists move easing')
  assert.equal(authored.move?.activation?.kind, 'property', 'inspector persists move property activation')
  assert.equal(authored.move?.activation?.propertyKey, 'running', 'move targets public property')
  assert.equal(authored.move?.activation?.compareValue, true, 'move persists property compare value')

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await root.click()

  const designFrameA = await readSceneCanvasDataUrl()
  await page.waitForTimeout(250)
  const designFrameB = await readSceneCanvasDataUrl()
  assert.equal(designFrameA, designFrameB, 'design mode must remain static with authored move')

  await page.getByRole('button', { name: '预览' }).click()
  await page.waitForTimeout(120)
  const inactiveFrameA = await readSceneCanvasDataUrl()
  await page.waitForTimeout(260)
  const inactiveFrameB = await readSceneCanvasDataUrl()
  assert.equal(inactiveFrameA, inactiveFrameB, 'property=false must keep authored move inactive')

  await page.locator('.component-preview-values .ui-checkbox').click()
  await page.waitForTimeout(120)
  const activeFrameA = await readSceneCanvasDataUrl()
  await page.waitForTimeout(300)
  const activeFrameB = await readSceneCanvasDataUrl()
  assert.notEqual(activeFrameA, activeFrameB, 'property=true must visibly activate authored move')

  const persistedAfterPreview = await readPersistedMoveState()
  assert.equal(persistedAfterPreview.x, 160, 'move preview frames must not persist x')
  assert.equal(persistedAfterPreview.y, 120, 'move preview frames must not persist y')
  assert.equal(persistedAfterPreview.rotation, 0, 'move preview must not disturb rotation')

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages move animation smoke passed: move is authored, persisted, property-gated and previewed through transient x/y overlays without geometry mutation.')
  console.log(`Persisted move test component URL: ${savedUrl}`)
} finally {
  await browser.close()
}
