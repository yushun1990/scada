import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

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

async function readStoreRecords(page, storeName) {
  return page.evaluate(async (name) => {
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
        const transaction = database.transaction(name, 'readonly')
        const request = transaction.objectStore(name).getAll()
        request.addEventListener('success', () => resolve(request.result), { once: true })
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error(`Failed to read ${name}`)),
          { once: true },
        )
      })
    } finally {
      database.close()
    }
  }, storeName)
}

async function readSceneRecord(page, workId) {
  return page.evaluate(async (id) => {
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
        const transaction = database.transaction('scenes', 'readonly')
        const request = transaction.objectStore('scenes').get(id)
        request.addEventListener('success', () => resolve(request.result ?? null), { once: true })
        request.addEventListener(
          'error',
          () => reject(request.error ?? new Error('Failed to read Scene record')),
          { once: true },
        )
      })
    } finally {
      database.close()
    }
  }, workId)
}

try {
  const componentType = 'starter.process-valve'
  const componentTitle = '流程阀门'

  console.log(`Preparing dependency in export browser: ${baseUrl}#/components`)
  await exportPage.goto(`${baseUrl}#/components`, { waitUntil: 'networkidle' })
  await exportPage.getByText('组件库开发', { exact: true }).first().waitFor()
  const starterDocument = await exportPage.evaluate(async (url) => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Starter package fetch failed: ${response.status}`)
    }
    return response.text()
  }, `${baseUrl}component-packages/process-valve.scada-component.json`)
  const starterPackage = JSON.parse(starterDocument)
  assert.equal(starterPackage.definition.type, componentType)

  let componentConfirmationSeen = false
  exportPage.once('dialog', async (dialog) => {
    componentConfirmationSeen = true
    assert.equal(dialog.type(), 'confirm')
    assert.match(dialog.message(), new RegExp(componentTitle))
    await dialog.accept()
  })
  await exportPage.getByLabel('选择组件包文件', { exact: true }).setInputFiles({
    name: 'process-valve.scada-component.json',
    mimeType: 'application/json',
    buffer: Buffer.from(starterDocument),
  })
  await exportPage.waitForFunction(() => /#\/components\/component-/.test(window.location.hash))
  await exportPage.getByText('Component Editor', { exact: true }).waitFor()
  assert.equal(componentConfirmationSeen, true, 'portable dependency import requires explicit confirmation')

  console.log(`Creating export work with portable dependency: ${baseUrl}#/works`)
  await exportPage.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await exportPage.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await exportPage.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await exportPage.getByText('SCADA Editor', { exact: true }).waitFor()
  await exportPage.locator('.component-item', { hasText: componentTitle }).click()
  await exportPage.getByRole('button', { name: '保存', exact: true }).click()
  await exportPage.getByText('场景已保存', { exact: true }).waitFor()

  const exportWorkId = decodeURIComponent(exportPage.url().split('#/scada/')[1] ?? '')
  assert.match(exportWorkId, /^work-/)
  const sourceRecord = await readSceneRecord(exportPage, exportWorkId)
  assert.ok(sourceRecord, 'export work is persisted before packaging')
  const sourceScene = JSON.parse(sourceRecord.document)
  const workName = sourceScene.name
  assert.ok(
    sourceScene.nodes.some((node) => node.type === componentType),
    'persisted export Scene references the portable component type',
  )

  await exportPage.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await exportPage.getByText('SCADA 作品', { exact: true }).first().waitFor()
  const exportButton = exportPage.getByRole('button', {
    name: `导出作品 ${workName}`,
    exact: true,
  })
  await exportButton.waitFor()
  const [download] = await Promise.all([
    exportPage.waitForEvent('download'),
    exportButton.click(),
  ])
  const downloadPath = await download.path()
  assert.ok(downloadPath, 'browser work export produces a download')
  const exportedDocument = await readFile(downloadPath, 'utf8')
  const exportedPackage = JSON.parse(exportedDocument)

  assert.deepEqual(
    Object.keys(exportedPackage).sort(),
    ['dependencies', 'packageVersion', 'scene'],
    'browser work export uses only the accepted transport-neutral artifact fields',
  )
  assert.equal(exportedPackage.packageVersion, 1)
  assert.equal(exportedPackage.scene.name, workName)
  assert.deepEqual(
    exportedPackage.dependencies.map((dependency) => dependency.definition.type),
    [componentType],
    'work export carries the exact portable dependency closure',
  )

  console.log(`Importing work artifact in a fresh browser: ${baseUrl}#/works`)
  await importPage.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await importPage.getByText('SCADA 作品', { exact: true }).first().waitFor()
  const scenesBefore = await readStoreRecords(importPage, 'scenes')
  const componentsBefore = await readStoreRecords(importPage, 'components')
  assert.equal(componentsBefore.length, 0, 'fresh browser starts without local component dependencies')

  let workConfirmationSeen = false
  importPage.once('dialog', async (dialog) => {
    workConfirmationSeen = true
    assert.equal(dialog.type(), 'confirm')
    assert.match(dialog.message(), new RegExp(workName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(dialog.message(), /组件依赖：1 个/)
    assert.match(dialog.message(), /新增本地依赖：1 个/)
    await dialog.accept()
  })

  await importPage.getByLabel('选择 SCADA 作品包文件', { exact: true }).setInputFiles({
    name: `${workName}.scada-work.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(exportedDocument),
  })
  await importPage.waitForFunction(() => /#\/scada\/work-/.test(window.location.hash))
  await importPage.getByText('SCADA Editor', { exact: true }).waitFor()
  assert.equal(workConfirmationSeen, true, 'work import requires explicit confirmation')
  assert.equal(
    await importPage.locator('.component-item', { hasText: componentTitle }).count(),
    1,
    'imported dependency activates through the normal component registry/palette',
  )

  const importedWorkId = decodeURIComponent(importPage.url().split('#/scada/')[1] ?? '')
  assert.match(importedWorkId, /^work-/)
  assert.notEqual(importedWorkId, exportWorkId, 'import receives a fresh local work identity')
  const importedSceneRecord = await readSceneRecord(importPage, importedWorkId)
  assert.ok(importedSceneRecord)
  const importedScene = JSON.parse(importedSceneRecord.document)
  assert.equal(importedScene.name, workName)
  assert.ok(importedScene.nodes.some((node) => node.type === componentType))

  const componentsAfter = await readStoreRecords(importPage, 'components')
  const scenesAfter = await readStoreRecords(importPage, 'scenes')
  assert.equal(componentsAfter.length, componentsBefore.length + 1)
  assert.equal(scenesAfter.length, scenesBefore.length + 1)
  const importedComponent = JSON.parse(componentsAfter[0].document)
  assert.equal(importedComponent.definition.type, componentType)
  assert.equal(importedComponent.status, 'ready')
  assert.equal(importedComponent.builtIn, false)
  assert.match(importedComponent.id, /^component-/)

  console.log('Verifying same-type mismatch is rejected before confirmation or mutation')
  await importPage.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await importPage.getByText('SCADA 作品', { exact: true }).first().waitFor()
  const conflictingPackage = structuredClone(exportedPackage)
  conflictingPackage.dependencies[0].definition.title = '冲突阀门定义'
  const sceneCountBeforeCollision = (await readStoreRecords(importPage, 'scenes')).length
  const componentCountBeforeCollision = (await readStoreRecords(importPage, 'components')).length
  let unexpectedConfirmation = false
  const rejectUnexpectedDialog = async (dialog) => {
    unexpectedConfirmation = true
    await dialog.dismiss()
  }
  importPage.on('dialog', rejectUnexpectedDialog)
  await importPage.getByLabel('选择 SCADA 作品包文件', { exact: true }).setInputFiles({
    name: 'conflicting.scada-work.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(conflictingPackage)),
  })
  await importPage.getByText(
    `作品依赖与本地可编辑组件定义不一致：${componentType}`,
    { exact: true },
  ).waitFor()
  importPage.off('dialog', rejectUnexpectedDialog)

  assert.equal(unexpectedConfirmation, false, 'known dependency collision is rejected before confirmation')
  assert.equal(
    (await readStoreRecords(importPage, 'scenes')).length,
    sceneCountBeforeCollision,
    'collision rejection does not create another Scene record',
  )
  assert.equal(
    (await readStoreRecords(importPage, 'components')).length,
    componentCountBeforeCollision,
    'collision rejection does not alter component persistence',
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log('Pages SCADA work package transfer smoke passed: a persisted work exports with exact portable dependencies, imports into a fresh browser only after explicit confirmation, persists work + missing dependencies with fresh local identities, activates the imported component through the normal registry, and rejects conflicting same-type dependencies without mutation.')
} finally {
  await exportContext.close()
  await importContext.close()
  await browser.close()
}
