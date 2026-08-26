import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []

page.on('pageerror', (error) => pageErrors.push(error.message))

function assertClose(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 0.001,
    `${message}: expected ${expected}, received ${actual}`,
  )
}

async function saveScene() {
  await page.getByRole('button', { name: '保存', exact: true }).click()
}

async function readStoredScene() {
  return page.evaluate(() => {
    const segments = window.location.hash
      .replace(/^#\/?/, '')
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
    const workId = segments[0] === 'scada' ? segments[1] : null

    if (!workId) {
      throw new Error(`SCADA work id missing from ${window.location.hash}`)
    }

    const key = `scada-editor-lab.work.${workId}.scene.v4`
    const raw = window.localStorage.getItem(key)

    if (!raw) {
      throw new Error(`Stored scene missing at ${key}`)
    }

    return JSON.parse(raw)
  })
}

async function seedGeometry() {
  await page.evaluate(() => {
    const segments = window.location.hash
      .replace(/^#\/?/, '')
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment))
    const workId = segments[0] === 'scada' ? segments[1] : null

    if (!workId) {
      throw new Error(`SCADA work id missing from ${window.location.hash}`)
    }

    const key = `scada-editor-lab.work.${workId}.scene.v4`
    const raw = window.localStorage.getItem(key)

    if (!raw) {
      throw new Error(`Stored scene missing at ${key}`)
    }

    const scene = JSON.parse(raw)
    const positions = [
      { x: 120, y: 120 },
      { x: 420, y: 240 },
      { x: 760, y: 360 },
    ]

    if (scene.nodes.length !== positions.length) {
      throw new Error(`Expected ${positions.length} nodes, received ${scene.nodes.length}`)
    }

    scene.nodes.forEach((node, index) => {
      node.parentId = null
      node.transform = {
        ...node.transform,
        ...positions[index],
        rotation: 0,
      }
    })

    window.localStorage.setItem(key, JSON.stringify(scene))
  })
}

function viewportTransform(width, height) {
  const sceneWidth = 1280
  const sceneHeight = 720
  const padding = 24
  const availableWidth = Math.max(1, width - padding * 2)
  const availableHeight = Math.max(1, height - padding * 2)
  const scale = Math.min(
    availableWidth / sceneWidth,
    availableHeight / sceneHeight,
  )

  return {
    x: width / 2 - (sceneWidth / 2) * scale,
    y: height / 2 - (sceneHeight / 2) * scale,
    scale,
  }
}

async function marqueeSceneRect(left, top, right, bottom) {
  const stage = page.locator('.konva-host .konvajs-content').first()
  const box = await stage.boundingBox()
  assert.ok(box, 'SCADA Konva stage must be measurable')

  const transform = viewportTransform(box.width, box.height)
  const startX = box.x + transform.x + left * transform.scale
  const startY = box.y + transform.y + top * transform.scale
  const endX = box.x + transform.x + right * transform.scale
  const endY = box.y + transform.y + bottom * transform.scale

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(endX, endY, { steps: 8 })
  await page.mouse.up()
}

try {
  console.log(`Opening deployed SCADA workspace: ${baseUrl}#/works`)
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()

  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.getByText('SCADA Editor', { exact: true }).waitFor()

  const componentItem = page.locator('.component-item').first()
  assert.equal(await componentItem.count(), 1, 'SCADA component palette must contain a component')
  await componentItem.click()
  await componentItem.click()
  await saveScene()

  let storedScene = await readStoredScene()
  assert.equal(storedScene.nodes.length, 3, 'SCADA smoke requires three scene nodes')
  assert.equal(
    new Set(storedScene.nodes.map((node) => node.type)).size,
    1,
    'SCADA smoke uses equal-size nodes from one component type',
  )

  await seedGeometry()
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('SCADA Editor', { exact: true }).waitFor()

  // Select all three root nodes through the real canvas interaction path. Use
  // nearly the full fixed artboard so the smoke does not depend on the current
  // built-in component dimensions. SCADA does not render a textual
  // multi-selection count; command enablement is the public editor state that
  // proves the marquee produced the required 3-node selection (Align needs 2+,
  // Distribute needs 3+).
  await marqueeSceneRect(40, 40, 1240, 680)
  assert.equal(
    await page.getByRole('button', { name: '左对齐' }).isEnabled(),
    true,
    'SCADA marquee must enable 2+ node alignment',
  )
  assert.equal(
    await page.getByRole('button', { name: '水平等距分布' }).isEnabled(),
    true,
    'SCADA marquee must enable 3+ node distribution',
  )

  await page.getByRole('button', { name: '左对齐' }).click()
  await saveScene()
  storedScene = await readStoredScene()
  assert.equal(storedScene.nodes.length, 3)
  for (const node of storedScene.nodes) {
    assertClose(node.transform.x, 120, `left align ${node.id} x`)
  }

  // Undo restores the deliberately uneven seed geometry while preserving the
  // multi-selection, then exercise the shared distribution command through the
  // SCADA wrapper.
  await page.getByRole('button', { name: '撤销' }).click()
  await page.getByRole('button', { name: '水平等距分布' }).click()
  await saveScene()
  storedScene = await readStoredScene()

  const sorted = [...storedScene.nodes].sort(
    (left, right) => left.transform.x - right.transform.x,
  )
  const firstGap = sorted[1].transform.x - sorted[0].transform.x
  const secondGap = sorted[2].transform.x - sorted[1].transform.x
  assertClose(firstGap, secondGap, 'horizontal distribution produces equal x spacing')

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages SCADA geometry smoke passed: canvas multi-select, align and distribute use the shared geometry command path.')
} finally {
  await browser.close()
}
