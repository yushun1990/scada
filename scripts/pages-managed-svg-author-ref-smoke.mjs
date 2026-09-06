import assert from 'node:assert/strict'
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
const svgSource = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <g id="status">
    <rect id="indicator" x="10" y="10" width="100" height="60" fill="#ef4444"/>
  </g>
</svg>
`.trim()

function globalAssetImportControl(currentPage) {
  return currentPage.locator('.component-asset-import-control')
    .filter({ hasText: '导入 SVG / 图片' })
    .first()
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

try {
  console.log(`Verifying UX1.3 managed SVG author refs: ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()

  const importControl = globalAssetImportControl(page)
  const input = importControl.locator('input[type="file"]')
  await input.waitFor({ state: 'attached' })
  await input.setInputFiles({
    name: 'ux1.3-author-ref.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgSource),
  })

  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).waitFor()
  await page.locator('.component-managed-svg-editor').waitFor()

  const rectRow = page.locator('.component-managed-svg-row', { hasText: 'svg-tag-000003' })
  await rectRow.click()
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000003' }).waitFor()
  await waitForDenseCanvasColor(page, {
    alphaMin: 80,
    redMin: 105,
    redMax: 145,
    greenMin: 35,
    greenMax: 85,
    blueMin: 210,
    blueMax: 255,
  })

  const authorRefField = page.locator('.component-managed-svg-properties .property-field')
    .filter({ hasText: '引用名称' })
    .first()
  const authorRefInput = authorRefField.locator('input')
  assert.equal(await authorRefInput.inputValue(), '')
  await authorRefInput.fill(`  ${authorRef}  `)
  await authorRefInput.blur()
  await page.locator('.component-managed-svg-message', { hasText: '引用名称已更新' }).waitFor()
  await page.locator('.component-managed-svg-row', { hasText: `@${authorRef}` }).waitFor()

  await saveAndWait(page)
  const savedUrl = page.url()
  const persisted = await readPersistedComponent(page)
  const svgLayer = findVisualLayer(persisted.document, 'svg', 'ux1.3-author-ref')
  assert.ok(svgLayer?.document)
  const persistedRect = findManagedTag(svgLayer.document, 'svg-tag-000003')
  assert.ok(persistedRect)
  assert.equal(persistedRect.authorRef, authorRef)
  assert.match(svgLayer.assetRef, /^data:image\/svg\+xml;charset=utf-8,/)
  assert.doesNotMatch(
    svgLayer.assetRef,
    new RegExp(authorRef),
    'authoring alias must not become serialized SVG/runtime resource identity',
  )

  await page.goto(savedUrl, { waitUntil: 'networkidle' })
  await page.getByText('Component Editor', { exact: true }).waitFor()
  await page.locator('.component-layer-row', { hasText: 'ux1.3-author-ref' }).click()
  const reloadedRow = page.locator('.component-managed-svg-row', { hasText: `@${authorRef}` })
  await reloadedRow.waitFor()
  assert.ok((await reloadedRow.textContent())?.includes('svg-tag-000003'))
  await reloadedRow.click()
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000003' }).waitFor()
  await waitForDenseCanvasColor(page, {
    alphaMin: 80,
    redMin: 105,
    redMax: 145,
    greenMin: 35,
    greenMax: 85,
    blueMin: 210,
    blueMax: 255,
  })

  const reloadedAuthorRefField = page.locator('.component-managed-svg-properties .property-field')
    .filter({ hasText: '引用名称' })
    .first()
  assert.equal(await reloadedAuthorRefField.locator('input').inputValue(), authorRef)

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(
    'UX1.3 managed SVG author-reference browser proof passed: canonical tag selection drives Canvas highlight, authorRef is normalized and persisted, save/reopen preserves the alias on the same tagId, and serialized SVG asset bytes remain alias-free.',
  )
} finally {
  await browser.close()
}
