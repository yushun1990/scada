import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []
const SELF_CONTAINED_SVG_DATA_URL =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22480%22%20height%3D%22360%22%3E%3Crect%20width%3D%22480%22%20height%3D%22360%22%20fill%3D%22%23ff00ff%22%2F%3E%3C%2Fsvg%3E'
const AUTHORED_OPEN_COLOR = '#7c3aed'

page.on('pageerror', (error) => pageErrors.push(error.message))

async function localDatabaseNames() {
  return page.evaluate(async () => {
    if (!('databases' in window.indexedDB)) return []
    return (await window.indexedDB.databases())
      .map((database) => database.name)
      .filter(Boolean)
  })
}

async function canvasHasColor(matches) {
  return page.waitForFunction((matcher) => {
    const canvases = [...document.querySelectorAll('.standalone-runtime-canvas canvas')]
    return canvases.some((canvas) => {
      const context = canvas.getContext('2d')
      if (!context || canvas.width <= 0 || canvas.height <= 0) return false
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let index = 0; index < pixels.length; index += 4 * 8) {
        const red = pixels[index]
        const green = pixels[index + 1]
        const blue = pixels[index + 2]
        const alpha = pixels[index + 3]
        if (
          alpha > matcher.alphaMin &&
          red >= matcher.redMin && red <= matcher.redMax &&
          green >= matcher.greenMin && green <= matcher.greenMax &&
          blue >= matcher.blueMin && blue <= matcher.blueMax
        ) return true
      }
      return false
    })
  }, matches)
}

try {
  console.log(`Opening standalone runtime in a fresh browser: ${baseUrl}#/runtime`)
  await page.goto(`${baseUrl}#/runtime`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA Runtime', { exact: true }).waitFor()
  await page.getByText('独立只读运行器', { exact: true }).waitFor()
  await page.getByText('加载 dependency-complete SCADA 作品包', { exact: true }).waitFor()

  assert.equal(await page.locator('.workspace-shell').count(), 0)
  assert.equal(await page.locator('.editor-shell').count(), 0)
  assert.equal(await page.getByRole('button', { name: '保存', exact: true }).count(), 0)
  assert.equal((await localDatabaseNames()).includes('scada-editor-lab'), false)

  const packageResponse = await page.request.get(
    `${baseUrl}component-packages/process-valve.scada-component.json`,
  )
  assert.equal(packageResponse.ok(), true, 'portable dependency fixture is deployed')
  const dependency = await packageResponse.json()
  assert.equal(dependency.packageVersion, 2)
  assert.equal(dependency.definition.attributes.openColor.defaultValue, '#22c55e')
  dependency.visual = {
    ...dependency.visual,
    layers: [
      ...dependency.visual.layers,
      {
        id: 'standalone-portable-asset-smoke',
        name: 'Standalone portable asset smoke',
        kind: 'image',
        parentId: null,
        transform: { x: 0, y: 0, width: 24, height: 24, rotation: 0, scaleX: 1, scaleY: 1 },
        visible: true,
        opacity: 1,
        assetRef: SELF_CONTAINED_SVG_DATA_URL,
        style: { fit: 'stretch' },
      },
    ],
  }

  const workPackage = {
    packageVersion: 1,
    scene: {
      version: 8,
      id: 'standalone-pages-smoke-scene',
      name: 'Standalone Pages Smoke',
      width: 640,
      height: 360,
      background: '#dbe4ee',
      nodes: [
        {
          id: 'valve-node',
          name: 'Portable valve',
          type: 'starter.process-valve',
          parentId: null,
          visible: true,
          locked: false,
          transform: { x: 260, y: 140, width: 120, height: 80, rotation: 0 },
          attributes: { openColor: AUTHORED_OPEN_COLOR },
          propertyFallbacks: { state: 'closed' },
          bindings: [],
          behaviors: [],
          scadaSemantics: {
            version: 1,
            valueBindings: [
              {
                id: 'value:standalone-open-state',
                targetProperty: 'state',
                expression: { kind: 'literal', value: 'open' },
              },
            ],
            behaviors: [],
            interactions: [],
          },
        },
      ],
      connections: [],
    },
    dependencies: [dependency],
  }

  await page.getByLabel('选择独立运行作品包文件', { exact: true }).setInputFiles({
    name: 'standalone-pages-smoke.scada-work.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(workPackage)),
  })

  await page.getByText('Standalone Pages Smoke', { exact: true }).waitFor()
  await page.getByText(/640 × 360 · 1 节点 · 1 可移植依赖/).waitFor()
  await page.locator('.standalone-runtime-canvas canvas').first().waitFor({ state: 'visible' })

  await canvasHasColor({
    alphaMin: 200,
    redMin: 220,
    redMax: 255,
    greenMin: 0,
    greenMax: 50,
    blueMin: 220,
    blueMax: 255,
  })
  await canvasHasColor({
    alphaMin: 200,
    redMin: 110,
    redMax: 140,
    greenMin: 40,
    greenMax: 80,
    blueMin: 220,
    blueMax: 255,
  })

  assert.equal(await page.locator('.workspace-shell').count(), 0)
  assert.equal(await page.locator('.editor-shell').count(), 0)
  assert.equal(await page.getByRole('button', { name: '保存', exact: true }).count(), 0)
  assert.equal(
    (await localDatabaseNames()).includes('scada-editor-lab'),
    false,
    'direct work-package load must not persist the Scene or bundled dependency',
  )
  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(
    'Pages standalone runtime smoke passed: a fresh browser directly loads a canonical Scene v8 dependency-complete work artifact, preserves instance-authored Attribute.openColor, derives Property.state from closed to open, renders the authored purple presentation through the portable component Visual Rule, preserves self-contained asset closure, exposes no authoring chrome, and never initializes Studio IndexedDB.',
  )
} finally {
  await context.close()
  await browser.close()
}
