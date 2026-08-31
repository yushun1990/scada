import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')

const fixtures = [
  {
    filename: 'process-valve.scada-component.json',
    type: 'starter.process-valve',
    title: '流程阀门',
  },
  {
    filename: 'running-motor.scada-component.json',
    type: 'starter.running-motor',
    title: '运行电机',
  },
  {
    filename: 'signal-quality.scada-component.json',
    type: 'starter.signal-quality',
    title: '信号质量',
  },
]

async function loadDeployedPackage(fixture) {
  const url = `${baseUrl}component-packages/${fixture.filename}`
  const response = await fetch(url)
  assert.equal(response.status, 200, `${url} must be deployed`)
  const document = await response.text()
  const value = JSON.parse(document)
  assert.equal(value.packageVersion, 1)
  assert.equal(value.definition?.type, fixture.type)
  assert.equal(value.definition?.title, fixture.title)
  assert.equal(value.visual?.mode, 'composite')
  return document
}

async function readPersistedComponentTypes(page) {
  return page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = window.indexedDB.open('scada-editor-lab', 2)
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener(
        'error',
        () => reject(request.error ?? new Error('Failed to open IndexedDB')),
        { once: true },
      )
    })

    try {
      const records = await new Promise((resolve, reject) => {
        const transaction = database.transaction('components', 'readonly')
        const request = transaction.objectStore('components').getAll()
        request.addEventListener('success', () => resolve(request.result), { once: true })
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error('Failed to list components')),
          { once: true },
        )
      })

      return records
        .map((record) => JSON.parse(record.document).definition.type)
        .sort()
    } finally {
      database.close()
    }
  })
}

const documents = new Map()
for (const fixture of fixtures) {
  documents.set(fixture.type, await loadDeployedPackage(fixture))
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

try {
  await page.goto(`${baseUrl}#/components`, { waitUntil: 'networkidle' })
  await page.getByText('组件库开发', { exact: true }).first().waitFor()
  assert.deepEqual(
    await readPersistedComponentTypes(page),
    [],
    'starter smoke begins with no local user component packages',
  )

  for (const fixture of fixtures) {
    const document = documents.get(fixture.type)
    assert.ok(document)

    let confirmationSeen = false
    page.once('dialog', async (dialog) => {
      confirmationSeen = true
      assert.equal(dialog.type(), 'confirm')
      assert.match(dialog.message(), new RegExp(fixture.title))
      assert.match(dialog.message(), new RegExp(fixture.type.replaceAll('.', '\\.')))
      await dialog.accept()
    })

    await page.getByLabel('选择组件包文件', { exact: true }).setInputFiles({
      name: fixture.filename,
      mimeType: 'application/json',
      buffer: Buffer.from(document),
    })
    await page.waitForFunction(() => /#\/components\/component-/.test(window.location.hash))
    await page.getByText('Component Editor', { exact: true }).waitFor()
    assert.equal(confirmationSeen, true, `${fixture.title} import requires explicit confirmation`)

    await page.goto(`${baseUrl}#/components`, { waitUntil: 'networkidle' })
    await page.getByText('组件库开发', { exact: true }).first().waitFor()
    await page.locator('.component-table-row', { hasText: fixture.title }).waitFor()
  }

  assert.deepEqual(
    await readPersistedComponentTypes(page),
    fixtures.map((fixture) => fixture.type).sort(),
    'all deployed starter packages persist as local ready components',
  )

  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.getByText('SCADA Editor', { exact: true }).waitFor()

  for (const fixture of fixtures) {
    assert.equal(
      await page.locator('.component-item', { hasText: fixture.title }).count(),
      1,
      `${fixture.title} activates through the normal live palette`,
    )
  }

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(
    'Pages reusable starter package smoke passed: all three public distribution artifacts are deployed, explicitly import into a fresh browser, persist locally, and activate through the normal SCADA palette.',
  )
} finally {
  await context.close()
  await browser.close()
}
