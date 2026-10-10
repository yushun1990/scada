import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { chromium, firefox } from 'playwright'
import { readPersistedComponent, saveAndWait } from './pages-component-fixture-storage.mjs'
import { readPersistedScene, saveSceneAndWait } from './pages-scene-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://127.0.0.1:4173/').replace(/\/?$/, '/')
const browserName = process.env.SCADA_BROWSER ?? 'chromium'
assert.ok(['chromium', 'firefox'].includes(browserName))
const browser = await ({ chromium, firefox })[browserName].launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const runtimeContext = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const page = await context.newPage()
const runtimePage = await runtimeContext.newPage()
const pageErrors = []
for (const currentPage of [page, runtimePage]) {
  currentPage.setDefaultTimeout(15000)
  currentPage.on('pageerror', (error) => pageErrors.push(error.message))
}
const fixtureText = await readFile(new URL('./fixtures/component-capability-theme.scada-component.json', import.meta.url), 'utf8')
const fixture = JSON.parse(fixtureText)
const componentTitle = fixture.definition.title
const componentType = fixture.definition.type
const svgSource = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <rect id="body" class="scada-theme-base" x="10" y="10" width="100" height="60" fill="#6b7280"/>
</svg>`

function assertPublicContractClosed(component) {
  assert.deepEqual(component.definition.actions, {})
  assert.deepEqual(component.definition.events, {})
}

async function canvasHasColor(currentPage, selector, rgb) {
  await currentPage.waitForFunction(({ canvasSelector, color }) => {
    return [...document.querySelectorAll(canvasSelector)].some((canvas) => {
      const context2d = canvas.getContext('2d')
      if (!context2d || canvas.width <= 0 || canvas.height <= 0) return false
      const pixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] >= 250 && color.every((channel, offset) => Math.abs(pixels[index + offset] - channel) <= 4)) {
          if (++count >= 25) return true
        }
      }
      return false
    })
  }, { canvasSelector: selector, color: rgb })
}

async function assertNoAuthoringDatabase(currentPage) {
  const names = await currentPage.evaluate(async () => {
    if (!('databases' in window.indexedDB)) throw new Error('IndexedDB database enumeration unavailable; isolation not verified')
    return (await window.indexedDB.databases()).map((database) => database.name)
  })
  assert.equal(names.includes('scada-editor-lab'), false, 'standalone must not initialize Studio or install the dependency')
}

try {
  await mkdir('artifacts', { recursive: true })
  console.log(`Verifying current draft/import/configuration capability flow (${browserName}): ${baseUrl}`)

  // Real local ingest/save remains a draft. Do not resurrect the removed
  // binding/mark-ready UI or write fixture status straight into IndexedDB.
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  const palette = page.getByRole('region', { name: '组件创作素材' })
  await palette.locator('.component-palette-resource-library input[type="file"]').setInputFiles({
    name: 'r0-theme.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svgSource),
  })
  await palette.locator('.component-palette-resource-item', { hasText: 'r0-theme' }).dblclick()
  await page.locator('.component-layer-row', { hasText: 'r0-theme' }).waitFor()
  const draft = await saveAndWait(page)
  assert.equal(draft.document.status, 'draft', 'saving a new local document must not manufacture ready status')
  assertPublicContractClosed(draft.document)
  const authoredSvg = draft.document.visual.layers.find((layer) => layer.kind === 'svg')
  assert.ok(authoredSvg?.document, 'local SVG ingest persists a managed document')
  assert.match(authoredSvg.assetRef, /^data:image\/svg\+xml/)

  // This checked-in transport artifact is regenerated via the production
  // generator/serializer by check-component-capability-consistency.ts in CI.
  // Import is the current positive ready path, not evidence of removed binding UI.
  await page.goto(`${baseUrl}#/components`, { waitUntil: 'networkidle' })
  let importConfirmed = false
  page.once('dialog', async (dialog) => {
    importConfirmed = true
    assert.equal(dialog.type(), 'confirm')
    assert.ok(dialog.message().includes(componentTitle))
    await dialog.accept()
  })
  await page.getByLabel('选择组件包文件', { exact: true }).setInputFiles({
    name: 'capability-theme.scada-component.json', mimeType: 'application/json', buffer: Buffer.from(fixtureText),
  })
  await page.waitForFunction(() => window.location.hash.startsWith('#/components/component-'))
  const imported = await readPersistedComponent(page)
  assert.equal(importConfirmed, true)
  assert.notEqual(imported.id, draft.id)
  assert.equal(imported.document.status, 'ready')
  assertPublicContractClosed(imported.document)
  assert.deepEqual(imported.document.definition, fixture.definition)
  assert.deepEqual(imported.document.visual, fixture.visual)
  assert.equal(imported.document.definition.properties.state.kind, 'select')
  assert.equal(imported.document.definition.properties.state.bindable, true)
  assert.deepEqual(imported.document.visual.rules.map((rule) => [rule.propertyKey, rule.compareValue, rule.target]), [
    ['state', 'running', 'svg.themeState'], ['state', 'alarm', 'svg.themeState'],
    ['state', 'warning', 'svg.themeState'], ['state', 'standby', 'svg.themeState'], ['state', 'offline', 'svg.themeState'],
  ])

  await page.getByRole('button', { name: 'Coding 开发', exact: true }).click()
  const definitionPage = page.locator('.component-definition-page')
  await definitionPage.getByRole('tab', { name: '操作（未开放）', exact: true }).click()
  await definitionPage.getByText(/不提供公开操作（Action）的新增、编辑或执行能力/).waitFor()
  assert.equal(await definitionPage.getByRole('button').count(), 0, 'portable Action creation/execution stays unavailable')
  await definitionPage.getByRole('tab', { name: '事件（未开放）', exact: true }).click()
  assert.equal(await definitionPage.getByRole('button').count(), 0, 'portable Event creation/emission stays unavailable')
  await definitionPage.getByRole('tab', { name: '属性', exact: true }).click()
  const propertyGroup = definitionPage.locator('.component-root-public-properties')
  await propertyGroup.getByLabel('Property 默认枚举值', { exact: true }).click()
  const runningOption = fixture.definition.properties.state.options.find((option) => option.value === 'running')
  await page.getByRole('option', { name: `${runningOption.label} · running`, exact: true }).click()
  await saveAndWait(page)
  const configured = (await readPersistedComponent(page)).document
  assert.equal(configured.status, 'ready')
  assert.equal(configured.definition.properties.state.defaultValue, 'running')
  assert.deepEqual(configured.visual, fixture.visual, 'configuring a Property default must not bake the visual rule result into source')
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await canvasHasColor(page, '.component-canvas-stage.preview canvas', [17, 191, 98])
  await page.getByRole('button', { name: 'Coding 开发', exact: true }).click()
  await propertyGroup.getByLabel('Property 默认枚举值', { exact: true }).waitFor()
  assert.equal(await propertyGroup.getByLabel('Property 默认枚举值', { exact: true }).isDisabled(), true)
  await definitionPage.getByLabel('运行状态 预览值', { exact: true }).click()
  const alarmOption = fixture.definition.properties.state.options.find((option) => option.value === 'alarm')
  await page.getByRole('option', { name: alarmOption.label, exact: true }).click()
  await page.getByRole('button', { name: '图形化设计', exact: true }).click()
  await canvasHasColor(page, '.component-canvas-stage.preview canvas', [220, 38, 38])
  // Switch back through warm cache entries too: neither a pending image nor a
  // reused display raster may show pixels belonging to the previous source.
  for (const [option, rgb] of [[runningOption, [17, 191, 98]], [alarmOption, [220, 38, 38]]]) {
    await page.getByRole('button', { name: 'Coding 开发', exact: true }).click()
    await definitionPage.getByLabel('运行状态 预览值', { exact: true }).click()
    await page.getByRole('option', { name: option.label, exact: true }).click()
    await page.getByRole('button', { name: '图形化设计', exact: true }).click()
    await canvasHasColor(page, '.component-canvas-stage.preview canvas', rgb)
  }
  await page.screenshot({ path: `artifacts/component-capability-preview-${browserName}.png` })
  const afterPreview = (await readPersistedComponent(page)).document
  assert.deepEqual(afterPreview, configured, 'effective Preview Property changes must not persist')
  await page.getByRole('button', { name: '设计', exact: true }).click()

  await page.goto(`${baseUrl}#/components`, { waitUntil: 'networkidle' })
  const [componentDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: `导出组件 ${componentTitle}`, exact: true }).click(),
  ])
  const componentArtifact = JSON.parse(await readFile(await componentDownload.path(), 'utf8'))
  assertPublicContractClosed(componentArtifact)
  assert.equal(componentArtifact.packageVersion, 2)
  assert.equal(componentArtifact.definition.properties.state.defaultValue, 'running')
  assert.deepEqual(componentArtifact.visual, fixture.visual)
  assert.equal(componentArtifact.implementationDraft, fixture.implementationDraft)

  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '+ 新建作品', exact: true }).click()
  await page.locator('.studio-shell.scada-studio-shell').waitFor()
  await page.getByRole('button', { name: '删除选中对象', exact: true }).click()
  const paletteItem = page.locator('.component-item', { hasText: componentTitle })
  assert.equal(await paletteItem.count(), 1, 'ready imported package activates into the normal registry/palette')
  await paletteItem.click()
  for (const [label, value] of [['X', '580'], ['Y', '320']]) {
    const input = page.locator('.property-field').filter({
      has: page.locator('span', { hasText: new RegExp(`^${label}$`) }),
    }).locator('input')
    await input.fill(value)
    await input.press('Enter')
  }
  await saveSceneAndWait(page)
  const scene = (await readPersistedScene(page)).document
  assert.equal(scene.version, 8)
  assert.equal(scene.nodes.length, 1, 'the fixture carries exactly one portable component dependency')
  assert.equal(scene.nodes[0].type, componentType)
  assert.equal(scene.nodes[0].propertyFallbacks.state, 'running')
  await page.goto(`${baseUrl}#/works`, { waitUntil: 'networkidle' })
  const [workDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: `导出作品 ${scene.name}`, exact: true }).click(),
  ])
  const exportedWorkText = await readFile(await workDownload.path(), 'utf8')
  const exportedWork = JSON.parse(exportedWorkText)
  assert.equal(exportedWork.packageVersion, 1)
  assert.deepEqual(exportedWork.dependencies, [componentArtifact], 'exported work must carry the exact component artifact closure')

  await runtimePage.goto(`${baseUrl}#/runtime`, { waitUntil: 'networkidle' })
  await runtimePage.getByText('SCADA Runtime', { exact: true }).waitFor()
  await assertNoAuthoringDatabase(runtimePage)
  await runtimePage.getByLabel('选择独立运行作品包文件', { exact: true }).setInputFiles({
    name: 'capability.scada-work.json', mimeType: 'application/json', buffer: Buffer.from(exportedWorkText),
  })
  await runtimePage.locator('.standalone-runtime-canvas canvas').first().waitFor({ state: 'visible' })
  await canvasHasColor(runtimePage, '.standalone-runtime-canvas canvas', [17, 191, 98])
  await runtimePage.screenshot({ path: `artifacts/component-capability-standalone-${browserName}.png` })

  // Additional canonical semantic input fixture, separate from the exact
  // browser-exported artifact: derive alarm without changing running fallback.
  const semanticWork = structuredClone(exportedWork)
  semanticWork.scene.nodes[0].scadaSemantics = {
    version: 1,
    valueBindings: [{ id: 'value:capability-alarm', targetProperty: 'state', expression: { kind: 'literal', value: 'alarm' } }],
    behaviors: [], interactions: [],
  }
  assert.equal(semanticWork.scene.nodes[0].propertyFallbacks.state, 'running')
  await runtimePage.getByLabel('选择独立运行作品包文件', { exact: true }).setInputFiles({
    name: 'capability-derived-alarm.scada-work.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(semanticWork)),
  })
  await canvasHasColor(runtimePage, '.standalone-runtime-canvas canvas', [220, 38, 38])
  await runtimePage.screenshot({ path: `artifacts/component-capability-derived-${browserName}.png` })
  await assertNoAuthoringDatabase(runtimePage)
  assert.equal(await runtimePage.locator('.studio-shell, .workspace-shell').count(), 0)
  assert.equal(await runtimePage.getByRole('button', { name: '保存', exact: true }).count(), 0)
  for (const currentPage of [page, runtimePage]) {
    assert.equal(await currentPage.evaluate(() => globalThis.__scadaBrowserCapabilityDraftExecuted), undefined)
  }
  assert.deepEqual(pageErrors, [])
  console.log(`Component capability browser smoke passed (${browserName}): local SVG draft save, explicit declarative ready import, public execution unavailable, Property-driven Preview without persistence, component/work export with exact closure, fresh standalone + canonical derived presentation and no Studio installation. Removed one-click binding/direct ready authoring is not claimed.`)
} catch (error) {
  await mkdir('artifacts', { recursive: true })
  await Promise.allSettled([
    page.screenshot({ path: `artifacts/component-capability-failure-${browserName}.png` }),
    runtimePage.screenshot({ path: `artifacts/component-capability-runtime-failure-${browserName}.png` }),
  ])
  throw error
} finally {
  await context.close()
  await runtimeContext.close()
  await browser.close()
}
