import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readPersistedComponent, saveAndWait } from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const button = (name) => page.getByRole('button', { name, exact: true })
const rows = page.locator('.component-layer-row')

async function dragToArtboard(source, x = 0.58, y = 0.52) {
  const box = await page.locator('.component-artboard').boundingBox()
  assert.ok(box)
  // Native pointer-driven drag exercises dragstart, dragover and drop together.
  await source.dragTo(page.locator('.component-artboard'), {
    targetPosition: { x: box.width * x, y: box.height * y },
  })
}

async function expectLayerCount(count) {
  await page.waitForFunction((expected) => document.querySelectorAll('.component-layer-row').length === expected, count)
  assert.equal(await rows.count(), count)
}

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  const palette = page.getByRole('region', { name: '组件创作素材' })
  await button('上传资源').waitFor()
  // The first save navigates from /new to a persisted document and remounts its
  // history. Establish that identity before exercising drop undo/redo.
  await saveAndWait(page)
  const source = (name) => palette.getByRole('button', { name, exact: true })
  for (const [index, name] of ['矩形', '圆/椭圆', '线段', '文本'].entries()) {
    console.log(`Dragging ${name}`)
    await dragToArtboard(source(name))
    await expectLayerCount(index + 1)
  }
  await saveAndWait(page)
  let document = (await readPersistedComponent(page)).document
  assert.deepEqual(document.visual.layers.map((layer) => layer.kind), ['vector', 'vector', 'vector', 'text'])
  const text = document.visual.layers.at(-1)
  assert.ok(Math.abs(text.transform.x + text.transform.width / 2 - document.visual.designSize.width * 0.58) < 2)
  assert.ok(Math.abs(text.transform.y + text.transform.height / 2 - document.visual.designSize.height * 0.52) < 2)
  await button('撤销').click()
  await expectLayerCount(3)
  await button('重做').click()
  await expectLayerCount(4)

  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 60
    canvas.height = 40
    const context = canvas.getContext('2d')
    context.fillStyle = '#137766'
    context.fillRect(0, 0, 60, 40)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.locator('.component-palette-resource-input').setInputFiles([
    { name: 'drop-vector.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#137766"/></svg>') },
    { name: 'drop-image.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') },
  ])
  await page.getByText('已保存 2 个资源 · 共 2 个', { exact: true }).waitFor()
  for (const [index, name] of ['drop-vector', 'drop-image'].entries()) {
    const resource = page.locator('.component-palette-resource-item').filter({ hasText: name })
    await dragToArtboard(resource, 0.7, 0.68)
    await expectLayerCount(5 + index)
  }
  await saveAndWait(page)
  document = (await readPersistedComponent(page)).document
  assert.deepEqual(document.visual.layers.slice(-2).map((layer) => layer.kind), ['svg', 'image'])
  await page.reload({ waitUntil: 'networkidle' })
  await expectLayerCount(6)
  await dragToArtboard(source('矩形'), 0.3, 0.3)
  await expectLayerCount(7)
  await button('预览').click()
  assert.equal(await source('矩形').isDisabled(), true)
  await dragToArtboard(source('矩形'))
  await expectLayerCount(7)
  assert.deepEqual(errors, [])
  console.log('Palette drop smoke passed: native primitive/text/SVG/image dragging, drop coordinates, undo/redo, reload reattachment and preview lock.')
} catch (error) {
  await page.screenshot({ path: '/tmp/scada-palette-drop-failure.png' }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
