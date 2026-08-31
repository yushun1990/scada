import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []

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
    'Pages standalone runtime smoke passed: a fresh browser opens the storage-independent runtime route, directly loads the accepted dependency-complete work artifact, renders its portable component without authoring chrome, and never initializes Studio IndexedDB.',
  )
} finally {
  await context.close()
  await browser.close()
}
