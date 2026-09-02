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

page.on('pageerror', (error) => pageErrors.push(error.message))

async function localDatabaseNames() {
  return page.evaluate(async () => {
    if (!('databases' in window.indexedDB)) return []
    return (await window.indexedDB.databases())
      .map((database) => database.name)
      .filter(Boolean)
  })
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
  assert.equal(
    (await localDatabaseNames()).includes('scada-editor-lab'),
    false,
    'opening the standalone route must not initialize Studio IndexedDB',
  )

  const packageResponse = await page.request.get(
    `${baseUrl}component-packages/process-valve.scada-component.json`,
  )
  assert.equal(packageResponse.ok(), true, 'portable dependency fixture is deployed')
  const dependency = await packageResponse.json()
  dependency.visual = {
    ...dependency.visual,
    layers: [
      ...dependency.visual.layers,
      {
        id: 'standalone-portable-asset-smoke',
        name: 'Standalone portable asset smoke',
        kind: 'image',
        parentId: null,
        transform: {
          x: 0,
          y: 0,
          width: dependency.visual.designSize.width,
          height: dependency.visual.designSize.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
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
      version: 7,
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
          transform: {
            x: 260,
            y: 140,
            width: 120,
            height: 80,
            rotation: 0,
          },
          props: { state: 'open' },
          bindings: [],
          behaviors: [],
          scadaSemantics: null,
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
  assert.ok(
    await page.locator('.standalone-runtime-canvas canvas').count() >= 1,
    'standalone route renders the work artifact through a Konva runtime surface',
  )

  await page.waitForFunction(() => {
    const canvases = [...document.querySelectorAll('.standalone-runtime-canvas canvas')]

    return canvases.some((canvas) => {
      const context = canvas.getContext('2d')
      if (!context || canvas.width <= 0 || canvas.height <= 0) return false

      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let index = 0; index < pixels.length; index += 4 * 16) {
        const red = pixels[index]
        const green = pixels[index + 1]
        const blue = pixels[index + 2]
        const alpha = pixels[index + 3]

        if (alpha > 200 && red > 220 && green < 40 && blue > 220) {
          return true
        }
      }

      return false
    })
  })

  assert.equal(await page.locator('.workspace-shell').count(), 0)
  assert.equal(await page.locator('.editor-shell').count(), 0)
  assert.equal(await page.getByRole('button', { name: '保存', exact: true }).count(), 0)
  assert.equal(
    (await localDatabaseNames()).includes('scada-editor-lab'),
    false,
    'direct work-package load must not persist the Scene or bundled component dependency',
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(
    'Pages standalone runtime smoke passed: a fresh browser opens the storage-independent runtime route, directly loads the accepted dependency-complete work artifact, renders a bundled self-contained SVG/Image resource without external asset installation or network dependency, and never initializes Studio IndexedDB.',
  )
} finally {
  await context.close()
  await browser.close()
}
