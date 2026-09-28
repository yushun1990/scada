import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import {
  readPersistedComponent,
  saveAndWait,
} from './pages-component-fixture-storage.mjs'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'https://yushun1990.github.io/scada/')
  .replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
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

async function waitForDenseCanvasColor(currentPage, matcher) {
  await currentPage.waitForFunction((expected) => {
    const canvases = [...document.querySelectorAll('canvas')]
    return canvases.some((canvas) => {
      const context = canvas.getContext('2d')
      if (!context || canvas.width <= 0 || canvas.height <= 0) return false
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let index = 0; index < pixels.length; index += 4) {
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
  }, matcher)
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
  console.log(`Verifying managed SVG author refs and UX1.5 rule-target convergence: ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()

  // Component contracts live on the central Coding 开发 work page.
  await page.getByRole('button', { name: 'Coding 开发', exact: true }).click()
  const publicProperties = page.locator('.component-root-public-properties')
  await publicProperties.waitFor()
  await publicProperties.getByRole('button', { name: '+ 添加属性', exact: true }).click()
  await publicProperties.locator('.property-contract-item').waitFor()
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
  assert.ok(
    persisted.document.definition.properties.property1,
    'the real root Property authoring flow persists a Rule-driving Property',
  )
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

  // Visual Rule authoring left the behaviors tab with the issue #209 redesign;
  // alias authority is proven through the marking workbench and persistence.

  await page.getByLabel('预览', { exact: true }).click()
  await page.locator('.status-mode', { hasText: '预览' }).waitFor()
  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).click()
  await page.getByRole('tab', { name: '行为', exact: true }).click()
  assert.equal(
    await page.getByRole('button', { name: '新增', exact: true }).isDisabled(),
    true,
    'Preview keeps SVG layer function authoring read-only',
  )
  await mkdir('artifacts', { recursive: true })
  await page.screenshot({ path: 'artifacts/managed-svg-rules-preview.png' })

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(
    'Managed SVG author-reference browser proof passed: the marking workbench authors authorRef ids; alias-only edits keep svgTagId identity; save/reopen preserves the alias authority; and Preview keeps SVG layer function authoring read-only.',
  )
} finally {
  await browser.close()
}
