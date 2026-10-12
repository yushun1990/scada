import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, firefox } from 'playwright'
import {
  readPersistedComponent,
  saveAndWait,
} from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browserName = process.env.SCADA_BROWSER ?? 'chromium'
assert.ok(['chromium', 'firefox'].includes(browserName))
const browser = await ({ chromium, firefox })[browserName].launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))

const authorRef = 'statusLamp'
const renamedAuthorRef = 'runLamp'
const svgSource = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <g id="status">
    <rect id="indicator" x="10" y="10" width="100" height="60" fill="#ef4444"/>
  </g>
</svg>
`.trim()

function globalAssetImportControl(currentPage) {
  return currentPage.getByRole('region', { name: '组件创作素材' })
}

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

// The managed-SVG inner element editor is retired; authorRef authoring now
// goes through the SVG source marking workbench (id tags carry authorRef).
async function authorTagViaMarkingWorkbench(currentPage, tagId, name) {
  // The header button's accessible name is shadowed by its parent group
  // header, so target the dedicated class instead of a role query.
  await currentPage.locator('.component-svg-header-code-btn').click()
  const modal = currentPage.locator('.component-svg-modal-popup')
  await modal.waitFor()
  await modal.locator(`[data-scada-tag="${tagId}"]`).click()
  const nameInput = modal.locator('input[placeholder="如 fan, alarmLed"]')
  await nameInput.waitFor()
  await nameInput.fill(name)
  await modal.getByRole('button', { name: '确定标记', exact: true }).click()
  await modal.locator('.component-svg-modal-status-message', { hasText: '已为' }).waitFor()
  await modal.getByRole('button', { name: '应用', exact: true }).click()
  await modal.waitFor({ state: 'detached' })
}

try {
  console.log(`Verifying current Property form and managed SVG author refs (${browserName}): ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()

  // Component contracts live on the central Coding 开发 work page.
  await page.getByRole('button', { name: 'Coding 开发', exact: true }).click()
  const publicProperties = page.locator('.component-root-public-properties')
  await publicProperties.waitFor()
  await publicProperties.getByRole('button', { name: '+ 添加属性', exact: true }).click()
  const propertyForm = publicProperties.locator('.contract-row-form')
  await propertyForm.getByLabel('Property 名称', { exact: true }).fill('property1')
  await propertyForm.getByLabel('Property 类型', { exact: true }).click()
  await page.getByRole('option', { name: '数字', exact: true }).click()
  await propertyForm.getByLabel('默认值', { exact: true }).fill('7')
  await propertyForm.getByLabel('说明', { exact: true }).fill('authorRef smoke input')
  await propertyForm.getByRole('button', { name: '保存', exact: true }).click()
  await propertyForm.waitFor({ state: 'detached' })
  const savedPropertyRow = publicProperties.locator('.contract-row-item').filter({
    has: page.locator('.contract-row-name', { hasText: /^property1$/ }),
  })
  await savedPropertyRow.waitFor()
  assert.equal(await savedPropertyRow.locator('.contract-row-badge').textContent(), '绑定')
  await page.getByRole('button', { name: '图形化设计', exact: true }).click()

  const importControl = globalAssetImportControl(page)
  const input = importControl.locator('.component-palette-resource-library input[type="file"]')
  await input.waitFor({ state: 'attached' })
  await input.setInputFiles({
    name: 'ux1.3-author-ref.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgSource),
  })

  await page.locator('.component-palette-resource-item', { hasText: 'ux1.3-author-ref' }).dblclick()
  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).waitFor()
  await page.locator('.component-svg-inspector-group').waitFor()
  assert.equal(
    await page.getByText('SVG 内部元素', { exact: true }).count(),
    0,
    'the retired managed-SVG inner element inspector group must stay removed',
  )
  assert.equal(
    await page.getByLabel('ux1.3-author-ref 资源填充模式', { exact: true }).count(),
    0,
    'the retired asset style group must stay removed for SVG layers',
  )

  await authorTagViaMarkingWorkbench(page, 'svg-tag-000003', `  ${authorRef}  `)
  await page.locator('.component-svg-tag-card', { hasText: authorRef }).waitFor()

  await saveAndWait(page)
  const savedUrl = page.url()
  const persisted = await readPersistedComponent(page)
  assert.deepEqual(persisted.document.definition.properties.property1, {
    title: 'property1', kind: 'number', defaultValue: 7,
    description: 'authorRef smoke input', bindable: true,
  }, 'the compact root Property form must commit and persist its complete contract')
  const svgLayer = findVisualLayer(persisted.document, 'svg', 'ux1.3-author-ref')
  assert.ok(svgLayer?.document)
  const persistedRect = findManagedTag(svgLayer.document, 'svg-tag-000003')
  assert.ok(persistedRect)
  assert.equal(persistedRect.authorRef, authorRef)
  assert.match(svgLayer.assetRef, /^data:image\/svg\+xml;charset=utf-8,/)
  // The marking workbench authors aliases as real SVG id attributes (peer to
  // ids carried by imported files), so the alias legitimately round-trips in
  // the serialized bytes; runtime identity stays the canonical svgTagId below.
  assert.match(
    svgLayer.assetRef,
    new RegExp(`id%3D%22${authorRef}%22`),
    'the marking workbench id must round-trip through the serialized SVG',
  )
  assert.ok(
    svgLayer.assetRef.includes('data-scada-tag%3D%22svg-tag-000003%22'),
    'serialized runtime identity stays the canonical svgTagId, not the alias',
  )

  await page.goto(savedUrl, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).click()
  await page.locator('.component-svg-tag-card', { hasText: authorRef }).waitFor()

  // Rename through the real workbench, retaining canonical tag identity. This
  // does not claim the removed visual-rule target authoring/convergence UI.
  await authorTagViaMarkingWorkbench(page, 'svg-tag-000003', renamedAuthorRef)
  await page.locator('.component-svg-tag-card', { hasText: renamedAuthorRef }).waitFor()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.locator('.component-svg-tag-card', { hasText: authorRef }).waitFor()
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await page.locator('.component-svg-tag-card', { hasText: renamedAuthorRef }).waitFor()
  await saveAndWait(page)
  const renamed = (await readPersistedComponent(page)).document
  const renamedSvg = findVisualLayer(renamed, 'svg', 'ux1.3-author-ref')
  assert.equal(findManagedTag(renamedSvg.document, 'svg-tag-000003').authorRef, renamedAuthorRef)
  assert.equal(findManagedTag(renamedSvg.document, 'svg-tag-000003').tagId, persistedRect.tagId)
  assert.ok(renamedSvg.assetRef.includes(`id%3D%22${renamedAuthorRef}%22`))
  assert.ok(renamedSvg.assetRef.includes('data-scada-tag%3D%22svg-tag-000003%22'))
  assert.deepEqual(renamed.definition.properties, persisted.document.definition.properties)
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).click()
  await page.locator('.component-svg-tag-card', { hasText: renamedAuthorRef }).waitFor()

  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).click()
  await page.getByRole('tab', { name: '图层操作', exact: true }).click()
  assert.equal(
    await page.getByRole('button', { name: '+ 新增', exact: true }).isDisabled(),
    true,
    'Preview keeps SVG layer function authoring read-only',
  )
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: `artifacts/managed-svg-author-ref-${browserName}.png` })

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(
    `Managed SVG author-reference browser proof passed (${browserName}): compact Property form commit/persistence, marking-workbench alias/rename + undo/redo, canonical svgTagId and authored id byte round-trip, save/reopen and Preview private-operation read-only. No removed rule-editor convergence is claimed.`,
  )
} finally {
  await browser.close()
}
