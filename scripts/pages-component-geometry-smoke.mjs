import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readPersistedComponent, saveAndWait, writePersistedComponent } from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const button = (name) => page.getByRole('button', { name, exact: true })
const readLine = async () => (await readPersistedComponent(page)).document.visual.layers[0]

try {
  await page.goto(baseUrl + '#/components/new', { waitUntil: 'networkidle' })
  const saved = await saveAndWait(page)
  const layer = (id, primitive, x, y, width, height, extra = {}) => ({
    id, name: id, kind: 'vector', primitive, parentId: null, visible: true, opacity: 1,
    transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 }, ...extra,
  })
  await writePersistedComponent(page, {
    ...saved.document,
    visual: { ...saved.document.visual, layers: [
      layer('geometry-line', 'line', 80, 96, 120, 8, { style: { fill: 'transparent', stroke: '#137766', strokeWidth: 2 } }),
      layer('concave', 'rect', 300, 40, 100, 60, { style: { fill: '#dc2626', stroke: '#dc2626', strokeWidth: 0, cornerRadius: -15 } }),
      layer('scale', 'scale', 350, 160, 30, 120, { showLabels: true, tickLength: 10, subTickLength: 5, style: { fill: 'transparent', stroke: '#7c3aed', strokeWidth: 2 } }),
    ] },
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.component-layer-row').filter({ hasText: 'geometry-line' }).click()
  if (await button('吸附').getAttribute('aria-pressed') === 'true') await button('吸附').click()
  const box = await page.locator('.component-artboard .konvajs-content').boundingBox()
  assert.ok(box)
  const scale = box.width / saved.document.visual.designSize.width
  const point = (x, y) => ({ x: box.x + x * scale, y: box.y + y * scale })
  const drag = async (from, to) => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
  }
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1, 'Expected ' + expected + ', got ' + actual)

  const before = await readLine()
  await drag(point(200, 100), point(240, 100))
  await saveAndWait(page)
  const extended = await readLine()
  near(extended.transform.x, 80)
  near(extended.transform.y, 96)
  near(extended.transform.width, 160)
  near(extended.transform.rotation, 0)
  await button('撤销').click()
  await saveAndWait(page)
  assert.deepEqual((await readLine()).transform, before.transform, 'one undo reverses the whole endpoint gesture')
  await button('重做').click()
  await saveAndWait(page)
  assert.deepEqual((await readLine()).transform, extended.transform)

  await drag(point(80, 100), point(100, 100))
  await saveAndWait(page)
  near((await readLine()).transform.x, 100)
  near((await readLine()).transform.width, 140)
  // Thickness handles have a fixed minimum screen distance of 14px.
  await drag(point(170, 100 + 14 / scale), point(170, 110))
  await saveAndWait(page)
  const thickened = await readLine()
  // Pointer coordinates are quantized to browser pixels. Exact arithmetic is
  // covered by the model test; here verify the same centerline survives.
  assert.ok(Math.abs(thickened.style.strokeWidth - 20) <= 2 / scale)
  assert.equal(thickened.transform.height, thickened.style.strokeWidth * 2)
  near(thickened.transform.y + thickened.transform.height / 2, 100)
  near(thickened.transform.width, 140)

  await page.mouse.dblclick(point(170, 100).x, point(170, 100).y)
  await saveAndWait(page)
  assert.equal((await readLine()).points.length, 6, 'double click inserts a production-projected vertex')
  await drag(point(170, 100), point(170, 130))
  await saveAndWait(page)
  const bent = await readLine()
  near(bent.points[2], 70)
  near(bent.points[3], 30)
  await button('撤销').click()
  await saveAndWait(page)
  near((await readLine()).points[3], 0)
  await button('重做').click()
  await saveAndWait(page)
  assert.deepEqual((await readLine()).points, bent.points)
  await page.mouse.dblclick(point(170, 130).x, point(170, 130).y)
  await saveAndWait(page)
  assert.equal((await readLine()).points, undefined)
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal((await readLine()).points, undefined, 'two-endpoint conversion survives reload')

  const pixels = await page.locator('.component-artboard canvas').first().evaluate((canvas) => {
    const ctx = canvas.getContext('2d')
    const pixel = (x, y) => Array.from(ctx.getImageData(Math.round(x * canvas.width / 480), Math.round(y * canvas.height / 360), 1, 1).data).slice(0, 3)
    return { rect: pixel(350, 70), cutout: pixel(302, 42), tick: pixel(355, 184) }
  })
  assert.deepEqual(pixels.rect, [220, 38, 38], 'concave rectangle is drawn')
  assert.notDeepEqual(pixels.cutout, pixels.rect, 'inverted corner retains its cutout')
  assert.deepEqual(pixels.tick, [124, 58, 237], 'scale ticks are drawn by the production helper')
  assert.deepEqual(errors, [])
  console.log('Component geometry smoke passed: endpoints, thickness, polyline insertion/move/removal, single-command undo/redo, reload and concave/scale pixels.')
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(0, 2400))
  console.error(errors)
  throw error
} finally {
  await browser.close()
}
