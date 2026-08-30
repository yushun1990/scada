import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import {
  readPersistedComponent,
  writePersistedComponent,
} from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const exportContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const exportPage = await exportContext.newPage()
const importContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const importPage = await importContext.newPage()
const pageErrors = []

exportPage.on('pageerror', (error) => pageErrors.push(`export: ${error.message}`))
importPage.on('pageerror', (error) => pageErrors.push(`import: ${error.message}`))

async function countPersistedComponents(page) {
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
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction('components', 'readonly')
        const request = transaction.objectStore('components').count()
        request.addEventListener('success', () => resolve(request.result), { once: true })
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error('Failed to count components')),
          { once: true },
        )
      })
    } finally {
      database.close()
    }
  })
}

try {
  const componentType = 'custom.pages.portable-transfer-smoke'
  const componentTitle = 'Portable Transfer Smoke'

  console.log(`Preparing export browser component: ${baseUrl}#/components/new`)
  await exportPage.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await exportPage.getByText('Component Editor', { exact: true }).waitFor()
  await exportPage.locator('.component-layer-root').click()
  await exportPage.getByRole('button', { name: '添加图层' }).click()
  await exportPage.locator('.component-layer-row', { hasText: 'Group 1' }).waitFor()
  await exportPage.getByRole('button', { name: '保存' }).click()
  await exportPage.waitForFunction(() => window.location.hash !== '#/components/new')

  const source = await readPersistedComponent(exportPage)
  const readySource = {
    ...source.document,
    definition: {
      ...source.document.definition,
      type: componentType,
      title: componentTitle,
      category: 'Portable smoke',
    },
    status: 'ready',
  }
  await writePersistedComponent(exportPage, readySource)

  await exportPage.goto(`${baseUrl}#/components`, { waitUntil: 'networkidle' })
  await exportPage.getByText('组件库开发', { exact: true }).first().waitFor()
  await exportPage.locator('.component-table-row', { hasText: componentTitle }).waitFor()
  const exportButton = exportPage.getByRole('button', {
    name: `导出组件 ${componentTitle}`,
    exact: true,
  })
  await exportButton.waitFor()
  assert.equal(await exportButton.count(), 1, 'ready local component exposes explicit export')

  const [download] = await Promise.all([
    exportPage.waitForEvent('download'),
    exportButton.click(),
  ])
  const downloadPath = await download.path()
  assert.ok(downloadPath, 'browser export produces a download path')
  const exportedDocument = await readFile(downloadPath, 'utf8')
  const exportedPackage = JSON.parse(exportedDocument)

  assert.deepEqual(
    Object.keys(exportedPackage).sort(),
    ['definition', 'implementationDraft', 'packageVersion', 'visual'],
    'browser export contains only the transport-neutral artifact fields',
  )
  assert.equal(exportedPackage.packageVersion, 1)
  assert.equal(exportedPackage.definition.type, componentType)
  assert.equal(exportedPackage.definition.title, componentTitle)
  assert.equal('id' in exportedPackage, false)
  assert.equal('status' in exportedPackage, false)
  assert.equal('updatedAt' in exportedPackage, false)
  assert.equal('builtIn' in exportedPackage, false)

  console.log(`Importing exported package in a fresh browser: ${baseUrl}#/components`)
  await importPage.goto(`${baseUrl}#/components`, { waitUntil: 'networkidle' })
  await importPage.getByText('组件库开发', { exact: true }).first().waitFor()
  const importInput = importPage.getByLabel('选择组件包文件', { exact: true })
  await importInput.waitFor({ state: 'attached' })
  assert.equal(await countPersistedComponents(importPage), 0, 'fresh browser starts without local components')

  let confirmationSeen = false
  importPage.once('dialog', async (dialog) => {
    confirmationSeen = true
    assert.equal(dialog.type(), 'confirm')
    assert.match(dialog.message(), new RegExp(componentTitle))
    assert.match(dialog.message(), new RegExp(componentType.replaceAll('.', '\\.')))
    await dialog.accept()
  })

  await importInput.setInputFiles({
    name: `${componentType}.scada-component.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(exportedDocument),
  })
  await importPage.waitForFunction(() => /#\/components\/component-/.test(window.location.hash))
  await importPage.getByText('Component Editor', { exact: true }).waitFor()
  assert.equal(confirmationSeen, true, 'file selection requires explicit import confirmation')

  const imported = await readPersistedComponent(importPage)
  assert.notEqual(imported.id, source.id, 'import receives a fresh local repository identity')
  assert.equal(imported.document.id, imported.id)
  assert.equal(imported.document.definition.type, componentType)
  assert.equal(imported.document.definition.title, componentTitle)
  assert.equal(imported.document.status, 'ready')
  assert.equal(imported.document.builtIn, false)
  assert.equal(await countPersistedComponents(importPage), 1)

  await importPage.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await importPage.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await importPage.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await importPage.getByText('SCADA Editor', { exact: true }).waitFor()
  assert.equal(
    await importPage.locator('.component-item', { hasText: componentTitle }).count(),
    1,
    'imported ready package enters the normal live component registry/palette',
  )

  await importPage.goto(`${baseUrl}#/components`, { waitUntil: 'networkidle' })
  await importPage.getByText('组件库开发', { exact: true }).first().waitFor()
  await importPage.locator('.component-table-row', { hasText: componentTitle }).waitFor()
  const countBeforeCollision = await countPersistedComponents(importPage)
  let unexpectedCollisionConfirmation = false
  const rejectUnexpectedDialog = async (dialog) => {
    unexpectedCollisionConfirmation = true
    await dialog.dismiss()
  }
  importPage.on('dialog', rejectUnexpectedDialog)
  await importPage.getByLabel('选择组件包文件', { exact: true }).setInputFiles({
    name: `${componentType}.scada-component.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(exportedDocument),
  })
  await importPage.getByText(`组件类型与本地可编辑组件冲突：${componentType}`, {
    exact: true,
  }).waitFor()
  importPage.off('dialog', rejectUnexpectedDialog)

  assert.equal(
    unexpectedCollisionConfirmation,
    false,
    'known type collision is rejected before asking for an overwrite confirmation',
  )
  assert.equal(
    await countPersistedComponents(importPage),
    countBeforeCollision,
    'collision rejection does not overwrite or add a repository record',
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages portable component transfer smoke passed: a ready local component exports as a transport-neutral file, imports into a fresh browser only after explicit confirmation, persists with a new local identity, activates through the normal SCADA palette, and rejects repeat local-type collisions without mutation.')
} finally {
  await exportContext.close()
  await importContext.close()
  await browser.close()
}
