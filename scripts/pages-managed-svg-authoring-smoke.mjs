import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import {
  readPersistedComponent,
  saveAndWait,
  writePersistedComponent,
} from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const authorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const authorPage = await authorContext.newPage()
const importContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const importPage = await importContext.newPage()
const runtimeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const runtimePage = await runtimeContext.newPage()
const pageErrors = []

for (const [label, page] of [
  ['author', authorPage],
  ['import', importPage],
  ['runtime', runtimePage],
]) {
  page.on('pageerror', (error) => pageErrors.push(`${label}: ${error.message}`))
}

const componentType = 'custom.pages.managed-svg-p1.4'
const componentTitle = 'Managed SVG P1.4'
const authoredFill = '#22c55e'
const runtimeRuleColor = '#7c3aed'
const svgSource = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <g id="status">
    <rect id="indicator" x="10" y="10" width="100" height="60" fill="#ef4444"/>
  </g>
</svg>
`.trim()
const unsafeSvgSource = `
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">
  <script>alert('blocked')</script>
  <rect width="20" height="20" fill="#ef4444"/>
</svg>
`.trim()
const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function findVisualLayer(document, kind, name) {
  return document.visual.layers.find((layer) => layer.kind === kind && layer.name === name)
}

function findManagedTag(document, tagId) {
  const visit = (node) => {
    if (!node || node.kind !== 'element') return null
    if (node.tagId === tagId) return node
    for (const child of node.children ?? []) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  return visit(document.root)
}

function attributeValue(element, name) {
  return element?.attributes?.find((attribute) => attribute.name === name)?.value ?? null
}

function globalAssetImportControl(page) {
  return page.locator('.component-asset-import-control')
    .filter({ hasText: '导入 SVG / 图片' })
    .first()
}

async function waitForGlobalAssetInputReady(page) {
  await page.waitForFunction(() => {
    const control = [...document.querySelectorAll('.component-asset-import-control')]
      .find((candidate) => candidate.textContent?.includes('导入 SVG / 图片'))
    const input = control?.querySelector('input[type="file"]')
    return input instanceof HTMLInputElement && !input.disabled && input.value === ''
  })
}

async function waitForManagedFill(page, expected) {
  await page.waitForFunction((value) => {
    const properties = document.querySelector('.component-managed-svg-properties')
    if (!properties) return false
    const fields = [...properties.querySelectorAll('.property-field')]
    const fillField = fields.find((field) =>
      field.querySelector('span')?.textContent?.trim() === 'Fill',
    )
    return fillField?.querySelector('input')?.value === value
  }, expected)
}

async function canvasHasColor(page, selector, matcher) {
  await page.waitForFunction(({ canvasSelector, expected }) => {
    const canvases = [...document.querySelectorAll(canvasSelector)]
    return canvases.some((canvas) => {
      const context = canvas.getContext('2d')
      if (!context || canvas.width <= 0 || canvas.height <= 0) return false
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let index = 0; index < pixels.length; index += 4 * 6) {
        const red = pixels[index]
        const green = pixels[index + 1]
        const blue = pixels[index + 2]
        const alpha = pixels[index + 3]
        if (
          alpha >= expected.alphaMin &&
          red >= expected.redMin && red <= expected.redMax &&
          green >= expected.greenMin && green <= expected.greenMax &&
          blue >= expected.blueMin && blue <= expected.blueMax
        ) return true
      }
      return false
    })
  }, { canvasSelector: selector, expected: matcher })
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

async function localDatabaseNames(page) {
  return page.evaluate(async () => {
    if (!('databases' in window.indexedDB)) return []
    return (await window.indexedDB.databases())
      .map((database) => database.name)
      .filter(Boolean)
  })
}

try {
  console.log(`Authoring managed SVG from a real local file: ${baseUrl}#/components/new`)
  await authorPage.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await authorPage.getByText('Component Editor', { exact: true }).waitFor()

  const importControl = globalAssetImportControl(authorPage)
  const importInput = importControl.locator('input[type="file"]')
  await importInput.waitFor({ state: 'attached' })
  await waitForGlobalAssetInputReady(authorPage)

  await importInput.setInputFiles({
    name: 'unsafe-p1.4.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(unsafeSvgSource),
  })
  const unsafeMessage = importControl.locator('.component-asset-import-message')
  await unsafeMessage.waitFor()
  assert.ok((await unsafeMessage.textContent())?.trim(), 'unsafe SVG import exposes a visible failure')
  assert.equal(
    await authorPage.locator('.component-layer-row').count(),
    0,
    'unsafe SVG rejection does not mutate the visual tree',
  )
  await waitForGlobalAssetInputReady(authorPage)

  await globalAssetImportControl(authorPage).locator('input[type="file"]').setInputFiles({
    name: 'p14-status.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgSource),
  })
  await authorPage.locator('.component-layer-row', { hasText: 'p14-status' }).waitFor()
  await waitForGlobalAssetInputReady(authorPage)
  await authorPage.locator('.component-managed-svg-editor').waitFor()
  await authorPage.locator('.component-managed-svg-row', { hasText: 'svg-tag-000003' }).click()

  const fillField = authorPage.locator('.component-managed-svg-properties .property-field')
    .filter({ hasText: 'Fill' })
    .first()
  const fillInput = fillField.locator('input')
  assert.equal(await fillInput.inputValue(), '#ef4444')
  await fillInput.fill(authoredFill)
  await fillInput.blur()
  await waitForManagedFill(authorPage, authoredFill)

  await authorPage.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  await authorPage.keyboard.press('Control+z')
  await waitForManagedFill(authorPage, '#ef4444')
  await authorPage.keyboard.press('Control+y')
  await waitForManagedFill(authorPage, authoredFill)

  await waitForGlobalAssetInputReady(authorPage)
  await globalAssetImportControl(authorPage).locator('input[type="file"]').setInputFiles({
    name: 'p14-image.png',
    mimeType: 'image/png',
    buffer: pngBuffer,
  })
  await authorPage.locator('.component-layer-row', { hasText: 'p14-image' }).waitFor()
  await waitForGlobalAssetInputReady(authorPage)

  await authorPage.getByLabel('预览', { exact: true }).click()
  await authorPage.locator('.status-mode', { hasText: '预览' }).waitFor()
  await canvasHasColor(authorPage, 'canvas', {
    alphaMin: 200,
    redMin: 24,
    redMax: 45,
    greenMin: 185,
    greenMax: 210,
    blueMin: 80,
    blueMax: 110,
  })
  await authorPage.getByLabel('设计', { exact: true }).click()

  await saveAndWait(authorPage)
  const savedUrl = authorPage.url()
  const firstSaved = await readPersistedComponent(authorPage)
  const firstSavedSvg = findVisualLayer(firstSaved.document, 'svg', 'p14-status')
  const firstSavedImage = findVisualLayer(firstSaved.document, 'image', 'p14-image')
  assert.ok(firstSavedSvg?.document)
  assert.ok(firstSavedImage)
  assert.equal(
    attributeValue(findManagedTag(firstSavedSvg.document, 'svg-tag-000003'), 'fill'),
    authoredFill,
  )
  assert.match(firstSavedSvg.assetRef, /^data:image\/svg\+xml;charset=utf-8,/)
  assert.match(firstSavedImage.assetRef, /^data:image\/png;base64,/)

  await authorPage.goto(savedUrl, { waitUntil: 'networkidle' })
  await authorPage.getByText('Component Editor', { exact: true }).waitFor()
  await authorPage.locator('.component-layer-row', { hasText: 'p14-status' }).click()
  await authorPage.locator('.component-managed-svg-row', { hasText: 'svg-tag-000003' }).click()
  await waitForManagedFill(authorPage, authoredFill)

  const reloaded = await readPersistedComponent(authorPage)
  const reloadedSvg = findVisualLayer(reloaded.document, 'svg', 'p14-status')
  assert.ok(reloadedSvg?.document)
  const readyDocument = {
    ...reloaded.document,
    definition: {
      ...reloaded.document.definition,
      type: componentType,
      title: componentTitle,
      category: 'P1.4 acceptance',
      attributes: {
        ...reloaded.document.definition.attributes,
        runningColor: {
          title: 'Running color',
          kind: 'color',
          defaultValue: runtimeRuleColor,
        },
      },
      properties: {
        ...reloaded.document.definition.properties,
        state: {
          title: 'State',
          kind: 'select',
          defaultValue: 'running',
          bindable: true,
          options: [
            { label: 'Stopped', value: 'stopped' },
            { label: 'Running', value: 'running' },
          ],
        },
      },
    },
    visual: {
      ...reloaded.document.visual,
      rules: [
        ...(reloaded.document.visual.rules ?? []),
        {
          id: 'p1.4-running-indicator',
          enabled: true,
          propertyKey: 'state',
          operator: 'equals',
          compareValue: 'running',
          layerId: reloadedSvg.id,
          svgTagId: 'svg-tag-000003',
          target: 'style.fill',
          value: '#000000',
          valueSource: {
            namespace: 'attribute',
            key: 'runningColor',
          },
        },
      ],
    },
    status: 'ready',
  }
  await writePersistedComponent(authorPage, readyDocument)

  console.log('Exporting the authored component package')
  await authorPage.goto(`${baseUrl}#/components`, { waitUntil: 'networkidle' })
  await authorPage.getByText('组件库开发', { exact: true }).first().waitFor()
  await authorPage.locator('.component-table-row', { hasText: componentTitle }).waitFor()
  const exportButton = authorPage.getByRole('button', {
    name: `导出组件 ${componentTitle}`,
    exact: true,
  })
  const [componentDownload] = await Promise.all([
    authorPage.waitForEvent('download'),
    exportButton.click(),
  ])
  const componentDownloadPath = await componentDownload.path()
  assert.ok(componentDownloadPath)
  const exportedComponentDocument = await readFile(componentDownloadPath, 'utf8')
  const exportedComponent = JSON.parse(exportedComponentDocument)
  assert.equal(exportedComponent.packageVersion, 2)
  assert.equal(exportedComponent.definition.type, componentType)
  assert.equal(exportedComponent.definition.attributes.runningColor.defaultValue, runtimeRuleColor)
  assert.equal(exportedComponent.definition.properties.state.defaultValue, 'running')
  assert.equal(exportedComponent.visual.version, 4)
  assert.equal(exportedComponent.visual.rules.length, 1)
  assert.equal(exportedComponent.visual.rules[0].svgTagId, 'svg-tag-000003')
  assert.deepEqual(exportedComponent.visual.rules[0].valueSource, {
    namespace: 'attribute',
    key: 'runningColor',
  })
  const exportedSvg = findVisualLayer(exportedComponent, 'svg', 'p14-status')
  const exportedImage = findVisualLayer(exportedComponent, 'image', 'p14-image')
  assert.ok(exportedSvg?.document)
  assert.ok(exportedImage)
  assert.equal(
    attributeValue(findManagedTag(exportedSvg.document, 'svg-tag-000003'), 'fill'),
    authoredFill,
    'component package retains the authored base fill independently from the runtime rule',
  )
  assert.match(exportedSvg.assetRef, /^data:image\/svg\+xml;charset=utf-8,/)
  assert.match(exportedImage.assetRef, /^data:image\/png;base64,/)
  assert.doesNotMatch(exportedSvg.assetRef, /^(?:blob:|https?:|\/(?!\/)|\.\.?\/)/)
  assert.doesNotMatch(exportedImage.assetRef, /^(?:blob:|https?:|\/(?!\/)|\.\.?\/)/)

  console.log('Importing the component package in a fresh browser')
  await importPage.goto(`${baseUrl}#/components`, { waitUntil: 'networkidle' })
  await importPage.getByText('组件库开发', { exact: true }).first().waitFor()
  let componentConfirmationSeen = false
  importPage.once('dialog', async (dialog) => {
    componentConfirmationSeen = true
    assert.equal(dialog.type(), 'confirm')
    await dialog.accept()
  })
  await importPage.getByLabel('选择组件包文件', { exact: true }).setInputFiles({
    name: `${componentType}.scada-component.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(exportedComponentDocument),
  })
  await importPage.waitForFunction(() => /#\/components\/component-/.test(window.location.hash))
  await importPage.getByText('Component Editor', { exact: true }).waitFor()
  assert.equal(componentConfirmationSeen, true)

  const importedComponent = await readPersistedComponent(importPage)
  const importedSvg = findVisualLayer(importedComponent.document, 'svg', 'p14-status')
  const importedImage = findVisualLayer(importedComponent.document, 'image', 'p14-image')
  assert.ok(importedSvg?.document)
  assert.ok(importedImage)
  assert.equal(
    attributeValue(findManagedTag(importedSvg.document, 'svg-tag-000003'), 'fill'),
    authoredFill,
  )
  assert.equal(importedComponent.document.visual.rules[0].svgTagId, 'svg-tag-000003')
  assert.deepEqual(importedComponent.document.visual.rules[0].valueSource, {
    namespace: 'attribute',
    key: 'runningColor',
  })
  assert.match(importedImage.assetRef, /^data:image\/png;base64,/)

  console.log('Activating the imported component inside a normal SCADA Workbench')
  await importPage.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await importPage.getByText('SCADA 作品', { exact: true }).first().waitFor()
  await importPage.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await importPage.getByText('SCADA Editor', { exact: true }).waitFor()
  const paletteItem = importPage.locator('.component-item', { hasText: componentTitle })
  assert.equal(await paletteItem.count(), 1)
  await paletteItem.click()
  await canvasHasColor(importPage, 'canvas', {
    alphaMin: 200,
    redMin: 110,
    redMax: 140,
    greenMin: 40,
    greenMax: 80,
    blueMin: 220,
    blueMax: 255,
  })
  await importPage.getByRole('button', { name: '保存', exact: true }).click()
  await importPage.getByText('场景已保存', { exact: true }).waitFor()

  const workId = decodeURIComponent(importPage.url().split('#/scada/')[1] ?? '')
  assert.match(workId, /^work-/)
  const sceneRecord = await readSceneRecord(importPage, workId)
  assert.ok(sceneRecord)
  const sceneDocument = JSON.parse(sceneRecord.document)
  const componentNode = sceneDocument.nodes.find((node) => node.type === componentType)
  assert.ok(componentNode, 'SCADA Scene persists an instance of the imported managed-SVG component')
  assert.equal(componentNode.attributes.runningColor, runtimeRuleColor)
  assert.equal(componentNode.propertyFallbacks.state, 'running')
  const workName = sceneDocument.name

  console.log('Exporting the SCADA work with exact managed-SVG dependency closure')
  await importPage.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await importPage.getByText('SCADA 作品', { exact: true }).first().waitFor()
  const workExportButton = importPage.getByRole('button', {
    name: `导出作品 ${workName}`,
    exact: true,
  })
  const [workDownload] = await Promise.all([
    importPage.waitForEvent('download'),
    workExportButton.click(),
  ])
  const workDownloadPath = await workDownload.path()
  assert.ok(workDownloadPath)
  const exportedWorkDocument = await readFile(workDownloadPath, 'utf8')
  const exportedWork = JSON.parse(exportedWorkDocument)
  assert.equal(exportedWork.packageVersion, 1)
  assert.deepEqual(
    exportedWork.dependencies.map((dependency) => dependency.definition.type),
    [componentType],
  )
  assert.equal(exportedWork.dependencies[0].visual.rules[0].svgTagId, 'svg-tag-000003')
  assert.deepEqual(exportedWork.dependencies[0].visual.rules[0].valueSource, {
    namespace: 'attribute',
    key: 'runningColor',
  })
  const workDependencySvg = findVisualLayer(exportedWork.dependencies[0], 'svg', 'p14-status')
  const workDependencyImage = findVisualLayer(exportedWork.dependencies[0], 'image', 'p14-image')
  assert.ok(workDependencySvg?.document)
  assert.ok(workDependencyImage)
  assert.equal(
    attributeValue(findManagedTag(workDependencySvg.document, 'svg-tag-000003'), 'fill'),
    authoredFill,
  )
  assert.match(workDependencySvg.assetRef, /^data:image\/svg\+xml;charset=utf-8,/)
  assert.match(workDependencyImage.assetRef, /^data:image\/png;base64,/)

  const exportedWorkNode = exportedWork.scene.nodes.find((node) => node.type === componentType)
  assert.ok(exportedWorkNode)
  assert.equal(exportedWorkNode.attributes.runningColor, runtimeRuleColor)
  assert.equal(exportedWorkNode.propertyFallbacks.state, 'running')

  console.log('Loading the exact exported work directly in a fresh standalone runtime')
  await runtimePage.goto(`${baseUrl}#/runtime`, { waitUntil: 'networkidle' })
  await runtimePage.getByText('SCADA Runtime', { exact: true }).waitFor()
  assert.equal((await localDatabaseNames(runtimePage)).includes('scada-editor-lab'), false)
  await runtimePage.getByLabel('选择独立运行作品包文件', { exact: true }).setInputFiles({
    name: `${workName}.scada-work.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(exportedWorkDocument),
  })
  await runtimePage.getByText(workName, { exact: true }).waitFor()
  await runtimePage.locator('.standalone-runtime-canvas canvas').first().waitFor({ state: 'visible' })
  await canvasHasColor(runtimePage, '.standalone-runtime-canvas canvas', {
    alphaMin: 200,
    redMin: 110,
    redMax: 140,
    greenMin: 40,
    greenMax: 80,
    blueMin: 220,
    blueMax: 255,
  })
  assert.equal(await runtimePage.locator('.workspace-shell').count(), 0)
  assert.equal(await runtimePage.locator('.editor-shell').count(), 0)
  assert.equal(
    (await localDatabaseNames(runtimePage)).includes('scada-editor-lab'),
    false,
    'standalone rendering remains package-scoped and does not install the dependency',
  )

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(
    'Pages managed SVG authoring acceptance passed: unsafe SVG input fails visibly without mutation; a real local SVG imports, exposes stable internal tags, survives static tag editing plus undo/redo, previews the authored fill, saves/reloads, coexists with a real PNG import, exports/imports as a self-contained component package in a fresh browser, preserves a Property-driven internal svgTagId rule with explicit Attribute value source, renders that rule inside SCADA Workbench, closes exactly into a SCADA work package, and the exact exported artifact renders the rule result in a fresh standalone runtime without Studio persistence.',
  )
} finally {
  await authorContext.close()
  await importContext.close()
  await runtimeContext.close()
  await browser.close()
}
