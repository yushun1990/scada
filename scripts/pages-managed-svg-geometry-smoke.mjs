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

const svgSource = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80">
  <g id="housing">
    <rect id="body" x="10" y="10" width="100" height="60" fill="#ef4444"/>
  </g>
</svg>
`.trim()

const highlightMatcher = {
  alphaMin: 70,
  redMin: 100,
  redMax: 150,
  greenMin: 30,
  greenMax: 90,
  blueMin: 205,
  blueMax: 255,
}

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

function attributeValue(element, name) {
  return element?.attributes?.find((attribute) => attribute.name === name)?.value ?? null
}

async function readHighlightBounds(currentPage) {
  return currentPage.evaluate((expected) => {
    let best = null
    const canvases = [...document.querySelectorAll('canvas')]
    canvases.forEach((canvas, canvasIndex) => {
      const context = canvas.getContext('2d')
      if (!context || canvas.width <= 0 || canvas.height <= 0) return
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      let count = 0

      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index]
        const green = pixels[index + 1]
        const blue = pixels[index + 2]
        const alpha = pixels[index + 3]
        if (
          alpha < expected.alphaMin ||
          red < expected.redMin || red > expected.redMax ||
          green < expected.greenMin || green > expected.greenMax ||
          blue < expected.blueMin || blue > expected.blueMax
        ) continue

        const pixelIndex = index / 4
        const x = pixelIndex % canvas.width
        const y = Math.floor(pixelIndex / canvas.width)
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        count += 1
      }

      if (count === 0) return
      const candidate = {
        canvasIndex,
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        count,
      }
      if (!best || candidate.count > best.count) best = candidate
    })
    return best
  }, highlightMatcher)
}

async function waitForHighlight(currentPage) {
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
  }, highlightMatcher)
}

try {
  console.log(`Verifying UX1.4 typed managed SVG geometry: ${baseUrl}#/components/new`)
  await page.goto(`${baseUrl}#/components/new`, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()

  const input = globalAssetImportControl(page).locator('input[type="file"]')
  await input.waitFor({ state: 'attached' })
  await input.setInputFiles({
    name: 'ux1.4-geometry.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(svgSource),
  })

  await page.locator('.component-layer-row', { hasText: 'ux1.4-geometry' }).waitFor()
  const rectRow = page.locator('.component-managed-svg-row', { hasText: 'svg-tag-000003' })
  await rectRow.click()
  await page.locator('.component-canvas-status', { hasText: 'SVG svg-tag-000003' }).waitFor()
  await waitForHighlight(page)

  const geometrySection = page.locator('.component-managed-svg-geometry-section')
  await geometrySection.waitFor()
  const labels = (await geometrySection.locator('.property-field > span').allTextContents())
    .map((label) => label.trim())
  assert.deepEqual(labels, ['X', 'Y', 'Width', 'Height', 'Radius X', 'Radius Y'])

  const geometryInputs = geometrySection.locator('input')
  const xInput = geometryInputs.nth(0)
  const widthInput = geometryInputs.nth(2)
  assert.equal(await xInput.inputValue(), '10')
  assert.equal(await widthInput.inputValue(), '100')

  const authorRefField = page.locator('.component-managed-svg-properties .property-field')
    .filter({ hasText: '引用名称' })
    .first()
  await authorRefField.locator('input').fill('bodyShape')
  await authorRefField.locator('input').blur()
  await page.locator('.component-managed-svg-row', { hasText: '@bodyShape' }).waitFor()

  const before = await readHighlightBounds(page)
  assert.ok(before, 'selected SVG rect exposes a visible Canvas highlight before geometry edit')

  await xInput.fill('50')
  await xInput.blur()
  await page.locator('.component-managed-svg-message', { hasText: 'x 已更新' }).waitFor()

  const refreshedGeometryInputs = page.locator('.component-managed-svg-geometry-section input')
  const refreshedWidthInput = refreshedGeometryInputs.nth(2)
  await refreshedWidthInput.fill('40')
  await refreshedWidthInput.blur()
  await page.locator('.component-managed-svg-message', { hasText: 'width 已更新' }).waitFor()

  await page.waitForFunction(
    ({ expected, previous }) => {
      let best = null
      const canvases = [...document.querySelectorAll('canvas')]
      canvases.forEach((canvas, canvasIndex) => {
        const context = canvas.getContext('2d')
        if (!context || canvas.width <= 0 || canvas.height <= 0) return
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let minX = Infinity
        let maxX = -Infinity
        let count = 0
        for (let index = 0; index < pixels.length; index += 4) {
          const red = pixels[index]
          const green = pixels[index + 1]
          const blue = pixels[index + 2]
          const alpha = pixels[index + 3]
          if (
            alpha < expected.alphaMin ||
            red < expected.redMin || red > expected.redMax ||
            green < expected.greenMin || green > expected.greenMax ||
            blue < expected.blueMin || blue > expected.blueMax
          ) continue
          const x = (index / 4) % canvas.width
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          count += 1
        }
        if (!count) return
        const candidate = { canvasIndex, minX, width: maxX - minX + 1, count }
        if (!best || candidate.count > best.count) best = candidate
      })
      return Boolean(
        best &&
        best.canvasIndex === previous.canvasIndex &&
        best.minX > previous.minX + 5 &&
        best.width < previous.width - 5,
      )
    },
    { expected: highlightMatcher, previous: before },
  )

  const after = await readHighlightBounds(page)
  assert.ok(after)
  assert.equal(after.canvasIndex, before.canvasIndex)
  assert.ok(after.minX > before.minX + 5, 'geometry x edit moves the same tag highlight to the right')
  assert.ok(after.width < before.width - 5, 'geometry width edit shrinks the same tag highlight')

  await saveAndWait(page)
  const savedUrl = page.url()
  const persisted = await readPersistedComponent(page)
  const svgLayer = findVisualLayer(persisted.document, 'svg', 'ux1.4-geometry')
  assert.ok(svgLayer?.document)
  const persistedRect = findManagedTag(svgLayer.document, 'svg-tag-000003')
  assert.ok(persistedRect)
  assert.equal(attributeValue(persistedRect, 'x'), '50')
  assert.equal(attributeValue(persistedRect, 'width'), '40')
  assert.equal(persistedRect.authorRef, 'bodyShape')
  assert.match(svgLayer.assetRef, /^data:image\/svg\+xml;charset=utf-8,/)
  assert.match(decodeURIComponent(svgLayer.assetRef), /x="50"/)
  assert.match(decodeURIComponent(svgLayer.assetRef), /width="40"/)

  await page.goto(savedUrl, { waitUntil: 'networkidle' })
  await page.locator('.studio-shell.component-studio-shell').waitFor()
  await page.locator('.component-layer-row', { hasText: 'ux1.4-geometry' }).click()
  const reloadedRow = page.locator('.component-managed-svg-row', { hasText: '@bodyShape' })
  await reloadedRow.waitFor()
  assert.ok((await reloadedRow.textContent())?.includes('svg-tag-000003'))
  await reloadedRow.click()
  const reloadedGeometryInputs = page.locator('.component-managed-svg-geometry-section input')
  assert.equal(await reloadedGeometryInputs.nth(0).inputValue(), '50')
  assert.equal(await reloadedGeometryInputs.nth(2).inputValue(), '40')
  await waitForHighlight(page)

  await page.getByLabel('预览', { exact: true }).click()
  await page.locator('.status-mode', { hasText: '预览' }).waitFor()
  assert.equal(
    await page.locator('.component-managed-svg-geometry-section input:not(:disabled)').count(),
    0,
    'Preview exposes no mutable managed-SVG geometry controls',
  )
  await page.getByLabel('设计', { exact: true }).click()

  assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join(' | ')}`)
  console.log(
    'UX1.4 typed managed SVG geometry browser proof passed: tag-scoped Geometry controls edit the canonical managed attributes, Canvas highlight remeasures the same tagId after geometry changes, save/reopen preserves geometry plus authorRef, serialized asset bytes update, and Preview remains non-mutable.',
  )
} finally {
  await browser.close()
}
