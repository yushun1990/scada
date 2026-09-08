import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readPersistedComponent, saveAndWait } from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const button = (name) => page.getByRole('button', { name, exact: true })

function vectorLayers(document) {
  return document.visual.layers.filter((layer) => layer.kind === 'vector')
}

async function artboardBox() {
  const artboard = page.locator('.component-artboard')
  await artboard.waitFor()
  const box = await artboard.boundingBox()
  assert.ok(box, 'component artboard must be measurable')
  return box
}

async function dragRelative(startX, startY, endX, endY, withShift = false) {
  const box = await artboardBox()
  const start = { x: box.x + box.width * startX, y: box.y + box.height * startY }
  const end = { x: box.x + box.width * endX, y: box.y + box.height * endY }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  if (withShift) await page.keyboard.down('Shift')
  await page.mouse.move(end.x, end.y, { steps: 5 })
  await page.mouse.up()
  if (withShift) await page.keyboard.up('Shift')
}

try {
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'load' })
  await button('圆/椭圆').waitFor()

  // A click keeps the single tool's default geometry circular.
  await button('圆/椭圆').click()
  const box = await artboardBox()
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2)
  await saveAndWait(page)
  let persisted = (await readPersistedComponent(page)).document
  let vectors = vectorLayers(persisted)
  assert.equal(vectors.length, 1)
  assert.equal(vectors[0].primitive, 'ellipse', 'new circle/ellipse authoring should persist one ellipse primitive')
  assert.equal(vectors[0].transform.width, vectors[0].transform.height, 'click default should create a circle')

  // Free dragging creates an ellipse with independent width and height.
  await button('圆/椭圆').click()
  await dragRelative(0.25, 0.25, 0.65, 0.42)
  await saveAndWait(page)
  persisted = (await readPersistedComponent(page)).document
  vectors = vectorLayers(persisted)
  assert.equal(vectors.length, 2)
  const ellipse = vectors[1]
  assert.equal(ellipse.primitive, 'ellipse')
  assert.notEqual(ellipse.transform.width, ellipse.transform.height, 'free drag must allow ellipse geometry')

  // Shift may be pressed after the drag starts; the next pointer move must
  // immediately constrain the same ellipse tool to a 1:1 circle.
  await button('圆/椭圆').click()
  const shiftBox = await artboardBox()
  const start = { x: shiftBox.x + shiftBox.width * 0.3, y: shiftBox.y + shiftBox.height * 0.55 }
  const mid = { x: shiftBox.x + shiftBox.width * 0.48, y: shiftBox.y + shiftBox.height * 0.67 }
  const end = { x: shiftBox.x + shiftBox.width * 0.72, y: shiftBox.y + shiftBox.height * 0.74 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(mid.x, mid.y, { steps: 3 })
  await page.keyboard.down('Shift')
  await page.mouse.move(end.x, end.y, { steps: 4 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await saveAndWait(page)
  persisted = (await readPersistedComponent(page)).document
  vectors = vectorLayers(persisted)
  assert.equal(vectors.length, 3)
  const circle = vectors[2]
  assert.equal(circle.primitive, 'ellipse')
  assert.equal(circle.transform.width, circle.transform.height, 'Shift drag must constrain ellipse geometry to a circle')

  assert.deepEqual(errors, [])
  console.log('Component primitive browser smoke passed: unified ellipse authoring, free ellipse drag, and live Shift circle constraint.')
} finally {
  await browser.close()
}
