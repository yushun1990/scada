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

async function seedGroupedGeometry() {
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
      { x: 360, y: 220 },
      { x: 560, y: 320 },
      { x: 820, y: 400 },
    ]

    if (scene.nodes.length !== positions.length) {
      throw new Error(`Expected ${positions.length} nodes, received ${scene.nodes.length}`)
    }

    const groupId = 'smoke-geometry-group'
    const children = scene.nodes.map((node, index) => ({
      ...node,
      parentId: groupId,
      transform: {
        ...node.transform,
        ...positions[index],
        rotation: 0,
      },
    }))
    const group = {
      id: groupId,
      type: 'core.group',
      name: 'Smoke geometry group',
      parentId: null,
      visible: true,
      locked: false,
      transform: {
        x: 0,
        y: 0,
        width: scene.width,
        height: scene.height,
        rotation: 0,
      },
      props: {
        designWidth: scene.width,
        designHeight: scene.height,
      },
      bindings: [],
      behaviors: [],
    }

    // The geometry regression needs a stable three-node selection, not a
    // second test of viewport/marquee behavior. Load one valid group as the
    // fixture; the editor's real Ungroup command then produces the normal
    // multi-selection through its public UI path.
    scene.nodes = [group, ...children]
    window.localStorage.setItem(key, JSON.stringify(scene))
  })
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

  await seedGroupedGeometry()
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('SCADA Editor', { exact: true }).waitFor()

  // The loaded group is the sole root and therefore the initial selection.
  // Ungroup is a stable public UI path that intentionally selects every child,
  // giving this regression the three-node state required by Align/Distribute
  // without coupling it to separate marquee/viewport behavior.
  const ungroupButton = page.getByRole('button', { name: '拆分组合' })
  assert.equal(
    await ungroupButton.isEnabled(),
    true,
    'SCADA grouped fixture must enable ungroup',
  )
  await ungroupButton.click()

  assert.equal(
    await page.getByRole('button', { name: '左对齐' }).isEnabled(),
    true,
    'SCADA ungroup selection must enable 2+ node alignment',
  )
  assert.equal(
    await page.getByRole('button', { name: '水平等距分布' }).isEnabled(),
    true,
    'SCADA ungroup selection must enable 3+ node distribution',
  )

  await page.getByRole('button', { name: '左对齐' }).click()
  await saveScene()
  storedScene = await readStoredScene()
  assert.equal(storedScene.nodes.length, 3)
  for (const node of storedScene.nodes) {
    assertClose(node.transform.x, 360, `left align ${node.id} x`)
  }

  // Undo restores the deliberately uneven ungrouped geometry while preserving
  // the three-node selection, then exercise the shared distribution command
  // through the SCADA wrapper.
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
  console.log('Pages SCADA geometry smoke passed: real ungroup selection, align and distribute use the shared geometry command path.')
} finally {
  await browser.close()
}
